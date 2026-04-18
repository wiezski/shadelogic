// ── Team Member Removal API Route ────────────────────────────
// POST /api/team/remove
//
// Removes a team member and syncs Stripe billing (reduces extra user quantity).
// Only company owners can call this. Cannot remove yourself.
//
// Body: { profileId: string }

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}
function getSupabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}
function getSupabaseAnon() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}

const PLAN_USER_LIMITS: Record<string, number> = {
  trial: 3,
  starter: 1,
  professional: 3,
  business: 5,
};

export async function POST(req: NextRequest) {
  try {
    const stripe = getStripe();
    const supabaseAdmin = getSupabaseAdmin();
    const supabaseAnon = getSupabaseAnon();

    // Authenticate
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const { data: userData, error: userError } = await supabaseAnon.auth.getUser(token);
    if (userError || !userData.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const callerId = userData.user.id;

    // Verify caller is owner
    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("company_id, role")
      .eq("id", callerId)
      .single();

    if (!callerProfile || callerProfile.role !== "owner") {
      return NextResponse.json({ error: "Only owners can remove team members" }, { status: 403 });
    }

    const companyId = callerProfile.company_id;
    const body = await req.json();
    const { profileId } = body;

    if (!profileId) {
      return NextResponse.json({ error: "profileId is required" }, { status: 400 });
    }

    // Can't remove yourself
    if (profileId === callerId) {
      return NextResponse.json({ error: "You cannot remove yourself" }, { status: 400 });
    }

    // Verify the member belongs to the same company
    const { data: memberProfile } = await supabaseAdmin
      .from("profiles")
      .select("id, company_id, full_name")
      .eq("id", profileId)
      .single();

    if (!memberProfile || memberProfile.company_id !== companyId) {
      return NextResponse.json({ error: "Member not found in your company" }, { status: 404 });
    }

    // Remove device sessions
    await supabaseAdmin
      .from("user_sessions")
      .delete()
      .eq("user_id", profileId);

    // Delete profile
    await supabaseAdmin
      .from("profiles")
      .delete()
      .eq("id", profileId);

    // Delete auth user
    await supabaseAdmin.auth.admin.deleteUser(profileId);

    // Sync Stripe billing — recalculate extra users
    const { data: company } = await supabaseAdmin
      .from("companies")
      .select("plan, stripe_subscription_id")
      .eq("id", companyId)
      .single();

    if (company?.stripe_subscription_id) {
      const extraUserPriceId = process.env.STRIPE_PRICE_EXTRA_USER;
      if (extraUserPriceId) {
        try {
          // Count remaining active users
          const { count } = await supabaseAdmin
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .eq("company_id", companyId)
            .eq("status", "active");

          const activeUsers = count ?? 0;
          const included = PLAN_USER_LIMITS[company.plan] ?? PLAN_USER_LIMITS.trial;
          const extraUsers = Math.max(0, activeUsers - included);

          const subscription = await stripe.subscriptions.retrieve(company.stripe_subscription_id, {
            expand: ["items.data"],
          });

          const existingItem = subscription.items.data.find(
            (item) => item.price.id === extraUserPriceId
          );

          if (extraUsers > 0 && existingItem) {
            await stripe.subscriptionItems.update(existingItem.id, {
              quantity: extraUsers,
            });
            console.log(`[team/remove] Updated extra user quantity to ${extraUsers}`);
          } else if (extraUsers === 0 && existingItem) {
            await stripe.subscriptionItems.del(existingItem.id, {
              proration_behavior: "create_prorations",
            });
            console.log("[team/remove] Removed extra user line item");
          }
        } catch (billingErr) {
          console.error("[team/remove] Stripe billing sync error:", billingErr);
          // Don't fail the removal over billing issues
        }
      }
    }

    console.log(`[team/remove] Removed user ${profileId} (${memberProfile.full_name})`);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[team/remove] Error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
