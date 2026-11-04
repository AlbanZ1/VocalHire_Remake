// Test documents built in code: a one-page PDF (standard Helvetica text) and a minimal .docx.
import { strToU8, zipSync } from "fflate";

export const CV_LINES = [
  "DANA WHITFIELD",
  "dana.whitfield@example.com | +44 7700 900123 | Leeds",
  "PROFILE",
  "Customer support lead with 6 years of experience in fast-growing SaaS companies.",
  "EXPERIENCE",
  "Support Team Lead, Brightline Software, Leeds | Jan 2021 - Present",
  "- Reduced average first response time from 9 hours to 2 hours by introducing a triage rota",
  "- Led a team of 6 support agents across two time zones",
  "- Built a Zendesk macro library that cut handling time by 25%",
  "Support Agent, Helpdesk Co | 2018 - 2020",
  "- Resolved 60+ tickets a day with a 96% CSAT score",
  "SKILLS",
  "Zendesk, Jira, SQL, coaching",
  "EDUCATION",
  "BA Business Management, University of Leeds, 2018",
];

export const JOB_POSTING = `Customer Support Manager at Northwind
We're hiring a Customer Support Manager to lead our growing support team.
Responsibilities
- Lead and coach a team of 8 support agents
- Own support KPIs such as CSAT and first response time
Requirements
- 4+ years in customer support, including people management
- Hands-on experience with Zendesk
- Fluent Spanish
Nice to have
- SQL`;

export function makePdf(lines: string[]): Buffer {
  const esc = (t: string) => t.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const content = ["BT", "/F1 11 Tf", "16 TL", "50 790 Td", ...lines.map((l, i) => `${i ? "T* " : ""}(${esc(l)}) Tj`), "ET"].join("\n");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

export function makeDocx(paragraphs: string[]): Buffer {
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const body = paragraphs
    .map((p) =>
      p.startsWith("- ")
        ? `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t xml:space="preserve">${esc(p.slice(2))}</w:t></w:r></w:p>`
        : `<w:p><w:r><w:t xml:space="preserve">${esc(p)}</w:t></w:r></w:p>`,
    )
    .join("");
  const xml = (s: string) => strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${s}`);
  return Buffer.from(
    zipSync({
      "[Content_Types].xml": xml(
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
      ),
      "_rels/.rels": xml(
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
      ),
      "word/document.xml": xml(`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`),
    }),
  );
}
