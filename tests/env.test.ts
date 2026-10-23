import { describe, it, expect } from "vitest";
import { getEnv, isValidEnv } from "@/lib/env";

describe("Environment Variables Validator (src/lib/env.ts)", () => {
  const validMockEnv = {
    SUPABASE_URL: "https://xyzexample.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "secret-service-role-key-12345",
    RESEND_API_KEY: "re_test_key_1234567890",
    NOTIFY_EMAIL: "alerts@example.com",
    ADMIN_PASSWORD: "super-secure-admin-pass",
    SESSION_SECRET: "32-character-session-secret-string-here",
    CRON_SECRET: "my-cron-bearer-secret-token",
    APP_URL: "https://ticket-alert.vercel.app",
    TELEGRAM_BOT_TOKEN: "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
    TELEGRAM_CHAT_ID: "987654321",
    ALLOW_LOCALHOST_FOR_DEV: "true",
  };

  it("successfully validates and parses a valid environment", () => {
    const env = getEnv(validMockEnv);
    expect(env.SUPABASE_URL).toBe("https://xyzexample.supabase.co");
    expect(env.NOTIFY_EMAIL).toBe("alerts@example.com");
    expect(env.ALLOW_LOCALHOST_FOR_DEV).toBe(true);
    expect(isValidEnv(validMockEnv)).toBe(true);
  });

  it("fails and clearly lists missing required variables", () => {
    const incompleteEnv = {
      NOTIFY_EMAIL: "not-an-email",
    };

    expect(() => getEnv(incompleteEnv)).toThrowError(
      /MISSING OR INVALID ENVIRONMENT VARIABLES/
    );
    expect(isValidEnv(incompleteEnv)).toBe(false);
  });

  it("handles optional Telegram variables when omitted", () => {
    const minimalEnv = {
      ...validMockEnv,
      TELEGRAM_BOT_TOKEN: undefined,
      TELEGRAM_CHAT_ID: undefined,
      ALLOW_LOCALHOST_FOR_DEV: undefined,
    };

    const env = getEnv(minimalEnv);
    expect(env.TELEGRAM_BOT_TOKEN).toBeUndefined();
    expect(env.TELEGRAM_CHAT_ID).toBeUndefined();
    expect(env.ALLOW_LOCALHOST_FOR_DEV).toBe(false);
  });

  it("throws security error if invoked in browser context", () => {
    // Simulate browser window
    (globalThis as unknown as { window: unknown }).window = {};

    expect(() => getEnv(validMockEnv)).toThrowError(
      /Server-side secrets must never be accessed from the client browser/
    );

    // Clean up
    delete (globalThis as unknown as { window?: unknown }).window;
  });
});
