// POST /api/walkthrough/request
//
// Captures a request for a 20-minute website walkthrough call. Lightweight
// front door — no audit ID required, no scan needed. Used by the
// /walkthrough page reached from email CTAs and the audit-page CTA.
//
// Stored in audit_requests with an error tag so they don't pollute real
// audit metrics, and so the admin dashboard can filter pending walkthrough
// requests separately. Internal alert email fires to wiezski@gmail.com so
// we know someone wants a call.

import { NextRequest, NextResponse } from "next/server";
import { getAuditAdminClient } from "@/lib/audit/db";
import { sendWalkthroughRequestAlertEmail } from "@/lib/audit/email";

export const runtime = "nodejs";
export const maxDuration = 15;

const PENDING_TAG = "WALKTHROUGH_REQUEST";

export async function POST(req: NextRequest) {
  let body: {
    name?: string;
    phone?: string;
    notes?: string;
    referer?: string;
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_term?: string;
    utm_content?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = (body.name || "").trim();
  const phone = (body.phone || "").trim() || null;
  const notes = (body.notes || "").trim() || null;

  if (!name) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }

  const ipHeader = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip");
  const ip = ipHeader ? ipHeader.split(",")[0]?.trim() || null : null;
  const userAgent = req.headers.get("user-agent") || null;

  const admin = getAuditAdminClient();

  // We use the audit_requests table since it already exists with the right
  // shape (name, phone, notes, ip, ua, utm). Score=0, findings=[] keep the
  // NOT NULL constraints happy. The PENDING_TAG in `error` distinguishes
  // walkthrough requests from real audits when querying.
  const insertRow = {
    url: "(walkthrough request)",
    domain: "(walkthrough request)",
    name,
    phone,
    call_notes: notes,
    score: 0,
    findings: [],
    top_three: null,
    error: PENDING_TAG,
    ip,
    user_agent: userAgent,
    referer: body.referer ?? null,
    utm_source: body.utm_source ?? null,
    utm_medium: body.utm_medium ?? null,
    utm_campaign: body.utm_campaign ?? null,
    utm_term: body.utm_term ?? null,
    utm_content: body.utm_content ?? null,
  };

  const { data: inserted, error: insertErr } = await admin
    .from("audit_requests")
    .insert(insertRow)
    .select("id")
    .single();

  if (insertErr || !inserted) {
    console.error("[walkthrough/request] insert failed:", insertErr);
    return NextResponse.json(
      { error: "Couldn't save your request. Try again in a moment." },
      { status: 500 },
    );
  }

  // Fire the alert. Don't block the UI on email delivery.
  sendWalkthroughRequestAlertEmail({
    name,
    phone,
    notes,
    requestId: inserted.id,
  }).catch((err) => {
    console.error("[walkthrough/request] alert email failed:", err);
  });

  return NextResponse.json({ ok: true, id: inserted.id });
}
