// ── Stripe Connect Onboarding ────────────────────────────────
// GET /api/stripe/connect/onboard
//
// Creates a Stripe Connect Express account for the company and
// redirects the user to Stripe's onboarding flow.
// After onboarding, Stripe redirects back to /settings.
//
// Requires Authorization header with Supabase JWT.

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "") || req.cookies.get("sb-access-token")?.value;

    // For GET redirects, we also accept a session cookie or query param
    const url = new URL(req.url);
    const companyIdParam = url.searchParams.get("company_id");

    if (!companyIdParam) {
      return NextResponse.json({ error: "company_id query param required" }, { status: 400 });
    }

    const stripe = getStripe();
    const admin = getAdminClient();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://shadelogic.vercel.app";

    // Check if company already has a Connect account
    const { data: company } = await admin.from("companies")
      .select("stripe_connect_account_id, name")
      .eq("id", companyIdParam)
      .single();

    let accountId = company?.stripe_connect_account_id;

    if (!accountId) {
      // Create a new Express account
      const account = await stripe.accounts.create({
        type: "express",
        business_type: "company",
        company: {
          name: company?.name || undefined,
        },
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
      });

      accountId = account.id;

      // Save the account ID
      await admin.from("companies").update({
        stripe_connect_account_id: accountId,
      }).eq("id", companyIdParam);
    }

    // Create an Account Link for onboarding
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${appUrl}/api/stripe/connect/onboard?company_id=${companyIdParam}`,
      return_url: `${appUrl}/settings?connect=success`,
      type: "account_onboarding",
    });

    return NextResponse.redirect(accountLink.url);
  } catch (err: any) {
    console.error("[stripe-connect-onboard] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
