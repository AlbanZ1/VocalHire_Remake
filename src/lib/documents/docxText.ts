// Plain-text extraction from Word (.docx) XML. Pure string processing (no DOM), so it runs in any
// environment and is unit-testable. A .docx is a zip; word/document.xml holds the body text.

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

export function decodeXmlEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_m, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    }
    return ENTITIES[e.toLowerCase()] ?? "";
  });
}

/** Convert WordprocessingML (document.xml) to text: one line per paragraph, bullets for list items. */
export function docxXmlToText(xml: string): string {
  // Tabs and line breaks become text runs so they survive the run extraction below.
  const normalised = xml
    .replace(/<w:tab\s*\/>/g, "<w:t>\t</w:t>")
    .replace(/<w:(?:br|cr)(?:\s[^>]*)?\/>/g, "<w:t>\n</w:t>")
    // Ignore deleted text (tracked changes) and field instructions.
    .replace(/<w:delText[\s\S]*?<\/w:delText>/g, "")
    .replace(/<w:instrText[\s\S]*?<\/w:instrText>/g, "");
  const paragraphs = normalised.split(/<\/w:p>/);
  const lines: string[] = [];
  for (const p of paragraphs) {
    const runs = [...p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((m) => decodeXmlEntities(m[1]));
    const text = runs.join("").replace(/[  ]+/g, " ").trim();
    if (!text) continue;
    const isListItem = /<w:numPr>/.test(p);
    lines.push(isListItem && !/^[•\-–*]/.test(text) ? `• ${text}` : text);
  }
  return lines.join("\n");
}
