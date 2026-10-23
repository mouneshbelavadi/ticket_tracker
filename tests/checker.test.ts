import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  extractText,
  isJsShell,
  detectBlock,
  evaluate,
} from "@/lib/checker";
import { PageFetchResult } from "@/lib/types";

describe("Website Checker Core (src/lib/checker/)", () => {
  const fixturesDir = path.resolve(__dirname, "./fixtures");

  const inStockHtml = fs.readFileSync(path.join(fixturesDir, "in-stock.html"), "utf-8");
  const soldOutHtml = fs.readFileSync(path.join(fixturesDir, "sold-out.html"), "utf-8");
  const soldOutDisappearedHtml = fs.readFileSync(
    path.join(fixturesDir, "sold-out-disappeared.html"),
    "utf-8"
  );
  const captchaHtml = fs.readFileSync(path.join(fixturesDir, "captcha.html"), "utf-8");
  const jsShellHtml = fs.readFileSync(path.join(fixturesDir, "js-shell.html"), "utf-8");
  const errorHtml = fs.readFileSync(path.join(fixturesDir, "error.html"), "utf-8");

  function createMockPage(
    html: string,
    status = 200,
    blockedReason?: string,
    error?: string
  ): PageFetchResult {
    return {
      ok: status === 200 && !blockedReason,
      status,
      html,
      finalUrl: "https://tickets.example.com/event",
      latencyMs: 120,
      blockedReason,
      error,
      needsBrowserHint: isJsShell(html),
    };
  }

  describe("HTML Text Extraction & Sanitization", () => {
    it("strips script, style, and noscript tags and collapses whitespace", () => {
      const html = "<div>  Hello   <script>alert(1)</script> <style>.a{color:red}</style> World!  </div>";
      const text = extractText(html);
      expect(text).toBe("hello world!");
    });

    it("respects CSS selector when specified", () => {
      const text = extractText(inStockHtml, "#book-btn");
      expect(text).toBe("book now");
    });
  });

  describe("JS Shell Detection", () => {
    it("flags sparse SPA shells as needing browser hint (< 500 chars)", () => {
      expect(isJsShell(jsShellHtml)).toBe(true);
    });

    it("does not flag rich content pages as JS shells", () => {
      expect(isJsShell(inStockHtml)).toBe(false);
      expect(isJsShell(soldOutHtml)).toBe(false);
    });
  });

  describe("Block & CAPTCHA Detection", () => {
    it("detects HTTP 401, 403, and 429 statuses as blocked", () => {
      expect(detectBlock(401, "").blocked).toBe(true);
      expect(detectBlock(403, "").blocked).toBe(true);
      expect(detectBlock(429, "").blocked).toBe(true);
    });

    it("detects CAPTCHA and Cloudflare challenges in response body", () => {
      const result = detectBlock(200, captchaHtml);
      expect(result.blocked).toBe(true);
      expect(result.reason).toContain("verify you are human");
    });

    it("detects HTTP 503 challenge pages", () => {
      const result = detectBlock(503, "Checking your browser before accessing...");
      expect(result.blocked).toBe(true);
      expect(result.reason).toContain("HTTP 503");
    });
  });

  describe("Monitor Evaluation Rules", () => {
    describe("Mode: 'appears'", () => {
      const monitorAppears = {
        mode: "appears" as const,
        keyword: "Tickets Available|Book Now",
        sanity_keyword: null,
        css_selector: null,
        last_content_hash: null,
      };

      it("evaluates to 'available' when any keyword appears", async () => {
        const page = createMockPage(inStockHtml);
        const result = await evaluate(monitorAppears, page);
        expect(result.state).toBe("available");
        expect(result.note).toContain("tickets available");
      });

      it("evaluates to 'unavailable' when no keyword is found", async () => {
        const page = createMockPage(soldOutHtml);
        const result = await evaluate(monitorAppears, page);
        expect(result.state).toBe("unavailable");
      });
    });

    describe("Mode: 'disappears'", () => {
      const monitorDisappears = {
        mode: "disappears" as const,
        keyword: "SOLD OUT|All allocations have been exhausted",
        sanity_keyword: "Demo Concert 2026",
        css_selector: null,
        last_content_hash: null,
      };

      it("evaluates to 'unavailable' while the sold-out keyword is still present", async () => {
        const page = createMockPage(soldOutHtml);
        const result = await evaluate(monitorDisappears, page);
        expect(result.state).toBe("unavailable");
        expect(result.note).toContain("sold out");
      });

      it("evaluates to 'available' when sold-out disappears from verified event page", async () => {
        const page = createMockPage(soldOutDisappearedHtml);
        const result = await evaluate(monitorDisappears, page);
        expect(result.state).toBe("available");
      });

      it("returns 'error' if sanity keyword is missing so broken pages never cause false alerts", async () => {
        const page = createMockPage(errorHtml);
        const result = await evaluate(monitorDisappears, page);
        expect(result.state).toBe("error");
        expect(result.note).toBe("page did not look like the real event page");
      });
    });

    describe("Mode: 'changes'", () => {
      const monitorChanges = {
        mode: "changes" as const,
        keyword: null,
        sanity_keyword: null,
        css_selector: null,
        last_content_hash: null,
      };

      it("establishes baseline hash on first check and returns 'unavailable'", async () => {
        const page = createMockPage(soldOutHtml);
        const result = await evaluate(monitorChanges, page);
        expect(result.state).toBe("unavailable");
        expect(result.hash).toBeDefined();
        expect(result.note).toContain("Baseline content hash established");
      });

      it("detects content changes and returns 'available' with new hash", async () => {
        // Run baseline first
        const page1 = createMockPage(soldOutHtml);
        const baseline = await evaluate(monitorChanges, page1);

        // Run updated page with different content
        const page2 = createMockPage(soldOutDisappearedHtml);
        const result = await evaluate(
          { ...monitorChanges, last_content_hash: baseline.hash ?? null },
          page2
        );

        expect(result.state).toBe("available");
        expect(result.hash).not.toBe(baseline.hash);
        expect(result.note).toContain("content hash has changed");
      });

      it("returns 'unavailable' when content hash matches baseline", async () => {
        const page1 = createMockPage(soldOutHtml);
        const baseline = await evaluate(monitorChanges, page1);

        const page2 = createMockPage(soldOutHtml);
        const result = await evaluate(
          { ...monitorChanges, last_content_hash: baseline.hash ?? null },
          page2
        );

        expect(result.state).toBe("unavailable");
        expect(result.hash).toBe(baseline.hash);
      });
    });

    describe("Blocked and Error Pages", () => {
      const monitor = {
        mode: "appears" as const,
        keyword: "Book Now",
        sanity_keyword: null,
        css_selector: null,
        last_content_hash: null,
      };

      it("returns 'blocked' state when blockedReason is set", async () => {
        const page = createMockPage(captchaHtml, 200, "Cloudflare challenge");
        const result = await evaluate(monitor, page);
        expect(result.state).toBe("blocked");
        expect(result.note).toBe("Cloudflare challenge");
      });

      it("returns 'error' state on 500 server error", async () => {
        const page = createMockPage(errorHtml, 500, undefined, "HTTP 500 Internal Server Error");
        const result = await evaluate(monitor, page);
        expect(result.state).toBe("error");
      });
    });
  });
});
