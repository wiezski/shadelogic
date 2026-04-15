"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type Product = {
  id: string;
  name: string;
  category: string;
  default_cost: number;
  default_multiplier: number;
  notes: string | null;
  active: boolean;
};

const CATEGORIES = [
  { value: "roller",    label: "Roller Shade" },
  { value: "solar",     label: "Solar Shade" },
  { value: "motorized", label: "Motorized / Smart" },
  { value: "shutter",   label: "Shutter" },
  { value: "drapery",   label: "Drapery" },
  { value: "other",     label: "Other" },
];

const CAT_BADGE: Record<string, string> = {
  roller:    "bg-blue-100 text-blue-700",
  solar:     "bg-amber-100 text-amber-700",
  motorized: "bg-purple-100 text-purple-700",
  shutter:   "bg-green-100 text-green-700",
  drapery:   "bg-pink-100 text-pink-700",
  other:     "bg-gray-100 text-gray-600",
};

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading,  setLoading]  = useState(true);

  // New / edit form
  const [showForm,  setShowForm]  = useState(false);
  const [editId,    setEditId]    = useState<string | null>(null);
  const [name,      setName]      = useState("");
  const [category,  setCategory]  = useState("roller");
  const [cost,      setCost]      = useState("");
  const [multiplier, setMultiplier] = useState("2.50");
  const [notes,     setNotes]     = useState("");
  const [saving,    setSaving]    = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("product_catalog")
      .select("*")
      .order("category")
      .order("name");
    setProducts((data || []) as Product[]);
    setLoading(false);
  }

  function openNew() {
    setEditId(null); setName(""); setCategory("roller");
    setCost(""); setMultiplier("2.50"); setNotes("");
    setShowForm(true);
  }

  function openEdit(p: Product) {
    setEditId(p.id); setName(p.name); setCategory(p.category);
    setCost(String(p.default_cost)); setMultiplier(String(p.default_multiplier));
    setNotes(p.notes ?? ""); setShowForm(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const costNum = parseFloat(cost);
    const multNum = parseFloat(multiplier);
    if (!name.trim() || isNaN(costNum) || isNaN(multNum)) return;
    setSaving(true);
    if (editId) {
      await supabase.from("product_catalog").update({
        name: name.trim(), category, default_cost: costNum,
        default_multiplier: multNum, notes: notes.trim() || null,
      }).eq("id", editId);
    } else {
      await supabase.from("product_catalog").insert([{
        name: name.trim(), category, default_cost: costNum,
        default_multiplier: multNum, notes: notes.trim() || null,
      }]);
    }
    setSaving(false);
    setShowForm(false);
    load();
  }

  async function toggleActive(p: Product) {
    await supabase.from("product_catalog").update({ active: !p.active }).eq("id", p.id);
    setProducts(prev => prev.map(x => x.id === p.id ? { ...x, active: !x.active } : x));
  }

  function retail(cost: number, mult: number) {
    return (cost * mult).toFixed(2);
  }
  function margin(cost: number, mult: number) {
    const r = cost * mult;
    return r > 0 ? Math.round(((r - cost) / r) * 100) : 0;
  }

  const active   = products.filter(p => p.active);
  const inactive = products.filter(p => !p.active);

  return (
    <main className="min-h-screen bg-white p-4 text-black text-sm">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold">Product Catalog</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              Set your costs and markup once — they auto-fill on every quote.
            </p>
          </div>
          <button onClick={openNew}
            className="bg-black text-white rounded px-3 py-1.5 text-sm">
            + Add Product
          </button>
        </div>

        {loading ? <p className="text-gray-400">Loading…</p> : (
          <>
            {active.length === 0 && (
              <p className="text-gray-400 text-sm">No products yet. Add your first one above.</p>
            )}

            <ul className="space-y-2">
              {active.map(p => {
                const r = retail(p.default_cost, p.default_multiplier);
                const m = margin(p.default_cost, p.default_multiplier);
                return (
                  <li key={p.id} className="rounded border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{p.name}</span>
                          <span className={`text-xs rounded px-1.5 py-0.5 ${CAT_BADGE[p.category] ?? CAT_BADGE.other}`}>
                            {CATEGORIES.find(c => c.value === p.category)?.label ?? p.category}
                          </span>
                        </div>
                        {p.notes && <div className="text-xs text-gray-400 mt-0.5">{p.notes}</div>}
                      </div>
                      <div className="shrink-0 flex items-center gap-2">
                        <button onClick={() => openEdit(p)}
                          className="text-xs text-blue-600 hover:underline">Edit</button>
                        <button onClick={() => toggleActive(p)}
                          className="text-xs text-gray-400 hover:text-red-500">Archive</button>
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                      <div className="rounded bg-gray-50 p-2">
                        <div className="text-gray-400">Cost</div>
                        <div className="font-semibold">${p.default_cost.toFixed(2)}</div>
                      </div>
                      <div className="rounded bg-gray-50 p-2">
                        <div className="text-gray-400">Retail ({p.default_multiplier}x)</div>
                        <div className="font-semibold text-green-600">${r}</div>
                      </div>
                      <div className="rounded bg-gray-50 p-2">
                        <div className="text-gray-400">Margin</div>
                        <div className={`font-semibold ${m >= 55 ? "text-green-600" : m >= 40 ? "text-amber-600" : "text-red-500"}`}>
                          {m}%
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            {inactive.length > 0 && (
              <details className="mt-4">
                <summary className="cursor-pointer text-xs text-gray-400 hover:text-gray-600">
                  {inactive.length} archived product{inactive.length !== 1 ? "s" : ""}
                </summary>
                <ul className="mt-2 space-y-1.5">
                  {inactive.map(p => (
                    <li key={p.id} className="rounded border p-2 opacity-50 flex items-center justify-between">
                      <span className="text-sm">{p.name}</span>
                      <button onClick={() => toggleActive(p)} className="text-xs text-blue-600 hover:underline">Restore</button>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </div>

      {/* Add / Edit modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
          <div className="bg-white w-full sm:max-w-md sm:rounded-xl rounded-t-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between rounded-t-2xl sm:rounded-t-xl">
              <h2 className="font-semibold">{editId ? "Edit Product" : "New Product"}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-black text-xl leading-none">✕</button>
            </div>
            <form onSubmit={save} className="p-4 space-y-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Product Name *</label>
                <input value={name} onChange={e => setName(e.target.value)} required
                  placeholder="e.g. Roller Shade — Blackout"
                  className="w-full border rounded px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Category</label>
                <select value={category} onChange={e => setCategory(e.target.value)}
                  className="w-full border rounded px-2 py-1.5 text-sm">
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Your Cost ($)</label>
                  <input type="number" step="0.01" min="0" value={cost} onChange={e => setCost(e.target.value)} required
                    placeholder="85.00"
                    className="w-full border rounded px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Markup Multiplier</label>
                  <input type="number" step="0.01" min="1" value={multiplier} onChange={e => setMultiplier(e.target.value)} required
                    placeholder="2.50"
                    className="w-full border rounded px-2 py-1.5 text-sm" />
                </div>
              </div>
              {/* Live preview */}
              {cost && multiplier && !isNaN(parseFloat(cost)) && !isNaN(parseFloat(multiplier)) && (
                <div className="rounded bg-green-50 border border-green-200 p-2 text-xs text-green-700">
                  Retail: <strong>${(parseFloat(cost) * parseFloat(multiplier)).toFixed(2)}</strong>
                  {" · "}Margin: <strong>{Math.round(((parseFloat(cost) * parseFloat(multiplier) - parseFloat(cost)) / (parseFloat(cost) * parseFloat(multiplier))) * 100)}%</strong>
                </div>
              )}
              <div>
                <label className="text-xs text-gray-500 block mb-1">Notes (optional)</label>
                <input value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="e.g. Battery motor, includes remote"
                  className="w-full border rounded px-2 py-1.5 text-sm" />
              </div>
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={saving}
                  className="flex-1 bg-black text-white rounded py-2 text-sm disabled:opacity-50">
                  {saving ? "Saving…" : "Save Product"}
                </button>
                <button type="button" onClick={() => setShowForm(false)}
                  className="border rounded py-2 px-4 text-sm">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
