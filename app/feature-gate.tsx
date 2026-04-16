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
      <main className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="text-4xl mb-3">🔒</div>
          <h1 className="text-xl font-bold mb-2">Feature Not Available</h1>
          <p className="text-sm text-gray-500 mb-4">
            This feature requires a {require === "builder_portal" || require === "automation" ? "Enterprise" : "Pro"} plan.
            Your current plan is <span className="font-medium capitalize">{plan}</span>.
          </p>
          <a href="/settings" className="text-blue-600 text-sm hover:underline">
            ← Back to Settings
          </a>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
