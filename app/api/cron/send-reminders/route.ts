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
import { appointmentReminder, trialReminder3Days, trialReminder1Day } from "../../../../lib/email-templates";
import { processAutomationRules, checkStuckLeads, processQueue, getServiceClient } from "../../../../lib/automation";

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

  // ── Also run automation engine ──────────────────────────────
  const automationResults: Record<string, any> = {};

  try {
    await processAutomationRules();
    automationResults.rules = "processed";
  } catch (err) {
    automationResults.rules = `error: ${err instanceof Error ? err.message : String(err)}`;
  }

  try {
    const svc = getServiceClient();
    const { data: companies } = await svc.from("companies").select("id").limit(1000);
    for (const company of companies || []) {
      await checkStuckLeads(company.id, svc);
    }
    automationResults.stuckLeads = `checked ${(companies || []).length} companies`;
  } catch (err) {
    automationResults.stuckLeads = `error: ${err instanceof Error ? err.message : String(err)}`;
  }

  try {
    await processQueue(getServiceClient());
    automationResults.queue = "processed";
  } catch (err) {
    automationResults.queue = `error: ${err instanceof Error ? err.message : String(err)}`;
  }

  // ── Trial reminders ──────────────────────────────────────────
  // Email trialing companies at ~3 days and ~1 day before expiration so
  // they have a chance to subscribe before being hard-gated.
  const trialResults: Record<string, any> = { sent_3d: 0, sent_1d: 0, errors: [] as string[] };
  try {
    const svc = getServiceClient();
    const now = new Date();
    // 3-day window: trial_ends_at between 2.5 and 3.5 days from now, not yet sent
    const in2_5d = new Date(now.getTime() + 2.5 * 86400000).toISOString();
    const in3_5d = new Date(now.getTime() + 3.5 * 86400000).toISOString();
    // 1-day window: trial_ends_at between 0.5 and 1.5 days from now, not yet sent
    const in0_5d = new Date(now.getTime() + 0.5 * 86400000).toISOString();
    const in1_5d = new Date(now.getTime() + 1.5 * 86400000).toISOString();

    const baseCols = "id, name, trial_ends_at";

    // 3-day reminder
    const { data: threeDay } = await svc
      .from("companies")
      .select(baseCols)
      .eq("subscription_status", "trialing")
      .gte("trial_ends_at", in2_5d)
      .lte("trial_ends_at", in3_5d)
      .is("trial_reminder_3d_sent_at", null);

    for (const co of threeDay || []) {
      try {
        // Find the company's owner (profile with role=owner) to email
        const { data: owner } = await svc
          .from("profiles")
          .select("full_name, id")
          .eq("company_id", co.id)
          .eq("role", "owner")
          .limit(1)
          .maybeSingle();
        if (!owner) continue;
        const { data: authUser } = await svc.auth.admin.getUserById(owner.id);
        const email = authUser?.user?.email;
        if (!email) continue;

        const first = (owner.full_name || "").split(" ")[0] || "there";
        const tpl = trialReminder3Days({ firstName: first, trialEndsAt: co.trial_ends_at!, companyName: co.name });
        await sendEmail({ to: email, subject: tpl.subject, html: tpl.html, type: "trial_reminder", companyId: co.id });
        await svc.from("companies").update({ trial_reminder_3d_sent_at: new Date().toISOString() }).eq("id", co.id);
        trialResults.sent_3d++;
      } catch (err) {
        trialResults.errors.push(`3d ${co.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // 1-day reminder
    const { data: oneDay } = await svc
      .from("companies")
      .select(baseCols)
      .eq("subscription_status", "trialing")
      .gte("trial_ends_at", in0_5d)
      .lte("trial_ends_at", in1_5d)
      .is("trial_reminder_1d_sent_at", null);

    for (const co of oneDay || []) {
      try {
        const { data: owner } = await svc
          .from("profiles")
          .select("full_name, id")
          .eq("company_id", co.id)
          .eq("role", "owner")
          .limit(1)
          .maybeSingle();
        if (!owner) continue;
        const { data: authUser } = await svc.auth.admin.getUserById(owner.id);
        const email = authUser?.user?.email;
        if (!email) continue;

        const first = (owner.full_name || "").split(" ")[0] || "there";
        const tpl = trialReminder1Day({ firstName: first, trialEndsAt: co.trial_ends_at!, companyName: co.name });
        await sendEmail({ to: email, subject: tpl.subject, html: tpl.html, type: "trial_reminder", companyId: co.id });
        await svc.from("companies").update({ trial_reminder_1d_sent_at: new Date().toISOString() }).eq("id", co.id);
        trialResults.sent_1d++;
      } catch (err) {
        trialResults.errors.push(`1d ${co.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } catch (err) {
    trialResults.errors.push(`top-level: ${err instanceof Error ? err.message : String(err)}`);
  }

  return NextResponse.json({
    reminders: { sent, skipped, errors: errors.length ? errors : undefined, total: needsReminder.length },
    trial: trialResults,
    automation: automationResults,
  });
}
