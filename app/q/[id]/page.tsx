"use client";

// Public customer-facing quote page — no login required.
// Share the link via text: yourdomain.com/q/[quoteId]

import { useEffect, useState, useRef, Suspense } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../lib/supabase";

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
  signed_at: string | null;
  signed_name: string | null;
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

type Customer = { first_name: string | null; last_name: string | null };
type Company  = { name: string; phone: string | null; email: string | null; tagline: string | null; default_deposit_pct: number };

function fmtMoney(n: number) {
  return "$" + (n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export default function CustomerQuotePage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm" style={{ color: "var(--zr-text-secondary)" }}>Loading your quote…</div>}>
      <CustomerQuoteInner />
    </Suspense>
  );
}

function CustomerQuoteInner() {
  const { id: quoteId } = useParams() as { id: string };

  const [quote,    setQuote]    = useState<Quote | null>(null);
  const [lines,    setLines]    = useState<LineItem[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [company,  setCompany]  = useState<Company | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Signature
  const [showSign,    setShowSign]    = useState(false);
  const [signedName,  setSignedName]  = useState("");
  const [agreed,      setAgreed]      = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [done,        setDone]        = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing   = useRef(false);
  const [hasStrokes, setHasStrokes] = useState(false);

  useEffect(() => { if (quoteId) load(); }, [quoteId]); // eslint-disable-line

  async function load() {
    const [qRes, lRes, coRes] = await Promise.all([
      supabase.from("quotes").select("id, customer_id, title, status, notes, created_at, expires_at, valid_days, subtotal, discount_amount, total, signed_at, signed_name").eq("id", quoteId).single(),
      supabase.from("quote_line_items").select("id, room_name, window_label, product_name, width, height, mount_type, retail, is_motorized, motor_retail, notes").eq("quote_id", quoteId).order("sort_order").order("room_name"),
      supabase.from("company_settings").select("name, phone, email, tagline, default_deposit_pct").limit(1).single(),
    ]);
    if (!qRes.data) { setNotFound(true); setLoading(false); return; }
    setQuote(qRes.data as Quote);
    setLines((lRes.data || []) as LineItem[]);
    if (coRes.data) setCompany(coRes.data as Company);
    if (qRes.data.customer_id) {
      const { data: c } = await supabase.from("customers").select("first_name, last_name").eq("id", qRes.data.customer_id).single();
      if (c) setCustomer(c as Customer);
    }
    setLoading(false);
  }

  // Canvas drawing
  function getPos(e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    const src  = "touches" in e ? e.touches[0] : e;
    return { x: (src.clientX - rect.left) * (canvas.width / rect.width), y: (src.clientY - rect.top) * (canvas.height / rect.height) };
  }
  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    drawing.current = true;
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const pos = getPos(e, canvas);
    ctx.beginPath(); ctx.moveTo(pos.x, pos.y);
  }
  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing.current) return;
    e.preventDefault();
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.strokeStyle = "#111";
    const pos = getPos(e, canvas);
    ctx.lineTo(pos.x, pos.y); ctx.stroke();
    setHasStrokes(true);
  }
  function stopDraw() { drawing.current = false; }
  function clearCanvas() {
    const canvas = canvasRef.current; if (!canvas) return;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    setHasStrokes(false);
  }

  async function submitSignature() {
    if (!quote || !signedName.trim() || !agreed || !canvasRef.current) return;
    setSaving(true);
    const sigData = canvasRef.current.toDataURL("image/png");
    const now     = new Date().toISOString();
    await supabase.from("quotes").update({
      signature_data: sigData, signed_at: now,
      signed_name: signedName.trim(), status: "approved",
    }).eq("id", quoteId);
    await supabase.from("customers").update({
      lead_status: "Sold", last_activity_at: now,
    }).eq("id", quote.customer_id);
    await supabase.from("activity_log").insert([{
      customer_id: quote.customer_id, type: "note",
      notes: `Quote approved & signed by customer (${signedName.trim()}). Total: ${fmtMoney(quote.total || 0)}`,
      created_by: "ZeroRemake",
    }]);
    setSaving(false);
    setDone(true);
    setQuote(prev => prev ? { ...prev, status: "approved", signed_at: now, signed_name: signedName.trim() } : prev);
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "var(--zr-black)" }}>
      <div className="text-sm" style={{ color: "var(--zr-text-secondary)" }}>Loading your quote…</div>
    </div>
  );

  if (notFound) return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: "var(--zr-black)" }}>
      <div className="text-center">
        <div className="text-4xl mb-3">🔍</div>
        <div className="font-semibold" style={{ color: "var(--zr-text-primary)" }}>Quote not found</div>
        <div className="text-sm mt-1" style={{ color: "var(--zr-text-secondary)" }}>This link may have expired or been removed.</div>
      </div>
    </div>
  );

  const firstName    = customer?.first_name ?? "there";
  const customerName = [customer?.first_name, customer?.last_name].filter(Boolean).join(" ");
  const isExpired    = (() => {
    if (!quote) return false;
    const expiry = quote.expires_at
      ? new Date(quote.expires_at)
      : (() => { const d = new Date(quote.created_at); d.setDate(d.getDate() + (quote.valid_days || 30)); return d; })();
    return expiry.getTime() < Date.now();
  })();
  const isApproved  = quote?.status === "approved" || done;

  // Group lines by room
  const rooms: Record<string, LineItem[]> = {};
  lines.forEach(l => {
    const r = l.room_name ?? "Items";
    if (!rooms[r]) rooms[r] = [];
    rooms[r].push(l);
  });

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--zr-black)" }}>
      {/* Header */}
      <div className="border-b px-4 py-4 text-center" style={{ backgroundColor: "var(--zr-surface-1)", borderColor: "var(--zr-border)" }}>
        <div className="font-bold text-xl" style={{ color: "var(--zr-text-primary)" }}>{company?.name ?? "ZeroRemake"}</div>
        {company?.tagline && <div className="text-xs mt-0.5" style={{ color: "var(--zr-text-secondary)" }}>{company.tagline}</div>}
        {company?.phone && (
          <a href={`tel:${company.phone.replace(/\D/g,"")}`} className="text-xs mt-1 block" style={{ color: "var(--zr-orange)" }}>{company.phone}</a>
        )}
      </div>

      <div className="max-w-xl mx-auto px-4 py-6 space-y-5 text-sm">

        {/* Greeting */}
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--zr-text-primary)" }}>Hi {firstName}! 👋</h1>
          <p className="mt-1" style={{ color: "var(--zr-text-secondary)" }}>
            Here's your quote for <strong>{quote?.title ?? "window treatments"}</strong>.
            Review the details below and approve when you're ready.
          </p>
        </div>

        {/* Approved banner */}
        {isApproved && (
          <div className="rounded-xl text-white px-4 py-4 text-center" style={{ backgroundColor: "var(--zr-success)" }}>
            <div className="text-2xl mb-1">🎉</div>
            <div className="font-bold text-lg">Quote Approved!</div>
            <div className="text-sm opacity-90 mt-0.5">
              {quote?.signed_name ? `Signed by ${quote.signed_name}` : "Thank you for approving."}
            </div>
            <div className="text-xs opacity-70 mt-1">We'll be in touch soon to schedule your install.</div>
          </div>
        )}

        {/* Expired warning */}
        {isExpired && !isApproved && (
          <div className="rounded px-3 py-2 text-xs border" style={{ borderColor: "var(--zr-error)", backgroundColor: "rgba(239, 68, 68, 0.1)", color: "var(--zr-error)" }}>
            ⚠ This quote has expired. Contact us for an updated quote.
          </div>
        )}

        {/* Line items */}
        <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: "var(--zr-surface-2)", borderColor: "var(--zr-border)" }}>
          <div className="px-4 py-3 border-b" style={{ backgroundColor: "var(--zr-surface-1)", borderColor: "var(--zr-border)" }}>
            <div className="font-semibold" style={{ color: "var(--zr-text-primary)" }}>Quote Details</div>
            <div className="text-xs" style={{ color: "var(--zr-text-secondary)" }}>
              {new Date(quote!.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </div>
          </div>
          {Object.entries(rooms).map(([room, roomLines]) => (
            <div key={room} className="border-b last:border-0" style={{ borderColor: "var(--zr-border)" }}>
              <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wide" style={{ backgroundColor: "var(--zr-surface-1)", color: "var(--zr-text-secondary)" }}>{room}</div>
              {roomLines.map(line => (
                <div key={line.id} className="flex items-start justify-between px-4 py-3 border-b last:border-0" style={{ borderColor: "var(--zr-border)" }}>
                  <div className="min-w-0 pr-3">
                    <div className="font-medium" style={{ color: "var(--zr-text-primary)" }}>{line.product_name}</div>
                    {(line.width || line.height) && (
                      <div className="text-xs" style={{ color: "var(--zr-text-secondary)" }}>{line.width}" × {line.height}" {line.mount_type ?? ""}</div>
                    )}
                    {line.is_motorized && <div className="text-xs" style={{ color: "var(--zr-warning)" }}>+ Motorization</div>}
                    {line.notes && <div className="text-xs italic" style={{ color: "var(--zr-text-secondary)" }}>{line.notes}</div>}
                  </div>
                  <div className="shrink-0 font-semibold text-right" style={{ color: "var(--zr-text-primary)" }}>
                    {fmtMoney(line.retail + (line.is_motorized ? line.motor_retail : 0))}
                  </div>
                </div>
              ))}
            </div>
          ))}

          {/* Totals */}
          <div className="px-4 py-3 space-y-1.5" style={{ backgroundColor: "var(--zr-surface-1)" }}>
            {(quote!.discount_amount || 0) > 0 && (
              <>
                <div className="flex justify-between text-xs" style={{ color: "var(--zr-text-secondary)" }}>
                  <span>Subtotal</span><span>{fmtMoney(quote!.subtotal)}</span>
                </div>
                <div className="flex justify-between text-xs" style={{ color: "var(--zr-success)" }}>
                  <span>Discount</span><span>-{fmtMoney(quote!.discount_amount)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between font-bold text-base pt-2 border-t" style={{ borderColor: "var(--zr-border)", color: "var(--zr-text-primary)" }}>
              <span>Total</span>
              <span style={{ color: "var(--zr-success)" }}>{fmtMoney(quote!.total)}</span>
            </div>
            <div className="text-xs" style={{ color: "var(--zr-text-secondary)" }}>
              {company?.default_deposit_pct ?? 50}% deposit ({fmtMoney((quote!.total || 0) * ((company?.default_deposit_pct ?? 50) / 100))}) due to begin order.
            </div>
          </div>
        </div>

        {/* Notes */}
        {quote?.notes && (
          <div className="rounded-xl border px-4 py-3" style={{ backgroundColor: "var(--zr-surface-2)", borderColor: "var(--zr-border)" }}>
            <div className="text-xs font-semibold uppercase mb-1" style={{ color: "var(--zr-text-secondary)" }}>Notes</div>
            <div className="text-sm whitespace-pre-wrap" style={{ color: "var(--zr-text-secondary)" }}>{quote.notes}</div>
          </div>
        )}

        {/* Approve / Sign */}
        {!isApproved && !isExpired && (
          <div className="rounded-xl border px-4 py-4 space-y-3" style={{ backgroundColor: "var(--zr-surface-2)", borderColor: "var(--zr-border)" }}>
            <div className="font-semibold" style={{ color: "var(--zr-text-primary)" }}>Ready to move forward?</div>
            <p className="text-xs" style={{ color: "var(--zr-text-secondary)" }}>
              Tap below to approve this quote. Your digital signature is legally binding.
            </p>
            {!showSign ? (
              <button onClick={() => setShowSign(true)}
                className="w-full text-white rounded-xl py-3 font-semibold text-base" style={{ backgroundColor: "var(--zr-success)" }}>
                ✓ Approve This Quote
              </button>
            ) : (
              <div className="space-y-3">
                <div>
                  <div className="text-xs mb-1" style={{ color: "var(--zr-text-secondary)" }}>Sign your name:</div>
                  <canvas
                    ref={canvasRef} width={600} height={180}
                    className="w-full border-2 border-dashed rounded-xl touch-none" style={{ height: 150, borderColor: "var(--zr-border)", backgroundColor: "var(--zr-surface-1)" }}
                    onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
                    onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw}
                  />
                  <button onClick={clearCanvas} className="text-xs mt-1" style={{ color: "var(--zr-text-secondary)" }}>Clear</button>
                </div>
                <div>
                  <div className="text-xs mb-1" style={{ color: "var(--zr-text-secondary)" }}>Type your full name:</div>
                  <input value={signedName} onChange={e => setSignedName(e.target.value)}
                    placeholder={customerName || "Your full name"}
                    className="w-full rounded-xl px-3 py-2 text-sm" style={{ backgroundColor: "var(--zr-surface-1)", borderColor: "var(--zr-border)", border: "1px solid", color: "var(--zr-text-primary)" }} />
                </div>
                <label className="flex items-start gap-2 text-xs" style={{ color: "var(--zr-text-secondary)" }}>
                  <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0" />
                  I agree to proceed with this quote and authorize the work described above.
                </label>
                <button onClick={submitSignature}
                  disabled={saving || !hasStrokes || !signedName.trim() || !agreed}
                  className="w-full text-white rounded-xl py-3 font-semibold text-base disabled:opacity-40" style={{ backgroundColor: "var(--zr-success)" }}>
                  {saving ? "Submitting…" : "✓ Sign & Approve"}
                </button>
                <button onClick={() => setShowSign(false)} className="w-full text-xs" style={{ color: "var(--zr-text-secondary)" }}>Cancel</button>
              </div>
            )}
          </div>
        )}

        {/* Contact */}
        <div className="rounded-xl border px-4 py-3 text-center space-y-2" style={{ backgroundColor: "var(--zr-surface-2)", borderColor: "var(--zr-border)" }}>
          <div className="text-xs" style={{ color: "var(--zr-text-secondary)" }}>Questions? We're here to help.</div>
          {company?.phone && (
            <a href={`tel:${company.phone.replace(/\D/g,"")}`}
              className="flex items-center justify-center gap-2 w-full rounded-xl border py-2 text-sm font-medium" style={{ borderColor: "var(--zr-border)", backgroundColor: "var(--zr-surface-1)", color: "var(--zr-text-primary)" }}>
              📞 Call {company.phone}
            </a>
          )}
          {company?.email && (
            <a href={`mailto:${company.email}`}
              className="flex items-center justify-center gap-2 w-full rounded-xl border py-2 text-sm" style={{ borderColor: "var(--zr-border)", backgroundColor: "var(--zr-surface-1)", color: "var(--zr-text-secondary)" }}>
              ✉️ {company.email}
            </a>
          )}
        </div>

      </div>
    </div>
  );
}
