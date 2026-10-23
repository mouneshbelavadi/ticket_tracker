import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { getEnv } from "./env";

let supabaseInstance: SupabaseClient | null = null;

/**
 * Returns a server-only Supabase client authenticated with the service-role key.
 * This client bypasses Row Level Security and must NEVER be exposed to the browser.
 */
export function getDb(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error(
      "SECURITY VIOLATION: Supabase service-role client cannot be initialized in the browser."
    );
  }

  if (supabaseInstance) {
    return supabaseInstance;
  }

  const env = getEnv();
  supabaseInstance = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return supabaseInstance;
}
