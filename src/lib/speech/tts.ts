// Interviewer voice. Two engines:
//  - natural voices (Amazon Polly) streamed from the API as MP3, when the server has them set up;
//  - the browser's own SpeechSynthesis, with natural-voice selection and sentence chunking
//    (Chrome cuts long utterances off after ~15s, so we speak one sentence at a time).
// Any line whose natural audio can't be fetched or played is spoken by the browser voice instead,
// so an interview never stalls.

export function ttsSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

const PREFERRED = [/natural/i, /neural/i, /online/i, /google us english/i, /google uk english female/i, /samantha/i, /aria/i, /jenny/i, /ava/i, /serena/i, /daniel/i, /karen/i];

export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!ttsSupported()) return Promise.resolve([]);
  const now = speechSynthesis.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => resolve(speechSynthesis.getVoices());
    speechSynthesis.addEventListener("voiceschanged", done, { once: true });
    setTimeout(done, 1500);
  });
}

export function englishVoices(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  return voices.filter((v) => /^en([-_]|$)/i.test(v.lang));
}

export function pickDefaultVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const en = englishVoices(voices);
  for (const re of PREFERRED) {
    const v = en.find((x) => re.test(x.name));
    if (v) return v;
  }
  return en.find((v) => v.default) ?? en[0] ?? voices[0] ?? null;
}

function chunks(text: string): string[] {
  const parts = text.match(/[^.!?]+[.!?]*\s*/g) ?? [text];
  const out: string[] = [];
  let cur = "";
  for (const p of parts) {
    if ((cur + p).length > 180 && cur) {
      out.push(cur.trim());
      cur = p;
    } else cur += p;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** One line to speak. `sig` is the API's signature for natural-voice playback; `sample` = voice test. */
export interface SpeechSegment {
  text: string | null | undefined;
  sig?: string | null;
  sample?: boolean;
}

export interface Speaker {
  speak(input: string | SpeechSegment[]): Promise<void>;
  cancel(): void;
  /** Call from a click handler so later audio may play without a gesture (iOS Safari). */
  unlock(): void;
  readonly speaking: boolean;
}

// A 44-byte silent WAV, played once inside a user gesture to unlock audio playback.
const SILENT_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";

// Natural-voice audio already fetched this visit (repeat question, voice test), by voice + line.
const audioCache = new Map<string, Promise<Blob>>();
const MAX_CACHED = 40;

export function createSpeaker(opts: {
  voice: () => SpeechSynthesisVoice | null;
  /** Polly voice id when a natural voice is selected, else null. */
  cloudVoice?: () => string | null;
  fetchAudio?: (segment: SpeechSegment, voice: string) => Promise<Blob>;
  rate: () => number;
  muted: () => boolean;
  onStart?: () => void;
  onEnd?: () => void;
}): Speaker {
  let token = 0;
  let speaking = false;
  let keepAlive: ReturnType<typeof setInterval> | null = null;
  let audio: HTMLAudioElement | null = null;
  let stopCurrent: (() => void) | null = null;

  const getAudio = () => (audio ??= new Audio());

  const finish = () => {
    speaking = false;
    if (keepAlive) clearInterval(keepAlive);
    keepAlive = null;
    opts.onEnd?.();
  };

  function audioFor(seg: SpeechSegment, voice: string): Promise<Blob> {
    const key = `${voice}|${seg.sample ? "#sample" : seg.text}`;
    let p = audioCache.get(key);
    if (!p) {
      p = opts.fetchAudio!(seg, voice);
      audioCache.set(key, p);
      p.catch(() => audioCache.delete(key));
      if (audioCache.size > MAX_CACHED) audioCache.delete(audioCache.keys().next().value!);
    }
    return p;
  }

  /** Resolves true when the clip finished (or was cancelled), false if it couldn't play. */
  function playBlob(blob: Blob): Promise<boolean> {
    return new Promise((resolve) => {
      const a = getAudio();
      const url = URL.createObjectURL(blob);
      let settled = false;
      const safety = setTimeout(() => end(true), 90_000);
      function end(ok: boolean) {
        if (settled) return;
        settled = true;
        clearTimeout(safety);
        a.onended = null;
        a.onerror = null;
        stopCurrent = null;
        URL.revokeObjectURL(url);
        resolve(ok);
      }
      stopCurrent = () => {
        a.pause();
        end(true);
      };
      a.onended = () => end(true);
      a.onerror = () => end(false);
      a.muted = false;
      a.src = url;
      a.defaultPlaybackRate = opts.rate();
      a.playbackRate = opts.rate();
      a.play().catch(() => end(false));
    });
  }

  async function speakBrowser(text: string, my: number) {
    if (!ttsSupported()) return;
    if (!keepAlive) {
      // Chrome pauses long synthesis queues; nudging resume keeps it going.
      keepAlive = setInterval(() => {
        if (speechSynthesis.speaking && !speechSynthesis.paused) speechSynthesis.resume();
      }, 10_000);
    }
    for (const c of chunks(text)) {
      if (my !== token) return;
      await new Promise<void>((resolve) => {
        const u = new SpeechSynthesisUtterance(c);
        const v = opts.voice();
        if (v) {
          u.voice = v;
          u.lang = v.lang;
        } else u.lang = "en-US";
        u.rate = opts.rate();
        u.pitch = 1;
        const safety = setTimeout(resolve, Math.max(4000, c.length * 120));
        u.onend = () => {
          clearTimeout(safety);
          resolve();
        };
        u.onerror = () => {
          clearTimeout(safety);
          resolve();
        };
        speechSynthesis.speak(u);
      });
    }
  }

  return {
    get speaking() {
      return speaking;
    },
    unlock() {
      try {
        const a = getAudio();
        a.muted = true;
        a.src = SILENT_WAV;
        a.play()
          .then(() => {
            a.pause();
            a.muted = false;
          })
          .catch(() => {
            a.muted = false;
          });
      } catch {
        /* audio element unavailable: the browser voice is used */
      }
    },
    cancel() {
      token++;
      stopCurrent?.();
      if (ttsSupported()) speechSynthesis.cancel();
      if (speaking) finish();
    },
    async speak(input: string | SpeechSegment[]) {
      const my = ++token;
      const segs = (typeof input === "string" ? [{ text: input }] : input).filter((s): s is SpeechSegment & { text: string } => !!s.text?.trim());
      if (opts.muted() || segs.length === 0) return;
      stopCurrent?.();
      if (ttsSupported()) speechSynthesis.cancel();
      speaking = true;
      opts.onStart?.();
      try {
        const cloud = opts.fetchAudio ? (opts.cloudVoice?.() ?? null) : null;
        // Fetch every line's audio at once, then play them in order (keeps gaps short).
        const pending = segs.map((s) => (cloud && (s.sig || s.sample) ? audioFor(s, cloud) : null));
        for (let i = 0; i < segs.length; i++) {
          if (my !== token) return;
          let played = false;
          const p = pending[i];
          if (p) {
            try {
              const blob = await p;
              if (my !== token) return;
              played = await playBlob(blob);
            } catch {
              played = false;
            }
          }
          if (!played && my === token) await speakBrowser(segs[i].text, my);
        }
      } finally {
        if (my === token) finish();
      }
    },
  };
}
