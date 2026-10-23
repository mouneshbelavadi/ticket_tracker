import { EvaluationResult, PageFetchResult, Monitor } from "@/lib/types";
import { extractText } from "./extract";

/**
 * Computes a standard hex SHA-256 hash of a string using Web Crypto.
 */
async function computeSha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const buffer = await crypto.subtle.digest("SHA-256", encoder.encode(text));
  const byteArray = Array.from(new Uint8Array(buffer));
  return byteArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type MonitorEvaluationInput = Pick<
  Monitor,
  "mode" | "keyword" | "sanity_keyword" | "css_selector" | "last_content_hash"
>;

/**
 * Evaluates page content against monitor rules.
 * Determines whether tickets are 'available', 'unavailable', 'blocked', or in 'error'.
 */
export async function evaluate(
  monitor: MonitorEvaluationInput,
  page: PageFetchResult
): Promise<EvaluationResult> {
  // 1. Blocked check: If anti-bot/CAPTCHA/rate limit detected, never try to bypass
  if (page.blockedReason) {
    return {
      state: "blocked",
      note: page.blockedReason,
    };
  }

  // 2. Network errors, timeouts, or non-200 responses are classified as errors
  if (!page.ok || page.status !== 200 || page.error) {
    return {
      state: "error",
      note: page.error || `HTTP ${page.status} returned by target website`,
    };
  }

  const text = extractText(page.html, monitor.css_selector);

  // 3. Mode: "appears"
  if (monitor.mode === "appears") {
    const rawKeywords = monitor.keyword || "";
    const keywords = rawKeywords
      .split("|")
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean);

    if (keywords.length === 0) {
      return {
        state: "error",
        note: "No keywords configured for appears mode",
      };
    }

    const matched = keywords.find((k) => text.includes(k));
    if (matched) {
      return {
        state: "available",
        note: `Found keyword: "${matched}"`,
      };
    }

    return {
      state: "unavailable",
      note: "None of the target keywords were found on the page",
    };
  }

  // 4. Mode: "disappears"
  if (monitor.mode === "disappears") {
    // Sanity check: Ensure the page is the authentic event page
    if (monitor.sanity_keyword && monitor.sanity_keyword.trim()) {
      const sanity = monitor.sanity_keyword.trim().toLowerCase();
      if (!text.includes(sanity)) {
        return {
          state: "error",
          note: "page did not look like the real event page",
        };
      }
    }

    const rawKeywords = monitor.keyword || "";
    const keywords = rawKeywords
      .split("|")
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean);

    const stillPresent = keywords.find((k) => text.includes(k));
    if (stillPresent) {
      return {
        state: "unavailable",
        note: `Keyword still present: "${stillPresent}"`,
      };
    }

    return {
      state: "available",
      note: "Target unavailable keyword(s) disappeared from confirmed event page",
    };
  }

  // 5. Mode: "changes"
  if (monitor.mode === "changes") {
    const newHash = await computeSha256(text);

    if (!monitor.last_content_hash) {
      // First run establishes baseline hash
      return {
        state: "unavailable",
        hash: newHash,
        note: "Baseline content hash established",
      };
    }

    if (newHash !== monitor.last_content_hash) {
      return {
        state: "available",
        hash: newHash,
        note: "Monitored content hash has changed from baseline",
      };
    }

    return {
      state: "unavailable",
      hash: newHash,
      note: "Content unchanged from baseline hash",
    };
  }

  return {
    state: "error",
    note: `Unknown detection mode: ${monitor.mode}`,
  };
}
