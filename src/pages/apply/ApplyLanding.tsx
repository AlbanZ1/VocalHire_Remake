import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import { Briefcase, CheckCircle, Clock, MapPin, Microphone, ShieldCheck, Warning } from "@phosphor-icons/react";
import { api, ApiError, type CampaignInfo } from "@/lib/api";
import { sessionTokens } from "@/lib/sessionTokens";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Badge";
import { Checkbox, Field, Input } from "@/components/ui/Field";
import { PageLoader } from "@/components/ui/Spinner";

export default function ApplyLanding() {
  const { campaignToken = "" } = useParams();
  const navigate = useNavigate();
  const [info, setInfo] = useState<CampaignInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .campaignInfo(campaignToken)
      .then(setInfo)
      .catch((e) => setLoadError(e instanceof ApiError && e.status === 404 ? "This interview link isn't valid. Please check the link you were sent." : e instanceof Error ? e.message : "Couldn't load the interview."));
  }, [campaignToken]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (name.trim().length < 2) errs.name = "Enter your full name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) errs.email = "Enter a valid email address.";
    if (!consent) errs.consent = "Please confirm you've read how this interview works.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.createCampaignSession(campaignToken, name.trim(), email.trim(), consent);
      sessionTokens.save(r.sessionId, { token: r.token, mode: "business", role: info?.title ?? "", createdAt: new Date().toISOString(), campaignToken });
      navigate(`/interview/${r.sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the interview.");
      setBusy(false);
    }
  }

  if (loadError)
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <Alert tone="danger" icon={<Warning size={20} />} title="Interview unavailable">
          {loadError}
        </Alert>
      </div>
    );
  if (!info) return <PageLoader label="Loading interview" />;

  return (
    <div className="mx-auto grid max-w-5xl gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[1.2fr_1fr]">
      <div className="space-y-6">
        <div>
          <p className="text-sm font-semibold text-primary">{info.company} is inviting you to an interview</p>
          <h1 className="mt-1 text-3xl font-extrabold">{info.title}</h1>
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-fg">
            {info.department && (
              <span className="inline-flex items-center gap-1">
                <Briefcase size={16} /> {info.department}
              </span>
            )}
            {info.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin size={16} /> {info.location}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Clock size={16} /> About {info.estimatedMinutes} minutes
            </span>
          </p>
        </div>
        {info.description && (
          <Card className="p-5">
            <h2 className="text-sm font-bold text-fg-strong">About the role</h2>
            <p className="mt-2 whitespace-pre-line text-sm text-fg">{info.description}</p>
          </Card>
        )}
        <Card className="p-5">
          <h2 className="text-base font-bold">How it works</h2>
          <ol className="mt-3 space-y-3 text-sm text-fg">
            <li className="flex gap-3">
              <Microphone size={20} className="shrink-0 text-primary" />
              <span>
                An AI interviewer will ask you {info.questions.min}–{info.questions.max} questions out loud{info.integrity.voiceOnly ? " and you answer by speaking" : ". You can speak or type your answers"}. It may ask follow-up questions about your examples, just like a real interviewer.
              </span>
            </li>
            <li className="flex gap-3">
              <CheckCircle size={20} className="shrink-0 text-primary" />
              <span>Answer with real examples from your experience: the situation, what you were responsible for, what you did, the result, and what you learned.</span>
            </li>
            <li className="flex gap-3">
              <Clock size={20} className="shrink-0 text-primary" />
              <span>{info.timeLimitMinutes ? `There's a ${info.timeLimitMinutes}-minute limit.` : "There's no strict time limit — take a moment to think before answering."} You can only take this interview once.</span>
            </li>
          </ol>
        </Card>
      </div>

      <div className="space-y-6">
        {!info.open ? (
          <Alert tone="warning" title="This interview is closed">
            {info.company} is no longer accepting applicants through this link.
          </Alert>
        ) : (
          <form onSubmit={submit} className="vh-card space-y-5 p-6" noValidate>
            <h2 className="text-lg font-bold">Start your interview</h2>
            <Field label="Full name" error={errors.name} required>
              {({ id, describedBy, invalid }) => <Input id={id} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} aria-describedby={describedBy} aria-invalid={invalid} />}
            </Field>
            <Field label="Email" error={errors.email} hint={`${info.company} will use this to contact you.`} required>
              {({ id, describedBy, invalid }) => <Input id={id} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-describedby={describedBy} aria-invalid={invalid} />}
            </Field>
            <div className="rounded-xl bg-surface-2 p-4">
              <p className="flex items-center gap-2 text-sm font-bold text-fg-strong">
                <ShieldCheck size={18} className="text-primary" /> What's monitored during this interview
              </p>
              <ul className="mt-2 space-y-1 text-sm text-fg">
                {info.monitored.map((m) => (
                  <li key={m}>• {m}</li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted-fg">Nothing is recorded: no audio or video is stored, and camera analysis runs only on your device. Your transcript and results are shared with {info.company}.</p>
            </div>
            <div>
              <Checkbox checked={consent} onChange={(e) => setConsent(e.target.checked)} label="I understand how this interview works and agree to the monitoring described above." />
              {errors.consent && <p className="mt-1 text-sm font-medium text-destructive">{errors.consent}</p>}
            </div>
            {error && <Alert tone="danger">{error}</Alert>}
            <Button type="submit" variant="cta" size="lg" className="w-full" loading={busy}>
              Continue to device check
            </Button>
          </form>
        )}
        <p className="text-xs text-muted-fg">Feeling nervous? That's normal. Take a breath, speak naturally, and use real examples — there are no trick questions.</p>
      </div>
    </div>
  );
}
