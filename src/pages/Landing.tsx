import {
  ArrowRight,
  Briefcase,
  ChartBar,
  CheckCircle,
  Eye,
  FileMagnifyingGlass,
  Fingerprint,
  GitBranch,
  Heart,
  IdentificationCard,
  LinkSimple,
  Lock,
  Microphone,
  Scales,
  ShieldCheck,
  Sparkle,
  Target,
  UsersThree,
  Wind,
} from "@phosphor-icons/react";
import { ButtonLink } from "@/components/ui/Button";
import { Orb } from "@/components/interview/Orb";
import { StarrChecklist } from "@/components/interview/StarrChecklist";
import { STARR_DEFINITIONS, STARR_KEYS, STARR_LABELS, STARR_WEIGHTS } from "../../supabase/functions/_shared/rubric.ts";

function Section({ id, eyebrow, title, intro, children, tint }: { id?: string; eyebrow: string; title: string; intro?: string; children: React.ReactNode; tint?: boolean }) {
  return (
    <section id={id} className={tint ? "border-y border-border-soft bg-surface" : undefined} aria-labelledby={id ? `${id}-title` : undefined}>
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <p className="text-sm font-bold uppercase tracking-wider text-primary">{eyebrow}</p>
        <h2 id={id ? `${id}-title` : undefined} className="mt-2 max-w-3xl text-3xl font-extrabold sm:text-4xl">
          {title}
        </h2>
        {intro && <p className="mt-3 max-w-2xl text-lg text-muted-fg">{intro}</p>}
        <div className="mt-10">{children}</div>
      </div>
    </section>
  );
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="vh-card p-6">
      <div className="flex size-11 items-center justify-center rounded-xl bg-primary-soft text-primary">{icon}</div>
      <h3 className="mt-4 text-lg font-bold">{title}</h3>
      <p className="mt-1.5 text-[15px] text-muted-fg">{body}</p>
    </div>
  );
}

