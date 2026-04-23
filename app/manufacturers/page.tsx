"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../auth-provider";
import { PermissionGate } from "../permission-gate";

// ── Types ────────────────────────────────────────────────────

type ManufacturerSpec = {
  id: string;
  manufacturer: string;
  product_name: string;
  product_line: string | null;
  category: string;
  mount_types: string[];
  min_width: number | null;
  max_width: number | null;
  min_height: number | null;
  max_height: number | null;
  lead_time_days: number | null;
  warranty_years: number | null;
  motorization_available: boolean;
  colors: string[];
  materials: string[];
  features: string[];
  pricing_notes: string | null;
  ordering_notes: string | null;
  spec_url: string | null;
};

type CompanyMfg = {
  id: string;
  manufacturer: string;
  account_number: string | null;
  rep_name: string | null;
  rep_phone: string | null;
  rep_email: string | null;
  discount_pct: number;
  notes: string | null;
  is_active: boolean;
};

// ── Constants ────────────────────────────────────────────────

const CATEGORIES: Record<string, string> = {
  blind: "Blinds",
  shade: "Shades",
  shutter: "Shutters",
  motorization: "Motorization",
};

const CATEGORY_COLORS: Record<string, string> = {
  blind: "rgba(59, 130, 246, 0.2)",
  shade: "rgba(34, 197, 94, 0.2)",
  shutter: "rgba(168, 85, 247, 0.2)",
  motorization: "rgba(245, 158, 11, 0.2)",
};

const CATEGORY_TEXT: Record<string, string> = {
  blind: "var(--zr-info)",
  shade: "var(--zr-success)",
  shutter: "#a855f7",
  motorization: "var(--zr-warning)",
};

// ── Main Page ────────────────────────────────────────────────

