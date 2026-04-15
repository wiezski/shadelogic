"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";

// ── Types ─────────────────────────────────────────────────────

type Quote = {
  id: string;
  customer_id: string;
  title: string | null;
  status: QuoteStatus;
  amount: string | null;
  notes: string | null;
  sent_at: string | null;
  created_at: string;
};

type QuoteStatus = "draft" | "sent" | "approved" | "rejected";

type Customer = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

// ── Constants ──────────────────────────────────────────────────

const STATUSES: { value: QuoteStatus; label: string; badge: string }[] = [
  { value: "draft",    label: "Draft",    badge: "bg-gray-100 text-gray-600" },
  { value: "sent",     label: "Sent",     badge: "bg-blue-100 text-blue-700" },
  { value: "approved", label: "Approved", badge: "bg-green-100 text-green-700" },
  { value: "rejected", label: "Rejected", badge: "bg-red-100 text-red-600" },
];

// Status → suggested customer lead_status update
const STATUS_TO_LEAD: Partial<Record<QuoteStatus, string>> = {
  sent:     "Quoted",
  approved: "Sold",
};

// ── Page ───────────────────────────────────────────────────────

export default function QuotePage() {
  const params     = useParams();
  const router     = useRouter();
  const quoteId    = params.id as string;

  const [quote,    setQuote]    = useState<Quote | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);

  // Inline-edit fields (mirrors quote state)
  const [title,  setTitle]  = useState("");
  const [amount, setAmount] = useState("");
  const [notes,  setNotes]  = useState("");

  useEffect(() => {
    if (quoteId) load();
  }, [quoteId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true);
    const { data: q, error } = await supabase
      .from("quotes")
      .select("*")
      .eq("id", quoteId)
      .single();

    if (error || !q) { setLoading(false); return; }
    const quote = q as Quote;
    setQuote(quote);
    setTitle(quote.title ?? "");
    setAmount(quote.amount ?? "");
    setNotes(quote.notes ?? "");

    const { data: c } = await supabase
      .from("customers")
      .select("id, first_name, last_name")
      .eq("id", quote.customer_id)
      .single();
    if (c) setCustomer(c as Customer);

    setLoading(false);
  }

  async function saveField(field: keyof Quote, value: string | null) {
    if (!quote) return;
    await supabase.from("quotes").update({ [field]: value }).eq("id", quoteId);
    setQuote((prev) => prev ? { ...prev, [field]: value } : prev);
  }

  async function updateStatus(newStatus: QuoteStatus) {
    if (!quote) return;
    setSaving(true);
    const updates: Partial<Quote> = { status: newStatus };

    // Auto-stamp sent_at when first marked sent
    if (newStatus === "sent" && !quote.sent_at) {
      updates.sent_at = new Date().toISOString();
    }

    await supabase.from("quotes").update(updates).eq("id", quoteId);
    setQuote((prev) => prev ? { ...prev, ...updates } : prev);

    // Update customer lead_status if applicable
    const suggestedLeadStatus = STATUS_TO_LEAD[newStatus];
    if (suggestedLeadStatus) {
      await supabase.from("customers")
        .update({ lead_status: suggestedLeadStatus, last_activity_at: new Date().toISOString() })
        .eq("id", quote.customer_id);

      // Log activity
      await supabase.from("activity_log").insert([{
        customer_id: quote.customer_id,
        type: "note",
        notes: `Quote ${newStatus === "sent" ? "sent to customer" : newStatus}. ${amount ? `Amount: ${amount}` : ""}`,
        created_by: "ShadeLogic",
      }]);
    }

    setSaving(false);
  }

  // ── Render ─────────────────────────────────────────────────

  if (loading) return <div className="p-4 text-sm text-gray-400">Loading…</div>;
  if (!quote)  return <div className="p-4 text-sm text-gray-400">Quote not found.</div>;

  const customerName = [customer?.first_name, customer?.last_name].filter(Boolean).join(" ");
  const statusInfo   = STATUSES.find(s => s.value === quote.status) ?? STATUSES[0];

  return (
    <main className="min-h-screen bg-white p-4 text-black text-sm">
      <div className="mx-auto max-w-2xl space-y-4">

        {/* Back */}
        <Link href={`/customers/${quote.customer_id}`} className="text-blue-600 hover:underline text-sm">
          ← Back to {customerName}
        </Link>

        {/* New quote banner */}
        {(Date.now() - new Date(quote.created_at).getTime()) < 90000 && (
          <div className="rounded-lg bg-orange-500 text-white px-4 py-3">
            <div className="font-bold text-lg">📋 New Quote Created</div>
            <div className="text-sm opacity-90 mt-0.5">Add the amount and notes, then mark it Sent when ready to share with the customer.</div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              onBlur={() => saveField("title", title || null)}
              placeholder="Quote title…"
              className="text-xl font-bold w-full outline-none border-b border-transparent focus:border-gray-300 pb-0.5"
            />
            <div className="text-xs text-gray-400 mt-1">
              Created {new Date(quote.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              {quote.sent_at && ` · Sent ${new Date(quote.sent_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
            </div>
          </div>
          <span className={`shrink-0 rounded px-2 py-1 text-xs font-semibold ${statusInfo.badge}`}>
            {statusInfo.label}
          </span>
        </div>

        {/* Status progression */}
        <div className="rounded border p-3">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Status</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {STATUSES.map(s => (
              <button
                key={s.value}
                onClick={() => updateStatus(s.value)}
                disabled={saving || s.value === quote.status}
                className={`rounded border py-2 px-2 text-sm font-medium transition-colors ${
                  s.value === quote.status
                    ? "bg-black text-white border-black"
                    : "hover:bg-gray-50 text-gray-600"
                }`}
              >
                {s.label}
                {s.value === "sent" && quote.status !== "sent" && (
                  <div className="text-xs font-normal opacity-60">→ updates lead to Quoted</div>
                )}
                {s.value === "approved" && quote.status !== "approved" && (
                  <div className="text-xs font-normal opacity-60">→ updates lead to Sold</div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Amount */}
        <div className="rounded border p-3">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Quote Amount</div>
          <input
            value={amount}
            onChange={e => setAmount(e.target.value)}
            onBlur={() => saveField("amount", amount || null)}
            placeholder="e.g. $4,200 or TBD"
            className="w-full border rounded px-2 py-1.5 text-sm"
          />
        </div>

        {/* Notes */}
        <div className="rounded border p-3">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Notes</div>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            onBlur={() => saveField("notes", notes || null)}
            rows={5}
            placeholder="Products, options, special notes…"
            className="w-full border rounded px-2 py-1.5 text-sm"
          />
        </div>

        {/* Send quote + actions */}
        <div className="rounded border p-3 space-y-2">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Send Quote</div>
          <a
            href={`sms:?body=${encodeURIComponent(`Hi ${customerName.split(" ")[0]}! Your quote is ready. Amount: ${amount || "TBD"}. ${notes ? notes.slice(0, 120) : ""} Reply with any questions!`)}`}
            className="flex items-center gap-2 w-full rounded border border-green-500 text-green-700 px-3 py-2 text-sm hover:bg-green-50">
            💬 Send via Text
          </a>
          <a
            href={`mailto:?subject=${encodeURIComponent(`Your Quote — ${title || "ShadeLogic"}`)}&body=${encodeURIComponent(`Hi ${customerName.split(" ")[0]},\n\nYour quote is ready!\n\nAmount: ${amount || "TBD"}\n\n${notes || ""}\n\nReply with any questions.\n\nThank you!`)}`}
            className="flex items-center gap-2 w-full rounded border px-3 py-2 text-sm hover:bg-gray-50">
            📧 Send via Email
          </a>
          <Link
            href={`/schedule?customerId=${quote.customer_id}&customerName=${encodeURIComponent(customerName)}`}
            className="flex items-center gap-2 w-full rounded border px-3 py-2 text-sm hover:bg-gray-50">
            📅 Schedule Appointment
          </Link>
        </div>

      </div>
    </main>
  );
}
