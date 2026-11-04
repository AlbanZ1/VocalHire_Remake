// VocalHire interview API (Supabase Edge Function).
//
// One endpoint, JSON body `{ action, ... }`. Callers are authenticated either by a Supabase user
// JWT (signed-in practice users) or by a per-session secret token (guests and job applicants).
// All interview writes happen here with the service role; the browser can never write scores.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Interview, InterviewError, planSession } from "../_shared/orchestrator.ts";
import { heuristicAI, withFallback, type InterviewAI } from "../_shared/ai.ts";
import { createClaudeAI, DEFAULT_MODEL, DEFAULT_TURN_MODEL } from "../_shared/llm.ts";
import { integrityPreset, normalizeConfig } from "../_shared/engine.ts";
import { sanitizeShortText } from "../_shared/guardrails.ts";
import { monitoredSignals } from "../_shared/integrity.ts";
import { MAX_CV_CHARS, MAX_JOB_CHARS, cleanDocumentText, sanitizePersonName, stripInjection } from "../_shared/documents.ts";
import type { CvProfile, CvReview, InterviewConfig, InterviewPlan, IntegritySettings, JobProfile, SessionRow } from "../_shared/types.ts";
import { SupabaseStore } from "./store.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const MAX_BODY_BYTES = 192 * 1024; // room for a CV (20k chars) plus a job posting (15k chars) in any script
// Abuse / cost protection. Applicant limits are per campaign so that many genuine applicants
// behind one office or campus network are not blocked by each other's practice sessions.
const RATE_MULTIPLIER = Math.max(1, Number(Deno.env.get("VOCALHIRE_RATE_LIMIT_MULTIPLIER") ?? 1) || 1);
const GUEST_SESSIONS_PER_HOUR = 15 * RATE_MULTIPLIER;
const USER_SESSIONS_PER_HOUR = 30 * RATE_MULTIPLIER;
const APPLICANT_SESSIONS_PER_CAMPAIGN_PER_HOUR = 25 * RATE_MULTIPLIER;
const ANY_SESSIONS_PER_IP_PER_HOUR = 60 * RATE_MULTIPLIER;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

// ---------------------------------------------------------------------------------------------
// AI engine selection
// ---------------------------------------------------------------------------------------------
type Effort = "low" | "medium" | "high" | "xhigh" | "max";
const EFFORTS = ["low", "medium", "high", "xhigh", "max"];
function effortEnv(name: string, dflt: Effort): Effort {
  const v = Deno.env.get(name);
  return v && EFFORTS.includes(v) ? (v as Effort) : dflt;
}

function makeAI(): InterviewAI {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return heuristicAI;
  return withFallback(
    createClaudeAI({
      apiKey: key,
      model: Deno.env.get("VOCALHIRE_MODEL") || DEFAULT_MODEL,
      turnModel: Deno.env.get("VOCALHIRE_TURN_MODEL") || DEFAULT_TURN_MODEL,
      baseURL: Deno.env.get("VOCALHIRE_ANTHROPIC_BASE_URL") || undefined,
      useFallbacks: Deno.env.get("VOCALHIRE_DISABLE_FALLBACKS") !== "1",
      turnEffort: effortEnv("VOCALHIRE_TURN_EFFORT", "low"),
      reportEffort: effortEnv("VOCALHIRE_REPORT_EFFORT", "medium"),
      reviewEffort: effortEnv("VOCALHIRE_REVIEW_EFFORT", "medium"),
    }),
    (stage, err) => console.error(`[claude:${stage}] falling back to heuristic engine:`, err instanceof Error ? err.message : err),
  );
}
const ai = makeAI();
const interview = new Interview(new SupabaseStore(admin), ai);

// ---------------------------------------------------------------------------------------------
// Documents (CV / job posting): rate limits, cache, preparation, background work
// ---------------------------------------------------------------------------------------------
async function rateLimit(key: string, action: string, limit: number) {
  const { count } = await admin.from("api_rate_events").select("id", { count: "exact", head: true }).eq("key", key).eq("action", action).gte("created_at", new Date(Date.now() - 3600_000).toISOString());
  if ((count ?? 0) >= limit * RATE_MULTIPLIER) throw new HttpError(429, "rate_limited", "You've done this a lot in the last hour. Please try again a little later.");
  await admin.from("api_rate_events").insert({ key, action });
  if (Math.random() < 0.02) {
    const old = new Date(Date.now() - 2 * 86400_000).toISOString();
    await admin.from("api_rate_events").delete().lt("created_at", old);
    await admin.from("document_analyses").delete().lt("created_at", new Date(Date.now() - ANALYSIS_TTL_MS).toISOString());
  }
}

