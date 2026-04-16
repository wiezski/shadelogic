"use client";

import { useAuth } from "./auth-provider";
import type { FeatureKey } from "../lib/features";

type Props = {
  require: FeatureKey;
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

export function FeatureGate({ require, children, fallback }: Props) {
  const { features, plan } = useAuth();

  if (!features[require]) {
    return fallback ?? (
      <main className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: "var(--zr-black)" }}>
        <div className="text-center max-w-sm">
          <div className="text-4xl mb-3">🔒</div>
          <h1 className="text-xl font-bold mb-2" style={{ color: "var(--zr-text-primary)" }}>Feature Not Available</h1>
          <p className="text-sm mb-4" style={{ color: "var(--zr-text-secondary)" }}>
            This feature requires a {require === "builder_portal" || require === "automation" ? "Enterprise" : "Pro"} plan.
            Your current plan is <span className="font-medium capitalize">{plan}</span>.
          </p>
          <a href="/settings" className="text-sm hover:underline" style={{ color: "var(--zr-orange)" }}>
            ← Back to Settings
          </a>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
