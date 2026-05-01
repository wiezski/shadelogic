// The 15 audit checks, weighted to window-treatment industry priorities.
//
// Weight distribution (totals 100):
//   Blind-business fit    60 pts (6 checks — the specific items Steve said matter most)
//   Technical foundation  30 pts (6 checks)
//   Content & conversion  10 pts (3 checks)
//
// Each check returns a Finding with a score between 0 and its maxPoints.
// Severity drives UI treatment in the report, but score drives the 0-100 total.

import type { CheckFn, Finding } from "./types";

// ── Utility helpers ──────────────────────────────────────────────────

function normalizeText(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

// Common Utah service cities (customize this once we have a town-list engine
// for each state; for now we're anchored to Steve's primary market).
const UTAH_CITIES = [
  "provo", "orem", "lehi", "mapleton", "springville", "spanish-fork", "spanishfork",
  "american-fork", "americanfork", "pleasant-grove", "pleasantgrove",
  "salt-lake-city", "saltlakecity", "sandy", "draper", "south-jordan", "southjordan",
  "west-jordan", "westjordan", "murray", "midvale", "cottonwood", "holladay",
  "bountiful", "layton", "ogden", "kaysville", "farmington", "syracuse",
  "saratoga-springs", "saratogasprings", "eagle-mountain", "eaglemountain",
  "park-city", "parkcity", "heber", "highland", "alpine", "cedar-hills", "cedarhills",
  "st-george", "stgeorge", "washington", "hurricane",
];

// ── Blind-business-fit checks (60 pts) ──────────────────────────────

// 1. Phone visibility (12 pts)
export const checkPhoneVisibility: CheckFn = (ctx) => {
  const { $ } = ctx;
  const telLinks = $('a[href^="tel:"]').length;
  const header = $("header, nav, .header, #header, [class*='header'], [class*='Header']")
    .first();
  const headerText = normalizeText(header.text());
  const headerHasPhone = /\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/.test(headerText) ||
    header.find('a[href^="tel:"]').length > 0;

  // Phone number anywhere in visible body
  const bodyText = normalizeText($("body").text());
  const phoneAnywhere = /\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/.test(bodyText);

  let score = 0;
  let detail = "";
  let recommendation = "";
  let severity: Finding["severity"] = "critical";

  if (headerHasPhone && telLinks > 0) {
    score = 12;
    severity = "pass";
    detail = "Phone is prominent in the header and tappable on mobile. Homeowners can reach you in one tap from any page.";
    recommendation = "Keep it exactly as-is. This is the single most-used action on a local service site.";
  } else if (headerHasPhone) {
    score = 8;
    severity = "important";
    detail = "Phone is visible in the header, but it isn’t a tappable tel: link — which means mobile visitors have to memorize it or copy-paste.";
    recommendation =
      "Make your phone number one-tap callable on mobile. This is the #1 action homeowners take before booking, and friction here directly costs you calls.";
  } else if (telLinks > 0) {
    score = 6;
    severity = "important";
    detail = `There are ${telLinks} click-to-call link(s) on the page, but not in the header where homeowners look first.`;
    recommendation =
      "Get your phone number into the header, above the fold, on every page. Homeowners look there first — if it’s not there, they leave.";
  } else if (phoneAnywhere) {
    score = 3;
    severity = "critical";
    detail = "Your phone number appears on the page, but it may not be prominent or tappable — which likely limits the calls coming in.";
    recommendation =
      "A prominent, clickable phone number in the header tends to be the single biggest conversion lever on a local installer site. Motivated buyers want a fast way to reach you — when it isn’t obvious, they often bounce.";
  } else {
    score = 0;
    severity = "critical";
    detail = "Phone visibility may not be strongly implemented on this page. Most homeowners shopping for blinds or shutters want to call before they book — without a clear, prominent number, those calls likely route to competitors instead.";
    recommendation =
      "A visible, one-tap-callable phone number in the header is the single biggest conversion lever for a local installer site. When it isn’t strongly featured, your warmest leads tend to go to whoever makes calling easy.";
  }

  return {
    id: "phone_visibility",
    category: "phone_visibility",
    severity,
    title: "Phone number in the header",
    detail,
    recommendation,
    score,
    maxPoints: 12,
  };
};

// 2. City landing pages (12 pts)
export const checkCityPages: CheckFn = (ctx) => {
  const { $ } = ctx;

  // Look for internal links whose path contains a known city slug.
  const cityPattern = new RegExp(
    `/(?:${UTAH_CITIES.join("|")})(?:/|$|-blinds|-shutters|-shades|-window)`,
    "i",
  );

  const cityLinks = new Set<string>();
  $("a[href]").each((_, el) => {
    const href = ($(el).attr("href") || "").toLowerCase();
    if (!href) return;
    // Skip external and anchor links
    if (href.startsWith("http") && !href.includes(ctx.domain)) return;
    if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
    if (cityPattern.test(href)) {
      // Extract the path portion
      try {
        const u = href.startsWith("http") ? new URL(href) : new URL(href, `https://${ctx.domain}`);
        cityLinks.add(u.pathname.toLowerCase());
      } catch { /* skip */ }
    }
  });

  const count = cityLinks.size;
  let score = 0;
  let severity: Finding["severity"] = "critical";
  let detail = "";
  let recommendation = "";

  if (count >= 7) {
    score = 12;
    severity = "pass";
    detail = `You have ${count} city-specific pages on this site. When someone Googles “blinds in [their town],” you have a page to rank for it.`;
    recommendation = "Keep expanding your service-area coverage. Just make sure each page reads like it was written for a homeowner in that specific town — not a template.";
  } else if (count >= 3) {
    score = 7;
    severity = "important";
    detail = `You have ${count} city pages — a start. But the national brands (Sunburst, 3 Day Blinds, Bumble Bee) run 10+ per metro, and they’re taking the searches you could own.`;
    recommendation = `Fill in the rest of your service area. Every town you skip is a shot at “blinds in [that town]” you’re handing to national competitors. Each page needs to feel local — not a template.`;
  } else if (count === 1 || count === 2) {
    score = 3;
    severity = "critical";
    detail = `Only ${count} city page identified — meaning your local SEO footprint is likely not structured to maximize visibility across your service area.`;
    recommendation =
      "Building a page for every town you serve tends to be the highest-ROI content a local installer can produce. A homeowner Googling “shutters Provo” should land on your Provo page — not the national brand that got there first.";
  } else {
    score = 0;
    severity = "critical";
    detail = "City pages may not be fully leveraged on this site. When homeowners in your service area search for blinds or shutters by town, those searches are likely going to competitors with city-specific pages built out.";
    recommendation =
      "One of your biggest SEO opportunities is a dedicated page per city you serve. Homeowners search by town, Google rewards the specificity, and the slot is wide open for most local operators — but only for a little while longer.";
  }

  return {
    id: "city_pages",
    category: "city_pages",
    severity,
    title: "City landing pages",
    detail,
    recommendation,
    score,
    maxPoints: 12,
  };
};

// 3. Product category clarity (10 pts)
export const checkProductCategories: CheckFn = (ctx) => {
  const categories = [
    { key: "blinds", kw: ["blinds", "mini blind", "wood blind", "faux blind"] },
    { key: "shades", kw: ["shades", "roller shade", "cellular shade", "roman shade"] },
    { key: "shutters", kw: ["shutters", "plantation shutter"] },
    { key: "drapery", kw: ["drapery", "drapes", "curtains"] },
  ];

  // Check both text and navigation links for each category
  const bodyText = normalizeText(ctx.$("body").text());
  const linkPaths: string[] = [];
  ctx.$("a[href]").each((_, el) => {
    linkPaths.push((ctx.$(el).attr("href") || "").toLowerCase());
  });
  const linkBlob = linkPaths.join(" ");

  const present = categories.filter(
    (c) => c.kw.some((w) => bodyText.includes(w)) || c.kw.some((w) => linkBlob.includes(w.split(" ").join("-"))),
  );

  // Do they have a dedicated page/link for each major category? (navigation signal)
  const categoryNavLinks = categories.filter((c) =>
    c.kw.some((w) => {
      const slug = w.replace(/\s+/g, "-");
      return linkPaths.some(
        (p) => p.includes(`/${slug}`) || p.includes(`/${slug}s`) || p.includes(`/${c.key}`),
      );
    }),
  );

  let score = 0;
  let severity: Finding["severity"] = "important";
  let detail = "";
  let recommendation = "";

  if (categoryNavLinks.length >= 3) {
    score = 10;
    severity = "pass";
    detail = `You have dedicated pages for ${categoryNavLinks.length} product categories (${categoryNavLinks
      .map((c) => c.key)
      .join(", ")}). A homeowner shopping for any of them lands on a page that matches.`;
    recommendation =
      "Make each category page earn its rank — real install photos, brands you carry, a starting price, a review quote. Stubs don’t convert.";
  } else if (present.length >= 3 && categoryNavLinks.length < 3) {
    score = 5;
    severity = "important";
    detail = `You mention the products in your copy, but only ${categoryNavLinks.length} category(ies) have their own page. Homeowners Google by product type — and they click the result that looks specialized in what they want.`;
    recommendation =
      "Each major product line should feel like its own shop. A shutter buyer spends 2–3x the blinds-only buyer — don’t let your site read like a blinds-only shop.";
  } else if (present.length >= 1) {
    score = 3;
    severity = "important";
    detail = `Only ${present.length} product category is clearly represented, which likely makes it harder for visitors to confirm in a few seconds that you sell what they came looking for.`;
    recommendation =
      "Most shutter leads tend to go to the site that looks like a shutter shop — not the one that buries shutters three clicks deep. Surfacing the products you actually sell up front is one of the fastest ways to lift conversion.";
  } else {
    score = 0;
    severity = "critical";
    detail = "Product category structure may not be strongly implemented. A homeowner shopping for blinds (or shutters, or shades) needs to see in 2 seconds that you sell what they came for — when that signal is unclear, visitors are likely to bounce to the next result.";
    recommendation =
      "Homeowners decide “they sell what I want” in the first couple of seconds. Making the product lines you carry — blinds, shades, shutters, drapery — instantly visible is one of the fastest conversion wins available to a local installer.";
  }

  return {
    id: "product_categories",
    category: "product_categories",
    severity,
    title: "Product category pages",
    detail,
    recommendation,
    score,
    maxPoints: 10,
  };
};

// 4. Motorization presence (8 pts)
export const checkMotorization: CheckFn = (ctx) => {
  const motorKeywords = [
    "motorized", "motorization", "motorised",
    "powerview", "power view",
    "smart blind", "smart shade", "smart home integration",
    "automated shade", "automated blind", "automation",
    "remote control shade", "remote-control",
    "lutron", "somfy", "smart phone control", "app control",
  ];

  const bodyText = normalizeText(ctx.$("body").text());
  const matches = motorKeywords.filter((kw) => bodyText.includes(kw));
  const hasDedicated = ctx.$("a[href]").toArray().some((el) => {
    const h = (ctx.$(el).attr("href") || "").toLowerCase();
    return h.includes("motor") || h.includes("automat") || h.includes("smart");
  });

  let score = 0;
  let severity: Finding["severity"] = "important";
  let detail = "";
  let recommendation = "";

  if (hasDedicated && matches.length >= 2) {
    score = 8;
    severity = "pass";
    detail =
      "Motorization has its own spot on the site. That’s where the highest-margin jobs come from — the customers with 3–5x the average ticket.";
    recommendation = "Keep showing real installed motorized work — actual homes, the brands you carry. That’s what closes the high-ticket buyer.";
  } else if (matches.length >= 2) {
    score = 5;
    severity = "important";
    detail = "You mention motorization, but it doesn’t have its own page in navigation. Motorization buyers are the best leads you can get — whole-home jobs, higher tickets, repeat customers.";
    recommendation =
      "Motorized buyers are the best-paying customers in this business. They need a dedicated page that shows you take this product line seriously — otherwise they click to someone who does.";
  } else if (matches.length === 1) {
    score = 2;
    severity = "important";
    detail = "Motorization shows up once on the page, in passing — which likely isn’t enough for homeowners who came specifically to ask about it.";
    recommendation =
      "Homeowners Googling “motorized shades” are typically ready to spend. A passing mention may not be enough to convince them you actually do this work at volume — and that gap likely sends those leads elsewhere.";
  } else {
    score = 0;
    severity = "critical";
    detail = "Motorization may not be fully leveraged on this site. These are the best leads in the business — whole-home jobs, bigger tickets — and current visibility likely isn’t capturing those searches.";
    recommendation =
      "Motorization is where the biggest tickets live. Without a clear, dedicated presence for it, you’re likely missing those searches entirely — and those tend to be the easiest leads to win once you show up for them at all.";
  }

  return {
    id: "motorization",
    category: "motorization",
    severity,
    title: "Motorization / smart shades",
    detail,
    recommendation,
    score,
    maxPoints: 8,
  };
};

// 5. Trust signals (10 pts)
export const checkTrustSignals: CheckFn = (ctx) => {
  const { $ } = ctx;
  const bodyText = normalizeText($("body").text());

  const signals: { name: string; found: boolean }[] = [
    { name: "Review count or rating", found: /\d+\s*(?:\+|stars?|reviews?|★)/i.test(bodyText) || /\b4\.[5-9]\s*stars?\b/i.test(bodyText) || /\b5[-\s]?star\b/i.test(bodyText) },
    { name: "Years in business", found: /\b(?:\d{1,2})\s*(?:\+\s*)?years?\s+(?:in business|experience|of service|serving)\b/i.test(bodyText) || /since\s+(?:19|20)\d{2}/i.test(bodyText) || /established\s+(?:19|20)\d{2}/i.test(bodyText) },
    { name: "BBB accreditation", found: /\bbbb\b|better business bureau/i.test(bodyText) },
    { name: "Hunter Douglas / brand partnership", found: /hunter douglas|gallery dealer|certified pro|norman|graber|levolor/i.test(bodyText) },
    { name: "Google reviews link", found: $("a[href*='google.com/maps']").length > 0 || $("a[href*='g.page']").length > 0 || /google reviews?/i.test(bodyText) },
    { name: "Warranty / guarantee", found: /warranty|guaranteed?|satisfaction|lifetime/i.test(bodyText) },
  ];

  const count = signals.filter((s) => s.found).length;
  const weight = 10;
  const score = Math.min(weight, Math.round((count / signals.length) * weight));

  let severity: Finding["severity"];
  if (count >= 5) severity = "pass";
  else if (count >= 3) severity = "important";
  else severity = "critical";

  const missing = signals.filter((s) => !s.found).map((s) => s.name);

  return {
    id: "trust_signals",
    category: "trust_signals",
    severity,
    title: "Trust signals on the page",
    detail:
      count === signals.length
        ? "Strong trust signal coverage — reviews, years in business, brand partnerships, warranty all present. Homeowners have plenty of reasons to choose you."
        : `Trust signals may not be fully leveraged on this page — we identified ${count} of ${signals.length} common ones (${signals.filter((s) => s.found).map((s) => s.name).join(", ") || "none"}). Homeowners tend to choose based on trust before price, so limited visibility of those signals likely costs conversions.`,
    recommendation:
      missing.length > 0
        ? `Homeowners scan for reasons to trust you in the first few seconds. Surfacing the signals that aren’t prominently shown (${missing.join(", ")}) — above the fold rather than buried on an About page — tends to lift conversions immediately.`
        : "Keep these visible above the fold, especially on mobile. That’s the first thing homeowners see.",
    score,
    maxPoints: weight,
  };
};

// 6. Mobile usability (8 pts)
export const checkMobileUsability: CheckFn = (ctx) => {
  const { $ } = ctx;

  const hasViewport = $('meta[name="viewport"]').length > 0;
  const viewportContent = ($('meta[name="viewport"]').attr("content") || "").toLowerCase();
  const viewportIsResponsive =
    viewportContent.includes("width=device-width") && !viewportContent.includes("user-scalable=no");

  // Check for tap-target density signal: phone as a link
  const telLinks = $('a[href^="tel:"]').length > 0;

  // Rough "heavy page" heuristic: count images without lazy loading + total script tag count
  const scriptCount = $("script").length;
  const imgCount = $("img").length;
  const heavyPage = scriptCount > 35 || imgCount > 50;

  let score = 0;
  let severity: Finding["severity"] = "important";
  const issues: string[] = [];

  if (hasViewport && viewportIsResponsive) {
    score += 4;
  } else {
    issues.push(hasViewport ? "Viewport meta disables zooming — bad for accessibility" : "No responsive viewport meta tag");
  }

  if (telLinks) {
    score += 2;
  } else {
    issues.push("No tappable phone link (tel:)");
  }

  if (!heavyPage) {
    score += 2;
  } else {
    issues.push(`Page is heavy (${scriptCount} scripts, ${imgCount} images) — likely slow on mobile 4G`);
  }

  if (score >= 7) severity = "pass";
  else if (score >= 4) severity = "important";
  else severity = "critical";

  return {
    id: "mobile_usability",
    category: "mobile_usability",
    severity,
    title: "Mobile usability",
    detail:
      issues.length === 0
        ? "Responsive viewport, tappable phone link, and the page isn’t overloaded. Good mobile foundation — which matters, because over 70% of homeowners shop for window treatments from their phone."
        : `Mobile experience may not be fully optimized: ${issues.join("; ")}. Most homeowners shop for blinds and shutters from their phone, so friction here likely limits performance.`,
    recommendation:
      issues.length === 0
        ? "Run a real-device test every few months. What looks fine on desktop can trip up a thumb on mobile."
        : "Over 70% of your buyers are shopping on mobile. A responsive, fast, one-tap-friendly site tends to be the first impression that earns the call — when that experience isn’t tight, conversion suffers.",
    score,
    maxPoints: 8,
  };
};

// ── Technical foundation checks (30 pts) ────────────────────────────

// 7. HTTPS (3 pts)
export const checkHttps: CheckFn = (ctx) => {
  const passing = ctx.https;
  return {
    id: "https",
    category: "technical_seo",
    severity: passing ? "pass" : "critical",
    title: "Site served over HTTPS",
    detail: passing ? "Site is served over a secure HTTPS connection." : "Site is NOT served over HTTPS.",
    recommendation: passing
      ? "Keep the certificate current — most hosts auto-renew, but check annually."
      : "An insecure site tends to get flagged by Chrome and demoted by Google — which likely caps how well the site can perform in search. This one is table-stakes to fix.",
    score: passing ? 3 : 0,
    maxPoints: 3,
  };
};

// 8. Title tag quality (4 pts)
export const checkTitleTag: CheckFn = (ctx) => {
  const title = (ctx.$("title").first().text() || "").trim();
  const len = title.length;
  let score = 0;
  let severity: Finding["severity"] = "pass";
  let detail = "";
  let recommendation = "";

  if (!title) {
    score = 0;
    severity = "critical";
    detail = "Title tag may not be implemented on this page.";
    recommendation = "The title tag is what Google shows in search results and what the browser tab reads — it tends to be the most-seen copy on your site, so leaving it blank likely caps click-throughs from search.";
  } else if (len < 20) {
    score = 1;
    severity = "important";
    detail = `Title is only ${len} characters: "${title}" — likely not structured to maximize click-through from search.`;
    recommendation = `Your homepage title is high-value real estate. Clearly stating what you do, where you serve, and your business name tends to lift click-through from Google results meaningfully.`;
  } else if (len > 70) {
    score = 2;
    severity = "important";
    detail = `Title is ${len} characters — Google is likely truncating it in results: "${title}".`;
    recommendation = "When the title gets cut off mid-sentence in search results, the part that matters often doesn’t show. Tightening it so the lead reads first tends to recover lost click-throughs.";
  } else {
    score = 4;
    severity = "pass";
    detail = `Title is ${len} characters — well-sized. "${title}".`;
    recommendation = "Make sure it mentions a city or region — that’s where local search intent lives.";
  }

  return { id: "title_tag", category: "technical_seo", severity, title: "Homepage title tag", detail, recommendation, score, maxPoints: 4 };
};

// 9. Meta description (3 pts)
export const checkMetaDescription: CheckFn = (ctx) => {
  const desc = (ctx.$('meta[name="description"]').attr("content") || "").trim();
  const len = desc.length;
  let score = 0;
  let severity: Finding["severity"] = "pass";
  let detail = "";
  let recommendation = "";

  if (!desc) {
    score = 0;
    severity = "important";
    detail = "Meta description may not be implemented on this page.";
    recommendation =
      "When the meta description is left blank, Google tends to pick a random sentence from the homepage to show searchers. That’s a coin flip you can stop flipping — this is the pitch that earns the click.";
  } else if (len < 80 || len > 200) {
    score = 1;
    severity = "important";
    detail = `Meta description is ${len} characters — outside the ideal 140–160 range and likely not structured to maximize click-through.`;
    recommendation = "The meta description is the pitch Google shows to searchers before they click. Tightening it into the sweet spot tends to lift click-through measurably.";
  } else {
    score = 3;
    severity = "pass";
    detail = `Meta description is ${len} characters — good length.`;
    recommendation = "Refresh it annually to reflect your current positioning.";
  }

  return { id: "meta_description", category: "technical_seo", severity, title: "Meta description", detail, recommendation, score, maxPoints: 3 };
};

// 10. H1 present (2 pts)
export const checkH1: CheckFn = (ctx) => {
  const h1s = ctx.$("h1");
  const count = h1s.length;
  const first = (h1s.first().text() || "").trim();

  let score = 0;
  let severity: Finding["severity"] = "pass";
  let detail = "";
  let recommendation = "";

  if (count === 0) {
    score = 0;
    severity = "important";
    detail = "Main heading structure may not be strongly implemented on this page.";
    recommendation = "Every page benefits from one clear main heading. Without it, the page tends to read as unfocused to both visitors and search engines — likely limiting how well it ranks and converts.";
  } else if (count > 1) {
    score = 1;
    severity = "important";
    detail = `Multiple H1 tags (${count}) on the page — heading structure likely isn’t signaling a clear focus to search engines.`;
    recommendation = "Picking one clear main heading tends to help search engines (and visitors) understand what the page is actually about. Multiple H1s often dilute that signal.";
  } else if (first.length < 8) {
    score = 1;
    severity = "important";
    detail = `H1 is very short: "${first}" — likely not telling visitors or Google what the page is really about.`;
    recommendation = "A main heading that clearly states what the page is about, in plain English, tends to lift both ranking and on-page conversion.";
  } else {
    score = 2;
    severity = "pass";
    detail = `Single clear H1: "${first}".`;
    recommendation = "Good. Mention your product + city if it reads naturally.";
  }

  return { id: "h1", category: "technical_seo", severity, title: "Heading structure (H1)", detail, recommendation, score, maxPoints: 2 };
};

// 11. LocalBusiness schema (8 pts)
export const checkLocalBusinessSchema: CheckFn = (ctx) => {
  const { $ } = ctx;
  const jsonLdBlocks: string[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    jsonLdBlocks.push($(el).html() || "");
  });

  const hay = jsonLdBlocks.join(" ").toLowerCase();
  const hasLocalBusiness =
    hay.includes('"localbusiness"') ||
    hay.includes('"homeandconstructionbusiness"') ||
    hay.includes('"professionalservice"');
  const hasOrganization = hay.includes('"organization"');
  const hasReview = hay.includes('"review"') || hay.includes('"aggregaterating"');

  let score = 0;
  let severity: Finding["severity"];
  let detail = "";
  let recommendation = "";

  if (hasLocalBusiness && hasReview) {
    score = 8;
    severity = "pass";
    detail = "LocalBusiness + review schema are in place. Google can show your stars and service area directly in search results — that’s extra clicks with zero extra ad spend.";
    recommendation = "Keep an eye on Search Console for structured-data errors. That’s where Google tells you if anything’s broken.";
  } else if (hasLocalBusiness) {
    score = 5;
    severity = "important";
    detail = "You have LocalBusiness schema but no reviews schema. That means Google knows who you are, but it isn’t showing your stars in search results.";
    recommendation =
      "Your search listing could be showing star ratings — it isn’t. That’s a 20–30% click-through boost you’re leaving on the table at the same search position.";
  } else if (hasOrganization) {
    score = 2;
    severity = "important";
    detail = "You have basic Organization schema but not LocalBusiness — meaning Google likely isn’t reading you as a local service business in your area, which tends to keep listings out of the Map Pack.";
    recommendation =
      "Without the LocalBusiness signals, Google often treats a site as a generic web page rather than a local service business. That tends to be the difference between showing up in the map pack — where homeowners actually book — and being skipped over.";
  } else {
    score = 0;
    severity = "critical";
    detail = "LocalBusiness structured data may not be strongly implemented. Without those machine-readable signals, Google likely doesn’t recognize you as a local service business — so it tends to favor the competitors that do.";
    recommendation =
      "Without strong structured-data signals, Google often treats a site as a generic web page instead of a local service business. That tends to keep you out of the map pack — which is where homeowners actually book from.";
  }

  return {
    id: "local_business_schema",
    category: "technical_seo",
    severity,
    title: "LocalBusiness structured data",
    detail,
    recommendation,
    score,
    maxPoints: 8,
  };
};

