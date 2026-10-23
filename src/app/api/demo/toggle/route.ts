import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  try {
    const db = getDb();
    const { data } = await db
      .from("demo_state")
      .select("available")
      .eq("id", 1)
      .maybeSingle();

    return NextResponse.json({ available: data?.available ?? false });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error fetching demo state";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST() {
  try {
    const db = getDb();

    // 1. Fetch current status
    const { data } = await db
      .from("demo_state")
      .select("available")
      .eq("id", 1)
      .maybeSingle();

    const currentState = data?.available ?? false;
    const nextState = !currentState;

    // 2. Flip state
    const { data: updated, error } = await db
      .from("demo_state")
      .upsert({ id: 1, available: nextState })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ available: updated.available });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error toggling demo state";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
