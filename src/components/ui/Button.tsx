import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Link, type LinkProps } from "react-router";
import { clsx } from "clsx";
import { Spinner } from "./Spinner";

type Variant = "cta" | "primary" | "outline" | "ghost" | "danger" | "subtle";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-lg font-semibold whitespace-nowrap transition-colors duration-200 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-55 disabled:pointer-events-none select-none";

const variants: Record<Variant, string> = {
  // Master spec: primary CTA = accent green with dark text (contrast ≥ 4.5:1).
  cta: "bg-accent text-on-accent hover:bg-accent-hover",
  primary: "bg-primary text-on-primary hover:bg-primary-hover",
  outline: "border-2 border-primary text-primary hover:bg-primary-soft",
  ghost: "text-fg hover:bg-muted",
  danger: "bg-destructive text-on-destructive hover:opacity-90",
  subtle: "bg-muted text-fg-strong hover:bg-border-soft",
};

const sizes: Record<Size, string> = {
  sm: "min-h-9 px-3 text-sm",
  md: "min-h-11 px-4 text-[15px]",
  lg: "min-h-13 px-6 text-base",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, icon, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={clsx(base, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner className="size-4" /> : icon}
      {children}
    </button>
  );
});

export function ButtonLink({
  variant = "primary",
  size = "md",
  icon,
  className,
  children,
  ...rest
}: LinkProps & { variant?: Variant; size?: Size; icon?: ReactNode }) {
  return (
    <Link className={clsx(base, variants[variant], sizes[size], className)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}

export function IconButton({
  label,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={clsx(
        "inline-flex size-11 items-center justify-center rounded-lg text-fg transition-colors duration-200 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
