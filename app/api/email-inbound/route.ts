// ── Email Order Tracking Webhook ──────────────────────────────
// Receives inbound emails from Postmark and auto-updates
// quote_materials order status + package tracking in the database.
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

function extractTracking(text: string): string[] {
  const patterns = [
    /\b(1Z[A-Z0-9]{16})\b/gi,                  // UPS
    /\b(94\d{18,20})\b/g,                        // USPS
    /\b(3S[A-Z0-9]{14})\b/gi,                   // FedEx
    /tracking[:\s#]+([A-Z0-9]{10,30})/gi,
  ];
  const found = new Set<string>();
  for (const p of patterns) {
    const matches = [...text.matchAll(p)];
    matches.forEach(m => found.add(m[1].trim()));
  }
  return [...found];
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

function extractPackageInfo(text: string): { count: number | null; packageNum: number | null } {
  // "Package 2 of 5" or "Shipment 3/8"
  const ofMatch = text.match(/(?:package|shipment|box|carton)\s*(\d+)\s*(?:of|\/)\s*(\d+)/i);
  if (ofMatch) {
    return { packageNum: parseInt(ofMatch[1]), count: parseInt(ofMatch[2]) };
  }
  // "5 packages total"
  const totalMatch = text.match(/(\d+)\s*(?:packages?|boxes?|cartons?)\s*(?:total|will|to\s+be)/i);
  if (totalMatch) {
    return { packageNum: null, count: parseInt(totalMatch[1]) };
  }
  return { count: null, packageNum: null };
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
    // pdf-parse not installed or parse failed
    return "";
  }
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

    // ── Extract text from PDF attachments ────────────────────
    let attachmentText = "";
    const attachments = body.Attachments ?? [];
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

    const orderNumbers   = extractOrderNumbers(fullText);
    const trackingNums   = extractTracking(fullText);
    const detectedStatus = detectStatus(subject, textBody + " " + htmlBody);
    const eta            = extractETA(fullText);
    const fromEmail      = body.From ?? "";
    const pkgInfo        = extractPackageInfo(fullText);

    console.log(`[email-inbound] company=${companyId} orders=${orderNumbers} status=${detectedStatus} tracking=${trackingNums} pkgs=${JSON.stringify(pkgInfo)}`);

    // ── Try to match to a quote_materials record ─────────────
    let matched = false;
    let matchedMaterialId: string | null = null;

    if (orderNumbers.length > 0) {
      for (const orderNum of orderNumbers) {
        // Search by order_number, description, or order_pdf_text
        const { data: mats } = await supabase
          .from("quote_materials")
          .select("id, status, quote_id, expected_packages, received_packages, description")
          .eq("company_id", companyId)
          .or(`order_number.ilike.%${orderNum}%,description.ilike.%${orderNum}%,order_pdf_text.ilike.%${orderNum}%`)
          .limit(1);

        if (mats && mats.length > 0) {
          const mat = mats[0];
          matchedMaterialId = mat.id;

          // Only advance status, never go backwards
          const STATUS_ORDER = ["not_ordered", "ordered", "shipped", "received", "staged"];
          const currentIdx = STATUS_ORDER.indexOf(mat.status);
          const newIdx     = STATUS_ORDER.indexOf(detectedStatus ?? "");

          const update: Record<string, unknown> = {
            last_email_at:     new Date().toISOString(),
            last_email_subject: subject.slice(0, 200),
            auto_updated:      true,
          };

          if (detectedStatus && newIdx > currentIdx) {
            update.status = detectedStatus;
            if (detectedStatus === "ordered")    update.ordered_at = new Date().toISOString();
            if (detectedStatus === "shipped")    update.shipped_at = new Date().toISOString();
            if (detectedStatus === "received")   update.received_at = new Date().toISOString();
          }

          // Update tracking number (first one found)
          if (trackingNums.length > 0 && !update.tracking_number) {
            update.tracking_number = trackingNums[0];
          }

          // Update ETA if found
          if (eta) update.eta = eta;

          // Update expected packages if detected and not already set
          if (pkgInfo.count && !mat.expected_packages) {
            update.expected_packages = pkgInfo.count;
          }

          await supabase.from("quote_materials").update(update).eq("id", mat.id);
          matched = true;

          // ── Package-level tracking ────────────────────────
          // If we have tracking numbers, try to match or create packages
          if (trackingNums.length > 0) {
            for (const trackNum of trackingNums) {
              // Check if this tracking number already exists as a package
              const { data: existingPkg } = await supabase
                .from("material_packages")
                .select("id")
                .eq("material_id", mat.id)
                .eq("tracking_number", trackNum)
                .limit(1);

              if (existingPkg && existingPkg.length > 0) {
                // Update existing package
                if (detectedStatus === "received") {
                  await supabase.from("material_packages").update({
                    status: "received",
                    received_at: new Date().toISOString(),
                    received_by: "Email Auto-Detect",
                  }).eq("id", existingPkg[0].id);
                } else if (detectedStatus === "shipped") {
                  await supabase.from("material_packages").update({
                    status: "shipped",
                  }).eq("id", existingPkg[0].id);
                }
              } else {
                // Try to assign tracking to a pending package without a tracking number
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
              .from("material_packages")
              .select("status")
              .eq("material_id", mat.id);

            if (allPkgs) {
              const receivedCount = allPkgs.filter(p => p.status === "received").length;
              await supabase.from("quote_materials").update({
                received_packages: receivedCount,
              }).eq("id", mat.id);

              // If all packages received, mark material as received
              const allReceived = allPkgs.length > 0 && allPkgs.every(p => p.status === "received");
              if (allReceived) {
                await supabase.from("quote_materials").update({
                  status: "received",
                  received_at: new Date().toISOString(),
                }).eq("id", mat.id);
              }
            }
          }

          // Check if all materials on this quote are now received/staged
          const { data: quoteMats } = await supabase
            .from("quote_materials")
            .select("status, quote_id")
            .eq("quote_id", mat.quote_id);
          const allDone = quoteMats?.every(m => m.status === "received" || m.status === "staged");
          if (allDone && quoteMats && quoteMats.length > 0) {
            const { data: quote } = await supabase
              .from("quotes").select("customer_id, customers(first_name, last_name)").eq("id", mat.quote_id).single();
            if (quote) {
              await supabase.from("customers")
                .update({ next_action: "All materials received — ready to schedule install" })
                .eq("id", quote.customer_id);

              // Notification: All materials ready
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

          // Log activity on customer + create notification
          if (matched) {
            const { data: q } = await supabase.from("quotes").select("customer_id, customers(first_name, last_name)").eq("id", mat.quote_id).single();
            if (q) {
              const statusLabels: Record<string, string> = { ordered: "Order confirmed", shipped: "Order shipped", received: "Materials received" };
              const trackingStr = trackingNums.length > 0 ? ` — Tracking: ${trackingNums.join(", ")}` : "";
              const pkgStr = pkgInfo.packageNum ? ` (pkg ${pkgInfo.packageNum}${pkgInfo.count ? `/${pkgInfo.count}` : ""})` : "";
              await supabase.from("activity_log").insert([{
                customer_id: q.customer_id,
                company_id:  companyId,
                type:        "note",
                notes:       `📦 ${statusLabels[detectedStatus ?? ""] ?? detectedStatus}${pkgStr} (auto-detected from email: "${subject.slice(0, 80)}")${trackingStr}`,
                created_by:  "Email Tracking",
              }]);

              // Create in-app notification for shipment status changes
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
                received: `${mat.description || "Materials"} delivered to warehouse${pkgStr}. Ready to schedule install!`,
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
              } catch (notifErr) {
                console.error("[email-inbound] Failed to create notification:", notifErr);
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
        tracking_number: trackingNums[0] ?? null,
        detected_status: detectedStatus,
        email_body:      textBody.slice(0, 1000),
        reviewed:        false,
        matched_material: matchedMaterialId,
      }]);
    }

    return NextResponse.json({
      ok:       true,
      matched,
      status:   detectedStatus,
      orders:   orderNumbers,
      tracking: trackingNums,
      packages: pkgInfo,
    });

  } catch (err) {
    console.error("[email-inbound] error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 200 });
    // Always return 200 to prevent Postmark retries on app errors
  }
}
