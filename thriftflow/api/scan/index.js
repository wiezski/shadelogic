module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { photos, notes } = req.body;
    // photos = array of base64 data URLs or public URLs

    if (!photos || photos.length === 0) {
      return res.status(400).json({ error: "No photos provided" });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    console.log("API key present:", !!apiKey, "length:", apiKey?.length, "photos:", photos.length);
    if (!apiKey || apiKey === "your-key-here") {
      return res.json({ error: "no_api_key", errorDetail: "No Anthropic API key configured in Vercel environment variables" });
    }

    // Build content with images
    const content = [];
    for (const photo of photos.slice(0, 4)) {
      if (photo.startsWith("data:")) {
        // Base64 data URL
        const match = photo.match(/^data:(image\/\w+);base64,(.+)$/);
        if (match) {
          content.push({
            type: "image",
            source: { type: "base64", media_type: match[1], data: match[2] },
          });
        }
      } else {
        // Public URL
        content.push({ type: "image", source: { type: "url", url: photo } });
      }
    }

    content.push({
      type: "text",
      text: `You are an expert vintage/antique appraiser AND resale listing specialist. You help people who thrift items and resell them on eBay, Poshmark, Mercari, Etsy, and Facebook Marketplace.

Look at these photos carefully. Your job is to:
1. IDENTIFY exactly what this item is — be specific (not just "lamp" but "Brass Torchiere Floor Lamp")
2. RESEARCH comparable items — think about what similar items have actually sold for on eBay completed listings, Etsy sold, Poshmark, Mercari
3. WRITE a complete listing that will SELL this item

${notes ? `Seller's notes: "${notes}"` : "No additional notes from seller."}

Respond in this exact JSON format (no markdown, just raw JSON):
{
  "title": "Specific item title optimized for search (max 80 chars, pack with keywords buyers search for)",
  "category": "One of: Lighting, Vases & Vessels, Mirrors, Frames, Furniture, Tableware, Figurines, Textiles, Art & Prints, Clocks, Barware, Jewelry, Books & Ephemera, Garden & Outdoor, Other",
  "eraStyle": "Era and style, e.g. 'Mid-Century Modern (1950s-1960s)' or 'Art Deco (1920s-1930s)'",
  "materials": "Materials visible, e.g. 'Brass, Glass'",
  "condition": "Detailed condition from photos — note any chips, cracks, patina, wear, stains, or if it looks excellent",
  "suggestedLow": 15,
  "suggestedHigh": 55,
  "suggestedPrice": 35,
  "confidence": "medium",
  "reasoning": "2-3 sentences explaining your pricing based on what similar items have sold for. Mention specific comparable sales you're drawing from.",
  "comparables": [
    {"title": "Similar item that sold", "price": 30, "platform": "eBay"},
    {"title": "Another comparable", "price": 45, "platform": "Etsy"},
    {"title": "Third comparable", "price": 38, "platform": "Mercari"}
  ],
  "listingDescription": "A compelling 3-5 sentence listing description ready to paste into any marketplace. Highlight key selling points, materials, era, condition, approximate dimensions if visible. Write like a pro reseller — engaging but factual.",
  "conditionNotes": "Honest detailed condition assessment for the listing",
  "tags": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5", "keyword6", "keyword7", "keyword8"],
  "measurements": "Estimated dimensions from photos if possible, or 'Please measure before listing'",
  "shippingTip": "Shipping advice — weight estimate, packaging tips, ship via USPS/UPS/FedEx recommendation",
  "searchTerms": "The best search terms to find this exact type of item on Google Images or eBay",
  "bestPlatform": "ebay",
  "bestPlatformReason": "Why this platform is best for this specific item",
  "platformTips": {
    "ebay": "eBay-specific listing tip (auction vs BIN, best category, etc)",
    "poshmark": "Poshmark tip",
    "mercari": "Mercari tip",
    "etsy": "Etsy tip",
    "facebook": "FB Marketplace tip"
  },
  "sellingTips": "2-3 specific tips to maximize the sale price for THIS item"
}`,
    });

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-latest",
        max_tokens: 2048,
        messages: [{ role: "user", content }],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.log("Anthropic API error:", resp.status, errText);
      return res.json({ error: "api_error", errorDetail: "Anthropic API returned " + resp.status + ": " + errText.substring(0, 200) });
    }

    const data = await resp.json();
    console.log("Anthropic response received, content length:", JSON.stringify(data).length);
    const text = data.content?.[0]?.text || "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return res.json({ error: "parse_error", errorDetail: "Could not parse AI response: " + text.substring(0, 200) });

    const result = JSON.parse(match[0]);

    // Build search links using the identified item
    const searchQ = result.searchTerms || result.title || "vintage antique";
    result.links = buildLinks(searchQ);

    res.json({ result });
  } catch (error) {
    console.error("Scan error:", error);
    res.json({ error: "server_error", errorDetail: error.message || String(error) });
  }
};

function buildLinks(query) {
  const q = encodeURIComponent(query);
  return {
    googleImages: `https://www.google.com/search?tbm=isch&q=${q}`,
    ebaySold: `https://www.ebay.com/sch/i.html?_nkw=${q}&LH_Complete=1&LH_Sold=1&_sop=13`,
    ebayActive: `https://www.ebay.com/sch/i.html?_nkw=${q}&_sop=13`,
    poshmark: `https://poshmark.com/search?query=${q}&type=listings`,
    mercari: `https://www.mercari.com/search/?keyword=${q}`,
    etsy: `https://www.etsy.com/search?q=${q}&explicit=1&ship_to=US`,
  };
}

