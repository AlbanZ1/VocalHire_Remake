import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { ArrowRight, CaretDown, FileMagnifyingGlass, Heart, Lightning, Scales, Sparkle, Target } from "@phosphor-icons/react";
import { clsx } from "clsx";
import { api, type CvProfile, type JobProfile } from "@/lib/api";
import { sessionTokens } from "@/lib/sessionTokens";
import { reviewTokens } from "@/lib/reviewTokens";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { Field, Input, RadioCards, Segmented, Select, Switch } from "@/components/ui/Field";
import { PageHeader } from "@/components/layout/Shells";
import { DocumentInput } from "@/components/documents/DocumentInput";
import { CvProfileCard, JobProfileCard } from "@/components/documents/CvParts";
import { listCompetencies } from "../../supabase/functions/_shared/questionBank.ts";
import type { InterviewConfig } from "../../supabase/functions/_shared/types.ts";

const ROLE_SUGGESTIONS = ["Software Engineer", "Product Manager", "Customer Support Specialist", "Sales Representative", "Data Analyst", "Marketing Coordinator", "Registered Nurse", "Teacher", "Project Manager", "Graduate / Internship"];

const LENGTHS = {
  short: { label: "Short", description: "3+ questions · ~10 min", min: 3, max: 5 },
  standard: { label: "Standard", description: "4+ questions · ~15 min", min: 4, max: 7 },
  long: { label: "Thorough", description: "6+ questions · ~25 min", min: 6, max: 10 },
} as const;

const MAX_CV = 20000;
const MAX_JOB = 15000;

interface Prefill {
  cvText?: string;
  jobText?: string;
  roleTitle?: string;
  companyName?: string;
}

/** Analyse a document shortly after it stops changing; returns the latest profile. */
function useAnalysis<T>(text: string, minChars: number, run: (t: string) => Promise<T | null>) {
  const [result, setResult] = useState<T | null>(null);
  const [busy, setBusy] = useState(false);
  const last = useRef("");
  useEffect(() => {
    const t = text.trim();
    if (t.length < minChars) {
      setResult(null);
      last.current = "";
      return;
    }
    if (t === last.current) return;
    let alive = true;
    const timer = setTimeout(() => {
      last.current = t;
      setBusy(true);
      run(t)
        .then((r) => alive && setResult(r))
        .catch(() => alive && setResult(null))
        .finally(() => alive && setBusy(false));
    }, 900);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, minChars]);
  return { result, busy };
}

