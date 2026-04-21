"use client";

// Public customer-facing quote page — no login required.
// Share the link via text: yourdomain.com/q/[quoteId]
// Enhanced: plain-English descriptions, no dealer codes/SKUs,
// color/material shown clearly, so customers know exactly what they're getting.

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
  product_id: string | null;
  width: string | null;
  height: string | null;
  mount_type: string | null;
  retail: number;
  is_motorized: boolean;
  motor_retail: number;
  notes: string | null;
};

type ProductInfo = {
  category: string | null;
  color_options: string | null;
  manufacturer: string | null;
};

type Customer = { first_name: string | null; last_name: string | null };
type Company  = { name: string; phone: string | null; email: string | null; tagline: string | null; default_deposit_pct: number };

function fmtMoney(n: number) {
  return "$" + (n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/* Convert mount_type codes to plain English */
function friendlyMount(mt: string | null): string {
  if (!mt) return "";
  const lower = mt.toLowerCase().trim();
  if (lower === "im" || lower === "inside" || lower === "inside mount") return "Inside Mount";
  if (lower === "om" || lower === "outside" || lower === "outside mount") return "Outside Mount";
  if (lower === "ceiling" || lower === "cm") return "Ceiling Mount";
  // If it's already readable, capitalize first letter
  return mt.charAt(0).toUpperCase() + mt.slice(1);
}

/* Category label mapping — plain English for customers */
function friendlyCategory(cat: string | null): string {
  if (!cat) return "";
  const map: Record<string, string> = {
    roller: "Roller Shade",
    solar: "Solar Shade",
    cellular: "Cellular Shade",
    wood: "Wood Blind",
    faux: "Faux Wood Blind",
    vertical: "Vertical Blind",
    sheer: "Sheer Shade",
    roman: "Roman Shade",
    woven: "Woven Wood Shade",
    motorized: "Motorized Add-on",
    drapery: "Drapery",
    shutters: "Shutters",
    panel: "Panel Track",
    honeycomb: "Honeycomb Shade",
    zebra: "Zebra Shade",
    silhouette: "Silhouette Shade",
    luminette: "Luminette",
    duette: "Duette Shade",
  };
  const lower = cat.toLowerCase().trim();
  return map[lower] || (cat.charAt(0).toUpperCase() + cat.slice(1));
}

/* Format dimensions in a human-friendly way */
function friendlyDimensions(w: string | null, h: string | null): string {
  if (!w && !h) return "";
  const wNum = parseFloat(w || "0");
  const hNum = parseFloat(h || "0");
  const fmtDim = (inches: number) => {
    if (inches <= 0) return "";
    const ft = Math.floor(inches / 12);
    const rem = Math.round(inches % 12);
    if (ft === 0) return `${rem}"`;
    if (rem === 0) return `${ft}'`;
    return `${ft}' ${rem}"`;
  };
  const wStr = fmtDim(wNum);
  const hStr = fmtDim(hNum);
  if (wStr && hStr) return `${wStr} wide × ${hStr} tall`;
  if (wStr) return `${wStr} wide`;
  if (hStr) return `${hStr} tall`;
  return "";
}

/* Room icon based on name */
function roomIcon(room: string): string {
  const r = room.toLowerCase();
  if (r.includes("kitchen")) return "🍳";
  if (r.includes("living")) return "🛋️";
  if (r.includes("bed") || r.includes("master")) return "🛏️";
  if (r.includes("bath")) return "🚿";
  if (r.includes("dining")) return "🍽️";
  if (r.includes("office") || r.includes("study")) return "💻";
  if (r.includes("nursery") || r.includes("kid") || r.includes("child")) return "🧸";
  if (r.includes("garage")) return "🚗";
  if (r.includes("basement")) return "🏠";
  if (r.includes("sun") || r.includes("porch") || r.includes("patio")) return "☀️";
  return "🪟";
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
  const [productInfo, setProductInfo] = useState<Record<string, ProductInfo>>({});
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
      supabase.from("quote_line_items").select("id, room_name, window_label, product_name, product_id, width, height, mount_type, retail, is_motorized, motor_retail, notes").eq("quote_id", quoteId).order("sort_order").order("room_name"),
      supabase.from("company_settings").select("name, phone, email, tagline, default_deposit_pct").limit(1).single(),
    ]);
    if (!qRes.data) { setNotFound(true); setLoading(false); return; }
    setQuote(qRes.data as Quote);
    const lineItems = (lRes.data || []) as LineItem[];
    setLines(lineItems);
    if (coRes.data) setCompany(coRes.data as Company);

    // Fetch product catalog info for richer display (category, color, manufacturer)
    const productIds = lineItems.map(l => l.product_id).filter(Boolean) as string[];
    if (productIds.length > 0) {
      const uniqueIds = [...new Set(productIds)];
      const { data: products } = await supabase
        .from("product_catalog")
        .select("id, category, color_options, manufacturer")
        .in("id", uniqueIds);
      if (products) {
        const infoMap: Record<string, ProductInfo> = {};
        products.forEach((p: { id: string; category: string | null; color_options: string | null; manufacturer: string | null }) => {
          infoMap[p.id] = { category: p.category, color_options: p.color_options, manufacturer: p.manufacturer };
        });
        setProductInfo(infoMap);
      }
    }

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
      created_by: "customer_signature",
    }]);
    setSaving(false);
    setDone(true);
    setQuote(prev => prev ? { ...prev, status: "approved", signed_at: now, signed_name: signedName.trim() } : prev);
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#f8f9fa" }}>
      <div className="text-sm" style={{ color: "#6b7280" }}>Loading your quote…</div>
    </div>
  );

  if (notFound) return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: "#f8f9fa" }}>
      <div className="text-center">
        <div className="text-4xl mb-3">🔍</div>
        <div className="font-semibold" style={{ color: "#111827" }}>Quote not found</div>
        <div className="text-sm mt-1" style={{ color: "#6b7280" }}>This link may have expired or been removed.</div>
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
    const r = l.room_name ?? "General";
    if (!rooms[r]) rooms[r] = [];
    rooms[r].push(l);
  });

  const itemCount = lines.length;

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#f8f9fa" }}>
      {/* Header — clean white, professional */}
      <div className="px-4 py-5 text-center" style={{ backgroundColor: "#ffffff", borderBottom: "1px solid #e5e7eb" }}>
        <div className="font-bold text-xl" style={{ color: "#111827" }}>{company?.name ?? "Your Quote"}</div>
        {company?.tagline && <div className="text-xs mt-0.5" style={{ color: "#9ca3af" }}>{company.tagline}</div>}
        {company?.phone && (
          <a href={`tel:${company.phone.replace(/\D/g,"")}`} className="text-xs mt-1 inline-block font-medium" style={{ color: "#2563eb" }}>{company.phone}</a>
        )}
      </div>

      <div className="max-w-xl mx-auto px-4 py-6 space-y-5">

        {/* Greeting */}
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#111827" }}>Hi {firstName}!</h1>
          <p className="mt-1 text-sm" style={{ color: "#6b7280" }}>
            Here&apos;s your quote for <strong style={{ color: "#111827" }}>{quote?.title ?? "window treatments"}</strong>.
            {itemCount > 0 && <> {itemCount} item{itemCount !== 1 ? "s" : ""} across {Object.keys(rooms).length} room{Object.keys(rooms).length !== 1 ? "s" : ""}.</>}
          </p>
          <p className="mt-0.5 text-xs" style={{ color: "#9ca3af" }}>
            Created {new Date(quote!.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          </p>
        </div>

        {/* Approved banner */}
        {isApproved && (
          <div className="rounded-2xl text-white px-5 py-5 text-center" style={{ background: "linear-gradient(135deg, #059669, #10b981)" }}>
            <div className="text-3xl mb-2">🎉</div>
            <div className="font-bold text-lg">Quote Approved!</div>
            <div className="text-sm opacity-90 mt-0.5">
              {quote?.signed_name ? `Signed by ${quote.signed_name}` : "Thank you for approving."}
            </div>
            <div className="text-xs opacity-70 mt-1">We'll be in touch soon to schedule your installation.</div>
          </div>
        )}

        {/* Expired warning */}
        {isExpired && !isApproved && (
          <div className="rounded-xl px-4 py-3 text-sm" style={{ backgroundColor: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" }}>
            ⚠️ This quote has expired. Please contact us for an updated quote.
          </div>
        )}

        {/* What You're Getting — summary banner */}
        <div className="rounded-2xl px-5 py-4" style={{ backgroundColor: "#eff6ff", border: "1px solid #bfdbfe" }}>
          <div className="font-semibold text-sm" style={{ color: "#1e40af" }}>What You're Getting</div>
          <p className="text-xs mt-1" style={{ color: "#3b82f6" }}>
            Each item below describes the exact product, size, and style for every window.
            If anything doesn't look right, just reach out — we're happy to adjust.
          </p>
        </div>

        {/* Room-by-room line items */}
        {Object.entries(rooms).map(([room, roomLines]) => (
          <div key={room} className="space-y-3">
            {/* Room header */}
            <div className="flex items-center gap-2 px-1">
              <span className="text-lg">{roomIcon(room)}</span>
              <span className="font-bold text-base" style={{ color: "#111827" }}>{room}</span>
              <span className="text-xs" style={{ color: "#9ca3af" }}>{roomLines.length} item{roomLines.length !== 1 ? "s" : ""}</span>
            </div>

            {/* Item cards */}
            {roomLines.map(line => {
              const info = line.product_id ? productInfo[line.product_id] : null;
              const category = friendlyCategory(info?.category ?? null);
              const mount = friendlyMount(line.mount_type);
              const dims = friendlyDimensions(line.width, line.height);
              const color = info?.color_options ?? null;
              const lineTotal = line.retail + (line.is_motorized ? line.motor_retail : 0);

              return (
                <div key={line.id} className="rounded-xl overflow-hidden" style={{ backgroundColor: "#ffffff", border: "1px solid #e5e7eb", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
                  <div className="px-4 py-3">
                    {/* Top row: product + price */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-sm" style={{ color: "#111827" }}>{line.product_name}</div>
                        {category && (
                          <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: "#f0fdf4", color: "#15803d", border: "1px solid #bbf7d0" }}>
                            {category}
                          </span>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="font-bold text-base" style={{ color: "#111827" }}>{fmtMoney(lineTotal)}</div>
                      </div>
                    </div>

                    {/* Details grid */}
                    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
                      {line.window_label && (
                        <div>
                          <div className="text-xs font-medium" style={{ color: "#9ca3af" }}>Window</div>
                          <div className="text-sm" style={{ color: "#374151" }}>{line.window_label}</div>
                        </div>
                      )}
                      {dims && (
                        <div>
                          <div className="text-xs font-medium" style={{ color: "#9ca3af" }}>Size</div>
                          <div className="text-sm" style={{ color: "#374151" }}>{dims}</div>
                        </div>
                      )}
                      {mount && (
                        <div>
                          <div className="text-xs font-medium" style={{ color: "#9ca3af" }}>Mount Style</div>
                          <div className="text-sm" style={{ color: "#374151" }}>{mount}</div>
                        </div>
                      )}
                      {color && (
                        <div>
                          <div className="text-xs font-medium" style={{ color: "#9ca3af" }}>Color / Material</div>
                          <div className="text-sm" style={{ color: "#374151" }}>{color}</div>
                        </div>
                      )}
                    </div>

                    {/* Motorized badge */}
                    {line.is_motorized && (
                      <div className="mt-2 inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium" style={{ backgroundColor: "#fefce8", color: "#a16207", border: "1px solid #fde68a" }}>
                        ⚡ Motorized — Remote / App Controlled
                      </div>
                    )}

                    {/* Notes */}
                    {line.notes && (
                      <div className="mt-2 px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: "#f9fafb", color: "#6b7280" }}>
                        💬 {line.notes}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        {/* Totals card */}
        <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: "#ffffff", border: "1px solid #e5e7eb", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          <div className="px-5 py-4 space-y-2">
            <div className="font-semibold text-sm" style={{ color: "#111827" }}>Quote Summary</div>
            {(quote!.discount_amount || 0) > 0 && (
              <>
                <div className="flex justify-between text-sm" style={{ color: "#6b7280" }}>
                  <span>Subtotal</span><span>{fmtMoney(quote!.subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm" style={{ color: "#059669" }}>
                  <span>Discount</span><span>-{fmtMoney(quote!.discount_amount)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between items-baseline font-bold text-lg pt-2" style={{ borderTop: "1px solid #e5e7eb", color: "#111827" }}>
              <span>Total</span>
              <span style={{ color: "#059669" }}>{fmtMoney(quote!.total)}</span>
            </div>
            <div className="text-xs pt-1" style={{ color: "#9ca3af" }}>
              {company?.default_deposit_pct ?? 50}% deposit of {fmtMoney((quote!.total || 0) * ((company?.default_deposit_pct ?? 50) / 100))} due when you approve to get your order started.
              Balance due upon installation.
            </div>
          </div>
        </div>

        {/* Notes from dealer */}
        {quote?.notes && (
          <div className="rounded-xl px-4 py-3" style={{ backgroundColor: "#ffffff", border: "1px solid #e5e7eb" }}>
            <div className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "#9ca3af" }}>A note from your installer</div>
            <div className="text-sm whitespace-pre-wrap" style={{ color: "#4b5563" }}>{quote.notes}</div>
          </div>
        )}

        {/* Approve / Sign */}
        {!isApproved && !isExpired && (
          <div className="rounded-2xl px-5 py-5 space-y-4" style={{ backgroundColor: "#ffffff", border: "1px solid #e5e7eb", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
            <div>
              <div className="font-bold text-base" style={{ color: "#111827" }}>Ready to move forward?</div>
              <p className="text-sm mt-1" style={{ color: "#6b7280" }}>
                Review your items above, then approve below. Your digital signature confirms this order.
              </p>
            </div>
            {!showSign ? (
              <button onClick={() => setShowSign(true)}
                className="w-full text-white rounded-xl py-3.5 font-semibold text-base" style={{ background: "linear-gradient(135deg, #059669, #10b981)" }}>
                ✓ Approve This Quote
              </button>
            ) : (
              <div className="space-y-4">
                <div>
                  <div className="text-xs font-medium mb-1.5" style={{ color: "#6b7280" }}>Draw your signature below:</div>
                  <canvas
                    ref={canvasRef} width={600} height={180}
                    className="w-full border-2 border-dashed rounded-xl touch-none" style={{ height: 150, borderColor: "#d1d5db", backgroundColor: "#fafafa" }}
                    onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
                    onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw}
                  />
                  <button onClick={clearCanvas} className="text-xs mt-1.5 font-medium" style={{ color: "#6b7280" }}>Clear signature</button>
                </div>
                <div>
                  <div className="text-xs font-medium mb-1.5" style={{ color: "#6b7280" }}>Type your full name:</div>
                  <input value={signedName} onChange={e => setSignedName(e.target.value)}
                    placeholder={customerName || "Your full name"}
                    className="w-full rounded-xl px-3 py-2.5 text-sm" style={{ backgroundColor: "#fafafa", border: "1px solid #d1d5db", color: "#111827" }} />
                </div>
                <label className="flex items-start gap-2.5 text-xs cursor-pointer" style={{ color: "#4b5563" }}>
                  <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 rounded" />
                  I agree to proceed with this quote and authorize the work described above.
                </label>
                <button onClick={submitSignature}
                  disabled={saving || !hasStrokes || !signedName.trim() || !agreed}
                  className="w-full text-white rounded-xl py-3.5 font-semibold text-base disabled:opacity-40 transition-opacity" style={{ background: "linear-gradient(135deg, #059669, #10b981)" }}>
                  {saving ? "Submitting…" : "✓ Sign & Approve"}
                </button>
                <button onClick={() => setShowSign(false)} className="w-full text-xs font-medium" style={{ color: "#9ca3af" }}>Cancel</button>
              </div>
            )}
          </div>
        )}

        {/* Contact */}
        <div className="rounded-2xl px-5 py-4 text-center space-y-3" style={{ backgroundColor: "#ffffff", border: "1px solid #e5e7eb" }}>
          <div className="text-sm font-medium" style={{ color: "#374151" }}>Questions about your quote?</div>
          <div className="text-xs" style={{ color: "#9ca3af" }}>We're happy to walk through any details with you.</div>
          <div className="flex flex-col sm:flex-row gap-2">
            {company?.phone && (
              <a href={`tel:${company.phone.replace(/\D/g,"")}`}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium" style={{ backgroundColor: "#f9fafb", border: "1px solid #e5e7eb", color: "#111827" }}>
                📞 Call {company.phone}
              </a>
            )}
            {company?.email && (
              <a href={`mailto:${company.email}?subject=Question about my quote`}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm" style={{ backgroundColor: "#f9fafb", border: "1px solid #e5e7eb", color: "#6b7280" }}>
                ✉️ Email Us
              </a>
            )}
          </div>
        </div>

        {/* No "Powered by" footer — this is a document the installer's
            homeowner sees, not a marketing surface for ZeroRemake. */}

      </div>
    </div>
  );
}
