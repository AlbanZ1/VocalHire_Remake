// Access tokens for CV reviews made without an account, kept only in this browser.
const KEY = "vh-cv-reviews";

export interface ReviewEntry {
  token: string;
  role: string | null;
  company: string | null;
  matchScore: number | null;
  qualityScore: number;
  createdAt: string;
}

function read(): Record<string, ReviewEntry> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, ReviewEntry>;
  } catch {
    return {};
  }
}

const memory: Record<string, ReviewEntry> = {};

export const reviewTokens = {
  save(id: string, entry: ReviewEntry) {
    memory[id] = entry;
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...read(), [id]: entry }));
    } catch {
      /* storage unavailable — kept for this tab only */
    }
  },
  token(id: string): string | undefined {
    return (read()[id] ?? memory[id])?.token;
  },
  all(): { id: string; entry: ReviewEntry }[] {
    return Object.entries({ ...memory, ...read() })
      .map(([id, entry]) => ({ id, entry }))
      .sort((a, b) => b.entry.createdAt.localeCompare(a.entry.createdAt));
  },
};
