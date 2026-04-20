// ── Product Sheet Parser API ─────────────────────────────────
// Receives an uploaded PDF or image of a manufacturer price/spec sheet,
// extracts text (PDF via pdf-parse, images via structured parsing),
// and returns structured product data for preview/import.
//
// Supports: PDF files, PNG/JPG images (basic text extraction from image metadata)
// For best results with images, use PDF format.
//
// POST /api/parse-product-sheet
// Body: multipart/form-data with "file" field

import { NextRequest, NextResponse } from "next/server";

// ── Known manufacturer product lines for smart categorization ──
const KNOWN_CATEGORIES: Record<string, string> = {
  "roller": "roller", "roll shade": "roller", "roller shade": "roller",
  "solar": "solar", "solar shade": "solar", "screen shade": "solar",
  "cellular": "cellular", "honeycomb": "cellular", "duette": "cellular",
  "pleated": "cellular",
  "blind": "blind", "wood blind": "blind", "faux wood": "blind",
  "mini blind": "blind", "aluminum blind": "blind", "venetian": "blind",
  "shutter": "shutter", "plantation": "shutter",
  "motorized": "motorized", "powerview": "motorized", "smart shade": "motorized",
  "drapery": "drapery", "drape": "drapery", "curtain": "drapery",
  "vertical": "vertical", "vertical blind": "vertical",
  "sheer": "sheer", "silhouette": "sheer", "pirouette": "sheer",
  "roman": "roman", "roman shade": "roman",
  "woven": "woven", "woven wood": "woven", "bamboo": "woven",
};

function guessCategory(text: string): string {
  const lower = text.toLowerCase();
  for (const [keyword, cat] of Object.entries(KNOWN_CATEGORIES)) {
    if (lower.includes(keyword)) return cat;
  }
  return "other";
}

// ── Known manufacturers ──────────────────────────────────────
const MANUFACTURERS = [
  "Hunter Douglas", "Graber", "Levolor", "Bali", "Norman",
  "Comfortex", "Lutron", "Somfy", "Alta Window Fashions",
  "Springs Window Fashions", "Rollease Acmeda", "Insolroll",
  "Mechoshade", "QMotion", "Coulisse", "Silent Gliss",
  "Shade-O-Matic", "Maxxmar", "Skandia", "Phifer",
  "Mermet", "Sunbrella", "Hartmann&Forbes",
];

function detectManufacturer(text: string): string | null {
  const lower = text.toLowerCase();
  for (const m of MANUFACTURERS) {
    if (lower.includes(m.toLowerCase())) return m;
  }
  return null;
}

// ── Size extraction ──────────────────────────────────────────
function extractSizes(text: string): { minW: string | null; maxW: string | null; minH: string | null; maxH: string | null } {
  const result = { minW: null as string | null, maxW: null as string | null, minH: null as string | null, maxH: null as string | null };

  // Pattern: "Width: 12" to 96""
  const widthRange = text.match(/width\s*:?\s*(\d+(?:\s*\d+\/\d+)?)\s*["″]?\s*(?:to|-|–)\s*(\d+(?:\s*\d+\/\d+)?)\s*["″]?/i);
  if (widthRange) { result.minW = widthRange[1]; result.maxW = widthRange[2]; }

  const heightRange = text.match(/height\s*:?\s*(\d+(?:\s*\d+\/\d+)?)\s*["″]?\s*(?:to|-|–)\s*(\d+(?:\s*\d+\/\d+)?)\s*["″]?/i);
  if (heightRange) { result.minH = heightRange[1]; result.maxH = heightRange[2]; }

  // Pattern: "Min Width: 12"  Max Width: 96""
  if (!result.minW) {
    const minW = text.match(/min(?:imum)?\s*width\s*:?\s*(\d+(?:\s*\d+\/\d+)?)/i);
    if (minW) result.minW = minW[1];
  }
  if (!result.maxW) {
    const maxW = text.match(/max(?:imum)?\s*width\s*:?\s*(\d+(?:\s*\d+\/\d+)?)/i);
    if (maxW) result.maxW = maxW[1];
  }
  if (!result.minH) {
    const minH = text.match(/min(?:imum)?\s*height\s*:?\s*(\d+(?:\s*\d+\/\d+)?)/i);
    if (minH) result.minH = minH[1];
  }
  if (!result.maxH) {
    const maxH = text.match(/max(?:imum)?\s*height\s*:?\s*(\d+(?:\s*\d+\/\d+)?)/i);
    if (maxH) result.maxH = maxH[1];
  }

  return result;
}

// ── Extract product rows from structured text ────────────────
type ParsedProduct = {
  name: string;
  category: string;
  manufacturer: string | null;
  sku: string | null;
  cost: number | null;
  multiplier: number | null;
  min_width: string | null;
  max_width: string | null;
  min_height: string | null;
  max_height: string | null;
  lead_time_days: number | null;
  color_options: string | null;
  notes: string | null;
};

