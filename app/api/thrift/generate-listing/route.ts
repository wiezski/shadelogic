// AI Listing Generator — creates marketplace-ready descriptions
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { item, platform } = await req.json();
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      return NextResponse.json({
        listing: getMockListing(item, platform),
        mock: true,
      });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [{
          role: "user",
          content: `You are an expert vintage/antique marketplace seller. Generate a ${platform || "eBay"} listing for this item.

Item details:
- Title: ${item.title}
- Category: ${item.category}
- Era/Style: ${item.eraStyle}
- Materials: ${(item.materials || []).join(", ")}
- Condition: ${item.condition}
- Dimensions: ${JSON.stringify(item.dimensions || {})}
- AI Analysis notes: ${item.aiAnalysis?.notes || "N/A"}
- Keywords from analysis: ${(item.aiAnalysis?.keywords || []).join(", ")}
- Seller description: ${item.description || "N/A"}

Generate a listing optimized for search visibility and conversions. Respond in this exact JSON format (no markdown):
{
  "title": "SEO-optimized listing title (max 80 chars for eBay)",
  "description": "Full listing description with details, condition notes, measurements. Use short paragraphs. Include relevant keywords naturally. Professional but warm tone.",
  "keywords": ["search", "keywords", "for", "tags"],
  "suggestedPrice": { "low": 30, "mid": 55, "high": 85 }
}`,
        }],
      }),
    });

    if (!response.ok) {
      return NextResponse.json({ listing: getMockListing(item, platform), mock: true });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ listing: getMockListing(item, platform), mock: true });
    }

    const listing = JSON.parse(jsonMatch[0]);
    listing.platform = platform || "ebay";
    listing.generatedAt = new Date().toISOString();

    return NextResponse.json({ listing, mock: false });
  } catch (error) {
    console.error("Listing generation error:", error);
    return NextResponse.json({ listing: getMockListing(null, "ebay"), mock: true });
  }
}

function getMockListing(item: Record<string, unknown> | null, platform: string) {
  const title = (item as Record<string, string>)?.title || "Vintage Item";
  return {
    title: `Vintage ${title} - ${platform === "etsy" ? "Antique Home Decor" : "Estate Find"}`,
    description: `Beautiful vintage ${title} in wonderful condition. This stunning piece showcases the craftsmanship of its era and would make a perfect addition to any curated home.\n\nCondition: Good vintage condition with age-appropriate wear that adds character.\n\nDimensions: Please see photos for scale.\n\nShipped with care — all items are securely wrapped and double-boxed for protection.\n\n(Mock listing — set ANTHROPIC_API_KEY for AI-generated descriptions)`,
    keywords: ["vintage", "antique", "home decor", "estate", "curated"],
    suggestedPrice: { low: 25, mid: 50, high: 85 },
    platform: platform || "ebay",
    generatedAt: new Date().toISOString(),
  };
}
