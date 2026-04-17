"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../auth-provider";
import { PermissionGate } from "../permission-gate";
import { FeatureGate } from "../feature-gate";
import { Skeleton } from "../ui";

type Product = {
  id: string;
  name: string;
  category: string | null;
  manufacturer: string | null;
  default_cost: number;
  default_multiplier: number;
  min_width: number | null;
  max_width: number | null;
  min_height: number | null;
  max_height: number | null;
  lead_time_days: number | null;
};

type LineItem = {
  id: number;
  product_id: string;
  product_name: string;
  width: string;
  height: string;
  qty: number;
  unit_cost: number;
  multiplier: number;
};

function fmtMoney(n: number) {
  return "$" + (n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export default function CalculatorPage() {
  return (
    <FeatureGate require="quoting">
      <PermissionGate require="view_pricing">
        <CalculatorInner />
      </PermissionGate>
    </FeatureGate>
  );
}

function CalculatorInner() {
  const { companyId } = useAuth();
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [lines, setLines] = useState<LineItem[]>([]);
  const [nextId, setNextId] = useState(1);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [markupOverride, setMarkupOverride] = useState("");

  useEffect(() => {
    if (!companyId) return;
    supabase.from("product_catalog").select("id, name, category, manufacturer, default_cost, default_multiplier, min_width, max_width, min_height, max_height, lead_time_days")
      .eq("active", true).order("name")
      .then(({ data }) => { setProducts(data ?? []); setLoading(false); });
  }, [companyId]);

  function addLine(productId?: string) {
    const pid = productId || selectedProduct;
    const prod = products.find(p => p.id === pid);
    if (!prod) return;
    setLines([...lines, {
      id: nextId,
      product_id: prod.id,
      product_name: prod.name,
      width: "",
      height: "",
      qty: 1,
      unit_cost: prod.default_cost,
      multiplier: prod.default_multiplier,
    }]);
    setNextId(nextId + 1);
    setSelectedProduct("");
  }

  function updateLine(id: number, field: string, value: string | number) {
    setLines(lines.map(l => l.id === id ? { ...l, [field]: value } : l));
  }

  function removeLine(id: number) {
    setLines(lines.filter(l => l.id !== id));
  }

  function duplicateLine(id: number) {
    const src = lines.find(l => l.id === id);
    if (!src) return;
    setLines([...lines, { ...src, id: nextId }]);
    setNextId(nextId + 1);
  }

  // Parse dimension (supports fractions like "36 1/2" or "36.5")
  function parseDim(s: string): number {
    if (!s) return 0;
    const parts = s.trim().split(/\s+/);
    let total = 0;
    for (const p of parts) {
      if (p.includes("/")) {
        const [num, den] = p.split("/");
        total += parseInt(num) / parseInt(den);
      } else {
        total += parseFloat(p) || 0;
      }
    }
    return total;
  }

  // Calculate sqft for a line
  function getSqft(l: LineItem): number {
    const w = parseDim(l.width);
    const h = parseDim(l.height);
    if (!w || !h) return 0;
    return (w * h) / 144; // inches to sqft
  }

  // Global markup override
  const globalMultiplier = markupOverride ? parseFloat(markupOverride) : null;

  // Totals
  const totalCost = lines.reduce((s, l) => {
    return s + l.unit_cost * l.qty;
  }, 0);
  const totalRetail = lines.reduce((s, l) => {
    const mult = globalMultiplier ?? l.multiplier;
    return s + l.unit_cost * mult * l.qty;
  }, 0);
  const totalProfit = totalRetail - totalCost;
  const totalWindows = lines.reduce((s, l) => s + l.qty, 0);

  if (loading) {
    return (
      <div style={{ padding: "24px", maxWidth: 1000, margin: "0 auto" }}>
        <Skeleton w="200px" h="28px" />
        <div style={{ height: 16 }} />
        <Skeleton lines={4} />
      </div>
    );
  }

  return (
    <div style={{ padding: "24px", maxWidth: 1000, margin: "0 auto" }}>
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--zr-text-primary)" }}>
            Cost Calculator
          </h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--zr-text-muted)" }}>
            Quick estimates from your product catalog. Not a formal quote.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium" style={{ color: "var(--zr-text-muted)" }}>Markup override:</label>
          <input type="number" step="0.1" placeholder="—" value={markupOverride}
            onChange={e => setMarkupOverride(e.target.value)}
            className="text-sm rounded px-2 py-1 w-16 text-center"
            style={{ background: "var(--zr-surface-2)", color: "var(--zr-text-primary)", border: "1px solid var(--zr-border)" }} />
          <span className="text-xs" style={{ color: "var(--zr-text-muted)" }}>×</span>
        </div>
      </div>

      {/* Add product — dropdown auto-adds on select */}
      <div className="flex gap-2 mb-4 items-center flex-wrap">
        <div className="flex-1" style={{ minWidth: 200 }}>
          <select value="" onChange={e => { if (e.target.value) addLine(e.target.value); }}
            className="w-full text-sm rounded px-2.5 py-2"
            style={{ background: "var(--zr-surface-2)", color: "var(--zr-text-primary)", border: "2px solid var(--zr-primary)", cursor: "pointer" }}>
            <option value="">+ Add a product to estimate...</option>
            {products.map(p => (
              <option key={p.id} value={p.id}>
                {p.name} {p.manufacturer ? `(${p.manufacturer})` : ""} — {fmtMoney(p.default_cost)} × {p.default_multiplier}
              </option>
            ))}
          </select>
        </div>
        {lines.length > 0 && (
          <button onClick={() => setLines([])}
            className="text-xs px-3 py-1.5 rounded font-medium transition-colors shrink-0"
            style={{ color: "var(--zr-text-muted)" }}>
            Clear All
          </button>
        )}
      </div>

      {/* Line items — card layout for mobile */}
      {lines.length > 0 && (
        <div className="mb-4">
          <div className="flex flex-col gap-3">
            {lines.map(l => {
              const mult = globalMultiplier ?? l.multiplier;
              const lineCost = l.unit_cost * l.qty;
              const lineRetail = l.unit_cost * mult * l.qty;
              const lineProfit = lineRetail - lineCost;
              const prod = products.find(p => p.id === l.product_id);
              const w = parseDim(l.width);
              const h = parseDim(l.height);
              const sizeWarning = prod && (
                (prod.min_width && w > 0 && w < prod.min_width) ||
                (prod.max_width && w > prod.max_width) ||
                (prod.min_height && h > 0 && h < prod.min_height) ||
                (prod.max_height && h > prod.max_height)
              );

              return (
                <div key={l.id} className="rounded-lg p-3"
                  style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)" }}>
                  {/* Row 1: product name + actions */}
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="font-semibold text-sm" style={{ color: "var(--zr-text-primary)" }}>{l.product_name}</span>
                      {sizeWarning && (
                        <span className="ml-2 text-xs" style={{ color: "var(--zr-error)" }}>Size out of range</span>
                      )}
                    </div>
                    <div className="flex gap-1.5">
                      <button onClick={() => duplicateLine(l.id)} title="Duplicate"
                        className="text-xs px-2 py-1 rounded transition-colors"
                        style={{ color: "var(--zr-text-muted)", background: "var(--zr-surface-1)" }}>
                        ⧉
                      </button>
                      <button onClick={() => removeLine(l.id)} title="Remove"
                        className="text-xs px-2 py-1 rounded transition-colors"
                        style={{ color: "var(--zr-error)", background: "var(--zr-surface-1)" }}>
                        ×
                      </button>
                    </div>
                  </div>
                  {/* Row 2: inputs grid */}
                  <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr 0.7fr" }}>
                    <div>
                      <label className="text-xs mb-0.5 block" style={{ color: "var(--zr-text-muted)" }}>Width</label>
                      <input type="text" placeholder='36 1/2' value={l.width}
                        onChange={e => updateLine(l.id, "width", e.target.value)}
                        className="w-full text-sm rounded px-2 py-1.5"
                        style={{ background: "var(--zr-surface-1)", color: "var(--zr-text-primary)", border: "1px solid var(--zr-border)" }} />
                    </div>
                    <div>
                      <label className="text-xs mb-0.5 block" style={{ color: "var(--zr-text-muted)" }}>Height</label>
                      <input type="text" placeholder='60' value={l.height}
                        onChange={e => updateLine(l.id, "height", e.target.value)}
                        className="w-full text-sm rounded px-2 py-1.5"
                        style={{ background: "var(--zr-surface-1)", color: "var(--zr-text-primary)", border: "1px solid var(--zr-border)" }} />
                    </div>
                    <div>
                      <label className="text-xs mb-0.5 block" style={{ color: "var(--zr-text-muted)" }}>Qty</label>
                      <input type="number" min="1" value={l.qty}
                        onChange={e => updateLine(l.id, "qty", parseInt(e.target.value) || 1)}
                        className="w-full text-sm rounded px-2 py-1.5 text-center"
                        style={{ background: "var(--zr-surface-1)", color: "var(--zr-text-primary)", border: "1px solid var(--zr-border)" }} />
                    </div>
                  </div>
                  {/* Row 3: cost + markup */}
                  <div className="grid gap-2 mt-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
                    <div>
                      <label className="text-xs mb-0.5 block" style={{ color: "var(--zr-text-muted)" }}>Unit Cost</label>
                      <input type="number" step="0.01" value={l.unit_cost}
                        onChange={e => updateLine(l.id, "unit_cost", parseFloat(e.target.value) || 0)}
                        className="w-full text-sm rounded px-2 py-1.5"
                        style={{ background: "var(--zr-surface-1)", color: "var(--zr-text-primary)", border: "1px solid var(--zr-border)" }} />
                    </div>
                    <div>
                      <label className="text-xs mb-0.5 block" style={{ color: "var(--zr-text-muted)" }}>Markup</label>
                      {!globalMultiplier ? (
                        <input type="number" step="0.1" value={l.multiplier}
                          onChange={e => updateLine(l.id, "multiplier", parseFloat(e.target.value) || 1)}
                          className="w-full text-sm rounded px-2 py-1.5 text-center"
                          style={{ background: "var(--zr-surface-1)", color: "var(--zr-text-primary)", border: "1px solid var(--zr-border)" }} />
                      ) : (
                        <div className="text-sm font-medium py-1.5 text-center" style={{ color: "var(--zr-text-muted)" }}>{mult}×</div>
                      )}
                    </div>
                  </div>
                  {/* Row 4: results */}
                  <div className="flex items-center justify-between mt-2.5 pt-2" style={{ borderTop: "1px solid var(--zr-border)" }}>
                    <div className="flex gap-4">
                      <div>
                        <div className="text-xs" style={{ color: "var(--zr-text-muted)" }}>Retail</div>
                        <div className="text-sm font-bold" style={{ color: "var(--zr-text-primary)" }}>{fmtMoney(lineRetail)}</div>
                      </div>
                      <div>
                        <div className="text-xs" style={{ color: "var(--zr-text-muted)" }}>Profit</div>
                        <div className="text-sm font-bold" style={{ color: "var(--zr-success, #22c55e)" }}>{fmtMoney(lineProfit)}</div>
                      </div>
                      <div>
                        <div className="text-xs" style={{ color: "var(--zr-text-muted)" }}>Cost</div>
                        <div className="text-sm font-medium" style={{ color: "var(--zr-text-secondary)" }}>{fmtMoney(lineCost)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

        </div>
      )}

      {/* Empty state */}
      {lines.length === 0 && (
        <div className="rounded-lg p-8 text-center" style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)" }}>
          <div className="text-sm font-medium mb-1" style={{ color: "var(--zr-text-secondary)" }}>
            Pick a product from the dropdown above or tap one below
          </div>
          <div className="text-xs" style={{ color: "var(--zr-text-muted)" }}>
            Costs and markups pull from your product catalog. You can override per line.
          </div>
        </div>
      )}

      {/* Quick reference: product catalog summary */}
      {products.length > 0 && lines.length === 0 && (
        <div className="mt-6">
          <div className="text-xs font-semibold mb-2" style={{ color: "var(--zr-text-muted)" }}>YOUR PRODUCT CATALOG</div>
          <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
            {products.slice(0, 12).map(p => (
              <button key={p.id} onClick={() => { addLine(p.id); }}
                className="text-left rounded-lg p-3 transition-colors"
                style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)" }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--zr-primary)")}
                onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--zr-border)")}>
                <div className="text-sm font-medium" style={{ color: "var(--zr-text-primary)" }}>{p.name}</div>
                <div className="text-xs mt-0.5" style={{ color: "var(--zr-text-muted)" }}>
                  {p.manufacturer || p.category || "—"} · {fmtMoney(p.default_cost)} × {p.default_multiplier}
                </div>
                {p.lead_time_days && (
                  <div className="text-xs mt-0.5" style={{ color: "var(--zr-text-muted)" }}>
                    Lead time: {p.lead_time_days} days
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Totals summary — inline card below line items */}
      {lines.length > 0 && (
        <div className="rounded-lg p-4 mb-4"
          style={{ background: "var(--zr-primary, #e63000)", color: "#fff" }}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex gap-5 flex-wrap">
              <div>
                <div className="text-xs" style={{ opacity: 0.7 }}>Windows</div>
                <div className="text-lg font-bold">{totalWindows}</div>
              </div>
              <div>
                <div className="text-xs" style={{ opacity: 0.7 }}>Cost</div>
                <div className="text-lg font-bold">{fmtMoney(totalCost)}</div>
              </div>
              <div>
                <div className="text-xs" style={{ opacity: 0.7 }}>Retail</div>
                <div className="text-lg font-bold">{fmtMoney(totalRetail)}</div>
              </div>
              <div>
                <div className="text-xs" style={{ opacity: 0.7 }}>Profit</div>
                <div className="text-lg font-bold">{fmtMoney(totalProfit)}</div>
              </div>
              <div>
                <div className="text-xs" style={{ opacity: 0.7 }}>Margin</div>
                <div className="text-lg font-bold">
                  {totalRetail > 0 ? ((totalProfit / totalRetail) * 100).toFixed(1) + "%" : "—"}
                </div>
              </div>
            </div>
          </div>
          <button onClick={createMeasureJob}
            className="mt-3 w-full text-sm px-4 py-2.5 rounded-lg font-semibold transition-colors"
            style={{ background: "rgba(255,255,255,0.2)", color: "#fff", border: "1px solid rgba(255,255,255,0.3)" }}>
            📋 Create Measure Job from Estimate
          </button>
        </div>
      )}
    </div>
  );

  async function createMeasureJob() {
    if (lines.length === 0) return;
    // Create a measure job with windows pre-filled from calculator lines
    const { data: job, error } = await supabase.from("measure_jobs").insert([{
      title: `Calculator Estimate — ${totalWindows} windows`,
    }]).select("id").single();

    if (error || !job) { alert("Error creating measure job"); return; }

    // Create a default room
    const { data: room } = await supabase.from("rooms").insert([{
      measure_job_id: job.id,
      name: "From Calculator",
      sort_order: 0,
    }]).select("id").single();

    if (room) {
      // Create windows with products pre-filled
      const windowInserts = lines.flatMap((l, idx) => {
        const arr = [];
        for (let q = 0; q < l.qty; q++) {
          arr.push({
            room_id: room.id,
            sort_order: idx * 10 + q,
            product: l.product_name,
            width: l.width || null,
            height: l.height || null,
          });
        }
        return arr;
      });
      if (windowInserts.length > 0) {
        await supabase.from("windows").insert(windowInserts);
      }
    }

    router.push(`/measure-jobs/${job.id}`);
  }
}
