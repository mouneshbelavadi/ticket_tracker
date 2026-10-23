import { z } from "zod";

export const envSchema = z.object({
  SUPABASE_URL: z.string().url("SUPABASE_URL must be a valid URL"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),
  RESEND_API_KEY: z.string().min(1, "RESEND_API_KEY is required"),
  NOTIFY_EMAIL: z.string().email("NOTIFY_EMAIL must be a valid email address"),
  ADMIN_PASSWORD: z.string().min(1, "ADMIN_PASSWORD is required"),
  SESSION_SECRET: z.string().min(16, "SESSION_SECRET must be at least 16 characters"),
  CRON_SECRET: z.string().min(8, "CRON_SECRET must be at least 8 characters"),
  APP_URL: z.string().url("APP_URL must be a valid URL"),
  TELEGRAM_BOT_TOKEN: z.string().optional().or(z.literal("")),
  TELEGRAM_CHAT_ID: z.string().optional().or(z.literal("")),
  ALLOW_LOCALHOST_FOR_DEV: z
    .enum(["true", "false"])
    .optional()
    .transform((val) => val === "true"),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validates and returns the validated environment variables.
 * Enforces server-only execution to prevent accidental leaks in the browser.
 * Throws a clear descriptive error listing all missing or invalid variables.
 */
export function getEnv(customSource?: Record<string, string | undefined>): Env {
  if (typeof window !== "undefined") {
    throw new Error(
      "SECURITY VIOLATION: Server-side secrets must never be accessed from the client browser."
    );
  }

  const rawSource = customSource ?? process.env;
  const source = {
    ...rawSource,
    SUPABASE_URL: rawSource.SUPABASE_URL || rawSource.NEXT_PUBLIC_SUPABASE_URL,
    NOTIFY_EMAIL: rawSource.NOTIFY_EMAIL || rawSource.NOTIFICATION_EMAIL_TO,
    APP_URL: rawSource.APP_URL || (rawSource.VERCEL_URL ? `https://${rawSource.VERCEL_URL}` : undefined),
  };
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const errorDetails = result.error.issues
      .map((issue) => `  - [${issue.path.join(".") || "UNKNOWN"}]: ${issue.message}`)
      .join("\n");

    const errorMessage =
      `\n=======================================================\n` +
      `[TICKET ALERT] MISSING OR INVALID ENVIRONMENT VARIABLES:\n` +
      `=======================================================\n` +
      `${errorDetails}\n\n` +
      `Please create or update your .env.local file using .env.example as a reference.\n` +
      `=======================================================\n`;

    throw new Error(errorMessage);
  }

  return result.data;
}

/**
 * Convenience helper to check if the current environment is valid without throwing.
 */
export function isValidEnv(customSource?: Record<string, string | undefined>): boolean {
  try {
    getEnv(customSource);
    return true;
  } catch {
    return false;
  }
}
