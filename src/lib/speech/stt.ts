// Candidate speech → text using the Web Speech API (Chrome, Edge, Safari).
// Tracks timing so the server can compute pace, pauses and think time.

/* eslint-disable @typescript-eslint/no-explicit-any */
type Recognition = any;

export function sttSupported(): boolean {
  return typeof window !== "undefined" && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
}

export interface TranscriptState {
  finalText: string;
  interim: string;
}

export interface AnswerTiming {
  startedListeningAt: number;
  firstSpeechAt: number | null;
  lastSpeechAt: number | null;
  longestPauseMs: number;
}

export interface RecognizerHandlers {
  onTranscript: (t: TranscriptState) => void;
  onSpeechActivity?: () => void;
  onError?: (code: string) => void;
}

export class SpeechRecognizer {
  private rec: Recognition | null = null;
  private active = false;
  private finals: string[] = [];
  private interim = "";
  private timing: AnswerTiming = { startedListeningAt: 0, firstSpeechAt: null, lastSpeechAt: null, longestPauseMs: 0 };
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private fatal = false;

  constructor(private handlers: RecognizerHandlers, private lang = "en-US") {}

  get listening() {
    return this.active;
  }

  start() {
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Ctor) {
      this.handlers.onError?.("unsupported");
      return;
    }
    this.finals = [];
    this.interim = "";
    this.fatal = false;
    this.timing = { startedListeningAt: performance.now(), firstSpeechAt: null, lastSpeechAt: null, longestPauseMs: 0 };
    this.active = true;
    this.spawn(Ctor);
    this.emit();
  }

  private spawn(Ctor: any) {
    const rec = new Ctor();
    rec.lang = this.lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (e: any) => {
      const now = performance.now();
      if (this.timing.firstSpeechAt === null) this.timing.firstSpeechAt = now;
      if (this.timing.lastSpeechAt !== null) this.timing.longestPauseMs = Math.max(this.timing.longestPauseMs, now - this.timing.lastSpeechAt - 900);
      this.timing.lastSpeechAt = now;
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const text = r[0]?.transcript ?? "";
        if (r.isFinal) this.finals.push(text.trim());
        else interim += text;
      }
      this.interim = interim.trim();
      this.handlers.onSpeechActivity?.();
      this.emit();
    };
    rec.onerror = (e: any) => {
      const code = String(e?.error ?? "error");
      if (code === "no-speech" || code === "aborted") return; // restart on end
      if (code === "not-allowed" || code === "service-not-allowed" || code === "audio-capture") this.fatal = true;
      this.handlers.onError?.(code);
    };
    rec.onend = () => {
      // Chrome ends continuous recognition after silence/network blips: transparently restart.
      if (this.active && !this.fatal) {
        if (this.interim) {
          this.finals.push(this.interim);
          this.interim = "";
        }
        this.restartTimer = setTimeout(() => {
          if (this.active) {
            try {
              this.spawn(Ctor);
            } catch {
              /* ignore */
            }
          }
        }, 150);
      }
    };
    this.rec = rec;
    try {
      rec.start();
    } catch {
      /* already started */
    }
  }

  private emit() {
    this.handlers.onTranscript({ finalText: this.text(false), interim: this.interim });
  }

  private text(includeInterim: boolean): string {
    return [...this.finals, includeInterim ? this.interim : ""].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  }

  /** Stop listening and resolve with the full transcript once the engine flushes. */
  stop(): Promise<{ text: string; timing: AnswerTiming }> {
    this.active = false;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    const rec = this.rec;
    return new Promise((resolve) => {
      const done = () => {
        const text = this.text(true);
        this.interim = "";
        resolve({ text, timing: { ...this.timing } });
      };
      if (!rec) return done();
      const t = setTimeout(done, 1200);
      rec.onend = () => {
        clearTimeout(t);
        done();
      };
      try {
        rec.stop();
      } catch {
        clearTimeout(t);
        done();
      }
    });
  }

  abort() {
    this.active = false;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    try {
      this.rec?.abort();
    } catch {
      /* ignore */
    }
  }
}
