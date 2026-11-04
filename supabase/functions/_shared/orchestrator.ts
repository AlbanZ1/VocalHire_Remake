// Interview orchestrator: the full interview flow on top of a storage interface.
// The edge function supplies a Supabase-backed store; unit tests supply an in-memory store.
//
// Server-owned state: the client can only (a) begin, (b) answer the currently pending question,
// (c) send integrity events, (d) end early. It cannot pick questions, skip ahead, or set scores.

import type { InterviewAI, PlanDocs } from "./ai.ts";
import type {
  AnswerMode,
  DeliverySummary,
  EngineState,
  IntegrityEventInput,
  IntegrityEventRow,
  InterviewConfig,
  InterviewPlan,
  SessionMode,
  SessionReport,
  SessionRow,
  SpeechMetrics,
  StarrKey,
  StarrScores,
  TurnKind,
  TurnRow,
} from "./types.ts";
import {
  chooseNextCompetency,
  computeSessionScores,
  decideFollowUp,
  initialState,
  isRepeat,
  questionScore,
  recommend,
  recordQuestionOutcome,
  rememberQuestion,
  stoppingDecision,
} from "./engine.ts";
import {
  ALLOWED_EVENT_TYPES,
  isRepeatQuestion,
  preClassify,
  redirectLine,
  sanitizeCandidateText,
  validateSpokenLine,
} from "./guardrails.ts";
import { computeIntegrity, severityFor } from "./integrity.ts";
import { acknowledgment, bankQuestion, clarifyLine, closingLine, introQuestion, transition } from "./questionBank.ts";
import { heuristicFollowUp } from "./heuristics.ts";
import { cvQuestion, firstName, pickCvAnchor } from "./documents.ts";
import { STARR_KEYS, computeAnswerScore, scoreLabel } from "./rubric.ts";
import { answerSimilarity, buildMetrics, deliveryConfidence } from "./speech.ts";

export interface InterviewStore {
  getSession(id: string): Promise<SessionRow | null>;
  updateSession(id: string, patch: Record<string, unknown>): Promise<void>;
  listTurns(sessionId: string): Promise<TurnRow[]>;
  insertTurn(row: Omit<TurnRow, "id" | "asked_at">): Promise<TurnRow>;
  updateTurn(id: string, patch: Partial<TurnRow>): Promise<void>;
  insertEvents(rows: IntegrityEventRow[]): Promise<void>;
  listEvents(sessionId: string): Promise<IntegrityEventRow[]>;
  countEvents(sessionId: string): Promise<number>;
}

export class InterviewError extends Error {
  constructor(public code: "not_found" | "conflict" | "invalid" | "finished" | "forbidden", message: string) {
    super(message);
  }
}

export interface Progress {
  mainAsked: number;
  minMain: number;
  maxMain: number;
  phase: EngineState["phase"];
  round: number;
}

export interface QuestionView {
  seq: number;
  kind: TurnKind;
  text: string;
  preface: string | null;
  competency: string | null;
  progress: Progress;
  /** Signatures that let the natural-voice endpoint speak these lines (added by the API layer). */
  speech?: { text: string | null; preface: string | null };
}

/** Signatures for spoken lines outside a question (added by the API layer). */
export interface LineSpeech {
  line?: string | null;
  closing?: string | null;
}

export type SubmitResult =
  | { type: "question"; question: QuestionView; liveFeedback: string | null; starrCheck: Record<StarrKey, boolean> | null; speech?: LineSpeech }
  | { type: "clarify"; line: string; question: QuestionView; speech?: LineSpeech }
  | { type: "redirect"; line: string; question: QuestionView; speech?: LineSpeech }
  | { type: "done"; closing: string; speech?: LineSpeech };

export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

function progress(state: EngineState, config: InterviewConfig): Progress {
  return { mainAsked: state.mainCount, minMain: config.minMainQuestions, maxMain: config.maxMainQuestions, phase: state.phase, round: state.round };
}

function view(state: EngineState, config: InterviewConfig, turn: Pick<TurnRow, "seq" | "kind" | "question" | "preface" | "competency">): QuestionView {
  return { seq: turn.seq, kind: turn.kind, text: turn.question, preface: turn.preface, competency: turn.competency, progress: progress(state, config) };
}

