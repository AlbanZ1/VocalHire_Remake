import { useId, useRef, useState, type DragEvent, type ReactNode } from "react";
import { ArrowsClockwise, ClipboardText, FileArrowUp, FileText, LockSimple, Trash, UploadSimple } from "@phosphor-icons/react";
import { clsx } from "clsx";
import { Textarea } from "@/components/ui/Field";
import { Spinner } from "@/components/ui/Spinner";
import { ACCEPTED_DOCUMENTS, ExtractError, extractText, normaliseText, type ExtractResult } from "@/lib/documents/extract";

interface Props {
  label: string;
  kind: "cv" | "job";
  value: string;
  onChange: (text: string) => void;
  maxChars: number;
  required?: boolean;
  hint?: ReactNode;
  pastePlaceholder?: string;
  error?: string | null;
  /** Start in paste mode (e.g. for job postings, which are usually copied from a web page). */
  preferPaste?: boolean;
}

const KIND_LABEL: Record<ExtractResult["kind"], string> = { pdf: "PDF", docx: "Word", text: "Text", rtf: "RTF" };

function words(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

/**
 * Upload (PDF / Word / text, drag-and-drop) or paste a document. Files are read in the browser;
 * only the extracted text is passed to `onChange`.
 */
export function DocumentInput({ label, kind, value, onChange, maxChars, required, hint, pastePlaceholder, error, preferPaste }: Props) {
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"upload" | "paste">(preferPaste ? "paste" : "upload");
  const [file, setFile] = useState<{ name: string; kind: ExtractResult["kind"]; pages?: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [showText, setShowText] = useState(false);
  const noun = kind === "cv" ? "CV" : "job posting";
  // Text that arrived without a file (pasted, or carried over from another page) is shown for editing.
  const pasteMode = mode === "paste" || (!file && !!value);

  async function handle(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    setProblem(null);
    setWarnings([]);
    try {
      const r = await extractText(f, maxChars);
      setFile({ name: f.name, kind: r.kind, pages: r.pages });
      setWarnings(r.warnings);
      onChange(r.text);
      setShowText(false);
    } catch (e) {
      setProblem(e instanceof ExtractError ? e.message : `We couldn't read that file. Try another format, or paste the text instead.`);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    void handle(e.dataTransfer.files?.[0]);
  }

  function clear() {
    setFile(null);
    setWarnings([]);
    setProblem(null);
    onChange("");
  }

  const describedBy = [hint ? `${id}-hint` : null, error || problem ? `${id}-err` : null].filter(Boolean).join(" ") || undefined;
  const fileInput = (
    <input ref={fileRef} type="file" accept={ACCEPTED_DOCUMENTS} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => void handle(e.target.files?.[0])} />
  );

  return (
    <div className="space-y-2" data-testid={`doc-${kind}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p id={`${id}-label`} className="text-sm font-semibold text-fg-strong">
          {label}
          {required ? (
            <span className="ml-0.5 text-destructive" aria-hidden="true">*</span>
          ) : (
            <span className="ml-1.5 text-xs font-medium text-muted-fg">(optional)</span>
          )}
        </p>
        {!file && (
          <button
            type="button"
            onClick={() => {
              if (!pasteMode) setMode("paste");
              else if (value) fileRef.current?.click();
              else setMode("upload");
            }}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-1 text-sm font-semibold text-primary hover:underline"
          >
            {pasteMode ? <UploadSimple size={16} /> : <ClipboardText size={16} />}
            {pasteMode ? "Upload a file instead" : "Paste text instead"}
          </button>
        )}
      </div>

      {file && value ? (
        <div className="rounded-xl border border-border-soft bg-surface p-3.5">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <FileText size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-fg-strong" title={file.name}>
                {file.name}
              </p>
              <p className="text-xs text-muted-fg">
                {KIND_LABEL[file.kind]}
                {file.pages ? ` · ${file.pages} page${file.pages === 1 ? "" : "s"}` : ""} · {words(value).toLocaleString()} words read
              </p>
            </div>
            <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex size-10 items-center justify-center rounded-lg text-muted-fg hover:bg-muted hover:text-fg-strong" aria-label={`Replace ${noun}`} title="Replace">
              <ArrowsClockwise size={18} />
            </button>
            <button type="button" onClick={clear} className="inline-flex size-10 items-center justify-center rounded-lg text-muted-fg hover:bg-muted hover:text-destructive" aria-label={`Remove ${noun}`} title="Remove">
              <Trash size={18} />
            </button>
          </div>
          <button type="button" onClick={() => setShowText((v) => !v)} className="mt-2 text-xs font-semibold text-primary hover:underline" aria-expanded={showText}>
            {showText ? "Hide the text we read" : "Check the text we read"}
          </button>
          {showText && (
            <Textarea
              className="mt-2 text-sm"
              rows={8}
              value={value}
              maxLength={maxChars}
              onChange={(e) => onChange(e.target.value)}
              aria-label={`Text read from your ${noun} (you can correct it)`}
            />
          )}
        </div>
      ) : !pasteMode ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={clsx(
            "rounded-xl border-2 border-dashed transition-colors duration-200",
            dragging ? "border-primary bg-primary-soft" : error || problem ? "border-destructive/60" : "border-border hover:border-primary/60",
          )}
        >
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            aria-labelledby={`${id}-label`}
            aria-describedby={describedBy}
            className="flex w-full flex-col items-center gap-2 px-4 py-6 text-center"
          >
            {busy ? <Spinner className="size-7 text-primary" label={`Reading your ${noun}`} /> : <FileArrowUp size={30} className="text-primary" />}
            <span className="text-sm font-semibold text-fg-strong">{busy ? `Reading your ${noun}…` : <>Drop your {noun} here or <span className="text-primary underline">browse</span></>}</span>
            <span className="text-xs text-muted-fg">PDF, Word (.docx), RTF or text · up to 10 MB</span>
          </button>
        </div>
      ) : (
        <Textarea
          rows={kind === "cv" ? 8 : 7}
          value={value}
          maxLength={maxChars}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => {
            const t = normaliseText(e.target.value);
            if (t !== e.target.value) onChange(t);
          }}
          aria-labelledby={`${id}-label`}
          aria-describedby={describedBy}
          aria-invalid={!!error}
          placeholder={pastePlaceholder ?? (kind === "cv" ? "Paste your CV text…" : "Paste the job posting from anywhere — a job board, the company's site, an email…")}
        />
      )}

      {fileInput}
      {(error || problem) && (
        <p id={`${id}-err`} className="text-sm font-medium text-destructive" role="alert">
          {error || problem}
        </p>
      )}
      {warnings.map((w) => (
        <p key={w} className="text-xs font-medium text-warning">
          {w}
        </p>
      ))}
      {hint && !error && !problem && (
        <p id={`${id}-hint`} className="flex items-start gap-1.5 text-xs text-muted-fg">
          <LockSimple size={14} className="mt-px shrink-0" aria-hidden="true" />
          <span>{hint}</span>
        </p>
      )}
    </div>
  );
}
