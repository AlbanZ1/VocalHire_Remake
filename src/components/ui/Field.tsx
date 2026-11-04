import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { clsx } from "clsx";

const control =
  "w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-base text-fg-strong placeholder:text-muted-fg/80 transition-[border-color,box-shadow] duration-200 focus:border-primary focus:outline-none focus:ring-3 focus:ring-primary/20 disabled:opacity-60 aria-[invalid=true]:border-destructive";

interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  className?: string;
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}

export function Field({ label, hint, error, required, className, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  return (
    <div className={clsx("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-semibold text-fg-strong">
        {label}
        {required && <span className="ml-0.5 text-destructive" aria-hidden="true">*</span>}
      </label>
      {children({ id, describedBy: [hintId, errId].filter(Boolean).join(" ") || undefined, invalid: !!error })}
      {hint && !error && (
        <p id={hintId} className="text-xs text-muted-fg">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={clsx(control, "min-h-11", className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={clsx(control, "min-h-24 resize-y leading-relaxed", className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={clsx(control, "min-h-11 appearance-none bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-10", className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23647891' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")" }} {...rest}>
      {children}
    </select>
  );
});

export function Checkbox({ label, description, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; description?: ReactNode }) {
  const id = useId();
  return (
    <div className={clsx("flex items-start gap-3", className)}>
      <input id={id} type="checkbox" className="mt-0.5 size-5 shrink-0 cursor-pointer rounded border-border accent-[var(--vh-primary)]" {...rest} />
      <label htmlFor={id} className="text-sm">
        <span className="font-medium text-fg-strong">{label}</span>
        {description && <span className="mt-0.5 block text-muted-fg">{description}</span>}
      </label>
    </div>
  );
}

export function Switch({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <label htmlFor={id} className="text-sm">
        <span className="font-semibold text-fg-strong">{label}</span>
        {description && <span className="mt-0.5 block text-muted-fg">{description}</span>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={clsx(
          "relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 disabled:opacity-50",
          checked ? "bg-primary" : "bg-border",
        )}
      >
        <span className={clsx("inline-block size-5 rounded-full bg-white shadow transition-transform duration-200", checked ? "translate-x-6" : "translate-x-1")} />
      </button>
    </div>
  );
}

export interface Option<T extends string> {
  value: T;
  label: string;
  description?: string;
  icon?: ReactNode;
}

/** Radio group rendered as selectable cards (keyboard: arrow keys via native radios). */
export function RadioCards<T extends string>({ name, value, onChange, options, columns = 3, legend }: { name: string; value: T; onChange: (v: T) => void; options: Option<T>[]; columns?: 2 | 3 | 4; legend: string }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold text-fg-strong">{legend}</legend>
      <div className={clsx("grid gap-2.5", columns === 2 ? "sm:grid-cols-2" : columns === 4 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3")}>
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <label
              key={o.value}
              className={clsx(
                "relative flex cursor-pointer gap-3 rounded-xl border-2 p-3.5 transition-colors duration-200 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring",
                selected ? "border-primary bg-primary-soft" : "border-border-soft bg-surface hover:border-border",
              )}
            >
              <input type="radio" name={name} value={o.value} checked={selected} onChange={() => onChange(o.value)} className="sr-only" />
              {o.icon && <span className={clsx("mt-0.5 shrink-0", selected ? "text-primary" : "text-muted-fg")}>{o.icon}</span>}
              <span>
                <span className="block text-sm font-semibold text-fg-strong">{o.label}</span>
                {o.description && <span className="mt-0.5 block text-xs text-muted-fg">{o.description}</span>}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: Option<T>[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg bg-muted p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={clsx(
            "min-h-9 rounded-md px-3 text-sm font-semibold transition-colors duration-200",
            o.value === value ? "bg-surface text-fg-strong shadow-card" : "text-muted-fg hover:text-fg-strong",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
