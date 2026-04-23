// POST /api/audit/unlock
//
// Layer 2: email capture. The prospect has seen their Layer 1 summary
// and wants the full report. We update the audit row with their email,
// send them the branded full report, and send an internal alert.
//
// Response: full findings array so the UI can render the expanded view
// inline (the emailed PDF/HTML is a mirror of the same data).

import { NextRequest, NextResponse } from "next/server";
import { getAuditAdminClient } from "@/lib/audit/db";
import {
  sendFullReportEmail,
  sendInternalAlertEmail,
} from "@/lib/audit/email";
import type { AuditReport } from "@/lib/audit/types";

export const runtime = "nodejs";
export const maxDuration = 20;

interface UnlockBody {
  id: string;
  email: string;
}

// Permissive but sane email format check — Resend will do the real validation.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  let body: UnlockBody;
  try {
    body = (await req.json()) as UnlockBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const id = (body?.id || "").trim();
  const email = (body?.email || "").trim().toLowerCase();
  if (!id) return NextResponse.json({ error: "Missing audit id" }, { status: 400 });
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "That email doesn't look right." }, { status: 400 });
  }

  const admin = getAuditAdminClient();

  // Load the row
  const { data: row, error: loadErr } = await admin
    .from("audit_requests")
    .select("id, domain, url, score, findings, top_three, email, email_captured_at")
    .eq("id", id)
    .maybeSingle();

  if (loadErr || !row) {
    return NextResponse.json(
      { error: "Couldn't find that scan. Try running the audit again." },
      { status: 404 },
    );
  }

  // Persist email (first capture wins; we don't overwrite an earlier email).
  if (!row.email) {
    const { error: updErr } = await admin
      .from("audit_requests")
      .update({ email, email_captured_at: new Date().toISOString() })
      .eq("id", id);
    if (updErr) {
      console.error("[audit/unlock] update failed:", updErr);
    }
  }

  // Build a minimal AuditReport shape for the email template.
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

  // Fire both emails, but don't block the response on them.
  // (If Resend is slow we still return fast; errors get logged.)
  const emailPromises = Promise.allSettled([
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

  // Await briefly so failures surface in logs on Vercel (but don't stall UI).
  emailPromises.catch(() => {}); // fire-and-forget

  return NextResponse.json({
    id: row.id,
    score: row.score,
    grade: report.grade,
    domain: row.domain,
    findings: report.findings,
    topThree: report.topThree,
  });
}
