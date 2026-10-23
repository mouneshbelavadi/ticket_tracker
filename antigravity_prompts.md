# Ticket Alert Portal: Antigravity Prompt Pack

Zero-cost, no-credit-card build. Do the steps in order. Paste ONE prompt at a time into Antigravity, wait for it to finish, check the result, then move on.

## The final architecture (what these prompts build)

```text
cron-job.org (free, every 1 min)
        |  GET /api/tick  + secret header
        v
Vercel (Next.js portal + API)  <---->  Supabase free Postgres (monitors, logs)
        |
        |  fetch target ticket page, decide AVAILABLE / UNAVAILABLE / BLOCKED
        v
   Available? --> Resend email (to your Gmail)  +  optional Telegram message
        |
        v
   Mark alert_sent, stop monitoring (you re-arm manually)

Optional backup: GitHub Actions calls /api/tick every ~5 min
```

Why this and not GitHub Actions as the main scheduler: GitHub's schedule has a 5-minute minimum and often runs late. Vercel's free cron only runs once a day. cron-job.org's free plan supports 1-minute calls.

---

## PART 0: One-time setup (you do this by hand, ~30 minutes)

All of these are free. If any of them asks for a credit card, stop and don't continue with that service.

1. **GitHub**: create a repository called `ticket-alert`.
2. **Supabase**: create a free project. Keep two values somewhere safe: the **Project URL** and the **service_role key** (this one is secret. It never goes in the repo or the browser).
3. **Resend**: sign up using the Gmail address where you want the alerts. Create an **API key**. On the free plan, Resend only delivers to your signup email while you use `onboarding@resend.dev`. That is fine for personal use. Limit: 100 emails/day.
4. **Vercel**: sign in with your GitHub account (Hobby plan). Don't create the project yet. That happens in Prompt 9.
5. **cron-job.org**: create a free account. You'll use it in Prompt 9.
6. **Optional, Telegram instant alerts**: in Telegram, talk to `@BotFather`, send `/newbot`, and keep the bot token. Then send any message to your new bot once.
7. **Make three secrets** (long random strings): `SESSION_SECRET`, `CRON_SECRET`, and a strong passphrase for `ADMIN_PASSWORD`. In a terminal, `openssl rand -hex 32` generates a good random string.

---

## PART 1: Master context (paste this FIRST, once)

```text
You are helping me build "Ticket Alert Portal": a personal, single-user web app that watches ticket pages and emails me the moment tickets become available.

HARD RULES
1. Everything must run on free tiers with NO credit card and NO paid service. Never suggest or add a paid service, paid plan, or anything that needs a card. If something seems to need one, stop and ask me.
2. Stack (do not change without asking): Next.js (App Router) + TypeScript + Tailwind on Vercel Hobby; Supabase free Postgres, accessed ONLY from server code with the service-role key via @supabase/supabase-js; Resend for email (from onboarding@resend.dev to my own address only); optional Telegram Bot API as a second alert channel; Vitest for tests; cheerio for HTML parsing; zod for validation. No other runtime dependencies unless you explain why first.
3. Scheduling: Vercel Hobby cron only runs once per day, so do NOT use vercel.json crons. An external free scheduler (cron-job.org) will call GET /api/tick every minute with the header "Authorization: Bearer <CRON_SECRET>". A GitHub Actions workflow is only an optional backup caller.
4. Never hard-code secrets. Read them from env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, NOTIFY_EMAIL, ADMIN_PASSWORD, SESSION_SECRET, CRON_SECRET, APP_URL, and optionally TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID. Never expose secrets to the browser (no NEXT_PUBLIC_ prefix on secrets). .env.local must be git-ignored and .env.example must always be up to date.
5. Be polite to target websites: normal HTTP requests, a 10 second timeout, no proxy rotation, no fingerprint spoofing, and NEVER try to bypass CAPTCHA, login walls, virtual queues, bot protection, or rate limits. If a site blocks us, detect it and report "cannot monitor this site reliably".
6. This is serverless: no local disk, no long-running loops. All state lives in Postgres. Every request must finish quickly (the tick must finish in under ~20 seconds).
7. I am not an experienced coder. After EACH prompt: list the files you created or changed, explain in plain English what they do, tell me exactly what I must do by hand (env vars, SQL to run, etc.), run lint + tests + build and show me the results, then STOP and wait for me. Do not start the next step on your own.
8. Keep the code simple and readable, with short comments. Prefer small files over clever abstractions.

Confirm you understood these rules and ask me any questions BEFORE writing code. Then wait for Prompt 1.
```

---

## Prompt 1: Project scaffold

