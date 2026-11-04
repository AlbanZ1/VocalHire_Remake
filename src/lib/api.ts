// Typed client for the `interview` edge function.
import { supabase } from "./supabase";
import { INTERVIEW_FUNCTION, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/config";
import type { QuestionView, SubmitResult } from "../../supabase/functions/_shared/orchestrator.ts";
import type {
  IntegrityEventInput,
  IntegritySettings,
  InterviewConfig,
  InterviewPlan,
  SessionReport,
  SpeechMetrics,
  TurnRow,
} from "../../supabase/functions/_shared/types.ts";

export type { QuestionView, SubmitResult };

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export interface PublicSession {
  id: string;
  mode: "practice" | "business";
  status: "created" | "in_progress" | "completed" | "abandoned";
  roleTitle: string;
  candidateName: string | null;
  startedAt: string | null;
  completedAt: string | null;
  engine: "claude" | "heuristic";
  config: {
    persona: InterviewConfig["persona"];
    style: InterviewConfig["style"];
    difficulty: InterviewConfig["difficulty"];
    seniority: InterviewConfig["seniority"];
    minMainQuestions: number;
    maxMainQuestions: number;
    timeLimitMinutes: number | null;
    showLiveFeedback: boolean;
    includeIntro: boolean;
    companyName: string | null;
    integrity: IntegritySettings;
  };
  monitored: string[];
}

export interface CampaignInfo {
  open: boolean;
  title: string;
  company: string;
  department: string | null;
  location: string | null;
  description: string | null;
  estimatedMinutes: number;
  questions: { min: number; max: number };
  persona: InterviewConfig["persona"];
  integrity: IntegritySettings;
  monitored: string[];
  timeLimitMinutes: number | null;
}

export type ReportTurn = Pick<
  TurnRow,
  "seq" | "kind" | "parent_seq" | "competency" | "question" | "preface" | "answer" | "answer_mode" | "metrics" | "analysis" | "score" | "flags"
>;

export interface ReportResponse {
  session: PublicSession;
  report: SessionReport | null;
  plan?: InterviewPlan | null;
  turns?: ReportTurn[];
}

async function call<T>(action: string, body: Record<string, unknown> = {}, opts: { keepalive?: boolean } = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const bearer = data.session?.access_token ?? SUPABASE_PUBLISHABLE_KEY;
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/${INTERVIEW_FUNCTION}`, {
      method: "POST",
      keepalive: opts.keepalive,
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${bearer}`,
      },
      body: JSON.stringify({ action, ...body }),
    });
  } catch {
    throw new ApiError(0, "network", "We couldn't reach VocalHire. Check your connection and try again.");
  }
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON error */
  }
  if (!res.ok) {
    const err = (json as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(res.status, err?.code ?? "error", err?.message ?? "Something went wrong. Please try again.");
  }
  return json as T;
}

export interface PracticeConfigInput {
  roleTitle: string;
  seniority?: InterviewConfig["seniority"];
  style?: InterviewConfig["style"];
  persona?: InterviewConfig["persona"];
  difficulty?: InterviewConfig["difficulty"];
  minMainQuestions?: number;
  maxMainQuestions?: number;
  includeIntro?: boolean;
  jobDescription?: string;
  resumeSummary?: string;
  companyName?: string;
  focusCompetencies?: string[];
  fixedFirstQuestion?: string;
  maxFollowUps?: number;
  showLiveFeedback?: boolean;
  integrity?: IntegritySettings;
}

export const api = {
  engine: () => call<{ engine: "claude" | "heuristic"; model: string | null }>("engine"),
  createPractice: (config: PracticeConfigInput) => call<{ sessionId: string; token: string }>("create_practice", { config }),
  campaignInfo: (token: string) => call<CampaignInfo>("campaign_info", { token }),
  createCampaignSession: (token: string, name: string, email: string, consent: boolean) =>
    call<{ sessionId: string; token: string }>("create_campaign_session", { token, name, email, consent }),
  state: (sessionId: string, token?: string) => call<{ session: PublicSession; question: QuestionView | null }>("state", { sessionId, token }),
  begin: (sessionId: string, token?: string) =>
    call<{ session: PublicSession; question?: QuestionView; done?: true }>("begin", { sessionId, token }),
  answer: (sessionId: string, token: string | undefined, seq: number, answer: string, mode: "voice" | "text", metrics: Partial<SpeechMetrics>) =>
    call<SubmitResult>("answer", { sessionId, token, seq, answer, mode, metrics }),
  events: (sessionId: string, token: string | undefined, events: IntegrityEventInput[], keepalive = false) =>
    call<{ stored: number }>("events", { sessionId, token, events }, { keepalive }),
  end: (sessionId: string, token?: string, reason?: "time_limit") => call<SubmitResult>("end", { sessionId, token, reason }),
  report: (sessionId: string, token?: string) => call<ReportResponse>("report", { sessionId, token }),
  claim: (sessions: { id: string; token: string }[]) => call<{ claimed: number }>("claim", { sessions }),
};
