import { useState, type ReactNode } from "react";
import { Briefcase, Check, CheckCircle, Copy, IdentificationCard, Lightbulb, ListChecks, MinusCircle, Quotes, ShieldWarning, Target, WarningCircle, XCircle } from "@phosphor-icons/react";
import { clsx } from "clsx";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { ScoreRing } from "@/components/report/Charts";
import { useToast } from "@/components/ui/Toast";
import { SENIORITY_LABELS } from "@/lib/format";
import type { CvProfile, CvReview, JobProfile } from "@/lib/api";

function Chips({ items, max = 10, tone = "neutral" }: { items: string[]; max?: number; tone?: "neutral" | "info" | "danger" }) {
  if (!items.length) return null;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.slice(0, max).map((s) => (
        <li key={s}>
          <Badge tone={tone} className="whitespace-normal">
            {s}
          </Badge>
        </li>
      ))}
      {items.length > max && <li className="self-center text-xs text-muted-fg">+{items.length - max} more</li>}
    </ul>
  );
}

/** What VocalHire understood from a CV. */
export function CvProfileCard({ cv, title = "What we picked up from the CV", className }: { cv: CvProfile; title?: string; className?: string }) {
  return (
    <div className={clsx("rounded-xl border border-border-soft bg-muted/40 p-4", className)} data-testid="cv-profile">
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-fg">
        <IdentificationCard size={16} aria-hidden="true" /> {title}
      </p>
      <p className="mt-2 text-base font-bold text-fg-strong">{cv.name ?? "Name not found"}</p>
      {(cv.headline || cv.yearsExperience !== null) && (
        <p className="text-sm text-muted-fg">
          {cv.headline}
          {cv.headline && cv.yearsExperience !== null ? " · " : ""}
          {cv.yearsExperience !== null ? `about ${cv.yearsExperience} year${cv.yearsExperience === 1 ? "" : "s"} of experience` : ""}
        </p>
      )}
      {cv.roles.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {cv.roles.slice(0, 3).map((r) => (
            <li key={`${r.title}-${r.period}`} className="flex flex-wrap gap-x-1.5">
              <span className="font-semibold text-fg-strong">{r.title}</span>
              {r.organization && <span className="text-muted-fg">· {r.organization}</span>}
              {r.period && <span className="text-muted-fg">· {r.period}</span>}
            </li>
          ))}
        </ul>
      )}
      {cv.skills.length > 0 && (
        <div className="mt-3">
          <Chips items={cv.skills} max={8} />
        </div>
      )}
    </div>
  );
}

/** What VocalHire understood from a job posting. */
export function JobProfileCard({ job, className }: { job: JobProfile; className?: string }) {
  return (
    <div className={clsx("rounded-xl border border-border-soft bg-muted/40 p-4", className)} data-testid="job-profile">
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-fg">
        <Briefcase size={16} aria-hidden="true" /> What the job asks for
      </p>
      <p className="mt-2 text-base font-bold text-fg-strong">
        {job.title ?? "Untitled role"}
        {job.company && <span className="font-medium text-muted-fg"> at {job.company}</span>}
      </p>
      {job.seniority && <p className="text-sm text-muted-fg">{SENIORITY_LABELS[job.seniority] ?? job.seniority} level</p>}
      {job.requirements.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
          {job.requirements.slice(0, 4).map((r) => (
            <li key={r}>{r}</li>
          ))}
          {job.requirements.length > 4 && <li className="list-none text-xs text-muted-fg">+{job.requirements.length - 4} more requirements</li>}
        </ul>
      )}
      {job.competencies.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-xs font-semibold text-muted-fg">The interview will focus on</p>
          <Chips items={job.competencies} max={6} tone="info" />
        </div>
      )}
    </div>
  );
}

const STATUS = {
  met: { label: "Met", tone: "success" as const, icon: <CheckCircle size={18} weight="fill" className="text-success" aria-hidden="true" /> },
  partial: { label: "Partly", tone: "warning" as const, icon: <MinusCircle size={18} weight="fill" className="text-warning" aria-hidden="true" /> },
  missing: { label: "Missing", tone: "danger" as const, icon: <XCircle size={18} weight="fill" className="text-destructive" aria-hidden="true" /> },
};

const PRIORITY = { high: { label: "High impact", tone: "danger" as const }, medium: { label: "Medium", tone: "warning" as const }, low: { label: "Polish", tone: "neutral" as const } };

