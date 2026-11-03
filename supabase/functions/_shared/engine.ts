// Interview engine — pure decision logic (no I/O).
//
// The interview is adaptive at two levels:
//  1. Within a question: after every answer the engine decides whether to PROBE (follow-up on a
//     missing STARR element or dig deeper into a claim) or MOVE ON.
//  2. Across the interview: the next main question targets the competency with the least evidence,
//     and the model writes it in the context of what the candidate has already said.
//
// When does it stop? A deterministic, server-side rule (the model cannot influence it):
//  - Never before `minMainQuestions` (the core round) and never after `maxMainQuestions`.
//  - At the end of every round, compute the running score S (0–100) and per-competency evidence E.
//    If S is inside the uncertainty band [low, high] (default 50–72) OR any planned competency has
//    E < evidenceTarget (default 0.7), the result is not yet conclusive → run another round of
//    `roundSize` questions. Otherwise the interview ends with a confident result.

import type {
  AnswerAnalysis,
  Competency,
  CoverageEntry,
  EngineState,
  InterviewConfig,
  InterviewPlan,
  IntegritySettings,
  Recommendation,
  IntegrityLevel,
  StarrKey,
  TurnKind,
  TurnRow,
} from "./types.ts";
import { STARR_KEYS, clamp, mergeStarr, scoreFromStarrMap } from "./rubric.ts";
import { questionFingerprint } from "./guardrails.ts";

export const DEFAULT_DECISION_BAND = { low: 50, high: 72 };
export const DEFAULT_EVIDENCE_TARGET = 0.7;

export function integrityPreset(level: IntegritySettings["level"]): IntegritySettings {
  if (level === "strict") return { level, requireCamera: true, requireFullscreen: true, voiceOnly: true, blockPaste: true };
  if (level === "standard") return { level, requireCamera: false, requireFullscreen: false, voiceOnly: false, blockPaste: true };
  return { level: "off", requireCamera: false, requireFullscreen: false, voiceOnly: false, blockPaste: false };
}

/** Fill defaults and clamp every numeric knob so a hostile client can't configure a 500-question interview. */
export function normalizeConfig(input: Partial<InterviewConfig> & { roleTitle: string }, mode: "practice" | "business"): InterviewConfig {
  const minQ = Math.round(clamp(Number(input.minMainQuestions ?? 4), 1, 10));
  const maxQ = Math.round(clamp(Number(input.maxMainQuestions ?? Math.max(minQ + 3, 7)), minQ, 12));
  const difficulty = (["easy", "standard", "hard"] as const).includes(input.difficulty as never) ? input.difficulty! : "standard";
  const band = input.decisionBand ?? DEFAULT_DECISION_BAND;
  const low = clamp(Number(band.low), 0, 100);
  const high = clamp(Number(band.high), low, 100);
  const integrityIn = input.integrity ?? integrityPreset(mode === "business" ? "standard" : "off");
  const integrity: IntegritySettings = {
    level: (["off", "standard", "strict"] as const).includes(integrityIn.level) ? integrityIn.level : "standard",
    requireCamera: !!integrityIn.requireCamera,
    requireFullscreen: !!integrityIn.requireFullscreen,
    voiceOnly: !!integrityIn.voiceOnly,
    blockPaste: !!integrityIn.blockPaste,
  };
  return {
    roleTitle: String(input.roleTitle).slice(0, 120),
    seniority: (["entry", "junior", "mid", "senior", "lead", "executive"] as const).includes(input.seniority as never) ? input.seniority! : "mid",
    style: (["behavioral", "situational", "mixed"] as const).includes(input.style as never) ? input.style! : "mixed",
    persona: (["supportive", "neutral", "challenging"] as const).includes(input.persona as never) ? input.persona! : mode === "practice" ? "supportive" : "neutral",
    difficulty,
    minMainQuestions: minQ,
    maxMainQuestions: maxQ,
    maxFollowUps: Math.round(clamp(Number(input.maxFollowUps ?? (difficulty === "easy" ? 1 : 2)), 0, 3)),
    roundSize: Math.round(clamp(Number(input.roundSize ?? 2), 1, 4)),
    decisionBand: { low, high },
    evidenceTarget: clamp(Number(input.evidenceTarget ?? DEFAULT_EVIDENCE_TARGET), 0.3, 1),
    includeIntro: input.includeIntro ?? true,
    showLiveFeedback: mode === "practice" ? input.showLiveFeedback ?? true : false,
    jobDescription: input.jobDescription ? String(input.jobDescription).slice(0, 6000) : null,
    resumeSummary: input.resumeSummary ? String(input.resumeSummary).slice(0, 3000) : null,
    companyName: input.companyName ? String(input.companyName).slice(0, 120) : null,
    focusCompetencies: Array.isArray(input.focusCompetencies) ? input.focusCompetencies.slice(0, 8).map((s) => String(s).slice(0, 60)) : [],
    fixedFirstQuestion: input.fixedFirstQuestion ? String(input.fixedFirstQuestion).slice(0, 400) : null,
    integrity,
    timeLimitMinutes: input.timeLimitMinutes ? Math.round(clamp(Number(input.timeLimitMinutes), 5, 120)) : null,
  };
}