```text
Prompt 1 - Scaffold.

Create a new Next.js (App Router, TypeScript, Tailwind) project in the current folder. Install only: @supabase/supabase-js, cheerio, zod, and Vitest (dev). Then set up:

- src/lib/env.ts: reads and validates all env vars with zod. Server-only secrets must only be read on the server. Fail with a clear message listing missing variables.
- .env.example listing every variable from the master rules with a one-line comment each (no real values). Make sure .env.local is in .gitignore.
- Folder layout: src/lib/ (env, db, checker, notify, tick, auth, safe-url), src/app/ (pages and API routes), tests/ (with tests/fixtures/), supabase/ (SQL).
- A basic light, clean, mobile-friendly layout with a header "Ticket Alert".
- npm scripts: dev, build, lint, test.
- README.md skeleton with sections: What it is, Architecture, Setup, Environment variables, Deploy, Testing, Free-tier limits (leave details for later).

Run lint, test (a trivial passing test is fine) and build, show me the results, then stop.
```

**Your check:** `npm run dev` opens a page at `localhost:3000`.

---

## Prompt 2: Database

```text
Prompt 2 - Database.

Create supabase/schema.sql that I will paste into the Supabase SQL editor. It must contain:

TABLE monitors:
  id uuid primary key default gen_random_uuid(),
  name text not null,
  url text not null,
  interval_seconds int not null check (interval_seconds in (60,180,300)),
  mode text not null check (mode in ('appears','disappears','changes')),
  keyword text,                -- for appears/disappears; allow several keywords separated by "|"
  sanity_keyword text,         -- text that must be on the page for a read to count as valid (e.g. the event name)
  css_selector text,           -- optional, used by 'changes' mode
  release_at timestamptz,      -- optional expected release time
  status text not null default 'active' check (status in ('active','paused','alerted')),
  last_state text not null default 'unknown' check (last_state in ('unknown','unavailable','available','error','blocked')),
  last_checked_at timestamptz,
  next_check_at timestamptz not null default now(),
  consecutive_failures int not null default 0,
  last_error text,
  last_content_hash text,
  alert_claimed_at timestamptz,
  alert_sent_at timestamptz,
  trouble_notified_at timestamptz,
  created_at timestamptz not null default now()

TABLE check_logs: id bigserial primary key, monitor_id uuid references monitors(id) on delete cascade, checked_at timestamptz default now(), http_status int, state text, latency_ms int, note text. Index on (monitor_id, checked_at desc).

TABLE heartbeat: single row (id int primary key check (id = 1), last_tick_at timestamptz).

TABLE demo_state: single row (id int primary key check (id = 1), available boolean not null default false). Insert the row with available = false.

Turn on Row Level Security for ALL tables and add NO policies (so the public anon key can read nothing; the server's service-role key bypasses RLS).

FUNCTION claim_due_monitors(max_rows int) returns setof monitors: atomically selects active monitors where next_check_at <= now(), ordered by next_check_at, limit max_rows, using FOR UPDATE SKIP LOCKED; sets their next_check_at to now() + interval '60 seconds' as a temporary lease (the tick will write the real next time afterwards); returns those rows. This prevents two overlapping ticks from checking the same monitor twice.

FUNCTION prune_logs(): keep only the latest 200 check_logs per monitor.

Also create src/lib/db.ts (a server-only Supabase client using the service-role key) and src/lib/types.ts (TypeScript types matching the tables).

Tell me exactly how to run the SQL in Supabase and how to confirm the tables exist. Stop afterwards.
```

**Your check:** Supabase Table Editor shows `monitors`, `check_logs`, `heartbeat`, `demo_state`.

---

## Prompt 3: Login and URL safety

```text
Prompt 3 - Security basics.

1) Single-user login:
- /login page with a password field. POST /api/login compares the password with ADMIN_PASSWORD using a constant-time comparison. On success set an HttpOnly, Secure (except in local dev), SameSite=Lax cookie containing a signed token (HMAC-SHA256 with SESSION_SECRET) that expires in 7 days. On failure wait 1 second and return a generic error.
- middleware.ts: redirect to /login for every page, and return 401 for every /api route, unless the path is /login, /api/login, /api/tick (it does its own Bearer CRON_SECRET check), or /demo/*.
- A logout button/route.

2) SSRF protection (src/lib/safe-url.ts): a function that validates a monitor URL before we ever fetch it: only http or https, no username/password in the URL, resolve the hostname with DNS and reject private/loopback/link-local/metadata addresses (127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16, ::1, fc00::/7, fe80::/10). A fetch helper must follow redirects manually (max 3) and re-validate every hop, and refuse responses bigger than 2 MB. Allow localhost only when an env flag ALLOW_LOCALHOST_FOR_DEV=true (never set in production).

3) Vitest tests for the URL validator (good URLs, private IPs, bad schemes, redirect to private IP) and for the cookie signing/verification.

Run lint, tests and build, then stop.
```

