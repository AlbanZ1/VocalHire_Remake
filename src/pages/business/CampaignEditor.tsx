import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import { Eye, LockKey, MagicWand, Plus, Shield, ShieldCheck, ShieldSlash, X } from "@phosphor-icons/react";
import { clsx } from "clsx";
import { supabase } from "@/lib/supabase";
import { api } from "@/lib/api";
import { DocumentInput } from "@/components/documents/DocumentInput";
import { POLLY_VOICES, voiceLabel } from "../../../supabase/functions/_shared/voices.ts";
import { useActiveOrg, type CampaignRow, type CampaignSettings } from "@/lib/org";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Badge";
import { Field, Input, RadioCards, Select, Switch } from "@/components/ui/Field";
import { PageLoader } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "@/components/layout/Shells";
import { listCompetencies, planCompetencies } from "../../../supabase/functions/_shared/questionBank.ts";
import { integrityPreset } from "../../../supabase/functions/_shared/engine.ts";
import type { IntegritySettings, Seniority } from "../../../supabase/functions/_shared/types.ts";

type Level = IntegritySettings["level"];

export default function CampaignEditor() {
  const { campaignId } = useParams();
  const editing = !!campaignId;
  const navigate = useNavigate();
  const toast = useToast();
  const { org } = useActiveOrg();
  const library = useMemo(() => listCompetencies(), []);

  const [loaded, setLoaded] = useState(!editing);
  const [original, setOriginal] = useState<CampaignRow | null>(null);
  const [title, setTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [location, setLocation] = useState("");
  const [seniority, setSeniority] = useState<Seniority>("mid");
  const [description, setDescription] = useState("");
  const [competencies, setCompetencies] = useState<string[]>([]);
  const [custom, setCustom] = useState("");
  const [minQ, setMinQ] = useState(4);
  const [maxQ, setMaxQ] = useState(7);
  const [followUps, setFollowUps] = useState(2);
  const [persona, setPersona] = useState<NonNullable<CampaignSettings["persona"]>>("neutral");
  const [style, setStyle] = useState<NonNullable<CampaignSettings["style"]>>("mixed");
  const [difficulty, setDifficulty] = useState<NonNullable<CampaignSettings["difficulty"]>>("standard");
  const [timeLimit, setTimeLimit] = useState<number | null>(null);
  const [integrity, setIntegrity] = useState<IntegritySettings>(integrityPreset("standard"));
  const [status, setStatus] = useState<CampaignRow["status"]>("active");
  const [closesAt, setClosesAt] = useState("");
  const [cvRequirement, setCvRequirement] = useState<NonNullable<CampaignSettings["cvRequirement"]>>("optional");
  const [suggesting, setSuggesting] = useState(false);
  const [voice, setVoice] = useState<string>("");
  const [naturalVoices, setNaturalVoices] = useState<boolean | null>(null);

  useEffect(() => {
    api
      .engine()
      .then((e) => setNaturalVoices(!!e.tts))
      .catch(() => setNaturalVoices(false));
  }, []);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!campaignId) return;
    supabase
      .from("campaigns")
      .select("*")
      .eq("id", campaignId)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          setError("Couldn't load this interview.");
          setLoaded(true);
          return;
        }
        const c = data as CampaignRow;
        setOriginal(c);
        setTitle(c.title);
        setDepartment(c.department ?? "");
        setLocation(c.location ?? "");
        setSeniority(c.seniority as Seniority);
        setDescription(c.description ?? "");
        setCompetencies(c.competencies ?? []);
        const s = c.settings ?? {};
        setMinQ(s.minMainQuestions ?? 4);
        setMaxQ(s.maxMainQuestions ?? 7);
        setFollowUps(s.maxFollowUps ?? 2);
        setPersona(s.persona ?? "neutral");
        setStyle(s.style ?? "mixed");
        setDifficulty(s.difficulty ?? "standard");
        setTimeLimit(s.timeLimitMinutes ?? null);
        setIntegrity({ ...integrityPreset(s.integrity?.level ?? "standard"), ...(s.integrity ?? {}) } as IntegritySettings);
        setStatus(c.status);
        setClosesAt(c.closes_at ? c.closes_at.slice(0, 10) : "");
        setCvRequirement(s.cvRequirement ?? "optional");
        setVoice(s.voice ?? "");
        setLoaded(true);
      });
  }, [campaignId]);

  const toggleComp = (name: string) =>
    setCompetencies((cs) => (cs.includes(name) ? cs.filter((c) => c !== name) : cs.length >= 6 ? cs : [...cs, name]));

  const suggest = async () => {
    // With a job posting, read it (any format) and take the competencies it actually asks for.
    if (description.trim().length >= 60) {
      setSuggesting(true);
      try {
        const { job } = await api.analyzeDocuments({ jobText: description });
        if (job) {
          const t = title.trim() || job.title || "";
          if (!title.trim() && job.title) setTitle(job.title);
          if (job.seniority) setSeniority(job.seniority);
          const fromJob = planCompetencies(t, job.seniority ?? seniority, job.competencies, 5).map((c) => c.name);
          setCompetencies(fromJob);
          setErrors((e) => ({ ...e, title: "", competencies: "" }));
          toast("Suggested from the job posting — adjust as you like", "success");
          return;
        }
      } catch (e) {
        toast(e instanceof Error ? e.message : "Couldn't read the job posting.", "error");
      } finally {
        setSuggesting(false);
      }
    }
    if (title.trim().length < 2) {
      setErrors((e) => ({ ...e, title: "Enter the job title or a job posting first so we can suggest competencies." }));
      return;
    }
    setCompetencies(planCompetencies(title, seniority, [], 5).map((c) => c.name));
  };

  const setLevel = (l: Level) => setIntegrity(integrityPreset(l));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (title.trim().length < 2) errs.title = "Enter the job title.";
    if (competencies.length < 2) errs.competencies = "Choose at least two competencies to assess.";
    if (maxQ < minQ) errs.questions = "The maximum can't be lower than the minimum.";
    setErrors(errs);
    if (Object.keys(errs).length) {
      document.querySelector<HTMLElement>("[aria-invalid=true]")?.focus();
      return;
    }
    if (!org) return;
    setBusy(true);
    setError(null);
    const competenciesChanged = original && JSON.stringify(original.competencies) !== JSON.stringify(competencies);
    const settings: CampaignSettings = {
      ...(original?.settings ?? {}),
      persona,
      style,
      difficulty,
      minMainQuestions: minQ,
      maxMainQuestions: maxQ,
      maxFollowUps: followUps,
      timeLimitMinutes: timeLimit,
      integrity,
      cvRequirement,
      voice: voice || null,
    };
    // Competencies and the job profile are frozen at the first applicant; changing them starts fresh.
    const descriptionChanged = original && (original.description ?? "") !== description.trim();
    if (competenciesChanged || descriptionChanged || !original) delete settings.plan;
    if (descriptionChanged || !original) delete settings.jobProfile;
    const payload = {
      title: title.trim(),
      department: department.trim() || null,
      location: location.trim() || null,
      seniority,
      description: description.trim() || null,
      competencies,
      settings,
      status,
      closes_at: closesAt ? new Date(`${closesAt}T23:59:59`).toISOString() : null,
    };
    const res = editing
      ? await supabase.from("campaigns").update(payload).eq("id", campaignId!).select("id").single()
      : await supabase.from("campaigns").insert({ ...payload, org_id: org.org_id }).select("id").single();
    setBusy(false);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    toast(editing ? "Interview updated" : "Interview created — share the link with applicants", "success");
    navigate(`/business/campaigns/${res.data.id}`);
  }

  if (!loaded) return <PageLoader />;

  const libraryNames = library.map((c) => c.name);
  const customs = competencies.filter((c) => !libraryNames.includes(c));

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <PageHeader eyebrow={editing ? "Edit interview" : "New interview"} title={editing ? title || "Edit interview" : "Create a hiring interview"} description="Every applicant gets the same structured, adaptive interview, scored on the competencies you choose." />
      <form onSubmit={submit} className="mt-8 space-y-6" noValidate>
        <Card>
          <CardHeader title="The role" />
          <div className="grid gap-5 p-6 sm:grid-cols-2">
            <Field label="Job title" error={errors.title} required className="sm:col-span-2">
              {({ id, describedBy, invalid }) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Customer Success Manager" aria-describedby={describedBy} aria-invalid={invalid} />}
            </Field>
            <Field label="Department">
              {({ id }) => <Input id={id} value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. Support" />}
            </Field>
            <Field label="Location">
              {({ id }) => <Input id={id} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Remote (EU)" />}
            </Field>
            <Field label="Seniority">
              {({ id }) => (
                <Select id={id} value={seniority} onChange={(e) => setSeniority(e.target.value as Seniority)}>
                  <option value="entry">Entry level</option>
                  <option value="junior">Junior</option>
                  <option value="mid">Mid-level</option>
                  <option value="senior">Senior</option>
                  <option value="lead">Lead / Principal</option>
                  <option value="executive">Executive</option>
                </Select>
              )}
            </Field>
            <Field label="Status">
              {({ id }) => (
                <Select id={id} value={status} onChange={(e) => setStatus(e.target.value as CampaignRow["status"])}>
                  <option value="active">Open — accepting applicants</option>
                  <option value="draft">Draft — link disabled</option>
                  <option value="closed">Closed</option>
                </Select>
              )}
            </Field>
            <div className="sm:col-span-2">
              <DocumentInput
                label="Job posting"
                kind="job"
                value={description}
                onChange={setDescription}
                maxChars={15000}
                preferPaste
                hint="Paste or upload it from anywhere — your careers page, a job board, a Word or PDF file. The interviewer targets exactly what it asks for, and applicants can read it."
              />
            </div>
            <Field label="Ask applicants for a CV" hint="With a CV, the interviewer greets applicants by name, asks about their own experience, and you get a CV-vs-job fit summary." className="sm:col-span-2">
              {({ id, describedBy }) => (
                <Select id={id} value={cvRequirement} onChange={(e) => setCvRequirement(e.target.value as typeof cvRequirement)} aria-describedby={describedBy}>
                  <option value="optional">Optional — applicants can add one</option>
                  <option value="required">Required — applicants must add one</option>
                  <option value="off">Don't ask for a CV</option>
                </Select>
              )}
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Competencies to assess"
            description="2–6 skills. Every applicant is scored on exactly these, so results stay comparable."
            action={
              <Button type="button" size="sm" variant="outline" icon={<MagicWand size={16} />} onClick={suggest} loading={suggesting}>
                {description.trim().length >= 60 ? "Suggest from the posting" : "Suggest for this role"}
              </Button>
            }
          />
          <div className="space-y-4 p-6">
            {errors.competencies && <p className="text-sm font-medium text-destructive" role="alert">{errors.competencies}</p>}
            {original?.settings?.plan && <Alert tone="info">Applicants have already been assessed on these competencies. Changing them means new applicants are scored on a different set.</Alert>}
            <div className="flex flex-wrap gap-2" aria-invalid={!!errors.competencies}>
              {library.map((c) => {
                const on = competencies.includes(c.name);
                return (
                  <button
                    key={c.key}
                    type="button"
                    aria-pressed={on}
                    title={c.description}
                    onClick={() => toggleComp(c.name)}
                    disabled={!on && competencies.length >= 6}
                    className={clsx("min-h-9 rounded-full border px-3 text-sm font-medium transition-colors duration-200 disabled:opacity-40", on ? "border-primary bg-primary-soft text-primary" : "border-border-soft text-muted-fg hover:border-border hover:text-fg-strong")}
                  >
                    {c.name}
                  </button>
                );
              })}
              {customs.map((c) => (
                <span key={c} className="inline-flex min-h-9 items-center gap-1 rounded-full border border-primary bg-primary-soft pl-3 pr-1 text-sm font-medium text-primary">
                  {c}
                  <button type="button" aria-label={`Remove ${c}`} className="rounded-full p-1 hover:bg-primary/10" onClick={() => toggleComp(c)}>
                    <X size={14} />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <label htmlFor="custom-comp" className="sr-only">
                Add a custom competency
              </label>
              <Input id="custom-comp" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Add your own, e.g. Working under pressure" maxLength={60} onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (custom.trim().length >= 2) {
                    toggleComp(custom.trim());
                    setCustom("");
                  }
                }
              }} />
              <Button
                type="button"
                variant="subtle"
                icon={<Plus size={16} />}
                onClick={() => {
                  if (custom.trim().length >= 2) {
                    toggleComp(custom.trim());
                    setCustom("");
                  }
                }}
                disabled={custom.trim().length < 2 || competencies.length >= 6}
              >
                Add
              </Button>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Interview format" description="The interview adapts: it probes vague answers and adds a round when results are borderline." />
          <div className="space-y-6 p-6">
            <div className="grid gap-5 sm:grid-cols-3">
              <Field label="Minimum questions" error={errors.questions} hint="Core round">
                {({ id, describedBy, invalid }) => (
                  <Select id={id} value={minQ} onChange={(e) => setMinQ(Number(e.target.value))} aria-describedby={describedBy} aria-invalid={invalid}>
                    {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Maximum questions" hint="If more evidence is needed">
                {({ id, describedBy }) => (
                  <Select id={id} value={maxQ} onChange={(e) => setMaxQ(Number(e.target.value))} aria-describedby={describedBy}>
                    {[3, 4, 5, 6, 7, 8, 9, 10, 12].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Follow-ups per question">
                {({ id }) => (
                  <Select id={id} value={followUps} onChange={(e) => setFollowUps(Number(e.target.value))}>
                    <option value={0}>None</option>
                    <option value={1}>Up to 1</option>
                    <option value={2}>Up to 2</option>
                    <option value={3}>Up to 3</option>
                  </Select>
                )}
              </Field>
              <Field label="Interviewer tone">
                {({ id }) => (
                  <Select id={id} value={persona} onChange={(e) => setPersona(e.target.value as typeof persona)}>
                    <option value="supportive">Warm & supportive</option>
                    <option value="neutral">Professional</option>
                    <option value="challenging">Challenging</option>
                  </Select>
                )}
              </Field>
              <Field label="Question type">
                {({ id }) => (
                  <Select id={id} value={style} onChange={(e) => setStyle(e.target.value as typeof style)}>
                    <option value="behavioral">Past examples</option>
                    <option value="mixed">Mixed</option>
                    <option value="situational">Scenarios</option>
                  </Select>
                )}
              </Field>
              <Field label="Time limit">
                {({ id }) => (
                  <Select id={id} value={timeLimit ?? ""} onChange={(e) => setTimeLimit(e.target.value ? Number(e.target.value) : null)}>
                    <option value="">No limit</option>
                    {[15, 20, 30, 45, 60].map((n) => (
                      <option key={n} value={n}>
                        {n} minutes
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Difficulty">
                {({ id }) => (
                  <Select id={id} value={difficulty} onChange={(e) => setDifficulty(e.target.value as typeof difficulty)}>
                    <option value="easy">Approachable</option>
                    <option value="standard">Standard</option>
                    <option value="hard">Demanding</option>
                  </Select>
                )}
              </Field>
              <Field
                label="Interviewer voice"
                hint={naturalVoices === false ? "Natural voices turn on once Amazon Polly is set up; until then applicants hear their device's voice." : "Every applicant hears this voice."}
              >
                {({ id, describedBy }) => (
                  <Select id={id} value={voice} onChange={(e) => setVoice(e.target.value)} aria-describedby={describedBy}>
                    <option value="">Default natural voice (Ruth)</option>
                    {POLLY_VOICES.map((v) => (
                      <option key={v.id} value={v.id}>
                        {voiceLabel(v)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Closes on (optional)">
                {({ id }) => <Input id={id} type="date" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />}
              </Field>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Integrity & anti-cheating" description="Applicants see exactly what is monitored before they start. Signals are for human review, never automatic rejection." />
          <div className="space-y-6 p-6">
            <RadioCards
              name="integrity"
              legend="Monitoring level"
              value={integrity.level}
              onChange={setLevel}
              options={[
                { value: "off", label: "Off", description: "Answer analysis only.", icon: <ShieldSlash size={20} /> },
                { value: "standard", label: "Standard", description: "Tab & focus tracking, paste blocking, typing analysis.", icon: <Shield size={20} /> },
                { value: "strict", label: "Strict", description: "Plus camera analysis, full screen and voice-only answers.", icon: <ShieldCheck size={20} /> },
              ]}
            />
            {integrity.level !== "off" && (
              <div className="space-y-4 rounded-xl border border-border-soft p-4">
                <Switch checked={integrity.requireCamera} onChange={(v) => setIntegrity((s) => ({ ...s, requireCamera: v }))} label="Require camera" description="On-device analysis: face presence, extra people, gaze, reading patterns, lip-sync. No video is recorded." />
                <Switch checked={integrity.voiceOnly} onChange={(v) => setIntegrity((s) => ({ ...s, voiceOnly: v }))} label="Voice-only answers" description="Applicants must speak; typing is disabled. Strongly reduces copy-paste from AI tools." />
                <Switch checked={integrity.requireFullscreen} onChange={(v) => setIntegrity((s) => ({ ...s, requireFullscreen: v }))} label="Require full screen" description="Exiting full screen is logged and the applicant is asked to return." />
                <Switch checked={integrity.blockPaste} onChange={(v) => setIntegrity((s) => ({ ...s, blockPaste: v }))} label="Block pasting" description="Paste attempts are blocked and logged." />
              </div>
            )}
            <p className="flex items-start gap-2 text-sm text-muted-fg">
              <Eye size={18} className="mt-0.5 shrink-0" /> Every interview also checks answers for prompt-injection attempts, scripted or AI-written phrasing, recycled answers and drops in detail under follow-up questioning.
            </p>
          </div>
        </Card>

        {error && <Alert tone="danger">{error}</Alert>}
        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="ghost" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <Button type="submit" variant="cta" size="lg" loading={busy} icon={<LockKey size={18} />}>
            {editing ? "Save changes" : "Create interview"}
          </Button>
        </div>
      </form>
    </div>
  );
}