export function initialState(config: InterviewConfig, plan: InterviewPlan): EngineState {
  const coverage: Record<string, CoverageEntry> = {};
  for (const c of plan.competencies) coverage[c.key] = { competency: c.key, asked: 0, evidence: 0, scores: [] };
  return {
    phase: config.includeIntro ? "intro" : "core",
    round: 0,
    mainCount: 0,
    currentMainSeq: null,
    currentCompetency: null,
    followUpsForCurrent: 0,
    clarificationsForCurrent: 0,
    strikesForCurrent: 0,
    manipulationStrikes: 0,
    coverage,
    askedQuestions: [],
    pending: null,
    endReason: null,
    decisions: [],
  };
}

/** Next competency: least evidence first, then fewest questions, then plan order. */
export function chooseNextCompetency(state: EngineState, plan: InterviewPlan, exclude: string | null = null): Competency {
  const order = plan.competencies.map((c, i) => ({ c, i, cov: state.coverage[c.key] ?? { asked: 0, evidence: 0 } }));
  const candidates = order.filter((o) => o.c.key !== exclude);
  const pool = candidates.length ? candidates : order;
  pool.sort((a, b) => a.cov.evidence - b.cov.evidence || a.cov.asked - b.cov.asked || a.i - b.i);
  return pool[0].c;
}

/** Evidence gained from one question: strong, specific answers count more. */
export function evidenceGain(score: number, specificity: number): number {
  const base = clamp(score / 100, 0, 1) * 0.6 + 0.25;
  return clamp(base + (specificity >= 3 ? 0.1 : 0), 0, 1);
}

export type NextAction = { action: "follow_up"; reason: string; preferDepth: boolean } | { action: "next_main"; reason: string } | { action: "end"; reason: string };

/** Within-question policy: probe or move on? */
export function decideFollowUp(state: EngineState, config: InterviewConfig, kind: TurnKind, analysis: AnswerAnalysis): { probe: boolean; preferDepth: boolean; reason: string } {
  if (kind === "intro") return { probe: false, preferDepth: false, reason: "intro" };
  if (analysis.intent !== "answer") return { probe: false, preferDepth: false, reason: `intent:${analysis.intent}` };
  if (state.followUpsForCurrent >= config.maxFollowUps) return { probe: false, preferDepth: false, reason: "follow-up budget used" };
  const s = analysis.starr;
  const coreMissing = s.action.score <= 1 || s.result.score <= 1;
  const softMissing = s.situation.score <= 1 || s.task.score <= 1 || s.reflection.score <= 1;
  // Authenticity probe: polished but generic answers, or suspected scripted answers, get a depth probe.
  const suspicious = analysis.authenticity.aiLikelihood >= 0.5 || (analysis.score >= 65 && analysis.specificity <= 1);
  if (suspicious && state.followUpsForCurrent === 0) return { probe: true, preferDepth: true, reason: "authenticity depth probe" };
  if (coreMissing && analysis.relevance >= 2) return { probe: true, preferDepth: false, reason: "missing action/result" };
  if (config.difficulty === "hard" && state.followUpsForCurrent === 0 && analysis.claimsToProbe.length > 0) {
    return { probe: true, preferDepth: true, reason: "hard mode: probe a claim" };
  }
  if (softMissing && config.difficulty !== "easy" && state.followUpsForCurrent === 0 && analysis.score < 75) {
    return { probe: true, preferDepth: false, reason: "missing context/reflection" };
  }
  return { probe: false, preferDepth: false, reason: "answer sufficient" };
}

/** Per-main-question score: merge STARR across the main answer and its follow-ups. */
export function questionScore(turns: TurnRow[], mainSeq: number): { score: number; starr: Record<StarrKey, number>; specificity: number } | null {
  const group = turns.filter((t) => (t.seq === mainSeq || t.parent_seq === mainSeq) && t.analysis && t.kind !== "intro");
  const answered = group.map((t) => t.analysis!).filter((a) => a.intent === "answer");
  if (group.length === 0) return null;
  if (answered.length === 0) return { score: 0, starr: { situation: 0, task: 0, action: 0, result: 0, reflection: 0 }, specificity: 0 };
  const starr = mergeStarr(answered);
  const avg = (k: "relevance" | "specificity" | "ownership" | "communication") =>
    Math.round(answered.reduce((s, a) => s + a[k], 0) / answered.length);
  const main = answered[0];
  const dims = { relevance: main.relevance, specificity: Math.max(...answered.map((a) => a.specificity)), ownership: avg("ownership"), communication: avg("communication") };
  return { score: scoreFromStarrMap(starr, dims), starr, specificity: dims.specificity };
}

