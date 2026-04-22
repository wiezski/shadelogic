"use client";

// Canvas / Canvassing tracker — Business plan only.
// Main page: list of territories + aggregated stats + "Log Visit" shortcut.
// Territory detail is at /canvas/[id].

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../auth-provider";

type Territory = {
  id: string;
  name: string;
  description: string | null;
  city: string | null;
  state: string | null;
  zip_codes: string[] | null;
  color: string | null;
  created_at: string;
  archived_at: string | null;
  assigned_to: string | null;
  start_address: string | null;
  start_lat: number | null;
  start_lng: number | null;
  campaign: string | null;
  materials_used: string | null;
  recanvass_interval_days: number | null;
};

type TeamMember = { id: string; full_name: string | null };

type VisitAgg = {
  territory_id: string;
  visits: number;      // individual visit rows
  sweeps: number;      // sweep rows
  leads: number;
  conversations: number;
  last_visited_at: string | null;
  hangers: number;     // rolled up from visits (outcome=flyer) + sweeps.hangers_dropped
  homes_covered: number; // total from sweeps + individual visits
};

const OUTCOME_LABELS: Record<string, string> = {
  not_home:        "Not home",
  flyer:           "Flyer left",
  conversation:    "Talked",
  lead:            "Lead 🔥",
  do_not_contact:  "Do not contact",
};

