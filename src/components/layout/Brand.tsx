import { Link } from "react-router";
import { clsx } from "clsx";

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={clsx("shrink-0", className ?? "size-8")} aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="var(--vh-primary)" />
      <g fill="var(--vh-on-primary)">
        <rect x="14" y="26" width="6" height="12" rx="3" />
        <rect x="24" y="18" width="6" height="28" rx="3" />
        <rect x="34" y="22" width="6" height="20" rx="3" />
      </g>
      <circle cx="48" cy="32" r="6" fill="#4ADE80" />
    </svg>
  );
}

export function Brand({ to = "/", className }: { to?: string; className?: string }) {
  return (
    <Link to={to} className={clsx("inline-flex items-center gap-2.5 rounded-lg", className)} aria-label="VocalHire home">
      <BrandMark />
      <span className="text-lg font-extrabold tracking-tight text-fg-strong">
        Vocal<span className="text-primary">Hire</span>
      </span>
    </Link>
  );
}
