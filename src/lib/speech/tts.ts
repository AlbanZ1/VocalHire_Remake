// Interviewer voice: browser SpeechSynthesis with natural-voice selection and sentence chunking
// (Chrome cuts long utterances off after ~15s, so we speak one sentence at a time).

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

export interface Speaker {
  speak(text: string): Promise<void>;
  cancel(): void;
  readonly speaking: boolean;
}

export function createSpeaker(opts: { voice: () => SpeechSynthesisVoice | null; rate: () => number; muted: () => boolean; onStart?: () => void; onEnd?: () => void }): Speaker {
  let token = 0;
  let speaking = false;
  let keepAlive: ReturnType<typeof setInterval> | null = null;

  const finish = () => {
    speaking = false;
    if (keepAlive) clearInterval(keepAlive);
    keepAlive = null;
    opts.onEnd?.();
  };

  return {
    get speaking() {
      return speaking;
    },
    cancel() {
      token++;
      if (ttsSupported()) speechSynthesis.cancel();
      if (speaking) finish();
    },
    async speak(text: string) {
      const my = ++token;
      if (!ttsSupported() || opts.muted() || !text.trim()) return;
      speechSynthesis.cancel();
      speaking = true;
      opts.onStart?.();
      // Chrome pauses long synthesis queues; nudging resume keeps it going.
      keepAlive = setInterval(() => {
        if (speechSynthesis.speaking && !speechSynthesis.paused) speechSynthesis.resume();
      }, 10_000);
      try {
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
      } finally {
        if (my === token) finish();
      }
    },
  };
}
