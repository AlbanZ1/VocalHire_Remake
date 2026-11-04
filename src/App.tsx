import { lazy, Suspense, type ReactNode } from "react";
import { createBrowserRouter, Navigate, RouterProvider, useRouteError } from "react-router";
import { AuthProvider } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import { ToastProvider } from "@/components/ui/Toast";
import { AppShell, MinimalLayout, PublicLayout, RequireAuth } from "@/components/layout/Shells";
import { PageLoader } from "@/components/ui/Spinner";
import { ButtonLink } from "@/components/ui/Button";
import { BASE_PATH } from "@/config";

const Landing = lazy(() => import("@/pages/Landing"));
const AuthPage = lazy(() => import("@/pages/Auth"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const PracticeSetup = lazy(() => import("@/pages/PracticeSetup"));
const InterviewRoom = lazy(() => import("@/pages/InterviewRoom"));
const Report = lazy(() => import("@/pages/Report"));
const Privacy = lazy(() => import("@/pages/Privacy"));
const BusinessHome = lazy(() => import("@/pages/business/BusinessHome"));
const CampaignEditor = lazy(() => import("@/pages/business/CampaignEditor"));
const CampaignDetail = lazy(() => import("@/pages/business/CampaignDetail"));
const CandidateReview = lazy(() => import("@/pages/business/CandidateReview"));
const Team = lazy(() => import("@/pages/business/Team"));
const ApplyLanding = lazy(() => import("@/pages/apply/ApplyLanding"));

function S({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>;
}

function RouteError({ notFound: forced }: { notFound?: boolean }) {
  const err = useRouteError() as { status?: number; statusText?: string; message?: string } | undefined;
  const notFound = forced || err?.status === 404;
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-4 text-center">
      <p className="text-sm font-bold text-primary">{notFound ? "404" : "Error"}</p>
      <h1 className="mt-2 text-2xl font-extrabold">{notFound ? "We couldn't find that page" : "Something went wrong"}</h1>
      <p className="mt-2 text-muted-fg">{notFound ? "The link may be outdated or mistyped." : "Please refresh the page. If it keeps happening, try again in a few minutes."}</p>
      <ButtonLink to="/" variant="primary" className="mt-6">
        Back to VocalHire
      </ButtonLink>
    </div>
  );
}

const router = createBrowserRouter(
  [
    {
      errorElement: <RouteError />,
      children: [
        {
          element: <PublicLayout />,
          children: [
            { path: "/", element: <S><Landing /></S> },
            { path: "/login", element: <S><AuthPage mode="login" /></S> },
            { path: "/signup", element: <S><AuthPage mode="signup" /></S> },
            { path: "/privacy", element: <S><Privacy /></S> },
          ],
        },
        { element: <MinimalLayout />, children: [{ path: "/i/:campaignToken", element: <S><ApplyLanding /></S> }] },
        { path: "/interview/:sessionId", element: <S><InterviewRoom /></S> },
        {
          element: <AppShell />,
          children: [
            { path: "/practice/new", element: <S><PracticeSetup /></S> },
            { path: "/report/:sessionId", element: <S><Report /></S> },
            { path: "/app", element: <RequireAuth><S><Dashboard /></S></RequireAuth> },
            { path: "/business", element: <RequireAuth><S><BusinessHome /></S></RequireAuth> },
            { path: "/business/team", element: <RequireAuth><S><Team /></S></RequireAuth> },
            { path: "/business/campaigns/new", element: <RequireAuth><S><CampaignEditor /></S></RequireAuth> },
            { path: "/business/campaigns/:campaignId", element: <RequireAuth><S><CampaignDetail /></S></RequireAuth> },
            { path: "/business/campaigns/:campaignId/edit", element: <RequireAuth><S><CampaignEditor /></S></RequireAuth> },
            { path: "/business/candidates/:sessionId", element: <RequireAuth><S><CandidateReview /></S></RequireAuth> },
          ],
        },
        { path: "/dashboard", element: <Navigate to="/app" replace /> },
        { path: "*", element: <RouteError notFound /> },
      ],
    },
  ],
  { basename: BASE_PATH.replace(/\/$/, "") || "/" },
);

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
