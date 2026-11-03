// STARR rubric: Situation, Task, Action, Result, Reflection.
// The model (or heuristic analyser) scores each component 0–4 with verbatim evidence;
// the numeric answer score is ALWAYS computed here, server-side, from those components.

import type { AnswerAnalysis, StarrKey, StarrScores } from "./types.ts";

export const STARR_KEYS: StarrKey[] = ["situation", "task", "action", "result", "reflection"];

/** Action and Result carry the most weight — what you did and what changed because of it. */
export const STARR_WEIGHTS: Record<StarrKey, number> = {
  situation: 0.15,
  task: 0.1,
  action: 0.35,
  result: 0.25,
  reflection: 0.15,
};

export const STARR_LABELS: Record<StarrKey, string> = {
  situation: "Situation",
  task: "Task",
  action: "Action",
  result: "Result",
  reflection: "Reflection",
};

export const STARR_DEFINITIONS: Record<StarrKey, string> = {
  situation: "The specific context: where, when, who was involved and why it mattered.",
  task: "The candidate's own responsibility, goal or challenge within that context.",
  action: "The concrete steps the candidate personally took, and why they chose them.",
  result: "The outcome of those actions — ideally measurable — and its impact.",
  reflection: "What the candidate learned, would do differently, or has applied since.",
};

/** Score anchors shared by the model prompt, the heuristic analyser and the UI. */
export const STARR_ANCHORS: Record<StarrKey, [string, string, string, string, string]> = {
  situation: [
    "Absent — no context given.",
    "Vague or generic context (\"at work once\").",
    "Identifiable context but missing who/when/why it mattered.",
    "Clear, specific context with stakes.",
    "Vivid, concise context with clear stakes and constraints, no rambling.",
  ],
  task: [
    "Absent — no personal responsibility or goal stated.",
    "Goal implied or only the team's goal.",
    "Personal responsibility stated but loosely.",
    "Clear personal goal or challenge and success criteria.",
    "Precise ownership, success criteria and constraints.",
  ],
  action: [
    "Absent — no actions described, or only hypotheticals.",
    "Generic or team-only actions (\"we handled it\").",
    "Some personal actions, little reasoning or detail.",
    "Specific first-person actions with reasoning.",
    "Detailed, well-sequenced personal actions with trade-offs and rationale.",
  ],
  result: [
    "Absent — no outcome.",
    "Vague outcome (\"it went well\").",
    "Concrete outcome but unquantified or impact unclear.",
    "Concrete, ideally quantified outcome with impact.",
    "Quantified outcome, impact on stakeholders/business, and attribution to own actions.",
  ],
  reflection: [
    "Absent — no learning or insight.",
    "Superficial lesson (\"I learned teamwork is important\").",
    "Genuine lesson tied to the story.",
    "Specific lesson and how behaviour changed.",
    "Insightful lesson, evidence it was applied since, and what they would do differently.",
  ],
};

export const DIMENSION_DEFINITIONS = {
  relevance: "How directly the answer addresses the question that was asked (0 = unrelated, 4 = fully on point).",
  specificity: "Concrete names, numbers, timeframes, tools and details vs. generic statements (0–4).",
  ownership: "Uses first-person, describes own contribution clearly vs. hiding behind \"we\" (0–4).",
  communication: "Structure, clarity and concision for a spoken answer (0–4).",
};

export function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

export function clampScore04(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  return Math.round(clamp(v, 0, 4));
}

const RELEVANCE_FACTOR = [0.3, 0.55, 0.85, 1, 1];

/**
 * Numeric answer score (0–100) from STARR components and dimensions.
 * Deterministic and server-side: the model never supplies this number.
 */
