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
    <main style={{ background: "var(--zr-canvas)", color: "var(--zr-text-primary)" }} className="min-h-screen pt-2 pb-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">

        {/* iOS back + minimal header */}
        <div className="mb-3 flex items-center justify-between">
          <Link href="/" style={{ color: "var(--zr-orange)", display: "inline-flex", alignItems: "center", gap: 2, fontSize: "15px", fontWeight: 400, letterSpacing: "-0.012em" }}
            className="transition-opacity active:opacity-60">
            <svg width="10" height="16" viewBox="0 0 10 16" fill="none" style={{ marginRight: 2 }}>
              <path d="M8 1 L2 8 L8 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Home
          </Link>
          <button onClick={loadMaterials}
            style={{ color: "rgba(60,60,67,0.7)", fontSize: "14px", fontWeight: 500, letterSpacing: "-0.012em" }}
            className="transition-opacity active:opacity-60">
            Refresh
          </button>
        </div>

        {/* Page title — matches Analytics pattern (no emoji, just bold) */}
        <div className="mb-4 px-1">
          <h1 style={{ fontSize: "28px", fontWeight: 700, letterSpacing: "-0.025em", color: "var(--zr-text-primary)" }}>Warehouse</h1>
        </div>

        {/* Segmented tab control matching Dashboard/Customers */}
        <div className="mb-5 grid grid-cols-3 p-1 rounded-full" style={{ background: "var(--zr-surface-3)" }}>
          {[
            { key: "active" as const, label: `In transit · ${activeCount}` },
            { key: "received" as const, label: `Received · ${receivedCount}` },
            { key: "all" as const, label: "All" },
          ].map(t => (
            <button key={t.key} onClick={() => setFilter(t.key)}
              className="py-1.5 text-[13px] font-semibold rounded-full transition-all"
              style={filter === t.key
                ? { background: "var(--zr-surface-1)", color: "var(--zr-text-primary)", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }
                : { background: "transparent", color: "var(--zr-text-secondary)" }}>
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{ padding: "18px 20px", borderBottom: i < 3 ? "0.5px solid rgba(60,60,67,0.08)" : "none" }}>
                <div className="zr-skeleton" style={{ height: 18, width: "45%", borderRadius: 4 }} />
                <div className="zr-skeleton" style={{ height: 13, width: "30%", borderRadius: 4, marginTop: 8 }} />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center" style={{ padding: "48px 20px", color: "rgba(60,60,67,0.5)" }}>
            <p style={{ fontSize: "14px", letterSpacing: "-0.005em" }}>No materials in this category</p>
          </div>
        ) : (
          <div>
            {filtered.map((mat, matIdx) => (
              <div key={mat.id}
                style={{
                  borderBottom: matIdx < filtered.length - 1 ? "0.5px solid rgba(60,60,67,0.08)" : "none",
                }}>

                {/* ─────────────────────────────────────────────────────────
                    Shipment row — canvas level, no card. Line 1: customer
                    (bold) · status + pkg count (muted right). Line 2:
                    product. Line 3: ETA / shelf / vendor (lightest).
                    Reads the same as the Dashboard Shipments list.
                    ───────────────────────────────────────────────────────── */}
                <div className="cursor-pointer zr-ios-row"
                  onClick={() => toggleExpand(mat.id)}
                  style={{
                    padding: "16px 20px 14px",
                    transition: "background-color 120ms ease",
                  }}>

                  {/* Line 1: Customer · Status + pkg count */}
                  <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 3 }}>
                    <Link href={`/customers/${mat.customer_id}`} onClick={e => e.stopPropagation()}
                      style={{
                        flex: 1, minWidth: 0,
                        color: "var(--zr-text-primary)",
                        fontSize: "17px",
                        fontWeight: 600,
                        letterSpacing: "-0.022em",
                        lineHeight: 1.25,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        textDecoration: "none",
                      }}>
                      {mat.customer_name}
                    </Link>
                    <span style={{
                      flexShrink: 0,
                      color: statusColor[mat.status] || "rgba(60,60,67,0.42)",
                      fontSize: "13px",
                      fontWeight: 500,
                      letterSpacing: "-0.003em",
                      lineHeight: 1.25,
                    }}>
                      {statusLabel[mat.status] || mat.status}
                      {mat.expected_packages && mat.expected_packages > 0 && (
                        <span style={{ marginLeft: 8, color: "rgba(60,60,67,0.42)", fontVariantNumeric: "tabular-nums", fontWeight: 400 }}>
                          {mat.received_packages}/{mat.expected_packages}
                        </span>
                      )}
                    </span>
                  </div>

                  {/* Line 2: Product description */}
                  <div style={{
                    color: "rgba(60,60,67,0.62)",
                    fontSize: "14px",
                    fontWeight: 400,
                    letterSpacing: "-0.006em",
                    lineHeight: 1.3,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}>
                    {mat.description}
                  </div>

                  {/* Line 3: ETA / shelf / vendor / order# — lightest */}
                  {(mat.eta || mat.storage_location || mat.vendor || mat.order_number) && (
                    <div style={{
                      color: "rgba(60,60,67,0.42)",
                      fontSize: "13px",
                      fontWeight: 400,
                      letterSpacing: "-0.003em",
                      lineHeight: 1.3,
                      marginTop: 2,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}>
                      {[
                        mat.eta && `ETA ${mat.eta}`,
                        mat.storage_location && mat.storage_location,
                        mat.vendor,
                        mat.order_number && `#${mat.order_number}`,
                      ].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </div>

                {/* Expanded: packages + actions — all on canvas with hairlines, no nested boxes */}
                {expandedId === mat.id && (
                  <div style={{ borderTop: "0.5px solid rgba(60,60,67,0.08)" }}>
                    {/* Quick info strip — calm, no colored background */}
                    <div className="flex items-center gap-3 flex-wrap"
                      style={{ padding: "10px 20px", fontSize: "12.5px" }}>
                      {mat.tracking_number && (
                        <span style={{ color: "rgba(60,60,67,0.6)" }}>
                          Tracking <span style={{ fontFamily: "ui-monospace, Menlo, monospace", color: "var(--zr-text-primary)" }}>{mat.tracking_number}</span>
                        </span>
                      )}
                      {mat.ordered_at && <span style={{ color: "rgba(60,60,67,0.5)" }}>Ordered {new Date(mat.ordered_at).toLocaleDateString()}</span>}
                      {mat.shipped_at && <span style={{ color: "rgba(60,60,67,0.5)" }}>Shipped {new Date(mat.shipped_at).toLocaleDateString()}</span>}
                      {mat.received_at && <span style={{ color: "rgba(60,60,67,0.5)" }}>Received {new Date(mat.received_at).toLocaleDateString()}</span>}
                      <Link href={`/quotes/${mat.quote_id}`} onClick={e => e.stopPropagation()}
                        style={{ color: "var(--zr-orange)", marginLeft: "auto", fontWeight: 500 }}
                        className="transition-opacity active:opacity-60">
                        View quote
                      </Link>
                    </div>

                    {/* Packages — canvas rows, hairlines, no nested boxes */}
                    {(packages[mat.id] || []).length > 0 && (
                      <div>
                        <div style={{
                          padding: "10px 20px 4px",
                          fontSize: "12px",
                          color: "rgba(60,60,67,0.55)",
                          fontWeight: 500,
                          letterSpacing: "-0.005em",
                          textTransform: "uppercase",
                        }}>Packages</div>
                        {(packages[mat.id] || []).map((pkg, pkgIdx, pkgArr) => (
                          <div key={pkg.id} className="flex items-center gap-3"
                            style={{
                              padding: "10px 20px",
                              borderTop: "0.5px solid rgba(60,60,67,0.06)",
                              background: "transparent",
                            }}>
                            {/* Leading status dot instead of emoji */}
                            <span style={{
                              flexShrink: 0,
                              width: 7,
                              height: 7,
                              borderRadius: "50%",
                              background: pkg.status === "received"
                                ? "var(--zr-success)"
                                : pkg.status === "shipped"
                                ? "var(--zr-warning)"
                                : "rgba(60,60,67,0.3)",
                            }} />
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--zr-text-primary)", letterSpacing: "-0.012em" }}>
                                {pkg.description || "Package"}
                              </span>
                              {pkg.tracking_number && (
                                <span style={{ fontSize: "12.5px", color: "rgba(60,60,67,0.5)", marginLeft: 8, fontFamily: "ui-monospace, Menlo, monospace" }}>
                                  #{pkg.tracking_number.slice(-8)}
                                </span>
                              )}
                              {pkg.storage_location && (
                                <span style={{ fontSize: "12.5px", color: "rgba(60,60,67,0.5)", marginLeft: 8 }}>
                                  · {pkg.storage_location}
                                </span>
                              )}
                            </div>
                            {pkg.status !== "received" && (
                              <button onClick={() => checkInPackage(mat.id, pkg.id, checkInLocation)}
                                className="transition-opacity active:opacity-60"
                                style={{
                                  color: "var(--zr-success)",
                                  fontSize: "13px",
                                  fontWeight: 600,
                                  letterSpacing: "-0.012em",
                                }}>
                                Check in
                              </button>
                            )}
                            {pkg.status === "received" && pkg.received_at && (
                              <span style={{ fontSize: "12px", color: "rgba(60,60,67,0.45)", fontVariantNumeric: "tabular-nums" }}>
                                {new Date(pkg.received_at).toLocaleDateString()}
                              </span>
                            )}
                            {pkgIdx === pkgArr.length - 1 && null}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Action bar — hairline top, calm row, no alarm colors */}
                    <div className="flex items-center gap-2 flex-wrap"
                      style={{ padding: "10px 20px", borderTop: "0.5px solid rgba(60,60,67,0.08)" }}>
                      {/* Location picker — pill-style like the Everyone chip */}
                      <select value={checkInLocation} onChange={e => setCheckInLocation(e.target.value)}
                        style={{
                          background: "rgba(60,60,67,0.06)",
                          color: "var(--zr-text-primary)",
                          fontSize: "12.5px",
                          fontWeight: 500,
                          letterSpacing: "-0.012em",
                          padding: "5px 26px 5px 10px",
                          borderRadius: 999,
                          border: "none",
                          appearance: "none",
                          WebkitAppearance: "none",
                          cursor: "pointer",
                        }}>
                        <option value="">No location</option>
                        {STORAGE_LOCATIONS.map(loc => {
                          const note = getLocationNote(warehouseLocs, loc);
                          return <option key={loc} value={loc}>{loc}{note ? ` — ${note}` : ""}</option>;
                        })}
                      </select>

                      {(mat.status === "shipped" || mat.status === "ordered") && (
                        <button onClick={() => checkInAll(mat.id, checkInLocation)}
                          className="transition-all active:scale-[0.97]"
                          style={{
                            background: "var(--zr-success)",
                            color: "#fff",
                            fontSize: "12.5px",
                            fontWeight: 600,
                            padding: "5px 12px",
                            borderRadius: 999,
                            letterSpacing: "-0.012em",
                          }}>
                          Check in all
                        </button>
                      )}

                      {mat.status === "received" && (
                        <button onClick={() => stageForInstall(mat.id)}
                          className="transition-all active:scale-[0.97]"
                          style={{
                            background: "rgba(139,92,246,0.12)",
                            color: "#7c3aed",
                            fontSize: "12.5px",
                            fontWeight: 600,
                            padding: "5px 12px",
                            borderRadius: 999,
                            letterSpacing: "-0.012em",
                          }}>
                          Stage for install
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
