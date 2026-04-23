// ── Push subscribe API ────────────────────────────────────────
// POST /api/push/subscribe
// Body: { subscription: PushSubscriptionJSON, user_agent?: string | null }
// Headers: Authorization: Bearer {supabase_access_token}
//
// Resolves the user from the bearer token (so the client can't
// impersonate anyone else), then upserts the subscription into
// push_subscriptions. Upsert-by-endpoint means re-subscribing is
// safe and idempotent.

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

  // Verify the user token with the anon key (no elevated perms)
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: userRes, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userRes?.user) {
    return NextResponse.json({ error: "invalid-token" }, { status: 401 });
  }
  const user = userRes.user;

  let body: {
    subscription?: {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
    };
    user_agent?: string | null;
  };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  const sub = body.subscription;
  const endpoint = sub?.endpoint;
  const p256dh = sub?.keys?.p256dh;
  const authKey = sub?.keys?.auth;
  if (!endpoint || !p256dh || !authKey) {
    return NextResponse.json({ error: "missing-subscription-keys" }, { status: 400 });
  }

  // Look up the user's company. The server-side client uses the
  // service role to bypass RLS for this read.
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("company_id")
    .eq("id", user.id)
    .maybeSingle();
  if (profileErr || !profile?.company_id) {
    return NextResponse.json({ error: "no-company" }, { status: 400 });
  }

  // Upsert on endpoint — if the same device re-subscribes we replace
  // the keys (they can rotate) and bump last_used_at.
  const { error: upsertErr } = await admin
    .from("push_subscriptions")
    .upsert(
      {
        user_id: user.id,
        company_id: profile.company_id,
        endpoint,
        p256dh,
        auth_key: authKey,
        user_agent: body.user_agent ?? null,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" }
    );
  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
