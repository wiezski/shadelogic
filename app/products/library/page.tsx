"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { FeatureGate } from "../../feature-gate";
import { PermissionGate } from "../../permission-gate";

type LibProduct = {
  id: string;
  manufacturer: string;
  product_name: string;
  category: string;
  sku: string | null;
  product_line: string | null;
  min_width: string | null;
  max_width: string | null;
  min_height: string | null;
  max_height: string | null;
  lead_time_days: number | null;
  color_options: string | null;
  msrp: number | null;
  dealer_cost_low: number | null;
  dealer_cost_high: number | null;
  description: string | null;
  status: string;
  discontinued_at: string | null;
  discontinued_reason: string | null;
  last_verified: string | null;
};

type Brand = {
  id: string;
  name: string;
  logo_url: string | null;
  website_url: string | null;
  product_count: number;
  active: boolean;
};

type Alert = {
  id: string;
  title: string;
  message: string;
  severity: string;
  suggestion: string | null;
  read: boolean;
  created_at: string;
  library_product_id: string;
};

type Subscription = {
  id: string;
  manufacturer: string;
};

const CAT_BADGE: Record<string, string> = {
  roller: "bg-blue-100 text-blue-700", solar: "bg-amber-100 text-amber-700",
  cellular: "bg-emerald-100 text-emerald-700", blind: "bg-gray-100 text-gray-700",
  shutter: "bg-green-100 text-green-700", motorized: "bg-purple-100 text-purple-700",
  drapery: "bg-pink-100 text-pink-700", sheer: "bg-sky-100 text-sky-700",
  roman: "bg-rose-100 text-rose-700", woven: "bg-yellow-100 text-yellow-700",
  vertical: "bg-indigo-100 text-indigo-700", other: "bg-gray-100 text-gray-600",
};

