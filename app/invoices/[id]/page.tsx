"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../auth-provider";
import { PermissionGate } from "../../permission-gate";

// ── Types ──────────────────────────────────────────────────────
type Invoice = {
  id: string;
  invoice_number: string;
  customer_id: string;
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
  notes: string | null;
  memo: string | null;
  public_token: string | null;
  created_at: string;
  updated_at: string;
};

type LineItem = {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  sort_order: number;
};

type Payment = {
  id: string;
  invoice_id: string;
  amount: number;
  method: "cash" | "check" | "zelle" | "venmo" | "credit_card" | "debit_card" | "ach" | "wire" | "other";
  reference: string | null;
  received_at: string;
  notes: string | null;
  logged_by: string | null;
};

type Customer = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
};

// ── Helpers ────────────────────────────────────────────────────
function fmtMoney(n: number) {
  return "$" + (n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function fmtDate(dateStr: string | null) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString();
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

// ── Record Payment Modal ───────────────────────────────────────
function RecordPaymentModal({ open, onClose, invoice, onPaymentRecorded }: {
  open: boolean;
  onClose: () => void;
  invoice: Invoice | null;
  onPaymentRecorded: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash">("cash");
  const [reference, setReference] = useState("");
  const [dateReceived, setDateReceived] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && invoice) {
      setAmount(invoice.amount_due.toFixed(2));
    }
  }, [open, invoice]);

  async function savePayment() {
    if (!invoice || !amount) return;
    setSaving(true);

    try {
      const paymentAmount = parseFloat(amount);
      if (paymentAmount <= 0) throw new Error("Amount must be greater than 0");

      // Create payment record
      const { error: payErr } = await supabase.from("payments").insert({
        invoice_id: invoice.id,
        customer_id: invoice.customer_id,
        amount: paymentAmount,
        method,
        reference: reference || null,
        received_at: new Date(dateReceived).toISOString(),
        notes: notes || null,
      });

      if (payErr) throw payErr;

      // Update invoice amount_paid
      const newAmountPaid = invoice.amount_paid + paymentAmount;
      const newStatus = newAmountPaid >= invoice.total ? "paid" : "partial";
      const paidAtTime = newStatus === "paid" ? new Date().toISOString() : invoice.paid_at;

      const { error: invErr } = await supabase
        .from("invoices")
        .update({
          amount_paid: newAmountPaid,
          status: newStatus,
          paid_at: paidAtTime,
        })
        .eq("id", invoice.id);

      if (invErr) throw invErr;

      onPaymentRecorded();
      onClose();
      setAmount("");
      setMethod("cash");
      setReference("");
      setNotes("");
    } catch (err) {
      console.error("Error recording payment:", err);
    } finally {
      setSaving(false);
    }
  }

  if (!open || !invoice) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }} className="rounded-lg max-w-md w-full p-4 space-y-4">
        <h2 className="font-bold text-lg">Record Payment</h2>

        <div>
          <label className="text-xs font-medium block mb-1">Amount</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            step="0.01"
            style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }}
            className="w-full rounded p-2 text-sm"
            placeholder="0.00"
          />
          <div className="text-xs text-gray-500 mt-1">Amount due: {fmtMoney(invoice.amount_due)}</div>
        </div>

        <div>
          <label className="text-xs font-medium block mb-1">Payment Method</label>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as any)}
            style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }}
            className="w-full rounded p-2 text-sm"
          >
            <option value="cash">Cash</option>
            <option value="check">Check</option>
            <option value="zelle">Zelle</option>
            <option value="venmo">Venmo</option>
            <option value="credit_card">Credit Card</option>
            <option value="debit_card">Debit Card</option>
            <option value="ach">ACH Transfer</option>
            <option value="wire">Wire Transfer</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div>
          <label className="text-xs font-medium block mb-1">Reference (Check #, Transaction ID, etc.)</label>
          <input
            type="text"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }}
            className="w-full rounded p-2 text-sm"
            placeholder="Optional"
          />
        </div>

        <div>
          <label className="text-xs font-medium block mb-1">Date Received</label>
          <input
            type="date"
            value={dateReceived}
            onChange={(e) => setDateReceived(e.target.value)}
            style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }}
            className="w-full rounded p-2 text-sm"
          />
        </div>

        <div>
          <label className="text-xs font-medium block mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }}
            className="w-full rounded p-2 text-sm resize-none"
            rows={2}
            placeholder="Optional"
          />
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
            onClick={savePayment}
            disabled={!amount || saving}
            style={{ background: "var(--zr-orange)" }}
            className="flex-1 rounded p-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Record Payment"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────
