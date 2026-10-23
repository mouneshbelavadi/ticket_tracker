import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { monitorFormSchema } from "@/lib/monitors/schema";
import { validateSafeUrl } from "@/lib/safe-url";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();

    const { data: monitor, error: monError } = await db
      .from("monitors")
      .select("*")
      .eq("id", id)
      .single();

    if (monError || !monitor) {
      return NextResponse.json({ error: "Monitor not found" }, { status: 404 });
    }

    // Fetch last 50 check logs for this monitor
    const { data: logs, error: logsError } = await db
      .from("check_logs")
      .select("*")
      .eq("monitor_id", id)
      .order("checked_at", { ascending: false })
      .limit(50);

    if (logsError) {
      return NextResponse.json({ error: logsError.message }, { status: 500 });
    }

    return NextResponse.json({ monitor, logs: logs || [] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error retrieving monitor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    // Validate safe URL
    const env = getEnv();
    const urlCheck = await validateSafeUrl(url, env.ALLOW_LOCALHOST_FOR_DEV);
    if (!urlCheck.valid) {
      return NextResponse.json({ error: `URL Safety Error: ${urlCheck.error}` }, { status: 400 });
    }

    const db = getDb();
    const { data, error } = await db
      .from("monitors")
      .update({
        name,
        url,
        interval_seconds,
        mode,
        keyword: keyword?.trim() || null,
        sanity_keyword: sanity_keyword?.trim() || null,
        css_selector: css_selector?.trim() || null,
        release_at: release_at || null,
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ monitor: data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update monitor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();

    const { error } = await db.from("monitors").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to delete monitor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
