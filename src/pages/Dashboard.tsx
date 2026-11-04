import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { ArrowRight, CalendarCheck, ChartLineUp, Fire, Microphone, Play, Target, Trophy } from "@phosphor-icons/react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { formatDate, relativeTime } from "@/lib/format";
import { ButtonLink } from "@/components/ui/Button";
import { Card, CardHeader, EmptyState, Stat } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Spinner";
import { PageHeader } from "@/components/layout/Shells";
import { BarList, TrendChart } from "@/components/report/Charts";
import { STARR_KEYS, STARR_LABELS, scoreLabel } from "../../supabase/functions/_shared/rubric.ts";
import type { StarrKey } from "../../supabase/functions/_shared/types.ts";

interface Row {
  id: string;
  role_title: string;
  status: string;
  overall_score: number | null;
  starr_scores: Record<StarrKey, number> | null;
  created_at: string;
  completed_at: string | null;
  report: { delivery?: { confidenceScore?: number } } | null;
}

const TIPS: Record<StarrKey, string> = {
  situation: "Open each story with one or two sentences: where, when, and what was at stake.",
  task: "Say what you personally owned — “My job was to…” — before describing what happened.",
  action: "Walk through 3–4 concrete steps you took yourself, and why you chose them.",
  result: "End with a number or a clear before/after. Even an estimate makes impact real.",
  reflection: "Close with what you learned and how you've applied it since.",
};

function streakDays(dates: string[]): number {
  const days = new Set(dates.map((d) => new Date(d).toDateString()));
  let streak = 0;
  const cur = new Date();
  if (!days.has(cur.toDateString())) cur.setDate(cur.getDate() - 1);
  while (days.has(cur.toDateString())) {
    streak++;
    cur.setDate(cur.getDate() - 1);
  }
  return streak;
}

export default function Dashboard() {
  const { user, profile } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("interview_sessions")
      .select("id, role_title, status, overall_score, starr_scores, created_at, completed_at, report->delivery")
      .eq("user_id", user.id)
      .eq("mode", "practice")
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data }) => setRows(((data ?? []) as unknown as (Row & { delivery?: { confidenceScore?: number } })[]).map((r) => ({ ...r, report: { delivery: r.delivery } }))));
  }, [user]);

  const completed = useMemo(() => (rows ?? []).filter((r) => r.status === "completed" && r.overall_score !== null), [rows]);
  const inProgress = useMemo(() => (rows ?? []).filter((r) => r.status === "in_progress" || r.status === "created"), [rows]);
  const avg = completed.length ? Math.round(completed.reduce((s, r) => s + Number(r.overall_score), 0) / completed.length) : null;
  const best = completed.length ? Math.max(...completed.map((r) => Number(r.overall_score))) : null;
  const streak = streakDays(completed.map((r) => r.completed_at ?? r.created_at));
  const trend = [...completed].reverse().map((r) => ({ id: r.id, date: r.completed_at ?? r.created_at, label: formatDate(r.completed_at ?? r.created_at, { month: "short", day: "numeric" }), value: Math.round(Number(r.overall_score)), role: r.role_title }));
  const recentStarr = useMemo(() => {
    const recent = completed.slice(0, 5).filter((r) => r.starr_scores);
    if (!recent.length) return null;
    return Object.fromEntries(STARR_KEYS.map((k) => [k, recent.reduce((s, r) => s + Number(r.starr_scores![k] ?? 0), 0) / recent.length])) as Record<StarrKey, number>;
  }, [completed]);
  const focus = recentStarr ? STARR_KEYS.reduce((w, k) => (recentStarr[k] < recentStarr[w] ? k : w)) : null;
  const first = profile?.full_name?.split(" ")[0];

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 sm:py-10">
      <PageHeader
        eyebrow="Practice"
        title={first ? `Welcome back, ${first}` : "Your practice space"}
        description="Every practice run makes the real thing feel more familiar. Here's how you're progressing."
        actions={
          <ButtonLink to="/practice/new" variant="cta" size="lg" icon={<Microphone size={20} weight="fill" />}>
            New practice interview
          </ButtonLink>
        }
      />

      {inProgress.length > 0 && (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="font-semibold text-fg-strong">You have an unfinished interview</p>
            <p className="text-sm text-muted-fg">
              {inProgress[0].role_title} · started {relativeTime(inProgress[0].created_at)}
            </p>
          </div>
          <ButtonLink to={`/interview/${inProgress[0].id}`} variant="outline" icon={<Play size={18} />}>
            Continue
          </ButtonLink>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {rows === null ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)
        ) : (
          <>
            <Stat label="Interviews completed" value={completed.length} icon={<CalendarCheck size={22} />} />
            <Stat label="Average score" value={avg ?? "—"} hint={avg !== null ? scoreLabel(avg) : "Complete an interview to see it"} icon={<ChartLineUp size={22} />} />
            <Stat label="Best score" value={best !== null ? Math.round(best) : "—"} icon={<Trophy size={22} />} />
            <Stat label="Practice streak" value={`${streak} day${streak === 1 ? "" : "s"}`} hint="Days in a row with a completed interview" icon={<Fire size={22} />} />
          </>
        )}
      </div>

      {rows !== null && completed.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Microphone size={28} />}
            title="Your first interview is the hardest — and the most valuable"
            body="Pick a role, choose a supportive interviewer, and answer a few questions out loud. You'll get a STARR report with exactly what to improve."
            action={
              <ButtonLink to="/practice/new" variant="cta" icon={<ArrowRight size={18} />}>
                Start practising
              </ButtonLink>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Card className="p-5">{trend.length > 0 ? <TrendChart points={trend} title="Overall score over time" /> : <Skeleton className="h-56" />}</Card>
          <Card>
            <CardHeader title="Your STARR profile" description="Average of your last five interviews (0–4)." />
            <div className="space-y-5 p-5">
              {recentStarr ? (
                <BarList label="STARR averages" max={4} rows={STARR_KEYS.map((k) => ({ key: k, label: STARR_LABELS[k], value: recentStarr[k], valueLabel: recentStarr[k].toFixed(1) }))} />
              ) : (
                <Skeleton className="h-40" />
              )}
              {focus && (
                <div className="rounded-xl bg-primary-soft p-4">
                  <p className="flex items-center gap-2 text-sm font-bold text-primary">
                    <Target size={18} /> Focus next: {STARR_LABELS[focus]}
                  </p>
                  <p className="mt-1 text-sm text-fg-strong">{TIPS[focus]}</p>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {rows !== null && rows.length > 0 && (
        <Card>
          <CardHeader title="Recent interviews" />
          <ul className="divide-y divide-border-soft">
            {rows.slice(0, 15).map((r) => (
              <li key={r.id}>
                <Link to={r.status === "completed" ? `/report/${r.id}` : `/interview/${r.id}`} className="flex flex-wrap items-center gap-4 px-5 py-4 transition-colors hover:bg-surface-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-fg-strong">{r.role_title}</p>
                    <p className="text-sm text-muted-fg">{formatDate(r.completed_at ?? r.created_at, { dateStyle: "medium" })}</p>
                  </div>
                  {r.status === "completed" && r.overall_score !== null ? (
                    <div className="flex items-center gap-3">
                      <Badge tone="neutral">{scoreLabel(Number(r.overall_score))}</Badge>
                      <span className="w-10 text-right text-lg font-extrabold tabular-nums text-fg-strong">{Math.round(Number(r.overall_score))}</span>
                    </div>
                  ) : (
                    <Badge tone="info">In progress</Badge>
                  )}
                  <ArrowRight size={18} className="text-muted-fg" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
