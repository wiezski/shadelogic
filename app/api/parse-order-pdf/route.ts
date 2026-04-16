// ── Order PDF Parser API ─────────────────────────────────────
// Receives an uploaded PDF, extracts text, and parses order info.
//
// SETUP: npm install pdf-parse
// This route will gracefully fail if pdf-parse is not installed.

import { NextRequest, NextResponse } from "next/server";

// ── Text extraction helpers ─────────────────────────────────

function extractOrderNumber(text: string): string | null {
  const patterns = [
    /order\s*(?:number|#|no\.?|num\.?)?\s*:?\s*([A-Z0-9][\w-]{3,30})/gi,
    /po\s*(?:#|number|no\.?)?\s*:?\s*([A-Z0-9][\w-]{3,30})/gi,
    /confirmation\s*(?:#|number|no\.?)?\s*:?\s*([A-Z0-9][\w-]{3,30})/gi,
    /invoice\s*(?:#|number|no\.?)?\s*:?\s*([A-Z0-9][\w-]{3,30})/gi,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const inner = m[0].match(/([A-Z0-9][\w-]{3,30})\s*$/i);
      if (inner) return inner[1].toUpperCase();
    }
  }
  return null;
}

function extractPackageCount(text: string): number | null {
  const patterns = [
    /(\d+)\s*(?:packages?|boxes?|cartons?|parcels?|pieces?|units?|shipments?)\s*(?:total|will|to\s+be|being|are)/i,
    /total\s*(?:of\s+)?(\d+)\s*(?:packages?|boxes?|cartons?|parcels?)/i,
    /ships?\s+in\s+(\d+)\s*(?:packages?|boxes?|cartons?)/i,
    /(?:packages?|boxes?|cartons?)\s*:?\s*(\d+)/i,
    /qty\s*:?\s*(\d+)\s*(?:packages?|boxes?|cartons?)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const n = parseInt(m[1]);
      if (n > 0 && n < 200) return n;
    }
  }
  return null;
}

function extractETA(text: string): string | null {
  const patterns = [
    /(?:estimated|expected)\s*(?:delivery|ship|arrival)\s*(?:date)?\s*:?\s*([A-Za-z]+ \d{1,2},?\s*\d{4})/i,
    /(?:deliver|ship|arrive)\s*(?:by|on|date)\s*:?\s*([A-Za-z]+ \d{1,2},?\s*\d{4})/i,
    /(?:eta|est\.?\s*delivery)\s*:?\s*([A-Za-z]+ \d{1,2},?\s*\d{4})/i,
    /(\d{1,2}\/\d{1,2}\/\d{2,4})\s*(?:estimated|expected|delivery|ship)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1].trim();
  }
  return null;
}

function extractVendor(text: string): string | null {
  // Look for common manufacturer names in window treatment industry
  const knownVendors = [
    "Hunter Douglas", "Graber", "Levolor", "Bali", "Springs Window Fashions",
    "Norman", "Comfortex", "Lutron", "Somfy", "Rollease Acmeda",
    "Alta Window Fashions", "Insolroll", "Mechoshade", "QMotion",
    "Coulisse", "Silent Gliss", "Blinds.com", "SelectBlinds",
    "Budget Blinds", "3 Day Blinds", "Next Day Blinds",
  ];
  const lower = text.toLowerCase();
  for (const v of knownVendors) {
    if (lower.includes(v.toLowerCase())) return v;
  }
  // Try to find "from: CompanyName" or "shipped by: CompanyName"
  const fromMatch = text.match(/(?:from|shipped by|sold by|vendor|supplier)\s*:?\s*([A-Z][A-Za-z\s&]{2,40}?)(?:\n|,|\.|$)/);
  if (fromMatch) return fromMatch[1].trim();
  return null;
}

function extractLineItems(text: string): string[] {
  // Try to find product descriptions — look for lines with quantities
  const items: string[] = [];
  const lines = text.split(/\n/);
  for (const line of lines) {
    // Match lines like "2x Roller Shade - Blackout" or "Qty: 4 Solar Shade 5%"
    if (/(?:qty|quantity|\d+\s*x|\d+\s+units?)\s*:?\s*.{5,}/i.test(line)) {
      items.push(line.trim());
    }
  }
  return items.slice(0, 50); // cap at 50 items
}

// ── Route handler ────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Convert file to buffer
    const buffer = Buffer.from(await file.arrayBuffer());
    let text = "";

    // Try pdf-parse if available
    try {
      // @ts-ignore — pdf-parse must be installed: npm install pdf-parse
      const pdfParse = (await import("pdf-parse")).default;
      const parsed = await pdfParse(buffer);
      text = parsed.text || "";
    } catch {
      // pdf-parse not installed — try basic text extraction from buffer
      // This won't work for most PDFs but catches text-only ones
      const rawText = buffer.toString("utf-8");
      // Extract readable strings (very basic fallback)
      text = rawText.replace(/[^\x20-\x7E\n]/g, " ").replace(/\s{2,}/g, " ").trim();
      if (text.length < 50) {
        return NextResponse.json({
          error: "pdf-parse not installed. Run: npm install pdf-parse",
          text: "",
          fallback: true,
        }, { status: 200 });
      }
    }

    // Parse extracted text
    const orderNumber = extractOrderNumber(text);
    const expectedPackages = extractPackageCount(text);
    const eta = extractETA(text);
    const vendor = extractVendor(text);
    const lineItems = extractLineItems(text);

    return NextResponse.json({
      text: text.slice(0, 5000),
      orderNumber,
      expectedPackages,
      eta,
      vendor,
      lineItems,
      packageDescriptions: expectedPackages
        ? Array.from({ length: expectedPackages }, (_, i) => `Package ${i + 1} of ${expectedPackages}`)
        : null,
    });
  } catch (err) {
    console.error("[parse-order-pdf] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
