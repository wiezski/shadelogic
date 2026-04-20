"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import React from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { useEmail } from "../../../lib/use-email";
import { useAuth } from "../../auth-provider";
import { PermissionGate } from "../../permission-gate";
import { generateCommissionEntry } from "../../../lib/auto-pay";

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
  install_job_id: string | null;
  default_multiplier: number;
  discount_amount: number;
  tax_pct: number;
  subtotal: number;
  total: number;
  cost_total: number;
  deposit_pct: number;
  deposit_paid: boolean;
  deposit_paid_at: string | null;
  deposit_amount: number;
  balance_paid: boolean;
  balance_paid_at: string | null;
  payment_method: string | null;
  payment_notes: string | null;
  expires_at: string | null;
  valid_days: number;
  signature_data: string | null;
  signed_at: string | null;
  signed_name: string | null;
};

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
  notes: string | null;
  expected_packages: number | null;
  received_packages: number | null;
  order_pdf_path: string | null;
  order_pdf_text: string | null;
  eta: string | null;
  staged_at: string | null;
  staged_by: string | null;
  storage_location: string | null;
};

type MaterialPackage = {
  id: string;
  material_id: string;
  tracking_number: string | null;
  status: string;
  description: string | null;
  received_at: string | null;
  received_by: string | null;
  notes: string | null;
  storage_location: string | null;
  checked_in_at: string | null;
};

const STORAGE_LOCATIONS = ["Warehouse", "Garage", "Shelf A", "Shelf B", "Shelf C", "Shop", "Truck", "Job Site", "Other"];

const MATERIAL_STATUSES = [
  { value: "not_ordered", label: "Not Ordered", color: "bg-gray-100 text-gray-600" },
  { value: "ordered",     label: "Ordered",     color: "bg-blue-100 text-blue-700" },
  { value: "shipped",     label: "Shipped",     color: "bg-amber-100 text-amber-700" },
  { value: "received",    label: "Received",    color: "bg-green-100 text-green-700" },
  { value: "staged",      label: "Staged ✓",    color: "bg-emerald-100 text-emerald-700" },
];

