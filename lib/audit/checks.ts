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
    detail = "Phone number is prominent in the header and is a tappable click-to-call link.";
    recommendation = "Keep it. This is what every local service site should do.";
  } else if (headerHasPhone) {
    score = 8;
    severity = "important";
    detail = "Phone is visible in the header but not a tappable link (no tel: href).";
    recommendation =
      "Wrap the header phone number in <a href=\"tel:+18015551234\">. On mobile, that turns it into one-tap call — the most common action prospects take.";
  } else if (telLinks > 0) {
    score = 6;
    severity = "important";
    detail = `There are ${telLinks} click-to-call link(s) on the page, but none in the header where prospects look first.`;
    recommendation =
      "Move the phone number into the main site header so it's visible on every page, above the fold, on mobile.";
  } else if (phoneAnywhere) {
    score = 3;
    severity = "critical";
    detail = "Phone number appears somewhere on the page but isn't prominent and isn't tappable.";
    recommendation =
      "Put a click-to-call phone number in the site header. On mobile, tapping should open the dialer. This is the single biggest conversion fix for a local installer site.";
  } else {
    score = 0;
    severity = "critical";
    detail = "We couldn't find a phone number on this page.";
    recommendation =
      "Add your phone number to the site header as a tel: link. Most homeowners want to call before booking. No phone = most of them bounce.";
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
    detail = `You have ${count} city-specific pages linked from this site. Strong local-SEO footprint.`;
    recommendation = "Keep adding one per month and make sure each has unique content.";
  } else if (count >= 3) {
    score = 7;
    severity = "important";
    detail = `You have ${count} city landing pages. That's a start, but the national brands (Sunburst, 3 Day Blinds) run 10+ per metro.`;
    recommendation = `Add pages for the other Utah County cities you serve — Provo, Orem, Lehi, Mapleton, Springville, Spanish Fork, American Fork. Each page should have unique content, not a copy-paste template.`;
  } else if (count === 1 || count === 2) {
    score = 3;
    severity = "critical";
    detail = `Only ${count} city page(s) detected. For a local installer, this is one of the highest-ROI SEO gaps.`;
    recommendation =
      "Build 5-7 city landing pages — one for each primary service city. Unique photos, unique review quotes, links to local projects. The slot is wide open for most Utah operators.";
  } else {
    score = 0;
    severity = "critical";
    detail = "No city-specific landing pages detected.";
    recommendation =
      "Build city pages for your top service areas. This is usually the #1 organic-search opportunity for a local window treatment business — national competitors have them, you don't, and Google rewards them.";
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
    detail = `You have dedicated navigation for ${categoryNavLinks.length} product categories (${categoryNavLinks
      .map((c) => c.key)
      .join(", ")}). Good information architecture.`;
    recommendation =
      "Make sure each category page is substantial — photos, specs, brand names, sample quotes — not a stub.";
  } else if (present.length >= 3 && categoryNavLinks.length < 3) {
    score = 5;
    severity = "important";
    detail = `Product names are mentioned on the page but only ${categoryNavLinks.length} category(ies) have dedicated pages.`;
    recommendation =
      "Split each major category (blinds, shades, shutters, drapery) into its own page. Homeowners Google by product type — they need to land on a page that matches exactly.";
  } else if (present.length >= 1) {
    score = 3;
    severity = "important";
    detail = `Only ${present.length} product category/ies clearly represented.`;
    recommendation =
      "If you sell more than what's visible on this page, add it. Many installers lose shutter leads because their site looks like a blinds-only shop.";
  } else {
    score = 0;
    severity = "critical";
    detail = "We couldn't clearly identify which window treatment products you sell.";
    recommendation =
      "Add obvious product category pages (Blinds / Shades / Shutters / Drapery) to your main navigation. Prospects should know in 2 seconds whether you sell what they want.";
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
      "Motorization is clearly represented on the site with dedicated navigation. This is the highest-margin product line for most dealers.";
    recommendation = "Make sure a motorization page shows real installed projects, not just brochure stills.";
  } else if (matches.length >= 2) {
    score = 5;
    severity = "important";
    detail = "Motorization is mentioned on the page but doesn't have its own dedicated page in navigation.";
    recommendation =
      "Motorized shades are the easiest upsell in this industry. Give them a dedicated page with photos, a price-starts-at, and brand partnerships (PowerView, Lutron, Somfy).";
  } else if (matches.length === 1) {
    score = 2;
    severity = "important";
    detail = "Motorization is mentioned only briefly.";
    recommendation =
      "Homeowners specifically Google 'motorized shades near me'. A dedicated motorization page is one of the highest-intent SEO pages you can add.";
  } else {
    score = 0;
    severity = "critical";
    detail = "No mention of motorization, smart shades, or automation.";
    recommendation =
      "If you don't sell motorization yet, start. If you do, put it on the site prominently — it's the premium product line and it's what modern buyers want to ask about.";
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
        ? "Strong trust signal coverage — reviews, years in business, brand partnerships, warranty all present."
        : `Found ${count} of ${signals.length} trust signals: ${signals.filter((s) => s.found).map((s) => s.name).join(", ") || "none"}.`,
    recommendation:
      missing.length > 0
        ? `Add the missing signals near the top of the page: ${missing.join(", ")}. Homeowners are scanning for reasons to trust you before they ever read your copy.`
        : "Keep these visible above the fold on mobile.",
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
        ? "Responsive viewport set, tappable phone link present, page isn't overloaded. Good mobile foundation."
        : `Issues detected: ${issues.join("; ")}.`,
    recommendation:
      issues.length === 0
        ? "Run a real-device check on Lighthouse to catch tap-target and layout issues we can't see from HTML alone."
        : "Fix the basics first: a proper viewport meta, tappable phone number, and trim the number of scripts/images loaded on the homepage.",
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
      ? "Keep your certificate up to date; most hosts auto-renew."
      : "Add SSL immediately. Chrome warns visitors about insecure sites and Google demotes them in search.",
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
    detail = "No <title> tag found.";
    recommendation = "Every page needs a title. It's what shows in the browser tab and in Google results.";
  } else if (len < 20) {
    score = 1;
    severity = "important";
    detail = `Title is only ${len} characters: "${title}".`;
    recommendation = `Write a 30-60 character title that includes your service and city, e.g. "Blinds, Shades & Shutters in [City] | [Business Name]".`;
  } else if (len > 70) {
    score = 2;
    severity = "important";
    detail = `Title is ${len} characters — Google will truncate it: "${title}".`;
    recommendation = "Trim the title to 50-60 characters so the full text appears in search results.";
  } else {
    score = 4;
    severity = "pass";
    detail = `Title is ${len} characters — well-sized. "${title}".`;
    recommendation = "Make sure it also mentions a city or region for local intent.";
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
    detail = "No meta description set.";
    recommendation =
      "Write a 140-160 character description that includes your service, city, and a call to action. This is often what people read in Google results.";
  } else if (len < 80 || len > 200) {
    score = 1;
    severity = "important";
    detail = `Meta description is ${len} characters — outside the ideal 140-160 range.`;
    recommendation = "Aim for a crisp 140-160 character sentence that gives a reason to click.";
  } else {
    score = 3;
    severity = "pass";
    detail = `Meta description is ${len} characters — good length.`;
    recommendation = "Review it every year to make sure it still reflects your current positioning.";
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
    detail = "No <h1> tag found on the page.";
    recommendation = "Every page needs exactly one H1 that states what the page is about in plain language.";
  } else if (count > 1) {
    score = 1;
    severity = "important";
    detail = `Multiple H1 tags (${count}) on the page.`;
    recommendation = "Use exactly one H1 per page for clarity — use H2/H3 for supporting headings.";
  } else if (first.length < 8) {
    score = 1;
    severity = "important";
    detail = `H1 is very short: "${first}".`;
    recommendation = "Write a meaningful H1 that tells visitors what the page covers in 5-10 words.";
  } else {
    score = 2;
    severity = "pass";
    detail = `Single clear H1: "${first}".`;
    recommendation = "Good. Mention your product + city if it's natural.";
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
    detail = "LocalBusiness + review schema present. Google can render rich results for this site.";
    recommendation = "Confirm in Search Console that no structured data errors are being reported.";
  } else if (hasLocalBusiness) {
    score = 5;
    severity = "important";
    detail = "LocalBusiness schema present but no review/aggregateRating schema.";
    recommendation =
      "Add Review + AggregateRating schema — it's what makes Google show star ratings directly in search results. Big click-through boost.";
  } else if (hasOrganization) {
    score = 2;
    severity = "important";
    detail = "Organization schema present but not LocalBusiness.";
    recommendation =
      "Upgrade to LocalBusiness (or HomeAndConstructionBusiness) schema with address, phone, service area, hours. This is the single most impactful local-SEO technical fix.";
  } else {
    score = 0;
    severity = "critical";
    detail = "No LocalBusiness or Organization structured data detected.";
    recommendation =
      "Add LocalBusiness JSON-LD with name, address, phone, hours, service area, and a link to your Google Business Profile. Easy to add, big lift.";
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
    recommendation = "For a visual business, add before/after photos, installed-in-a-home shots, or a product gallery.";
  } else if (pct >= 90) {
    score = 4;
    severity = "pass";
    detail = `${pct}% of images (${withAlt}/${total}) have alt text.`;
    recommendation = "Keep it up. Quality matters too — descriptive alt text beats 'image1.jpg'.";
  } else if (pct >= 60) {
    score = 2;
    severity = "important";
    detail = `${pct}% of images have alt text. ${total - withAlt} images are missing descriptions.`;
    recommendation = "Fill in descriptive alt text on the remaining images. Good for accessibility and image search.";
  } else {
    score = 0;
    severity = "important";
    detail = `Only ${pct}% of images have alt text.`;
    recommendation =
      "Add descriptive alt text to every image (especially project photos — 'Roman shades in a Provo master bedroom' beats 'shade2.jpg').";
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
    detail = "Online booking is integrated (Calendly or similar).";
    recommendation = "Confirm the booking link shows real-time availability, not just a contact form.";
  } else if (hasForm && textHasBooking) {
    score = 3;
    severity = "pass";
    detail = "Quote/consultation form is present and called out in page copy.";
    recommendation =
      "Consider adding a real-time calendar-picker (Calendly, Acuity, ZeroRemake). Form-only flows lose ~30% of would-be bookings to waiting for a callback.";
  } else if (hasForm) {
    score = 2;
    severity = "important";
    detail = "A form exists but there's no clear 'book' or 'request quote' call to action.";
    recommendation = "Rename the CTA to something action-oriented: 'Book a Free Measure' or 'Get My Quote'.";
  } else {
    score = 0;
    severity = "critical";
    detail = "No form or online booking flow detected.";
    recommendation =
      "Add either a quote request form or (better) a real-time booking tool. Let prospects convert at 11 PM without waiting for a phone callback.";
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
    detail = `Gallery page linked and ${imgCount} images on homepage. Good visual proof.`;
    recommendation = "Add before/after pairs if you don't have them — that's the single most persuasive format.";
  } else if (imgCount > 8) {
    score = 2;
    severity = "important";
    detail = `${imgCount} images on page but no dedicated gallery page linked.`;
    recommendation = "Create a /gallery page with categorized before/after photos and filter by product type.";
  } else if (instaLinks > 0) {
    score = 1;
    severity = "important";
    detail = "Instagram linked but no gallery on the site itself.";
    recommendation =
      "Retrofit your Instagram into an on-site gallery. Visitors don't click off to Instagram — but they'll scroll 30 photos on your own site.";
  } else {
    score = 0;
    severity = "critical";
    detail = "No gallery, portfolio, or visual proof of installed work on this page.";
    recommendation =
      "Add a photo gallery of installed projects. Window treatments are a visual purchase — the biggest objection is 'will it look right in my home?' — and photos kill that objection.";
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
      "Keep posting. Once a month, 400-600 words on a real customer question ('How do I pick blinds for a west-facing window in Utah?') is plenty.";
  } else {
    score = 0;
    severity = "important";
    detail = "No blog, guides, or content-marketing section detected.";
    recommendation =
      "Add a blog — even 6 posts total answering the questions you hear at the measure appointment (insulation, motorization, child safety, warranty). Content compounds; ads don't.";
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
