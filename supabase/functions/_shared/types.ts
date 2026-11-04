// Shared domain types for the VocalHire interview engine.
// Pure TypeScript: imported by the Deno edge function and by Node unit tests.

export type Seniority = "entry" | "junior" | "mid" | "senior" | "lead" | "executive";
export type InterviewStyle = "behavioral" | "situational" | "mixed";
export type Persona = "supportive" | "neutral" | "challenging";
export type Difficulty = "easy" | "standard" | "hard";
export type SessionMode = "practice" | "business";
export type SessionStatus = "created" | "in_progress" | "completed" | "abandoned";
export type StarrKey = "situation" | "task" | "action" | "result" | "reflection";
export type TurnKind = "intro" | "main" | "follow_up";
export type AnswerIntent = "answer" | "clarification" | "skip" | "off_topic" | "manipulation";
export type AnswerMode = "voice" | "text";
export type EngineName = "claude" | "heuristic";
export type IntegrityLevel = "clear" | "review" | "high_risk";
export type Recommendation = "strong_yes" | "yes" | "lean_no" | "no";

export interface Competency {
  key: string;
  name: string;
  description: string;
}

export interface IntegritySettings {
  /** off = no monitoring; standard = browser signals; strict = + camera, fullscreen, voice-only */
  level: "off" | "standard" | "strict";
  requireCamera: boolean;
  requireFullscreen: boolean;
  voiceOnly: boolean;
  blockPaste: boolean;
}

export interface InterviewConfig {
  roleTitle: string;
  seniority: Seniority;
  style: InterviewStyle;
  persona: Persona;
  difficulty: Difficulty;
  /** Core round size: the interview never ends before this many main questions. */
  minMainQuestions: number;
  /** Hard ceiling on main questions. */
  maxMainQuestions: number;
  /** Max probing follow-ups per main question. */
  maxFollowUps: number;
  /** How many extra main questions an extension round adds. */
  roundSize: number;
  /** Running-score "uncertainty band": a score inside it triggers another round. */
  decisionBand: { low: number; high: number };
  /** Evidence (0..1) each competency needs before the engine is confident. */
  evidenceTarget: number;
  includeIntro: boolean;
  showLiveFeedback: boolean;
  jobDescription?: string | null;
  resumeSummary?: string | null;
  companyName?: string | null;
  /** Candidate's name (first name is used by the interviewer). */
  candidateName?: string | null;
  focusCompetencies?: string[];
  /** Optional fixed first question (used by single-question drills). */
  fixedFirstQuestion?: string | null;
  integrity: IntegritySettings;
  timeLimitMinutes: number | null;
}

export interface StarrComponentScore {
  /** 0..4 */
  score: number;
  /** Verbatim quote from the answer ("" if absent). */
  evidence: string;
  note: string;
}

export type StarrScores = Record<StarrKey, StarrComponentScore>;

export interface AnswerAnalysis {
  intent: AnswerIntent;
  starr: StarrScores;
  /** 0..4 dimensions */
  relevance: number;
  specificity: number;
  ownership: number;
  communication: number;
  /** 0..100, computed server-side from the rubric (never taken from the model). */
  score: number;
  strengths: string[];
  improvements: string[];
  missing: StarrKey[];
  summary: string;
  claimsToProbe: string[];
  authenticity: { aiLikelihood: number; signals: string[] };
  coachingTip: string;
  /** Components whose quoted evidence could not be found in the answer (capped). */
  unverifiedEvidence: StarrKey[];
  source: EngineName;
}

export interface SpeechMetrics {
  mode: AnswerMode;
  wordCount: number;
  durationMs: number | null;
  wpm: number | null;
  fillerCount: number;
  fillerRate: number;
  hedgeCount: number;
  longestPauseMs: number | null;
  /** Time from the end of the question to the first word of the answer. */
  latencyMs: number | null;
  /** Share of answering time the face was centred toward the camera (0..1), if camera on. */
  eyeContact: number | null;
}

export interface CoverageEntry {
  competency: string;
  asked: number;
  /** 0..1 how much evidence we have about this competency. */
  evidence: number;
  scores: number[];
}

export interface PendingQuestion {
  seq: number;
  kind: TurnKind;
  competency: string | null;
  text: string;
  preface?: string | null;
}

export interface EngineState {
  phase: "intro" | "core" | "extension" | "done";
  round: number;
  mainCount: number;
  currentMainSeq: number | null;
  currentCompetency: string | null;
  followUpsForCurrent: number;
  clarificationsForCurrent: number;
  strikesForCurrent: number;
  manipulationStrikes: number;
  coverage: Record<string, CoverageEntry>;
  askedQuestions: string[];
  pending: PendingQuestion | null;
  endReason: string | null;
  decisions: string[];
  /** CV-anchored main questions asked so far (optional for sessions created before CV support). */
  cvQuestionsAsked?: number;
  /** CV items already used as question anchors. */
  cvClaimsUsed?: string[];
}

export interface InterviewPlan {
  competencies: Competency[];
  /** Model-written opening question for the first competency (used when there is no intro). */
  openingQuestion?: string | null;
}

