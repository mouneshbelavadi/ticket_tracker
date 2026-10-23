import { describe, it, expect } from "vitest";
import { getDb } from "@/lib/db";

describe("Database Client (src/lib/db.ts)", () => {
  it("prevents execution in browser environment", () => {
    (globalThis as unknown as { window: unknown }).window = {};

    expect(() => getDb()).toThrowError(
      /Supabase service-role client cannot be initialized in the browser/
    );

    delete (globalThis as unknown as { window?: unknown }).window;
  });
});