---

## Prompt 4: The website checker (the brain)

```text
Prompt 4 - Checker core, with tests. No database or email in this step.

Create src/lib/checker/ with:

1) fetchPage(url): uses the safe fetch helper, 10 second timeout, returns { ok, status, html, finalUrl, latencyMs, error?, blockedReason? }. Mark the result as BLOCKED (never try to work around it) when: status is 401/403/429, or 503 with challenge-style content, or the body contains signs of a CAPTCHA / "verify you are human" / "access denied" / waiting room or queue page. For 429 keep the Retry-After header value if present.

2) Detect "JS shell" pages: if the visible text after stripping scripts/styles is very short (under ~500 characters) set needsBrowserHint = true so the UI can tell me "this page probably loads tickets with JavaScript; a plain check may not work".

3) extractText(html, selector?): cheerio; remove script, style, noscript; if selector given use only that element; collapse whitespace; lowercase.

4) evaluate(monitor, page) returning { state: 'available' | 'unavailable' | 'error' | 'blocked', hash?, note }:
 - mode 'appears': available if ANY of the keywords (split on "|", case-insensitive) is found in the text, otherwise unavailable.
 - mode 'disappears': available ONLY IF status is 200 AND the page is not blocked AND (if sanity_keyword is set) the sanity keyword IS found AND none of the keywords are found. If the sanity keyword is missing, return state 'error' with note "page did not look like the real event page", so a broken page or error page can never trigger a false alert.
 - mode 'changes': compute a SHA-256 hash of extractText. If monitor.last_content_hash is null this is the baseline (state 'unavailable'). If the hash differs it is 'available'. Always return the new hash.
 - blocked pages -> 'blocked'; network errors/timeouts/5xx -> 'error'.

5) Vitest tests using small HTML fixtures in tests/fixtures/: in-stock page, sold-out page, sold-out text disappeared, CAPTCHA page, JS shell page, error page. Cover every mode and every state.

Run lint, tests and build, then stop.
```

---

## Prompt 5: Notifications

```text
Prompt 5 - Notifications.

Create src/lib/notify/:

1) Email via the Resend REST API using plain fetch (POST https://api.resend.com/emails with Authorization: Bearer RESEND_API_KEY). From: "Ticket Alert <onboarding@resend.dev>". To: NOTIFY_EMAIL only (the recipient is never taken from user input). Three email types, each with a plain-text part and a simple HTML part with one big "Open booking page" button:
 - Availability alert: subject "🚨 Tickets Available — {event name}", body with event name, status "Tickets appear to be available", booking URL, detected-at time shown in IST (Asia/Kolkata), and the line "Open the booking page immediately."
 - Trouble alert: subject "⚠️ Can't monitor {event name} reliably", with the reason (blocked, repeated errors, page looks like a JS shell) and what I can do.
 - Test alert: subject "✅ Ticket Alert test".

2) Telegram (optional): if TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are set, also send the same message through the Bot API sendMessage method. If they are not set, skip silently.

3) notifyAll(message) sends to every configured channel, never throws, and returns the result per channel { channel, ok, error? }.

4) POST /api/test-notification (login required) that sends the test alert and returns the per-channel results.

5) scripts/get-telegram-chat-id.ts: a small script that calls getUpdates with my bot token and prints my chat id (I will have messaged the bot once).

6) Vitest tests with fetch mocked: success, Resend error, Telegram skipped when not configured.

Run lint, tests and build. Tell me how to try the test endpoint locally, then stop.
```

**Your check:** the test email arrives in your Gmail (check Spam the first time).

---

## Prompt 6: The tick engine (core logic)

