import { expect, test, type Page } from "@playwright/test";

const SHOTS = process.env.E2E_SHOTS_DIR;

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

const ANSWERS = [
  "I'm a support specialist with four years of experience in SaaS companies, and I enjoy turning frustrated customers into loyal ones.",
  "At my previous company, a software startup in Dublin, our biggest client threatened to cancel in 2023 after three failed releases. My responsibility was to rebuild their trust before the renewal in six weeks. I first called their operations lead to understand the real impact, then I set up a weekly status email and I created a shared tracker for every open issue, because they felt ignored. I also negotiated with our engineering lead to prioritise their top two bugs. As a result, they renewed for two more years and their satisfaction score went from 4 to 9 out of 10. I learned that silence feels worse than bad news, and since then I always send proactive updates.",
  "In my last role our team had to migrate 2,000 customer accounts to a new billing system within a month. I was responsible for the communication plan. I wrote the email templates, I scheduled calls with the 50 largest customers, and I trained three colleagues to handle questions. As a result, we finished two days early with only 12 support tickets. I learned to over-communicate during change, and now I always prepare an FAQ before any rollout.",
  "When I was a team lead at a retail store in 2022, two colleagues kept arguing about shift swaps, which hurt morale. My goal was to fix it without escalating to HR. I met each of them separately, then I proposed a transparent swap board and I asked them to agree on rules together. As a result, conflicts stopped within a week and sick days on our team fell by 30%. Looking back, I learned to address tension early instead of hoping it disappears.",
];

async function answerByTyping(page: Page, maxTurns = 14) {
  for (let i = 0; i < maxTurns; i++) {
    const box = page.getByLabel("Type your answer");
    const done = page.getByRole("heading", { name: /interview complete|Thank you,/i });
    await expect(box.or(done)).toBeVisible({ timeout: 60_000 });
    if (await done.isVisible().catch(() => false)) return;
    await expect(box).toBeEnabled({ timeout: 60_000 });
    await box.fill(ANSWERS[Math.min(i, ANSWERS.length - 1)] + (i >= ANSWERS.length ? ` (example ${i})` : ""));
    await page.getByRole("button", { name: "Send answer" }).click();
    await page.waitForTimeout(300);
    if (page.url().includes("/report/")) return;
  }
}

test("guest practice interview → STARR report", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /already confident/i })).toBeVisible();
  await shot(page, "01-landing");

  await page.getByRole("link", { name: /Practise free/i }).first().click();
  await expect(page.getByRole("heading", { name: "Set up your interview" })).toBeVisible();
  await page.getByLabel(/Role you're interviewing for/).fill("Customer Support Specialist");
  await page.getByRole("radio", { name: /Short/ }).check({ force: true });
  await shot(page, "02-setup");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: /get you set up/i })).toBeVisible();
  await page.getByRole("button", { name: "Captions only" }).click();
  await page.getByRole("button", { name: "Type instead" }).first().click();
  await shot(page, "03-precheck");
  await page.getByRole("button", { name: "Start interview" }).click();

  await expect(page.getByLabel("Type your answer")).toBeVisible();
  await shot(page, "04-room");
  await answerByTyping(page);

  await expect(page).toHaveURL(/\/report\//, { timeout: 60_000 });
  await expect(page.getByText("Your STARR profile")).toBeVisible();
  await expect(page.getByText("Question by question")).toBeVisible();
  await shot(page, "05-report");
});

test("business: workspace → campaign → applicant interview → review", async ({ page, browser }) => {
  const stamp = Date.now();
  await page.goto("/signup?type=business");
  await page.getByLabel("Full name").fill("Rita Recruiter");
  await page.getByLabel("Email").fill(`rita+${stamp}@example.com`);
  await page.getByLabel("Password").fill("Sup3r-secret-pass");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByRole("heading", { name: /Set up your hiring workspace/i })).toBeVisible();
  await page.getByLabel(/Company or team name/).fill(`Northwind ${stamp}`);
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page.getByRole("heading", { name: "Hiring interviews" })).toBeVisible();
  await page.getByRole("main").getByRole("link", { name: "New interview" }).first().click();

  await page.getByLabel("Job title").fill("Customer Success Specialist");
  await page.getByLabel("Job description").fill("Own relationships with 40 mid-market customers, handle escalations and drive renewals.");
  await page.getByRole("button", { name: "Suggest for this role" }).click();
  await page.getByLabel("Minimum questions").selectOption("2");
  await page.getByLabel("Maximum questions").selectOption("3");
  await shot(page, "06-campaign-editor");
  await page.getByRole("button", { name: "Create interview" }).click();

  await expect(page.getByText("Applicant link", { exact: true })).toBeVisible();
  const link = (await page.locator("p.font-mono").innerText()).trim();
  expect(link).toMatch(/\/i\/[0-9a-f]+$/);
  await shot(page, "07-campaign-detail-empty");

  // Applicant in a separate browser context (no shared session).
  const ctx = await browser.newContext({ permissions: ["microphone", "camera"] });
  const ap = await ctx.newPage();
  await ap.goto(link);
  await expect(ap.getByRole("heading", { name: "Customer Success Specialist" })).toBeVisible();
  await ap.getByLabel("Full name").fill("Sam Applicant");
  await ap.getByLabel("Email").fill(`sam+${stamp}@example.com`);
  await ap.getByLabel(/I understand how this interview works/).check();
  await shot(ap, "08-apply-landing");
  await ap.getByRole("button", { name: "Continue to device check" }).click();

  await expect(ap.getByRole("heading", { name: /get you set up/i })).toBeVisible();
  await ap.getByRole("button", { name: "Captions only" }).click();
  await ap.getByRole("button", { name: "Type instead" }).first().click();
  await ap.getByRole("button", { name: "Start interview" }).click();
  await expect(ap.getByLabel("Type your answer")).toBeVisible();
  // Generate an integrity signal: a blocked paste attempt.
  await ap.getByLabel("Type your answer").focus();
  await ap.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData("text/plain", "pasted answer from somewhere else");
    document.activeElement?.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await expect(ap.getByText(/Pasting is disabled for this interview — please answer/)).toBeVisible();
  await answerByTyping(ap);
  await expect(ap.getByRole("heading", { name: /Thank you, Sam/ })).toBeVisible({ timeout: 60_000 });
  await shot(ap, "09-applicant-done");
  await ctx.close();

  // Reviewer sees the candidate.
  await page.reload();
  await expect(page.getByRole("link", { name: "Sam Applicant" })).toBeVisible();
  await shot(page, "10-campaign-candidates");
  await page.getByRole("link", { name: "Sam Applicant" }).click();
  await expect(page.getByText("Summary for the hiring team")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Integrity signals" })).toBeVisible();
  await expect(page.getByText(/Tried to paste text/)).toBeVisible();
  await page.getByLabel("Status").selectOption("shortlisted");
  await page.getByLabel("Notes").fill("Clear, specific stories. Invite to panel.");
  await page.getByRole("button", { name: "Save decision" }).click();
  await expect(page.getByText("Decision saved")).toBeVisible();
  await shot(page, "11-candidate-review");
});
