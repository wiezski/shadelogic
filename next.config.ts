import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable React Strict Mode to avoid double-mounting components, which
  // orphans Supabase gotrue-js Web Locks on the shared auth token. Symptom:
  // dashboard/customers/measure_jobs all return empty on first load with
  // console warnings about "Lock 'lock:sb-...-auth-token' was not released
  // within 5000ms". Disabling Strict Mode lets single mounts complete
  // their lock acquire/release cycles cleanly.
  reactStrictMode: false,
};

export default nextConfig;
