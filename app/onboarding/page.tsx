"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../auth-provider";
import { supabase } from "../../lib/supabase";
import { ZRLogo } from "../zr-logo";
import {
  BUSINESS_PRESETS,
  BUSINESS_TYPE_LIST,
  type BusinessType,
} from "../../lib/business-presets";

export default function OnboardingPage() {
  const router = useRouter();
  const { companyId: ctxCompanyId } = useAuth();
  const [selected, setSelected] = useState<BusinessType | null>(null);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<"select" | "confirm">("select");
  const [error, setError] = useState<string>("");

  const preset = selected ? BUSINESS_PRESETS[selected] : null;

  async function applyPreset() {
    if (!selected || !preset) {
      setError("Pick a business type first.");
      return;
    }
    setError("");
    setSaving(true);

    try {
      // Resolve companyId directly from the current session, bypassing any
      // stale/unloaded useAuth() context. This fixes the silent bail that
      // happened when the AuthProvider hadn't finished loading the profile.
      let resolvedCompanyId = ctxCompanyId;
      if (!resolvedCompanyId) {
        const { data: authData } = await supabase.auth.getUser();
        const uid = authData?.user?.id;
        if (!uid) {
          throw new Error("You're not signed in. Please log in and try again.");
        }
        const { data: profile, error: profileErr } = await supabase
          .from("profiles")
          .select("company_id")
          .eq("id", uid)
          .single();
        if (profileErr || !profile?.company_id) {
          throw new Error(
            "Couldn't find your workspace. Try refreshing the page, or contact support@zeroremake.com."
          );
        }
        resolvedCompanyId = profile.company_id;
      }

      // Update company with business type, hidden nav, and feature overrides
      const { data: company, error: selectErr } = await supabase
        .from("companies")
        .select("features")
        .eq("id", resolvedCompanyId)
        .single();
      if (selectErr) throw selectErr;

      const currentFeatures = company?.features ?? {};
      const mergedFeatures = { ...currentFeatures, ...preset.featureOverrides };

      const { error: updateErr } = await supabase
        .from("companies")
        .update({
          business_type: selected,
          hidden_nav: preset.hiddenNav,
          features: mergedFeatures,
        })
        .eq("id", resolvedCompanyId);
      if (updateErr) throw updateErr;

      // Set dashboard layout cookie for the owner
      if (typeof document !== "undefined" && preset.dashboardWidgets.length > 0) {
        const layout = JSON.stringify({
          order: preset.dashboardWidgets,
          hidden: [],
        });
        document.cookie = `zr_layout=${encodeURIComponent(layout)};path=/;max-age=${365 * 24 * 60 * 60}`;
      }

      router.replace("/");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setError(msg);
      // eslint-disable-next-line no-console
      console.error("[onboarding applyPreset]", err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="min-h-screen p-4 flex flex-col items-center"
      style={{ background: "var(--zr-black)" }}
    >
      <div className="w-full max-w-3xl">
        {/* Header */}
        <div className="text-center mt-8 mb-6 flex flex-col items-center gap-3">
          <ZRLogo size="lg" />
          <h1
            className="text-2xl font-bold"
            style={{ color: "var(--zr-text-primary)" }}
          >
            {step === "select"
              ? "What kind of business do you run?"
              : `${preset?.emoji} ${preset?.label}`}
          </h1>
          <p
            className="text-sm max-w-md"
            style={{ color: "var(--zr-text-muted)" }}
          >
            {step === "select"
              ? "We'll set up your workspace with the right tools for how you operate. You can always change this later in Settings."
              : preset?.description}
          </p>
        </div>

        {step === "select" && (
          <>
            {/* Business type cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
              {BUSINESS_TYPE_LIST.map((type) => {
                const p = BUSINESS_PRESETS[type];
                const isSelected = selected === type;
                return (
                  <button
                    key={type}
                    onClick={() => setSelected(type)}
                    className="text-left p-4 rounded-xl transition-all cursor-pointer"
                    style={{
                      background: isSelected
                        ? "rgba(230, 48, 0, 0.08)"
                        : "var(--zr-surface-1)",
                      border: isSelected
                        ? "2px solid var(--zr-orange)"
                        : "2px solid var(--zr-border)",
                      borderRadius: "var(--zr-radius-xl)",
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-2xl mt-0.5">{p.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div
                          className="font-semibold text-sm"
                          style={{ color: "var(--zr-text-primary)" }}
                        >
                          {p.label}
                        </div>
                        <div
                          className="text-xs mt-0.5"
                          style={{ color: "var(--zr-text-secondary)" }}
                        >
                          {p.tagline}
                        </div>
                      </div>
                      {isSelected && (
                        <span
                          className="text-sm font-bold mt-1"
                          style={{ color: "var(--zr-orange)" }}
                        >
                          {"\u2713"}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Continue button */}
            <div className="flex justify-center gap-3">
              <button
                onClick={() => {
                  if (selected) setStep("confirm");
                }}
                disabled={!selected}
                className="px-8 py-3 font-bold text-white disabled:opacity-40 cursor-pointer"
                style={{
                  background: "var(--zr-orange)",
                  borderRadius: "var(--zr-radius-md)",
                  border: "none",
                }}
              >
                Continue
              </button>
              <button
                onClick={() => router.replace("/")}
                className="px-6 py-3 text-sm cursor-pointer"
                style={{
                  color: "var(--zr-text-muted)",
                  background: "transparent",
                  border: "1px solid var(--zr-border)",
                  borderRadius: "var(--zr-radius-md)",
                }}
              >
                Skip for now
              </button>
            </div>
          </>
        )}

        {step === "confirm" && preset && (
          <div
            className="p-6 rounded-xl mx-auto max-w-lg"
            style={{
              background: "var(--zr-surface-1)",
              border: "1px solid var(--zr-border)",
              borderRadius: "var(--zr-radius-xl)",
            }}
          >
            {/* What we'll set up */}
            <h3
              className="text-sm font-semibold mb-3"
              style={{ color: "var(--zr-text-primary)" }}
            >
              Here's what we'll configure for you:
            </h3>

            <div className="space-y-3 mb-5">
              {/* Features enabled */}
              <div>
                <div
                  className="text-xs font-medium mb-1"
                  style={{ color: "var(--zr-text-secondary)" }}
                >
                  Features we'll turn on
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      "crm",
                      "scheduling",
                      "quoting",
                      "inventory",
                      "analytics",
                      "builder_portal",
                      "automation",
                    ] as const
                  ).map((f) => {
                    const on = preset.featureOverrides[f] !== false;
                    return (
                      <span
                        key={f}
                        className="text-xs px-2 py-0.5 rounded-full"
                        style={{
                          background: on
                            ? "rgba(34,197,94,0.1)"
                            : "rgba(239,68,68,0.1)",
                          color: on ? "#22c55e" : "var(--zr-text-muted)",
                          border: on
                            ? "1px solid rgba(34,197,94,0.3)"
                            : "1px solid var(--zr-border)",
                          textDecoration: on ? "none" : "line-through",
                        }}
                      >
                        {f.replace("_", " ")}
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Nav sections */}
              {preset.hiddenNav.length > 0 && (
                <div>
                  <div
                    className="text-xs font-medium mb-1"
                    style={{ color: "var(--zr-text-secondary)" }}
                  >
                    Sections we'll hide (you can re-enable anytime)
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {preset.hiddenNav.map((href) => (
                      <span
                        key={href}
                        className="text-xs px-2 py-0.5 rounded-full"
                        style={{
                          background: "var(--zr-surface-2)",
                          color: "var(--zr-text-muted)",
                          border: "1px solid var(--zr-border)",
                        }}
                      >
                        {href.replace("/", "").replace("manufacturers", "specs")}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Suggested roles */}
              <div>
                <div
                  className="text-xs font-medium mb-1"
                  style={{ color: "var(--zr-text-secondary)" }}
                >
                  Typical team roles for your setup
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {preset.suggestedRoles.map((role) => (
                    <span
                      key={role}
                      className="text-xs px-2 py-0.5 rounded-full capitalize"
                      style={{
                        background: "rgba(59,130,246,0.1)",
                        color: "var(--zr-info)",
                        border: "1px solid rgba(59,130,246,0.3)",
                      }}
                    >
                      {role}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Actions */}
            {error && (
              <div
                className="mb-3 rounded px-3 py-2 text-sm"
                style={{
                  background: "rgba(239,68,68,0.15)",
                  border: "1px solid rgba(239,68,68,0.3)",
                  color: "var(--zr-error)",
                }}
              >
                {error}
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={applyPreset}
                disabled={saving}
                className="flex-1 py-3 font-bold text-white disabled:opacity-50 cursor-pointer"
                style={{
                  background: "var(--zr-orange)",
                  borderRadius: "var(--zr-radius-md)",
                  border: "none",
                }}
              >
                {saving ? "Setting up..." : "Set Up My Workspace"}
              </button>
              <button
                onClick={() => setStep("select")}
                className="px-4 py-3 text-sm cursor-pointer"
                style={{
                  color: "var(--zr-text-muted)",
                  background: "transparent",
                  border: "1px solid var(--zr-border)",
                  borderRadius: "var(--zr-radius-md)",
                }}
              >
                Back
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
