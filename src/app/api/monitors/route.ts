import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { monitorFormSchema } from "@/lib/monitors/schema";
import { validateSafeUrl } from "@/lib/safe-url";

export async function GET() {
  try {
    const db = getDb();

    // Fetch all monitors
    const { data: monitors, error: monError } = await db
      .from("monitors")
      .select("*")
      .order("created_at", { ascending: false });

    if (monError) {
      return NextResponse.json({ error: monError.message }, { status: 500 });
    }

    // Fetch heartbeat
    const { data: heartbeatRows } = await db
      .from("heartbeat")
      .select("last_tick_at")
      .eq("id", 1)
      .maybeSingle();

    const env = getEnv();

    return NextResponse.json({
      monitors: monitors || [],
      heartbeat: heartbeatRows?.last_tick_at || null,
      notifyEmail: env.NOTIFY_EMAIL,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Database query failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const parseResult = monitorFormSchema.safeParse(body);

    if (!parseResult.success) {
      const errorMsg = parseResult.error.issues.map((i) => i.message).join(", ");
      return NextResponse.json({ error: errorMsg }, { status: 400 });
    }

    const {
      name,
      url,
      interval_seconds,
      mode,
      keyword,
      sanity_keyword,
      css_selector,
      release_at,
    } = parseResult.data;

    // Validate safe URL (SSRF guard)
    const env = getEnv();
    const urlCheck = await validateSafeUrl(url, env.ALLOW_LOCALHOST_FOR_DEV);
    if (!urlCheck.valid) {
      return NextResponse.json({ error: `URL Safety Error: ${urlCheck.error}` }, { status: 400 });
    }

    const db = getDb();
    const { data, error } = await db
      .from("monitors")
      .insert({
        name,
        url,
        interval_seconds,
        mode,
        keyword: keyword?.trim() || null,
        sanity_keyword: sanity_keyword?.trim() || null,
        css_selector: css_selector?.trim() || null,
        release_at: release_at || null,
        status: "active",
        last_state: "unknown",
        next_check_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ monitor: data }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create monitor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
