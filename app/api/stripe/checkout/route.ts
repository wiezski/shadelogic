// ── Stripe Checkout Session API Route ──────────────────────────
// POST /api/stripe/checkout
//
// Creates a Stripe Checkout session for subscriptions with a 14-day trial.
// - Reads planId from request body (basic, pro, enterprise)
// - Maps plan to Stripe price IDs from environment
// - Gets current user from Supabase auth via Authorization header
// - Looks up company_id from profiles table
// - Creates Stripe customer if needed
// - Returns checkout session URL

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

// Lazy-initialize to avoid build-time errors when env vars aren't set
function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}
function getSupabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}
function getSupabaseAnon() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}

export async function POST(req: NextRequest) {
  try {
    const stripe = getStripe();
    const supabaseAdmin = getSupabaseAdmin();
    const supabaseAnon = getSupabaseAnon();

    const PLAN_PRICE_MAP: Record<string, string> = {
      basic: process.env.STRIPE_PRICE_BASIC || "",
      pro: process.env.STRIPE_PRICE_PRO || "",
      enterprise: process.env.STRIPE_PRICE_ENTERPRISE || "",
    };

    const body = await req.json();
    const { planId } = body;

    // Validate plan
    if (!planId || !PLAN_PRICE_MAP[planId]) {
      return NextResponse.json(
        { error: "Invalid planId. Must be one of: basic, pro, enterprise" },
        { status: 400 }
      );
    }

    const priceId = PLAN_PRICE_MAP[planId];

    // Get current user from Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing or invalid Authorization header" },
        { status: 401 }
      );
    }

    const token = authHeader.slice(7);

    // Verify token and get user
    const { data: userData, error: userError } = await supabaseAnon.auth.getUser(token);
    if (userError || !userData.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const userId = userData.user.id;

    // Get company_id from profiles table
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "Profile not found" },
        { status: 404 }
      );
    }

    const companyId = profile.company_id;

    // Get or create Stripe customer
    const { data: company, error: companyError } = await supabaseAdmin
      .from("companies")
      .select("stripe_customer_id, name")
      .eq("id", companyId)
      .single();

    if (companyError || !company) {
      console.error("[stripe/checkout] Company lookup error:", companyError);
      return NextResponse.json(
        { error: "Company not found" },
        { status: 404 }
      );
    }

    let stripeCustomerId = company.stripe_customer_id;

    // Create Stripe customer if not already created
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: userData.user.email || "",
        metadata: { company_id: companyId },
      });
      stripeCustomerId = customer.id;

      // Save stripe_customer_id to companies table
      await supabaseAdmin
        .from("companies")
        .update({ stripe_customer_id: stripeCustomerId })
        .eq("id", companyId);
    }

    // Create Checkout session with 14-day trial
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: "subscription",
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      subscription_data: {
        trial_period_days: 14,
        metadata: {
          company_id: companyId,
        },
      },
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error("[stripe/checkout] Error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