export default function InvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const invoiceId = params.id as string;

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    load();
  }, [invoiceId]);

  async function load() {
    setLoading(true);
    try {
      const { data: inv } = await supabase
        .from("invoices")
        .select("*")
        .eq("id", invoiceId)
        .single();

      if (!inv) {
        router.push("/payments");
        return;
      }

      // Add computed amount_due
      const invoice = { ...inv, amount_due: inv.total - inv.amount_paid };
      setInvoice(invoice);

      // Load customer
      const { data: cust } = await supabase
        .from("customers")
        .select("*")
        .eq("id", inv.customer_id)
        .single();
      setCustomer(cust);

      // Load line items
      const { data: items } = await supabase
        .from("invoice_line_items")
        .select("*")
        .eq("invoice_id", invoiceId)
        .order("sort_order", { ascending: true });
      setLineItems(items || []);

      // Load payments
      const { data: pmts } = await supabase
        .from("payments")
        .select("*")
        .eq("invoice_id", invoiceId)
        .order("received_at", { ascending: false });
      setPayments(pmts || []);
    } catch (err) {
      console.error("Error loading invoice:", err);
    } finally {
      setLoading(false);
    }
  }

  async function markAsSent() {
    if (!invoice) return;
    setActionLoading(true);
    try {
      await supabase
        .from("invoices")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", invoice.id);
      load();
    } catch (err) {
      console.error("Error marking as sent:", err);
    } finally {
      setActionLoading(false);
    }
  }

  async function voidInvoice() {
    if (!invoice || !confirm("Are you sure you want to void this invoice? This cannot be undone.")) return;
    setActionLoading(true);
    try {
      await supabase
        .from("invoices")
        .update({ status: "void", voided_at: new Date().toISOString() })
        .eq("id", invoice.id);
      load();
    } catch (err) {
      console.error("Error voiding invoice:", err);
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <PermissionGate require="view_financials">
        <main style={{ background: "var(--zr-black)", minHeight: "100vh", padding: "24px" }}>
          <div style={{ maxWidth: 672, margin: "0 auto" }}>
            <div className="zr-skeleton" style={{ width: "120px", height: "14px", borderRadius: "var(--zr-radius-sm)", marginBottom: "16px" }} />
            <div className="zr-skeleton" style={{ width: "45%", height: "22px", borderRadius: "var(--zr-radius-sm)", marginBottom: "12px" }} />
            <div className="zr-skeleton" style={{ width: "100%", height: "160px", borderRadius: "var(--zr-radius-md)", marginBottom: "12px" }} />
            <div className="zr-skeleton" style={{ width: "100%", height: "80px", borderRadius: "var(--zr-radius-md)" }} />
          </div>
        </main>
      </PermissionGate>
    );
  }

  if (!invoice) {
    return (
      <PermissionGate require="view_financials">
        <main style={{ background: "var(--zr-black)", color: "var(--zr-text-primary)" }} className="min-h-screen p-4">
          <div className="mx-auto max-w-2xl">
            <p>Invoice not found.</p>
            <Link href="/payments" className="text-blue-600 hover:underline">Back to Payments</Link>
          </div>
        </main>
      </PermissionGate>
    );
  }

  const badge = getStatusBadge(invoice.status);

  return (
    <PermissionGate require="view_financials">
      <main style={{ background: "var(--zr-black)", color: "var(--zr-text-primary)" }} className="min-h-screen p-4 text-sm">
        <div className="mx-auto max-w-2xl space-y-5">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-2xl font-bold">{invoice.invoice_number}</h1>
                <span className={`text-xs rounded px-2 py-1 ${badge.bg} ${badge.text}`}>
                  {invoice.status}
                </span>
              </div>
              <p style={{ color: "var(--zr-text-secondary)" }} className="text-xs">
                {new Date(invoice.created_at).toLocaleDateString()}
              </p>
            </div>
            <Link href="/payments" className="text-blue-600 hover:underline text-xs">
              Back to Payments
            </Link>
          </div>

          {/* Customer Info */}
          {customer && (
            <div style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }} className="rounded p-4">
              <h2 className="font-semibold mb-2">Bill To</h2>
              <p className="font-medium">
                {[customer.first_name, customer.last_name].filter(Boolean).join(" ")}
              </p>
              {customer.address && (
                <p style={{ color: "var(--zr-text-secondary)" }} className="text-xs mt-1">
                  {customer.address.replace(/\|/g, ", ")}
                </p>
              )}
              {customer.email && (
                <p style={{ color: "var(--zr-text-secondary)" }} className="text-xs mt-1">
                  {customer.email}
                </p>
              )}
              {customer.phone && (
                <p style={{ color: "var(--zr-text-secondary)" }} className="text-xs mt-1">
                  {customer.phone}
                </p>
              )}
            </div>
          )}

          {/* Line Items */}
          {lineItems.length > 0 && (
            <div style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }} className="rounded overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: "var(--zr-surface-2)", borderBottom: "1px solid var(--zr-border)" }}>
                    <th className="text-left p-3 font-semibold">Description</th>
                    <th className="text-right p-3 font-semibold" style={{ width: "60px" }}>Qty</th>
                    <th className="text-right p-3 font-semibold" style={{ width: "80px" }}>Price</th>
                    <th className="text-right p-3 font-semibold" style={{ width: "80px" }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item, idx) => (
                    <tr key={item.id} style={{ borderBottom: idx < lineItems.length - 1 ? "1px solid var(--zr-border)" : "none" }}>
                      <td className="p-3">{item.description}</td>
                      <td className="text-right p-3">{item.quantity}</td>
                      <td className="text-right p-3">{fmtMoney(item.unit_price)}</td>
                      <td className="text-right p-3 font-medium">{fmtMoney(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Totals */}
          <div style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }} className="rounded p-4 space-y-2">
            <div className="flex justify-between text-xs">
              <span>Subtotal</span>
              <span>{fmtMoney(invoice.subtotal)}</span>
            </div>
            {invoice.tax_amount > 0 && (
              <div className="flex justify-between text-xs">
                <span>Tax ({invoice.tax_pct}%)</span>
                <span>{fmtMoney(invoice.tax_amount)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold border-t pt-2" style={{ borderColor: "var(--zr-border)" }}>
              <span>Total</span>
              <span>{fmtMoney(invoice.total)}</span>
            </div>
            <div className="flex justify-between text-xs pt-2" style={{ color: "var(--zr-text-secondary)" }}>
              <span>Amount Paid</span>
              <span>{fmtMoney(invoice.amount_paid)}</span>
            </div>
            <div className="flex justify-between font-bold text-red-600">
              <span>Amount Due</span>
              <span>{fmtMoney(invoice.amount_due)}</span>
            </div>
            {invoice.due_date && (
              <div className="flex justify-between text-xs pt-2 border-t" style={{ borderColor: "var(--zr-border)", color: "var(--zr-text-secondary)" }}>
                <span>Due Date</span>
                <span>{fmtDate(invoice.due_date)}</span>
              </div>
            )}
          </div>

          {/* Payment History */}
          {payments.length > 0 && (
            <div style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }} className="rounded p-4">
              <h2 className="font-semibold mb-3">Payment History</h2>
              <div className="space-y-2">
                {payments.map(pmt => (
                  <div key={pmt.id} className="flex justify-between text-xs p-2 rounded" style={{ background: "var(--zr-surface-2)" }}>
                    <div>
                      <p className="font-medium">{fmtMoney(pmt.amount)}</p>
                      <p style={{ color: "var(--zr-text-secondary)" }}>
                        {pmt.method} • {fmtDate(pmt.received_at)}
                      </p>
                      {pmt.reference && (
                        <p style={{ color: "var(--zr-text-secondary)" }}>
                          Ref: {pmt.reference}
                        </p>
                      )}
                      {pmt.notes && (
                        <p style={{ color: "var(--zr-text-secondary)" }}>
                          {pmt.notes}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Share Invoice Link */}
          {!["void"].includes(invoice.status) && invoice.public_token && (
            <div style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }} className="rounded p-4">
              <h2 className="font-semibold mb-2">Customer Invoice Link</h2>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={`${typeof window !== "undefined" ? window.location.origin : ""}/i/${invoice.public_token}`}
                  style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-secondary)" }}
                  className="flex-1 rounded p-2 text-xs"
                />
                <button
                  onClick={() => {
                    const url = `${window.location.origin}/i/${invoice.public_token}`;
                    navigator.clipboard.writeText(url);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  style={{ background: "var(--zr-orange)" }}
                  className="rounded px-3 py-2 text-xs font-medium text-white hover:opacity-90 shrink-0"
                >
                  {copied ? "Copied!" : "Copy Link"}
                </button>
              </div>
              <p className="text-xs mt-2" style={{ color: "var(--zr-text-secondary)" }}>
                Share this link with your customer. They can view the invoice and see payment options.
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            {invoice.status === "draft" && (
              <button
                onClick={markAsSent}
                disabled={actionLoading}
                style={{ background: "var(--zr-orange)" }}
                className="flex-1 rounded p-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {actionLoading ? "Updating…" : "Mark as Sent"}
              </button>
            )}
            {invoice.amount_due > 0 && !["paid", "void"].includes(invoice.status) && (
              <button
                onClick={() => setPaymentModalOpen(true)}
                style={{ background: "var(--zr-orange)" }}
                className="flex-1 rounded p-2 text-sm font-medium text-white hover:opacity-90"
              >
                Record Payment
              </button>
            )}
            {!["paid", "void"].includes(invoice.status) && (
              <button
                onClick={voidInvoice}
                disabled={actionLoading}
                style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)" }}
                className="flex-1 rounded p-2 text-sm font-medium hover:opacity-80 disabled:opacity-50"
              >
                Void Invoice
              </button>
            )}
          </div>

          {invoice.notes && (
            <div style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)" }} className="rounded p-4">
              <h3 className="text-xs font-semibold mb-2">Notes</h3>
              <p style={{ color: "var(--zr-text-secondary)" }} className="text-xs whitespace-pre-wrap">
                {invoice.notes}
              </p>
            </div>
          )}
        </div>

        <RecordPaymentModal
          open={paymentModalOpen}
          onClose={() => setPaymentModalOpen(false)}
          invoice={invoice}
          onPaymentRecorded={load}
        />
      </main>
    </PermissionGate>
  );
}