export default function ManufacturerLibraryPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [products, setProducts] = useState<LibProduct[]>([]);
  const [subscriptions, setSubs] = useState<Subscription[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMfg, setSelectedMfg] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [importing, setImporting] = useState<string | null>(null);
  const [tab, setTab] = useState<"browse" | "alerts">("browse");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [{ data: b }, { data: s }, { data: a }] = await Promise.all([
      supabase.from("manufacturer_brands").select("*").eq("active", true).order("name"),
      supabase.from("dealer_library_subscriptions").select("id, manufacturer"),
      supabase.from("dealer_product_alerts").select("*").eq("dismissed", false).order("created_at", { ascending: false }).limit(50),
    ]);
    setBrands((b || []) as Brand[]);
    setSubs((s || []) as Subscription[]);
    setAlerts((a || []) as Alert[]);
    setLoading(false);
  }

  async function loadProducts(manufacturer: string) {
    setSelectedMfg(manufacturer);
    const { data } = await supabase
      .from("manufacturer_library")
      .select("*")
      .eq("manufacturer", manufacturer)
      .order("product_line")
      .order("product_name");
    setProducts((data || []) as LibProduct[]);
  }

  async function subscribe(manufacturer: string) {
    await supabase.from("dealer_library_subscriptions").insert([{ manufacturer }]);
    setSubs(prev => [...prev, { id: "temp", manufacturer }]);
  }

  async function unsubscribe(manufacturer: string) {
    await supabase.from("dealer_library_subscriptions").delete().eq("manufacturer", manufacturer);
    setSubs(prev => prev.filter(s => s.manufacturer !== manufacturer));
  }

  const isSubscribed = (mfg: string) => subs.some(s => s.manufacturer === mfg);

  async function addToMyCatalog(p: LibProduct) {
    setImporting(p.id);
    const insert = {
      name: p.product_name,
      category: p.category,
      default_cost: p.dealer_cost_low || 0,
      default_multiplier: p.msrp && p.dealer_cost_low ? Math.round((p.msrp / p.dealer_cost_low) * 100) / 100 : 2.5,
      manufacturer: p.manufacturer,
      sku: p.sku || null,
      min_width: p.min_width,
      max_width: p.max_width,
      min_height: p.min_height,
      max_height: p.max_height,
      lead_time_days: p.lead_time_days,
      color_options: p.color_options,
      notes: p.description,
      imported_from: "library",
      library_product_id: p.id,
      active: true,
    };
    await supabase.from("product_catalog").insert([insert]);
    setImporting(null);
  }

  async function addAllFromMfg(manufacturer: string) {
    setImporting("all-" + manufacturer);
    const prods = products.filter(p => p.status === "active");
    const inserts = prods.map(p => ({
      name: p.product_name,
      category: p.category,
      default_cost: p.dealer_cost_low || 0,
      default_multiplier: p.msrp && p.dealer_cost_low ? Math.round((p.msrp / p.dealer_cost_low) * 100) / 100 : 2.5,
      manufacturer: p.manufacturer,
      sku: p.sku || null,
      min_width: p.min_width,
      max_width: p.max_width,
      min_height: p.min_height,
      max_height: p.max_height,
      lead_time_days: p.lead_time_days,
      color_options: p.color_options,
      notes: p.description,
      imported_from: "library",
      library_product_id: p.id,
      active: true,
    }));
    await supabase.from("product_catalog").insert(inserts);
    setImporting(null);
  }

  async function markAlertRead(alertId: string) {
    await supabase.from("dealer_product_alerts").update({ read: true }).eq("id", alertId);
    setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, read: true } : a));
  }

  async function dismissAlert(alertId: string) {
    await supabase.from("dealer_product_alerts").update({ dismissed: true }).eq("id", alertId);
    setAlerts(prev => prev.filter(a => a.id !== alertId));
  }

  const filtered = products.filter(p => {
    if (filter !== "all" && p.category !== filter) return false;
    if (search) {
      const s = search.toLowerCase();
      return p.product_name.toLowerCase().includes(s) || (p.product_line || "").toLowerCase().includes(s) || (p.sku || "").toLowerCase().includes(s);
    }
    return true;
  });

  const unreadAlerts = alerts.filter(a => !a.read).length;

  return (
    <FeatureGate require="inventory">
      <PermissionGate require="access_settings">
        <main style={{ background: "var(--zr-black)", color: "var(--zr-text-primary)" }} className="min-h-screen p-4 text-sm">
          <div className="mx-auto max-w-2xl">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <Link href="/products" style={{ color: "var(--zr-orange)" }} className="hover:underline text-sm">← Products</Link>
                </div>
                <h1 className="text-xl font-bold mt-1">Manufacturer Library</h1>
                <p style={{ color: "var(--zr-text-secondary)" }} className="text-xs mt-0.5">
                  Browse manufacturer product lines and add them to your catalog. Subscribe to get notified of changes.
                </p>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mb-3 rounded overflow-hidden" style={{ border: "1px solid var(--zr-border)" }}>
              <button onClick={() => setTab("browse")}
                style={tab === "browse" ? { background: "var(--zr-orange)", color: "#fff" } : { background: "var(--zr-surface-2)", color: "var(--zr-text-primary)" }}
                className="flex-1 px-3 py-1.5 text-sm">Browse</button>
              <button onClick={() => setTab("alerts")}
                style={tab === "alerts" ? { background: "var(--zr-orange)", color: "#fff" } : { background: "var(--zr-surface-2)", color: "var(--zr-text-primary)" }}
                className="flex-1 px-3 py-1.5 text-sm relative">
                Alerts
                {unreadAlerts > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">{unreadAlerts}</span>
                )}
              </button>
            </div>

            {loading ? <p style={{ color: "var(--zr-text-secondary)" }}>Loading...</p> : tab === "browse" ? (
              <>
                {/* Manufacturer cards */}
                {!selectedMfg && (
                  <div className="space-y-2">
                    {brands.map(b => (
                      <div key={b.id} style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }}
                        className="rounded-lg p-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <button onClick={() => loadProducts(b.name)} className="font-semibold hover:underline text-left" style={{ color: "var(--zr-orange)" }}>
                            {b.name}
                          </button>
                          <div className="text-xs text-gray-500 mt-0.5">
                            {b.product_count} products
                            {b.website_url && (
                              <> · <a href={b.website_url} target="_blank" rel="noopener" className="text-blue-500 hover:underline">Website</a></>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {isSubscribed(b.name) ? (
                            <button onClick={() => unsubscribe(b.name)}
                              className="text-xs rounded px-2 py-1 bg-green-100 text-green-700 border border-green-200">
                              Subscribed ✓
                            </button>
                          ) : (
                            <button onClick={() => subscribe(b.name)}
                              className="text-xs rounded px-2 py-1 border hover:bg-gray-50">
                              Subscribe
                            </button>
                          )}
                          <button onClick={() => loadProducts(b.name)}
                            className="text-xs rounded px-2 py-1 border hover:bg-gray-50">
                            Browse →
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Product list for selected manufacturer */}
                {selectedMfg && (
                  <>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => { setSelectedMfg(null); setProducts([]); setSearch(""); setFilter("all"); }}
                          className="text-xs text-gray-500 hover:text-gray-700">← All manufacturers</button>
                        <h2 className="font-bold">{selectedMfg}</h2>
                        <span className="text-xs text-gray-400">{filtered.length} products</span>
                      </div>
                      <div className="flex gap-1.5">
                        {!isSubscribed(selectedMfg) && (
                          <button onClick={() => subscribe(selectedMfg)}
                            className="text-xs rounded px-2 py-1 border hover:bg-gray-50">Subscribe</button>
                        )}
                        <button onClick={() => addAllFromMfg(selectedMfg)}
                          disabled={importing === "all-" + selectedMfg}
                          style={{ background: "var(--zr-orange)", color: "#fff" }}
                          className="text-xs rounded px-2.5 py-1 disabled:opacity-50">
                          {importing === "all-" + selectedMfg ? "Adding…" : "Add All to My Catalog"}
                        </button>
                      </div>
                    </div>

                    <div className="flex gap-2 mb-3">
                      <input value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="Search products…"
                        className="flex-1 border rounded px-2.5 py-1.5 text-xs" />
                      <select value={filter} onChange={e => setFilter(e.target.value)}
                        className="border rounded px-2 py-1.5 text-xs">
                        <option value="all">All Types</option>
                        {[...new Set(products.map(p => p.category))].sort().map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      {filtered.map(p => (
                        <div key={p.id} style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }}
                          className={`rounded-lg p-3 ${p.status === "discontinued" ? "opacity-60" : ""}`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium">{p.product_name}</span>
                                <span className={`text-xs rounded px-1.5 py-0.5 ${CAT_BADGE[p.category] ?? CAT_BADGE.other}`}>
                                  {p.category}
                                </span>
                                {p.product_line && <span className="text-xs text-gray-400">{p.product_line}</span>}
                                {p.status === "discontinued" && (
                                  <span className="text-xs rounded px-1.5 py-0.5 bg-red-100 text-red-700">Discontinued</span>
                                )}
                              </div>
                              {p.description && <div className="text-xs text-gray-500 mt-0.5">{p.description}</div>}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
                                className={`text-xs rounded px-1.5 py-0.5 border transition-colors ${expandedId === p.id ? "bg-gray-800 text-white" : "bg-gray-50 text-gray-500 hover:bg-gray-100"}`}>
                                Specs {expandedId === p.id ? "▲" : "▼"}
                              </button>
                              {p.status === "active" && (
                                <button onClick={() => addToMyCatalog(p)}
                                  disabled={importing === p.id}
                                  style={{ background: "var(--zr-orange)", color: "#fff" }}
                                  className="text-xs rounded px-2 py-1 disabled:opacity-50">
                                  {importing === p.id ? "Adding…" : "+ Add"}
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Expanded spec card */}
                          {expandedId === p.id && (
                            <div className="mt-2 rounded-lg p-3 text-xs space-y-2" style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)" }}>
                              <div className="grid grid-cols-2 gap-2">
                                {(p.min_width || p.max_width) && (
                                  <div className="rounded bg-white p-2 border">
                                    <div className="text-gray-400 text-[10px] uppercase tracking-wide">Width Range</div>
                                    <div className="font-semibold">{p.min_width || "?"}" – {p.max_width || "?"}"</div>
                                  </div>
                                )}
                                {(p.min_height || p.max_height) && (
                                  <div className="rounded bg-white p-2 border">
                                    <div className="text-gray-400 text-[10px] uppercase tracking-wide">Height Range</div>
                                    <div className="font-semibold">{p.min_height || "?"}" – {p.max_height || "?"}"</div>
                                  </div>
                                )}
                                {p.lead_time_days && (
                                  <div className="rounded bg-white p-2 border">
                                    <div className="text-gray-400 text-[10px] uppercase tracking-wide">Lead Time</div>
                                    <div className="font-semibold">{p.lead_time_days} days</div>
                                  </div>
                                )}
                                {(p.dealer_cost_low || p.msrp) && (
                                  <div className="rounded bg-white p-2 border">
                                    <div className="text-gray-400 text-[10px] uppercase tracking-wide">Pricing Guide</div>
                                    <div className="font-semibold">
                                      {p.dealer_cost_low ? `$${p.dealer_cost_low}` : "—"}
                                      {p.msrp ? ` / MSRP $${p.msrp}` : ""}
                                    </div>
                                  </div>
                                )}
                              </div>
                              {p.color_options && (
                                <div className="rounded bg-white p-2 border">
                                  <div className="text-gray-400 text-[10px] uppercase tracking-wide mb-1">Colors</div>
                                  <div className="flex flex-wrap gap-1">
                                    {p.color_options.split("|").map((c, i) => (
                                      <span key={i} className="rounded bg-gray-100 px-2 py-0.5 text-gray-700">{c.trim()}</span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {p.discontinued_reason && (
                                <div className="rounded bg-red-50 p-2 border border-red-200 text-red-700">
                                  <div className="font-semibold text-[10px] uppercase">Discontinued</div>
                                  <div>{p.discontinued_reason}</div>
                                </div>
                              )}
                              {p.last_verified && (
                                <div className="text-gray-400">Last verified: {new Date(p.last_verified).toLocaleDateString()}</div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            ) : (
              /* Alerts Tab */
              <div className="space-y-2">
                {alerts.length === 0 ? (
                  <div style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }}
                    className="rounded-lg p-6 text-center">
                    <div className="text-gray-400 text-sm">No product alerts</div>
                    <div className="text-xs text-gray-400 mt-1">
                      Subscribe to manufacturers to get notified when products change, get discontinued, or specs are updated.
                    </div>
                  </div>
                ) : alerts.map(a => (
                  <div key={a.id} style={{ background: "var(--zr-surface-1)", border: `1px solid ${a.severity === "critical" ? "#ef4444" : a.severity === "warning" ? "#f59e0b" : "var(--zr-border)"}` }}
                    className={`rounded-lg p-3 ${a.read ? "opacity-70" : ""}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                            a.severity === "critical" ? "bg-red-100 text-red-700" :
                            a.severity === "warning" ? "bg-amber-100 text-amber-700" :
                            "bg-blue-100 text-blue-700"
                          }`}>
                            {a.severity === "critical" ? "Critical" : a.severity === "warning" ? "Warning" : "Info"}
                          </span>
                          <span className="font-medium text-sm">{a.title}</span>
                          {!a.read && <span className="w-2 h-2 rounded-full bg-blue-500"></span>}
                        </div>
                        <div className="text-xs text-gray-600 mt-1">{a.message}</div>
                        {a.suggestion && (
                          <div className="text-xs mt-1.5 rounded bg-green-50 p-2 text-green-700 border border-green-200">
                            💡 {a.suggestion}
                          </div>
                        )}
                        <div className="text-xs text-gray-400 mt-1">{new Date(a.created_at).toLocaleDateString()}</div>
                      </div>
                      <div className="flex flex-col gap-1 shrink-0">
                        {!a.read && (
                          <button onClick={() => markAlertRead(a.id)}
                            className="text-xs text-blue-500 hover:underline">Mark read</button>
                        )}
                        <button onClick={() => dismissAlert(a.id)}
                          className="text-xs text-gray-400 hover:text-red-500">Dismiss</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </PermissionGate>
    </FeatureGate>
  );
}