export interface SessionRow {
  id: string;
  mode: SessionMode;
  user_id: string | null;
  org_id: string | null;
  campaign_id: string | null;
  candidate_name: string | null;
  candidate_email: string | null;
  role_title: string;
  config: InterviewConfig;
  plan: InterviewPlan | null;
  state: EngineState | null;
  cv_profile?: CvProfile | null;
  job_profile?: JobProfile | null;
  status: SessionStatus;
  engine: EngineName | null;
  started_at: string | null;
  completed_at: string | null;
  overall_score: number | null;
  integrity_score: number | null;
  integrity_level: IntegrityLevel | null;
  recommendation: Recommendation | null;
  starr_scores: Record<StarrKey, number> | null;
  competency_scores: Record<string, number> | null;
  report: SessionReport | null;
  created_at: string;
}

export interface TurnRow {
  id: string;
  session_id: string;
  seq: number;
  kind: TurnKind;
  parent_seq: number | null;
  competency: string | null;
  question: string;
  /** Short acknowledgment/transition spoken before the question. */
  preface: string | null;
  asked_at: string;
  answer: string | null;
  answer_mode: AnswerMode | null;
  answered_at: string | null;
  metrics: SpeechMetrics | null;
  analysis: AnswerAnalysis | null;
  score: number | null;
  flags: string[];
}

export interface IntegrityEventInput {
  type: string;
  severity?: number;
  turnSeq?: number | null;
  detail?: Record<string, unknown>;
  at?: string;
}

export interface IntegrityEventRow {
  session_id: string;
  turn_seq: number | null;
  type: string;
  severity: number;
  detail: Record<string, unknown>;
  client_ts: string | null;
  created_at?: string;
}

export interface IntegritySignal {
  type: string;
  label: string;
  count: number;
  penalty: number;
  explanation: string;
}

export interface IntegritySummary {
  score: number;
  level: IntegrityLevel;
  signals: IntegritySignal[];
  monitored: string[];
  note: string;
}

export interface ReportNarrative {
  headline: string;
  summary: string;
  strengths: string[];
  growthAreas: string[];
  nextSteps: string[];
  hiringSummary: string;
  questionCoaching: { seq: number; outline: string }[];
}

export interface DeliverySummary {
  avgWpm: number | null;
  fillerRate: number | null;
  hedgeRate: number | null;
  avgLatencyMs: number | null;
  eyeContact: number | null;
  confidenceScore: number;
  voiceShare: number;
}

export interface QuestionResult {
  seq: number;
  competency: string | null;
  question: string;
  score: number;
  starr: Record<StarrKey, number>;
  followUps: number;
}

export interface SessionReport {
  version: 1;
  engine: EngineName;
  endReason: string;
  overall: number;
  label: string;
  starr: Record<StarrKey, number>;
  competencies: { key: string; name: string; score: number; evidence: number }[];
  questions: QuestionResult[];
  delivery: DeliverySummary;
  integrity: IntegritySummary;
  recommendation: Recommendation;
  narrative: ReportNarrative;
  durationMs: number | null;
  generatedAt: string;
}

// ---------------------------------------------------------------------------------------------
// CV and job posting intelligence
// ---------------------------------------------------------------------------------------------

export interface CvRole {
  title: string;
  organization: string | null;
  period: string | null;
  highlights: string[];
}

/** Structured summary of a CV. Built once per document; prompts use this instead of the raw CV. */
export interface CvProfile {
  name: string | null;
  headline: string | null;
  yearsExperience: number | null;
  roles: CvRole[];
  skills: string[];
  education: string[];
  /** Specific, probe-worthy achievements or responsibilities taken from the CV. */
  claims: string[];
  summary: string;
  source: EngineName;
}

/** Structured summary of a job posting (any source: LinkedIn, Indeed, company site, email…). */
export interface JobProfile {
  title: string | null;
  company: string | null;
  seniority: Seniority | null;
  summary: string;
  responsibilities: string[];
  requirements: string[];
  niceToHave: string[];
  /** Competency names (library names where possible). */
  competencies: string[];
  keywords: string[];
  source: EngineName;
}

export interface CvAnchor {
  kind: "claim" | "role";
  text: string;
}

export type RequirementStatus = "met" | "partial" | "missing";

export interface RequirementMatch {
  requirement: string;
  kind: "required" | "nice";
  status: RequirementStatus;
  /** Verbatim CV text supporting the status ("" if none). Verified server-side. */
  evidence: string;
  note: string;
}

export interface CvFix {
  area: string;
  priority: "high" | "medium" | "low";
  issue: string;
  suggestion: string;
  /** Original CV text (verbatim) the fix applies to, if any. */
  before: string;
  /** Suggested rewrite; [brackets] mark details only the candidate can fill in. */
  after: string;
}

export interface CvCheck {
  key: string;
  label: string;
  ok: boolean;
  note: string;
}

export interface CvReview {
  version: 1;
  engine: EngineName;
  roleTitle: string | null;
  company: string | null;
  hasJob: boolean;
  /** 0–100 job match, computed server-side from verified requirement coverage (null without a job). */
  matchScore: number | null;
  /** 0–100 CV quality from deterministic checks. */
  qualityScore: number;
  verdict: string;
  summary: string;
  coverage: RequirementMatch[];
  strengths: string[];
  gaps: string[];
  missingKeywords: string[];
  fixes: CvFix[];
  checks: CvCheck[];
  tailoredSummary: string;
  interviewFocus: string[];
  /** True if text addressed to an AI system was found (and ignored) in the CV. */
  injectionDetected: boolean;
  generatedAt: string;
}
