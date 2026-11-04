import { CheckCircle, Circle } from "@phosphor-icons/react";
import { clsx } from "clsx";
import { STARR_KEYS, STARR_LABELS } from "../../../supabase/functions/_shared/rubric.ts";
import type { StarrKey } from "../../../supabase/functions/_shared/types.ts";

export function StarrChecklist({ check, compact }: { check: Record<StarrKey, boolean>; compact?: boolean }) {
  return (
    <ul className={clsx("flex flex-wrap gap-1.5", compact && "gap-1")} aria-label="STARR elements in your last answer">
      {STARR_KEYS.map((k) => (
        <li
          key={k}
          className={clsx(
            "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
            check[k] ? "bg-success-bg text-success" : "bg-muted text-muted-fg",
          )}
        >
          {check[k] ? <CheckCircle size={14} weight="fill" aria-hidden="true" /> : <Circle size={14} aria-hidden="true" />}
          {STARR_LABELS[k]}
          <span className="sr-only">{check[k] ? "present" : "missing"}</span>
        </li>
      ))}
    </ul>
  );
}
