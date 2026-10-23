import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import http from "http";
import { runTick } from "@/lib/tick/engine";
import { Monitor } from "@/lib/types";

// Mock env
vi.mock("@/lib/env", () => ({
  getEnv: vi.fn().mockReturnValue({
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "key",
    RESEND_API_KEY: "re_mock",
    NOTIFY_EMAIL: "personal@gmail.com",
    ADMIN_PASSWORD: "admin",
    SESSION_SECRET: "secret",
    CRON_SECRET: "cron",
    APP_URL: "http://localhost:3000",
    ALLOW_LOCALHOST_FOR_DEV: true,
  }),
}));

// Mock notifyAll
vi.mock("@/lib/notify", () => ({
  notifyAll: vi.fn().mockResolvedValue([{ channel: "email", ok: true }]),
}));

import { notifyAll } from "@/lib/notify";

describe("Automated Self-Test (Mock Local Server & State Machine)", () => {
  let server: http.Server;
  let serverPort: number;
  let serverResponseStatus = 200;
  let serverResponseBody = "";

  beforeAll(async () => {
    // Spin up lightweight local mock HTTP server without third-party dependencies
    server = http.createServer((_req, res) => {
      res.writeHead(serverResponseStatus, { "Content-Type": "text/html" });
      res.end(serverResponseBody);
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (address && typeof address === "object") {
          serverPort = address.port;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  function createMockMonitor(overrides: Partial<Monitor> = {}): Monitor {
    return {
      id: "mock-mon-1",
      name: "Local Mock Event",
      url: `http://127.0.0.1:${serverPort}/tickets`,
      interval_seconds: 60,
      mode: "appears",
      keyword: "Tickets Available",
      sanity_keyword: null,
      css_selector: null,
      release_at: null,
      status: "active",
      last_state: "unknown",
      last_checked_at: null,
      next_check_at: new Date().toISOString(),
      consecutive_failures: 0,
      last_error: null,
      last_content_hash: null,
      alert_claimed_at: null,
      alert_sent_at: null,
      trouble_notified_at: null,
      created_at: new Date().toISOString(),
      ...overrides,
    };
  }

  it("Test A: Mode 'appears' detects availability on local server and triggers one alert", async () => {
    serverResponseStatus = 200;
    serverResponseBody = "<html><body><h1>Concert</h1><p>Tickets Available now for booking!</p></body></html>";

    const monitor = createMockMonitor({ mode: "appears", keyword: "Tickets Available" });

    const mockDb = {
      from: vi.fn(() => ({
        upsert: vi.fn().mockResolvedValue({}),
        insert: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          or: vi.fn().mockReturnThis(),
          select: vi.fn().mockResolvedValue({ data: [monitor] }),
        }),
      })),
      rpc: vi.fn().mockResolvedValue({ data: [monitor], error: null }),
    };

    const summary = await runTick({ dbClient: mockDb as never });

    expect(summary.checked).toBe(1);
    expect(summary.available).toBe(1);
    expect(notifyAll).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "availability",
        eventName: monitor.name,
      })
    );
  });

  it("Test B: Mode 'disappears' with sanity keyword guards against 404/500 false alerts", async () => {
    serverResponseStatus = 500;
    serverResponseBody = "<html><body><h1>500 Internal Error</h1></body></html>";

    const monitor = createMockMonitor({
      mode: "disappears",
      keyword: "SOLD OUT",
      sanity_keyword: "Demo Concert",
    });

    vi.mocked(notifyAll).mockClear();

    const mockDb = {
      from: vi.fn(() => ({
        upsert: vi.fn().mockResolvedValue({}),
        insert: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({}),
        }),
      })),
      rpc: vi.fn().mockResolvedValue({ data: [monitor], error: null }),
    };

    const summary = await runTick({ dbClient: mockDb as never });

    expect(summary.checked).toBe(1);
    expect(summary.available).toBe(0);
    expect(summary.errors).toBe(1);
    // Crucial check: No availability alert sent on broken/error page
    expect(notifyAll).not.toHaveBeenCalled();
  });
});
