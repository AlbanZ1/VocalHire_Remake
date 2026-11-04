// AI provider interface + the deterministic heuristic implementation.
// The Claude implementation lives in llm.ts; `withFallback` wraps it so any failed call
// (network, refusal, invalid output) transparently degrades to the heuristic engine.

import type {
  AnswerAnalysis,
  AnswerIntent,
  Competency,
  CvAnchor,
  CvProfile,
  CvReview,
  EngineName,
  InterviewConfig,
  InterviewPlan,
  JobProfile,
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
import { cvQuestion, extractCvProfile, extractJobProfile, finalizeReview, firstName, heuristicCvReview, jobCompetencies } from "./documents.ts";

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
  /** Candidate's name (for occasional, natural personalisation). */
  candidateName?: string | null;
  cv?: CvProfile | null;
  job?: JobProfile | null;
  /** CV item the next main question should be anchored on (chosen by the server). */
  cvAnchor?: CvAnchor | null;
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

export interface PlanDocs {
  cv?: CvProfile | null;
  job?: JobProfile | null;
}

export interface DocumentsInput {
  /** Cleaned CV text with any AI-directed instructions already removed ("" if none). */
  cvText: string;
  /** Cleaned job-posting text ("" if none). */
  jobText: string;
}

export interface DocumentsOutput {
  cv: CvProfile | null;
  job: JobProfile | null;
}

export interface ReviewInput {
  cvText: string;
  jobText: string;
  cv: CvProfile;
  job: JobProfile | null;
  injectionDetected: boolean;
}

export interface InterviewAI {
  name: EngineName;
  plan(config: InterviewConfig, mode: SessionMode, docs?: PlanDocs): Promise<PlanOutput>;
  evaluate(input: EvaluateInput): Promise<EvaluateOutput>;
  narrative(input: NarrativeInput): Promise<ReportNarrative>;
  analyzeDocuments(input: DocumentsInput): Promise<DocumentsOutput>;
  reviewCv(input: ReviewInput): Promise<CvReview>;
}

export const heuristicAI: InterviewAI = {
  name: "heuristic",
  async plan(config, _mode, docs) {
    const count = Math.max(4, Math.min(6, config.minMainQuestions + 1));
    const focus = [...(config.focusCompetencies ?? []), ...jobCompetencies(docs?.job)];
    const competencies = planCompetencies(config.roleTitle, config.seniority, focus, count);
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
    const next = i.cvAnchor
      ? cvQuestion(i.cvAnchor, i.nextCompetency, i.salt)
      : bankQuestion(i.nextCompetency, i.config.style, i.config.roleTitle, i.alreadyAsked, i.salt);
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
      acknowledgment: acknowledgment(i.config.persona, i.salt, firstName(i.candidateName)),
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
  async analyzeDocuments({ cvText, jobText }) {
    return {
      cv: cvText ? extractCvProfile(cvText) : null,
      job: jobText ? extractJobProfile(jobText) : null,
    };
  },
  async reviewCv({ cvText, jobText, cv, job, injectionDetected }) {
    return finalizeReview(heuristicCvReview(cvText, cv, jobText, job), cvText, cv, job, injectionDetected, "heuristic");
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
  const guard = async <T>(stage: string, run: () => Promise<T>, fallback: () => Promise<T>): Promise<T> => {
    try {
      return await run();
    } catch (e) {
      log(stage, e);
      return fallback();
    }
  };
  return {
    name: primary.name,
    plan: (config, mode, docs) => guard("plan", () => primary.plan(config, mode, docs), () => heuristicAI.plan(config, mode, docs)),
    evaluate: (input) => guard("evaluate", () => primary.evaluate(input), () => heuristicAI.evaluate(input)),
    narrative: (input) => guard("narrative", () => primary.narrative(input), () => heuristicAI.narrative(input)),
    analyzeDocuments: (input) => guard("documents", () => primary.analyzeDocuments(input), () => heuristicAI.analyzeDocuments(input)),
    reviewCv: (input) => guard("review", () => primary.reviewCv(input), () => heuristicAI.reviewCv(input)),
  };
}

export function describeMissing(keys: StarrKey[]): string {
  return keys.map((k) => STARR_LABELS[k]).join(", ");
}
