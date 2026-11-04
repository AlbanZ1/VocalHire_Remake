import { useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { ArrowRight, CaretDown, Heart, Lightning, Scales, Target } from "@phosphor-icons/react";
import { clsx } from "clsx";
import { api } from "@/lib/api";
import { sessionTokens } from "@/lib/sessionTokens";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Badge";
import { Field, Input, RadioCards, Segmented, Select, Switch, Textarea } from "@/components/ui/Field";
import { PageHeader } from "@/components/layout/Shells";
import { listCompetencies } from "../../supabase/functions/_shared/questionBank.ts";
import type { InterviewConfig } from "../../supabase/functions/_shared/types.ts";

const ROLE_SUGGESTIONS = ["Software Engineer", "Product Manager", "Customer Support Specialist", "Sales Representative", "Data Analyst", "Marketing Coordinator", "Registered Nurse", "Teacher", "Project Manager", "Graduate / Internship"];

const LENGTHS = {
  short: { label: "Short", description: "3+ questions · ~10 min", min: 3, max: 5 },
  standard: { label: "Standard", description: "4+ questions · ~15 min", min: 4, max: 7 },
  long: { label: "Thorough", description: "6+ questions · ~25 min", min: 6, max: 10 },
} as const;

export default function PracticeSetup() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const drillQuestion = params.get("q");
  const [role, setRole] = useState(params.get("role") ?? profile?.target_role ?? "");
  const [seniority, setSeniority] = useState<InterviewConfig["seniority"]>((params.get("seniority") as InterviewConfig["seniority"]) ?? "mid");
  const [company, setCompany] = useState("");
  const [persona, setPersona] = useState<InterviewConfig["persona"]>("supportive");
  const [style, setStyle] = useState<InterviewConfig["style"]>("mixed");
  const [difficulty, setDifficulty] = useState<InterviewConfig["difficulty"]>("standard");
  const [length, setLength] = useState<keyof typeof LENGTHS>("standard");
  const [liveFeedback, setLiveFeedback] = useState(true);
  const [intro, setIntro] = useState(true);
  const [jd, setJd] = useState("");
  const [resume, setResume] = useState("");
  const [focus, setFocus] = useState<string[]>([]);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);
  const competencies = useMemo(() => listCompetencies(), []);
  const roleRef = useRef<HTMLInputElement>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (role.trim().length < 2) {
      setRoleError("Tell us which role you're practising for.");
      roleRef.current?.focus();
      return;
    }
    setRoleError(null);
    setBusy(true);
    setError(null);
    try {
      const len = LENGTHS[length];
      const r = await api.createPractice(
        drillQuestion
          ? { roleTitle: role.trim(), seniority, persona, difficulty, style, includeIntro: false, minMainQuestions: 1, maxMainQuestions: 1, maxFollowUps: 2, fixedFirstQuestion: drillQuestion }
          : {
              roleTitle: role.trim(),
              seniority,
              persona,
              style,
              difficulty,
              minMainQuestions: len.min,
              maxMainQuestions: len.max,
              includeIntro: intro,
              companyName: company.trim() || undefined,
              jobDescription: jd.trim() || undefined,
              resumeSummary: resume.trim() || undefined,
              focusCompetencies: focus.length ? focus : undefined,
              ...(liveFeedback ? {} : { showLiveFeedback: false }),
            },
      );
      sessionTokens.save(r.sessionId, { token: r.token, mode: "practice", role: role.trim(), createdAt: new Date().toISOString() });
      navigate(`/interview/${r.sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the interview.");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <PageHeader
        eyebrow={drillQuestion ? "Focused drill" : "New practice interview"}
        title={drillQuestion ? "Practise this question again" : "Set up your interview"}
        description={drillQuestion ? `“${drillQuestion}”` : "Takes a few seconds. You can speak or type your answers, and pause at any time."}
      />
      <form onSubmit={submit} className="mt-8 space-y-6" noValidate>
        <Card className="space-y-5 p-6">
          <Field label="Role you're interviewing for" error={roleError} required>
            {({ id, describedBy, invalid }) => (
              <Input id={id} ref={roleRef} value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Junior UX Designer" autoComplete="organization-title" aria-describedby={describedBy} aria-invalid={invalid} />
            )}
          </Field>
          {!drillQuestion && (
            <div className="-mt-2 flex flex-wrap gap-2" aria-label="Role suggestions">
              {ROLE_SUGGESTIONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={clsx("min-h-9 rounded-full border px-3 text-sm font-medium transition-colors duration-200", role === r ? "border-primary bg-primary-soft text-primary" : "border-border-soft text-muted-fg hover:border-border hover:text-fg-strong")}
                >
                  {r}
                </button>
              ))}
            </div>
          )}
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Experience level">
              {({ id }) => (
                <Select id={id} value={seniority} onChange={(e) => setSeniority(e.target.value as InterviewConfig["seniority"])}>
                  <option value="entry">Entry level / student</option>
                  <option value="junior">Junior (1–2 years)</option>
                  <option value="mid">Mid-level (3–5 years)</option>
                  <option value="senior">Senior (5+ years)</option>
                  <option value="lead">Lead / Principal</option>
                  <option value="executive">Executive</option>
                </Select>
              )}
            </Field>
            {!drillQuestion && (
              <Field label="Company (optional)" hint="Adds realism to the questions.">
                {({ id, describedBy }) => <Input id={id} value={company} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. Acme Health" aria-describedby={describedBy} />}
              </Field>
            )}
          </div>
        </Card>

        <Card className="space-y-6 p-6">
          <RadioCards
            name="persona"
            legend="Interviewer style"
            value={persona}
            onChange={setPersona}
            options={[
              { value: "supportive", label: "Supportive", description: "Warm and encouraging. Great for building confidence.", icon: <Heart size={20} /> },
              { value: "neutral", label: "Professional", description: "Polite and neutral, like most real interviews.", icon: <Scales size={20} /> },
              { value: "challenging", label: "Challenging", description: "Brisk, probing follow-ups. For when you're ready.", icon: <Lightning size={20} /> },
            ]}
          />
          {!drillQuestion && (
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-semibold text-fg-strong">Question type</p>
                <Segmented
                  label="Question type"
                  value={style}
                  onChange={setStyle}
                  options={[
                    { value: "behavioral", label: "Past examples" },
                    { value: "mixed", label: "Mixed" },
                    { value: "situational", label: "Scenarios" },
                  ]}
                />
              </div>
              <div>
                <p className="mb-2 text-sm font-semibold text-fg-strong">Difficulty</p>
                <Segmented
                  label="Difficulty"
                  value={difficulty}
                  onChange={setDifficulty}
                  options={[
                    { value: "easy", label: "Gentle" },
                    { value: "standard", label: "Standard" },
                    { value: "hard", label: "Tough" },
                  ]}
                />
              </div>
            </div>
          )}
          {!drillQuestion && (
            <RadioCards
              name="length"
              legend="Interview length"
              value={length}
              onChange={setLength}
              options={(Object.keys(LENGTHS) as (keyof typeof LENGTHS)[]).map((k) => ({ value: k, label: LENGTHS[k].label, description: LENGTHS[k].description, icon: <Target size={20} /> }))}
            />
          )}
          {!drillQuestion && (
            <div className="space-y-4 border-t border-border-soft pt-5">
              <Switch checked={liveFeedback} onChange={setLiveFeedback} label="Coaching notes during the interview" description="A short note and STARR checklist after each story. Turn off for a more realistic run." />
              <Switch checked={intro} onChange={setIntro} label="Start with a warm-up question" description={"\"Tell me about yourself\" — unscored, to help you settle in."} />
            </div>
          )}
        </Card>

        {!drillQuestion && (
          <Card className="p-6">
            <button type="button" onClick={() => setMore((v) => !v)} className="flex w-full items-center justify-between gap-3 text-left" aria-expanded={more}>
              <span>
                <span className="block font-bold text-fg-strong">Tailor it to a real job (optional)</span>
                <span className="text-sm text-muted-fg">Paste a job description or your background, and choose focus areas.</span>
              </span>
              <CaretDown size={20} className={clsx("shrink-0 transition-transform duration-200", more && "rotate-180")} />
            </button>
            {more && (
              <div className="mt-5 space-y-5">
                <Field label="Job description" hint="The interviewer will pick competencies and scenarios from it.">
                  {({ id, describedBy }) => <Textarea id={id} rows={6} maxLength={6000} value={jd} onChange={(e) => setJd(e.target.value)} aria-describedby={describedBy} placeholder="Paste the job posting…" />}
                </Field>
                <Field label="Your background" hint="A few lines about your experience so questions fit you.">
                  {({ id, describedBy }) => <Textarea id={id} rows={4} maxLength={3000} value={resume} onChange={(e) => setResume(e.target.value)} aria-describedby={describedBy} placeholder="e.g. 3 years in retail management, now moving into HR…" />}
                </Field>
                <fieldset>
                  <legend className="mb-2 text-sm font-semibold text-fg-strong">Focus areas (up to 3)</legend>
                  <div className="flex flex-wrap gap-2">
                    {competencies.map((c) => {
                      const on = focus.includes(c.name);
                      return (
                        <button
                          key={c.key}
                          type="button"
                          aria-pressed={on}
                          disabled={!on && focus.length >= 3}
                          onClick={() => setFocus((f) => (on ? f.filter((x) => x !== c.name) : [...f, c.name]))}
                          title={c.description}
                          className={clsx("min-h-9 rounded-full border px-3 text-sm font-medium transition-colors duration-200 disabled:opacity-40", on ? "border-primary bg-primary-soft text-primary" : "border-border-soft text-muted-fg hover:border-border hover:text-fg-strong")}
                        >
                          {c.name}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              </div>
            )}
          </Card>
        )}

        {error && <Alert tone="danger">{error}</Alert>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-fg">Next: a quick microphone check, then the interviewer will greet you.</p>
          <Button type="submit" variant="cta" size="lg" loading={busy} icon={<ArrowRight size={20} />}>
            Continue
          </Button>
        </div>
      </form>
    </div>
  );
}
