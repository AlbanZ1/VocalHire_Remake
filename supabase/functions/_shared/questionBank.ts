// Competency library + curated question bank.
// Used for: interview planning, the heuristic engine, and as a guaranteed-safe fallback whenever
// a model-written question fails validation.

import type { Competency, InterviewStyle, Persona, Seniority, StarrKey } from "./types.ts";

interface CompetencyDef extends Competency {
  behavioral: string[];
  situational: string[];
}

export const COMPETENCIES: Record<string, CompetencyDef> = {
  problem_solving: {
    key: "problem_solving",
    name: "Problem solving",
    description: "Breaks down ambiguous problems, finds root causes and drives to a workable solution.",
    behavioral: [
      "Tell me about a time you faced a problem with no obvious solution. How did you approach it?",
      "Describe a situation where you had to find the root cause of a recurring issue. What did you do?",
      "Tell me about the most complex problem you've solved in your work so far.",
    ],
    situational: [
      "Imagine you join as a {role} and discover a critical process that keeps failing, but nobody knows why. How would you tackle it in your first two weeks?",
      "Suppose a key deliverable breaks the day before a deadline and the usual fix doesn't work. Walk me through what you would do.",
    ],
  },
  teamwork: {
    key: "teamwork",
    name: "Collaboration",
    description: "Works effectively with others, shares credit and helps the team succeed.",
    behavioral: [
      "Tell me about a time you worked with a team to achieve something you couldn't have done alone. What was your part?",
      "Describe a time you helped a struggling teammate. What did you do and what happened?",
      "Tell me about a project where collaboration across teams was essential. How did you make it work?",
    ],
    situational: [
      "Suppose you are paired with a colleague whose working style is very different from yours on an important project. How would you make the partnership work?",
      "Imagine your team is split on how to approach a project and progress has stalled. What would you do?",
    ],
  },
  communication: {
    key: "communication",
    name: "Communication",
    description: "Explains ideas clearly, adapts to the audience and listens actively.",
    behavioral: [
      "Tell me about a time you had to explain something complex to someone without your background. How did you do it?",
      "Describe a situation where a miscommunication caused a problem. What did you do to fix it?",
      "Tell me about a time you had to deliver difficult news. How did you handle the conversation?",
    ],
    situational: [
      "Imagine you need to present a recommendation to senior leaders who have only five minutes. How would you prepare and structure it?",
      "Suppose a stakeholder keeps misunderstanding your updates. What would you change?",
    ],
  },
  leadership: {
    key: "leadership",
    name: "Leadership & influence",
    description: "Sets direction, motivates others and influences without relying on authority.",
    behavioral: [
      "Tell me about a time you led a group toward a goal. How did you get people on board?",
      "Describe a time you influenced a decision without having formal authority.",
      "Tell me about a time you had to rally a team after a setback.",
    ],
    situational: [
      "Imagine you inherit a team with low morale and a tight deadline. What would you do in your first month?",
      "Suppose two senior people on your team disagree publicly about direction. How would you lead through it?",
    ],
  },
  conflict: {
    key: "conflict",
    name: "Conflict resolution",
    description: "Handles disagreement constructively and finds outcomes people can commit to.",
    behavioral: [
      "Tell me about a time you disagreed with a colleague or manager. How did you handle it?",
      "Describe a conflict within a team you were part of. What role did you play in resolving it?",
      "Tell me about a time you had to work with someone who was difficult to work with.",
    ],
    situational: [
      "Suppose a colleague takes credit for work you did in front of your manager. How would you handle it?",
      "Imagine two people you depend on give you conflicting instructions. What would you do?",
    ],
  },
  adaptability: {
    key: "adaptability",
    name: "Adaptability",
    description: "Adjusts quickly to change, learns new things fast and stays effective under uncertainty.",
    behavioral: [
      "Tell me about a time priorities changed suddenly. How did you adapt?",
      "Describe a time you had to learn something new very quickly to get a job done.",
      "Tell me about a time you worked through a lot of uncertainty or ambiguity.",
    ],
    situational: [
      "Imagine the tools or process your team relies on are replaced overnight with something unfamiliar. How would you get up to speed?",
      "Suppose your project's goals change halfway through. What would you do first?",
    ],
  },
  ownership: {
    key: "ownership",
    name: "Ownership & accountability",
    description: "Takes responsibility for outcomes, follows through and owns mistakes.",
    behavioral: [
      "Tell me about a time you made a mistake at work. What happened and what did you do about it?",
      "Describe a time you took responsibility for something that wasn't strictly your job.",
      "Tell me about a commitment you found hard to keep. How did you follow through?",
    ],
    situational: [
      "Suppose you realise a report you sent last week contained an error that a client has already acted on. What would you do?",
      "Imagine you notice a problem that falls between two teams and nobody is addressing it. How would you respond?",
    ],
  },
  customer_focus: {
    key: "customer_focus",
    name: "Customer focus",
    description: "Understands customer needs and goes the extra mile to deliver value.",
    behavioral: [
      "Tell me about a time you went above and beyond for a customer or client.",
      "Describe a time you dealt with an unhappy customer. What did you do?",
      "Tell me about a time you used customer feedback to change how something was done.",
    ],
    situational: [
      "Imagine a loyal customer asks for something that goes against company policy. How would you handle it?",
      "Suppose customer complaints about one issue double in a month. What would you do?",
    ],
  },
  prioritization: {
    key: "prioritization",
    name: "Prioritisation",
    description: "Manages competing demands, focuses on what matters most and meets deadlines.",
    behavioral: [
      "Tell me about a time you had more work than you could possibly finish. How did you decide what to do?",
      "Describe a time you had to say no, or not yet, to an important request.",
      "Tell me about a time you delivered under a very tight deadline.",
    ],
    situational: [
      "Imagine three stakeholders each tell you their request is the top priority this week. How would you decide?",
      "Suppose you are halfway through a sprint and an urgent request arrives. What would you do?",
    ],
  },
  decision_making: {
    key: "decision_making",
    name: "Judgment & decisions",
    description: "Makes sound decisions with incomplete information and weighs trade-offs.",
    behavioral: [
      "Tell me about a difficult decision you made with incomplete information.",
      "Describe a time you had to choose between two good options. How did you decide?",
      "Tell me about a decision you made that turned out to be wrong. What happened next?",
    ],
    situational: [
      "Suppose you must decide on an important direction today, but the data is inconclusive. How would you make the call?",
      "Imagine the quick fix and the right fix to a problem point in different directions. How would you choose?",
    ],
  },
  failure_resilience: {
    key: "failure_resilience",
    name: "Resilience",
    description: "Handles setbacks, learns from failure and keeps going.",
    behavioral: [
      "Tell me about a time you failed at something important. What did you learn?",
      "Describe a time you received critical feedback. How did you respond?",
      "Tell me about the toughest setback in your career so far and how you recovered.",
    ],
    situational: [
      "Imagine a project you championed is cancelled after months of work. How would you handle it?",
      "Suppose you miss an important target this quarter. What would you do next?",
    ],
  },
  technical_depth: {
    key: "technical_depth",
    name: "Technical depth",
    description: "Applies deep expertise to hard problems and makes sound technical trade-offs.",
    behavioral: [
      "Tell me about the most technically challenging problem you've worked on. What made it hard and what did you do?",
      "Describe a time you had to make an important technical trade-off. How did you decide?",
      "Tell me about a time you improved the quality, reliability or performance of something you built.",
    ],
    situational: [
      "Imagine a system you own becomes slow under load right before a launch. How would you investigate and fix it?",
      "Suppose you must choose between building something in-house or adopting an existing tool. How would you evaluate it?",
    ],
  },
  data_driven: {
    key: "data_driven",
    name: "Data-driven thinking",
    description: "Uses data and evidence to understand problems and measure impact.",
    behavioral: [
      "Tell me about a time you used data to change someone's mind or a decision.",
      "Describe a time the data told a different story than people expected. What did you do?",
      "Tell me about a time you measured the impact of your work. How did you do it?",
    ],
    situational: [
      "Imagine a key metric drops 20 percent overnight. Walk me through how you would investigate.",
      "Suppose leadership wants to launch something based on gut feeling. How would you bring evidence into the decision?",
    ],
  },
  stakeholder_management: {
    key: "stakeholder_management",
    name: "Stakeholder management",
    description: "Builds trust with stakeholders, manages expectations and aligns competing interests.",
    behavioral: [
      "Tell me about a time you had to manage a demanding stakeholder.",
      "Describe a time you had to align several groups with different goals.",
      "Tell me about a time you had to reset expectations with someone senior.",
    ],
    situational: [
      "Imagine a senior stakeholder asks for a feature you believe is a mistake. How would you respond?",
      "Suppose a project is going to be late and an executive is expecting it on time. What would you do?",
    ],
  },
  innovation: {
    key: "innovation",
    name: "Initiative & innovation",
    description: "Spots opportunities, proposes new ideas and makes them happen.",
    behavioral: [
      "Tell me about an idea you came up with that improved how things were done.",
      "Describe a time you took the initiative on something nobody asked you to do.",
      "Tell me about a time you challenged the way things had always been done.",
    ],
    situational: [
      "Imagine you spot an opportunity that could save your team hours every week, but it requires buy-in from others. What would you do?",
      "Suppose you are given a small budget and full freedom to improve one thing in your area. How would you choose and execute?",
    ],
  },
  people_development: {
    key: "people_development",
    name: "Developing others",
    description: "Coaches, gives feedback and grows the people around them.",
    behavioral: [
      "Tell me about a time you helped someone grow in their role.",
      "Describe a time you gave someone difficult feedback. How did you approach it?",
      "Tell me about a time you dealt with an under-performing team member.",
    ],
    situational: [
      "Imagine a strong performer on your team suddenly disengages. What would you do?",
      "Suppose a new hire is struggling after a month. How would you support them?",
    ],
  },
  sales_persuasion: {
    key: "sales_persuasion",
    name: "Persuasion & negotiation",
    description: "Understands needs, builds a compelling case and negotiates win-win outcomes.",
    behavioral: [
      "Tell me about a deal or agreement you won that looked unlikely at first.",
      "Describe a time you negotiated something important. How did you prepare?",
      "Tell me about a time you turned a 'no' into a 'yes'.",
    ],
    situational: [
      "Imagine a prospect says your offer is too expensive compared with a competitor. How would you respond?",
      "Suppose a key client threatens to leave at renewal time. What would you do?",
    ],
  },
  quality_attention: {
    key: "quality_attention",
    name: "Attention to detail",
    description: "Produces accurate, high-quality work and catches problems early.",
    behavioral: [
      "Tell me about a time your attention to detail prevented a problem.",
      "Describe a time you found a mistake others had missed. What did you do?",
      "Tell me about a process you put in place to improve accuracy or quality.",
    ],
    situational: [
      "Imagine you are asked to deliver something fast, but you know cutting corners risks errors. How would you handle it?",
      "Suppose you inherit work full of small inconsistencies. What would you do?",
    ],
  },
};

