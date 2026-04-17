"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../auth-provider";
import { FeatureGate } from "../feature-gate";
import { PermissionGate } from "../permission-gate";

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

// ── Main Page ──────────────────────────────────────────────────
export default function PaymentsPage() {
  const [activeTab, setActiveTab] = useState<"invoices" | "quotes">("invoices");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [quotes, setQuotes] = useState<PaymentQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);

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
      .select("id, invoice_number, customer_id, quote_id, type, status, subtotal, tax_pct, tax_amount, total, amount_paid, due_date, sent_at, paid_at, voided_at, created_at")
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

  function InvoiceRow({ inv }: { inv: Invoice }) {
    const days = daysSince(inv.created_at);
    const badge = getStatusBadge(inv.status);
    return (
      <Link
        href={`/invoices/${inv.id}`}
        className="flex items-start justify-between rounded border p-3 hover:opacity-80 gap-3"
        style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)" }}
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
            <h1 className="text-xl font-bold">Payments & Invoices</h1>

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
              <p style={{ color: "var(--zr-text-secondary)" }}>Loading…</p>
            ) : activeTab === "invoices" ? (
              <>
                <button
                  onClick={() => setCreateModalOpen(true)}
                  style={{ background: "var(--zr-orange)" }}
                  className="w-full rounded p-2 text-sm font-medium text-white hover:opacity-90"
                >
                  Create Invoice
                </button>

                {invoices.length === 0 ? (
                  <p style={{ color: "var(--zr-text-secondary)" }}>No invoices yet. Create one from an approved quote.</p>
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
        </main>
      </PermissionGate>
    </FeatureGate>
  );
}