// 12. Image alt text coverage (4 pts)
export const checkAltText: CheckFn = (ctx) => {
  const imgs = ctx.$("img").toArray();
  const total = imgs.length;
  const withAlt = imgs.filter((el) => {
    const alt = (ctx.$(el).attr("alt") || "").trim();
    return alt.length > 0;
  }).length;

  const pct = total === 0 ? 100 : Math.round((withAlt / total) * 100);

  let score = 0;
  let severity: Finding["severity"];
  let detail = "";
  let recommendation = "";

  if (total === 0) {
    // No images to judge — give full credit but flag it gently
    score = 3;
    severity = "minor";
    detail = "No images found on this page.";
    recommendation = "For a visual business, your homepage needs project photos — before/afters, installed-in-a-home shots.";
  } else if (pct >= 90) {
    score = 4;
    severity = "pass";
    detail = `${pct}% of images (${withAlt}/${total}) have alt text.`;
    recommendation = "Keep descriptive alt text — “Roman shades in a Provo master bedroom” beats “shade2.jpg” every time.";
  } else if (pct >= 60) {
    score = 2;
    severity = "important";
    detail = `${pct}% of images have alt text. ${total - withAlt} images are missing descriptions.`;
    recommendation = "Fill in the rest. Good alt text helps accessibility AND image search — your project photos could be ranking on their own.";
  } else {
    score = 0;
    severity = "important";
    detail = `Only ${pct}% of images have alt text — meaning your photos likely aren’t working as hard as they could in search.`;
    recommendation =
      "Alt text is what makes photos findable in Google image search and what homeowners on screen readers rely on. Filling it in tends to add a small but real layer of free traffic.";
  }

  return { id: "alt_text", category: "technical_seo", severity, title: "Image alt text coverage", detail, recommendation, score, maxPoints: 4 };
};

