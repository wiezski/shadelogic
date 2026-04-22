"use client";

// Canvas — Territory detail. Shows stats, recent visits, + link to log another.
// Clicking a visit with a customer_id jumps to the customer detail page.

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../auth-provider";

type Territory = {
  id: string;
  name: string;
  description: string | null;
  city: string | null;
  state: string | null;
  zip_codes: string[] | null;
  created_at: string;
  assigned_to: string | null;
  start_address: string | null;
  start_lat: number | null;
  start_lng: number | null;
  campaign: string | null;
  materials_used: string | null;
  recanvass_interval_days: number | null;
};

type Visit = {
  id: string;
  address: string;
  outcome: string;
  notes: string | null;
  visited_at: string;
  customer_id: string | null;
  lat: number | null;
  lng: number | null;
};

const OUTCOME_META: Record<string, { label: string; color: string; icon: string }> = {
  not_home:       { label: "Not home",       color: "#9ca3af", icon: "🚪" },
  flyer:          { label: "Flyer left",     color: "#3b82f6", icon: "📋" },
  conversation:   { label: "Talked",         color: "#f59e0b", icon: "💬" },
  lead:           { label: "Lead 🔥",        color: "#16a34a", icon: "🔥" },
  do_not_contact: { label: "Do not contact", color: "#ef4444", icon: "🚫" },
};

