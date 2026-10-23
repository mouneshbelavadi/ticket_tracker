import { describe, it, expect, vi, beforeEach } from "vitest";
import { calculateEffectiveInterval } from "@/lib/tick/release-mode";
import { calculateFailureBackoff } from "@/lib/tick/backoff";
import { runTick } from "@/lib/tick/engine";
import { Monitor } from "@/lib/types";

// Mock env
vi.mock("@/lib/env", () => ({
  getEnv: vi.fn().mockReturnValue({
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "key",
    RESEND_API_KEY: "re_mock",
    NOTIFY_EMAIL: "alerts@example.com",
    ADMIN_PASSWORD: "admin",
    SESSION_SECRET: "secret",
    CRON_SECRET: "test-cron-secret",
    APP_URL: "https://ticket.com",
    ALLOW_LOCALHOST_FOR_DEV: true,
  }),
}));

// Mock notifyAll
vi.mock("@/lib/notify", () => ({
  notifyAll: vi.fn(),
}));

import { notifyAll } from "@/lib/notify";

// Mock checker fetchPage and evaluate
vi.mock("@/lib/checker/fetch-page", () => ({
  fetchPage: vi.fn(),
}));

vi.mock("@/lib/checker/evaluate", () => ({
  evaluate: vi.fn(),
}));

import { fetchPage } from "@/lib/checker/fetch-page";
import { evaluate } from "@/lib/checker/evaluate";