function parseProducts(text: string, detectedManufacturer: string | null): ParsedProduct[] {
  const products: ParsedProduct[] = [];
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);

  // Strategy 1: Look for tabular data (columns with prices)
  // Pattern: "Product Name    SKU-123    $85.00    $212.50"
  const priceLineRegex = /^(.{5,60}?)\s{2,}([A-Z0-9][\w-]{2,20})?\s{0,}\$?\s*(\d+\.?\d{0,2})\s/;

  for (const line of lines) {
    const m = line.match(priceLineRegex);
    if (m) {
      const name = m[1].trim();
      if (/^(product|item|description|name|sku|price|cost|total)/i.test(name)) continue;
      if (name.length < 3) continue;

      const sku = m[2]?.trim() || null;
      const cost = parseFloat(m[3]) || null;
      const sizes = extractSizes(text);

      products.push({
        name,
        category: guessCategory(name),
        manufacturer: detectedManufacturer,
        sku,
        cost,
        multiplier: null,
        min_width: sizes.minW, max_width: sizes.maxW,
        min_height: sizes.minH, max_height: sizes.maxH,
        lead_time_days: null, color_options: null, notes: null,
      });
    }
  }

  // Strategy 1b: Tab-separated or multi-space columns with dollar amounts
  // Common in exported price lists: "Roller Blackout\t$85.00\t$212.50"
  if (products.length === 0) {
    for (const line of lines) {
      const tabParts = line.split(/\t+/);
      if (tabParts.length >= 2) {
        const name = tabParts[0].trim();
        if (name.length < 3 || /^(product|item|description|name|sku|price|cost|total|#)/i.test(name)) continue;
        // Find first price-like value in the remaining parts
        let cost: number | null = null;
        let sku: string | null = null;
        for (const part of tabParts.slice(1)) {
          const priceMatch = part.trim().match(/^\$?\s*(\d{1,6}(?:\.\d{1,2})?)$/);
          if (priceMatch && !cost) {
            cost = parseFloat(priceMatch[1]);
          } else if (/^[A-Z0-9][\w-]{2,20}$/.test(part.trim()) && !sku) {
            sku = part.trim();
          }
        }
        if (cost !== null || sku) {
          products.push({
            name, category: guessCategory(name), manufacturer: detectedManufacturer,
            sku, cost, multiplier: null,
            min_width: null, max_width: null, min_height: null, max_height: null,
            lead_time_days: null, color_options: null, notes: null,
          });
        }
      }
    }
  }

  // Strategy 2: Look for product names with descriptions (bullet lists)
  if (products.length === 0) {
    const listRegex = /^[\-•●○◦\*]\s+(.{5,80})$|^(\d+[\.\)]\s+.{5,80})$/;
    for (const line of lines) {
      const m = line.match(listRegex);
      if (m) {
        const name = (m[1] || m[2] || "").replace(/^\d+[\.\)]\s+/, "").trim();
        if (name.length < 3) continue;
        if (/^(note|warning|disclaimer|see|for|please)/i.test(name)) continue;

        const sz = extractSizes(line);
        products.push({
          name, category: guessCategory(name), manufacturer: detectedManufacturer,
          sku: null, cost: null, multiplier: null,
          min_width: sz.minW, max_width: sz.maxW,
          min_height: sz.minH, max_height: sz.maxH,
          lead_time_days: null, color_options: null, notes: null,
        });
      }
    }
  }

  // Strategy 3: Look for any line that has "Product Name" followed by $ price
  if (products.length === 0) {
    const priceNearby = /(.{5,60}?)\s+\$(\d+\.?\d{0,2})/g;
    let match;
    while ((match = priceNearby.exec(text)) !== null) {
      const name = match[1].trim();
      if (/^(total|subtotal|tax|shipping|discount|price|cost)/i.test(name)) continue;
      if (name.length < 3) continue;
      products.push({
        name, category: guessCategory(name), manufacturer: detectedManufacturer,
        sku: null, cost: parseFloat(match[2]) || null, multiplier: null,
        min_width: null, max_width: null, min_height: null, max_height: null,
        lead_time_days: null, color_options: null, notes: null,
      });
    }
  }

  // Strategy 4: Section-heading based — detect product groups under category headings
  // e.g., "ROLLER SHADES\n  Blackout Standard\n  Light Filtering..."
  if (products.length === 0) {
    let currentSection: string | null = null;
    for (const line of lines) {
      // Detect section headers (ALL CAPS, or ending with colon, or short + bold-like)
      if (/^[A-Z][A-Z\s&\/\-]{3,40}$/.test(line) || /^.{3,40}:$/.test(line)) {
        currentSection = line.replace(/:$/, "").trim();
        continue;
      }
      // Under a section, any decent-length line could be a product
      if (currentSection && line.length >= 5 && line.length <= 80) {
        if (/^(note|warning|disclaimer|page|see |for |please|available)/i.test(line)) continue;
        if (/^\d+$/.test(line)) continue; // skip pure numbers
        const priceInLine = line.match(/\$(\d+\.?\d{0,2})/);
        const nameClean = line.replace(/\$\d+\.?\d{0,2}/g, "").trim();
        if (nameClean.length < 3) continue;
        products.push({
          name: nameClean,
          category: guessCategory(currentSection + " " + nameClean),
          manufacturer: detectedManufacturer,
          sku: null,
          cost: priceInLine ? parseFloat(priceInLine[1]) : null,
          multiplier: null,
          min_width: null, max_width: null, min_height: null, max_height: null,
          lead_time_days: null, color_options: null, notes: null,
        });
      }
    }
  }

  // Extract lead time from doc
  const ltMatch = text.match(/lead\s*time\s*:?\s*(\d+)\s*(?:days?|business\s*days?|weeks?)/i);
  const leadTime = ltMatch ? parseInt(ltMatch[1]) * (ltMatch[0].toLowerCase().includes("week") ? 7 : 1) : null;

  // Extract colors — broader matching
  const colorPatterns = [
    /(?:colors?|finishes?|fabric\s*options?)\s*:?\s*([A-Za-z,\s|\/]+(?:White|Black|Gray|Grey|Cream|Ivory|Beige|Brown|Tan|Navy|Pewter|Bronze|Champagne|Silver|Alabaster|Linen|Snow|Pearl|Charcoal|Espresso|Mocha|Sand|Dune|Stone|Slate|Fog|Mist|Cloud|Dove|Ash|Smoke|Bone|Natural|Wheat|Oat|Flax|Camel|Cocoa|Walnut|Mahogany|Oak|Maple)[A-Za-z,\s|\/]*)/i,
    /(?:available\s+in|comes\s+in|offered\s+in)\s*:?\s*([A-Za-z,\s|\/&]{10,200})/i,
  ];
  let colors: string | null = null;
  for (const pat of colorPatterns) {
    const colorMatch = text.match(pat);
    if (colorMatch) { colors = colorMatch[1].trim().replace(/\s{2,}/g, " "); break; }
  }

  // Apply doc-level data to products
  if (leadTime || colors) {
    products.forEach(p => {
      if (!p.lead_time_days && leadTime) p.lead_time_days = leadTime;
      if (!p.color_options && colors) p.color_options = colors;
    });
  }

  // Deduplicate by name
  const seen = new Set<string>();
  return products.filter(p => {
    const key = p.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 200); // Increased limit for large catalogs
}

