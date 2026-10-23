# Ticket Alert Portal

A personal, single-user web application that automatically watches ticket pages and immediately emails (and Telegram-alerts) you the instant tickets become available.

---

## What It Is

Ticket Alert Portal is a zero-cost, serverless monitor built to track ticket drops, sold-out events, and cancellations. It periodically inspects target event pages using polite, standard HTTP requests, analyzes HTML content for keyword appearance or disappearance, and reliably dispatches alerts directly to your inbox.

- **Zero cost / No credit card required**: Runs completely on free tiers (Vercel Hobby, Supabase Free Postgres, Resend Free, cron-job.org).
- **Duplicate alert prevention**: Atomic database leases prevent race conditions and duplicate emails.
- **Adaptive release mode**: Automatically increases check frequency as ticket drop times approach.
- **SSRF and polite fetching**: Strict URL validation, DNS verification, and graceful handling of anti-bot protections.

---

## Architecture

```text
cron-job.org (free, every 1 min)
        |  GET /api/tick + Bearer CRON_SECRET
        v
Vercel (Next.js App Router + API)  <---->  Supabase Free Postgres (monitors, logs, state)
        |
        |  Polite HTTP fetch & Cheerio evaluation (AVAILABLE / UNAVAILABLE / BLOCKED)
        v
   Available? --> Resend Email (to your Gmail) + optional Telegram Bot alert
        |
        v
   Mark alert_sent, stop monitoring (manual re-arm from dashboard)
```

---

## Setup

1. **Clone the repository and install dependencies:**
   ```bash
   git clone <your-repo-url>
   cd ticketfree
   npm install
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env.local
   ```
   Fill in your Supabase credentials, Resend API key, admin password, and secrets.

3. **Database initialization:**
   Paste `supabase/schema.sql` into your Supabase project's SQL editor (detailed in Prompt 2).

4. **Run the local development server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Environment Variables

All variables are validated at startup using Zod in `src/lib/env.ts`.

| Variable | Description | Required |
|---|---|---|
| `SUPABASE_URL` | Supabase project URL | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role secret key (server-only) | Yes |
| `RESEND_API_KEY` | Resend API key (`re_...`) | Yes |
| `NOTIFY_EMAIL` | Destination Gmail address for alerts | Yes |
| `ADMIN_PASSWORD` | Strong password to access portal dashboard | Yes |
| `SESSION_SECRET` | 32+ char secret for HMAC session signing | Yes |
| `CRON_SECRET` | Bearer token required for `/api/tick` | Yes |
| `APP_URL` | Base public URL of the application | Yes |
| `TELEGRAM_BOT_TOKEN` | Optional Telegram Bot token | No |
| `TELEGRAM_CHAT_ID` | Optional Telegram Chat ID | No |
| `ALLOW_LOCALHOST_FOR_DEV` | Enable localhost fetches in local dev (`true`/`false`) | No |

---

## Deploy

- **Vercel Hobby:** Deploy by connecting your GitHub repository.
- **Environment variables:** Add all variables from `.env.example` in Vercel Project Settings.
- **Scheduler:** Set up a free 1-minute recurring GET check on [cron-job.org](https://cron-job.org) targeting `https://<YOUR_APP_URL>/api/tick` with `Authorization: Bearer <CRON_SECRET>`.

*(Complete click-by-click instructions will be expanded in Prompt 9)*

---

## Testing

Run unit and integration tests using Vitest:

```bash
npm run test
```

Linting and build verification:

```bash
npm run lint
npm run build
```

---

## Free-Tier Limits

- **Resend Free:** 100 emails/day and 3,000/month, and only delivers to the signup email on `onboarding@resend.dev`.
- **Vercel Hobby:** Personal, non-commercial use.
- **Supabase Free:** Free projects pause after a week of inactivity (the per-minute tick keeps ours active, but confirm in the Supabase dashboard).
- **cron-job.org Free:** 1-minute minimum check interval and a 30-second request timeout.
- **GitHub Actions:** Public repositories are 100% free; private repositories have a monthly minute allowance (2,000 minutes/month).
