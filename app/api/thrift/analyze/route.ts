// AI Vision Analysis — sends photos to Claude to identify item details
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { photos, userNotes } = await req.json();

    if (!photos || photos.length === 0) {
      return NextResponse.json({ error: "No photos provided" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;

    // If no API key, return mock analysis for testing
    if (!apiKey) {
      return NextResponse.json({
        analysis: getMockAnalysis(),
        mock: true,
      });
    }

    // Build the content array with images
    const content: Array<Record<string, unknown>> = [];

    for (const photo of photos.slice(0, 4)) {
      // Strip data URL prefix to get raw base64
      const base64Match = photo.match(/^data:image\/([\w+]+);base64,(.+)$/);
      if (base64Match) {
        content.push({
          type: "image",
          source: {
            type: "base64",
            media_type: `image/${base64Match[1]}`,
            data: base64Match[2],
          },
        });
      }
    }

    content.push({
      type: "text",
      text: `You are an expert antique and vintage decor appraiser. Analyze these photos of a thrifted item and provide a detailed assessment.

${userNotes ? `The seller notes: "${userNotes}"` : ""}

Respond in this exact JSON format (no markdown, just raw JSON):
{
  "itemType": "specific item type, e.g. 'Brass Table Lamp', 'Crystal Vase'",
  "eraStyle": "era and style, e.g. 'Art Deco (1920s-1930s)', 'Mid-Century Modern'",
  "materials": ["list", "of", "materials"],
  "condition": "brief condition assessment",
  "makerMarks": "any visible maker's marks, signatures, or labels (or 'None visible')",
  "estimatedValue": { "low": 25, "high": 75 },
  "keywords": ["search", "keywords", "for", "marketplace", "listings"],
  "suggestedCategory": "one of: Lighting, Vases & Vessels, Mirrors, Frames, Furniture, Tableware, Figurines, Textiles, Art & Prints, Clocks, Barware, Jewelry, Books & Ephemera, Garden & Outdoor, Other",
  "confidence": 0.85,
  "notes": "any additional observations about authenticity, rarity, or selling tips"
}`,
    });

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
        messages: [{ role: "user", content }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Anthropic API error:", err);
      return NextResponse.json({ analysis: getMockAnalysis(), mock: true, error: "API call failed, using mock data" });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || "";

    // Parse JSON from response (handle potential markdown wrapping)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ analysis: getMockAnalysis(), mock: true, error: "Could not parse AI response" });
    }

    const analysis = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ analysis, mock: false });
  } catch (error) {
    console.error("Analysis error:", error);
    return NextResponse.json({ analysis: getMockAnalysis(), mock: true, error: "Analysis failed, using mock data" });
  }
}

function getMockAnalysis() {
  return {
    itemType: "Brass Table Lamp",
    eraStyle: "Mid-Century Modern (1940s-1960s)",
    materials: ["Brass", "Glass"],
    condition: "Good - minor patina, fully functional",
    makerMarks: "None visible",
    estimatedValue: { low: 45, high: 120 },
    keywords: ["mid-century", "brass", "table lamp", "vintage", "MCM", "atomic age"],
    suggestedCategory: "Lighting",
    confidence: 0.75,
    notes: "Mock analysis — set ANTHROPIC_API_KEY in .env.local for real AI analysis",
  };
}
