"use client";

import Link from "next/link";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { ZRLogo } from "../zr-logo";

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" style={{ background: "var(--zr-black)" }} />}>
      <SignupInner />
    </Suspense>
  );
}

function SignupInner() {
  const router      = useRouter();
  const searchParams = useSearchParams();
  const inviteCompanyId = searchParams.get("company") ?? "";
  const isInvite = !!inviteCompanyId;

  const [companyName, setCompanyName] = useState("");
  const [fullName,    setFullName]    = useState("");
  const [email,       setEmail]       = useState("");
  const [password,    setPassword]    = useState("");
  const [error,       setError]       = useState("");
  const [loading,     setLoading]     = useState(false);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (!isInvite && !companyName.trim()) { setError("Company name is required."); return; }
    setError(""); setLoading(true);

    const { data: authData, error: authError } = await supabase.auth.signUp({ email: email.trim(), password });
    if (authError || !authData.user) {
      setError(authError?.message ?? "Signup failed."); setLoading(false); return;
    }
    const userId = authData.user.id;

    if (isInvite) {
      // Join existing company
      await supabase.from("profiles").insert([{
        id: userId, company_id: inviteCompanyId,
        full_name: fullName.trim() || null, role: "office",
      }]);
    } else {
      // Create new company
      const { data: company } = await supabase.from("companies")
        .insert([{ name: companyName.trim() }]).select("id").single();
      if (!company) { setError("Error creating company."); setLoading(false); return; }
      await supabase.from("profiles").insert([{
        id: userId, company_id: company.id,
        full_name: fullName.trim() || null, role: "owner",
      }]);
      await supabase.from("company_settings").insert([{ name: companyName.trim(), company_id: company.id }]);
    }

    setLoading(false);
    router.replace("/");
  }

  const inputStyle = { background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", borderRadius: "var(--zr-radius-md)", color: "var(--zr-text-primary)" };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "var(--zr-black)" }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8 flex flex-col items-center gap-3">
          <ZRLogo size="lg" />
          <p style={{ color: "var(--zr-text-muted)", fontFamily: "var(--zr-font-mono)", fontSize: "11px", letterSpacing: "3px", textTransform: "uppercase" }}>
            {isInvite ? "You've been invited to join a team" : "Start your free account"}
          </p>
        </div>
        <div className="p-6" style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)", borderRadius: "var(--zr-radius-xl)" }}>
          <h2 className="text-xl font-bold mb-5" style={{ color: "var(--zr-text-primary)" }}>
            {isInvite ? "Create your account" : "Create account"}
          </h2>
          {error && (
            <div className="mb-4 rounded-lg px-3 py-2 text-sm" style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", color: "var(--zr-error)" }}>{error}</div>
          )}
          <form onSubmit={handleSignup} className="space-y-4">
            {!isInvite && (
              <div>
                <label className="block mb-1" style={{ fontSize: "13px", fontWeight: 600, color: "var(--zr-text-secondary)" }}>Company Name *</label>
                <input value={companyName} onChange={e => setCompanyName(e.target.value)} required autoFocus
                  placeholder="Aspen Blinds" className="w-full px-3 py-2.5 text-sm outline-none" style={inputStyle} />
              </div>
            )}
            <div>
              <label className="block mb-1" style={{ fontSize: "13px", fontWeight: 600, color: "var(--zr-text-secondary)" }}>Your Name</label>
              <input value={fullName} onChange={e => setFullName(e.target.value)}
                placeholder="Steve Smith" className="w-full px-3 py-2.5 text-sm outline-none" style={inputStyle}
                autoFocus={isInvite} />
            </div>
            <div>
              <label className="block mb-1" style={{ fontSize: "13px", fontWeight: 600, color: "var(--zr-text-secondary)" }}>Email *</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                placeholder="you@example.com" className="w-full px-3 py-2.5 text-sm outline-none" style={inputStyle} />
            </div>
            <div>
              <label className="block mb-1" style={{ fontSize: "13px", fontWeight: 600, color: "var(--zr-text-secondary)" }}>Password *</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                placeholder="6+ characters" className="w-full px-3 py-2.5 text-sm outline-none" style={inputStyle} />
            </div>
            <button type="submit" disabled={loading}
              className="w-full py-3 font-bold text-white disabled:opacity-50 cursor-pointer"
              style={{ background: "var(--zr-orange)", borderRadius: "var(--zr-radius-md)", border: "none" }}>
              {loading ? "Creating account..." : isInvite ? "Join Team" : "Create Account"}
            </button>
          </form>
          <div className="mt-4 text-center text-xs" style={{ color: "var(--zr-text-muted)" }}>
            Already have an account?{" "}
            <Link href="/login" className="font-medium hover:underline" style={{ color: "var(--zr-orange)" }}>Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
