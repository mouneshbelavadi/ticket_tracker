import { describe, it, expect } from "vitest";
import { monitorFormSchema } from "@/lib/monitors/schema";

describe("Monitor Input Validation Schema (src/lib/monitors/schema.ts)", () => {
  it("validates valid input for 'disappears' mode with sanity keyword", () => {
    const validData = {
      name: "Coldplay Tour Mumbai",
      url: "https://in.bookmyshow.com/events/coldplay",
      interval_seconds: 60,
      mode: "disappears",
      keyword: "SOLD OUT|Exhausted",
      sanity_keyword: "Coldplay",
      release_at: "2026-11-01T12:00:00.000Z",
    };

    const result = monitorFormSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it("validates valid input for 'changes' mode without keywords", () => {
    const validChanges = {
      name: "VIP Lounge Tickets",
      url: "https://tickets.example.com/vip",
      interval_seconds: 180,
      mode: "changes",
      keyword: "",
      css_selector: "#booking-tier",
    };

    const result = monitorFormSchema.safeParse(validChanges);
    expect(result.success).toBe(true);
  });

  it("fails if keyword is empty for 'appears' mode", () => {
    const invalidData = {
      name: "Movie Premiere",
      url: "https://tickets.example.com/movie",
      interval_seconds: 60,
      mode: "appears",
      keyword: "",
    };

    const result = monitorFormSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  it("rejects non-standard check intervals (e.g. 45 seconds)", () => {
    const invalidInterval = {
      name: "Concert",
      url: "https://tickets.example.com",
      interval_seconds: 45,
      mode: "changes",
    };

    const result = monitorFormSchema.safeParse(invalidInterval);
    expect(result.success).toBe(false);
  });
});
