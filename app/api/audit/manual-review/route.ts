// POST /api/audit/manual-review
//
// Captures a manual-review request when the automated scanner couldn't
// reach the target site (anti-bot protection / firewall / rate limit).
// Stores the URL + email in audit_requests so we have a lead, and fires
// an internal alert email to Steve so he can run the audit by hand and
// reply to the user directly.
//
// Flow:
//   1. Visitor enters URL, scan returns { blocked: true, ... }
//   2. UI shows the BlockedScanCard with email input
//   3. User submits email → this endpoint
//   4. Row inserted into audit_requests with score=0, error tag, email captured
//   5. Internal alert email fires to wiezski@gmail.com
//   6. UI shows "Got it — we'll send your audit by email."

import { NextRequest, NextResponse } from "next/server";
import { getAuditAdminClient } from "@/lib/audit/db";
import { normalizeUrl } from "@/lib/audit/scanner";
import { sendManualReviewAlertEmail } from "@/lib/audit/email";

export const runtime = "nodejs";
export const maxDuration = 15;

// Sentinel kept in audit_requests.error so the admin page (and anyone querying
// the table) can filter pending manual reviews from real audits.
const PENDING_TAG = "BLOCKED_PENDING_MANUAL_REVIEW";

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export async function POST(req: NextRequest) {
  let body: {
    url?: string;
    email?: string;
    reason?: string;
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_term?: string;
    utm_content?: string;
    referer?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawUrl = (body.url || "").trim();
  const rawEmail = (body.email || "").trim().toLowerCase();
  const reason = (body.reason || "Site blocked automated scan").slice(0, 200);

  if (!rawUrl) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }
  if (!rawEmail || !isValidEmail(rawEmail)) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }

  // Reuse the same URL normalizer the scanner uses so we store a clean URL.
  const normalized = normalizeUrl(rawUrl);
  if (!normalized) {
    return NextResponse.json({ error: "That URL doesn't look right" }, { status: 400 });
  }
  const { url, domain } = normalized;

  const ipHeader = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip");
  const ip = ipHeader ? ipHeader.split(",")[0]?.trim() || null : null;
  const userAgent = req.headers.get("user-agent") || null;

  const admin = getAuditAdminClient();

  const insertRow = {
    url,
    domain,
    email: rawEmail,
    score: 0,
    findings: [],
    top_three: null,
    error: `${PENDING_TAG}: ${reason}`,
    email_captured_at: new Date().toISOString(),
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
    console.error("[audit/manual-review] insert failed:", insertErr);
    return NextResponse.json(
      { error: "Couldn't save your request. Try again in a moment." },
      { status: 500 },
    );
  }

  // Fire the internal alert. Don't block the UI on email delivery — the
  // submission is already saved and will surface on the admin dashboard
  // even if the email fails.
  sendManualReviewAlertEmail({
    domain,
    url,
    email: rawEmail,
    reason,
    auditId: inserted.id,
  }).catch((err) => {
    console.error("[audit/manual-review] alert email failed:", err);
  });

  return NextResponse.json({ ok: true, id: inserted.id });
}
