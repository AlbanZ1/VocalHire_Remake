import { useState } from "react";
import { Link } from "react-router";
import { ArrowsClockwise, CaretDown, ChatCircleText, Clock, Eye, Gauge, Quotes, ShieldCheck, ShieldWarning, Sparkle, Waveform } from "@phosphor-icons/react";
import { clsx } from "clsx";
import { Badge } from "../ui/Badge";
import { Card, CardHeader } from "../ui/Card";
import { BarList } from "./Charts";
import { STARR_ANCHORS, STARR_DEFINITIONS, STARR_KEYS, STARR_LABELS, scoreLabel } from "../../../supabase/functions/_shared/rubric.ts";
import type { DeliverySummary, IntegritySummary, InterviewPlan, SessionReport } from "../../../supabase/functions/_shared/types.ts";
import type { ReportTurn } from "@/lib/api";
import { INTEGRITY_LABELS, formatDuration, scoreTone } from "@/lib/format";

export function StarrSummary({ starr }: { starr: SessionReport["starr"] }) {
  return (
    <BarList
      label="Average STARR element scores (0 to 4)"
      max={4}
      rows={STARR_KEYS.map((k) => ({
        key: k,
        label: STARR_LABELS[k],
        value: starr[k],
        valueLabel: `${starr[k].toFixed(1)} / 4`,
        hint: STARR_DEFINITIONS[k],
      }))}
    />
  );
}

export function CompetencySummary({ competencies }: { competencies: SessionReport["competencies"] }) {
  if (!competencies.length) return <p className="text-sm text-muted-fg">No scored competencies yet.</p>;
  return (
    <BarList
      label="Competency scores (0 to 100)"
      max={100}
      rows={competencies.map((c) => ({ key: c.key, label: c.name, value: c.score, valueLabel: `${c.score}`, hint: `Evidence gathered: ${Math.round(c.evidence * 100)}%` }))}
    />
  );
}

function DeliveryTile({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: string; note: string }) {
  return (
    <div className="rounded-xl border border-border-soft p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-muted-fg">
        <span className="text-primary">{icon}</span>
        {label}
      </div>
      <p className="mt-1 text-xl font-bold tabular-nums text-fg-strong">{value}</p>
      <p className="mt-0.5 text-xs text-muted-fg">{note}</p>
    </div>
  );
}

export function DeliveryStats({ d }: { d: DeliverySummary }) {
  const pace = d.avgWpm === null ? "Typed answers" : d.avgWpm < 110 ? "A little slow — that's fine if deliberate" : d.avgWpm > 175 ? "Fast — try slowing slightly" : "Comfortable, clear pace";
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <DeliveryTile icon={<Waveform size={18} />} label="Speaking pace" value={d.avgWpm === null ? "—" : `${d.avgWpm} wpm`} note={pace} />
      <DeliveryTile icon={<ChatCircleText size={18} />} label="Filler words" value={d.fillerRate === null ? "—" : `${d.fillerRate}%`} note={d.fillerRate !== null && d.fillerRate > 4 ? "Pausing silently instead sounds more confident" : "Of words spoken (um, uh, you know…)"} />
      <DeliveryTile icon={<Clock size={18} />} label="Thinking time" value={d.avgLatencyMs === null ? "—" : `${Math.round(d.avgLatencyMs / 100) / 10}s`} note="Average pause before answering" />
      <DeliveryTile icon={<Eye size={18} />} label="Eye contact" value={d.eyeContact === null ? "—" : `${Math.round(d.eyeContact * 100)}%`} note={d.eyeContact === null ? "Turn on your camera to measure" : "Time spent looking toward the screen"} />
    </div>
  );
}

