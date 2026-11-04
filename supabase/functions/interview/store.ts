// Supabase (service-role) implementation of the orchestrator's storage interface.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { InterviewStore } from "../_shared/orchestrator.ts";
import type { IntegrityEventRow, SessionRow, TurnRow } from "../_shared/types.ts";

const SESSION_COLUMNS =
  "id, mode, user_id, org_id, campaign_id, candidate_name, candidate_email, role_title, config, plan, state, cv_profile, job_profile, status, engine, started_at, completed_at, overall_score, integrity_score, integrity_level, recommendation, starr_scores, competency_scores, report, created_at";

const TURN_COLUMNS =
  "id, session_id, seq, kind, parent_seq, competency, question, preface, asked_at, answer, answer_mode, answered_at, metrics, analysis, score, flags";

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export class SupabaseStore implements InterviewStore {
  constructor(private db: SupabaseClient) {}

  async getSession(id: string): Promise<SessionRow | null> {
    const { data, error } = await this.db.from("interview_sessions").select(SESSION_COLUMNS).eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const row = data as unknown as SessionRow;
    return { ...row, overall_score: num(row.overall_score), integrity_score: num(row.integrity_score) };
  }

  async updateSession(id: string, patch: Record<string, unknown>): Promise<void> {
    const { error } = await this.db.from("interview_sessions").update(patch).eq("id", id);
    if (error) throw error;
  }

  async listTurns(sessionId: string): Promise<TurnRow[]> {
    const { data, error } = await this.db.from("interview_turns").select(TURN_COLUMNS).eq("session_id", sessionId).order("seq");
    if (error) throw error;
    return (data ?? []).map((t) => ({ ...(t as unknown as TurnRow), score: num((t as { score: unknown }).score) }));
  }

  async insertTurn(row: Omit<TurnRow, "id" | "asked_at">): Promise<TurnRow> {
    const { data, error } = await this.db.from("interview_turns").insert(row).select(TURN_COLUMNS).single();
    if (error) throw error;
    return data as unknown as TurnRow;
  }

  async updateTurn(id: string, patch: Partial<TurnRow>): Promise<void> {
    const { error } = await this.db.from("interview_turns").update(patch).eq("id", id);
    if (error) throw error;
  }

  async insertEvents(rows: IntegrityEventRow[]): Promise<void> {
    if (!rows.length) return;
    const { error } = await this.db.from("integrity_events").insert(
      rows.map((r) => ({ session_id: r.session_id, turn_seq: r.turn_seq, type: r.type, severity: r.severity, detail: r.detail, client_ts: r.client_ts })),
    );
    if (error) throw error;
  }

  async listEvents(sessionId: string): Promise<IntegrityEventRow[]> {
    const { data, error } = await this.db
      .from("integrity_events")
      .select("session_id, turn_seq, type, severity, detail, client_ts, created_at")
      .eq("session_id", sessionId)
      .order("created_at")
      .limit(5000);
    if (error) throw error;
    return (data ?? []) as IntegrityEventRow[];
  }

  async countEvents(sessionId: string): Promise<number> {
    const { count, error } = await this.db.from("integrity_events").select("id", { count: "exact", head: true }).eq("session_id", sessionId);
    if (error) throw error;
    return count ?? 0;
  }
}
