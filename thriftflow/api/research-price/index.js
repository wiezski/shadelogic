const { createClient } = require("@supabase/supabase-js");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  try {
    const { item_id } = req.body;
    const { data: item } = await supabase.from("items").select("*").eq("id", item_id).single();
    if (!item) return res.status(404).json({ error: "Item not found" });

    const searchQuery = [item.title, item.era_style, item.materials, item.category].filter(Boolean).join(" ");
    if (!searchQuery.trim()) {
      return res.json({ research: null, reason: "no_details", links: buildLinks("vintage antique decor") });
    }

    // Build research links regardless
    const links = buildLinks(searchQuery);

    // Try Claude API for intelligent pricing
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey || apiKey === "your-key-here") {
      return res.json({ research: null, reason: "no_api_key", links });
    }

    const prompt = `You are a vintage/antique resale pricing expert. Based on your knowledge of completed sales on eBay, Poshmark, Mercari, Etsy, and Facebook Marketplace, estimate the fair market resale value for this item:

Title: ${item.title || "Unknown"}
Category: ${item.category || "Unknown"}
Era/Style: ${item.era_style || "Unknown"}
Materials: ${item.materials || "Unknown"}
Condition: ${item.condition || "Unknown"}
Additional Notes: ${item.notes || "None"}

Respond in this exact JSON format (no markdown, just raw JSON):
{
  "suggestedLow": 25,
  "suggestedHigh": 75,
  "suggestedPrice": 50,
  "confidence": "medium",
  "reasoning": "Brief 1-2 sentence explanation of how you arrived at this price range",
  "comparables": [
    {"title": "Similar item that sold", "price": 45, "platform": "eBay"},
    {"title": "Another comparable", "price": 60, "platform": "Poshmark"}
  ],
  "searchTerms": "best search terms to find this item on marketplaces",
  "tips": "1-2 selling tips specific to this item type"
}`;

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!resp.ok) {
      console.log("Anthropic API error:", resp.status);
      return res.json({ research: null, reason: "api_error", links });
    }

    const data = await resp.json();
    const text = data.content?.[0]?.text || "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return res.json({ research: null, reason: "parse_error", links });

    const research = JSON.parse(match[0]);

    // Update the item with suggested pricing
    const updateData = { updated_at: new Date().toISOString() };

    // Store research in ai_analysis
    const existingAnalysis = item.ai_analysis || {};
    updateData.ai_analysis = {
      ...existingAnalysis,
      priceResearch: research,
      researchedAt: new Date().toISOString(),
    };

    // If no listing price set, use the suggested price
    if (!item.listing_price && research.suggestedPrice) {
      updateData.listing_price = research.suggestedPrice;
    }

    await supabase.from("items").update(updateData).eq("id", item_id);

    // Rebuild links with better search terms if provided
    const betterLinks = research.searchTerms ? buildLinks(research.searchTerms) : links;

    res.json({ research, links: betterLinks });
  } catch (error) {
    console.error("Research error:", error);
    const searchQuery = req.body?.title || "vintage antique";
    res.json({ research: null, reason: "error", links: buildLinks(searchQuery) });
  }
};

function buildLinks(query) {
  const q = encodeURIComponent(query);
  return {
    googleImages: `https://www.google.com/search?tbm=isch&q=${q}+vintage+antique+value`,
    ebaySold: `https://www.ebay.com/sch/i.html?_nkw=${q}&LH_Complete=1&LH_Sold=1&_sop=13`,
    ebayActive: `https://www.ebay.com/sch/i.html?_nkw=${q}&_sop=13`,
    poshmark: `https://poshmark.com/search?query=${q}&type=listings`,
    mercari: `https://www.mercari.com/search/?keyword=${q}`,
    etsy: `https://www.etsy.com/search?q=${q}&explicit=1&ship_to=US`,
  };
}
