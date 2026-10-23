import { SupabaseClient } from "@supabase/supabase-js";
import { Monitor, TickSummary } from "@/lib/types";
import { getDb } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { fetchPage } from "@/lib/checker/fetch-page";
import { evaluate } from "@/lib/checker/evaluate";
import { notifyAll } from "@/lib/notify";
import { calculateEffectiveInterval } from "./release-mode";
import { calculateFailureBackoff } from "./backoff";

const CONCURRENCY_LIMIT = 5;
const GLOBAL_TIMEOUT_MS = 20000; // 20-second budget

export interface TickOptions {
  isDryRun?: boolean;
  dbClient?: SupabaseClient; // Allows passing mock db for tests
}

/**
 * Runs a single monitor check and handles logging, state transition, backoff, and alerts.
 */
async function processMonitor(
  monitor: Monitor,
  db: SupabaseClient,
  isDryRun: boolean,
  allowLocalhost: boolean
): Promise<{ state: string; isAvailable: boolean; isError: boolean }> {
  const pageResult = await fetchPage(monitor.url, { allowLocalhost });
  const evalResult = await evaluate(monitor, pageResult);

  const now = new Date();
  const nowIso = now.toISOString();

  // 1. Insert check log
  await db.from("check_logs").insert({
    monitor_id: monitor.id,
    http_status: pageResult.status || null,
    state: evalResult.state,
    latency_ms: pageResult.latencyMs || null,
    note: evalResult.note || null,
    checked_at: nowIso,
  });

  const isSuccess = evalResult.state === "available" || evalResult.state === "unavailable";
  const isAvailable = evalResult.state === "available";
  const isError = evalResult.state === "error" || evalResult.state === "blocked";

  // 2. Calculate consecutive failures and trouble alert status
  const consecutiveFailures = isSuccess ? 0 : monitor.consecutive_failures + 1;
  let troubleNotifiedAt = isSuccess ? null : monitor.trouble_notified_at;

  // Trouble alert condition: 5 consecutive failures OR blocked twice in a row
  const isBlockedTwice =
    evalResult.state === "blocked" && monitor.last_state === "blocked";

  if ((consecutiveFailures >= 5 || isBlockedTwice) && !troubleNotifiedAt) {
    if (!isDryRun) {
      await notifyAll({
        type: "trouble",
        eventName: monitor.name,
        url: monitor.url,
        reason: evalResult.note || "Persistent check failures or anti-bot challenge",
        detectedAt: now,
      });
    }
    troubleNotifiedAt = nowIso;
  }

  // 3. Calculate next check interval
  let effectiveSeconds: number;
  if (isSuccess) {
    effectiveSeconds = calculateEffectiveInterval(
      monitor.interval_seconds,
      monitor.release_at,
      now
    );
  } else {
    effectiveSeconds = calculateFailureBackoff(
      monitor.interval_seconds,
      consecutiveFailures,
      pageResult.retryAfterSeconds
    );
  }

  const nextCheckAt = new Date(now.getTime() + effectiveSeconds * 1000).toISOString();

  // 4. Alert State Machine & Duplicate Protection
  let statusUpdate = monitor.status;
  let alertSentAt = monitor.alert_sent_at;
  let alertClaimedAt = monitor.alert_claimed_at;

  if (isAvailable && monitor.status === "active" && !monitor.alert_sent_at) {
    // Attempt to atomically claim the alert lease
    // Only claim if alert_sent_at is null AND (alert_claimed_at is null OR expired lease older than 2 minutes)
    const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000).toISOString();

    const { data: claimedRows } = await db
      .from("monitors")
      .update({ alert_claimed_at: nowIso })
      .eq("id", monitor.id)
      .is("alert_sent_at", null)
      .or(`alert_claimed_at.is.null,alert_claimed_at.lt.${twoMinutesAgo}`)
      .select();

    if (claimedRows && claimedRows.length > 0) {
      // Lease successfully won by this execution
      alertClaimedAt = nowIso;

      if (!isDryRun) {
        const notifResults = await notifyAll({
          type: "availability",
          eventName: monitor.name,
          bookingUrl: monitor.url,
          detectedAt: now,
        });

        const anySuccess = notifResults.some((r) => r.ok);
        if (anySuccess) {
          // Alert delivered: mark alerted and set alert_sent_at (monitoring stops)
          statusUpdate = "alerted";
          alertSentAt = nowIso;
        } else {
          // All channels failed: clear claim lease so next tick can retry
          alertClaimedAt = null;
        }
      }
    }
  }

  // 5. Update monitor record
  await db
    .from("monitors")
    .update({
      last_state: evalResult.state,
      last_checked_at: nowIso,
      next_check_at: nextCheckAt,
      consecutive_failures: consecutiveFailures,
      last_error: isError ? evalResult.note || "Check failed" : null,
      last_content_hash: evalResult.hash ?? monitor.last_content_hash,
      status: statusUpdate,
      alert_sent_at: alertSentAt,
      alert_claimed_at: alertClaimedAt,
      trouble_notified_at: troubleNotifiedAt,
    })
    .eq("id", monitor.id);

  return {
    state: evalResult.state,
    isAvailable,
    isError,
  };
}

