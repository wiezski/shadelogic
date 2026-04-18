const { createClient } = require("@supabase/supabase-js");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  try {
    const { item_id, notes } = req.body;
    console.log("Analyze called for item:", item_id);

    const { data: photos, error: photoErr } = await supabase
      .from("photos").select("storage_path").eq("item_id", item_id).order("sort_order");

    console.log("Photos found:", photos?.length || 0, "Error:", photoErr?.message || "none");

    if (!photos || photos.length === 0) {
      console.log("DEMO: No photos found for item");
      return res.json({ analysis: mockAnalysis(), mock: true, reason: "no_photos" });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    console.log("API key present:", !!apiKey, "Length:", apiKey?.length || 0, "Starts with:", apiKey?.substring(0, 10) || "N/A");
    if (!apiKey || apiKey === "your-key-here") {
      console.log("DEMO: No valid API key");
      return res.json({ analysis: mockAnalysis(), mock: true, reason: "no_api_key" });
    }

    const content = [];
    for (const photo of photos.slice(0, 4)) {
      const { data } = supabase.storage.from("photos").getPublicUrl(photo.storage_path);
      content.push({ type: "image", source: { type: "url", url: data.publicUrl } });
    }
    content.push({
      type: "text",
      text: `You are an expert antique and vintage decor appraiser. Analyze these photos of a thrifted item.
${notes ? `Seller notes: "${notes}"` : ""}
Respond in this exact JSON format (no markdown, just raw JSON):
{
  "itemType": "specific item type, e.g. 'Brass Table Lamp'",
  "eraStyle": "era and style, e.g. 'Art Deco (1920s-1930s)'",
  "materials": ["list", "of", "materials"],
  "condition": "brief condition assessment",
  "makerMarks": "any visible maker's marks or 'None visible'",
  "estimatedValue": { "low": 25, "high": 75 },
  "keywords": ["search", "keywords", "for", "listings"],
  "suggestedCategory": "one of: Lighting, Vases & Vessels, Mirrors, Frames, Furniture, Tableware, Figurines, Textiles, Art & Prints, Clocks, Barware, Jewelry, Books & Ephemera, Garden & Outdoor, Other",
  "confidence": 0.85,
  "notes": "additional observations about authenticity, rarity, selling tips"
}`
    });

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-3-5-sonnet-latest", max_tokens: 1024, messages: [{ role: "user", content }] }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.log("Anthropic API error:", resp.status, errText);
      return res.json({ analysis: mockAnalysis(), mock: true, reason: "api_error_" + resp.status });
    }

    const data = await resp.json();
    const text = data.content?.[0]?.text || "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return res.json({ analysis: mockAnalysis(), mock: true });

    const analysis = JSON.parse(match[0]);
    await supabase.from("items").update({
      ai_analysis: analysis, title: analysis.itemType || "Untitled",
      category: analysis.suggestedCategory || "Other", era_style: analysis.eraStyle || "",
      materials: (analysis.materials || []).join(", "), status: "photographed",
      updated_at: new Date().toISOString(),
    }).eq("id", item_id);

    res.json({ analysis, mock: false });
  } catch (error) {
    console.error("Analysis error:", error);
    res.json({ analysis: mockAnalysis(), mock: true });
  }
};

function mockAnalysis() {
  return {
    itemType: "Brass Table Lamp", eraStyle: "Mid-Century Modern (1940s-1960s)",
    materials: ["Brass", "Glass"], condition: "Good - minor patina, fully functional",
    makerMarks: "None visible", estimatedValue: { low: 45, high: 120 },
    keywords: ["mid-century", "brass", "table lamp", "vintage", "MCM"],
    suggestedCategory: "Lighting", confidence: 0.75,
    notes: "DEMO MODE — set ANTHROPIC_API_KEY for real AI analysis"
  };
}
