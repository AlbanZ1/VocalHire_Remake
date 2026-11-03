// Guardrails: keep VocalHire doing exactly one job — running an interview.
//
// Layers (defence in depth):
//  1. Input limits + sanitisation before anything reaches a model.
//  2. Deterministic detection of manipulation / prompt-injection attempts (this file).
//  3. A hardened system prompt that treats candidate text as untrusted data (prompts.ts).
//  4. Schema-constrained model output, validated again with zod (llm.ts).
//  5. Server-side scoring + evidence verification — the model never sets the score (rubric.ts).
//  6. Output validation of every line the interviewer will speak (this file).
//  7. Server-owned interview state: the client can only submit an answer to the pending question.

import type { AnswerIntent } from "./types.ts";

export const MAX_ANSWER_CHARS = 6000;
export const MAX_QUESTION_CHARS = 420;

interface PatternRule {
  re: RegExp;
  weight: number;
  label: string;
}

// Patterns are intentionally specific so that legitimate stories ("my manager told me to ignore
// the previous plan") are not flagged. Weights add up; >= 3 is treated as manipulation.
const INJECTION_RULES: PatternRule[] = [
  { re: /\b(ignore|disregard|forget|override|bypass)\b[^.?!]{0,40}\b(previous|prior|above|earlier|all|your|the|these|system)\b[^.?!]{0,25}\b(instruction|instructions|prompt|prompts|rules|guidelines|directions|context)\b/i, weight: 4, label: "instruction override" },
  { re: /\b(system|developer|hidden|initial|original)\s+(prompt|message|instructions)\b/i, weight: 3, label: "system prompt probe" },
  { re: /\b(reveal|print|show|repeat|output|display|tell me)\b[^.?!]{0,30}\b(your|the)\b[^.?!]{0,20}\b(instructions|prompt|rules|rubric|configuration|guidelines)\b/i, weight: 4, label: "instruction extraction" },
  { re: /\byou are (now|no longer)\b/i, weight: 3, label: "role reassignment" },
  { re: /\b(act|behave|respond|roleplay|role-play)\s+as\s+(if\s+you\s+(were|are)\s+)?(an?\s+)?(different|new|unrestricted|evil|dan|jailbroken|developer|admin|ai|assistant|chatbot|gpt|language model)\b/i, weight: 3, label: "persona hijack" },
  { re: /\b(pretend|imagine)\s+(that\s+)?you\s+(are|were|have)\b/i, weight: 2, label: "pretend framing" },
  { re: /\b(jailbreak|jail-break|dan mode|developer mode|god mode|do anything now)\b/i, weight: 4, label: "jailbreak keyword" },
  { re: /\b(give|award|assign|grant|mark)\s+(me|this|this answer|my answer)\b[^.?!]{0,30}\b(full|perfect|maximum|max|top|highest|100|10|5|five|ten)\b[^.?!]{0,15}\b(score|scores|marks|points|rating|grade)\b/i, weight: 4, label: "score request" },
  { re: /\b(score|rate|grade|evaluate)\s+(me|this|this answer|my answer)\s+(as\s+)?(a\s+)?(perfect|100|10|5|five|ten|excellent|exceptional|maximum|max)\b/i, weight: 4, label: "score request" },
  { re: /\b(set|change|make)\s+(my|the)\s+(score|rating|grade|result|recommendation)\b/i, weight: 4, label: "score tampering" },
  { re: /\b(recommend|mark)\s+me\s+(as\s+)?(a\s+)?(strong\s+)?(hire|yes|pass)\b/i, weight: 3, label: "outcome tampering" },
  { re: /<\/?\s*(system|assistant|user|candidate_answer|instructions?|transcript|interview_context|task)\s*>/i, weight: 4, label: "tag injection" },
  { re: /^\s*(system|assistant|developer)\s*:/im, weight: 3, label: "role prefix" },
  { re: /\b(new|updated|additional)\s+(instructions|rules|task)\s*:/i, weight: 3, label: "instruction block" },
  { re: /\bas an ai (language )?model\b/i, weight: 1, label: "ai phrasing" },
  { re: /\b(end|stop|terminate)\s+(the|this)\s+interview\s+and\b/i, weight: 2, label: "flow hijack" },
  { re: /\b(anthropic|claude|openai|chatgpt|gpt-?\d|llm|large language model)\b[^.?!]{0,40}\b(instructions|prompt|model|rules|you)\b/i, weight: 2, label: "model probe" },
];

