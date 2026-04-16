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
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-gray-400 text-sm">Loading…</div>
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
      <main className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="text-center max-w-sm space-y-3">
          <div className="text-4xl">🔒</div>
          <h1 className="text-lg font-bold text-gray-800">Access Restricted</h1>
          <p className="text-sm text-gray-500">
            You don't have permission to view this page. Contact your company admin if you need access.
          </p>
          <a href="/" className="inline-block text-sm text-blue-600 hover:underline mt-2">
            ← Back to Home
          </a>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
