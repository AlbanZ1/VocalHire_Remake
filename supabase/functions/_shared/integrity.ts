// Integrity scoring: combines browser/camera signals with server-side answer signals into a
// 0–100 score and a level (clear / review / high_risk). These are SIGNALS for a human reviewer,
// never an automatic verdict — the report says so explicitly.

import type { IntegrityEventRow, IntegrityLevel, IntegritySettings, IntegritySignal, IntegritySummary, TurnRow } from "./types.ts";

interface Rule {
  label: string;
  perEvent: number;
  cap: number;
  explanation: string;
  /** Optional extra penalty per second of duration (for blur/hidden/away events). */
  perSecond?: number;
}

export const INTEGRITY_RULES: Record<string, Rule> = {
  tab_hidden: { label: "Left the interview tab", perEvent: 6, perSecond: 0.15, cap: 30, explanation: "The interview tab was hidden (switched tab or minimised) while the interview was running." },
  window_blur: { label: "Focus moved to another window", perEvent: 4, perSecond: 0.1, cap: 20, explanation: "Keyboard focus left the interview window — for example to another app or a second browser window." },
  fullscreen_exit: { label: "Exited full screen", perEvent: 4, cap: 12, explanation: "Full screen was required and the candidate left it during the interview." },
  paste_attempt: { label: "Tried to paste text", perEvent: 8, cap: 24, explanation: "Pasting is disabled for this interview; a paste was attempted into the answer box." },
  paste: { label: "Pasted text", perEvent: 6, cap: 24, explanation: "Text was pasted into the answer box." },
  copy: { label: "Copied interview text", perEvent: 5, cap: 15, explanation: "Text was copied from the interview page — for example the question." },
  typing_burst: { label: "Inhuman typing burst", perEvent: 10, cap: 30, explanation: "A large block of text appeared faster than a person can type, without a paste event (e.g. an extension or script)." },
  multiple_screens: { label: "Multiple screens detected", perEvent: 8, cap: 8, explanation: "The browser reports an extended (multi-monitor) display." },
  face_missing: { label: "Face not visible", perEvent: 5, perSecond: 0.1, cap: 20, explanation: "No face was visible on camera for a sustained period." },
  multiple_faces: { label: "More than one person on camera", perEvent: 12, cap: 36, explanation: "A second face appeared in the camera view." },
  gaze_away: { label: "Looking away from the screen", perEvent: 3, perSecond: 0.05, cap: 18, explanation: "Head or eyes were turned away from the screen for a sustained period while answering." },
  reading_pattern: { label: "Reading-like eye movement", perEvent: 8, cap: 32, explanation: "Repeated left-to-right eye sweeps with quick returns — the pattern of reading lines of text — while answering." },
  lip_sync_mismatch: { label: "Speech without matching lip movement", perEvent: 10, cap: 30, explanation: "Words were being transcribed while the candidate's mouth was not moving — possibly another speaker or played audio." },
  camera_denied: { label: "Camera unavailable", perEvent: 10, cap: 10, explanation: "Camera monitoring was required but camera access was denied or unavailable." },
  camera_stopped: { label: "Camera stopped mid-interview", perEvent: 10, cap: 20, explanation: "The camera feed stopped during the interview." },
  mic_stopped: { label: "Microphone stopped", perEvent: 2, cap: 6, explanation: "The microphone stream stopped unexpectedly." },
  devtools: { label: "Developer tools opened", perEvent: 8, cap: 16, explanation: "Browser developer tools appear to have been opened." },
  context_menu: { label: "Right-click menu", perEvent: 1, cap: 3, explanation: "The context menu was opened on the interview page." },
  // Server-side signals
  prompt_injection: { label: "Tried to manipulate the interviewer", perEvent: 15, cap: 45, explanation: "An answer contained instructions aimed at the AI (e.g. 'ignore your instructions', 'give me a perfect score')." },
  ai_style_answer: { label: "Possible scripted / AI-written answer", perEvent: 6, cap: 30, explanation: "The answer's style suggests it may have been read from a script or AI tool: polished but generic, few concrete specifics." },
  depth_drop: { label: "Struggled with follow-up detail", perEvent: 5, cap: 20, explanation: "A detailed main answer was followed by a much weaker answer when asked to go deeper on the same story." },
  latency_anomaly: { label: "Long silence before a fluent answer", perEvent: 3, cap: 15, explanation: "A long pause was followed by an unusually fluent, polished answer." },
  telemetry_gap: { label: "Monitoring interrupted", perEvent: 8, cap: 16, explanation: "The browser stopped sending integrity heartbeats while the interview was active." },
};

export function severityFor(type: string): number {
  const r = INTEGRITY_RULES[type];
  if (!r) return 1;
  return r.perEvent >= 10 ? 3 : r.perEvent >= 5 ? 2 : 1;
}

