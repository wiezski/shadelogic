"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../lib/supabase";

// ── Types ─────────────────────────────────────────────────────

type QuoteStatus = "draft" | "sent" | "approved" | "rejected";

type Quote = {
  id: string;
  customer_id: string;
  title: string | null;
  status: QuoteStatus;
  amount: string | null;
  notes: string | null;
  sent_at: string | null;
  created_at: string;
  linked_measure_id: string | null;
  default_multiplier: number;
  discount_amount: number;
  tax_pct: number;
  subtotal: number;
  total: number;
  cost_total: number;
};

type LineItem = {
  id: string;
  quote_id: string;
  window_id: string | null;
  room_name: string | null;
  window_label: string | null;
  product_name: string;
  product_id: string | null;
  width: string | null;
  height: string | null;
  mount_type: string | null;
  cost: number;
  multiplier: number;
  retail: number;
  is_motorized: boolean;
  motor_cost: number;
  motor_retail: number;
  notes: string | null;
  sort_order: number;
};

type Product = {
  id: string;
  name: string;
  category: string;
  default_cost: number;
  default_multiplier: number;
};

type MeasureJob = {
  id: string;
  title: string;
};

type Customer = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
};

// ── Constants ──────────────────────────────────────────────────

const STATUSES: { value: QuoteStatus; label: string; badge: string }[] = [
  { value: "draft",    label: "Draft",    badge: "bg-gray-100 text-gray-600" },
  { value: "sent",     label: "Sent",     badge: "bg-blue-100 text-blue-700" },
  { value: "approved", label: "Approved", badge: "bg-green-100 text-green-700" },
  { value: "rejected", label: "Rejected", badge: "bg-red-100 text-red-600" },
];

const STATUS_TO_LEAD: Partial<Record<QuoteStatus, string>> = {
  sent:     "Quoted",
  approved: "Sold",
};

// ── Helpers ────────────────────────────────────────────────────

function fmt(n: number) { return n.toFixed(2); }
function fmtMoney(n: number) { return "$" + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }

// ── Page ───────────────────────────────────────────────────────