export default function TerritoryDetailPage() {
  const params = useParams();
  const territoryId = params.id as string;
  const { features, loading: authLoading } = useAuth();

  const [territory, setTerritory] = useState<Territory | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!features.canvassing) { setLoading(false); return; }
    load();
  }, [territoryId, features.canvassing, authLoading]);

  async function load() {
    setLoading(true);
    // Special route /canvas/unfiled renders visits with null territory_id
    if (territoryId === "unfiled") {
      setTerritory({ id: "unfiled", name: "Unfiled visits", description: null, city: null, state: null, zip_codes: null, created_at: "" } as Territory);
      const { data: vRes } = await supabase.from("canvas_visits").select("*").is("territory_id", null).order("visited_at", { ascending: false }).limit(200);
      setVisits((vRes || []) as Visit[]);
    } else {
      const [tRes, vRes] = await Promise.all([
        supabase.from("canvas_territories").select("*").eq("id", territoryId).single(),
        supabase.from("canvas_visits").select("*").eq("territory_id", territoryId).order("visited_at", { ascending: false }).limit(200),
      ]);
      setTerritory(tRes.data as Territory | null);
      setVisits((vRes.data || []) as Visit[]);
    }
    setLoading(false);
  }

  if (authLoading || loading) {
    return <main className="min-h-screen p-4" style={{ background: "var(--zr-black)" }} />;
  }

  if (!features.canvassing) {
    return (
      <main className="min-h-screen p-4" style={{ background: "var(--zr-black)" }}>
        <div className="mx-auto max-w-md text-center text-sm" style={{ color: "var(--zr-text-muted)" }}>
          Canvassing is a Business plan feature. <Link href="/settings/billing" className="underline" style={{ color: "var(--zr-orange)" }}>Upgrade →</Link>
        </div>
      </main>
    );
  }

  if (!territory) {
    return (
      <main className="min-h-screen p-4" style={{ background: "var(--zr-black)" }}>
        <div className="mx-auto max-w-md text-center">
          <div className="text-sm" style={{ color: "var(--zr-text-muted)" }}>Territory not found.</div>
          <Link href="/canvas" className="mt-2 inline-block text-xs" style={{ color: "var(--zr-orange)" }}>← Back to Canvas</Link>
        </div>
      </main>
    );
  }

  // Stats
  const totalVisits = visits.length;
  const leads = visits.filter(v => v.outcome === "lead").length;
  const talks = visits.filter(v => v.outcome === "conversation").length;
  const flyers = visits.filter(v => v.outcome === "flyer").length;
  const conversionPct = totalVisits > 0 ? ((leads / totalVisits) * 100).toFixed(0) : "0";

  return (
    <main className="min-h-screen p-4" style={{ background: "var(--zr-black)" }}>
      <div className="mx-auto max-w-3xl">
        <Link href="/canvas" className="text-xs" style={{ color: "var(--zr-orange)" }}>← Back to Canvas</Link>

        <div className="mt-2 flex items-start justify-between gap-3">
          <div className="flex-1">
            <h1 className="text-xl font-bold" style={{ color: "var(--zr-text-primary)" }}>{territory.name}</h1>
            {(territory.city || territory.state) && (
              <div className="text-xs mt-1" style={{ color: "var(--zr-text-muted)" }}>
                {[territory.city, territory.state].filter(Boolean).join(", ")}
                {territory.zip_codes && territory.zip_codes.length > 0 && ` · ${territory.zip_codes.join(", ")}`}
              </div>
            )}
            {territory.description && (
              <div className="text-sm mt-2" style={{ color: "var(--zr-text-secondary)" }}>{territory.description}</div>
            )}
          </div>
          {territoryId !== "unfiled" && (
            <Link
              href={`/canvas/visit?territory=${territoryId}`}
              className="shrink-0 rounded px-3 py-1.5 text-xs font-semibold"
              style={{ background: "var(--zr-orange)", color: "#fff" }}
            >
              + Log Visit
            </Link>
          )}
        </div>

        {/* Territory metadata (campaign, start point, cadence) */}
        {(territory.campaign || territory.materials_used || territory.start_address || territory.start_lat || territory.recanvass_interval_days) && (
          <div className="mt-3 rounded-lg p-3 space-y-2" style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }}>
            {territory.campaign && (
              <div className="flex gap-2 text-xs">
                <span className="shrink-0 w-20" style={{ color: "var(--zr-text-muted)" }}>📣 Campaign</span>
                <span style={{ color: "var(--zr-text-primary)" }}>{territory.campaign}</span>
              </div>
            )}
            {territory.materials_used && (
              <div className="flex gap-2 text-xs">
                <span className="shrink-0 w-20" style={{ color: "var(--zr-text-muted)" }}>📄 Materials</span>
                <span style={{ color: "var(--zr-text-primary)" }}>{territory.materials_used}</span>
              </div>
            )}
            {(territory.start_address || (territory.start_lat && territory.start_lng)) && (
              <div className="flex gap-2 text-xs items-center">
                <span className="shrink-0 w-20" style={{ color: "var(--zr-text-muted)" }}>📍 Start at</span>
                <span className="flex-1" style={{ color: "var(--zr-text-primary)" }}>
                  {territory.start_address || `${territory.start_lat?.toFixed(4)}, ${territory.start_lng?.toFixed(4)}`}
                </span>
                <a
                  href={
                    territory.start_lat && territory.start_lng
                      ? `https://www.google.com/maps?q=${territory.start_lat},${territory.start_lng}`
                      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(territory.start_address || "")}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                  style={{ background: "rgba(59,130,246,0.15)", color: "#2563eb" }}
                >
                  Open in Maps →
                </a>
              </div>
            )}
            {territory.recanvass_interval_days && (
              <div className="flex gap-2 text-xs">
                <span className="shrink-0 w-20" style={{ color: "var(--zr-text-muted)" }}>🔄 Revisit</span>
                <span style={{ color: "var(--zr-text-primary)" }}>Every {territory.recanvass_interval_days} days</span>
              </div>
            )}
          </div>
        )}

        {/* Stats */}
        <div className="mt-4 grid grid-cols-4 gap-2">
          <StatCard label="Visits" value={totalVisits} />
          <StatCard label="Talks" value={talks} color="#f59e0b" />
          <StatCard label="Leads" value={leads} color="#16a34a" />
          <StatCard label="Conv %" value={`${conversionPct}%`} color="var(--zr-orange)" />
        </div>

        {/* Visit log */}
        <div className="mt-5">
          <h2 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--zr-text-secondary)" }}>Visit log</h2>
          {visits.length === 0 ? (
            <div className="rounded-lg p-4 text-center text-sm" style={{ background: "var(--zr-surface-1)", color: "var(--zr-text-muted)", border: "1px dashed var(--zr-border)" }}>
              No visits logged yet. Tap "+ Log Visit" to start.
            </div>
          ) : (
            <div className="space-y-2">
              {visits.map(v => {
                const meta = OUTCOME_META[v.outcome] || { label: v.outcome, color: "#9ca3af", icon: "·" };
                const row = (
                  <div className="rounded-lg p-3 flex items-start gap-3" style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }}>
                    <div className="text-xl shrink-0 mt-0.5">{meta.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-medium text-sm truncate" style={{ color: "var(--zr-text-primary)" }}>{v.address}</div>
                        <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase" style={{ background: meta.color, color: "#fff" }}>
                          {meta.label}
                        </span>
                      </div>
                      {v.notes && <div className="text-xs mt-1" style={{ color: "var(--zr-text-secondary)" }}>{v.notes}</div>}
                      <div className="text-[11px] mt-1 flex items-center gap-2" style={{ color: "var(--zr-text-muted)" }}>
                        <span>{new Date(v.visited_at).toLocaleString()}</span>
                        {v.lat !== null && v.lng !== null && (
                          <a href={`https://www.google.com/maps?q=${v.lat},${v.lng}`} target="_blank" rel="noopener noreferrer"
                            className="underline" onClick={e => e.stopPropagation()}>
                            📍 map
                          </a>
                        )}
                        {v.customer_id && (
                          <span style={{ color: "var(--zr-orange)" }}>👤 Customer</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
                return v.customer_id ? (
                  <Link key={v.id} href={`/customers/${v.customer_id}`}>{row}</Link>
                ) : (
                  <div key={v.id}>{row}</div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="rounded-lg p-3 text-center" style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }}>
      <div className="text-2xl font-bold" style={{ color: color || "var(--zr-text-primary)" }}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider mt-0.5" style={{ color: "var(--zr-text-muted)" }}>{label}</div>
    </div>
  );
}
