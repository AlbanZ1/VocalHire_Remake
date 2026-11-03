import type { InterviewStore } from "../../supabase/functions/_shared/orchestrator.ts";
import type { IntegrityEventRow, InterviewConfig, SessionMode, SessionRow, TurnRow } from "../../supabase/functions/_shared/types.ts";
import { normalizeConfig } from "../../supabase/functions/_shared/engine.ts";

export class MemoryStore implements InterviewStore {
  sessions = new Map<string, SessionRow>();
  turns: TurnRow[] = [];
  events: IntegrityEventRow[] = [];
  private n = 0;
  constructor(private clock: () => number = Date.now) {}

  async getSession(id: string) {
    const s = this.sessions.get(id);
    return s ? structuredClone(s) : null;
  }
  async updateSession(id: string, patch: Record<string, unknown>) {
    const s = this.sessions.get(id);
    if (!s) throw new Error("no session");
    this.sessions.set(id, structuredClone({ ...s, ...patch }) as SessionRow);
  }
  async listTurns(sessionId: string) {
    return structuredClone(this.turns.filter((t) => t.session_id === sessionId).sort((a, b) => a.seq - b.seq));
  }
  async insertTurn(row: Omit<TurnRow, "id" | "asked_at">) {
    if (this.turns.some((t) => t.session_id === row.session_id && t.seq === row.seq)) throw new Error("duplicate seq");
    const t: TurnRow = { ...structuredClone(row), id: `t${++this.n}`, asked_at: new Date(this.clock()).toISOString() };
    this.turns.push(t);
    return structuredClone(t);
  }
  async updateTurn(id: string, patch: Partial<TurnRow>) {
    const i = this.turns.findIndex((t) => t.id === id);
    this.turns[i] = structuredClone({ ...this.turns[i], ...patch });
  }
  async insertEvents(rows: IntegrityEventRow[]) {
    for (const r of rows) this.events.push({ ...structuredClone(r), created_at: r.created_at ?? new Date(this.clock()).toISOString() });
  }
  async listEvents(sessionId: string) {
    return structuredClone(this.events.filter((e) => e.session_id === sessionId));
  }
  async countEvents(sessionId: string) {
    return this.events.filter((e) => e.session_id === sessionId).length;
  }

  addSession(partial: { mode?: SessionMode; config?: Partial<InterviewConfig> & { roleTitle: string }; plan?: SessionRow["plan"] } = {}): SessionRow {
    const mode = partial.mode ?? "practice";
    const config = normalizeConfig(partial.config ?? { roleTitle: "Software Engineer" }, mode);
    const s: SessionRow = {
      id: `s${++this.n}`,
      mode,
      user_id: null,
      org_id: null,
      campaign_id: null,
      candidate_name: null,
      candidate_email: null,
      role_title: config.roleTitle,
      config,
      plan: partial.plan ?? null,
      state: null,
      status: "created",
      engine: null,
      started_at: null,
      completed_at: null,
      overall_score: null,
      integrity_score: null,
      integrity_level: null,
      recommendation: null,
      starr_scores: null,
      competency_scores: null,
      report: null,
      created_at: new Date(this.clock()).toISOString(),
    };
    this.sessions.set(s.id, s);
    return structuredClone(s);
  }
}

export const STRONG_ANSWER =
  "At my previous company, a fintech startup in Berlin, our checkout service was failing for about 8% of users during peak hours in March 2023. " +
  "My responsibility was to lead the investigation and get the failure rate under 1% before our Black Friday campaign. " +
  "I first pulled the error logs and grouped failures by region, then I identified that a third-party fraud API was timing out. " +
  "I proposed adding a circuit breaker and a cached fallback, because blocking every checkout was worse than a slightly higher fraud risk. " +
  "I wrote the design doc, I paired with our SRE to implement it, and I set up a dashboard to track it. " +
  "As a result, failures dropped from 8% to 0.4% within two weeks and we processed 30% more orders than the previous Black Friday. " +
  "I learned to look at dependencies first, and since then I always add timeouts and fallbacks to every external call I design.";

export const WEAK_ANSWER = "We worked as a team and it went well. Everyone did their part and in the end the client was fine.";

export const SCRIPTED_ANSWER =
  "Situation: In today's fast-paced environment, I spearheaded a cross-functional initiative to leverage synergies. " +
  "Task: My objective was to streamline processes and foster seamless stakeholder alignment. " +
  "Action: I proactively utilized best practices and leveraged innovative, robust solutions in a holistic manner. " +
  "Result: This resulted in impactful, actionable insights and improved outcomes across the organization. " +
  "Reflection: Key learnings included the importance of being results-driven and detail-oriented.";
