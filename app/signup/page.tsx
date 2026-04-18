"use client";

import Link from "next/link";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { ZRLogo } from "../zr-logo";
import { PLAN_USER_LIMITS, type Plan } from "../../lib/features";

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
  const [pending,     setPending]     = useState(false);

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
      // Check if company is at/over its plan user limit
      let needsApproval = false;
      try {
        // Get company plan
        const { data: company } = await supabase
          .from("companies")
          .select("plan")
          .eq("id", inviteCompanyId)
          .single();

        const plan = (company?.plan ?? "trial") as Plan;
        const limits = PLAN_USER_LIMITS[plan] ?? PLAN_USER_LIMITS.trial;

        // Count current active members
        const { count } = await supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("company_id", inviteCompanyId)
          .eq("status", "active");

        const currentUsers = count ?? 0;
        needsApproval = currentUsers >= limits.included;
      } catch {
        // If we can't check, default to no approval needed (fail open)
        needsApproval = false;
      }

      if (needsApproval) {
        // Over limit — insert as pending, create approval request
        await supabase.from("profiles").insert([{
          id: userId, company_id: inviteCompanyId,
          full_name: fullName.trim() || null, role: "office",
          status: "pending",
        }]);
        await supabase.from("pending_approvals").insert([{
          profile_id: userId, company_id: inviteCompanyId,
        }]);
        setLoading(false);
        setPending(true);
        return;
      } else {
        // Under limit — join freely
        await supabase.from("profiles").insert([{
          id: userId, company_id: inviteCompanyId,
          full_name: fullName.trim() || null, role: "office",
          status: "active",
        }]);
      }
    } else {
      // Create new company
      const { data: company } = await supabase.from("companies")
        .insert([{ name: companyName.trim() }]).select("id").single();
      if (!company) { setError("Error creating company."); setLoading(false); return; }
      await supabase.from("profiles").insert([{
        id: userId, company_id: company.id,
        full_name: fullName.trim() || null, role: "owner",
        status: "active",
      }]);
      await supabase.from("company_settings").insert([{ name: companyName.trim(), company_id: company.id }]);
    }

    setLoading(false);
    router.replace("/");
  }

  const inputStyle = { background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", borderRadius: "var(--zr-radius-md)", color: "var(--zr-text-primary)" };

  // Show pending approval screen
  if (pending) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "var(--zr-black)" }}>
        <div className="w-full max-w-sm">
          <div className="text-center mb-8 flex flex-col items-center gap-3">
            <ZRLogo size="lg" />
          </div>
          <div className="p-6 text-center space-y-4" style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)", borderRadius: "var(--zr-radius-xl)" }}>
            <div className="text-3xl">⏳</div>
            <h2 className="text-xl font-bold" style={{ color: "var(--zr-text-primary)" }}>Waiting for Approval</h2>
            <p className="text-sm" style={{ color: "var(--zr-text-secondary)" }}>
              Your account has been created, but the team is currently at its user limit. The account owner has been notified and needs to approve your access.
            </p>
            <p className="text-sm" style={{ color: "var(--zr-text-muted)" }}>
              Adding you will cost an extra $25/mo on their subscription. Once approved, you'll have full access.
            </p>
            <div className="rounded p-3" style={{ background: "rgba(59, 130, 246, 0.1)", border: "1px solid var(--zr-info)" }}>
              <p className="text-xs" style={{ color: "var(--zr-info)" }}>
                You'll be able to log in once the team owner approves your request. Check back soon!
              </p>
            </div>
            <Link href="/login" className="inline-block text-sm font-medium hover:underline" style={{ color: "var(--zr-orange)" }}>
              Back to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

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
