// ── Push unsubscribe API ──────────────────────────────────────
// POST /api/push/unsubscribe
// Body: { endpoint: string }
// Headers: Authorization: Bearer {supabase_access_token}
//
// Removes the subscription row for this (user, endpoint) pair.
// Silent-ok if nothing exists.

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

  let body: { endpoint?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }
  if (!body.endpoint) return NextResponse.json({ error: "missing-endpoint" }, { status: 400 });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { error: delErr } = await admin
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", body.endpoint)
    .eq("user_id", user.id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
