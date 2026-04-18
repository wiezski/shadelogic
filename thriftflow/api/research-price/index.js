const { createClient } = require("@supabase/supabase-js");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  try {
    const { item_id } = req.body;
    const { data: item } = await supabase.from("items").select("*").eq("id", item_id).single();
    if (!item) return res.status(404).json({ error: "Item not found" });

    // Get photos for this item so Claude can see them
    const { data: photos } = await supabase.from("photos").select("storage_path").eq("item_id", item_id).order("sort_order");
    const photoUrls = (photos || []).map(p => supabase.storage.from("photos").getPublicUrl(p.storage_path).data.publicUrl);

    const searchQuery = [item.title, item.era_style, item.materials, item.category].filter(Boolean).join(" ");
    if (!searchQuery.trim()) {
      return res.json({ research: null, reason: "no_details", links: buildLinks("vintage antique decor") });
    }

    const links = buildLinks(searchQuery);

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey || apiKey === "your-key-here") {
      return res.json({ research: null, reason: "no_api_key", links });
    }

    // Build message content — include photos if available
    const content = [];
    for (const url of photoUrls.slice(0, 4)) {
      content.push({ type: "image", source: { type: "url", url } });
    }

    content.push({
      type: "text",
      text: `You are an expert vintage/antique resale specialist who writes listings that SELL. You know eBay, Poshmark, Mercari, Etsy, and Facebook Marketplace inside and out.

${photoUrls.length > 0 ? "I've included photos of the item above." : "No photos available — work from the description below."}

ITEM DETAILS:
- Title: ${item.title || "Unknown"}
- Category: ${item.category || "Unknown"}
- Era/Style: ${item.era_style || "Unknown"}
- Materials: ${item.materials || "Unknown"}
- Condition: ${item.condition || "Unknown"}
- Seller Notes: ${item.notes || "None"}
- Purchase Price: ${item.purchase_price ? "$" + item.purchase_price : "Unknown"}

YOUR TASK: Research comparable sold items and create a complete listing package. Think about what similar items have actually sold for on eBay (completed listings), Poshmark, Mercari, and Etsy. Factor in condition, rarity, demand, and seasonality.

Respond in this exact JSON format (no markdown, just raw JSON):
{
  "suggestedLow": 25,
  "suggestedHigh": 75,
  "suggestedPrice": 50,
  "confidence": "medium",
  "reasoning": "2-3 sentence explanation of pricing based on comparable sales",
  "comparables": [
    {"title": "Similar item that sold", "price": 45, "platform": "eBay"},
    {"title": "Another comparable", "price": 60, "platform": "Etsy"},
    {"title": "Third comparable", "price": 55, "platform": "Mercari"}
  ],
  "listingTitle": "Optimized listing title with key search terms (max 80 chars)",
  "listingDescription": "A compelling 3-5 sentence listing description that highlights key selling points, condition, measurements if apparent from photos, era/style, and materials. Write it ready to paste into any marketplace. Include relevant details buyers search for.",
  "conditionNotes": "Detailed condition description noting any wear, patina, chips, cracks, or if it's in excellent shape. Be honest but positive.",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6", "tag7", "tag8"],
  "searchTerms": "best search terms to find comps on marketplaces",
  "measurements": "Estimated measurements if visible in photos, or 'Measure and add' if not determinable",
  "shippingTip": "Shipping advice specific to this item type (weight estimate, packaging tips)",
  "platformTips": {
    "ebay": "eBay-specific tip (best category, auction vs buy-it-now, etc)",
    "poshmark": "Poshmark-specific tip",
    "mercari": "Mercari-specific tip",
    "etsy": "Etsy-specific tip",
    "facebook": "FB Marketplace tip"
  },
  "bestPlatform": "ebay",
  "bestPlatformReason": "Why this platform is best for this specific item",
  "tips": "1-2 key selling tips specific to this item"
}`
    });

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-latest",
        max_tokens: 2048,
        messages: [{ role: "user", content }],
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

    // Update item with research data
    const existingAnalysis = item.ai_analysis || {};
    const updateData = {
      updated_at: new Date().toISOString(),
      ai_analysis: {
        ...existingAnalysis,
        priceResearch: research,
        researchedAt: new Date().toISOString(),
      },
    };

    // Auto-fill listing price if not set
    if (!item.listing_price && research.suggestedPrice) {
      updateData.listing_price = research.suggestedPrice;
    }

    // Auto-fill title if it's generic or missing
    if (research.listingTitle && (!item.title || item.title === "Untitled" || item.title.length < 10)) {
      updateData.title = research.listingTitle;
    }

    await supabase.from("items").update(updateData).eq("id", item_id);

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
