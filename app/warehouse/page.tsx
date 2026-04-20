"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../auth-provider";
import { getLocationNames, getLocationNote } from "../../lib/warehouse-locations";
import type { WarehouseLocation } from "../../lib/warehouse-locations";

// ── Types ────────────────────────────────────────────────────
type Material = {
  id: string;
  quote_id: string;
  description: string;
  status: string;
  vendor: string | null;
  order_number: string | null;
  tracking_number: string | null;
  ordered_at: string | null;
  shipped_at: string | null;
  received_at: string | null;
  expected_packages: number | null;
  received_packages: number;
  eta: string | null;
  storage_location: string | null;
  customer_name: string;
  customer_id: string;
  quote_title: string | null;
};

type Package = {
  id: string;
  material_id: string;
  tracking_number: string | null;
  status: string;
  description: string | null;
  received_at: string | null;
  received_by: string | null;
  storage_location: string | null;
  notes: string | null;
};

// Locations loaded dynamically from company_settings

const statusIcon: Record<string, string> = { ordered: "🔄", shipped: "🚚", received: "✅", staged: "📦", not_ordered: "⏳" };
const statusLabel: Record<string, string> = { ordered: "Ordered", shipped: "In Transit", received: "Received", staged: "Staged", not_ordered: "Not Ordered" };
const statusColor: Record<string, string> = {
  ordered: "var(--zr-info)",
  shipped: "var(--zr-warning)",
  received: "var(--zr-success)",
  staged: "#8b5cf6",
  not_ordered: "var(--zr-text-muted)",
};

