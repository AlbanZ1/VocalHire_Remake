// Signed interviewer lines. The API signs every line it produces for a session (questions,
// acknowledgements, clarifications, closings); the voice endpoint only speaks text that carries a
// valid signature, so nobody can use VocalHire's Polly account to voice arbitrary text.

const enc = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface SpeechSigner {
  sign(sessionId: string, text: string): Promise<string>;
  verify(sessionId: string, text: string, sig: unknown): Promise<boolean>;
}

export function createSpeechSigner(secret: string): SpeechSigner {
  let key: Promise<CryptoKey> | null = null;
  const getKey = () => (key ??= crypto.subtle.importKey("raw", enc.encode(`vocalhire-speech:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]));
  const sign = async (sessionId: string, text: string) => {
    const mac = new Uint8Array(await crypto.subtle.sign("HMAC", await getKey(), enc.encode(`${sessionId}\n${text}`)));
    return base64url(mac).slice(0, 32);
  };
  return {
    sign,
    async verify(sessionId, text, sig) {
      if (typeof sig !== "string" || sig.length !== 32) return false;
      return constantTimeEqual(await sign(sessionId, text), sig);
    },
  };
}

export function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
