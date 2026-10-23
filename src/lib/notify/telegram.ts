import { getEnv } from "@/lib/env";
import { FormattedMessage } from "./format";

/**
 * Sends an instant push notification via the Telegram Bot API.
 * If bot credentials are not configured, skips silently.
 */
export async function sendTelegramAlert(
  message: FormattedMessage
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  try {
    const env = getEnv();

    const botToken = env.TELEGRAM_BOT_TOKEN?.trim();
    const chatId = env.TELEGRAM_CHAT_ID?.trim();

    // Skip silently if Telegram is not configured
    if (!botToken || !chatId) {
      return { ok: true, skipped: true };
    }

    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message.telegramText,
        parse_mode: "HTML",
        disable_web_page_preview: false,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      return {
        ok: false,
        error: `Telegram Bot API HTTP ${response.status}: ${errBody}`,
      };
    }

    return { ok: true };
  } catch (err: unknown) {
    const messageText = err instanceof Error ? err.message : "Telegram delivery network error";
    return { ok: false, error: messageText };
  }
}
