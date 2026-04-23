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
// Every send logs explicitly to stdout/stderr so Vercel's runtime logs
// make it easy to see who got what and whether Resend accepted it.

import type { AuditReport, Finding } from "./types";

const FROM_DEFAULT = "noreply@zeroremake.com";
const INTERNAL_DEFAULT = "wiezski@gmail.com";

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
}

async function sendRaw(params: {
  to: string;
  subject: string;
  html: string;
  fromName?: string;
  replyTo?: string;
  /** Short tag for logs — e.g. "full_report" or "owner_alert". */
  kind: string;
  /** The domain this send relates to, for log correlation. */
  domain?: string;
}): Promise<SendResult> {
  const apiKey = getResendKey();
  if (!apiKey) {
    return { ok: false, error: "Resend API key missing or invalid" };
  }

  const fromAddr = process.env.EMAIL_FROM_ADDRESS || FROM_DEFAULT;
  const fromName = params.fromName || "ZeroRemake";
  const from = `${fromName} <${fromAddr}>`;

  console.log(
    `[audit/email] Sending ${params.kind} to:`,
    params.to,
    params.domain ? `for domain: ${params.domain}` : "",
    `subject: "${params.subject}"`,
  );

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
      console.error(
        `[audit/email] ${params.kind} FAILED to:`,
        params.to,
        params.domain ? `domain: ${params.domain}` : "",
        "error:",
        message,
        "raw:",
        data,
      );
      return { ok: false, error: message };
    }
    console.log(
      `[audit/email] ${params.kind} sent successfully to:`,
      params.to,
      params.domain ? `domain: ${params.domain}` : "",
      "message_id:",
      data?.id || "(no id returned)",
    );
    return { ok: true, id: data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[audit/email] ${params.kind} FAILED to:`,
      params.to,
      params.domain ? `domain: ${params.domain}` : "",
      "error:",
      message,
    );
    return { ok: false, error: message };
  }
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
      Your full website audit, prepared by Steve at ZeroRemake Studio.
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
      <div style="font-size:19px;font-weight:700;color:#1c1c1e;margin-bottom:8px;letter-spacing:-0.015em;">Want me to walk through this with you?</div>
      <div style="font-size:14.5px;color:#374151;line-height:1.55;margin-bottom:16px;">
        I've seen exactly where businesses like yours lose leads — I can show you what actually moves the needle.
        Twenty minutes, no pitch.
      </div>
      <a href="https://zeroremake.com/audit?book=${encodeURIComponent(report.domain)}"
        style="display:inline-block;background:#d65a31;color:#fff;padding:12px 22px;border-radius:999px;font-size:14px;font-weight:600;text-decoration:none;">
        Book the walkthrough call
      </a>
    </div>

    <div style="margin-top:36px;font-size:13px;color:#6b7280;line-height:1.55;">
      — Steve · ZeroRemake Studio<br/>
      I've run installs, managed teams, and fixed the ops problems you're probably dealing with. ZeroRemake exists because the tools out there weren't getting the job done.
    </div>

    <div style="margin-top:28px;padding-top:18px;border-top:1px solid #eee;font-size:11px;color:#9ca3af;line-height:1.5;">
      This report is based on a snapshot of the home page. A deeper scan covering competitor comparison and multi-page analysis is available — just reply to this email.
    </div>
  </div>
</body></html>`;
}

export async function sendFullReportEmail(to: string, report: AuditReport): Promise<SendResult> {
  return sendRaw({
    to,
    subject: `Your ${report.domain} website audit (${report.score}/100)`,
    html: renderFullReportHtml(report),
    fromName: "Steve at ZeroRemake",
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
