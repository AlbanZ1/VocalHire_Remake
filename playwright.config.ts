import { defineConfig, devices } from "@playwright/test";

// E2E tests run against a dev server pointed at a local Supabase stack:
//   npx supabase start && npm run functions:bundle-local && npx supabase functions serve
//   VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_INTERVIEW_FUNCTION=interview-local npm run dev
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    permissions: ["microphone", "camera"],
    launchOptions: {
      // Optional: use a specific Chromium binary (e.g. a pre-installed one in CI containers).
      executablePath: process.env.PW_CHROMIUM_PATH || undefined,
      args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
