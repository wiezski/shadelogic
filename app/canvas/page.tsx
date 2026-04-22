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
};

type VisitAgg = {
  territory_id: string;
  visits: number;
  leads: number;
  conversations: number;
  last_visited_at: string | null;
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
  const { companyId, features, loading: authLoading } = useAuth();
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [aggs, setAggs] = useState<Record<string, VisitAgg>>({});
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  // Gate to Business (or Trial with white_label-equivalent). Non-business tenants
  // see the upsell card instead of the UI.
  const allowed = features.canvassing;

  useEffect(() => {
    if (authLoading) return;
    if (!companyId || !allowed) { setLoading(false); return; }
    load();
  }, [companyId, allowed, authLoading]);

  async function load() {
    setLoading(true);
    const [tRes, vRes] = await Promise.all([
      supabase.from("canvas_territories").select("*").is("archived_at", null).order("created_at", { ascending: false }),
      supabase.from("canvas_visits").select("territory_id, outcome, visited_at"),
    ]);

    setTerritories((tRes.data || []) as Territory[]);

    // Aggregate visit counts per territory
    const byTerritory: Record<string, VisitAgg> = {};
    (vRes.data || []).forEach((v: { territory_id: string | null; outcome: string; visited_at: string }) => {
      const tid = v.territory_id || "__unfiled__";
      if (!byTerritory[tid]) {
        byTerritory[tid] = { territory_id: tid, visits: 0, leads: 0, conversations: 0, last_visited_at: null };
      }
      byTerritory[tid].visits++;
      if (v.outcome === "lead") byTerritory[tid].leads++;
      if (v.outcome === "conversation") byTerritory[tid].conversations++;
      if (!byTerritory[tid].last_visited_at || v.visited_at > byTerritory[tid].last_visited_at!) {
        byTerritory[tid].last_visited_at = v.visited_at;
      }
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
          <div className="flex gap-2">
            <Link
              href="/canvas/visit"
              className="rounded px-3 py-1.5 text-xs font-semibold"
              style={{ background: "var(--zr-orange)", color: "#fff" }}
            >
              + Log Visit
            </Link>
            <button
              onClick={() => setShowCreate(v => !v)}
              className="rounded px-3 py-1.5 text-xs font-medium"
              style={{ background: "var(--zr-surface-2)", color: "var(--zr-text-secondary)", border: "1px solid var(--zr-border)" }}
            >
              {showCreate ? "Cancel" : "+ New Territory"}
            </button>
          </div>
        </div>

        {showCreate && (
          <NewTerritoryForm
            companyId={companyId!}
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
          <div className="space-y-2">
            {territories.map(t => {
              const a = aggs[t.id];
              return (
                <Link
                  key={t.id}
                  href={`/canvas/${t.id}`}
                  className="block rounded-lg p-4 transition-colors hover:brightness-110"
                  style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate" style={{ color: "var(--zr-text-primary)" }}>{t.name}</div>
                      {(t.city || t.state) && (
                        <div className="text-xs mt-0.5" style={{ color: "var(--zr-text-muted)" }}>
                          {[t.city, t.state].filter(Boolean).join(", ")}
                          {t.zip_codes && t.zip_codes.length > 0 && ` · ${t.zip_codes.join(", ")}`}
                        </div>
                      )}
                      {t.description && (
                        <div className="text-xs mt-1" style={{ color: "var(--zr-text-secondary)" }}>{t.description}</div>
                      )}
                    </div>
                    {a && a.visits > 0 && (
                      <div className="shrink-0 text-right text-xs" style={{ color: "var(--zr-text-muted)" }}>
                        <div><strong style={{ color: "var(--zr-text-primary)" }}>{a.visits}</strong> visits</div>
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

function NewTerritoryForm({ companyId, onCreated }: { companyId: string; onCreated: (t: Territory) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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
    }]).select("*").single();
    setSaving(false);
    if (err || !data) { setError(err?.message || "Failed to create."); return; }
    onCreated(data as Territory);
    setName(""); setDescription(""); setCity(""); setState(""); setZip("");
  }

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
