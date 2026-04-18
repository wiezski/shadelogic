// ── Team Approval API Route ──────────────────────────────────
// POST /api/team/approve
//
// Approves or denies a pending team member. Only company owners can call this.
// On approval:
//   1. Profile status set to 'active'
//   2. Extra user count recalculated
//   3. Stripe subscription updated with extra user line item if needed
// On denial:
//   The profile and auth user are deleted.
//
// Body: { profileId: string, action: "approve" | "deny" }

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

// Plan user limits (must match lib/features.ts)
const PLAN_USER_LIMITS: Record<string, number> = {
  trial: 3,
  starter: 1,
  professional: 3,
  business: 5,
};

/**
 * Sync the "extra user" line item on the Stripe subscription.
 * If extraUsers > 0, adds or updates the line item quantity.
 * If extraUsers === 0, removes the line item.
 */
async function syncExtraUserBilling(
  stripe: Stripe,
  subscriptionId: string,
  extraUsers: number
): Promise<{ updated: boolean; extraUsers: number }> {
  const extraUserPriceId = process.env.STRIPE_PRICE_EXTRA_USER;
  if (!extraUserPriceId) {
    console.log("[team/approve] STRIPE_PRICE_EXTRA_USER not set, skipping billing sync");
    return { updated: false, extraUsers };
  }

  try {
    // Get current subscription items
    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ["items.data"],
    });

    // Find existing extra user line item
    const existingItem = subscription.items.data.find(
      (item) => item.price.id === extraUserPriceId
    );

    if (extraUsers > 0) {
      if (existingItem) {
        // Update quantity
        if (existingItem.quantity !== extraUsers) {
          await stripe.subscriptionItems.update(existingItem.id, {
            quantity: extraUsers,
          });
          console.log(`[team/approve] Updated extra user quantity to ${extraUsers}`);
        }
      } else {
        // Add new line item
        await stripe.subscriptionItems.create({
          subscription: subscriptionId,
          price: extraUserPriceId,
          quantity: extraUsers,
        });
        console.log(`[team/approve] Added extra user line item (qty: ${extraUsers})`);
      }
      return { updated: true, extraUsers };
    } else {
      // No extra users needed — remove the line item if it exists
      if (existingItem) {
        await stripe.subscriptionItems.del(existingItem.id, {
          proration_behavior: "create_prorations",
        });
        console.log("[team/approve] Removed extra user line item (no longer needed)");
        return { updated: true, extraUsers: 0 };
      }
      return { updated: false, extraUsers: 0 };
    }
  } catch (err) {
    console.error("[team/approve] Stripe billing sync error:", err);
    // Don't block the approval over billing errors
    return { updated: false, extraUsers };
  }
}

export async function POST(req: NextRequest) {
  try {
    const stripe = getStripe();
    const supabaseAdmin = getSupabaseAdmin();
    const supabaseAnon = getSupabaseAnon();

    // Authenticate the caller
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

    // Verify caller is an owner
    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("company_id, role")
      .eq("id", callerId)
      .single();

    if (!callerProfile || (callerProfile.role !== "owner" && callerProfile.role !== "admin")) {
      return NextResponse.json({ error: "Only owners and admins can approve team members" }, { status: 403 });
    }

    const companyId = callerProfile.company_id;
    const body = await req.json();
    const { profileId, action } = body;

    if (!profileId || !["approve", "deny"].includes(action)) {
      return NextResponse.json(
        { error: "Invalid request. Need profileId and action (approve|deny)" },
        { status: 400 }
      );
    }

    // Verify the pending user belongs to the same company
    const { data: pendingProfile } = await supabaseAdmin
      .from("profiles")
      .select("id, company_id, status, full_name")
      .eq("id", profileId)
      .single();

    if (!pendingProfile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }
    if (pendingProfile.company_id !== companyId) {
      return NextResponse.json({ error: "Profile doesn't belong to your company" }, { status: 403 });
    }
    if (pendingProfile.status !== "pending") {
      return NextResponse.json({ error: "Profile is not in pending status" }, { status: 400 });
    }

    if (action === "approve") {
      // 1. Activate the profile
      await supabaseAdmin
        .from("profiles")
        .update({ status: "active" })
        .eq("id", profileId);

      // 2. Update the approval record
      await supabaseAdmin
        .from("pending_approvals")
        .update({
          resolution: "approved",
          resolved_at: new Date().toISOString(),
          resolved_by: callerId,
        })
        .eq("profile_id", profileId);

      // 3. Sync Stripe billing for extra users
      let billingResult = { updated: false, extraUsers: 0 };
      const { data: company } = await supabaseAdmin
        .from("companies")
        .select("plan, stripe_subscription_id")
        .eq("id", companyId)
        .single();

      if (company?.stripe_subscription_id) {
        // Count active users (including the just-approved one)
        const { count } = await supabaseAdmin
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("status", "active");

        const activeUsers = count ?? 0;
        const included = PLAN_USER_LIMITS[company.plan] ?? PLAN_USER_LIMITS.trial;
        const extraUsers = Math.max(0, activeUsers - included);

        billingResult = await syncExtraUserBilling(
          stripe,
          company.stripe_subscription_id,
          extraUsers
        );
      }

      console.log(`[team/approve] Approved user ${profileId} (${pendingProfile.full_name}), billing: ${JSON.stringify(billingResult)}`);
      return NextResponse.json({
        success: true,
        action: "approved",
        billing: billingResult,
      });

    } else {
      // Deny — update approval record, then delete the profile and auth user
      await supabaseAdmin
        .from("pending_approvals")
        .update({
          resolution: "denied",
          resolved_at: new Date().toISOString(),
          resolved_by: callerId,
        })
        .eq("profile_id", profileId);

      // Delete profile first (FK cascade will remove pending_approvals)
      await supabaseAdmin
        .from("profiles")
        .delete()
        .eq("id", profileId);

      // Delete the auth user
      await supabaseAdmin.auth.admin.deleteUser(profileId);

      console.log(`[team/approve] Denied user ${profileId} (${pendingProfile.full_name})`);
      return NextResponse.json({ success: true, action: "denied" });
    }
  } catch (err: any) {
    console.error("[team/approve] Error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
