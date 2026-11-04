import { describe, expect, it } from "vitest";
import { PollyError, signAwsRequest, signingKey, synthesizeSpeech } from "../../supabase/functions/_shared/polly.ts";
import { base64ToBytes, bytesToBase64, createSpeechSigner } from "../../supabase/functions/_shared/voiceSign.ts";
import { DEFAULT_POLLY_VOICE, POLLY_VOICES, isPollyVoice } from "../../supabase/functions/_shared/voices.ts";
import { normalizeConfig } from "../../supabase/functions/_shared/engine.ts";

const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
const SECRET = "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY";

describe("AWS Signature Version 4", () => {
  it("derives the signing key from AWS's published example", async () => {
    expect(hex(await signingKey(SECRET, "20150830", "us-east-1", "iam"))).toBe("c4afb1cc5771d871763a393e44b703571b55cc28424d1a5e86da6ed3c154a4b9");
  });

  it("signs AWS's published GET example exactly", async () => {
    const s = await signAwsRequest({
      method: "GET",
      url: "https://iam.amazonaws.com/?Version=2010-05-08&Action=ListUsers",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
      body: "",
      service: "iam",
      region: "us-east-1",
      credentials: { accessKeyId: "AKIDEXAMPLE", secretAccessKey: SECRET },
      date: new Date("2015-08-30T12:36:00Z"),
    });
    expect(s.canonicalRequest.split("\n")[2]).toBe("Action=ListUsers&Version=2010-05-08");
    expect(s.signature).toBe("5d672d79c15b13162d9279b0855cfba6789a8edb4c82c400e06b5924a6f2b5d7");
    expect(s.headers.authorization).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/iam/aws4_request, SignedHeaders=content-type;host;x-amz-date, Signature=5d672d79c15b13162d9279b0855cfba6789a8edb4c82c400e06b5924a6f2b5d7",
    );
    expect("host" in s.headers).toBe(false);
  });

  it("signs temporary credentials with the security token", async () => {
    const s = await signAwsRequest({ method: "POST", url: "https://polly.eu-central-1.amazonaws.com/v1/speech", headers: { "content-type": "application/json" }, body: "{}", service: "polly", region: "eu-central-1", credentials: { accessKeyId: "A", secretAccessKey: "B", sessionToken: "TOKEN" } });
    expect(s.headers["x-amz-security-token"]).toBe("TOKEN");
    expect(s.headers.authorization).toContain("SignedHeaders=content-type;host;x-amz-date;x-amz-security-token");
  });
});

describe("Amazon Polly client", () => {
  const creds = { accessKeyId: "AKID", secretAccessKey: "SECRET", region: "eu-central-1" };
  const mp3 = new Uint8Array([0xff, 0xfb, 0x90, 0x44]);

  it("requests MP3 speech with a signed request", async () => {
    const seen: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];
    const f = (async (url: RequestInfo | URL, init?: RequestInit) => {
      seen.push({ url: String(url), headers: init?.headers as Record<string, string>, body: JSON.parse(String(init?.body)) });
      return new Response(mp3, { status: 200, headers: { "content-type": "audio/mpeg" } });
    }) as typeof fetch;
    const out = await synthesizeSpeech(creds, { text: "Tell me about a time you led a team.", voiceId: "Ruth", engine: "generative", languageCode: "en-US" }, { fetch: f });
    expect([...out.audio]).toEqual([...mp3]);
    expect(out.engine).toBe("generative");
    expect(seen[0].url).toBe("https://polly.eu-central-1.amazonaws.com/v1/speech");
    expect(seen[0].body).toEqual({ Engine: "generative", LanguageCode: "en-US", OutputFormat: "mp3", Text: "Tell me about a time you led a team.", TextType: "text", VoiceId: "Ruth" });
    expect(seen[0].headers.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AKID\/\d{8}\/eu-central-1\/polly\/aws4_request, SignedHeaders=content-type;host;x-amz-date, Signature=[0-9a-f]{64}$/);
  });

  it("falls back to the neural engine when generative isn't available", async () => {
    const engines: string[] = [];
    const f = (async (_u: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      engines.push(body.Engine);
      if (body.Engine === "generative") return new Response(JSON.stringify({ message: "This voice does not support the selected engine: generative" }), { status: 400, headers: { "x-amzn-ErrorType": "EngineNotSupportedException:http://internal.amazon.com/" } });
      return new Response(mp3, { status: 200 });
    }) as typeof fetch;
    const out = await synthesizeSpeech(creds, { text: "Hello.", voiceId: "Brian", engine: "generative" }, { fetch: f });
    expect(engines).toEqual(["generative", "neural"]);
    expect(out.engine).toBe("neural");
  });

  it("reports credential and throttling errors without retrying", async () => {
    let calls = 0;
    const f = (async () => {
      calls++;
      return new Response(JSON.stringify({ message: "The security token included in the request is invalid." }), { status: 403, headers: { "x-amzn-ErrorType": "UnrecognizedClientException" } });
    }) as typeof fetch;
    const err = await synthesizeSpeech(creds, { text: "Hi.", voiceId: "Ruth", engine: "generative" }, { fetch: f }).catch((e) => e);
    expect(err).toBeInstanceOf(PollyError);
    expect(err.status).toBe(403);
    expect(err.type).toBe("UnrecognizedClientException");
    expect(calls).toBe(1);
  });
});

describe("signed interviewer lines", () => {
  const signer = createSpeechSigner("service-secret");
  const id = "4a7c1e9e-0d6b-4f1e-9b1a-2d3c4e5f6a7b";

  it("accepts only the exact line, for the same session", async () => {
    const sig = await signer.sign(id, "Tell me about a time you disagreed with your manager.");
    expect(sig).toHaveLength(32);
    expect(await signer.verify(id, "Tell me about a time you disagreed with your manager.", sig)).toBe(true);
    expect(await signer.verify(id, "Say something else entirely.", sig)).toBe(false);
    expect(await signer.verify("00000000-0000-0000-0000-000000000000", "Tell me about a time you disagreed with your manager.", sig)).toBe(false);
    expect(await signer.verify(id, "x", undefined)).toBe(false);
    expect(await createSpeechSigner("other-secret").verify(id, "Tell me about a time you disagreed with your manager.", sig)).toBe(false);
  });

  it("round-trips audio through base64 for the cache", () => {
    const bytes = new Uint8Array(100_000).map((_, i) => (i * 31) % 256);
    expect([...base64ToBytes(bytesToBase64(bytes))]).toEqual([...bytes]);
  });
});

describe("voice choices", () => {
  it("has unique voices including the default", () => {
    const ids = POLLY_VOICES.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(DEFAULT_POLLY_VOICE);
    for (const v of POLLY_VOICES) expect(v.languageCode).toMatch(/^en-[A-Z]{2}$/);
  });

  it("keeps only known voices in interview settings", () => {
    expect(isPollyVoice("Matthew")).toBe(true);
    expect(isPollyVoice("<script>")).toBe(false);
    expect(normalizeConfig({ roleTitle: "Nurse", voice: "Amy" }, "business").voice).toBe("Amy");
    expect(normalizeConfig({ roleTitle: "Nurse", voice: "Hacker" }, "business").voice).toBeNull();
  });
});