const ROLE_MAP: { re: RegExp; competencies: string[] }[] = [
  { re: /\b(engineer|developer|software|devops|sre|programmer|architect|qa|tester|frontend|backend|full[- ]?stack|mobile|cloud|security)\b/i, competencies: ["technical_depth", "problem_solving", "teamwork", "ownership", "prioritization", "communication", "adaptability", "decision_making"] },
  { re: /\b(data|analyst|scientist|analytics|bi|machine learning|ml|statistic)/i, competencies: ["data_driven", "problem_solving", "communication", "stakeholder_management", "technical_depth", "quality_attention"] },
  { re: /\b(product manager|product owner|product lead|pm)\b/i, competencies: ["prioritization", "stakeholder_management", "decision_making", "customer_focus", "data_driven", "leadership", "communication"] },
  { re: /\b(design|designer|ux|ui|researcher)\b/i, competencies: ["customer_focus", "communication", "teamwork", "adaptability", "innovation", "stakeholder_management"] },
  { re: /\b(sales|account executive|account manager|business development|bdr|sdr|partnership)/i, competencies: ["sales_persuasion", "customer_focus", "failure_resilience", "ownership", "communication", "prioritization"] },
  { re: /\b(customer|support|success|service|call cent|helpdesk|help desk)/i, competencies: ["customer_focus", "communication", "conflict", "adaptability", "problem_solving", "failure_resilience"] },
  { re: /\b(marketing|content|brand|seo|social media|growth|communications)\b/i, competencies: ["innovation", "data_driven", "communication", "teamwork", "prioritization", "customer_focus"] },
  { re: /\b(nurse|doctor|physician|health|medical|clinic|care|therap|pharmac)/i, competencies: ["communication", "quality_attention", "adaptability", "teamwork", "conflict", "decision_making"] },
  { re: /\b(teacher|educator|tutor|instructor|lecturer|professor)\b/i, competencies: ["communication", "adaptability", "people_development", "conflict", "innovation", "ownership"] },
  { re: /\b(finance|financial|accountant|accounting|audit|bank|controller|tax)/i, competencies: ["quality_attention", "data_driven", "ownership", "decision_making", "stakeholder_management", "communication"] },
  { re: /\b(operations|logistics|supply|warehouse|procurement|project manager|program manager|coordinator)/i, competencies: ["prioritization", "problem_solving", "ownership", "quality_attention", "teamwork", "stakeholder_management"] },
  { re: /\b(hr|human resources|recruit|talent|people partner)/i, competencies: ["communication", "conflict", "stakeholder_management", "decision_making", "people_development", "customer_focus"] },
  { re: /\b(retail|hospitality|restaurant|barista|cashier|waiter|waitress|server|hotel|store|shop)/i, competencies: ["customer_focus", "teamwork", "adaptability", "conflict", "prioritization", "ownership"] },
  { re: /\b(intern|internship|graduate|student|trainee|apprentice)/i, competencies: ["adaptability", "teamwork", "problem_solving", "communication", "ownership", "failure_resilience"] },
];

