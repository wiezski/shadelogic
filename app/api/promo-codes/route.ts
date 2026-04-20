// ── Promo Codes API ─────────────────────────────────────────
// GET  /api/promo-codes       — list all codes (owner only)
// POST /api/promo-codes       — create a new code (owner only)
//
// POST body: {
//   code?: string          — custom code (auto-generated if omitted)
//   label?: string         — friendly name
//   plan?: string          — 'starter' | 'professional' | 'business' (default: professional)
//   duration?: string      — 'lifetime' | '3mo' | '6mo' | '12mo' (default: lifetime)
//   max_users?: number     — max users allowed (default: 3)
// }

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Simple auth check: verify the caller is an owner
async function verifyOwner(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return null;
  const token = authHeader.replace("Bearer ", "");
  const admin = getAdmin();
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return null;
  const { data: profile } = await admin
    .from("profiles")
    .select("role, company_id")
    .eq("id", user.id)
    .single();
  if (!profile || (profile.role !== "owner" && profile.role !== "admin")) return null;
  return profile;
}

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `${seg()}-${seg()}-${seg()}`;
}

export async function GET(req: NextRequest) {
  const profile = await verifyOwner(req);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = getAdmin();
  const { data, error } = await admin
    .from("promo_codes")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ codes: data });
}

export async function POST(req: NextRequest) {
  const profile = await verifyOwner(req);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const code = (body.code || generateCode()).toUpperCase().trim();
  const label = body.label || null;
  const plan = body.plan || "professional";
  const duration = body.duration || "lifetime";
  const maxUsers = body.max_users ?? 3;

  if (!["starter", "professional", "business"].includes(plan)) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }
  if (!["lifetime", "3mo", "6mo", "12mo"].includes(duration)) {
    return NextResponse.json({ error: "Invalid duration" }, { status: 400 });
  }

  const admin = getAdmin();
  const { data, error } = await admin
    .from("promo_codes")
    .insert([{ code, label, plan, duration, max_users: maxUsers, created_by: "admin" }])
    .select()
    .single();

  if (error) {
    if (error.message.includes("unique")) {
      return NextResponse.json({ error: "Code already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, promo: data });
}
