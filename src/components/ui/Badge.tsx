import type { ReactNode } from "react";
import { clsx } from "clsx";

export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "brand";

const tones: Record<Tone, string> = {
  neutral: "bg-muted text-fg-strong",
  info: "bg-primary-soft text-primary",
  brand: "bg-primary text-on-primary",
  success: "bg-success-bg text-success",
  warning: "bg-warning-bg text-warning",
  danger: "bg-danger-bg text-destructive",
};

export function Badge({ tone = "neutral", children, className, icon }: { tone?: Tone; children: ReactNode; className?: string; icon?: ReactNode }) {
  return (
    <span className={clsx("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold", tones[tone], className)}>
      {icon}
      {children}
    </span>
  );
}

export function Alert({ tone = "info", title, children, icon, className }: { tone?: Exclude<Tone, "brand">; title?: ReactNode; children?: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={clsx("flex gap-3 rounded-xl px-4 py-3 text-sm", tones[tone], className)}>
      {icon && <div className="mt-0.5 shrink-0">{icon}</div>}
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={clsx(title && "mt-0.5", "opacity-95")}>{children}</div>}
      </div>
    </div>
  );
}
