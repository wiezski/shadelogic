// GET /api/admin/email-status
//
// Admin-only health-check endpoint for the audit email pipeline.
// Returns:
//   • Total send attempts in the last 24h / 7d
//   • Success vs failure counts
//   • Most recent failures with error messages
//   • Whether sandbox mode has been detected recently
//   • Configuration status (RESEND_API_KEY present, EMAIL_FROM_ADDRESS value)
//
// Auth: same scheme as /api/audit/resend — zr_admin cookie or
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
  const now = new Date();
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Pull last 7d of email_send_log for tallying.
  const { data: logs, error: logErr } = await admin
    .from("email_send_log")
    .select("id, created_at, kind, to_email, domain, ok, error, sandbox_mode")
    .gte("created_at", since7d)
    .order("created_at", { ascending: false })
    .limit(500);

  if (logErr) {
    return NextResponse.json(
      {
        ok: false,
        error: "Could not query email_send_log. Has the migration been applied?",
        details: logErr.message,
      },
      { status: 500 },
    );
  }

  const all = logs || [];
  const last24h = all.filter((r) => r.created_at >= since24h);
  const failures24h = last24h.filter((r) => !r.ok);
  const failures7d = all.filter((r) => !r.ok);
  const sandbox24h = last24h.filter((r) => r.sandbox_mode);
  const sandbox7d = all.filter((r) => r.sandbox_mode);

  const recentFailures = failures7d.slice(0, 25).map((r) => ({
    created_at: r.created_at,
    kind: r.kind,
    to: r.to_email,
    domain: r.domain,
    error: r.error,
    sandbox_mode: r.sandbox_mode,
  }));

  // Tally failures by kind for easy scanning.
  const failuresByKind: Record<string, number> = {};
  for (const f of failures7d) {
    failuresByKind[f.kind] = (failuresByKind[f.kind] || 0) + 1;
  }

  // Configuration snapshot (without leaking secrets).
  const apiKey = process.env.RESEND_API_KEY;
  const fromAddr = process.env.EMAIL_FROM_ADDRESS || "(default: noreply@zeroremake.com)";
  const adminAlertTo = process.env.AUDIT_INTERNAL_ALERT_TO || "(default: wiezski@gmail.com)";

  return NextResponse.json({
    ok: true,
    health: {
      sandbox_mode_detected_recently: sandbox24h.length > 0,
      attempts_last_24h: last24h.length,
      failures_last_24h: failures24h.length,
      success_rate_last_24h:
        last24h.length === 0
          ? null
          : Math.round(((last24h.length - failures24h.length) / last24h.length) * 1000) / 10,
      attempts_last_7d: all.length,
      failures_last_7d: failures7d.length,
      sandbox_failures_last_24h: sandbox24h.length,
      sandbox_failures_last_7d: sandbox7d.length,
    },
    config: {
      resend_api_key_present: Boolean(apiKey && apiKey.startsWith("re_")),
      from_address: fromAddr,
      admin_alert_recipient: adminAlertTo,
    },
    failures_by_kind_7d: failuresByKind,
    recent_failures: recentFailures,
  });
}