```text
Prompt 6 - Tick engine.

Create GET /api/tick and src/lib/tick/. Set export const maxDuration to the highest value the Vercel Hobby plan allows, but design the code to finish in under ~20 seconds.

Flow for each call:
1. Require header "Authorization: Bearer <CRON_SECRET>" (constant-time compare) else 401. Support ?dry=1 (do everything except send notifications).
2. Upsert heartbeat.last_tick_at = now().
3. Call the claim_due_monitors(20) database function to get due monitors.
4. Check them with a concurrency limit of 5, using Promise.allSettled, with a global 20-second time budget; each monitor in its own try/catch so one failure never stops the others. Use fetchPage + evaluate from Prompt 4.
5. For each result: insert a check_logs row; update last_state, last_checked_at, last_error, last_content_hash; set next_check_at = now + effective interval.

Effective interval (adaptive "release mode"):
 - Start from the monitor's interval_seconds (60, 180 or 300).
 - If release_at is set: more than 30 min before release -> use the user interval; 30 to 10 min before -> at most 120 s; from 10 min before until 30 min after release -> 60 s; after that -> the user interval. Always use the smaller of the two values.

Alert state machine (duplicate protection, this is critical):
 - When the state is 'available' and status is 'active' and alert_sent_at is null: first CLAIM the alert with a conditional update (set alert_claimed_at = now() WHERE id = ? AND alert_sent_at IS NULL AND (alert_claimed_at IS NULL OR alert_claimed_at < now() - interval '2 minutes') RETURNING). Only if the claim returned a row, call notifyAll.
 - If at least one channel succeeded: set status = 'alerted' and alert_sent_at = now() (monitoring stops; I re-arm manually). If ALL channels failed: clear alert_claimed_at so the next tick retries.
 - Never send a second alert for the same monitor while alert_sent_at is set.

Failure handling:
 - 'error' or 'blocked' increments consecutive_failures; success resets it to 0 and clears trouble_notified_at.
 - Back off: after 3 failures wait min(interval * 2^(failures-1), 15 minutes) before the next check (respect Retry-After on 429).
 - After 5 consecutive failures (or when 'blocked' is seen twice in a row) send ONE trouble alert (set trouble_notified_at) and keep checking at the backed-off rate. Do not ever try to bypass blocking.

Also: about 1 in 50 ticks call prune_logs(). Return JSON summary: { checked, available, errors, skipped, durationMs }.

Write Vitest tests for the state machine with the database and notifier mocked: single alert only, claim race (two ticks at once), retry after notification failure, backoff, release-mode intervals, trouble alert sent once.

Run lint, tests and build, then stop.
```

---

## Prompt 7: The portal (dashboard + forms)

```text
Prompt 7 - Portal UI. Light, clean, mobile-first design, plain English labels.

1) Dashboard "/":
 - A health strip at the top: "Scheduler last ran X seconds ago" from heartbeat.last_tick_at. Show it red with "Scheduler may be down" if it is older than 3 minutes.
 - One card per monitor: name, status badge (Monitoring / Paused / Alert sent), last state (Not available / AVAILABLE / Error / Blocked), last checked (relative time), next check, interval, release time with a countdown, last error text if any, and a warning if the JS-shell hint was detected.
 - Buttons: Pause/Resume, Run check now (runs a single check immediately and shows the result, does not break duplicate-alert rules), Edit, Delete (with confirmation), and Re-arm for 'alerted' monitors (sets status active, alert_sent_at/alert_claimed_at null, last_state 'unknown').
 - An "Add new monitor" button and a "Send test notification" button.

2) Add/Edit form (zod-validated on the server): Event name; Ticket page URL (validated with the safe-url rules); Check frequency radio (1 / 3 / 5 minutes); Detection mode radio with a short explanation each: "Alert when this text appears" (e.g. Book Now), "Alert when this text disappears" (e.g. Sold Out. Recommended, more reliable), "Alert when the page changes"; Keyword(s) (separate with |); Page check keyword (optional, text that must be on the real page, e.g. the event name); CSS selector (only for 'changes'); optional release date and time entered in IST and stored as UTC. Show "Alerts are sent to {NOTIFY_EMAIL}" as read-only text (the recipient is not editable).

3) Monitor detail page /monitors/[id] with the last 50 checks (time, HTTP status, state, latency, note).

4) API routes for create/update/delete/pause/resume/rearm/run-now, all protected by the login middleware, all validating input.

Make it work well on a phone screen. Run lint, tests, build, and show me how to try it locally. Stop afterwards.
```

---

## Prompt 8: Test tools (so you never wait for a real release)

```text
Prompt 8 - Testing tools.

1) Public demo page /demo/tickets that shows either a big "SOLD OUT" or "Book Now - Tickets Available" depending on demo_state.available in the database. It must include the text "Demo Concert" so it can be used as a sanity keyword.
2) A logged-in toggle button on the dashboard (POST /api/demo/toggle) that flips demo_state.available.
3) Write docs/TEST_PLAN.md with these exact checks and the expected result for each:
 a. Add a monitor for <APP_URL>/demo/tickets, interval 1 minute, mode "appears", keyword "Tickets Available". Toggle the demo to available. A single email arrives within ~1-2 minutes. Wait 5 more minutes: no second email. Re-arm, toggle off then on: a new single email arrives.
 b. Same page, mode "disappears", keyword "SOLD OUT", sanity keyword "Demo Concert": toggling to available alerts; but pointing the monitor at a URL that returns an error page must NOT alert.
 c. Mode "changes": toggling the demo triggers one alert.
 d. Unreachable URL: after 5 failures exactly one trouble email arrives.
 e. Paused monitor is never checked. Deleted monitor stops.
 f. Calling /api/tick without the secret returns 401; opening any page while logged out redirects to /login.
 g. Release mode: set release_at 12 minutes in the future, interval 5 minutes: check frequency becomes 1 minute at T-10.
4) A "Run self-test" npm script that exercises the tick against a local mock server for the above state-machine cases, if feasible without extra dependencies.

Run lint, tests and build, then stop.
```