/** How long a document read by the AI is reused (keyed by its exact text, so an edited CV is read fresh). */
const ANALYSIS_TTL_MS = 30 * 86400_000;

/** Model-generated analyses are cached for 30 days by input hash (heuristic results are cheap: not cached). */
async function cached<T extends { source?: string; engine?: string }>(kind: "documents" | "review" | "job", parts: string[], compute: () => Promise<T>): Promise<T> {
  if (ai.name !== "claude") return compute();
  const hash = await sha256([kind, "v1", ...parts].join("\u0000"));
  const { data } = await admin.from("document_analyses").select("result, created_at").eq("hash", hash).maybeSingle();
  if (data && Date.parse(data.created_at) > Date.now() - ANALYSIS_TTL_MS) return data.result as T;
  const result = await compute();
  if ((result.source ?? result.engine) === "claude") {
    await admin.from("document_analyses").upsert({ hash, kind, result, engine: "claude", created_at: new Date().toISOString() });
  }
  return result;
}

interface PreparedDocs {
  cvText: string;
  jobText: string;
  removed: string[];
  cv: CvProfile | null;
  job: JobProfile | null;
}

async function prepareDocuments(cvRaw: unknown, jobRaw: unknown): Promise<PreparedDocs> {
  const cvStripped = stripInjection(cleanDocumentText(cvRaw, MAX_CV_CHARS));
  const jobStripped = stripInjection(cleanDocumentText(jobRaw, MAX_JOB_CHARS));
  const cvText = cvStripped.text;
  const jobText = jobStripped.text;
  if (cvText && cvText.length < 80) throw new HttpError(400, "invalid", "That CV looks too short — please upload the full document or paste more of it.");
  // The CV and the posting are read separately and cached by their own text, so a document
  // read on the setup page (or by another session) is reused instead of being read again.
  const [cv, job] = await Promise.all([cvText ? analyzeCv(cvText) : null, jobText ? analyzeJob(jobText) : null]);
  return { cvText, jobText, removed: [...cvStripped.removed, ...jobStripped.removed], cv, job };
}

async function analyzeCv(cvText: string): Promise<CvProfile | null> {
  const r = await cached("documents", ["cv", cvText], async () => {
    const out = await ai.analyzeDocuments({ cvText, jobText: "" });
    return { cv: out.cv, source: out.cv?.source ?? "heuristic" };
  });
  return r.cv;
}

async function analyzeJob(jobText: string): Promise<JobProfile | null> {
  return (await cached("job", [jobText], async () => {
    const r = await ai.analyzeDocuments({ cvText: "", jobText });
    return { ...(r.job as JobProfile), source: r.job?.source ?? "heuristic" };
  })) as JobProfile;
}

async function runReview(d: PreparedDocs): Promise<CvReview> {
  if (!d.cv) throw new HttpError(400, "invalid", "Please add your CV first.");
  return cached("review", [d.cvText, d.jobText], () => ai.reviewCv({ cvText: d.cvText, jobText: d.jobText, cv: d.cv!, job: d.job, injectionDetected: d.removed.length > 0 }));
}

/** Run work after responding when the runtime supports it (Supabase EdgeRuntime.waitUntil). */
async function background(p: Promise<unknown>) {
  const rt = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  const safe = p.catch((e) => console.error("[background]", e instanceof Error ? e.message : e));
  if (rt?.waitUntil) rt.waitUntil(safe);
  else await safe;
}

async function callerKey(req: Request): Promise<{ key: string; userId: string | null }> {
  const user = await currentUser(req);
  return user ? { key: `u:${user.id}`, userId: user.id } : { key: `ip:${await ipHash(req)}`, userId: null };
}

