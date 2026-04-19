// ── SMS API Route ──────────────────────────────────────────────
// POST /api/sms
//
// Sends an SMS via Twilio when enabled, otherwise returns a fallback
// sms: link for the client to open natively.
//
// Body: {
//   to: string        — recipient phone number
//   message: string   — message body
//   companyId: string  — for looking up Twilio credentials
// }

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY required");
  return createClient(url, key);
}

// Format phone number to E.164
function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.startsWith("+")) return phone.replace(/[^\d+]/g, "");
  return `+${digits}`;
}

export async function POST(req: NextRequest) {
  try {
    const { to, message, companyId } = await req.json();

    if (!to || !message || !companyId) {
      return NextResponse.json({ error: "Missing required fields: to, message, companyId" }, { status: 400 });
    }

    const admin = getAdminClient();

    // Check if company has SMS enabled and has Twilio credentials
    const { data: company } = await admin.from("companies")
      .select("sms_enabled, twilio_account_sid, twilio_auth_token, twilio_phone_number")
      .eq("id", companyId)
      .single();

    if (!company?.sms_enabled || !company.twilio_account_sid || !company.twilio_auth_token || !company.twilio_phone_number) {
      // SMS not enabled — return fallback for client-side sms: link
      return NextResponse.json({
        sent: false,
        fallback: true,
        smsLink: `sms:${to}?body=${encodeURIComponent(message)}`,
        message: "SMS integration not enabled. Opening native messaging app.",
      });
    }

    // Send via Twilio REST API (no SDK needed)
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${company.twilio_account_sid}/Messages.json`;
    const authHeader = "Basic " + Buffer.from(`${company.twilio_account_sid}:${company.twilio_auth_token}`).toString("base64");

    const formData = new URLSearchParams();
    formData.append("To", toE164(to));
    formData.append("From", company.twilio_phone_number);
    formData.append("Body", message);

    const twilioRes = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });

    const twilioData = await twilioRes.json();

    if (!twilioRes.ok) {
      console.error("[sms] Twilio error:", twilioData);
      return NextResponse.json({
        sent: false,
        fallback: true,
        smsLink: `sms:${to}?body=${encodeURIComponent(message)}`,
        error: twilioData.message || "Twilio send failed",
      });
    }

    // Log the SMS (non-blocking)
    try {
      await admin.from("activity_log").insert([{
        company_id: companyId,
        type: "sms_sent",
        description: `SMS sent to ${to}: ${message.slice(0, 100)}${message.length > 100 ? "..." : ""}`,
        metadata: { to, twilio_sid: twilioData.sid },
      }]);
    } catch { /* Don't fail on log errors */ }

    return NextResponse.json({
      sent: true,
      sid: twilioData.sid,
      message: "SMS sent successfully",
    });
  } catch (err: any) {
    console.error("[sms] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
