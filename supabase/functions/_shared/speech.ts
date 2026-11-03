// Delivery metrics computed from the transcript text (server re-derives what it can and
// sanity-clamps whatever timing data the browser reports).

import type { AnswerMode, SpeechMetrics } from "./types.ts";
import { clamp } from "./rubric.ts";

const FILLER_PATTERNS: RegExp[] = [
  /\b(um+|uh+|erm+|er|ah+|hmm+|mm+)\b/gi,
  /\byou know\b/gi,
  /\bi mean\b/gi,
  /\bkind of\b/gi,
  /\bsort of\b/gi,
  /\bbasically\b/gi,
  /\bliterally\b/gi,
  /\bactually\b/gi,
  /\b(like),/gi,
];

const HEDGE_PATTERNS: RegExp[] = [
  /\bi think\b/gi,
  /\bi guess\b/gi,
  /\bmaybe\b/gi,
  /\bprobably\b/gi,
  /\bperhaps\b/gi,
  /\bi'?m not sure\b/gi,
  /\bi suppose\b/gi,
  /\bkind of\b/gi,
  /\bsort of\b/gi,
  /\bhopefully\b/gi,
  /\bi feel like\b/gi,
];

export function countWords(text: string): number {
  const m = text.trim().match(/[\p{L}\p{N}'’-]+/gu);
  return m ? m.length : 0;
}

function countAll(text: string, patterns: RegExp[]): number {
  let n = 0;
  for (const re of patterns) {
    const m = text.match(re);
    if (m) n += m.length;
  }
  return n;
}

export function countFillers(text: string): number {
  return countAll(text, FILLER_PATTERNS);
}

export function countHedges(text: string): number {
  return countAll(text, HEDGE_PATTERNS);
}

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : v == null ? NaN : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Merge browser-reported timing with text-derived counts; clamp anything implausible. */
export function buildMetrics(answer: string, client: Partial<SpeechMetrics> | null | undefined, mode: AnswerMode): SpeechMetrics {
  const wordCount = countWords(answer);
  const fillerCount = countFillers(answer);
  const hedgeCount = countHedges(answer);
  const durationMs = num(client?.durationMs);
  const safeDuration = durationMs !== null ? clamp(durationMs, 0, 30 * 60_000) : null;
  let wpm: number | null = null;
  if (mode === "voice" && safeDuration && safeDuration > 3000 && wordCount > 5) {
    wpm = Math.round(clamp(wordCount / (safeDuration / 60_000), 20, 400));
  }
  const latency = num(client?.latencyMs);
  const pause = num(client?.longestPauseMs);
  const eye = num(client?.eyeContact);
  return {
    mode,
    wordCount,
    durationMs: safeDuration,
    wpm,
    fillerCount,
    fillerRate: wordCount > 0 ? Math.round((fillerCount / wordCount) * 1000) / 10 : 0,
    hedgeCount,
    longestPauseMs: pause !== null ? clamp(pause, 0, 10 * 60_000) : null,
    latencyMs: latency !== null ? clamp(latency, 0, 30 * 60_000) : null,
    eyeContact: eye !== null ? clamp(eye, 0, 1) : null,
  };
}

/** 0–100 "delivery confidence": pace, fillers, hedging, eye contact and completeness. */
export function deliveryConfidence(input: {
  avgWpm: number | null;
  fillerRate: number | null;
  hedgeRate: number | null;
  eyeContact: number | null;
  completeness: number; // 0..1 average STARR coverage
}): number {
  const parts: { w: number; v: number }[] = [];
  if (input.avgWpm !== null) {
    const w = input.avgWpm;
    // Comfortable conversational pace is ~120–170 wpm.
    const v = w >= 120 && w <= 170 ? 1 : w < 120 ? clamp(1 - (120 - w) / 70, 0, 1) : clamp(1 - (w - 170) / 80, 0, 1);
    parts.push({ w: 0.25, v });
  }
  if (input.fillerRate !== null) parts.push({ w: 0.2, v: clamp(1 - input.fillerRate / 8, 0, 1) });
  if (input.hedgeRate !== null) parts.push({ w: 0.2, v: clamp(1 - input.hedgeRate / 6, 0, 1) });
  if (input.eyeContact !== null) parts.push({ w: 0.15, v: clamp((input.eyeContact - 0.3) / 0.5, 0, 1) });
  parts.push({ w: 0.2, v: clamp(input.completeness, 0, 1) });
  const wsum = parts.reduce((s, p) => s + p.w, 0);
  return Math.round((parts.reduce((s, p) => s + p.w * p.v, 0) / wsum) * 100);
}

function shingles(text: string, n = 3): Set<string> {
  const words = text.toLowerCase().match(/[a-z0-9%]+/g) ?? [];
  const out = new Set<string>();
  for (let i = 0; i + n <= words.length; i++) out.add(words.slice(i, i + n).join(" "));
  return out;
}

/** Jaccard similarity of word 3-grams (0..1). Used to detect a recycled/canned answer. */
export function answerSimilarity(a: string, b: string): number {
  const A = shingles(a);
  const B = shingles(b);
  if (A.size < 5 || B.size < 5) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}
