import { describe, it, expect } from "vitest";
import {
  signSessionToken,
  verifySessionToken,
  constantTimeCompare,
} from "@/lib/auth/session";

describe("Authentication & Session Utilities (src/lib/auth/session.ts)", () => {
  const secret = "test-session-secret-at-least-32-chars-long";

  it("successfully signs and verifies a valid token", async () => {
    const token = await signSessionToken(secret);
    expect(typeof token).toBe("string");
    expect(token).toContain(".");

    const isValid = await verifySessionToken(token, secret);
    expect(isValid).toBe(true);
  });

  it("rejects token signed with a different secret", async () => {
    const token = await signSessionToken(secret);
    const wrongSecret = "another-completely-different-secret-key";

    expect(await verifySessionToken(token, wrongSecret)).toBe(false);
  });

  it("rejects an expired token", async () => {
    // Generate a token that expired 1 second ago (-1000ms duration)
    const expiredToken = await signSessionToken(secret, -1000);
    expect(await verifySessionToken(expiredToken, secret)).toBe(false);
  });

  it("rejects a tampered token payload or signature", async () => {
    const token = await signSessionToken(secret);
    const [payload, signature] = token.split(".");

    // Tamper with payload
    const tamperedPayload = btoa(
      JSON.stringify({ userId: "hacker", iat: Date.now(), exp: Date.now() + 100000 })
    )
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const tamperedToken = `${tamperedPayload}.${signature}`;

    expect(await verifySessionToken(tamperedToken, secret)).toBe(false);

    // Tamper with signature
    const badSignatureToken = `${payload}.${signature}abc`;
    expect(await verifySessionToken(badSignatureToken, secret)).toBe(false);
  });

  it("rejects malformed or empty token strings", async () => {
    expect(await verifySessionToken("", secret)).toBe(false);
    expect(await verifySessionToken("not-a-token", secret)).toBe(false);
    expect(await verifySessionToken(null, secret)).toBe(false);
    expect(await verifySessionToken(undefined, secret)).toBe(false);
  });

  it("correctly performs constant-time password comparisons", () => {
    expect(constantTimeCompare("secret123", "secret123")).toBe(true);
    expect(constantTimeCompare("secret123", "wrongpassword")).toBe(false);
    expect(constantTimeCompare("short", "muchlongersuperpassword")).toBe(false);
  });
});