// ---------------------------------------------------------------------------------------------
// Crypto helpers
// ---------------------------------------------------------------------------------------------
async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function ipHash(req: Request): Promise<string> {
  const ip = (req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip") ?? "unknown").split(",")[0].trim();
  return sha256(`${Deno.env.get("VOCALHIRE_IP_SALT") ?? SUPABASE_URL}:${ip}`);
}

// ---------------------------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------------------------
async function currentUser(req: Request): Promise<{ id: string; email?: string } | null> {
  const auth = req.headers.get("Authorization") ?? "";
  const jwt = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (jwt.split(".").length !== 3) return null; // publishable keys are not JWTs
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? undefined };
}

type Access = "owner" | "token" | "org";

async function authorize(req: Request, session: SessionRow, token: unknown): Promise<Access | null> {
  if (typeof token === "string" && token.length >= 20 && token.length <= 100) {
    const { data } = await admin.from("interview_session_secrets").select("access_token_hash").eq("session_id", session.id).maybeSingle();
    if (data && timingSafeEqual(data.access_token_hash, await sha256(token))) return "token";
  }
  const user = await currentUser(req);
  if (!user) return null;
  if (session.user_id && session.user_id === user.id) return "owner";
  if (session.org_id) {
    const { data } = await admin.from("organization_members").select("user_id").eq("org_id", session.org_id).eq("user_id", user.id).maybeSingle();
    if (data) return "org";
  }
  return null;
}

async function loadAuthorized(req: Request, body: Record<string, unknown>, allowed: Access[]): Promise<{ session: SessionRow; access: Access }> {
  const id = String(body.sessionId ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(400, "invalid", "Missing or invalid session id.");
  const session = await interview.load(id).catch((e) => {
    if (e instanceof InterviewError) throw new HttpError(404, "not_found", "Interview not found.");
    throw e;
  });
  const access = await authorize(req, session, body.token);
  if (!access || !allowed.includes(access)) throw new HttpError(403, "forbidden", "You don't have access to this interview.");
  return { session, access };
}

// ---------------------------------------------------------------------------------------------
// Rate limits
// ---------------------------------------------------------------------------------------------
const hourAgo = () => new Date(Date.now() - 3600_000).toISOString();

async function enforceIpLimit(ipH: string, scope: { campaignId: string | null }, limit: number) {
  const since = hourAgo();
  const scoped = admin.from("interview_session_secrets").select("session_id", { count: "exact", head: true }).eq("client_ip_hash", ipH).gte("created_at", since);
  const [{ count: scopedCount }, { count: anyCount }] = await Promise.all([
    scope.campaignId ? scoped.eq("campaign_id", scope.campaignId) : scoped.is("campaign_id", null),
    admin.from("interview_session_secrets").select("session_id", { count: "exact", head: true }).eq("client_ip_hash", ipH).gte("created_at", since),
  ]);
  if ((scopedCount ?? 0) >= limit || (anyCount ?? 0) >= ANY_SESSIONS_PER_IP_PER_HOUR) {
    throw new HttpError(429, "rate_limited", "Too many interviews started from this network. Please try again in an hour.");
  }
}

async function enforceUserLimit(userId: string) {
  const { count } = await admin
    .from("interview_sessions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", hourAgo());
  if ((count ?? 0) >= USER_SESSIONS_PER_HOUR) throw new HttpError(429, "rate_limited", "You've started a lot of interviews in the last hour. Take a short break and try again soon.");
}

// ---------------------------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------------------------
interface CampaignSettings {
  persona?: InterviewConfig["persona"];
  difficulty?: InterviewConfig["difficulty"];
  style?: InterviewConfig["style"];
  minMainQuestions?: number;
  maxMainQuestions?: number;
  maxFollowUps?: number;
  timeLimitMinutes?: number | null;
  integrity?: Partial<IntegritySettings> & { level?: IntegritySettings["level"] };
  plan?: InterviewPlan;
  /** Ask applicants for a CV: off / optional / required (default optional). */
  cvRequirement?: "off" | "optional" | "required";
  /** Job profile frozen at the first applicant (analysed once per campaign). */
  jobProfile?: JobProfile;
}

interface CampaignRow {
  id: string;
  org_id: string;
  title: string;
  description: string | null;
  department: string | null;
  location: string | null;
  seniority: InterviewConfig["seniority"];
  competencies: string[];
  settings: CampaignSettings;
  status: "draft" | "active" | "closed";
  closes_at: string | null;
  organizations: { name: string } | null;
}

async function loadCampaign(token: unknown): Promise<CampaignRow> {
  if (typeof token !== "string" || !/^[0-9a-f]{16,64}$/i.test(token)) throw new HttpError(404, "not_found", "This interview link is not valid.");
  const { data, error } = await admin
    .from("campaigns")
    .select("id, org_id, title, description, department, location, seniority, competencies, settings, status, closes_at, organizations(name)")
    .eq("public_token", token)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, "not_found", "This interview link is not valid.");
  return data as unknown as CampaignRow;
}

