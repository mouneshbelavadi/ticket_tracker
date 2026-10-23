# Ticket Alert Portal: End-to-End Verification Test Plan

This test plan provides comprehensive verification procedures using the built-in testing facility (`/demo/tickets` and the dashboard toggle button) so you can verify the entire notification and state machine pipeline without waiting for real ticket releases.

---

## Prerequisites

1. Set up `.env.local` with valid `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `NOTIFY_EMAIL`, `ADMIN_PASSWORD`, `SESSION_SECRET`, and `CRON_SECRET`.
2. Run database migration in Supabase: `supabase/schema.sql`.
3. Start local development server: `npm run dev`.
4. Ensure `ALLOW_LOCALHOST_FOR_DEV=true` in `.env.local` to allow fetching localhost endpoints.

---

## Test Cases & Procedures

### Test Case A: "Appears" Mode & Duplicate Alert Suppression
1. **Setup:**
   - On the dashboard, ensure the demo is set to **SOLD OUT** (toggle if needed).
   - Click **+ Add New Monitor**.
   - Event Name: `Demo Concert - Appears Test`
   - URL: `http://localhost:3000/demo/tickets` (or your `<APP_URL>/demo/tickets`)
   - Check Frequency: `1 Minute`
   - Detection Mode: `Alert when this text appears`
   - Keyword: `Tickets Available`
   - Save monitor.
2. **Action:**
   - Click **Toggle Demo** on the dashboard (state flips to `TICKETS AVAILABLE`).
   - Trigger the scheduler (either wait for cron or run `GET /api/tick` with `Authorization: Bearer <CRON_SECRET>`).
3. **Expected Result:**
   - A single email arrives in your Gmail within ~1–2 minutes with subject: `🚨 Tickets Available — Demo Concert - Appears Test`.
   - On the dashboard, monitor status changes to `🚨 Alert Sent`.
4. **Duplicate Prevention Check:**
   - Wait 5 minutes or trigger multiple ticks.
   - **Expected:** No second email arrives while the monitor is in `alerted` status.
5. **Re-arm Check:**
   - Click **🔄 Re-Arm Monitor** on the card.
   - Toggle demo to `SOLD OUT`, then back to `TICKETS AVAILABLE`.
   - Trigger the tick.
   - **Expected:** Exactly one new alert email arrives.

---

### Test Case B: "Disappears" Mode & Sanity Keyword Error Guard
1. **Setup:**
   - Toggle demo back to `SOLD OUT`.
   - Create a monitor:
     - Event Name: `Demo Concert - Disappears Test`
     - URL: `http://localhost:3000/demo/tickets`
     - Frequency: `1 Minute`
     - Mode: `Alert when this text disappears`
     - Keyword: `SOLD OUT`
     - Sanity Keyword: `Demo Concert`
2. **Action 1 (Normal Disappearance):**
   - Toggle demo to `AVAILABLE`.
   - Trigger tick.
   - **Expected Result:** Alert arrives because `SOLD OUT` disappeared while `Demo Concert` was verified present on the page.
3. **Action 2 (Sanity Guard Protection):**
   - Edit the monitor's URL to point to a non-existent or error page: `http://localhost:3000/demo/tickets-404-broken`.
   - Trigger tick.
   - **Expected Result:** The monitor records state `error` with note: `"page did not look like the real event page"`. **NO false alert is ever sent!**

---

### Test Case C: "Changes" Mode Content Hashing
1. **Setup:**
   - Toggle demo to `SOLD OUT`.
   - Create a monitor:
     - Event Name: `Demo Concert - Changes Test`
     - URL: `http://localhost:3000/demo/tickets`
     - Mode: `Alert when the page changes`
     - Frequency: `1 Minute`
2. **First Run (Baseline):**
   - Trigger tick.
   - **Expected Result:** State recorded as `unavailable` with note: `"Baseline content hash established"`. No alert sent.
3. **Second Run (Change detected):**
   - Toggle demo to `AVAILABLE`.
   - Trigger tick.
   - **Expected Result:** State changes to `available` with note: `"Monitored content hash has changed from baseline"`. Alert email arrives!

---

### Test Case D: Unreachable URL & Trouble Alert Backoff
1. **Setup:**
   - Create a monitor pointing to an invalid/unreachable host:
     - Event Name: `Unreachable Site Test`
     - URL: `https://this-domain-does-not-exist-12345.com`
     - Mode: `appears`, Keyword: `Buy`
2. **Action:**
   - Run tick 5 times.
3. **Expected Result:**
   - Checks 1 to 4 fail with `error` state. Consecutive failures increment `1 -> 2 -> 3 -> 4`.
   - On the 5th consecutive failure, exactly **one** trouble email arrives:
     Subject: `⚠️ Can't monitor Unreachable Site Test reliably`
   - Check frequency automatically backs off exponentially up to 15 minutes.
   - Consecutive runs beyond 5 do not spam duplicate trouble emails.

---

### Test Case E: Paused & Deleted Monitors
1. **Pause Check:**
   - Click **⏸ Pause** on any active monitor.
   - Status badge shows `Paused`.
   - Trigger tick.
   - **Expected Result:** Monitor is excluded by `claim_due_monitors` and is never fetched while paused.
2. **Delete Check:**
   - Click **Delete** and confirm.
   - **Expected Result:** Monitor and its historical check logs are deleted from database.

---

### Test Case F: Endpoint Authentication & Middleware Security
1. **Scheduler Secret Protection:**
   - Execute GET request to `/api/tick` without header:
     ```bash
     curl -i http://localhost:3000/api/tick
     ```
     **Expected Result:** HTTP 401 Unauthorized.
   - Execute with incorrect bearer token:
     ```bash
     curl -i -H "Authorization: Bearer wrongsecret" http://localhost:3000/api/tick
     ```
     **Expected Result:** HTTP 401 Unauthorized.
2. **Page Protection:**
   - In a private/incognito browser window, open `http://localhost:3000/`.
   - **Expected Result:** Instantly redirected to `/login`.
   - Open `http://localhost:3000/demo/tickets`.
   - **Expected Result:** Loads publicly without redirection (public demo endpoint).

---

### Test Case G: Adaptive Release Mode
1. **Setup:**
   - Create a monitor:
     - Event Name: `Drop Countdown Test`
     - URL: `http://localhost:3000/demo/tickets`
     - Interval: `5 Minutes` (300 seconds)
     - Release Time: Set to **12 minutes in the future** (IST).
2. **Action & Observation:**
   - Check at T-12: interval is clamped to at most 120s.
   - Check as time reaches T-10m: interval automatically tightens to **60 seconds**.
   - After drop (T+30m): interval automatically reverts to 5 minutes.
