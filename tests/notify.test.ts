import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { notifyAll, formatTimeIST } from "@/lib/notify";

// Mock env
vi.mock("@/lib/env", () => ({
  getEnv: vi.fn(),
}));

import { getEnv } from "@/lib/env";

describe("Notifications Dispatcher (src/lib/notify/)", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("formats IST timestamps accurately", () => {
    // 2026-10-23 12:00:00 UTC = 17:30:00 IST
    const date = new Date("2026-10-23T12:00:00Z");
    const formatted = formatTimeIST(date);
    expect(formatted).toContain("5:30:00");
  });

  it("successfully sends email via Resend and returns ok: true", async () => {
    vi.mocked(getEnv).mockReturnValue({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "key",
      RESEND_API_KEY: "re_mock_key_123",
      NOTIFY_EMAIL: "personal@gmail.com",
      ADMIN_PASSWORD: "admin",
      SESSION_SECRET: "secret",
      CRON_SECRET: "cron",
      APP_URL: "https://ticket.com",
      TELEGRAM_BOT_TOKEN: "",
      TELEGRAM_CHAT_ID: "",
      ALLOW_LOCALHOST_FOR_DEV: false,
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: "email-123" }),
    });

    const results = await notifyAll({
      type: "availability",
      eventName: "Coldplay Tour 2026",
      bookingUrl: "https://in.bookmyshow.com/coldplay",
    });

    expect(results).toHaveLength(1);
    expect(results[0].channel).toBe("email");
    expect(results[0].ok).toBe(true);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer re_mock_key_123",
        }),
      })
    );
  });

  it("handles Resend API error gracefully without throwing", async () => {
    vi.mocked(getEnv).mockReturnValue({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "key",
      RESEND_API_KEY: "re_mock_key_123",
      NOTIFY_EMAIL: "personal@gmail.com",
      ADMIN_PASSWORD: "admin",
      SESSION_SECRET: "secret",
      CRON_SECRET: "cron",
      APP_URL: "https://ticket.com",
      TELEGRAM_BOT_TOKEN: "",
      TELEGRAM_CHAT_ID: "",
      ALLOW_LOCALHOST_FOR_DEV: false,
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => "Only personal address allowed on onboarding domain",
    });

    const results = await notifyAll({
      type: "trouble",
      eventName: "Coldplay Tour 2026",
      url: "https://example.com",
      reason: "Access blocked by Cloudflare",
    });

    expect(results).toHaveLength(1);
    expect(results[0].channel).toBe("email");
    expect(results[0].ok).toBe(false);
    expect(results[0].error).toContain("HTTP 403");
  });

  it("skips Telegram silently when bot token or chat ID is not configured", async () => {
    vi.mocked(getEnv).mockReturnValue({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "key",
      RESEND_API_KEY: "re_mock_key_123",
      NOTIFY_EMAIL: "personal@gmail.com",
      ADMIN_PASSWORD: "admin",
      SESSION_SECRET: "secret",
      CRON_SECRET: "cron",
      APP_URL: "https://ticket.com",
      TELEGRAM_BOT_TOKEN: undefined,
      TELEGRAM_CHAT_ID: undefined,
      ALLOW_LOCALHOST_FOR_DEV: false,
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });

    const results = await notifyAll({ type: "test" });

    // Only email channel returned; Telegram skipped without error
    expect(results).toHaveLength(1);
    expect(results[0].channel).toBe("email");
  });

  it("sends to both Resend and Telegram when both are configured", async () => {
    vi.mocked(getEnv).mockReturnValue({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "key",
      RESEND_API_KEY: "re_mock_key_123",
      NOTIFY_EMAIL: "personal@gmail.com",
      ADMIN_PASSWORD: "admin",
      SESSION_SECRET: "secret",
      CRON_SECRET: "cron",
      APP_URL: "https://ticket.com",
      TELEGRAM_BOT_TOKEN: "987654:ABC-DEF",
      TELEGRAM_CHAT_ID: "12345678",
      ALLOW_LOCALHOST_FOR_DEV: false,
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "ok",
    });

    const results = await notifyAll({ type: "test" });

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.channel)).toEqual(["email", "telegram"]);
    expect(results.every((r) => r.ok)).toBe(true);
  });
});
