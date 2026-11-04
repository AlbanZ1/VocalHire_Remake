import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { ArrowRight, ArrowsClockwise, FileMagnifyingGlass, Microphone } from "@phosphor-icons/react";
import { api, ApiError, type CvReview as Review } from "@/lib/api";
import { reviewTokens } from "@/lib/reviewTokens";
import { useAuth } from "@/lib/auth";
import { Alert } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageLoader } from "@/components/ui/Spinner";
import { PageHeader } from "@/components/layout/Shells";
import { DocumentInput } from "@/components/documents/DocumentInput";
import { CvReviewView } from "@/components/documents/CvParts";

const MAX_CV = 20000;
const MAX_JOB = 15000;

interface ReviewState {
  review?: Review;
  cvText?: string;
  jobText?: string;
}

function ReviewForm() {
  const navigate = useNavigate();
  const [cv, setCv] = useState("");
  const [job, setJob] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cvError, setCvError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (cv.trim().length < 80) {
      setCvError(cv.trim() ? "That looks too short — upload your full CV or paste more of it." : "Add your CV to get a review.");
      return;
    }
    setCvError(null);
    setError(null);
    setBusy(true);
    try {
      const r = await api.reviewCv({ cvText: cv, jobText: job || undefined });
      reviewTokens.save(r.id, { token: r.token, role: r.review.roleTitle, company: r.review.company, matchScore: r.review.matchScore, qualityScore: r.review.qualityScore, createdAt: new Date().toISOString() });
      navigate(`/cv-review/${r.id}`, { state: { review: r.review, cvText: cv, jobText: job } satisfies ReviewState });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't review your CV. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <PageHeader eyebrow="CV review" title="See how your CV fits the job" description="Add your CV and the job you want. You'll get a match score, what's missing, and specific rewrites — based only on what your CV really says." />
      <form onSubmit={submit} className="mt-8 space-y-6" noValidate>
        <Card className="space-y-6 p-6">
          <DocumentInput label="Your CV" kind="cv" value={cv} onChange={setCv} maxChars={MAX_CV} required error={cvError} hint="Your file is read on your device; only its text is sent for the review." />
          <DocumentInput
            label="The job posting"
            kind="job"
            value={job}
            onChange={setJob}
            maxChars={MAX_JOB}
            preferPaste
            hint="Paste it from anywhere — a job board, the company's careers page, a recruiter's email, a PDF. Leave it empty for a general CV check."
          />
        </Card>
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-fg">Takes about 20 seconds.</p>
          <Button type="submit" variant="cta" size="lg" loading={busy} icon={<FileMagnifyingGlass size={20} />}>
            {busy ? "Reviewing your CV…" : "Review my CV"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function ReviewResult({ id }: { id: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const state = (location.state ?? {}) as ReviewState;
  const [review, setReview] = useState<Review | null>(state.review ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (review) return;
    let alive = true;
    api
      .getCvReview(id, reviewTokens.token(id))
      .then((r) => alive && setReview(r.review))
      .catch((e) => alive && setError(e instanceof ApiError && (e.status === 403 || e.status === 404) ? "This review isn't available on this device. Sign in with the account that saved it, or run a new review." : e instanceof Error ? e.message : "Couldn't load the review."));
    return () => {
      alive = false;
    };
  }, [id, review]);

  if (error)
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <Alert tone="warning">{error}</Alert>
        <ButtonLink to="/cv-review" variant="primary" className="mt-6">
          Review a CV
        </ButtonLink>
      </div>
    );
  if (!review) return <PageLoader label="Loading your review" />;

  const practise = () =>
    navigate("/practice/new", {
      state: { cvText: state.cvText, jobText: state.jobText, roleTitle: review.roleTitle ?? undefined, companyName: review.company ?? undefined },
    });

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <PageHeader
        eyebrow="CV review"
        title={review.hasJob ? `Your CV for ${review.roleTitle ?? "this job"}` : "Your CV review"}
        actions={
          <>
            <ButtonLink to="/cv-review" variant="outline" icon={<ArrowsClockwise size={18} />}>
              New review
            </ButtonLink>
            <Button variant="cta" onClick={practise} icon={<Microphone size={18} />}>
              Practise this interview
            </Button>
          </>
        }
      />
      <div className="mt-8">
        <CvReviewView review={review} />
      </div>
      <Card className="mt-6 flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-bold text-fg-strong">Next: rehearse the interview for this job</p>
          <p className="text-sm text-muted-fg">
            {state.cvText ? "Your CV and the posting carry over — the interviewer will greet you by name and ask about your own experience." : "Add your CV in the next step so the interviewer can ask about your own experience."}
          </p>
        </div>
        <Button variant="primary" onClick={practise} icon={<ArrowRight size={18} />}>
          Start practice interview
        </Button>
      </Card>
      {!user && (
        <p className="mt-4 text-center text-sm text-muted-fg">
          This review is saved on this device.{" "}
          <Link to="/signup" className="font-semibold text-primary hover:underline">
            Create a free account
          </Link>{" "}
          to keep it with your interview history.
        </p>
      )}
    </div>
  );
}

export default function CvReview() {
  const { reviewId } = useParams();
  return reviewId ? <ReviewResult key={reviewId} id={reviewId} /> : <ReviewForm />;
}
