# Ticket Alert Portal: Complete Deployment Guide

This step-by-step guide is written in plain English for beginners. It will guide you through deploying your personal Ticket Alert Portal on 100% free tiers with **no credit card required**.

---

## Pre-Deployment Checklist

Ensure you have your free accounts ready:
- [x] **GitHub Account** (free)
- [x] **Supabase Account** (free project)
- [x] **Resend Account** (free plan, signup email verified)
- [x] **Vercel Account** (Hobby plan)
- [x] **cron-job.org Account** (free plan)

---

## Step 1: Run Database Migration in Supabase

1. Open your [Supabase Dashboard](https://supabase.com/dashboard) and select your project.
2. In the left-hand navigation sidebar, click on **SQL Editor** (icon with `>_`).
3. Click **New query**.
4. Open the file [`supabase/schema.sql`](file:///c:/Users/moune/OneDrive/Desktop/ticketfree/supabase/schema.sql) from this project, copy its entire contents, and paste it into the Supabase SQL editor.
5. Click **Run** (or press `Ctrl + Enter`).
6. **Verify Tables:**
   - In the left sidebar, click **Table Editor**.
   - Confirm you see four tables:
     - `monitors`
     - `check_logs`
     - `heartbeat` (with 1 initial row)
     - `demo_state` (with 1 initial row where `available = false`)
7. **Copy Your Supabase Keys:**
   - Go to **Project Settings** (gear icon at bottom left) -> **API**.
   - Copy the **Project URL** (e.g., `https://xyzproject.supabase.co`).
   - Under **Project API keys**, find `service_role` (click "Reveal secret key") and copy it. Keep this key completely secret.

---

## Step 2: Push Your Project to GitHub

1. Open your terminal in the `ticketfree` folder.
2. Confirm that `.env.local` is **NOT** tracked by git:
   ```bash
   git status
   ```
   *(You should see `.env.example`, but `.env.local` must NEVER appear in the list).*

3. Initialize your commits and push to your new GitHub repository:
   ```bash
   git add .
   git commit -m "Initial commit: Ticket Alert Portal complete build"
   git branch -M main
   git remote add origin https://github.com/<YOUR_GITHUB_USERNAME>/ticket-alert.git
   git push -u origin main
   ```

---

## Step 3: Deploy on Vercel (Hobby)

1. Sign in to [Vercel](https://vercel.com) using your GitHub account.
2. Click **Add New...** -> **Project**.
3. Locate your `ticket-alert` repository and click **Import**.
4. In the configuration screen under **Environment Variables**, add the following variables:

| Key | Value / Source |
|---|---|
| `SUPABASE_URL` | Your Supabase Project URL (`https://xyz.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Your secret `service_role` key from Supabase |
| `RESEND_API_KEY` | Your Resend API key (`re_...`) |
| `NOTIFY_EMAIL` | The Gmail address you used to register on Resend |
| `ADMIN_PASSWORD` | A strong password to log into your portal dashboard |
| `SESSION_SECRET` | A random 32+ character string (e.g. from `openssl rand -hex 32`) |
| `CRON_SECRET` | A random 16+ character bearer token for the scheduler |
| `APP_URL` | Temporarily enter `http://localhost:3000` (we will update this in step 6) |
| `TELEGRAM_BOT_TOKEN` | *(Optional)* Telegram bot token from `@BotFather` |
| `TELEGRAM_CHAT_ID` | *(Optional)* Your Telegram chat ID |
| `ALLOW_LOCALHOST_FOR_DEV` | `false` |

5. Click **Deploy**. Wait ~1–2 minutes for the build to finish.
6. Once deployed, note your production URL (e.g., `https://ticket-alert-xxxx.vercel.app`).
7. Go to **Settings** -> **Environment Variables** in Vercel:
   - Edit `APP_URL` and change its value to your live URL: `https://ticket-alert-xxxx.vercel.app`.
   - Go to **Deployments** tab -> click the three dots on the latest deployment -> click **Redeploy** to pick up the updated `APP_URL`.

---

## Step 4: Configure cron-job.org (1-Minute Scheduler)

Because Vercel Hobby only offers 1 cron trigger per day, we use the free external scheduler [cron-job.org](https://cron-job.org) to ping `/api/tick` every 60 seconds:

1. Sign in to your [cron-job.org](https://cron-job.org) account.
2. Click **Create Cronjob** (top right).
3. Fill in the job configuration:
   - **Title:** `Ticket Alert Tick`
   - **URL:** `https://<YOUR_APP_URL>.vercel.app/api/tick`
   - **Execution Schedule:** Choose **User-defined** -> **Every 1 minute** (Interval: 1 minute).
   - **Request Method:** `GET`
4. In the **Headers** section:
   - Click **Add Header**.
   - Header Name: `Authorization`
   - Header Value: `Bearer <YOUR_CRON_SECRET>` *(replace with the exact CRON_SECRET configured in Vercel)*
5. In the **Notifications** tab:
   - Enable **Notify on failure** so you receive an email if the scheduler ever fails.
6. Click the **Test run** button at the bottom:
   - You should see an HTTP status **200 OK** with a JSON response: `{"checked":0,"available":0,"errors":0,"skipped":0,"durationMs":...}`.
7. Click **Create**.

---

## Step 5: Live Verification & Testing

1. Open your live app URL: `https://<YOUR_APP_URL>.vercel.app`.
2. You will be redirected to `/login`. Enter your `ADMIN_PASSWORD` to log in.
3. **Verify Scheduler Health:**
   - Look at the top green strip on your dashboard.
   - Confirm it displays: **"Scheduler healthy: last ran X seconds ago"**.
   - Wait 1 minute and verify that the relative counter refreshes automatically.
4. **Send a Test Alert:**
   - Click **Send Test Alert** at the top right.
   - Check your Gmail inbox (and Spam folder the first time).
   - Confirm you received the email with subject: `✅ Ticket Alert test`.
5. **Run the Interactive Demo:**
   - Follow the instructions in [`docs/TEST_PLAN.md`](file:///c:/Users/moune/OneDrive/Desktop/ticketfree/docs/TEST_PLAN.md) using the built-in `/demo/tickets` page.
