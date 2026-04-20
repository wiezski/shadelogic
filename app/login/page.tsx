"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { ZRLogo } from "../zr-logo";
import { TurnstileWidget, useTurnstile } from "../turnstile";

export default function LoginPage() {
  const router  = useRouter();
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const turnstile = useTurnstile();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (turnstile.enabled && !turnstile.token) { setError("Please complete the verification."); return; }
    setError(""); setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) { setError(error.message); return; }
    router.replace("/");
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "var(--zr-black)" }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8 flex flex-col items-center gap-3">
          <ZRLogo size="lg" />
          <p style={{ color: "var(--zr-text-muted)", fontFamily: "var(--zr-font-mono)", fontSize: "11px", letterSpacing: "3px", textTransform: "uppercase" }}>
            No Remakes.
          </p>
        </div>

        <div className="p-6" style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)", borderRadius: "var(--zr-radius-xl)" }}>
          <h2 className="text-xl font-bold mb-5" style={{ color: "var(--zr-text-primary)" }}>Sign in</h2>

          {error && (
            <div className="mb-4 rounded-lg px-3 py-2 text-sm" style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", color: "var(--zr-error)" }}>
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block mb-1" style={{ fontSize: "13px", fontWeight: 600, color: "var(--zr-text-secondary)" }}>Email</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                required autoFocus placeholder="you@example.com"
                className="w-full px-3 py-2.5 text-sm outline-none"
                style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", borderRadius: "var(--zr-radius-md)", color: "var(--zr-text-primary)" }}
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label style={{ fontSize: "13px", fontWeight: 600, color: "var(--zr-text-secondary)" }}>Password</label>
                <Link href="/forgot-password" className="hover:underline" style={{ fontSize: "12px", color: "var(--zr-orange)" }}>
                  Forgot password?
                </Link>
              </div>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                required placeholder="••••••••"
                className="w-full px-3 py-2.5 text-sm outline-none"
                style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", borderRadius: "var(--zr-radius-md)", color: "var(--zr-text-primary)" }}
              />
            </div>
            <TurnstileWidget onToken={turnstile.setToken} />
            <button type="submit" disabled={loading}
              className="w-full py-3 font-bold text-white disabled:opacity-50 cursor-pointer"
              style={{ background: "var(--zr-orange)", borderRadius: "var(--zr-radius-md)", border: "none" }}>
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <div className="mt-4 text-center text-xs" style={{ color: "var(--zr-text-muted)" }}>
            New company?{" "}
            <Link href="/signup" className="font-medium hover:underline" style={{ color: "var(--zr-orange)" }}>
              Create account
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
