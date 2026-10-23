import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();

    const { data, error } = await db
      .from("monitors")
      .update({ status: "paused" })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ monitor: data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error pausing monitor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
