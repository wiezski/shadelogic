// POST /api/audit/resend
//
// Admin-only endpoint to retry the user-facing audit report email for
// audit_requests rows where the original delivery failed. Use cases:
//   • Resend domain wasn't verified at the time of the original send
//   • Transient Resend API errors
//   • A run of failures we want to recover after fixing config
//
// Behavior:
//   • Targets rows where email IS NOT NULL AND email_sent IS NOT TRUE
//   • Optionally narrowed to a specific list of audit_request IDs via body.ids
//   • Optionally narrowed to a domain via body.domain
//   • Optionally narrowed by created_at via body.since (ISO string)
//   • Calls sendFullReportEmail only — does NOT re-fire the owner alert,
//     so this is safe to run repeatedly without spamming the inbox.
//   • Updates email_sent / email_sent_at / email_error per attempt.
//
// Auth: requires the zr_admin cookie to match AUDIT_ADMIN_TOKEN env var,
//   OR the requester's IP to be in AUDIT_WHITELIST_IPS.

import { NextRequest, NextResponse } from "next/server";
import { getAuditAdminClient } from "@/lib/audit/db";
import { sendFullReportEmail } from "@/lib/audit/email";
import type { AuditReport, Finding } from "@/lib/audit/types";

export const runtime = "nodejs";
export const maxDuration = 60;

interface ResendBody {
  ids?: string[];
  domain?: string;
  since?: string;
  /** Cap to avoid accidentally hammering Resend on a huge backfill. */
  limit?: number;
}

interface PerRowResult {
  id: string;
  domain: string;
  email: string;
  ok: boolean;
  error?: string;
}

function getCookie(req: NextRequest, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function getClientIp(req: NextRequest): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() ?? null;
  const real = req.headers.get("x-real-ip");
  return real ? real.trim() : null;
}

function isAuthorized(req: NextRequest): boolean {
  const token = process.env.AUDIT_ADMIN_TOKEN;
  if (token) {
    const cookieVal = getCookie(req, "zr_admin");
    if (cookieVal && cookieVal === token) return true;
    const headerVal = req.headers.get("x-zr-admin");
    if (headerVal && headerVal === token) return true;
  }

  const whitelist = (process.env.AUDIT_WHITELIST_IPS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (whitelist.length > 0) {
    const ip = getClientIp(req);
    if (ip && whitelist.includes(ip)) return true;
  }

  return false;
}

function gradeFor(score: number): AuditReport["grade"] {
  if (score >= 80) return "Strong";
  if (score >= 60) return "Solid";
  if (score >= 40) return "Needs Work";
  return "Critical Gaps";
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: ResendBody = {};
  try {
    body = (await req.json()) as ResendBody;
  } catch {
    // Empty body is fine — means "resend all failed"
  }

  const limit = Math.min(Math.max(body.limit ?? 50, 1), 200);
  const admin = getAuditAdminClient();

  // Build the query. We only target rows that captured an email but
  // didn't successfully deliver. We never re-send to a row that already
  // succeeded.
  let query = admin
    .from("audit_requests")
    .select("id, domain, url, score, findings, top_three, email, email_sent, email_error")
    .not("email", "is", null)
    .or("email_sent.is.null,email_sent.eq.false")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (body.ids && body.ids.length > 0) {
    query = query.in("id", body.ids);
  }
  if (body.domain) {
    query = query.eq("domain", body.domain);
  }
  if (body.since) {
    query = query.gte("created_at", body.since);
  }

  const { data: rows, error: loadErr } = await query;
  if (loadErr) {
    console.error("[audit/resend] failed to load failed rows:", loadErr);
    return NextResponse.json(
      { ok: false, error: "Database lookup failed" },
      { status: 500 },
    );
  }

  if (!rows || rows.length === 0) {
    return NextResponse.json({
      ok: true,
      processed: 0,
      succeeded: 0,
      failed: 0,
      results: [],
      message: "No failed-email rows matched the filter.",
    });
  }

  // Skip rows that look like internal walkthrough requests or blocked
  // manual-review captures — those don't carry a full audit report and
  // would produce a malformed email if rebuilt.
  const SKIP_TAGS = new Set(["WALKTHROUGH_REQUEST"]);
  const candidates = rows.filter((r) => {
    if (!r.email) return false;
    // Manual-review rows have score=0 and an error message about the block —
    // don't try to send them an audit; they need a manual report instead.
    if (r.score === 0 && Array.isArray(r.findings) && r.findings.length === 0) return false;
    return true;
  });

  const results: PerRowResult[] = [];
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
        console.error("[audit/resend] failed to update row:", row.id, updErr);
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
      console.error("[audit/resend] exception sending to", row.email, msg);
    }

    // Polite pacing — Resend free tier has a per-second limit
    await new Promise((r) => setTimeout(r, 250));
  }

  return NextResponse.json({
    ok: true,
    processed: candidates.length,
    succeeded,
    failed,
    results,
  });
}
