"use client";

import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import { supabase } from "../../lib/supabase";
import { FeatureGate } from "../feature-gate";
import { PermissionGate } from "../permission-gate";

type Product = {
  id: string;
  name: string;
  category: string;
  default_cost: number;
  default_multiplier: number;
  notes: string | null;
  active: boolean;
  manufacturer: string | null;
  sku: string | null;
  min_width: string | null;
  max_width: string | null;
  min_height: string | null;
  max_height: string | null;
  lead_time_days: number | null;
  color_options: string | null;
  imported_from: string | null;
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

// ── CSV parsing helper (no library needed) ──────────────────
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  // Parse header row, handling quoted fields
  const parseRow = (row: string): string[] => {
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '"') {
        if (inQuotes && row[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());
    return fields;
  };
  const headers = parseRow(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9_]/g, "_"));
  return lines.slice(1).map(line => {
    const vals = parseRow(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = vals[i] ?? ""; });
    return obj;
  });
}

// ── Map CSV columns to product fields ───────────────────────
function mapCSVRow(row: Record<string, string>): Partial<Product> | null {
  // Try common column name variations
  const get = (...keys: string[]): string => {
    for (const k of keys) {
      const val = row[k] ?? row[k.replace(/_/g, "")] ?? row[k.replace(/_/g, " ")];
      if (val && val.trim()) return val.trim();
    }
    return "";
  };

  const name = get("name", "product_name", "product", "description", "item", "item_name", "title");
  if (!name) return null;

  const costStr = get("cost", "default_cost", "your_cost", "dealer_cost", "price", "unit_cost", "wholesale");
  const multStr = get("multiplier", "default_multiplier", "markup", "margin_multiplier");
  const catStr  = get("category", "type", "product_type", "product_category").toLowerCase();

  // Try to match category
  let category = "other";
  if (/roller|roll/i.test(catStr)) category = "roller";
  else if (/solar|screen/i.test(catStr)) category = "solar";
  else if (/motor|smart|automated/i.test(catStr)) category = "motorized";
  else if (/shutter/i.test(catStr)) category = "shutter";
  else if (/drape|drapery|curtain/i.test(catStr)) category = "drapery";

  return {
    name,
    category,
    default_cost: costStr ? parseFloat(costStr.replace(/[$,]/g, "")) || 0 : 0,
    default_multiplier: multStr ? parseFloat(multStr) || 2.5 : 2.5,
    notes: get("notes", "note", "description") || null,
    manufacturer: get("manufacturer", "mfg", "brand", "vendor", "supplier") || null,
    sku: get("sku", "item_number", "part_number", "model", "model_number", "item_no", "part_no") || null,
    min_width: get("min_width", "minimum_width") || null,
    max_width: get("max_width", "maximum_width") || null,
    min_height: get("min_height", "minimum_height") || null,
    max_height: get("max_height", "maximum_height") || null,
    lead_time_days: parseInt(get("lead_time", "lead_time_days", "lead_days")) || null,
    color_options: get("colors", "color_options", "color", "available_colors") || null,
    imported_from: "csv" as string,
  };
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState<string>("all");    // category filter
  const [search,   setSearch]   = useState("");                // search filter

  // New / edit form
  const [showForm,     setShowForm]     = useState(false);
  const [editId,       setEditId]       = useState<string | null>(null);
  const [name,         setName]         = useState("");
  const [category,     setCategory]     = useState("roller");
  const [cost,         setCost]         = useState("");
  const [multiplier,   setMultiplier]   = useState("2.50");
  const [notes,        setNotes]        = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [sku,          setSku]          = useState("");
  const [minWidth,     setMinWidth]     = useState("");
  const [maxWidth,     setMaxWidth]     = useState("");
  const [minHeight,    setMinHeight]    = useState("");
  const [maxHeight,    setMaxHeight]    = useState("");
  const [leadTime,     setLeadTime]     = useState("");
  const [colorOptions, setColorOptions] = useState("");
  const [saving,       setSaving]       = useState(false);
  const [showSpecs,    setShowSpecs]    = useState(false);

  // CSV import
  const [showImport,    setShowImport]    = useState(false);
  const [csvPreview,    setCsvPreview]    = useState<Partial<Product>[]>([]);
  const [importing,     setImporting]     = useState(false);
  const [importResult,  setImportResult]  = useState<string | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

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
    setManufacturer(""); setSku(""); setMinWidth(""); setMaxWidth("");
    setMinHeight(""); setMaxHeight(""); setLeadTime(""); setColorOptions("");
    setShowSpecs(false); setShowForm(true);
  }

  function openEdit(p: Product) {
    setEditId(p.id); setName(p.name); setCategory(p.category);
    setCost(String(p.default_cost)); setMultiplier(String(p.default_multiplier));
    setNotes(p.notes ?? ""); setManufacturer(p.manufacturer ?? "");
    setSku(p.sku ?? ""); setMinWidth(p.min_width ?? "");
    setMaxWidth(p.max_width ?? ""); setMinHeight(p.min_height ?? "");
    setMaxHeight(p.max_height ?? ""); setLeadTime(p.lead_time_days ? String(p.lead_time_days) : "");
    setColorOptions(p.color_options ?? "");
    setShowSpecs(!!(p.manufacturer || p.sku || p.min_width || p.max_width));
    setShowForm(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const costNum = parseFloat(cost);
    const multNum = parseFloat(multiplier);
    if (!name.trim() || isNaN(costNum) || isNaN(multNum)) return;
    setSaving(true);
    const row: Record<string, unknown> = {
      name: name.trim(), category, default_cost: costNum,
      default_multiplier: multNum, notes: notes.trim() || null,
      manufacturer: manufacturer.trim() || null,
      sku: sku.trim() || null,
      min_width: minWidth.trim() || null,
      max_width: maxWidth.trim() || null,
      min_height: minHeight.trim() || null,
      max_height: maxHeight.trim() || null,
      lead_time_days: leadTime ? parseInt(leadTime) || null : null,
      color_options: colorOptions.trim() || null,
    };
    if (editId) {
      await supabase.from("product_catalog").update(row).eq("id", editId);
    } else {
      row.imported_from = "manual";
      await supabase.from("product_catalog").insert([row]);
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

  // ── CSV import handlers ───────────────────────────────────
  function handleCSVFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const rows = parseCSV(text);
      const mapped = rows.map(mapCSVRow).filter(Boolean) as Partial<Product>[];
      setCsvPreview(mapped);
      setImportResult(null);
    };
    reader.readAsText(file);
  }

  async function importCSV() {
    if (csvPreview.length === 0) return;
    setImporting(true);
    const inserts = csvPreview.map(p => ({
      name: p.name || "Unnamed",
      category: p.category || "other",
      default_cost: p.default_cost || 0,
      default_multiplier: p.default_multiplier || 2.5,
      notes: p.notes || null,
      manufacturer: p.manufacturer || null,
      sku: p.sku || null,
      min_width: p.min_width || null,
      max_width: p.max_width || null,
      min_height: p.min_height || null,
      max_height: p.max_height || null,
      lead_time_days: p.lead_time_days || null,
      color_options: p.color_options || null,
      imported_from: "csv",
      active: true,
    }));
    const { error } = await supabase.from("product_catalog").insert(inserts);
    setImporting(false);
    if (error) {
      setImportResult(`Error: ${error.message}`);
    } else {
      setImportResult(`Successfully imported ${inserts.length} products`);
      setCsvPreview([]);
      if (csvInputRef.current) csvInputRef.current.value = "";
      load();
    }
  }

  // ── Filtering ─────────────────────────────────────────────
  const active   = products.filter(p => p.active);
  const inactive = products.filter(p => !p.active);

  const filtered = active.filter(p => {
    if (filter !== "all" && p.category !== filter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        p.name.toLowerCase().includes(s) ||
        (p.manufacturer ?? "").toLowerCase().includes(s) ||
        (p.sku ?? "").toLowerCase().includes(s)
      );
    }
    return true;
  });

  // Group by manufacturer for display
  const manufacturers = [...new Set(active.map(p => p.manufacturer).filter(Boolean))] as string[];

  return (
    <FeatureGate require="inventory">
      <PermissionGate require="access_settings">
        <main style={{ background: "var(--zr-black)", color: "var(--zr-text-primary)" }} className="min-h-screen p-4 text-sm">
          <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl font-bold">Product Catalog</h1>
            <p style={{ color: "var(--zr-text-secondary)" }} className="text-xs mt-0.5">
              Manage products, costs, and specs. Import from CSV or add manually.
            </p>
          </div>
          <div className="flex gap-1.5">
            <button onClick={() => { setShowImport(!showImport); setImportResult(null); setCsvPreview([]); }}
              style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-secondary)" }}
              className="rounded px-2.5 py-1.5 text-xs hover:opacity-80">
              📥 Import
            </button>
            <button onClick={openNew}
              style={{ background: "var(--zr-orange)", color: "#fff", border: "none" }}
              className="rounded px-3 py-1.5 text-xs">
              + Add Product
            </button>
          </div>
        </div>

        {/* Import Panel */}
        {showImport && (
          <div className="rounded-lg p-3 mb-3 space-y-2" style={{ background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.3)" }}>
            <div style={{ color: "var(--zr-info)" }} className="text-xs font-semibold">Import Products from CSV</div>
            <p style={{ color: "var(--zr-info)" }} className="text-xs">
              Upload a CSV with columns like: name, cost, multiplier, category, manufacturer, sku, notes.
              Column names are flexible — we'll do our best to map them automatically.
            </p>
            <div className="flex items-center gap-2">
              <input ref={csvInputRef} type="file" accept=".csv,.tsv,.txt"
                onChange={handleCSVFile}
                style={{ color: "var(--zr-text-primary)" }}
                className="text-xs file:mr-2 file:py-1 file:px-2 file:rounded file:border file:text-xs file:cursor-pointer"
                />
            </div>

            {/* CSV Preview */}
            {csvPreview.length > 0 && (
              <div className="space-y-2">
                <div style={{ color: "var(--zr-info)" }} className="text-xs font-medium">
                  Preview: {csvPreview.length} products found
                </div>
                <div style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)" }} className="max-h-48 overflow-y-auto rounded">
                  <table style={{ color: "var(--zr-text-primary)" }} className="w-full text-xs">
                    <thead style={{ background: "var(--zr-surface-3)" }} className="sticky top-0">
                      <tr>
                        <th className="text-left px-2 py-1 font-medium">Name</th>
                        <th className="text-left px-2 py-1 font-medium">Mfg</th>
                        <th className="text-left px-2 py-1 font-medium">SKU</th>
                        <th className="text-right px-2 py-1 font-medium">Cost</th>
                        <th className="text-right px-2 py-1 font-medium">Mult</th>
                      </tr>
                    </thead>
                    <tbody>
                      {csvPreview.slice(0, 20).map((p, i) => (
                        <tr key={i} className="border-t">
                          <td className="px-2 py-1 truncate max-w-[120px]">{p.name}</td>
                          <td className="px-2 py-1 text-gray-500 truncate max-w-[80px]">{p.manufacturer || "—"}</td>
                          <td className="px-2 py-1 text-gray-500 truncate max-w-[60px]">{p.sku || "—"}</td>
                          <td className="px-2 py-1 text-right">${(p.default_cost || 0).toFixed(2)}</td>
                          <td className="px-2 py-1 text-right">{(p.default_multiplier || 2.5).toFixed(2)}x</td>
                        </tr>
                      ))}
                      {csvPreview.length > 20 && (
                        <tr><td colSpan={5} className="px-2 py-1 text-gray-400 text-center">
                          …and {csvPreview.length - 20} more
                        </td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="flex gap-2">
                  <button onClick={importCSV} disabled={importing}
                    className="bg-blue-600 text-white rounded px-3 py-1.5 text-xs disabled:opacity-50">
                    {importing ? "Importing…" : `Import ${csvPreview.length} Products`}
                  </button>
                  <button onClick={() => { setCsvPreview([]); if (csvInputRef.current) csvInputRef.current.value = ""; }}
                    className="border rounded px-3 py-1.5 text-xs">Cancel</button>
                </div>
              </div>
            )}

            {importResult && (
              <div className={`text-xs rounded px-2 py-1.5 ${importResult.startsWith("Error") ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
                {importResult}
              </div>
            )}

            {/* Download template */}
            <button onClick={() => {
              const tpl = "name,category,manufacturer,sku,cost,multiplier,notes,min_width,max_width,min_height,max_height,lead_time_days,colors\nRoller Shade - Blackout,roller,Hunter Douglas,RS-BLK-001,85.00,2.50,Full blackout liner,12,96,12,120,14,White|Cream|Gray\n";
              const blob = new Blob([tpl], { type: "text/csv" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = "product-import-template.csv";
              a.click();
            }} className="text-xs hover:underline" style={{ color: "var(--zr-orange)" }}>
              📄 Download CSV template
            </button>
          </div>
        )}

        {/* Search + Filter bar */}
        <div className="flex gap-2 mb-3">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search products, manufacturers, SKUs…"
            className="flex-1 border rounded px-2.5 py-1.5 text-xs" />
          <select value={filter} onChange={e => setFilter(e.target.value)}
            className="border rounded px-2 py-1.5 text-xs">
            <option value="all">All Categories</option>
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>

        {/* Stats bar */}
        {!loading && (
          <div className="flex items-center gap-3 mb-3 text-xs text-gray-400">
            <span>{active.length} active products</span>
            {manufacturers.length > 0 && <span>· {manufacturers.length} manufacturers</span>}
            {inactive.length > 0 && <span>· {inactive.length} archived</span>}
          </div>
        )}

        {loading ? <p className="text-gray-400">Loading…</p> : (
          <>
            {filtered.length === 0 && (
              <p className="text-gray-400 text-sm py-4 text-center">
                {search || filter !== "all" ? "No products match your filters." : "No products yet. Add your first one above."}
              </p>
            )}

            <ul className="space-y-2">
              {filtered.map(p => {
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
                          {p.imported_from === "csv" && (
                            <span className="text-xs rounded px-1.5 py-0.5 bg-blue-50 text-blue-500">CSV</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {p.manufacturer && <span className="text-xs text-gray-500">{p.manufacturer}</span>}
                          {p.sku && <span className="text-xs text-gray-400">SKU: {p.sku}</span>}
                          {p.lead_time_days && <span className="text-xs text-gray-400">{p.lead_time_days}d lead</span>}
                        </div>
                        {p.notes && <div className="text-xs text-gray-400 mt-0.5">{p.notes}</div>}
                        {(p.min_width || p.max_width) && (
                          <div className="text-xs text-gray-400 mt-0.5">
                            Size: {p.min_width || "?"}" – {p.max_width || "?"}" W × {p.min_height || "?"}" – {p.max_height || "?"}" H
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 flex items-center gap-2">
                        <button onClick={() => openEdit(p)}
                          className="text-xs hover:underline" style={{ color: "var(--zr-orange)" }}>Edit</button>
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
                      <button onClick={() => toggleActive(p)} className="text-xs hover:underline" style={{ color: "var(--zr-orange)" }}>Restore</button>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
        </div>

        {/* ── Add / Edit modal ───────────────────────────────── */}
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
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Category</label>
                  <select value={category} onChange={e => setCategory(e.target.value)}
                    className="w-full border rounded px-2 py-1.5 text-sm">
                    {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Manufacturer</label>
                  <input value={manufacturer} onChange={e => setManufacturer(e.target.value)}
                    placeholder="e.g. Hunter Douglas"
                    className="w-full border rounded px-2 py-1.5 text-sm" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">SKU / Part Number</label>
                <input value={sku} onChange={e => setSku(e.target.value)}
                  placeholder="e.g. RS-BLK-001"
                  className="w-full border rounded px-2 py-1.5 text-sm" />
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

              {/* Expandable specs section */}
              <button type="button" onClick={() => setShowSpecs(!showSpecs)}
                className="text-xs hover:underline w-full text-left" style={{ color: "var(--zr-orange)" }}>
                {showSpecs ? "▾ Hide specs & size limits" : "▸ Add specs & size limits (optional)"}
              </button>
              {showSpecs && (
                <div className="space-y-2 rounded bg-gray-50 p-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Min Width (")</label>
                      <input type="text" value={minWidth} onChange={e => setMinWidth(e.target.value)}
                        placeholder="12" className="w-full border rounded px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Max Width (")</label>
                      <input type="text" value={maxWidth} onChange={e => setMaxWidth(e.target.value)}
                        placeholder="96" className="w-full border rounded px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Min Height (")</label>
                      <input type="text" value={minHeight} onChange={e => setMinHeight(e.target.value)}
                        placeholder="12" className="w-full border rounded px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Max Height (")</label>
                      <input type="text" value={maxHeight} onChange={e => setMaxHeight(e.target.value)}
                        placeholder="120" className="w-full border rounded px-2 py-1.5 text-sm" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Lead Time (days)</label>
                      <input type="number" min="0" value={leadTime} onChange={e => setLeadTime(e.target.value)}
                        placeholder="14" className="w-full border rounded px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Color Options</label>
                      <input value={colorOptions} onChange={e => setColorOptions(e.target.value)}
                        placeholder="White, Cream, Gray"
                        className="w-full border rounded px-2 py-1.5 text-sm" />
                    </div>
                  </div>
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
      </PermissionGate>
    </FeatureGate>
  );
}