// ── Route handler ────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const fileName = file.name.toLowerCase();
    const buffer = Buffer.from(await file.arrayBuffer());
    let text = "";

    if (fileName.endsWith(".pdf") || file.type.includes("pdf")) {
      // PDF extraction
      try {
        // @ts-ignore — pdf-parse must be installed: npm install pdf-parse
        const pdfParse = (await import("pdf-parse")).default;
        const parsed = await pdfParse(buffer);
        text = parsed.text || "";
      } catch {
        const rawText = buffer.toString("utf-8");
        text = rawText.replace(/[^\x20-\x7E\n]/g, " ").replace(/\s{2,}/g, " ").trim();
        if (text.length < 50) {
          return NextResponse.json({
            error: "pdf-parse not installed. Run: npm install pdf-parse",
            products: [],
            fallback: true,
          });
        }
      }
    } else if (fileName.endsWith(".csv") || fileName.endsWith(".tsv") || file.type.includes("csv")) {
      // CSV — redirect to existing CSV import flow
      text = buffer.toString("utf-8");
      return NextResponse.json({
        error: "CSV files should use the CSV import feature directly.",
        isCSV: true,
        products: [],
      });
    } else {
      // Image files — we can't do OCR server-side without external services,
      // but we can return guidance
      return NextResponse.json({
        error: "Image OCR requires a PDF version. Please scan or convert the image to PDF first, or manually enter the products.",
        isImage: true,
        products: [],
        tip: "Most phone scanners (Google Drive, Apple Notes, Adobe Scan) can convert a photo to a searchable PDF.",
      });
    }

    const manufacturer = detectManufacturer(text);
    const products = parseProducts(text, manufacturer);
    const globalSizes = extractSizes(text);

    return NextResponse.json({
      manufacturer,
      products,
      globalSizes,
      textLength: text.length,
      textPreview: text.slice(0, 500),
    });
  } catch (err) {
    console.error("[parse-product-sheet] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
