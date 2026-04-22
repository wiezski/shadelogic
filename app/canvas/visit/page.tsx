"use client";

// Canvas — Log a visit. Mobile-first form with optional GPS capture.
// On-the-go: click one big button, use GPS to stamp the location, pick outcome, done.

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../auth-provider";

type Territory = { id: string; name: string };

const OUTCOMES: { value: string; label: string; color: string; icon: string }[] = [
  { value: "not_home",       label: "Not home",       color: "#9ca3af", icon: "🚪" },
  { value: "flyer",          label: "Flyer left",     color: "#3b82f6", icon: "📋" },
  { value: "conversation",   label: "Had a chat",     color: "#f59e0b", icon: "💬" },
  { value: "lead",           label: "Lead! 🔥",       color: "#16a34a", icon: "🔥" },
  { value: "do_not_contact", label: "Do not contact", color: "#ef4444", icon: "🚫" },
];

export default function LogVisitPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { companyId, features, loading: authLoading } = useAuth();

  const [territories, setTerritories] = useState<Territory[]>([]);
  const [territoryId, setTerritoryId] = useState<string>(searchParams.get("territory") || "");
  const [address, setAddress] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [gpsStatus, setGpsStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [gpsError, setGpsError] = useState("");
  const [outcome, setOutcome] = useState<string>("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!companyId) return;
    supabase.from("canvas_territories").select("id, name").is("archived_at", null).order("name")
      .then(({ data }) => setTerritories((data || []) as Territory[]));
  }, [companyId]);

  function captureGPS() {
    if (!navigator.geolocation) {
      setGpsError("This device doesn't support GPS. Enter the address manually.");
      setGpsStatus("error");
      return;
    }
    setGpsStatus("loading");
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
        setGpsStatus("ok");
        setGpsError("");
      },
      err => {
        setGpsStatus("error");
        // Platform-aware permission help
        const ua = navigator.userAgent;
        const iOS = /iPhone|iPad|iPod/.test(ua);
        const android = /Android/.test(ua);

        if (err.code === err.PERMISSION_DENIED) {
          if (iOS) {
            setGpsError("Location denied. Fix in iPhone Settings → Safari → Location → set to Ask or Allow, then refresh this page.");
          } else if (android) {
            setGpsError("Location denied. Tap 🔒 next to the URL → Site settings → Location → Allow, then refresh.");
          } else {
            setGpsError("Location permission denied. Click the 🔒 icon in your address bar and allow location access, then refresh.");
          }
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setGpsError("Your device can't determine its location right now. Try moving outside or enter the address manually.");
        } else if (err.code === err.TIMEOUT) {
          setGpsError("GPS is taking too long. Try again or just type the address.");
        } else {
          setGpsError(err.message || "Couldn't get location. Enter the address manually.");
        }
      },
      { timeout: 10000, maximumAge: 60000, enableHighAccuracy: true }
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!companyId) return;
    if (!address.trim()) { setError("Address is required."); return; }
    if (!outcome) { setError("Pick an outcome."); return; }
    setError("");
    setSaving(true);

    let customer_id: string | null = null;

    // If this visit is a lead or conversation with contact info, auto-create a customer
    if ((outcome === "lead" || outcome === "conversation") && (firstName.trim() || phone.trim() || email.trim())) {
      const first = firstName.trim() || null;
      const last = lastName.trim() || null;
      const fullName = [first, last].filter(Boolean).join(" ").trim();
      const { data: cust } = await supabase.from("customers").insert([{
        first_name: first,
        last_name: last,
        name: fullName || `Canvas visit @ ${address.trim()}`,
        phone: phone.trim() || null,
        email: email.trim() || null,
        address: [address.trim(), "", "", ""].join("|"), // street only, rest blank
        lead_status: "New",
        lead_source: "Canvassing",
        heat_score: outcome === "lead" ? "Hot" : "Warm",
        next_action: outcome === "lead" ? "Call to schedule consult" : "Follow up on canvass conversation",
      }]).select("id").single();
      if (cust) customer_id = cust.id;
    }

    const { error: err } = await supabase.from("canvas_visits").insert([{
      company_id: companyId,
      territory_id: territoryId || null,
      address: address.trim(),
      lat, lng,
      outcome,
      notes: notes.trim() || null,
      customer_id,
    }]);

    setSaving(false);
    if (err) { setError(err.message); return; }

    // Success — go back to canvas home (or territory detail if we came from one)
    if (territoryId) router.replace(`/canvas/${territoryId}`);
    else router.replace("/canvas");
  }

  if (authLoading) return <main className="min-h-screen p-4" style={{ background: "var(--zr-black)" }} />;

  if (!features.canvassing) {
    return (
      <main className="min-h-screen p-4" style={{ background: "var(--zr-black)" }}>
        <div className="mx-auto max-w-md text-center text-sm" style={{ color: "var(--zr-text-muted)" }}>
          Canvassing is a Business plan feature. <Link href="/settings/billing" className="underline" style={{ color: "var(--zr-orange)" }}>Upgrade →</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-4" style={{ background: "var(--zr-black)" }}>
      <div className="mx-auto max-w-md">
        <Link href="/canvas" className="text-xs" style={{ color: "var(--zr-orange)" }}>← Back to Canvas</Link>
        <h1 className="mt-2 text-xl font-bold" style={{ color: "var(--zr-text-primary)" }}>Log a Visit</h1>

        <form onSubmit={save} className="mt-4 space-y-4">
          {/* Territory */}
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--zr-text-secondary)" }}>Territory</label>
            <select value={territoryId} onChange={e => setTerritoryId(e.target.value)}
              className="w-full rounded px-2 py-2 text-sm"
              style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }}>
              <option value="">— None (unfiled) —</option>
              {territories.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          {/* Address */}
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--zr-text-secondary)" }}>Address *</label>
            <input value={address} onChange={e => setAddress(e.target.value)}
              placeholder="123 Oak St"
              className="w-full rounded px-2 py-2 text-sm"
              style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }} />
          </div>

          {/* GPS — one-tap capture */}
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--zr-text-secondary)" }}>Location (optional)</label>
            <button type="button" onClick={captureGPS}
              className="w-full rounded px-3 py-2 text-sm font-medium"
              style={{
                background: gpsStatus === "ok" ? "rgba(22,163,74,0.15)" : "var(--zr-surface-2)",
                border: `1px solid ${gpsStatus === "ok" ? "#16a34a" : "var(--zr-border)"}`,
                color: gpsStatus === "ok" ? "#16a34a" : "var(--zr-text-secondary)",
              }}>
              {gpsStatus === "loading" && "Getting GPS…"}
              {gpsStatus === "ok" && `✓ GPS captured (${lat?.toFixed(5)}, ${lng?.toFixed(5)})`}
              {gpsStatus === "error" && `⚠ ${gpsError}`}
              {gpsStatus === "idle" && "📍 Capture current GPS"}
            </button>
          </div>

          {/* Outcome grid */}
          <div>
            <label className="text-xs font-medium block mb-2" style={{ color: "var(--zr-text-secondary)" }}>Outcome *</label>
            <div className="grid grid-cols-2 gap-2">
              {OUTCOMES.map(o => (
                <button key={o.value} type="button" onClick={() => setOutcome(o.value)}
                  className="rounded px-2 py-3 text-xs font-semibold transition-all"
                  style={{
                    background: outcome === o.value ? o.color : "var(--zr-surface-2)",
                    color: outcome === o.value ? "#fff" : "var(--zr-text-secondary)",
                    border: `1px solid ${outcome === o.value ? o.color : "var(--zr-border)"}`,
                  }}>
                  <span className="text-lg block mb-0.5">{o.icon}</span>
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Contact info — only for conversations + leads */}
          {(outcome === "conversation" || outcome === "lead") && (
            <div className="space-y-3 rounded-lg p-3" style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }}>
              <div className="text-xs font-semibold" style={{ color: "var(--zr-text-secondary)" }}>
                Contact info (optional — creates a customer record)
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First name"
                  className="w-full rounded px-2 py-1.5 text-sm"
                  style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }} />
                <input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Last name"
                  className="w-full rounded px-2 py-1.5 text-sm"
                  style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }} />
              </div>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone"
                className="w-full rounded px-2 py-1.5 text-sm"
                style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }} />
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email"
                className="w-full rounded px-2 py-1.5 text-sm"
                style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }} />
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--zr-text-secondary)" }}>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              placeholder="Interested in blinds for upstairs, wants to call back next week..."
              className="w-full rounded px-2 py-2 text-sm"
              style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }} />
          </div>

          {error && <div className="text-xs" style={{ color: "var(--zr-error)" }}>{error}</div>}

          <button type="submit" disabled={saving}
            className="w-full rounded-lg py-3 text-sm font-bold disabled:opacity-50"
            style={{ background: "var(--zr-orange)", color: "#fff" }}>
            {saving ? "Saving..." : "Log Visit"}
          </button>
        </form>
      </div>
    </main>
  );
}