export default function PracticeSetup() {
  const [params] = useSearchParams();
  const location = useLocation();
  const prefill = (location.state ?? {}) as Prefill;
  const navigate = useNavigate();
  const { profile } = useAuth();
  const drillQuestion = params.get("q");
  const [role, setRole] = useState(prefill.roleTitle ?? params.get("role") ?? profile?.target_role ?? "");
  const [seniority, setSeniority] = useState<InterviewConfig["seniority"]>((params.get("seniority") as InterviewConfig["seniority"]) ?? "mid");
  const [company, setCompany] = useState(prefill.companyName ?? "");
  const [name, setName] = useState(profile?.full_name ?? "");
  const [cvText, setCvText] = useState(prefill.cvText ?? "");
  const [jobText, setJobText] = useState(prefill.jobText ?? "");
  const [persona, setPersona] = useState<InterviewConfig["persona"]>("supportive");
  const [style, setStyle] = useState<InterviewConfig["style"]>("mixed");
  const [difficulty, setDifficulty] = useState<InterviewConfig["difficulty"]>("standard");
  const [length, setLength] = useState<keyof typeof LENGTHS>("standard");
  const [liveFeedback, setLiveFeedback] = useState(true);
  const [intro, setIntro] = useState(true);
  const [focus, setFocus] = useState<string[]>([]);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);
  const competencies = useMemo(() => listCompetencies(), []);
  const roleRef = useRef<HTMLInputElement>(null);
  const touched = useRef({ role: !!(prefill.roleTitle || params.get("role")), company: !!prefill.companyName, seniority: !!params.get("seniority"), name: false });

  const cv = useAnalysis<CvProfile>(cvText, 80, async (t) => (await api.analyzeDocuments({ cvText: t })).cv);
  const job = useAnalysis<JobProfile>(jobText, 60, async (t) => (await api.analyzeDocuments({ jobText: t })).job);

  // Fill in the obvious fields from the documents, without overwriting anything the user typed.
  useEffect(() => {
    if (cv.result?.name && !touched.current.name) setName(cv.result.name);
  }, [cv.result]);
  useEffect(() => {
    const j = job.result;
    if (!j) return;
    if (j.title && !touched.current.role) setRole(j.title);
    if (j.company && !touched.current.company) setCompany(j.company);
    if (j.seniority && !touched.current.seniority) setSeniority(j.seniority);
  }, [job.result]);

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
          ? { roleTitle: role.trim(), seniority, persona, difficulty, style, includeIntro: false, minMainQuestions: 1, maxMainQuestions: 1, maxFollowUps: 2, fixedFirstQuestion: drillQuestion, candidateName: name.trim() || undefined }
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
              candidateName: name.trim() || undefined,
              jobDescription: jobText.trim() || undefined,
              focusCompetencies: focus.length ? focus : undefined,
              ...(liveFeedback ? {} : { showLiveFeedback: false }),
            },
        drillQuestion ? undefined : cvText.trim() || undefined,
      );
      sessionTokens.save(r.sessionId, { token: r.token, mode: "practice", role: role.trim(), createdAt: new Date().toISOString() });
      navigate(`/interview/${r.sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the interview.");
      setBusy(false);
    }
  }

  async function reviewFirst() {
    setReviewing(true);
    setError(null);
    try {
      const r = await api.reviewCv({ cvText, jobText: jobText || undefined });
      reviewTokens.save(r.id, { token: r.token, role: r.review.roleTitle, company: r.review.company, matchScore: r.review.matchScore, qualityScore: r.review.qualityScore, createdAt: new Date().toISOString() });
      navigate(`/cv-review/${r.id}`, { state: { review: r.review, cvText, jobText } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't review your CV.");
      setReviewing(false);
    }
  }

  const analysing = cv.busy || job.busy;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <PageHeader
        eyebrow={drillQuestion ? "Focused drill" : "New practice interview"}
        title={drillQuestion ? "Practise this question again" : "Set up your interview"}
        description={drillQuestion ? `“${drillQuestion}”` : "Add your CV and the job you want for a tailored interview — or just pick a role. You can speak or type your answers."}
      />
      <form onSubmit={submit} className="mt-8 space-y-6" noValidate>
        {!drillQuestion && (
          <Card className="space-y-6 p-6">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-bold text-fg-strong">
                <Sparkle size={20} className="text-primary" aria-hidden="true" /> Make it about you
              </h2>
              <p className="mt-1 text-sm text-muted-fg">With your CV, the interviewer greets you by name and asks about your own experience. With the job posting, questions target exactly what the role asks for.</p>
            </div>
            <DocumentInput label="Your CV" kind="cv" value={cvText} onChange={setCvText} maxChars={MAX_CV} hint="Read on your device; only the text is sent. It's used for this interview and stays private to you." />
            {cv.busy && (
              <p className="flex items-center gap-2 text-sm text-muted-fg">
                <Spinner className="size-4" /> Reading your CV…
              </p>
            )}
            {cv.result && !cv.busy && <CvProfileCard cv={cv.result} />}
            <DocumentInput
              label="The job posting"
              kind="job"
              value={jobText}
              onChange={setJobText}
              maxChars={MAX_JOB}
              preferPaste
              hint="Any text works: a job board listing, the company's careers page, a recruiter's email or a PDF."
            />
            {job.busy && (
              <p className="flex items-center gap-2 text-sm text-muted-fg">
                <Spinner className="size-4" /> Reading the job posting…
              </p>
            )}
            {job.result && !job.busy && <JobProfileCard job={job.result} />}
            {cvText.trim().length >= 80 && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-primary-soft/60 px-4 py-3">
                <p className="text-sm text-fg">{jobText.trim() ? "Want to fix your CV for this job first?" : "Want feedback on your CV first?"}</p>
                <Button variant="outline" size="sm" onClick={reviewFirst} loading={reviewing} icon={<FileMagnifyingGlass size={16} />}>
                  Review my CV
                </Button>
              </div>
            )}
          </Card>
        )}

        <Card className="space-y-5 p-6">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Role you're interviewing for" error={roleError} required>
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  ref={roleRef}
                  value={role}
                  onChange={(e) => {
                    touched.current.role = true;
                    setRole(e.target.value);
                  }}
                  placeholder="e.g. Junior UX Designer"
                  autoComplete="organization-title"
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                />
              )}
            </Field>
            <Field label="Your first name (optional)" hint="So the interviewer can address you.">
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  value={name}
                  maxLength={80}
                  onChange={(e) => {
                    touched.current.name = true;
                    setName(e.target.value);
                  }}
                  placeholder="e.g. Sam"
                  autoComplete="given-name"
                  aria-describedby={describedBy}
                />
              )}
            </Field>
          </div>
          {!drillQuestion && !jobText.trim() && (
            <div className="-mt-2 flex flex-wrap gap-2" aria-label="Role suggestions">
              {ROLE_SUGGESTIONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    touched.current.role = true;
                    setRole(r);
                  }}
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
                <Select
                  id={id}
                  value={seniority}
                  onChange={(e) => {
                    touched.current.seniority = true;
                    setSeniority(e.target.value as InterviewConfig["seniority"]);
                  }}
                >
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
                {({ id, describedBy }) => (
                  <Input
                    id={id}
                    value={company}
                    onChange={(e) => {
                      touched.current.company = true;
                      setCompany(e.target.value);
                    }}
                    placeholder="e.g. Acme Health"
                    aria-describedby={describedBy}
                  />
                )}
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
              <Switch checked={intro} onChange={setIntro} label="Start with a warm-up question" description={cvText.trim() ? "A short, unscored opener about your background, to help you settle in." : "\"Tell me about yourself\" — unscored, to help you settle in."} />
            </div>
          )}
        </Card>

        {!drillQuestion && (
          <Card className="p-6">
            <button type="button" onClick={() => setMore((v) => !v)} className="flex w-full items-center justify-between gap-3 text-left" aria-expanded={more}>
              <span>
                <span className="block font-bold text-fg-strong">Choose focus areas (optional)</span>
                <span className="text-sm text-muted-fg">{job.result?.competencies.length ? "We'll use the job posting's focus unless you pick your own." : "Pick up to 3 skills you want to be asked about."}</span>
              </span>
              <CaretDown size={20} className={clsx("shrink-0 transition-transform duration-200", more && "rotate-180")} />
            </button>
            {more && (
              <fieldset className="mt-5">
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
            )}
          </Card>
        )}

        {error && <Alert tone="danger">{error}</Alert>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-fg">Next: a quick microphone check, then the interviewer will greet you.</p>
          <Button type="submit" variant="cta" size="lg" loading={busy} disabled={analysing && !busy} icon={<ArrowRight size={20} />}>
            {analysing ? "Reading documents…" : "Continue"}
          </Button>
        </div>
      </form>
    </div>
  );
}
