// ── Stripe Connect Payment Intent ────────────────────────────
// POST /api/stripe/connect/payment-intent
//
// Creates a Payment Intent for a customer invoice using the company's
// Stripe Connect account. The company receives the funds minus
// Stripe's platform fee.
//
// Body: {
//   invoiceId: string   — our invoice ID
//   amount: number      — amount in dollars (we convert to cents)
//   companyId: string   — to look up Connect account
//   customerEmail?: string
//   description?: string
// }

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

export async function POST(req: NextRequest) {
  try {
    const { invoiceId, amount, companyId, customerEmail, description } = await req.json();

    if (!invoiceId || !amount || !companyId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const stripe = getStripe();
    const admin = getAdminClient();

    // Look up company's Connect account
    const { data: company } = await admin.from("companies")
      .select("stripe_connect_account_id, stripe_connect_onboarded, live_payments_enabled")
      .eq("id", companyId)
      .single();

    if (!company?.live_payments_enabled) {
      return NextResponse.json({ error: "Live payments not enabled for this company" }, { status: 400 });
    }

    if (!company?.stripe_connect_account_id) {
      return NextResponse.json({ error: "Stripe Connect account not set up" }, { status: 400 });
    }

    // Convert to cents
    const amountCents = Math.round(amount * 100);

    // Application fee: 1% of the transaction (ZeroRemake's cut)
    const applicationFee = Math.round(amountCents * 0.01);

    // Create Payment Intent on the connected account
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: "usd",
      application_fee_amount: applicationFee,
      receipt_email: customerEmail || undefined,
      description: description || `Invoice ${invoiceId}`,
      metadata: {
        invoice_id: invoiceId,
        company_id: companyId,
      },
      transfer_data: {
        destination: company.stripe_connect_account_id,
      },
    });

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: amountCents,
    });
  } catch (err: any) {
    console.error("[stripe-connect-payment] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
