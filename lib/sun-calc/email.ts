// Email helpers for the Sun & Heat Calculator.
//
// Uses the same Resend-backed sendRaw() pattern as lib/audit/email.ts,
// but scoped to its own sender name + copy.

import type { SunCalcResult, SunCalcInput } from "./scoring";
import { DIRECTION_LABEL, PROBLEM_LABEL, ROOM_LABEL, PREFERENCE_LABEL } from "./scoring";

const FROM_DEFAULT = "noreply@zeroremake.com";
const INTERNAL_DEFAULT = "wiezski@gmail.com";

interface SendResult { ok: boolean; error?: string; id?: string; }

async function sendRaw(params: {
  to: string; subject: string; html: string; fromName?: string; replyTo?: string;
  kind: string;
}): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("[sun-calc/email] Resend API key missing or invalid — set RESEND_API_KEY.");
    return { ok: false, error: "Resend API key missing or invalid" };
  }
  if (!apiKey.startsWith("re_") || apiKey.length < 20) {
    console.error("[sun-calc/email] Resend API key missing or invalid — doesn't look like a Resend key.");
    return { ok: false, error: "Resend API key missing or invalid" };
  }
  const fromAddr = process.env.EMAIL_FROM_ADDRESS || FROM_DEFAULT;
  const from = `${params.fromName || "ZeroRemake"} <${fromAddr}>`;
  console.log(`[sun-calc/email] Sending ${params.kind} to: ${params.to} subject: "${params.subject}"`);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from, to: [params.to], subject: params.subject, html: params.html,
        reply_to: params.replyTo || "steve@zeroremake.com",
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.message || `Resend HTTP ${res.status}`;
      console.error(`[sun-calc/email] ${params.kind} FAILED: ${msg}`);
      return { ok: false, error: msg };
    }
    console.log(`[sun-calc/email] ${params.kind} sent successfully — id: ${data?.id || "?"}`);
    return { ok: true, id: data?.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[sun-calc/email] ${params.kind} FAILED: ${msg}`);
    return { ok: false, error: msg };
  }
}

// ─── Branded HTML result email (prospect) ───────────────────────

function scoreColor(score: number): string {
  if (score >= 75) return "#c6443a";
  if (score >= 55) return "#d65a31";
  if (score >= 35) return "#e08a00";
  return "#30a46c";
}

function renderCategory(cat: SunCalcResult["bestOverall"], label: string, labelColor: string) {
  return `
    <div style="padding:16px 18px;background:#fafaf9;border-radius:12px;margin-bottom:10px;">
      <div style="font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${labelColor};margin-bottom:4px;">${label}</div>
      <div style="font-size:16px;font-weight:700;color:#1c1c1e;margin-bottom:4px;">${cat.name}</div>
      <div style="font-size:13.5px;color:#4b5563;line-height:1.5;">${cat.blurb}</div>
    </div>
  `;
}

export function renderSunCalcResultHtml(
  input: SunCalcInput,
  result: SunCalcResult,
): string {
  const color = scoreColor(result.score);

  return `<!doctype html>
<html><head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1c1c1e;">
  <div style="max-width:640px;margin:0 auto;background:#fff;padding:32px 28px;">

    <div style="font-size:13px;color:#6b7280;letter-spacing:0.04em;text-transform:uppercase;font-weight:600;margin-bottom:6px;">
      Sun &amp; Heat Calculator · ZeroRemake
    </div>
    <div style="font-size:26px;font-weight:800;color:#1c1c1e;letter-spacing:-0.018em;line-height:1.2;margin-bottom:6px;">
      Your window treatment recommendation
    </div>
    <div style="font-size:14px;color:#6b7280;margin-bottom:24px;">
      Based on what you told us about your home.
    </div>

    <div style="display:flex;align-items:center;gap:20px;background:#fafaf9;padding:20px 22px;border-radius:14px;margin-bottom:22px;">
      <div style="font-size:44px;font-weight:800;color:${color};letter-spacing:-0.02em;line-height:1;">${result.score}</div>
      <div>
        <div style="font-size:15px;font-weight:600;color:#1c1c1e;margin-bottom:2px;">${result.band} sun &amp; heat exposure</div>
        <div style="font-size:13px;color:#6b7280;">${result.headline}</div>
      </div>
    </div>

    <table cellpadding="4" cellspacing="0" style="font-size:13.5px;color:#4b5563;margin-bottom:20px;">
      <tr><td style="color:#6b7280;padding:2px 10px 2px 0;">Direction</td><td>${DIRECTION_LABEL[input.facing]}</td></tr>
      <tr><td style="color:#6b7280;padding:2px 10px 2px 0;">Main problem</td><td>${PROBLEM_LABEL[input.problem]}</td></tr>
      <tr><td style="color:#6b7280;padding:2px 10px 2px 0;">Room</td><td>${ROOM_LABEL[input.room]}</td></tr>
      <tr><td style="color:#6b7280;padding:2px 10px 2px 0;">Preference</td><td>${PREFERENCE_LABEL[input.preference]}</td></tr>
    </table>

    <div style="font-size:14.5px;color:#374151;line-height:1.6;margin-bottom:24px;">
      ${result.summary}
    </div>

    <div style="font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;margin-bottom:10px;">
      Top recommendations
    </div>

    ${renderCategory(result.bestOverall, "Best overall", "#d65a31")}
    ${result.bestBudget ? renderCategory(result.bestBudget, "Best budget option", "#1d8052") : ""}
    ${result.bestPremium && result.bestPremium.id !== result.bestOverall.id
      ? renderCategory(result.bestPremium, "Best premium option", "#1b2a4e") : ""}

    <div style="margin-top:32px;padding:22px;background:#fafaf9;border-radius:16px;">
      <div style="font-size:18px;font-weight:700;color:#1c1c1e;margin-bottom:8px;letter-spacing:-0.012em;">
        Want me to walk through this with you?
      </div>
      <div style="font-size:14px;color:#374151;line-height:1.55;margin-bottom:14px;">
        I’ve been in thousands of homes measuring and installing window treatments.
        If you want a second set of eyes before you buy, reply to this email or
        book a call and I’ll walk through your specific windows with you.
      </div>
      <a href="https://zeroremake.com/sun-calculator?book=1"
        style="display:inline-block;background:#d65a31;color:#fff;padding:11px 20px;border-radius:999px;font-size:14px;font-weight:600;text-decoration:none;">
        Talk through this with Steve
      </a>
    </div>

    <div style="margin-top:28px;font-size:13px;color:#6b7280;line-height:1.55;">
      — Steve · ZeroRemake<br/>
      These are estimates based on general product guidance and the direction/conditions you reported. Actual performance varies by product line, installation quality, and existing window construction.
    </div>
  </div>
</body></html>`;
}

export async function sendSunCalcResultEmail(
  to: string,
  input: SunCalcInput,
  result: SunCalcResult,
): Promise<SendResult> {
  return sendRaw({
    to,
    subject: `Your window treatment recommendation (${result.band} exposure)`,
    html: renderSunCalcResultHtml(input, result),
    fromName: "Steve at ZeroRemake",
    replyTo: "steve@zeroremake.com",
    kind: "sun_calc_result",
  });
}

// ─── Owner alert ────────────────────────────────────────────────

export async function sendSunCalcOwnerAlert(params: {
  kind: "email_captured" | "call_booked";
  input: SunCalcInput;
  result: SunCalcResult;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  id: string;
}): Promise<SendResult> {
  const to = process.env.AUDIT_INTERNAL_ALERT_TO || INTERNAL_DEFAULT;
  const addrBit = params.input.address ? params.input.address : "no address";
  const subject =
    params.kind === "call_booked"
      ? `Sun calc — call booked: ${addrBit} (Score: ${params.result.score})`
      : `New sun calc lead: ${addrBit} (Score: ${params.result.score})`;

  const rows: string[] = [];
  if (params.name) rows.push(`<tr><td style="color:#6b7280;padding:4px 12px 4px 0;">Name</td><td style="font-weight:600;">${params.name}</td></tr>`);
  if (params.email) rows.push(`<tr><td style="color:#6b7280;padding:4px 12px 4px 0;">Email</td><td>${params.email}</td></tr>`);
  if (params.phone) rows.push(`<tr><td style="color:#6b7280;padding:4px 12px 4px 0;">Phone</td><td>${params.phone}</td></tr>`);
  if (params.input.address) rows.push(`<tr><td style="color:#6b7280;padding:4px 12px 4px 0;">Address</td><td>${params.input.address}</td></tr>`);
  rows.push(`<tr><td style="color:#6b7280;padding:4px 12px 4px 0;">Direction</td><td>${DIRECTION_LABEL[params.input.facing]}</td></tr>`);
  rows.push(`<tr><td style="color:#6b7280;padding:4px 12px 4px 0;">Problem</td><td>${PROBLEM_LABEL[params.input.problem]}</td></tr>`);
  rows.push(`<tr><td style="color:#6b7280;padding:4px 12px 4px 0;">Room</td><td>${ROOM_LABEL[params.input.room]}</td></tr>`);
  rows.push(`<tr><td style="color:#6b7280;padding:4px 12px 4px 0;">Preference</td><td>${PREFERENCE_LABEL[params.input.preference]}</td></tr>`);
  rows.push(`<tr><td style="color:#6b7280;padding:4px 12px 4px 0;">Score</td><td style="font-weight:600;">${params.result.score}/100  (${params.result.band})</td></tr>`);
  rows.push(`<tr><td style="color:#6b7280;padding:4px 12px 4px 0;">Top pick</td><td>${params.result.bestOverall.name}</td></tr>`);
  if (params.notes) rows.push(`<tr><td style="color:#6b7280;padding:4px 12px 4px 0;">Notes</td><td>${params.notes}</td></tr>`);
  rows.push(`<tr><td style="color:#6b7280;padding:4px 12px 4px 0;">Row ID</td><td style="font-family:monospace;font-size:12px;color:#6b7280;">${params.id}</td></tr>`);

  const html = `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:20px;color:#1c1c1e;">
    <h2 style="margin:0 0 12px 0;font-size:18px;font-weight:700;">${params.kind === "call_booked" ? "Call booked" : "New sun calc lead"}</h2>
    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">${rows.join("")}</table>
    <div style="margin-top:24px;font-size:12px;color:#9ca3af;">Sent by zeroremake.com/sun-calculator</div>
  </body></html>`;

  return sendRaw({
    to,
    subject,
    html,
    fromName: "ZeroRemake Sun Calc",
    kind: params.kind === "call_booked" ? "sun_calc_owner_call" : "sun_calc_owner_lead",
  });
}
