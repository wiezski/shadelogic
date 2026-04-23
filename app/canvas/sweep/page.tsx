"use client";

// Canvas — Log a street sweep (bulk).
// Used for the common case: "Walked Oak St, dropped 40 hangers, 2 quick chats."
// Mobile-first: minimal fields, tap + / – to adjust counts, one submit.

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../auth-provider";

type Territory = { id: string; name: string };

export default function LogSweepPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { companyId, features, loading: authLoading } = useAuth();

  const [territories, setTerritories] = useState<Territory[]>([]);
  const [territoryId, setTerritoryId] = useState<string>(searchParams.get("territory") || "");
  const [streetName, setStreetName] = useState("");
  const [section, setSection] = useState("");
  const [hangersDropped, setHangersDropped] = useState(0);
  const [knockedCount, setKnockedCount] = useState(0);
  const [noAnswerCount, setNoAnswerCount] = useState(0);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [gpsStatus, setGpsStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [gpsError, setGpsError] = useState("");
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
      setGpsError("Not supported on this device.");
      setGpsStatus("error");
      return;
    }
    setGpsStatus("loading");
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
        setGpsStatus("ok");
      },
      err => {
        setGpsStatus("error");
        const iOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
        if (err.code === err.PERMISSION_DENIED) {
          setGpsError(iOS
            ? "Location denied. iPhone Settings → Safari → Location → Allow, then refresh."
            : "Location denied. Tap 🔒 in address bar → Allow location.");
        } else {
          setGpsError(err.message || "Couldn't get location.");
        }
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!companyId) return;
    if (!streetName.trim()) { setError("Street name is required."); return; }
    if (hangersDropped === 0 && knockedCount === 0 && noAnswerCount === 0) {
      setError("Log at least one action (hangers, knocks, or no-answers).");
      return;
    }
    setError("");
    setSaving(true);

    const { error: err } = await supabase.from("canvas_sweeps").insert([{
      company_id: companyId,
      territory_id: territoryId || null,
      street_name: streetName.trim(),
      section: section.trim() || null,
      hangers_dropped: hangersDropped,
      knocked_count: knockedCount,
      no_answer_count: noAnswerCount,
      lat, lng,
      notes: notes.trim() || null,
    }]);

    setSaving(false);
    if (err) { setError(err.message); return; }

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

  const fieldStyle: React.CSSProperties = {
    width: "100%",
    background: "rgba(60,60,67,0.06)",
    color: "var(--zr-text-primary)",
    fontSize: "14px",
    letterSpacing: "-0.012em",
    padding: "10px 14px",
    borderRadius: 12,
    border: "none",
    outline: "none",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: "13px", color: "rgba(60,60,67,0.6)", fontWeight: 500,
    display: "block", marginBottom: 4, paddingLeft: 4,
  };

  return (
    <main className="min-h-screen pt-2 pb-24" style={{ background: "var(--zr-canvas)" }}>
      <div className="mx-auto max-w-md px-4 sm:px-6">
        {/* iOS back */}
        <div className="mb-3">
          <Link href="/canvas"
            style={{ color: "var(--zr-orange)", display: "inline-flex", alignItems: "center", gap: 2, fontSize: "15px", fontWeight: 400, letterSpacing: "-0.012em" }}
            className="transition-opacity active:opacity-60">
            <svg width="10" height="16" viewBox="0 0 10 16" fill="none" style={{ marginRight: 2 }}>
              <path d="M8 1 L2 8 L8 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Canvas
          </Link>
        </div>

        <div className="mb-4 px-1">
          <h1 style={{ fontSize: "26px", fontWeight: 700, letterSpacing: "-0.025em", color: "var(--zr-text-primary)", lineHeight: 1.15 }}>Log sweep</h1>
          <p style={{ fontSize: "13px", color: "rgba(60,60,67,0.55)", marginTop: 4, letterSpacing: "-0.005em", lineHeight: 1.35 }}>
            For walking a whole street and dropping hangers. Log individual leads with Log Visit instead.
          </p>
        </div>

        <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Territory */}
          <div>
            <label style={labelStyle}>Territory</label>
            <div className="relative">
              <select value={territoryId} onChange={e => setTerritoryId(e.target.value)}
                style={{ ...fieldStyle, appearance: "none", WebkitAppearance: "none", paddingRight: 36, cursor: "pointer" }}>
                <option value="">None</option>
                {territories.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", color: "var(--zr-text-secondary)", pointerEvents: "none" }}>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Street name</label>
            <input value={streetName} onChange={e => setStreetName(e.target.value)}
              placeholder="Oak St" style={fieldStyle} />
          </div>

          <div>
            <label style={labelStyle}>Section (optional)</label>
            <input value={section} onChange={e => setSection(e.target.value)}
              placeholder="100–500 block, east side" style={fieldStyle} />
          </div>

          {/* Count steppers — calm canvas rows, no emoji */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <Stepper label="Hangers / flyers dropped" value={hangersDropped} onChange={setHangersDropped} color="var(--zr-info)" />
            <Stepper label="Doors knocked" value={knockedCount} onChange={setKnockedCount} color="var(--zr-warning)" />
            <Stepper label="No answer" value={noAnswerCount} onChange={setNoAnswerCount} color="rgba(60,60,67,0.45)" />
          </div>

          {/* GPS — subtle text action */}
          <div>
            <label style={labelStyle}>Location (optional)</label>
            <button type="button" onClick={captureGPS}
              className="transition-opacity active:opacity-60 inline-flex items-center gap-1.5"
              style={{
                color: gpsStatus === "ok" ? "var(--zr-success)" : gpsStatus === "error" ? "#c6443a" : "var(--zr-orange)",
                fontSize: "14px", fontWeight: 500, letterSpacing: "-0.012em",
                padding: "4px 4px",
              }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a8 8 0 0 0-8 8c0 6 8 12 8 12s8-6 8-12a8 8 0 0 0-8-8z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              {gpsStatus === "idle" && "Stamp with GPS"}
              {gpsStatus === "loading" && "Getting GPS…"}
              {gpsStatus === "ok" && "GPS captured"}
              {gpsStatus === "error" && (gpsError || "Try again")}
            </button>
          </div>

          <div>
            <label style={labelStyle}>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Nice area, lots of older homes. Try again in a few weeks."
              style={{ ...fieldStyle, resize: "vertical", fontFamily: "inherit" }} />
          </div>

          {error && <div style={{ fontSize: "13px", color: "#c6443a", paddingLeft: 4 }}>{error}</div>}

          <button type="submit" disabled={saving}
            className="transition-all active:scale-[0.98] mt-2"
            style={{
              background: "var(--zr-orange)",
              color: "#fff",
              fontSize: "15px",
              fontWeight: 600,
              padding: "12px 20px",
              borderRadius: 14,
              letterSpacing: "-0.012em",
              opacity: saving ? 0.5 : 1,
            }}>
            {saving ? "Saving…" : `Log sweep · ${hangersDropped + knockedCount + noAnswerCount} homes`}
          </button>
        </form>
      </div>
    </main>
  );
}

function Stepper({ label, value, onChange, color }: { label: string; value: number; onChange: (v: number) => void; color: string }) {
  return (
    // Calm row: no nested card, no emoji. Plain label left; −/value/+ and +5 on the right.
    <div className="flex items-center gap-3" style={{ padding: "10px 14px", background: "rgba(60,60,67,0.04)", borderRadius: 12 }}>
      <div className="flex-1" style={{ fontSize: "14px", color: "var(--zr-text-primary)", letterSpacing: "-0.012em", fontWeight: 500 }}>{label}</div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button type="button" onClick={() => onChange(Math.max(0, value - 1))}
          disabled={value === 0}
          className="transition-opacity active:opacity-60"
          style={{
            width: 30, height: 30, borderRadius: "50%",
            background: "rgba(60,60,67,0.08)",
            color: value === 0 ? "rgba(60,60,67,0.3)" : "var(--zr-text-primary)",
            fontSize: "17px", fontWeight: 600, lineHeight: 1,
            opacity: value === 0 ? 0.5 : 1,
          }}>
          −
        </button>
        <input type="number" min={0} value={value}
          onChange={e => onChange(Math.max(0, parseInt(e.target.value || "0", 10)))}
          style={{
            width: 44, textAlign: "center",
            background: "transparent",
            color: value > 0 ? color : "rgba(60,60,67,0.45)",
            fontSize: "16px", fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
            border: "none",
            outline: "none",
            padding: "4px 0",
          }}
        />
        <button type="button" onClick={() => onChange(value + 1)}
          className="transition-opacity active:opacity-60"
          style={{
            width: 30, height: 30, borderRadius: "50%",
            background: color, color: "#fff",
            fontSize: "17px", fontWeight: 600, lineHeight: 1,
          }}>
          +
        </button>
        <button type="button" onClick={() => onChange(value + 5)}
          className="transition-opacity active:opacity-60"
          style={{
            fontSize: "12px", fontWeight: 600,
            color: "var(--zr-orange)",
            padding: "4px 8px",
            letterSpacing: "-0.012em",
          }}>
          +5
        </button>
      </div>
    </div>
  );
}