export default function ManufacturersPage() {
  const { companyId, role } = useAuth();
  const [specs, setSpecs] = useState<ManufacturerSpec[]>([]);
  const [companyMfgs, setCompanyMfgs] = useState<CompanyMfg[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterMfg, setFilterMfg] = useState("all");
  const [filterCat, setFilterCat] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showMyMfgs, setShowMyMfgs] = useState(false);
  const [editingMfg, setEditingMfg] = useState<string | null>(null);

  // Account form state
  const [acctNum, setAcctNum] = useState("");
  const [repName, setRepName] = useState("");
  const [repPhone, setRepPhone] = useState("");
  const [repEmail, setRepEmail] = useState("");
  const [discountPct, setDiscountPct] = useState("");
  const [mfgNotes, setMfgNotes] = useState("");

  useEffect(() => { loadData(); }, []); // eslint-disable-line

  async function loadData() {
    const [specsRes, mfgRes] = await Promise.all([
      supabase.from("manufacturer_specs").select("*").eq("is_active", true).order("manufacturer").order("product_name"),
      companyId ? supabase.from("company_manufacturers").select("*").eq("company_id", companyId) : Promise.resolve({ data: [] }),
    ]);
    setSpecs((specsRes.data || []) as ManufacturerSpec[]);
    setCompanyMfgs((mfgRes.data || []) as CompanyMfg[]);
    setLoading(false);
  }

  // Get unique manufacturers
  const manufacturers = [...new Set(specs.map(s => s.manufacturer))].sort();

  // Filter specs. "motorized" is a virtual filter on the
  // motorization_available boolean rather than a category match.
  const filtered = specs.filter(s => {
    if (filterMfg !== "all" && s.manufacturer !== filterMfg) return false;
    if (filterCat === "motorized") {
      if (!s.motorization_available) return false;
    } else if (filterCat !== "all" && s.category !== filterCat) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        s.manufacturer.toLowerCase().includes(q) ||
        s.product_name.toLowerCase().includes(q) ||
        (s.product_line || "").toLowerCase().includes(q) ||
        s.features.some(f => f.toLowerCase().includes(q)) ||
        s.materials.some(m => m.toLowerCase().includes(q))
      );
    }
    return true;
  });

  // Group by manufacturer
  const grouped = filtered.reduce<Record<string, ManufacturerSpec[]>>((acc, s) => {
    (acc[s.manufacturer] = acc[s.manufacturer] || []).push(s);
    return acc;
  }, {});

  const isOwnerOrAdmin = role === "owner" || role === "admin";

  // Save/update company manufacturer info
  async function saveCompanyMfg(manufacturer: string) {
    if (!companyId) return;
    const existing = companyMfgs.find(m => m.manufacturer === manufacturer);
    const payload = {
      company_id: companyId,
      manufacturer,
      account_number: acctNum || null,
      rep_name: repName || null,
      rep_phone: repPhone || null,
      rep_email: repEmail || null,
      discount_pct: parseFloat(discountPct) || 0,
      notes: mfgNotes || null,
      is_active: true,
    };

    if (existing) {
      await supabase.from("company_manufacturers").update(payload).eq("id", existing.id);
      setCompanyMfgs(prev => prev.map(m => m.id === existing.id ? { ...m, ...payload } as CompanyMfg : m));
    } else {
      const { data } = await supabase.from("company_manufacturers").insert([payload]).select("*").single();
      if (data) setCompanyMfgs(prev => [...prev, data as CompanyMfg]);
    }
    setEditingMfg(null);
  }

  function openEditMfg(manufacturer: string) {
    const existing = companyMfgs.find(m => m.manufacturer === manufacturer);
    setAcctNum(existing?.account_number || "");
    setRepName(existing?.rep_name || "");
    setRepPhone(existing?.rep_phone || "");
    setRepEmail(existing?.rep_email || "");
    setDiscountPct(existing?.discount_pct ? String(existing.discount_pct) : "");
    setMfgNotes(existing?.notes || "");
    setEditingMfg(manufacturer);
  }

  if (loading) return (
    <main style={{ background: "var(--zr-black)", minHeight: "100vh", padding: "24px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div className="zr-skeleton" style={{ width: 220, height: 24, borderRadius: "var(--zr-radius-sm)", marginBottom: 20 }} />
        {[1,2,3].map(i => (
          <div key={i} className="zr-skeleton" style={{ width: "100%", height: 80, borderRadius: "var(--zr-radius-md)", marginBottom: 12 }} />
        ))}
      </div>
    </main>
  );

  return (
    <PermissionGate require={["create_quotes"]}>
      <main className="min-h-screen pt-2 pb-24" style={{ background: "var(--zr-canvas)", color: "var(--zr-text-primary)" }}>
        <div className="mx-auto max-w-4xl px-4 sm:px-6">

          {/* iOS back */}
          <div className="mb-3">
            <Link href="/" style={{ color: "var(--zr-orange)", display: "inline-flex", alignItems: "center", gap: 2, fontSize: "15px", fontWeight: 400, letterSpacing: "-0.012em" }}
              className="transition-opacity active:opacity-60">
              <svg width="10" height="16" viewBox="0 0 10 16" fill="none" style={{ marginRight: 2 }}>
                <path d="M8 1 L2 8 L8 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Home
            </Link>
          </div>

          {/* Title + quiet subtitle, "My accounts" toggle as text link on the right */}
          <div className="mb-4 flex items-end justify-between gap-3 px-1">
            <div className="min-w-0">
              <h1 style={{ fontSize: "28px", fontWeight: 700, letterSpacing: "-0.025em", color: "var(--zr-text-primary)" }}>Specs</h1>
              <p style={{ fontSize: "13px", color: "rgba(60,60,67,0.55)", marginTop: 2, letterSpacing: "-0.005em" }}>
                {specs.length} products · {manufacturers.length} manufacturers
              </p>
            </div>
            {isOwnerOrAdmin && (
              <button onClick={() => setShowMyMfgs(!showMyMfgs)}
                style={{ color: "var(--zr-orange)", fontSize: "14px", fontWeight: 500, letterSpacing: "-0.012em", paddingBottom: 4 }}
                className="transition-opacity active:opacity-60 flex-shrink-0">
                {showMyMfgs ? "Hide accounts" : "My accounts"}
              </button>
            )}
          </div>

          {/* My Manufacturer Accounts — subtle section, no bordered orange box */}
          {showMyMfgs && isOwnerOrAdmin && (
            <div className="mb-5">
              <div className="mb-1 px-5 flex items-baseline justify-between">
                <span className="zr-v2-section-label" style={{ padding: 0 }}>Your accounts</span>
              </div>
              {companyMfgs.filter(m => m.is_active).length === 0 ? (
                <p className="px-5" style={{ fontSize: "13px", color: "rgba(60,60,67,0.5)" }}>
                  No accounts yet. Add one from any manufacturer below.
                </p>
              ) : (
                <div>
                  {companyMfgs.filter(m => m.is_active).map((m, i, arr) => (
                    <div key={m.id}
                      className="flex items-center justify-between"
                      style={{ padding: "12px 20px", borderBottom: i < arr.length - 1 ? "0.5px solid rgba(60,60,67,0.08)" : "none" }}>
                      <div className="min-w-0 flex-1">
                        <div style={{ fontSize: "15px", fontWeight: 600, color: "var(--zr-text-primary)", letterSpacing: "-0.015em" }}>{m.manufacturer}</div>
                        <div style={{ fontSize: "13px", color: "rgba(60,60,67,0.55)", marginTop: 2 }}>
                          {[
                            m.account_number && `Acct ${m.account_number}`,
                            m.rep_name && `Rep ${m.rep_name}`,
                            m.discount_pct > 0 && `${m.discount_pct}% off`,
                          ].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                      <button onClick={() => openEditMfg(m.manufacturer)}
                        style={{ color: "var(--zr-orange)", fontSize: "13px", fontWeight: 500, letterSpacing: "-0.012em" }}
                        className="transition-opacity active:opacity-60">Edit</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Search + Manufacturer dropdown — pill inputs */}
          <div className="flex items-center gap-2 flex-wrap mb-3 px-1">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search products, features, materials"
              style={{
                flex: 1,
                minWidth: 180,
                background: "rgba(60,60,67,0.06)",
                color: "var(--zr-text-primary)",
                fontSize: "14px",
                letterSpacing: "-0.012em",
                padding: "8px 14px",
                borderRadius: 999,
                border: "none",
                outline: "none",
              }}
            />
            <div className="relative shrink-0">
              <select value={filterMfg} onChange={e => setFilterMfg(e.target.value)}
                style={{
                  background: "rgba(60,60,67,0.06)",
                  color: "var(--zr-text-primary)",
                  fontSize: "13px",
                  fontWeight: 500,
                  letterSpacing: "-0.012em",
                  padding: "8px 30px 8px 12px",
                  borderRadius: 999,
                  border: "none",
                  appearance: "none",
                  WebkitAppearance: "none",
                  cursor: "pointer",
                  maxWidth: 160,
                }}>
                <option value="all">Manufacturer</option>
                {manufacturers.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "var(--zr-text-secondary)", pointerEvents: "none" }}>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </div>
          </div>

          {/* Category chips — fast one-tap filtering. Horizontally scrollable
              on narrow widths so short names don't wrap to multiple lines. */}
          <div className="flex items-center gap-1.5 mb-4 px-1 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            {[
              { key: "all",          label: "All" },
              { key: "blind",        label: "Blinds" },
              { key: "shade",        label: "Shades" },
              { key: "shutter",      label: "Shutters" },
              { key: "motorized",    label: "Motorized" },
            ].map(chip => {
              const active = filterCat === chip.key;
              return (
                <button key={chip.key}
                  onClick={() => setFilterCat(chip.key)}
                  className="transition-all active:scale-[0.97] whitespace-nowrap shrink-0"
                  style={{
                    background: active ? "var(--zr-orange)" : "rgba(60,60,67,0.06)",
                    color: active ? "#fff" : "var(--zr-text-primary)",
                    fontSize: "13px",
                    fontWeight: active ? 600 : 500,
                    letterSpacing: "-0.012em",
                    padding: "6px 14px",
                    borderRadius: 999,
                    WebkitTapHighlightColor: "transparent",
                  }}>
                  {chip.label}
                </button>
              );
            })}
          </div>

          {/* Count — muted section label style */}
          <div className="mb-1 px-5">
            <span className="zr-v2-section-label" style={{ padding: 0 }}>
              {filtered.length} product{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Grouped product list */}
          {Object.entries(grouped).map(([manufacturer, products]) => {
            const myAcct = companyMfgs.find(m => m.manufacturer === manufacturer && m.is_active);
            return (
              <div key={manufacturer} className="mb-5">
                {/* Manufacturer header — hairline-bottom, calm type */}
                <div className="flex items-end justify-between px-5 pb-1"
                  style={{ borderBottom: "0.5px solid rgba(60,60,67,0.1)" }}>
                  <div className="flex items-baseline gap-3 min-w-0 flex-1">
                    <h2 style={{ fontSize: "17px", fontWeight: 700, letterSpacing: "-0.018em", color: "var(--zr-text-primary)" }}>{manufacturer}</h2>
                    <span style={{ fontSize: "13px", color: "rgba(60,60,67,0.5)" }}>{products.length} product{products.length !== 1 ? "s" : ""}</span>
                    {myAcct && (
                      <span style={{ fontSize: "12px", color: "var(--zr-success)", fontWeight: 500 }}>
                        Active
                      </span>
                    )}
                  </div>
                  {isOwnerOrAdmin && (
                    <button onClick={() => openEditMfg(manufacturer)}
                      style={{ color: "var(--zr-orange)", fontSize: "13px", fontWeight: 500, letterSpacing: "-0.012em", paddingBottom: 4 }}
                      className="transition-opacity active:opacity-60 shrink-0">
                      {myAcct ? "Edit" : "+ Add account"}
                    </button>
                  )}
                </div>

                {/* Manufacturer account edit form — iOS inline form, no orange box */}
                {editingMfg === manufacturer && (() => {
                  const fieldStyle: React.CSSProperties = {
                    width: "100%",
                    background: "rgba(60,60,67,0.06)",
                    color: "var(--zr-text-primary)",
                    fontSize: "14px",
                    letterSpacing: "-0.012em",
                    padding: "9px 13px",
                    borderRadius: 10,
                    border: "none",
                    outline: "none",
                  };
                  const lblStyle: React.CSSProperties = {
                    fontSize: "12px", color: "rgba(60,60,67,0.55)", fontWeight: 500,
                    display: "block", marginBottom: 4, paddingLeft: 4, letterSpacing: "-0.003em",
                  };
                  return (
                  <div style={{ padding: "14px 20px 18px", borderBottom: "0.5px solid rgba(60,60,67,0.08)" }}>
                    <div style={{ fontSize: "11px", color: "rgba(60,60,67,0.55)", fontWeight: 500, letterSpacing: "0.02em", textTransform: "uppercase", marginBottom: 10 }}>
                      Account details
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label style={lblStyle}>Account #</label>
                        <input value={acctNum} onChange={e => setAcctNum(e.target.value)} placeholder="DLR-12345" style={fieldStyle} />
                      </div>
                      <div>
                        <label style={lblStyle}>Discount %</label>
                        <input value={discountPct} onChange={e => setDiscountPct(e.target.value)}
                          type="number" min="0" max="100" placeholder="0" style={fieldStyle} />
                      </div>
                      <div>
                        <label style={lblStyle}>Rep name</label>
                        <input value={repName} onChange={e => setRepName(e.target.value)} placeholder="John Smith" style={fieldStyle} />
                      </div>
                      <div>
                        <label style={lblStyle}>Rep phone</label>
                        <input value={repPhone} onChange={e => setRepPhone(e.target.value)} placeholder="801-555-1234" style={fieldStyle} />
                      </div>
                      <div>
                        <label style={lblStyle}>Rep email</label>
                        <input value={repEmail} onChange={e => setRepEmail(e.target.value)} placeholder="rep@hunterdouglas.com" style={fieldStyle} />
                      </div>
                      <div>
                        <label style={lblStyle}>Notes</label>
                        <input value={mfgNotes} onChange={e => setMfgNotes(e.target.value)} placeholder="Preferred manufacturer" style={fieldStyle} />
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-4 mt-3">
                      <button onClick={() => setEditingMfg(null)}
                        style={{ color: "rgba(60,60,67,0.7)", fontSize: "13px", fontWeight: 500, letterSpacing: "-0.012em", padding: "6px 4px" }}
                        className="transition-opacity active:opacity-60">Cancel</button>
                      <button onClick={() => saveCompanyMfg(manufacturer)}
                        className="transition-all active:scale-[0.97]"
                        style={{
                          background: "var(--zr-orange)", color: "#fff",
                          fontSize: "13px", fontWeight: 600,
                          padding: "7px 16px",
                          borderRadius: 999,
                          letterSpacing: "-0.012em",
                        }}>Save</button>
                    </div>
                  </div>);
                })()}
                {/* Dead code starts here — legacy preserved to avoid JSX mismatch */}
                {false && (
                  <div>
                    <h3>X</h3>
                    <div>
                      <button onClick={() => saveCompanyMfg(manufacturer)}>Save</button>
                      <button onClick={() => setEditingMfg(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Product specs — canvas rows with hairlines, no cards */}
                {products.map((spec, i) => {
                  const isExpanded = expandedId === spec.id;
                  const isLast = i === products.length - 1;
                  return (
                    <div key={spec.id}
                      style={{ borderBottom: isLast ? "none" : "0.5px solid rgba(60,60,67,0.08)" }}>
                      {/* Product header row */}
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : spec.id)}
                        className="w-full flex items-center gap-3 text-left transition-opacity active:opacity-70"
                        style={{ padding: "14px 20px", WebkitTapHighlightColor: "transparent" }}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span style={{ fontSize: "15px", fontWeight: 600, color: "var(--zr-text-primary)", letterSpacing: "-0.015em" }}>
                              {spec.product_name}
                            </span>
                            {spec.product_line && (
                              <span style={{ fontSize: "12.5px", color: "rgba(60,60,67,0.5)" }}>
                                ({spec.product_line})
                              </span>
                            )}
                            <span className="rounded-full" style={{
                              background: CATEGORY_COLORS[spec.category] || "rgba(60,60,67,0.06)",
                              color: CATEGORY_TEXT[spec.category] || "rgba(60,60,67,0.7)",
                              fontSize: "11px",
                              fontWeight: 500,
                              padding: "2px 8px",
                            }}>
                              {CATEGORIES[spec.category] || spec.category}
                            </span>
                            {spec.motorization_available && (
                              <span className="rounded-full" style={{ background: "rgba(224,138,0,0.10)", color: "var(--zr-warning)", fontSize: "11px", fontWeight: 500, padding: "2px 8px" }}>
                                Motorized
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: "12.5px", color: "rgba(60,60,67,0.5)", marginTop: 3, letterSpacing: "-0.003em" }}>
                            {[
                              spec.lead_time_days && `${spec.lead_time_days}d lead`,
                              spec.warranty_years && `${spec.warranty_years}yr warranty`,
                              spec.min_width && spec.max_width && `W ${spec.min_width}–${spec.max_width}"`,
                              spec.min_height && spec.max_height && `H ${spec.min_height}–${spec.max_height}"`,
                            ].filter(Boolean).join(" · ")}
                          </div>
                        </div>
                        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" style={{ color: "rgba(60,60,67,0.4)", transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 150ms ease", flexShrink: 0 }}>
                          <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>

                      {/* Expanded details */}
                      {isExpanded && (
                        <div className="space-y-3" style={{ padding: "8px 20px 16px", borderTop: "0.5px solid rgba(60,60,67,0.06)" }}>
                          {/* Quick specs grid */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3">
                            <div>
                              <div className="text-xs font-medium mb-1" style={{ color: "var(--zr-text-secondary)" }}>Size Range</div>
                              <div className="text-sm" style={{ color: "var(--zr-text-primary)" }}>
                                {spec.min_width && spec.max_width
                                  ? `${spec.min_width}"–${spec.max_width}" W`
                                  : "N/A"}
                                <br />
                                {spec.min_height && spec.max_height
                                  ? `${spec.min_height}"–${spec.max_height}" H`
                                  : ""}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs font-medium mb-1" style={{ color: "var(--zr-text-secondary)" }}>Lead Time</div>
                              <div className="text-sm" style={{ color: "var(--zr-text-primary)" }}>
                                {spec.lead_time_days ? `${spec.lead_time_days} business days` : "Contact manufacturer"}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs font-medium mb-1" style={{ color: "var(--zr-text-secondary)" }}>Warranty</div>
                              <div className="text-sm" style={{ color: "var(--zr-text-primary)" }}>
                                {spec.warranty_years ? `${spec.warranty_years} years` : "Contact manufacturer"}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs font-medium mb-1" style={{ color: "var(--zr-text-secondary)" }}>Mount Types</div>
                              <div className="text-sm capitalize" style={{ color: "var(--zr-text-primary)" }}>
                                {spec.mount_types.join(", ")}
                              </div>
                            </div>
                          </div>

                          {/* Colors */}
                          {spec.colors.length > 0 && (
                            <div>
                              <div className="text-xs font-medium mb-1.5" style={{ color: "var(--zr-text-secondary)" }}>Colors</div>
                              <div className="flex flex-wrap gap-1.5">
                                {spec.colors.map(c => (
                                  <span key={c} className="text-xs rounded px-2 py-0.5" style={{ background: "var(--zr-surface-2)", color: "var(--zr-text-primary)" }}>
                                    {c}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Materials */}
                          {spec.materials.length > 0 && (
                            <div>
                              <div className="text-xs font-medium mb-1.5" style={{ color: "var(--zr-text-secondary)" }}>Materials</div>
                              <div className="flex flex-wrap gap-1.5">
                                {spec.materials.map(m => (
                                  <span key={m} className="text-xs rounded px-2 py-0.5" style={{ background: "rgba(59,130,246,0.1)", color: "var(--zr-info)" }}>
                                    {m}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Features */}
                          {spec.features.length > 0 && (
                            <div>
                              <div className="text-xs font-medium mb-1.5" style={{ color: "var(--zr-text-secondary)" }}>Features</div>
                              <div className="flex flex-wrap gap-1.5">
                                {spec.features.map(f => (
                                  <span key={f} className="text-xs rounded px-2 py-0.5" style={{ background: "rgba(34,197,94,0.1)", color: "var(--zr-success)" }}>
                                    {f}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Pricing & Ordering notes */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {spec.pricing_notes && (
                              <div className="rounded p-3" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}>
                                <div className="text-xs font-semibold mb-1" style={{ color: "var(--zr-warning)" }}>Pricing Notes</div>
                                <div className="text-xs" style={{ color: "var(--zr-text-secondary)" }}>{spec.pricing_notes}</div>
                              </div>
                            )}
                            {spec.ordering_notes && (
                              <div className="rounded p-3" style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)" }}>
                                <div className="text-xs font-semibold mb-1" style={{ color: "var(--zr-info)" }}>Ordering Notes</div>
                                <div className="text-xs" style={{ color: "var(--zr-text-secondary)" }}>{spec.ordering_notes}</div>
                              </div>
                            )}
                          </div>

                          {/* Your account info for this manufacturer */}
                          {myAcct && (
                            <div className="rounded p-3" style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)" }}>
                              <div className="text-xs font-semibold mb-1" style={{ color: "var(--zr-success)" }}>Your Account</div>
                              <div className="text-xs grid grid-cols-2 gap-1" style={{ color: "var(--zr-text-secondary)" }}>
                                {myAcct.account_number && <span>Account: {myAcct.account_number}</span>}
                                {myAcct.rep_name && <span>Rep: {myAcct.rep_name}</span>}
                                {myAcct.rep_phone && <span>Phone: {myAcct.rep_phone}</span>}
                                {myAcct.rep_email && <span>Email: {myAcct.rep_email}</span>}
                                {myAcct.discount_pct > 0 && <span>Discount: {myAcct.discount_pct}%</span>}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="text-center py-12">
              <div className="text-3xl mb-3">🔍</div>
              <p className="text-sm" style={{ color: "var(--zr-text-muted)" }}>No products match your search.</p>
            </div>
          )}

        </div>
      </main>
    </PermissionGate>
  );
}