/**
 * Main Tick Engine:
 * - Upserts heartbeat
 * - Claims due monitors atomically via SQL function
 * - Checks up to 20 monitors in batches of 5 with 20s total budget
 * - Randomly prunes logs (~1 in 50 runs)
 */
export async function runTick(options: TickOptions = {}): Promise<TickSummary> {
  const startTime = Date.now();
  const deadline = startTime + GLOBAL_TIMEOUT_MS;

  const env = getEnv();
  const db = options.dbClient ?? getDb();
  const isDryRun = options.isDryRun ?? false;
  const allowLocalhost = env.ALLOW_LOCALHOST_FOR_DEV || false;

  // 1. Upsert heartbeat
  try {
    await db.from("heartbeat").upsert({
      id: 1,
      last_tick_at: new Date().toISOString(),
    });
  } catch (err: unknown) {
    console.error("Heartbeat upsert failed:", err);
  }

  // 2. Claim due monitors from database
  let monitors: Monitor[] = [];
  try {
    const { data, error } = await db.rpc("claim_due_monitors", { max_rows: 20 });
    if (error) {
      console.error("claim_due_monitors RPC error:", error);
    } else if (data) {
      monitors = data as Monitor[];
    }
  } catch (err: unknown) {
    console.error("Failed to query due monitors:", err);
  }

  let checked = 0;
  let available = 0;
  let errors = 0;
  let skipped = 0;

  // 3. Process monitors in batches of CONCURRENCY_LIMIT
  for (let i = 0; i < monitors.length; i += CONCURRENCY_LIMIT) {
    // Check if we are running low on time budget (< 2 seconds left)
    if (Date.now() > deadline - 2000) {
      skipped += monitors.length - i;
      break;
    }

    const batch = monitors.slice(i, i + CONCURRENCY_LIMIT);
    const results = await Promise.allSettled(
      batch.map((m) =>
        processMonitor(m, db, isDryRun, allowLocalhost)
      )
    );

    for (const res of results) {
      if (res.status === "fulfilled") {
        checked++;
        if (res.value.isAvailable) available++;
        if (res.value.isError) errors++;
      } else {
        checked++;
        errors++;
      }
    }
  }

  // 4. Approximately 1 in 50 ticks calls prune_logs()
  if (Math.random() < 0.02) {
    try {
      await db.rpc("prune_logs");
    } catch {
      // Non-critical retention cleanup
    }
  }

  const durationMs = Date.now() - startTime;

  return {
    checked,
    available,
    errors,
    skipped,
    durationMs,
  };
}
