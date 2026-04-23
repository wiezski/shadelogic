"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

// ── Types ─────────────────────────────────────────────────────

type Reminder = {
  id: string;
  type:
    | "quote_expiring"
    | "deposit_overdue"
    | "balance_overdue"
    | "quote_followup"
    | "materials_not_ordered"
    | "stuck_lead"
    | "measured_no_quote"
    | "upcoming_appointment"
    | "signature_prompt";
  priority: "urgent" | "high" | "normal";
  title: string;
  subtitle: string;
  link: string;
  days: number; // days old OR minutes-until for upcoming
  meta?: {
    phone?: string | null;
    address?: string | null;
    customerName?: string | null;
  };
};

type UnmatchedEmail = {
  id: string;
  from_email: string | null;
  subject: string | null;
  order_number: string | null;
  tracking_number: string | null;
  detected_status: string | null;
  created_at: string;
};

// ── Color helpers (softened, per DESIGN.md) ───────────────────
// Muted rose instead of saturated red; calm amber; muted neutral.
function dotColor(priority: Reminder["priority"]): string {
  if (priority === "urgent") return "#c87070";
  if (priority === "high") return "var(--zr-warning)";
  return "rgba(60,60,67,0.3)";
}

// ── Unmatched emails, calmer treatment ─────────────────────────

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

  return (
    <section className="mb-5">
      <button onClick={() => setExpanded(v => !v)}
        className="flex items-baseline gap-2 px-5 transition-opacity active:opacity-60 w-full text-left">
        <span className="zr-v2-section-label" style={{ padding: 0 }}>
          Unmatched order emails · {emails.length}
        </span>
        <span style={{ fontSize: "12px", color: "rgba(60,60,67,0.45)", paddingBottom: 10 }}>
          {expanded ? "Hide" : "Review"}
        </span>
      </button>
      {expanded && (
        <div>
          {emails.map((e, i, arr) => (
            <div key={e.id}
              style={{
                padding: "14px 20px",
                borderBottom: i < arr.length - 1 ? "0.5px solid rgba(60,60,67,0.08)" : "none",
              }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div style={{ fontSize: "15px", fontWeight: 600, color: "var(--zr-text-primary)", letterSpacing: "-0.015em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {e.subject ?? "(no subject)"}
                  </div>
                  <div style={{ fontSize: "12.5px", color: "rgba(60,60,67,0.55)", marginTop: 2 }}>
                    From {e.from_email ?? "unknown"}
                  </div>
                  <div style={{ fontSize: "12.5px", color: "rgba(60,60,67,0.45)", marginTop: 4 }}>
                    {[
                      e.order_number && `Order #${e.order_number}`,
                      e.tracking_number && `Track ${e.tracking_number}`,
                      e.detected_status,
                    ].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <button onClick={() => dismiss(e.id)}
                  style={{ color: "rgba(60,60,67,0.5)", fontSize: "13px", fontWeight: 500, letterSpacing: "-0.012em" }}
                  className="shrink-0 transition-opacity active:opacity-60">
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ── Main page ─────────────────────────────────────────────────

export default function RemindersPage() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    load();
    // Refresh every 2 minutes so upcoming-appointment reminders stay current
    const t = setInterval(load, 120_000);
    return () => clearInterval(t);
  }, []);

  async function load() {
    setLoading(true);
    const all: Reminder[] = [];
    const now = Date.now();

    // Build a small customer-name cache we can share across queries
    const custMap: Record<string, { name: string; phone: string | null; address: string | null }> = {};
    async function primeCustomers(ids: string[]) {
      const missing = ids.filter(id => id && !custMap[id]);
      if (missing.length === 0) return;
      const { data: custs } = await supabase
        .from("customers")
        .select("id, first_name, last_name, phone, address")
        .in("id", missing);
      (custs || []).forEach((c: { id: string; first_name: string | null; last_name: string | null; phone: string | null; address: string | null }) => {
        custMap[c.id] = {
          name: [c.first_name, c.last_name].filter(Boolean).join(" "),
          phone: c.phone,
          address: c.address,
        };
      });
    }

    // ─────────────────────────────────────────────────────────────
    // Upcoming appointments (next 3 hours) — "Heading to X" reminders.
    // Surface on the reminders page with quick Text / Directions actions.
    // ─────────────────────────────────────────────────────────────
    const windowEnd = new Date(now + 3 * 60 * 60 * 1000).toISOString();
    const { data: upcoming } = await supabase
      .from("appointments")
      .select("id, customer_id, type, scheduled_at, duration_minutes, address, status")
      .gte("scheduled_at", new Date(now).toISOString())
      .lte("scheduled_at", windowEnd)
      .not("status", "in", '("canceled","completed")')
      .order("scheduled_at", { ascending: true })
      .limit(10);

    if (upcoming && upcoming.length > 0) {
      await primeCustomers(upcoming.map((a: { customer_id: string }) => a.customer_id));
      upcoming.forEach((a: { id: string; customer_id: string; type: string | null; scheduled_at: string; duration_minutes: number | null; address: string | null; status: string }) => {
        const startMs = new Date(a.scheduled_at).getTime();
        const minsAway = Math.round((startMs - now) / 60000);
        const c = custMap[a.customer_id];
        const name = c?.name || "Customer";
        const addr = a.address || c?.address || null;
        all.push({
          id: `appt_${a.id}`,
          type: "upcoming_appointment",
          // Inside 30 min = urgent reminder to leave soon
          priority: minsAway <= 30 ? "urgent" : minsAway <= 60 ? "high" : "normal",
          title: `${a.type || "Appointment"} — ${name}`,
          subtitle: minsAway <= 0
            ? "Now"
            : minsAway < 60
              ? `In ${minsAway} min · ${new Date(a.scheduled_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
              : `${new Date(a.scheduled_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · ${addr ?? "no address"}`,
          link: `/schedule`,
          days: minsAway, // minutes-until for this type
          meta: { phone: c?.phone ?? null, address: addr, customerName: name },
        });
      });
    }

    // ─────────────────────────────────────────────────────────────
    // Signature prompts — appointments that ended in the last 2 hours
    // with an approved quote that isn't signed yet. When the job wraps
    // up on site, the installer should be prompted to collect signature.
    // ─────────────────────────────────────────────────────────────
    const recentEnd = new Date(now - 2 * 60 * 60 * 1000).toISOString();
    const { data: recentAppts } = await supabase
      .from("appointments")
      .select("id, customer_id, type, scheduled_at, duration_minutes, status")
      .gte("scheduled_at", recentEnd)
      .lte("scheduled_at", new Date(now).toISOString())
      .not("status", "in", '("canceled")')
      .order("scheduled_at", { ascending: false })
      .limit(20);

    if (recentAppts && recentAppts.length > 0) {
      // Find the most recent install/measure appointment per customer
      const perCust = new Map<string, { id: string; customer_id: string; type: string | null; scheduled_at: string; duration_minutes: number | null }>();
      recentAppts.forEach((a: { id: string; customer_id: string; type: string | null; scheduled_at: string; duration_minutes: number | null }) => {
        const t = (a.type || "").toLowerCase();
        if (!t.includes("install") && !t.includes("measure")) return;
        if (!perCust.has(a.customer_id)) perCust.set(a.customer_id, a);
      });
      const custIds = Array.from(perCust.keys());
      if (custIds.length > 0) {
        await primeCustomers(custIds);
        const { data: openQuotes } = await supabase
          .from("quotes")
          .select("id, customer_id, status, signed_at, title")
          .in("customer_id", custIds)
          .in("status", ["sent", "approved"]);
        (openQuotes || []).forEach((q: { id: string; customer_id: string; status: string; signed_at: string | null; title: string | null }) => {
          if (q.signed_at) return;
          const a = perCust.get(q.customer_id);
          if (!a) return;
          const endMs = new Date(a.scheduled_at).getTime() + (a.duration_minutes || 60) * 60000;
          const minsSinceEnd = Math.round((now - endMs) / 60000);
          // Prompt starts 30 min before scheduled end; stays visible up to 2h after
          if (minsSinceEnd < -30 || minsSinceEnd > 120) return;
          const c = custMap[q.customer_id];
          const name = c?.name || "Customer";
          all.push({
            id: `sig_${q.id}`,
            type: "signature_prompt",
            priority: "urgent",
            title: `Collect signature — ${name}`,
            subtitle: minsSinceEnd < 0
              ? `Job ends in ${Math.abs(minsSinceEnd)} min`
              : `Job ended ${minsSinceEnd} min ago`,
            link: `/quotes/${q.id}`,
            days: 0,
            meta: { phone: c?.phone ?? null, customerName: name },
          });
        });
      }
    }

    // ── Approved quotes: deposit not collected ─────────────────
    const { data: approvedQuotes } = await supabase
      .from("quotes")
      .select("id, title, customer_id, total, deposit_paid, balance_paid, sent_at, created_at")
      .eq("status", "approved");

    if (approvedQuotes && approvedQuotes.length > 0) {
      await primeCustomers(approvedQuotes.map((q: { customer_id: string }) => q.customer_id));
      approvedQuotes.forEach((q: { id: string; customer_id: string; total: number | null; deposit_paid: boolean; balance_paid: boolean; created_at: string }) => {
        const days = Math.floor((now - new Date(q.created_at).getTime()) / 86400000);
        const c = custMap[q.customer_id];
        const name = c?.name || "Unknown";
        if (!q.deposit_paid && days >= 3) {
          all.push({
            id: q.id,
            type: "deposit_overdue",
            priority: days >= 14 ? "urgent" : days >= 7 ? "high" : "normal",
            title: `Deposit not collected — ${name}`,
            subtitle: `$${(q.total || 0).toFixed(0)} approved ${days}d ago`,
            link: `/quotes/${q.id}`, days,
            meta: { phone: c?.phone ?? null, customerName: name },
          });
        } else if (q.deposit_paid && !q.balance_paid && days >= 30) {
          all.push({
            id: q.id + "_bal",
            type: "balance_overdue",
            priority: days >= 60 ? "urgent" : "high",
            title: `Balance not collected — ${name}`,
            subtitle: `Deposit paid, balance due ${days}d ago`,
            link: `/quotes/${q.id}`, days,
            meta: { phone: c?.phone ?? null, customerName: name },
          });
        }
      });
    }

    // ── Sent quotes: no response after 3+ days ─────────────────
    const { data: sentQuotes } = await supabase
      .from("quotes")
      .select("id, title, customer_id, sent_at, expires_at, created_at, valid_days")
      .eq("status", "sent");

    if (sentQuotes && sentQuotes.length > 0) {
      await primeCustomers(sentQuotes.map((q: { customer_id: string }) => q.customer_id));
      sentQuotes.forEach((q: { id: string; customer_id: string; sent_at: string | null; expires_at: string | null; created_at: string; valid_days: number | null }) => {
        const sentDate = q.sent_at ?? q.created_at;
        const days = Math.floor((now - new Date(sentDate).getTime()) / 86400000);
        const c = custMap[q.customer_id];
        const name = c?.name || "Unknown";

        const expiry = q.expires_at
          ? new Date(q.expires_at)
          : (() => { const d = new Date(q.created_at); d.setDate(d.getDate() + (q.valid_days || 30)); return d; })();
        const daysLeft = Math.ceil((expiry.getTime() - now) / 86400000);
        if (daysLeft <= 5 && daysLeft > 0) {
          all.push({
            id: q.id + "_exp",
            type: "quote_expiring",
            priority: daysLeft <= 2 ? "urgent" : "high",
            title: `Quote expiring in ${daysLeft}d — ${name}`,
            subtitle: `Sent ${days}d ago — follow up before it expires`,
            link: `/quotes/${q.id}`, days: daysLeft,
            meta: { phone: c?.phone ?? null, customerName: name },
          });
        } else if (days >= 3) {
          all.push({
            id: q.id + "_fu",
            type: "quote_followup",
            priority: days >= 10 ? "high" : "normal",
            title: `Quote follow-up — ${name}`,
            subtitle: `Quote sent ${days}d ago, no response yet`,
            link: `/quotes/${q.id}`, days,
            meta: { phone: c?.phone ?? null, customerName: name },
          });
        }
      });
    }

    // ── Approved quotes: materials not ordered ─────────────────
    const { data: approvedIds } = await supabase
      .from("quotes").select("id, customer_id, created_at").eq("status", "approved");
    if (approvedIds && approvedIds.length > 0) {
      const qIds = approvedIds.map((q: { id: string }) => q.id);
      const { data: mats } = await supabase
        .from("quote_materials").select("quote_id, status").in("quote_id", qIds);
      const matsByQuote: Record<string, string[]> = {};
      (mats || []).forEach((m: { quote_id: string; status: string }) => {
        if (!matsByQuote[m.quote_id]) matsByQuote[m.quote_id] = [];
        matsByQuote[m.quote_id].push(m.status);
      });
      approvedIds.forEach((q: { id: string; customer_id: string; created_at: string }) => {
        const days = Math.floor((now - new Date(q.created_at).getTime()) / 86400000);
        const qMats = matsByQuote[q.id] ?? [];
        const hasUnordered = qMats.some(s => s === "not_ordered");
        const noMats = qMats.length === 0;
        const c = custMap[q.customer_id];
        const name = c?.name || "Unknown";
        if ((noMats || hasUnordered) && days >= 2) {
          all.push({
            id: q.id + "_mat",
            type: "materials_not_ordered",
            priority: days >= 7 ? "high" : "normal",
            title: `Materials not ordered — ${name}`,
            subtitle: `Job approved ${days}d ago — order from Materials tab`,
            link: `/quotes/${q.id}`, days,
          });
        }
      });
    }

    // ── Measured but no quote yet ──────────────────────────────
    const { data: measuredCusts } = await supabase
      .from("customers")
      .select("id, first_name, last_name, phone, address, last_activity_at")
      .eq("lead_status", "Measured");
    (measuredCusts || []).forEach((c: { id: string; first_name: string | null; last_name: string | null; phone: string | null; address: string | null; last_activity_at: string | null }) => {
      const ref = c.last_activity_at ?? "";
      if (!ref) return;
      const days = Math.floor((now - new Date(ref).getTime()) / 86400000);
      if (days >= 2) {
        all.push({
          id: c.id + "_mq",
          type: "measured_no_quote",
          priority: days >= 7 ? "high" : "normal",
          title: `Send quote — ${[c.first_name, c.last_name].filter(Boolean).join(" ")}`,
          subtitle: `Measured ${days}d ago — quote not sent`,
          link: `/customers/${c.id}`, days,
          meta: { phone: c.phone, customerName: [c.first_name, c.last_name].filter(Boolean).join(" ") },
        });
      }
    });

    // Sort: urgent first, then by days desc within priority
    const ORDER = { urgent: 0, high: 1, normal: 2 };
    all.sort((a, b) => ORDER[a.priority] - ORDER[b.priority] || b.days - a.days);
    setReminders(all);
    setLoading(false);
  }

  const upcoming = reminders.filter(r => r.type === "upcoming_appointment" || r.type === "signature_prompt");
  const urgent   = reminders.filter(r => r.priority === "urgent" && r.type !== "upcoming_appointment" && r.type !== "signature_prompt");
  const high     = reminders.filter(r => r.priority === "high" && r.type !== "upcoming_appointment" && r.type !== "signature_prompt");
  const normal   = reminders.filter(r => r.priority === "normal" && r.type !== "upcoming_appointment" && r.type !== "signature_prompt");

  function ReminderRow({ r, isLast }: { r: Reminder; isLast: boolean }) {
    const hasPhone = !!r.meta?.phone;
    const hasAddr = !!r.meta?.address;
    const phoneClean = r.meta?.phone?.replace(/\D/g, "") || "";
    const textUrl = hasPhone
      ? `sms:${phoneClean}${/iPhone|iPad|iPod/i.test(typeof navigator !== "undefined" ? navigator.userAgent : "") ? "&" : "?"}body=${encodeURIComponent(
          r.type === "upcoming_appointment"
            ? `Hi ${(r.meta?.customerName || "").split(" ")[0]}, I'm on my way.`
            : `Hi ${(r.meta?.customerName || "").split(" ")[0]}, just checking in.`
        )}`
      : "";
    const dirsUrl = hasAddr ? `https://maps.google.com/?q=${encodeURIComponent(r.meta!.address!)}` : "";

    return (
      <div style={{
        padding: "14px 20px",
        borderBottom: isLast ? "none" : "0.5px solid rgba(60,60,67,0.08)",
      }}>
        <Link href={r.link} style={{ display: "block", textDecoration: "none", color: "inherit" }}
          className="zr-ios-row transition-opacity active:opacity-60">
          <div className="flex items-start gap-3">
            <span style={{
              flexShrink: 0,
              width: 7, height: 7, borderRadius: "50%",
              background: dotColor(r.priority),
              marginTop: 7,
            }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{
                fontSize: "15px", fontWeight: 600,
                color: r.priority === "urgent" ? "#b43a3a" : "var(--zr-text-primary)",
                letterSpacing: "-0.015em", lineHeight: 1.3,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>
                {r.title}
              </div>
              <div style={{
                fontSize: "13px", color: "rgba(60,60,67,0.55)", marginTop: 2,
                letterSpacing: "-0.005em", lineHeight: 1.35,
              }}>
                {r.subtitle}
              </div>
            </div>
            {r.type !== "upcoming_appointment" && r.type !== "signature_prompt" && r.days > 0 && (
              <span style={{
                flexShrink: 0, fontSize: "12px", color: "rgba(60,60,67,0.45)",
                fontVariantNumeric: "tabular-nums", marginTop: 2,
              }}>
                {r.days}d
              </span>
            )}
          </div>
        </Link>
        {/* Quick actions — Text / Directions for rows that have phone/address */}
        {(hasPhone || hasAddr) && (
          <div className="flex items-center gap-5 mt-2" style={{ paddingLeft: 19 }}>
            {hasPhone && (
              <a href={textUrl}
                className="transition-opacity active:opacity-60 inline-flex items-center gap-1.5"
                style={{ color: "var(--zr-orange)", fontSize: "13px", fontWeight: 600, letterSpacing: "-0.012em", textDecoration: "none" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                Text
              </a>
            )}
            {hasAddr && (
              <a href={dirsUrl} target="_blank" rel="noreferrer"
                className="transition-opacity active:opacity-60 inline-flex items-center gap-1.5"
                style={{ color: "var(--zr-info)", fontSize: "13px", fontWeight: 600, letterSpacing: "-0.012em", textDecoration: "none" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="3 11 22 2 13 21 11 13 3 11" />
                </svg>
                Directions
              </a>
            )}
          </div>
        )}
      </div>
    );
  }

  function Section({ label, items }: { label: string; items: Reminder[] }) {
    if (items.length === 0) return null;
    return (
      <section className="mb-5">
        <div className="mb-1 px-5">
          <span className="zr-v2-section-label" style={{ padding: 0 }}>
            {label} · {items.length}
          </span>
        </div>
        <div>
          {items.map((r, i, arr) => (
            <ReminderRow key={r.id} r={r} isLast={i === arr.length - 1} />
          ))}
        </div>
      </section>
    );
  }

  return (
    <main style={{ background: "var(--zr-canvas)", color: "var(--zr-text-primary)" }} className="min-h-screen pt-2 pb-24 text-sm">
      <div className="mx-auto max-w-2xl px-4 sm:px-6">
        {/* iOS back */}
        <div className="mb-3">
          <Link href="/" style={{ color: "var(--zr-orange)", display: "inline-flex", alignItems: "center", gap: 2, fontSize: "15px", fontWeight: 400, letterSpacing: "-0.012em" }}
            className="transition-opacity active:opacity-60">
            <svg width="10" height="16" viewBox="0 0 10 16" fill="none" style={{ marginRight: 2 }}>
              <path d="M8 1 L2 8 L8 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Home
          </Link>
        </div>

        <div className="mb-5 px-1">
          <h1 style={{ fontSize: "28px", fontWeight: 700, letterSpacing: "-0.025em", color: "var(--zr-text-primary)", lineHeight: 1.15 }}>
            Reminders
          </h1>
          <p style={{ fontSize: "13px", color: "rgba(60,60,67,0.55)", marginTop: 4, letterSpacing: "-0.005em" }}>
            {loading ? "Loading…" : reminders.length === 0 ? "All caught up" : `${reminders.length} need attention`}
          </p>
        </div>

        <UnmatchedEmailsSection />

        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {[1,2,3].map(i => (
              <div key={i} style={{ padding: "14px 20px", borderBottom: i < 3 ? "0.5px solid rgba(60,60,67,0.08)" : "none" }}>
                <div className="zr-skeleton" style={{ width: "45%", height: 14, borderRadius: 4 }} />
                <div className="zr-skeleton" style={{ width: "65%", height: 11, borderRadius: 4, marginTop: 6 }} />
              </div>
            ))}
          </div>
        ) : reminders.length === 0 ? (
          <div className="text-center" style={{ padding: "48px 20px", color: "rgba(60,60,67,0.5)" }}>
            <p style={{ fontSize: "14px", letterSpacing: "-0.005em" }}>Nothing needs attention right now.</p>
          </div>
        ) : (
          <>
            <Section label="Happening now" items={upcoming} />
            <Section label="Urgent"         items={urgent} />
            <Section label="Action needed"  items={high} />
            <Section label="Follow up"      items={normal} />
          </>
        )}
      </div>
    </main>
  );
}
