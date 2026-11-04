// Read a CV or job posting file entirely in the browser and return its text.
// Supported: PDF (pdf.js, lazy-loaded), Word .docx, plain text / Markdown, and basic RTF.
// The file itself never leaves the device — only the extracted text is sent to VocalHire.

import { docxXmlToText } from "./docxText";

export interface ExtractResult {
  text: string;
  kind: "pdf" | "docx" | "text" | "rtf";
  pages?: number;
  warnings: string[];
}

export class ExtractError extends Error {}

export const ACCEPTED_DOCUMENTS = ".pdf,.docx,.txt,.md,.rtf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,application/rtf,text/rtf";
const MAX_FILE_BYTES = 10 * 1024 * 1024;

export function normaliseText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/ /g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extensionOf(name: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

async function extractPdf(buf: ArrayBuffer): Promise<{ text: string; pages: number }> {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const task = pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true });
  const doc = await task.promise;
  const pages: string[] = [];
  try {
    for (let n = 1; n <= Math.min(doc.numPages, 20); n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      let out = "";
      let lastY: number | null = null;
      for (const item of content.items) {
        if (!("str" in item)) continue;
        const y = Array.isArray(item.transform) ? Number(item.transform[5]) : null;
        // A jump in baseline without an explicit EOL still means a new line.
        if (lastY !== null && y !== null && Math.abs(y - lastY) > 2 && out && !out.endsWith("\n")) out += "\n";
        out += item.str;
        if (item.hasEOL) out += "\n";
        if (y !== null) lastY = y;
      }
      pages.push(out);
      page.cleanup();
    }
    return { text: pages.join("\n\n"), pages: doc.numPages };
  } finally {
    await task.destroy();
  }
}

async function extractDocx(buf: ArrayBuffer): Promise<string> {
  const { unzipSync, strFromU8 } = await import("fflate");
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(buf), { filter: (f) => f.name === "word/document.xml" });
  } catch {
    throw new ExtractError("This doesn't look like a valid Word (.docx) file.");
  }
  const xml = files["word/document.xml"];
  if (!xml) throw new ExtractError("We couldn't find any text in this Word file.");
  return docxXmlToText(strFromU8(xml));
}

function rtfToText(rtf: string): string {
  return rtf
    .replace(/\\par[d]?/g, "\n")
    .replace(/\\'([0-9a-f]{2})/gi, (_m, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\[a-z]+-?\d* ?/gi, "")
    .replace(/[{}]/g, "");
}

export async function extractText(file: File, maxChars: number): Promise<ExtractResult> {
  if (file.size > MAX_FILE_BYTES) throw new ExtractError("That file is larger than 10 MB. Please upload a smaller file or paste the text instead.");
  const ext = extensionOf(file.name);
  const warnings: string[] = [];
  let kind: ExtractResult["kind"];
  let text: string;
  let pages: number | undefined;

  if (ext === "pdf" || file.type === "application/pdf") {
    kind = "pdf";
    try {
      const r = await extractPdf(await file.arrayBuffer());
      text = r.text;
      pages = r.pages;
    } catch (e) {
      if (e instanceof Error && /password/i.test(e.name + e.message)) throw new ExtractError("This PDF is password-protected. Please upload an unlocked copy or paste the text instead.");
      throw new ExtractError("We couldn't read this PDF. Try exporting it again, or paste the text instead.");
    }
    if (pages && pages > 20) warnings.push("Only the first 20 pages were read.");
    if (text.replace(/\s/g, "").length < 120) {
      throw new ExtractError("This PDF seems to be a scanned image, so there's no text to read. Please upload a text-based PDF or Word file, or paste the text instead.");
    }
  } else if (ext === "docx" || file.type.includes("wordprocessingml")) {
    kind = "docx";
    text = await extractDocx(await file.arrayBuffer());
  } else if (ext === "doc") {
    throw new ExtractError("Old Word .doc files aren't supported. Please save it as .docx or PDF, or paste the text instead.");
  } else if (ext === "rtf" || file.type.includes("rtf")) {
    kind = "rtf";
    text = rtfToText(await file.text());
  } else if (["txt", "md", "markdown", "text"].includes(ext) || file.type.startsWith("text/")) {
    kind = "text";
    text = await file.text();
  } else {
    throw new ExtractError("Unsupported file type. Please upload a PDF, Word (.docx) or text file — or paste the text instead.");
  }

  text = normaliseText(text);
  if (!text) throw new ExtractError("We couldn't find any text in this file. Please paste the text instead.");
  if (text.length > maxChars) {
    text = text.slice(0, maxChars);
    warnings.push(`The document was long, so only the first ${maxChars.toLocaleString()} characters are used.`);
  }
  return { text, kind, pages, warnings };
}
