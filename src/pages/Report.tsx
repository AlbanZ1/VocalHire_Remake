import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { ArrowRight, CheckCircle, Lightbulb, Printer, Target, TrendUp, UserPlus, Warning } from "@phosphor-icons/react";
import { api, type ReportResponse } from "@/lib/api";
import { sessionTokens } from "@/lib/sessionTokens";
import { useAuth } from "@/lib/auth";
import { END_REASON_LABELS, formatDateTime, formatDuration, SENIORITY_LABELS } from "@/lib/format";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Alert, Badge } from "@/components/ui/Badge";
import { PageLoader } from "@/components/ui/Spinner";
import { ScoreRing } from "@/components/report/Charts";
import { CompetencySummary, DeliveryStats, EngineNote, QuestionBreakdown, StarrSummary } from "@/components/report/ReportParts";

export default function Report() {
  const { sessionId = "" } = useParams();
  const { user } = useAuth();
  const [data, setData] = useState<ReportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .report(sessionId, sessionTokens.token(sessionId))
      .then((r) => {
        if (cancelled) return;
        // The report is generated when the interview ends; poll briefly if it's not ready yet.
        if (!r.report && r.session.status !== "completed" && attempt < 10) setTimeout(() => setAttempt((a) => a + 1), 1500);
        setData(r);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Couldn't load the report."));
    return () => {
      cancelled = true;
    };
  }, [sessionId, attempt]);

  if (error)
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <Alert tone="danger" title="We couldn't open this report" icon={<Warning size={20} />}>
          {error}
        </Alert>
        <ButtonLink to={user ? "/app" : "/"} variant="outline" className="mt-6">
          Go back
        </ButtonLink>
      </div>
    );
  if (!data) return <PageLoader label="Loading report" />;
  const { session, report } = data;
  if (!report) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-2xl font-extrabold">{session.status === "completed" ? "Report unavailable" : "This interview isn't finished yet"}</h1>
        <p className="mt-2 text-muted-fg">{session.status === "completed" ? "This interview's results are only available to the hiring team." : "Finish the interview to get your STARR feedback report."}</p>
        {session.status !== "completed" && (
          <ButtonLink to={`/interview/${sessionId}`} variant="cta" className="mt-6" icon={<ArrowRight size={18} />}>
            Continue interview
          </ButtonLink>
        )}
      </div>
    );
  }
  const n = report.narrative;
  const noAnswers = report.questions.length === 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-primary">Interview report</p>
          <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">{session.roleTitle}</h1>
          <p className="mt-1 text-sm text-muted-fg">
            {SENIORITY_LABELS[session.config.seniority] ?? session.config.seniority} · {formatDateTime(session.completedAt)} · {formatDuration(report.durationMs)} · {END_REASON_LABELS[report.endReason] ?? report.endReason}
          </p>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <Button variant="outline" icon={<Printer size={18} />} onClick={() => window.print()}>
            Save as PDF
          </Button>
          <ButtonLink to={`/practice/new?role=${encodeURIComponent(session.roleTitle)}&seniority=${session.config.seniority}`} variant="cta" icon={<ArrowRight size={18} />}>
            Practise again
          </ButtonLink>
        </div>
      </div>

      {!user && (
        <Alert tone="info" icon={<UserPlus size={20} />} title="Keep your progress" className="no-print">
          <span>
            This report is saved in this browser only.{" "}
            <Link to={`/signup?next=${encodeURIComponent(`/report/${sessionId}`)}`} className="font-semibold underline">
              Create a free account
            </Link>{" "}
            to keep it and track your improvement over time.
          </span>
        </Alert>
      )}

      {noAnswers ? (
        <Card className="p-8 text-center">
          <h2 className="text-xl font-bold">Not enough answers to score yet</h2>
          <p className="mx-auto mt-2 max-w-md text-muted-fg">The interview ended before any main questions were answered. That's completely fine — starting is the hardest part. Try again whenever you're ready.</p>
        </Card>
      ) : (
        <>
          <Card className="grid gap-6 p-6 md:grid-cols-[auto_1fr_auto] md:items-center">
            <ScoreRing value={report.overall} label={report.label} sublabel="Overall STARR score" />
            <div>
              <h2 className="text-xl font-extrabold">{n.headline}</h2>
              <p className="mt-2 text-fg">{n.summary}</p>
              <div className="mt-3">
                <EngineNote engine={report.engine} />
              </div>
            </div>
            {report.delivery.voiceShare > 0 ? (
              <ScoreRing value={report.delivery.confidenceScore} label="Delivery confidence" sublabel="Pace, fillers, hedging, eye contact" size={112} />
            ) : (
              <div className="max-w-44 rounded-xl bg-surface-2 p-4 text-center">
                <p className="text-sm font-bold text-fg-strong">Delivery confidence</p>
                <p className="mt-1 text-xs text-muted-fg">Answer out loud next time to get feedback on your pace, filler words and eye contact.</p>
              </div>
            )}
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader title="Your STARR profile" description="Average across all questions, 0–4. Hover a row for what it means." />
              <div className="p-5">
                <StarrSummary starr={report.starr} />
              </div>
            </Card>
            <Card>
              <CardHeader title="Competencies" description="How you did on each skill the interviewer assessed." />
              <div className="p-5">
                <CompetencySummary competencies={report.competencies} />
              </div>
            </Card>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            <Card className="p-5">
              <h2 className="flex items-center gap-2 font-bold text-success">
                <CheckCircle size={20} weight="fill" /> What you did well
              </h2>
              <ul className="mt-3 space-y-2 text-sm text-fg">
                {n.strengths.map((s, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-success" />
                    {s}
                  </li>
                ))}
              </ul>
            </Card>
            <Card className="p-5">
              <h2 className="flex items-center gap-2 font-bold text-warning">
                <TrendUp size={20} weight="bold" /> Where to grow
              </h2>
              <ul className="mt-3 space-y-2 text-sm text-fg">
                {n.growthAreas.map((s, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-warning" />
                    {s}
                  </li>
                ))}
              </ul>
            </Card>
            <Card className="p-5">
              <h2 className="flex items-center gap-2 font-bold text-primary">
                <Target size={20} weight="bold" /> Your practice plan
              </h2>
              <ol className="mt-3 space-y-2 text-sm text-fg">
                {n.nextSteps.map((s, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary">{i + 1}</span>
                    {s}
                  </li>
                ))}
              </ol>
            </Card>
          </div>

          <Card>
            <CardHeader title="Delivery" description="How you sounded, not just what you said." />
            <div className="p-5">
              <DeliveryStats d={report.delivery} />
            </div>
          </Card>

          <section aria-labelledby="qs">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 id="qs" className="text-lg font-extrabold">
                Question by question
              </h2>
              <Badge tone="info" icon={<Lightbulb size={14} />}>
                Evidence is quoted from your own words
              </Badge>
            </div>
            <QuestionBreakdown report={report} turns={data.turns ?? []} plan={data.plan} mode="practice" roleTitle={session.roleTitle} />
          </section>
        </>
      )}
    </div>
  );
}