export default function QuotePage() {
  const params  = useParams();
  const quoteId = params.id as string;

  const [quote,       setQuote]       = useState<Quote | null>(null);
  const [customer,    setCustomer]    = useState<Customer | null>(null);
  const [lines,       setLines]       = useState<LineItem[]>([]);
  const [products,    setProducts]    = useState<Product[]>([]);
  const [measureJobs, setMeasureJobs] = useState<MeasureJob[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);

  // Editing state
  const [editingLine, setEditingLine] = useState<string | null>(null);
  const [editFields,  setEditFields]  = useState<Partial<LineItem>>({});

  // Link measure modal
  const [showLinkMeasure, setShowLinkMeasure] = useState(false);
  const [pulling,         setPulling]         = useState(false);

  // Add custom line
  const [showAddLine,   setShowAddLine]   = useState(false);
  const [newProduct,    setNewProduct]    = useState("");
  const [newProductId,  setNewProductId]  = useState("");
  const [newCost,       setNewCost]       = useState("");
  const [newMultiplier, setNewMultiplier] = useState("2.50");
  const [newRetail,     setNewRetail]     = useState("");
  const [newNotes,      setNewNotes]      = useState("");

  // Quote-level edits
  const [title,    setTitle]    = useState("");
  const [notes,    setNotes]    = useState("");
  const [discount, setDiscount] = useState("0");

  useEffect(() => { if (quoteId) load(); }, [quoteId]); // eslint-disable-line

  async function load() {
    setLoading(true);
    const { data: q } = await supabase.from("quotes").select("*").eq("id", quoteId).single();
    if (!q) { setLoading(false); return; }
    const quoteData = q as Quote;
    setQuote(quoteData);
    setTitle(quoteData.title ?? "");
    setNotes(quoteData.notes ?? "");
    setDiscount(String(quoteData.discount_amount ?? 0));

    const [cRes, lRes, pRes, mRes] = await Promise.all([
      supabase.from("customers").select("id, first_name, last_name, phone, email").eq("id", quoteData.customer_id).single(),
      supabase.from("quote_line_items").select("*").eq("quote_id", quoteId).order("sort_order").order("room_name").order("window_label"),
      supabase.from("product_catalog").select("id, name, category, default_cost, default_multiplier").eq("active", true).order("name"),
      supabase.from("measure_jobs").select("id, title").eq("customer_id", quoteData.customer_id).eq("install_mode", false).order("created_at", { ascending: false }),
    ]);

    if (cRes.data) setCustomer(cRes.data as Customer);
    setLines((lRes.data || []) as LineItem[]);
    setProducts((pRes.data || []) as Product[]);
    setMeasureJobs((mRes.data || []) as MeasureJob[]);
    setLoading(false);
  }

  // ── Pull from measure job ─────────────────────────────────────

  async function pullFromMeasure(measureJobId: string) {
    if (!quote) return;
    setPulling(true);

    // Update linked_measure_id on quote
    await supabase.from("quotes").update({ linked_measure_id: measureJobId }).eq("id", quoteId);

    // Load rooms + windows from measure job
    const { data: rooms } = await supabase.from("rooms").select("id, name, sort_order").eq("measure_job_id", measureJobId).order("sort_order");
    if (!rooms || rooms.length === 0) { setPulling(false); setShowLinkMeasure(false); return; }

    const roomIds = rooms.map((r: any) => r.id);
    const { data: wins } = await supabase.from("windows").select("id, room_id, sort_order, product, width, height, mount_type").in("room_id", roomIds).order("sort_order");

    const roomMap: Record<string, string> = {};
    rooms.forEach((r: any) => { roomMap[r.id] = r.name; });

    // Delete existing lines first
    await supabase.from("quote_line_items").delete().eq("quote_id", quoteId);

    // Create one line per window
    const mult = quote.default_multiplier ?? 2.5;
    const newLines = (wins || []).map((w: any, i: number) => {
      // Try to match window product to catalog
      const matched = w.product ? products.find(p => p.name.toLowerCase().includes(w.product.toLowerCase())) : null;
      const cost    = matched ? matched.default_cost : 0;
      const m       = matched ? matched.default_multiplier : mult;
      return {
        quote_id:     quoteId,
        window_id:    w.id,
        room_name:    roomMap[w.room_id] ?? "Unknown",
        window_label: `Window ${(w.sort_order ?? i) + 1}`,
        product_name: matched ? matched.name : (w.product ?? ""),
        product_id:   matched?.id ?? null,
        width:        w.width ?? null,
        height:       w.height ?? null,
        mount_type:   w.mount_type ?? null,
        cost,
        multiplier:   m,
        retail:       parseFloat(fmt(cost * m)),
        is_motorized: false,
        motor_cost:   0,
        motor_retail: 0,
        sort_order:   i,
      };
    });

    if (newLines.length > 0) {
      const { data: inserted } = await supabase.from("quote_line_items").insert(newLines).select("*");
      setLines((inserted || []) as LineItem[]);
    }

    setQuote(prev => prev ? { ...prev, linked_measure_id: measureJobId } : prev);
    setPulling(false);
    setShowLinkMeasure(false);
    await recalcAndSave(lines.length > 0 ? lines : ([] as LineItem[]));
  }

  // ── Line item CRUD ────────────────────────────────────────────

  function startEdit(line: LineItem) {
    setEditingLine(line.id);
    setEditFields({ ...line });
  }

  function cancelEdit() {
    setEditingLine(null);
    setEditFields({});
  }

  async function saveEdit() {
    if (!editingLine || !editFields) return;
    const cost    = Number(editFields.cost   ?? 0);
    const mult    = Number(editFields.multiplier ?? 2.5);
    const retail  = editFields.retail !== undefined ? Number(editFields.retail) : parseFloat(fmt(cost * mult));
    const mCost   = Number(editFields.motor_cost ?? 0);
    const mMult   = mult;
    const mRetail = editFields.motor_retail !== undefined ? Number(editFields.motor_retail) : parseFloat(fmt(mCost * mMult));

    const updates = { ...editFields, cost, multiplier: mult, retail, motor_cost: mCost, motor_retail: mRetail };
    await supabase.from("quote_line_items").update(updates).eq("id", editingLine);
    const updated = lines.map(l => l.id === editingLine ? { ...l, ...updates } as LineItem : l);
    setLines(updated);
    setEditingLine(null);
    setEditFields({});
    await recalcAndSave(updated);
  }

  async function deleteLine(id: string) {
    await supabase.from("quote_line_items").delete().eq("id", id);
    const updated = lines.filter(l => l.id !== id);
    setLines(updated);
    await recalcAndSave(updated);
  }

  async function addCustomLine(e: React.FormEvent) {
    e.preventDefault();
    const cost   = parseFloat(newCost)       || 0;
    const mult   = parseFloat(newMultiplier) || 2.5;
    const retail = parseFloat(newRetail)     || parseFloat(fmt(cost * mult));
    const { data } = await supabase.from("quote_line_items").insert([{
      quote_id: quoteId, product_name: newProduct.trim(),
      product_id: newProductId || null,
      cost, multiplier: mult, retail,
      is_motorized: false, motor_cost: 0, motor_retail: 0,
      notes: newNotes.trim() || null,
      sort_order: lines.length,
    }]).select("*").single();
    if (data) {
      const updated = [...lines, data as LineItem];
      setLines(updated);
      await recalcAndSave(updated);
    }
    setNewProduct(""); setNewProductId(""); setNewCost(""); setNewMultiplier("2.50"); setNewRetail(""); setNewNotes("");
    setShowAddLine(false);
  }

  function pickProduct(p: Product) {
    setNewProductId(p.id);
    setNewProduct(p.name);
    setNewCost(String(p.default_cost));
    setNewMultiplier(String(p.default_multiplier));
    setNewRetail(fmt(p.default_cost * p.default_multiplier));
  }

  // ── Totals ───────────────────────────────────────────────────

  function calcTotals(lineArr: LineItem[], discountAmt: number) {
    const subtotal   = lineArr.reduce((s, l) => s + l.retail + (l.is_motorized ? l.motor_retail : 0), 0);
    const costTotal  = lineArr.reduce((s, l) => s + l.cost   + (l.is_motorized ? l.motor_cost  : 0), 0);
    const total      = Math.max(0, subtotal - discountAmt);
    const marginPct  = total > 0 ? Math.round(((total - costTotal) / total) * 100) : 0;
    return { subtotal, costTotal, total, marginPct };
  }

  async function recalcAndSave(lineArr: LineItem[]) {
    const disc = parseFloat(discount) || 0;
    const { subtotal, costTotal, total } = calcTotals(lineArr, disc);
    await supabase.from("quotes").update({
      subtotal, cost_total: costTotal, total, discount_amount: disc,
      amount: fmtMoney(total),
    }).eq("id", quoteId);
    setQuote(prev => prev ? { ...prev, subtotal, cost_total: costTotal, total, discount_amount: disc } : prev);
  }

  async function saveDiscount(val: string) {
    setDiscount(val);
    await recalcAndSave(lines);
  }

  // ── Status update ─────────────────────────────────────────────

  async function updateStatus(newStatus: QuoteStatus) {
    if (!quote) return;
    setSaving(true);
    const updates: any = { status: newStatus };
    if (newStatus === "sent" && !quote.sent_at) updates.sent_at = new Date().toISOString();
    await supabase.from("quotes").update(updates).eq("id", quoteId);
    setQuote(prev => prev ? { ...prev, ...updates } : prev);
    const suggestedLead = STATUS_TO_LEAD[newStatus];
    if (suggestedLead) {
      await supabase.from("customers").update({ lead_status: suggestedLead, last_activity_at: new Date().toISOString() }).eq("id", quote.customer_id);
      await supabase.from("activity_log").insert([{
        customer_id: quote.customer_id, type: "note",
        notes: `Quote ${newStatus === "sent" ? "sent to customer" : newStatus}. Total: ${fmtMoney(quote.total || 0)}`,
        created_by: "ShadeLogic",
      }]);
    }
    setSaving(false);
  }

  async function saveTitle() {
    await supabase.from("quotes").update({ title: title || null }).eq("id", quoteId);
  }
  async function saveNotes() {
    await supabase.from("quotes").update({ notes: notes || null }).eq("id", quoteId);
  }

  // ── Render ────────────────────────────────────────────────────

  if (loading) return <div className="p-4 text-sm text-gray-400">Loading…</div>;
  if (!quote)  return <div className="p-4 text-sm text-gray-400">Quote not found.</div>;

  const customerName = [customer?.first_name, customer?.last_name].filter(Boolean).join(" ");
  const statusInfo   = STATUSES.find(s => s.value === quote.status) ?? STATUSES[0];
  const disc         = parseFloat(discount) || 0;
  const { subtotal, costTotal, total, marginPct } = calcTotals(lines, disc);
  const isNew = (Date.now() - new Date(quote.created_at).getTime()) < 90000;

  // Build SMS/email body from line items
  const linesSummary = lines.length > 0
    ? lines.map(l => `${l.room_name ? l.room_name + " · " : ""}${l.window_label ?? ""} — ${l.product_name || "TBD"}: ${fmtMoney(l.retail)}${l.is_motorized ? ` + Motor ${fmtMoney(l.motor_retail)}` : ""}`).join("\n")
    : "";
  const smsSummary = `Hi ${customerName.split(" ")[0]}! Your quote is ready.\n\n${linesSummary ? linesSummary + "\n\n" : ""}Total: ${fmtMoney(total)}\n\nReply with any questions!`;
  const emailBody  = `Hi ${customerName.split(" ")[0]},\n\nYour quote is ready!\n\n${linesSummary ? linesSummary + "\n\n" : ""}Subtotal: ${fmtMoney(subtotal)}\nDiscount: -${fmtMoney(disc)}\nTotal: ${fmtMoney(total)}\n\nReply with any questions.\n\nThank you!`;

  return (
    <main className="min-h-screen bg-white p-4 text-black text-sm pb-16">
      <div className="mx-auto max-w-3xl space-y-4">

        <Link href={`/customers/${quote.customer_id}`} className="text-blue-600 hover:underline text-sm">
          ← Back to {customerName}
        </Link>

        {/* New quote banner */}
        {isNew && (
          <div className="rounded-lg bg-orange-500 text-white px-4 py-3">
            <div className="font-bold text-lg">📋 New Quote Created</div>
            <div className="text-sm opacity-90 mt-0.5">Pull windows from the measure job to build your line items, then send.</div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <input value={title} onChange={e => setTitle(e.target.value)} onBlur={saveTitle}
              placeholder="Quote title…"
              className="text-xl font-bold w-full outline-none border-b border-transparent focus:border-gray-300 pb-0.5" />
            <div className="text-xs text-gray-400 mt-1">
              {customerName} · Created {new Date(quote.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              {quote.sent_at && ` · Sent ${new Date(quote.sent_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
            </div>
          </div>
          <span className={`shrink-0 rounded px-2 py-1 text-xs font-semibold ${statusInfo.badge}`}>{statusInfo.label}</span>
        </div>

        {/* Status */}
        <div className="rounded border p-3">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Status</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {STATUSES.map(s => (
              <button key={s.value} onClick={() => updateStatus(s.value)}
                disabled={saving || s.value === quote.status}
                className={`rounded border py-2 px-2 text-sm font-medium transition-colors ${s.value === quote.status ? "bg-black text-white border-black" : "hover:bg-gray-50 text-gray-600"}`}>
                {s.label}
                {s.value === "sent"     && quote.status !== "sent"     && <div className="text-xs font-normal opacity-60">→ Quoted</div>}
                {s.value === "approved" && quote.status !== "approved" && <div className="text-xs font-normal opacity-60">→ Sold</div>}
              </button>
            ))}
          </div>
        </div>

        {/* ── LINE ITEMS ── */}
        <div className="rounded border">
          <div className="flex items-center justify-between px-3 py-2 border-b">
            <div className="font-semibold text-sm">Quote Lines <span className="text-gray-400 font-normal">({lines.length})</span></div>
            <div className="flex gap-2">
              <button onClick={() => setShowLinkMeasure(true)}
                className="rounded border px-2.5 py-1 text-xs hover:bg-gray-50 text-gray-600">
                📐 Pull from Measure
              </button>
              <button onClick={() => setShowAddLine(true)}
                className="rounded border px-2.5 py-1 text-xs hover:bg-gray-50 text-gray-600">
                + Add Line
              </button>
            </div>
          </div>

          {lines.length === 0 ? (
            <div className="px-3 py-8 text-center text-gray-400 text-xs">
              No line items yet. Pull from a measure job or add lines manually.
            </div>
          ) : (
            <ul>
              {lines.map((line, i) => {
                const lineTotal = line.retail + (line.is_motorized ? line.motor_retail : 0);
                const isEditing = editingLine === line.id;
                return (
                  <li key={line.id} className={`border-b last:border-0 ${isEditing ? "bg-blue-50" : "hover:bg-gray-50"}`}>
                    {/* Row */}
                    <div className="flex items-center gap-2 px-3 py-2 cursor-pointer"
                      onClick={() => isEditing ? cancelEdit() : startEdit(line)}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {line.room_name && <span className="text-xs text-gray-400">{line.room_name}</span>}
                          {line.window_label && <span className="text-xs text-gray-400">· {line.window_label}</span>}
                          {line.width && line.height && (
                            <span className="text-xs text-gray-400">· {line.width} × {line.height} {line.mount_type ?? ""}</span>
                          )}
                        </div>
                        <div className="font-medium text-sm truncate">{line.product_name || <span className="text-red-400 italic">Select product</span>}</div>
                        {line.is_motorized && <div className="text-xs text-purple-600">+ Motorized ({fmtMoney(line.motor_retail)})</div>}
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="font-semibold text-sm text-green-700">{fmtMoney(lineTotal)}</div>
                        <div className="text-xs text-gray-400">cost {fmtMoney(line.cost + (line.is_motorized ? line.motor_cost : 0))}</div>
                      </div>
                      <span className="text-gray-300 text-xs ml-1">{isEditing ? "▲" : "▼"}</span>
                    </div>

                    {/* Edit panel */}
                    {isEditing && (
                      <div className="px-3 pb-3 space-y-2 border-t bg-blue-50">
                        {/* Product selector */}
                        <div className="mt-2">
                          <label className="text-xs text-gray-500 block mb-1">Product</label>
                          <select
                            value={editFields.product_id ?? ""}
                            onChange={e => {
                              const p = products.find(x => x.id === e.target.value);
                              if (p) setEditFields(f => ({
                                ...f, product_name: p.name, product_id: p.id,
                                cost: p.default_cost, multiplier: p.default_multiplier,
                                retail: parseFloat(fmt(p.default_cost * p.default_multiplier)),
                              }));
                              else setEditFields(f => ({ ...f, product_id: e.target.value }));
                            }}
                            className="w-full border rounded px-2 py-1.5 text-sm bg-white">
                            <option value="">— Select from catalog —</option>
                            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                          <input value={editFields.product_name ?? ""} onChange={e => setEditFields(f => ({ ...f, product_name: e.target.value }))}
                            placeholder="Or type product name"
                            className="mt-1 w-full border rounded px-2 py-1.5 text-sm bg-white" />
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="text-xs text-gray-500 block mb-1">Cost ($)</label>
                            <input type="number" step="0.01" min="0"
                              value={editFields.cost ?? 0}
                              onChange={e => {
                                const c = parseFloat(e.target.value) || 0;
                                const m = editFields.multiplier ?? 2.5;
                                setEditFields(f => ({ ...f, cost: c, retail: parseFloat(fmt(c * m)) }));
                              }}
                              className="w-full border rounded px-2 py-1.5 text-sm bg-white" />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500 block mb-1">Multiplier</label>
                            <input type="number" step="0.01" min="1"
                              value={editFields.multiplier ?? 2.5}
                              onChange={e => {
                                const m = parseFloat(e.target.value) || 2.5;
                                const c = editFields.cost ?? 0;
                                setEditFields(f => ({ ...f, multiplier: m, retail: parseFloat(fmt(c * m)) }));
                              }}
                              className="w-full border rounded px-2 py-1.5 text-sm bg-white" />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500 block mb-1">Retail ($)</label>
                            <input type="number" step="0.01" min="0"
                              value={editFields.retail ?? 0}
                              onChange={e => setEditFields(f => ({ ...f, retail: parseFloat(e.target.value) || 0 }))}
                              className="w-full border rounded px-2 py-1.5 text-sm bg-white" />
                          </div>
                        </div>

                        {/* Motorization toggle */}
                        <div className="flex items-center gap-2">
                          <input type="checkbox" id={`motor-${line.id}`}
                            checked={editFields.is_motorized ?? false}
                            onChange={e => {
                              const motorized = e.target.checked;
                              const motorProd = products.find(p => p.category === "motorized");
                              setEditFields(f => ({
                                ...f, is_motorized: motorized,
                                motor_cost:   motorized ? (motorProd?.default_cost ?? 95) : 0,
                                motor_retail: motorized ? parseFloat(fmt((motorProd?.default_cost ?? 95) * (motorProd?.default_multiplier ?? 3))) : 0,
                              }));
                            }}
                            className="h-4 w-4" />
                          <label htmlFor={`motor-${line.id}`} className="text-xs text-gray-600">Motorized</label>
                          {editFields.is_motorized && (
                            <div className="flex gap-2 ml-2">
                              <input type="number" step="0.01" min="0" placeholder="Motor cost"
                                value={editFields.motor_cost ?? 0}
                                onChange={e => setEditFields(f => ({ ...f, motor_cost: parseFloat(e.target.value) || 0 }))}
                                className="w-24 border rounded px-2 py-1 text-xs bg-white" />
                              <input type="number" step="0.01" min="0" placeholder="Motor retail"
                                value={editFields.motor_retail ?? 0}
                                onChange={e => setEditFields(f => ({ ...f, motor_retail: parseFloat(e.target.value) || 0 }))}
                                className="w-24 border rounded px-2 py-1 text-xs bg-white" />
                            </div>
                          )}
                        </div>

                        <div>
                          <label className="text-xs text-gray-500 block mb-1">Notes</label>
                          <input value={editFields.notes ?? ""} onChange={e => setEditFields(f => ({ ...f, notes: e.target.value }))}
                            placeholder="Optional notes for this window"
                            className="w-full border rounded px-2 py-1.5 text-sm bg-white" />
                        </div>

                        <div className="flex gap-2 pt-1">
                          <button onClick={saveEdit} className="flex-1 bg-black text-white rounded py-1.5 text-sm">Save</button>
                          <button onClick={cancelEdit} className="border rounded py-1.5 px-3 text-sm">Cancel</button>
                          <button onClick={() => { deleteLine(line.id); }} className="border border-red-200 text-red-500 rounded py-1.5 px-3 text-sm">Delete</button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* ── TOTALS ── */}
        {lines.length > 0 && (
          <div className="rounded border p-4 space-y-2">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Totals</div>
            <div className="flex justify-between text-sm"><span className="text-gray-600">Subtotal</span><span className="font-medium">{fmtMoney(subtotal)}</span></div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Discount</span>
              <div className="flex items-center gap-1">
                <span className="text-gray-400">$</span>
                <input type="number" step="0.01" min="0" value={discount}
                  onChange={e => setDiscount(e.target.value)}
                  onBlur={() => saveDiscount(discount)}
                  className="w-20 border rounded px-2 py-0.5 text-sm text-right" />
              </div>
            </div>
            <div className="flex justify-between text-base font-bold border-t pt-2">
              <span>Total</span>
              <span className="text-green-700">{fmtMoney(total)}</span>
            </div>
            <div className="flex justify-between text-xs text-gray-400 border-t pt-1.5">
              <span>Cost (internal)</span><span>{fmtMoney(costTotal)}</span>
            </div>
            <div className="flex justify-between text-xs font-medium">
              <span className="text-gray-400">Margin (internal)</span>
              <span className={marginPct >= 55 ? "text-green-600" : marginPct >= 40 ? "text-amber-600" : "text-red-500"}>
                {marginPct}%
              </span>
            </div>
          </div>
        )}

        {/* Notes */}
        <div className="rounded border p-3">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Notes</div>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} onBlur={saveNotes}
            rows={3} placeholder="Special instructions, color choices, lead times…"
            className="w-full border rounded px-2 py-1.5 text-sm" />
        </div>

        {/* Send */}
        <div className="rounded border p-3 space-y-2">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Send Quote</div>
          <a href={`sms:${customer?.phone ? customer.phone.replace(/\D/g,"") : ""}${/iPhone|iPad|iPod/i.test(typeof navigator !== "undefined" ? navigator.userAgent : "") ? "&" : "?"}body=${encodeURIComponent(smsSummary)}`}
            className="flex items-center gap-2 w-full rounded border border-green-500 text-green-700 px-3 py-2 text-sm hover:bg-green-50">
            💬 Send via Text {customer?.phone ? `(${customer.phone})` : ""}
          </a>
          <a href={`mailto:${customer?.email ?? ""}?subject=${encodeURIComponent(`Your Quote — ${title || "ShadeLogic"}`)}&body=${encodeURIComponent(emailBody)}`}
            className="flex items-center gap-2 w-full rounded border px-3 py-2 text-sm hover:bg-gray-50">
            📧 Send via Email {customer?.email ? `(${customer.email})` : ""}
          </a>
          <Link href={`/schedule?customerId=${quote.customer_id}&customerName=${encodeURIComponent(customerName)}`}
            className="flex items-center gap-2 w-full rounded border px-3 py-2 text-sm hover:bg-gray-50">
            📅 Schedule Follow-up Appointment
          </Link>
        </div>

      </div>

      {/* ── PULL FROM MEASURE MODAL ── */}
      {showLinkMeasure && (
        <Modal title="Pull from Measure Job" onClose={() => setShowLinkMeasure(false)}>
          <div className="space-y-3">
            <p className="text-sm text-gray-500">Select a measure job to populate this quote's line items.</p>
            {measureJobs.length === 0 ? (
              <p className="text-sm text-gray-400">No measure jobs found for this customer.</p>
            ) : (
              <ul className="space-y-2">
                {measureJobs.map(j => (
                  <li key={j.id}>
                    <button onClick={() => pullFromMeasure(j.id)} disabled={pulling}
                      className={`w-full text-left rounded border p-3 hover:bg-gray-50 ${quote.linked_measure_id === j.id ? "border-blue-400 bg-blue-50" : ""}`}>
                      <div className="font-medium text-sm">{j.title}</div>
                      {quote.linked_measure_id === j.id && <div className="text-xs text-blue-600 mt-0.5">Currently linked</div>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {pulling && <div className="text-sm text-gray-400 text-center">Pulling windows…</div>}
          </div>
        </Modal>
      )}

      {/* ── ADD CUSTOM LINE MODAL ── */}
      {showAddLine && (
        <Modal title="Add Line Item" onClose={() => setShowAddLine(false)}>
          <form onSubmit={addCustomLine} className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Product *</label>
              <select value={newProductId} onChange={e => {
                const p = products.find(x => x.id === e.target.value);
                if (p) pickProduct(p);
                else setNewProductId(e.target.value);
              }} className="w-full border rounded px-2 py-1.5 text-sm mb-1">
                <option value="">— Pick from catalog —</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <input value={newProduct} onChange={e => setNewProduct(e.target.value)} required
                placeholder="Or type product name"
                className="w-full border rounded px-2 py-1.5 text-sm" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Cost ($)</label>
                <input type="number" step="0.01" min="0" value={newCost} onChange={e => {
                  const c = e.target.value;
                  setNewCost(c);
                  const m = parseFloat(newMultiplier) || 2.5;
                  setNewRetail(fmt((parseFloat(c) || 0) * m));
                }} className="w-full border rounded px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Multiplier</label>
                <input type="number" step="0.01" min="1" value={newMultiplier} onChange={e => {
                  const m = e.target.value;
                  setNewMultiplier(m);
                  setNewRetail(fmt((parseFloat(newCost) || 0) * (parseFloat(m) || 2.5)));
                }} className="w-full border rounded px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Retail ($)</label>
                <input type="number" step="0.01" min="0" value={newRetail} onChange={e => setNewRetail(e.target.value)}
                  className="w-full border rounded px-2 py-1.5 text-sm" />
              </div>
            </div>
            {newCost && newRetail && (
              <div className="rounded bg-green-50 border border-green-200 p-2 text-xs text-green-700">
                Retail: <strong>${parseFloat(newRetail).toFixed(2)}</strong> · Margin:{" "}
                <strong>{Math.round(((parseFloat(newRetail) - parseFloat(newCost)) / parseFloat(newRetail)) * 100)}%</strong>
              </div>
            )}
            <div>
              <label className="text-xs text-gray-500 block mb-1">Notes</label>
              <input value={newNotes} onChange={e => setNewNotes(e.target.value)} placeholder="Optional"
                className="w-full border rounded px-2 py-1.5 text-sm" />
            </div>
            <div className="flex gap-2 pt-1">
              <button type="submit" className="flex-1 bg-black text-white rounded py-2 text-sm">Add Line</button>
              <button type="button" onClick={() => setShowAddLine(false)} className="border rounded py-2 px-4 text-sm">Cancel</button>
            </div>
          </form>
        </Modal>
      )}
    </main>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full sm:max-w-md sm:rounded-xl rounded-t-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between rounded-t-2xl sm:rounded-t-xl">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-black text-xl leading-none">✕</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

