import type { HTMLAttributes, ReactNode } from "react";
import { clsx } from "clsx";

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx("vh-card", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, description, action, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={clsx("flex flex-wrap items-start justify-between gap-3 border-b border-border-soft px-5 py-4", className)}>
      <div className="min-w-0">
        <h2 className="text-base font-bold">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted-fg">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Stat({ label, value, hint, icon }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="vh-card flex items-start gap-3 p-4">
      {icon && <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">{icon}</div>}
      <div className="min-w-0">
        <p className="text-sm font-medium text-muted-fg">{label}</p>
        <p className="mt-0.5 text-2xl font-bold tabular-nums text-fg-strong">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-muted-fg">{hint}</p>}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {icon && <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">{icon}</div>}
      <h3 className="text-lg font-bold">{title}</h3>
      {body && <p className="mt-1 max-w-md text-sm text-muted-fg">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
