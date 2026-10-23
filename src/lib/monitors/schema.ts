import { z } from "zod";

export const monitorFormSchema = z.object({
  name: z.string().min(1, "Event name is required").max(100, "Name too long"),
  url: z.string().url("Must be a valid HTTP or HTTPS URL"),
  interval_seconds: z.coerce.number().refine((val) => [60, 180, 300].includes(val), {
    message: "Check frequency must be 1, 3, or 5 minutes (60, 180, or 300 seconds)",
  }),
  mode: z.enum(["appears", "disappears", "changes"], {
    error: "Detection mode must be appears, disappears, or changes",
  }),
  keyword: z.string().optional().nullable(),
  sanity_keyword: z.string().optional().nullable(),
  css_selector: z.string().optional().nullable(),
  release_at: z.string().optional().nullable(),
}).refine(
  (data) => {
    if (data.mode === "appears" || data.mode === "disappears") {
      return !!data.keyword && data.keyword.trim().length > 0;
    }
    return true;
  },
  {
    message: "Keyword is required for 'appears' and 'disappears' modes",
    path: ["keyword"],
  }
);

export type MonitorFormInput = z.infer<typeof monitorFormSchema>;