const LEADERSHIP_TITLE = /\b(head of|director|vp|vice president|chief|cto|ceo|coo|cfo|cio|supervisor|founder|co-founder|team lead|tech lead|lead|principal|people manager|engineering manager|general manager|store manager|executive director)\b/i;
const IC_MANAGER = /\b(product|account|project|program|programme|community|social media|content|case|office|campaign|brand|success)\s+(manager|executive|lead)\b/i;

/** True for people-leadership roles; "Account Executive" or "Product Manager" are individual contributors. */
export function isLeadershipRole(title: string): boolean {
  if (IC_MANAGER.test(title) && !/\b(head of|director|vp|vice president|chief|senior manager of)\b/i.test(title)) return false;
  return LEADERSHIP_TITLE.test(title) || /\bmanager\b/i.test(title);
}
const DEFAULT_COMPETENCIES = ["problem_solving", "teamwork", "communication", "ownership", "adaptability", "failure_resilience"];

export function competencyByKey(key: string): CompetencyDef | undefined {
  return COMPETENCIES[key];
}

export function listCompetencies(): Competency[] {
  return Object.values(COMPETENCIES).map(({ key, name, description }) => ({ key, name, description }));
}

/** Map free-text competency names (e.g. from a business campaign) to library entries when possible. */
export function resolveCompetency(input: string): Competency {
  const raw = input.trim();
  const k = raw.toLowerCase().replace(/[^a-z]+/g, "_").replace(/^_|_$/g, "");
  if (COMPETENCIES[k]) {
    const { key, name, description } = COMPETENCIES[k];
    return { key, name, description };
  }
  const byName = Object.values(COMPETENCIES).find(
    (c) => c.name.toLowerCase() === raw.toLowerCase() || c.name.toLowerCase().startsWith(raw.toLowerCase()),
  );
  if (byName) return { key: byName.key, name: byName.name, description: byName.description };
  return { key: `custom_${k || "skill"}`.slice(0, 48), name: raw.slice(0, 60) || "General", description: `Evidence of ${raw.slice(0, 80)} in real situations.` };
}

