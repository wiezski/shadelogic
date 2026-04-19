"use client";

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

  // Filter specs
  const filtered = specs.filter(s => {
    if (filterMfg !== "all" && s.manufacturer !== filterMfg) return false;
    if (filterCat !== "all" && s.category !== filterCat) return false;
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
      <main className="min-h-screen p-4" style={{ background: "var(--zr-black)", color: "var(--zr-text-primary)" }}>
        <div className="mx-auto max-w-4xl space-y-4">

          {/* Header */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-xl font-bold">Manufacturer Specs</h1>
              <p className="text-xs mt-1" style={{ color: "var(--zr-text-muted)" }}>
                {specs.length} products from {manufacturers.length} manufacturers
              </p>
            </div>
            {isOwnerOrAdmin && (
              <button
                onClick={() => setShowMyMfgs(!showMyMfgs)}
                className="rounded px-3 py-2 text-xs font-medium"
                style={{
                  background: showMyMfgs ? "var(--zr-orange)" : "var(--zr-surface-1)",
                  color: showMyMfgs ? "#fff" : "var(--zr-text-primary)",
                  border: showMyMfgs ? "none" : "1px solid var(--zr-border)",
                }}>
                {showMyMfgs ? "Hide My Accounts" : "My Manufacturer Accounts"}
              </button>
            )}
          </div>

          {/* My Manufacturer Accounts */}
          {showMyMfgs && isOwnerOrAdmin && (
            <div className="rounded p-4 space-y-3" style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-orange)" }}>
              <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--zr-orange)" }}>
                Your Manufacturer Accounts
              </h2>
              <p className="text-xs" style={{ color: "var(--zr-text-muted)" }}>
                Save your account numbers, rep contacts, and discount rates for quick reference.
              </p>
              {companyMfgs.filter(m => m.is_active).length === 0 ? (
                <p className="text-xs" style={{ color: "var(--zr-text-muted)" }}>
                  No accounts set up yet. Click "Add Account" on any manufacturer below.
                </p>
              ) : (
                <div className="space-y-2">
                  {companyMfgs.filter(m => m.is_active).map(m => (
                    <div key={m.id} className="rounded p-3 flex items-center justify-between" style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)" }}>
                      <div>
                        <div className="text-sm font-medium" style={{ color: "var(--zr-text-primary)" }}>{m.manufacturer}</div>
                        <div className="text-xs space-x-3" style={{ color: "var(--zr-text-secondary)" }}>
                          {m.account_number && <span>Acct: {m.account_number}</span>}
                          {m.rep_name && <span>Rep: {m.rep_name}</span>}
                          {m.discount_pct > 0 && <span>Discount: {m.discount_pct}%</span>}
                        </div>
                      </div>
                      <button onClick={() => openEditMfg(m.manufacturer)} className="text-xs" style={{ color: "var(--zr-orange)" }}>Edit</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search products, features, materials..."
              className="flex-1 min-w-[200px] rounded px-3 py-2 text-sm"
              style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }}
            />
            <select
              value={filterMfg}
              onChange={e => setFilterMfg(e.target.value)}
              className="rounded px-2 py-2 text-sm"
              style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }}>
              <option value="all">All Manufacturers</option>
              {manufacturers.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <select
              value={filterCat}
              onChange={e => setFilterCat(e.target.value)}
              className="rounded px-2 py-2 text-sm"
              style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }}>
              <option value="all">All Categories</option>
              {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>

          {/* Results count */}
          <div className="text-xs" style={{ color: "var(--zr-text-muted)" }}>
            Showing {filtered.length} product{filtered.length !== 1 ? "s" : ""}
          </div>

          {/* Grouped product list */}
          {Object.entries(grouped).map(([manufacturer, products]) => {
            const myAcct = companyMfgs.find(m => m.manufacturer === manufacturer && m.is_active);
            return (
              <div key={manufacturer} className="space-y-2">
                {/* Manufacturer header */}
                <div className="flex items-center justify-between py-2 border-b" style={{ borderBottomColor: "var(--zr-border)" }}>
                  <div className="flex items-center gap-3">
                    <h2 className="text-sm font-bold" style={{ color: "var(--zr-text-primary)" }}>{manufacturer}</h2>
                    <span className="text-xs" style={{ color: "var(--zr-text-muted)" }}>{products.length} product{products.length !== 1 ? "s" : ""}</span>
                    {myAcct && (
                      <span className="text-xs rounded px-2 py-0.5" style={{ background: "rgba(34,197,94,0.15)", color: "var(--zr-success)" }}>
                        Active Account
                      </span>
                    )}
                  </div>
                  {isOwnerOrAdmin && (
                    <button onClick={() => openEditMfg(manufacturer)}
                      className="text-xs font-medium" style={{ color: "var(--zr-orange)" }}>
                      {myAcct ? "Edit Account" : "+ Add Account"}
                    </button>
                  )}
                </div>

                {/* Manufacturer account edit form */}
                {editingMfg === manufacturer && (
                  <div className="rounded p-4 space-y-3" style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-orange)" }}>
                    <h3 className="text-xs font-semibold uppercase" style={{ color: "var(--zr-orange)" }}>
                      {manufacturer} — Account Details
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium block mb-1" style={{ color: "var(--zr-text-secondary)" }}>Account #</label>
                        <input value={acctNum} onChange={e => setAcctNum(e.target.value)}
                          placeholder="DLR-12345" className="w-full rounded px-2 py-1.5 text-sm"
                          style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }} />
                      </div>
                      <div>
                        <label className="text-xs font-medium block mb-1" style={{ color: "var(--zr-text-secondary)" }}>Discount %</label>
                        <input value={discountPct} onChange={e => setDiscountPct(e.target.value)}
                          type="number" min="0" max="100" placeholder="0" className="w-full rounded px-2 py-1.5 text-sm"
                          style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }} />
                      </div>
                      <div>
                        <label className="text-xs font-medium block mb-1" style={{ color: "var(--zr-text-secondary)" }}>Rep Name</label>
                        <input value={repName} onChange={e => setRepName(e.target.value)}
                          placeholder="John Smith" className="w-full rounded px-2 py-1.5 text-sm"
                          style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }} />
                      </div>
                      <div>
                        <label className="text-xs font-medium block mb-1" style={{ color: "var(--zr-text-secondary)" }}>Rep Phone</label>
                        <input value={repPhone} onChange={e => setRepPhone(e.target.value)}
                          placeholder="801-555-1234" className="w-full rounded px-2 py-1.5 text-sm"
                          style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }} />
                      </div>
                      <div>
                        <label className="text-xs font-medium block mb-1" style={{ color: "var(--zr-text-secondary)" }}>Rep Email</label>
                        <input value={repEmail} onChange={e => setRepEmail(e.target.value)}
                          placeholder="rep@hunterdouglas.com" className="w-full rounded px-2 py-1.5 text-sm"
                          style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }} />
                      </div>
                      <div>
                        <label className="text-xs font-medium block mb-1" style={{ color: "var(--zr-text-secondary)" }}>Notes</label>
                        <input value={mfgNotes} onChange={e => setMfgNotes(e.target.value)}
                          placeholder="Preferred manufacturer" className="w-full rounded px-2 py-1.5 text-sm"
                          style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }} />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => saveCompanyMfg(manufacturer)}
                        className="rounded px-3 py-1.5 text-xs font-medium text-white"
                        style={{ background: "var(--zr-orange)" }}>
                        Save
                      </button>
                      <button onClick={() => setEditingMfg(null)}
                        className="rounded px-3 py-1.5 text-xs"
                        style={{ color: "var(--zr-text-muted)" }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Product cards */}
                {products.map(spec => {
                  const isExpanded = expandedId === spec.id;
                  return (
                    <div key={spec.id} className="rounded transition-colors"
                      style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }}>
                      {/* Product header row */}
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : spec.id)}
                        className="w-full px-4 py-3 flex items-center gap-3 text-left">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium" style={{ color: "var(--zr-text-primary)" }}>
                              {spec.product_name}
                            </span>
                            {spec.product_line && (
                              <span className="text-xs" style={{ color: "var(--zr-text-muted)" }}>
                                ({spec.product_line})
                              </span>
                            )}
                            <span className="text-xs rounded px-1.5 py-0.5" style={{
                              background: CATEGORY_COLORS[spec.category] || "var(--zr-surface-2)",
                              color: CATEGORY_TEXT[spec.category] || "var(--zr-text-secondary)",
                            }}>
                              {CATEGORIES[spec.category] || spec.category}
                            </span>
                            {spec.motorization_available && (
                              <span className="text-xs rounded px-1.5 py-0.5" style={{ background: "rgba(245,158,11,0.15)", color: "var(--zr-warning)" }}>
                                Motorized
                              </span>
                            )}
                          </div>
                          <div className="text-xs mt-1 flex items-center gap-3" style={{ color: "var(--zr-text-muted)" }}>
                            {spec.lead_time_days && <span>{spec.lead_time_days} day lead</span>}
                            {spec.warranty_years && <span>{spec.warranty_years}yr warranty</span>}
                            {spec.min_width && spec.max_width && (
                              <span>W: {spec.min_width}–{spec.max_width}&quot;</span>
                            )}
                            {spec.min_height && spec.max_height && (
                              <span>H: {spec.min_height}–{spec.max_height}&quot;</span>
                            )}
                          </div>
                        </div>
                        <span className="text-xs shrink-0" style={{ color: "var(--zr-text-muted)" }}>
                          {isExpanded ? "▾" : "▸"}
                        </span>
                      </button>

                      {/* Expanded details */}
                      {isExpanded && (
                        <div className="px-4 pb-4 space-y-3 border-t" style={{ borderTopColor: "var(--zr-border)" }}>
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
