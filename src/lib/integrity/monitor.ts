// Browser-side integrity signals for monitored interviews.
// Everything is disclosed to the candidate up front; signals are batched to the server, which
// scores them. A heartbeat lets the server detect if monitoring was blocked or tampered with.

import type { IntegrityEventInput, IntegritySettings } from "../../../supabase/functions/_shared/types.ts";

export type FlagNotice = { type: string; message: string };

const NOTICES: Record<string, string> = {
  tab_hidden: "You left the interview tab. Please stay on this page until the interview ends.",
  window_blur: "Focus moved away from the interview window.",
  fullscreen_exit: "Full screen is required for this interview. Please return to full screen.",
  paste_attempt: "Pasting is disabled for this interview — please answer in your own words.",
  typing_burst: "Text appeared faster than typing allows. Please type or speak your answer yourself.",
  multiple_faces: "We detected more than one person on camera.",
  face_missing: "We couldn't see your face. Please stay in view of the camera.",
};

export interface MonitorOptions {
  settings: IntegritySettings;
  send: (events: IntegrityEventInput[], keepalive: boolean) => Promise<void>;
  turnSeq: () => number | null;
  onNotice?: (n: FlagNotice) => void;
}

export class IntegrityMonitor {
  private queue: IntegrityEventInput[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private hiddenAt: number | null = null;
  private blurAt: number | null = null;
  private running = false;
  private cleanup: (() => void)[] = [];
  private sending = false;

  constructor(private opts: MonitorOptions) {}

  get active() {
    return this.running;
  }

  record(type: string, detail: Record<string, unknown> = {}) {
    if (!this.running) return;
    this.queue.push({ type, detail, turnSeq: this.opts.turnSeq(), at: new Date().toISOString() });
    const msg = NOTICES[type];
    if (msg) this.opts.onNotice?.({ type, message: msg });
    if (this.queue.length >= 20) void this.flush();
  }

  start() {
    if (this.running) return;
    this.running = true;
    const s = this.opts.settings;
    const on = <K extends keyof DocumentEventMap>(target: Document, type: K, fn: (e: DocumentEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      target.addEventListener(type, fn as EventListener, opts);
      this.cleanup.push(() => target.removeEventListener(type, fn as EventListener, opts));
    };
    const onWin = <K extends keyof WindowEventMap>(type: K, fn: (e: WindowEventMap[K]) => void) => {
      window.addEventListener(type, fn as EventListener);
      this.cleanup.push(() => window.removeEventListener(type, fn as EventListener));
    };

    on(document, "visibilitychange", () => {
      if (document.hidden) this.hiddenAt = Date.now();
      else if (this.hiddenAt !== null) {
        this.record("tab_hidden", { durationMs: Date.now() - this.hiddenAt });
        this.hiddenAt = null;
      }
    });
    onWin("blur", () => {
      if (!document.hidden) this.blurAt = Date.now();
    });
    onWin("focus", () => {
      if (this.blurAt !== null) {
        const d = Date.now() - this.blurAt;
        // Ignore sub-1.5s blurs (permission prompts, OS notifications).
        if (d >= 1500) this.record("window_blur", { durationMs: d });
        this.blurAt = null;
      }
    });
    if (s.requireFullscreen) {
      on(document, "fullscreenchange", () => {
        if (!document.fullscreenElement) this.record("fullscreen_exit");
      });
    }
    on(document, "copy", () => this.record("copy", { chars: String(document.getSelection() ?? "").length }));
    on(document, "cut", () => this.record("copy", { chars: String(document.getSelection() ?? "").length }));
    on(
      document,
      "paste",
      (e) => {
        const chars = e.clipboardData?.getData("text")?.length ?? 0;
        if (s.blockPaste) {
          e.preventDefault();
          this.record("paste_attempt", { chars });
        } else this.record("paste", { chars });
      },
      { capture: true },
    );
    on(document, "drop", (e) => {
      if (s.blockPaste && e.dataTransfer?.types.includes("text/plain")) {
        e.preventDefault();
        this.record("paste_attempt", { via: "drop" });
      }
    });
    on(document, "contextmenu", () => this.record("context_menu"));
    on(document, "keydown", (e) => {
      const k = e.key?.toLowerCase();
      const devtools = e.key === "F12" || ((e.ctrlKey || e.metaKey) && e.shiftKey && ["i", "j", "c"].includes(k)) || (e.metaKey && e.altKey && k === "i");
      if (devtools) this.record("devtools", { key: e.key });
    });
    onWin("pagehide", () => void this.flush(true));

    const scr = window.screen as Screen & { isExtended?: boolean };
    if (scr.isExtended === true) this.record("multiple_screens");

    this.heartbeatTimer = setInterval(() => {
      this.queue.push({ type: "heartbeat", detail: { hidden: document.hidden }, at: new Date().toISOString() });
    }, 20_000);
    this.queue.push({ type: "heartbeat", detail: { start: true }, at: new Date().toISOString() });
    this.flushTimer = setInterval(() => void this.flush(), 8_000);
  }

  /** Watch an answer textarea for pasted or machine-inserted text. */
  watchTextInput(el: HTMLTextAreaElement): () => void {
    let lastLen = el.value.length;
    let windowStart = 0;
    let windowChars = 0;
    const onInput = (ev: Event) => {
      const e = ev as InputEvent;
      const len = el.value.length;
      const delta = len - lastLen;
      lastLen = len;
      if (e.inputType === "insertFromPaste" || e.inputType === "insertFromDrop") return; // handled by paste listener
      if (delta <= 0) return;
      const now = performance.now();
      if (now - windowStart > 400) {
        windowStart = now;
        windowChars = 0;
      }
      windowChars += delta;
      if (delta >= 30 || windowChars >= 80) {
        this.record("typing_burst", { chars: delta, windowChars, inputType: e.inputType });
        windowChars = 0;
      }
    };
    el.addEventListener("input", onInput);
    return () => el.removeEventListener("input", onInput);
  }

  async flush(keepalive = false) {
    if (this.sending && !keepalive) return;
    if (!this.queue.length) return;
    const batch = this.queue.splice(0, 50);
    this.sending = true;
    try {
      await this.opts.send(batch, keepalive);
    } catch {
      // Put them back for the next attempt (bounded).
      this.queue = [...batch, ...this.queue].slice(0, 200);
    } finally {
      this.sending = false;
    }
  }

  async stop() {
    if (!this.running) return;
    if (this.hiddenAt !== null) this.record("tab_hidden", { durationMs: Date.now() - this.hiddenAt });
    this.running = false;
    this.cleanup.forEach((f) => f());
    this.cleanup = [];
    if (this.flushTimer) clearInterval(this.flushTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    await this.flush();
  }
}