export default function WarehousePage() {
  const { user } = useAuth();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [packages, setPackages] = useState<Record<string, Package[]>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"active" | "all" | "received">("active");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [checkInLocation, setCheckInLocation] = useState("");
  const [warehouseLocs, setWarehouseLocs] = useState<WarehouseLocation[]>([]);

  useEffect(() => {
    if (user) {
      loadMaterials();
      loadLocations();
    }
  }, [user]);

  async function loadLocations() {
    const { data } = await supabase.from("company_settings").select("warehouse_locations").maybeSingle();
    if (data?.warehouse_locations) setWarehouseLocs(data.warehouse_locations);
  }

  const STORAGE_LOCATIONS = getLocationNames(warehouseLocs.length > 0 ? warehouseLocs : null);

  async function loadMaterials() {
    setLoading(true);
    const { data } = await supabase
      .from("quote_materials")
      .select("id, quote_id, description, status, vendor, order_number, tracking_number, ordered_at, shipped_at, received_at, expected_packages, received_packages, eta, storage_location, quotes(title, customer_id, customers(first_name, last_name))")
      .in("status", ["ordered", "shipped", "received", "staged"])
      .order("created_at", { ascending: false })
      .limit(100);

    const items: Material[] = (data || []).map((m: any) => {
      const cust = m.quotes?.customers;
      const name = cust ? [cust.first_name, cust.last_name].filter(Boolean).join(" ") : "Unknown";
      return {
        ...m,
        customer_name: name,
        customer_id: m.quotes?.customer_id || "",
        quote_title: m.quotes?.title || null,
      };
    });
    setMaterials(items);
    setLoading(false);
  }

  async function loadPackages(materialId: string) {
    const { data } = await supabase
      .from("material_packages")
      .select("*")
      .eq("material_id", materialId)
      .order("created_at", { ascending: true });
    setPackages(prev => ({ ...prev, [materialId]: (data || []) as Package[] }));
  }

  async function toggleExpand(materialId: string) {
    if (expandedId === materialId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(materialId);
    if (!packages[materialId]) await loadPackages(materialId);
  }

  async function checkInPackage(materialId: string, packageId: string, location: string) {
    const now = new Date().toISOString();
    await supabase.from("material_packages").update({
      status: "received",
      received_at: now,
      received_by: "Manual Check-In",
      storage_location: location || null,
    }).eq("id", packageId);

    setPackages(prev => ({
      ...prev,
      [materialId]: (prev[materialId] || []).map(p =>
        p.id === packageId ? { ...p, status: "received", received_at: now, storage_location: location || null } : p
      ),
    }));

    // Recount
    const allPkgs = (packages[materialId] || []).map(p =>
      p.id === packageId ? { ...p, status: "received" } : p
    );
    const receivedCount = allPkgs.filter(p => p.status === "received").length;
    await supabase.from("quote_materials").update({ received_packages: receivedCount }).eq("id", materialId);
    setMaterials(prev => prev.map(m => m.id === materialId ? { ...m, received_packages: receivedCount } : m));

    // If all received, update material status
    const mat = materials.find(m => m.id === materialId);
    if (mat && mat.expected_packages && receivedCount >= mat.expected_packages) {
      await supabase.from("quote_materials").update({ status: "received", received_at: now }).eq("id", materialId);
      setMaterials(prev => prev.map(m => m.id === materialId ? { ...m, status: "received", received_at: now } : m));
    }

    if (location) {
      await supabase.from("quote_materials").update({ storage_location: location }).eq("id", materialId);
      setMaterials(prev => prev.map(m => m.id === materialId ? { ...m, storage_location: location } : m));
    }
  }

  async function checkInAll(materialId: string, location: string) {
    const now = new Date().toISOString();
    const pkgs = packages[materialId] || [];
    const pendingPkgs = pkgs.filter(p => p.status !== "received");

    for (const pkg of pendingPkgs) {
      await supabase.from("material_packages").update({
        status: "received", received_at: now, received_by: "Manual Check-In", storage_location: location || null,
      }).eq("id", pkg.id);
    }

    setPackages(prev => ({
      ...prev,
      [materialId]: (prev[materialId] || []).map(p =>
        p.status !== "received" ? { ...p, status: "received", received_at: now, storage_location: location || null } : p
      ),
    }));

    const totalPkgs = pkgs.length;
    await supabase.from("quote_materials").update({
      status: "received", received_at: now, received_packages: totalPkgs, storage_location: location || null,
    }).eq("id", materialId);
    setMaterials(prev => prev.map(m =>
      m.id === materialId ? { ...m, status: "received", received_at: now, received_packages: totalPkgs, storage_location: location || null } : m
    ));
  }

  async function stageForInstall(materialId: string) {
    await supabase.from("quote_materials").update({ status: "staged" }).eq("id", materialId);
    setMaterials(prev => prev.map(m => m.id === materialId ? { ...m, status: "staged" } : m));
  }

  async function updateLocation(materialId: string, location: string) {
    await supabase.from("quote_materials").update({ storage_location: location }).eq("id", materialId);
    setMaterials(prev => prev.map(m => m.id === materialId ? { ...m, storage_location: location } : m));
  }

  // ── Filter ─────────────────────────────────────────────────
  const filtered = materials.filter(m => {
    if (filter === "active") return m.status === "ordered" || m.status === "shipped";
    if (filter === "received") return m.status === "received" || m.status === "staged";
    return true;
  });

  const activeCount = materials.filter(m => m.status === "ordered" || m.status === "shipped").length;
  const receivedCount = materials.filter(m => m.status === "received" || m.status === "staged").length;

  if (!user) return null;

  const inputStyle = { background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", borderRadius: "var(--zr-radius-md)", color: "var(--zr-text-primary)" };

  return (
    <main style={{ background: "var(--zr-black)", color: "var(--zr-text-primary)" }} className="min-h-screen p-4">
      <div className="mx-auto max-w-3xl">

        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-bold" style={{ color: "var(--zr-text-primary)" }}>📦 Warehouse</h1>
          <button onClick={loadMaterials} className="text-xs px-2.5 py-1.5 rounded"
            style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-secondary)" }}>
            ↻ Refresh
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex rounded border overflow-hidden mb-4" style={{ borderColor: "var(--zr-border)" }}>
          {[
            { key: "active" as const, label: `In Transit / Ordered (${activeCount})` },
            { key: "received" as const, label: `Received (${receivedCount})` },
            { key: "all" as const, label: "All" },
          ].map(t => (
            <button key={t.key} onClick={() => setFilter(t.key)}
              className="flex-1 py-2 text-xs font-medium"
              style={{ background: filter === t.key ? "var(--zr-orange)" : "var(--zr-surface-1)", color: filter === t.key ? "#fff" : "var(--zr-text-primary)" }}>
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-20 rounded animate-pulse" style={{ background: "var(--zr-surface-1)" }} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 rounded" style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }}>
            <div className="text-3xl mb-2">📦</div>
            <p className="text-sm" style={{ color: "var(--zr-text-muted)" }}>No materials in this category</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(mat => (
              <div key={mat.id} className="rounded overflow-hidden"
                style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }}>

                {/* Material row */}
                <div className="flex items-center gap-3 p-3 cursor-pointer" onClick={() => toggleExpand(mat.id)}>
                  <span className="text-xl shrink-0">{statusIcon[mat.status] || "📦"}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium" style={{ color: "var(--zr-text-primary)" }}>{mat.description}</span>
                      <span className="rounded px-1.5 py-0.5 text-xs font-medium"
                        style={{ background: `${statusColor[mat.status]}20`, color: statusColor[mat.status] }}>
                        {statusLabel[mat.status] || mat.status}
                      </span>
                    </div>
                    <div className="text-xs mt-0.5 flex items-center gap-2 flex-wrap" style={{ color: "var(--zr-text-muted)" }}>
                      <Link href={`/customers/${mat.customer_id}`} onClick={e => e.stopPropagation()} className="hover:underline" style={{ color: "var(--zr-orange)" }}>
                        {mat.customer_name}
                      </Link>
                      {mat.vendor && <span>· {mat.vendor}</span>}
                      {mat.order_number && <span>· #{mat.order_number}</span>}
                      {mat.expected_packages && <span>· {mat.received_packages}/{mat.expected_packages} pkgs</span>}
                      {mat.eta && <span>· ETA: {mat.eta}</span>}
                      {mat.storage_location && <span>· 📍 {mat.storage_location}</span>}
                    </div>
                  </div>
                  {/* Progress circle for shipped items */}
                  {mat.status === "shipped" && mat.expected_packages && mat.expected_packages > 0 && (
                    <div className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{ background: "rgba(234,179,8,0.15)", color: "var(--zr-warning)" }}>
                      {mat.received_packages}/{mat.expected_packages}
                    </div>
                  )}
                  <span className="text-xs shrink-0" style={{ color: "var(--zr-text-muted)" }}>
                    {expandedId === mat.id ? "▲" : "▼"}
                  </span>
                </div>

                {/* Expanded: packages + actions */}
                {expandedId === mat.id && (
                  <div style={{ borderTop: "1px solid var(--zr-border)" }}>
                    {/* Quick info bar */}
                    <div className="px-3 py-2 flex items-center gap-3 flex-wrap text-xs" style={{ background: "var(--zr-surface-2)" }}>
                      {mat.tracking_number && (
                        <span style={{ color: "var(--zr-text-secondary)" }}>
                          Tracking: <span className="font-mono">{mat.tracking_number}</span>
                        </span>
                      )}
                      {mat.ordered_at && <span style={{ color: "var(--zr-text-muted)" }}>Ordered: {new Date(mat.ordered_at).toLocaleDateString()}</span>}
                      {mat.shipped_at && <span style={{ color: "var(--zr-text-muted)" }}>Shipped: {new Date(mat.shipped_at).toLocaleDateString()}</span>}
                      {mat.received_at && <span style={{ color: "var(--zr-text-muted)" }}>Received: {new Date(mat.received_at).toLocaleDateString()}</span>}
                      <Link href={`/quotes/${mat.quote_id}`} onClick={e => e.stopPropagation()}
                        className="hover:underline ml-auto" style={{ color: "var(--zr-orange)" }}>
                        View Quote →
                      </Link>
                    </div>

                    {/* Packages list */}
                    {(packages[mat.id] || []).length > 0 && (
                      <div className="px-3 py-2">
                        <div className="text-xs font-semibold mb-1.5" style={{ color: "var(--zr-text-secondary)" }}>Packages</div>
                        <div className="space-y-1.5">
                          {(packages[mat.id] || []).map(pkg => (
                            <div key={pkg.id} className="flex items-center gap-2 rounded p-2"
                              style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)" }}>
                              <span className="text-sm">{pkg.status === "received" ? "✅" : pkg.status === "shipped" ? "🚚" : "⏳"}</span>
                              <div className="min-w-0 flex-1">
                                <span className="text-xs font-medium" style={{ color: "var(--zr-text-primary)" }}>
                                  {pkg.description || "Package"}
                                </span>
                                {pkg.tracking_number && (
                                  <span className="text-xs ml-2 font-mono" style={{ color: "var(--zr-text-muted)" }}>
                                    #{pkg.tracking_number.slice(-8)}
                                  </span>
                                )}
                                {pkg.storage_location && (
                                  <span className="text-xs ml-2" style={{ color: "var(--zr-text-muted)" }}>📍 {pkg.storage_location}</span>
                                )}
                              </div>
                              {pkg.status !== "received" && (
                                <button onClick={() => checkInPackage(mat.id, pkg.id, checkInLocation)}
                                  className="text-xs px-2 py-1 rounded font-medium"
                                  style={{ background: "var(--zr-success)", color: "#fff" }}>
                                  Check In
                                </button>
                              )}
                              {pkg.status === "received" && pkg.received_at && (
                                <span className="text-xs" style={{ color: "var(--zr-text-muted)" }}>
                                  {new Date(pkg.received_at).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Action bar */}
                    <div className="px-3 py-2 flex items-center gap-2 flex-wrap" style={{ borderTop: "1px solid var(--zr-border)" }}>
                      {/* Location picker */}
                      <select value={checkInLocation} onChange={e => setCheckInLocation(e.target.value)}
                        className="text-xs px-2 py-1.5 rounded outline-none" style={inputStyle}>
                        <option value="">No location</option>
                        {STORAGE_LOCATIONS.map(loc => {
                          const note = getLocationNote(warehouseLocs, loc);
                          return <option key={loc} value={loc}>{loc}{note ? ` — ${note}` : ""}</option>;
                        })}
                      </select>

                      {(mat.status === "shipped" || mat.status === "ordered") && (
                        <button onClick={() => checkInAll(mat.id, checkInLocation)}
                          className="text-xs px-3 py-1.5 rounded font-medium"
                          style={{ background: "var(--zr-success)", color: "#fff" }}>
                          ✅ Check In All Packages
                        </button>
                      )}

                      {mat.status === "received" && (
                        <button onClick={() => stageForInstall(mat.id)}
                          className="text-xs px-3 py-1.5 rounded font-medium"
                          style={{ background: "#8b5cf6", color: "#fff" }}>
                          📦 Stage for Install
                        </button>
                      )}

                      {mat.status === "received" && !mat.storage_location && (
                        <button onClick={() => { if (checkInLocation) updateLocation(mat.id, checkInLocation); }}
                          disabled={!checkInLocation}
                          className="text-xs px-3 py-1.5 rounded font-medium disabled:opacity-40"
                          style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-secondary)" }}>
                          Set Location
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
