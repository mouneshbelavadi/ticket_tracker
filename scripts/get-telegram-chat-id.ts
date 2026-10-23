/**
 * Helper script to retrieve your Telegram Chat ID.
 *
 * Usage:
 *   npx tsx scripts/get-telegram-chat-id.ts
 * Or:
 *   npx tsx scripts/get-telegram-chat-id.ts <YOUR_BOT_TOKEN>
 */

async function main() {
  const token = process.argv[2] || process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    console.error("\n[Error] Telegram Bot Token not found!");
    console.error("Please supply your token as an argument or set TELEGRAM_BOT_TOKEN in your environment:\n");
    console.error("  npx tsx scripts/get-telegram-chat-id.ts 123456789:ABCdefGhIJKlmNoPQRstuv\n");
    process.exit(1);
  }

  console.log("\nConnecting to Telegram Bot API...");
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
    const data = await res.json();

    if (!data.ok) {
      console.error(`Telegram API Error: ${data.description}`);
      process.exit(1);
    }

    const updates = data.result;
    if (!updates || updates.length === 0) {
      console.log("\n[Notice] No messages found yet!");
      console.log("Please open Telegram, search for your bot, click START (or send 'hello'), and re-run this script.\n");
      return;
    }

    console.log(`\nFound ${updates.length} update(s):\n`);
    const seenChats = new Set<string>();

    for (const update of updates) {
      const msg = update.message || update.channel_post;
      if (msg && msg.chat) {
        const chatId = String(msg.chat.id);
        if (!seenChats.has(chatId)) {
          seenChats.add(chatId);
          console.log(`-----------------------------------------------`);
          console.log(`Chat ID:    ${chatId}`);
          console.log(`From:       ${msg.chat.first_name || ""} ${msg.chat.last_name || ""} (@${msg.chat.username || "no_username"})`);
          console.log(`Type:       ${msg.chat.type}`);
          console.log(`-----------------------------------------------`);
        }
      }
    }

    console.log(`\nTo activate Telegram alerts, copy your Chat ID above into your .env.local file:`);
    console.log(`TELEGRAM_BOT_TOKEN=${token}`);
    console.log(`TELEGRAM_CHAT_ID=<YOUR_CHAT_ID>\n`);
  } catch (err: unknown) {
    console.error("Failed to fetch updates:", err);
    process.exit(1);
  }
}

main();