// ── Content & conversion checks (10 pts) ────────────────────────────

// 13. Online booking / text-to-quote (4 pts)
export const checkOnlineBooking: CheckFn = (ctx) => {
  const { $ } = ctx;
  const bodyText = normalizeText($("body").text());
  const hasForm = $("form").length > 0;

  const bookingKeywords = [
    "book online", "schedule online", "book a consultation", "schedule a consultation",
    "free quote", "request a quote", "get a quote", "free estimate", "request estimate",
    "calendly", "book now", "schedule now",
  ];
  const textHasBooking = bookingKeywords.some((k) => bodyText.includes(k));
  const hasCalendly = $("a[href*='calendly.com'], iframe[src*='calendly.com']").length > 0 ||
    $("a[href*='acuityscheduling'], iframe[src*='acuityscheduling']").length > 0;

  let score = 0;
  let severity: Finding["severity"];
  let detail = "";
  let recommendation = "";

  if (hasCalendly) {
    score = 4;
    severity = "pass";
    detail = "Online booking is integrated (Calendly or similar). Homeowners can schedule a measure without waiting for a callback — huge for conversion.";
    recommendation = "Make sure it shows real-time availability, not just a contact form. The win is instant scheduling.";
  } else if (hasForm && textHasBooking) {
    score = 3;
    severity = "pass";
    detail = "Quote/consultation form is present and called out in the page copy. Homeowners know how to convert.";
    recommendation =
      "Real-time scheduling beats a form every time. Form-only flows lose roughly 30% of would-be bookings to the wait for a callback.";
  } else if (hasForm) {
    score = 2;
    severity = "important";
    detail = "A form exists, but the “book” or “request quote” call to action may not be strongly featured — likely leaving visitors unsure what the next step is.";
    recommendation = "A form tends to convert in proportion to how clearly its job is named. Generic “Contact Us” framing often underperforms — making the next step obvious and action-oriented usually lifts submissions.";
  } else {
    score = 0;
    severity = "critical";
    detail = "Online booking may not be strongly implemented on this page. Homeowners who are ready to book (often at 9 PM after dinner) need a clear path forward — without one, they’re likely to try the next site that offers it.";
    recommendation =
      "Converting the 9 PM browser into tomorrow’s measure is how local installers tend to double their lead volume without spending more on ads. A clear online-booking flow is usually the unlock.";
  }

  return { id: "online_booking", category: "content_conversion", severity, title: "Online booking / quote request", detail, recommendation, score, maxPoints: 4 };
};

