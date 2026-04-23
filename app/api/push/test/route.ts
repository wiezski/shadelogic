// ── Push test API ─────────────────────────────────────────────
// POST /api/push/test
// Headers: Authorization: Bearer {supabase_access_token}
//
// Schedules an immediate push for the signed-in user (fire_at = now).
// The next cron tick picks it up and delivers. Used by the "Send test
// push" button in Settings so the owner can verify the whole stack
// end-to-end without creating a fake appointment.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !serviceKey || !anonKey) {
    return NextResponse.json({ error: "supabase-env-missing" }, { status: 500 });
  }

  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return NextResponse.json({ error: "no-token" }, { status: 401 });

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: userRes } = await userClient.auth.getUser();
  if (!userRes?.user) return NextResponse.json({ error: "invalid-token" }, { status: 401 });
  const user = userRes.user;

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: profile } = await admin
    .from("profiles").select("company_id").eq("id", user.id).maybeSingle();
  if (!profile?.company_id) {
    return NextResponse.json({ error: "no-company" }, { status: 400 });
  }

  // Confirm the user actually has a subscription, otherwise the ding
  // can't be delivered no matter what.
  const { count } = await admin
    .from("push_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if (!count || count === 0) {
    return NextResponse.json({ error: "no-subscription" }, { status: 400 });
  }

  // Queue it. Fire immediately (next cron tick = within a minute).
  const { error: insertErr } = await admin
    .from("scheduled_pushes")
    .upsert(
      {
        user_id: user.id,
        company_id: profile.company_id,
        kind: "test",
        title: "ZeroRemake notifications",
        body: "Push notifications are working. You'll get a ding before your next appointment.",
        url: "/settings",
        fire_at: new Date().toISOString(),
        dedupe_key: `test:${user.id}:${Date.now()}`,
      },
      { onConflict: "dedupe_key" }
    );

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