describe("Tick Engine & State Machine (src/lib/tick/)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Adaptive Release-Mode Intervals", () => {
    const now = new Date("2026-10-23T12:00:00Z");

    it("uses base interval when release_at is not configured", () => {
      expect(calculateEffectiveInterval(300, null, now)).toBe(300);
      expect(calculateEffectiveInterval(180, undefined, now)).toBe(180);
    });

    it("uses base interval when > 30 minutes before release", () => {
      // Release at 12:45 (45 min ahead)
      const releaseAt = new Date("2026-10-23T12:45:00Z");
      expect(calculateEffectiveInterval(300, releaseAt, now)).toBe(300);
    });

    it("clamps to 120s when between 10 and 30 minutes before release", () => {
      // Release at 12:20 (20 min ahead)
      const releaseAt = new Date("2026-10-23T12:20:00Z");
      expect(calculateEffectiveInterval(300, releaseAt, now)).toBe(120);
      expect(calculateEffectiveInterval(60, releaseAt, now)).toBe(60); // doesn't increase
    });

    it("tightens to 60s when between 10 min before and 30 min after release", () => {
      // 5 min before release
      const releaseBefore = new Date("2026-10-23T12:05:00Z");
      expect(calculateEffectiveInterval(300, releaseBefore, now)).toBe(60);

      // 15 min after release
      const releaseAfter = new Date("2026-10-23T11:45:00Z");
      expect(calculateEffectiveInterval(300, releaseAfter, now)).toBe(60);
    });

    it("reverts to base interval when > 30 minutes after release", () => {
      // 45 min after release
      const releasePast = new Date("2026-10-23T11:15:00Z");
      expect(calculateEffectiveInterval(300, releasePast, now)).toBe(300);
    });
  });

  describe("Failure Backoff & Retry-After", () => {
    it("keeps normal interval for less than 3 failures", () => {
      expect(calculateFailureBackoff(60, 0)).toBe(60);
      expect(calculateFailureBackoff(60, 1)).toBe(60);
      expect(calculateFailureBackoff(60, 2)).toBe(60);
    });

    it("exponentially backs off after 3 failures", () => {
      // 3 failures: 60 * 2^(3-1) = 240
      expect(calculateFailureBackoff(60, 3)).toBe(240);
      // 4 failures: 60 * 2^(4-1) = 480
      expect(calculateFailureBackoff(60, 4)).toBe(480);
    });

    it("caps backoff at 15 minutes (900 seconds)", () => {
      expect(calculateFailureBackoff(300, 5)).toBe(900);
      expect(calculateFailureBackoff(60, 10)).toBe(900);
    });

    it("respects Retry-After header from HTTP 429", () => {
      expect(calculateFailureBackoff(60, 1, 150)).toBe(150);
    });
  });

  describe("Alert State Machine & Duplicate Protection", () => {
    function createMockMonitor(overrides: Partial<Monitor> = {}): Monitor {
      return {
        id: "mon-12345",
        name: "Test Concert",
        url: "https://tickets.example.com",
        interval_seconds: 60,
        mode: "appears",
        keyword: "Book Now",
        sanity_keyword: null,
        css_selector: null,
        release_at: null,
        status: "active",
        last_state: "unavailable",
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

    it("claims alert lease, sends alert, and transitions to 'alerted' status", async () => {
      const monitor = createMockMonitor();

      // Mock database calls
      const mockUpdates: Record<string, unknown>[] = [];
      const mockDb = {
        from: vi.fn(() => ({
          upsert: vi.fn().mockResolvedValue({}),
          insert: vi.fn().mockResolvedValue({}),
          update: vi.fn((data: Record<string, unknown>) => {
            mockUpdates.push(data);
            return {
              eq: vi.fn().mockReturnThis(),
              is: vi.fn().mockReturnThis(),
              or: vi.fn().mockReturnThis(),
              select: vi.fn().mockResolvedValue({ data: [monitor] }), // Won claim lease
            };
          }),
        })),
        rpc: vi.fn((fn: string) => {
          if (fn === "claim_due_monitors") {
            return Promise.resolve({ data: [monitor], error: null });
          }
          return Promise.resolve({ data: null, error: null });
        }),
      };

      vi.mocked(fetchPage).mockResolvedValue({
        ok: true,
        status: 200,
        html: "<p>Book Now</p>",
        finalUrl: monitor.url,
        latencyMs: 80,
      });

      vi.mocked(evaluate).mockResolvedValue({
        state: "available",
        note: 'Found "Book Now"',
      });

      vi.mocked(notifyAll).mockResolvedValue([{ channel: "email", ok: true }]);

      const summary = await runTick({ dbClient: mockDb as never });

      expect(summary.checked).toBe(1);
      expect(summary.available).toBe(1);
      expect(notifyAll).toHaveBeenCalledTimes(1);

      // Verify monitor status updated to 'alerted' and alert_sent_at set
      const lastUpdate = mockUpdates[mockUpdates.length - 1];
      expect(lastUpdate.status).toBe("alerted");
      expect(lastUpdate.alert_sent_at).toBeDefined();
    });

    it("prevents duplicate alerts during claim race when another tick holds lease", async () => {
      const monitor = createMockMonitor();

      const mockDb = {
        from: vi.fn(() => ({
          upsert: vi.fn().mockResolvedValue({}),
          insert: vi.fn().mockResolvedValue({}),
          update: vi.fn(() => ({
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            or: vi.fn().mockReturnThis(),
            select: vi.fn().mockResolvedValue({ data: [] }), // Lost claim race!
          })),
        })),
        rpc: vi.fn().mockResolvedValue({ data: [monitor], error: null }),
      };

      vi.mocked(fetchPage).mockResolvedValue({
        ok: true,
        status: 200,
        html: "ok",
        finalUrl: monitor.url,
        latencyMs: 50,
      });

      vi.mocked(evaluate).mockResolvedValue({
        state: "available",
      });

      await runTick({ dbClient: mockDb as never });

      // Should NOT call notifyAll because claim lease was not acquired
      expect(notifyAll).not.toHaveBeenCalled();
    });

    it("clears claim lease so next tick can retry if all notification channels fail", async () => {
      const monitor = createMockMonitor();
      const mockUpdates: Record<string, unknown>[] = [];

      const mockDb = {
        from: vi.fn(() => ({
          upsert: vi.fn().mockResolvedValue({}),
          insert: vi.fn().mockResolvedValue({}),
          update: vi.fn((data: Record<string, unknown>) => {
            mockUpdates.push(data);
            return {
              eq: vi.fn().mockReturnThis(),
              is: vi.fn().mockReturnThis(),
              or: vi.fn().mockReturnThis(),
              select: vi.fn().mockResolvedValue({ data: [monitor] }),
            };
          }),
        })),
        rpc: vi.fn().mockResolvedValue({ data: [monitor], error: null }),
      };

      vi.mocked(fetchPage).mockResolvedValue({
        ok: true,
        status: 200,
        html: "ok",
        finalUrl: monitor.url,
        latencyMs: 50,
      });

      vi.mocked(evaluate).mockResolvedValue({
        state: "available",
      });

      // Both email and telegram fail
      vi.mocked(notifyAll).mockResolvedValue([
        { channel: "email", ok: false, error: "Network error" },
      ]);

      await runTick({ dbClient: mockDb as never });

      expect(notifyAll).toHaveBeenCalledTimes(1);

      // Verify alert_claimed_at cleared to null and status NOT set to alerted
      const lastUpdate = mockUpdates[mockUpdates.length - 1];
      expect(lastUpdate.alert_claimed_at).toBeNull();
      expect(lastUpdate.status).toBe("active");
    });

    it("triggers trouble alert exactly once after 5 consecutive failures", async () => {
      const monitor = createMockMonitor({
        consecutive_failures: 4, // 5th failure incoming
        trouble_notified_at: null,
      });

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

      vi.mocked(fetchPage).mockResolvedValue({
        ok: false,
        status: 500,
        html: "",
        finalUrl: monitor.url,
        latencyMs: 50,
        error: "Server Error",
      });

      vi.mocked(evaluate).mockResolvedValue({
        state: "error",
        note: "HTTP 500",
      });

      await runTick({ dbClient: mockDb as never });

      expect(notifyAll).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "trouble",
          eventName: monitor.name,
        })
      );
    });
  });
});
