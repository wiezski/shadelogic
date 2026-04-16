"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { FeatureGate } from "../feature-gate";
import { PermissionGate } from "../permission-gate";

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

function fmtMoney(n: number) {
  return "$" + (n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function daysSince(dateStr: string) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

export default function PaymentsPage() {
  const [quotes,  setQuotes]  = useState<PaymentQuote[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("quotes")
      .select("id, customer_id, title, total, deposit_amount, deposit_paid, deposit_paid_at, balance_paid, balance_paid_at, payment_method, created_at")
      .eq("status", "approved")
      .order("created_at", { ascending: false });

    if (!data || data.length === 0) { setLoading(false); return; }

    const custIds = [...new Set(data.map((q: any) => q.customer_id as string))];
    const { data: custs } = await supabase.from("customers").select("id, first_name, last_name").in("id", custIds);
    const custMap: Record<string, string> = {};
    (custs || []).forEach((c: any) => { custMap[c.id] = [c.first_name, c.last_name].filter(Boolean).join(" "); });

    setQuotes(data.map((q: any) => ({ ...q, customer_name: custMap[q.customer_id] ?? "Unknown" })));
    setLoading(false);
  }

  const depositPending = quotes.filter(q => !q.deposit_paid);
  const balanceDue     = quotes.filter(q => q.deposit_paid && !q.balance_paid);
  const paidInFull     = quotes.filter(q => q.balance_paid);

  const totalOutstanding =
    depositPending.reduce((s, q) => s + (q.total || 0), 0) +
    balanceDue.reduce((s, q) => s + Math.max(0, (q.total || 0) - (q.deposit_amount || 0)), 0);
  const totalCollected =
    balanceDue.reduce((s, q) => s + (q.deposit_amount || 0), 0) +
    paidInFull.reduce((s, q) => s + (q.total || 0), 0);

  function QuoteRow({ q, section }: { q: PaymentQuote; section: "deposit" | "balance" | "paid" }) {
    const amountDue = section === "deposit" ? q.total : section === "balance" ? Math.max(0, q.total - q.deposit_amount) : 0;
    const days = daysSince(q.created_at);
    return (
      <Link href={`/quotes/${q.id}`}
        className="flex items-start justify-between rounded border p-3 hover:bg-gray-50 gap-3">
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
        <main className="min-h-screen bg-white p-4 text-black text-sm">
          <div className="mx-auto max-w-2xl space-y-5">
        <h1 className="text-xl font-bold">Payments</h1>

        {/* Summary */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded border p-3 text-center">
            <div className="text-2xl font-bold text-red-500">{fmtMoney(totalOutstanding)}</div>
            <div className="text-xs text-gray-500 mt-0.5">Outstanding</div>
          </div>
          <div className="rounded border p-3 text-center">
            <div className="text-2xl font-bold text-green-600">{fmtMoney(totalCollected)}</div>
            <div className="text-xs text-gray-500 mt-0.5">Collected</div>
          </div>
        </div>

        {loading ? <p className="text-gray-400">Loading…</p> : (
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
              {depositPending.length === 0
                ? <p className="text-xs text-gray-400">No pending deposits.</p>
                : <ul className="space-y-2">{depositPending.map(q => <li key={q.id}><QuoteRow q={q} section="deposit" /></li>)}</ul>
              }
            </section>

            {/* Balance Due */}
            <section>
              <div className="flex items-center gap-2 mb-2">
                <h2 className="font-semibold text-amber-600">Balance Due</h2>
                <span className="text-xs rounded bg-amber-100 text-amber-700 px-1.5 py-0.5">{balanceDue.length}</span>
                {balanceDue.length > 0 && (
                  <span className="text-xs text-gray-400 ml-1">{fmtMoney(balanceDue.reduce((s, q) => s + Math.max(0, q.total - q.deposit_amount), 0))} due</span>
                )}
              </div>
              {balanceDue.length === 0
                ? <p className="text-xs text-gray-400">No balances due.</p>
                : <ul className="space-y-2">{balanceDue.map(q => <li key={q.id}><QuoteRow q={q} section="balance" /></li>)}</ul>
              }
            </section>

            {/* Paid in Full */}
            <section>
              <div className="flex items-center gap-2 mb-2">
                <h2 className="font-semibold text-green-600">Paid in Full</h2>
                <span className="text-xs rounded bg-green-100 text-green-700 px-1.5 py-0.5">{paidInFull.length}</span>
                {paidInFull.length > 0 && (
                  <span className="text-xs text-gray-400 ml-1">{fmtMoney(paidInFull.reduce((s, q) => s + q.total, 0))} collected</span>
                )}
              </div>
              {paidInFull.length === 0
                ? <p className="text-xs text-gray-400">No paid jobs yet.</p>
                : <ul className="space-y-2">{paidInFull.map(q => <li key={q.id}><QuoteRow q={q} section="paid" /></li>)}</ul>
              }
            </section>
          </>
          )}
          </div>
        </main>
      </PermissionGate>
    </FeatureGate>
  );
}
