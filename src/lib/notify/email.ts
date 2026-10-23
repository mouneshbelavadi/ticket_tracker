import { getEnv } from "@/lib/env";
import { FormattedMessage } from "./format";

/**
 * Sends an email using the Resend REST API via plain fetch.
 * Delivered exclusively to the configured NOTIFY_EMAIL address.
 */
export async function sendEmailAlert(
  message: FormattedMessage
): Promise<{ ok: boolean; error?: string }> {
  try {
    const env = getEnv();

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Ticket Alert <onboarding@resend.dev>",
        to: [env.NOTIFY_EMAIL],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      return {
        ok: false,
        error: `Resend API returned HTTP ${response.status}: ${errBody}`,
      };
    }

    return { ok: true };
  } catch (err: unknown) {
    const messageText = err instanceof Error ? err.message : "Email delivery network error";
    return { ok: false, error: messageText };
  }
}