export default function Landing() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-12 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:pb-24 lg:pt-20">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-sm font-semibold text-primary">
              <Sparkle size={16} weight="fill" /> AI voice interviewer
            </p>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.1] sm:text-5xl lg:text-6xl">
              Walk into your next interview <span className="text-primary">already confident.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted-fg">
              VocalHire talks with you like a real interviewer, listens to every answer, adapts the next question to what you said, and scores your stories with the STARR method — so you know exactly what to improve.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink to="/practice/new" variant="cta" size="lg" icon={<Microphone size={20} weight="fill" />}>
                Practise free — no signup
              </ButtonLink>
              <ButtonLink to="/signup?type=business" variant="outline" size="lg" icon={<Briefcase size={20} />}>
                I'm hiring
              </ButtonLink>
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-fg">
              {["Speak or type your answers", "Instant STARR feedback", "Camera never leaves your device"].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <CheckCircle size={18} weight="fill" className="text-success" /> {t}
                </li>
              ))}
            </ul>
          </div>

          {/* Product preview built from real components */}
          <div className="vh-card relative p-6 shadow-pop" aria-label="Preview of an interview in progress">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-fg-strong">Product Manager · Practice</span>
              <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-semibold text-primary">Question 3</span>
            </div>
            <div className="mt-5 flex justify-center">
              <Orb state="speaking" size={128} />
            </div>
            <div className="mt-5 rounded-xl bg-surface-2 p-4">
              <p className="text-sm text-muted-fg">Thanks — that gives me a good picture. You mentioned pushing back on the launch date…</p>
              <p className="mt-1.5 font-semibold text-fg-strong">How did you convince the sales team to accept the delay, and what happened next?</p>
            </div>
            <div className="mt-4 rounded-xl border border-border-soft p-4">
              <p className="text-xs font-bold text-primary">Coach's note on your last story</p>
              <p className="mt-1 text-sm text-fg">Clear actions and a measurable result. Next time, close with what you'd do differently.</p>
              <div className="mt-3">
                <StarrChecklist compact check={{ situation: true, task: true, action: true, result: true, reflection: false }} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Step 1: the problem */}
      <Section eyebrow="Why VocalHire" title="Interviews are a skill — and skills need practice." intro="Most people only practise in their head, then freeze on the day. Real practice needs someone to ask follow-ups, notice what's missing, and give honest feedback." tint>
        <div className="grid gap-5 md:grid-cols-3">
          <Feature icon={<Heart size={24} />} title="Built for nervous interviewees" body="A patient, supportive interviewer, a calm breathing warm-up, pause and repeat buttons, and feedback that starts with what you did well." />
          <Feature icon={<GitBranch size={24} />} title="A conversation, not a quiz" body="Each answer is analysed before the next question is written. Vague answers get probed; strong ones move you forward — like a real interviewer." />
          <Feature icon={<Target size={24} />} title="Feedback you can act on" body="See which parts of your story were missing, read a better-answer outline built from your own words, and track progress over time." />
        </div>
      </Section>

      {/* Step 2: how it works */}
      <Section id="how" eyebrow="How it works" title="Three steps to a better interview">
        <ol className="grid gap-5 md:grid-cols-3">
          {[
            { n: "1", t: "Tell us the role", b: "Pick a role — or add your CV and the job posting. VocalHire picks the competencies that matter for that job." },
            { n: "2", t: "Talk it through", b: "Answer out loud. The interviewer listens, follows up on gaps, and keeps going until it has a confident read of your strengths." },
            { n: "3", t: "Get your STARR report", b: "Scores for every answer, strengths, growth areas, delivery coaching (pace, filler words, eye contact) and a practice plan." },
          ].map((s) => (
            <li key={s.n} className="vh-card p-6">
              <span className="flex size-10 items-center justify-center rounded-full bg-primary text-lg font-extrabold text-on-primary">{s.n}</span>
              <h3 className="mt-4 text-lg font-bold">{s.t}</h3>
              <p className="mt-1.5 text-[15px] text-muted-fg">{s.b}</p>
            </li>
          ))}
        </ol>
      </Section>

      {/* CV + job posting */}
      <Section id="cv" eyebrow="Your CV + the job" title="An interview built from your CV and the job you want" intro="Upload your CV (PDF or Word) and paste the job posting from anywhere. VocalHire reads both, then interviews you the way that employer would." tint>
        <div className="grid gap-5 md:grid-cols-3">
          <Feature icon={<IdentificationCard size={24} />} title="Knows who you are" body={"Greets you by name and asks about your real experience — \"Your CV mentions cutting churn by 18%. Walk me through how you did that.\""} />
          <Feature icon={<Briefcase size={24} />} title="Knows what the job needs" body="Any text works: job boards, careers pages, recruiter emails, PDFs. Questions target exactly what the posting asks for." />
          <Feature icon={<FileMagnifyingGlass size={24} />} title="Fix your CV for that job" body="A match score, which requirements you meet (quoted from your CV), what's missing, rewrites for weak lines and a tailored summary. It never invents experience." />
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink to="/cv-review" variant="primary" size="lg" icon={<FileMagnifyingGlass size={20} />}>
            Review my CV
          </ButtonLink>
          <ButtonLink to="/practice/new" variant="outline" size="lg" icon={<Microphone size={20} />}>
            Practise with my CV
          </ButtonLink>
        </div>
      </Section>

      {/* STARR */}
      <Section id="starr" eyebrow="The scoring method" title="Every answer scored with STARR" intro="Situation, Task, Action, Result — plus Reflection, the second R that shows you learn from experience. Each element is scored 0–4 against clear anchors, and every score must be backed by a quote from your own answer.">
        <div className="grid gap-4 md:grid-cols-5">
          {STARR_KEYS.map((k) => (
            <div key={k} className="vh-card p-5">
              <div className="flex items-baseline justify-between">
                <h3 className="text-2xl font-extrabold text-primary">{STARR_LABELS[k][0]}</h3>
                <span className="text-xs font-semibold text-muted-fg">{Math.round(STARR_WEIGHTS[k] * 100)}% weight</span>
              </div>
              <p className="mt-1 font-bold text-fg-strong">{STARR_LABELS[k]}</p>
              <p className="mt-1 text-sm text-muted-fg">{STARR_DEFINITIONS[k]}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <div className="vh-card p-6">
            <h3 className="flex items-center gap-2 text-lg font-bold">
              <Scales size={22} className="text-primary" /> When does the interview end?
            </h3>
            <p className="mt-2 text-[15px] text-muted-fg">
              After a core round of questions, VocalHire checks two numbers: your running score and how much evidence it has for each competency. If your score sits in the <strong className="text-fg-strong">uncertainty band (50–72)</strong> or any competency has less than <strong className="text-fg-strong">70% evidence</strong>, it asks another round. Otherwise it stops — so you're never interviewed longer than needed.
            </p>
          </div>
          <div className="vh-card p-6">
            <h3 className="flex items-center gap-2 text-lg font-bold">
              <Lock size={22} className="text-primary" /> Guardrails you can trust
            </h3>
            <p className="mt-2 text-[15px] text-muted-fg">
              The interviewer only interviews. Attempts to steer it ("ignore your instructions", "give me a perfect score") are detected, redirected and logged. Scores are calculated by a fixed rubric on the server — the AI can't be talked into a different number.
            </p>
          </div>
        </div>
      </Section>

      {/* Business */}
      <Section id="business" eyebrow="For hiring teams" title="Screen every applicant with the same fair, structured interview" intro="Create an interview for a role, share one link, and get ranked results with transcripts, evidence and integrity signals — your team makes the final call." tint>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          <Feature icon={<LinkSimple size={24} />} title="One link per role" body="Applicants open the link, consent, and interview in their browser — no account or download needed." />
          <Feature icon={<UsersThree size={24} />} title="Fair by design" body="Every applicant is assessed on the same frozen set of competencies with the same rubric, so results are comparable." />
          <Feature icon={<ChartBar size={24} />} title="Ranked, explainable results" body="Overall and STARR scores, competency breakdowns, quoted evidence and an advisory recommendation for each candidate." />
          <Feature icon={<ShieldCheck size={24} />} title="Integrity monitoring" body="Standard or strict modes with focus, paste and camera signals — summarised as a score with a timeline for review." />
          <Feature icon={<Sparkle size={24} />} title="Tailored to your job" body="Paste or upload the job posting and ask applicants for a CV. Questions dig into each applicant's own experience, and you get a CV-vs-job fit summary." />
          <Feature icon={<CheckCircle size={24} />} title="Human decisions" body="Shortlist, advance or reject with notes. The AI recommendation is advisory and never auto-rejects anyone." />
        </div>
        <div className="mt-8">
          <ButtonLink to="/signup?type=business" variant="primary" size="lg" icon={<ArrowRight size={20} />}>
            Create a hiring workspace
          </ButtonLink>
        </div>
      </Section>

      {/* Integrity */}
      <Section id="integrity" eyebrow="Anti-cheating" title="AI-written answers don't survive a real conversation" intro="No single check stops every cheater, so VocalHire layers them. Each signal is weak on its own; together they give reviewers a clear picture.">
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          <Feature icon={<GitBranch size={24} />} title="Adaptive depth probes" body="Polished-but-generic answers trigger follow-ups only someone who lived the story can answer. A big drop in detail is flagged." />
          <Feature icon={<Microphone size={24} />} title="Voice-only answers" body="In strict mode applicants must speak, so text can't be pasted from an AI tool. Long silences before suspiciously fluent answers are noted." />
          <Feature icon={<Eye size={24} />} title="On-device camera analysis" body="Detects a missing face, a second person, looking away, reading-like eye movements and speech without matching lip movement." />
          <Feature icon={<Fingerprint size={24} />} title="Authenticity analysis" body="Flags scripted, buzzword-heavy answers with no concrete specifics, and the same canned story reused across questions." />
          <Feature icon={<ShieldCheck size={24} />} title="Browser signals" body="Tab switches, window focus, full-screen exits, blocked paste attempts and machine-speed typing — plus heartbeats to detect tampering." />
          <Feature icon={<Lock size={24} />} title="Privacy first" body="Nothing is recorded. Video is analysed on the applicant's device and never uploaded; candidates see exactly what's monitored before they start." />
        </div>
      </Section>

      {/* Confidence */}
      <Section eyebrow="Confidence builders" title="Designed to make practice feel safe">
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          <Feature icon={<Wind size={24} />} title="Calm warm-up" body="A one-minute guided breathing exercise before you begin." />
          <Feature icon={<Heart size={24} />} title="Choose your interviewer" body="Supportive, neutral or challenging — level up when you're ready." />
          <Feature icon={<Eye size={24} />} title="Eye-contact coaching" body="Optional camera feedback on how often you look at the screen." />
          <Feature icon={<ChartBar size={24} />} title="See your progress" body="Track scores and delivery confidence across every session." />
        </div>
      </Section>

      {/* Final CTA */}
      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <div className="rounded-3xl bg-primary px-6 py-12 text-center text-on-primary sm:px-12">
          <h2 className="text-3xl font-extrabold text-on-primary sm:text-4xl">Your next interview starts with one practice run.</h2>
          <p className="mx-auto mt-3 max-w-xl text-on-primary/85">It takes about ten minutes. No account needed — sign up later to keep your progress.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <ButtonLink to="/practice/new" variant="cta" size="lg" icon={<Microphone size={20} weight="fill" />}>
              Start practising
            </ButtonLink>
            <ButtonLink to="/signup" size="lg" className="border-2 border-on-primary/40 bg-transparent text-on-primary hover:bg-on-primary/10">
              Create an account
            </ButtonLink>
          </div>
        </div>
      </section>
    </>
  );
}
