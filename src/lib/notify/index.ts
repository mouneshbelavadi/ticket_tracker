import { NotificationResult } from "@/lib/types";
import { AlertPayload, formatAlert } from "./format";
import { sendEmailAlert } from "./email";
import { sendTelegramAlert } from "./telegram";

export * from "./format";
export * from "./email";
export * from "./telegram";

/**
 * Dispatches an alert to all configured notification channels (Resend Email & optional Telegram).
 * Guaranteed to NEVER throw: all errors are trapped and returned per channel.
 */
export async function notifyAll(payload: AlertPayload): Promise<NotificationResult[]> {
  const formatted = formatAlert(payload);
  const results: NotificationResult[] = [];

  // 1. Email Channel (Resend)
  try {
    const emailRes = await sendEmailAlert(formatted);
    results.push({
      channel: "email",
      ok: emailRes.ok,
      error: emailRes.error,
    });
  } catch (err: unknown) {
    results.push({
      channel: "email",
      ok: false,
      error: err instanceof Error ? err.message : "Unexpected email failure",
    });
  }

  // 2. Telegram Channel (Optional)
  try {
    const tgRes = await sendTelegramAlert(formatted);
    if (!tgRes.skipped) {
      results.push({
        channel: "telegram",
        ok: tgRes.ok,
        error: tgRes.error,
      });
    }
  } catch (err: unknown) {
    results.push({
      channel: "telegram",
      ok: false,
      error: err instanceof Error ? err.message : "Unexpected telegram failure",
    });
  }

  return results;
}
