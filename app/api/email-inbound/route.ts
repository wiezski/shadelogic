// ── Email Order Tracking Webhook ──────────────────────────────
// Receives inbound emails from Postmark and auto-updates
// quote_materials order status in the database.
//
// Setup: in Postmark → Inbound Stream → Webhook URL:
//   https://yoursite.vercel.app/api/email-inbound

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ── Helpers ───────────────────────────────────────────────────

function extractOrderNumbers(text: string): string[] {
  const patterns = [
    /order\s*(?:number|#|no\.?|num\.?)?\s*:?\s*([A-Z0-9][\w-]{3,30})/gi,
    /po\s*(?:#|number|no\.?)?\s*:?\s*([A-Z0-9][\w-]{3,30})/gi,
    /#\s*([A-Z0-9][\w-]{4,30})/g,
  ];
  const found = new Set<string>();
  for (const p of patterns) {
    const matches = [...text.matchAll(p)];
    matches.forEach(m => found.add(m[1].trim().toUpperCase()));
  }
  return [...found];
}

function extractTracking(text: string): string | null {
  const patterns = [
    /\b(1Z[A-Z0-9]{16})\b/i,                  // UPS
    /\b(94\d{18,20})\b/,                        // USPS
    /\b(3S[A-Z0-9]{14})\b/i,                   // FedEx
    /tracking[:\s#]+([A-Z0-9]{10,30})/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1].trim();
  }
  return null;
}

type StatusType = "ordered" | "shipped" | "received" | null;

function detectStatus(subject: string, body: string): StatusType {
  const text = (subject + " " + body).toLowerCase();
  if (/\b(delivered|has been delivered|was delivered|delivery complete)\b/.test(text)) return "received";
  if (/\b(shipped|in transit|on its way|has shipped|left our facility|out for delivery|tracking number|your order is on)\b/.test(text)) return "shipped";
  if (/\b(order confirmed|order received|thank you for your order|we received your order|order has been placed|order acknowledgment)\b/.test(text)) return "ordered";
  return null;
}

function extractETA(text: string): string | null {
  const patterns = [
    /estimated\s+delivery:?\s*([A-Za-z]+ \d{1,2},?\s*\d{4})/i,
    /estimated\s+arrival:?\s*([A-Za-z]+ \d{1,2})/i,
    /arrives?\s+by:?\s*([A-Za-z]+ \d{1,2})/i,
    /expected:?\s*([A-Za-z]+ \d{1,2})/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1];
  }
  return null;
}

// Company token: first 12 chars of company_id with dashes removed
function companyToken(companyId: string): string {
  return companyId.replace(/-/g, "").slice(0, 12);
}

// ── Route handler ─────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // ── Extract TO address ───────────────────────────────────
    const toAddresses: string[] = [];
    if (body.ToFull) toAddresses.push(...body.ToFull.map((t: any) => t.Email ?? ""));
    if (body.To)     toAddresses.push(body.To);
    if (body.CcFull) toAddresses.push(...body.CcFull.map((t: any) => t.Email ?? ""));

    const inboundAddr = toAddresses.find(a => a.includes("orders-"));
    const tokenMatch  = inboundAddr?.match(/orders-(\w+)@/);
    if (!tokenMatch) {
      return NextResponse.json({ ok: false, reason: "no company token in TO address" }, { status: 200 });
    }
    const token = tokenMatch[1].toLowerCase();

    // ── Init Supabase with service role (bypasses RLS) ───────
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    // ── Find company by token ────────────────────────────────
    const { data: companies } = await supabase.from("companies").select("id");
    const company = (companies ?? []).find((c: { id: string }) => companyToken(c.id) === token);
    if (!company) {
      return NextResponse.json({ ok: false, reason: "company not found" }, { status: 200 });
    }
    const companyId = company.id;

    // ── Parse email ──────────────────────────────────────────
    const subject  = body.Subject  ?? "";
    const textBody = body.TextBody ?? "";
    const htmlBody = body.HtmlBody ?? "";
    const fullText = subject + " " + textBody + " " + htmlBody;

    const orderNumbers  = extractOrderNumbers(fullText);
    const trackingNum   = extractTracking(fullText);
    const detectedStatus = detectStatus(subject, textBody + " " + htmlBody);
    const eta           = extractETA(fullText);
    const fromEmail     = body.From ?? "";

    console.log(`[email-inbound] company=${companyId} orders=${orderNumbers} status=${detectedStatus} tracking=${trackingNum}`);

    // ── Try to match to a quote_materials record ─────────────
    let matched = false;
    let matchedMaterialId: string | null = null;

    if (orderNumbers.length > 0) {
      for (const orderNum of orderNumbers) {
        const { data: mats } = await supabase
          .from("quote_materials")
          .select("id, status, quote_id")
          .eq("company_id", companyId)
          .or(`order_number.ilike.%${orderNum}%,description.ilike.%${orderNum}%`)
          .limit(1);

        if (mats && mats.length > 0) {
          const mat = mats[0];
          matchedMaterialId = mat.id;

          // Only advance status, never go backwards
          const STATUS_ORDER = ["not_ordered", "ordered", "shipped", "received", "staged"];
          const currentIdx = STATUS_ORDER.indexOf(mat.status);
          const newIdx     = STATUS_ORDER.indexOf(detectedStatus ?? "");

          if (detectedStatus && newIdx > currentIdx) {
            const update: Record<string, unknown> = {
              status:            detectedStatus,
              last_email_at:     new Date().toISOString(),
              last_email_subject: subject.slice(0, 200),
              auto_updated:      true,
            };
            if (trackingNum)                     update.tracking_number = trackingNum;
            if (detectedStatus === "ordered")    update.ordered_at = new Date().toISOString();
            if (detectedStatus === "shipped")    update.shipped_at = new Date().toISOString();
            if (detectedStatus === "received")   update.received_at = new Date().toISOString();

            await supabase.from("quote_materials").update(update).eq("id", mat.id);
            matched = true;

            // Check if all materials on this quote are now received/staged
            const { data: quoteMats } = await supabase
              .from("quote_materials")
              .select("status, quote_id")
              .eq("quote_id", mat.quote_id);
            const allDone = quoteMats?.every(m => m.status === "received" || m.status === "staged");
            if (allDone && quoteMats && quoteMats.length > 0) {
              // Get customer_id from quote
              const { data: quote } = await supabase
                .from("quotes").select("customer_id").eq("id", mat.quote_id).single();
              if (quote) {
                await supabase.from("customers")
                  .update({ next_action: "✅ All materials received — ready to schedule install" })
                  .eq("id", quote.customer_id);
              }
            }

            // Log activity on customer
            if (matched) {
              const { data: q } = await supabase.from("quotes").select("customer_id").eq("id", mat.quote_id).single();
              if (q) {
                const statusLabels: Record<string, string> = { ordered: "Order confirmed", shipped: "Order shipped", received: "Materials received" };
                await supabase.from("activity_log").insert([{
                  customer_id: q.customer_id,
                  company_id:  companyId,
                  type:        "note",
                  notes:       `📦 ${statusLabels[detectedStatus ?? ""] ?? detectedStatus} (auto-detected from email: "${subject.slice(0, 80)}")${trackingNum ? ` — Tracking: ${trackingNum}` : ""}`,
                  created_by:  "Email Tracking",
                }]);
              }
            }
          }
          break;
        }
      }
    }

    // ── Store unmatched emails for manual review ─────────────
    if (!matched && (detectedStatus || orderNumbers.length > 0)) {
      await supabase.from("email_order_inbox").insert([{
        company_id:      companyId,
        from_email:      fromEmail,
        subject:         subject.slice(0, 300),
        order_number:    orderNumbers[0] ?? null,
        tracking_number: trackingNum,
        detected_status: detectedStatus,
        email_body:      textBody.slice(0, 1000),
        reviewed:        false,
        matched_material: matchedMaterialId,
      }]);
    }

    return NextResponse.json({
      ok:      true,
      matched,
      status:  detectedStatus,
      orders:  orderNumbers,
      tracking: trackingNum,
    });

  } catch (err) {
    console.error("[email-inbound] error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 200 });
    // Always return 200 to prevent Postmark retries on app errors
  }
}
