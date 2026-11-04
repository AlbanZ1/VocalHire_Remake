import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowRight, Briefcase, Buildings, Copy, Plus, ShieldWarning, Users, UsersThree } from "@phosphor-icons/react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { interviewLink, useActiveOrg, type CampaignOverview } from "@/lib/org";
import { formatDate } from "@/lib/format";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, EmptyState, Stat } from "@/components/ui/Card";
import { Alert, Badge } from "@/components/ui/Badge";
import { Field, Input, Select } from "@/components/ui/Field";
import { Skeleton } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "@/components/layout/Shells";

function CreateOrg() {
  const { refresh } = useAuth();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) {
      setError("Enter your company or team name.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc("create_organization", { p_name: name.trim() });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    await refresh();
  }
  return (
    <div className="mx-auto max-w-xl px-4 py-12 sm:px-6">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
        <Buildings size={28} />
      </div>
      <h1 className="mt-5 text-3xl font-extrabold">Set up your hiring workspace</h1>
      <p className="mt-2 text-muted-fg">Create a workspace for your company or team. You'll be able to create interviews for open roles, share links with applicants and invite colleagues to review.</p>
      <form onSubmit={submit} className="vh-card mt-8 space-y-5 p-6" noValidate>
        <Field label="Company or team name" error={error} required>
          {({ id, describedBy, invalid }) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acme Health" autoComplete="organization" aria-describedby={describedBy} aria-invalid={invalid} />}
        </Field>
        <Button type="submit" variant="primary" size="lg" loading={busy} className="w-full">
          Create workspace
        </Button>
      </form>
    </div>
  );
}

export default function BusinessHome() {
  const { org, orgs, setOrg } = useActiveOrg();
  const navigate = useNavigate();
  const toast = useToast();
  const [campaigns, setCampaigns] = useState<CampaignOverview[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!org) return;
    setCampaigns(null);
    supabase
      .from("campaign_overview")
      .select("*")
      .eq("org_id", org.org_id)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(error.message);
        setCampaigns((data ?? []) as CampaignOverview[]);
      });
  }, [org]);

  if (!org) return <CreateOrg />;

  const totals = (campaigns ?? []).reduce(
    (a, c) => ({ candidates: a.candidates + Number(c.candidates), completed: a.completed + Number(c.completed), flagged: a.flagged + Number(c.flagged), active: a.active + (c.status === "active" ? 1 : 0) }),
    { candidates: 0, completed: 0, flagged: 0, active: 0 },
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 sm:py-10">
      <PageHeader
        eyebrow={
          orgs.length > 1 ? (
            <label className="inline-flex items-center gap-2">
              <span className="sr-only">Workspace</span>
              <Select value={org.org_id} onChange={(e) => setOrg(e.target.value)} className="min-h-9 w-auto py-1 text-sm">
                {orgs.map((o) => (
                  <option key={o.org_id} value={o.org_id}>
                    {o.organizations?.name}
                  </option>
                ))}
              </Select>
            </label>
          ) : (
            org.organizations?.name
          )
        }
        title="Hiring interviews"
        description="Create an interview for a role, share the link with applicants, and review ranked results."
        actions={
          <>
            <ButtonLink to="/business/team" variant="outline" icon={<UsersThree size={18} />}>
              Team
            </ButtonLink>
            <ButtonLink to="/business/campaigns/new" variant="cta" icon={<Plus size={18} weight="bold" />}>
              New interview
            </ButtonLink>
          </>
        }
      />

      {error && <Alert tone="danger">{error}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {campaigns === null ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)
        ) : (
          <>
            <Stat label="Open roles" value={totals.active} icon={<Briefcase size={22} />} />
            <Stat label="Applicants interviewed" value={totals.candidates} icon={<Users size={22} />} />
            <Stat label="Completed interviews" value={totals.completed} icon={<ArrowRight size={22} />} />
            <Stat label="Flagged for integrity review" value={totals.flagged} icon={<ShieldWarning size={22} />} />
          </>
        )}
      </div>

      {campaigns !== null && campaigns.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Briefcase size={28} />}
            title="Create your first interview"
            body="Describe the role, pick the competencies that matter, choose an integrity level and get a shareable link for applicants."
            action={
              <ButtonLink to="/business/campaigns/new" variant="cta" icon={<Plus size={18} weight="bold" />}>
                New interview
              </ButtonLink>
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-surface-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-fg">
                <tr>
                  <th className="px-5 py-3">Role</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3 text-right">Applicants</th>
                  <th className="px-3 py-3 text-right">Completed</th>
                  <th className="px-3 py-3 text-right">Avg score</th>
                  <th className="px-3 py-3 text-right">Flagged</th>
                  <th className="px-3 py-3">Created</th>
                  <th className="px-5 py-3 text-right">Link</th>
                </tr>
              </thead>
              <tbody>
                {(campaigns ?? []).map((c) => (
                  <tr key={c.id} className="cursor-pointer border-t border-border-soft transition-colors hover:bg-surface-2" onClick={() => navigate(`/business/campaigns/${c.id}`)}>
                    <td className="px-5 py-3.5">
                      <Link to={`/business/campaigns/${c.id}`} className="font-semibold text-fg-strong hover:text-primary" onClick={(e) => e.stopPropagation()}>
                        {c.title}
                      </Link>
                      <p className="text-xs text-muted-fg">{[c.department, c.location].filter(Boolean).join(" · ") || "—"}</p>
                    </td>
                    <td className="px-3 py-3.5">
                      <Badge tone={c.status === "active" ? "success" : c.status === "draft" ? "neutral" : "warning"}>{c.status === "active" ? "Open" : c.status === "draft" ? "Draft" : "Closed"}</Badge>
                    </td>
                    <td className="px-3 py-3.5 text-right tabular-nums">{c.candidates}</td>
                    <td className="px-3 py-3.5 text-right tabular-nums">{c.completed}</td>
                    <td className="px-3 py-3.5 text-right font-semibold tabular-nums">{c.avg_score !== null ? Math.round(Number(c.avg_score)) : "—"}</td>
                    <td className="px-3 py-3.5 text-right tabular-nums">{Number(c.flagged) > 0 ? <Badge tone="warning">{c.flagged}</Badge> : "0"}</td>
                    <td className="px-3 py-3.5 text-muted-fg">{formatDate(c.created_at)}</td>
                    <td className="px-5 py-3.5 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Copy size={16} />}
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(interviewLink(c.public_token)).then(() => toast("Interview link copied", "success"));
                        }}
                      >
                        Copy
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
