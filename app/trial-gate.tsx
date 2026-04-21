"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "../lib/supabase";
import { useAuth } from "./auth-provider";

// Paths where the expired-trial overlay should NOT render — otherwise the
// user gets trapped (can't reach the billing page to subscribe, can't sign out
// from the overlay if the Stripe Checkout flow itself errors, etc.)
const OVERLAY_ALLOW_PATHS = [
  "/settings/billing", // where they actually go to subscribe
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
];

/**
 * TrialGate — SaaS trial enforcement.
 *
 * Two pieces of UX:
 *   1) Thin countdown banner across the top while trial is active (≤ 14 days).
 *   2) Full-screen overlay once trial_ends_at has passed and the user hasn't
 *      subscribed. Blocks the underlying app, shows plan CTA and a
 *      "Download my data" button so users can export their records before
 *      (or without) paying.
 *
 * Data is never deleted when the trial ends — subscribing (even months later)
 * immediately restores full app access. Export is a trust-building extra,
 * not the only path back to their data.
 */

type BillingInfo = {
  plan: string | null;
  subscription_status: string | null;
  trial_ends_at: string | null;
};

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export function TrialGate() {
  const { user, companyId, loading } = useAuth();
  const pathname = usePathname() || "";
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  // Pull plan + trial_ends_at separately from the AuthProvider's own fetch so
  // we always see the current value (AuthProvider doesn't expose trial_ends_at).
  useEffect(() => {
    if (!companyId) { setBilling(null); return; }
    supabase
      .from("companies")
      .select("plan, subscription_status, trial_ends_at")
      .eq("id", companyId)
      .single()
      .then(({ data }) => {
        if (data) setBilling(data as BillingInfo);
      });
  }, [companyId]);

  // Don't render on public / not-logged-in / still-loading states — the
  // AuthProvider handles those branches itself.
  if (loading || !user || !companyId || !billing) return null;

  // If the user has upgraded to any paid plan, they're fine regardless of
  // subscription_status (which may be 'trialing' while Stripe runs its own
  // subscription trial with the card on file). Only gate paid users if their
  // billing has actually failed (past_due / canceled).
  const paidPlan = billing.plan && billing.plan !== "trial";
  if (paidPlan && billing.subscription_status !== "past_due" && billing.subscription_status !== "canceled") {
    return null;
  }

  // From here down we're only dealing with users on the free app trial
  // (plan === 'trial').
  const daysLeft = daysUntil(billing.trial_ends_at);
  const isFreeTrial = billing.plan === "trial";

  // If trial has expired show the blocking overlay — but NOT on pages where
  // the user needs to be able to recover (e.g. the billing page itself, or
  // auth flows).
  const expired = isFreeTrial && daysLeft !== null && daysLeft <= 0;
  const overlaySuppressed = OVERLAY_ALLOW_PATHS.some(p => pathname.startsWith(p));

  if (expired && !overlaySuppressed) {
    return <TrialExpiredOverlay companyId={companyId} exporting={exporting} setExporting={setExporting} exportError={exportError} setExportError={setExportError} />;
  }

  // On the billing page when expired, still render a compact warning banner.
  if (expired && overlaySuppressed) {
    return (
      <div
        style={{ background: "rgba(239,68,68,0.12)", borderBottom: "1px solid rgba(239,68,68,0.35)", color: "#991b1b" }}
        className="w-full px-4 py-2 flex items-center justify-center gap-3 text-xs font-medium"
      >
        <span>⚠️ Your free trial has ended. Subscribe below to unlock the app.</span>
      </div>
    );
  }

  // Otherwise, still in free trial — show the countdown banner.
  if (isFreeTrial && daysLeft !== null && daysLeft > 0) {
    const urgent = daysLeft <= 3;
    return (
      <div
        style={{
          background: urgent ? "rgba(239,68,68,0.12)" : "rgba(230,48,0,0.08)",
          borderBottom: urgent ? "1px solid rgba(239,68,68,0.35)" : "1px solid rgba(230,48,0,0.25)",
          color: urgent ? "#991b1b" : "#7c2d12",
        }}
        className="w-full px-4 py-2 flex items-center justify-center gap-3 text-xs font-medium"
      >
        <span>
          {urgent ? "⚠️" : "⏳"}  Free trial — <strong>{daysLeft} {daysLeft === 1 ? "day" : "days"} left</strong>
        </span>
        <Link
          href="/settings/billing"
          className="rounded px-2.5 py-0.5 font-semibold transition-colors"
          style={{ background: "var(--zr-orange)", color: "#fff" }}
        >
          Upgrade now
        </Link>
      </div>
    );
  }

  return null;
}

