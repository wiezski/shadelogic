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

  return (
    <main className="min-h-screen p-4" style={{ background: "var(--zr-black)" }}>
      <div className="mx-auto max-w-md">
        <Link href="/canvas" className="text-xs" style={{ color: "var(--zr-orange)" }}>← Back to Canvas</Link>
        <h1 className="mt-2 text-xl font-bold" style={{ color: "var(--zr-text-primary)" }}>Log Street Sweep</h1>
        <p className="text-xs mt-1" style={{ color: "var(--zr-text-muted)" }}>
          For "walked a whole street, dropped hangers on every door." Log individual leads / chats with Log Visit instead.
        </p>

        <form onSubmit={save} className="mt-4 space-y-4">
          {/* Territory */}
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--zr-text-secondary)" }}>Territory</label>
            <select value={territoryId} onChange={e => setTerritoryId(e.target.value)}
              className="w-full rounded px-2 py-2 text-sm"
              style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }}>
              <option value="">— None —</option>
              {territories.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          {/* Street */}
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--zr-text-secondary)" }}>Street name *</label>
            <input value={streetName} onChange={e => setStreetName(e.target.value)}
              placeholder="Oak St"
              className="w-full rounded px-2 py-2 text-sm"
              style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }} />
          </div>

          {/* Section */}
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--zr-text-secondary)" }}>Section (optional)</label>
            <input value={section} onChange={e => setSection(e.target.value)}
              placeholder="100–500 block, east side, etc."
              className="w-full rounded px-2 py-2 text-sm"
              style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }} />
          </div>

          {/* Count steppers */}
          <div className="space-y-3">
            <Stepper
              label="📋 Hangers / flyers dropped"
              value={hangersDropped}
              onChange={setHangersDropped}
              color="#3b82f6"
            />
            <Stepper
              label="🚪 Doors knocked"
              value={knockedCount}
              onChange={setKnockedCount}
              color="#f59e0b"
            />
            <Stepper
              label="👻 No answer"
              value={noAnswerCount}
              onChange={setNoAnswerCount}
              color="#9ca3af"
            />
          </div>

          {/* GPS */}
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--zr-text-secondary)" }}>Location (optional)</label>
            <button type="button" onClick={captureGPS}
              className="w-full rounded px-3 py-2 text-sm font-medium"
              style={{
                background: gpsStatus === "ok" ? "rgba(22,163,74,0.15)" : "var(--zr-surface-2)",
                border: `1px solid ${gpsStatus === "ok" ? "#16a34a" : "var(--zr-border)"}`,
                color: gpsStatus === "ok" ? "#16a34a" : "var(--zr-text-secondary)",
              }}>
              {gpsStatus === "idle" && "📍 Stamp this sweep with GPS"}
              {gpsStatus === "loading" && "Getting GPS…"}
              {gpsStatus === "ok" && `✓ GPS captured`}
              {gpsStatus === "error" && `⚠ ${gpsError}`}
            </button>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--zr-text-secondary)" }}>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Nice area, lots of older homes. Try again in a few weeks."
              className="w-full rounded px-2 py-2 text-sm"
              style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }} />
          </div>

          {error && <div className="text-xs" style={{ color: "var(--zr-error)" }}>{error}</div>}

          <button type="submit" disabled={saving}
            className="w-full rounded-lg py-3 text-sm font-bold disabled:opacity-50"
            style={{ background: "var(--zr-orange)", color: "#fff" }}>
            {saving ? "Saving..." : `Log sweep · ${hangersDropped + knockedCount + noAnswerCount} homes`}
          </button>
        </form>
      </div>
    </main>
  );
}

function Stepper({ label, value, onChange, color }: { label: string; value: number; onChange: (v: number) => void; color: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg p-3" style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }}>
      <div className="flex-1 text-sm" style={{ color: "var(--zr-text-primary)" }}>{label}</div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, value - 1))}
          className="w-9 h-9 rounded-full text-lg font-bold transition-colors disabled:opacity-30"
          style={{ background: "var(--zr-surface-2)", color: "var(--zr-text-primary)", border: "1px solid var(--zr-border)" }}
          disabled={value === 0}
        >
          −
        </button>
        <input
          type="number"
          min={0}
          value={value}
          onChange={e => onChange(Math.max(0, parseInt(e.target.value || "0", 10)))}
          className="w-14 text-center rounded py-2 text-base font-bold"
          style={{ background: "var(--zr-surface-2)", border: `2px solid ${value > 0 ? color : "var(--zr-border)"}`, color: value > 0 ? color : "var(--zr-text-muted)" }}
        />
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          className="w-9 h-9 rounded-full text-lg font-bold transition-colors"
          style={{ background: color, color: "#fff" }}
        >
          +
        </button>
        {/* Quick-bump: +5 */}
        <button
          type="button"
          onClick={() => onChange(value + 5)}
          className="text-xs rounded-full px-2 py-1 font-semibold"
          style={{ background: "rgba(230,48,0,0.1)", color: "var(--zr-orange)" }}
        >
          +5
        </button>
      </div>
    </div>
  );
}
