// ── Send Email API Route ──────────────────────────────────────
// POST /api/send-email
//
// Sends a transactional email via Resend and logs it.
// Called from the front-end after user confirms sending.
//
// Body: {
//   type: "appointment_confirmation" | "appointment_reminder" | "quote_delivery" | "install_followup" | "quote_followup" | "custom"
//   to: string (email address)
//   customerId?: string
//   appointmentId?: string
//   quoteId?: string
//   companyId: string
//   companyName: string
//   companyPhone?: string
//   googleReviewLink?: string
//   replyTo?: string
//   // Type-specific fields:
//   customerFirstName: string
//   appointmentType?: string
//   scheduledAt?: string
//   durationMinutes?: number
//   address?: string
//   quoteNumber?: string
//   totalAmount?: string
//   validDays?: number
//   daysSinceSent?: number
//   // For "custom" type:
//   subject?: string
//   html?: string
// }

import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "../../../lib/email";
import {
  appointmentConfirmation,
  appointmentReminder,
  quoteDelivery,
  installFollowup,
  quoteFollowup,
  passwordReset,
} from "../../../lib/email-templates";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      type, to, customerId, appointmentId, quoteId,
      companyId, companyName, companyPhone, googleReviewLink, replyTo,
      customerFirstName, appointmentType, scheduledAt, durationMinutes,
      address, quoteNumber, totalAmount, validDays, daysSinceSent,
      subject: customSubject, html: customHtml,
    } = body;

    if (!to || !type || !companyId) {
      return NextResponse.json({ error: "Missing required fields: to, type, companyId" }, { status: 400 });
    }

    let subject: string;
    let html: string;

    switch (type) {
      case "appointment_confirmation": {
        const tpl = appointmentConfirmation({
          customerFirstName: customerFirstName || "there",
          appointmentType: appointmentType || "appointment",
          scheduledAt: scheduledAt || new Date().toISOString(),
          durationMinutes: durationMinutes || 60,
          address,
          companyName: companyName || "Your Provider",
          companyPhone,
        });
        subject = tpl.subject;
        html = tpl.html;
        break;
      }

      case "appointment_reminder": {
        const tpl = appointmentReminder({
          customerFirstName: customerFirstName || "there",
          appointmentType: appointmentType || "appointment",
          scheduledAt: scheduledAt || new Date().toISOString(),
          address,
          companyName: companyName || "Your Provider",
          companyPhone,
        });
        subject = tpl.subject;
        html = tpl.html;
        break;
      }

      case "quote_delivery": {
        if (!quoteId) {
          return NextResponse.json({ error: "quoteId required for quote_delivery" }, { status: 400 });
        }
        const tpl = quoteDelivery({
          customerFirstName: customerFirstName || "there",
          quoteNumber: quoteNumber || quoteId.slice(0, 8),
          quoteId,
          totalAmount: totalAmount || "$0",
          validDays: validDays || 30,
          companyName: companyName || "Your Provider",
          companyPhone,
        });
        subject = tpl.subject;
        html = tpl.html;
        break;
      }

      case "install_followup": {
        const tpl = installFollowup({
          customerFirstName: customerFirstName || "there",
          companyName: companyName || "Your Provider",
          googleReviewLink,
        });
        subject = tpl.subject;
        html = tpl.html;
        break;
      }

      case "quote_followup": {
        if (!quoteId) {
          return NextResponse.json({ error: "quoteId required for quote_followup" }, { status: 400 });
        }
        const tpl = quoteFollowup({
          customerFirstName: customerFirstName || "there",
          quoteId,
          daysSinceSent: daysSinceSent || 3,
          companyName: companyName || "Your Provider",
        });
        subject = tpl.subject;
        html = tpl.html;
        break;
      }

      case "custom": {
        if (!customSubject || !customHtml) {
          return NextResponse.json({ error: "subject and html required for custom type" }, { status: 400 });
        }
        subject = customSubject;
        html = customHtml;
        break;
      }

      default:
        return NextResponse.json({ error: `Unknown email type: ${type}` }, { status: 400 });
    }

    // Look up the dealer's company email so replies go to them, not to us
    let dealerEmail: string | undefined;
    if (companyId && !replyTo) {
      try {
        const { createClient } = await import("@supabase/supabase-js");
        const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
        const { data: co } = await admin.from("company_settings").select("email").eq("company_id", companyId).single();
        if (co?.email) dealerEmail = co.email;
      } catch { /* non-critical */ }
    }

    const result = await sendEmail({
      to,
      subject,
      html,
      type,
      customerId,
      appointmentId,
      quoteId,
      companyId,
      replyTo: replyTo || dealerEmail,
      fromName: companyName || undefined,
      fromEmail: dealerEmail,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ success: true, messageId: result.messageId });
  } catch (err: any) {
    console.error("[send-email] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
