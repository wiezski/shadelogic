"use client";

import { useAuth } from "./auth-provider";
import type { PermKey } from "../lib/permissions";

type Props = {
  /** Permission(s) required — if multiple, ANY match grants access */
  require: PermKey | PermKey[];
  children: React.ReactNode;
  /** Optional: custom fallback instead of default "no access" screen */
  fallback?: React.ReactNode;
};

export function PermissionGate({ require, children, fallback }: Props) {
  const { permissions, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "var(--zr-black)" }}>
        <div className="text-sm" style={{ color: "var(--zr-text-secondary)" }}>Loading…</div>
      </div>
    );
  }

  // Owner always has full access
  if (role === "owner") return <>{children}</>;

  const keys = Array.isArray(require) ? require : [require];
  const hasAccess = keys.some(k => permissions[k]);

  if (!hasAccess) {
    if (fallback) return <>{fallback}</>;
    return (
      <main className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: "var(--zr-black)" }}>
        <div className="text-center max-w-sm space-y-3">
          <div className="text-4xl">🔒</div>
          <h1 className="text-lg font-bold" style={{ color: "var(--zr-text-primary)" }}>Access Restricted</h1>
          <p className="text-sm" style={{ color: "var(--zr-text-secondary)" }}>
            You don't have permission to view this page. Contact your company admin if you need access.
          </p>
          <a href="/" className="inline-block text-sm mt-2 hover:underline" style={{ color: "var(--zr-orange)" }}>
            ← Back to Home
          </a>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
