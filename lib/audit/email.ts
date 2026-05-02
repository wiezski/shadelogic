// Email sending for the audit lead magnet.
//
// Uses Resend directly, without the tenant-aware scaffolding in lib/email.ts —
// these are public prospects who aren't associated with a company yet.
//
// Two email shapes:
//   1. `sendFullReportEmail` — the branded full-report email sent to the
//      prospect after they unlock Layer 2.
//   2. `sendInternalAlertEmail` — an owner notification to Steve, fired
//      alongside the prospect email so he can follow up manually.
//
// Required env vars:
//   RESEND_API_KEY          — Resend API key (required; without it, sends
//                             return a clear error without calling Resend)
//   EMAIL_FROM_ADDRESS      — verified sender (default: noreply@zeroremake.com)
//   AUDIT_INTERNAL_ALERT_TO — where to send owner alerts (default: wiezski@gmail.com)
//
// Reliability hardening (Phase 46):
//   • Every send is logged to email_send_log with success/failure details.
//   • Sandbox-mode detection — if Resend rejects with the "testing mode"
//     error, we tag the row, log loudly, and (optionally) alert Steve.
//   • Failure alerts — when a prospect-facing send fails, an admin alert
//     fires to Steve so failures are visible in real time rather than
//     silently piling up. Recursion-guarded so failure-of-the-alert
//     doesn't fan out infinitely.
//
// Every send logs explicitly to stdout/stderr so Vercel's runtime logs
// make it easy to see who got what and whether Resend accepted it.

import type { AuditReport, Finding } from "./types";
import { getAuditAdminClient } from "./db";

const FROM_DEFAULT = "noreply@zeroremake.com";
const INTERNAL_DEFAULT = "wiezski@gmail.com";

// Internal kinds that should NOT trigger admin failure alerts when they
// themselves fail (prevents infinite alert loops if Resend is down).
const SUPPRESS_FAILURE_ALERT_KINDS = new Set([
  "admin_failure_alert",
  "test_probe",
]);

// Sentinel substring that Resend returns when the account is in
// sandbox/test mode and the recipient isn't the verified owner email.
// We treat this as a configuration emergency, not a transient error.
const SANDBOX_ERROR_NEEDLE = "you can only send testing emails";

// Module-level latch so sandbox warnings don't spam the logs every send.
// Reset between cold starts of the lambda — that's fine.
let sandboxWarnedThisInstance = false;

// ── Resend key validation ───────────────────────────────────────────

/**
 * Check that Resend is configured and log a clear, actionable message
 * if it isn't. Returns the key or null.
 */
function getResendKey(): string | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error(
      "[audit/email] Resend API key missing or invalid — set RESEND_API_KEY in Vercel env vars. All audit emails will fail until this is set.",
    );
    return null;
  }
  if (!apiKey.startsWith("re_") || apiKey.length < 20) {
    console.error(
      "[audit/email] Resend API key missing or invalid — RESEND_API_KEY doesn't look like a Resend key (expected re_…). Check the value in Vercel env vars.",
    );
    return null;
  }
  return apiKey;
}

// ── Low-level send (single source of truth for Resend) ─────────────

interface SendResult {
  ok: boolean;
  error?: string;
  id?: string;
  /** Sandbox/test-mode was detected in Resend's response. */
  sandboxMode?: boolean;
}

interface SendRawParams {
  to: string;
  subject: string;
  html: string;
  fromName?: string;
  replyTo?: string;
  /** Short tag for logs — e.g. "full_report" or "owner_alert". */
  kind: string;
  /** The domain this send relates to, for log correlation. */
  domain?: string;
  /** Optional audit_requests row id for cross-referencing in logs. */
  auditRequestId?: string;
}

/**
 * Detect Resend sandbox / test-mode errors. When the account isn't on
 * a verified sending domain, Resend rejects sends to anyone other than
 * the account owner with a specific error message. We treat that as a
 * config emergency rather than a transient error, since every prospect
 * email will fail until the domain is verified.
 */
