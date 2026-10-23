import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { fetchPage } from "@/lib/checker/fetch-page";
import { evaluate } from "@/lib/checker/evaluate";
import { notifyAll } from "@/lib/notify";
import { calculateEffectiveInterval } from "@/lib/tick/release-mode";
import { calculateFailureBackoff } from "@/lib/tick/backoff";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();
    const env = getEnv();

    const { data: monitor, error: monError } = await db
      .from("monitors")
      .select("*")
      .eq("id", id)
      .single();

    if (monError || !monitor) {
      return NextResponse.json({ error: "Monitor not found" }, { status: 404 });
    }

    const now = new Date();
    const nowIso = now.toISOString();

    const pageResult = await fetchPage(monitor.url, {
      allowLocalhost: env.ALLOW_LOCALHOST_FOR_DEV,
    });
    const evalResult = await evaluate(monitor, pageResult);

    // 1. Log check result
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

    const consecutiveFailures = isSuccess ? 0 : monitor.consecutive_failures + 1;
    let troubleNotifiedAt = isSuccess ? null : monitor.trouble_notified_at;

    // Trouble alert condition
    const isBlockedTwice =
      evalResult.state === "blocked" && monitor.last_state === "blocked";

    if ((consecutiveFailures >= 5 || isBlockedTwice) && !troubleNotifiedAt) {
      await notifyAll({
        type: "trouble",
        eventName: monitor.name,
        url: monitor.url,
        reason: evalResult.note || "Persistent check failures or anti-bot challenge",
        detectedAt: now,
      });
      troubleNotifiedAt = nowIso;
    }

    // Next check interval calculation
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

    // Alert state machine (Duplicate protection)
    let statusUpdate = monitor.status;
    let alertSentAt = monitor.alert_sent_at;
    let alertClaimedAt = monitor.alert_claimed_at;

    if (isAvailable && monitor.status === "active" && !monitor.alert_sent_at) {
      const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000).toISOString();

      const { data: claimedRows } = await db
        .from("monitors")
        .update({ alert_claimed_at: nowIso })
        .eq("id", monitor.id)
        .is("alert_sent_at", null)
        .or(`alert_claimed_at.is.null,alert_claimed_at.lt.${twoMinutesAgo}`)
        .select();

      if (claimedRows && claimedRows.length > 0) {
        alertClaimedAt = nowIso;
        const notifResults = await notifyAll({
          type: "availability",
          eventName: monitor.name,
          bookingUrl: monitor.url,
          detectedAt: now,
        });

        const anySuccess = notifResults.some((r) => r.ok);
        if (anySuccess) {
          statusUpdate = "alerted";
          alertSentAt = nowIso;
        } else {
          alertClaimedAt = null;
        }
      }
    }

    const { data: updatedMonitor } = await db
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
      .eq("id", monitor.id)
      .select()
      .single();

    return NextResponse.json({
      result: evalResult,
      page: {
        status: pageResult.status,
        latencyMs: pageResult.latencyMs,
        needsBrowserHint: pageResult.needsBrowserHint,
      },
      monitor: updatedMonitor,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Run check failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
