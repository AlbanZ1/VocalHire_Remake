import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { api } from "./api";
import { sessionTokens } from "./sessionTokens";
import { reviewTokens } from "./reviewTokens";

export interface Profile {
  id: string;
  full_name: string | null;
  account_type: "candidate" | "business";
  target_role: string | null;
}

export interface Membership {
  org_id: string;
  role: "owner" | "admin" | "member";
  organizations: { id: string; name: string } | null;
}

interface AuthState {
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  memberships: Membership[];
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);
  const claimed = useRef<string | null>(null);

  const loadUserData = useCallback(async (s: Session | null) => {
    if (!s) {
      setProfile(null);
      setMemberships([]);
      return;
    }
    const [p, m] = await Promise.all([
      supabase.from("profiles").select("id, full_name, account_type, target_role").eq("id", s.user.id).maybeSingle(),
      supabase.from("organization_members").select("org_id, role, organizations(id, name)").eq("user_id", s.user.id),
    ]);
    setProfile((p.data as Profile | null) ?? null);
    setMemberships(((m.data ?? []) as unknown as Membership[]).filter((x) => x.organizations));
    // Attach any practice interviews taken as a guest in this browser to the account.
    if (claimed.current !== s.user.id) {
      claimed.current = s.user.id;
      const guest = sessionTokens.guestPractice().map(({ id, entry }) => ({ id, token: entry.token }));
      const reviews = reviewTokens.all().map(({ id, entry }) => ({ id, token: entry.token }));
      if (guest.length || reviews.length) api.claim(guest, reviews).catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await loadUserData(data.session).catch(() => undefined);
      if (active) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      // Defer DB calls out of the auth callback (supabase-js recommendation).
      setTimeout(() => loadUserData(s).catch(() => undefined), 0);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadUserData]);

  const value = useMemo<AuthState>(
    () => ({
      loading,
      session,
      user: session?.user ?? null,
      profile,
      memberships,
      refresh: () => loadUserData(session),
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [loading, session, profile, memberships, loadUserData],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