// ─── Full-screen overlay shown once trial expires ──────────────────────────
function TrialExpiredOverlay({
  companyId,
  exporting,
  setExporting,
  exportError,
  setExportError,
}: {
  companyId: string;
  exporting: boolean;
  setExporting: (v: boolean) => void;
  exportError: string;
  setExportError: (v: string) => void;
}) {
  async function exportAllData() {
    setExportError("");
    setExporting(true);
    try {
      // Pull everything the user might care about into a single JSON bundle.
      // RLS scopes each query to their company automatically — no need to
      // repeat company_id filters here.
      const [customers, quotes, quoteLines, measureJobs, rooms, windows, invoices, invoiceLines, payments, tasks, activityLog] = await Promise.all([
        supabase.from("customers").select("*"),
        supabase.from("quotes").select("*"),
        supabase.from("quote_line_items").select("*"),
        supabase.from("measure_jobs").select("*"),
        supabase.from("rooms").select("*"),
        supabase.from("windows").select("*"),
        supabase.from("invoices").select("*"),
        supabase.from("invoice_line_items").select("*"),
        supabase.from("payments").select("*"),
        supabase.from("tasks").select("*"),
        supabase.from("activity_log").select("*"),
      ]);

      const bundle = {
        exported_at: new Date().toISOString(),
        company_id: companyId,
        customers: customers.data ?? [],
        quotes: quotes.data ?? [],
        quote_line_items: quoteLines.data ?? [],
        measure_jobs: measureJobs.data ?? [],
        rooms: rooms.data ?? [],
        windows: windows.data ?? [],
        invoices: invoices.data ?? [],
        invoice_line_items: invoiceLines.data ?? [],
        payments: payments.data ?? [],
        tasks: tasks.data ?? [],
        activity_log: activityLog.data ?? [],
      };

      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `zeroremake-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[trial export]", err);
      setExportError(err instanceof Error ? err.message : "Export failed. Please try again or email support@zeroremake.com.");
    } finally {
      setExporting(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(17, 24, 39, 0.85)",
        backdropFilter: "blur(6px)",
      }}
      className="flex items-center justify-center p-4"
    >
      <div
        style={{ background: "#ffffff", border: "1px solid #e5e7eb" }}
        className="w-full max-w-md rounded-2xl p-6 shadow-2xl"
      >
        <div className="text-center mb-5">
          <div className="mb-3 text-4xl">⏰</div>
          <h2 className="text-2xl font-bold mb-2" style={{ color: "#111827" }}>
            Your free trial has ended
          </h2>
          <p className="text-sm" style={{ color: "#6b7280" }}>
            Upgrade to keep using ZeroRemake. All your customer data is safely stored — subscribing unlocks it immediately.
          </p>
        </div>

        <Link
          href="/settings/billing"
          className="block w-full rounded-xl py-3 text-center text-sm font-bold mb-3 transition-colors"
          style={{ background: "var(--zr-orange)", color: "#fff", boxShadow: "0 4px 14px rgba(230,48,0,0.3)" }}
        >
          Choose a plan →
        </Link>

        <div className="grid grid-cols-3 gap-2 mb-5 text-center">
          <div className="rounded-lg p-2" style={{ background: "#f9fafb", border: "1px solid #e5e7eb" }}>
            <div className="text-xs font-medium" style={{ color: "#6b7280" }}>Starter</div>
            <div className="text-sm font-bold" style={{ color: "#111827" }}>$49/mo</div>
          </div>
          <div className="rounded-lg p-2" style={{ background: "rgba(230,48,0,0.08)", border: "1px solid rgba(230,48,0,0.35)" }}>
            <div className="text-xs font-medium" style={{ color: "var(--zr-orange)" }}>Pro</div>
            <div className="text-sm font-bold" style={{ color: "#111827" }}>$99/mo</div>
          </div>
          <div className="rounded-lg p-2" style={{ background: "#f9fafb", border: "1px solid #e5e7eb" }}>
            <div className="text-xs font-medium" style={{ color: "#6b7280" }}>Business</div>
            <div className="text-sm font-bold" style={{ color: "#111827" }}>$199/mo</div>
          </div>
        </div>

        <div className="border-t pt-4 mb-3" style={{ borderColor: "#e5e7eb" }}>
          <p className="text-xs mb-2 text-center" style={{ color: "#9ca3af" }}>
            Not ready to subscribe? You can take your data with you.
          </p>
          <button
            onClick={exportAllData}
            disabled={exporting}
            className="block w-full rounded-lg py-2 text-center text-sm font-medium transition-colors disabled:opacity-50"
            style={{ background: "#f3f4f6", color: "#374151", border: "1px solid #e5e7eb" }}
          >
            {exporting ? "Preparing download..." : "⬇ Download all my data (JSON)"}
          </button>
          {exportError && (
            <p className="text-xs mt-2 text-center" style={{ color: "#ef4444" }}>
              {exportError}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between text-xs" style={{ color: "#9ca3af" }}>
          <button
            onClick={() => window.location.reload()}
            className="hover:underline"
          >
            Already subscribed? Refresh
          </button>
          <button
            onClick={signOut}
            className="hover:underline"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
