import { useEffect, useRef, type ReactNode } from "react";
import { X } from "@phosphor-icons/react";
import { IconButton } from "./Button";

/** Accessible modal built on the native <dialog> element (focus trap + Esc handled by the browser). */
export function Dialog({ open, onClose, title, description, children, footer }: { open: boolean; onClose: () => void; title: string; description?: ReactNode; children?: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      opener.current = document.activeElement;
      d.showModal();
    } else if (!open && d.open) {
      d.close();
      (opener.current as HTMLElement | null)?.focus?.();
    }
  }, [open]);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="vh-dialog-title"
      className="m-auto w-[min(92vw,520px)] rounded-2xl border border-border-soft bg-surface p-0 text-fg shadow-pop backdrop:bg-slate-950/55 backdrop:backdrop-blur-[2px]"
    >
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 id="vh-dialog-title" className="text-lg font-bold">
            {title}
          </h2>
          <IconButton label="Close" onClick={onClose} className="-mr-2 -mt-2">
            <X size={20} />
          </IconButton>
        </div>
        {description && <div className="mt-1 text-sm text-muted-fg">{description}</div>}
        {children && <div className="mt-4">{children}</div>}
      </div>
      {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-border-soft px-6 py-4">{footer}</div>}
    </dialog>
  );
}
