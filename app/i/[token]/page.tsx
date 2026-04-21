"use client";

// Public customer-facing invoice page — no login required.
// Share the link via text/email: yourdomain.com/i/[publicToken]
// Uses the anon Supabase client — RLS allows SELECT on invoices where public_token IS NOT NULL.

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../lib/supabase";

type Invoice = {
  id: string;
  invoice_number: string;
  customer_id: string;
  type: string;
  status: string;
  subtotal: number;
  tax_pct: number;
  tax_amount: number;
  total: number;
  amount_paid: number;
  due_date: string | null;
  memo: string | null;
  created_at: string;
};

type LineItem = {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  sort_order: number;
};

type Customer = {
  first_name: string | null;
  last_name: string | null;
};

type CompanyInfo = {
  name: string;
  phone: string | null;
  email: string | null;
  website: string | null;
};

type PaymentConfig = {
  enabled_payment_methods: string[] | null;
  payment_instructions: Record<string, string> | null;
};

type PaymentIntegration = {
  provider: string;
  display_name: string;
  status: string;
  is_default: boolean;
  category: string;
};

// ── Helpers ────────────────────────────────────────────────────
function fmtMoney(n: number) {
  return "$" + (n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function fmtDate(dateStr: string | null) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

const METHOD_LABELS: Record<string, { label: string; icon: string }> = {
  cash: { label: "Cash", icon: "💵" },
  check: { label: "Check", icon: "📝" },
  zelle: { label: "Zelle", icon: "⚡" },
  venmo: { label: "Venmo", icon: "✌️" },
  ach: { label: "ACH / Bank Transfer", icon: "🏦" },
  wire: { label: "Wire Transfer", icon: "🔗" },
};

const STATUS_INFO: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: "Draft", color: "#6b7280", bg: "#f3f4f6" },
  sent: { label: "Awaiting Payment", color: "#2563eb", bg: "#dbeafe" },
  partial: { label: "Partially Paid", color: "#d97706", bg: "#fef3c7" },
  paid: { label: "Paid in Full", color: "#16a34a", bg: "#dcfce7" },
  overdue: { label: "Overdue", color: "#dc2626", bg: "#fee2e2" },
  void: { label: "Voided", color: "#6b7280", bg: "#f3f4f6" },
};

