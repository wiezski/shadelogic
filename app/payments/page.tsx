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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }} className="rounded-lg max-w-md w-full p-4 space-y-4">
        <h2 className="font-bold text-lg">Create Invoice</h2>

        <div>
          <label className="text-xs font-medium block mb-1">Select Quote</label>
          <select
            value={selectedQuote}
            onChange={(e) => setSelectedQuote(e.target.value)}
            style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }}
            className="w-full rounded p-2 text-sm"
          >
            <option value="">-- Choose a quote --</option>
            {quotes.map(q => (
              <option key={q.id} value={q.id}>
                {q.customer_name} - {q.title || "Untitled"} ({fmtMoney(q.total)})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-medium block mb-1">Invoice Type</label>
          <div className="space-y-1">
            {["deposit", "balance", "full"].map(type => (
              <label key={type} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="type"
                  value={type}
                  checked={invoiceType === type}
                  onChange={(e) => setInvoiceType(e.target.value as any)}
                />
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </label>
            ))}
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            onClick={onClose}
            style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)" }}
            className="flex-1 rounded p-2 text-sm font-medium hover:opacity-80"
          >
            Cancel
          </button>
          <button
            onClick={createInvoice}
            disabled={!selectedQuote || creating}
            style={{ background: "var(--zr-orange)" }}
            className="flex-1 rounded p-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {creating ? "Creating..." : "Create"}
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
    const badge = getStatusBadge(inv.status);
    const isSendable = !["paid", "void"].includes(inv.status) && inv.amount_due > 0;
    const isSelected = selectedIds.has(inv.id);
    return (
      <div className="flex items-center gap-2">
        {isSendable && (
          <input type="checkbox" checked={isSelected}
            onChange={() => toggleSelect(inv.id)}
            className="h-4 w-4 shrink-0 rounded cursor-pointer" />
        )}
        {!isSendable && <div className="w-4 shrink-0" />}
        <Link
          href={`/invoices/${inv.id}`}
          className="flex-1 flex items-start justify-between rounded border p-3 hover:opacity-80 gap-3"
          style={{
            background: isSelected ? "rgba(249,115,22,0.06)" : "var(--zr-surface-2)",
            border: isSelected ? "1px solid var(--zr-orange)" : "1px solid var(--zr-border)",
          }}
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <div className="font-medium truncate">{inv.customer_name}</div>
              <span className={`text-xs rounded px-1.5 py-0.5 ${badge.bg} ${badge.text}`}>
                {inv.status}
              </span>
            </div>
            <div className="text-xs text-gray-500 truncate">{inv.invoice_number}</div>
            {inv.due_date && (
              <div className="text-xs text-gray-500 mt-0.5">
                Due {new Date(inv.due_date).toLocaleDateString()}
              </div>
            )}
          </div>
          <div className="shrink-0 text-right">
            <div className="font-bold text-sm">{fmtMoney(inv.amount_due)}</div>
            <div className="text-xs text-gray-500">of {fmtMoney(inv.total)}</div>
          </div>
        </Link>
      </div>
    );
  }

  function QuoteRow({ q, section }: { q: PaymentQuote; section: "deposit" | "balance" | "paid" }) {
    const amountDue = section === "deposit" ? q.total : section === "balance" ? Math.max(0, q.total - q.deposit_amount) : 0;
    const days = daysSince(q.created_at);
    return (
      <Link
        href={`/quotes/${q.id}`}
        className="flex items-start justify-between rounded border p-3 hover:bg-gray-50 gap-3"
      >
        <div className="min-w-0">
          <div className="font-medium text-blue-600 truncate">{q.customer_name}</div>
          <div className="text-xs text-gray-500 truncate">{q.title ?? "Untitled Quote"}</div>
          {section !== "paid" && (
            <div className={`text-xs mt-0.5 font-medium ${days > 14 ? "text-red-500" : days > 7 ? "text-amber-600" : "text-gray-400"}`}>
              Approved {days}d ago
            </div>
          )}
          {section === "balance" && q.deposit_paid_at && (
            <div className="text-xs text-gray-400">Deposit paid {daysSince(q.deposit_paid_at)}d ago</div>
          )}
          {section === "paid" && q.balance_paid_at && (
            <div className="text-xs text-green-600">Paid in full {daysSince(q.balance_paid_at)}d ago</div>
          )}
        </div>
        <div className="shrink-0 text-right">
          {section !== "paid" ? (
            <>
              <div className={`font-bold text-sm ${section === "deposit" ? "text-red-600" : "text-amber-600"}`}>
                {fmtMoney(amountDue)}
              </div>
              <div className="text-xs text-gray-400">of {fmtMoney(q.total)}</div>
            </>
          ) : (
            <>
              <div className="font-bold text-sm text-green-600">{fmtMoney(q.total)}</div>
              {q.payment_method && <div className="text-xs text-gray-400">{q.payment_method}</div>}
            </>
          )}
        </div>
      </Link>
    );
  }

  return (
    <FeatureGate require="quoting">
      <PermissionGate require="view_financials">
        <main style={{ background: "var(--zr-black)", color: "var(--zr-text-primary)" }} className="min-h-screen p-4 text-sm">
          <div className="mx-auto max-w-2xl space-y-5">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-bold">Payments & Invoices</h1>
              <InvoiceExportDropdown invoices={invoices} />
            </div>

            {/* Summary */}
            {activeTab === "invoices" && (
              <div className="grid grid-cols-3 gap-3">
                <div style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }} className="rounded p-3 text-center">
                  <div className="text-2xl font-bold text-red-500">{fmtMoney(totalOutstanding)}</div>
                  <div className="text-xs text-gray-500 mt-0.5">Outstanding</div>
                </div>
                <div style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }} className="rounded p-3 text-center">
                  <div className="text-2xl font-bold text-green-600">{fmtMoney(totalCollected)}</div>
                  <div className="text-xs text-gray-500 mt-0.5">Collected</div>
                </div>
                <div style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }} className="rounded p-3 text-center">
                  <div className="text-2xl font-bold text-red-600">{overdueCount}</div>
                  <div className="text-xs text-gray-500 mt-0.5">Overdue</div>
                </div>
              </div>
            )}

            {activeTab === "quotes" && (
              <div className="grid grid-cols-2 gap-3">
                <div style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }} className="rounded p-3 text-center">
                  <div className="text-2xl font-bold text-red-500">{fmtMoney(legacyTotalOutstanding)}</div>
                  <div className="text-xs text-gray-500 mt-0.5">Outstanding</div>
                </div>
                <div style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }} className="rounded p-3 text-center">
                  <div className="text-2xl font-bold text-green-600">{fmtMoney(legacyTotalCollected)}</div>
                  <div className="text-xs text-gray-500 mt-0.5">Collected</div>
                </div>
              </div>
            )}

            {/* Tabs */}
            <div className="flex gap-2 border-b" style={{ borderColor: "var(--zr-border)" }}>
              <button
                onClick={() => setActiveTab("invoices")}
                className={`px-3 py-2 text-sm font-medium border-b-2 ${
                  activeTab === "invoices"
                    ? "border-orange-500 text-orange-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
                style={{
                  borderBottomColor: activeTab === "invoices" ? "var(--zr-orange)" : "transparent",
                  color: activeTab === "invoices" ? "var(--zr-orange)" : "var(--zr-text-secondary)",
                }}
              >
                Invoices
              </button>
              <button
                onClick={() => setActiveTab("quotes")}
                className={`px-3 py-2 text-sm font-medium border-b-2 ${
                  activeTab === "quotes"
                    ? "border-orange-500 text-orange-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
                style={{
                  borderBottomColor: activeTab === "quotes" ? "var(--zr-orange)" : "transparent",
                  color: activeTab === "quotes" ? "var(--zr-orange)" : "var(--zr-text-secondary)",
                }}
              >
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

                {/* Bulk action bar */}
                {selectedIds.size > 0 && (
                  <div className="flex items-center justify-between rounded-lg px-4 py-2.5" style={{ background: "rgba(249,115,22,0.1)", border: "1px solid var(--zr-orange)" }}>
                    <div className="text-sm font-medium" style={{ color: "var(--zr-orange)" }}>
                      {selectedIds.size} invoice{selectedIds.size !== 1 ? "s" : ""} selected — {fmtMoney(selectedInvoices.reduce((s, i) => s + i.amount_due, 0))} total
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setSelectedIds(new Set())}
                        className="text-xs px-2 py-1 rounded" style={{ color: "var(--zr-text-secondary)" }}>
                        Clear
                      </button>
                      <button onClick={() => setBulkSendOpen(true)}
                        style={{ background: "var(--zr-orange)" }}
                        className="rounded px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">
                        Send Selected
                      </button>
                    </div>
                  </div>
                )}

                {invoices.length === 0 ? (
                  <EmptyState type="invoices" title="No invoices yet" subtitle="Create your first invoice from an approved quote." />
                ) : (
                  <ul className="space-y-2">
                    {invoices.map(inv => (
                      <li key={inv.id}>
                        <InvoiceRow inv={inv} />
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <>
                {/* Deposit Pending */}
                <section>
                  <div className="flex items-center gap-2 mb-2">
                    <h2 className="font-semibold text-red-600">Deposit Pending</h2>
                    <span className="text-xs rounded bg-red-100 text-red-700 px-1.5 py-0.5">{depositPending.length}</span>
                    {depositPending.length > 0 && (
                      <span className="text-xs text-gray-400 ml-1">{fmtMoney(depositPending.reduce((s, q) => s + q.total, 0))} total</span>
                    )}
                  </div>
                  {depositPending.length === 0 ? (
                    <p className="text-xs text-gray-400">No pending deposits.</p>
                  ) : (
                    <ul className="space-y-2">
                      {depositPending.map(q => (
                        <li key={q.id}>
                          <QuoteRow q={q} section="deposit" />
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {/* Balance Due */}
                <section>
                  <div className="flex items-center gap-2 mb-2">
                    <h2 className="font-semibold text-amber-600">Balance Due</h2>
                    <span className="text-xs rounded bg-amber-100 text-amber-700 px-1.5 py-0.5">{balanceDue.length}</span>
                    {balanceDue.length > 0 && (
                      <span className="text-xs text-gray-400 ml-1">
                        {fmtMoney(balanceDue.reduce((s, q) => s + Math.max(0, q.total - q.deposit_amount), 0))} due
                      </span>
                    )}
                  </div>
                  {balanceDue.length === 0 ? (
                    <p className="text-xs text-gray-400">No balances due.</p>
                  ) : (
                    <ul className="space-y-2">
                      {balanceDue.map(q => (
                        <li key={q.id}>
                          <QuoteRow q={q} section="balance" />
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
