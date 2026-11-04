import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft, CaretDown, Envelope, FileText, FloppyDisk, Info, Warning } from "@phosphor-icons/react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { END_REASON_LABELS, RECOMMENDATION_LABELS, REVIEW_STATUS_LABELS, formatDateTime, formatDuration } from "@/lib/format";
import type { CvProfile, CvReview, ReportTurn } from "@/lib/api";
import { CvProfileCard, CvReviewView } from "@/components/documents/CvParts";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Alert, Badge } from "@/components/ui/Badge";
import { Field, Select, Textarea } from "@/components/ui/Field";
import { PageLoader } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { ScoreRing } from "@/components/report/Charts";
import { CompetencySummary, DeliveryStats, EngineNote, IntegrityPanel, QuestionBreakdown, StarrSummary } from "@/components/report/ReportParts";
import type { InterviewPlan, SessionReport } from "../../../supabase/functions/_shared/types.ts";

interface SessionDetail {
  id: string;
  campaign_id: string;
  candidate_name: string | null;
  candidate_email: string | null;
  role_title: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  report: SessionReport | null;
  plan: InterviewPlan | null;
  review_status: string;
  reviewer_notes: string | null;
  reviewed_at: string | null;
  consent_at: string | null;
  candidate_cv: string | null;
  cv_profile: CvProfile | null;
  cv_review: CvReview | null;
}

function CvSection({ s }: { s: SessionDetail }) {
  const [showCv, setShowCv] = useState(false);
  if (!s.cv_profile && !s.candidate_cv) return null;
  return (
    <section aria-labelledby="cv-fit" className="space-y-4">
      <h2 id="cv-fit" className="text-lg font-extrabold">
        CV vs the job
      </h2>
      {s.cv_review ? (
        <CvReviewView review={s.cv_review} audience="employer" compact />
      ) : (
        <Alert tone="info" icon={<Info size={20} />}>
          The CV fit summary is still being prepared. Refresh in a moment.
        </Alert>
      )}
      {s.candidate_cv && (
        <Card className="p-5">
          <button type="button" onClick={() => setShowCv((v) => !v)} className="flex w-full items-center justify-between gap-3 text-left" aria-expanded={showCv}>
            <span className="flex items-center gap-2 font-bold text-fg-strong">
              <FileText size={20} className="text-primary" aria-hidden="true" /> Full CV text
            </span>
            <CaretDown size={18} className={showCv ? "rotate-180 transition-transform" : "transition-transform"} />
          </button>
          {showCv && <pre className="mt-4 max-h-[480px] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface-2 p-4 font-sans text-sm leading-relaxed text-fg">{s.candidate_cv}</pre>}
        </Card>
      )}
    </section>
  );
}

