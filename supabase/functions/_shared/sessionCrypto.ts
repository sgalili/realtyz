// AES-GCM encryption for Facebook cloud session cookies.
// Key material comes from the FB_SESSION_ENC_KEY secret and never leaves the server.

const enc = new TextEncoder();
const dec = new TextDecoder();

async function keyFrom(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

const b64 = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer)));

const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function encryptSession(plain: string, secret: string): Promise<string> {
  const key = await keyFrom(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plain));
  return `v1.${b64(iv)}.${b64(ct)}`;
}

export async function decryptSession(blob: string, secret: string): Promise<string> {
  const parts = String(blob || "").split(".");
  if (parts.length !== 3 || parts[0] !== "v1") throw new Error("bad_session_blob");
  const key = await keyFrom(secret);
  const iv = fromB64(parts[1]);
  const ct = fromB64(parts[2]);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return dec.decode(pt);
}