/** Pick 4–6 competencies for a role, honouring explicit focus areas first. */
export function planCompetencies(roleTitle: string, seniority: Seniority, focus: string[] = [], count = 5): Competency[] {
  const chosen: string[] = [];
  const out: Competency[] = [];
  for (const f of focus) {
    const c = resolveCompetency(f);
    if (!chosen.includes(c.key)) {
      chosen.push(c.key);
      out.push(c);
    }
  }
  const mapped = ROLE_MAP.find((m) => m.re.test(roleTitle))?.competencies ?? DEFAULT_COMPETENCIES;
  const leader = isLeadershipRole(roleTitle);
  const seniorExtras = ["senior", "lead", "executive"].includes(seniority) || leader
    ? ["leadership", "decision_making", "people_development", "stakeholder_management"]
    : [];
  const pool = leader ? [...seniorExtras, ...mapped] : [...mapped.slice(0, 3), ...seniorExtras, ...mapped.slice(3)];
  for (const key of pool) {
    if (out.length >= count) break;
    if (chosen.includes(key) || !COMPETENCIES[key]) continue;
    chosen.push(key);
    const { name, description } = COMPETENCIES[key];
    out.push({ key, name, description });
  }
  for (const key of DEFAULT_COMPETENCIES) {
    if (out.length >= Math.min(count, 4)) break;
    if (chosen.includes(key)) continue;
    chosen.push(key);
    const { name, description } = COMPETENCIES[key];
    out.push({ key, name, description });
  }
  return out;
}

