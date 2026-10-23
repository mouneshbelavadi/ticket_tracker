import { describe, it, expect, vi, afterEach } from "vitest";
import {
  validateSafeUrl,
  isPrivateIPv4,
  isPrivateIPv6,
  safeFetch,
} from "@/lib/safe-url";

describe("SSRF Protection & Safe URL Fetcher (src/lib/safe-url.ts)", () => {
  describe("isPrivateIPv4", () => {
    it("flags loopback 127.0.0.1 as private unless allowLocalhost is true", () => {
      expect(isPrivateIPv4("127.0.0.1", false)).toBe(true);
      expect(isPrivateIPv4("127.0.0.1", true)).toBe(false);
    });

    it("flags RFC 1918 private ranges as private", () => {
      expect(isPrivateIPv4("10.0.0.1")).toBe(true);
      expect(isPrivateIPv4("172.16.0.1")).toBe(true);
      expect(isPrivateIPv4("172.31.255.255")).toBe(true);
      expect(isPrivateIPv4("192.168.1.100")).toBe(true);
    });

    it("flags link-local and cloud metadata 169.254.169.254 as private", () => {
      expect(isPrivateIPv4("169.254.169.254")).toBe(true);
    });

    it("allows genuine public IPs", () => {
      expect(isPrivateIPv4("93.184.216.34")).toBe(false); // example.com
      expect(isPrivateIPv4("8.8.8.8")).toBe(false);
      expect(isPrivateIPv4("1.1.1.1")).toBe(false);
    });
  });

  describe("isPrivateIPv6", () => {
    it("flags IPv6 loopback ::1 as private unless allowLocalhost is true", () => {
      expect(isPrivateIPv6("::1", false)).toBe(true);
      expect(isPrivateIPv6("::1", true)).toBe(false);
    });

    it("flags link-local fe80:: and unique-local fc00:: as private", () => {
      expect(isPrivateIPv6("fe80::1")).toBe(true);
      expect(isPrivateIPv6("fc00::1")).toBe(true);
      expect(isPrivateIPv6("fd12:3456:789a::1")).toBe(true);
    });
  });

  describe("validateSafeUrl", () => {
    it("accepts valid public https and http URLs", async () => {
      const result = await validateSafeUrl("https://example.com/tickets");
      expect(result.valid).toBe(true);
      expect(result.parsedUrl?.hostname).toBe("example.com");
    });

    it("rejects non-http/https schemes", async () => {
      const ftpResult = await validateSafeUrl("ftp://example.com/file");
      expect(ftpResult.valid).toBe(false);
      expect(ftpResult.error).toContain("Disallowed URL scheme");

      const fileResult = await validateSafeUrl("file:///etc/passwd");
      expect(fileResult.valid).toBe(false);

      const jsResult = await validateSafeUrl("javascript:alert(1)");
      expect(jsResult.valid).toBe(false);
    });

    it("rejects URLs containing embedded username or password", async () => {
      const result = await validateSafeUrl("https://admin:secret123@example.com/tickets");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Embedded credentials");
    });

    it("rejects private IPv4 hostnames directly", async () => {
      const r1 = await validateSafeUrl("http://192.168.1.1/admin");
      expect(r1.valid).toBe(false);
      expect(r1.error).toContain("forbidden private/internal IP");

      const r2 = await validateSafeUrl("http://169.254.169.254/latest/meta-data");
      expect(r2.valid).toBe(false);
    });

    it("rejects localhost by default but allows when allowLocalhost is true", async () => {
      const blocked = await validateSafeUrl("http://localhost:3000/demo", false);
      expect(blocked.valid).toBe(false);

      const allowed = await validateSafeUrl("http://localhost:3000/demo", true);
      expect(allowed.valid).toBe(true);
    });
  });

  describe("safeFetch redirect to private IP", () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it("aborts when a public URL attempts to redirect to a private IP", async () => {
      // Mock first response as a redirect to 192.168.1.1
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 302,
        headers: new Headers({
          location: "http://192.168.1.1/secret-data",
        }),
      });

      await expect(
        safeFetch("https://example.com/redirect-to-internal", { allowLocalhost: false })
      ).rejects.toThrow(/SSRF Blocked/);
    });
  });
});
