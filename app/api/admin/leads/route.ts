// GET /api/admin/leads
//
// Admin-only lead pipeline view. Returns the most recent audit_requests
// rows that captured an email (i.e. real leads, not walkthroughs or
// blocked submissions), so we can see the inbound funnel at a glance
// without opening Supabase.
//
// Auth: same scheme as /api/admin/email-status — zr_admin cookie or
// x-zr-admin header matching AUDIT_ADMIN_TOKEN env var.

import { NextRequest, NextResponse } from "next/server";
import { getAuditAdminClient } from "@/lib/audit/db";

export const runtime = "nodejs";
export const maxDuration = 15;

function getCookie(req: NextRequest, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function isAuthorized(req: NextRequest): boolean {
  const token = process.env.AUDIT_ADMIN_TOKEN;
  if (!token) return false;
  const cookieVal = getCookie(req, "zr_admin");
  if (cookieVal && cookieVal === token) return true;
  const headerVal = req.headers.get("x-zr-admin");
  if (headerVal && headerVal === token) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const admin = getAuditAdminClient();

  // Fetch a wider window than 50 so post-filter (walkthrough / blocked
  // exclusions) still leaves a full page of leads to return. NULL `error`
  // is the common case for real leads, and PostgREST's NOT/LIKE filters
  // exclude NULL rows under three-valued logic — easier to filter in JS
  // than to express "is null OR (neq AND not like)" via .or().
  const { data, error } = await admin
    .from("audit_requests")
    .select(
      "id, created_at, domain, score, email, email_sent, name, phone, call_notes, error, referer, utm_source",
    )
    .not("email", "is", null)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json(
      { ok: false, error: "Could not query audit_requests", details: error.message },
      { status: 500 },
    );
  }

  const rows = data || [];
  const leads = rows
    .filter((r) => {
      const e = r.error as string | null;
      if (!e) return true;
      if (e === "WALKTHROUGH_REQUEST") return false;
      if (e.startsWith("BLOCKED_PENDING_MANUAL_REVIEW")) return false;
      return true;
    })
    .slice(0, 50);

  return NextResponse.json({ ok: true, count: leads.length, leads });
}