function isSandboxModeError(message: string | undefined): boolean {
  if (!message) return false;
  return message.toLowerCase().includes(SANDBOX_ERROR_NEEDLE);
}

/**
 * Persist a single send attempt to email_send_log so failures are
 * visible independently of which scan triggered the send. Best-effort:
 * if the log write itself fails, we swallow the error and just log to
 * stderr — we never want logging to break the actual send flow.
 */
async function logEmailSendAttempt(params: {
  kind: string;
  toEmail: string;
  subject: string;
  domain?: string;
  auditRequestId?: string;
  ok: boolean;
  error?: string;
  resendMessageId?: string;
  sandboxMode: boolean;
  fromAddress: string;
}): Promise<void> {
  try {
    const admin = getAuditAdminClient();
    const { error } = await admin.from("email_send_log").insert({
      kind: params.kind,
      to_email: params.toEmail,
      subject: params.subject,
      domain: params.domain ?? null,
      audit_request_id: params.auditRequestId ?? null,
      ok: params.ok,
      error: params.error ?? null,
      resend_message_id: params.resendMessageId ?? null,
      sandbox_mode: params.sandboxMode,
      from_address: params.fromAddress,
    });
    if (error) {
      // Likely the email_send_log table doesn't exist yet (migration
      // not applied). Don't break the send flow — just log it.
      console.error(
        "[audit/email] email_send_log insert failed (is the migration applied?):",
        error.message || error,
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[audit/email] email_send_log insert threw:", message);
  }
}

/**
 * Fire an admin alert email when a prospect-facing send fails. This is
 * the "alert system" for the hardening pass — Steve gets a real-time
 * email instead of finding out a week later when he asks the database.
 *
 * Recursion-guarded: failures of the alert email itself, or of the
 * test probe, won't cascade into another alert.
 */
async function fireAdminFailureAlert(failed: {
  kind: string;
  toEmail: string;
  subject: string;
  domain?: string;
  auditRequestId?: string;
  error?: string;
  sandboxMode: boolean;
  fromAddress: string;
}): Promise<void> {
  if (SUPPRESS_FAILURE_ALERT_KINDS.has(failed.kind)) return;

  const adminTo = process.env.AUDIT_INTERNAL_ALERT_TO || INTERNAL_DEFAULT;
  // Don't bounce an alert back to the address that just failed (e.g.
  // if the prospect happens to be wiezski@gmail.com). Edge case.
  if (failed.toEmail.toLowerCase() === adminTo.toLowerCase()) return;

  const banner = failed.sandboxMode
    ? `<div style="background:#fff4e5;border-left:4px solid #c44a2a;padding:14px 18px;margin:0 0 18px 0;color:#8a3a14;">
        <strong>RESEND IS IN SANDBOX MODE.</strong> The account can only send to wiezski@gmail.com until a sending domain is verified at <a href="https://resend.com/domains" style="color:#c44a2a;">resend.com/domains</a>. Every prospect email will fail until this is fixed.
      </div>`
    : "";

  const rows = [
    `<tr><td style="color:#6b7280;padding:4px 12px 4px 0;">Kind</td><td><code>${failed.kind}</code></td></tr>`,
    `<tr><td style="color:#6b7280;padding:4px 12px 4px 0;">Recipient</td><td style="font-weight:600;">${failed.toEmail}</td></tr>`,
    `<tr><td style="color:#6b7280;padding:4px 12px 4px 0;">Subject</td><td>${failed.subject}</td></tr>`,
  ];
  if (failed.domain) {
    rows.push(`<tr><td style="color:#6b7280;padding:4px 12px 4px 0;">Domain</td><td>${failed.domain}</td></tr>`);
  }
  if (failed.auditRequestId) {
    rows.push(`<tr><td style="color:#6b7280;padding:4px 12px 4px 0;">Audit ID</td><td style="font-family:monospace;font-size:12px;">${failed.auditRequestId}</td></tr>`);
  }
  rows.push(`<tr><td style="color:#6b7280;padding:4px 12px 4px 0;">From address</td><td><code>${failed.fromAddress}</code></td></tr>`);
  rows.push(`<tr><td style="color:#6b7280;padding:4px 12px 4px 0;vertical-align:top;">Error</td><td style="color:#c44a2a;">${failed.error ?? "(no message)"}</td></tr>`);

  const html = `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:20px;color:#1c1c1e;">
    <h2 style="margin:0 0 12px 0;font-size:18px;font-weight:700;color:#c44a2a;">Audit email send failed</h2>
    ${banner}
    <p style="margin:0 0 16px 0;font-size:14px;color:#374151;line-height:1.5;">
      A send through the audit email pipeline failed. This alert is automatic.
      The failure is also persisted in <code>email_send_log</code> so you can
      query it in Supabase, and you can retry via <code>/api/audit/resend</code>.
    </p>
    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">${rows.join("")}</table>
    <div style="margin-top:24px;font-size:12px;color:#9ca3af;">
      Sent automatically by the audit email pipeline at ${new Date().toISOString()}.
    </div>
  </body></html>`;

  // Direct call to sendRaw — we DON'T re-enter the alert system for
  // alert emails (SUPPRESS_FAILURE_ALERT_KINDS catches it).
  await sendRaw({
    to: adminTo,
    subject: `Audit email failed: ${failed.kind} → ${failed.toEmail}`,
    html,
    fromName: "ZeroRemake Alerts",
    kind: "admin_failure_alert",
    domain: failed.domain,
  });
}

async function sendRaw(params: SendRawParams): Promise<SendResult> {
  const apiKey = getResendKey();
  const fromAddr = process.env.EMAIL_FROM_ADDRESS || FROM_DEFAULT;
  const fromName = params.fromName || "ZeroRemake";
  const from = `${fromName} <${fromAddr}>`;

  if (!apiKey) {
    const error = "Resend API key missing or invalid";
    await logEmailSendAttempt({
      kind: params.kind,
      toEmail: params.to,
      subject: params.subject,
      domain: params.domain,
      auditRequestId: params.auditRequestId,
      ok: false,
      error,
      sandboxMode: false,
      fromAddress: fromAddr,
    });
    return { ok: false, error };
  }

  console.log(
    `[audit/email] Sending ${params.kind} to:`,
    params.to,
    params.domain ? `for domain: ${params.domain}` : "",
    `subject: "${params.subject}"`,
  );

  let result: SendResult;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [params.to],
        subject: params.subject,
        html: params.html,
        reply_to: params.replyTo || "steve@zeroremake.com",
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = data?.message || `Resend returned HTTP ${res.status}`;
      const sandboxMode = isSandboxModeError(message);
      if (sandboxMode && !sandboxWarnedThisInstance) {
        sandboxWarnedThisInstance = true;
        console.error(
          "[audit/email] ⚠️  RESEND SANDBOX MODE DETECTED — every send to addresses other than the Resend account owner will fail. Verify a sending domain at https://resend.com/domains and ensure EMAIL_FROM_ADDRESS uses it. Triggered by send to:",
          params.to,
        );
      }
      console.error(
        `[audit/email] ${params.kind} FAILED to:`,
        params.to,
        params.domain ? `domain: ${params.domain}` : "",
        "error:",
        message,
        sandboxMode ? "(SANDBOX MODE)" : "",
        "raw:",
        data,
      );
      result = { ok: false, error: message, sandboxMode };
    } else {
      console.log(
        `[audit/email] ${params.kind} sent successfully to:`,
        params.to,
        params.domain ? `domain: ${params.domain}` : "",
        "message_id:",
        data?.id || "(no id returned)",
      );
      result = { ok: true, id: data?.id, sandboxMode: false };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[audit/email] ${params.kind} FAILED to:`,
      params.to,
      params.domain ? `domain: ${params.domain}` : "",
      "error:",
      message,
    );
    result = { ok: false, error: message, sandboxMode: false };
  }

  // Always persist the attempt — success or failure — for visibility.
  await logEmailSendAttempt({
    kind: params.kind,
    toEmail: params.to,
    subject: params.subject,
    domain: params.domain,
    auditRequestId: params.auditRequestId,
    ok: result.ok,
    error: result.error,
    resendMessageId: result.id,
    sandboxMode: result.sandboxMode ?? false,
    fromAddress: fromAddr,
  });

  // On failure, fire an admin alert (recursion-guarded). We don't await
  // here — the alert is best-effort and we don't want to delay the
  // response to the original caller.
  if (!result.ok) {
    fireAdminFailureAlert({
      kind: params.kind,
      toEmail: params.to,
      subject: params.subject,
      domain: params.domain,
      auditRequestId: params.auditRequestId,
      error: result.error,
      sandboxMode: result.sandboxMode ?? false,
      fromAddress: fromAddr,
    }).catch((err) => {
      console.error("[audit/email] admin failure alert itself failed:", err);
    });
  }

  return result;
}

// ── Branded HTML full report (matches the tone of Steve's real audits) ──

function severityLabel(sev: Finding["severity"]): { label: string; color: string } {
  switch (sev) {
    case "critical":
      return { label: "What’s costing you leads", color: "#c6443a" };
    case "important":
      return { label: "Worth fixing", color: "#e08a00" };
    case "minor":
      return { label: "Minor", color: "#6b7280" };
    case "pass":
      return { label: "Looks good", color: "#30a46c" };
  }
}

function renderFindingHtml(f: Finding): string {
  const sev = severityLabel(f.severity);
  const earned = `${f.score}/${f.maxPoints}`;
  return `
    <div style="padding:18px 0;border-bottom:1px solid #eee;">
      <div style="font-size:13px;color:${sev.color};font-weight:600;letter-spacing:0.02em;text-transform:uppercase;margin-bottom:4px;">${sev.label} · ${earned}</div>
      <div style="font-size:17px;font-weight:600;color:#1c1c1e;margin-bottom:6px;">${f.title}</div>
      <div style="font-size:14px;color:#374151;line-height:1.55;margin-bottom:8px;">${f.detail}</div>
      <div style="font-size:14px;color:#4b5563;line-height:1.55;"><strong style="color:#d65a31;">What I'd do:</strong> ${f.recommendation}</div>
    </div>
  `;
}

export function renderFullReportHtml(report: AuditReport): string {
  const findings = report.findings;
  const issues = findings.filter((f) => f.severity !== "pass");
  const passing = findings.filter((f) => f.severity === "pass");

  const scoreColor = report.score >= 80 ? "#30a46c" : report.score >= 60 ? "#d65a31" : "#c6443a";

  return `<!doctype html>
<html><head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1c1c1e;">
  <div style="max-width:640px;margin:0 auto;background:#fff;padding:32px 28px;">

    <div style="font-size:13px;color:#6b7280;letter-spacing:0.04em;text-transform:uppercase;font-weight:600;margin-bottom:6px;">
      Website Health Check · ZeroRemake
    </div>
    <div style="font-size:28px;font-weight:800;color:#1c1c1e;letter-spacing:-0.02em;line-height:1.15;margin-bottom:6px;">
      ${report.domain}
    </div>
    <div style="font-size:14px;color:#6b7280;margin-bottom:28px;">
      Your full website audit, prepared by ZeroRemake.
    </div>

    <div style="display:flex;align-items:center;gap:20px;background:#fafaf9;padding:20px 22px;border-radius:14px;margin-bottom:28px;">
      <div style="font-size:48px;font-weight:800;color:${scoreColor};letter-spacing:-0.02em;line-height:1;">${report.score}</div>
      <div>
        <div style="font-size:15px;font-weight:600;color:#1c1c1e;margin-bottom:2px;">${report.grade}</div>
        <div style="font-size:13px;color:#6b7280;">Out of 100 · ${issues.length} issue${issues.length === 1 ? "" : "s"} found, ${passing.length} passing checks</div>
      </div>
    </div>

    <h2 style="font-size:20px;font-weight:700;color:#1c1c1e;margin:0 0 4px 0;letter-spacing:-0.015em;">What to fix, in order</h2>
    <div style="font-size:13.5px;color:#6b7280;margin-bottom:8px;">Highest impact first. Don't try to fix them all at once — start with the top two or three.</div>

    ${issues.map(renderFindingHtml).join("")}

    ${
      passing.length > 0
        ? `<h2 style="font-size:20px;font-weight:700;color:#1c1c1e;margin:32px 0 4px 0;letter-spacing:-0.015em;">What's already working</h2>
    <div style="font-size:13.5px;color:#6b7280;margin-bottom:8px;">Keep these in place — they're pulling their weight.</div>
    ${passing.map(renderFindingHtml).join("")}`
        : ""
    }

    <div style="margin-top:36px;padding:24px;background:#fafaf9;border-radius:16px;">
      <div style="font-size:19px;font-weight:700;color:#1c1c1e;margin-bottom:10px;letter-spacing:-0.015em;">Want help fixing this?</div>
      <div style="font-size:14.5px;color:#374151;line-height:1.6;margin-bottom:16px;">
        Reply to this email or schedule a quick call. We'll walk through your
        site and show what to fix first — based on what actually drives leads.
        Twenty minutes, no pitch.
      </div>
      <a href="https://zeroremake.com/walkthrough"
        style="display:inline-block;background:#d65a31;color:#fff;padding:12px 22px;border-radius:999px;font-size:14px;font-weight:600;text-decoration:none;">
        Schedule a quick call
      </a>
    </div>

    <div style="margin-top:36px;font-size:13px;color:#6b7280;line-height:1.55;">
      — Prepared by ZeroRemake
    </div>

    <div style="margin-top:28px;padding-top:18px;border-top:1px solid #eee;font-size:11px;color:#9ca3af;line-height:1.5;">
      This report is based on a snapshot of the home page. A deeper scan covering competitor comparison and multi-page analysis is available — reply to this email to request one.
    </div>
  </div>
</body></html>`;
}

export async function sendFullReportEmail(to: string, report: AuditReport): Promise<SendResult> {
  return sendRaw({
    to,
    subject: `Your ${report.domain} website audit (${report.score}/100)`,
    html: renderFullReportHtml(report),
    fromName: "ZeroRemake",
    replyTo: "steve@zeroremake.com",
    kind: "full_report",
    domain: report.domain,
  });
}

// ── Owner notification — fired alongside the prospect email ────────

export async function sendInternalAlertEmail(params: {
  kind: "email_captured" | "call_booked";
  report?: AuditReport;
  domain: string;
  score: number;
  email?: string | null;
  name?: string | null;
  phone?: string | null;
  notes?: string | null;
  auditId: string;
}): Promise<SendResult> {
  const to = process.env.AUDIT_INTERNAL_ALERT_TO || INTERNAL_DEFAULT;
  // Per product spec: "New audit lead: [domain] (Score: XX)" for the
  // email_captured event. Keep the call_booked subject distinct so it
  // sorts naturally in the inbox.
  const subject =
    params.kind === "call_booked"
      ? `Call booked: ${params.domain} (Score: ${params.score})`
      : `New audit lead: ${params.domain} (Score: ${params.score})`;

  const topIssue = params.report?.topThree?.[0];

  const rows: string[] = [];
  rows.push(`<tr><td style="color:#6b7280;padding:4px 12px 4px 0;">Domain</td><td style="font-weight:600;">${params.domain}</td></tr>`);
  rows.push(`<tr><td style="color:#6b7280;padding:4px 12px 4px 0;">Score</td><td style="font-weight:600;">${params.score}/100</td></tr>`);
  if (params.email) rows.push(`<tr><td style="color:#6b7280;padding:4px 12px 4px 0;">Email</td><td>${params.email}</td></tr>`);
  if (params.name) rows.push(`<tr><td style="color:#6b7280;padding:4px 12px 4px 0;">Name</td><td>${params.name}</td></tr>`);
  if (params.phone) rows.push(`<tr><td style="color:#6b7280;padding:4px 12px 4px 0;">Phone</td><td>${params.phone}</td></tr>`);
  if (params.notes) rows.push(`<tr><td style="color:#6b7280;padding:4px 12px 4px 0;">Notes</td><td>${params.notes}</td></tr>`);
  rows.push(`<tr><td style="color:#6b7280;padding:4px 12px 4px 0;">Audit ID</td><td style="font-family:monospace;font-size:12px;color:#6b7280;">${params.auditId}</td></tr>`);

  const topIssueBlock = topIssue
    ? `<div style="margin-top:20px;padding:14px 18px;background:#fafaf9;border-radius:10px;">
        <div style="font-size:11px;font-weight:600;color:#6b7280;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:4px;">Top issue</div>
        <div style="font-size:15px;font-weight:600;color:#1c1c1e;margin-bottom:4px;">${topIssue.title}</div>
        <div style="font-size:13.5px;color:#374151;line-height:1.5;">${topIssue.detail}</div>
      </div>`
    : "";

  const html = `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:20px;color:#1c1c1e;">
    <h2 style="margin:0 0 12px 0;font-size:18px;font-weight:700;">${params.kind === "call_booked" ? "Call booked" : "New audit lead"}</h2>
    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">${rows.join("")}</table>
    ${topIssueBlock}
    <div style="margin-top:24px;font-size:12px;color:#9ca3af;">
      Sent by zeroremake.com/audit
    </div>
  </body></html>`;

  return sendRaw({
    to,
    subject,
    html,
    fromName: "ZeroRemake Audit",
    kind: params.kind === "call_booked" ? "owner_call_alert" : "owner_lead_alert",
    domain: params.domain,
  });
}

// ── Manual-review request alert ────────────────────────────────────
// Fired when a visitor's scan was blocked by the target site's anti-bot
// protection AND they opted into a manual review by leaving their email.
// Steve does the audit by hand and replies to the user directly.

export async function sendManualReviewAlertEmail(params: {
  domain: string;
  url: string;
  email: string;
  reason: string;
  auditId: string;
}): Promise<SendResult> {
  const to = process.env.AUDIT_INTERNAL_ALERT_TO || INTERNAL_DEFAULT;
  const subject = `Manual review requested: ${params.domain}`;

  const rows: string[] = [];
  rows.push(`<tr><td style="color:#6b7280;padding:4px 12px 4px 0;">Domain</td><td style="font-weight:600;">${params.domain}</td></tr>`);
  rows.push(`<tr><td style="color:#6b7280;padding:4px 12px 4px 0;">URL</td><td><a href="${params.url}" style="color:#0a84ff;">${params.url}</a></td></tr>`);
  rows.push(`<tr><td style="color:#6b7280;padding:4px 12px 4px 0;">User email</td><td><a href="mailto:${params.email}" style="color:#0a84ff;">${params.email}</a></td></tr>`);
  rows.push(`<tr><td style="color:#6b7280;padding:4px 12px 4px 0;">Reason</td><td>${params.reason}</td></tr>`);
  rows.push(`<tr><td style="color:#6b7280;padding:4px 12px 4px 0;">Audit ID</td><td style="font-family:monospace;font-size:12px;color:#6b7280;">${params.auditId}</td></tr>`);

  const html = `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:20px;color:#1c1c1e;">
    <h2 style="margin:0 0 12px 0;font-size:18px;font-weight:700;">Manual audit review requested</h2>
    <p style="margin:0 0 16px 0;font-size:14px;color:#374151;line-height:1.5;">
      The automated scanner couldn't reach this site (target blocks bots). The user opted into a manual review and is waiting for an emailed report.
    </p>
    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">${rows.join("")}</table>
    <div style="margin-top:24px;font-size:12px;color:#9ca3af;">
      Sent by zeroremake.com/audit
    </div>
  </body></html>`;

  return sendRaw({
    to,
    subject,
    html,
    fromName: "ZeroRemake Audit",
    kind: "owner_manual_review_alert",
    domain: params.domain,
    replyTo: params.email,
  });
}

// ── Walkthrough request alert ──────────────────────────────────────
// Fired when someone fills out the /walkthrough form. Routes the lead
// straight to Steve so he can call them back within 24 hours.

export async function sendWalkthroughRequestAlertEmail(params: {
  name: string;
  phone: string | null;
  notes: string | null;
  requestId: string;
}): Promise<SendResult> {
  const to = process.env.AUDIT_INTERNAL_ALERT_TO || INTERNAL_DEFAULT;
  const subject = `Walkthrough request: ${params.name}`;

  const rows: string[] = [];
  rows.push(`<tr><td style="color:#6b7280;padding:4px 12px 4px 0;">Name</td><td style="font-weight:600;">${params.name}</td></tr>`);
  if (params.phone) {
    rows.push(`<tr><td style="color:#6b7280;padding:4px 12px 4px 0;">Phone</td><td><a href="tel:${params.phone}" style="color:#0a84ff;">${params.phone}</a></td></tr>`);
  }
  if (params.notes) {
    rows.push(`<tr><td style="color:#6b7280;padding:4px 12px 4px 0;vertical-align:top;">Notes</td><td>${params.notes.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</td></tr>`);
  }
  rows.push(`<tr><td style="color:#6b7280;padding:4px 12px 4px 0;">Request ID</td><td style="font-family:monospace;font-size:12px;color:#6b7280;">${params.requestId}</td></tr>`);

  const html = `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:20px;color:#1c1c1e;">
    <h2 style="margin:0 0 12px 0;font-size:18px;font-weight:700;">New walkthrough request</h2>
    <p style="margin:0 0 16px 0;font-size:14px;color:#374151;line-height:1.5;">
      Someone filled out the /walkthrough form. They're expecting a call within 24 hours.
    </p>
    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">${rows.join("")}</table>
    <div style="margin-top:24px;font-size:12px;color:#9ca3af;">
      Sent by zeroremake.com/walkthrough
    </div>
  </body></html>`;

  return sendRaw({
    to,
    subject,
    html,
    fromName: "ZeroRemake",
    kind: "owner_walkthrough_alert",
    domain: "walkthrough",
  });
}

// ── Plain-text test email (used by /api/test-email) ─────────────────

export async function sendTestEmail(to: string): Promise<SendResult> {
  const html = `<!doctype html><html><body style="font-family:-apple-system,sans-serif;padding:20px;color:#1c1c1e;">
    <h2 style="margin:0 0 12px 0;font-size:18px;font-weight:700;">Test email working</h2>
    <p style="margin:0 0 12px 0;font-size:14px;color:#374151;">
      If you got this, email is working.
    </p>
    <p style="margin:0;font-size:12px;color:#9ca3af;">
      Sent from zeroremake.com/api/test-email at ${new Date().toISOString()}.
    </p>
  </body></html>`;

  return sendRaw({
    to,
    subject: "Test email working",
    html,
    fromName: "ZeroRemake Audit",
    kind: "test_probe",
  });
}
