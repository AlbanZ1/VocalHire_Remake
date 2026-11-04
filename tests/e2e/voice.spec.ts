// Natural interviewer voice in the browser. The voice endpoint is mocked (Polly needs AWS keys),
// so this checks the client: voice picker, signed-line requests, playback and the device-voice fallback.
import { expect, test, type Page, type Route } from "@playwright/test";

function silentWav(ms = 300): Buffer {
  const rate = 8000;
  const samples = Math.round((rate * ms) / 1000);
  const b = Buffer.alloc(44 + samples * 2);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + samples * 2, 4);
  b.write("WAVE", 8);
  b.write("fmt ", 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(samples * 2, 40);
  return b;
}

const ANSWER =
  "In my last role our team had to migrate 2,000 customer accounts to a new billing system within a month. I was responsible for the communication plan. I wrote the email templates, I scheduled calls with the 50 largest customers, and I trained three colleagues. As a result, we finished two days early with only 12 support tickets. I learned to over-communicate during change.";

interface SpeakCall {
  voice: string;
  text?: string;
  sig?: string;
  sample?: boolean;
}

async function mockNaturalVoices(page: Page, opts: { failSpeak?: boolean } = {}) {
  const calls: SpeakCall[] = [];
  await page.route("**/functions/v1/**", async (route: Route) => {
    const req = route.request();
    if (req.method() !== "POST") return route.continue();
    const body = JSON.parse(req.postData() ?? "{}");
    if (body.action === "speak") {
      calls.push({ voice: body.voice, text: body.text, sig: body.sig, sample: body.sample });
      if (opts.failSpeak) return route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: { code: "tts_failed", message: "x" } }) });
      return route.fulfill({ status: 200, contentType: "audio/wav", body: silentWav() });
    }
    const res = await route.fetch();
    if (!["state", "begin", "answer", "end"].includes(body.action) || !res.ok()) return route.fulfill({ response: res });
    const json = await res.json();
    if (body.action === "state" && !json.tts) json.tts = { voices: ["Ruth", "Matthew", "Danielle", "Stephen", "Amy", "Brian", "Olivia", "Kajal", "Niamh", "Ayanda"], defaultVoice: "Ruth" };
    if (json.question && !json.question.speech) json.question.speech = { text: "t".repeat(32), preface: json.question.preface ? "p".repeat(32) : null };
    if ((json.line || json.closing) && !json.speech) json.speech = { line: json.line ? "l".repeat(32) : null, closing: json.closing ? "c".repeat(32) : null };
    return route.fulfill({ response: res, json });
  });
  return calls;
}

async function countPlayback(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __plays: { src: string; ok: boolean }[] };
    w.__plays = [];
    const orig = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      const p = orig.call(this);
      const src = this.src;
      p.then(() => w.__plays.push({ src, ok: true })).catch(() => w.__plays.push({ src, ok: false }));
      return p;
    };
  });
}

async function startPractice(page: Page) {
  await page.goto("/practice/new");
  await page.getByLabel(/Role you're interviewing for/).fill("Customer Support Specialist");
  await page.getByRole("radio", { name: /Short/ }).check({ force: true });
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: /get you set up/i })).toBeVisible();
}

async function answerUntilDone(page: Page) {
  for (let i = 0; i < 14; i++) {
    const box = page.getByLabel("Type your answer");
    await expect(box.or(page.getByText("Your STARR profile"))).toBeVisible({ timeout: 60_000 });
    if (page.url().includes("/report/")) return;
    await expect(box).toBeEnabled({ timeout: 60_000 });
    await box.fill(`${ANSWER} (story ${i + 1})`);
    await page.getByRole("button", { name: "Send answer" }).click();
    await page.waitForTimeout(300);
    if (page.url().includes("/report/")) return;
  }
}

test("natural voice: picker, signed lines and playback", async ({ page }) => {
  await countPlayback(page);
  const calls = await mockNaturalVoices(page);
  await startPractice(page);

  const picker = page.getByLabel("Voice", { exact: true });
  await expect(picker).toHaveValue("natural:Ruth");
  await expect(picker.locator("optgroup[label='Natural voices'] option")).toHaveCount(10);
  await page.getByRole("button", { name: "Test voice" }).click();
  await expect.poll(() => calls.filter((c) => c.sample).length).toBe(1);
  expect(calls[0]).toMatchObject({ sample: true, voice: "Ruth" });

  await picker.selectOption("natural:Amy");
  await page.getByRole("button", { name: "Type instead" }).first().click();
  await page.getByRole("button", { name: "Start interview" }).click();
  await expect(page.getByLabel("Type your answer")).toBeEnabled({ timeout: 30_000 });
  const first = calls.find((c) => !c.sample)!;
  expect(first.voice).toBe("Amy");
  expect(first.sig).toHaveLength(32);
  expect(first.text?.length).toBeGreaterThan(10);

  await answerUntilDone(page);
  await expect(page).toHaveURL(/\/report\//, { timeout: 60_000 });
  const plays = await page.evaluate(() => (window as unknown as { __plays: { src: string; ok: boolean }[] }).__plays.filter((p) => p.src.startsWith("blob:")));
  expect(plays.length).toBeGreaterThanOrEqual(3);
  expect(plays.every((p) => p.ok)).toBe(true);
  // Every spoken line used the chosen voice and carried the API's signature.
  for (const c of calls.filter((x) => !x.sample)) {
    expect(c.voice).toBe("Amy");
    expect(c.sig).toHaveLength(32);
  }
});

test("natural voice: falls back to the device voice if audio fails", async ({ page }) => {
  const calls = await mockNaturalVoices(page, { failSpeak: true });
  await startPractice(page);
  await page.getByRole("button", { name: "Type instead" }).first().click();
  await page.getByRole("button", { name: "Start interview" }).click();
  // The interview carries on: the question is shown and the answer box opens.
  await expect(page.getByLabel("Type your answer")).toBeEnabled({ timeout: 30_000 });
  expect(calls.length).toBeGreaterThan(0);
});
