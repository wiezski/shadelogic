"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { ZRLogo } from "../zr-logo";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Supabase auto-exchanges the token fragment when the page loads.
    // We listen for the PASSWORD_RECOVERY event to know the session is set.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setReady(true);
      }
    });

    // Also check if we already have a session (user clicked link, came back)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setError(""); setLoading(true);

    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setSuccess(true);

    // Redirect to dashboard after a short delay
    setTimeout(() => router.replace("/"), 2000);
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
            Set a new password
          </p>
        </div>

        <div className="p-6" style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)", borderRadius: "var(--zr-radius-xl)" }}>
          {success ? (
            <div className="text-center">
              <div className="text-3xl mb-3">&#10003;</div>
              <h2 className="text-xl font-bold mb-2" style={{ color: "var(--zr-text-primary)" }}>Password updated</h2>
              <p className="text-sm" style={{ color: "var(--zr-text-secondary)" }}>
                Redirecting you to the dashboard...
              </p>
            </div>
          ) : !ready ? (
            <div className="text-center">
              <h2 className="text-xl font-bold mb-2" style={{ color: "var(--zr-text-primary)" }}>Loading...</h2>
              <p className="text-sm mb-4" style={{ color: "var(--zr-text-secondary)" }}>
                Verifying your reset link. If this takes more than a few seconds, your link may have expired.
              </p>
              <Link href="/forgot-password" className="text-sm font-medium hover:underline" style={{ color: "var(--zr-orange)" }}>
                Request a new reset link
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-bold mb-2" style={{ color: "var(--zr-text-primary)" }}>New password</h2>
              <p className="text-sm mb-5" style={{ color: "var(--zr-text-secondary)" }}>
                Choose a new password for your account.
              </p>

              {error && (
                <div className="mb-4 rounded-lg px-3 py-2 text-sm" style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", color: "var(--zr-error)" }}>
                  {error}
                </div>
              )}

              <form onSubmit={handleReset} className="space-y-4">
                <div>
                  <label className="block mb-1" style={{ fontSize: "13px", fontWeight: 600, color: "var(--zr-text-secondary)" }}>New Password</label>
                  <input
                    type="password" value={password} onChange={e => setPassword(e.target.value)}
                    required autoFocus placeholder="6+ characters"
                    className="w-full px-3 py-2.5 text-sm outline-none"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className="block mb-1" style={{ fontSize: "13px", fontWeight: 600, color: "var(--zr-text-secondary)" }}>Confirm Password</label>
                  <input
                    type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                    required placeholder="Type it again"
                    className="w-full px-3 py-2.5 text-sm outline-none"
                    style={inputStyle}
                  />
                </div>
                <button type="submit" disabled={loading}
                  className="w-full py-3 font-bold text-white disabled:opacity-50 cursor-pointer"
                  style={{ background: "var(--zr-orange)", borderRadius: "var(--zr-radius-md)", border: "none" }}>
                  {loading ? "Updating..." : "Update Password"}
                </button>
              </form>
            </>
          )}

          <div className="mt-4 text-center text-xs" style={{ color: "var(--zr-text-muted)" }}>
            <Link href="/login" className="font-medium hover:underline" style={{ color: "var(--zr-orange)" }}>
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