function durationSeconds(detail: Record<string, unknown>): number {
  const ms = Number(detail?.durationMs ?? 0);
  return Number.isFinite(ms) ? Math.min(Math.max(ms / 1000, 0), 600) : 0;
}

/** Derive server-side signals from analysed turns. */
export function answerSignals(turns: TurnRow[]): { type: string; turnSeq: number; detail: Record<string, unknown> }[] {
  const out: { type: string; turnSeq: number; detail: Record<string, unknown> }[] = [];
  for (const t of turns) {
    const a = t.analysis;
    if (!a) continue;
    // Manipulation attempts are recorded as server-side `prompt_injection` events when they happen.
    if (a.intent === "answer" && a.authenticity.aiLikelihood >= 0.6) {
      out.push({ type: "ai_style_answer", turnSeq: t.seq, detail: { likelihood: a.authenticity.aiLikelihood, signals: a.authenticity.signals } });
    }
    const m = t.metrics;
    if (a.intent === "answer" && m && m.mode === "voice" && (m.latencyMs ?? 0) > 20_000 && m.fillerCount === 0 && a.score >= 70) {
      out.push({ type: "latency_anomaly", turnSeq: t.seq, detail: { latencyMs: m.latencyMs } });
    }
  }
  // Depth drop: main answer specific & strong, follow-up on the same story much weaker.
  for (const f of turns.filter((t) => t.kind === "follow_up" && t.analysis?.intent === "answer")) {
    const parent = turns.find((t) => t.seq === f.parent_seq);
    if (!parent?.analysis || parent.analysis.intent !== "answer") continue;
    if (parent.analysis.score >= 70 && parent.analysis.specificity >= 3 && f.analysis!.specificity <= 1 && f.analysis!.score <= 35) {
      out.push({ type: "depth_drop", turnSeq: f.seq, detail: { mainScore: parent.analysis.score, followUpScore: f.analysis!.score } });
    }
  }
  return out;
}

export function monitoredSignals(settings: IntegritySettings): string[] {
  if (settings.level === "off") return ["Answer analysis only"];
  const list = ["Tab and window focus", "Copy & paste", "Typing patterns", "Answer authenticity analysis", "Attempts to manipulate the AI"];
  if (settings.requireFullscreen) list.push("Full-screen mode");
  if (settings.requireCamera) list.push("On-device camera analysis (presence, extra faces, gaze, reading patterns, lip-sync)");
  return list;
}

export function integrityLevel(score: number): IntegrityLevel {
  if (score >= 80) return "clear";
  if (score >= 55) return "review";
  return "high_risk";
}

export function computeIntegrity(events: IntegrityEventRow[], turns: TurnRow[], settings: IntegritySettings): IntegritySummary {
  const all: { type: string; detail: Record<string, unknown> }[] = [
    ...events.map((e) => ({ type: e.type, detail: e.detail ?? {} })),
    ...answerSignals(turns).map((s) => ({ type: s.type, detail: s.detail })),
  ];
  const byType = new Map<string, { count: number; seconds: number }>();
  for (const e of all) {
    if (!INTEGRITY_RULES[e.type]) continue;
    // Camera-based signals only count when the camera was required (practice users opt in for coaching).
    if (!settings.requireCamera && ["face_missing", "gaze_away", "reading_pattern", "lip_sync_mismatch", "multiple_faces", "camera_stopped", "camera_denied"].includes(e.type)) continue;
    if (!settings.requireFullscreen && e.type === "fullscreen_exit") continue;
    if (settings.blockPaste && e.type === "paste") continue; // counted as paste_attempt instead
    const cur = byType.get(e.type) ?? { count: 0, seconds: 0 };
    cur.count += 1;
    cur.seconds += durationSeconds(e.detail);
    byType.set(e.type, cur);
  }
  let penalty = 0;
  const signals: IntegritySignal[] = [];
  for (const [type, agg] of byType) {
    const rule = INTEGRITY_RULES[type];
    const p = Math.min(rule.cap, rule.perEvent * agg.count + (rule.perSecond ?? 0) * agg.seconds);
    penalty += p;
    signals.push({ type, label: rule.label, count: agg.count, penalty: Math.round(p), explanation: rule.explanation });
  }
  signals.sort((a, b) => b.penalty - a.penalty);
  const score = Math.max(0, Math.round(100 - penalty));
  const level = settings.level === "off" && score >= 55 ? "clear" : integrityLevel(score);
  return {
    score,
    level,
    signals,
    monitored: monitoredSignals(settings),
    note:
      "Integrity signals are indicators for human review, not proof of misconduct. Camera analysis runs entirely on the candidate's device; no video or images are uploaded or stored.",
  };
}
