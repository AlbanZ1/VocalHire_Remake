import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CheckCircle, Info, WarningCircle, X } from "@phosphor-icons/react";
import { clsx } from "clsx";

type ToastTone = "success" | "info" | "error";
interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

const ToastContext = createContext<((message: string, tone?: ToastTone) => void) | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((message: string, tone: ToastTone = "info") => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs.slice(-2), { id, tone, message }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), tone === "error" ? 7000 : 4000);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4" aria-live="polite" role="status">
        {items.map((t) => (
          <div
            key={t.id}
            className={clsx(
              "pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-pop",
              t.tone === "success" && "border-success/30 bg-success-bg text-success",
              t.tone === "info" && "border-border bg-surface text-fg-strong",
              t.tone === "error" && "border-destructive/30 bg-danger-bg text-destructive",
            )}
          >
            {t.tone === "success" ? <CheckCircle size={20} weight="fill" /> : t.tone === "error" ? <WarningCircle size={20} weight="fill" /> : <Info size={20} weight="fill" />}
            <p className="flex-1 font-medium">{t.message}</p>
            <button type="button" aria-label="Dismiss" className="-m-1 rounded p-1 opacity-70 hover:opacity-100" onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))}>
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