export default function CandidateReview() {
  const { sessionId = "" } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const [s, setS] = useState<SessionDetail | null>(null);
  const [turns, setTurns] = useState<ReportTurn[]>([]);
  const [events, setEvents] = useState<{ type: string; created_at: string; detail: Record<string, unknown>; turn_seq: number | null }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("new");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      supabase
        .from("interview_sessions")
        .select("id, campaign_id, candidate_name, candidate_email, role_title, status, started_at, completed_at, report, plan, review_status, reviewer_notes, reviewed_at, consent_at, candidate_cv, cv_profile, cv_review")
        .eq("id", sessionId)
        .single(),
      supabase.from("interview_turns").select("seq, kind, parent_seq, competency, question, preface, answer, answer_mode, metrics, analysis, score, flags").eq("session_id", sessionId).order("seq"),
      supabase.from("integrity_events").select("type, created_at, detail, turn_seq").eq("session_id", sessionId).order("created_at").limit(1000),
    ]).then(([a, b, c]) => {
      if (a.error || !a.data) {
        setError("Couldn't load this candidate.");
        return;
      }
      const d = a.data as SessionDetail;
      setS(d);
      setStatus(d.review_status);
      setNotes(d.reviewer_notes ?? "");
      setTurns((b.data ?? []) as ReportTurn[]);
      setEvents((c.data ?? []) as typeof events);
    });
  }, [sessionId]);

  async function save() {
    if (!s) return;
    setSaving(true);
    const { error } = await supabase
      .from("interview_sessions")
      .update({ review_status: status, reviewer_notes: notes.trim() || null, reviewed_by: user?.id, reviewed_at: new Date().toISOString() })
      .eq("id", s.id);
    setSaving(false);
    if (error) toast(error.message, "error");
    else {
      toast("Decision saved", "success");
      setS({ ...s, review_status: status, reviewer_notes: notes });
    }
  }

  if (error)
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <Alert tone="danger">{error}</Alert>
      </div>
    );
  if (!s) return <PageLoader />;
  const r = s.report;
  const rec = r ? RECOMMENDATION_LABELS[r.recommendation] : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 sm:py-10">
      <Link to={`/business/campaigns/${s.campaign_id}`} className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-muted-fg hover:text-fg-strong">
        <ArrowLeft size={16} /> Back to candidates
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-primary">{s.role_title}</p>
          <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">{s.candidate_name ?? "Candidate"}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-fg">
            {s.candidate_email && (
              <a href={`mailto:${s.candidate_email}`} className="inline-flex items-center gap-1 hover:text-primary">
                <Envelope size={16} /> {s.candidate_email}
              </a>
            )}
            <span>{formatDateTime(s.completed_at ?? s.started_at)}</span>
            {s.started_at && s.completed_at && <span>{formatDuration(Date.parse(s.completed_at) - Date.parse(s.started_at))}</span>}
            {r && <span>{END_REASON_LABELS[r.endReason] ?? r.endReason}</span>}
          </p>
        </div>
        {rec && (
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-fg">AI recommendation (advisory)</p>
            <Badge tone={rec.tone} className="mt-1 px-3 py-1 text-sm">
              {rec.label}
            </Badge>
          </div>
        )}
      </div>

      {!r ? (
        <>
          <Alert tone="info" icon={<Info size={20} />} title="Interview in progress">
            Results will appear here when the candidate finishes.
          </Alert>
          <CvSection s={s} />
        </>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            <Card className="grid gap-6 p-6 sm:grid-cols-[auto_1fr] sm:items-center">
              <ScoreRing value={r.overall} label={r.label} sublabel="Overall STARR score" />
              <div>
                <h2 className="text-lg font-extrabold">Summary for the hiring team</h2>
                <p className="mt-2 text-fg">{r.narrative.hiringSummary || r.narrative.summary}</p>
                <div className="mt-3">
                  <EngineNote engine={r.engine} />
                </div>
              </div>
            </Card>
            {r.integrity.level === "high_risk" && (
              <Alert tone="danger" icon={<Warning size={20} />} title="High integrity risk">
                Several integrity signals were raised. Review the timeline and transcript before deciding — signals are indicators, not proof.
              </Alert>
            )}
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader title="STARR profile" description="Average across questions (0–4)." />
                <div className="p-5">
                  <StarrSummary starr={r.starr} />
                </div>
              </Card>
              <Card>
                <CardHeader title="Competencies" description="Scored on the role's frozen competency set." />
                <div className="p-5">
                  <CompetencySummary competencies={r.competencies} />
                </div>
              </Card>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <Card className="p-5">
                <h2 className="font-bold text-success">Strengths</h2>
                <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-fg">
                  {r.narrative.strengths.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </Card>
              <Card className="p-5">
                <h2 className="font-bold text-warning">Risks & what to probe next round</h2>
                <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-fg">
                  {r.narrative.growthAreas.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </Card>
            </div>
            <CvSection s={s} />
            <Card>
              <CardHeader title="Delivery" />
              <div className="p-5">
                <DeliveryStats d={r.delivery} />
              </div>
            </Card>
            <section aria-labelledby="transcript">
              <h2 id="transcript" className="mb-3 text-lg font-extrabold">
                Transcript & evidence
              </h2>
              <QuestionBreakdown report={r} turns={turns} plan={s.plan} mode="business" roleTitle={s.role_title} />
            </section>
          </div>

          <div className="space-y-6 lg:sticky lg:top-24 lg:self-start">
            <Card className="p-5">
              <h2 className="text-base font-bold">Your decision</h2>
              <div className="mt-4 space-y-4">
                <Field label="Status">
                  {({ id }) => (
                    <Select id={id} value={status} onChange={(e) => setStatus(e.target.value)}>
                      {Object.entries(REVIEW_STATUS_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label="Notes" hint="Visible to your team only.">
                  {({ id, describedBy }) => <Textarea id={id} rows={5} maxLength={5000} value={notes} onChange={(e) => setNotes(e.target.value)} aria-describedby={describedBy} />}
                </Field>
                <Button variant="primary" className="w-full" icon={<FloppyDisk size={18} />} loading={saving} onClick={save}>
                  Save decision
                </Button>
                {s.reviewed_at && <p className="text-xs text-muted-fg">Last saved {formatDateTime(s.reviewed_at)}</p>}
              </div>
            </Card>
            {s.cv_profile && <CvProfileCard cv={s.cv_profile} title="From the CV" className="bg-surface" />}
            <IntegrityPanel integrity={r.integrity} events={events} />
            {s.consent_at && <p className="text-xs text-muted-fg">Candidate consented to the monitoring terms on {formatDateTime(s.consent_at)}.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