const SKIP_RE = /^\s*(skip|pass|next( question)?|i (don'?t|do not) know|no idea|i have no (answer|example)|i can'?t (think of|answer)|no comment|nothing)[\s.!]*$/i;
const CLARIFY_RE = /^\s*(sorry[,.]?\s*)?(could|can|would) you (please )?(repeat|rephrase|clarify|say that again|explain)|^\s*(what do you mean|i (didn'?t|did not) (understand|catch|hear)( that| the question)?|pardon|come again|repeat (the|that) question|say (that|it) again)\b/i;

export interface InjectionCheck {
  flagged: boolean;
  score: number;
  matches: string[];
}

export function detectInjection(text: string): InjectionCheck {
  const matches: string[] = [];
  let score = 0;
  for (const rule of INJECTION_RULES) {
    if (rule.re.test(text)) {
      score += rule.weight;
      matches.push(rule.label);
    }
  }
  return { flagged: score >= 3, score, matches: [...new Set(matches)] };
}

/** Fast, deterministic pre-classification. The model can refine "answer" into off_topic etc. */
export function preClassify(text: string): { intent: AnswerIntent; injection: InjectionCheck } {
  const injection = detectInjection(text);
  if (injection.flagged) return { intent: "manipulation", injection };
  const trimmed = text.trim();
  if (trimmed.length === 0 || SKIP_RE.test(trimmed)) return { intent: "skip", injection };
  if (trimmed.split(/\s+/).length <= 25 && CLARIFY_RE.test(trimmed)) return { intent: "clarification", injection };
  return { intent: "answer", injection };
}

/**
 * Normalise candidate text before it is embedded in a prompt:
 *  - strip control characters and zero-width characters (used to smuggle hidden instructions),
 *  - neutralise angle brackets so the text cannot close our XML wrappers,
 *  - collapse runs of whitespace, enforce a length limit.
 */
export function sanitizeCandidateText(text: string, max = MAX_ANSWER_CHARS): string {
  return String(text ?? "")
    .normalize("NFKC")
    .replace(/[​-‏‪-‮⁠-⁤﻿]/g, "")
    // deno-lint-ignore no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/</g, "‹")
    .replace(/>/g, "›")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

/** Short free-text fields (names, role titles, competencies) — no newlines, tight length. */
export function sanitizeShortText(text: unknown, max = 120): string {
  return sanitizeCandidateText(String(text ?? ""), max).replace(/\s+/g, " ").trim();
}

const FORBIDDEN_OUTPUT = [
  /\b(system prompt|my instructions|these instructions|the rubric|starr rubric|json)\b/i,
  /\b(as an ai|language model|anthropic|claude|openai|chatgpt)\b/i,
  /\b(your|this answer'?s?|the candidate'?s?)\s+(score|scoring|rating|grade)\b/i,
  /\b(score|scored|points?|rating|graded?)\b\s*(of|:|=)?\s*\d/i,
  /\b(strong[_ ]yes|lean[_ ]no|hiring recommendation)\b/i,
  /https?:\/\//i,
  /[<>{}[\]`*#|]/,
];

/** Validate a line the interviewer will SAY. Returns cleaned text or null if unusable. */
export function validateSpokenLine(text: unknown, opts: { requireQuestion?: boolean; max?: number } = {}): string | null {
  if (typeof text !== "string") return null;
  let t = text.replace(/\s+/g, " ").replace(/^["'\s]+|["'\s]+$/g, "").trim();
  const max = opts.max ?? MAX_QUESTION_CHARS;
  if (t.length < (opts.requireQuestion ? 12 : 2)) return null;
  if (t.length > max) return null;
  for (const re of FORBIDDEN_OUTPUT) if (re.test(t)) return null;
  if (opts.requireQuestion) {
    const looksLikeQuestion =
      t.includes("?") ||
      /^(tell me|describe|walk me through|share|give me|talk me through|take me through|explain|think of|recall|imagine|suppose|picture)\b/i.test(t);
    if (!looksLikeQuestion) return null;
    if (!/[?.]$/.test(t)) t += "?";
  }
  return t;
}

/** Normalise a question for repeat detection. */
export function questionFingerprint(q: string): string {
  return q
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 14)
    .join(" ");
}

export function isRepeatQuestion(q: string, asked: string[]): boolean {
  const fp = questionFingerprint(q);
  if (!fp) return false;
  const words = new Set(fp.split(" "));
  return asked.some((a) => {
    if (a === fp) return true;
    const other = a.split(" ");
    if (other.length === 0) return false;
    const overlap = other.filter((w) => words.has(w)).length / Math.max(other.length, words.size);
    return overlap >= 0.75;
  });
}

/** Fixed, non-negotiable redirect used when a manipulation attempt is detected. */
export function redirectLine(persona: string): string {
  if (persona === "supportive") {
    return "Let's keep our focus on the interview — I'm only able to help with that here. Take your time and answer the question in your own words.";
  }
  return "I can only continue with the interview itself. Please answer the question in your own words.";
}

export const ALLOWED_EVENT_TYPES = new Set([
  "tab_hidden",
  "window_blur",
  "fullscreen_exit",
  "paste_attempt",
  "paste",
  "copy",
  "typing_burst",
  "multiple_screens",
  "face_missing",
  "multiple_faces",
  "gaze_away",
  "reading_pattern",
  "lip_sync_mismatch",
  "camera_denied",
  "camera_stopped",
  "mic_stopped",
  "devtools",
  "context_menu",
  "presence_stats",
  "heartbeat",
]);
