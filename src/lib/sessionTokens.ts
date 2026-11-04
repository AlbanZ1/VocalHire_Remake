// Per-session access tokens for guests and job applicants, kept only in this browser.
const KEY = "vh-session-tokens";

interface Entry {
  token: string;
  mode: "practice" | "business";
  role: string;
  createdAt: string;
  campaignToken?: string;
}

function read(): Record<string, Entry> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, Entry>;
  } catch {
    return {};
  }
}

function write(v: Record<string, Entry>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* storage unavailable (private mode) — tokens live for this tab only */
  }
}

const memory: Record<string, Entry> = {};

export const sessionTokens = {
  save(id: string, entry: Entry) {
    memory[id] = entry;
    write({ ...read(), [id]: entry });
  },
  get(id: string): Entry | undefined {
    return read()[id] ?? memory[id];
  },
  token(id: string): string | undefined {
    return this.get(id)?.token;
  },
  guestPractice(): { id: string; entry: Entry }[] {
    return Object.entries({ ...memory, ...read() })
      .filter(([, e]) => e.mode === "practice")
      .map(([id, entry]) => ({ id, entry }))
      .sort((a, b) => b.entry.createdAt.localeCompare(a.entry.createdAt));
  },
};
