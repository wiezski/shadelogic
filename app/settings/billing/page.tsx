"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../auth-provider";
import { PermissionGate } from "../../permission-gate";
import { PLAN_LABELS, PLAN_FEATURES, PLAN_PRICES, PLAN_USER_LIMITS, FEATURE_LABELS, type Plan, type FeatureKey } from "../../../lib/features";

type CompanyBilling = {
  id: string;
  plan: Plan;
  subscription_status: "trialing" | "active" | "past_due" | "canceled" | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  stripe_customer_id: string | null;
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  const today = new Date();
  const diffMs = target.getTime() - today.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

// ── Current Plan Card ──────────────────────────────────────────

function CurrentPlanCard({ billing, loading, teamSize }: { billing: CompanyBilling | null; loading: boolean; teamSize: number }) {
  if (loading) {
    return (
      <div className="rounded p-6 space-y-4" style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }}>
        <div className="zr-skeleton" style={{ width: "200px", height: "24px", borderRadius: "var(--zr-radius-sm)" }} />
        <div className="zr-skeleton" style={{ width: "100%", height: "40px", borderRadius: "var(--zr-radius-sm)" }} />
      </div>
    );
  }

  if (!billing) return null;

  const planLabel = PLAN_LABELS[billing.plan] ?? billing.plan;
  const isTrialing = billing.subscription_status === "trialing";
  const daysLeft = isTrialing ? daysUntil(billing.trial_ends_at) : null;
  const userLimit = PLAN_USER_LIMITS[billing.plan];
  const extraUsers = Math.max(0, teamSize - userLimit.included);
  const extraUserCost = extraUsers * userLimit.perUserPrice;

  return (
    <div className="rounded p-6 space-y-4" style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }}>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-2xl font-bold" style={{ color: "var(--zr-text-primary)" }}>{planLabel}</h2>
            <span className="text-xs rounded px-2.5 py-1 font-medium" style={{
              background: billing.plan === "business" ? "rgba(168, 85, 247, 0.2)" :
              billing.plan === "professional" ? "rgba(59, 130, 246, 0.2)" :
              billing.plan === "starter" ? "rgba(34, 197, 94, 0.2)" :
              "rgba(245, 158, 11, 0.2)",
              color: billing.plan === "business" ? "#a855f7" :
              billing.plan === "professional" ? "var(--zr-info)" :
              billing.plan === "starter" ? "var(--zr-success)" :
              "var(--zr-warning)"
            }}>
              {isTrialing ? "Free Trial" : billing.subscription_status === "active" ? "Active" : billing.subscription_status || "Inactive"}
            </span>
          </div>
          <div className="text-xl font-semibold" style={{ color: "var(--zr-text-secondary)" }}>
            {PLAN_PRICES[billing.plan].label}
          </div>
        </div>
      </div>

      {/* User count info */}
      {!isTrialing && billing.plan !== "trial" && (
        <div className="rounded-lg p-4 space-y-1" style={{ background: "var(--zr-surface-2)" }}>
          <div className="text-sm font-medium" style={{ color: "var(--zr-text-primary)" }}>
            {teamSize} user{teamSize !== 1 ? "s" : ""} on your team
          </div>
          <div className="text-xs" style={{ color: "var(--zr-text-secondary)" }}>
            {userLimit.included} included in plan{extraUsers > 0 ? ` · ${extraUsers} additional @ $${userLimit.perUserPrice}/mo each = +$${extraUserCost}/mo` : ""}
          </div>
        </div>
      )}

      {/* Trial countdown */}
      {isTrialing && daysLeft !== null && (
        <div className="rounded-lg p-4 space-y-2" style={{
          background: daysLeft <= 3 ? "rgba(239, 68, 68, 0.1)" : "rgba(245, 158, 11, 0.1)",
          border: daysLeft <= 3 ? "1px solid var(--zr-error)" : "1px solid var(--zr-warning)"
        }}>
          <div className="text-sm font-semibold" style={{
            color: daysLeft <= 3 ? "var(--zr-error)" : "var(--zr-warning)"
          }}>
            {daysLeft > 0 ? (
              <>
                {daysLeft === 1 ? "1 day" : `${daysLeft} days`} left on your free trial
              </>
            ) : (
              "Your trial has ended"
            )}
          </div>
          {billing.trial_ends_at && (
            <div className="text-xs" style={{
              color: daysLeft <= 3 ? "var(--zr-error)" : "var(--zr-warning)"
            }}>
              Trial ends on {formatDate(billing.trial_ends_at)}
            </div>
          )}
        </div>
      )}

      {/* Subscription status */}
      {!isTrialing && billing.current_period_end && (
        <div className="rounded-lg p-4" style={{ background: "rgba(59, 130, 246, 0.05)", border: "1px solid var(--zr-info)" }}>
          <div className="text-xs" style={{ color: "var(--zr-text-secondary)" }}>
            Subscription renews on <span className="font-semibold">{formatDate(billing.current_period_end)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Plan Comparison Grid ───────────────────────────────────────

function PlanComparisonGrid({ currentPlan, billing, onUpgrade, upgrading }: {
  currentPlan: Plan;
  billing: CompanyBilling | null;
  onUpgrade: (plan: Plan) => Promise<void>;
  upgrading: boolean;
}) {
  const comparePlans: Plan[] = ["starter", "professional", "business"];
  const allFeatures: FeatureKey[] = Object.keys(FEATURE_LABELS) as FeatureKey[];

  return (
    <div className="rounded p-6 space-y-6" style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }}>
      <h2 className="text-lg font-bold" style={{ color: "var(--zr-text-primary)" }}>
        Choose Your Plan
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {comparePlans.map(plan => {
          const isCurrentPlan = currentPlan === plan;
          const isRecommended = plan === "professional";
          const features = PLAN_FEATURES[plan];
          const pricing = PLAN_PRICES[plan];
          const userLimits = PLAN_USER_LIMITS[plan];

          return (
            <div
              key={plan}
              className="rounded-lg overflow-hidden flex flex-col"
              style={{
                border: isCurrentPlan ? "2px solid var(--zr-orange)" : isRecommended ? "2px solid var(--zr-info)" : "1px solid var(--zr-border)",
                background: isRecommended ? "rgba(59, 130, 246, 0.05)" : "transparent"
              }}
            >
              {/* Header */}
              <div className="p-5 space-y-3 border-b" style={{ borderBottomColor: "var(--zr-border)" }}>
                <div className="space-y-1">
                  <h3 className="text-base font-bold" style={{ color: "var(--zr-text-primary)" }}>
                    {PLAN_LABELS[plan]}
                  </h3>
                  <div className="text-2xl font-bold" style={{ color: "var(--zr-text-secondary)" }}>
                    {pricing.label}
                  </div>
                  <div className="text-xs" style={{ color: "var(--zr-text-muted)" }}>
                    {userLimits.included} user{userLimits.included > 1 ? "s" : ""} included · +${userLimits.perUserPrice}/mo per extra user
                  </div>
                </div>

                {isRecommended && (
                  <div className="text-xs rounded px-2 py-1 font-medium w-fit" style={{
                    background: "rgba(59, 130, 246, 0.3)",
                    color: "var(--zr-info)"
                  }}>
                    Most Popular
                  </div>
                )}

                {isCurrentPlan && (
                  <div className="text-xs rounded px-2 py-1 font-medium w-fit" style={{
                    background: "rgba(245, 158, 11, 0.2)",
                    color: "var(--zr-orange)"
                  }}>
                    Current Plan
                  </div>
                )}
              </div>

              {/* Features */}
              <div className="p-5 space-y-3 flex-1">
                {allFeatures.map(featureKey => {
                  const hasFeature = features[featureKey] ?? false;
                  const { label } = FEATURE_LABELS[featureKey];

                  return (
                    <div key={featureKey} className="flex items-start gap-3 text-sm">
                      <div className="shrink-0 mt-0.5 font-bold" style={{
                        color: hasFeature ? "var(--zr-success)" : "var(--zr-text-muted)"
                      }}>
                        {hasFeature ? "✓" : "✗"}
                      </div>
                      <span style={{ color: hasFeature ? "var(--zr-text-primary)" : "var(--zr-text-muted)" }}>
                        {label}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Action button */}
              <div className="p-5 border-t" style={{ borderTopColor: "var(--zr-border)" }}>
                {isCurrentPlan ? (
                  <div className="text-xs rounded px-3 py-2 text-center font-medium" style={{
                    background: "var(--zr-surface-2)",
                    color: "var(--zr-text-secondary)"
                  }}>
                    Your Plan
                  </div>
                ) : (
                  <button
                    onClick={() => onUpgrade(plan)}
                    disabled={upgrading}
                    className="w-full rounded px-3 py-2 text-sm font-medium transition-opacity disabled:opacity-50"
                    style={{
                      background: isRecommended ? "var(--zr-info)" : "var(--zr-orange)",
                      color: "white"
                    }}
                  >
                    {upgrading ? "Processing…" : currentPlan === "trial" ? "Start Plan" : "Change Plan"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Per-user pricing note */}
      <div className="text-xs text-center" style={{ color: "var(--zr-text-muted)" }}>
        All plans include a 14-day free trial. Additional users can be added at $25/mo each.
        <br />
        Max 3 devices per user account.
      </div>
    </div>
  );
}

// ── Management Section ─────────────────────────────────────────

function ManagementSection({ billing, onPortal, loading }: {
  billing: CompanyBilling | null;
  onPortal: () => Promise<void>;
  loading: boolean;
}) {
  const hasSubscription = billing && billing.subscription_status !== "canceled" && billing.stripe_customer_id;

  if (!hasSubscription) return null;

  return (
    <div className="rounded p-6 space-y-4" style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }}>
      <h2 className="text-lg font-bold" style={{ color: "var(--zr-text-primary)" }}>
        Manage Subscription
      </h2>
      <p className="text-sm" style={{ color: "var(--zr-text-secondary)" }}>
        Update payment method, change billing address, download invoices, or cancel your subscription.
      </p>
      <button
        onClick={onPortal}
        disabled={loading}
        className="rounded px-4 py-2 text-sm font-medium disabled:opacity-50"
        style={{
          background: "var(--zr-surface-2)",
          border: "1px solid var(--zr-border)",
          color: "var(--zr-text-primary)"
        }}
      >
        {loading ? "Opening portal…" : "Open Billing Portal"}
      </button>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────

export default function BillingPage() {
  const { user, companyId } = useAuth();
  const [billing, setBilling] = useState<CompanyBilling | null>(null);
  const [teamSize, setTeamSize] = useState(1);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    loadBilling();
    loadTeamSize();
  }, [companyId]);

  async function loadBilling() {
    if (!companyId) return;
    setLoading(true);
    const { data } = await supabase
      .from("companies")
      .select("id, plan, subscription_status, trial_ends_at, current_period_end, stripe_customer_id")
      .eq("id", companyId)
      .single();

    if (data) {
      setBilling(data as CompanyBilling);
    }
    setLoading(false);
  }

  async function loadTeamSize() {
    if (!companyId) return;
    const { count } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId);
    setTeamSize(count || 1);
  }

  async function handleUpgrade(plan: Plan) {
    if (!user) return;
    setUpgrading(true);

    try {
      // Get user's session token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error("No auth token available");
      }

      // Call checkout API
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ planId: plan })
      });

      const result = await response.json();
      if (result.error) {
        alert("Error: " + result.error);
        setUpgrading(false);
        return;
      }

      // Redirect to Stripe Checkout
      if (result.url) {
        window.location.href = result.url;
      }
    } catch (error) {
      console.error("Upgrade error:", error);
      alert("Failed to start checkout. Please try again.");
      setUpgrading(false);
    }
  }

  async function handlePortal() {
    if (!user) return;
    setUpgrading(true);

    try {
      // Get user's session token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error("No auth token available");
      }

      // Call portal API
      const response = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`
        }
      });

      const result = await response.json();
      if (result.error) {
        alert("Error: " + result.error);
        setUpgrading(false);
        return;
      }

      // Redirect to Stripe Portal
      if (result.url) {
        window.location.href = result.url;
      }
    } catch (error) {
      console.error("Portal error:", error);
      alert("Failed to open portal. Please try again.");
      setUpgrading(false);
    }
  }

  const currentPlan = (billing?.plan ?? "trial") as Plan;

  return (
    <PermissionGate require="access_settings">
      <main className="min-h-screen p-4 text-sm" style={{ background: "var(--zr-black)", color: "var(--zr-text-primary)" }}>
        <div className="mx-auto max-w-3xl space-y-6">
          {/* Header */}
          <div className="space-y-2">
            <h1 className="text-3xl font-bold" style={{ color: "var(--zr-text-primary)" }}>
              Billing & Subscription
            </h1>
            <p className="text-sm" style={{ color: "var(--zr-text-muted)" }}>
              Manage your plan, view billing information, and access your subscription portal.
            </p>
          </div>

          {/* Current Plan Card */}
          <CurrentPlanCard billing={billing} loading={loading} teamSize={teamSize} />

          {/* Plan Comparison */}
          <PlanComparisonGrid
            currentPlan={currentPlan}
            billing={billing}
            onUpgrade={handleUpgrade}
            upgrading={upgrading}
          />

          {/* Management Section */}
          <ManagementSection
            billing={billing}
            onPortal={handlePortal}
            loading={upgrading}
          />

          {/* FAQ Section */}
          <div className="rounded p-6 space-y-4" style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }}>
            <h2 className="text-lg font-bold" style={{ color: "var(--zr-text-primary)" }}>
              Questions?
            </h2>
            <div className="space-y-3 text-sm">
              <div>
                <div className="font-semibold" style={{ color: "var(--zr-text-primary)" }}>Can I change plans anytime?</div>
                <p style={{ color: "var(--zr-text-secondary)", marginTop: "4px" }}>
                  Yes! You can upgrade, downgrade, or cancel your subscription at any time. Changes take effect at the start of your next billing cycle.
                </p>
              </div>
              <div>
                <div className="font-semibold" style={{ color: "var(--zr-text-primary)" }}>What happens when my trial ends?</div>
                <p style={{ color: "var(--zr-text-secondary)", marginTop: "4px" }}>
                  Your trial lasts 14 days with full access to all features. After it expires, you'll need to choose a paid plan to continue using ZeroRemake.
                </p>
              </div>
              <div>
                <div className="font-semibold" style={{ color: "var(--zr-text-primary)" }}>How does per-user pricing work?</div>
                <p style={{ color: "var(--zr-text-secondary)", marginTop: "4px" }}>
                  Each plan includes a set number of users. If you need more, additional users are $25/month each. Each user can be logged in on up to 3 devices at the same time.
                </p>
              </div>
              <div>
                <div className="font-semibold" style={{ color: "var(--zr-text-primary)" }}>Do you offer refunds?</div>
                <p style={{ color: "var(--zr-text-secondary)", marginTop: "4px" }}>
                  We offer a 14-day free trial so you can test ZeroRemake before paying. After that, we don't offer refunds, but you can cancel anytime and won't be charged again.
                </p>
              </div>
              <div>
                <div className="font-semibold" style={{ color: "var(--zr-text-primary)" }}>Need help?</div>
                <p style={{ color: "var(--zr-text-secondary)", marginTop: "4px" }}>
                  Contact us at{" "}
                  <a href="mailto:support@zeroremake.com" className="underline" style={{ color: "var(--zr-info)" }}>
                    support@zeroremake.com
                  </a>
                  {" "}for any billing questions.
                </p>
              </div>
            </div>
          </div>

          {/* Back to Settings */}
          <div className="flex justify-center">
            <Link
              href="/settings"
              className="text-sm hover:underline"
              style={{ color: "var(--zr-info)" }}
            >
              ← Back to Settings
            </Link>
          </div>
        </div>
      </main>
    </PermissionGate>
  );
}
