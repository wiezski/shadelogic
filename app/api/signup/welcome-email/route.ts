// ── Welcome email on signup ─────────────────────────────────
// POST /api/signup/welcome-email
//
// Fired (non-blocking) from the signup flow after the user, company, and
// profile rows are all inserted. Sends a branded welcome email to the new
// user AND fires a fire-and-forget admin notification to the founder so
// they can reach out personally.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "../../../../lib/email";
import { welcomeEmail, adminSignupNotification } from "../../../../lib/email-templates";

export const dynamic = "force-dynamic";

// Where founder-facing alerts go. Override via AUDIT_INTERNAL_ALERT_TO env
// var if Steve wants them at a different inbox later.
const ADMIN_ALERT_TO = process.env.AUDIT_INTERNAL_ALERT_TO || "wiezski@gmail.com";

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing auth" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json({ error: "Supabase env not configured" }, { status: 500 });
  }

  // Anon client with the user's JWT so RLS determines who we're looking at.
  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await client.auth.getUser();
  if (userErr || !userData?.user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const email = userData.user.email;

  // Profile (for name) + company (for name + trial_ends_at)
  const { data: profile } = await client
    .from("profiles")
    .select("full_name, company_id")
    .eq("id", userData.user.id)
    .single();

  if (!profile?.company_id) {
    return NextResponse.json({ error: "No company found" }, { status: 400 });
  }

  const { data: company } = await client
    .from("companies")
    .select("name, trial_ends_at, plan")
    .eq("id", profile.company_id)
    .single();

  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  // Only send welcome email to brand-new trial signups, not invitees or
  // users upgrading. If they're not on trial, skip silently.
  if (company.plan && company.plan !== "trial") {
    return NextResponse.json({ skipped: "not a trial signup" });
  }

  const firstName = (profile.full_name || "").split(" ")[0] || "there";
  const tpl = welcomeEmail({
    firstName,
    companyName: company.name,
    trialEndsAt: company.trial_ends_at || new Date(Date.now() + 14 * 86400000).toISOString(),
  });

  const result = await sendEmail({
    to: email,
    subject: tpl.subject,
    html: tpl.html,
    type: "custom",
    companyId: profile.company_id,
  });

  // Fire the admin notification in parallel — non-blocking. Skip if the
  // signup looks like a test account so Steve's inbox stays clean.
  const SKIP_DOMAINS = ["@zeroremake.com"];
  const SKIP_EMAILS = ["mwiezbowski@gmail.com"]; // family/test accounts
  const isTestSignup =
    SKIP_DOMAINS.some(d => email.toLowerCase().endsWith(d)) ||
    SKIP_EMAILS.includes(email.toLowerCase());

  if (!isTestSignup) {
    const adminTpl = adminSignupNotification({
      ownerName: profile.full_name || "(no name)",
      ownerEmail: email,
      companyName: company.name || "(no name)",
      plan: company.plan || "trial",
      trialEndsAt: company.trial_ends_at,
      signedUpAt: new Date().toISOString(),
      companyId: profile.company_id,
    });
    sendEmail({
      to: ADMIN_ALERT_TO,
      subject: adminTpl.subject,
      html: adminTpl.html,
      replyTo: adminTpl.replyTo,
      type: "custom",
      companyId: profile.company_id,
    }).catch(err => console.error("[admin signup notify failed]", err));
  }

  return NextResponse.json({ ok: result.success, error: result.error });
}
