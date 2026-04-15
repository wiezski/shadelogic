"use client";

import { useEffect, useState, Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { supabase } from "../../../../lib/supabase";

type Quote = {
  id: string;
  customer_id: string;
  title: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  expires_at: string | null;
  valid_days: number;
  subtotal: number;
  discount_amount: number;
  total: number;
};

type LineItem = {
  id: string;
  room_name: string | null;
  window_label: string | null;
  product_name: string;
  width: string | null;
  height: string | null;
  mount_type: string | null;
  retail: number;
  is_motorized: boolean;
  motor_retail: number;
  notes: string | null;
};

type CompanySettings = {
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  website: string | null;
  tagline: string | null;
  license_number: string | null;
  default_deposit_pct: number;
  default_quote_days: number;
};

type Customer = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
};

function parseAddress(addr: string | null) {
  if (!addr) return null;
  const p = addr.split("|");
  if (p.length === 4) return [p[0], `${p[1]}, ${p[2]} ${p[3]}`].filter(Boolean).join("\n");
  return addr;
}

function fmtMoney(n: number) {
  return "$" + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export default function PrintQuotePage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-400">Loading quote…</div>}>
      <PrintQuoteInner />
    </Suspense>
  );
}

function PrintQuoteInner() {
  const params  = useParams();
  const quoteId = params.id as string;

  const [quote,    setQuote]    = useState<Quote | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [lines,    setLines]    = useState<LineItem[]>([]);
  const [company,  setCompany]  = useState<CompanySettings | null>(null);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    if (quoteId) load();
  }, [quoteId]); // eslint-disable-line

  // Auto-trigger print after load
  useEffect(() => {
    if (!loading && quote) {
      setTimeout(() => window.print(), 600);
    }
  }, [loading, quote]);

  async function load() {
    const [qRes, lRes, coRes] = await Promise.all([
      supabase.from("quotes").select("*").eq("id", quoteId).single(),
      supabase.from("quote_line_items").select("*").eq("quote_id", quoteId).order("sort_order").order("room_name"),
      supabase.from("company_settings").select("*").limit(1).single(),
    ]);
    if (!qRes.data) { setLoading(false); return; }
    setQuote(qRes.data as Quote);
    setLines((lRes.data || []) as LineItem[]);
    if (coRes.data) setCompany(coRes.data as CompanySettings);
    const { data: c } = await supabase.from("customers").select("id, first_name, last_name, address, email, phone").eq("id", qRes.data.customer_id).single();
    if (c) setCustomer(c as Customer);
    setLoading(false);
  }

  if (loading) return <div className="p-8 text-gray-400 text-sm">Loading quote…</div>;
  if (!quote)  return <div className="p-8 text-gray-400 text-sm">Quote not found.</div>;

  const customerName = [customer?.first_name, customer?.last_name].filter(Boolean).join(" ");
  const address      = parseAddress(customer?.address ?? null);
  const createdDate  = new Date(quote.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const expiryDate   = quote.expires_at
    ? new Date(quote.expires_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : (() => {
        const d = new Date(quote.created_at);
        d.setDate(d.getDate() + (quote.valid_days || 30));
        return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
      })();

  // Group lines by room
  const rooms: Record<string, LineItem[]> = {};
  lines.forEach(l => {
    const room = l.room_name ?? "General";
    if (!rooms[room]) rooms[room] = [];
    rooms[room].push(l);
  });

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          @page { margin: 0.75in; size: letter; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
        }
        body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #111; background: white; }
      `}</style>

      {/* Print button — hidden when printing */}
      <div className="no-print fixed top-4 right-4 flex gap-2 z-50">
        <button onClick={() => window.print()}
          className="bg-black text-white px-4 py-2 rounded text-sm shadow-lg">
          🖨 Print / Save PDF
        </button>
        <button onClick={() => window.close()}
          className="bg-white border text-gray-600 px-3 py-2 rounded text-sm shadow-lg">
          Close
        </button>
      </div>

      <div className="max-w-[680px] mx-auto px-8 py-10 text-sm">

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <div className="text-2xl font-bold tracking-tight text-gray-900">{company?.name ?? "ShadeLogic"}</div>
            {company?.tagline && <div className="text-xs text-gray-400 mt-0.5">{company.tagline}</div>}
            {company?.phone  && <div className="text-xs text-gray-500 mt-0.5">{company.phone}</div>}
            {company?.email  && <div className="text-xs text-gray-500">{company.email}</div>}
            {company?.website && <div className="text-xs text-gray-500">{company.website}</div>}
            {(company?.city || company?.state) && (
              <div className="text-xs text-gray-500">{[company.address, company.city, company.state, company.zip].filter(Boolean).join(", ")}</div>
            )}
            {company?.license_number && <div className="text-xs text-gray-400 mt-0.5">{company.license_number}</div>}
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-gray-300 tracking-wide">QUOTE</div>
            <div className="text-xs text-gray-500 mt-1">Date: {createdDate}</div>
            <div className="text-xs text-gray-500">Valid until: {expiryDate}</div>
          </div>
        </div>

        {/* Prepared for */}
        <div className="grid grid-cols-2 gap-8 mb-8 pb-8 border-b border-gray-200">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Prepared For</div>
            <div className="font-semibold text-base">{customerName}</div>
            {address && address.split("\n").map((line, i) => (
              <div key={i} className="text-gray-600 text-xs mt-0.5">{line}</div>
            ))}
            {customer?.phone && <div className="text-gray-600 text-xs mt-0.5">{customer.phone}</div>}
            {customer?.email && <div className="text-gray-600 text-xs mt-0.5">{customer.email}</div>}
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Quote Details</div>
            <div className="font-semibold">{quote.title ?? "Window Treatment Quote"}</div>
            <div className="text-xs text-gray-500 mt-0.5">Quote ID: {quoteId.slice(0, 8).toUpperCase()}</div>
          </div>
        </div>

        {/* Line items */}
        {lines.length > 0 ? (
          <div className="mb-8">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-gray-900">
                  <th className="text-left pb-2 font-semibold text-xs uppercase tracking-wide">Location</th>
                  <th className="text-left pb-2 font-semibold text-xs uppercase tracking-wide">Product</th>
                  <th className="text-center pb-2 font-semibold text-xs uppercase tracking-wide">Size</th>
                  <th className="text-center pb-2 font-semibold text-xs uppercase tracking-wide">Mount</th>
                  <th className="text-right pb-2 font-semibold text-xs uppercase tracking-wide">Price</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(rooms).map(([roomName, roomLines]) =>
                  roomLines.map((line, i) => {
                    const lineTotal = line.retail + (line.is_motorized ? line.motor_retail : 0);
                    return (
                      <tr key={line.id} className="border-b border-gray-100">
                        <td className="py-2 text-gray-600 align-top">
                          {i === 0 ? roomName : ""}
                          {i === 0 && roomLines.length > 1 ? ` (${roomLines.length})` : ""}
                        </td>
                        <td className="py-2 align-top">
                          <div>{line.product_name || "—"}</div>
                          {line.is_motorized && <div className="text-xs text-purple-600">+ Motorization</div>}
                          {line.notes && <div className="text-xs text-gray-400 italic">{line.notes}</div>}
                        </td>
                        <td className="py-2 text-center text-gray-600 align-top whitespace-nowrap">
                          {line.width && line.height ? `${line.width}" × ${line.height}"` : "—"}
                        </td>
                        <td className="py-2 text-center text-gray-600 align-top">{line.mount_type ?? "—"}</td>
                        <td className="py-2 text-right font-medium align-top">{fmtMoney(lineTotal)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mb-8 text-gray-400 italic text-sm">No line items.</div>
        )}

        {/* Totals */}
        <div className="flex justify-end mb-8">
          <div className="w-56 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Subtotal</span>
              <span>{fmtMoney(quote.subtotal || 0)}</span>
            </div>
            {(quote.discount_amount || 0) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Discount</span>
                <span className="text-green-600">-{fmtMoney(quote.discount_amount || 0)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base border-t border-gray-900 pt-1.5">
              <span>Total</span>
              <span>{fmtMoney(quote.total || 0)}</span>
            </div>
          </div>
        </div>

        {/* Notes */}
        {quote.notes && (
          <div className="mb-8 pb-8 border-b border-gray-100">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Notes</div>
            <div className="text-sm text-gray-600 whitespace-pre-wrap">{quote.notes}</div>
          </div>
        )}

        {/* Terms */}
        <div className="text-xs text-gray-400 space-y-1 border-t border-gray-100 pt-4">
          <div>• Quote valid for {quote.valid_days || company?.default_quote_days || 30} days from date issued ({expiryDate}).</div>
          <div>• {company?.default_deposit_pct ?? 50}% deposit required to place order. Balance due upon completion.</div>
          <div>• Prices are subject to change after expiry.</div>
          <div>• Lead times vary by product and manufacturer — estimated at time of order.</div>
        </div>

      </div>
    </>
  );
}
