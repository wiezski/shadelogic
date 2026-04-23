"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Google Reviews — SCAFFOLDING
//
// This page is intentionally a skeleton for a future Google Business Profile
// integration. It does NOT currently call the Google API. What it does:
//
//   1. Lets the owner save a Google Place ID for the company (localStorage
//      today; migrate to a settings table when the real integration ships).
//   2. Shows an empty state with a clear "Connect Google Business Profile"
//      call-to-action. The CTA is a placeholder — wiring it up to OAuth is
//      a future task.
//   3. Provides a review-request composer: pick a customer, send via Text
//      or Email. Uses existing sms:/mailto: deep links, so it works today
//      without any backend changes.
//   4. Logs each request to the existing `activity_log` table so you can
//      see who's been asked when.
//
// INTEGRATION POINTS (for when you wire up the real Google API):
//   - `fetchReviews()` — currently returns []. Replace with a call to
//     /api/google-reviews?placeId=X that hits the Google Places API on the
//     server and caches results.
//   - `google_place_id` — currently stored in localStorage; migrate to
//     company_settings.google_place_id + an RLS-safe field.
//   - `sendReviewRequest()` — currently opens the user's SMS/email app.
//     For automated follow-ups, swap to a server-side send via your email
//     provider + a cron that fires on intervals.
// ─────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../auth-provider";

type Customer = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  lead_status: string | null;
  last_activity_at: string | null;
};

type ReviewRequestLog = {
  id: string;
  customer_id: string;
  customer_name: string;
  channel: "text" | "email";
  sent_at: string;
};

const PLACE_ID_KEY = "zr-google-place-id";
const REVIEW_LOG_KEY = "zr-review-request-log"; // fallback when DB table not yet migrated

function readLocalPlaceId(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(PLACE_ID_KEY) || "";
}
function writeLocalPlaceId(v: string) {
  if (typeof window === "undefined") return;
  if (v) localStorage.setItem(PLACE_ID_KEY, v);
  else localStorage.removeItem(PLACE_ID_KEY);
}
function readLocalLog(): ReviewRequestLog[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(REVIEW_LOG_KEY) || "[]"); }
  catch { return []; }
}
function appendLocalLog(entry: ReviewRequestLog) {
  if (typeof window === "undefined") return;
  const list = readLocalLog();
  list.unshift(entry);
  localStorage.setItem(REVIEW_LOG_KEY, JSON.stringify(list.slice(0, 50)));
}

/** Try to read Place ID from company_settings.google_place_id first;
 *  fall back to localStorage if the column doesn't exist yet. */
async function loadPlaceId(companyId: string | null): Promise<string> {
  if (companyId) {
    try {
      const { data, error } = await supabase
        .from("company_settings")
        .select("google_place_id")
        .eq("company_id", companyId)
        .maybeSingle();
      if (!error && data && (data as { google_place_id?: string | null }).google_place_id) {
        return (data as { google_place_id: string }).google_place_id;
      }
    } catch { /* column probably doesn't exist yet */ }
  }
  return readLocalPlaceId();
}

/** Persist Place ID to DB when possible; always mirror to localStorage
 *  so the "coming soon" scaffolding works before the migration too. */
async function savePlaceId(companyId: string | null, placeId: string) {
  writeLocalPlaceId(placeId);
  if (!companyId) return;
  try {
    await supabase
      .from("company_settings")
      .update({ google_place_id: placeId || null })
      .eq("company_id", companyId);
  } catch { /* column doesn't exist yet — localStorage is the source */ }
}

/** Load review request history. Prefer DB when the table exists. */
async function loadRequestHistory(companyId: string | null): Promise<ReviewRequestLog[]> {
  if (companyId) {
    try {
      const { data, error } = await supabase
        .from("review_requests")
        .select("id, customer_id, channel, sent_at")
        .eq("company_id", companyId)
        .order("sent_at", { ascending: false })
        .limit(20);
      if (!error && data) {
        // Need customer names — batch fetch
        const custIds = [...new Set(data.map((r: { customer_id: string }) => r.customer_id))];
        const { data: custs } = await supabase
          .from("customers")
          .select("id, first_name, last_name")
          .in("id", custIds);
        const nameMap: Record<string, string> = {};
        (custs || []).forEach((c: { id: string; first_name: string | null; last_name: string | null }) => {
          nameMap[c.id] = [c.first_name, c.last_name].filter(Boolean).join(" ");
        });
        return (data as Array<{ id: string; customer_id: string; channel: ReviewRequestLog["channel"]; sent_at: string }>).map(r => ({
          id: r.id,
          customer_id: r.customer_id,
          customer_name: nameMap[r.customer_id] || "Customer",
          channel: r.channel,
          sent_at: r.sent_at,
        }));
      }
    } catch { /* table doesn't exist yet */ }
  }
  return readLocalLog();
}

