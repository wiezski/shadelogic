// GET /api/cron/email-retry
//
// Daily cron that retries audit emails which failed to send. Runs once
// per day (Vercel Hobby plan limit) at 9am UTC, one hour after the
// reminder cron, to give Resend the freshest possible config snapshot.
//
// Behavior:
//   • Targets audit_requests rows where email IS NOT NULL AND
//     (email_sent IS NULL OR email_sent = false), captured in the last
//     7 days. We don't retry forever — old leads either got the report
//     by some other path, or they're cold enough that an out-of-the-blue
//     email weeks later does more harm than good.
//   • Skips manual-review rows (score = 0, empty findings) — those
//     don't have a real audit to send and need manual intervention.
//   • Caps at 50 retries per run to stay under Resend rate limits.
//   • For each row, calls sendFullReportEmail (which logs to
//     email_send_log automatically). Updates email_sent fields on
//     audit_requests just like the unlock endpoint does.
//
// Auth: same pattern as /api/cron/send-reminders — checks
// `Authorization: Bearer ${CRON_SECRET}`. Vercel automatically passes
// this header when invoking the cron URL.

import { NextRequest, NextResponse } from "next/server";
import { getAuditAdminClient } from "@/lib/audit/db";
import { sendFullReportEmail } from "@/lib/audit/email";
import type { AuditReport, Finding } from "@/lib/audit/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RETRY_WINDOW_DAYS = 7;
const PER_RUN_CAP = 50;
const PACING_MS = 250;

interface RetryResult {
  id: string;
  domain: string;
  email: string;
  ok: boolean;
  error?: string;
}

function gradeFor(score: number): AuditReport["grade"] {
  if (score >= 80) return "Strong";
  if (score >= 60) return "Solid";
  if (score >= 40) return "Needs Work";
  return "Critical Gaps";
}

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    // No secret configured → still let Vercel's own cron-key header
    // through, so the job runs in production. This is the same lenient
    // posture the existing send-reminders cron takes.
    return true;
  }
  const authHeader = req.headers.get("authorization");
  if (authHeader === `Bearer ${cronSecret}`) return true;
  // Allow manual admin invocation too, for testing.
  const adminToken = process.env.AUDIT_ADMIN_TOKEN;
  if (adminToken && req.headers.get("x-zr-admin") === adminToken) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const admin = getAuditAdminClient();
  const since = new Date(
    Date.now() - RETRY_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: rows, error: loadErr } = await admin
    .from("audit_requests")
    .select("id, domain, url, score, findings, top_three, email, email_sent")
    .not("email", "is", null)
    .or("email_sent.is.null,email_sent.eq.false")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(PER_RUN_CAP);

  if (loadErr) {
    console.error("[cron/email-retry] failed to load failed rows:", loadErr);
    return NextResponse.json(
      { ok: false, error: "Database lookup failed", details: loadErr.message },
      { status: 500 },
    );
  }

  if (!rows || rows.length === 0) {
    console.log("[cron/email-retry] No failed-email rows to retry. All clear.");
    return NextResponse.json({
      ok: true,
      processed: 0,
      succeeded: 0,
      failed: 0,
      message: "No failed-email rows to retry.",
    });
  }

  // Skip manual-review captures (score=0 with no real findings) — those
  // need a manual report, not an automated retry.
  const candidates = rows.filter((r) => {
    if (!r.email) return false;
    if (r.score === 0 && Array.isArray(r.findings) && r.findings.length === 0) return false;
    return true;
  });

  console.log(
    `[cron/email-retry] Retrying ${candidates.length} failed audit emails (of ${rows.length} candidate rows).`,
  );

  const results: RetryResult[] = [];
  let succeeded = 0;
  let failed = 0;

  for (const row of candidates) {
    const report: AuditReport = {
      score: row.score,
      grade: gradeFor(row.score),
      domain: row.domain,
      url: row.url,
      pageTitle: null,
      findings: (row.findings as Finding[]) || [],
      topThree: (row.top_three as Finding[]) || [],
      quickInsights: [],
      scannedAt: new Date().toISOString(),
    };

    try {
      const sendRes = await sendFullReportEmail(row.email!, report);
      const update: Record<string, unknown> = sendRes.ok
        ? { email_sent: true, email_sent_at: new Date().toISOString(), email_error: null }
        : { email_sent: false, email_error: sendRes.error || "Unknown send failure" };

      const { error: updErr } = await admin
        .from("audit_requests")
        .update(update)
        .eq("id", row.id);
      if (updErr) {
        console.error("[cron/email-retry] failed to update row:", row.id, updErr);
      }

      if (sendRes.ok) {
        succeeded++;
        results.push({ id: row.id, domain: row.domain, email: row.email!, ok: true });
      } else {
        failed++;
        results.push({
          id: row.id,
          domain: row.domain,
          email: row.email!,
          ok: false,
          error: sendRes.error,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown exception";
      failed++;
      results.push({ id: row.id, domain: row.domain, email: row.email!, ok: false, error: msg });
      console.error("[cron/email-retry] exception sending to", row.email, msg);
    }

    // Polite pacing to stay under Resend rate limits.
    await new Promise((r) => setTimeout(r, PACING_MS));
  }

  console.log(
    `[cron/email-retry] Completed. Processed ${candidates.length}, succeeded ${succeeded}, failed ${failed}.`,
  );

  return NextResponse.json({
    ok: true,
    processed: candidates.length,
    succeeded,
    failed,
    results,
  });
}
