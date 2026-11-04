// Amazon Polly text-to-speech over plain HTTPS, signed with AWS Signature Version 4 using Web
// Crypto (no AWS SDK, so the edge function stays small and starts fast).

import type { PollyEngine } from "./voices.ts";

export interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region: string;
}

const enc = new TextEncoder();

function toHex(buf: ArrayBuffer | Uint8Array): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(data: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", enc.encode(data)));
}

type Bytes = Uint8Array<ArrayBuffer>;

async function hmac(key: Bytes, data: string): Promise<Bytes> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(data)));
}

/** SigV4 signing key: HMAC chain over date, region, service. */
export async function signingKey(secret: string, dateStamp: string, region: string, service: string): Promise<Bytes> {
  const kDate = await hmac(enc.encode(`AWS4${secret}`), dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

function rfc3986(s: string): string {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

export interface SignInput {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
  service: string;
  region: string;
  credentials: Pick<AwsCredentials, "accessKeyId" | "secretAccessKey" | "sessionToken">;
  date?: Date;
}

export interface SignedRequest {
  /** Headers to send (without `host`, which the runtime sets). */
  headers: Record<string, string>;
  canonicalRequest: string;
  stringToSign: string;
  signature: string;
}

export async function signAwsRequest(i: SignInput): Promise<SignedRequest> {
  const u = new URL(i.url);
  const amzDate = (i.date ?? new Date()).toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const all: Record<string, string> = {};
  for (const [k, v] of Object.entries(i.headers)) all[k.toLowerCase()] = v;
  all.host = u.host;
  all["x-amz-date"] = amzDate;
  if (i.credentials.sessionToken) all["x-amz-security-token"] = i.credentials.sessionToken;
  const names = Object.keys(all).sort();
  const canonicalHeaders = names.map((n) => `${n}:${all[n].trim().replace(/\s+/g, " ")}\n`).join("");
  const signedHeaders = names.join(";");
  const query = [...u.searchParams.entries()]
    .map(([k, v]) => [rfc3986(k), rfc3986(v)] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const path = u.pathname.split("/").map((seg) => rfc3986(decodeURIComponent(seg))).join("/") || "/";
  const canonicalRequest = [i.method.toUpperCase(), path, query, canonicalHeaders, signedHeaders, await sha256Hex(i.body)].join("\n");
  const scope = `${dateStamp}/${i.region}/${i.service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, await sha256Hex(canonicalRequest)].join("\n");
  const signature = toHex(await hmac(await signingKey(i.credentials.secretAccessKey, dateStamp, i.region, i.service), stringToSign));
  const { host: _host, ...send } = all;
  send.authorization = `AWS4-HMAC-SHA256 Credential=${i.credentials.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return { headers: send, canonicalRequest, stringToSign, signature };
}

export class PollyError extends Error {
  constructor(public status: number, public type: string, message: string) {
    super(message);
  }
}

export interface SpeechRequest {
  text: string;
  voiceId: string;
  engine: PollyEngine;
  languageCode?: string;
}

async function requestSpeech(creds: AwsCredentials, r: SpeechRequest, fetchImpl: typeof fetch, timeoutMs: number): Promise<Bytes> {
  const url = `https://polly.${creds.region}.amazonaws.com/v1/speech`;
  const body = JSON.stringify({
    Engine: r.engine,
    ...(r.languageCode ? { LanguageCode: r.languageCode } : {}),
    OutputFormat: "mp3",
    Text: r.text,
    TextType: "text",
    VoiceId: r.voiceId,
  });
  const signed = await signAwsRequest({ method: "POST", url, headers: { "content-type": "application/json" }, body, service: "polly", region: creds.region, credentials: creds });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetchImpl(url, { method: "POST", headers: signed.headers, body, signal: ctrl.signal });
  } catch (e) {
    throw new PollyError(0, "network", e instanceof Error ? e.message : "Polly request failed");
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let msg = "";
    try {
      msg = await res.text();
    } catch {
      /* ignore */
    }
    const type = res.headers.get("x-amzn-errortype")?.split(":")[0] || (msg.match(/"__type"\s*:\s*"(?:[^"#]*#)?([^"]+)"/)?.[1] ?? "") || "PollyError";
    throw new PollyError(res.status, type, msg.slice(0, 300) || `Polly returned ${res.status}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * Synthesise speech as MP3. If the generative engine isn't available for this voice or region,
 * retries once with the neural engine.
 */
export async function synthesizeSpeech(
  creds: AwsCredentials,
  r: SpeechRequest,
  opts: { fetch?: typeof fetch; timeoutMs?: number } = {},
): Promise<{ audio: Bytes; engine: PollyEngine }> {
  const f = opts.fetch ?? fetch;
  const timeout = opts.timeoutMs ?? 10_000;
  try {
    return { audio: await requestSpeech(creds, r, f, timeout), engine: r.engine };
  } catch (e) {
    const engineProblem = e instanceof PollyError && e.status === 400 && /engine|validation/i.test(`${e.type} ${e.message}`);
    if (r.engine === "generative" && engineProblem) {
      return { audio: await requestSpeech(creds, { ...r, engine: "neural" }, f, timeout), engine: "neural" };
    }
    throw e;
  }
}
