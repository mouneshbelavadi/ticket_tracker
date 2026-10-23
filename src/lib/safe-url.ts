import dns from "dns/promises";
import net from "net";

const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2 MB
const DEFAULT_TIMEOUT_MS = 10000; // 10 seconds
const MAX_REDIRECTS = 3;

/**
 * Checks if an IPv4 address is in a private, loopback, link-local, or cloud metadata range.
 */
export function isPrivateIPv4(ip: string, allowLocalhost: boolean = false): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return true; // Malformed IPv4 is unsafe
  }

  const [a, b] = parts;

  // 127.0.0.0/8 (Loopback)
  if (a === 127) {
    return !allowLocalhost;
  }

  // 10.0.0.0/8 (Private)
  if (a === 10) return true;

  // 172.16.0.0/12 (Private: 172.16.0.0 - 172.31.255.255)
  if (a === 172 && b >= 16 && b <= 31) return true;

  // 192.168.0.0/16 (Private)
  if (a === 192 && b === 168) return true;

  // 169.254.0.0/16 (Link-local & AWS/GCP/Azure instance metadata)
  if (a === 169 && b === 254) return true;

  // 0.0.0.0/8 (Current network)
  if (a === 0) return true;

  // 100.64.0.0/10 (Shared carrier NAT)
  if (a === 100 && b >= 64 && b <= 127) return true;

  // 255.255.255.255 (Broadcast)
  if (a === 255 && b === 255 && parts[2] === 255 && parts[3] === 255) return true;

  return false;
}

/**
 * Checks if an IPv6 address is private, loopback, link-local, or unique-local.
 */
export function isPrivateIPv6(ip: string, allowLocalhost: boolean = false): boolean {
  const normalized = ip.toLowerCase();

  // Loopback ::1
  if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") {
    return !allowLocalhost;
  }

  // Unspecified ::
  if (normalized === "::" || normalized === "0:0:0:0:0:0:0:0") {
    return true;
  }

  // IPv4-mapped IPv6 (::ffff:192.168.1.1 or ::ffff:c0a8:0101)
  if (normalized.startsWith("::ffff:")) {
    const v4Part = normalized.replace("::ffff:", "");
    if (net.isIPv4(v4Part)) {
      return isPrivateIPv4(v4Part, allowLocalhost);
    }
  }

  // fc00::/7 (Unique Local Address)
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) {
    return true;
  }

  // fe80::/10 (Link-Local Unicast)
  if (
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  ) {
    return true;
  }

  return false;
}

/**
 * Validates whether a given URL is safe to fetch (anti-SSRF validation).
 */
export async function validateSafeUrl(
  inputUrl: string,
  allowLocalhost: boolean = false
): Promise<{ valid: boolean; error?: string; parsedUrl?: URL }> {
  let parsed: URL;

  try {
    parsed = new URL(inputUrl);
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }

  // 1. Check protocol: only http or https
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { valid: false, error: `Disallowed URL scheme: ${parsed.protocol} (only http and https allowed)` };
  }

  // 2. Reject username or password embedded in URL
  if (parsed.username || parsed.password) {
    return { valid: false, error: "Embedded credentials (username/password) are not allowed in monitor URLs" };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Check localhost keyword
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    if (!allowLocalhost) {
      return { valid: false, error: "Access to localhost is restricted for security" };
    }
    return { valid: true, parsedUrl: parsed };
  }

  // 3. Resolve hostname via DNS and check all resulting IP addresses
  try {
    const isIp = net.isIP(hostname);
    const addresses: { address: string; family: number }[] = [];

    if (isIp) {
      addresses.push({ address: hostname, family: isIp });
    } else {
      const resolved = await dns.lookup(hostname, { all: true });
      addresses.push(...resolved);
    }

    if (addresses.length === 0) {
      return { valid: false, error: "Could not resolve hostname via DNS" };
    }

    for (const record of addresses) {
      if (record.family === 4) {
        if (isPrivateIPv4(record.address, allowLocalhost)) {
          return { valid: false, error: `Resolved to forbidden private/internal IP: ${record.address}` };
        }
      } else if (record.family === 6) {
        if (isPrivateIPv6(record.address, allowLocalhost)) {
          return { valid: false, error: `Resolved to forbidden private/internal IPv6: ${record.address}` };
        }
      }
    }

    return { valid: true, parsedUrl: parsed };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "DNS resolution failure";
    return { valid: false, error: `DNS resolution failed: ${message}` };
  }
}

export interface SafeFetchResult {
  ok: boolean;
  status: number;
  body: string;
  finalUrl: string;
  latencyMs: number;
  headers: Headers;
}

/**
 * Safely fetches a URL with SSRF checks, manual redirect following (max 3 hops),
 * 2 MB max body size guard, and a 10s timeout.
 */
export async function safeFetch(
  targetUrl: string,
  options?: {
    allowLocalhost?: boolean;
    timeoutMs?: number;
    customHeaders?: Record<string, string>;
  }
): Promise<SafeFetchResult> {
  const allowLocalhost = options?.allowLocalhost ?? false;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let currentUrl = targetUrl;
  let redirectsFollowed = 0;

  const startTime = Date.now();

  while (redirectsFollowed <= MAX_REDIRECTS) {
    // Re-validate URL on every hop
    const validation = await validateSafeUrl(currentUrl, allowLocalhost);
    if (!validation.valid) {
      throw new Error(`SSRF Blocked: ${validation.error}`);
    }

    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(currentUrl, {
        method: "GET",
        headers: {
          "User-Agent": "TicketAlert/1.0 (Polite personal event monitor)",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          ...options?.customHeaders,
        },
        redirect: "manual",
        signal: controller.signal,
      });
    } catch (err: unknown) {
      clearTimeout(timeoutTimer);
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`Request timed out after ${timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutTimer);
    }

    // Handle Redirects manually (301, 302, 303, 307, 308)
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) {
        throw new Error(`Redirect HTTP ${response.status} returned without Location header`);
      }

      redirectsFollowed++;
      if (redirectsFollowed > MAX_REDIRECTS) {
        throw new Error(`Exceeded maximum allowed redirects (${MAX_REDIRECTS})`);
      }

      // Resolve relative redirects against current URL
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    // Check Content-Length header if present
    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_BYTES) {
      throw new Error(`Response size exceeds maximum limit of 2 MB (${contentLength} bytes)`);
    }

    // Read response text safely with length restriction
    const bodyText = await response.text();
    if (Buffer.byteLength(bodyText, "utf8") > MAX_BODY_BYTES) {
      throw new Error("Response body exceeded 2 MB limit");
    }

    const latencyMs = Date.now() - startTime;

    return {
      ok: response.ok,
      status: response.status,
      body: bodyText,
      finalUrl: currentUrl,
      latencyMs,
      headers: response.headers,
    };
  }

  throw new Error(`Exceeded maximum allowed redirects (${MAX_REDIRECTS})`);
}