function hashSalt(id: string, seq: number): number {
  let h = seq * 31;
  for (let i = 0; i < id.length; i++) h = (h * 33 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Plan a new session (competencies + optional opening question). */
export async function planSession(ai: InterviewAI, config: InterviewConfig, mode: SessionMode, docs: PlanDocs = {}): Promise<InterviewPlan> {
  const out = await ai.plan(config, mode, docs);
  const opening = validateSpokenLine(out.openingQuestion, { requireQuestion: true, max: 450 });
  return { competencies: out.plan.competencies, openingQuestion: opening };
}

export class Interview {
  constructor(private store: InterviewStore, private ai: InterviewAI, private clock: Clock = systemClock) {}

  private iso(): string {
    return new Date(this.clock.now()).toISOString();
  }

  async load(sessionId: string): Promise<SessionRow> {
    const s = await this.store.getSession(sessionId);
    if (!s) throw new InterviewError("not_found", "Interview not found.");
    return s;
  }

  /**
   * A session whose engine decided to end but whose report was never written (e.g. the function
   * timed out while generating it) is finalised now. Returns true if the session is finished.
   */
  async recover(session: SessionRow): Promise<boolean> {
    if (session.status !== "in_progress") return session.status === "completed" || session.status === "abandoned";
    const st = session.state;
    if (st && !st.pending && st.endReason) {
      await this.finalize(session, st.endReason);
      return true;
    }
    return false;
  }

  /** Start (or resume) the interview: returns the pending question. */
  async begin(session: SessionRow): Promise<{ question: QuestionView } | { done: true }> {
    if (session.status === "completed" || session.status === "abandoned") return { done: true };
    if (await this.recover(session)) return { done: true };
    const plan = session.plan;
    if (!plan || plan.competencies.length === 0) throw new InterviewError("invalid", "Interview has no plan.");
    if (session.state?.pending) return { question: this.current(session)! };

    const config = session.config;
    const state = initialState(config, plan);
    let kind: TurnKind;
    let text: string;
    let competency: string | null = null;
    const flags: string[] = [];
    if (config.includeIntro) {
      kind = "intro";
      text = introQuestion(config.persona, config.roleTitle, config.companyName, firstName(config.candidateName), !!session.cv_profile);
    } else {
      kind = "main";
      const comp = chooseNextCompetency(state, plan);
      competency = comp.key;
      const fixed = validateSpokenLine(config.fixedFirstQuestion, { requireQuestion: true, max: 450 });
      // With a CV, open on the candidate's real experience.
      const anchor = fixed ? null : pickCvAnchor(session.cv_profile, [], comp);
      const anchored = anchor ? validateSpokenLine(cvQuestion(anchor, comp, hashSalt(session.id, 1)), { requireQuestion: true, max: 450 }) : null;
      if (anchor && anchored) {
        state.cvQuestionsAsked = 1;
        state.cvClaimsUsed = [anchor.text];
        flags.push("cv_anchor");
      }
      text = fixed ?? anchored ?? plan.openingQuestion ?? bankQuestion(comp, config.style, config.roleTitle, () => false, hashSalt(session.id, 1));
      state.phase = "core";
      state.mainCount = 1;
      state.currentMainSeq = 1;
      state.currentCompetency = comp.key;
      state.coverage[comp.key].asked += 1;
    }
    const turn = await this.store.insertTurn({
      session_id: session.id,
      seq: 1,
      kind,
      parent_seq: null,
      competency,
      question: text,
      preface: null,
      answer: null,
      answer_mode: null,
      answered_at: null,
      metrics: null,
      analysis: null,
      score: null,
      flags,
    });
    rememberQuestion(state, text);
    state.pending = { seq: turn.seq, kind, competency, text };
    await this.store.updateSession(session.id, {
      state,
      status: "in_progress",
      started_at: session.started_at ?? this.iso(),
      last_activity_at: this.iso(),
    });
    return { question: view(state, config, turn) };
  }

  /** Current pending question (for resume after refresh). */
  current(session: SessionRow): QuestionView | null {
    const st = session.state;
    if (!st?.pending) return null;
    return view(st, session.config, { ...st.pending, question: st.pending.text, preface: st.pending.preface ?? null });
  }

  async submitAnswer(
    session: SessionRow,
    input: { seq: number; answer: string; mode: AnswerMode; metrics?: Partial<SpeechMetrics> | null },
  ): Promise<SubmitResult> {
    if (session.status !== "in_progress") throw new InterviewError("finished", "This interview is not in progress.");
    if (await this.recover(session)) throw new InterviewError("finished", "This interview has already finished.");
    const state = session.state!;
    const config = session.config;
    const plan = session.plan!;
    const pending = state.pending;
    if (!pending || pending.seq !== Number(input.seq)) throw new InterviewError("conflict", "That question is no longer active.");

    const turns = await this.store.listTurns(session.id);
    const turn = turns.find((t) => t.seq === pending.seq);
    if (!turn) throw new InterviewError("conflict", "Question record missing.");

    const mode: AnswerMode = input.mode === "text" ? "text" : "voice";
    const clean = sanitizeCandidateText(input.answer ?? "");
    const pre = preClassify(clean);
    const metrics = buildMetrics(clean, input.metrics ?? null, mode);
    const salt = hashSalt(session.id, pending.seq);
    const currentComp = plan.competencies.find((c) => c.key === pending.competency) ?? null;
    const nextComp = chooseNextCompetency(state, plan, state.currentCompetency);
    // CV-anchored questions: roughly every other main question (up to a third of the maximum),
    // each on a different CV item chosen deterministically for the target competency.
    const cv = session.cv_profile ?? null;
    const job = session.job_profile ?? null;
    const usedClaims = state.cvClaimsUsed ?? [];
    const cvTarget = Math.max(1, Math.round(config.maxMainQuestions / 3));
    const cvAnchor = cv && (state.cvQuestionsAsked ?? 0) < cvTarget && state.mainCount % 2 === 0 ? pickCvAnchor(cv, usedClaims, nextComp) : null;
    const history = turns
      .filter((t) => t.answer && t.seq < pending.seq)
      .map((t) => ({ kind: t.kind, competency: t.competency, question: t.question, answer: t.answer! }));

    const asked = turns.map((t) => t.question);
    const evalOut = await this.ai.evaluate({
      config,
      mode: session.mode,
      plan,
      history,
      currentKind: pending.kind,
      currentCompetency: currentComp,
      question: pending.text,
      answer: clean,
      metrics,
      preIntent: pre.intent,
      nextCompetency: nextComp,
      askedQuestions: asked,
      alreadyAsked: (q) => isRepeatQuestion(q, state.askedQuestions) || isRepeat(state, q),
      salt,
      candidateName: config.candidateName ?? null,
      cv,
      job,
      cvAnchor,
    });
    const analysis = evalOut.analysis;
    const flags = [...(turn.flags ?? [])];

    // Recycled answer: the same story reused for a different question is not evidence for the new
    // competency (and reciting one canned answer is a classic scripted-interview pattern).
    if (analysis.intent === "answer" && pending.kind !== "follow_up") {
      const prior = turns.filter((t) => t.answer && t.seq < pending.seq && t.kind !== "intro");
      const maxSim = prior.reduce((m, t) => Math.max(m, answerSimilarity(clean, t.answer!)), 0);
      if (maxSim >= 0.5) {
        flags.push("recycled_answer");
        analysis.relevance = Math.min(analysis.relevance, 1);
        analysis.score = computeAnswerScore(analysis.starr, analysis);
        analysis.authenticity.aiLikelihood = Math.max(analysis.authenticity.aiLikelihood, 0.6);
        analysis.authenticity.signals = [...analysis.authenticity.signals, "Repeats an earlier answer almost word for word"];
        analysis.improvements = ["Use a different, specific example for each question.", ...analysis.improvements].slice(0, 3);
      }
    }
    if (mode === "text" && config.integrity.voiceOnly) flags.push("typed_in_voice_only");

    // ---- Non-answers: clarification / manipulation / off-topic keep the same question pending.
    if (analysis.intent === "clarification" && state.clarificationsForCurrent < 2) {
      state.clarificationsForCurrent += 1;
      flags.push("clarification");
      await this.store.updateTurn(turn.id, { flags });
      await this.store.updateSession(session.id, { state, last_activity_at: this.iso() });
      const line = validateSpokenLine(evalOut.clarifiedQuestion, { requireQuestion: true }) ?? clarifyLine(pending.text, config.persona);
      return { type: "clarify", line, question: view(state, config, { ...turn, preface: null }) };
    }
    if (analysis.intent === "manipulation") {
      state.manipulationStrikes += 1;
      state.strikesForCurrent += 1;
      flags.push("manipulation_attempt");
      await this.store.insertEvents([
        {
          session_id: session.id,
          turn_seq: pending.seq,
          type: "prompt_injection",
          severity: 3,
          detail: { matches: pre.injection.matches, excerpt: clean.slice(0, 240) },
          client_ts: null,
        },
      ]);
      if (state.manipulationStrikes >= 3) {
        await this.store.updateTurn(turn.id, { answer: clean, answer_mode: mode, answered_at: this.iso(), metrics, analysis, score: 0, flags });
        state.pending = null;
        state.endReason = "conduct";
        await this.store.updateSession(session.id, { state });
        return this.finishAndClose(session, state, "conduct");
      }
      if (state.strikesForCurrent < 2) {
        await this.store.updateTurn(turn.id, { flags });
        await this.store.updateSession(session.id, { state, last_activity_at: this.iso() });
        return { type: "redirect", line: `${redirectLine(config.persona)} ${pending.text}`, question: view(state, config, { ...turn, preface: null }) };
      }
      // Second attempt on the same question: record as a zero-credit answer and move on.
    }
    if (analysis.intent === "off_topic" && state.strikesForCurrent < 1) {
      state.strikesForCurrent += 1;
      flags.push("off_topic");
      await this.store.updateTurn(turn.id, { flags });
      await this.store.updateSession(session.id, { state, last_activity_at: this.iso() });
      const line = `I can only help with the interview here, so let's stay with the question. ${pending.text}`;
      return { type: "redirect", line, question: view(state, config, { ...turn, preface: null }) };
    }

    // ---- Record the answer.
    const answeredTurn: TurnRow = {
      ...turn,
      answer: clean,
      answer_mode: mode,
      answered_at: this.iso(),
      metrics,
      analysis,
      score: analysis.intent === "answer" ? analysis.score : 0,
      flags,
    };
    await this.store.updateTurn(turn.id, {
      answer: answeredTurn.answer,
      answer_mode: mode,
      answered_at: answeredTurn.answered_at,
      metrics,
      analysis,
      score: answeredTurn.score,
      flags,
    });
    const allTurns = turns.map((t) => (t.id === turn.id ? answeredTurn : t));

    const ack = validateSpokenLine(evalOut.acknowledgment, { max: 200 }) ?? acknowledgment(config.persona, salt, firstName(config.candidateName));
    const liveFeedback =
      session.mode === "practice" && config.showLiveFeedback && pending.kind !== "intro" && analysis.intent === "answer"
        ? validateSpokenLine(evalOut.liveFeedback, { max: 320 })
        : null;

    // ---- Within-question decision: probe deeper or close this question.
    let closedStarr: Record<StarrKey, number> | null = null;
    if (pending.kind !== "intro" && state.currentMainSeq !== null) {
      const merged = questionScore(allTurns, state.currentMainSeq)!;
      const mergedStarr = Object.fromEntries(
        STARR_KEYS.map((k) => [k, { score: merged.starr[k], evidence: "", note: "" }]),
      ) as StarrScores;
      const effective = { ...analysis, starr: mergedStarr, score: merged.score, missing: STARR_KEYS.filter((k) => merged.starr[k] <= 1) };
      const fu = decideFollowUp(state, config, pending.kind, effective);
      state.decisions.push(`#${pending.seq}: ${fu.reason}`);
      if (fu.probe) {
        let q = validateSpokenLine(evalOut.followUpQuestion, { requireQuestion: true });
        if (!q || isRepeatQuestion(q, state.askedQuestions)) q = heuristicFollowUp(effective, salt + 1, fu.preferDepth, (x) => isRepeatQuestion(x, state.askedQuestions));
        state.followUpsForCurrent += 1;
        state.strikesForCurrent = 0;
        state.clarificationsForCurrent = 0;
        const fTurn = await this.store.insertTurn({
          session_id: session.id,
          seq: pending.seq + 1,
          kind: "follow_up",
          parent_seq: state.currentMainSeq,
          competency: state.currentCompetency,
          question: q,
          preface: null,
          answer: null,
          answer_mode: null,
          answered_at: null,
          metrics: null,
          analysis: null,
          score: null,
          flags: [],
        });
        rememberQuestion(state, q);
        state.pending = { seq: fTurn.seq, kind: "follow_up", competency: fTurn.competency, text: q };
        await this.store.updateSession(session.id, { state, last_activity_at: this.iso() });
        return { type: "question", question: view(state, config, fTurn), liveFeedback: null, starrCheck: null };
      }
      // Close out this main question.
      closedStarr = merged.starr;
      recordQuestionOutcome(state, state.currentCompetency, merged.score, merged.specificity);
      const elapsed = session.started_at ? this.clock.now() - Date.parse(session.started_at) : null;
      const stop = stoppingDecision(state, config, elapsed);
      state.decisions.push(`after Q${state.mainCount}: ${stop.reason}`);
      if (stop.end) {
        state.pending = null;
        state.endReason = stop.reason;
        await this.store.updateSession(session.id, { state });
        return this.finishAndClose(session, state, stop.reason);
      }
    } else if (pending.kind === "intro") {
      state.phase = "core";
    }

    // ---- Next main question (adaptive: written by the model in context of earlier answers).
    let q = validateSpokenLine(evalOut.nextQuestion, { requireQuestion: true, max: 450 });
    if (!q || isRepeatQuestion(q, state.askedQuestions)) {
      const anchoredFallback = cvAnchor ? validateSpokenLine(cvQuestion(cvAnchor, nextComp, salt), { requireQuestion: true, max: 450 }) : null;
      q = anchoredFallback && !isRepeatQuestion(anchoredFallback, state.askedQuestions)
        ? anchoredFallback
        : bankQuestion(nextComp, config.style, config.roleTitle, (x) => isRepeatQuestion(x, state.askedQuestions), salt);
    }
    const nextFlags: string[] = [];
    if (cvAnchor) {
      state.cvQuestionsAsked = (state.cvQuestionsAsked ?? 0) + 1;
      state.cvClaimsUsed = [...usedClaims, cvAnchor.text].slice(-20);
      nextFlags.push("cv_anchor");
    }
    const preface = pending.kind === "intro" ? `${ack} Let's begin.` : `${ack} ${transition(config.persona, salt)}`;
    state.mainCount += 1;
    state.currentMainSeq = pending.seq + 1;
    state.currentCompetency = nextComp.key;
    state.followUpsForCurrent = 0;
    state.clarificationsForCurrent = 0;
    state.strikesForCurrent = 0;
    if (state.coverage[nextComp.key]) state.coverage[nextComp.key].asked += 1;
    const nTurn = await this.store.insertTurn({
      session_id: session.id,
      seq: pending.seq + 1,
      kind: "main",
      parent_seq: null,
      competency: nextComp.key,
      question: q,
      preface,
      answer: null,
      answer_mode: null,
      answered_at: null,
      metrics: null,
      analysis: null,
      score: null,
      flags: nextFlags,
    });
    rememberQuestion(state, q);
    state.pending = { seq: nTurn.seq, kind: "main", competency: nextComp.key, text: q, preface };
    await this.store.updateSession(session.id, { state, last_activity_at: this.iso() });
    const starrCheck =
      session.mode === "practice" && config.showLiveFeedback && closedStarr && analysis.intent === "answer"
        ? (Object.fromEntries(STARR_KEYS.map((k) => [k, closedStarr![k] >= 2])) as Record<StarrKey, boolean>)
        : null;
    return { type: "question", question: view(state, config, nTurn), liveFeedback, starrCheck };
  }

  /** Candidate ends early (or time ran out on the client). */
  async end(session: SessionRow, reason = "ended_by_candidate"): Promise<SubmitResult> {
    if (session.status === "completed") return { type: "done", closing: closingLine(session.config.persona, session.mode, session.config.companyName, firstName(session.config.candidateName)) };
    if (session.status !== "in_progress" && session.status !== "created") throw new InterviewError("finished", "This interview is not in progress.");
    const state = session.state ?? initialState(session.config, session.plan ?? { competencies: [] });
    state.pending = null;
    state.endReason = reason;
    await this.store.updateSession(session.id, { state });
    return this.finishAndClose(session, state, reason);
  }

  private async finishAndClose(session: SessionRow, state: EngineState, reason: string): Promise<SubmitResult> {
    await this.finalize({ ...session, state }, reason);
    return { type: "done", closing: closingLine(session.config.persona, session.mode, session.config.companyName, firstName(session.config.candidateName)) };
  }

  /** Compute scores, integrity and the narrative report; mark the session completed. */
  async finalize(session: SessionRow, reason: string): Promise<SessionReport> {
    const state = session.state!;
    const config = session.config;
    const plan = session.plan ?? { competencies: [] };
    const turns = await this.store.listTurns(session.id);
    const endedAt = this.clock.now();

    let events = await this.store.listEvents(session.id);
    const gaps = telemetryGaps(events, session.started_at ? Date.parse(session.started_at) : null, endedAt, config);
    if (gaps.length) {
      const rows = gaps.map((g) => ({ session_id: session.id, turn_seq: null, type: "telemetry_gap", severity: 2, detail: g, client_ts: null }));
      await this.store.insertEvents(rows);
      events = [...events, ...rows];
    }

    const scores = computeSessionScores(turns, plan, state);
    const integrity = computeIntegrity(events, turns, config.integrity);
    const delivery = computeDelivery(turns, events);
    const label = scoreLabel(scores.overall);
    const recommendation = recommend(scores.overall, integrity.level);
    const answered = turns.filter((t) => t.answer);
    const narrative = await this.ai.narrative({
      mode: session.mode,
      config,
      overall: scores.overall,
      label,
      starr: scores.starr,
      competencies: scores.competencies.map((c) => ({ name: c.name, score: c.score })),
      delivery: delivery as unknown as Record<string, unknown>,
      integrity: { score: integrity.score, level: integrity.level, signals: integrity.signals.map((s) => ({ label: s.label, count: s.count })) },
      turns: answered,
    });
    const report: SessionReport = {
      version: 1,
      engine: this.ai.name,
      endReason: reason,
      overall: scores.overall,
      label,
      starr: scores.starr,
      competencies: scores.competencies,
      questions: scores.questions,
      delivery,
      integrity,
      recommendation,
      narrative,
      durationMs: session.started_at ? endedAt - Date.parse(session.started_at) : null,
      generatedAt: new Date(endedAt).toISOString(),
    };
    await this.store.updateSession(session.id, {
      status: "completed",
      completed_at: new Date(endedAt).toISOString(),
      overall_score: scores.overall,
      starr_scores: scores.starr,
      competency_scores: Object.fromEntries(scores.competencies.map((c) => [c.key, c.score])),
      integrity_score: integrity.score,
      integrity_level: integrity.level,
      recommendation,
      report,
      state: { ...state, phase: "done", pending: null, endReason: reason },
      engine: this.ai.name,
    });
    return report;
  }

  /** Validate and store a batch of client integrity events. */
  async recordEvents(session: SessionRow, events: IntegrityEventInput[]): Promise<number> {
    if (session.status !== "in_progress" && session.status !== "created") return 0;
    if (!Array.isArray(events) || events.length === 0) return 0;
    const existing = await this.store.countEvents(session.id);
    const budget = Math.max(0, 3000 - existing);
    const rows: IntegrityEventRow[] = [];
    for (const e of events.slice(0, Math.min(60, budget))) {
      if (!e || typeof e.type !== "string" || !ALLOWED_EVENT_TYPES.has(e.type)) continue;
      let detail: Record<string, unknown> = {};
      if (e.detail && typeof e.detail === "object") {
        const json = JSON.stringify(e.detail);
        detail = json.length <= 1500 ? (JSON.parse(json) as Record<string, unknown>) : { truncated: true };
      }
      const ts = e.at ? Date.parse(e.at) : NaN;
      rows.push({
        session_id: session.id,
        turn_seq: Number.isInteger(e.turnSeq) ? Number(e.turnSeq) : null,
        type: e.type,
        severity: severityFor(e.type),
        detail,
        client_ts: Number.isFinite(ts) ? new Date(ts).toISOString() : null,
      });
    }
    if (rows.length) await this.store.insertEvents(rows);
    return rows.length;
  }
}

/** Server-side tamper check: an active, monitored interview must keep sending heartbeats. */
export function telemetryGaps(
  events: IntegrityEventRow[],
  startedAt: number | null,
  endedAt: number,
  config: InterviewConfig,
): { fromMs: number; gapMs: number }[] {
  if (config.integrity.level === "off" || startedAt === null) return [];
  if (endedAt - startedAt < 120_000) return [];
  const beats = events
    .filter((e) => e.type === "heartbeat" && e.created_at)
    .map((e) => Date.parse(e.created_at!))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  const points = [startedAt, ...beats, endedAt];
  const gaps: { fromMs: number; gapMs: number }[] = [];
  for (let i = 1; i < points.length; i++) {
    const gap = points[i] - points[i - 1];
    if (gap > 90_000) gaps.push({ fromMs: points[i - 1] - startedAt, gapMs: gap });
  }
  return gaps.slice(0, 5);
}

export function computeDelivery(turns: TurnRow[], events: IntegrityEventRow[]): DeliverySummary {
  const answered = turns.filter((t) => t.answer && t.metrics && t.analysis?.intent === "answer");
  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
  const wpms = answered.map((t) => t.metrics!.wpm).filter((x): x is number => x !== null);
  const words = answered.reduce((s, t) => s + t.metrics!.wordCount, 0);
  const fillers = answered.reduce((s, t) => s + t.metrics!.fillerCount, 0);
  const hedges = answered.reduce((s, t) => s + t.metrics!.hedgeCount, 0);
  const lat = answered.map((t) => t.metrics!.latencyMs).filter((x): x is number => x !== null);
  let eye = mean(answered.map((t) => t.metrics!.eyeContact).filter((x): x is number => x !== null));
  if (eye === null) {
    const stats = events.filter((e) => e.type === "presence_stats");
    const facing = stats.reduce((s, e) => s + Number(e.detail?.facing ?? 0), 0);
    const total = stats.reduce((s, e) => s + Number(e.detail?.frames ?? 0), 0);
    if (total > 30) eye = facing / total;
  }
  const mains = turns.filter((t) => t.kind === "main" && t.analysis);
  const completeness = mean(
    mains.map((m) => {
      const q = questionScore(turns, m.seq);
      return q ? STARR_KEYS.filter((k) => q.starr[k] >= 2).length / 5 : 0;
    }),
  ) ?? 0;
  const avgWpm = mean(wpms);
  const fillerRate = words > 0 ? (fillers / words) * 100 : null;
  const hedgeRate = words > 0 ? (hedges / words) * 100 : null;
  const round1 = (x: number | null) => (x === null ? null : Math.round(x * 10) / 10);
  return {
    avgWpm: avgWpm === null ? null : Math.round(avgWpm),
    fillerRate: round1(fillerRate),
    hedgeRate: round1(hedgeRate),
    avgLatencyMs: lat.length ? Math.round(mean(lat)!) : null,
    eyeContact: eye === null ? null : Math.round(eye * 100) / 100,
    confidenceScore: deliveryConfidence({ avgWpm, fillerRate, hedgeRate, eyeContact: eye, completeness }),
    voiceShare: answered.length ? Math.round((answered.filter((t) => t.metrics!.mode === "voice").length / answered.length) * 100) / 100 : 0,
  };
}
