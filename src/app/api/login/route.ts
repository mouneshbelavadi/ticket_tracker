import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { constantTimeCompare, signSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const password = typeof body.password === "string" ? body.password : "";

    const env = getEnv();
    const isValid = constantTimeCompare(password, env.ADMIN_PASSWORD);

    if (!isValid) {
      // Intentional 1 second delay to mitigate brute force attacks
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }

    const token = await signSessionToken(env.SESSION_SECRET);

    const response = NextResponse.json({ ok: true });
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
      path: "/",
    });

    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
