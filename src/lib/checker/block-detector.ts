/**
 * Checks whether an HTTP response indicates anti-bot protection, CAPTCHA,
 * rate limiting (429), or an access challenge.
 */
export function detectBlock(
  status: number,
  body: string
): { blocked: boolean; reason?: string } {
  // 1. Explicit blocking/rate-limit HTTP statuses
  if (status === 401) {
    return { blocked: true, reason: "HTTP 401: Authorization or login wall required" };
  }

  if (status === 403) {
    return { blocked: true, reason: "HTTP 403: Forbidden / Access Denied by anti-bot firewall" };
  }

  if (status === 429) {
    return { blocked: true, reason: "HTTP 429: Too Many Requests / Rate limited" };
  }

  const lower = body.toLowerCase();

  // 2. HTTP 503 with challenge indicators (Cloudflare / DDoS-Guard)
  if (status === 503) {
    if (
      lower.includes("checking your browser") ||
      lower.includes("just a moment") ||
      lower.includes("cloudflare") ||
      lower.includes("ddos-guard")
    ) {
      return { blocked: true, reason: "HTTP 503: Cloudflare/DDoS challenge page detected" };
    }
  }

  // 3. Body text heuristics for CAPTCHAs, virtual queues, and waiting rooms
  const challengeSignatures = [
    { pattern: "verify you are human", reason: "Bot verification prompt ('verify you are human')" },
    { pattern: "verify you are a human", reason: "Bot verification prompt ('verify you are a human')" },
    { pattern: "access denied", reason: "Access denied block page" },
    { pattern: "cf-browser-verification", reason: "Cloudflare browser verification" },
    { pattern: "g-recaptcha", reason: "Google reCAPTCHA present" },
    { pattern: "hcaptcha", reason: "hCaptcha present" },
    { pattern: "turnstile", reason: "Cloudflare Turnstile challenge present" },
    { pattern: "queue-it", reason: "Queue-It virtual waiting room active" },
    { pattern: "virtual waiting room", reason: "Virtual waiting room active" },
    { pattern: "please stand by, while we are checking your browser", reason: "Browser integrity check" },
  ];

  for (const sig of challengeSignatures) {
    if (lower.includes(sig.pattern)) {
      return { blocked: true, reason: sig.reason };
    }
  }

  return { blocked: false };
}
