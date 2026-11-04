import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { ArrowLeft, Trash, UserPlus } from "@phosphor-icons/react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useActiveOrg } from "@/lib/org";
import { formatDate } from "@/lib/format";
import { Button, IconButton } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Alert, Badge } from "@/components/ui/Badge";
import { Field, Input, Select } from "@/components/ui/Field";
import { PageLoader } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";

interface Member {
  user_id: string;
  email: string;
  full_name: string | null;
  role: "owner" | "admin" | "member";
  created_at: string;
}

export default function Team() {
  const { user } = useAuth();
  const { org } = useActiveOrg();
  const toast = useToast();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!org) return;
    supabase.rpc("list_org_members", { p_org: org.org_id }).then(({ data }) => setMembers((data ?? []) as Member[]));
  }, [org]);
  useEffect(load, [load]);

  if (!org) return <PageLoader />;
  const isAdmin = org.role === "owner" || org.role === "admin";

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc("add_org_member", { p_org: org!.org_id, p_email: email.trim(), p_role: role });
    setBusy(false);
    if (error) {
      setError(/no VocalHire account/i.test(error.message) ? "There's no VocalHire account with that email yet. Ask your colleague to sign up first, then add them here." : error.message);
      return;
    }
    setEmail("");
    toast("Team member added", "success");
    load();
  }

  async function remove(m: Member) {
    const { error } = await supabase.rpc("remove_org_member", { p_org: org!.org_id, p_user: m.user_id });
    if (error) toast(error.message, "error");
    else {
      toast("Removed from workspace", "success");
      load();
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6 sm:py-10">
      <Link to="/business" className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-muted-fg hover:text-fg-strong">
        <ArrowLeft size={16} /> Hiring interviews
      </Link>
      <div>
        <p className="text-sm font-semibold text-primary">{org.organizations?.name}</p>
        <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">Team</h1>
        <p className="mt-1 text-muted-fg">Everyone in the workspace can create interviews and review candidates. Admins can manage the team.</p>
      </div>
      {isAdmin && (
        <Card>
          <CardHeader title="Add a colleague" description="They need a VocalHire account first." />
          <form onSubmit={add} className="flex flex-wrap items-end gap-3 p-5" noValidate>
            <Field label="Email" error={error} className="min-w-60 flex-1">
              {({ id, describedBy, invalid }) => <Input id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-describedby={describedBy} aria-invalid={invalid} />}
            </Field>
            <Field label="Role">
              {({ id }) => (
                <Select id={id} value={role} onChange={(e) => setRole(e.target.value as "member" | "admin")}>
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </Select>
              )}
            </Field>
            <Button type="submit" variant="primary" loading={busy} icon={<UserPlus size={18} />}>
              Add
            </Button>
          </form>
        </Card>
      )}
      <Card>
        <CardHeader title="Members" />
        {members === null ? (
          <div className="p-5">
            <PageLoader />
          </div>
        ) : members.length === 0 ? (
          <Alert tone="info" className="m-5">
            No members found.
          </Alert>
        ) : (
          <ul className="divide-y divide-border-soft">
            {members.map((m) => (
              <li key={m.user_id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <div className="flex size-10 items-center justify-center rounded-full bg-primary-soft font-bold text-primary" aria-hidden="true">
                  {(m.full_name || m.email).slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-fg-strong">
                    {m.full_name || m.email} {m.user_id === user?.id && <span className="font-normal text-muted-fg">(you)</span>}
                  </p>
                  <p className="truncate text-sm text-muted-fg">
                    {m.email} · joined {formatDate(m.created_at)}
                  </p>
                </div>
                <Badge tone={m.role === "owner" ? "brand" : m.role === "admin" ? "info" : "neutral"}>{m.role}</Badge>
                {isAdmin && m.role !== "owner" && m.user_id !== user?.id && (
                  <IconButton label={`Remove ${m.email}`} onClick={() => remove(m)}>
                    <Trash size={18} />
                  </IconButton>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
