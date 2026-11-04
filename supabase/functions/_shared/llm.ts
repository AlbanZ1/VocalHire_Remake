// Claude-powered implementation of InterviewAI using the official Anthropic TypeScript SDK.
//
// - Structured outputs (output_config.format json_schema) constrain the response shape; the
//   result is validated AGAIN with zod and every field is clamped/sanitised before use.
// - The static system prompt is prompt-cached.
// - Server-side refusal fallbacks are enabled by default (`fallbacks: "default"`), so a false-
//   positive safety decline doesn't break an interview; any other failure falls back to the
//   heuristic engine via withFallback().
// - The model never sets the numeric score: rubric.ts computes it from verified components.

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { DocumentsInput, DocumentsOutput, EvaluateInput, EvaluateOutput, InterviewAI, NarrativeInput, PlanDocs, PlanOutput, ReviewInput } from "./ai.ts";
import type { AnswerAnalysis, CvProfile, CvReview, InterviewConfig, JobProfile, ReportNarrative, Seniority, StarrScores } from "./types.ts";
import {
  CV_REVIEW_JSON_SCHEMA,
  CV_REVIEW_SYSTEM,
  DOCUMENTS_JSON_SCHEMA,
  DOCUMENTS_SYSTEM,
  EVALUATION_JSON_SCHEMA,
  INTERVIEWER_SYSTEM,
  PLANNER_SYSTEM,
  PLAN_JSON_SCHEMA,
  REPORT_JSON_SCHEMA,
  REPORT_SYSTEM,
  buildCvReviewPrompt,
  buildDocumentsPrompt,
  buildEvaluatePrompt,
  buildPlannerPrompt,
  buildReportPrompt,
} from "./prompts.ts";
import { finalizeReview, profileForPrompt, jobForPrompt, sanitizePersonName } from "./documents.ts";
import { STARR_KEYS, clamp, clampScore04, computeAnswerScore, enforceEvidence, missingComponents } from "./rubric.ts";
import { resolveCompetency } from "./questionBank.ts";
import { sanitizeShortText } from "./guardrails.ts";

export const DEFAULT_MODEL = "claude-opus-5-5";

type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface ClaudeOptions {
  apiKey: string;
  model?: string;
  baseURL?: string;
  /** Enable server-side refusal fallbacks (default true). */
  useFallbacks?: boolean;
  turnEffort?: Effort;
  reportEffort?: Effort;
  reviewEffort?: Effort;
  timeoutMs?: number;
  /** Custom fetch (tests / proxies). */
  fetch?: typeof fetch;
}

const str = (max: number) => z.coerce.string().catch("").transform((s) => s.replace(/\s+/g, " ").trim().slice(0, max));
const int04 = z.coerce.number().catch(0).transform((n) => clampScore04(n));
const strList = (maxItems: number, maxLen: number) =>
  z.array(z.coerce.string()).catch([]).transform((a) => a.map((s) => s.replace(/\s+/g, " ").trim().slice(0, maxLen)).filter(Boolean).slice(0, maxItems));

const starrComponent = z
  .object({ score: int04, evidence: str(400), note: str(240) })
  .catch({ score: 0, evidence: "", note: "" });

const EvaluationSchema = z.object({
  intent: z.enum(["answer", "clarification", "skip", "off_topic", "manipulation"]).catch("answer"),
  starr: z.object({
    situation: starrComponent,
    task: starrComponent,
    action: starrComponent,
    result: starrComponent,
    reflection: starrComponent,
  }),
  relevance: int04,
  specificity: int04,
  ownership: int04,
  communication: int04,
  strengths: strList(4, 220),
  improvements: strList(4, 220),
  summary: str(400),
  claims_to_probe: strList(3, 160),
  ai_likelihood: z.coerce.number().catch(0).transform((n) => clamp(n, 0, 1)),
  authenticity_signals: strList(5, 160),
  coaching_tip: str(300),
  acknowledgment: str(200),
  follow_up_question: str(400),
  next_main_question: str(450),
  clarified_question: str(400),
  live_feedback: str(300),
});

