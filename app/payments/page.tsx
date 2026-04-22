"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../auth-provider";
import { FeatureGate } from "../feature-gate";
import { PermissionGate } from "../permission-gate";
import { Skeleton, EmptyState } from "../ui";

// ── Types ──────────────────────────────────────────────────────
type PaymentQuote = {
  id: string;
  customer_id: string;
  customer_name: string;
  title: string | null;
  total: number;
  deposit_amount: number;
  deposit_paid: boolean;
  deposit_paid_at: string | null;
  balance_paid: boolean;
  balance_paid_at: string | null;
  payment_method: string | null;
  created_at: string;
};

type Invoice = {
  id: string;
  invoice_number: string;
  customer_id: string;
  customer_name: string;
  quote_id: string | null;
  type: "deposit" | "balance" | "full" | "custom";
  status: "draft" | "sent" | "partial" | "paid" | "overdue" | "void";
  subtotal: number;
  tax_pct: number;
  tax_amount: number;
  total: number;
  amount_paid: number;
  amount_due: number;
  due_date: string | null;
  sent_at: string | null;
  paid_at: string | null;
  voided_at: string | null;
  public_token: string | null;
  created_at: string;
};

type ApprovedQuote = {
  id: string;
  customer_id: string;
  customer_name: string;
  title: string | null;
  total: number;
  subtotal: number;
  tax_pct: number;
  tax_amount: number;
  deposit_pct: number;
  deposit_amount: number;
  cost_total: number;
  created_at: string;
};