function campaignIsOpen(c: CampaignRow): boolean {
  return c.status === "active" && (!c.closes_at || Date.parse(c.closes_at) > Date.now());
}

function campaignConfig(c: CampaignRow): InterviewConfig {
  const s = c.settings ?? {};
  const level = s.integrity?.level ?? "standard";
  const preset = integrityPreset(level);
  return normalizeConfig(
    {
      roleTitle: c.title,
      seniority: c.seniority,
      style: s.style,
      persona: s.persona ?? "neutral",
      difficulty: s.difficulty,
      minMainQuestions: s.minMainQuestions,
      maxMainQuestions: s.maxMainQuestions,
      maxFollowUps: s.maxFollowUps,
      timeLimitMinutes: s.timeLimitMinutes ?? null,
      jobDescription: c.description,
      companyName: c.organizations?.name ?? null,
      focusCompetencies: c.competencies ?? [],
      includeIntro: true,
      integrity: { ...preset, ...(s.integrity ?? {}), level } as IntegritySettings,
    },
    "business",
  );
}

/** Competencies are frozen per campaign so every applicant is assessed on the same criteria. */
/** Job profile and competencies are frozen per campaign so every applicant is assessed the same way. */
async function campaignPrep(c: CampaignRow, config: InterviewConfig): Promise<{ plan: InterviewPlan; job: JobProfile | null }> {
  const s = c.settings ?? {};
  let job: JobProfile | null = s.jobProfile ?? null;
  let plan = s.plan?.competencies?.length ? { competencies: s.plan.competencies } : null;
  if ((job || !c.description) && plan) return { plan: { ...plan, openingQuestion: null }, job };
  if (!job && c.description) {
    const jobText = stripInjection(cleanDocumentText(c.description, MAX_JOB_CHARS)).text;
    job = await analyzeJob(jobText);
  }
  // The campaign's own title and company are authoritative over anything read from the posting.
  if (job) job = { ...job, title: c.title || job.title, company: config.companyName || job.company };
  if (!plan) plan = { competencies: (await planSession(ai, config, "business", { job })).competencies };
  await admin.from("campaigns").update({ settings: { ...s, plan, ...(job ? { jobProfile: job } : {}) } }).eq("id", c.id);
  return { plan: { ...plan, openingQuestion: null }, job };
}

function estimateMinutes(config: InterviewConfig): number {
  return Math.round(config.minMainQuestions * 3.5 + 3);
}

// ---------------------------------------------------------------------------------------------
// Session views
// ---------------------------------------------------------------------------------------------
function publicSession(s: SessionRow) {
  const c = s.config;
  return {
    id: s.id,
    mode: s.mode,
    status: s.status,
    roleTitle: s.role_title,
    candidateName: s.candidate_name,
    startedAt: s.started_at,
    completedAt: s.completed_at,
    engine: ai.name,
    config: {
      persona: c.persona,
      style: c.style,
      difficulty: c.difficulty,
      seniority: c.seniority,
      minMainQuestions: c.minMainQuestions,
      maxMainQuestions: c.maxMainQuestions,
      timeLimitMinutes: c.timeLimitMinutes,
      showLiveFeedback: c.showLiveFeedback,
      includeIntro: c.includeIntro,
      companyName: c.companyName,
      integrity: c.integrity,
    },
    monitored: monitoredSignals(c.integrity),
  };
}

// ---------------------------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------------------------
type Handler = (req: Request, body: Record<string, unknown>) => Promise<unknown>;

