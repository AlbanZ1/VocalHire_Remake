export function formatDate(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" }): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, opts);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "—";
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return m > 0 ? `${m}m ${r.toString().padStart(2, "0")}s` : `${r}s`;
}

export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const diff = Date.now() - Date.parse(iso);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const mins = Math.round(diff / 60000);
  if (Math.abs(mins) < 60) return rtf.format(-mins, "minute");
  const hrs = Math.round(mins / 60);
  if (Math.abs(hrs) < 24) return rtf.format(-hrs, "hour");
  const days = Math.round(hrs / 24);
  if (Math.abs(days) < 30) return rtf.format(-days, "day");
  return formatDate(iso);
}

export const SENIORITY_LABELS: Record<string, string> = {
  entry: "Entry level",
  junior: "Junior",
  mid: "Mid-level",
  senior: "Senior",
  lead: "Lead / Principal",
  executive: "Executive",
};

export const RECOMMENDATION_LABELS: Record<string, { label: string; tone: "success" | "info" | "warning" | "danger" }> = {
  strong_yes: { label: "Strong yes", tone: "success" },
  yes: { label: "Yes", tone: "info" },
  lean_no: { label: "Lean no", tone: "warning" },
  no: { label: "No", tone: "danger" },
};

export const INTEGRITY_LABELS: Record<string, { label: string; tone: "success" | "warning" | "danger" }> = {
  clear: { label: "Clear", tone: "success" },
  review: { label: "Review", tone: "warning" },
  high_risk: { label: "High risk", tone: "danger" },
};

export const REVIEW_STATUS_LABELS: Record<string, string> = {
  new: "New",
  shortlisted: "Shortlisted",
  advanced: "Advanced",
  rejected: "Rejected",
  hired: "Hired",
};

export const END_REASON_LABELS: Record<string, string> = {
  confident: "Enough evidence gathered",
  max_questions: "All questions completed",
  time_limit: "Time limit reached",
  conduct: "Ended after repeated attempts to manipulate the interviewer",
  ended_by_candidate: "Ended early",
};

export function scoreTone(score: number | null | undefined): "success" | "info" | "warning" | "danger" {
  if (score === null || score === undefined) return "info";
  if (score >= 70) return "success";
  if (score >= 55) return "info";
  if (score >= 40) return "warning";
  return "danger";
}
