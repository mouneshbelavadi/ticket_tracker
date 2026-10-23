const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
export const SESSION_COOKIE_NAME = "ticket_alert_session";

export interface SessionPayload {
  userId: string;
  iat: number;
  exp: number;
}

function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function utf8ToBase64Url(str: string): string {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlToUtf8(base64url: string): string {
  let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  return decodeURIComponent(escape(atob(base64)));
}

/**
 * Creates an HMAC-SHA256 signature using the standard Web Crypto API.
 * Fully compatible with Node.js, Vercel Edge Runtime, and browser environments.
 */
async function createSignature(data: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(data)
  );

  return bufferToBase64Url(signatureBuffer);
}

/**
 * Safely compares two strings using constant-time comparison to prevent timing attacks.
 */
export function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Signs a new session token that expires in 7 days.
 */
export async function signSessionToken(
  secret: string,
  customDurationMs?: number
): Promise<string> {
  const now = Date.now();
  const payload: SessionPayload = {
    userId: "admin",
    iat: now,
    exp: now + (customDurationMs ?? SEVEN_DAYS_MS),
  };

  const payloadEncoded = utf8ToBase64Url(JSON.stringify(payload));
  const signature = await createSignature(payloadEncoded, secret);
  return `${payloadEncoded}.${signature}`;
}

/**
 * Verifies a signed session token.
 * Returns true if the token is valid, untampered, and not expired.
 */
export async function verifySessionToken(
  token: string | null | undefined,
  secret: string
): Promise<boolean> {
  if (!token || typeof token !== "string") {
    return false;
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return false;
  }

  const [payloadEncoded, signature] = parts;
  const expectedSignature = await createSignature(payloadEncoded, secret);

  // Constant-time comparison of the signature
  if (!constantTimeCompare(signature, expectedSignature)) {
    return false;
  }

  try {
    const jsonStr = base64UrlToUtf8(payloadEncoded);
    const payload = JSON.parse(jsonStr) as SessionPayload;

    if (!payload.exp || typeof payload.exp !== "number") {
      return false;
    }

    // Check expiration
    if (Date.now() >= payload.exp) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}
