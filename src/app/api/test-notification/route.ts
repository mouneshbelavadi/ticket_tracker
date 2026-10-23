import { NextResponse } from "next/server";
import { notifyAll } from "@/lib/notify";

export async function POST() {
  try {
    const results = await notifyAll({
      type: "test",
      timestamp: new Date(),
    });

    const anySuccess = results.some((r) => r.ok);

    return NextResponse.json(
      {
        ok: anySuccess,
        results,
      },
      { status: anySuccess ? 200 : 502 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