const PAYMENT_METHODS = ["cash", "check", "card", "venmo", "zelle", "other"];

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
  const router  = useRouter();
  const { user, companyId } = useAuth();
  const { send: sendEmailApi, sending: emailSending } = useEmail();
  const [emailSentQuote, setEmailSentQuote] = useState(false);

  const [compSettings, setCompSettings] = useState<{ name: string; phone: string | null }>({ name: "ZeroRemake", phone: null });

  const [quote,       setQuote]       = useState<Quote | null>(null);
  const [customer,    setCustomer]    = useState<Customer | null>(null);
  const [lines,       setLines]       = useState<LineItem[]>([]);
  const [products,    setProducts]    = useState<Product[]>([]);
  const [measureJobs, setMeasureJobs] = useState<MeasureJob[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [materials,   setMaterials]   = useState<Material[]>([]);

  // Payment state
  const [depositPct,  setDepositPct]  = useState("50");
  const [payMethod,   setPayMethod]   = useState("check");
  const [payNotes,    setPayNotes]    = useState("");

  // Templates
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [showLoadTemplate, setShowLoadTemplate] = useState(false);
  const [templateName,     setTemplateName]     = useState("");
  const [templates,        setTemplates]        = useState<{ id: string; name: string }[]>([]);
  const [savingTemplate,   setSavingTemplate]   = useState(false);

  // Signature
  const [showSignature, setShowSignature] = useState(false);
  const [signedName,    setSignedName]    = useState("");
  const [signAgreed,    setSignAgreed]    = useState(false);
  const [savingSig,     setSavingSig]     = useState(false);

  // Quick-add product grid
  const [showQuickAdd, setShowQuickAdd] = useState(false);

  // Add material form
  const [showAddMat,   setShowAddMat]   = useState(false);
  const [matDesc,      setMatDesc]      = useState("");
  const [matVendor,    setMatVendor]    = useState("");
  const [matOrderNum,  setMatOrderNum]  = useState("");
  const [matExpPkgs,   setMatExpPkgs]   = useState("");
  const [savingMat,    setSavingMat]    = useState(false);

  // Package tracking
  const [packages,     setPackages]     = useState<Record<string, MaterialPackage[]>>({});
  const [expandedMat,  setExpandedMat]  = useState<string | null>(null);
  const [showChecklist, setShowChecklist] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState<string | null>(null);
  const [addingPkg,    setAddingPkg]    = useState<string | null>(null);
  const [pkgTracking,  setPkgTracking]  = useState("");
  const [pkgDesc,      setPkgDesc]      = useState("");

  // Editing state
  const [editingLine, setEditingLine] = useState<string | null>(null);
  const [editFields,  setEditFields]  = useState<Partial<LineItem>>({});

  // Link measure modal
  const [showLinkMeasure, setShowLinkMeasure] = useState(false);
  const [pulling,         setPulling]         = useState(false);

  // Schedule measure prompt (shown after quote sent → auto-creates measure job)
  const [showSchedulePrompt, setShowSchedulePrompt] = useState(false);
  const [autoMeasureJobId,   setAutoMeasureJobId]   = useState<string | null>(null);

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

  useEffect(() => {
    if (quoteId) load();
    supabase.from("company_settings").select("name, phone").limit(1).single().then(({ data }) => {
      if (data) setCompSettings({ name: data.name || "ZeroRemake", phone: data.phone || null });
    });
  }, [quoteId]); // eslint-disable-line

  async function load() {
    setLoading(true);
    const { data: q } = await supabase.from("quotes").select("*").eq("id", quoteId).single();
    if (!q) { setLoading(false); return; }
    const quoteData = q as Quote;
    setQuote(quoteData);
    setTitle(quoteData.title ?? "");
    setNotes(quoteData.notes ?? "");
    setDiscount(String(quoteData.discount_amount ?? 0));

    const [cRes, lRes, pRes, mRes, matRes] = await Promise.all([
      supabase.from("customers").select("id, first_name, last_name, phone, email").eq("id", quoteData.customer_id).single(),
      supabase.from("quote_line_items").select("*").eq("quote_id", quoteId).order("sort_order").order("room_name").order("window_label"),
      supabase.from("product_catalog").select("id, name, category, default_cost, default_multiplier").eq("active", true).order("name"),
      supabase.from("measure_jobs").select("id, title").eq("customer_id", quoteData.customer_id).eq("install_mode", false).order("created_at", { ascending: false }),
      supabase.from("quote_materials").select("*").eq("quote_id", quoteId).order("created_at"),
    ]);

    if (cRes.data) setCustomer(cRes.data as Customer);
    setLines((lRes.data || []) as LineItem[]);
    setProducts((pRes.data || []) as Product[]);
    setMeasureJobs((mRes.data || []) as MeasureJob[]);
    setMaterials((matRes.data || []) as Material[]);
    setDepositPct(String(quoteData.deposit_pct ?? 50));
    setPayMethod(quoteData.payment_method ?? "check");
    setPayNotes(quoteData.payment_notes ?? "");
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
        created_by: "ZeroRemake",
      }]);
    }
    // Auto-create follow-up tasks
    if (newStatus === "sent") {
      const followUpDate = new Date(); followUpDate.setDate(followUpDate.getDate() + 3);
      await supabase.from("tasks").insert([{
        customer_id: quote.customer_id,
        title: `Follow up on quote — ${fmtMoney(quote.total || 0)}`,
        due_date: followUpDate.toISOString().slice(0, 10),
      }]);

      // Auto-create measure job from quote lines (if no linked measure already)
      if (!quote.linked_measure_id && lines.length > 0 && customer) {
        const custName = [customer.first_name, customer.last_name].filter(Boolean).join(" ");
        const { data: mJob } = await supabase.from("measure_jobs").insert([{
          customer_id: quote.customer_id,
          title: `Measure — ${custName} (${lines.length} windows)`,
          install_mode: false,
        }]).select("id").single();

        if (mJob) {
          // Link measure job to quote
          await supabase.from("quotes").update({ linked_measure_id: mJob.id }).eq("id", quoteId);
          setQuote(prev => prev ? { ...prev, linked_measure_id: mJob.id } : prev);

          // Create a room + windows from line items
          const { data: room } = await supabase.from("rooms").insert([{
            measure_job_id: mJob.id, name: "From Quote", sort_order: 0,
          }]).select("id").single();

          if (room) {
            const winInserts = lines.map((l, idx) => ({
              room_id: room.id,
              sort_order: idx,
              product: l.product_name,
              width: l.width || null,
              height: l.height || null,
              label: l.window_label || `Window ${idx + 1}`,
            }));
            if (winInserts.length > 0) await supabase.from("windows").insert(winInserts);
          }

          // Refresh measure jobs list
          const { data: updatedJobs } = await supabase.from("measure_jobs")
            .select("id, title").eq("customer_id", quote.customer_id).eq("install_mode", false)
            .order("created_at", { ascending: false });
          if (updatedJobs) setMeasureJobs(updatedJobs as MeasureJob[]);

          // Show "Schedule Measure" prompt
          setAutoMeasureJobId(mJob.id);
          setShowSchedulePrompt(true);

          // Also create a task reminder in case they don't schedule now
          const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
          await supabase.from("tasks").insert([{
            customer_id: quote.customer_id,
            title: `Schedule measure for ${custName}`,
            due_date: tomorrow.toISOString().slice(0, 10),
          }]);
        }
      }
    }
    if (newStatus === "approved") {
      await supabase.from("tasks").insert([
        { customer_id: quote.customer_id, title: "Collect deposit", due_date: new Date().toISOString().slice(0, 10) },
        { customer_id: quote.customer_id, title: "Order all materials", due_date: new Date().toISOString().slice(0, 10) },
      ]);
      // Auto-generate commission entry for the salesperson
      if (companyId && quote.total) {
        const commResult = await generateCommissionEntry({
          quoteId, customerId: quote.customer_id,
          saleAmount: Number(quote.total), companyId,
        });
        if (commResult.created) {
          console.log("Commission auto-created:", commResult);
        }
      }
      // Auto-generate materials if none exist
      const { count } = await supabase.from("quote_materials").select("id", { count: "exact", head: true }).eq("quote_id", quoteId);
      if ((count ?? 0) === 0 && lines.length > 0) {
        const seen = new Set<string>();
        const toAdd = lines.filter(l => { if (seen.has(l.product_name)) return false; seen.add(l.product_name); return true; });
        await supabase.from("quote_materials").insert(
          toAdd.map(l => ({ quote_id: quoteId, description: `${l.product_name} (${lines.filter(x => x.product_name === l.product_name).length}x)`, status: "not_ordered" }))
        );
        const { data: newMats } = await supabase.from("quote_materials").select("*").eq("quote_id", quoteId);
        if (newMats) setMaterials(newMats as Material[]);
      }
    }
    setSaving(false);
  }

  async function saveSignature(canvasEl: HTMLCanvasElement) {
    if (!quote || !signedName.trim() || !signAgreed) return;
    setSavingSig(true);
    const sigData = canvasEl.toDataURL("image/png");
    const now     = new Date().toISOString();
    await supabase.from("quotes").update({
      signature_data: sigData,
      signed_at:      now,
      signed_name:    signedName.trim(),
      status:         "approved",
      sent_at:        quote.sent_at ?? now,
    }).eq("id", quoteId);
    await supabase.from("customers").update({
      lead_status:        "Sold",
      last_activity_at:   now,
    }).eq("id", quote.customer_id);
    await supabase.from("activity_log").insert([{
      customer_id: quote.customer_id, type: "note",
      notes: `Quote approved & signed by ${signedName.trim()}. Total: ${fmtMoney(quote.total || 0)}`,
      created_by: "ZeroRemake",
    }]);
    setQuote(prev => prev ? { ...prev, status: "approved", signature_data: sigData, signed_at: now, signed_name: signedName.trim() } : prev);
    // Auto-generate commission entry for the salesperson
    if (companyId && quote.total) {
      generateCommissionEntry({
        quoteId, customerId: quote.customer_id,
        saleAmount: Number(quote.total), companyId,
      }).catch(console.error);
    }
    setShowSignature(false);
    setSavingSig(false);
  }

  async function convertToInstallJob() {
    if (!quote || !customer) return;
    if (!confirm("Create an Install Job from this quote? This pulls all line items as windows to track.")) return;
    setSaving(true);

    const installTitle = `Install - ${[customer.first_name, customer.last_name].filter(Boolean).join(" ")} - ${new Date().toISOString().slice(0, 10)}`;

    // 1. Create the install job linked to this quote
    const { data: newJob, error } = await supabase
      .from("measure_jobs")
      .insert([{
        customer_id: quote.customer_id,
        title: installTitle,
        install_mode: true,
        quote_id: quoteId,
        install_status: "pending",
      }])
      .select("id").single();

    if (error || !newJob) { alert("Error creating install job: " + error?.message); setSaving(false); return; }

    // 2. Group line items by room and create rooms + windows
    const roomGroups: Record<string, typeof lines> = {};
    for (const line of lines) {
      const rn = line.room_name || "Main";
      if (!roomGroups[rn]) roomGroups[rn] = [];
      roomGroups[rn].push(line);
    }

    let sortIdx = 0;
    for (const [roomName, roomLines] of Object.entries(roomGroups)) {
      const { data: newRoom } = await supabase
        .from("rooms")
        .insert([{ measure_job_id: newJob.id, name: roomName, sort_order: sortIdx++ }])
        .select("id").single();
      if (!newRoom) continue;

      await supabase.from("windows").insert(
        roomLines.map((l, i) => ({
          room_id: newRoom.id,
          sort_order: i,
          product: l.product_name,
          width: l.width || null,
          height: l.height || null,
          mount_type: l.mount_type || null,
          notes: l.notes || null,
          install_status: "not_started",
        }))
      );
    }

    // 3. Stamp install checklist
    const { data: checklistItems } = await supabase
      .from("install_checklist_items")
      .select("id, label, sort_order, required")
      .eq("active", true)
      .order("sort_order");

    if (checklistItems && checklistItems.length > 0) {
      await supabase.from("install_checklist_completions").insert(
        checklistItems.map(item => ({
          job_id: newJob.id,
          checklist_item_id: item.id,
          label: item.label,
          required: item.required,
          sort_order: item.sort_order,
        }))
      );
    }

    // 4. Link quote → install job
    await supabase.from("quotes").update({ install_job_id: newJob.id }).eq("id", quoteId);

    // 5. Update customer status
    await supabase.from("customers").update({
      lead_status: "Sold",
      last_activity_at: new Date().toISOString(),
    }).eq("id", quote.customer_id);

    // 6. Log activity
    await supabase.from("activity_log").insert([{
      customer_id: quote.customer_id,
      type: "note",
      notes: `Install job created from quote. ${lines.length} window(s) across ${Object.keys(roomGroups).length} room(s).`,
      created_by: "ZeroRemake",
    }]);

    setSaving(false);
    router.push(`/measure-jobs/${newJob.id}`);
  }

  async function quickAddProduct(p: Product) {
    const retail = parseFloat(fmt(p.default_cost * p.default_multiplier));
    const { data } = await supabase.from("quote_line_items").insert([{
      quote_id: quoteId, product_name: p.name, product_id: p.id,
      cost: p.default_cost, multiplier: p.default_multiplier, retail,
      is_motorized: false, motor_cost: 0, motor_retail: 0,
      sort_order: lines.length,
    }]).select("*").single();
    if (data) {
      const updated = [...lines, data as LineItem];
      setLines(updated);
      await recalcAndSave(updated);
    }
  }

  async function loadTemplateList() {
    const { data } = await supabase.from("quote_templates").select("id, name").order("name");
    setTemplates((data || []) as { id: string; name: string }[]);
  }

  async function saveAsTemplate() {
    if (!templateName.trim() || lines.length === 0) return;
    setSavingTemplate(true);
    const { data: tmpl } = await supabase.from("quote_templates")
      .insert([{ name: templateName.trim() }]).select("id").single();
    if (tmpl) {
      await supabase.from("quote_template_lines").insert(
        lines.map((l, i) => ({
          template_id: tmpl.id, product_name: l.product_name, product_id: l.product_id,
          cost: l.cost, multiplier: l.multiplier, retail: l.retail,
          is_motorized: l.is_motorized, motor_cost: l.motor_cost, motor_retail: l.motor_retail,
          notes: l.notes, sort_order: i,
        }))
      );
    }
    setSavingTemplate(false);
    setShowSaveTemplate(false);
    setTemplateName("");
  }

  async function loadFromTemplate(templateId: string) {
    const { data: tLines } = await supabase.from("quote_template_lines")
      .select("*").eq("template_id", templateId).order("sort_order");
    if (!tLines || tLines.length === 0) return;
    await supabase.from("quote_line_items").delete().eq("quote_id", quoteId);
    const { data: inserted } = await supabase.from("quote_line_items").insert(
      tLines.map((tl: any, i: number) => ({
        quote_id: quoteId, product_name: tl.product_name, product_id: tl.product_id,
        cost: tl.cost, multiplier: tl.multiplier, retail: tl.retail,
        is_motorized: tl.is_motorized, motor_cost: tl.motor_cost, motor_retail: tl.motor_retail,
        notes: tl.notes, sort_order: i,
      }))
    ).select("*");
    const updated = (inserted || []) as LineItem[];
    setLines(updated);
    await recalcAndSave(updated);
    setShowLoadTemplate(false);
  }

  async function saveTitle() {
    await supabase.from("quotes").update({ title: title || null }).eq("id", quoteId);
  }
  async function saveNotes() {
    await supabase.from("quotes").update({ notes: notes || null }).eq("id", quoteId);
  }

  async function markDepositPaid() {
    if (!quote) return;
    const depAmt = parseFloat(fmt((quote.total || 0) * (parseFloat(depositPct) / 100)));
    const updates = { deposit_paid: true, deposit_paid_at: new Date().toISOString(), deposit_amount: depAmt, deposit_pct: parseFloat(depositPct), payment_method: payMethod, payment_notes: payNotes || null };
    await supabase.from("quotes").update(updates).eq("id", quoteId);
    setQuote(prev => prev ? { ...prev, ...updates } : prev);
    await supabase.from("activity_log").insert([{ customer_id: quote.customer_id, type: "note", notes: `Deposit received: ${fmtMoney(depAmt)} (${payMethod})`, created_by: "ZeroRemake" }]);
    await supabase.from("customers").update({ last_activity_at: new Date().toISOString() }).eq("id", quote.customer_id);
    // Auto-task: order materials now that deposit is in
    await supabase.from("tasks").insert([{
      customer_id: quote.customer_id,
      title: "Order all materials — deposit received",
      due_date: new Date().toISOString().slice(0, 10),
    }]);
  }

  async function markBalancePaid() {
    if (!quote) return;
    const updates = { balance_paid: true, balance_paid_at: new Date().toISOString(), payment_method: payMethod, payment_notes: payNotes || null };
    await supabase.from("quotes").update(updates).eq("id", quoteId);
    setQuote(prev => prev ? { ...prev, ...updates } : prev);
    const balAmt = (quote.total || 0) - (quote.deposit_amount || 0);
    await supabase.from("activity_log").insert([{ customer_id: quote.customer_id, type: "note", notes: `Balance received: ${fmtMoney(balAmt)} (${payMethod}). Job fully paid.`, created_by: "ZeroRemake" }]);
    await supabase.from("customers").update({ last_activity_at: new Date().toISOString(), lead_status: "Installed" }).eq("id", quote.customer_id);
  }

  async function addMaterial(e: React.FormEvent) {
    e.preventDefault();
    if (!matDesc.trim()) return;
    setSavingMat(true);
    const expPkgs = matExpPkgs ? parseInt(matExpPkgs) || null : null;
    const { data } = await supabase.from("quote_materials").insert([{
      quote_id: quoteId, description: matDesc.trim(), vendor: matVendor.trim() || null,
      order_number: matOrderNum.trim() || null, status: "not_ordered",
      expected_packages: expPkgs, received_packages: 0,
    }]).select("*").single();
    if (data) {
      setMaterials(prev => [...prev, data as Material]);
      // If expected packages specified, pre-create package slots
      if (expPkgs && expPkgs > 0) {
        const pkgInserts = Array.from({ length: expPkgs }, (_, i) => ({
          material_id: data.id, status: "pending",
          description: `Package ${i + 1} of ${expPkgs}`,
        }));
        const { data: pkgs } = await supabase.from("material_packages").insert(pkgInserts).select("*");
        if (pkgs) setPackages(prev => ({ ...prev, [data.id]: pkgs as MaterialPackage[] }));
      }
    }
    setMatDesc(""); setMatVendor(""); setMatOrderNum(""); setMatExpPkgs("");
    setSavingMat(false); setShowAddMat(false);
  }

  async function updateMaterialStatus(id: string, status: string) {
    const now = new Date().toISOString();
    const timeFields: Record<string, string> = { ordered: "ordered_at", shipped: "shipped_at", received: "received_at" };
    const update: any = { status };
    if (timeFields[status]) update[timeFields[status]] = now;
    await supabase.from("quote_materials").update(update).eq("id", id);
    setMaterials(prev => prev.map(m => m.id === id ? { ...m, ...update } : m));

    // If all materials are received/staged, flag customer as ready to install
    const updated = materials.map(m => m.id === id ? { ...m, status } : m);
    const allReady = updated.length > 0 && updated.every(m => m.status === "received" || m.status === "staged");
    if (allReady && quote) {
      await supabase.from("customers").update({ next_action: "All materials received — ready to schedule install" }).eq("id", quote.customer_id);
    }
  }

  async function updateMaterialField(id: string, field: string, value: unknown) {
    await supabase.from("quote_materials").update({ [field]: value }).eq("id", id);
    setMaterials(prev => prev.map(m => m.id === id ? { ...m, [field]: value } : m));
  }

  async function deleteMaterial(id: string) {
    await supabase.from("quote_materials").delete().eq("id", id);
    setMaterials(prev => prev.filter(m => m.id !== id));
  }

  // ── Purchase Order generation ────────────────────────────────

  function generatePurchaseOrder(vendor?: string) {
    if (!quote || !customer || lines.length === 0) return;

    // Group lines by product for the PO
    const poLines = lines.map(l => ({
      product: l.product_name,
      room: l.room_name || "",
      window: l.window_label || "",
      width: l.width || "",
      height: l.height || "",
      mount: l.mount_type || "",
      motorized: l.is_motorized,
      cost: l.cost,
      motorCost: l.is_motorized ? l.motor_cost : 0,
      notes: l.notes || "",
    }));

    const custName = [customer.first_name, customer.last_name].filter(Boolean).join(" ");
    const poDate = new Date().toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
    const poNumber = `PO-${quote.id.slice(0, 8).toUpperCase()}`;
    const totalCost = lines.reduce((s, l) => s + l.cost + (l.is_motorized ? l.motor_cost : 0), 0);

    // Build a clean HTML PO for printing
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Purchase Order ${poNumber}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, sans-serif; font-size: 12px; color: #222; padding: 24px; max-width: 800px; margin: 0 auto; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #222; }
  .header h1 { font-size: 22px; }
  .header .meta { text-align: right; font-size: 11px; line-height: 1.6; }
  .meta strong { display: block; font-size: 14px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
  .info-box { background: #f9f9f9; padding: 12px; border-radius: 6px; }
  .info-box .label { font-size: 10px; text-transform: uppercase; color: #888; font-weight: 600; margin-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th { background: #f3f3f3; text-align: left; padding: 8px 10px; font-size: 11px; text-transform: uppercase; color: #555; border-bottom: 1px solid #ddd; }
  td { padding: 7px 10px; border-bottom: 1px solid #eee; font-size: 12px; }
  tr:last-child td { border-bottom: none; }
  .totals { text-align: right; margin-top: 12px; padding-top: 12px; border-top: 2px solid #222; }
  .totals .line { display: flex; justify-content: flex-end; gap: 24px; margin-bottom: 4px; }
  .totals .grand { font-size: 16px; font-weight: bold; }
  .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #ddd; font-size: 10px; color: #888; }
  .notes-box { margin-top: 20px; padding: 12px; border: 1px dashed #ccc; border-radius: 6px; min-height: 60px; }
  .notes-box .label { font-size: 10px; text-transform: uppercase; color: #888; font-weight: 600; margin-bottom: 6px; }
  @media print { body { padding: 0; } }
</style></head><body>
<div class="header">
  <div>
    <h1>PURCHASE ORDER</h1>
    <div style="color:#666; margin-top:4px">${compSettings.name}</div>
    ${compSettings.phone ? `<div style="color:#888; font-size:11px">${compSettings.phone}</div>` : ""}
  </div>
  <div class="meta">
    <strong>${poNumber}</strong>
    Date: ${poDate}<br>
    Quote: ${quote.title || "Untitled"}
  </div>
</div>

<div class="info-grid">
  <div class="info-box">
    <div class="label">Ship To / Job Site</div>
    <strong>${custName}</strong><br>
    ${customer.phone || ""}<br>
    ${customer.email || ""}
  </div>
  <div class="info-box">
    <div class="label">Vendor</div>
    <strong>${vendor || "________________"}</strong><br>
    <br>
    <span style="color:#888">Account #: ________________</span>
  </div>
</div>

<table>
  <thead>
    <tr>
      <th>#</th>
      <th>Product</th>
      <th>Room / Window</th>
      <th>Size</th>
      <th>Mount</th>
      <th>Motor</th>
      <th style="text-align:right">Cost</th>
    </tr>
  </thead>
  <tbody>
    ${poLines.map((l, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${l.product}</strong>${l.notes ? `<br><span style="color:#888;font-size:10px">${l.notes}</span>` : ""}</td>
      <td>${[l.room, l.window].filter(Boolean).join(" / ")}</td>
      <td>${l.width && l.height ? `${l.width}" × ${l.height}"` : "—"}</td>
      <td>${l.mount || "—"}</td>
      <td>${l.motorized ? "Yes" : "—"}</td>
      <td style="text-align:right">$${(l.cost + l.motorCost).toFixed(2)}</td>
    </tr>`).join("")}
  </tbody>
</table>

<div class="totals">
  <div class="line"><span>Items:</span><span>${lines.length}</span></div>
  <div class="line grand"><span>Total Cost:</span><span>$${totalCost.toFixed(2)}</span></div>
</div>

<div class="notes-box">
  <div class="label">Special Instructions / Notes</div>
  ${quote.notes || "<span style='color:#ccc'>None</span>"}
</div>

<div class="footer">
  Generated by ${compSettings.name} • ${poDate} • ${poNumber}
</div>

<script>window.onload = function() { window.print(); }</script>
</body></html>`;

    const win = window.open("", "_blank");
    if (win) {
      win.document.write(html);
      win.document.close();
    }
  }

  // ── Package tracking functions ─────────────────────────────

  async function loadPackages(materialId: string) {
    const { data } = await supabase.from("material_packages")
      .select("*").eq("material_id", materialId).order("created_at");
    setPackages(prev => ({ ...prev, [materialId]: (data || []) as MaterialPackage[] }));
  }

  async function toggleMaterialExpand(materialId: string) {
    if (expandedMat === materialId) {
      setExpandedMat(null);
    } else {
      setExpandedMat(materialId);
      if (!packages[materialId]) await loadPackages(materialId);
    }
  }

  async function addPackage(materialId: string) {
    const mat = materials.find(m => m.id === materialId);
    const existingPkgs = packages[materialId] || [];
    const { data } = await supabase.from("material_packages").insert([{
      material_id: materialId, status: "pending",
      tracking_number: pkgTracking.trim() || null,
      description: pkgDesc.trim() || `Package ${existingPkgs.length + 1}`,
    }]).select("*").single();
    if (data) {
      setPackages(prev => ({ ...prev, [materialId]: [...(prev[materialId] || []), data as MaterialPackage] }));
      // Update expected count
      const newCount = (existingPkgs.length + 1);
      if (!mat?.expected_packages || newCount > mat.expected_packages) {
        await updateMaterialField(materialId, "expected_packages", newCount);
      }
    }
    setPkgTracking(""); setPkgDesc(""); setAddingPkg(null);
  }

  async function checkInPackage(materialId: string, packageId: string, location?: string) {
    const now = new Date().toISOString();
    await supabase.from("material_packages").update({
      status: "received", received_at: now, received_by: user?.id || "User",
      checked_in_at: now, storage_location: location || null,
    }).eq("id", packageId);

    setPackages(prev => ({
      ...prev,
      [materialId]: (prev[materialId] || []).map(p =>
        p.id === packageId ? { ...p, status: "received", received_at: now, storage_location: location || null, checked_in_at: now } : p
      ),
    }));

    // Update received count on material
    const mat = materials.find(m => m.id === materialId);
    const newReceivedCount = (mat?.received_packages || 0) + 1;
    await updateMaterialField(materialId, "received_packages", newReceivedCount);

    // If location set, also update parent material storage_location
    if (location) {
      await supabase.from("quote_materials").update({ storage_location: location }).eq("id", materialId);
      setMaterials(prev => prev.map(m => m.id === materialId ? { ...m, storage_location: location } : m));
    }

    // Check if all packages received
    const updatedPkgs = (packages[materialId] || []).map(p =>
      p.id === packageId ? { ...p, status: "received" } : p
    );
    const allPkgsReceived = updatedPkgs.length > 0 && updatedPkgs.every(p => p.status === "received");
    if (allPkgsReceived) {
      await updateMaterialStatus(materialId, "received");
    }
  }

  async function checkInAllPackages(materialId: string, location?: string) {
    const now = new Date().toISOString();
    const matPkgs = packages[materialId] || [];
    const pending = matPkgs.filter(p => p.status !== "received");
    if (pending.length === 0) return;

    // Batch update all pending packages
    for (const pkg of pending) {
      await supabase.from("material_packages").update({
        status: "received", received_at: now, received_by: user?.id || "User",
        checked_in_at: now, storage_location: location || null,
      }).eq("id", pkg.id);
    }

    setPackages(prev => ({
      ...prev,
      [materialId]: (prev[materialId] || []).map(p =>
        p.status !== "received" ? { ...p, status: "received", received_at: now, storage_location: location || null, checked_in_at: now } : p
      ),
    }));

    const totalPkgs = matPkgs.length;
    await updateMaterialField(materialId, "received_packages", totalPkgs);
    await updateMaterialStatus(materialId, "received");
    if (location) {
      await supabase.from("quote_materials").update({ storage_location: location }).eq("id", materialId);
      setMaterials(prev => prev.map(m => m.id === materialId ? { ...m, storage_location: location } : m));
    }
  }

  async function stageForInstall(materialId: string) {
    const now = new Date().toISOString();
    await supabase.from("quote_materials").update({
      status: "staged", staged_at: now, staged_by: user?.id || null,
    }).eq("id", materialId);
    setMaterials(prev => prev.map(m =>
      m.id === materialId ? { ...m, status: "staged", staged_at: now } : m
    ));
  }

  async function stageAllMaterials() {
    const now = new Date().toISOString();
    const receivedMats = materials.filter(m => m.status === "received");
    for (const mat of receivedMats) {
      await supabase.from("quote_materials").update({
        status: "staged", staged_at: now, staged_by: user?.id || null,
      }).eq("id", mat.id);
    }
    setMaterials(prev => prev.map(m =>
      m.status === "received" ? { ...m, status: "staged", staged_at: now } : m
    ));
  }

  async function updatePackageLocation(materialId: string, packageId: string, location: string) {
    await supabase.from("material_packages").update({ storage_location: location }).eq("id", packageId);
    setPackages(prev => ({
      ...prev,
      [materialId]: (prev[materialId] || []).map(p =>
        p.id === packageId ? { ...p, storage_location: location } : p
      ),
    }));
  }

  async function undoCheckIn(materialId: string, packageId: string) {
    await supabase.from("material_packages").update({
      status: "pending", received_at: null, received_by: null,
      checked_in_at: null, storage_location: null,
    }).eq("id", packageId);

    setPackages(prev => ({
      ...prev,
      [materialId]: (prev[materialId] || []).map(p =>
        p.id === packageId ? { ...p, status: "pending", received_at: null, storage_location: null } : p
      ),
    }));

    const mat = materials.find(m => m.id === materialId);
    const newReceivedCount = Math.max(0, (mat?.received_packages || 1) - 1);
    await updateMaterialField(materialId, "received_packages", newReceivedCount);
  }

  // ── Order PDF upload ──────────────────────────────────────
  async function handleOrderPdfUpload(materialId: string, file: File) {
    setUploadingPdf(materialId);
    try {
      // Upload PDF to Supabase storage
      const fileName = `orders/${quoteId}/${materialId}/${Date.now()}-${file.name}`;
      await supabase.storage.from("window-photos").upload(fileName, file, { upsert: true });

      // Read PDF text client-side for matching (basic approach: read as text)
      // For real PDF parsing, the API route with pdf-parse handles it.
      // For now, store the path and send to our parsing API
      const formData = new FormData();
      formData.append("file", file);
      formData.append("materialId", materialId);

      // Try server-side parsing first
      let pdfText = "";
      try {
        const resp = await fetch("/api/parse-order-pdf", { method: "POST", body: formData });
        if (resp.ok) {
          const result = await resp.json();
          pdfText = result.text || "";
          // If parsing extracted order info, auto-fill fields
          if (result.orderNumber) {
            await updateMaterialField(materialId, "order_number", result.orderNumber);
          }
          if (result.expectedPackages) {
            await updateMaterialField(materialId, "expected_packages", result.expectedPackages);
            // Create package slots
            const pkgInserts = Array.from({ length: result.expectedPackages }, (_, i) => ({
              material_id: materialId, status: "pending",
              description: result.packageDescriptions?.[i] || `Package ${i + 1} of ${result.expectedPackages}`,
            }));
            const { data: pkgs } = await supabase.from("material_packages").insert(pkgInserts).select("*");
            if (pkgs) setPackages(prev => ({ ...prev, [materialId]: [...(prev[materialId] || []), ...(pkgs as MaterialPackage[])] }));
          }
          if (result.eta) {
            await updateMaterialField(materialId, "eta", result.eta);
          }
          if (result.vendor) {
            await updateMaterialField(materialId, "vendor", result.vendor);
          }
        }
      } catch {
        // Parsing API not available yet — just store the file path
      }

      // Save PDF path and extracted text
      await supabase.from("quote_materials").update({
        order_pdf_path: fileName,
        order_pdf_text: pdfText.slice(0, 5000),
        status: "ordered",
        ordered_at: new Date().toISOString(),
      }).eq("id", materialId);

      setMaterials(prev => prev.map(m => m.id === materialId ? {
        ...m, order_pdf_path: fileName, order_pdf_text: pdfText.slice(0, 5000),
        status: "ordered", ordered_at: new Date().toISOString(),
      } : m));

      // Log activity
      if (quote) {
        await supabase.from("activity_log").insert([{
          customer_id: quote.customer_id, type: "note",
          notes: `📄 Order confirmation PDF uploaded for ${materials.find(m => m.id === materialId)?.description || "material"}`,
          created_by: "ZeroRemake",
        }]);
      }
    } catch (err) {
      console.error("PDF upload error:", err);
    }
    setUploadingPdf(null);
    load();
  }

  // ── Render ────────────────────────────────────────────────────

  if (loading) return (
    <main style={{ background: "var(--zr-black)", minHeight: "100vh", padding: "24px" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <div className="zr-skeleton" style={{ width: "30%", height: "20px", borderRadius: "var(--zr-radius-sm)", marginBottom: "16px" }} />
        <div className="zr-skeleton" style={{ width: "100%", height: "180px", borderRadius: "var(--zr-radius-md)", marginBottom: "12px" }} />
        <div className="zr-skeleton" style={{ width: "100%", height: "100px", borderRadius: "var(--zr-radius-md)" }} />
      </div>
    </main>
  );
  if (!quote) return (
    <main style={{ background: "var(--zr-black)", minHeight: "100vh", padding: "48px 24px", textAlign: "center" }}>
      <div style={{ fontSize: "32px", marginBottom: "8px" }}>📝</div>
      <p style={{ color: "var(--zr-text-primary)", fontWeight: 600, fontSize: "15px" }}>Quote not found</p>
      <p style={{ color: "var(--zr-text-secondary)", fontSize: "13px", marginTop: "4px" }}>This quote may have been deleted or you don't have access.</p>
    </main>
  );

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
    <PermissionGate require={["create_quotes", "view_pricing"]}>
      <main className="min-h-screen p-4 text-sm pb-16" style={{ background: "var(--zr-black)", color: "var(--zr-text-primary)" }}>
        <div className="mx-auto max-w-3xl space-y-4">

        <div className="flex items-center justify-between">
          <Link href={`/customers/${quote.customer_id}`} className="text-sm hover:underline" style={{ color: "var(--zr-orange)" }}>
            ← Back to {customerName}
          </Link>
          <a href={`/quotes/${quoteId}/print`} target="_blank" rel="noreferrer"
            className="text-xs rounded px-2.5 py-1.5" style={{ border: "1px solid var(--zr-border)", color: "var(--zr-text-secondary)", background: "transparent" }}>
            🖨 Print / PDF
          </a>
        </div>

        {/* New quote banner */}
        {isNew && lines.length === 0 && (
          <div className="rounded-lg text-white px-4 py-3 space-y-2" style={{ background: "var(--zr-orange)" }}>
            <div className="font-bold text-lg">📋 New Quote</div>
            {quote.linked_measure_id ? (
              <>
                <div className="text-sm opacity-90">A measure job is linked. Pull the windows to build your line items:</div>
                <button
                  onClick={() => pullFromMeasure(quote.linked_measure_id!)}
                  disabled={pulling}
                  className="w-full rounded font-semibold py-2 text-sm disabled:opacity-50"
                  style={{ background: "#fff", color: "var(--zr-orange)" }}>
                  {pulling ? "Pulling windows…" : "📐 Pull Windows from Measure →"}
                </button>
              </>
            ) : measureJobs.length > 0 ? (
              <>
                <div className="text-sm opacity-90">Link a measure job to pull in all the windows:</div>
                <button onClick={() => setShowLinkMeasure(true)}
                  className="w-full rounded font-semibold py-2 text-sm"
                  style={{ background: "#fff", color: "var(--zr-orange)" }}>
                  📐 Select Measure Job →
                </button>
              </>
            ) : (
              <>
                <div className="text-sm opacity-90">No measure job yet — use ⚡ Quick Add to build this quote from scratch.</div>
              </>
            )}
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

        {/* Signed banner */}
        {quote.signed_at && quote.signed_name && (
          <div className="rounded border border-green-300 bg-green-50 px-3 py-2 flex items-center gap-2">
            <span className="text-green-600 text-lg">✍</span>
            <div>
              <div className="text-xs font-semibold text-green-800">Signed by {quote.signed_name}</div>
              <div className="text-xs text-green-600">{new Date(quote.signed_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</div>
            </div>
          </div>
        )}

        {/* Schedule Measure Prompt — appears after quote sent & measure auto-created */}
        {showSchedulePrompt && autoMeasureJobId && (
          <div className="rounded-lg border-2 border-blue-400 bg-blue-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-bold text-blue-800">📋 Measure Job Created</div>
                <div className="text-xs text-blue-600 mt-1">
                  A measure job has been created with all {lines.length} window{lines.length !== 1 ? "s" : ""} from this quote.
                  Schedule the measure appointment now?
                </div>
              </div>
              <button onClick={() => setShowSchedulePrompt(false)}
                className="text-blue-400 hover:text-blue-600 text-lg leading-none shrink-0">×</button>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={() => router.push(`/measure-jobs/${autoMeasureJobId}`)}
                className="text-xs px-4 py-2 rounded font-semibold text-white"
                style={{ background: "var(--zr-primary)" }}>
                Open Measure Job →
              </button>
              <Link href="/schedule"
                className="text-xs px-4 py-2 rounded font-semibold border border-blue-400 text-blue-700 hover:bg-blue-100 no-underline">
                Go to Schedule
              </Link>
              <button onClick={() => setShowSchedulePrompt(false)}
                className="text-xs px-3 py-2 rounded text-blue-500 hover:text-blue-700">
                Later
              </button>
            </div>
            <div className="text-xs text-blue-400 mt-2">
              A reminder task has been created for tomorrow if you don't schedule now.
            </div>
          </div>
        )}

        {/* Get signature button */}
        {quote.status !== "rejected" && !quote.signed_at && lines.length > 0 && (
          <button onClick={() => setShowSignature(true)}
            className="w-full rounded border border-blue-400 text-blue-700 py-2.5 text-sm font-medium hover:bg-blue-50">
            ✍ Get Customer Signature
          </button>
        )}

        {/* Expiry warning */}
        {(() => {
          if (quote.status === "approved" || quote.status === "rejected") return null;
          const expiry = quote.expires_at
            ? new Date(quote.expires_at)
            : (() => { const d = new Date(quote.created_at); d.setDate(d.getDate() + (quote.valid_days || 30)); return d; })();
          const daysLeft = Math.ceil((expiry.getTime() - Date.now()) / 86400000);
          if (daysLeft > 7) return null;
          return (
            <div className={`rounded px-3 py-2 text-xs font-medium ${daysLeft <= 0 ? "bg-red-50 border border-red-200 text-red-700" : "bg-amber-50 border border-amber-200 text-amber-700"}`}>
              {daysLeft <= 0 ? "⚠ Quote expired" : `⚠ Expires in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}`}
              {" — "}
              {expiry.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </div>
          );
        })()}

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
              <button onClick={() => { loadTemplateList(); setShowLoadTemplate(true); }}
                className="rounded border px-2.5 py-1 text-xs hover:bg-gray-50 text-gray-600">
                📄 Template
              </button>
              <button onClick={() => setShowLinkMeasure(true)}
                className="rounded border px-2.5 py-1 text-xs hover:bg-gray-50 text-gray-600">
                📐 Measure
              </button>
              <button onClick={() => setShowQuickAdd(v => !v)}
                className={`rounded border px-2.5 py-1 text-xs ${showQuickAdd ? "bg-black text-white" : "hover:bg-gray-50 text-gray-600"}`}>
                ⚡ Quick Add
              </button>
              <button onClick={() => setShowAddLine(true)}
                className="rounded border px-2.5 py-1 text-xs hover:bg-gray-50 text-gray-600">
                + Custom
              </button>
            </div>
          </div>

          {/* Quick-add product grid */}
          {showQuickAdd && products.length > 0 && (
            <div className="border-b px-3 py-2 bg-gray-50">
              <div className="text-xs text-gray-500 mb-2 font-medium">Tap to add instantly:</div>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {products.map(p => (
                  <button key={p.id} onClick={() => quickAddProduct(p)}
                    className="rounded border bg-white px-2 py-2 text-left hover:bg-blue-50 hover:border-blue-300 transition-colors">
                    <div className="text-xs font-medium truncate">{p.name}</div>
                    <div className="text-xs text-green-600 font-semibold">{fmtMoney(p.default_cost * p.default_multiplier)}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {lines.length === 0 ? (
            <div className="px-3 py-8 text-center text-gray-400 text-xs">
              No line items yet. Use ⚡ Quick Add, pull from a measure job, or add a custom line.
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

        {/* Save as template */}
        {lines.length > 0 && (
          <div className="text-right">
            <button onClick={() => setShowSaveTemplate(true)}
              className="text-xs text-gray-400 hover:text-gray-600 hover:underline">
              💾 Save as Template
            </button>
          </div>
        )}

        {/* Notes */}
        <div className="rounded border p-3">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Notes</div>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} onBlur={saveNotes}
            rows={3} placeholder="Special instructions, color choices, lead times…"
            className="w-full border rounded px-2 py-1.5 text-sm" />
        </div>

        {/* ── PAYMENTS ── */}
        {quote.status === "approved" && (
          <div className="rounded border p-4 space-y-3">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Payments</div>
            {/* Deposit */}
            <div className="rounded bg-gray-50 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Deposit</span>
                {quote.deposit_paid
                  ? <span className="text-xs rounded px-2 py-0.5 bg-green-100 text-green-700 font-medium">✓ Paid {new Date(quote.deposit_paid_at!).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                  : <span className="text-xs text-amber-600 font-medium">Pending</span>
                }
              </div>
              {!quote.deposit_paid && (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Deposit %</span>
                    <input type="number" min="0" max="100" value={depositPct} onChange={e => setDepositPct(e.target.value)}
                      className="w-16 border rounded px-2 py-1 text-xs text-center" />
                    <span className="text-xs text-gray-500">= <strong>{fmtMoney((quote.total || 0) * (parseFloat(depositPct) / 100))}</strong></span>
                  </div>
                  <div className="flex gap-2">
                    <select value={payMethod} onChange={e => setPayMethod(e.target.value)} className="border rounded px-2 py-1 text-xs flex-1">
                      {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
                    </select>
                    <button onClick={markDepositPaid} className="bg-green-600 text-white rounded px-3 py-1 text-xs font-medium">Mark Paid</button>
                  </div>
                </>
              )}
              {quote.deposit_paid && !quote.balance_paid && (
                <div className="text-xs text-gray-500">{fmtMoney(quote.deposit_amount || 0)} received · Balance due: <strong>{fmtMoney((quote.total || 0) - (quote.deposit_amount || 0))}</strong></div>
              )}
            </div>
            {/* Balance */}
            {quote.deposit_paid && (
              <div className="rounded bg-gray-50 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Balance</span>
                  {quote.balance_paid
                    ? <span className="text-xs rounded px-2 py-0.5 bg-green-100 text-green-700 font-medium">✓ Paid {new Date(quote.balance_paid_at!).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                    : <span className="text-xs text-amber-600 font-medium">{fmtMoney((quote.total || 0) - (quote.deposit_amount || 0))} due</span>
                  }
                </div>
                {!quote.balance_paid && (
                  <div className="flex gap-2">
                    <select value={payMethod} onChange={e => setPayMethod(e.target.value)} className="border rounded px-2 py-1 text-xs flex-1">
                      {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
                    </select>
                    <button onClick={markBalancePaid} className="bg-green-600 text-white rounded px-3 py-1 text-xs font-medium">Mark Paid</button>
                  </div>
                )}
                {quote.balance_paid && <div className="text-xs text-green-600 font-medium">✓ Fully paid</div>}
              </div>
            )}
          </div>
        )}

        {/* ── CONVERT TO INSTALL JOB ── */}
        {quote.status === "approved" && !quote.install_job_id && (
          <div className="rounded border border-green-200 bg-green-50 p-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-green-800">Ready to install?</div>
              <div className="text-xs text-green-600">Creates an install job with all windows from this quote. Checklist and packing list included.</div>
            </div>
            <button onClick={convertToInstallJob} disabled={saving}
              className="shrink-0 rounded bg-green-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-50 hover:bg-green-800">
              {saving ? "Creating…" : "Create Install Job →"}
            </button>
          </div>
        )}

        {quote.install_job_id && (
          <Link href={`/measure-jobs/${quote.install_job_id}`}
            className="block rounded border border-green-200 bg-green-50 p-3 text-sm text-green-700 hover:bg-green-100">
            ✓ Install job created — <span className="font-medium underline">View Install Job →</span>
          </Link>
        )}

        {/* ── JOB MATERIALS CHECKLIST ── */}
        {quote.status === "approved" && lines.length > 0 && materials.length > 0 && (
          <div className="rounded border">
            <button
              onClick={() => setShowChecklist(!showChecklist)}
              className="w-full flex items-center justify-between px-3 py-2 border-b hover:bg-gray-50 text-left">
              <div className="font-semibold text-sm flex items-center gap-2">
                Job Materials Checklist
                {(() => {
                  const allReceived = materials.length > 0 && materials.every(m => m.status === "received" || m.status === "staged");
                  const total = lines.length;
                  const matched = lines.filter(l => materials.some(m => m.description.includes(l.product_name))).length;
                  return (
                    <span className={`text-xs font-normal ${allReceived ? "text-green-600" : "text-gray-400"}`}>
                      {allReceived ? "All received" : `${matched}/${total} items tracked`}
                    </span>
                  );
                })()}
              </div>
              <span className="text-xs text-gray-400">{showChecklist ? "▾" : "▸"}</span>
            </button>
            {showChecklist && (
              <div className="text-xs">
                {/* Header row */}
                <div className="grid grid-cols-[1fr_80px_80px_90px_80px_70px] gap-1 px-3 py-1.5 bg-gray-100 border-b font-semibold text-gray-500">
                  <span>Product</span>
                  <span>Measured</span>
                  <span>Quoted</span>
                  <span>Order Status</span>
                  <span>Location</span>
                  <span>Match</span>
                </div>
                {/* One row per quote line, matched against materials */}
                {lines.map(line => {
                  const matchedMat = materials.find(m =>
                    m.description.includes(line.product_name) ||
                    (line.room_name && m.description.includes(line.room_name))
                  );
                  const matStatus = matchedMat ? (MATERIAL_STATUSES.find(s => s.value === matchedMat.status) || MATERIAL_STATUSES[0]) : null;
                  const isReceived = matchedMat?.status === "received" || matchedMat?.status === "staged";
                  const isMismatch = false; // Could add size comparison later

                  return (
                    <div key={line.id}
                      className={`grid grid-cols-[1fr_80px_80px_90px_80px_70px] gap-1 px-3 py-1.5 border-b items-center ${isReceived ? "bg-green-50" : ""}`}>
                      <div className="truncate">
                        <span className="font-medium">{line.product_name}</span>
                        {line.room_name && <span className="text-gray-400 ml-1">({line.room_name}{line.window_label ? ` - ${line.window_label}` : ""})</span>}
                      </div>
                      <div className="text-gray-600">
                        {line.width && line.height ? `${line.width}" × ${line.height}"` : "—"}
                      </div>
                      <div className="text-gray-600">
                        {line.mount_type || "—"}
                        {line.is_motorized && <span className="text-amber-600 ml-0.5">⚡</span>}
                      </div>
                      <div>
                        {matchedMat ? (
                          <span className={`rounded px-1.5 py-0.5 ${matStatus?.color}`}>{matStatus?.label}</span>
                        ) : (
                          <span className="text-gray-300">Not tracked</span>
                        )}
                      </div>
                      <div className="text-purple-600 truncate">
                        {matchedMat?.storage_location || "—"}
                      </div>
                      <div>
                        {matchedMat ? (
                          isReceived ? (
                            <span className="text-green-600 font-medium">✓ OK</span>
                          ) : isMismatch ? (
                            <span className="text-red-600 font-medium">⚠ Check</span>
                          ) : (
                            <span className="text-amber-600">Pending</span>
                          )
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {/* Summary footer */}
                <div className="px-3 py-2 bg-gray-50 flex items-center justify-between">
                  <div className="text-gray-500">
                    {lines.length} items quoted &middot;{" "}
                    {materials.filter(m => m.status === "received" || m.status === "staged").length}/{materials.length} materials received
                  </div>
                  {materials.length > 0 && materials.every(m => m.status === "received" || m.status === "staged") && (
                    <span className="text-green-600 font-semibold">Ready for install</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── MATERIALS ── */}
        {(quote.status === "approved" || materials.length > 0) && (
          <div className="rounded border">
            <div className="flex items-center justify-between px-3 py-2 border-b">
              <div className="font-semibold text-sm">
                Materials & Orders
                {materials.length > 0 && (
                  <span className="ml-2 text-xs font-normal text-gray-400">
                    {materials.filter(m => m.status === "received" || m.status === "staged").length}/{materials.length} received
                  </span>
                )}
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => generatePurchaseOrder()} className="text-xs border rounded px-2 py-1 hover:bg-gray-50">📄 Generate PO</button>
                <button onClick={() => setShowAddMat(true)} className="text-xs border rounded px-2 py-1 hover:bg-gray-50">+ Add Item</button>
              </div>
            </div>
            {/* Ready to install / stage banner */}
            {materials.length > 0 && materials.every(m => m.status === "received" || m.status === "staged") && (
              <div className="px-3 py-2 bg-green-50 border-b text-xs text-green-700 font-semibold flex items-center justify-between">
                <span>✓ All materials received — ready to schedule install</span>
                {materials.some(m => m.status === "received") && (
                  <button onClick={stageAllMaterials}
                    className="bg-emerald-600 text-white rounded px-2 py-0.5 text-xs hover:bg-emerald-700">
                    Stage All for Install
                  </button>
                )}
              </div>
            )}
            {materials.length > 0 && materials.every(m => m.status === "staged") && (
              <div className="px-3 py-2 bg-emerald-50 border-b text-xs text-emerald-700 font-semibold">
                ✓ All materials staged and ready to load
              </div>
            )}
            {materials.length === 0 ? (
              <div className="px-3 py-4 text-center space-y-2">
                <div className="text-xs text-gray-400">No materials tracked yet.</div>
                {lines.length > 0 && (
                  <button
                    onClick={async () => {
                      const seen = new Set<string>();
                      const toAdd = lines.filter(l => {
                        if (seen.has(l.product_name)) return false;
                        seen.add(l.product_name); return true;
                      });
                      const inserts = toAdd.map(l => ({
                        quote_id: quoteId,
                        description: `${l.product_name}${l.is_motorized ? " + Motorization" : ""} (${lines.filter(x => x.product_name === l.product_name).length}x)`,
                        status: "not_ordered",
                        received_packages: 0,
                      }));
                      if (inserts.length > 0) {
                        const { data } = await supabase.from("quote_materials").insert(inserts).select("*");
                        if (data) setMaterials(data as Material[]);
                      }
                    }}
                    className="text-xs bg-black text-white rounded px-3 py-1.5 hover:bg-gray-800">
                    ⚡ Generate from Quote Lines
                  </button>
                )}
                <div className="text-xs text-gray-300">or add items manually above</div>
              </div>
            ) : (
              <ul>
                {materials.map(m => {
                  const statusInfo = MATERIAL_STATUSES.find(s => s.value === m.status) ?? MATERIAL_STATUSES[0];
                  const isExpanded = expandedMat === m.id;
                  const matPkgs = packages[m.id] || [];
                  const receivedPkgs = matPkgs.filter(p => p.status === "received").length;
                  const totalPkgs = m.expected_packages || matPkgs.length;
                  const hasPkgs = totalPkgs > 0;

                  return (
                    <li key={m.id} className="border-b last:border-0">
                      <div className="px-3 py-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              {hasPkgs && (
                                <button onClick={() => toggleMaterialExpand(m.id)}
                                  className="text-xs text-gray-400 hover:text-black shrink-0">
                                  {isExpanded ? "▾" : "▸"}
                                </button>
                              )}
                              <span className="text-sm font-medium truncate">{m.description}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              {m.vendor && <span className="text-xs text-gray-400">{m.vendor}</span>}
                              {m.order_number && <span className="text-xs text-gray-400">#{m.order_number}</span>}
                              {m.eta && <span className="text-xs text-amber-600">ETA: {m.eta}</span>}
                              {m.tracking_number && (
                                <a href={`https://www.google.com/search?q=${encodeURIComponent(m.tracking_number)}`} target="_blank" rel="noreferrer"
                                  className="text-xs text-blue-600 hover:underline">Track {m.tracking_number}</a>
                              )}
                              {m.storage_location && (
                                <span className="text-xs text-purple-600">📍 {m.storage_location}</span>
                              )}
                              {m.order_pdf_path && (
                                <span className="text-xs text-green-600">📄 PDF uploaded</span>
                              )}
                            </div>
                            {/* Package progress bar */}
                            {hasPkgs && (
                              <div className="mt-1.5">
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                    <div className="h-full rounded-full transition-all duration-300"
                                      style={{
                                        width: `${totalPkgs > 0 ? (receivedPkgs / totalPkgs) * 100 : 0}%`,
                                        backgroundColor: receivedPkgs === totalPkgs ? "#22c55e" : "#f59e0b",
                                      }} />
                                  </div>
                                  <span className="text-xs text-gray-500 shrink-0">
                                    {receivedPkgs}/{totalPkgs} pkgs
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {/* PDF upload button */}
                            {!m.order_pdf_path && (
                              <label className="text-xs text-blue-600 hover:underline cursor-pointer">
                                📄
                                <input type="file" accept=".pdf" className="hidden"
                                  onChange={e => { if (e.target.files?.[0]) handleOrderPdfUpload(m.id, e.target.files[0]); }}
                                  disabled={uploadingPdf === m.id} />
                              </label>
                            )}
                            <select value={m.status} onChange={e => updateMaterialStatus(m.id, e.target.value)}
                              className={`text-xs rounded px-1.5 py-0.5 border-0 font-medium ${statusInfo.color}`}>
                              {MATERIAL_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                            </select>
                            <button onClick={() => deleteMaterial(m.id)} className="text-xs text-gray-300 hover:text-red-400 ml-1">✕</button>
                          </div>
                        </div>

                        {/* Inline: set expected packages if none set */}
                        {!hasPkgs && m.status !== "not_ordered" && (
                          <div className="mt-2 flex items-center gap-2">
                            <span className="text-xs text-gray-400">Expected packages:</span>
                            <input type="number" min="1" max="100" placeholder="#"
                              className="w-14 border rounded px-1.5 py-0.5 text-xs"
                              onKeyDown={async (e) => {
                                if (e.key === "Enter") {
                                  const val = parseInt((e.target as HTMLInputElement).value);
                                  if (val > 0) {
                                    await updateMaterialField(m.id, "expected_packages", val);
                                    // Create package slots
                                    const pkgInserts = Array.from({ length: val }, (_, i) => ({
                                      material_id: m.id, status: "pending",
                                      description: `Package ${i + 1} of ${val}`,
                                    }));
                                    const { data: pkgs } = await supabase.from("material_packages").insert(pkgInserts).select("*");
                                    if (pkgs) setPackages(prev => ({ ...prev, [m.id]: pkgs as MaterialPackage[] }));
                                    setExpandedMat(m.id);
                                  }
                                }
                              }}
                            />
                            <span className="text-xs text-gray-300">press Enter</span>
                          </div>
                        )}
                      </div>

                      {/* Expanded package list */}
                      {isExpanded && (
                        <div className="bg-gray-50 border-t px-3 py-2 space-y-1.5">
                          {/* Batch actions */}
                          {matPkgs.length > 0 && matPkgs.some(p => p.status !== "received") && (
                            <div className="flex items-center gap-2 pb-1 border-b border-gray-200 mb-1">
                              <button onClick={() => checkInAllPackages(m.id, m.storage_location || undefined)}
                                className="bg-green-600 text-white rounded px-2.5 py-1 text-xs hover:bg-green-700">
                                Check In All ({matPkgs.filter(p => p.status !== "received").length} pending)
                              </button>
                              <select
                                value={m.storage_location || ""}
                                onChange={e => {
                                  const loc = e.target.value;
                                  supabase.from("quote_materials").update({ storage_location: loc || null }).eq("id", m.id);
                                  setMaterials(prev => prev.map(mm => mm.id === m.id ? { ...mm, storage_location: loc || null } : mm));
                                }}
                                className="text-xs border rounded px-1.5 py-1"
                                style={{ color: m.storage_location ? "#16a34a" : "#9ca3af" }}>
                                <option value="">Storage location...</option>
                                {STORAGE_LOCATIONS.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                              </select>
                            </div>
                          )}
                          {/* Stage button for received materials */}
                          {m.status === "received" && (
                            <div className="flex items-center gap-2 pb-1 border-b border-gray-200 mb-1">
                              <button onClick={() => stageForInstall(m.id)}
                                className="bg-emerald-600 text-white rounded px-2.5 py-1 text-xs hover:bg-emerald-700">
                                Stage for Install
                              </button>
                              {m.storage_location && (
                                <span className="text-xs text-gray-500">Located: {m.storage_location}</span>
                              )}
                            </div>
                          )}
                          {m.status === "staged" && m.staged_at && (
                            <div className="text-xs text-emerald-600 font-medium pb-1 border-b border-gray-200 mb-1">
                              Staged {new Date(m.staged_at).toLocaleDateString()}
                              {m.storage_location && <span className="text-gray-500 ml-2">from {m.storage_location}</span>}
                            </div>
                          )}
                          {matPkgs.length === 0 && (
                            <div className="text-xs text-gray-400 text-center py-2">No packages tracked yet.</div>
                          )}
                          {matPkgs.map(pkg => (
                            <div key={pkg.id} className={`rounded px-2 py-1.5 text-xs ${pkg.status === "received" ? "bg-green-50" : "bg-white border"}`}>
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  {pkg.status === "received" ? (
                                    <span className="text-green-600 shrink-0">✓</span>
                                  ) : (
                                    <span className="text-gray-300 shrink-0">○</span>
                                  )}
                                  <span className={`truncate ${pkg.status === "received" ? "text-green-700" : ""}`}>
                                    {pkg.description || "Package"}
                                  </span>
                                  {pkg.tracking_number && (
                                    <a href={`https://www.google.com/search?q=${encodeURIComponent(pkg.tracking_number)}`}
                                      target="_blank" rel="noreferrer"
                                      className="text-blue-500 hover:underline shrink-0">
                                      {pkg.tracking_number}
                                    </a>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {pkg.status === "received" ? (
                                    <>
                                      {pkg.storage_location && (
                                        <span className="text-gray-400">{pkg.storage_location}</span>
                                      )}
                                      {pkg.received_at && (
                                        <span className="text-gray-400">
                                          {new Date(pkg.received_at).toLocaleDateString()}
                                        </span>
                                      )}
                                      <button onClick={() => undoCheckIn(m.id, pkg.id)}
                                        className="text-gray-400 hover:text-red-500">Undo</button>
                                    </>
                                  ) : (
                                    <button onClick={() => checkInPackage(m.id, pkg.id, m.storage_location || undefined)}
                                      className="bg-green-600 text-white rounded px-2 py-0.5 hover:bg-green-700">
                                      Check In
                                    </button>
                                  )}
                                </div>
                              </div>
                              {/* Location selector for received packages */}
                              {pkg.status === "received" && !pkg.storage_location && (
                                <div className="mt-1 ml-5">
                                  <select
                                    onChange={e => updatePackageLocation(m.id, pkg.id, e.target.value)}
                                    className="text-xs border rounded px-1 py-0.5 text-gray-400"
                                    defaultValue="">
                                    <option value="" disabled>Set location...</option>
                                    {STORAGE_LOCATIONS.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                                  </select>
                                </div>
                              )}
                            </div>
                          ))}
                          {/* Add package */}
                          {addingPkg === m.id ? (
                            <div className="flex items-center gap-1.5 pt-1">
                              <input value={pkgTracking} onChange={e => setPkgTracking(e.target.value)}
                                placeholder="Tracking # (opt)" className="flex-1 border rounded px-2 py-1 text-xs" />
                              <input value={pkgDesc} onChange={e => setPkgDesc(e.target.value)}
                                placeholder="Description (opt)" className="flex-1 border rounded px-2 py-1 text-xs" />
                              <button onClick={() => addPackage(m.id)}
                                className="bg-black text-white rounded px-2 py-1 text-xs shrink-0">Add</button>
                              <button onClick={() => setAddingPkg(null)}
                                className="text-xs text-gray-400 shrink-0">✕</button>
                            </div>
                          ) : (
                            <button onClick={() => setAddingPkg(m.id)}
                              className="text-xs text-blue-600 hover:underline pt-1">+ Add package</button>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {/* Send */}
        <div className="rounded border p-3 space-y-2">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Send Quote</div>
          {/* Customer approval link */}
          <div className="rounded bg-blue-50 border border-blue-200 px-3 py-2 space-y-1.5">
            <div className="text-xs text-blue-700 font-medium">📲 Customer Approval Link</div>
            <div className="text-xs text-blue-600 font-mono break-all">
              {typeof window !== "undefined" ? `${window.location.origin}/q/${quoteId}` : `/q/${quoteId}`}
            </div>
            <a
              href={`sms:${customer?.phone ? customer.phone.replace(/\D/g,"") : ""}${/iPhone|iPad|iPod/i.test(typeof navigator !== "undefined" ? navigator.userAgent : "") ? "&" : "?"}body=${encodeURIComponent(`Hi ${customerName.split(" ")[0]}! Your quote from ${typeof window !== "undefined" ? new URL(window.location.href).hostname : "us"} is ready. View and approve here: ${typeof window !== "undefined" ? window.location.origin : ""}/q/${quoteId}`)}`}
              className="flex items-center gap-1.5 text-xs text-blue-700 font-medium hover:underline">
              💬 Text link to customer →
            </a>
          </div>
          <a href={`sms:${customer?.phone ? customer.phone.replace(/\D/g,"") : ""}${/iPhone|iPad|iPod/i.test(typeof navigator !== "undefined" ? navigator.userAgent : "") ? "&" : "?"}body=${encodeURIComponent(smsSummary)}`}
            className="flex items-center gap-2 w-full rounded border border-green-500 text-green-700 px-3 py-2 text-sm hover:bg-green-50">
            💬 Send via Text {customer?.phone ? `(${customer.phone})` : ""}
          </a>
          <a href={`mailto:${customer?.email ?? ""}?subject=${encodeURIComponent(`Your Quote — ${title || "ZeroRemake"}`)}&body=${encodeURIComponent(emailBody)}`}
            className="flex items-center gap-2 w-full rounded border px-3 py-2 text-sm hover:bg-gray-50">
            📧 Send via Email App {customer?.email ? `(${customer.email})` : ""}
          </a>
          {customer?.email && (
            <button
              disabled={emailSending || emailSentQuote}
              onClick={async () => {
                const ok = await sendEmailApi({
                  type: "quote_delivery",
                  to: customer.email!,
                  companyId: companyId || "",
                  companyName: compSettings.name,
                  companyPhone: compSettings.phone || undefined,
                  customerId: quote.customer_id,
                  quoteId: quoteId,
                  customerFirstName: customerName.split(" ")[0],
                  quoteNumber: quoteId.slice(0, 8).toUpperCase(),
                  totalAmount: fmtMoney(total),
                  validDays: quote.valid_days || 30,
                });
                if (ok) {
                  setEmailSentQuote(true);
                  // Auto-mark as sent if still draft
                  if (quote.status === "draft") {
                    await supabase.from("quotes").update({ status: "sent" }).eq("id", quoteId);
                    setQuote({ ...quote, status: "sent" });
                    await supabase.from("activity_log").insert([{ customer_id: quote.customer_id, type: "email", notes: `Quote emailed to ${customer.email}. Total: ${fmtMoney(total)}`, created_by: "ZeroRemake" }]);
                  }
                }
              }}
              className={`flex items-center gap-2 w-full rounded border px-3 py-2 text-sm ${
                emailSentQuote ? "border-green-500 text-green-700 bg-green-50" : "border-orange-500 text-orange-700 hover:bg-orange-50"
              }`}
            >
              {emailSentQuote ? "✓ Branded Email Sent" : emailSending ? "Sending…" : `📧 Send Branded Email to ${customer.email}`}
            </button>
          )}
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

      {/* ── SAVE TEMPLATE MODAL ── */}
      {showSaveTemplate && (
        <Modal title="Save as Template" onClose={() => setShowSaveTemplate(false)}>
          <div className="space-y-3">
            <p className="text-sm text-gray-500">Name this template to reuse it on future quotes.</p>
            <input value={templateName} onChange={e => setTemplateName(e.target.value)}
              placeholder='e.g. "Standard Package", "Builder Spec"'
              className="w-full border rounded px-2 py-1.5 text-sm" autoFocus />
            <div className="flex gap-2">
              <button onClick={saveAsTemplate} disabled={savingTemplate || !templateName.trim()}
                className="flex-1 bg-black text-white rounded py-2 text-sm disabled:opacity-40">
                {savingTemplate ? "Saving…" : "Save Template"}
              </button>
              <button onClick={() => setShowSaveTemplate(false)} className="border rounded py-2 px-4 text-sm">Cancel</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── LOAD TEMPLATE MODAL ── */}
      {showLoadTemplate && (
        <Modal title="Load Template" onClose={() => setShowLoadTemplate(false)}>
          <div className="space-y-3">
            <p className="text-sm text-gray-500">Loading a template replaces all current line items.</p>
            {templates.length === 0 ? (
              <p className="text-sm text-gray-400">No templates saved yet. Build a quote and tap "Save as Template."</p>
            ) : (
              <ul className="space-y-2">
                {templates.map(t => (
                  <li key={t.id}>
                    <button onClick={() => loadFromTemplate(t.id)}
                      className="w-full text-left rounded border p-3 hover:bg-gray-50 text-sm font-medium">
                      📄 {t.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Modal>
      )}

      {/* ── SIGNATURE MODAL ── */}
      {showSignature && (
        <Modal title="Customer Signature" onClose={() => setShowSignature(false)}>
          <div className="space-y-3">
            <div className="rounded bg-gray-50 p-3 text-xs text-gray-600 space-y-1">
              <div className="font-medium text-gray-800">{quote.title ?? "Quote"}</div>
              <div>Total: <strong>{fmtMoney(total)}</strong></div>
              <div>Customer: <strong>{customerName}</strong></div>
            </div>

            {/* Signature canvas */}
            <div>
              <div className="text-xs text-gray-500 mb-1 font-medium">Sign below:</div>
              <SignatureCanvas onSave={saveSignature} saving={savingSig}
                signedName={signedName} setSignedName={setSignedName}
                agreed={signAgreed} setAgreed={setSignAgreed} />
            </div>
          </div>
        </Modal>
      )}

      {/* ── ADD MATERIAL MODAL ── */}
      {showAddMat && (
        <Modal title="Add Material Item" onClose={() => setShowAddMat(false)}>
          <form onSubmit={addMaterial} className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Description *</label>
              <input value={matDesc} onChange={e => setMatDesc(e.target.value)} required
                placeholder="e.g. Roller shades (12 units) — Hunter Douglas"
                className="w-full border rounded px-2 py-1.5 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Vendor</label>
                <input value={matVendor} onChange={e => setMatVendor(e.target.value)}
                  placeholder="e.g. Hunter Douglas"
                  className="w-full border rounded px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Order #</label>
                <input value={matOrderNum} onChange={e => setMatOrderNum(e.target.value)}
                  placeholder="PO or order number"
                  className="w-full border rounded px-2 py-1.5 text-sm" />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Expected Packages</label>
              <input type="number" min="0" value={matExpPkgs} onChange={e => setMatExpPkgs(e.target.value)}
                placeholder="How many boxes/packages will arrive?"
                className="w-full border rounded px-2 py-1.5 text-sm" />
              <p className="text-xs text-gray-300 mt-0.5">Leave blank if unknown — you can add packages later</p>
            </div>
            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={savingMat}
                className="flex-1 bg-black text-white rounded py-2 text-sm disabled:opacity-50">
                {savingMat ? "Saving…" : "Add Item"}
              </button>
              <button type="button" onClick={() => setShowAddMat(false)}
                className="border rounded py-2 px-4 text-sm">Cancel</button>
            </div>
          </form>
        </Modal>
      )}
    </main>
    </PermissionGate>
  );
}

// ── Signature Canvas ──────────────────────────────────────────

function SignatureCanvas({ onSave, saving, signedName, setSignedName, agreed, setAgreed }: {
  onSave: (canvas: HTMLCanvasElement) => void;
  saving: boolean;
  signedName: string;
  setSignedName: (v: string) => void;
  agreed: boolean;
  setAgreed: (v: boolean) => void;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const drawing   = React.useRef(false);
  const [hasStrokes, setHasStrokes] = React.useState(false);

  function getPos(e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    const src  = "touches" in e ? e.touches[0] : e;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current; if (!canvas) return;
    e.preventDefault();
    drawing.current = true;
    const ctx = canvas.getContext("2d")!;
    const pos = getPos(e, canvas);
    ctx.beginPath(); ctx.moveTo(pos.x, pos.y);
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing.current) return;
    const canvas = canvasRef.current; if (!canvas) return;
    e.preventDefault();
    const ctx = canvas.getContext("2d")!;
    ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.strokeStyle = "#111";
    const pos = getPos(e, canvas);
    ctx.lineTo(pos.x, pos.y); ctx.stroke();
    setHasStrokes(true);
  }

  function stopDraw() { drawing.current = false; }

  function clear() {
    const canvas = canvasRef.current; if (!canvas) return;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    setHasStrokes(false);
  }

  return (
    <div className="space-y-3">
      <canvas
        ref={canvasRef} width={400} height={150}
        className="w-full border-2 border-dashed border-gray-300 rounded bg-white touch-none"
        style={{ height: 150 }}
        onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
        onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw}
      />
      <div className="flex justify-end">
        <button onClick={clear} className="text-xs text-gray-400 hover:text-gray-600">Clear</button>
      </div>
      <div>
        <label className="text-xs text-gray-500 block mb-1">Type your full name to confirm *</label>
        <input value={signedName} onChange={e => setSignedName(e.target.value)}
          placeholder="John Smith"
          className="w-full border rounded px-2 py-1.5 text-sm" />
      </div>
      <label className="flex items-start gap-2 text-xs text-gray-600 cursor-pointer">
        <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0" />
        I agree to proceed with this quote and authorize the work described.
      </label>
      <button
        onClick={() => { if (canvasRef.current) onSave(canvasRef.current); }}
        disabled={saving || !hasStrokes || !signedName.trim() || !agreed}
        className="w-full bg-green-600 text-white rounded py-2.5 text-sm font-semibold disabled:opacity-40">
        {saving ? "Saving…" : "✓ Sign & Approve Quote"}
      </button>
    </div>
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

