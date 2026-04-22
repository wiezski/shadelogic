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

  return (
    <form onSubmit={save} className="mb-4 rounded-lg p-4 space-y-3" style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }}>
      <h2 className="text-sm font-semibold" style={{ color: "var(--zr-text-primary)" }}>New Territory</h2>
      {error && <div className="text-xs" style={{ color: "var(--zr-error)" }}>{error}</div>}
      <div>
        <label className="text-xs font-medium block mb-1" style={{ color: "var(--zr-text-secondary)" }}>Name *</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Oak St neighborhood"
          className="w-full rounded px-2 py-1.5 text-sm"
          style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }} />
      </div>
      <div>
        <label className="text-xs font-medium block mb-1" style={{ color: "var(--zr-text-secondary)" }}>Description</label>
        <input value={description} onChange={e => setDescription(e.target.value)} placeholder="New construction, high-end homes, etc."
          className="w-full rounded px-2 py-1.5 text-sm"
          style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }} />
      </div>

      {/* Assign to */}
      <div>
        <label className="text-xs font-medium block mb-1" style={{ color: "var(--zr-text-secondary)" }}>Assign to</label>
        <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)}
          className="w-full rounded px-2 py-1.5 text-sm"
          style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }}>
          <option value="">— Unassigned (anyone on the team) —</option>
          {teamOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      </div>

      {/* Start location */}
      <div>
        <label className="text-xs font-medium block mb-1" style={{ color: "var(--zr-text-secondary)" }}>Starting point (where to begin)</label>
        <input value={startAddress} onChange={e => setStartAddress(e.target.value)} placeholder="100 Oak St, Salt Lake City"
          className="w-full rounded px-2 py-1.5 text-sm mb-1"
          style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }} />
        <button type="button" onClick={captureCurrentGPS}
          className="text-xs rounded px-2 py-1 font-medium"
          style={{
            background: gpsStatus === "ok" ? "rgba(22,163,74,0.15)" : "var(--zr-surface-2)",
            border: `1px solid ${gpsStatus === "ok" ? "#16a34a" : "var(--zr-border)"}`,
            color: gpsStatus === "ok" ? "#16a34a" : "var(--zr-text-secondary)",
          }}>
          {gpsStatus === "idle" && "📍 Use my current GPS"}
          {gpsStatus === "loading" && "Getting GPS…"}
          {gpsStatus === "ok" && `✓ GPS set (${startLat?.toFixed(4)}, ${startLng?.toFixed(4)})`}
          {gpsStatus === "error" && "⚠ Try again"}
        </button>
        {gpsStatus === "error" && gpsError && (
          <div className="text-[11px] mt-1" style={{ color: "var(--zr-error)" }}>{gpsError}</div>
        )}
      </div>

      {/* Campaign + Materials */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: "var(--zr-text-secondary)" }}>Campaign</label>
          <input value={campaign} onChange={e => setCampaign(e.target.value)} placeholder="Spring 2026 push"
            className="w-full rounded px-2 py-1.5 text-sm"
            style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }} />
        </div>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: "var(--zr-text-secondary)" }}>Materials / flyer</label>
          <input value={materials} onChange={e => setMaterials(e.target.value)} placeholder="Door hanger v2, postcard A"
            className="w-full rounded px-2 py-1.5 text-sm"
            style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }} />
        </div>
      </div>

      {/* Recanvass cadence */}
      <div>
        <label className="text-xs font-medium block mb-1" style={{ color: "var(--zr-text-secondary)" }}>Revisit every</label>
        <select value={recanvass} onChange={e => setRecanvass(e.target.value)}
          className="w-full rounded px-2 py-1.5 text-sm"
          style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }}>
          <option value="">— One-time (no recanvass) —</option>
          <option value="30">30 days</option>
          <option value="60">60 days</option>
          <option value="90">90 days (quarterly)</option>
          <option value="180">6 months</option>
          <option value="365">1 year</option>
        </select>
      </div>

      {/* Location block */}
      <div className="grid grid-cols-[1fr_56px_1fr] gap-2">
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: "var(--zr-text-secondary)" }}>City</label>
          <input value={city} onChange={e => setCity(e.target.value)} placeholder="Salt Lake City"
            className="w-full rounded px-2 py-1.5 text-sm"
            style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }} />
        </div>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: "var(--zr-text-secondary)" }}>State</label>
          <input value={state} onChange={e => setState(e.target.value.toUpperCase())} maxLength={2} placeholder="UT"
            className="w-full rounded px-2 py-1.5 text-sm uppercase"
            style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }} />
        </div>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: "var(--zr-text-secondary)" }}>Zip(s)</label>
          <input value={zip} onChange={e => setZip(e.target.value)} placeholder="84101, 84102"
            className="w-full rounded px-2 py-1.5 text-sm"
            style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }} />
        </div>
      </div>

      <button type="submit" disabled={saving}
        className="w-full rounded px-4 py-2 text-sm font-semibold disabled:opacity-50"
        style={{ background: "var(--zr-orange)", color: "#fff" }}>
        {saving ? "Saving..." : "Create territory"}
      </button>
    </form>
  );
}
