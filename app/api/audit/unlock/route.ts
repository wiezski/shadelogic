// POST /api/audit/unlock
//
// Layer 2: email capture. The prospect has seen their Layer 1 summary
// and wants the full report. We:
//
//   1. Validate + normalize the email.
//   2. Update the audit_requests row with the email.
//   3. AWAIT both emails (user report + owner notification) so the
//      frontend knows whether delivery actually succeeded and can show
//      the right confirmation/failure message.
//   4. Update the audit_requests row with email_sent + email_error +
//      email_sent_at so we have ground-truth history per submission.
//   5. Return { ok, emailSent, error? } to the client.

import { NextRequest, NextResponse } from "next/server";
import { getAuditAdminClient } from "@/lib/audit/db";
import {
  sendFullReportEmail,
  sendInternalAlertEmail,
} from "@/lib/audit/email";
import type { AuditReport } from "@/lib/audit/types";

export const runtime = "nodejs";
// Allow up to 15s — two Resend calls + two DB writes.
export const maxDuration = 15;

interface UnlockBody {
  id: string;
  email: string;
}

// Permissive email format — Resend does the real check.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  let body: UnlockBody;
  try {
    body = (await req.json()) as UnlockBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const id = (body?.id || "").trim();
  const email = (body?.email || "").trim().toLowerCase();
  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing audit id" }, { status: 400 });
  }
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json(
      { ok: false, error: "That email doesn’t look right." },
      { status: 400 },
    );
  }

  const admin = getAuditAdminClient();

  // Load the row
  const { data: row, error: loadErr } = await admin
    .from("audit_requests")
    .select("id, domain, url, score, findings, top_three, email")
    .eq("id", id)
    .maybeSingle();

  if (loadErr || !row) {
    return NextResponse.json(
      { ok: false, error: "Couldn’t find that scan. Try running the audit again." },
      { status: 404 },
    );
  }

  // Persist the email on the row (first capture wins — never overwrite).
  if (!row.email) {
    const { error: updErr } = await admin
      .from("audit_requests")
      .update({ email, email_captured_at: new Date().toISOString() })
      .eq("id", id);
    if (updErr) {
      console.error("[audit/unlock] failed to save email on row:", id, updErr);
    }
  }

  // Build an AuditReport shape for the email templates.
  const report: AuditReport = {
    score: row.score,
    grade: (row.score >= 80
      ? "Strong"
      : row.score >= 60
        ? "Solid"
        : row.score >= 40
          ? "Needs Work"
          : "Critical Gaps") as AuditReport["grade"],
    domain: row.domain,
    url: row.url,
    pageTitle: null,
    findings: row.findings || [],
    topThree: row.top_three || [],
    quickInsights: [],
    scannedAt: new Date().toISOString(),
  };

  console.log(
    "[audit/unlock] Processing unlock — id:",
    id,
    "email:",
    email,
    "domain:",
    row.domain,
    "score:",
    row.score,
  );

  // Fire both emails in parallel and WAIT for both. We need the result
  // of the user-facing email to know what to tell the client, and the
  // owner alert should be logged either way so Steve knows who came in.
  const [userRes, ownerRes] = await Promise.all([
    sendFullReportEmail(email, report),
    sendInternalAlertEmail({
      kind: "email_captured",
      report,
      domain: row.domain,
      score: row.score,
      email,
      auditId: id,
    }),
  ]);

  // Record the user-email delivery status on the row. Owner alert
  // failures don't get persisted — they're already in the logs and
  // they don't affect what the prospect sees.
  const emailUpdate: Record<string, unknown> = userRes.ok
    ? { email_sent: true, email_sent_at: new Date().toISOString(), email_error: null }
    : { email_sent: false, email_error: userRes.error || "Unknown send failure" };

  const { error: statusErr } = await admin
    .from("audit_requests")
    .update(emailUpdate)
    .eq("id", id);
  if (statusErr) {
    console.error("[audit/unlock] failed to update email status on row:", id, statusErr);
  }

  if (!userRes.ok) {
    console.error(
      "[audit/unlock] FAILED to deliver report to:",
      email,
      "domain:",
      row.domain,
      "error:",
      userRes.error,
    );
    return NextResponse.json({
      ok: false,
      emailSent: false,
      error:
        "Something went wrong sending the email. Try again in a moment, or reply to support@zeroremake.com.",
    });
  }

  if (!ownerRes.ok) {
    // Non-fatal for the user-facing response — their email went through.
    console.error(
      "[audit/unlock] Owner alert failed (prospect email DID succeed) — domain:",
      row.domain,
      "error:",
      ownerRes.error,
    );
  }

  console.log(
    "[audit/unlock] Unlock complete — id:",
    id,
    "emails sent — user:",
    userRes.ok,
    "owner:",
    ownerRes.ok,
  );

  return NextResponse.json({
    ok: true,
    emailSent: true,
    id: row.id,
    score: row.score,
    domain: row.domain,
  });
}
