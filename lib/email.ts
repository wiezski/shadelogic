// ── ZeroRemake Email Utility ──────────────────────────────────
// Uses Resend (https://resend.com) for transactional email.
// Free tier: 100 emails/day, 3,000/month.
//
// Required env vars:
//   RESEND_API_KEY        — from resend.com dashboard
//   EMAIL_FROM_ADDRESS    — verified sender (e.g. noreply@yourdomain.com)
//                           or use "onboarding@resend.dev" for testing
//   NEXT_PUBLIC_APP_URL   — your deployed URL (for links in emails)
//
// All emails are logged to the `email_log` table via Supabase service role.

import { createClient } from "@supabase/supabase-js";

// ── Types ────────────────────────────────────────────────────

export type EmailType =
  | "appointment_confirmation"
  | "appointment_reminder"
  | "quote_delivery"
  | "install_followup"
  | "password_reset"
  | "trial_reminder"
  | "custom";

export type SendEmailParams = {
  to: string;
  subject: string;
  html: string;
  type: EmailType;
  customerId?: string;
  appointmentId?: string;
  quoteId?: string;
  companyId: string;
  replyTo?: string;
  /** Override the "from" display name (dealer's company name) */
  fromName?: string;
  /** Override the reply-to with dealer's email */
  fromEmail?: string;
};

export type SendEmailResult = {
  success: boolean;
  messageId?: string;
  error?: string;
};

// ── Supabase admin client (service role for logging) ─────────

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for email logging");
  return createClient(url, key);
}

// ── Send email via Resend ────────────────────────────────────

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("[email] RESEND_API_KEY not set — skipping send");
    return { success: false, error: "RESEND_API_KEY not configured" };
  }

  // The "from" address must be a verified domain in Resend.
  // We use the platform's verified domain but customize the display name
  // with the dealer's company name so customers see who it's from.
  // Reply-to goes to the dealer's actual email so responses reach them directly.
  const platformDomain = process.env.EMAIL_FROM_ADDRESS || "noreply@zeroremake.com";
  const displayName = params.fromName || "ZeroRemake";
  const from = `${displayName} <${platformDomain.includes("@") ? platformDomain.split("<").pop()?.replace(">", "").trim() || platformDomain : platformDomain}>`;
  const replyTo = params.replyTo || params.fromEmail || undefined;

  // White-label logo injection: if this is a customer-facing email (anything
  // other than system types) and the sending company has a Business plan
  // with a logo set, inject their logo at the top of the email body before
  // sending. No-op for system emails or lower-plan tenants.
  let finalHtml = params.html;
  const isCustomerFacing = params.type !== "password_reset" && params.type !== "trial_reminder" && params.type !== "custom";
  if (isCustomerFacing && params.companyId) {
    try {
      const admin = getAdminClient();
      const { data: brand } = await admin
        .from("companies")
        .select("plan, brand_logo_url")
        .eq("id", params.companyId)
        .single();
      if (brand?.brand_logo_url && (brand.plan === "business" || brand.plan === "trial")) {
        const logoBlock = `<div style="text-align:center;margin-bottom:24px;"><img src="${brand.brand_logo_url}" alt="Logo" style="max-height:60px;max-width:240px;object-fit:contain;" /></div>`;
        // Inject inside the card, right after <div class="card">
        finalHtml = finalHtml.replace('<div class="card">', `<div class="card">${logoBlock}`);
      }
    } catch (err) {
      // Non-fatal — just log and send without logo
      console.warn("[email] brand lookup failed, sending without logo:", err);
    }
  }

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
        html: finalHtml,
        reply_to: replyTo,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("[email] Resend error:", data);
      await logEmail(params, false, undefined, data.message || JSON.stringify(data));
      return { success: false, error: data.message || "Resend API error" };
    }

    const messageId = data.id;
    await logEmail(params, true, messageId);
    return { success: true, messageId };
  } catch (err: any) {
    console.error("[email] Send failed:", err);
    await logEmail(params, false, undefined, err.message);
    return { success: false, error: err.message };
  }
}

// ── Log email to database ────────────────────────────────────

async function logEmail(
  params: SendEmailParams,
  success: boolean,
  messageId?: string,
  errorMsg?: string,
) {
  try {
    const admin = getAdminClient();
    await admin.from("email_log").insert([{
      company_id: params.companyId,
      customer_id: params.customerId || null,
      appointment_id: params.appointmentId || null,
      quote_id: params.quoteId || null,
      type: params.type,
      to_email: params.to,
      subject: params.subject,
      status: success ? "sent" : "failed",
      resend_message_id: messageId || null,
      error: errorMsg || null,
    }]);
  } catch (err) {
    // Don't let logging failure break the email flow
    console.error("[email] Failed to log email:", err);
  }
}

// ── Email template wrapper ───────────────────────────────────
// Wraps content in a clean, branded email layout.

export function emailLayout(body: string, companyName?: string): string {
  // Footer note: show the installer's business name for customer-facing
  // emails. For system emails sent TO an installer (no companyName passed
  // in) — trial reminders, password reset — we fall back to "ZeroRemake"
  // since those genuinely come from us.
  const brand = companyName || "ZeroRemake";
  const isSystemEmail = !companyName;
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body { margin: 0; padding: 0; background: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .wrap { max-width: 560px; margin: 0 auto; padding: 32px 16px; }
    .card { background: #ffffff; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .footer { text-align: center; padding: 20px 0 0; font-size: 12px; color: #9ca3af; }
    h1 { margin: 0 0 16px; font-size: 20px; color: #111827; font-weight: 700; }
    p { margin: 0 0 14px; font-size: 15px; line-height: 1.6; color: #374151; }
    .btn { display: inline-block; background: #e63000; color: #ffffff !important; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 15px; margin: 8px 0; }
    .detail { background: #f9fafb; border-radius: 8px; padding: 16px; margin: 16px 0; }
    .detail-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 14px; }
    .detail-label { color: #6b7280; }
    .detail-value { color: #111827; font-weight: 500; }
    .muted { color: #9ca3af; font-size: 13px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      ${body}
    </div>
    <div class="footer">
      ${isSystemEmail ? "ZeroRemake" : `Sent by ${brand}`}
    </div>
  </div>
</body>
</html>`;
}