// 14. Gallery / before-after presence (3 pts)
export const checkGallery: CheckFn = (ctx) => {
  const { $ } = ctx;
  const imgCount = $("img").length;
  const galleryLinks = $("a[href*='gallery'], a[href*='portfolio'], a[href*='projects']").length;
  const instaLinks = $("a[href*='instagram.com']").length;

  let score = 0;
  let severity: Finding["severity"];
  let detail = "";
  let recommendation = "";

  if (galleryLinks > 0 && imgCount > 8) {
    score = 3;
    severity = "pass";
    detail = `Gallery page linked with ${imgCount} images on the homepage. That’s visual proof — the thing that actually closes window treatment leads.`;
    recommendation = "Add before/after pairs if you don’t have them. For a visual product, nothing persuades like the transformation shot.";
  } else if (imgCount > 8) {
    score = 2;
    severity = "important";
    detail = `${imgCount} images on the page but no dedicated gallery. Homeowners scrolling for inspiration can’t find more — so they leave to find it elsewhere.`;
    recommendation = "Homeowners looking for inspiration need a place to keep scrolling. Your best closing tool is the photo of a room that looks like theirs.";
  } else if (instaLinks > 0) {
    score = 1;
    severity = "important";
    detail = "You link to Instagram but there’s no gallery on the site itself. Most visitors won’t click off to Instagram — but they’ll scroll 30 photos if they’re already on your site.";
    recommendation =
      "Your Instagram work belongs on your own site. Visitors rarely click off to follow — but they’ll scroll your gallery if it’s right where they already are.";
  } else {
    score = 0;
    severity = "critical";
    detail = "Visual proof of installed work may not be fully leveraged on this page. Window treatments are a visual purchase, so without strong photo coverage the biggest objection (“will it look right in my home?”) likely isn’t getting answered.";
    recommendation =
      "Window treatments are a visual purchase. When proof of work isn’t prominent, the “will it look right in my home?” objection tends to stall the sale — strong installed-photo coverage is one of the most reliable conversion lifts available.";
  }

  return { id: "gallery", category: "content_conversion", severity, title: "Gallery / visual proof", detail, recommendation, score, maxPoints: 3 };
};

