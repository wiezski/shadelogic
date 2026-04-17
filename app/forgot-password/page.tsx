"use client";

import Link from "next/link";
import { useState } from "react";
import { supabase } from "../../lib/supabase";
import { ZRLogo } from "../zr-logo";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) { setError("Enter your email address."); return; }
    setError(""); setLoading(true);

    const redirectUrl = `${window.location.origin}/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: redirectUrl,
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setSent(true);
  }

  const inputStyle = {
    background: "var(--zr-surface-2)",
    border: "1px solid var(--zr-border)",
    borderRadius: "var(--zr-radius-md)",
    color: "var(--zr-text-primary)",
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "var(--zr-black)" }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8 flex flex-col items-center gap-3">
          <ZRLogo size="lg" />
          <p style={{ color: "var(--zr-text-muted)", fontFamily: "var(--zr-font-mono)", fontSize: "11px", letterSpacing: "3px", textTransform: "uppercase" }}>
            Reset your password
          </p>
        </div>

        <div className="p-6" style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)", borderRadius: "var(--zr-radius-xl)" }}>
          {sent ? (
            <>
              <div className="text-center">
                <div className="text-3xl mb-3">&#9993;</div>
                <h2 className="text-xl font-bold mb-2" style={{ color: "var(--zr-text-primary)" }}>Check your email</h2>
                <p className="text-sm mb-4" style={{ color: "var(--zr-text-secondary)" }}>
                  We sent a password reset link to <strong>{email}</strong>. Click the link in that email to set a new password.
                </p>
                <p className="text-xs mb-4" style={{ color: "var(--zr-text-muted)" }}>
                  Don't see it? Check your spam folder.
                </p>
              </div>
              <button
                onClick={() => { setSent(false); setEmail(""); }}
                className="w-full py-2.5 text-sm font-medium cursor-pointer"
                style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", borderRadius: "var(--zr-radius-md)", color: "var(--zr-text-primary)" }}
              >
                Try a different email
              </button>
            </>
          ) : (
            <>
              <h2 className="text-xl font-bold mb-2" style={{ color: "var(--zr-text-primary)" }}>Forgot password?</h2>
              <p className="text-sm mb-5" style={{ color: "var(--zr-text-secondary)" }}>
                Enter your email and we'll send you a link to reset your password.
              </p>

              {error && (
                <div className="mb-4 rounded-lg px-3 py-2 text-sm" style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", color: "var(--zr-error)" }}>
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block mb-1" style={{ fontSize: "13px", fontWeight: 600, color: "var(--zr-text-secondary)" }}>Email</label>
                  <input
                    type="email" value={email} onChange={e => setEmail(e.target.value)}
                    required autoFocus placeholder="you@example.com"
                    className="w-full px-3 py-2.5 text-sm outline-none"
                    style={inputStyle}
                  />
                </div>
                <button type="submit" disabled={loading}
                  className="w-full py-3 font-bold text-white disabled:opacity-50 cursor-pointer"
                  style={{ background: "var(--zr-orange)", borderRadius: "var(--zr-radius-md)", border: "none" }}>
                  {loading ? "Sending..." : "Send Reset Link"}
                </button>
              </form>
            </>
          )}

          <div className="mt-4 text-center text-xs" style={{ color: "var(--zr-text-muted)" }}>
            Remember your password?{" "}
            <Link href="/login" className="font-medium hover:underline" style={{ color: "var(--zr-orange)" }}>
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
