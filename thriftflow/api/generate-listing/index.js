const { createClient } = require("@supabase/supabase-js");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  try {
    const { item_id, platform } = req.body;
    const { data: item } = await supabase.from("items").select("*").eq("id", item_id).single();
    if (!item) return res.status(404).json({ error: "Item not found" });

    const analysis = item.ai_analysis || {};
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey || apiKey === "your-key-here") {
      const listing = mockListing(analysis, platform || "ebay");
      await supabase.from("items").update({
        generated_listing: listing, status: "listed", updated_at: new Date().toISOString(),
      }).eq("id", item_id);
      return res.json({ listing, mock: true });
    }

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-latest",
        max_tokens: 2048,
        messages: [{
          role: "user",
          content: `You are an expert eBay/marketplace listing writer for vintage and antique items.

Item analysis:
${JSON.stringify(analysis, null, 2)}

Additional notes: ${item.notes || "None"}
Purchase price: $${item.purchase_price || "unknown"}
Platform: ${platform || "ebay"}

Write a compelling marketplace listing. Respond in this exact JSON format (no markdown, just raw JSON):
{
  "title": "optimized listing title under 80 chars with key search terms",
  "description": "full HTML description with headers, details, measurements placeholder, condition notes, and shipping info. Use <h3>, <p>, <ul> tags. Make it professional but warm.",
  "suggestedPrice": { "low": 25, "high": 75, "recommended": 50 },
  "tags": ["search", "tags", "for", "the", "listing"],
  "category": "suggested marketplace category path"
}`
        }],
      }),
    });

    if (!resp.ok) {
      const listing = mockListing(analysis, platform || "ebay");
      await supabase.from("items").update({
        generated_listing: listing, status: "listed", updated_at: new Date().toISOString(),
      }).eq("id", item_id);
      return res.json({ listing, mock: true });
    }

    const data = await resp.json();
    const text = data.content?.[0]?.text || "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      const listing = mockListing(analysis, platform || "ebay");
      return res.json({ listing, mock: true });
    }

    const listing = JSON.parse(match[0]);
    await supabase.from("items").update({
      generated_listing: listing,
      title: item.title || analysis.itemType || listing.title || "Untitled",
      listing_price: listing.suggestedPrice?.recommended || null,
      status: "listed",
      updated_at: new Date().toISOString(),
    }).eq("id", item_id);

    res.json({ listing, mock: false });
  } catch (error) {
    console.error("Listing generation error:", error);
    res.json({ listing: mockListing({}, "ebay"), mock: true });
  }
};

function mockListing(analysis, platform) {
  const title = analysis.itemType || "Vintage Decorative Item";
  return {
    title: `${title} - ${analysis.eraStyle || "Vintage"} - Beautiful Condition`,
    description: `<h3>${title}</h3><p>Beautiful ${(analysis.eraStyle || "vintage").toLowerCase()} piece in ${(analysis.condition || "good condition").toLowerCase()}.</p><h3>Details</h3><ul><li>Era: ${analysis.eraStyle || "Vintage"}</li><li>Materials: ${(analysis.materials || ["Unknown"]).join(", ")}</li><li>Condition: ${analysis.condition || "Good"}</li></ul><h3>Shipping</h3><p>Carefully packed and shipped within 2 business days.</p><p><em>DEMO MODE — set ANTHROPIC_API_KEY for AI-generated listings</em></p>`,
    suggestedPrice: analysis.estimatedValue || { low: 25, high: 75, recommended: 50 },
    tags: analysis.keywords || ["vintage", "antique", "decor"],
    category: analysis.suggestedCategory || "Collectibles",
  };
}
