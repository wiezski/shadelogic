"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

// ── Unmatched email inbox ─────────────────────────────────────

type UnmatchedEmail = {
  id: string;
  from_email: string | null;
  subject: string | null;
  order_number: string | null;
  tracking_number: string | null;
  detected_status: string | null;
  created_at: string;
};

function UnmatchedEmailsSection() {
  const [emails,   setEmails]   = useState<UnmatchedEmail[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    const { data } = await supabase.from("email_order_inbox")
      .select("id, from_email, subject, order_number, tracking_number, detected_status, created_at")
      .eq("reviewed", false).order("created_at", { ascending: false }).limit(20);
    setEmails((data || []) as UnmatchedEmail[]);
    setLoading(false);
  }

  async function dismiss(id: string) {
    await supabase.from("email_order_inbox").update({ reviewed: true }).eq("id", id);
    setEmails(prev => prev.filter(e => e.id !== id));
  }

  if (loading || emails.length === 0) return null;

  const STATUS_BADGE: Record<string, string> = {
    ordered:  "bg-blue-100 text-blue-700",
    shipped:  "bg-amber-100 text-amber-700",
    received: "bg-green-100 text-green-700",
  };

  return (
    <section>
      <button onClick={() => setExpanded(v => !v)}
        className="flex items-center gap-2 mb-2 w-full text-left">
        <h2 className="font-semibold text-sm text-purple-600">📦 Unmatched Order Emails</h2>
        <span className="text-xs rounded bg-purple-100 text-purple-700 px-1.5 py-0.5">{emails.length}</span>
        <span className="text-xs text-gray-400 ml-1">{expanded ? "▲" : "▼ tap to review"}</span>
      </button>
      {expanded && (
        <ul className="space-y-2">
          {emails.map(e => (
            <li key={e.id} className="rounded border border-purple-200 bg-purple-50 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{e.subject ?? "(no subject)"}</div>
                  <div className="text-xs text-gray-500">From: {e.from_email ?? "unknown"}</div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {e.order_number && <span className="text-xs bg-white border rounded px-1.5 py-0.5">Order #{e.order_number}</span>}
                    {e.tracking_number && <span className="text-xs bg-white border rounded px-1.5 py-0.5">Track: {e.tracking_number}</span>}
                    {e.detected_status && <span className={`text-xs rounded px-1.5 py-0.5 ${STATUS_BADGE[e.detected_status] ?? "bg-gray-100 text-gray-600"}`}>{e.detected_status}</span>}
                  </div>
                  <div className="text-xs text-purple-600 mt-1">
                    Add the order number to a quote's Materials tab to enable auto-matching next time.
                  </div>
                </div>
                <button onClick={() => dismiss(e.id)} className="text-xs text-gray-400 hover:text-red-400 shrink-0">Dismiss</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type Reminder = {
  id: string;
  type: "quote_expiring" | "deposit_overdue" | "balance_overdue" | "quote_followup" | "materials_not_ordered" | "stuck_lead" | "measured_no_quote";
  priority: "urgent" | "high" | "normal";
  title: string;
  subtitle: string;
  link: string;
  days: number;
};

const PRIORITY_STYLE: Record<string, string> = {
  urgent: "border-red-300 bg-red-50",
  high:   "border-amber-300 bg-amber-50",
  normal: "border-gray-200 bg-white",
};

const TYPE_ICON: Record<string, string> = {
  quote_expiring:        "⏰",
  deposit_overdue:       "💰",
  balance_overdue:       "💵",
  quote_followup:        "📋",
  materials_not_ordered: "📦",
  stuck_lead:            "⚠️",
  measured_no_quote:     "📐",
};

export default function RemindersPage() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const all: Reminder[] = [];
    const now = Date.now();

    // ── Approved quotes: deposit not collected ─────────────────
    const { data: approvedQuotes } = await supabase
      .from("quotes")
      .select("id, title, customer_id, total, deposit_paid, balance_paid, sent_at, created_at")
      .eq("status", "approved");

    const quoteCustomerIds = [...new Set((approvedQuotes || []).map((q: any) => q.customer_id))];
    const custMap: Record<string, string> = {};
    if (quoteCustomerIds.length > 0) {
      const { data: custs } = await supabase.from("customers").select("id, first_name, last_name").in("id", quoteCustomerIds);
      (custs || []).forEach((c: any) => { custMap[c.id] = [c.first_name, c.last_name].filter(Boolean).join(" "); });
    }

    (approvedQuotes || []).forEach((q: any) => {
      const days = Math.floor((now - new Date(q.created_at).getTime()) / 86400000);
      const name = custMap[q.customer_id] ?? "Unknown";
      if (!q.deposit_paid && days >= 3) {
        all.push({
          id: q.id, type: "deposit_overdue",
          priority: days >= 14 ? "urgent" : days >= 7 ? "high" : "normal",
          title: `Deposit not collected — ${name}`,
          subtitle: `$${(q.total || 0).toFixed(0)} job approved ${days}d ago`,
          link: `/quotes/${q.id}`, days,
        });
      } else if (q.deposit_paid && !q.balance_paid && days >= 30) {
        all.push({
          id: q.id + "_bal", type: "balance_overdue",
          priority: days >= 60 ? "urgent" : "high",
          title: `Balance not collected — ${name}`,
          subtitle: `Deposit paid, balance due ${days}d ago`,
          link: `/quotes/${q.id}`, days,
        });
      }
    });

    // ── Sent quotes: no response after 3+ days ─────────────────
    const { data: sentQuotes } = await supabase
      .from("quotes").select("id, title, customer_id, sent_at, expires_at, created_at, valid_days")
      .eq("status", "sent");

    const sentCustIds = [...new Set((sentQuotes || []).map((q: any) => q.customer_id))];
    if (sentCustIds.length > 0) {
      const { data: c2 } = await supabase.from("customers").select("id, first_name, last_name").in("id", sentCustIds);
      (c2 || []).forEach((c: any) => { custMap[c.id] = [c.first_name, c.last_name].filter(Boolean).join(" "); });
    }

    (sentQuotes || []).forEach((q: any) => {
      const sentDate = q.sent_at ?? q.created_at;
      const days     = Math.floor((now - new Date(sentDate).getTime()) / 86400000);
      const name     = custMap[q.customer_id] ?? "Unknown";

      // Expiring soon
      const expiry = q.expires_at
        ? new Date(q.expires_at)
        : (() => { const d = new Date(q.created_at); d.setDate(d.getDate() + (q.valid_days || 30)); return d; })();
      const daysLeft = Math.ceil((expiry.getTime() - now) / 86400000);
      if (daysLeft <= 5 && daysLeft > 0) {
        all.push({
          id: q.id + "_exp", type: "quote_expiring",
          priority: daysLeft <= 2 ? "urgent" : "high",
          title: `Quote expiring in ${daysLeft}d — ${name}`,
          subtitle: `Sent ${days}d ago — follow up before it expires`,
          link: `/quotes/${q.id}`, days: daysLeft,
        });
      } else if (days >= 3) {
        all.push({
          id: q.id + "_fu", type: "quote_followup",
          priority: days >= 10 ? "high" : "normal",
          title: `Quote follow-up — ${name}`,
          subtitle: `Quote sent ${days}d ago, no response yet`,
          link: `/quotes/${q.id}`, days,
        });
      }
    });

    // ── Approved quotes: materials not ordered ─────────────────
    const { data: approvedIds } = await supabase
      .from("quotes").select("id, customer_id, created_at").eq("status", "approved");
    if (approvedIds && approvedIds.length > 0) {
      const qIds = approvedIds.map((q: any) => q.id);
      const { data: mats } = await supabase
        .from("quote_materials").select("quote_id, status").in("quote_id", qIds);
      const matsByQuote: Record<string, string[]> = {};
      (mats || []).forEach((m: any) => {
        if (!matsByQuote[m.quote_id]) matsByQuote[m.quote_id] = [];
        matsByQuote[m.quote_id].push(m.status);
      });
      (approvedIds || []).forEach((q: any) => {
        const days = Math.floor((now - new Date(q.created_at).getTime()) / 86400000);
        const qMats = matsByQuote[q.id] ?? [];
        const hasUnordered = qMats.some(s => s === "not_ordered");
        const noMats = qMats.length === 0;
        const name = custMap[q.customer_id] ?? "Unknown";
        if ((noMats || hasUnordered) && days >= 2) {
          all.push({
            id: q.id + "_mat", type: "materials_not_ordered",
            priority: days >= 7 ? "high" : "normal",
            title: `Materials not ordered — ${name}`,
            subtitle: `Job approved ${days}d ago — order from Materials tab on quote`,
            link: `/quotes/${q.id}`, days,
          });
        }
      });
    }

    // ── Measured but no quote yet ──────────────────────────────
    const { data: measuredCusts } = await supabase
      .from("customers")
      .select("id, first_name, last_name, last_activity_at")
      .eq("lead_status", "Measured");
    (measuredCusts || []).forEach((c: any) => {
      const ref  = c.last_activity_at ?? "";
      if (!ref) return;
      const days = Math.floor((now - new Date(ref).getTime()) / 86400000);
      if (days >= 2) {
        all.push({
          id: c.id + "_mq", type: "measured_no_quote",
          priority: days >= 7 ? "high" : "normal",
          title: `Send quote — ${[c.first_name, c.last_name].filter(Boolean).join(" ")}`,
          subtitle: `Measured ${days}d ago — quote not yet sent`,
          link: `/customers/${c.id}`, days,
        });
      }
    });

    // Sort: urgent first, then by days desc
    const ORDER = { urgent: 0, high: 1, normal: 2 };
    all.sort((a, b) => ORDER[a.priority] - ORDER[b.priority] || b.days - a.days);
    setReminders(all);
    setLoading(false);
  }

  const urgent = reminders.filter(r => r.priority === "urgent");
  const high   = reminders.filter(r => r.priority === "high");
  const normal = reminders.filter(r => r.priority === "normal");

  function Section({ title, items, color }: { title: string; items: Reminder[]; color: string }) {
    if (items.length === 0) return null;
    return (
      <section>
        <div className="flex items-center gap-2 mb-2">
          <h2 className={`font-semibold text-sm ${color}`}>{title}</h2>
          <span className={`text-xs rounded px-1.5 py-0.5 ${color === "text-red-600" ? "bg-red-100 text-red-700" : color === "text-amber-600" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600"}`}>
            {items.length}
          </span>
        </div>
        <ul className="space-y-2">
          {items.map(r => (
            <li key={r.id}>
              <Link href={r.link}
                className={`flex items-start gap-3 rounded border p-3 hover:brightness-95 ${PRIORITY_STYLE[r.priority]}`}>
                <span className="text-lg shrink-0 mt-0.5">{TYPE_ICON[r.type]}</span>
                <div className="min-w-0">
                  <div className="font-medium text-sm">{r.title}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{r.subtitle}</div>
                </div>
                <span className="shrink-0 text-xs text-gray-400 ml-auto">{r.days}d</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <main style={{ background: "var(--zr-black)", color: "var(--zr-text-primary)" }} className="min-h-screen p-4 text-sm">
      <div className="mx-auto max-w-2xl space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Reminders</h1>
          <span className="text-xs text-gray-400">{loading ? "…" : `${reminders.length} items`}</span>
        </div>

        <UnmatchedEmailsSection />

        {loading ? <p style={{ color: "var(--zr-text-secondary)" }} >Loading…</p> : reminders.length === 0 ? (
          <div style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }} className="rounded p-8 text-center text-gray-400">
            <div className="text-3xl mb-2">✓</div>
            <div className="font-medium">You're all caught up</div>
            <div className="text-xs mt-1">Nothing needs attention right now.</div>
          </div>
        ) : (
          <>
            <Section title="Urgent" items={urgent} color="text-red-600" />
            <Section title="Action Needed" items={high}   color="text-amber-600" />
            <Section title="Follow Up"     items={normal} color="text-gray-700" />
          </>
        )}
      </div>
    </main>
  );
}