function CopyButton({ text, label }: { text: string; label: string }) {
  const toast = useToast();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        } catch {
          toast("Couldn't copy — select the text and copy it manually.", "error");
        }
      }}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-primary hover:bg-primary-soft"
      aria-label={label}
    >
      {done ? <Check size={14} /> : <Copy size={14} />}
      {done ? "Copied" : "Copy"}
    </button>
  );
}

function Section({ icon, title, children, className }: { icon: ReactNode; title: string; children: ReactNode; className?: string }) {
  return (
    <Card className={clsx("p-5 sm:p-6", className)}>
      <h2 className="flex items-center gap-2 text-lg font-bold text-fg-strong">
        <span className="text-primary" aria-hidden="true">
          {icon}
        </span>
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </Card>
  );
}

/** Highlights [placeholders] the candidate must fill in. */
function WithPlaceholders({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]{1,60}\])/g);
  return (
    <>
      {parts.map((p, i) =>
        /^\[.*\]$/.test(p) ? (
          <mark key={i} className="rounded bg-warning-bg px-1 text-warning">
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

/**
 * A CV review. `audience="candidate"` coaches the CV's owner; `audience="employer"` shows the
 * same evidence as a neutral fit summary for a hiring team.
 */
export function CvReviewView({ review, audience = "candidate", compact = false }: { review: CvReview; audience?: "candidate" | "employer"; compact?: boolean }) {
  const you = audience === "candidate";
  const met = review.coverage.filter((c) => c.status === "met").length;
  const failed = review.checks.filter((c) => !c.ok);
  return (
    <div className="space-y-5" data-testid="cv-review">
      <Card className="p-5 sm:p-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <div className="flex justify-center gap-6">
            {review.matchScore !== null && <ScoreRing value={review.matchScore} label="Job match" sublabel={`${met} of ${review.coverage.length} requirements`} size={compact ? 112 : 132} />}
            <ScoreRing value={review.qualityScore} label="CV quality" sublabel={`${review.checks.length - failed.length} of ${review.checks.length} checks`} size={compact ? 112 : 132} />
          </div>
          <div className="min-w-0 flex-1">
            {(review.roleTitle || review.company) && (
              <p className="text-sm font-semibold text-primary">
                {review.roleTitle ?? "This role"}
                {review.company ? ` · ${review.company}` : ""}
              </p>
            )}
            <p className="mt-1 text-xl font-extrabold text-fg-strong">{review.verdict}</p>
            <p className="mt-2 leading-relaxed text-fg">{review.summary}</p>
            {review.injectionDetected && (
              <p className="mt-3 flex items-start gap-2 rounded-lg bg-warning-bg px-3 py-2 text-sm text-warning">
                <ShieldWarning size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
                {you
                  ? "Your CV contains text addressed to an AI system (for example hidden instructions). We ignored it — remove it, because recruiters and screening tools treat it as a red flag."
                  : "The CV contained text addressed to an AI system (for example hidden instructions). It was ignored for this assessment."}
              </p>
            )}
          </div>
        </div>
      </Card>

      {review.hasJob && review.coverage.length > 0 && (
        <Section icon={<ListChecks size={22} />} title={you ? "What the job asks for vs your CV" : "Requirements vs CV"}>
          <ul className="divide-y divide-border-soft">
            {review.coverage.map((c) => {
              const s = STATUS[c.status];
              return (
                <li key={c.requirement} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                  <span className="mt-0.5 shrink-0">{s.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-fg-strong">{c.requirement}</p>
                      <Badge tone={s.tone}>{s.label}</Badge>
                      {c.kind === "nice" && <Badge>Nice to have</Badge>}
                    </div>
                    {c.evidence && (
                      <p className="mt-1 flex gap-1.5 text-sm text-muted-fg">
                        <Quotes size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                        <span className="italic">{c.evidence}</span>
                      </p>
                    )}
                    {c.note && <p className="mt-1 text-sm text-muted-fg">{c.note}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {(review.strengths.length > 0 || review.gaps.length > 0) && (
        <div className="grid gap-5 md:grid-cols-2">
          {review.strengths.length > 0 && (
            <Section icon={<CheckCircle size={22} />} title="Strengths">
              <ul className="space-y-2 text-sm leading-relaxed">
                {review.strengths.map((s) => (
                  <li key={s} className="flex gap-2">
                    <Check size={16} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
                    {s}
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {review.gaps.length > 0 && (
            <Section icon={<WarningCircle size={22} />} title={you ? "Gaps to address" : "Gaps"}>
              <ul className="space-y-2 text-sm leading-relaxed">
                {review.gaps.map((s) => (
                  <li key={s} className="flex gap-2">
                    <WarningCircle size={16} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
                    {s}
                  </li>
                ))}
              </ul>
              {review.missingKeywords.length > 0 && (
                <div className="mt-4">
                  <p className="mb-1.5 text-xs font-semibold text-muted-fg">{you ? "Words from the posting your CV doesn't use (only add them if they're true for you)" : "Posting keywords not in the CV"}</p>
                  <Chips items={review.missingKeywords} max={12} tone="danger" />
                </div>
              )}
            </Section>
          )}
        </div>
      )}

      {you && review.fixes.length > 0 && (
        <Section icon={<Lightbulb size={22} />} title={review.hasJob ? "What to fix for this job" : "What to fix"}>
          <ol className="space-y-4">
            {review.fixes.map((f, i) => (
              <li key={`${f.issue}-${i}`} className="rounded-xl border border-border-soft p-4" data-testid="cv-fix">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex size-6 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary">{i + 1}</span>
                  <Badge tone={PRIORITY[f.priority].tone}>{PRIORITY[f.priority].label}</Badge>
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-fg">{f.area}</span>
                </div>
                <p className="mt-2 font-semibold text-fg-strong">{f.issue}</p>
                <p className="mt-1 text-sm leading-relaxed text-fg">{f.suggestion}</p>
                {f.before && f.after && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-lg bg-danger-bg/60 p-3 text-sm">
                      <p className="text-xs font-bold text-destructive">Now</p>
                      <p className="mt-1 text-fg">{f.before}</p>
                    </div>
                    <div className="rounded-lg bg-success-bg/60 p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-bold text-success">Try</p>
                        <CopyButton text={f.after} label={`Copy suggested rewrite ${i + 1}`} />
                      </div>
                      <p className="mt-1 text-fg">
                        <WithPlaceholders text={f.after} />
                      </p>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ol>
          {review.fixes.some((f) => /\[/.test(f.after)) && <p className="mt-3 text-xs text-muted-fg">Highlighted [brackets] are details only you know — fill them in with real numbers or drop them.</p>}
        </Section>
      )}

      {you && review.tailoredSummary && (
        <Section icon={<Target size={22} />} title={review.hasJob ? "A profile summary tailored to this job" : "A stronger profile summary"}>
          <div className="rounded-xl bg-muted/50 p-4">
            <p className="leading-relaxed text-fg">
              <WithPlaceholders text={review.tailoredSummary} />
            </p>
            <div className="mt-2 flex justify-end">
              <CopyButton text={review.tailoredSummary} label="Copy tailored summary" />
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-fg">Written only from facts in your CV. Edit it so it sounds like you.</p>
        </Section>
      )}

      <div className={clsx("grid gap-5", review.interviewFocus.length > 0 && "md:grid-cols-2")}>
        <Section icon={<ListChecks size={22} />} title={you ? "CV health checks" : "CV checks"}>
          <ul className="space-y-2.5 text-sm">
            {review.checks.map((c) => (
              <li key={c.key} className="flex gap-2.5">
                {c.ok ? <CheckCircle size={18} weight="fill" className="mt-px shrink-0 text-success" aria-label="Passed" /> : <WarningCircle size={18} weight="fill" className="mt-px shrink-0 text-warning" aria-label="Needs work" />}
                <span>
                  <span className="font-semibold text-fg-strong">{c.label}</span>
                  {c.note && <span className="block text-muted-fg">{c.note}</span>}
                </span>
              </li>
            ))}
          </ul>
        </Section>
        {review.interviewFocus.length > 0 && (
          <Section icon={<Target size={22} />} title={you ? "Be ready to talk about" : "Worth probing in the interview"}>
            <ul className="space-y-2 text-sm leading-relaxed">
              {review.interviewFocus.map((s) => (
                <li key={s} className="flex gap-2">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                  {s}
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
      <p className="text-xs text-muted-fg">
        {review.engine === "claude" ? "Reviewed by AI and checked against your CV's own words: evidence must appear in the CV, and scores are calculated by VocalHire, not the AI." : "Reviewed with VocalHire's built-in rules (AI review unavailable right now)."}{" "}
        Treat it as guidance, not a verdict.
      </p>
    </div>
  );
}
