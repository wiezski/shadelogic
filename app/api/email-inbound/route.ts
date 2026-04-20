// ── Email Order Tracking Webhook ──────────────────────────────
// Receives inbound emails (Postmark or Resend format) and:
//   1. Matches to existing quote_materials → updates status/tracking
//   2. If no material match but customer found → auto-creates material
//   3. If nothing matches → stores in email_order_inbox for review
//
// Setup options:
//   A) Postmark → Inbound Stream → Webhook: https://zeroremake.com/api/email-inbound
//   B) Resend → Inbound Webhook: https://zeroremake.com/api/email-inbound
//   C) Manual forward to: orders-{companytoken}@inbound.postmarkapp.com

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ── Helpers ───────────────────────────────────────────────────

function extractOrderNumbers(text: string): string[] {
  const patterns = [
    // Standard order number patterns
    /order\s*(?:number|#|no\.?|num\.?)?\s*:?\s*([A-Z0-9][\w-]{3,30})/gi,
    /po\s*(?:#|number|no\.?)?\s*:?\s*([A-Z0-9][\w-]{3,30})/gi,
    /#\s*([A-Z0-9][\w-]{4,30})/g,
    // Manufacturer-specific patterns
    /confirmation\s*(?:#|number|no\.?)?\s*:?\s*([A-Z0-9][\w-]{3,30})/gi,
    /reference\s*(?:#|number|no\.?)?\s*:?\s*([A-Z0-9][\w-]{3,30})/gi,
    /invoice\s*(?:#|number|no\.?)?\s*:?\s*([A-Z0-9][\w-]{3,30})/gi,
    // Hunter Douglas: "HD-" prefix orders
    /\b(HD-?\d{5,12})\b/gi,
    // Norman: "NW-" or "NOR-" prefix
    /\b(N(?:W|OR)-?\d{5,12})\b/gi,
    // Graber / Springs: numeric order IDs
    /\b(?:graber|springs?)\b[^0-9]*(\d{6,12})\b/gi,
    // Alta: "ALT-" prefix
    /\b(ALT-?\d{5,12})\b/gi,
    // Comfortex
    /\b(CMF-?\d{5,12})\b/gi,
  ];
  const found = new Set<string>();
  for (const p of patterns) {
    const matches = [...text.matchAll(p)];
    matches.forEach(m => found.add(m[1].trim().toUpperCase()));
  }
  // Filter out common false positives
  const filtered = [...found].filter(n => !/^(THE|FOR|AND|YOUR|THIS|FROM|WITH|ORDER|SHIP)$/i.test(n));
  return filtered;
}

function extractTracking(text: string): string[] {
  const patterns = [
    /\b(1Z[A-Z0-9]{16})\b/gi,                    // UPS
    /\b(94\d{18,22})\b/g,                          // USPS
    /\b(\d{12,22})\b/g,                             // FedEx ground / generic
    /\b(3S[A-Z0-9]{14})\b/gi,                     // FedEx SmartPost
    /\b([A-Z]{2}\d{9}[A-Z]{2})\b/g,              // International
    /tracking[:\s#]*([A-Z0-9]{10,30})/gi,
    /track\s+(?:your\s+)?(?:package|shipment|order)[^A-Z0-9]*([A-Z0-9]{10,30})/gi,
  ];
  const found = new Set<string>();
  for (const p of patterns) {
    const matches = [...text.matchAll(p)];
    matches.forEach(m => {
      const val = m[1].trim();
      // Filter out things that are clearly not tracking numbers
      if (val.length >= 10 && !/^\d{1,5}$/.test(val)) found.add(val);
    });
  }
  return [...found];
}

type StatusType = "ordered" | "shipped" | "received" | null;

function detectStatus(subject: string, body: string): StatusType {
  const text = (subject + " " + body).toLowerCase();
  // Delivered / received — check first (most specific)
  if (/\b(delivered|has been delivered|was delivered|delivery complete|delivery confirmation|signed for|proof of delivery)\b/.test(text)) return "received";
  // Shipped / in transit
  if (/\b(shipped|in transit|on its way|has shipped|left our facility|out for delivery|tracking number|your order is on|shipment notification|ship confirmation|shipment confirm|dispatch|dispatched|carrier picked up)\b/.test(text)) return "shipped";
  // Order confirmed
  if (/\b(order confirm|order received|thank you for your order|we received your order|order has been placed|order acknowledgment|acknowledgement|order accepted|order processing|order submitted|purchase order confirm)\b/.test(text)) return "ordered";
  return null;
}

function extractETA(text: string): string | null {
  const patterns = [
    /estimated\s+(?:delivery|ship)\s*(?:date)?:?\s*([A-Za-z]+ \d{1,2},?\s*\d{4})/i,
    /estimated\s+arrival:?\s*([A-Za-z]+ \d{1,2},?\s*\d{0,4})/i,
    /arrives?\s+by:?\s*([A-Za-z]+ \d{1,2})/i,
    /expected\s+(?:delivery|ship):?\s*([A-Za-z]+ \d{1,2})/i,
    /ship\s+date:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
    /deliver(?:y|ed)?\s+(?:by|date):?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
    /(?:ready|available)\s+(?:by|date):?\s*([A-Za-z]+ \d{1,2})/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1];
  }
  return null;
}

function extractPackageInfo(text: string): { count: number | null; packageNum: number | null } {
  const ofMatch = text.match(/(?:package|shipment|box|carton|pallet)\s*(\d+)\s*(?:of|\/)\s*(\d+)/i);
  if (ofMatch) return { packageNum: parseInt(ofMatch[1]), count: parseInt(ofMatch[2]) };
  const totalMatch = text.match(/(\d+)\s*(?:packages?|boxes?|cartons?|pallets?)\s*(?:total|will|to\s+be|being)/i);
  if (totalMatch) return { packageNum: null, count: parseInt(totalMatch[1]) };
  return { count: null, packageNum: null };
}

// Extract product descriptions from manufacturer emails
function extractProductDescription(text: string): string | null {
  const patterns = [
    // "Product: Silhouette Window Shadings"
    /product\s*:?\s*([^\n,]{5,80})/i,
    // "Item: Norman Woodlore Shutters"
    /item\s*(?:description)?:?\s*([^\n,]{5,80})/i,
    // Common blind product names
    /((?:hunter\s+douglas|norman|graber|alta|comfortex|levolor|bali)\s+[^\n,]{3,60})/i,
    // Product type patterns
    /((?:silhouette|luminette|duette|vignette|pirouette|provenance|woodlore|shutters?|blinds?|shades?|shadings?)\s*(?:[-–]\s*)?[^\n,]{0,40})/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1].trim().slice(0, 120);
  }
  return null;
}

// Extract vendor/manufacturer name
function extractVendor(text: string, fromEmail: string): string | null {
  const t = (text + " " + fromEmail).toLowerCase();
  const vendors: [RegExp, string][] = [
    [/hunter\s*douglas/i, "Hunter Douglas"],
    [/norman/i, "Norman"],
    [/graber/i, "Graber"],
    [/springs?\s+window/i, "Springs Window Fashions"],
    [/alta\s+window/i, "Alta Window Fashions"],
    [/comfortex/i, "Comfortex"],
    [/levolor/i, "Levolor"],
    [/bali\s+blinds/i, "Bali"],
    [/blinds\.com/i, "Blinds.com"],
    [/3\s*day\s*blinds/i, "3 Day Blinds"],
    [/select\s*blinds/i, "Select Blinds"],
    [/costco/i, "Costco"],
    [/lowe'?s/i, "Lowe's"],
    [/home\s*depot/i, "Home Depot"],
    [/menards/i, "Menards"],
    [/star\s*blinds/i, "Star Blinds"],
    [/budget\s*blinds/i, "Budget Blinds"],
    [/next\s*day\s*blinds/i, "Next Day Blinds"],
    [/american\s*blinds/i, "American Blinds"],
    [/shade\s*store/i, "The Shade Store"],
    [/lutron/i, "Lutron"],
    [/somfy/i, "Somfy"],
  ];
  for (const [re, name] of vendors) {
    if (re.test(t)) return name;
  }
  return null;
}

// Extract customer / ship-to name from email body
function extractCustomerName(text: string): { firstName: string; lastName: string } | null {
  const patterns = [
    /ship\s*(?:ping)?\s*(?:to|address)\s*:?\s*\n?\s*([A-Z][a-z]+)\s+([A-Z][a-zA-Z'-]+)/,
    /deliver(?:y|ing)?\s*(?:to|address)\s*:?\s*\n?\s*([A-Z][a-z]+)\s+([A-Z][a-zA-Z'-]+)/,
    /customer\s*(?:name)?\s*:?\s*([A-Z][a-z]+)\s+([A-Z][a-zA-Z'-]+)/,
    /attention\s*:?\s*([A-Z][a-z]+)\s+([A-Z][a-zA-Z'-]+)/i,
    /attn\s*:?\s*([A-Z][a-z]+)\s+([A-Z][a-zA-Z'-]+)/i,
    /(?:sold|bill)\s*to\s*:?\s*\n?\s*([A-Z][a-z]+)\s+([A-Z][a-zA-Z'-]+)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return { firstName: m[1], lastName: m[2] };
  }
  return null;
}

// Company token: first 12 chars of company_id with dashes removed
function companyToken(companyId: string): string {
  return companyId.replace(/-/g, "").slice(0, 12);
}

// ── PDF attachment text extraction ────────────────────────────
async function extractPdfText(base64Content: string): Promise<string> {
  try {
    const buffer = Buffer.from(base64Content, "base64");
    // @ts-ignore — pdf-parse must be installed: npm install pdf-parse
    const pdfParse = (await import("pdf-parse")).default;
    const parsed = await pdfParse(buffer);
    return parsed.text || "";
  } catch {
    return "";
  }
}

// ── Fetch full email content from Resend API ─────────────────
// Resend's email.received webhook only sends metadata (no body).
// We must call GET /emails/{id} to retrieve html, text, etc.
async function fetchResendEmailContent(emailId: string): Promise<{
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
  attachments: { filename: string; content_type: string; content: string }[];
} | null> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch(`https://api.resend.com/emails/${emailId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      console.error(`[email-inbound] Resend GET /emails/${emailId} failed:`, res.status, await res.text());
      return null;
    }
    const data = await res.json();
    return {
      from: data.from ?? "",
      to: Array.isArray(data.to) ? data.to : [data.to].filter(Boolean),
      subject: data.subject ?? "",
      html: data.html ?? "",
      text: data.text ?? "",
      attachments: data.attachments ?? [],
    };
  } catch (err) {
    console.error("[email-inbound] Failed to fetch email content from Resend:", err);
    return null;
  }
}

// ── Normalize email body from Postmark or Resend format ──────
// Resend webhook: { type: "email.received", data: { email_id, from, to, subject, attachments } }
// — body NOT included; must be fetched separately via fetchResendEmailContent()
// Postmark webhook: { ToFull, From, Subject, TextBody, HtmlBody, Attachments, ... }
async function normalizeInbound(body: any): Promise<{
  toAddresses: string[];
  fromEmail: string;
  subject: string;
  textBody: string;
  htmlBody: string;
  attachments: { Name: string; ContentType: string; Content: string }[];
}> {
  // ── Resend email.received webhook format ──────────────────
  if (body.type === "email.received" && body.data?.email_id) {
    const d = body.data;
    const toArr = Array.isArray(d.to) ? d.to : [d.to].filter(Boolean);
    const fromAddr = d.from ?? "";
    const subj = d.subject ?? "";

    // Fetch the full email content (body, html, text)
    const full = await fetchResendEmailContent(d.email_id);
    if (full) {
      console.log(`[email-inbound] Fetched full content for email ${d.email_id} (${full.text?.length || 0} chars text, ${full.html?.length || 0} chars html)`);
      return {
        toAddresses: full.to.length > 0 ? full.to : toArr,
        fromEmail: full.from || fromAddr,
        subject: full.subject || subj,
        textBody: full.text ?? "",
        htmlBody: full.html ?? "",
        attachments: (full.attachments ?? []).map((a: any) => ({
          Name: a.filename ?? a.name ?? "",
          ContentType: a.content_type ?? a.contentType ?? "",
          Content: a.content ?? "",
        })),
      };
    }

    // If we couldn't fetch full content, use what we have from the webhook
    console.warn(`[email-inbound] Could not fetch full content for ${d.email_id}, using webhook metadata only`);
    return {
      toAddresses: toArr,
      fromEmail: fromAddr,
      subject: subj,
      textBody: "",
      htmlBody: "",
      attachments: [],
    };
  }

  // ── Postmark format ───────────────────────────────────────
  if (body.ToFull || body.TextBody !== undefined) {
    const toAddresses: string[] = [];
    if (body.ToFull) toAddresses.push(...body.ToFull.map((t: any) => t.Email ?? ""));
    if (body.To) toAddresses.push(body.To);
    if (body.CcFull) toAddresses.push(...body.CcFull.map((t: any) => t.Email ?? ""));
    return {
      toAddresses,
      fromEmail: body.From ?? body.FromFull?.Email ?? "",
      subject: body.Subject ?? "",
      textBody: body.TextBody ?? "",
      htmlBody: body.HtmlBody ?? "",
      attachments: body.Attachments ?? [],
    };
  }

  // ── Generic / direct format fallback ──────────────────────
  if (body.to || body.from) {
    const to = Array.isArray(body.to) ? body.to : [body.to].filter(Boolean);
    return {
      toAddresses: to,
      fromEmail: body.from ?? "",
      subject: body.subject ?? "",
      textBody: body.text ?? body.plain ?? "",
      htmlBody: body.html ?? "",
      attachments: (body.attachments ?? []).map((a: any) => ({
        Name: a.filename ?? a.name ?? "",
        ContentType: a.content_type ?? a.contentType ?? "",
        Content: a.content ?? "",
      })),
    };
  }

  // ── Last resort ───────────────────────────────────────────
  return {
    toAddresses: [body.to ?? body.To ?? ""].filter(Boolean),
    fromEmail: body.from ?? body.From ?? "",
    subject: body.subject ?? body.Subject ?? "",
    textBody: body.text ?? body.TextBody ?? body.body ?? "",
    htmlBody: body.html ?? body.HtmlBody ?? "",
    attachments: [],
  };
}

// ── Route handler ─────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json();
    const { toAddresses, fromEmail, subject, textBody, htmlBody, attachments } = await normalizeInbound(rawBody);

    // ── Extract TO address to find company ────────────────────
    const inboundAddr = toAddresses.find(a => a.includes("orders-"));
    const tokenMatch = inboundAddr?.match(/orders-(\w+)@/);
    if (!tokenMatch) {
      return NextResponse.json({ ok: false, reason: "no company token in TO address" }, { status: 200 });
    }
    const token = tokenMatch[1].toLowerCase();

    // ── Init Supabase with service role (bypasses RLS) ────────
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    // ── Find company by token ─────────────────────────────────
    const { data: companies } = await supabase.from("companies").select("id");
    const company = (companies ?? []).find((c: { id: string }) => companyToken(c.id) === token);
    if (!company) {
      return NextResponse.json({ ok: false, reason: "company not found" }, { status: 200 });
    }
    const companyId = company.id;

    // ── Extract text from PDF attachments ─────────────────────
    let attachmentText = "";
    for (const att of attachments) {
      const name = (att.Name ?? "").toLowerCase();
      const contentType = (att.ContentType ?? "").toLowerCase();
      if (name.endsWith(".pdf") || contentType.includes("pdf")) {
        const pdfText = await extractPdfText(att.Content ?? "");
        if (pdfText) {
          attachmentText += " " + pdfText;
          console.log(`[email-inbound] Extracted ${pdfText.length} chars from PDF: ${att.Name}`);
        }
      }
    }

    const fullText = subject + " " + textBody + " " + htmlBody + " " + attachmentText;

    const orderNumbers = extractOrderNumbers(fullText);
    const trackingNums = extractTracking(fullText);
    const detectedStatus = detectStatus(subject, textBody + " " + htmlBody);
    const eta = extractETA(fullText);
    const pkgInfo = extractPackageInfo(fullText);
    const productDesc = extractProductDescription(fullText);
    const vendor = extractVendor(fullText, fromEmail);
    const customerName = extractCustomerName(fullText);

    console.log(`[email-inbound] company=${companyId} status=${detectedStatus} orders=${orderNumbers} tracking=${trackingNums} vendor=${vendor} customer=${JSON.stringify(customerName)} product=${productDesc}`);

    // ── Try to match to an existing quote_materials record ────
    let matched = false;
    let matchedMaterialId: string | null = null;

    if (orderNumbers.length > 0) {
      for (const orderNum of orderNumbers) {
        const { data: mats } = await supabase
          .from("quote_materials")
          .select("id, status, quote_id, expected_packages, received_packages, description")
          .eq("company_id", companyId)
          .or(`order_number.ilike.%${orderNum}%,description.ilike.%${orderNum}%,order_pdf_text.ilike.%${orderNum}%`)
          .limit(1);

        if (mats && mats.length > 0) {
          const mat = mats[0];
          matchedMaterialId = mat.id;
          await updateExistingMaterial(supabase, mat, companyId, {
            detectedStatus, trackingNums, eta, pkgInfo, subject, vendor, fromEmail,
          });
          matched = true;
          break;
        }
      }
    }

    // ── Also try matching by tracking number ──────────────────
    if (!matched && trackingNums.length > 0) {
      for (const trackNum of trackingNums) {
        const { data: mats } = await supabase
          .from("quote_materials")
          .select("id, status, quote_id, expected_packages, received_packages, description")
          .eq("company_id", companyId)
          .ilike("tracking_number", `%${trackNum}%`)
          .limit(1);

        if (mats && mats.length > 0) {
          const mat = mats[0];
          matchedMaterialId = mat.id;
          await updateExistingMaterial(supabase, mat, companyId, {
            detectedStatus, trackingNums, eta, pkgInfo, subject, vendor, fromEmail,
          });
          matched = true;
          break;
        }
      }
    }

    // ── No match found — try to auto-create a new material ────
    if (!matched && detectedStatus === "ordered" && orderNumbers.length > 0) {
      const autoCreated = await autoCreateMaterial(supabase, companyId, {
        orderNumbers, trackingNums, detectedStatus, eta, pkgInfo,
        productDesc, vendor, customerName, subject, fromEmail,
      });
      if (autoCreated) {
        matched = true;
        matchedMaterialId = autoCreated.materialId;
      }
    }

    // ── Store unmatched emails for manual review ──────────────
    if (!matched && (detectedStatus || orderNumbers.length > 0)) {
      await supabase.from("email_order_inbox").insert([{
        company_id: companyId,
        from_email: fromEmail,
        subject: subject.slice(0, 300),
        order_number: orderNumbers[0] ?? null,
        tracking_number: trackingNums[0] ?? null,
        detected_status: detectedStatus,
        email_body: textBody.slice(0, 1000),
        reviewed: false,
        matched_material: matchedMaterialId,
      }]);

      // Create notification about unmatched order email
      try {
        await supabase.from("notifications").insert([{
          company_id: companyId,
          type: "order_email_unmatched",
          title: "📧 New order email — needs review",
          message: `From: ${fromEmail.slice(0, 60)}. Subject: "${subject.slice(0, 80)}"${orderNumbers.length > 0 ? `. Order #${orderNumbers[0]}` : ""}`,
          icon: "📧",
          link: "/warehouse",
        }]);
      } catch { /* non-critical */ }
    }

    return NextResponse.json({
      ok: true,
      matched,
      status: detectedStatus,
      orders: orderNumbers,
      tracking: trackingNums,
      packages: pkgInfo,
      vendor,
      autoCreated: matched && !matchedMaterialId ? false : matched,
    });

  } catch (err) {
    console.error("[email-inbound] error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 200 });
  }
}

// ── Update an existing material record ───────────────────────

async function updateExistingMaterial(
  supabase: any,
  mat: { id: string; status: string; quote_id: string; expected_packages: number | null; received_packages: number | null; description: string | null },
  companyId: string,
  opts: {
    detectedStatus: StatusType;
    trackingNums: string[];
    eta: string | null;
    pkgInfo: { count: number | null; packageNum: number | null };
    subject: string;
    vendor: string | null;
    fromEmail: string;
  },
) {
  const { detectedStatus, trackingNums, eta, pkgInfo, subject, vendor } = opts;

  // Only advance status, never go backwards
  const STATUS_ORDER = ["not_ordered", "ordered", "shipped", "received", "staged"];
  const currentIdx = STATUS_ORDER.indexOf(mat.status);
  const newIdx = STATUS_ORDER.indexOf(detectedStatus ?? "");

  const update: Record<string, unknown> = {
    last_email_at: new Date().toISOString(),
    last_email_subject: subject.slice(0, 200),
    auto_updated: true,
  };

  if (detectedStatus && newIdx > currentIdx) {
    update.status = detectedStatus;
    if (detectedStatus === "ordered") update.ordered_at = new Date().toISOString();
    if (detectedStatus === "shipped") update.shipped_at = new Date().toISOString();
    if (detectedStatus === "received") update.received_at = new Date().toISOString();
  }

  if (trackingNums.length > 0) update.tracking_number = trackingNums[0];
  if (eta) update.eta = eta;
  if (vendor) update.vendor = vendor;
  if (pkgInfo.count && !mat.expected_packages) update.expected_packages = pkgInfo.count;

  await supabase.from("quote_materials").update(update).eq("id", mat.id);

  // ── Package-level tracking ──────────────────────────────────
  if (trackingNums.length > 0) {
    for (const trackNum of trackingNums) {
      const { data: existingPkg } = await supabase
        .from("material_packages")
        .select("id")
        .eq("material_id", mat.id)
        .eq("tracking_number", trackNum)
        .limit(1);

      if (existingPkg && existingPkg.length > 0) {
        if (detectedStatus === "received") {
          await supabase.from("material_packages").update({
            status: "received",
            received_at: new Date().toISOString(),
            received_by: "Email Auto-Detect",
          }).eq("id", existingPkg[0].id);
        } else if (detectedStatus === "shipped") {
          await supabase.from("material_packages").update({ status: "shipped" }).eq("id", existingPkg[0].id);
        }
      } else {
        // Try to assign tracking to a pending package
        const { data: pendingPkg } = await supabase
          .from("material_packages")
          .select("id")
          .eq("material_id", mat.id)
          .is("tracking_number", null)
          .eq("status", "pending")
          .limit(1);

        if (pendingPkg && pendingPkg.length > 0) {
          const pkgUpdate: Record<string, unknown> = { tracking_number: trackNum };
          if (detectedStatus === "shipped") pkgUpdate.status = "shipped";
          if (detectedStatus === "received") {
            pkgUpdate.status = "received";
            pkgUpdate.received_at = new Date().toISOString();
            pkgUpdate.received_by = "Email Auto-Detect";
          }
          await supabase.from("material_packages").update(pkgUpdate).eq("id", pendingPkg[0].id);
        } else {
          // Create a new package entry
          const pkgLabel = pkgInfo.packageNum
            ? `Package ${pkgInfo.packageNum}${pkgInfo.count ? ` of ${pkgInfo.count}` : ""}`
            : `Package (auto-detected)`;
          await supabase.from("material_packages").insert([{
            material_id: mat.id,
            tracking_number: trackNum,
            status: detectedStatus === "received" ? "received" : detectedStatus === "shipped" ? "shipped" : "pending",
            description: pkgLabel,
            received_at: detectedStatus === "received" ? new Date().toISOString() : null,
            received_by: detectedStatus === "received" ? "Email Auto-Detect" : null,
            company_id: companyId,
          }]);
        }
      }
    }

    // Recount received packages
    const { data: allPkgs } = await supabase
      .from("material_packages").select("status").eq("material_id", mat.id);
    if (allPkgs) {
      const receivedCount = allPkgs.filter((p: any) => p.status === "received").length;
      await supabase.from("quote_materials").update({ received_packages: receivedCount }).eq("id", mat.id);
      if (allPkgs.length > 0 && allPkgs.every((p: any) => p.status === "received")) {
        await supabase.from("quote_materials").update({
          status: "received",
          received_at: new Date().toISOString(),
        }).eq("id", mat.id);
      }
    }
  }

  // ── Check if all materials on quote are done → ready to install
  const { data: quoteMats } = await supabase
    .from("quote_materials").select("status, quote_id").eq("quote_id", mat.quote_id);
  const allDone = quoteMats?.every((m: any) => m.status === "received" || m.status === "staged");
  if (allDone && quoteMats && quoteMats.length > 0) {
    const { data: quote } = await supabase
      .from("quotes").select("customer_id, customers(first_name, last_name)").eq("id", mat.quote_id).single();
    if (quote) {
      await supabase.from("customers")
        .update({ next_action: "All materials received — ready to schedule install" })
        .eq("id", quote.customer_id);
      const custN = (quote as any).customers
        ? [(quote as any).customers.first_name, (quote as any).customers.last_name].filter(Boolean).join(" ")
        : "Customer";
      try {
        await supabase.from("notifications").insert([{
          company_id: companyId,
          type: "ready_to_install",
          title: `🎉 Ready to Install — ${custN}`,
          message: `All materials received. Schedule the installation!`,
          icon: "🎉",
          link: `/quotes/${mat.quote_id}`,
          customer_id: quote.customer_id,
          quote_id: mat.quote_id,
        }]);
      } catch { /* non-critical */ }
    }
  }

  // ── Activity log + notification ─────────────────────────────
  const { data: q } = await supabase
    .from("quotes").select("customer_id, customers(first_name, last_name)").eq("id", mat.quote_id).single();
  if (q) {
    const statusLabels: Record<string, string> = { ordered: "Order confirmed", shipped: "Order shipped", received: "Materials received" };
    const trackingStr = trackingNums.length > 0 ? ` — Tracking: ${trackingNums.join(", ")}` : "";
    const pkgStr = pkgInfo.packageNum ? ` (pkg ${pkgInfo.packageNum}${pkgInfo.count ? `/${pkgInfo.count}` : ""})` : "";
    await supabase.from("activity_log").insert([{
      customer_id: q.customer_id,
      company_id: companyId,
      type: "note",
      notes: `📦 ${statusLabels[detectedStatus ?? ""] ?? detectedStatus}${pkgStr} (auto-detected from email: "${subject.slice(0, 80)}")${trackingStr}`,
      created_by: "Email Tracking",
    }]);

    const custName = (q as any).customers
      ? [(q as any).customers.first_name, (q as any).customers.last_name].filter(Boolean).join(" ")
      : "Customer";
    const notifIcons: Record<string, string> = { ordered: "🔄", shipped: "🚚", received: "✅" };
    const notifTitles: Record<string, string> = {
      ordered: `Order Confirmed — ${custName}`,
      shipped: `Shipment In Transit — ${custName}`,
      received: `Materials Delivered — ${custName}`,
    };
    const notifMessages: Record<string, string> = {
      ordered: `${mat.description || "Materials"} order confirmed${eta ? `. ETA: ${eta}` : ""}`,
      shipped: `${mat.description || "Materials"} shipped${trackingNums.length > 0 ? ` (tracking: ${trackingNums[0]})` : ""}${pkgStr}`,
      received: `${mat.description || "Materials"} delivered to warehouse${pkgStr}. Ready to check in!`,
    };
    try {
      await supabase.from("notifications").insert([{
        company_id: companyId,
        type: `shipment_${detectedStatus}`,
        title: notifTitles[detectedStatus ?? ""] || `Shipment Update — ${custName}`,
        message: notifMessages[detectedStatus ?? ""] || `${mat.description || "Materials"} status: ${detectedStatus}`,
        icon: notifIcons[detectedStatus ?? ""] || "📦",
        link: `/quotes/${mat.quote_id}`,
        customer_id: q.customer_id,
        quote_id: mat.quote_id,
      }]);
    } catch { /* non-critical */ }
  }
}

// ── Auto-create a new material from an order confirmation ─────

async function autoCreateMaterial(
  supabase: any,
  companyId: string,
  opts: {
    orderNumbers: string[];
    trackingNums: string[];
    detectedStatus: StatusType;
    eta: string | null;
    pkgInfo: { count: number | null; packageNum: number | null };
    productDesc: string | null;
    vendor: string | null;
    customerName: { firstName: string; lastName: string } | null;
    subject: string;
    fromEmail: string;
  },
): Promise<{ materialId: string; quoteId: string } | null> {
  const { orderNumbers, trackingNums, detectedStatus, eta, pkgInfo, productDesc, vendor, customerName, subject, fromEmail } = opts;

  // ── Strategy 1: Match by customer name ──────────────────────
  let quoteId: string | null = null;
  let customerId: string | null = null;
  let custDisplayName = "Customer";

  if (customerName) {
    const { data: custs } = await supabase
      .from("customers")
      .select("id, first_name, last_name")
      .eq("company_id", companyId)
      .ilike("first_name", customerName.firstName)
      .ilike("last_name", customerName.lastName)
      .limit(1);

    if (custs && custs.length > 0) {
      customerId = custs[0].id;
      custDisplayName = [custs[0].first_name, custs[0].last_name].filter(Boolean).join(" ");

      // Find their most recent approved or sent quote
      const { data: quotes } = await supabase
        .from("quotes")
        .select("id")
        .eq("customer_id", customerId)
        .in("status", ["approved", "sent"])
        .order("created_at", { ascending: false })
        .limit(1);

      if (quotes && quotes.length > 0) {
        quoteId = quotes[0].id;
      }
    }
  }

  // ── Strategy 2: If no customer match, look for any recent active quote
  if (!quoteId) {
    // Look for quotes that already have materials (active orders) as a fallback
    const { data: recentQuotes } = await supabase
      .from("quotes")
      .select("id, customer_id, customers(first_name, last_name)")
      .eq("company_id", companyId)
      .in("status", ["approved", "sent"])
      .order("created_at", { ascending: false })
      .limit(5);

    // Don't blindly assign to a random quote — only if there's exactly one active quote
    if (recentQuotes && recentQuotes.length === 1) {
      quoteId = recentQuotes[0].id;
      customerId = recentQuotes[0].customer_id;
      const c = (recentQuotes[0] as any).customers;
      if (c) custDisplayName = [c.first_name, c.last_name].filter(Boolean).join(" ");
    }
  }

  // If we still couldn't find a quote, we can't auto-create
  if (!quoteId) return null;

  // ── Create the quote_materials record ───────────────────────
  const description = productDesc || `Order from ${vendor || "manufacturer"} — ${subject.slice(0, 80)}`;

  const { data: newMat, error } = await supabase.from("quote_materials").insert([{
    quote_id: quoteId,
    company_id: companyId,
    description,
    status: detectedStatus || "ordered",
    vendor: vendor || null,
    order_number: orderNumbers[0] || null,
    tracking_number: trackingNums[0] || null,
    ordered_at: new Date().toISOString(),
    eta: eta || null,
    expected_packages: pkgInfo.count || null,
    received_packages: 0,
    auto_updated: true,
    last_email_at: new Date().toISOString(),
    last_email_subject: subject.slice(0, 200),
    notes: `Auto-created from email: "${subject.slice(0, 100)}" from ${fromEmail}`,
  }]).select("id").single();

  if (error || !newMat) {
    console.error("[email-inbound] Failed to auto-create material:", error);
    return null;
  }

  // Create packages if we have tracking numbers
  if (trackingNums.length > 0) {
    for (let i = 0; i < trackingNums.length; i++) {
      await supabase.from("material_packages").insert([{
        material_id: newMat.id,
        tracking_number: trackingNums[i],
        status: detectedStatus === "shipped" ? "shipped" : "pending",
        description: `Package ${i + 1}${pkgInfo.count ? ` of ${pkgInfo.count}` : ""}`,
        company_id: companyId,
      }]);
    }
  } else if (pkgInfo.count) {
    // Create placeholder packages
    for (let i = 0; i < pkgInfo.count; i++) {
      await supabase.from("material_packages").insert([{
        material_id: newMat.id,
        status: "pending",
        description: `Package ${i + 1} of ${pkgInfo.count}`,
        company_id: companyId,
      }]);
    }
  }

  // ── Activity log ────────────────────────────────────────────
  if (customerId) {
    await supabase.from("activity_log").insert([{
      customer_id: customerId,
      company_id: companyId,
      type: "note",
      notes: `📦 New order auto-created from email: "${subject.slice(0, 80)}" — Order #${orderNumbers[0] || "N/A"}${vendor ? ` (${vendor})` : ""}`,
      created_by: "Email Tracking",
    }]);
  }

  // ── Notification ────────────────────────────────────────────
  try {
    await supabase.from("notifications").insert([{
      company_id: companyId,
      type: "order_auto_created",
      title: `📦 New Order — ${custDisplayName}`,
      message: `${description.slice(0, 100)}. Order #${orderNumbers[0] || "N/A"}${vendor ? ` from ${vendor}` : ""}`,
      icon: "📦",
      link: `/quotes/${quoteId}`,
      customer_id: customerId,
      quote_id: quoteId,
    }]);
  } catch { /* non-critical */ }

  console.log(`[email-inbound] Auto-created material ${newMat.id} on quote ${quoteId} for customer ${custDisplayName}`);
  return { materialId: newMat.id, quoteId };
}