// ── Helpers ────────────────────────────────────────────────────
function fmtMoney(n: number) {
  return "$" + (n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function daysSince(dateStr: string) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function getStatusBadge(status: string) {
  const badges: Record<string, { bg: string; text: string }> = {
    draft: { bg: "bg-gray-100", text: "text-gray-700" },
    sent: { bg: "bg-blue-100", text: "text-blue-700" },
    partial: { bg: "bg-amber-100", text: "text-amber-700" },
    paid: { bg: "bg-green-100", text: "text-green-700" },
    overdue: { bg: "bg-red-100", text: "text-red-700" },
    void: { bg: "bg-gray-100", text: "text-gray-500" },
  };
  const badge = badges[status] || badges.draft;
  return badge;
}

// ── Create Invoice Modal ───────────────────────────────────────
function CreateInvoiceModal({ open, onClose, onCreated }: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { companyId } = useAuth();
  const [quotes, setQuotes] = useState<ApprovedQuote[]>([]);
  const [selectedQuote, setSelectedQuote] = useState<string>("");
  const [invoiceType, setInvoiceType] = useState<"deposit" | "balance" | "full">("full");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (open) {
      loadQuotes();
    }
  }, [open]);

  async function loadQuotes() {
    const { data } = await supabase
      .from("quotes")
      .select("id, customer_id, title, total, subtotal, tax_pct, tax_amount, deposit_pct, deposit_amount, cost_total, created_at")
      .eq("status", "approved")
      .order("created_at", { ascending: false });

    if (!data) return;

    const custIds = [...new Set(data.map((q: any) => q.customer_id as string))];
    const { data: custs } = await supabase.from("customers").select("id, first_name, last_name").in("id", custIds);
    const custMap: Record<string, string> = {};
    (custs || []).forEach((c: any) => {
      custMap[c.id] = [c.first_name, c.last_name].filter(Boolean).join(" ");
    });

    setQuotes(data.map((q: any) => ({ ...q, customer_name: custMap[q.customer_id] ?? "Unknown" })));
  }

  async function createInvoice() {
    if (!selectedQuote) return;
    setCreating(true);

    try {
      const quote = quotes.find(q => q.id === selectedQuote);
      if (!quote) return;

      // Get company settings for invoice numbering
      const { data: settings } = await supabase
        .from("company_settings")
        .select("invoice_prefix, next_invoice_number")
        .single();

      const prefix = settings?.invoice_prefix || "INV";
      const nextNum = settings?.next_invoice_number || 1;
      const invoiceNumber = `${prefix}-${String(nextNum).padStart(4, "0")}`;

      // Determine amounts based on invoice type
      let subtotal = quote.subtotal;
      let tax = quote.tax_amount;
      let total = quote.total;

      if (invoiceType === "deposit") {
        subtotal = quote.deposit_amount;
        tax = (quote.deposit_amount * (quote.tax_pct || 0)) / 100;
        total = subtotal + tax;
      } else if (invoiceType === "balance") {
        subtotal = Math.max(0, quote.total - quote.deposit_amount);
        tax = (subtotal * (quote.tax_pct || 0)) / 100;
        total = subtotal + tax;
      }

      // Get default payment terms
      const { data: defTerms } = await supabase
        .from("company_settings")
        .select("default_payment_terms_days")
        .single();
      const termsDays = defTerms?.default_payment_terms_days || 30;
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + termsDays);

      // Create invoice
      const { data: invoice, error: invErr } = await supabase
        .from("invoices")
        .insert({
          quote_id: selectedQuote,
          customer_id: quote.customer_id,
          invoice_number: invoiceNumber,
          type: invoiceType,
          subtotal,
          tax_pct: quote.tax_pct || 0,
          tax_amount: tax,
          total,
          amount_paid: 0,
          status: "draft",
          due_date: dueDate.toISOString(),
        })
        .select()
        .single();

      if (invErr) throw invErr;

      // Copy line items from quote
      const { data: lineItems } = await supabase
        .from("quote_line_items")
        .select("room_name, window_label, product_name, width, height, mount_type, retail, is_motorized, motor_retail, sort_order")
        .eq("quote_id", selectedQuote);

      if (lineItems && lineItems.length > 0) {
        const itemsToInsert = lineItems.map((item: any) => {
          const description = [item.product_name, item.width && item.height ? `${item.width}" x ${item.height}"` : null]
            .filter(Boolean)
            .join(" • ");
          const totalPrice = (item.retail || 0) + (item.is_motorized ? item.motor_retail || 0 : 0);
          return {
            invoice_id: invoice.id,
            description,
            quantity: 1,
            unit_price: totalPrice,
            total: totalPrice,
            sort_order: item.sort_order,
          };
        });

        await supabase.from("invoice_line_items").insert(itemsToInsert);
      }

      // Increment next invoice number
      await supabase
        .from("company_settings")
        .update({ next_invoice_number: nextNum + 1 })
        .eq("company_id", companyId);

      onCreated();
      onClose();
      setSelectedQuote("");
      setInvoiceType("full");
    } catch (err) {
      console.error("Error creating invoice:", err);
    } finally {
      setCreating(false);
    }
  }

  if (!open) return null;

  return (
    // iOS-sheet-style modal: soft dimmed backdrop, rounded white card with
    // generous padding and breathing room. No borders, subtle shadow only.
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: "rgba(0,0,0,0.35)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}>
      <div style={{
        background: "var(--zr-surface-1)",
        borderRadius: 20,
        width: "100%",
        maxWidth: 380,
        padding: "22px 22px 18px",
        boxShadow: "0 20px 50px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.06)",
      }}>
        <h2 style={{
          fontSize: "19px",
          fontWeight: 700,
          letterSpacing: "-0.02em",
          color: "var(--zr-text-primary)",
          marginBottom: 20,
        }}>Create invoice</h2>

        {/* Select Quote — pill-style select matching the rest of the app */}
        <div className="mb-5">
          <label style={{ fontSize: "12px", color: "rgba(60,60,67,0.55)", fontWeight: 500, letterSpacing: "0.01em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
            Quote
          </label>
          <div className="relative">
            <select
              value={selectedQuote}
              onChange={(e) => setSelectedQuote(e.target.value)}
              style={{
                width: "100%",
                background: "rgba(60,60,67,0.06)",
                color: "var(--zr-text-primary)",
                fontSize: "14px",
                letterSpacing: "-0.012em",
                padding: "10px 34px 10px 14px",
                borderRadius: 12,
                border: "none",
                appearance: "none",
                WebkitAppearance: "none",
                cursor: "pointer",
              }}
            >
              <option value="">Choose a quote</option>
              {quotes.map(q => (
                <option key={q.id} value={q.id}>
                  {q.customer_name} — {q.title || "Untitled"} ({fmtMoney(q.total)})
                </option>
              ))}
            </select>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", color: "var(--zr-text-secondary)", pointerEvents: "none" }}>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
        </div>

        {/* Type — segmented pill control replacing radio buttons */}
        <div className="mb-6">
          <label style={{ fontSize: "12px", color: "rgba(60,60,67,0.55)", fontWeight: 500, letterSpacing: "0.01em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
            Type
          </label>
          <div className="grid grid-cols-3 p-1 rounded-full" style={{ background: "var(--zr-surface-3)" }}>
            {(["deposit", "balance", "full"] as const).map(type => (
              <button
                key={type}
                onClick={() => setInvoiceType(type)}
                className="py-1.5 text-[13px] font-semibold rounded-full transition-all"
                style={invoiceType === type
                  ? { background: "var(--zr-surface-1)", color: "var(--zr-text-primary)", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }
                  : { background: "transparent", color: "var(--zr-text-secondary)" }}>
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Actions — Cancel as plain text, Create as brand primary pill */}
        <div className="flex items-center justify-end gap-5">
          <button
            onClick={onClose}
            style={{
              color: "rgba(60,60,67,0.7)",
              fontSize: "14px",
              fontWeight: 500,
              letterSpacing: "-0.012em",
              padding: "8px 4px",
            }}
            className="transition-opacity active:opacity-60"
          >
            Cancel
          </button>
          <button
            onClick={createInvoice}
            disabled={!selectedQuote || creating}
            className="transition-all active:scale-[0.97]"
            style={{
              background: "var(--zr-orange)",
              color: "#fff",
              fontSize: "14px",
              fontWeight: 600,
              padding: "9px 22px",
              borderRadius: 999,
              letterSpacing: "-0.012em",
              opacity: !selectedQuote || creating ? 0.5 : 1,
              cursor: !selectedQuote || creating ? "not-allowed" : "pointer",
            }}
          >
            {creating ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Invoice Export Dropdown ────────────────────────────────────
function InvoiceExportDropdown({ invoices }: { invoices: Invoice[] }) {
  const [open, setOpen] = useState(false);

  function downloadFile(content: string, filename: string, mime: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const stamp = new Date().toISOString().slice(0, 10);

  function exportCSV() {
    if (invoices.length === 0) { alert("No invoices to export."); return; }
    const headers = [
      "Invoice #","Customer","Type","Status","Subtotal","Tax %","Tax Amount",
      "Total","Amount Paid","Amount Due","Due Date","Created","Sent","Paid",
    ];
    const rows = invoices.map(inv => [
      inv.invoice_number,
      `"${inv.customer_name}"`,
      inv.type,
      inv.status,
      inv.subtotal.toFixed(2),
      (inv.tax_pct || 0).toFixed(1),
      (inv.tax_amount || 0).toFixed(2),
      inv.total.toFixed(2),
      inv.amount_paid.toFixed(2),
      inv.amount_due.toFixed(2),
      inv.due_date ? new Date(inv.due_date).toLocaleDateString() : "",
      new Date(inv.created_at).toLocaleDateString(),
      inv.sent_at ? new Date(inv.sent_at).toLocaleDateString() : "",
      inv.paid_at ? new Date(inv.paid_at).toLocaleDateString() : "",
    ]);

    // Summary
    const outstanding = invoices.filter(i => !["paid","void"].includes(i.status)).reduce((s, i) => s + i.amount_due, 0);
    const collected = invoices.filter(i => i.status === "paid").reduce((s, i) => s + i.total, 0);

    let csv = headers.join(",") + "\n";
    csv += rows.map(r => r.join(",")).join("\n");
    csv += "\n\n--- SUMMARY ---\n";
    csv += `Total Outstanding,${outstanding.toFixed(2)}\n`;
    csv += `Total Collected,${collected.toFixed(2)}\n`;
    csv += `Total Invoices,${invoices.length}\n`;

    downloadFile(csv, `invoices-${stamp}.csv`, "text/csv");
    setOpen(false);
  }

  function exportQBIIF() {
    if (invoices.length === 0) { alert("No invoices to export."); return; }

    const lines: string[] = [];
    lines.push("!TRNS\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tDOCNUM\tMEMO");
    lines.push("!SPL\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tDOCNUM\tMEMO");
    lines.push("!ENDTRNS\t\t\t\t\t\t\t");

    for (const inv of invoices) {
      if (inv.status === "void") continue;
      const dateStr = new Date(inv.created_at).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
      const custName = inv.customer_name.replace(/\t/g, " ");
      const typeLabel = inv.type === "deposit" ? "Deposit Invoice" : inv.type === "balance" ? "Balance Invoice" : "Invoice";

      // Transaction line (debit Accounts Receivable)
      lines.push(`TRNS\tINVOICE\t${dateStr}\tAccounts Receivable\t${custName}\t${inv.total.toFixed(2)}\t${inv.invoice_number}\t${typeLabel}`);

      // Split line (credit Sales/Revenue)
      const subtotal = inv.subtotal || inv.total;
      lines.push(`SPL\tINVOICE\t${dateStr}\tSales:Window Treatments\t${custName}\t${(-subtotal).toFixed(2)}\t${inv.invoice_number}\t${typeLabel}`);

      // Tax split if applicable
      if (inv.tax_amount && inv.tax_amount > 0) {
        lines.push(`SPL\tINVOICE\t${dateStr}\tSales Tax Payable\t${custName}\t${(-inv.tax_amount).toFixed(2)}\t${inv.invoice_number}\tTax`);
      }

      lines.push("ENDTRNS\t\t\t\t\t\t\t");
    }

    // Also export payments as RECEIVE PAYMENT entries
    const paidInvoices = invoices.filter(i => i.amount_paid > 0);
    if (paidInvoices.length > 0) {
      lines.push("");
      for (const inv of paidInvoices) {
        const payDate = inv.paid_at
          ? new Date(inv.paid_at).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" })
          : new Date(inv.created_at).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
        const custName = inv.customer_name.replace(/\t/g, " ");

        lines.push(`TRNS\tPAYMENT\t${payDate}\tUndeposited Funds\t${custName}\t${inv.amount_paid.toFixed(2)}\t${inv.invoice_number}\tPayment received`);
        lines.push(`SPL\tPAYMENT\t${payDate}\tAccounts Receivable\t${custName}\t${(-inv.amount_paid).toFixed(2)}\t${inv.invoice_number}\tPayment received`);
        lines.push("ENDTRNS\t\t\t\t\t\t\t");
      }
    }

    downloadFile(lines.join("\r\n"), `invoices-qb-${stamp}.iif`, "application/x-iif");
    setOpen(false);
  }

  function exportAgingCSV() {
    const outstanding = invoices.filter(i => !["paid","void"].includes(i.status) && i.amount_due > 0);
    if (outstanding.length === 0) { alert("No outstanding invoices."); return; }

    const now = Date.now();
    const buckets = { current: [] as Invoice[], over30: [] as Invoice[], over60: [] as Invoice[], over90: [] as Invoice[] };

    for (const inv of outstanding) {
      const dueMs = inv.due_date ? new Date(inv.due_date).getTime() : new Date(inv.created_at).getTime() + 30 * 86400000;
      const daysOverdue = Math.max(0, Math.floor((now - dueMs) / 86400000));
      if (daysOverdue >= 90) buckets.over90.push(inv);
      else if (daysOverdue >= 60) buckets.over60.push(inv);
      else if (daysOverdue >= 30) buckets.over30.push(inv);
      else buckets.current.push(inv);
    }

    let csv = "ACCOUNTS RECEIVABLE AGING REPORT\n";
    csv += `Generated: ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}\n\n`;
    csv += "Customer,Invoice #,Due Date,Amount Due,Aging Bucket\n";

    function addBucket(label: string, items: Invoice[]) {
      for (const inv of items) {
        csv += `"${inv.customer_name}",${inv.invoice_number},${inv.due_date ? new Date(inv.due_date).toLocaleDateString() : "N/A"},${inv.amount_due.toFixed(2)},${label}\n`;
      }
    }

    addBucket("Current", buckets.current);
    addBucket("30+ Days", buckets.over30);
    addBucket("60+ Days", buckets.over60);
    addBucket("90+ Days", buckets.over90);

    csv += `\n--- AGING SUMMARY ---\n`;
    csv += `Current,${buckets.current.reduce((s, i) => s + i.amount_due, 0).toFixed(2)}\n`;
    csv += `30+ Days,${buckets.over30.reduce((s, i) => s + i.amount_due, 0).toFixed(2)}\n`;
    csv += `60+ Days,${buckets.over60.reduce((s, i) => s + i.amount_due, 0).toFixed(2)}\n`;
    csv += `90+ Days,${buckets.over90.reduce((s, i) => s + i.amount_due, 0).toFixed(2)}\n`;
    csv += `Total Outstanding,${outstanding.reduce((s, i) => s + i.amount_due, 0).toFixed(2)}\n`;

    downloadFile(csv, `ar-aging-${stamp}.csv`, "text/csv");
    setOpen(false);
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)}
        className="text-xs px-3 py-1.5 rounded font-medium flex items-center gap-1.5"
        style={{ background: "var(--zr-surface-2, #f5f5f5)", color: "var(--zr-text-secondary, #666)", border: "1px solid var(--zr-border, #e0e0e0)" }}>
        📤 Export
        <span className="text-[10px]">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border z-40 min-w-[240px]"
            style={{ background: "var(--zr-surface-1, #fff)", border: "1px solid var(--zr-border, #e0e0e0)" }}>
            <div className="p-1.5">
              <button onClick={exportCSV}
                className="w-full text-left px-3 py-2 rounded text-sm hover:bg-gray-50">
                <div className="font-medium" style={{ color: "var(--zr-text-primary, #1a1a1a)" }}>CSV (Excel / Sheets)</div>
                <div className="text-xs mt-0.5" style={{ color: "var(--zr-text-muted, #999)" }}>All invoices with summary totals</div>
              </button>
              <button onClick={exportQBIIF}
                className="w-full text-left px-3 py-2 rounded text-sm hover:bg-gray-50">
                <div className="font-medium" style={{ color: "var(--zr-text-primary, #1a1a1a)" }}>QuickBooks (.iif)</div>
                <div className="text-xs mt-0.5" style={{ color: "var(--zr-text-muted, #999)" }}>Invoices + payments for QB Desktop</div>
              </button>
              <button onClick={exportAgingCSV}
                className="w-full text-left px-3 py-2 rounded text-sm hover:bg-gray-50">
                <div className="font-medium" style={{ color: "var(--zr-text-primary, #1a1a1a)" }}>A/R Aging Report</div>
                <div className="text-xs mt-0.5" style={{ color: "var(--zr-text-muted, #999)" }}>Outstanding invoices by age bucket</div>
              </button>
            </div>
            <div className="border-t px-3 py-2">
              <div className="text-[10px]" style={{ color: "var(--zr-text-muted, #999)" }}>
                {invoices.length} invoices
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Bulk Send Modal ───────────────────────────────────────────
function BulkSendModal({ open, onClose, invoices, onSent }: {
  open: boolean;
  onClose: () => void;
  invoices: Invoice[];
  onSent: () => void;
}) {
  const { companyId } = useAuth();
  const [sendMethod, setSendMethod] = useState<"sms" | "email">("sms");
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<{ name: string; ok: boolean; error?: string }[]>([]);
  const [done, setDone] = useState(false);
  const [customerData, setCustomerData] = useState<Record<string, { phone: string | null; email: string | null }>>({});

  useEffect(() => {
    if (open && invoices.length > 0) {
      loadCustomerContacts();
      setResults([]);
      setDone(false);
    }
  }, [open, invoices]);

  async function loadCustomerContacts() {
    const custIds = [...new Set(invoices.map(i => i.customer_id))];
    const { data } = await supabase.from("customers").select("id, phone, email").in("id", custIds);
    const map: Record<string, { phone: string | null; email: string | null }> = {};
    (data || []).forEach((c: any) => { map[c.id] = { phone: c.phone, email: c.email }; });
    setCustomerData(map);
  }

  async function sendAll() {
    setSending(true);
    const newResults: typeof results = [];
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

    for (const inv of invoices) {
      const contact = customerData[inv.customer_id];
      const invLink = inv.public_token ? `${baseUrl}/i/${inv.public_token}` : `${baseUrl}/invoices/${inv.id}`;
      const msg = `Hi! Your invoice ${inv.invoice_number} for ${fmtMoney(inv.amount_due)} is ready. View it here: ${invLink}`;

      try {
        if (sendMethod === "sms") {
          if (!contact?.phone) {
            newResults.push({ name: inv.customer_name, ok: false, error: "No phone number" });
            continue;
          }
          const res = await fetch("/api/sms", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ to: contact.phone, message: msg, companyId }),
          });
          const data = await res.json();
          if (data.error) {
            newResults.push({ name: inv.customer_name, ok: false, error: data.error });
          } else {
            newResults.push({ name: inv.customer_name, ok: true });
            // Mark invoice as sent
            await supabase.from("invoices").update({ status: inv.status === "draft" ? "sent" : inv.status, sent_at: inv.sent_at || new Date().toISOString() }).eq("id", inv.id);
          }
        } else {
          if (!contact?.email) {
            newResults.push({ name: inv.customer_name, ok: false, error: "No email address" });
            continue;
          }
          const res = await fetch("/api/send-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: contact.email,
              subject: `Invoice ${inv.invoice_number} — ${fmtMoney(inv.amount_due)} Due`,
              html: `<p>Hi,</p><p>Your invoice <strong>${inv.invoice_number}</strong> for <strong>${fmtMoney(inv.amount_due)}</strong> is ready.</p><p><a href="${invLink}" style="background:#f97316;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">View Invoice</a></p><p>Thank you!</p>`,
            }),
          });
          const data = await res.json();
          if (data.error) {
            newResults.push({ name: inv.customer_name, ok: false, error: data.error });
          } else {
            newResults.push({ name: inv.customer_name, ok: true });
            await supabase.from("invoices").update({ status: inv.status === "draft" ? "sent" : inv.status, sent_at: inv.sent_at || new Date().toISOString() }).eq("id", inv.id);
          }
        }
      } catch (err) {
        newResults.push({ name: inv.customer_name, ok: false, error: String(err) });
      }
    }

    setResults(newResults);
    setSending(false);
    setDone(true);
    onSent();
  }

  if (!open) return null;

  const successCount = results.filter(r => r.ok).length;
  const failCount = results.filter(r => !r.ok).length;
  const canSend = invoices.some(inv => {
    const c = customerData[inv.customer_id];
    return sendMethod === "sms" ? !!c?.phone : !!c?.email;
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }} className="rounded-lg max-w-md w-full p-4 space-y-4">
        <h2 className="font-bold text-lg">Send {invoices.length} Invoice{invoices.length !== 1 ? "s" : ""}</h2>

        {!done ? (
          <>
            <div>
              <label className="text-xs font-medium block mb-1.5">Send via</label>
              <div className="flex gap-2">
                <button onClick={() => setSendMethod("sms")}
                  className={`flex-1 rounded p-2 text-sm font-medium border ${sendMethod === "sms" ? "ring-2 ring-orange-400" : ""}`}
                  style={{ background: sendMethod === "sms" ? "rgba(249,115,22,0.1)" : "var(--zr-surface-2)", border: "1px solid var(--zr-border)" }}>
                  📱 Text Message
                </button>
                <button onClick={() => setSendMethod("email")}
                  className={`flex-1 rounded p-2 text-sm font-medium border ${sendMethod === "email" ? "ring-2 ring-orange-400" : ""}`}
                  style={{ background: sendMethod === "email" ? "rgba(249,115,22,0.1)" : "var(--zr-surface-2)", border: "1px solid var(--zr-border)" }}>
                  ✉️ Email
                </button>
              </div>
            </div>

            <div className="max-h-48 overflow-y-auto rounded" style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)" }}>
              {invoices.map(inv => {
                const c = customerData[inv.customer_id];
                const hasContact = sendMethod === "sms" ? !!c?.phone : !!c?.email;
                return (
                  <div key={inv.id} className="flex items-center justify-between px-3 py-2 border-b last:border-0 text-xs" style={{ borderColor: "var(--zr-border)" }}>
                    <div>
                      <div className="font-medium">{inv.customer_name}</div>
                      <div style={{ color: "var(--zr-text-secondary)" }}>{inv.invoice_number} — {fmtMoney(inv.amount_due)}</div>
                    </div>
                    {hasContact ? (
                      <span className="text-green-600 text-xs">Ready</span>
                    ) : (
                      <span className="text-red-500 text-xs">No {sendMethod === "sms" ? "phone" : "email"}</span>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex gap-2 pt-2">
              <button onClick={onClose}
                style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)" }}
                className="flex-1 rounded p-2 text-sm font-medium hover:opacity-80">
                Cancel
              </button>
              <button onClick={sendAll}
                disabled={sending || !canSend}
                style={{ background: "var(--zr-orange)" }}
                className="flex-1 rounded p-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
                {sending ? "Sending…" : `Send All via ${sendMethod === "sms" ? "SMS" : "Email"}`}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="text-center py-4">
              <div className="text-3xl mb-2">{failCount === 0 ? "✅" : "⚠️"}</div>
              <div className="font-semibold">{successCount} sent{failCount > 0 ? `, ${failCount} failed` : ""}</div>
            </div>

            {results.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded text-xs" style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)" }}>
                {results.map((r, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-1.5 border-b last:border-0" style={{ borderColor: "var(--zr-border)" }}>
                    <span>{r.name}</span>
                    {r.ok ? (
                      <span className="text-green-600">Sent</span>
                    ) : (
                      <span className="text-red-500">{r.error}</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            <button onClick={onClose}
              style={{ background: "var(--zr-orange)" }}
              className="w-full rounded p-2 text-sm font-medium text-white hover:opacity-90">
              Done
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────
export default function PaymentsPage() {
  const [activeTab, setActiveTab] = useState<"invoices" | "quotes">("invoices");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [quotes, setQuotes] = useState<PaymentQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkSendOpen, setBulkSendOpen] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    await Promise.all([loadInvoices(), loadQuotes()]);
    setLoading(false);
  }

  async function loadInvoices() {
    const { data } = await supabase
      .from("invoices")
      .select("id, invoice_number, customer_id, quote_id, type, status, subtotal, tax_pct, tax_amount, total, amount_paid, due_date, sent_at, paid_at, voided_at, public_token, created_at")
      .order("created_at", { ascending: false });

    if (!data) return;

    const custIds = [...new Set(data.map((inv: any) => inv.customer_id as string))];
    const { data: custs } = await supabase.from("customers").select("id, first_name, last_name").in("id", custIds);
    const custMap: Record<string, string> = {};
    (custs || []).forEach((c: any) => {
      custMap[c.id] = [c.first_name, c.last_name].filter(Boolean).join(" ");
    });

    const withCustomers = data.map((inv: any) => ({
      ...inv,
      customer_name: custMap[inv.customer_id] ?? "Unknown",
      amount_due: inv.total - inv.amount_paid,
    }));

    setInvoices(withCustomers);
  }

  async function loadQuotes() {
    const { data } = await supabase
      .from("quotes")
      .select("id, customer_id, title, total, deposit_amount, deposit_paid, deposit_paid_at, balance_paid, balance_paid_at, payment_method, created_at")
      .eq("status", "approved")
      .order("created_at", { ascending: false });

    if (!data) return;

    const custIds = [...new Set(data.map((q: any) => q.customer_id as string))];
    const { data: custs } = await supabase.from("customers").select("id, first_name, last_name").in("id", custIds);
    const custMap: Record<string, string> = {};
    (custs || []).forEach((c: any) => {
      custMap[c.id] = [c.first_name, c.last_name].filter(Boolean).join(" ");
    });

    setQuotes(data.map((q: any) => ({
      ...q,
      customer_name: custMap[q.customer_id] ?? "Unknown",
    })));
  }

  // Summary stats
  const totalOutstanding = invoices
    .filter(inv => !["paid", "void"].includes(inv.status))
    .reduce((s, inv) => s + inv.amount_due, 0);

  const totalCollected = invoices
    .filter(inv => inv.status === "paid")
    .reduce((s, inv) => s + inv.total, 0);

  const overdueCount = invoices
    .filter(inv => inv.status === "overdue")
    .length;

  // Quotes summary (legacy)
  const depositPending = quotes.filter(q => !q.deposit_paid);
  const balanceDue = quotes.filter(q => q.deposit_paid && !q.balance_paid);
  const paidInFull = quotes.filter(q => q.balance_paid);

  const legacyTotalOutstanding =
    depositPending.reduce((s, q) => s + (q.total || 0), 0) +
    balanceDue.reduce((s, q) => s + Math.max(0, (q.total || 0) - (q.deposit_amount || 0)), 0);
  const legacyTotalCollected =
    balanceDue.reduce((s, q) => s + (q.deposit_amount || 0), 0) +
    paidInFull.reduce((s, q) => s + (q.total || 0), 0);

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    const sendable = invoices.filter(inv => !["paid", "void"].includes(inv.status) && inv.amount_due > 0);
    if (selectedIds.size === sendable.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sendable.map(inv => inv.id)));
    }
  }

  const selectedInvoices = invoices.filter(inv => selectedIds.has(inv.id));
  const sendableCount = invoices.filter(inv => !["paid", "void"].includes(inv.status) && inv.amount_due > 0).length;

  function InvoiceRow({ inv }: { inv: Invoice }) {
    const isSendable = !["paid", "void"].includes(inv.status) && inv.amount_due > 0;
    const isSelected = selectedIds.has(inv.id);
    return (
      <div className="flex items-center gap-3" style={{ padding: "12px 0" }}>
        {isSendable && (
          <input type="checkbox" checked={isSelected}
            onChange={() => toggleSelect(inv.id)}
            className="h-4 w-4 shrink-0 rounded cursor-pointer" />
        )}
        {!isSendable && <div className="w-4 shrink-0" />}
        <Link href={`/invoices/${inv.id}`}
          className="flex-1 flex items-start justify-between gap-3 transition-opacity active:opacity-60"
          style={{ textDecoration: "none", color: "inherit" }}>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span style={{ fontSize: "16px", fontWeight: 600, color: "var(--zr-text-primary)", letterSpacing: "-0.018em", flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {inv.customer_name}
              </span>
              <span style={{ fontSize: "12.5px", fontWeight: 500, color: inv.status === "overdue" ? "#c6443a" : inv.status === "paid" ? "var(--zr-success)" : "rgba(60,60,67,0.5)", letterSpacing: "-0.003em", flexShrink: 0 }}>
                {inv.status}
              </span>
            </div>
            <div style={{ fontSize: "13px", color: "rgba(60,60,67,0.55)", marginTop: 2, letterSpacing: "-0.005em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {inv.invoice_number}
              {inv.due_date && ` · Due ${new Date(inv.due_date).toLocaleDateString()}`}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div style={{ fontSize: "16px", fontWeight: 600, color: "var(--zr-text-primary)", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.015em" }}>{fmtMoney(inv.amount_due)}</div>
            <div style={{ fontSize: "12px", color: "rgba(60,60,67,0.45)", fontVariantNumeric: "tabular-nums", marginTop: 2 }}>of {fmtMoney(inv.total)}</div>
          </div>
        </Link>
      </div>
    );
  }

  function QuoteRow({ q, section }: { q: PaymentQuote; section: "deposit" | "balance" | "paid" }) {
    const amountDue = section === "deposit" ? q.total : section === "balance" ? Math.max(0, q.total - q.deposit_amount) : 0;
    const days = daysSince(q.created_at);
    const ageColor = days > 14 ? "#c6443a" : days > 7 ? "var(--zr-warning)" : "rgba(60,60,67,0.5)";
    // Amounts due: muted neutral text + a small muted-red dot for overdue, instead of aggressive red.
    const amountColor = "var(--zr-text-primary)";
    return (
      <Link href={`/quotes/${q.id}`}
        className="flex items-start justify-between gap-3 transition-opacity active:opacity-60"
        style={{ padding: "12px 0", textDecoration: "none", color: "inherit" }}>
        <div className="min-w-0 flex-1">
          <div style={{ fontSize: "16px", fontWeight: 600, color: "var(--zr-text-primary)", letterSpacing: "-0.018em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {q.customer_name}
          </div>
          <div style={{ fontSize: "13px", color: "rgba(60,60,67,0.55)", marginTop: 2, letterSpacing: "-0.005em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {q.title ?? "Untitled quote"}
          </div>
          {section !== "paid" && (
            <div style={{ fontSize: "12.5px", color: ageColor, marginTop: 3, fontWeight: 500, letterSpacing: "-0.003em" }}>
              Approved {days}d ago
            </div>
          )}
          {section === "balance" && q.deposit_paid_at && (
            <div style={{ fontSize: "12.5px", color: "rgba(60,60,67,0.45)", marginTop: 3 }}>Deposit paid {daysSince(q.deposit_paid_at)}d ago</div>
          )}
          {section === "paid" && q.balance_paid_at && (
            <div style={{ fontSize: "12.5px", color: "var(--zr-success)", marginTop: 3 }}>Paid in full {daysSince(q.balance_paid_at)}d ago</div>
          )}
        </div>
        <div className="shrink-0 text-right">
          {section !== "paid" ? (
            <>
              <div style={{ fontSize: "16px", fontWeight: 600, color: amountColor, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.015em" }}>{fmtMoney(amountDue)}</div>
              <div style={{ fontSize: "12px", color: "rgba(60,60,67,0.45)", fontVariantNumeric: "tabular-nums", marginTop: 2 }}>of {fmtMoney(q.total)}</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: "16px", fontWeight: 600, color: "var(--zr-success)", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.015em" }}>{fmtMoney(q.total)}</div>
              {q.payment_method && <div style={{ fontSize: "12px", color: "rgba(60,60,67,0.45)", marginTop: 2 }}>{q.payment_method}</div>}
            </>
          )}
        </div>
      </Link>
    );
  }

  return (
    <FeatureGate require="quoting">
      <PermissionGate require="view_financials">
        <main style={{ background: "var(--zr-canvas)", color: "var(--zr-text-primary)" }} className="min-h-screen pt-2 pb-24 text-sm">
          <div className="mx-auto max-w-2xl px-4 sm:px-6">
            {/* iOS back row */}
            <div className="mb-3 flex items-center justify-between">
              <Link href="/" style={{ color: "var(--zr-orange)", display: "inline-flex", alignItems: "center", gap: 2, fontSize: "15px", fontWeight: 400, letterSpacing: "-0.012em" }}
                className="transition-opacity active:opacity-60">
                <svg width="10" height="16" viewBox="0 0 10 16" fill="none" style={{ marginRight: 2 }}>
                  <path d="M8 1 L2 8 L8 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Home
              </Link>
              <InvoiceExportDropdown invoices={invoices} />
            </div>

            <div className="mb-4 px-1">
              <h1 style={{ fontSize: "28px", fontWeight: 700, letterSpacing: "-0.025em", color: "var(--zr-text-primary)" }}>Payments</h1>
            </div>

            {/* Summary — canvas stat row, no cards. Amount + small label
                beneath. Overdue kept as a muted red, not an alarm. */}
            {activeTab === "invoices" && (
              <div className="grid grid-cols-3 mb-5"
                style={{ borderTop: "0.5px solid rgba(60,60,67,0.08)", borderBottom: "0.5px solid rgba(60,60,67,0.08)" }}>
                {[
                  { label: "Outstanding", value: fmtMoney(totalOutstanding), color: "var(--zr-text-primary)" },
                  { label: "Collected",   value: fmtMoney(totalCollected),   color: "var(--zr-success)" },
                  { label: "Overdue",     value: String(overdueCount),       color: overdueCount > 0 ? "#c6443a" : "var(--zr-text-primary)" },
                ].map((c, i) => (
                  <div key={i} style={{
                    padding: "14px 16px",
                    borderRight: i < 2 ? "0.5px solid rgba(60,60,67,0.08)" : "none",
                    textAlign: "center",
                  }}>
                    <div style={{ fontSize: "20px", fontWeight: 700, letterSpacing: "-0.02em", color: c.color, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{c.value}</div>
                    <div style={{ fontSize: "11.5px", color: "rgba(60,60,67,0.55)", fontWeight: 500, letterSpacing: "0.01em", textTransform: "uppercase", marginTop: 6 }}>{c.label}</div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === "quotes" && (
              <div className="grid grid-cols-2 mb-5"
                style={{ borderTop: "0.5px solid rgba(60,60,67,0.08)", borderBottom: "0.5px solid rgba(60,60,67,0.08)" }}>
                {[
                  { label: "Outstanding", value: fmtMoney(legacyTotalOutstanding), color: "var(--zr-text-primary)" },
                  { label: "Collected",   value: fmtMoney(legacyTotalCollected),   color: "var(--zr-success)" },
                ].map((c, i) => (
                  <div key={i} style={{
                    padding: "14px 16px",
                    borderRight: i < 1 ? "0.5px solid rgba(60,60,67,0.08)" : "none",
                    textAlign: "center",
                  }}>
                    <div style={{ fontSize: "20px", fontWeight: 700, letterSpacing: "-0.02em", color: c.color, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{c.value}</div>
                    <div style={{ fontSize: "11.5px", color: "rgba(60,60,67,0.55)", fontWeight: 500, letterSpacing: "0.01em", textTransform: "uppercase", marginTop: 6 }}>{c.label}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Pill segmented tabs matching the rest of the app */}
            <div className="grid grid-cols-2 p-1 rounded-full mb-4" style={{ background: "var(--zr-surface-3)" }}>
              <button onClick={() => setActiveTab("invoices")}
                className="py-1.5 text-[13px] font-semibold rounded-full transition-all"
                style={activeTab === "invoices"
                  ? { background: "var(--zr-surface-1)", color: "var(--zr-text-primary)", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }
                  : { background: "transparent", color: "var(--zr-text-secondary)" }}>
                Invoices
              </button>
              <button onClick={() => setActiveTab("quotes")}
                className="py-1.5 text-[13px] font-semibold rounded-full transition-all"
                style={activeTab === "quotes"
                  ? { background: "var(--zr-surface-1)", color: "var(--zr-text-primary)", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }
                  : { background: "transparent", color: "var(--zr-text-secondary)" }}>
                Quotes (Legacy)
              </button>
            </div>

            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "12px" }}>
                {[1,2,3].map(i => (
                  <div key={i} style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)", borderRadius: "var(--zr-radius-sm)", padding: "12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <Skeleton w="35%" h="14px" />
                      <Skeleton w="60px" h="14px" />
                    </div>
                    <div style={{ height: 6 }} />
                    <Skeleton w="50%" h="10px" />
                  </div>
                ))}
              </div>
            ) : activeTab === "invoices" ? (
              <>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCreateModalOpen(true)}
                    style={{ background: "var(--zr-orange)" }}
                    className="flex-1 rounded p-2 text-sm font-medium text-white hover:opacity-90"
                  >
                    Create Invoice
                  </button>
                  {sendableCount > 0 && (
                    <button
                      onClick={toggleSelectAll}
                      style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-secondary)" }}
                      className="rounded px-3 py-2 text-xs font-medium hover:opacity-80"
                    >
                      {selectedIds.size === sendableCount ? "Deselect All" : "Select All"}
                    </button>
                  )}
                </div>

                {/* Bulk action bar — translucent brand pill, no hard border */}
                {selectedIds.size > 0 && (
                  <div className="flex items-center justify-between mb-3"
                    style={{ background: "rgba(214,90,49,0.08)", borderRadius: 14, padding: "10px 14px" }}>
                    <div style={{ color: "var(--zr-orange)", fontSize: "13.5px", fontWeight: 600, letterSpacing: "-0.012em" }}>
                      {selectedIds.size} selected · {fmtMoney(selectedInvoices.reduce((s, i) => s + i.amount_due, 0))}
                    </div>
                    <div className="flex items-center gap-3">
                      <button onClick={() => setSelectedIds(new Set())}
                        style={{ color: "rgba(60,60,67,0.6)", fontSize: "13px", fontWeight: 500, letterSpacing: "-0.012em" }}
                        className="transition-opacity active:opacity-60">
                        Clear
                      </button>
                      <button onClick={() => setBulkSendOpen(true)}
                        className="transition-all active:scale-[0.97]"
                        style={{
                          background: "var(--zr-orange)",
                          color: "#fff",
                          fontSize: "13px",
                          fontWeight: 600,
                          padding: "5px 12px",
                          borderRadius: 999,
                          letterSpacing: "-0.012em",
                        }}>
                        Send selected
                      </button>
                    </div>
                  </div>
                )}

                {invoices.length === 0 ? (
                  <EmptyState type="invoices" title="No invoices yet" subtitle="Create your first invoice from an approved quote." />
                ) : (
                  <ul>
                    {invoices.map((inv, i, arr) => (
                      <li key={inv.id} style={{ borderBottom: i < arr.length - 1 ? "0.5px solid rgba(60,60,67,0.08)" : "none" }}>
                        <InvoiceRow inv={inv} />
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <>
                {/* Deposit Pending — calm section label with muted red accent */}
                <section className="mb-5">
                  <div className="flex items-baseline gap-2 mb-1 px-5">
                    <span className="zr-v2-section-label" style={{ padding: 0, color: "#b86060" }}>
                      Deposit pending · {depositPending.length}
                    </span>
                    {depositPending.length > 0 && (
                      <span style={{ fontSize: "12px", color: "rgba(60,60,67,0.45)", fontVariantNumeric: "tabular-nums", marginLeft: "auto", paddingBottom: 10 }}>
                        {fmtMoney(depositPending.reduce((s, q) => s + q.total, 0))}
                      </span>
                    )}
                  </div>
                  {depositPending.length === 0 ? (
                    <p className="px-5" style={{ fontSize: "13px", color: "rgba(60,60,67,0.45)" }}>No pending deposits.</p>
                  ) : (
                    <ul>
                      {depositPending.map((q, i, arr) => (
                        <li key={q.id} style={{ borderBottom: i < arr.length - 1 ? "0.5px solid rgba(60,60,67,0.08)" : "none", paddingLeft: 0, paddingRight: 0 }}>
                          <div style={{ padding: "0 20px" }}>
                            <QuoteRow q={q} section="deposit" />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {/* Balance Due — calm section label with muted amber */}
                <section className="mb-5">
                  <div className="flex items-baseline gap-2 mb-1 px-5">
                    <span className="zr-v2-section-label" style={{ padding: 0, color: "#a87008" }}>
                      Balance due · {balanceDue.length}
                    </span>
                    {balanceDue.length > 0 && (
                      <span style={{ fontSize: "12px", color: "rgba(60,60,67,0.45)", fontVariantNumeric: "tabular-nums", marginLeft: "auto", paddingBottom: 10 }}>
                        {fmtMoney(balanceDue.reduce((s, q) => s + Math.max(0, q.total - q.deposit_amount), 0))}
                      </span>
                    )}
                  </div>
                  {balanceDue.length === 0 ? (
                    <p className="px-5" style={{ fontSize: "13px", color: "rgba(60,60,67,0.45)" }}>No balances due.</p>
                  ) : (
                    <ul>
                      {balanceDue.map((q, i, arr) => (
                        <li key={q.id} style={{ borderBottom: i < arr.length - 1 ? "0.5px solid rgba(60,60,67,0.08)" : "none", paddingLeft: 0, paddingRight: 0 }}>
                          <div style={{ padding: "0 20px" }}>
                            <QuoteRow q={q} section="balance" />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {/* Paid in Full */}
                <section>
                  <div className="flex items-center gap-2 mb-2">
                    <h2 className="font-semibold text-green-600">Paid in Full</h2>
                    <span className="text-xs rounded bg-green-100 text-green-700 px-1.5 py-0.5">{paidInFull.length}</span>
                    {paidInFull.length > 0 && (
                      <span className="text-xs text-gray-400 ml-1">
                        {fmtMoney(paidInFull.reduce((s, q) => s + q.total, 0))} collected
                      </span>
                    )}
                  </div>
                  {paidInFull.length === 0 ? (
                    <p className="text-xs text-gray-400">No paid jobs yet.</p>
                  ) : (
                    <ul className="space-y-2">
                      {paidInFull.map(q => (
                        <li key={q.id}>
                          <QuoteRow q={q} section="paid" />
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </>
            )}
          </div>

          <CreateInvoiceModal open={createModalOpen} onClose={() => setCreateModalOpen(false)} onCreated={load} />
          <BulkSendModal
            open={bulkSendOpen}
            onClose={() => { setBulkSendOpen(false); setSelectedIds(new Set()); }}
            invoices={selectedInvoices}
            onSent={load}
          />
        </main>
      </PermissionGate>
    </FeatureGate>
  );
}
