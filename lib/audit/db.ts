// Supabase client helpers for the audit lead magnet.
//
// We use the service-role key server-side so we can:
//   - SELECT existing rows (RLS blocks anon reads by design)
//   - UPDATE rows as the funnel progresses (unlock email, book call)
//   - INSERT without going through RLS
//
// This client is ONLY used from API routes — never shipped to the browser.

import { createClient, SupabaseClient } from "@supabase/supabase-js";

let cachedAdmin: SupabaseClient | null = null;

export function getAuditAdminClient(): SupabaseClient {
  if (cachedAdmin) return cachedAdmin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  cachedAdmin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedAdmin;
}
