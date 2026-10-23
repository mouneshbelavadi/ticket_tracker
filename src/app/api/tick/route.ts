import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { constantTimeCompare } from "@/lib/auth/session";
import { runTick } from "@/lib/tick/engine";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const expectedHeader = `Bearer ${getEnv().CRON_SECRET}`;

    // Constant-time comparison to prevent timing side-channel attacks on the cron secret
    if (!constantTimeCompare(authHeader, expectedHeader)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const isDryRun = searchParams.get("dry") === "1";

    const summary = await runTick({ isDryRun });

    return NextResponse.json(summary);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal tick execution failure";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
