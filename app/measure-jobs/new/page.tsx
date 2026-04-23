"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Quick-start measure — blank measure flow for installers in the field.
//
// Goal: zero-friction start. Type the customer's name, tap Start, the measure
// page opens. Phone, address, email, and the rest of the customer record can
// be filled in later from the customer screen.
//
// The flow:
//   1. Single "Customer name" input (accepts "Firstname" or "Firstname Lastname")
//   2. Creates a customer row with just that name (other fields blank)
//   3. Creates a measure_job linked to the new customer
//   4. Redirects to /measure-jobs/{new_id}
//
// Constraint: `customer_id` on measure_jobs is NOT NULL, so we always create
// a real customer record even for a quick measure. The Finish / Submit Measure
// button on the measure page blocks if the customer has no first_name — so
// a measure can't be completed anonymously.
// ─────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../auth-provider";
import { PermissionGate } from "../../permission-gate";

export default function NewMeasurePage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Auto-focus the name input on load — installer in the field taps the
    // quick action and starts typing immediately, no extra taps required.
    inputRef.current?.focus();
  }, []);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) { setError("Type a name to start."); return; }
    if (!user) { setError("Not signed in."); return; }
    setError(null);
    setSaving(true);

    // Split on first space: "John Smith" -> first="John", last="Smith".
    // Single-word names are allowed (some homeowners go by one name).
    const firstSpace = trimmed.indexOf(" ");
    const first = firstSpace === -1 ? trimmed : trimmed.slice(0, firstSpace);
    const last  = firstSpace === -1 ? ""      : trimmed.slice(firstSpace + 1).trim();
    const displayName = [first, last].filter(Boolean).join(" ");

    // 1. Create the customer stub
    const { data: cust, error: custErr } = await supabase
      .from("customers")
      .insert([{
        name: displayName,
        first_name: first,
        last_name: last || null,
      }])
      .select("id, first_name, last_name")
      .single();

    if (custErr || !cust) {
      setSaving(false);
      setError(custErr?.message || "Could not create customer.");
      return;
    }

    // 2. Create the measure job linked to that customer
    const today = new Date().toISOString().slice(0, 10);
    const jobTitle = `${last || first} - ${today}`;
    const { data: job, error: jobErr } = await supabase
      .from("measure_jobs")
      .insert([{
        customer_id: cust.id,
        title: jobTitle,
        scheduled_at: `${today}T12:00:00`,
      }])
      .select("id")
      .single();

    if (jobErr || !job) {
      setSaving(false);
      setError(jobErr?.message || "Could not create measure job.");
      return;
    }

    // 3. Redirect straight into the measure editor
    router.replace(`/measure-jobs/${job.id}`);
  }

  if (authLoading) {
    return <main className="min-h-screen" style={{ background: "var(--zr-canvas)" }} />;
  }

  return (
    <PermissionGate require="view_customers">
      <main style={{ background: "var(--zr-canvas)", color: "var(--zr-text-primary)" }} className="min-h-screen pt-2 pb-24 text-sm">
        <div className="mx-auto max-w-md px-4 sm:px-6">
          {/* iOS back */}
          <div className="mb-3">
            <Link href="/"
              style={{ color: "var(--zr-orange)", display: "inline-flex", alignItems: "center", gap: 2, fontSize: "15px", fontWeight: 400, letterSpacing: "-0.012em" }}
              className="transition-opacity active:opacity-60">
              <svg width="10" height="16" viewBox="0 0 10 16" fill="none" style={{ marginRight: 2 }}>
                <path d="M8 1 L2 8 L8 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Home
            </Link>
          </div>

          <div className="mb-5 px-1">
            <h1 style={{ fontSize: "28px", fontWeight: 700, letterSpacing: "-0.025em", color: "var(--zr-text-primary)", lineHeight: 1.15 }}>
              New measure
            </h1>
            <p style={{ fontSize: "13.5px", color: "rgba(60,60,67,0.6)", marginTop: 4, letterSpacing: "-0.005em", lineHeight: 1.4 }}>
              Start now with just the customer&apos;s name. You can fill in phone, address, and the rest later.
            </p>
          </div>

          <form onSubmit={start} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ fontSize: "13px", color: "rgba(60,60,67,0.6)", fontWeight: 500, display: "block", marginBottom: 6, paddingLeft: 4, letterSpacing: "-0.005em" }}>
                Customer name
              </label>
              <input
                ref={inputRef}
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="John Smith"
                autoCapitalize="words"
                style={{
                  width: "100%",
                  background: "rgba(60,60,67,0.06)",
                  color: "var(--zr-text-primary)",
                  fontSize: "16px",
                  letterSpacing: "-0.012em",
                  padding: "12px 16px",
                  borderRadius: 12,
                  border: "none",
                  outline: "none",
                }} />
            </div>

            {error && (
              <div style={{ fontSize: "13px", color: "#c6443a", paddingLeft: 4 }}>{error}</div>
            )}

            <button type="submit" disabled={saving || !name.trim()}
              className="transition-all active:scale-[0.98] mt-2"
              style={{
                background: "var(--zr-orange)",
                color: "#fff",
                fontSize: "15px",
                fontWeight: 600,
                padding: "14px 20px",
                borderRadius: 14,
                letterSpacing: "-0.012em",
                opacity: saving || !name.trim() ? 0.5 : 1,
              }}>
              {saving ? "Starting…" : "Start measure"}
            </button>

            <p style={{ fontSize: "12.5px", color: "rgba(60,60,67,0.5)", textAlign: "center", marginTop: 6, lineHeight: 1.4 }}>
              A customer record is created automatically. You can complete their details anytime from Customers.
            </p>
          </form>
        </div>
      </main>
    </PermissionGate>
  );
}
