"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function SignupPage() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState("");
  const [fullName,    setFullName]    = useState("");
  const [email,       setEmail]       = useState("");
  const [password,    setPassword]    = useState("");
  const [error,       setError]       = useState("");
  const [loading,     setLoading]     = useState(false);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    setError(""); setLoading(true);

    // 1. Create the auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });
    if (authError || !authData.user) {
      setError(authError?.message ?? "Signup failed."); setLoading(false); return;
    }

    const userId = authData.user.id;

    // 2. Create the company
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .insert([{ name: companyName.trim() }])
      .select("id").single();
    if (companyError || !company) {
      setError("Error creating company: " + companyError?.message); setLoading(false); return;
    }

    // 3. Create the user profile
    await supabase.from("profiles").insert([{
      id: userId,
      company_id: company.id,
      full_name: fullName.trim() || null,
      role: "owner",
    }]);

    // 4. Seed company settings with company name
    await supabase.from("company_settings").upsert([{
      name: companyName.trim(),
    }]);

    setLoading(false);
    router.replace("/");
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white">ShadeLogic</h1>
          <p className="text-gray-400 text-sm mt-1">Start your free account</p>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-xl">
          <h2 className="text-xl font-bold mb-5">Create account</h2>

          {error && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Company Name *</label>
              <input value={companyName} onChange={e => setCompanyName(e.target.value)} required autoFocus
                placeholder="Aspen Blinds" className="w-full border rounded-xl px-3 py-2.5 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Your Name</label>
              <input value={fullName} onChange={e => setFullName(e.target.value)}
                placeholder="Steve Wiezbowski" className="w-full border rounded-xl px-3 py-2.5 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Email *</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                placeholder="you@example.com" className="w-full border rounded-xl px-3 py-2.5 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Password *</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                placeholder="6+ characters" className="w-full border rounded-xl px-3 py-2.5 text-sm" />
            </div>
            <button type="submit" disabled={loading}
              className="w-full bg-black text-white rounded-xl py-3 font-semibold disabled:opacity-50">
              {loading ? "Creating account…" : "Create Account →"}
            </button>
          </form>

          <div className="mt-4 text-center text-xs text-gray-400">
            Already have an account?{" "}
            <Link href="/login" className="text-blue-600 hover:underline font-medium">Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