function fill(template: string, roleTitle: string): string {
  return template.replace(/\{role\}/g, roleTitle || "new team member");
}

/** Deterministic-but-varied pick of a bank question that has not been asked yet. */
export function bankQuestion(
  competency: Competency,
  style: InterviewStyle,
  roleTitle: string,
  alreadyAsked: (q: string) => boolean,
  salt = 0,
): string {
  const def = COMPETENCIES[competency.key];
  let candidates: string[];
  if (def) {
    const behavioral = def.behavioral;
    const situational = def.situational;
    candidates =
      style === "behavioral" ? behavioral : style === "situational" ? situational : salt % 3 === 2 ? [...situational, ...behavioral] : [...behavioral, ...situational];
  } else {
    candidates = [
      `Tell me about a time you demonstrated ${competency.name.toLowerCase()} at work. What was the situation and what did you do?`,
      `Describe a specific example of how you have applied ${competency.name.toLowerCase()} in a past role.`,
      `Imagine you needed to rely on your ${competency.name.toLowerCase()} in your first month as a {role}. How would you approach it?`,
    ];
  }
  const rotated = candidates.map((_, i) => candidates[(i + salt) % candidates.length]);
  for (const q of rotated) {
    const filled = fill(q, roleTitle);
    if (!alreadyAsked(filled)) return filled;
  }
  return fill(rotated[0], roleTitle);
}

export function introQuestion(persona: Persona, roleTitle: string, companyName?: string | null, firstName?: string | null, hasCv = false): string {
  const at = companyName ? ` at ${companyName}` : "";
  switch (persona) {
    case "supportive":
      return `${firstName ? `Hi ${firstName}, thanks` : "Thanks"} for joining me today — there's no rush, so take your time. ${hasCv ? "I've had a look at your CV, and I'm looking forward to hearing more. " : ""}To get us started, could you tell me a little about yourself and what draws you to this ${roleTitle} role${at}?`;
    case "challenging":
      return hasCv
        ? `${firstName ? `${firstName}, let's` : "Let's"} get started. I've read your CV, so skip the summary — in about a minute, tell me why you're the right person for this ${roleTitle} role${at}.`
        : `${firstName ? `${firstName}, let's` : "Let's"} get started. In about a minute, tell me about your background and why you're the right person for this ${roleTitle} role${at}.`;
    default:
      return `${firstName ? `Hello ${firstName}, thank you for joining me. ` : ""}${hasCv ? "I've read through your CV. " : ""}To start, please give me a brief overview of your background and why you're interested in this ${roleTitle} position${at}.`;
  }
}