export function computeAnswerScore(
  starr: StarrScores,
  dims: { relevance: number; specificity: number; ownership: number; communication: number },
): number {
  let base = 0;
  for (const k of STARR_KEYS) base += STARR_WEIGHTS[k] * (clampScore04(starr[k]?.score) / 4);
  base *= 100;
  const rel = RELEVANCE_FACTOR[clampScore04(dims.relevance)];
  let score = base * rel;
  score += (clampScore04(dims.specificity) - 2) * 2.5;
  score += (clampScore04(dims.ownership) - 2) * 2;
  score += (clampScore04(dims.communication) - 2) * 1.5;
  // An answer with no action and no result cannot be a strong answer regardless of polish.
  if (clampScore04(starr.action?.score) === 0 && clampScore04(starr.result?.score) === 0) score = Math.min(score, 25);
  return Math.round(clamp(score, 0, 100));
}

/** Component-wise maximum: follow-up answers can fill in elements missing from the main answer. */
export function mergeStarr(analyses: AnswerAnalysis[]): Record<StarrKey, number> {
  const out = { situation: 0, task: 0, action: 0, result: 0, reflection: 0 } as Record<StarrKey, number>;
  for (const a of analyses) {
    if (!a || a.intent !== "answer") continue;
    for (const k of STARR_KEYS) out[k] = Math.max(out[k], clampScore04(a.starr[k]?.score));
  }
  return out;
}

export function scoreFromStarrMap(
  starr: Record<StarrKey, number>,
  dims: { relevance: number; specificity: number; ownership: number; communication: number },
): number {
  const s = Object.fromEntries(
    STARR_KEYS.map((k) => [k, { score: starr[k], evidence: "", note: "" }]),
  ) as StarrScores;
  return computeAnswerScore(s, dims);
}

export function scoreLabel(score: number): string {
  if (score >= 85) return "Exceptional";
  if (score >= 70) return "Strong";
  if (score >= 55) return "Solid";
  if (score >= 40) return "Developing";
  return "Needs work";
}

export function missingComponents(starr: StarrScores, threshold = 1): StarrKey[] {
  return STARR_KEYS.filter((k) => clampScore04(starr[k]?.score) <= threshold);
}

/** Lower-case, collapse whitespace and strip punctuation for fuzzy quote matching. */
export function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^a-z0-9%$€£'\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Anti-hallucination / anti-manipulation check: evidence quoted for a component must
 * actually appear in the candidate's answer. Accepts exact (normalised) substring or
 * ≥80% of the quote's words appearing in order-insensitive form for short paraphrase drift.
 */
export function evidenceAppearsIn(evidence: string, answer: string): boolean {
  const e = normalizeForMatch(evidence);
  if (!e) return false;
  const a = normalizeForMatch(answer);
  if (a.includes(e)) return true;
  const words = e.split(" ").filter((w) => w.length > 2);
  if (words.length < 3) return false;
  const answerWords = new Set(a.split(" "));
  const hit = words.filter((w) => answerWords.has(w)).length;
  return hit / words.length >= 0.8;
}

/**
 * Enforce the evidence rule: a component scored ≥2 must be backed by a quote found in the answer.
 * Unbacked components are capped at 1. Returns the list of components that were capped.
 */
export function enforceEvidence(starr: StarrScores, answer: string): StarrKey[] {
  const capped: StarrKey[] = [];
  for (const k of STARR_KEYS) {
    const c = starr[k];
    c.score = clampScore04(c.score);
    c.evidence = (c.evidence ?? "").slice(0, 400);
    if (c.score >= 2 && !evidenceAppearsIn(c.evidence, answer)) {
      c.score = 1;
      capped.push(k);
    }
    if (c.score === 0) c.evidence = "";
  }
  return capped;
}

export function emptyStarr(): StarrScores {
  return {
    situation: { score: 0, evidence: "", note: "" },
    task: { score: 0, evidence: "", note: "" },
    action: { score: 0, evidence: "", note: "" },
    result: { score: 0, evidence: "", note: "" },
    reflection: { score: 0, evidence: "", note: "" },
  };
}
