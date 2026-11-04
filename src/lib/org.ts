import { useCallback, useMemo, useState } from "react";
import { useAuth, type Membership } from "./auth";

const KEY = "vh-active-org";

export function useActiveOrg(): { org: Membership | null; orgs: Membership[]; setOrg: (id: string) => void } {
  const { memberships } = useAuth();
  const [selected, setSelected] = useState<string | null>(() => {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  });
  const org = useMemo(() => memberships.find((m) => m.org_id === selected) ?? memberships[0] ?? null, [memberships, selected]);
  const setOrg = useCallback((id: string) => {
    setSelected(id);
    try {
      localStorage.setItem(KEY, id);
    } catch {
      /* ignore */
    }
  }, []);
  return { org, orgs: memberships, setOrg };
}

export interface CampaignSettings {
  persona?: "supportive" | "neutral" | "challenging";
  difficulty?: "easy" | "standard" | "hard";
  style?: "behavioral" | "situational" | "mixed";
  minMainQuestions?: number;
  maxMainQuestions?: number;
  maxFollowUps?: number;
  timeLimitMinutes?: number | null;
  integrity?: { level: "off" | "standard" | "strict"; requireCamera?: boolean; requireFullscreen?: boolean; voiceOnly?: boolean; blockPaste?: boolean };
  plan?: { competencies: { key: string; name: string; description: string }[] };
  /** Ask applicants for a CV (default "optional"). */
  cvRequirement?: "off" | "optional" | "required";
  /** Job profile frozen by the server at the first applicant. */
  jobProfile?: unknown;
  /** Natural interviewer voice for applicants (Amazon Polly voice id). */
  voice?: string | null;
}

export interface CampaignRow {
  id: string;
  org_id: string;
  title: string;
  department: string | null;
  location: string | null;
  description: string | null;
  seniority: string;
  competencies: string[];
  settings: CampaignSettings;
  status: "draft" | "active" | "closed";
  public_token: string;
  closes_at: string | null;
  created_at: string;
}

export interface CampaignOverview {
  id: string;
  org_id: string;
  title: string;
  department: string | null;
  location: string | null;
  seniority: string;
  status: "draft" | "active" | "closed";
  public_token: string;
  closes_at: string | null;
  created_at: string;
  candidates: number;
  completed: number;
  avg_score: number | null;
  flagged: number;
  shortlisted: number;
  last_completed_at: string | null;
}

export function interviewLink(token: string): string {
  const base = import.meta.env.BASE_URL || "/";
  return `${window.location.origin}${base.replace(/\/$/, "")}/i/${token}`;
}
