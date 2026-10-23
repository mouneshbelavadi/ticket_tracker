/**
 * Formats a Date into an Indian Standard Time (IST - Asia/Kolkata) readable string.
 */
export function formatTimeIST(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "medium",
    hour12: true,
  }).format(date);
}

export interface AvailabilityAlertData {
  type: "availability";
  eventName: string;
  bookingUrl: string;
  detectedAt?: Date;
}

export interface TroubleAlertData {
  type: "trouble";
  eventName: string;
  url: string;
  reason: string;
  detectedAt?: Date;
}

export interface TestAlertData {
  type: "test";
  timestamp?: Date;
}

export type AlertPayload = AvailabilityAlertData | TroubleAlertData | TestAlertData;

export interface FormattedMessage {
  subject: string;
  text: string;
  html: string;
  telegramText: string;
}

export function formatAlert(payload: AlertPayload): FormattedMessage {
  if (payload.type === "availability") {
    const timeIST = formatTimeIST(payload.detectedAt || new Date());
    const subject = `🚨 Tickets Available — ${payload.eventName}`;

    const text = [
      `TICKETS AVAILABLE ALERT`,
      `---------------------------------`,
      `Event: ${payload.eventName}`,
      `Status: Tickets appear to be available`,
      `Detected At: ${timeIST} (IST)`,
      `Booking URL: ${payload.bookingUrl}`,
      ``,
      `Open the booking page immediately:`,
      payload.bookingUrl,
    ].join("\n");

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <div style="background-color: #ecfdf5; border-left: 4px solid #10b981; padding: 16px; border-radius: 6px; margin-bottom: 20px;">
          <h2 style="color: #065f46; margin: 0 0 8px 0; font-size: 20px;">🚨 Tickets Available!</h2>
          <p style="color: #047857; margin: 0; font-size: 15px; font-weight: 500;">Tickets appear to be available for <strong>${payload.eventName}</strong>.</p>
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
          <tr>
            <td style="padding: 8px 0; color: #64748b; font-size: 14px; width: 140px;">Event Name:</td>
            <td style="padding: 8px 0; color: #0f172a; font-size: 14px; font-weight: 600;">${payload.eventName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Detected At:</td>
            <td style="padding: 8px 0; color: #0f172a; font-size: 14px;">${timeIST} (IST)</td>
          </tr>
        </table>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${payload.bookingUrl}" target="_blank" rel="noopener noreferrer" style="background-color: #4f46e5; color: #ffffff; text-decoration: none; padding: 14px 28px; font-size: 16px; font-weight: 600; border-radius: 8px; display: inline-block;">
            Open booking page
          </a>
        </div>
        <p style="color: #64748b; font-size: 13px; text-align: center; margin-top: 24px;">
          Open the booking page immediately before allocations sell out.
        </p>
      </div>
    `;

    const telegramText = [
      `🚨 <b>Tickets Available!</b>`,
      `<b>Event:</b> ${payload.eventName}`,
      `<b>Status:</b> Tickets appear to be available`,
      `<b>Detected At:</b> ${timeIST} (IST)`,
      ``,
      `👉 <a href="${payload.bookingUrl}">Open booking page immediately</a>`,
    ].join("\n");

    return { subject, text, html, telegramText };
  }

  if (payload.type === "trouble") {
    const timeIST = formatTimeIST(payload.detectedAt || new Date());
    const subject = `⚠️ Can't monitor ${payload.eventName} reliably`;

    const text = [
      `MONITORING ISSUE DETECTED`,
      `---------------------------------`,
      `Event: ${payload.eventName}`,
      `Target URL: ${payload.url}`,
      `Reason: ${payload.reason}`,
      `Detected At: ${timeIST} (IST)`,
      ``,
      `Recommended Actions:`,
      `1. Open the page in your browser to verify if anti-bot protections or CAPTCHAs are enabled.`,
      `2. Verify whether the ticket page requires an interactive login or waiting queue.`,
      `3. If the page is a JavaScript-only application (JS shell), a browser automation fallback may be required.`,
    ].join("\n");

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 6px; margin-bottom: 20px;">
          <h2 style="color: #92400e; margin: 0 0 8px 0; font-size: 20px;">⚠️ Monitoring Attention Required</h2>
          <p style="color: #b45309; margin: 0; font-size: 15px;">Cannot monitor <strong>${payload.eventName}</strong> reliably.</p>
        </div>
        <p style="color: #334155; font-size: 14px;"><strong>Reason:</strong> ${payload.reason}</p>
        <div style="background-color: #f8fafc; padding: 16px; border-radius: 8px; margin: 20px 0;">
          <h4 style="margin: 0 0 8px 0; color: #1e293b; font-size: 14px;">What you can do:</h4>
          <ul style="margin: 0; padding-left: 20px; color: #475569; font-size: 13px; line-height: 1.6;">
            <li>Visit the target URL directly to inspect whether CAPTCHAs or waiting rooms were deployed.</li>
            <li>If the page is rendered entirely by client-side JavaScript, plain HTTP fetching cannot see dynamic ticket listings.</li>
            <li>Consider checking whether an API endpoint (Network tab) can be monitored instead.</li>
          </ul>
        </div>
        <div style="text-align: center; margin-top: 24px;">
          <a href="${payload.url}" target="_blank" rel="noopener noreferrer" style="background-color: #334155; color: #ffffff; text-decoration: none; padding: 12px 24px; font-size: 14px; font-weight: 500; border-radius: 6px; display: inline-block;">
            Open target page
          </a>
        </div>
      </div>
    `;

    const telegramText = [
      `⚠️ <b>Can't monitor ${payload.eventName} reliably</b>`,
      `<b>Reason:</b> ${payload.reason}`,
      `<b>Target URL:</b> ${payload.url}`,
      `<b>Time:</b> ${timeIST} (IST)`,
    ].join("\n");

    return { subject, text, html, telegramText };
  }

  // Type: "test"
  const timeIST = formatTimeIST(payload.timestamp || new Date());
  const subject = `✅ Ticket Alert test`;

  const text = [
    `TICKET ALERT TEST NOTIFICATION`,
    `---------------------------------`,
    `Your notification pipeline is working correctly!`,
    `Delivered At: ${timeIST} (IST)`,
  ].join("\n");

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
      <div style="background-color: #ecfdf5; border-left: 4px solid #10b981; padding: 16px; border-radius: 6px; margin-bottom: 20px;">
        <h2 style="color: #065f46; margin: 0 0 8px 0; font-size: 20px;">✅ Ticket Alert Test Successful</h2>
        <p style="color: #047857; margin: 0; font-size: 14px;">Your notification channel is connected and ready to receive ticket alerts.</p>
      </div>
      <p style="color: #64748b; font-size: 13px;">Delivered at: ${timeIST} (IST)</p>
    </div>
  `;

  const telegramText = `✅ <b>Ticket Alert Test</b>\nYour Telegram notification channel is working correctly!\nTime: ${timeIST} (IST)`;

  return { subject, text, html, telegramText };
}
