// GET /api/admin/audits — list the most recent audit submissions with
// email-delivery status, for the admin dashboard.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isAdminRequest } from "@/lib/admin/auth";

export const runtime = "nodejs";
export const maxDuration = 10;

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
    .from("audit_requests")
    .select("id, domain, email, score, email_sent, email_error, created_at")
    .order("created_at", { ascending: false })
    .limit(25);
  if (error) {
    console.error("[admin/audits] list failed:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, rows: data || [] });
}