export default function CanvasPage() {
  const router = useRouter();
  const { companyId, user, features, loading: authLoading } = useAuth();
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [aggs, setAggs] = useState<Record<string, VisitAgg>>({});
  const [teamMap, setTeamMap] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<"all" | "mine">("all");
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  // Gate to Business (or Trial with white_label-equivalent). Non-business tenants
  // see the upsell card instead of the UI.
  const allowed = features.canvassing;

  useEffect(() => {
    if (authLoading) return;
    if (!companyId || !allowed) { setLoading(false); return; }
    load();
  }, [companyId, allowed, authLoading, showArchived]);

  async function load() {
    setLoading(true);
    const tQuery = supabase.from("canvas_territories").select("*").order("created_at", { ascending: false });
    const [tRes, vRes, sRes, pRes] = await Promise.all([
      showArchived ? tQuery : tQuery.is("archived_at", null),
      supabase.from("canvas_visits").select("territory_id, outcome, visited_at"),
      supabase.from("canvas_sweeps").select("territory_id, hangers_dropped, knocked_count, no_answer_count, walked_at"),
      supabase.from("profiles").select("id, full_name"),
    ]);

    setTerritories((tRes.data || []) as Territory[]);

    const nameMap: Record<string, string> = {};
    (pRes.data || []).forEach((p: TeamMember) => { nameMap[p.id] = p.full_name || "Unnamed"; });
    setTeamMap(nameMap);

    const byTerritory: Record<string, VisitAgg> = {};
    const ensure = (tid: string) => {
      if (!byTerritory[tid]) {
        byTerritory[tid] = { territory_id: tid, visits: 0, sweeps: 0, leads: 0, conversations: 0, hangers: 0, homes_covered: 0, last_visited_at: null };
      }
      return byTerritory[tid];
    };

    // Individual visits
    (vRes.data || []).forEach((v: { territory_id: string | null; outcome: string; visited_at: string }) => {
      const tid = v.territory_id || "__unfiled__";
      const a = ensure(tid);
      a.visits++;
      a.homes_covered++;
      if (v.outcome === "flyer") a.hangers++;
      if (v.outcome === "lead") a.leads++;
      if (v.outcome === "conversation") a.conversations++;
      if (!a.last_visited_at || v.visited_at > a.last_visited_at) a.last_visited_at = v.visited_at;
    });

    // Sweeps (bulk)
    (sRes.data || []).forEach((s: { territory_id: string | null; hangers_dropped: number | null; knocked_count: number | null; no_answer_count: number | null; walked_at: string }) => {
      const tid = s.territory_id || "__unfiled__";
      const a = ensure(tid);
      a.sweeps++;
      a.hangers += s.hangers_dropped || 0;
      a.homes_covered += (s.hangers_dropped || 0) + (s.knocked_count || 0) + (s.no_answer_count || 0);
      if (!a.last_visited_at || s.walked_at > a.last_visited_at) a.last_visited_at = s.walked_at;
    });

    setAggs(byTerritory);
    setLoading(false);
  }

  if (authLoading || loading) {
    return (
      <main className="min-h-screen p-4" style={{ background: "var(--zr-black)" }}>
        <div className="mx-auto max-w-3xl text-sm" style={{ color: "var(--zr-text-muted)" }}>Loading…</div>
      </main>
    );
  }

  if (!allowed) {
    return (
      <main className="min-h-screen p-4" style={{ background: "var(--zr-black)" }}>
        <div className="mx-auto max-w-2xl">
          <div className="rounded-xl p-6 text-center space-y-3" style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }}>
            <div className="text-4xl">🗺️</div>
            <h1 className="text-xl font-bold" style={{ color: "var(--zr-text-primary)" }}>Canvassing Tracker</h1>
            <p className="text-sm" style={{ color: "var(--zr-text-secondary)" }}>
              Track door-to-door visits by neighborhood, log outcomes on the go, and convert leads directly into customers.
            </p>
            <p className="text-xs" style={{ color: "var(--zr-text-muted)" }}>
              Available on the <strong>Business</strong> plan.
            </p>
            <Link
              href="/settings/billing"
              className="inline-block rounded-lg px-4 py-2 text-sm font-semibold"
              style={{ background: "var(--zr-orange)", color: "#fff" }}
            >
              Upgrade to unlock →
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-4" style={{ background: "var(--zr-black)" }}>
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🗺️</span>
            <h1 className="text-xl font-bold" style={{ color: "var(--zr-text-primary)" }}>Canvassing</h1>
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            <Link
              href="/canvas/sweep"
              className="rounded px-3 py-1.5 text-xs font-semibold"
              style={{ background: "var(--zr-orange)", color: "#fff" }}
              title="Log a bulk street sweep (flyers dropped, doors walked)"
            >
              + Log Sweep
            </Link>
            <Link
              href="/canvas/visit"
              className="rounded px-3 py-1.5 text-xs font-medium"
              style={{ background: "var(--zr-surface-2)", color: "var(--zr-text-secondary)", border: "1px solid var(--zr-border)" }}
              title="Log an individual visit (lead, chat, or do-not-contact)"
            >
              + Log Visit
            </Link>
            <button
              onClick={() => setShowCreate(v => !v)}
              className="rounded px-3 py-1.5 text-xs font-medium"
              style={{ background: "var(--zr-surface-2)", color: "var(--zr-text-secondary)", border: "1px solid var(--zr-border)" }}
            >
              {showCreate ? "Cancel" : "+ Territory"}
            </button>
          </div>
        </div>

        {showCreate && (
          <NewTerritoryForm
            companyId={companyId!}
            teamMap={teamMap}
            onCreated={(t) => {
              setTerritories(prev => [t, ...prev]);
              setShowCreate(false);
            }}
          />
        )}

        {territories.length === 0 ? (
          <div className="rounded-xl p-6 text-center" style={{ background: "var(--zr-surface-1)", border: "1px dashed var(--zr-border)" }}>
            <div className="text-3xl mb-2">🧭</div>
            <div className="text-sm font-semibold mb-1" style={{ color: "var(--zr-text-primary)" }}>No territories yet</div>
            <div className="text-xs mb-3" style={{ color: "var(--zr-text-muted)" }}>
              Create a territory (a neighborhood, a zip, or just a street you're working) to start logging visits.
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="rounded px-3 py-1.5 text-xs font-semibold"
              style={{ background: "var(--zr-orange)", color: "#fff" }}
            >
              + New Territory
            </button>
          </div>
        ) : (
          <>
            {/* Filter tabs + archive toggle */}
            <div className="mb-3 flex items-center justify-between gap-2 flex-wrap">
              <div className="inline-flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--zr-border)" }}>
                <button
                  onClick={() => setFilter("all")}
                  className="px-3 py-1.5 text-xs font-medium transition-colors"
                  style={{ background: filter === "all" ? "var(--zr-orange)" : "var(--zr-surface-2)", color: filter === "all" ? "#fff" : "var(--zr-text-secondary)" }}
                >
                  All ({territories.filter(t => !t.archived_at).length})
                </button>
                <button
                  onClick={() => setFilter("mine")}
                  className="px-3 py-1.5 text-xs font-medium transition-colors"
                  style={{ background: filter === "mine" ? "var(--zr-orange)" : "var(--zr-surface-2)", color: filter === "mine" ? "#fff" : "var(--zr-text-secondary)" }}
                >
                  Mine ({territories.filter(t => t.assigned_to === user?.id && !t.archived_at).length})
                </button>
              </div>
              <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: "var(--zr-text-muted)" }}>
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={e => setShowArchived(e.target.checked)}
                />
                Show archived
              </label>
            </div>

            <div className="space-y-2">
              {territories.filter(t => filter === "all" || t.assigned_to === user?.id).map(t => {
                const a = aggs[t.id];
                // Due-for-recanvass math: if interval set AND last visit was that long ago
                let dueForRecanvass = false;
                if (t.recanvass_interval_days && a?.last_visited_at) {
                  const daysSince = Math.floor((Date.now() - new Date(a.last_visited_at).getTime()) / 86400000);
                  dueForRecanvass = daysSince >= t.recanvass_interval_days;
                } else if (t.recanvass_interval_days && !a?.last_visited_at) {
                  // Never visited but on a recanvass cadence → due now
                  dueForRecanvass = true;
                }
                const isArchived = !!t.archived_at;
                return (
                  <Link
                    key={t.id}
                    href={`/canvas/${t.id}`}
                    className="block rounded-lg p-4 transition-colors hover:brightness-110"
                    style={{
                      background: "var(--zr-surface-1)",
                      border: `1px solid ${isArchived ? "var(--zr-border)" : dueForRecanvass ? "rgba(239,68,68,0.5)" : "var(--zr-border)"}`,
                      opacity: isArchived ? 0.6 : 1,
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="font-semibold truncate" style={{ color: "var(--zr-text-primary)" }}>{t.name}</div>
                          {isArchived && (
                            <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase" style={{ background: "var(--zr-surface-2)", color: "var(--zr-text-muted)", border: "1px solid var(--zr-border)" }}>
                              Archived
                            </span>
                          )}
                          {!isArchived && t.assigned_to && teamMap[t.assigned_to] && (
                            <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: "rgba(59,130,246,0.15)", color: "#2563eb" }}>
                              {t.assigned_to === user?.id ? "You" : teamMap[t.assigned_to]}
                            </span>
                          )}
                          {!isArchived && dueForRecanvass && (
                            <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444" }}>
                              🔄 Due for re-canvass
                            </span>
                          )}
                        </div>
                        {(t.city || t.state) && (
                          <div className="text-xs mt-0.5" style={{ color: "var(--zr-text-muted)" }}>
                            {[t.city, t.state].filter(Boolean).join(", ")}
                            {t.zip_codes && t.zip_codes.length > 0 && ` · ${t.zip_codes.join(", ")}`}
                          </div>
                        )}
                        {t.campaign && (
                          <div className="text-xs mt-1" style={{ color: "var(--zr-text-secondary)" }}>
                            📣 {t.campaign}
                          </div>
                        )}
                        {t.description && (
                          <div className="text-xs mt-1" style={{ color: "var(--zr-text-secondary)" }}>{t.description}</div>
                        )}
                      </div>
                      {a && (a.homes_covered > 0 || a.sweeps > 0 || a.visits > 0) && (
                        <div className="shrink-0 text-right text-xs" style={{ color: "var(--zr-text-muted)" }}>
                          <div><strong style={{ color: "var(--zr-text-primary)" }}>{a.homes_covered}</strong> homes</div>
                          <div className="flex gap-2 justify-end mt-0.5">
                            {a.sweeps > 0 && <span>🚶 {a.sweeps} sweep{a.sweeps === 1 ? "" : "s"}</span>}
                            {a.visits > 0 && <span>📍 {a.visits} visit{a.visits === 1 ? "" : "s"}</span>}
                          </div>
                          {a.hangers > 0 && <div className="mt-0.5">{a.hangers} hangers</div>}
                          {a.leads > 0 && <div style={{ color: "#16a34a" }}>{a.leads} lead{a.leads === 1 ? "" : "s"}</div>}
                          {a.last_visited_at && (
                            <div className="text-[10px] mt-0.5">
                              Last: {new Date(a.last_visited_at).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        )}

        {/* Unfiled visits (no territory) */}
        {aggs["__unfiled__"] && aggs["__unfiled__"].visits > 0 && (
          <Link
            href="/canvas/unfiled"
            className="mt-3 block rounded-lg p-4 transition-colors"
            style={{ background: "var(--zr-surface-1)", border: "1px dashed var(--zr-border)" }}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium" style={{ color: "var(--zr-text-secondary)" }}>Unfiled visits</div>
                <div className="text-xs" style={{ color: "var(--zr-text-muted)" }}>Visits not assigned to any territory</div>
              </div>
              <div className="text-xs" style={{ color: "var(--zr-text-muted)" }}>
                <strong style={{ color: "var(--zr-text-primary)" }}>{aggs["__unfiled__"].visits}</strong>
              </div>
            </div>
          </Link>
        )}
      </div>
    </main>
  );
}

function NewTerritoryForm({ companyId, teamMap, onCreated }: { companyId: string; teamMap: Record<string, string>; onCreated: (t: Territory) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [startAddress, setStartAddress] = useState("");
  const [startLat, setStartLat] = useState<number | null>(null);
  const [startLng, setStartLng] = useState<number | null>(null);
  const [gpsStatus, setGpsStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [gpsError, setGpsError] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [campaign, setCampaign] = useState("");
  const [materials, setMaterials] = useState("");
  const [recanvass, setRecanvass] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function captureCurrentGPS() {
    if (!navigator.geolocation) {
      setGpsError("Not supported on this device.");
      setGpsStatus("error");
      return;
    }
    setGpsStatus("loading");
    navigator.geolocation.getCurrentPosition(
      pos => {
        setStartLat(pos.coords.latitude);
        setStartLng(pos.coords.longitude);
        setGpsStatus("ok");
      },
      err => {
        setGpsStatus("error");
        if (err.code === err.PERMISSION_DENIED) {
          const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
          setGpsError(ios
            ? "Location denied. On iPhone: Settings → Safari → Location → Ask/Allow, then refresh."
            : "Location denied. Tap the 🔒 icon in the address bar → Allow location.");
        } else {
          setGpsError(err.message || "Couldn't get location.");
        }
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Name is required."); return; }
    setError("");
    setSaving(true);
    const { data, error: err } = await supabase.from("canvas_territories").insert([{
      company_id: companyId,
      name: name.trim(),
      description: description.trim() || null,
      city: city.trim() || null,
      state: state.trim().toUpperCase() || null,
      zip_codes: zip.trim() ? zip.split(",").map(z => z.trim()).filter(Boolean) : null,
      assigned_to: assignedTo || null,
      start_address: startAddress.trim() || null,
      start_lat: startLat,
      start_lng: startLng,
      campaign: campaign.trim() || null,
      materials_used: materials.trim() || null,
      recanvass_interval_days: recanvass ? parseInt(recanvass, 10) : null,
    }]).select("*").single();
    setSaving(false);
    if (err || !data) { setError(err?.message || "Failed to create."); return; }
    onCreated(data as Territory);
    setName(""); setDescription(""); setCity(""); setState(""); setZip("");
    setStartAddress(""); setStartLat(null); setStartLng(null); setGpsStatus("idle");
    setAssignedTo(""); setCampaign(""); setMaterials(""); setRecanvass("");
  }

  const teamOptions = Object.entries(teamMap);

  // iOS Settings / native-form style: grouped sections with uppercase
  // section labels, pill-tinted inputs on soft gray, no bordered card
  // around the whole thing, no row-level borders. Spacing and labels
  // carry the hierarchy.
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
  const sectionLabelStyle: React.CSSProperties = {
    fontSize: "11px",
    color: "rgba(60,60,67,0.55)",
    fontWeight: 500,
    letterSpacing: "0.02em",
    textTransform: "uppercase",
    marginBottom: 6,
    paddingLeft: 4,
  };
  const fieldLabelStyle: React.CSSProperties = {
    fontSize: "13px",
    color: "rgba(60,60,67,0.6)",
    fontWeight: 500,
    letterSpacing: "-0.005em",
    marginBottom: 4,
    paddingLeft: 4,
    display: "block",
  };

  return (
    <form onSubmit={save} className="mb-6" style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {error && <div style={{ fontSize: "13px", color: "#c6443a", paddingLeft: 4 }}>{error}</div>}

      {/* ─── Territory ─────────────────────────────────────────── */}
      <div>
        <div style={sectionLabelStyle}>Territory</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <label style={fieldLabelStyle}>Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Oak St neighborhood" style={fieldStyle} />
          </div>
          <div>
            <label style={fieldLabelStyle}>Description</label>
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="New construction, high-end homes, etc." style={fieldStyle} />
          </div>
        </div>
      </div>

      {/* ─── Assignment ────────────────────────────────────────── */}
      <div>
        <div style={sectionLabelStyle}>Assignment</div>
        <div className="relative">
          <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)}
            style={{ ...fieldStyle, paddingRight: 36, appearance: "none", WebkitAppearance: "none", cursor: "pointer" }}>
            <option value="">Unassigned</option>
            {teamOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", color: "var(--zr-text-secondary)", pointerEvents: "none" }}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </div>

      {/* ─── Location ──────────────────────────────────────────── */}
      <div>
        <div style={sectionLabelStyle}>Location</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <label style={fieldLabelStyle}>Starting point</label>
            <input value={startAddress} onChange={e => setStartAddress(e.target.value)} placeholder="100 Oak St, Salt Lake City" style={fieldStyle} />
            <div className="mt-2">
              <button type="button" onClick={captureCurrentGPS}
                className="transition-opacity active:opacity-60 inline-flex items-center gap-1.5"
                style={{
                  color: gpsStatus === "ok" ? "var(--zr-success)" : "var(--zr-orange)",
                  fontSize: "13px",
                  fontWeight: 500,
                  letterSpacing: "-0.012em",
                }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a8 8 0 0 0-8 8c0 6 8 12 8 12s8-6 8-12a8 8 0 0 0-8-8z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                {gpsStatus === "idle" && "Use current GPS"}
                {gpsStatus === "loading" && "Getting GPS…"}
                {gpsStatus === "ok" && `GPS set (${startLat?.toFixed(4)}, ${startLng?.toFixed(4)})`}
                {gpsStatus === "error" && "Try again"}
              </button>
              {gpsStatus === "error" && gpsError && (
                <div style={{ fontSize: "12px", color: "#c6443a", marginTop: 4, paddingLeft: 4 }}>{gpsError}</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Campaign ──────────────────────────────────────────── */}
      <div>
        <div style={sectionLabelStyle}>Campaign</div>
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label style={fieldLabelStyle}>Campaign</label>
            <input value={campaign} onChange={e => setCampaign(e.target.value)} placeholder="Spring 2026 push" style={fieldStyle} />
          </div>
          <div>
            <label style={fieldLabelStyle}>Materials</label>
            <input value={materials} onChange={e => setMaterials(e.target.value)} placeholder="Door hanger v2" style={fieldStyle} />
          </div>
        </div>
      </div>

      {/* ─── Schedule ──────────────────────────────────────────── */}
      <div>
        <div style={sectionLabelStyle}>Schedule</div>
        <div>
          <label style={fieldLabelStyle}>Revisit every</label>
          <div className="relative">
            <select value={recanvass} onChange={e => setRecanvass(e.target.value)}
              style={{ ...fieldStyle, paddingRight: 36, appearance: "none", WebkitAppearance: "none", cursor: "pointer" }}>
              <option value="">One-time (no recanvass)</option>
              <option value="30">30 days</option>
              <option value="60">60 days</option>
              <option value="90">90 days (quarterly)</option>
              <option value="180">6 months</option>
              <option value="365">1 year</option>
            </select>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", color: "var(--zr-text-secondary)", pointerEvents: "none" }}>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
        </div>
      </div>

      {/* ─── Region ────────────────────────────────────────────── */}
      <div>
        <div style={sectionLabelStyle}>Region</div>
        <div className="grid grid-cols-[1fr_72px_1fr] gap-2.5">
          <div>
            <label style={fieldLabelStyle}>City</label>
            <input value={city} onChange={e => setCity(e.target.value)} placeholder="Salt Lake City" style={fieldStyle} />
          </div>
          <div>
            <label style={fieldLabelStyle}>State</label>
            <input value={state} onChange={e => setState(e.target.value.toUpperCase())} maxLength={2} placeholder="UT"
              style={{ ...fieldStyle, textTransform: "uppercase" }} />
          </div>
          <div>
            <label style={fieldLabelStyle}>Zip(s)</label>
            <input value={zip} onChange={e => setZip(e.target.value)} placeholder="84101, 84102" style={fieldStyle} />
          </div>
        </div>
      </div>

      {/* Submit — primary pill full-width */}
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
        {saving ? "Saving…" : "Create territory"}
      </button>
    </form>
  );
}