export function IntegrityPanel({ integrity, events }: { integrity: IntegritySummary; events?: { type: string; created_at: string; detail: Record<string, unknown>; turn_seq: number | null }[] }) {
  const lvl = INTEGRITY_LABELS[integrity.level];
  const shown = (events ?? []).filter((e) => !["heartbeat", "presence_stats"].includes(e.type));
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            {integrity.level === "clear" ? <ShieldCheck size={20} className="text-success" /> : <ShieldWarning size={20} className="text-warning" />}
            Integrity signals
          </span>
        }
        description={integrity.note}
        action={
          <div className="text-right">
            <Badge tone={lvl.tone}>{lvl.label}</Badge>
            <p className="mt-1 text-2xl font-extrabold tabular-nums text-fg-strong">{integrity.score}<span className="text-sm font-semibold text-muted-fg"> / 100</span></p>
          </div>
        }
      />
      <div className="space-y-4 p-5">
        {integrity.signals.length === 0 ? (
          <p className="text-sm text-muted-fg">No integrity signals were raised during this interview.</p>
        ) : (
          <ul className="divide-y divide-border-soft">
            {integrity.signals.map((s) => (
              <li key={s.type} className="flex items-start justify-between gap-4 py-3">
                <div>
                  <p className="font-semibold text-fg-strong">
                    {s.label} <span className="font-normal text-muted-fg">× {s.count}</span>
                  </p>
                  <p className="text-sm text-muted-fg">{s.explanation}</p>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-muted-fg">−{s.penalty}</span>
              </li>
            ))}
          </ul>
        )}
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-muted-fg">Monitored</p>
          <p className="mt-1 text-sm text-fg">{integrity.monitored.join(" · ")}</p>
        </div>
        {shown.length > 0 && (
          <details className="rounded-lg border border-border-soft">
            <summary className="flex min-h-11 items-center px-3 text-sm font-semibold text-primary">Event timeline ({shown.length})</summary>
            <ol className="max-h-72 overflow-auto border-t border-border-soft text-sm">
              {shown.map((e, i) => (
                <li key={i} className="flex justify-between gap-3 border-b border-border-soft px-3 py-2 last:border-0">
                  <span>
                    <span className="font-semibold text-fg-strong">{e.type.replace(/_/g, " ")}</span>
                    {e.turn_seq !== null && <span className="text-muted-fg"> · question #{e.turn_seq}</span>}
                    {typeof e.detail?.durationMs === "number" && <span className="text-muted-fg"> · {formatDuration(e.detail.durationMs as number)}</span>}
                  </span>
                  <time className="shrink-0 tabular-nums text-muted-fg" dateTime={e.created_at}>
                    {new Date(e.created_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </time>
                </li>
              ))}
            </ol>
          </details>
        )}
      </div>
    </Card>
  );
}

function ComponentRow({ k, score, evidence, note }: { k: (typeof STARR_KEYS)[number]; score: number; evidence: string; note: string }) {
  return (
    <div className="grid gap-1 py-2.5 sm:grid-cols-[120px_1fr]">
      <div className="flex items-center gap-2">
        <span className={clsx("inline-flex size-7 items-center justify-center rounded-lg text-xs font-extrabold tabular-nums", score >= 3 ? "bg-success-bg text-success" : score === 2 ? "bg-primary-soft text-primary" : "bg-muted text-muted-fg")}>{score}</span>
        <span className="text-sm font-semibold text-fg-strong">{STARR_LABELS[k]}</span>
      </div>
      <div className="text-sm">
        {evidence ? (
          <p className="flex gap-1.5 text-fg">
            <Quotes size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
            <span className="italic">{evidence}</span>
          </p>
        ) : (
          <p className="text-muted-fg">{STARR_ANCHORS[k][score]}</p>
        )}
        {note && <p className="mt-0.5 text-xs text-muted-fg">{note}</p>}
      </div>
    </div>
  );
}

export function QuestionBreakdown({
  report,
  turns,
  plan,
  mode,
  roleTitle,
}: {
  report: SessionReport;
  turns: ReportTurn[];
  plan?: InterviewPlan | null;
  mode: "practice" | "business";
  roleTitle: string;
}) {
  const [open, setOpen] = useState<number | null>(report.questions[0]?.seq ?? null);
  const compName = (key: string | null) => plan?.competencies.find((c) => c.key === key)?.name ?? key ?? "";
  const intro = turns.find((t) => t.kind === "intro" && t.answer);
  return (
    <div className="space-y-3">
      {intro && (
        <Card className="p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-fg">Warm-up (not scored)</p>
          <p className="mt-1 font-semibold text-fg-strong">{intro.question}</p>
          <p className="mt-2 text-sm text-fg">{intro.answer}</p>
        </Card>
      )}
      {report.questions.map((q, idx) => {
        const main = turns.find((t) => t.seq === q.seq);
        const follow = turns.filter((t) => t.parent_seq === q.seq);
        const coaching = report.narrative.questionCoaching.find((c) => c.seq === q.seq)?.outline;
        const isOpen = open === q.seq;
        const tone = scoreTone(q.score);
        return (
          <Card key={q.seq} className="overflow-hidden">
            <button type="button" className="flex w-full items-start gap-4 p-5 text-left" onClick={() => setOpen(isOpen ? null : q.seq)} aria-expanded={isOpen}>
              <span className="flex size-12 shrink-0 flex-col items-center justify-center rounded-xl bg-primary-soft">
                <span className="text-lg font-extrabold leading-none tabular-nums text-primary">{q.score}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2 text-xs font-semibold text-muted-fg">
                  Question {idx + 1}
                  {q.competency && <Badge tone="neutral">{compName(q.competency)}</Badge>}
                  <Badge tone={tone}>{scoreLabel(q.score)}</Badge>
                  {follow.length > 0 && <span>· {follow.length} follow-up{follow.length > 1 ? "s" : ""}</span>}
                  {main?.flags?.includes("recycled_answer") && <Badge tone="warning">Reused answer</Badge>}
                </span>
                <span className="mt-1 block font-semibold text-fg-strong">{q.question}</span>
              </span>
              <CaretDown size={20} className={clsx("mt-1 shrink-0 text-muted-fg transition-transform duration-200", isOpen && "rotate-180")} />
            </button>
            {isOpen && main && (
              <div className="space-y-5 border-t border-border-soft p-5">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-fg">{mode === "practice" ? "Your answer" : "Answer"} {main.answer_mode === "text" && "(typed)"}</p>
                  <p className="mt-1 whitespace-pre-line text-[15px] leading-relaxed text-fg">{main.answer || "—"}</p>
                </div>
                {follow.map((f) => (
                  <div key={f.seq} className="rounded-xl bg-surface-2 p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-primary">Follow-up</p>
                    <p className="mt-1 font-semibold text-fg-strong">{f.question}</p>
                    <p className="mt-2 whitespace-pre-line text-sm text-fg">{f.answer || "—"}</p>
                  </div>
                ))}
                {main.analysis && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-muted-fg">STARR breakdown (best across main answer and follow-ups)</p>
                    <div className="mt-1 divide-y divide-border-soft">
                      {STARR_KEYS.map((k) => {
                        const best = [main, ...follow].map((t) => t.analysis?.starr?.[k]).filter(Boolean).sort((a, b) => (b!.score ?? 0) - (a!.score ?? 0))[0];
                        return <ComponentRow key={k} k={k} score={q.starr[k]} evidence={best?.evidence ?? ""} note={best?.note ?? ""} />;
                      })}
                    </div>
                  </div>
                )}
                <div className="grid gap-4 md:grid-cols-2">
                  {(main.analysis?.strengths?.length ?? 0) > 0 && (
                    <div>
                      <p className="text-sm font-bold text-success">What worked</p>
                      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-fg">
                        {main.analysis!.strengths.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {(main.analysis?.improvements?.length ?? 0) > 0 && (
                    <div>
                      <p className="text-sm font-bold text-warning">{mode === "practice" ? "To make it stronger" : "Gaps"}</p>
                      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-fg">
                        {main.analysis!.improvements.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                {mode === "business" && main.analysis && main.analysis.authenticity.signals.length > 0 && (
                  <div className="rounded-xl bg-warning-bg p-4 text-sm text-warning">
                    <p className="font-bold">Authenticity signals ({Math.round(main.analysis.authenticity.aiLikelihood * 100)}% likelihood of a scripted answer)</p>
                    <ul className="mt-1 list-disc pl-5">
                      {main.analysis.authenticity.signals.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {mode === "practice" && coaching && (
                  <div className="rounded-xl border border-primary/30 bg-primary-soft p-4">
                    <p className="flex items-center gap-2 text-sm font-bold text-primary">
                      <Sparkle size={16} weight="fill" /> A stronger version, built from your story
                    </p>
                    <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-fg-strong">{coaching}</p>
                  </div>
                )}
                {mode === "practice" && (
                  <Link
                    to={`/practice/new?q=${encodeURIComponent(q.question)}&role=${encodeURIComponent(roleTitle)}`}
                    className="inline-flex min-h-10 items-center gap-2 rounded-lg px-1 text-sm font-semibold text-primary hover:underline"
                  >
                    <ArrowsClockwise size={18} /> Practise this question again
                  </Link>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

export function EngineNote({ engine }: { engine: SessionReport["engine"] }) {
  return (
    <p className="flex items-center gap-1.5 text-xs text-muted-fg">
      <Gauge size={14} />
      {engine === "claude" ? "Analysed by Claude with a fixed STARR rubric." : "Analysed by VocalHire's built-in STARR engine."}
    </p>
  );
}
