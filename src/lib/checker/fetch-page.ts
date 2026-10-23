import { safeFetch } from "@/lib/safe-url";
import { PageFetchResult } from "@/lib/types";
import { detectBlock } from "./block-detector";
import { isJsShell } from "./extract";

export async function fetchPage(
  url: string,
  options?: {
    allowLocalhost?: boolean;
    timeoutMs?: number;
  }
): Promise<PageFetchResult> {
  const startTime = Date.now();

  try {
    const res = await safeFetch(url, {
      allowLocalhost: options?.allowLocalhost,
      timeoutMs: options?.timeoutMs ?? 10000,
    });

    const blockCheck = detectBlock(res.status, res.body);

    let retryAfterSeconds: number | undefined;
    if (res.status === 429) {
      const headerVal = res.headers.get("retry-after");
      if (headerVal) {
        const parsedSec = parseInt(headerVal, 10);
        if (!isNaN(parsedSec)) {
          retryAfterSeconds = parsedSec;
        }
      }
    }

    const needsBrowserHint = res.ok ? isJsShell(res.body) : false;

    return {
      ok: res.ok && !blockCheck.blocked,
      status: res.status,
      html: res.body,
      finalUrl: res.finalUrl,
      latencyMs: res.latencyMs,
      blockedReason: blockCheck.blocked ? blockCheck.reason : undefined,
      retryAfterSeconds,
      needsBrowserHint,
    };
  } catch (err: unknown) {
    const latencyMs = Date.now() - startTime;
    const message = err instanceof Error ? err.message : "Network fetch failed";

    return {
      ok: false,
      status: 0,
      html: "",
      finalUrl: url,
      latencyMs,
      error: message,
    };
  }
}
