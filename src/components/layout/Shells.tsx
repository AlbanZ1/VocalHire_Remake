import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from "react-router";
import { Briefcase, ChartLineUp, List, Microphone, SignOut, X } from "@phosphor-icons/react";
import { clsx } from "clsx";
import { Brand } from "./Brand";
import { ThemeToggle } from "./ThemeToggle";
import { ButtonLink, IconButton } from "../ui/Button";
import { PageLoader } from "../ui/Spinner";
import { useAuth } from "@/lib/auth";

export function PublicHeader() {
  const { user } = useAuth();
  return (
    <header className="sticky top-0 z-30 border-b border-border-soft bg-bg/85 backdrop-blur supports-[backdrop-filter]:bg-bg/70">
      <a href="#main" className="vh-skip">
        Skip to content
      </a>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Brand />
        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          <a href="/#how" className="rounded-lg px-3 py-2 text-sm font-semibold text-muted-fg transition-colors hover:text-fg-strong">How it works</a>
          <a href="/#starr" className="rounded-lg px-3 py-2 text-sm font-semibold text-muted-fg transition-colors hover:text-fg-strong">STARR scoring</a>
          <a href="/#business" className="rounded-lg px-3 py-2 text-sm font-semibold text-muted-fg transition-colors hover:text-fg-strong">For hiring teams</a>
          <a href="/#integrity" className="rounded-lg px-3 py-2 text-sm font-semibold text-muted-fg transition-colors hover:text-fg-strong">Integrity</a>
        </nav>
        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          {user ? (
            <ButtonLink to="/app" size="sm" variant="primary">
              Open app
            </ButtonLink>
          ) : (
            <>
              <span className="hidden sm:inline-flex">
                <ButtonLink to="/login" size="sm" variant="ghost">
                  Sign in
                </ButtonLink>
              </span>
              <ButtonLink to="/practice/new" size="sm" variant="cta">
                Practise free
              </ButtonLink>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="border-t border-border-soft bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div className="max-w-sm">
          <Brand />
          <p className="mt-3 text-sm text-muted-fg">Realistic AI interviews for people building confidence, and fair, adaptive screening for teams that hire.</p>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-10 gap-y-2 text-sm">
          <Link to="/practice/new" className="text-muted-fg hover:text-fg-strong">Practise now</Link>
          <Link to="/signup?type=business" className="text-muted-fg hover:text-fg-strong">Hire with VocalHire</Link>
          <Link to="/privacy" className="text-muted-fg hover:text-fg-strong">Privacy & monitoring</Link>
          <Link to="/login" className="text-muted-fg hover:text-fg-strong">Sign in</Link>
        </nav>
      </div>
      <p className="border-t border-border-soft py-4 text-center text-xs text-muted-fg">© {new Date().getFullYear()} VocalHire</p>
    </footer>
  );
}

export function PublicLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <PublicHeader />
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <PublicFooter />
    </div>
  );
}

/** Minimal chrome for job applicants: brand + theme only, no marketing navigation. */
export function MinimalLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border-soft bg-surface">
        <a href="#main" className="vh-skip">
          Skip to content
        </a>
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Brand to="#" />
          <ThemeToggle />
        </div>
      </header>
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <footer className="py-6 text-center text-xs text-muted-fg">
        Interviews powered by VocalHire ·{" "}
        <Link to="/privacy" className="underline-offset-2 hover:underline">
          Privacy & monitoring
        </Link>
      </footer>
    </div>
  );
}

const navItems = [
  { to: "/app", label: "Practice", icon: <ChartLineUp size={20} />, end: true },
  { to: "/practice/new", label: "New practice", icon: <Microphone size={20} /> },
  { to: "/business", label: "Hiring", icon: <Briefcase size={20} /> },
];

export function AppShell() {
  const { user, profile, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => setOpen(false), [location.pathname]);
  const name = profile?.full_name || user?.email?.split("@")[0] || "Account";
  const items = !user ? [navItems[1]] : profile?.account_type === "business" ? [navItems[2], navItems[0], navItems[1]] : navItems;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-border-soft bg-surface/90 backdrop-blur">
        <a href="#main" className="vh-skip">
          Skip to content
        </a>
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Brand to={user ? "/app" : "/"} />
          <nav aria-label="App" className="ml-4 hidden items-center gap-1 md:flex">
            {items.map((i) => (
              <NavLink
                key={i.to}
                to={i.to}
                end={i.end}
                className={({ isActive }) =>
                  clsx(
                    "inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors duration-200",
                    isActive ? "bg-primary-soft text-primary" : "text-muted-fg hover:bg-muted hover:text-fg-strong",
                  )
                }
              >
                {i.icon}
                {i.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            {!user && (
              <div className="flex items-center gap-1.5">
                <ButtonLink to={`/login?next=${encodeURIComponent(location.pathname)}`} size="sm" variant="ghost">
                  Sign in
                </ButtonLink>
                <span className="hidden sm:inline-flex">
                  <ButtonLink to={`/signup?next=${encodeURIComponent(location.pathname)}`} size="sm" variant="primary">
                    Save my progress
                  </ButtonLink>
                </span>
              </div>
            )}
            {user && (
            <div className="hidden items-center gap-3 border-l border-border-soft pl-3 md:flex">
              <div className="flex size-9 items-center justify-center rounded-full bg-primary-soft text-sm font-bold text-primary" aria-hidden="true">
                {name.slice(0, 1).toUpperCase()}
              </div>
              <span className="max-w-40 truncate text-sm font-semibold text-fg-strong">{name}</span>
              <IconButton
                label="Sign out"
                onClick={async () => {
                  await signOut();
                  navigate("/");
                }}
              >
                <SignOut size={20} />
              </IconButton>
            </div>
            )}
            {user && (
            <IconButton label={open ? "Close menu" : "Open menu"} className="md:hidden" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
              {open ? <X size={22} /> : <List size={22} />}
            </IconButton>
            )}
          </div>
        </div>
        {open && (
          <nav aria-label="App" className="border-t border-border-soft px-4 pb-4 pt-2 md:hidden">
            {items.map((i) => (
              <NavLink
                key={i.to}
                to={i.to}
                end={i.end}
                className={({ isActive }) =>
                  clsx("flex min-h-12 items-center gap-3 rounded-lg px-3 font-semibold", isActive ? "bg-primary-soft text-primary" : "text-fg-strong hover:bg-muted")
                }
              >
                {i.icon}
                {i.label}
              </NavLink>
            ))}
            <button
              type="button"
              onClick={async () => {
                await signOut();
                navigate("/");
              }}
              className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 font-semibold text-fg-strong hover:bg-muted"
            >
              <SignOut size={20} /> Sign out ({name})
            </button>
          </nav>
        )}
      </header>
      <main id="main" className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { loading, user } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return <>{children}</>;
}

export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-sm font-semibold text-primary">{eyebrow}</div>}
        <h1 className="text-2xl font-extrabold sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-muted-fg">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