// ── Main Page ──────────────────────────────────────────────────
export default function PublicInvoicePage() {
  const params = useParams();
  const token = params.token as string;

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [brand, setBrand] = useState<{ plan: string | null; brand_logo_url: string | null; brand_primary_color: string | null } | null>(null);
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig | null>(null);
  const [integrations, setIntegrations] = useState<PaymentIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    load();
  }, [token]);

  async function load() {
    setLoading(true);

    // Load invoice by public_token
    const { data: inv } = await supabase
      .from("invoices")
      .select("id, invoice_number, customer_id, type, status, subtotal, tax_pct, tax_amount, total, amount_paid, due_date, memo, created_at, company_id")
      .eq("public_token", token)
      .single();

    if (!inv) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    setInvoice(inv);

    // Load line items, customer, company info, payment config in parallel
    const [itemsRes, custRes, compRes, settingsRes, intRes, brandRes] = await Promise.all([
      supabase
        .from("invoice_line_items")
        .select("id, description, quantity, unit_price, total, sort_order")
        .eq("invoice_id", inv.id)
        .order("sort_order", { ascending: true }),
      supabase
        .from("customers")
        .select("first_name, last_name")
        .eq("id", inv.customer_id)
        .single(),
      supabase
        .from("company_settings")
        .select("name, phone, email, website")
        .eq("company_id", inv.company_id)
        .single(),
      supabase
        .from("company_settings")
        .select("enabled_payment_methods, payment_instructions")
        .eq("company_id", inv.company_id)
        .single(),
      supabase
        .from("payment_integrations")
        .select("provider, display_name, status, is_default, category")
        .eq("company_id", inv.company_id)
        .eq("status", "connected")
        .eq("category", "payments"),
      // Brand info from the anon-safe public view — logo shows only for
      // Business plan; otherwise default styling.
      supabase
        .from("companies_public")
        .select("plan, brand_logo_url, brand_primary_color")
        .eq("id", inv.company_id)
        .single(),
    ]);

    setLineItems(itemsRes.data || []);
    setCustomer(custRes.data);
    setCompany(compRes.data);
    setPaymentConfig(settingsRes.data);
    setIntegrations(intRes.data || []);
    setBrand(brandRes.data as { plan: string | null; brand_logo_url: string | null; brand_primary_color: string | null } | null);
    setLoading(false);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500 text-sm">Loading invoice…</p>
      </main>
    );
  }

  if (notFound) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-lg font-bold text-gray-800 mb-2">Invoice Not Found</h1>
          <p className="text-sm text-gray-500">
            This invoice link may have expired or is no longer available.
          </p>
        </div>
      </main>
    );
  }

  if (!invoice) return null;

  const amountDue = invoice.total - invoice.amount_paid;
  const isPaid = invoice.status === "paid";
  const isVoid = invoice.status === "void";
  const statusInfo = STATUS_INFO[invoice.status] || STATUS_INFO.sent;
  const enabledMethods = paymentConfig?.enabled_payment_methods || [];
  const instructions = paymentConfig?.payment_instructions || {};
  const customerName = customer
    ? [customer.first_name, customer.last_name].filter(Boolean).join(" ")
    : "Customer";

  return (
    <main className="min-h-screen bg-gray-50 p-4">
      <div className="mx-auto max-w-xl space-y-4">
        {/* Company header — Business plan tenants get their custom logo
            above the business name; lower plans show just the name. */}
        {company && (
          <div className="text-center pt-4">
            {brand?.brand_logo_url && (brand.plan === "business" || brand.plan === "trial") && (
              <img
                src={brand.brand_logo_url}
                alt={company.name}
                className="mx-auto mb-2 max-h-14 object-contain"
              />
            )}
            <h1 className="text-lg font-bold text-gray-900">{company.name}</h1>
            <div className="flex items-center justify-center gap-3 mt-1 text-xs text-gray-500">
              {company.phone && <span>{company.phone}</span>}
              {company.email && <span>{company.email}</span>}
            </div>
          </div>
        )}

        {/* Invoice card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {/* Status banner */}
          <div
            className="px-4 py-3 flex items-center justify-between"
            style={{ background: statusInfo.bg }}
          >
            <div>
              <span className="text-xs font-semibold" style={{ color: statusInfo.color }}>
                {statusInfo.label}
              </span>
              <span className="text-xs text-gray-500 ml-2">{invoice.invoice_number}</span>
            </div>
            {invoice.due_date && !isPaid && !isVoid && (
              <span className="text-xs" style={{ color: statusInfo.color }}>
                Due {fmtDate(invoice.due_date)}
              </span>
            )}
          </div>

          {/* Customer + date */}
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-medium text-gray-800">Bill to: {customerName}</p>
            <p className="text-xs text-gray-500">Issued {fmtDate(invoice.created_at)}</p>
          </div>

          {/* Line items */}
          {lineItems.length > 0 && (
            <div className="border-b border-gray-100">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left p-3 font-medium text-gray-600">Item</th>
                    <th className="text-right p-3 font-medium text-gray-600 w-16">Qty</th>
                    <th className="text-right p-3 font-medium text-gray-600 w-20">Price</th>
                    <th className="text-right p-3 font-medium text-gray-600 w-20">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item, idx) => (
                    <tr
                      key={item.id}
                      className={idx < lineItems.length - 1 ? "border-b border-gray-50" : ""}
                    >
                      <td className="p-3 text-gray-800">{item.description}</td>
                      <td className="text-right p-3 text-gray-600">{item.quantity}</td>
                      <td className="text-right p-3 text-gray-600">{fmtMoney(item.unit_price)}</td>
                      <td className="text-right p-3 text-gray-800 font-medium">
                        {fmtMoney(item.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Totals */}
          <div className="px-4 py-3 space-y-1.5">
            <div className="flex justify-between text-xs text-gray-600">
              <span>Subtotal</span>
              <span>{fmtMoney(invoice.subtotal)}</span>
            </div>
            {invoice.tax_amount > 0 && (
              <div className="flex justify-between text-xs text-gray-600">
                <span>Tax ({invoice.tax_pct}%)</span>
                <span>{fmtMoney(invoice.tax_amount)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-bold text-gray-900 pt-1 border-t border-gray-100">
              <span>Total</span>
              <span>{fmtMoney(invoice.total)}</span>
            </div>
            {invoice.amount_paid > 0 && (
              <div className="flex justify-between text-xs text-green-600">
                <span>Paid</span>
                <span>-{fmtMoney(invoice.amount_paid)}</span>
              </div>
            )}
            {!isPaid && !isVoid && (
              <div className="flex justify-between text-sm font-bold pt-1 border-t border-gray-100"
                style={{ color: invoice.status === "overdue" ? "#dc2626" : "#111827" }}
              >
                <span>Amount Due</span>
                <span>{fmtMoney(amountDue)}</span>
              </div>
            )}
          </div>

          {/* Memo */}
          {invoice.memo && (
            <div className="px-4 py-3 border-t border-gray-100">
              <p className="text-xs text-gray-600">{invoice.memo}</p>
            </div>
          )}
        </div>

        {/* Payment Options — only show if not paid/void */}
        {!isPaid && !isVoid && amountDue > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 space-y-4">
            <h2 className="font-semibold text-gray-900 text-sm">Payment Options</h2>

            {/* Connected payment services (Pay Now buttons) */}
            {integrations.length > 0 && (
              <div className="space-y-2">
                {integrations.map((int) => {
                  const colors: Record<string, string> = {
                    stripe: "#635BFF",
                    square: "#006AFF",
                    paypal: "#003087",
                  };
                  const color = colors[int.provider] || "#333";
                  return (
                    <button
                      key={int.provider}
                      className="w-full rounded-lg p-3 text-white text-sm font-medium hover:opacity-90 transition-opacity"
                      style={{ background: color }}
                      onClick={() => {
                        // Placeholder — will open payment flow when integration is fully connected
                        alert(
                          `${int.display_name} payment coming soon! For now, please use one of the manual payment methods below.`
                        );
                      }}
                    >
                      Pay {fmtMoney(amountDue)} with {int.display_name}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Divider if both exist */}
            {integrations.length > 0 && enabledMethods.length > 0 && (
              <div className="flex items-center gap-3">
                <div className="flex-1 border-t border-gray-200" />
                <span className="text-xs text-gray-400">or pay manually</span>
                <div className="flex-1 border-t border-gray-200" />
              </div>
            )}

            {/* Manual payment methods */}
            {enabledMethods.length > 0 && (
              <div className="space-y-2">
                {enabledMethods.map((method) => {
                  const info = METHOD_LABELS[method];
                  if (!info) return null;
                  const instruction = instructions[method];
                  return (
                    <div
                      key={method}
                      className="rounded-lg border border-gray-200 p-3"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{info.icon}</span>
                        <span className="text-sm font-medium text-gray-800">{info.label}</span>
                      </div>
                      {instruction && (
                        <p className="text-xs text-gray-500 mt-1 ml-8">{instruction}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* No methods configured */}
            {integrations.length === 0 && enabledMethods.length === 0 && (
              <p className="text-xs text-gray-500">
                Please contact us directly to arrange payment.
              </p>
            )}
          </div>
        )}

        {/* Paid confirmation */}
        {isPaid && (
          <div className="bg-green-50 rounded-xl border border-green-200 p-4 text-center">
            <div className="text-2xl mb-1">✓</div>
            <h2 className="font-semibold text-green-800 text-sm">Paid in Full</h2>
            <p className="text-xs text-green-600 mt-1">
              Thank you for your payment of {fmtMoney(invoice.total)}.
            </p>
          </div>
        )}

        {/* Footer — show the installer's business name only. Customers who
            see this are homeowners, not prospective ZeroRemake users. */}
        {company?.name && (
          <div className="text-center py-4">
            <p className="text-xs text-gray-400">{company.name}</p>
          </div>
        )}
      </div>
    </main>
  );
}