const PlanSchema = z.object({
  competencies: z
    .array(z.object({ key: str(48), name: str(60), description: str(200) }))
    .min(1),
  opening_question: str(450),
});

const ReportSchema = z.object({
  headline: str(200),
  summary: str(900),
  strengths: strList(5, 260),
  growth_areas: strList(5, 260),
  next_steps: strList(5, 260),
  hiring_summary: str(1200),
  question_coaching: z
    .array(z.object({ seq: z.coerce.number().int(), outline: str(900) }))
    .catch([]),
});

const DocumentsSchema = z.object({
  cv: z
    .object({
      name: str(80),
      headline: str(240),
      years_experience: z.coerce.number().catch(-1),
      roles: z
        .array(z.object({ title: str(120), organization: str(120), period: str(60), highlights: strList(4, 220) }))
        .catch([]),
      skills: strList(25, 60),
      education: strList(4, 160),
      claims: strList(8, 220),
      summary: str(700),
    })
    .catch({ name: "", headline: "", years_experience: -1, roles: [], skills: [], education: [], claims: [], summary: "" }),
  job: z
    .object({
      title: str(120),
      company: str(120),
      seniority: z.enum(["entry", "junior", "mid", "senior", "lead", "executive", "unknown"]).catch("unknown"),
      summary: str(500),
      responsibilities: strList(8, 260),
      requirements: strList(10, 260),
      nice_to_have: strList(6, 260),
      competencies: strList(6, 60),
      keywords: strList(15, 50),
    })
    .catch({ title: "", company: "", seniority: "unknown", summary: "", responsibilities: [], requirements: [], nice_to_have: [], competencies: [], keywords: [] }),
});

const ReviewSchema = z.object({
  verdict: str(160),
  summary: str(700),
  coverage: z
    .array(
      z.object({
        requirement: str(260),
        kind: z.enum(["required", "nice"]).catch("required"),
        status: z.enum(["met", "partial", "missing"]).catch("missing"),
        evidence: str(400),
        note: str(260),
      }),
    )
    .catch([]),
  strengths: strList(5, 260),
  gaps: strList(5, 260),
  missing_keywords: strList(10, 50),
  fixes: z
    .array(
      z.object({
        area: str(80),
        priority: z.enum(["high", "medium", "low"]).catch("medium"),
        issue: str(300),
        suggestion: str(400),
        before: str(400),
        after: str(500),
      }),
    )
    .catch([]),
  tailored_summary: str(700),
  interview_focus: strList(6, 220),
});

class ModelOutputError extends Error {}

