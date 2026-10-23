const MAX_BACKOFF_SECONDS = 15 * 60; // 15 minutes (900 seconds)

/**
 * Calculates the next check interval following failures:
 * - If consecutive failures < 3: uses normal base interval.
 * - After 3 failures: backoff is min(interval * 2^(failures-1), 15 minutes).
 * - If HTTP 429 Retry-After is present, honors it (bounded by at least the base interval).
 */
export function calculateFailureBackoff(
  baseIntervalSeconds: number,
  consecutiveFailures: number,
  retryAfterSeconds?: number
): number {
  if (retryAfterSeconds && retryAfterSeconds > 0) {
    return Math.max(baseIntervalSeconds, retryAfterSeconds);
  }

  if (consecutiveFailures < 3) {
    return baseIntervalSeconds;
  }

  // Exponential backoff: interval * 2^(failures - 1)
  const multiplier = Math.pow(2, consecutiveFailures - 1);
  const backoff = baseIntervalSeconds * multiplier;

  return Math.min(backoff, MAX_BACKOFF_SECONDS);
}