// 15. Blog / content marketing (3 pts)
export const checkBlog: CheckFn = (ctx) => {
  const { $ } = ctx;
  const blogLinks = $("a[href]").toArray().filter((el) => {
    const h = ($(el).attr("href") || "").toLowerCase();
    return /(?:\/blog|\/articles|\/news|\/guide|\/resources|\/learn)(?:\/|$|\?)/.test(h);
  });

  let score = 0;
  let severity: Finding["severity"];
  let detail = "";
  let recommendation = "";

  if (blogLinks.length > 0) {
    score = 3;
    severity = "pass";
    detail = "Blog or resource section linked.";
    recommendation =
      "Keep publishing. The compounding matters more than the cadence — once a month on a real customer question is plenty.";
  } else {
    score = 0;
    severity = "important";
    detail = "Content marketing may not be fully leveraged on this site — likely limiting how much organic traffic the site captures over time.";
    recommendation =
      "Content compounds; ads don’t. Answering the questions you hear at every measure appointment — insulation, motorization, child safety — tends to become evergreen lead flow once it’s live.";
  }

  return { id: "blog", category: "content_conversion", severity, title: "Blog / content marketing", detail, recommendation, score, maxPoints: 3 };
};

// ── Ordered list of all checks ──────────────────────────────────────

export const ALL_CHECKS: CheckFn[] = [
  // Blind-business fit (60 pts)
  checkPhoneVisibility,
  checkCityPages,
  checkProductCategories,
  checkMotorization,
  checkTrustSignals,
  checkMobileUsability,
  // Technical foundation (24 pts)
  checkHttps,
  checkTitleTag,
  checkMetaDescription,
  checkH1,
  checkLocalBusinessSchema,
  checkAltText,
  // Content & conversion (10 pts)
  checkOnlineBooking,
  checkGallery,
  checkBlog,
];

// Verify weights total 100 (sanity check; used in tests)
export const MAX_TOTAL =
  12 + 12 + 10 + 8 + 10 + 8 // blind-biz 60
  + 3 + 4 + 3 + 2 + 8 + 4   // technical 24
  + 4 + 3 + 3;              // content 10 = 94, plus HTTPS 3... wait

// Recompute for correctness (used by scanner):
// Actual: 12+12+10+8+10+8 = 60, 3+4+3+2+8+4 = 24, 4+3+3 = 10 → total 94.
// We'll normalize 0-94 → 0-100 in the scanner so the displayed score is /100.