/** Update coverage for the competency of a finished main question. */
export function recordQuestionOutcome(state: EngineState, competency: string | null, score: number, specificity: number): void {
  if (!competency) return;
  const cov = state.coverage[competency] ?? (state.coverage[competency] = { competency, asked: 0, evidence: 0, scores: [] });
  cov.scores.push(score);
  cov.evidence = clamp(cov.evidence + evidenceGain(score, specificity), 0, 1);
}

export function runningScore(state: EngineState): number | null {
  const all = Object.values(state.coverage).flatMap((c) => c.scores);
  if (all.length === 0) return null;
  return Math.round(all.reduce((s, x) => s + x, 0) / all.length);
}

/**
 * Deterministic stopping rule, evaluated after a main question (and its follow-ups) completes.
 * Returns whether to end and why; may also move the state into an extension round.
 */
export function stoppingDecision(state: EngineState, config: InterviewConfig, elapsedMs: number | null): { end: boolean; reason: string } {
  if (config.timeLimitMinutes && elapsedMs !== null && elapsedMs >= config.timeLimitMinutes * 60_000) return { end: true, reason: "time_limit" };
  if (state.manipulationStrikes >= 3) return { end: true, reason: "conduct" };
  if (state.mainCount >= config.maxMainQuestions) return { end: true, reason: "max_questions" };
  if (state.mainCount < config.minMainQuestions) return { end: false, reason: "core round in progress" };
  const beyondCore = state.mainCount - config.minMainQuestions;
  if (beyondCore % config.roundSize !== 0) return { end: false, reason: `extension round ${state.round} in progress` };
  const s = runningScore(state) ?? 0;
  const inBand = s >= config.decisionBand.low && s <= config.decisionBand.high;
  const lowEvidence = Object.values(state.coverage).some((c) => c.evidence < config.evidenceTarget);
  const room = config.maxMainQuestions - state.mainCount;
  if ((inBand || lowEvidence) && room > 0) {
    state.phase = "extension";
    state.round += 1;
    return {
      end: false,
      reason: `extend: running score ${s} ${inBand ? `inside uncertainty band ${config.decisionBand.low}–${config.decisionBand.high}` : "conclusive"}${lowEvidence ? `, evidence below ${config.evidenceTarget} for some competencies` : ""}`,
    };
  }
  return { end: true, reason: inBand || lowEvidence ? "max_questions" : "confident" };
}

export function isRepeat(state: EngineState, q: string): boolean {
  const fp = questionFingerprint(q);
  return state.askedQuestions.includes(fp);
}

export function rememberQuestion(state: EngineState, q: string): void {
  const fp = questionFingerprint(q);
  if (fp && !state.askedQuestions.includes(fp)) state.askedQuestions.push(fp);
  if (state.askedQuestions.length > 60) state.askedQuestions.shift();
}

export interface SessionScores {
  overall: number;
  starr: Record<StarrKey, number>;
  competencies: { key: string; name: string; score: number; evidence: number }[];
  questions: { seq: number; competency: string | null; question: string; score: number; starr: Record<StarrKey, number>; followUps: number }[];
}

export function computeSessionScores(turns: TurnRow[], plan: InterviewPlan, state: EngineState): SessionScores {
  const mains = turns.filter((t) => t.kind === "main" && t.analysis);
  const questions = mains.map((m) => {
    const q = questionScore(turns, m.seq)!;
    return {
      seq: m.seq,
      competency: m.competency,
      question: m.question,
      score: q.score,
      starr: q.starr,
      followUps: turns.filter((t) => t.parent_seq === m.seq).length,
    };
  });
  const overall = questions.length ? Math.round(questions.reduce((s, q) => s + q.score, 0) / questions.length) : 0;
  const starr = { situation: 0, task: 0, action: 0, result: 0, reflection: 0 } as Record<StarrKey, number>;
  if (questions.length) {
    for (const k of STARR_KEYS) starr[k] = Math.round((questions.reduce((s, q) => s + q.starr[k], 0) / questions.length) * 10) / 10;
  }
  const competencies = plan.competencies
    .map((c) => {
      const qs = questions.filter((q) => q.competency === c.key);
      return {
        key: c.key,
        name: c.name,
        score: qs.length ? Math.round(qs.reduce((s, q) => s + q.score, 0) / qs.length) : -1,
        evidence: Math.round((state.coverage[c.key]?.evidence ?? 0) * 100) / 100,
      };
    })
    .filter((c) => c.score >= 0);
  return { overall, starr, competencies, questions };
}

export function recommend(overall: number, integrity: IntegrityLevel): Recommendation {
  let r: Recommendation = overall >= 80 ? "strong_yes" : overall >= 66 ? "yes" : overall >= 50 ? "lean_no" : "no";
  // High-risk integrity never yields an automatic positive recommendation.
  if (integrity === "high_risk" && (r === "strong_yes" || r === "yes")) r = "lean_no";
  if (integrity === "review" && r === "strong_yes") r = "yes";
  return r;
}
