// AI provider interface + the deterministic heuristic implementation.
// The Claude implementation lives in llm.ts; `withFallback` wraps it so any failed call
// (network, refusal, invalid output) transparently degrades to the heuristic engine.

import type {
  AnswerAnalysis,
  AnswerIntent,
  Competency,
  EngineName,
  InterviewConfig,
  InterviewPlan,
  ReportNarrative,
  SessionMode,
  SpeechMetrics,
  StarrKey,
  TurnKind,
  TurnRow,
} from "./types.ts";
import { heuristicAnalyze, heuristicFollowUp, heuristicNarrative } from "./heuristics.ts";
import { acknowledgment, bankQuestion, clarifyLine, planCompetencies } from "./questionBank.ts";
import { STARR_LABELS } from "./rubric.ts";

export interface EvaluateInput {
  config: InterviewConfig;
  mode: SessionMode;
  plan: InterviewPlan;
  history: { kind: TurnKind; competency: string | null; question: string; answer: string }[];
  currentKind: TurnKind;
  currentCompetency: Competency | null;
  question: string;
  answer: string;
  metrics: SpeechMetrics;
  preIntent: AnswerIntent;
  nextCompetency: Competency;
  askedQuestions: string[];
  alreadyAsked: (q: string) => boolean;
  salt: number;
}

export interface EvaluateOutput {
  analysis: AnswerAnalysis;
  followUpQuestion: string | null;
  nextQuestion: string | null;
  clarifiedQuestion: string | null;
  acknowledgment: string | null;
  liveFeedback: string | null;
}

export interface NarrativeInput {
  mode: SessionMode;
  config: InterviewConfig;
  overall: number;
  label: string;
  starr: Record<StarrKey, number>;
  competencies: { name: string; score: number }[];
  delivery: Record<string, unknown>;
  integrity: { score: number; level: string; signals: { label: string; count: number }[] };
  turns: TurnRow[];
}

export interface PlanOutput {
  plan: InterviewPlan;
  openingQuestion: string | null;
}

export interface InterviewAI {
  name: EngineName;
  plan(config: InterviewConfig, mode: SessionMode): Promise<PlanOutput>;
  evaluate(input: EvaluateInput): Promise<EvaluateOutput>;
  narrative(input: NarrativeInput): Promise<ReportNarrative>;
}

export const heuristicAI: InterviewAI = {
  name: "heuristic",
  async plan(config) {
    const count = Math.max(4, Math.min(6, config.minMainQuestions + 1));
    const competencies = planCompetencies(config.roleTitle, config.seniority, config.focusCompetencies ?? [], count);
    return { plan: { competencies }, openingQuestion: null };
  },
  async evaluate(i) {
    const analysis = heuristicAnalyze(i.answer, {
      question: i.question,
      competency: i.currentCompetency,
      metrics: i.metrics,
      preIntent: i.preIntent,
    });
    const preferDepth = analysis.authenticity.aiLikelihood >= 0.5 || (analysis.score >= 65 && analysis.specificity <= 1);
    const followUp = heuristicFollowUp(analysis, i.salt, preferDepth, i.alreadyAsked);
    const next = bankQuestion(i.nextCompetency, i.config.style, i.config.roleTitle, i.alreadyAsked, i.salt);
    let live: string | null = null;
    if (i.mode === "practice" && analysis.intent === "answer" && i.currentKind !== "intro") {
      const good = analysis.strengths[0];
      const tip = analysis.improvements[0];
      live = good && tip ? `${good} Next time: ${lowerFirst(tip)}` : good ?? tip ?? null;
    }
    return {
      analysis,
      followUpQuestion: followUp,
      nextQuestion: next,
      clarifiedQuestion: analysis.intent === "clarification" ? clarifyLine(i.question, i.config.persona) : null,
      acknowledgment: acknowledgment(i.config.persona, i.salt),
      liveFeedback: live,
    };
  },
  async narrative(i) {
    return heuristicNarrative({
      config: i.config,
      overall: i.overall,
      label: i.label,
      starr: i.starr,
      turns: i.turns,
      competencies: i.competencies,
      mode: i.mode,
    });
  },
};

function lowerFirst(s: string): string {
  return s ? s[0].toLowerCase() + s.slice(1) : s;
}

export interface FallbackLog {
  (stage: string, err: unknown): void;
}

/** Wrap a primary AI so each call falls back to the heuristic engine on failure. */
export function withFallback(primary: InterviewAI, log: FallbackLog = () => {}): InterviewAI {
  if (primary.name === "heuristic") return primary;
  return {
    name: primary.name,
    async plan(config, mode) {
      try {
        return await primary.plan(config, mode);
      } catch (e) {
        log("plan", e);
        return heuristicAI.plan(config, mode);
      }
    },
    async evaluate(input) {
      try {
        return await primary.evaluate(input);
      } catch (e) {
        log("evaluate", e);
        return heuristicAI.evaluate(input);
      }
    },
    async narrative(input) {
      try {
        return await primary.narrative(input);
      } catch (e) {
        log("narrative", e);
        return heuristicAI.narrative(input);
      }
    },
  };
}

export function describeMissing(keys: StarrKey[]): string {
  return keys.map((k) => STARR_LABELS[k]).join(", ");
}
