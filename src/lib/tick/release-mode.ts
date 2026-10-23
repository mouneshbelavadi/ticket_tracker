/**
 * Calculates the effective check interval (in seconds) according to adaptive "release mode":
 * - Start with the user-selected interval (60, 180, or 300 seconds).
 * - If release_at is configured:
 *   - > 30 min before release: user interval.
 *   - 30 to 10 min before release: at most 120 seconds.
 *   - 10 min before until 30 min after release: 60 seconds.
 *   - > 30 min after release: user interval.
 * Always selects the smaller of the two intervals.
 */
export function calculateEffectiveInterval(
  userIntervalSeconds: number,
  releaseAt: string | Date | null | undefined,
  now: Date = new Date()
): number {
  if (!releaseAt) {
    return userIntervalSeconds;
  }

  const releaseDate = typeof releaseAt === "string" ? new Date(releaseAt) : releaseAt;
  if (isNaN(releaseDate.getTime())) {
    return userIntervalSeconds;
  }

  // Difference in minutes between release time and current time
  const diffMinutes = (releaseDate.getTime() - now.getTime()) / (60 * 1000);

  let adaptiveInterval = userIntervalSeconds;

  if (diffMinutes > 30) {
    adaptiveInterval = userIntervalSeconds;
  } else if (diffMinutes > 10 && diffMinutes <= 30) {
    adaptiveInterval = Math.min(userIntervalSeconds, 120);
  } else if (diffMinutes >= -30 && diffMinutes <= 10) {
    adaptiveInterval = 60;
  } else {
    // After 30 minutes past release, revert to user interval
    adaptiveInterval = userIntervalSeconds;
  }

  return Math.min(userIntervalSeconds, adaptiveInterval);
}
