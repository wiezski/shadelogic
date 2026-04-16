// ── Automated Appointment Reminders ───────────────────────────
// GET /api/cron/send-reminders
//
// Finds appointments happening 18–30 hours from now that haven't
// had a reminder sent, and sends reminder emails to customers
// who have email addresses.
//
// Call via Vercel Cron:
//   vercel.json → { "crons": [{ "path": "/api/cron/send-reminders", "schedule": "0 */4 * * *" }] }
//
// Or hit manually to test.
//
// Security: checks CRON_SECRET header to prevent public access.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "../../../../lib/email";
import { appointmentReminder } from "../../../../lib/email-templates";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Optional: verify cron secret
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not set" }, { status: 500 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
  );

  // Find appointments between 18 and 30 hours from now
  // that are scheduled/confirmed and haven't been reminded
  const now = new Date();
  const from = new Date(now.getTime() + 18 * 60 * 60 * 1000);
  const to = new Date(now.getTime() + 30 * 60 * 60 * 1000);

  const { data: appointments, error: apptErr } = await supabase
    .from("appointments")
    .select("id, customer_id, type, scheduled_at, duration_minutes, address, company_id")
    .in("status", ["scheduled", "confirmed"])
    .gte("scheduled_at", from.toISOString())
    .lte("scheduled_at", to.toISOString());

  if (apptErr) {
    console.error("[cron/reminders] Appointment fetch error:", apptErr);
    return NextResponse.json({ error: apptErr.message }, { status: 500 });
  }

  if (!appointments || appointments.length === 0) {
    return NextResponse.json({ sent: 0, message: "No upcoming appointments in window" });
  }

  // Check which already have reminder emails logged
  const apptIds = appointments.map(a => a.id);
  const { data: alreadySent } = await supabase
    .from("email_log")
    .select("appointment_id")
    .in("appointment_id", apptIds)
    .eq("type", "appointment_reminder")
    .eq("status", "sent");

  const sentSet = new Set((alreadySent || []).map(r => r.appointment_id));
  const needsReminder = appointments.filter(a => !sentSet.has(a.id));

  if (needsReminder.length === 0) {
    return NextResponse.json({ sent: 0, message: "All reminders already sent" });
  }

  // Get customer emails + names
  const custIds = [...new Set(needsReminder.map(a => a.customer_id))];
  const { data: customers } = await supabase
    .from("customers")
    .select("id, first_name, last_name, email")
    .in("id", custIds);

  const custMap: Record<string, { firstName: string; email: string | null }> = {};
  (customers || []).forEach((c: any) => {
    custMap[c.id] = { firstName: c.first_name || "there", email: c.email };
  });

  // Get company names + phones
  const companyIds = [...new Set(needsReminder.map(a => a.company_id))];
  const { data: companies } = await supabase
    .from("company_settings")
    .select("company_id, name, phone")
    .in("company_id", companyIds);

  const compMap: Record<string, { name: string; phone: string | null }> = {};
  (companies || []).forEach((c: any) => {
    compMap[c.company_id] = { name: c.name || "Your Provider", phone: c.phone };
  });

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const appt of needsReminder) {
    const cust = custMap[appt.customer_id];
    if (!cust?.email) {
      skipped++;
      continue;
    }

    const comp = compMap[appt.company_id] || { name: "Your Provider", phone: null };

    const tpl = appointmentReminder({
      customerFirstName: cust.firstName,
      appointmentType: appt.type,
      scheduledAt: appt.scheduled_at,
      address: appt.address || undefined,
      companyName: comp.name,
      companyPhone: comp.phone || undefined,
    });

    const result = await sendEmail({
      to: cust.email,
      subject: tpl.subject,
      html: tpl.html,
      type: "appointment_reminder",
      customerId: appt.customer_id,
      appointmentId: appt.id,
      companyId: appt.company_id,
    });

    if (result.success) {
      sent++;
    } else {
      errors.push(`${appt.id}: ${result.error}`);
    }
  }

  return NextResponse.json({
    sent,
    skipped,
    errors: errors.length ? errors : undefined,
    total: needsReminder.length,
  });
}