export const FOLLOW_UP_PROBES: Record<StarrKey, string[]> = {
  situation: [
    "Could you set the scene a little more — where were you working, and what was at stake?",
    "Before we go further, give me a bit more context: when was this, and why did it matter?",
    "Help me picture it — who was involved, and what would have happened if nothing changed?",
  ],
  task: [
    "What exactly was your own responsibility in that situation, as opposed to the team's?",
    "What were you personally trying to achieve, and how would you know you'd succeeded?",
    "What was the specific goal you owned there?",
  ],
  action: [
    "Walk me through the specific steps you personally took. What did you do first, and why?",
    "What did you do yourself — not the team — to move things forward?",
    "Take me through your own actions in that story, step by step.",
    "Which decision in that story was yours, and how did you make it?",
  ],
  result: [
    "What was the outcome, and how did you know it had worked? Any numbers you can share?",
    "How did it turn out in the end, and what impact did it have?",
    "What changed as a result of what you did — for the team, the customer or the business?",
  ],
  reflection: [
    "Looking back, what did you learn from that, and what would you do differently next time?",
    "How has that experience changed the way you work since?",
    "If you faced the same situation tomorrow, what would you keep and what would you change?",
  ],
};

export const DEPTH_PROBES: string[] = [
  "You mentioned {claim}. Can you go one level deeper — what exactly did that involve, step by step?",
  "Let's dig into {claim}. What was the hardest part of that, and how did you handle it in the moment?",
  "On {claim} — who else was involved, and how did they react to what you did?",
];

export const GENERIC_DEPTH_PROBES: string[] = [
  "What was the single hardest moment in that situation, and what exactly did you do right then?",
  "Who else was involved, and how did they react to what you did?",
  "If I spoke to someone who worked with you on that, what would they say you did?",
];

const ACKS: Record<Persona, string[]> = {
  supportive: [
    "Thank you for sharing that.",
    "I appreciate you walking me through that.",
    "That's helpful, thank you.",
    "Thanks — that gives me a good picture.",
  ],
  neutral: ["Thank you.", "Understood, thank you.", "Okay, thank you.", "Thanks for that."],
  challenging: ["Okay.", "Noted.", "Right.", "Understood."],
};

const TRANSITIONS: Record<Persona, string[]> = {
  supportive: ["Let's move on to something a little different.", "Let's explore another area.", "Next, I'd like to hear about something else."],
  neutral: ["Let's move on.", "Next question.", "Moving to a different area."],
  challenging: ["Next.", "Let's change topics.", "Moving on."],
};

export function pick<T>(arr: T[], salt: number): T {
  return arr[Math.abs(salt) % arr.length];
}

const NAMED_ACKS: Record<Persona, string[]> = {
  supportive: ["Thank you, {name} — that's really helpful.", "Thanks for walking me through that, {name}."],
  neutral: ["Thank you, {name}.", "Understood — thanks, {name}."],
  challenging: ["Okay, {name}.", "Noted, {name}."],
};

/** Short reaction before the next question; uses the first name now and then (not every line). */
export function acknowledgment(persona: Persona, salt: number, firstName?: string | null): string {
  if (firstName && Math.abs(salt) % 3 === 1) return pick(NAMED_ACKS[persona] ?? NAMED_ACKS.neutral, salt).replace("{name}", firstName);
  return pick(ACKS[persona] ?? ACKS.neutral, salt);
}

export function transition(persona: Persona, salt: number): string {
  return pick(TRANSITIONS[persona] ?? TRANSITIONS.neutral, salt);
}

export function clarifyLine(question: string, persona: Persona): string {
  const lead = persona === "challenging" ? "Sure." : "Of course.";
  return `${lead} ${question} Take your time — one specific example from your own experience is perfect.`;
}

export function closingLine(persona: Persona, mode: "practice" | "business", companyName?: string | null, firstName?: string | null): string {
  const name = firstName ? `, ${firstName}` : "";
  if (mode === "business") {
    const who = companyName ? `the ${companyName} team` : "the hiring team";
    return `That's all my questions${name}. Thank you for your time today — ${who} will review your interview and be in touch about next steps.`;
  }
  if (persona === "supportive") return `That's the end of our interview${name}. Well done for practising — that takes courage. Let's look at how it went.`;
  return `That concludes the interview${name}. Thank you — your feedback report is ready.`;
}
