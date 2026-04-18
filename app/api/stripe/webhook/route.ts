// ── Stripe Webhook Handler ─────────────────────────────────────
// POST /api/stripe/webhook
//
// Receives and processes Stripe webhook events:
// - checkout.session.completed: Create subscription, set plan and status
// - customer.subscription.updated: Update plan, status, and period end
// - customer.subscription.deleted: Clear subscription, reset to trial
// - invoice.payment_failed: Set status to past_due
//
// Uses service role key for admin database updates.

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

// Create admin Supabase client with service role key
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Map price IDs to plan names
function getPlanFromPriceId(priceId: string): string {
  const priceMap: Record<string, string> = {
    [process.env.STRIPE_PRICE_BASIC!]: "basic",
    [process.env.STRIPE_PRICE_PRO!]: "pro",
    [process.env.STRIPE_PRICE_ENTERPRISE!]: "enterprise",
  };
  return priceMap[priceId] || "trial";
}

export async function POST(req: NextRequest) {
  try {
    // Get raw body for signature verification
    const rawBody = await req.text();

    // Verify webhook signature
    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      return NextResponse.json(
        { error: "Missing Stripe signature" },
        { status: 400 }
      );
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err: any) {
      console.error("[stripe/webhook] Signature verification failed:", err.message);
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 400 }
      );
    }

    console.log(`[stripe/webhook] Processing event: ${event.type}`);

    // Handle events
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;

        // Get subscription details to find price
        const subscription = await stripe.subscriptions.retrieve(subscriptionId as string);
        const priceId = subscription.items.data[0]?.price.id;
        const plan = getPlanFromPriceId(priceId);

        // Find company by stripe_customer_id
        const { data: companies, error: findError } = await supabaseAdmin
          .from("companies")
          .select("id")
          .eq("stripe_customer_id", customerId);

        if (findError || !companies || companies.length === 0) {
          console.error("[stripe/webhook] Company not found for customer:", customerId);
          break;
        }

        const companyId = companies[0].id;

        // Update company with subscription details
        await supabaseAdmin
          .from("companies")
          .update({
            stripe_subscription_id: subscriptionId,
            plan,
            subscription_status: "active",
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          })
          .eq("id", companyId);

        console.log(`[stripe/webhook] Updated company ${companyId} with subscription ${subscriptionId}`);
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const priceId = subscription.items.data[0]?.price.id;
        const plan = getPlanFromPriceId(priceId);

        // Find company by stripe_customer_id
        const { data: companies, error: findError } = await supabaseAdmin
          .from("companies")
          .select("id")
          .eq("stripe_customer_id", customerId);

        if (findError || !companies || companies.length === 0) {
          console.error("[stripe/webhook] Company not found for customer:", customerId);
          break;
        }

        const companyId = companies[0].id;

        // Update company subscription details
        await supabaseAdmin
          .from("companies")
          .update({
            plan,
            subscription_status: subscription.status as string,
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          })
          .eq("id", companyId);

        console.log(`[stripe/webhook] Updated company ${companyId} subscription to ${subscription.status}`);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        // Find company by stripe_customer_id
        const { data: companies, error: findError } = await supabaseAdmin
          .from("companies")
          .select("id")
          .eq("stripe_customer_id", customerId);

        if (findError || !companies || companies.length === 0) {
          console.error("[stripe/webhook] Company not found for customer:", customerId);
          break;
        }

        const companyId = companies[0].id;

        // Reset company to trial
        await supabaseAdmin
          .from("companies")
          .update({
            plan: "trial",
            subscription_status: "canceled",
            stripe_subscription_id: null,
          })
          .eq("id", companyId);

        console.log(`[stripe/webhook] Reset company ${companyId} to trial (subscription deleted)`);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        // Find company by stripe_customer_id
        const { data: companies, error: findError } = await supabaseAdmin
          .from("companies")
          .select("id")
          .eq("stripe_customer_id", customerId);

        if (findError || !companies || companies.length === 0) {
          console.error("[stripe/webhook] Company not found for customer:", customerId);
          break;
        }

        const companyId = companies[0].id;

        // Set subscription status to past_due
        await supabaseAdmin
          .from("companies")
          .update({
            subscription_status: "past_due",
          })
          .eq("id", companyId);

        console.log(`[stripe/webhook] Updated company ${companyId} subscription status to past_due`);
        break;
      }

      default:
        console.log(`[stripe/webhook] Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error("[stripe/webhook] Unexpected error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