const actions: Record<string, Handler> = {
  async engine() {
    return {
      engine: ai.name,
      model: ai.name === "claude" ? Deno.env.get("VOCALHIRE_MODEL") || DEFAULT_MODEL : null,
      turnModel: ai.name === "claude" ? Deno.env.get("VOCALHIRE_TURN_MODEL") || DEFAULT_TURN_MODEL : null,
    };
  },

  async create_practice(req, body) {
    const user = await currentUser(req);
    const raw = (body.config ?? {}) as Partial<InterviewConfig>;
    const roleTitle = sanitizeShortText(raw.roleTitle, 120);
    if (roleTitle.length < 2) throw new HttpError(400, "invalid", "Please enter the role you're practising for.");
    const ipH = await ipHash(req);
    if (user) await enforceUserLimit(user.id);
    else await enforceIpLimit(ipH, { campaignId: null }, GUEST_SESSIONS_PER_HOUR);
    const docs = await prepareDocuments(body.cvText, raw.jobDescription);
    const config = normalizeConfig(
      {
        ...raw,
        roleTitle,
        jobDescription: docs.jobText || null,
        candidateName: sanitizePersonName(raw.candidateName) ?? docs.cv?.name ?? null,
        companyName: sanitizeShortText(raw.companyName ?? "", 120) || docs.job?.company || null,
      },
      "practice",
    );
    const plan = await planSession(ai, config, "practice", { cv: docs.cv, job: docs.job });
    const { data, error } = await admin
      .from("interview_sessions")
      .insert({
        mode: "practice",
        user_id: user?.id ?? null,
        role_title: config.roleTitle,
        config,
        plan,
        status: "created",
        engine: ai.name,
        candidate_cv: docs.cvText || null,
        cv_profile: docs.cv,
        job_profile: docs.job,
      })
      .select("id")
      .single();
    if (error) throw error;
    const token = newToken();
    const { error: e2 } = await admin.from("interview_session_secrets").insert({ session_id: data.id, access_token_hash: await sha256(token), client_ip_hash: ipH });
    if (e2) throw e2;
    return { sessionId: data.id, token };
  },

  async campaign_info(_req, body) {
    const c = await loadCampaign(body.token);
    const config = campaignConfig(c);
    return {
      open: campaignIsOpen(c),
      title: c.title,
      company: c.organizations?.name ?? "",
      department: c.department,
      location: c.location,
      description: c.description ? c.description.slice(0, 1500) : null,
      estimatedMinutes: estimateMinutes(config),
      questions: { min: config.minMainQuestions, max: config.maxMainQuestions },
      persona: config.persona,
      integrity: config.integrity,
      monitored: monitoredSignals(config.integrity),
      timeLimitMinutes: config.timeLimitMinutes,
      cvRequirement: c.settings?.cvRequirement ?? "optional",
    };
  },

  async create_campaign_session(req, body) {
    const c = await loadCampaign(body.token);
    if (!campaignIsOpen(c)) throw new HttpError(410, "closed", "This interview is no longer accepting applicants.");
    if (body.consent !== true) throw new HttpError(400, "consent_required", "Please review and accept how this interview works before starting.");
    const name = sanitizeShortText(body.name, 120);
    const email = sanitizeShortText(body.email, 254).toLowerCase();
    if (name.length < 2) throw new HttpError(400, "invalid", "Please enter your full name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new HttpError(400, "invalid", "Please enter a valid email address.");
    const ipH = await ipHash(req);
    await enforceIpLimit(ipH, { campaignId: c.id }, APPLICANT_SESSIONS_PER_CAMPAIGN_PER_HOUR);

    const { data: prior } = await admin
      .from("interview_sessions")
      .select("id, status")
      .eq("campaign_id", c.id)
      .eq("candidate_email", email)
      .in("status", ["in_progress", "completed"])
      .limit(1);
    if (prior && prior.length) {
      throw new HttpError(409, "already_taken", "An interview for this position has already been started with this email address. Please contact the hiring team if you need help.");
    }

    const cvRequirement = c.settings?.cvRequirement ?? "optional";
    const cvRaw = cvRequirement === "off" ? "" : body.cvText;
    if (cvRequirement === "required" && !String(cvRaw ?? "").trim()) throw new HttpError(400, "cv_required", "Please add your CV to start this interview.");
    const docs = await prepareDocuments(cvRaw, "");
    const config = { ...campaignConfig(c), candidateName: sanitizePersonName(name) };
    const { plan, job } = await campaignPrep(c, config);
    const { data, error } = await admin
      .from("interview_sessions")
      .insert({
        mode: "business",
        org_id: c.org_id,
        campaign_id: c.id,
        candidate_name: name,
        candidate_email: email,
        role_title: config.roleTitle,
        config,
        plan,
        status: "created",
        engine: ai.name,
        consent_at: new Date().toISOString(),
        candidate_cv: docs.cvText || null,
        cv_profile: docs.cv,
        job_profile: job,
      })
      .select("id")
      .single();
    if (error) throw error;
    if (docs.removed.length) {
      await admin.from("integrity_events").insert({ session_id: data.id, type: "cv_prompt_injection", severity: 3, detail: { excerpts: docs.removed.slice(0, 3) } });
    }
    if (docs.cv) {
      // CV-vs-job fit for the hiring team, computed after responding.
      const jobText = c.description ? stripInjection(cleanDocumentText(c.description, MAX_JOB_CHARS)).text : "";
      await background(
        runReview({ ...docs, jobText, job }).then((review) => admin.from("interview_sessions").update({ cv_review: review }).eq("id", data.id)),
      );
    }
    const token = newToken();
    const { error: e2 } = await admin
      .from("interview_session_secrets")
      .insert({ session_id: data.id, access_token_hash: await sha256(token), client_ip_hash: ipH, campaign_id: c.id });
    if (e2) throw e2;
    return { sessionId: data.id, token };
  },

  async state(req, body) {
    const { session } = await loadAuthorized(req, body, ["owner", "token"]);
    if (await interview.recover(session)) return { session: publicSession(await interview.load(session.id)), question: null };
    return { session: publicSession(session), question: interview.current(session) };
  },

  async begin(req, body) {
    const { session } = await loadAuthorized(req, body, ["owner", "token"]);
    const r = await interview.begin(session);
    const fresh = await interview.load(session.id);
    return { session: publicSession(fresh), ...("question" in r ? { question: r.question } : { done: true }) };
  },

  async answer(req, body) {
    const { session } = await loadAuthorized(req, body, ["owner", "token"]);
    const answer = typeof body.answer === "string" ? body.answer : "";
    if (answer.length > 20_000) throw new HttpError(413, "too_long", "That answer is too long.");
    return interview.submitAnswer(session, {
      seq: Number(body.seq),
      answer,
      mode: body.mode === "text" ? "text" : "voice",
      metrics: (body.metrics ?? null) as never,
    });
  },

  async events(req, body) {
    const { session } = await loadAuthorized(req, body, ["owner", "token"]);
    const stored = await interview.recordEvents(session, Array.isArray(body.events) ? (body.events as never[]) : []);
    return { stored };
  },

  async end(req, body) {
    const { session } = await loadAuthorized(req, body, ["owner", "token"]);
    const reason = body.reason === "time_limit" ? "time_limit" : "ended_by_candidate";
    return interview.end(session, reason);
  },

  async report(req, body) {
    const { session, access } = await loadAuthorized(req, body, ["owner", "token", "org"]);
    if (session.mode === "business" && access === "token") {
      // Applicants never see their scores; the hiring team does.
      return { session: publicSession(session), report: null };
    }
    const { data: turns } = await admin
      .from("interview_turns")
      .select("seq, kind, parent_seq, competency, question, preface, answer, answer_mode, metrics, analysis, score, flags")
      .eq("session_id", session.id)
      .order("seq");
    return { session: publicSession(session), report: session.report, plan: session.plan, turns: turns ?? [], hasCv: !!session.cv_profile };
  },

  async claim(req, body) {
    const user = await currentUser(req);
    if (!user) throw new HttpError(401, "unauthenticated", "Sign in to save your practice history.");
    const items = Array.isArray(body.sessions) ? body.sessions.slice(0, 50) : [];
    let claimed = 0;
    for (const item of items as { id?: unknown; token?: unknown }[]) {
      const id = String(item?.id ?? "");
      if (!/^[0-9a-f-]{36}$/i.test(id) || typeof item.token !== "string") continue;
      const { data: sec } = await admin.from("interview_session_secrets").select("access_token_hash").eq("session_id", id).maybeSingle();
      if (!sec || !timingSafeEqual(sec.access_token_hash, await sha256(item.token))) continue;
      const { data } = await admin
        .from("interview_sessions")
        .update({ user_id: user.id })
        .eq("id", id)
        .eq("mode", "practice")
        .is("user_id", null)
        .select("id");
      claimed += data?.length ?? 0;
    }
    let reviews = 0;
    for (const item of (Array.isArray(body.reviews) ? body.reviews.slice(0, 50) : []) as { id?: unknown; token?: unknown }[]) {
      const id = String(item?.id ?? "");
      if (!/^[0-9a-f-]{36}$/i.test(id) || typeof item.token !== "string") continue;
      const { data } = await admin.from("cv_reviews").update({ user_id: user.id }).eq("id", id).eq("access_token_hash", await sha256(item.token)).is("user_id", null).select("id");
      reviews += data?.length ?? 0;
    }
    return { claimed, reviews };
  },

  async analyze_documents(req, body) {
    const { key } = await callerKey(req);
    await rateLimit(key, "analyze", 40);
    const docs = await prepareDocuments(body.cvText, body.jobText);
    return {
      cv: docs.cv,
      job: docs.job,
      warnings: docs.removed.length ? ["Some text in your document looked like instructions to an AI system, so it was ignored."] : [],
    };
  },

  async review_cv(req, body) {
    const { key, userId } = await callerKey(req);
    await rateLimit(key, "review", userId ? 25 : 10);
    let cvRaw: unknown = body.cvText;
    let jobRaw: unknown = body.jobText;
    if (body.sessionId) {
      const { session } = await loadAuthorized(req, body, ["owner", "token"]);
      if (session.mode !== "practice") throw new HttpError(403, "forbidden", "CV reviews are only available for practice interviews.");
      const { data } = await admin.from("interview_sessions").select("candidate_cv").eq("id", session.id).single();
      cvRaw = data?.candidate_cv ?? "";
      jobRaw = session.config.jobDescription ?? "";
    }
    const docs = await prepareDocuments(cvRaw, jobRaw);
    const review = await runReview(docs);
    const token = newToken();
    const { data, error } = await admin
      .from("cv_reviews")
      .insert({
        user_id: userId,
        role_title: review.roleTitle,
        company: review.company,
        match_score: review.matchScore,
        quality_score: review.qualityScore,
        result: review,
        engine: review.engine,
        access_token_hash: await sha256(token),
        client_ip_hash: await ipHash(req),
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: data.id, token, review };
  },

  async get_cv_review(req, body) {
    const id = String(body.id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(400, "invalid", "Invalid review id.");
    const { data } = await admin.from("cv_reviews").select("id, user_id, result, created_at, access_token_hash").eq("id", id).maybeSingle();
    if (!data) throw new HttpError(404, "not_found", "Review not found.");
    const byToken = typeof body.token === "string" && timingSafeEqual(data.access_token_hash, await sha256(body.token));
    const user = byToken ? null : await currentUser(req);
    if (!byToken && (!user || user.id !== data.user_id)) throw new HttpError(403, "forbidden", "You don't have access to this review.");
    return { id: data.id, review: data.result, createdAt: data.created_at };
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: { code: "method", message: "Use POST." } }, 405);
  try {
    const len = Number(req.headers.get("content-length") ?? 0);
    if (len > MAX_BODY_BYTES) throw new HttpError(413, "too_large", "Request too large.");
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) throw new HttpError(413, "too_large", "Request too large.");
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(text || "{}");
    } catch {
      throw new HttpError(400, "invalid_json", "Invalid JSON body.");
    }
    const handler = actions[String(body.action ?? "")];
    if (!handler) throw new HttpError(400, "unknown_action", "Unknown action.");
    return json(await handler(req, body));
  } catch (e) {
    if (e instanceof HttpError) return json({ error: { code: e.code, message: e.message } }, e.status);
    if (e instanceof InterviewError) {
      const status = { not_found: 404, conflict: 409, invalid: 400, finished: 409, forbidden: 403 }[e.code];
      return json({ error: { code: e.code, message: e.message } }, status);
    }
    console.error("[interview] unexpected error", e);
    return json({ error: { code: "server_error", message: "Something went wrong on our side. Please try again." } }, 500);
  }
});
