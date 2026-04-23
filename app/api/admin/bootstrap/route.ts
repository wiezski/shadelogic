// POST /api/admin/bootstrap
//
// One-shot provisioner for the demo workspace and the shared feedback
// team. Called from the /admin page. Idempotent — running it twice
// just returns the same IDs / credentials (it doesn't duplicate rows).
//
// Gated by the admin-cookie / IP-whitelist / admin-token check in
// lib/admin/auth.ts — same gate used by /api/test-email.
//
// What this endpoint sets up (safely, for reuse):
//
//   1. "ZeroRemake Demo" company + its owner user (demo@zeroremake.com).
//      • Plan: business (all features enabled)
//      • Blank state — no customers, quotes, jobs, etc.
//      • trial_ends_at = now() + 1 year so Steve has a year to show it off
//        before anything downgrades.
//
//   2. "Steve Feedback Team" company.
//      • Plan: business (all features).
//      • Invite token stored in company_settings so friends can join via
//        the normal /signup?invite=<token> flow.
//
// Returns credentials + invite link for Steve.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isAdminRequest } from "@/lib/admin/auth";

export const runtime = "nodejs";
export const maxDuration = 20;

const DEMO_EMAIL = "demo@zeroremake.com";
const DEMO_PASSWORD = "ZeroRemakeDemo2026!"; // documented in the admin page
const DEMO_COMPANY_NAME = "ZeroRemake Demo";

const FEEDBACK_TEAM_NAME = "Steve Feedback Team";

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const admin = getAdmin();
  const results: Record<string, unknown> = {};

  // ── 1. Demo workspace ─────────────────────────────────────────────

  try {
    // Find or create auth user
    const { data: existing, error: lookupErr } = await admin.auth.admin.listUsers();
    if (lookupErr) throw new Error(`listUsers failed: ${lookupErr.message}`);
    let demoUserId = existing?.users?.find((u) => u.email?.toLowerCase() === DEMO_EMAIL)?.id;

    if (!demoUserId) {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
        email_confirm: true,
      });
      if (createErr) throw new Error(`createUser failed: ${createErr.message}`);
      demoUserId = created.user?.id;
      if (!demoUserId) throw new Error("createUser returned no user id");
    }

    // Find or create company
    const { data: existingCompany } = await admin
      .from("companies")
      .select("id")
      .eq("name", DEMO_COMPANY_NAME)
      .maybeSingle();

    let demoCompanyId = existingCompany?.id;
    if (!demoCompanyId) {
      demoCompanyId = crypto.randomUUID();
      const oneYearOut = new Date();
      oneYearOut.setFullYear(oneYearOut.getFullYear() + 1);
      const { error: insErr } = await admin.from("companies").insert([
        {
          id: demoCompanyId,
          name: DEMO_COMPANY_NAME,
          plan: "business",
          trial_ends_at: oneYearOut.toISOString(),
        },
      ]);
      if (insErr) throw new Error(`demo company insert: ${insErr.message}`);

      await admin.from("company_settings").insert([
        { company_id: demoCompanyId, name: DEMO_COMPANY_NAME },
      ]);
    }

    // Ensure profile linkage
    const { data: existingProfile } = await admin
      .from("profiles")
      .select("id, company_id")
      .eq("id", demoUserId)
      .maybeSingle();

    if (!existingProfile) {
      await admin.from("profiles").insert([
        {
          id: demoUserId,
          company_id: demoCompanyId,
          full_name: "Demo Owner",
          role: "owner",
          status: "active",
        },
      ]);
    } else if (existingProfile.company_id !== demoCompanyId) {
      // Re-link if somehow attached elsewhere
      await admin
        .from("profiles")
        .update({ company_id: demoCompanyId, role: "owner", status: "active" })
        .eq("id", demoUserId);
    }

    results.demo = {
      ok: true,
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      company_id: demoCompanyId,
      user_id: demoUserId,
      how_to_enter:
        "Go to https://zeroremake.com/login and sign in with the email + password above. You'll land in a blank Business-plan workspace.",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[admin/bootstrap] demo setup failed:", msg);
    results.demo = { ok: false, error: msg };
  }

  // ── 2. Shared feedback team ───────────────────────────────────────

  try {
    const { data: existingTeam } = await admin
      .from("companies")
      .select("id")
      .eq("name", FEEDBACK_TEAM_NAME)
      .maybeSingle();

    let teamId = existingTeam?.id;
    if (!teamId) {
      teamId = crypto.randomUUID();
      await admin.from("companies").insert([
        {
          id: teamId,
          name: FEEDBACK_TEAM_NAME,
          plan: "business",
          // Long runway — 2 years — for the feedback group.
          trial_ends_at: (() => {
            const d = new Date();
            d.setFullYear(d.getFullYear() + 2);
            return d.toISOString();
          })(),
        },
      ]);
      await admin.from("company_settings").insert([
        { company_id: teamId, name: FEEDBACK_TEAM_NAME },
      ]);
    }

    // Build invite URL. The existing signup flow reads ?invite=<company_id>
    // from the query string — see app/signup/page.tsx. That's our shared link.
    const origin = new URL(req.url).origin;
    const inviteUrl = `${origin}/signup?invite=${teamId}`;

    results.feedback_team = {
      ok: true,
      company_id: teamId,
      invite_url: inviteUrl,
      how_to_share:
        "Send the invite URL to anyone you want on the Feedback Team. Each person signs up with their own email+password and auto-joins the workspace as an office user. They'll all see the same data.",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[admin/bootstrap] feedback team setup failed:", msg);
    results.feedback_team = { ok: false, error: msg };
  }

  return NextResponse.json({ ok: true, ...results });
}

export async function GET(req: NextRequest) {
  // Convenience — same behavior as POST so Steve can just hit the URL.
  return POST(req);
}