---

## Prompt 9: Deploy and connect the scheduler

```text
Prompt 9 - Deployment guide and security check.

1) Write DEPLOY.md with beginner-level, click-by-click steps for:
 - Pushing the project to my GitHub repo `ticket-alert` (confirm .env.local is NOT committed).
 - Importing it in Vercel (Hobby), setting every env var from .env.example (APP_URL = the .vercel.app URL after the first deploy, then redeploy), and confirming the deploy.
 - Running supabase/schema.sql in Supabase if not already done.
 - Creating the cron-job.org job: URL https://<APP_URL>/api/tick, method GET, schedule every 1 minute, custom header "Authorization: Bearer <CRON_SECRET>", enable the failure notification email, and use the "test run" button to confirm a 200 response.
 - Verifying on the dashboard that "Scheduler last ran" updates every minute.

2) Run a security checklist and report pass/fail: no secrets in git history or source (search for key patterns); SUPABASE_SERVICE_ROLE_KEY is only used in server code; RLS enabled on all tables; /api/tick returns 401 without the bearer token; every other page and API route requires login; the monitor URL validator blocks private IPs; the Resend recipient is fixed to NOTIFY_EMAIL.

3) Fill in the README "Free-tier limits" section with this: Resend free = 100 emails/day and 3,000/month and only delivers to the signup email on onboarding@resend.dev; Vercel Hobby = personal, non-commercial use; Supabase free projects pause after a week of inactivity (the per-minute tick keeps ours active, but confirm in the Supabase dashboard); cron-job.org free = 1-minute minimum and a 30-second request timeout; GitHub Actions public repos are free, private repos have a monthly minute allowance.

Do not deploy anything yourself. Give me the checklist and stop.
```

---

## Prompt 10 (optional): Backup scheduler on GitHub Actions

```text
Prompt 10 - Backup heartbeat.

Create .github/workflows/heartbeat.yml that calls my /api/tick endpoint as a backup in case cron-job.org is down:
- schedule: cron '2-59/5 * * * *' (avoid the top of the hour, which is busiest) and workflow_dispatch.
- one job, timeout-minutes: 2, concurrency group so runs never overlap.
- one step: curl -fsS --max-time 25 -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" "${{ secrets.APP_URL }}/api/tick"
- Use ONLY GitHub Secrets (CRON_SECRET and APP_URL); nothing sensitive in the file.

Explain in plain English: (a) why it is only a backup (GitHub may run it late or skip runs, and the minimum interval is 5 minutes); (b) that GitHub disables scheduled workflows after 60 days without repository activity and how I re-enable it; (c) that on a PRIVATE repo this would use roughly 8,600 billed minutes a month against a 2,000-minute free allowance, so the repo must be PUBLIC for this to stay free (this is safe because the repo contains no secrets or monitor data). If I prefer to keep the repo private, tell me to skip this prompt.

Do not add any more features. Stop afterwards.
```

---

## Later, only if a site needs it (do NOT do now)

Some ticket sites load availability with JavaScript, so a plain page fetch can't see it. Two honest options, in this order:
1. Look for the site's own data endpoint (browser developer tools, Network tab). A plain JSON call is far more reliable and lighter than a browser.
2. If that is not possible, a Playwright worker on GitHub Actions (public repo, 5-minute, best-effort). Ask me to design this as a separate step once you know which site needs it.

If a site shows a CAPTCHA, a queue, or blocks the checks, the portal reports "cannot monitor reliably". Don't try to get around those protections.

---

## Final "ready to trust it" checklist

- [ ] Test email arrived in Gmail (and not in Spam)
- [ ] Demo test plan a to g all pass
- [ ] Dashboard shows "Scheduler last ran" within the last minute
- [ ] You have a monitor for the real event, with "disappears" mode and a sanity keyword if possible
- [ ] Telegram alert works on your phone (recommended: it's faster to notice than email)
- [ ] You re-armed monitors after test alerts
