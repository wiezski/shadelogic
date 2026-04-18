// ── Device Session Tracking ─────────────────────────────────────
// Limits each user to MAX_DEVICES_PER_USER concurrent device sessions.
// On login/page load, registers the current device. If the limit is
// exceeded, the oldest session is kicked.

import { supabase } from "./supabase";
import { MAX_DEVICES_PER_USER } from "./features";

// Generate or retrieve a stable device ID for this browser
function getDeviceId(): string {
  const STORAGE_KEY = "zr_device_id";
  let deviceId = localStorage.getItem(STORAGE_KEY);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, deviceId);
  }
  return deviceId;
}

// Get a human-readable device label
function getDeviceLabel(): string {
  const ua = navigator.userAgent;
  if (/iPhone|iPad/.test(ua)) return "iOS Device";
  if (/Android/.test(ua)) return "Android Device";
  if (/Mac/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows PC";
  if (/Linux/.test(ua)) return "Linux";
  return "Unknown Device";
}

/**
 * Register this device session. Returns true if allowed, false if blocked.
 * If the user already has MAX_DEVICES sessions, the oldest is removed.
 */
export async function registerDeviceSession(userId: string, companyId: string): Promise<{ allowed: boolean; kicked?: string }> {
  const deviceId = getDeviceId();
  const deviceLabel = getDeviceLabel();

  // Upsert this device session (update last_active if already exists)
  await supabase
    .from("user_sessions")
    .upsert(
      {
        user_id: userId,
        company_id: companyId,
        device_id: deviceId,
        device_label: deviceLabel,
        last_active: new Date().toISOString(),
      },
      { onConflict: "user_id,device_id" }
    );

  // Count active sessions for this user
  const { data: sessions } = await supabase
    .from("user_sessions")
    .select("id, device_id, device_label, last_active")
    .eq("user_id", userId)
    .order("last_active", { ascending: true });

  if (!sessions) return { allowed: true };

  // If over limit, kick the oldest (that isn't the current device)
  if (sessions.length > MAX_DEVICES_PER_USER) {
    const toRemove = sessions
      .filter(s => s.device_id !== deviceId)
      .slice(0, sessions.length - MAX_DEVICES_PER_USER);

    for (const s of toRemove) {
      await supabase.from("user_sessions").delete().eq("id", s.id);
    }

    return {
      allowed: true,
      kicked: toRemove.map(s => s.device_label || "Unknown").join(", "),
    };
  }

  return { allowed: true };
}

/**
 * Heartbeat — update last_active for the current device.
 * Call this periodically (e.g. every 5 minutes) to keep the session alive.
 */
export async function heartbeatSession(userId: string): Promise<void> {
  const deviceId = getDeviceId();
  await supabase
    .from("user_sessions")
    .update({ last_active: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("device_id", deviceId);
}

/**
 * Remove the current device session (on logout).
 */
export async function removeDeviceSession(userId: string): Promise<void> {
  const deviceId = getDeviceId();
  await supabase
    .from("user_sessions")
    .delete()
    .eq("user_id", userId)
    .eq("device_id", deviceId);
}