/** Persist a request. Writes to DB when possible AND to localStorage
 *  so UI updates even on fresh setups. */
async function persistRequest(
  companyId: string | null,
  userId: string | null,
  customer: { id: string; first_name: string | null; last_name: string | null },
  channel: "text" | "email",
): Promise<ReviewRequestLog> {
  const entry: ReviewRequestLog = {
    id: `${customer.id}_${Date.now()}`,
    customer_id: customer.id,
    customer_name: [customer.first_name, customer.last_name].filter(Boolean).join(" "),
    channel,
    sent_at: new Date().toISOString(),
  };
  appendLocalLog(entry);
  if (companyId) {
    try {
      await supabase.from("review_requests").insert([{
        company_id: companyId,
        customer_id: customer.id,
        channel,
        sent_by: userId,
      }]);
    } catch { /* table doesn't exist yet */ }
  }
  return entry;
}

export default function ReviewsPage() {
  const { companyId, user } = useAuth();

  const [placeId, setPlaceId] = useState<string>("");
  const [savedPlaceId, setSavedPlaceId] = useState<string>("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [log, setLog] = useState<ReviewRequestLog[]>([]);
  const [companyName, setCompanyName] = useState("our company");

  // Initial read — localStorage as fast path
  useEffect(() => {
    const saved = readLocalPlaceId();
    setPlaceId(saved);
    setSavedPlaceId(saved);
    setLog(readLocalLog());
  }, []);

  // Full load — prefers DB values once companyId is known
  useEffect(() => {
    if (!companyId) return;
    (async () => {
      setLoading(true);

      // Pull Place ID from DB if available (falls back to localStorage)
      const dbPlaceId = await loadPlaceId(companyId);
      if (dbPlaceId && dbPlaceId !== savedPlaceId) {
        setPlaceId(dbPlaceId);
        setSavedPlaceId(dbPlaceId);
      }

      // Sold / installed customers are best review-request candidates
      const { data } = await supabase
        .from("customers")
        .select("id, first_name, last_name, phone, email, lead_status, last_activity_at")
        .in("lead_status", ["Sold", "Installed", "Complete"])
        .order("last_activity_at", { ascending: false })
        .limit(50);
      setCustomers((data || []) as Customer[]);

      // Company name for message templating
      const { data: comp } = await supabase
        .from("company_settings")
        .select("name")
        .eq("company_id", companyId)
        .maybeSingle();
      if (comp?.name) setCompanyName(comp.name);

      // Request history — DB first, localStorage fallback
      const history = await loadRequestHistory(companyId);
      if (history.length > 0) setLog(history);

      setLoading(false);
    })();
  }, [companyId, savedPlaceId]);

  const selectedCustomer = useMemo(
    () => customers.find(c => c.id === selectedId) || null,
    [customers, selectedId]
  );

  const reviewLink = useMemo(() => {
    // FUTURE: swap for full Google-hosted review URL once the Place ID is
    // verified server-side. This format works for any valid Place ID.
    return savedPlaceId
      ? `https://search.google.com/local/writereview?placeid=${encodeURIComponent(savedPlaceId)}`
      : "";
  }, [savedPlaceId]);

  async function handleSavePlaceId() {
    const clean = placeId.trim();
    await savePlaceId(companyId, clean);
    setSavedPlaceId(clean);
  }

  function messageBody(first: string): string {
    const link = reviewLink || "{your review link here}";
    return `Hi ${first}! Thanks again for choosing ${companyName}. If you've got 30 seconds, would you leave us a Google review? ${link}`;
  }

  async function logRequest(c: Customer, channel: "text" | "email") {
    const entry = await persistRequest(companyId, user?.id ?? null, c, channel);
    setLog(prev => [entry, ...prev]);

    // Also log to activity_log so it shows in the customer timeline.
    try {
      await supabase.from("activity_log").insert([{
        customer_id: c.id,
        type: channel === "text" ? "text" : "email",
        notes: `Review request sent via ${channel}`,
        created_by: "ZeroRemake",
      }]);
    } catch { /* non-critical */ }
  }

  function textUrl(c: Customer): string {
    const phone = (c.phone || "").replace(/\D/g, "");
    const iOS = /iPhone|iPad|iPod/i.test(typeof navigator !== "undefined" ? navigator.userAgent : "");
    return `sms:${phone}${iOS ? "&" : "?"}body=${encodeURIComponent(messageBody(c.first_name || "there"))}`;
  }
  function emailUrl(c: Customer): string {
    const subject = `Quick favor — Google review for ${companyName}`;
    return `mailto:${c.email || ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(messageBody(c.first_name || "there"))}`;
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

        {/* Title */}
        <div className="mb-5 px-1">
          <h1 style={{ fontSize: "28px", fontWeight: 700, letterSpacing: "-0.025em", color: "var(--zr-text-primary)", lineHeight: 1.15 }}>Reviews</h1>
          <p style={{ fontSize: "13px", color: "rgba(60,60,67,0.55)", marginTop: 4, letterSpacing: "-0.005em", lineHeight: 1.35 }}>
            Ask happy customers for a Google review. Track who&apos;s been asked.
          </p>
        </div>

        {/* ── Connect section: Place ID input ────────────────────── */}
        <div className="mb-6">
          <div style={{ fontSize: "11px", color: "rgba(60,60,67,0.55)", fontWeight: 500, letterSpacing: "0.02em", textTransform: "uppercase", marginBottom: 6, paddingLeft: 4 }}>
            Google Business
          </div>
          {savedPlaceId ? (
            <div style={{ padding: "10px 14px", background: "rgba(48,164,108,0.10)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div className="min-w-0">
                <div style={{ fontSize: "13.5px", fontWeight: 600, color: "var(--zr-success)", letterSpacing: "-0.012em" }}>Place ID connected</div>
                <div style={{ fontSize: "12px", color: "rgba(60,60,67,0.55)", fontFamily: "ui-monospace, Menlo, monospace", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {savedPlaceId}
                </div>
              </div>
              <button onClick={() => { setSavedPlaceId(""); setPlaceId(""); savePlaceId(companyId, ""); }}
                style={{ color: "rgba(60,60,67,0.7)", fontSize: "13px", fontWeight: 500, letterSpacing: "-0.012em" }}
                className="transition-opacity active:opacity-60 shrink-0">
                Change
              </button>
            </div>
          ) : (
            <div>
              <p style={{ fontSize: "13px", color: "rgba(60,60,67,0.6)", marginBottom: 8, letterSpacing: "-0.005em", lineHeight: 1.4 }}>
                Paste your Google Place ID. Find it at <a href="https://developers.google.com/maps/documentation/javascript/examples/places-placeid-finder" target="_blank" rel="noreferrer" style={{ color: "var(--zr-orange)", fontWeight: 500 }}>Google&apos;s Place ID finder</a>.
              </p>
              <div className="flex gap-2">
                <input value={placeId} onChange={e => setPlaceId(e.target.value)}
                  placeholder="ChIJ..."
                  style={{
                    flex: 1,
                    background: "rgba(60,60,67,0.06)",
                    color: "var(--zr-text-primary)",
                    fontSize: "14px",
                    letterSpacing: "-0.012em",
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: "none",
                    outline: "none",
                    fontFamily: "ui-monospace, Menlo, monospace",
                  }} />
                <button onClick={handleSavePlaceId} disabled={!placeId.trim()}
                  className="transition-all active:scale-[0.97]"
                  style={{
                    background: "var(--zr-orange)", color: "#fff",
                    fontSize: "14px", fontWeight: 600,
                    padding: "10px 20px", borderRadius: 999,
                    letterSpacing: "-0.012em",
                    opacity: !placeId.trim() ? 0.4 : 1,
                  }}>
                  Save
                </button>
              </div>
              {/* Future: real OAuth connect to Google Business Profile. */}
              <div style={{ fontSize: "12px", color: "rgba(60,60,67,0.45)", marginTop: 8, paddingLeft: 4 }}>
                Full Google Business Profile integration is coming. For now, pasting the Place ID lets you send review request links.
              </div>
            </div>
          )}
        </div>

        {/* ── Request a review ──────────────────────────────────── */}
        <div className="mb-6">
          <div style={{ fontSize: "11px", color: "rgba(60,60,67,0.55)", fontWeight: 500, letterSpacing: "0.02em", textTransform: "uppercase", marginBottom: 6, paddingLeft: 4 }}>
            Request a review
          </div>

          {loading ? (
            <div style={{ padding: "12px 0", fontSize: "13px", color: "rgba(60,60,67,0.5)" }}>Loading customers…</div>
          ) : customers.length === 0 ? (
            <div style={{ padding: "16px 0", fontSize: "13px", color: "rgba(60,60,67,0.5)" }}>
              No sold or installed customers yet. Come back after your first job is complete.
            </div>
          ) : (
            <div>
              {/* Customer picker */}
              <div className="relative mb-3">
                <select value={selectedId} onChange={e => setSelectedId(e.target.value)}
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
                  }}>
                  <option value="">Choose a customer</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>
                      {[c.first_name, c.last_name].filter(Boolean).join(" ")} · {c.lead_status}
                    </option>
                  ))}
                </select>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", color: "var(--zr-text-secondary)", pointerEvents: "none" }}>
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </div>

              {/* Preview + send actions */}
              {selectedCustomer && (
                <div>
                  <div style={{
                    padding: "12px 14px",
                    background: "rgba(60,60,67,0.04)",
                    borderRadius: 12,
                    marginBottom: 12,
                  }}>
                    <div style={{ fontSize: "12px", color: "rgba(60,60,67,0.5)", fontWeight: 500, marginBottom: 4, letterSpacing: "-0.003em" }}>Message preview</div>
                    <div style={{ fontSize: "13.5px", color: "var(--zr-text-primary)", lineHeight: 1.45, letterSpacing: "-0.008em" }}>
                      {messageBody(selectedCustomer.first_name || "there")}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <a href={selectedCustomer.phone ? textUrl(selectedCustomer) : "#"}
                      onClick={() => selectedCustomer.phone && logRequest(selectedCustomer, "text")}
                      className="flex flex-col items-center gap-1.5 transition-all active:scale-[0.97]"
                      style={{
                        background: selectedCustomer.phone ? "rgba(48,164,108,0.10)" : "rgba(60,60,67,0.04)",
                        borderRadius: 14,
                        padding: "14px 8px",
                        textDecoration: "none",
                        color: selectedCustomer.phone ? "var(--zr-success)" : "rgba(60,60,67,0.4)",
                        pointerEvents: selectedCustomer.phone ? "auto" : "none",
                      }}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                      <span style={{ fontSize: "13px", fontWeight: 600, letterSpacing: "-0.012em" }}>
                        {selectedCustomer.phone ? "Text" : "No phone"}
                      </span>
                    </a>
                    <a href={selectedCustomer.email ? emailUrl(selectedCustomer) : "#"}
                      onClick={() => selectedCustomer.email && logRequest(selectedCustomer, "email")}
                      className="flex flex-col items-center gap-1.5 transition-all active:scale-[0.97]"
                      style={{
                        background: selectedCustomer.email ? "rgba(10,132,255,0.09)" : "rgba(60,60,67,0.04)",
                        borderRadius: 14,
                        padding: "14px 8px",
                        textDecoration: "none",
                        color: selectedCustomer.email ? "var(--zr-info)" : "rgba(60,60,67,0.4)",
                        pointerEvents: selectedCustomer.email ? "auto" : "none",
                      }}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                        <polyline points="22,6 12,13 2,6" />
                      </svg>
                      <span style={{ fontSize: "13px", fontWeight: 600, letterSpacing: "-0.012em" }}>
                        {selectedCustomer.email ? "Email" : "No email"}
                      </span>
                    </a>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Review inbox placeholder ──────────────────────────── */}
        <div className="mb-6">
          <div className="mb-1 px-5">
            <span className="zr-v2-section-label" style={{ padding: 0 }}>Your Google reviews</span>
          </div>
          <div style={{ padding: "28px 20px", textAlign: "center" }}>
            <p style={{ fontSize: "14px", color: "rgba(60,60,67,0.55)", letterSpacing: "-0.005em", lineHeight: 1.5 }}>
              Reviews will appear here once Google Business Profile is connected.
            </p>
            <p style={{ fontSize: "12.5px", color: "rgba(60,60,67,0.4)", marginTop: 6 }}>
              Coming in a future update.
            </p>
          </div>
        </div>

        {/* ── Request history ───────────────────────────────────── */}
        {log.length > 0 && (
          <div className="mb-6">
            <div className="mb-1 px-5">
              <span className="zr-v2-section-label" style={{ padding: 0 }}>Recent requests · {log.length}</span>
            </div>
            <div>
              {log.slice(0, 20).map((l, i, arr) => (
                <div key={l.id} style={{
                  padding: "12px 20px",
                  borderBottom: i < arr.length - 1 ? "0.5px solid rgba(60,60,67,0.08)" : "none",
                }}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span style={{ fontSize: "15px", fontWeight: 600, color: "var(--zr-text-primary)", letterSpacing: "-0.015em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {l.customer_name}
                    </span>
                    <span style={{ fontSize: "12px", color: "rgba(60,60,67,0.45)", flexShrink: 0 }}>
                      {new Date(l.sent_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div style={{ fontSize: "13px", color: "rgba(60,60,67,0.55)", marginTop: 2 }}>
                    Sent via {l.channel}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
