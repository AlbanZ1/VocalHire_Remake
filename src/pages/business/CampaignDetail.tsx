import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft, Copy, DownloadSimple, LinkSimple, PencilSimple, ShieldWarning, SortAscending, SortDescending, Users } from "@phosphor-icons/react";
import { supabase } from "@/lib/supabase";
import { interviewLink, type CampaignRow } from "@/lib/org";
import { INTEGRITY_LABELS, RECOMMENDATION_LABELS, REVIEW_STATUS_LABELS, SENIORITY_LABELS, formatDate, formatDuration, scoreTone } from "@/lib/format";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, EmptyState, Stat } from "@/components/ui/Card";
import { Alert, Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Field";
import { PageLoader } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { MiniMeter } from "@/components/report/Charts";
import { STARR_KEYS, STARR_LABELS } from "../../../supabase/functions/_shared/rubric.ts";
import type { StarrKey } from "../../../supabase/functions/_shared/types.ts";

interface CandidateRow {
  id: string;
  candidate_name: string | null;
  candidate_email: string | null;
  status: string;
  overall_score: number | null;
  integrity_score: number | null;
  integrity_level: string | null;
  recommendation: string | null;
  review_status: string;
  starr_scores: Record<StarrKey, number> | null;
  cv_match: number | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

type SortKey = "overall_score" | "integrity_score" | "cv_match" | "created_at" | "candidate_name";

export default function CampaignDetail() {
  const { campaignId = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [campaign, setCampaign] = useState<CampaignRow | null>(null);
  const [rows, setRows] = useState<CandidateRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "overall_score", dir: "desc" });
  const [reviewFilter, setReviewFilter] = useState("all");
  const [integrityFilter, setIntegrityFilter] = useState("all");

  useEffect(() => {
    Promise.all([
      supabase.from("campaigns").select("*").eq("id", campaignId).single(),
      supabase
        .from("interview_sessions")
        .select("id, candidate_name, candidate_email, status, overall_score, integrity_score, integrity_level, recommendation, review_status, starr_scores, cv_match:cv_review->matchScore, started_at, completed_at, created_at")
        .eq("campaign_id", campaignId)
        .in("status", ["in_progress", "completed"])
        .order("created_at", { ascending: false }),
    ]).then(([c, s]) => {
      if (c.error) setError("Couldn't load this interview.");
      setCampaign((c.data as CampaignRow) ?? null);
      setRows(((s.data ?? []) as CandidateRow[]).map((r) => ({ ...r, overall_score: r.overall_score === null ? null : Number(r.overall_score), integrity_score: r.integrity_score === null ? null : Number(r.integrity_score) })));
    });
  }, [campaignId]);

  const visible = useMemo(() => {
    const list = (rows ?? []).filter((r) => (reviewFilter === "all" || r.review_status === reviewFilter) && (integrityFilter === "all" || r.integrity_level === integrityFilter));
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      return (av > bv ? 1 : av < bv ? -1 : 0) * dir;
    });
  }, [rows, sort, reviewFilter, integrityFilter]);

  if (error)
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <Alert tone="danger">{error}</Alert>
      </div>
    );
  if (!campaign || rows === null) return <PageLoader />;

  const link = interviewLink(campaign.public_token);
  const completed = rows.filter((r) => r.status === "completed");
  const avg = completed.length ? Math.round(completed.reduce((s, r) => s + (r.overall_score ?? 0), 0) / completed.length) : null;
  const flagged = rows.filter((r) => r.integrity_level === "high_risk").length;
  const plan = campaign.settings?.plan?.competencies;

  const sortBtn = (key: SortKey, label: string, align: "left" | "right" = "left") => (
    <button
      type="button"
      className={`inline-flex items-center gap-1 font-semibold uppercase tracking-wide ${align === "right" ? "ml-auto" : ""}`}
      onClick={() => setSort((s) => ({ key, dir: s.key === key && s.dir === "desc" ? "asc" : "desc" }))}
      aria-sort={sort.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
    >
      {label}
      {sort.key === key && (sort.dir === "asc" ? <SortAscending size={14} /> : <SortDescending size={14} />)}
    </button>
  );

  function exportCsv() {
    const header = ["Name", "Email", "Status", "Overall", ...STARR_KEYS.map((k) => STARR_LABELS[k]), "CV match", "Integrity score", "Integrity level", "AI recommendation", "Review status", "Completed"];
    const lines = visible.map((r) =>
      [
        r.candidate_name ?? "",
        r.candidate_email ?? "",
        r.status,
        r.overall_score ?? "",
        ...STARR_KEYS.map((k) => r.starr_scores?.[k] ?? ""),
        r.cv_match ?? "",
        r.integrity_score ?? "",
        r.integrity_level ?? "",
        r.recommendation ? RECOMMENDATION_LABELS[r.recommendation]?.label ?? r.recommendation : "",
        REVIEW_STATUS_LABELS[r.review_status] ?? r.review_status,
        r.completed_at ?? "",
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${campaign!.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-candidates.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 sm:py-10">
      <Link to="/business" className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-muted-fg hover:text-fg-strong">
        <ArrowLeft size={16} /> All interviews
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-extrabold sm:text-3xl">{campaign.title}</h1>
            <Badge tone={campaign.status === "active" ? "success" : campaign.status === "draft" ? "neutral" : "warning"}>{campaign.status === "active" ? "Open" : campaign.status === "draft" ? "Draft" : "Closed"}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-fg">
            {[campaign.department, campaign.location, SENIORITY_LABELS[campaign.seniority]].filter(Boolean).join(" · ")} · created {formatDate(campaign.created_at)}
            {campaign.closes_at ? ` · closes ${formatDate(campaign.closes_at)}` : ""}
          </p>
        </div>
        <ButtonLink to={`/business/campaigns/${campaign.id}/edit`} variant="outline" icon={<PencilSimple size={18} />}>
          Edit
        </ButtonLink>
      </div>

      <Card className="flex flex-wrap items-center gap-4 p-5">
        <div className="flex size-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
          <LinkSimple size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-fg-strong">Applicant link</p>
          <p className="truncate font-mono text-sm text-muted-fg">{link}</p>
        </div>
        <Button variant="primary" icon={<Copy size={18} />} onClick={() => navigator.clipboard.writeText(link).then(() => toast("Link copied", "success"))}>
          Copy link
        </Button>
        {campaign.status !== "active" && <p className="w-full text-sm text-warning">This interview isn't open, so the link won't accept applicants until you set it to Open.</p>}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Applicants" value={rows.length} icon={<Users size={22} />} />
        <Stat label="Completed" value={completed.length} />
        <Stat label="Average score" value={avg ?? "—"} />
        <Stat label="High integrity risk" value={flagged} icon={<ShieldWarning size={22} />} />
      </div>

      {plan && (
        <p className="text-sm text-muted-fg">
          <span className="font-semibold text-fg-strong">Assessed on:</span> {plan.map((c) => c.name).join(" · ")}
        </p>
      )}

      {rows.length === 0 ? (
        <Card>
          <EmptyState icon={<Users size={28} />} title="No applicants yet" body="Share the applicant link in your job posting or by email. Results appear here as soon as each interview is finished." />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b border-border-soft p-4">
            <label className="flex items-center gap-2 text-sm font-semibold text-fg-strong">
              Review status
              <Select value={reviewFilter} onChange={(e) => setReviewFilter(e.target.value)} className="min-h-9 w-auto py-1 text-sm">
                <option value="all">All</option>
                {Object.entries(REVIEW_STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold text-fg-strong">
              Integrity
              <Select value={integrityFilter} onChange={(e) => setIntegrityFilter(e.target.value)} className="min-h-9 w-auto py-1 text-sm">
                <option value="all">All</option>
                {Object.entries(INTEGRITY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </Select>
            </label>
            <Button variant="ghost" size="sm" className="ml-auto" icon={<DownloadSimple size={16} />} onClick={exportCsv}>
              Export CSV
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead className="bg-surface-2 text-left text-xs text-muted-fg">
                <tr>
                  <th className="px-5 py-3">#</th>
                  <th className="px-3 py-3">{sortBtn("candidate_name", "Candidate")}</th>
                  <th className="px-3 py-3">{sortBtn("overall_score", "Score")}</th>
                  <th className="px-3 py-3 font-semibold uppercase tracking-wide">STARR (S·T·A·R·R)</th>
                  <th className="px-3 py-3">{sortBtn("cv_match", "CV match")}</th>
                  <th className="px-3 py-3">{sortBtn("integrity_score", "Integrity")}</th>
                  <th className="px-3 py-3 font-semibold uppercase tracking-wide">AI recommendation</th>
                  <th className="px-3 py-3 font-semibold uppercase tracking-wide">Review</th>
                  <th className="px-5 py-3">{sortBtn("created_at", "Date")}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r, i) => {
                  const rec = r.recommendation ? RECOMMENDATION_LABELS[r.recommendation] : null;
                  const integ = r.integrity_level ? INTEGRITY_LABELS[r.integrity_level] : null;
                  return (
                    <tr key={r.id} className="cursor-pointer border-t border-border-soft transition-colors hover:bg-surface-2" onClick={() => navigate(`/business/candidates/${r.id}`)}>
                      <td className="px-5 py-3 tabular-nums text-muted-fg">{i + 1}</td>
                      <td className="px-3 py-3">
                        <Link to={`/business/candidates/${r.id}`} className="font-semibold text-fg-strong hover:text-primary" onClick={(e) => e.stopPropagation()}>
                          {r.candidate_name ?? "Unnamed"}
                        </Link>
                        <p className="text-xs text-muted-fg">{r.candidate_email}</p>
                      </td>
                      <td className="px-3 py-3">{r.status === "completed" ? <MiniMeter value={r.overall_score} label="Overall score" /> : <Badge tone="info">In progress</Badge>}</td>
                      <td className="px-3 py-3 font-mono text-xs tabular-nums text-fg">{r.starr_scores ? STARR_KEYS.map((k) => (r.starr_scores![k] ?? 0).toFixed(1)).join(" · ") : "—"}</td>
                      <td className="px-3 py-3 tabular-nums">{r.cv_match !== null && r.cv_match !== undefined ? <Badge tone={scoreTone(Number(r.cv_match))}>{Math.round(Number(r.cv_match))}</Badge> : <span className="text-muted-fg">—</span>}</td>
                      <td className="px-3 py-3">{integ ? <Badge tone={integ.tone}>{integ.label} · {Math.round(r.integrity_score ?? 0)}</Badge> : "—"}</td>
                      <td className="px-3 py-3">{rec ? <Badge tone={rec.tone}>{rec.label}</Badge> : "—"}</td>
                      <td className="px-3 py-3">
                        <Badge tone={r.review_status === "rejected" ? "danger" : r.review_status === "new" ? "neutral" : "success"}>{REVIEW_STATUS_LABELS[r.review_status]}</Badge>
                      </td>
                      <td className="px-5 py-3 text-muted-fg">
                        {formatDate(r.completed_at ?? r.created_at)}
                        {r.started_at && r.completed_at && <span className="block text-xs">{formatDuration(Date.parse(r.completed_at) - Date.parse(r.started_at))}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {visible.length === 0 && <p className="p-6 text-center text-sm text-muted-fg">No candidates match these filters.</p>}
        </Card>
      )}
      <p className="text-xs text-muted-fg">AI recommendations are advisory. They combine the interview score with integrity signals and never replace a human decision.</p>
    </div>
  );
}
