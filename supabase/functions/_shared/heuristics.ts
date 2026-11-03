// Deterministic STARR analyser and question writer.
// Runs when no Claude API key is configured, and as a per-call fallback if a model call fails,
// so an interview can never get stuck. Linguistic cues are tuned for spoken English answers.

import type {
  AnswerAnalysis,
  AnswerIntent,
  Competency,
  InterviewConfig,
  ReportNarrative,
  SpeechMetrics,
  StarrKey,
  StarrScores,
  TurnRow,
} from "./types.ts";
import { STARR_KEYS, STARR_LABELS, STARR_WEIGHTS, clamp, computeAnswerScore, emptyStarr, missingComponents } from "./rubric.ts";
import { DEPTH_PROBES, FOLLOW_UP_PROBES, GENERIC_DEPTH_PROBES, pick } from "./questionBank.ts";
import { countWords } from "./speech.ts";

const SITUATION_RE = /\b(when i was|while i was|at my (previous|last|current|old|first) (job|company|role|employer|position|internship)|at (my|our|the) (company|team|school|university|store|restaurant|hospital|firm|agency|startup|clinic|office)|in my (previous|last|current|first|old) (role|job|position|team)|last (year|month|summer|winter|spring|quarter|week)|(\d+|a few|several|two|three|four|five) (years|months|weeks) ago|in (19|20)\d{2}|there was a (time|situation|project|period|moment)|we (had|were facing|faced|were dealing)|the (company|team|client|project|business|store) (was|had|needed|wanted)|our (team|company|client|department|store|biggest)|i was working (as|at|on)|i worked (as|at|on))\b/gi;
const TASK_RE = /\b(my (role|job|responsibility|task|goal|objective|mission|challenge) (was|is)|i was (responsible|tasked|asked|assigned|in charge|accountable|expected)|i (had|needed|wanted) to|i was supposed to|the goal was|my aim was|it was (up to me|my job|my responsibility)|i owned|the challenge (was|for me)|i set out to|my target was)\b/gi;
const ACTION_RE = /\bi (first |then |also |personally |immediately |quickly |eventually |finally |carefully )?(decided|created|built|led|organi[sz]ed|analy[sz]ed|spoke|talked|met|wrote|designed|implemented|developed|proposed|reached out|set up|scheduled|negotiated|prioriti[sz]ed|identified|investigated|researched|trained|coached|presented|introduced|changed|restructured|automated|fixed|resolved|delegated|asked|listened|collaborated|coordinated|drafted|launched|tested|mapped|broke|gathered|reviewed|escalated|volunteered|took|started|made|used|called|emailed|documented|measured|tracked|ran|calculated|planned|redesigned|rewrote|refactored|migrated|deployed|interviewed|hired|mentored|facilitated|aligned|convinced|persuaded|explained|apologi[sz]ed|offered|focused|suggested|recommended|created|shadowed|sat down|pulled|compared|split|streamlined|built|contacted|followed up|helped|supported|stayed|worked)\b/gi;
const WE_ACTION_RE = /\bwe (decided|created|built|did|made|implemented|developed|launched|worked|fixed|resolved|organi[sz]ed|handled|managed|delivered|changed|started|used|took)\b/gi;
const RESULT_RE = /\b(as a result|resulted in|the result( was)?|in the end|ultimately|eventually|which (led|meant|helped|allowed|saved|reduced|increased)|this (led|meant|helped|allowed|reduced|increased|improved|saved)|increased|reduced|decreased|improved|saved|grew|cut|boosted|raised|lowered|doubled|tripled|halved|outcome|delivered|launched|shipped|achieved|met the deadline|on time|under budget|we (won|closed|hit|exceeded|met)|feedback was|(customer|client|manager|team|boss|users?) (was|were) (happy|satisfied|pleased|impressed|thrilled)|got promoted|was recognized|was recognised|went from)\b/gi;
const METRIC_RE = /(\d+(\.\d+)?\s?(%|percent|x\b|times|hours|hrs|days|weeks|months|k\b|m\b|million|thousand|users|customers|clients|people|tickets|points|dollars|euros|pounds|minutes|seconds|calls|sales|deals|students|patients))|([$€£]\s?\d+)/gi;
const REFLECTION_RE = /\b(i learned|i learnt|i('ve| have) learned|lesson|taught me|in hindsight|looking back|next time|i would (do|have|now|probably)|if i (did|could do|had to do) it again|since then|now i (always|make sure|try|know)|i realized|i realised|it showed me|moving forward|going forward|i would change|differently|the biggest takeaway|my takeaway)\b/gi;
const REASONING_RE = /\b(because|so that|in order to|the reason|which meant|to make sure|to ensure|since)\b/gi;
const IMPACT_RE = /\b(customers?|clients?|revenue|sales|team|business|users?|patients?|students?|satisfaction|retention|costs?|profit|quality|morale|deadline)\b/gi;
const BUZZWORDS_RE = /\b(leverag(e|ed|ing)|synerg(y|ies)|spearhead(ed)?|cross-functional|utili[sz](e|ed|ing)|robust|seamless(ly)?|streamlin(e|ed)|foster(ed|ing)?|holistic|paradigm|dynamic|innovative|stakeholder alignment|best practices|value-add|proactively|in today'?s fast-paced|results-driven|detail-oriented|passionate about|impactful|actionable insights|key learnings)\b/gi;
const TEMPLATE_LABELS_RE = /\b(situation|task|action|result|reflection)\s*:/gi;
const STOP_WORDS = new Set("the a an and or but if then so to of in on at for with about from by as is are was were be been being this that these those it its i you we they he she them my your our their me us what when where which who how why tell describe time did do does have has had can could would should will shall may might must there here just very really also into over under more most some any each".split(" "));

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function countMatches(text: string, re: RegExp): number {
  const m = text.match(re);
  return m ? m.length : 0;
}

function firstSentenceMatching(sents: string[], re: RegExp): string {
  for (const s of sents) {
    re.lastIndex = 0;
    if (re.test(s)) {
      re.lastIndex = 0;
      return clipWords(s, 25);
    }
  }
  re.lastIndex = 0;
  return "";
}

function clipWords(s: string, n: number): string {
  const words = s.split(/\s+/);
  return words.length <= n ? s : words.slice(0, n).join(" ");
}

function firstIndex(text: string, re: RegExp): number {
  re.lastIndex = 0;
  const m = re.exec(text);
  re.lastIndex = 0;
  return m ? m.index : -1;
}

function contentWords(text: string): string[] {
  return (text.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => !STOP_WORDS.has(w));
}

function properNounCount(text: string): number {
  let n = 0;
  for (const s of sentences(text)) {
    const words = s.split(/\s+/).slice(1);
    for (const w of words) if (/^[A-Z][a-z]{2,}/.test(w) && w !== "I") n++;
  }
  return n;
}

export interface HeuristicContext {
  question: string;
  competency: Competency | null;
  metrics: SpeechMetrics | null;
  preIntent: AnswerIntent;
}

/** Score an answer against STARR using linguistic cues. Evidence is always a verbatim sentence. */
export function heuristicAnalyze(answer: string, ctx: HeuristicContext): AnswerAnalysis {
  const text = answer.trim();
  const lower = text.toLowerCase();
  const sents = sentences(text);
  const words = countWords(text);
  const starr: StarrScores = emptyStarr();

  if (ctx.preIntent !== "answer" || words === 0) {
    return {
      intent: ctx.preIntent === "answer" ? "skip" : ctx.preIntent,
      starr,
      relevance: 0,
      specificity: 0,
      ownership: 0,
      communication: 0,
      score: 0,
      strengths: [],
      improvements: ctx.preIntent === "skip" ? ["It's okay not to have a perfect example — try a smaller, everyday situation and walk through it step by step."] : [],
      missing: [...STARR_KEYS],
      summary: ctx.preIntent === "manipulation" ? "The response attempted to change the interviewer's behaviour instead of answering." : "No answer was given.",
      claimsToProbe: [],
      authenticity: { aiLikelihood: 0, signals: [] },
      coachingTip: "Answer with one real example: the situation, your task, the actions you took, the result, and what you learned.",
      unverifiedEvidence: [],
      source: "heuristic",
    };
  }

  const sitN = countMatches(lower, SITUATION_RE);
  const taskN = countMatches(lower, TASK_RE);
  const iActions = countMatches(lower, ACTION_RE);
  const weActions = countMatches(lower, WE_ACTION_RE);
  const resN = countMatches(lower, RESULT_RE);
  const metricN = countMatches(lower, METRIC_RE);
  const reflN = countMatches(lower, REFLECTION_RE);
  const reasonN = countMatches(lower, REASONING_RE);
  const impactN = countMatches(lower, IMPACT_RE);
  const nouns = properNounCount(text);
  const years = countMatches(text, /\b(19|20)\d{2}\b/g);

  // Situation
  let s = sitN === 0 ? (words > 60 && sents.length > 3 ? 1 : 0) : sitN === 1 ? 2 : 3;
  if (s >= 2 && (nouns + years + metricN) >= 2) s = Math.min(4, s + 1);
  starr.situation = { score: s, evidence: s > 0 ? firstSentenceMatching(sents, SITUATION_RE) || clipWords(sents[0] ?? "", 25) : "", note: "" };

  // Task
  let t = taskN === 0 ? (iActions >= 2 ? 1 : 0) : taskN === 1 ? 2 : 3;
  if (t >= 2 && metricN > 0 && /\b(goal|target|deadline|aim)\b/.test(lower)) t = 4;
  starr.task = { score: t, evidence: t >= 2 ? firstSentenceMatching(sents, TASK_RE) : "", note: "" };

  // Action
  let a = iActions === 0 ? (weActions > 0 ? 1 : 0) : iActions <= 2 ? 2 : iActions <= 4 ? 3 : 4;
  if (a === 4 && reasonN === 0) a = 3;
  if (a >= 2 && iActions >= 3 && reasonN >= 2) a = Math.max(a, 4);
  starr.action = { score: a, evidence: a >= 2 ? firstSentenceMatching(sents, ACTION_RE) : "", note: "" };

  // Result
  let r = resN === 0 ? (metricN > 0 ? 2 : 0) : 2;
  if (resN > 0 && metricN > 0) r = 3;
  if (r === 3 && (metricN >= 2 || impactN >= 2)) r = 4;
  starr.result = {
    score: r,
    evidence: r >= 2 ? firstSentenceMatching(sents, RESULT_RE) || firstSentenceMatching(sents, METRIC_RE) : "",
    note: "",
  };

  // Reflection
  let rf = reflN === 0 ? 0 : reflN === 1 ? 2 : 3;
  if (rf >= 2 && /\b(since then|now i|going forward|moving forward|ever since)\b/.test(lower)) rf = 4;
  starr.reflection = { score: rf, evidence: rf >= 2 ? firstSentenceMatching(sents, REFLECTION_RE) : "", note: "" };

  // Ensure evidence is non-empty for scored components (fallback to first matching-ish sentence).
  for (const k of STARR_KEYS) {
    if (starr[k].score >= 2 && !starr[k].evidence) starr[k].score = 1;
  }

  // Dimensions
  const qWords = new Set(contentWords(ctx.question));
  const compWords = new Set(contentWords(`${ctx.competency?.name ?? ""} ${ctx.competency?.description ?? ""}`));
  const aWords = contentWords(text);
  const overlap = aWords.filter((w) => qWords.has(w) || compWords.has(w)).length;
  let relevance = overlap >= 4 ? 4 : overlap >= 2 ? 3 : words >= 50 ? 3 : 2;
  if (words < 15) relevance = Math.min(relevance, 1);

  const specCount = metricN + nouns + years;
  const specificity = specCount === 0 ? (words > 40 ? 1 : 0) : specCount <= 2 ? 2 : specCount <= 5 ? 3 : 4;

  const totalActs = iActions + weActions;
  const ratio = totalActs === 0 ? 0 : iActions / totalActs;
  const ownership = totalActs === 0 ? 1 : ratio >= 0.7 && iActions >= 3 ? 4 : ratio >= 0.5 ? 3 : ratio >= 0.25 ? 2 : 1;

  let communication = 3;
  if (words < 40) communication = 2;
  if (words < 20) communication = 1;
  if (words > 450) communication = 2;
  const avgSentence = sents.length ? words / sents.length : words;
  if (avgSentence > 40) communication -= 1;
  if ((ctx.metrics?.fillerRate ?? 0) > 6) communication -= 1;
  const iSit = firstIndex(lower, SITUATION_RE);
  const iAct = firstIndex(lower, ACTION_RE);
  const iRes = firstIndex(lower, RESULT_RE);
  if (iSit >= 0 && iAct > iSit && iRes > iAct && words >= 60) communication += 1;
  communication = Math.round(clamp(communication, 0, 4));

  const dims = { relevance, specificity, ownership, communication };
  const score = computeAnswerScore(starr, dims);
  const missing = missingComponents(starr);

  // Authenticity signals (for human review — never an accusation).
  const signals: string[] = [];
  let ai = 0;
  const buzz = countMatches(lower, BUZZWORDS_RE);
  if (buzz >= 4) {
    ai += 0.25;
    signals.push("Dense corporate buzzwords for a spoken answer");
  } else if (buzz >= 2) ai += 0.1;
  if (countMatches(text, TEMPLATE_LABELS_RE) >= 3) {
    ai += 0.35;
    signals.push("Answer reads out explicit 'Situation/Task/Action/Result' labels");
  }
  if (ctx.metrics?.mode === "voice" && words > 120 && (ctx.metrics.fillerCount ?? 0) === 0 && (ctx.metrics.latencyMs ?? 0) > 12_000) {
    ai += 0.2;
    signals.push("Long pause before a perfectly fluent answer");
  }
  if (words > 150 && specificity <= 1) {
    ai += 0.2;
    signals.push("Polished but generic — few concrete names, numbers or dates");
  }
  if (avgSentence > 26 && words > 120) ai += 0.1;

  const strengths: string[] = [];
  if (starr.action.score >= 3) strengths.push("Clear description of the actions you personally took.");
  if (starr.result.score >= 3) strengths.push("Concrete outcome that shows the impact of your work.");
  if (starr.situation.score >= 3) strengths.push("Context was set up clearly with real stakes.");
  if (starr.reflection.score >= 3) strengths.push("Thoughtful reflection on what you learned.");
  if (specificity >= 3) strengths.push("Specific details make the story credible.");
  if (ownership >= 3 && strengths.length < 3) strengths.push("Strong ownership — your personal contribution comes through.");
  if (strengths.length === 0 && words >= 40) strengths.push("You stayed with the question and gave a real example.");

  const improvements: string[] = [];
  if (starr.situation.score <= 1) improvements.push("Open with one or two sentences of context: where you were, when, and what was at stake.");
  if (starr.task.score <= 1) improvements.push("Say explicitly what your responsibility or goal was (\"My job was to…\").");
  if (starr.action.score <= 1) improvements.push("Describe the specific steps you took yourself — use \"I\" rather than \"we\".");
  if (starr.result.score <= 1) improvements.push("Finish with the outcome, ideally a number: time saved, % improved, customers helped.");
  else if (starr.result.score === 2) improvements.push("Quantify the result if you can — even an estimate makes the impact concrete.");
  if (starr.reflection.score <= 1) improvements.push("Close with what you learned or would do differently next time.");
  if (ownership <= 1 && starr.action.score > 1) improvements.push("Separate your own contribution from the team's.");
  if (communication <= 1) improvements.push(words < 40 ? "Give a fuller answer — aim for about one to two minutes." : "Tighten the structure: beginning, middle, end.");

  // Weakest = the component whose gap costs the most points (weight × missing score).
  const weakest = STARR_KEYS.reduce((w, k) =>
    STARR_WEIGHTS[k] * (4 - starr[k].score) > STARR_WEIGHTS[w] * (4 - starr[w].score) ? k : w,
  );
  const coachingTip = improvements[0] ?? `Keep doing what worked; to push higher, add even more detail to your ${STARR_LABELS[weakest].toLowerCase()}.`;

  const claims: string[] = [];
  for (const sent of sents) {
    METRIC_RE.lastIndex = 0;
    if (METRIC_RE.test(sent) || /\bi (led|built|designed|increased|reduced|saved|launched|created)\b/i.test(sent)) claims.push(clipWords(sent.replace(/[.!?]+$/, ""), 14));
    METRIC_RE.lastIndex = 0;
    if (claims.length >= 2) break;
  }

  const present = STARR_KEYS.filter((k) => starr[k].score >= 2).map((k) => STARR_LABELS[k]);
  const summary = present.length
    ? `Covers ${present.join(", ")}${missing.length ? `; light on ${missing.map((k) => STARR_LABELS[k]).join(", ")}` : ""}.`
    : "The answer does not yet follow a clear story structure.";

  return {
    intent: "answer",
    starr,
    ...dims,
    score,
    strengths: strengths.slice(0, 3),
    improvements: improvements.slice(0, 3),
    missing,
    summary,
    claimsToProbe: claims,
    authenticity: { aiLikelihood: Math.round(clamp(ai, 0, 1) * 100) / 100, signals },
    coachingTip,
    unverifiedEvidence: [],
    source: "heuristic",
  };
}

/** Choose what to probe next: the weakest high-weight component, or a depth probe on a claim. */
export function heuristicFollowUp(
  analysis: AnswerAnalysis,
  salt: number,
  preferDepth: boolean,
  alreadyAsked: (q: string) => boolean = () => false,
): string {
  const firstFresh = (options: string[]): string => {
    const rotated = options.map((_, i) => options[(i + salt) % options.length]);
    return rotated.find((q) => !alreadyAsked(q)) ?? pick(options, salt);
  };
  if (preferDepth || analysis.missing.length === 0) {
    const claim = analysis.claimsToProbe[0];
    if (claim) return firstFresh(DEPTH_PROBES.map((p) => p.replace("{claim}", `"${claim}"`)));
    return firstFresh(GENERIC_DEPTH_PROBES);
  }
  const order: StarrKey[] = ["action", "result", "task", "situation", "reflection"];
  const target = order.find((k) => analysis.missing.includes(k)) ?? analysis.missing[0];
  return firstFresh(FOLLOW_UP_PROBES[target]);
}

export function heuristicNarrative(input: {
  config: InterviewConfig;
  overall: number;
  label: string;
  starr: Record<StarrKey, number>;
  turns: TurnRow[];
  competencies: { name: string; score: number }[];
  mode: "practice" | "business";
}): ReportNarrative {
  const { starr, turns, overall, label } = input;
  const ranked = [...STARR_KEYS].sort((a, b) => starr[b] - starr[a]);
  const best = ranked[0];
  const worst = ranked[ranked.length - 1];
  const freq = (items: string[]) => {
    const m = new Map<string, number>();
    for (const i of items) m.set(i, (m.get(i) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  };
  const answered = turns.filter((t) => t.analysis && t.analysis.intent === "answer");
  const strengths = freq(answered.flatMap((t) => t.analysis!.strengths)).slice(0, 3);
  const growth = freq(answered.flatMap((t) => t.analysis!.improvements)).slice(0, 3);
  const comps = [...input.competencies].sort((a, b) => b.score - a.score);

  const nextSteps: string[] = [];
  if (starr[worst] < 3) nextSteps.push(`Practise adding a strong ${STARR_LABELS[worst].toLowerCase()} to every story: ${worstTip(worst)}`);
  if (starr.result < 3 && worst !== "result") nextSteps.push("Prepare 3–4 stories with a measurable result (a number, a before/after, or concrete feedback).");
  nextSteps.push("Write down five go-to stories from your experience and map each to Situation, Task, Action, Result and Reflection.");
  if (comps.length > 1) nextSteps.push(`Run a focused practice on "${comps[comps.length - 1].name}" — it was your lowest-scoring area.`);

  const questionCoaching = turns
    .filter((t) => t.kind === "main" && t.analysis)
    .map((t) => ({ seq: t.seq, outline: buildOutline(t) }));

  const headline =
    overall >= 70
      ? `A ${label.toLowerCase()} interview — your ${STARR_LABELS[best].toLowerCase()} really stood out.`
      : overall >= 50
        ? `A ${label.toLowerCase()} foundation — strengthening your ${STARR_LABELS[worst].toLowerCase()} will lift every answer.`
        : `A good first step — with more structure, especially around your ${STARR_LABELS[worst].toLowerCase()}, your answers will land much better.`;

  const summary = `Across ${answered.length} answer${answered.length === 1 ? "" : "s"} you scored ${overall}/100 overall. Your strongest STARR element was ${STARR_LABELS[best]} (${starr[best]}/4) and the biggest opportunity is ${STARR_LABELS[worst]} (${starr[worst]}/4).${comps[0] ? ` Your strongest competency was ${comps[0].name}.` : ""}`;

  const hiringSummary =
    input.mode === "business"
      ? `Candidate scored ${overall}/100 (${label}). Strongest: ${comps[0]?.name ?? "n/a"}; weakest: ${comps[comps.length - 1]?.name ?? "n/a"}. STARR profile — strongest ${STARR_LABELS[best]}, weakest ${STARR_LABELS[worst]}. Review transcript and integrity signals before deciding.`
      : "";

  return {
    headline,
    summary,
    strengths: strengths.length ? strengths : ["You completed the interview and gave real examples — that's the hardest part."],
    growthAreas: growth.length ? growth : ["Keep adding specific numbers and names to make your stories vivid."],
    nextSteps: nextSteps.slice(0, 4),
    hiringSummary,
    questionCoaching,
  };
}

function worstTip(k: StarrKey): string {
  switch (k) {
    case "situation":
      return "open with where, when and what was at stake in one or two sentences.";
    case "task":
      return "state your personal goal or responsibility explicitly.";
    case "action":
      return "walk through 3–4 concrete steps you personally took and why.";
    case "result":
      return "end with a measurable outcome and its impact.";
    case "reflection":
      return "close with a lesson and how you've applied it since.";
  }
}

function buildOutline(t: TurnRow): string {
  const a = t.analysis!;
  const parts = STARR_KEYS.map((k) => {
    const ev = a.starr[k];
    if (ev.score >= 2 && ev.evidence) return `${STARR_LABELS[k]}: “${ev.evidence}”`;
    return `${STARR_LABELS[k]}: [add — ${worstTip(k)}]`;
  });
  return parts.join("\n");
}
