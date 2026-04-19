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

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}
function getSupabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function getPlanFromPriceId(priceId: string): string {
  const priceMap: Record<string, string> = {
    [process.env.STRIPE_PRICE_STARTER || ""]: "starter",
    [process.env.STRIPE_PRICE_PROFESSIONAL || ""]: "professional",
    [process.env.STRIPE_PRICE_BUSINESS || ""]: "business",
  };
  return priceMap[priceId] || "trial";
}

export async function POST(req: NextRequest) {
  try {
    const stripe = getStripe();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;
    const supabaseAdmin = getSupabaseAdmin();
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

        // Trial abuse prevention: record card fingerprint
        // If this is a trial subscription, check if the card has been used before
        if (subscription.status === "trialing") {
          try {
            // Get the default payment method to extract card fingerprint
            const paymentMethodId = subscription.default_payment_method as string
              || (session as any).payment_method as string;

            if (paymentMethodId) {
              const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
              const fingerprint = pm.card?.fingerprint;

              if (fingerprint) {
                // Check if this card fingerprint has been used for a trial before
                const { data: existingTrial } = await supabaseAdmin
                  .from("trial_cards")
                  .select("id, company_id")
                  .eq("card_fingerprint", fingerprint)
                  .single();

                if (existingTrial && existingTrial.company_id !== companyId) {
                  // Card already used for a trial by a different company — cancel the trial
                  console.log(`[stripe/webhook] Trial abuse detected: card ${fingerprint} already used by company ${existingTrial.company_id}`);
                  await stripe.subscriptions.update(subscriptionId, {
                    trial_end: "now",  // End trial immediately, start billing
                  });
                } else if (!existingTrial) {
                  // Record the card fingerprint for future checks
                  await supabaseAdmin.from("trial_cards").insert({
                    card_fingerprint: fingerprint,
                    company_id: companyId,
                  });
                }
              }
            }
          } catch (cardErr) {
            console.error("[stripe/webhook] Card fingerprint check error:", cardErr);
            // Don't block the checkout over fingerprint check failures
          }
        }

        // Update company with subscription details
        await supabaseAdmin
          .from("companies")
          .update({
            stripe_subscription_id: subscriptionId,
            plan,
            subscription_status: subscription.status as string,
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

      // ── Stripe Connect Events ──────────────────────────────────

      case "account.updated": {
        // A connected account completed onboarding or changed status
        const account = event.data.object as Stripe.Account;
        const accountId = account.id;

        // Find company with this Connect account
        const { data: connectCompanies } = await supabaseAdmin
          .from("companies")
          .select("id")
          .eq("stripe_connect_account_id", accountId);

        if (connectCompanies && connectCompanies.length > 0) {
          const isOnboarded = account.charges_enabled && account.payouts_enabled;
          await supabaseAdmin
            .from("companies")
            .update({ stripe_connect_onboarded: isOnboarded })
            .eq("id", connectCompanies[0].id);

          console.log(`[stripe/webhook] Connect account ${accountId} updated: onboarded=${isOnboarded}`);
        }
        break;
      }

      case "payment_intent.succeeded": {
        // A customer payment succeeded via Connect
        const pi = event.data.object as Stripe.PaymentIntent;
        const invoiceId = pi.metadata?.invoice_id;
        const piCompanyId = pi.metadata?.company_id;

        if (invoiceId && piCompanyId) {
          // Record the payment on the invoice
          const amountDollars = pi.amount / 100;

          // Get current invoice
          const { data: inv } = await supabaseAdmin
            .from("invoices")
            .select("amount_paid, total_amount, status")
            .eq("id", invoiceId)
            .single();

          if (inv) {
            const newPaid = (inv.amount_paid || 0) + amountDollars;
            const newStatus = newPaid >= inv.total_amount ? "paid" : "partial";

            await supabaseAdmin
              .from("invoices")
              .update({
                amount_paid: newPaid,
                status: newStatus,
                last_payment_at: new Date().toISOString(),
                last_payment_method: "stripe_connect",
              })
              .eq("id", invoiceId);

            console.log(`[stripe/webhook] Invoice ${invoiceId} payment: $${amountDollars}, status=${newStatus}`);
          }
        }
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