export function createClaudeAI(opts: ClaudeOptions): InterviewAI {
  const client = new Anthropic({
    apiKey: opts.apiKey,
    baseURL: opts.baseURL,
    timeout: opts.timeoutMs ?? 40_000,
    maxRetries: 1,
    ...(opts.fetch ? { fetch: opts.fetch } : {}),
  });
  const model = opts.model || DEFAULT_MODEL;
  let useFallbacks = opts.useFallbacks ?? true;

  async function callJSON<T>(args: {
    system: string;
    user: string;
    schema: Record<string, unknown>;
    parse: (raw: unknown) => T;
    maxTokens: number;
    effort: Effort;
  }): Promise<T> {
    const base = {
      model,
      max_tokens: args.maxTokens,
      system: [{ type: "text" as const, text: args.system, cache_control: { type: "ephemeral" as const } }],
      messages: [{ role: "user" as const, content: args.user }],
      output_config: { effort: args.effort, format: { type: "json_schema" as const, schema: args.schema } },
    };
    let response;
    if (useFallbacks) {
      try {
        response = await client.beta.messages.create({ ...base, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });
      } catch (e) {
        // If this account/model rejects the refusal-fallback beta, stop sending it and retry once.
        if (!(e instanceof Anthropic.BadRequestError)) throw e;
        useFallbacks = false;
        response = await client.messages.create(base);
      }
    } else {
      response = await client.messages.create(base);
    }
    if (response.stop_reason === "refusal") throw new ModelOutputError("model declined the request");
    if (response.stop_reason === "max_tokens") throw new ModelOutputError("model output truncated");
    let text = "";
    for (const block of response.content) if (block.type === "text") text += block.text;
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new ModelOutputError("model returned invalid JSON");
    }
    return args.parse(json);
  }

  return {
    name: "claude",

    async plan(config: InterviewConfig, _mode, docs?: PlanDocs): Promise<PlanOutput> {
      const required = (config.focusCompetencies ?? []).map(resolveCompetency);
      const out = await callJSON({
        system: PLANNER_SYSTEM,
        user: buildPlannerPrompt(config, required, docs ?? {}),
        schema: PLAN_JSON_SCHEMA,
        parse: (raw) => PlanSchema.parse(raw),
        maxTokens: 6000,
        effort: opts.turnEffort ?? "low",
      });
      const seen = new Set<string>();
      const competencies = [...required];
      for (const c of required) seen.add(c.key);
      for (const c of out.competencies) {
        const key = sanitizeShortText(c.key, 48).toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_|_$/g, "") || "general";
        if (seen.has(key)) continue;
        seen.add(key);
        competencies.push({ key, name: sanitizeShortText(c.name, 60) || key, description: sanitizeShortText(c.description, 200) });
        if (competencies.length >= 6) break;
      }
      return { plan: { competencies: competencies.slice(0, 6) }, openingQuestion: out.opening_question || null };
    },

    async evaluate(i: EvaluateInput): Promise<EvaluateOutput> {
      const out = await callJSON({
        system: INTERVIEWER_SYSTEM,
        user: buildEvaluatePrompt({ ...i, candidateName: sanitizePersonName(i.candidateName) }),
        schema: EVALUATION_JSON_SCHEMA,
        parse: (raw) => EvaluationSchema.parse(raw),
        maxTokens: 8000,
        effort: opts.turnEffort ?? "low",
      });
      // The deterministic pre-screen wins over the model for manipulation (model can't "un-flag" it).
      const intent = i.preIntent === "manipulation" ? "manipulation" : out.intent;
      const starr: StarrScores = {
        situation: out.starr.situation,
        task: out.starr.task,
        action: out.starr.action,
        result: out.starr.result,
        reflection: out.starr.reflection,
      };
      if (intent !== "answer") for (const k of STARR_KEYS) starr[k] = { score: 0, evidence: "", note: "" };
      const unverified = intent === "answer" ? enforceEvidence(starr, i.answer) : [];
      const dims = intent === "answer"
        ? { relevance: out.relevance, specificity: out.specificity, ownership: out.ownership, communication: out.communication }
        : { relevance: 0, specificity: 0, ownership: 0, communication: 0 };
      const analysis: AnswerAnalysis = {
        intent,
        starr,
        ...dims,
        score: intent === "answer" ? computeAnswerScore(starr, dims) : 0,
        strengths: intent === "answer" ? out.strengths : [],
        improvements: out.improvements,
        missing: missingComponents(starr),
        summary: out.summary,
        claimsToProbe: out.claims_to_probe,
        authenticity: { aiLikelihood: intent === "answer" ? out.ai_likelihood : 0, signals: out.authenticity_signals },
        coachingTip: out.coaching_tip,
        unverifiedEvidence: unverified,
        source: "claude",
      };
      return {
        analysis,
        followUpQuestion: out.follow_up_question || null,
        nextQuestion: out.next_main_question || null,
        clarifiedQuestion: out.clarified_question || null,
        acknowledgment: out.acknowledgment || null,
        liveFeedback: i.mode === "practice" ? out.live_feedback || null : null,
      };
    },

    async narrative(i: NarrativeInput): Promise<ReportNarrative> {
      const mainSeqs = i.turns.filter((t) => t.kind === "main").map((t) => t.seq);
      const out = await callJSON({
        system: REPORT_SYSTEM,
        user: buildReportPrompt({
          mode: i.mode,
          config: i.config,
          overall: i.overall,
          label: i.label,
          starr: i.starr,
          competencies: i.competencies,
          delivery: i.delivery,
          integrity: i.integrity,
          transcript: i.turns.map((t) => ({
            seq: t.seq,
            kind: t.kind,
            competency: t.competency,
            question: t.question,
            answer: t.answer ?? "",
            score: t.score,
            summary: t.analysis?.summary ?? "",
          })),
          mainSeqs,
        }),
        schema: REPORT_JSON_SCHEMA,
        parse: (raw) => ReportSchema.parse(raw),
        maxTokens: 12000,
        effort: opts.reportEffort ?? "medium",
      });
      return {
        headline: out.headline,
        summary: out.summary,
        strengths: out.strengths,
        growthAreas: out.growth_areas,
        nextSteps: out.next_steps,
        hiringSummary: i.mode === "business" ? out.hiring_summary : "",
        questionCoaching: out.question_coaching.filter((q) => mainSeqs.includes(q.seq)),
      };
    },

    async analyzeDocuments({ cvText, jobText }: DocumentsInput): Promise<DocumentsOutput> {
      if (!cvText && !jobText) return { cv: null, job: null };
      const out = await callJSON({
        system: DOCUMENTS_SYSTEM,
        user: buildDocumentsPrompt(cvText, jobText),
        schema: DOCUMENTS_JSON_SCHEMA,
        parse: (raw) => DocumentsSchema.parse(raw),
        maxTokens: 8000,
        effort: opts.turnEffort ?? "low",
      });
      let cv: CvProfile | null = null;
      if (cvText) {
        const c = out.cv;
        cv = {
          name: sanitizePersonName(c.name),
          headline: c.headline || null,
          yearsExperience: c.years_experience >= 0 && c.years_experience <= 60 ? Math.round(c.years_experience) : null,
          roles: c.roles
            .filter((r) => r.title)
            .slice(0, 6)
            .map((r) => ({ title: r.title, organization: r.organization || null, period: r.period || null, highlights: r.highlights })),
          skills: c.skills,
          education: c.education,
          claims: c.claims,
          summary: "",
          source: "claude",
        };
        cv.summary = c.summary || profileForPrompt(cv, 600);
      }
      let job: JobProfile | null = null;
      if (jobText) {
        const j = out.job;
        job = {
          title: j.title || null,
          company: j.company || null,
          seniority: j.seniority === "unknown" ? null : (j.seniority as Seniority),
          summary: "",
          responsibilities: j.responsibilities,
          requirements: j.requirements,
          niceToHave: j.nice_to_have,
          competencies: j.competencies,
          keywords: j.keywords,
          source: "claude",
        };
        job.summary = j.summary || jobForPrompt(job, 400);
      }
      return { cv, job };
    },

    async reviewCv({ cvText, jobText, cv, job, injectionDetected }: ReviewInput): Promise<CvReview> {
      const out = await callJSON({
        system: CV_REVIEW_SYSTEM,
        user: buildCvReviewPrompt(cvText, jobText, cv, job),
        schema: CV_REVIEW_JSON_SCHEMA,
        parse: (raw) => ReviewSchema.parse(raw),
        maxTokens: 12000,
        effort: opts.reviewEffort ?? "medium",
      });
      // Coverage evidence, "before" quotes and both scores are verified/computed server-side.
      return finalizeReview(
        {
          version: 1,
          engine: "claude",
          roleTitle: job?.title ?? null,
          company: job?.company ?? null,
          hasJob: !!jobText,
          verdict: out.verdict,
          summary: out.summary,
          coverage: jobText ? out.coverage : [],
          strengths: out.strengths,
          gaps: out.gaps,
          missingKeywords: jobText ? out.missing_keywords : [],
          fixes: out.fixes,
          tailoredSummary: out.tailored_summary,
          interviewFocus: out.interview_focus,
        },
        cvText,
        cv,
        job,
        injectionDetected,
        "claude",
      );
    },
  };
}
