import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Briefcase, EnvelopeSimple, Microphone } from "@phosphor-icons/react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { Field, Input, RadioCards } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Badge";
import { BASE_PATH } from "@/config";

export default function AuthPage({ mode }: { mode: "login" | "signup" }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, profile, loading } = useAuth();
  const next = params.get("next");
  const [accountType, setAccountType] = useState<"candidate" | "business">(params.get("type") === "business" ? "business" : "candidate");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [checkEmail, setCheckEmail] = useState(false);

  useEffect(() => {
    if (loading || !user) return;
    if (next && next.startsWith("/")) navigate(next, { replace: true });
    else navigate(profile?.account_type === "business" || accountType === "business" ? "/business" : "/app", { replace: true });
  }, [user, profile, loading, next, navigate, accountType]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (mode === "signup" && name.trim().length < 2) errs.name = "Please enter your name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) errs.email = "Enter a valid email address.";
    if (password.length < (mode === "signup" ? 8 : 1)) errs.password = mode === "signup" ? "Use at least 8 characters." : "Enter your password.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { full_name: name.trim(), account_type: accountType },
            emailRedirectTo: `${window.location.origin}${BASE_PATH}${accountType === "business" ? "business" : "app"}`,
          },
        });
        if (error) throw error;
        if (!data.session) setCheckEmail(true);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      setError(/invalid login/i.test(msg) ? "That email and password don't match an account." : /already registered/i.test(msg) ? "An account with this email already exists. Try signing in." : msg);
    } finally {
      setBusy(false);
    }
  }

  if (checkEmail) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
          <EnvelopeSimple size={28} />
        </div>
        <h1 className="mt-5 text-2xl font-extrabold">Check your inbox</h1>
        <p className="mt-2 text-muted-fg">
          We sent a confirmation link to <strong className="text-fg-strong">{email}</strong>. Open it to activate your account, then come back to sign in.
        </p>
        <Link to="/login" className="mt-6 inline-block font-semibold text-primary hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12 sm:py-16">
      <h1 className="text-3xl font-extrabold">{mode === "signup" ? "Create your account" : "Welcome back"}</h1>
      <p className="mt-1 text-muted-fg">{mode === "signup" ? "Save your progress and unlock your full practice history." : "Sign in to continue to VocalHire."}</p>
      <form onSubmit={submit} className="vh-card mt-8 space-y-5 p-6" noValidate>
        {mode === "signup" && (
          <RadioCards
            name="account-type"
            legend="I'm here to…"
            columns={2}
            value={accountType}
            onChange={setAccountType}
            options={[
              { value: "candidate", label: "Practise interviews", description: "Build confidence for my next job.", icon: <Microphone size={20} /> },
              { value: "business", label: "Hire people", description: "Screen applicants for my team.", icon: <Briefcase size={20} /> },
            ]}
          />
        )}
        {mode === "signup" && (
          <Field label="Full name" error={errors.name} required>
            {({ id, describedBy, invalid }) => <Input id={id} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} aria-describedby={describedBy} aria-invalid={invalid} />}
          </Field>
        )}
        <Field label="Email" error={errors.email} required>
          {({ id, describedBy, invalid }) => <Input id={id} type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-describedby={describedBy} aria-invalid={invalid} />}
        </Field>
        <Field label="Password" error={errors.password} hint={mode === "signup" ? "At least 8 characters." : undefined} required>
          {({ id, describedBy, invalid }) => (
            <Input id={id} type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} aria-describedby={describedBy} aria-invalid={invalid} />
          )}
        </Field>
        {error && <Alert tone="danger">{error}</Alert>}
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
          {mode === "signup" ? "Create account" : "Sign in"}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-fg">
        {mode === "signup" ? (
          <>
            Already have an account?{" "}
            <Link to={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-primary hover:underline">
              Sign in
            </Link>
          </>
        ) : (
          <>
            New to VocalHire?{" "}
            <Link to={`/signup${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-primary hover:underline">
              Create an account
            </Link>
          </>
        )}
      </p>
      <p className="mt-3 text-center text-sm text-muted-fg">
        Just want to try it?{" "}
        <Link to="/practice/new" className="font-semibold text-primary hover:underline">
          Practise without an account
        </Link>
      </p>
    </div>
  );
}
