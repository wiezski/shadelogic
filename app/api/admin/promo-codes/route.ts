// GET  /api/admin/promo-codes  — list all codes + usage
// POST /api/admin/promo-codes  — create a new code
//
// Gated by admin cookie (same check as /api/test-email).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isAdminRequest } from "@/lib/admin/auth";

export const runtime = "nodejs";
export const maxDuration = 10;

interface CreateBody {
  code: string;
  label?: string | null;
  plan?: "starter" | "professional" | "business";
  duration?: "3mo" | "6mo" | "12mo" | "lifetime";
  max_users?: number;
}

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const admin = getAdmin();
  const { data, error } = await admin
    .from("promo_codes")
    .select("code, label, plan, duration, max_users, used_by_company, used_at, expires_at, created_by, created_at")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[admin/promo-codes] list failed:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, codes: data || [] });
}

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const code = (body.code || "").trim().toUpperCase();
  if (!code || code.length < 4) {
    return NextResponse.json({ ok: false, error: "Code must be at least 4 characters" }, { status: 400 });
  }

  const plan = body.plan || "business";
  const duration = body.duration || "12mo";
  const max_users = body.max_users ?? 5;
  const label = (body.label ?? null) || null;

  const admin = getAdmin();
  const { data, error } = await admin
    .from("promo_codes")
    .insert([{ code, label, plan, duration, max_users, created_by: "admin" }])
    .select("code, label, plan, duration, max_users")
    .single();

  if (error) {
    const isDup = /duplicate|unique/i.test(error.message);
    return NextResponse.json(
      { ok: false, error: isDup ? `Code "${code}" already exists` : error.message },
      { status: isDup ? 409 : 500 },
    );
  }
  return NextResponse.json({ ok: true, created: data });
}
