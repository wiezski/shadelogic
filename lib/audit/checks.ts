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
    detail = "Phone visibility appears strong — a number is featured in the header and looks one-tap callable on mobile, which tends to be the single most-used action on a local service site. May not be fully leveraged if calling is the only contact path, since many homeowners (especially under-40) prefer a lower-friction first step like texting.";
    recommendation = "May not be fully leveraged unless paired with a lower-friction option like text-to-quote or click-to-text. A call-only contact path tends to underserve the segment that prefers texting before talking — and that segment is a meaningful slice of inbound interest. Also worth confirming the number appears on every page (mobile sticky header included) and the displayed number matches the tel: link exactly.";
  } else if (headerHasPhone) {
    score = 8;
    severity = "important";
    detail = "Phone visibility in the header may not be fully leveraged for mobile callers — a tappable tel: link doesn’t appear to be wired up, so visitors likely have to memorize or copy-paste the number.";
    recommendation =
      "Making the phone number one-tap callable on mobile tends to be one of the highest-leverage fixes available. The #1 action homeowners take before booking is calling — and unnecessary friction here likely costs measurable conversions.";
  } else if (telLinks > 0) {
    score = 6;
    severity = "important";
    detail = `Click-to-call links appear on the page (${telLinks} found), but a phone number may not be strongly implemented in the header — which is where homeowners tend to look first.`;
    recommendation =
      "Surfacing the phone number in the header, above the fold, on every page tends to lift call volume notably for local installers. When it isn’t the first thing visible, those calls likely route elsewhere.";
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

  // Detect city/service-area pages by URL structure rather than by city name.
  // Two URL conventions are common in this industry:
  //
  //   MODERN — under a parent path that names the section:
  //     /service-areas/<city>/, /locations/<city>/,
  //     /areas-we-serve/<city>/, /cities/<city>/
  //
  //   LEGACY — city baked into the filename (older PHP-era SEO style):
  //     /shutters-anchorage-ak.php, /blinds-provo-ut/, /houston-blinds.html
  //
  // We detect both, dedupe by full pathname, and classify each match so the
  // messaging layer can flag legacy structures via Finding.meta.isModernStructure.
  const modernPattern =
    /\/(?:service-areas|service-area|locations|location|areas-we-serve|areas|cities|city)\/([^/?#]+)/i;

  // Legacy pattern A — product-prefixed, state-code suffix:
  // matches paths whose filename or segment STARTS with a product word and
  // ends with a 2-letter state code, e.g. "/shutters-anchorage-ak.php" or
  // "/blinds-provo-ut/". Requiring the product prefix filters out blog
  // posts and content URLs that happen to end with "-ak.php" but aren't
  // actually city service pages (e.g. "/why-anchorage-homes-lose-heat-ak.php").
  const legacyStateSuffixPattern =
    /\/(?:blinds|shutters|shades|drapery|draperies|window-treatments|window-blinds|window-shutters|window-shades|window-treatment|shutter|blind|shade)-[a-z][a-z0-9-]*-(?:ak|al|ar|az|ca|co|ct|de|fl|ga|hi|ia|id|il|in|ks|ky|la|ma|md|me|mi|mn|mo|ms|mt|nc|nd|ne|nh|nj|nm|nv|ny|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|va|vt|wa|wi|wv|wy)(?:\.(?:php|html?|htm))?(?:\/|$|\?|#)/i;

  // Legacy pattern B — product-suffix:
  // matches paths like "/provo-blinds/" or "/anchorage-shutters.html".
  // We exclude well-known product subtype prefixes (wood, faux, mini, etc.)
  // to avoid false positives like "/wood-blinds/" or "/roller-shades/".
  const legacyProductSuffixPattern =
    /\/([a-z][a-z0-9-]*)-(?:blinds|shutters|shades|window-treatments|drapery|draperies)(?:\.(?:php|html?|htm))?(?:\/|$|\?|#)/i;

  const PRODUCT_SUBTYPE_PREFIXES = new Set([
    "wood", "faux", "faux-wood", "real-wood", "mini", "cellular", "roller",
    "roman", "vertical", "horizontal", "plantation", "motorized", "manual",
    "custom", "premium", "designer", "classic", "modern", "traditional",
    "contemporary", "smart", "automatic", "automated", "aluminum", "vinyl",
    "fabric", "sheer", "blackout", "exterior", "interior", "indoor", "outdoor",
    "wood-blinds", "faux-wood-blinds", "window", "honeycomb", "panel", "track",
    "double-cell", "single-cell", "light-filtering", "room-darkening",
  ]);

  type StructureKind = "modern" | "legacy";
  const detected = new Map<string, StructureKind>(); // dedupe by pathname

  $("a[href]").each((_, el) => {
    const href = ($(el).attr("href") || "").toLowerCase();
    if (!href) return;
    if (href.startsWith("http") && !href.includes(ctx.domain)) return;
    if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;

    let pathname: string;
    try {
      const u = href.startsWith("http") ? new URL(href) : new URL(href, `https://${ctx.domain}`);
      pathname = u.pathname.toLowerCase();
    } catch {
      return;
    }
    if (!pathname || pathname === "/") return;

    // Modern pattern first — strongest signal.
    const modernMatch = pathname.match(modernPattern);
    if (modernMatch && modernMatch[1]) {
      const slug = modernMatch[1].trim();
      if (slug && slug.length > 1 && slug !== "index") {
        // Modern wins over legacy for the same path.
        detected.set(pathname, "modern");
        return;
      }
    }

    // Legacy A — state code suffix.
    if (legacyStateSuffixPattern.test(pathname)) {
      if (!detected.has(pathname)) detected.set(pathname, "legacy");
      return;
    }

    // Legacy B — product suffix, with product-subtype exclusion.
    const productMatch = pathname.match(legacyProductSuffixPattern);
    if (productMatch && productMatch[1]) {
      const prefix = productMatch[1].trim();
      // Skip if prefix looks like a product subtype rather than a city.
      if (!PRODUCT_SUBTYPE_PREFIXES.has(prefix) && prefix.length >= 3) {
        if (!detected.has(pathname)) detected.set(pathname, "legacy");
      }
    }
  });

  const count = detected.size;
  let modernCount = 0;
  let legacyCount = 0;
  for (const kind of detected.values()) {
    if (kind === "modern") modernCount++;
    else legacyCount++;
  }
  // Modern if ANY modern pages exist. Pure-legacy sites get the false flag.
  const isModernStructure = modernCount > 0;
  let score = 0;
  let severity: Finding["severity"] = "critical";
  let detail = "";
  let recommendation = "";

  if (count >= 7) {
    score = 12;
    severity = "pass";
    detail = `City-page coverage appears solid — ${count} city-specific pages identified, giving the site a foundation to rank on “blinds in [town]” searches. May not be fully leveraged if those pages aren’t strongly surfaced or linked from key pages — buried service-area pages tend to underperform their potential.`;
    recommendation = "May not be fully leveraged on two fronts: (1) each page tends to perform best when it reads locally written rather than templated — Google rewards specificity, and homeowners can tell; (2) the pages should be linked prominently from the homepage and product pages, since deeply-nested service-area pages tend to lose internal link equity and rank below where they could.";
  } else if (count >= 3) {
    score = 7;
    severity = "important";
    detail = `City-page coverage appears partial — ${count} pages identified, which is a foundation. National brands (Sunburst, 3 Day Blinds, Bumble Bee) tend to run 10+ per metro, so competitors with stronger location coverage may be capturing searches like “blinds in [city]” across the rest of your service area.`;
    recommendation = "Expanding to a page per town in your service area tends to be the highest-ROI content available to a local installer. Each page tends to perform best when it feels locally written rather than templated — Google can usually tell the difference, and so can homeowners.";
  } else if (count === 1 || count === 2) {
    score = 3;
    severity = "critical";
    detail = `Only ${count} city page identified — meaning local SEO coverage may not be fully leveraged across your service area, and competitors with stronger location pages may be capturing searches like “blinds in [city]” instead.`;
    recommendation =
      "Building a page for every town you serve tends to be the highest-ROI content a local installer can produce. A homeowner Googling “shutters Provo” tends to land on the page that looks most clearly built for Provo — and right now that page may not be yours.";
  } else {
    score = 0;
    severity = "critical";
    detail = "City pages may not be fully leveraged to capture local search traffic. Competitors with stronger location pages may be capturing searches like “blinds in [city]” or “shutters in [city]” instead.";
    recommendation =
      "Building a dedicated page per city you serve tends to be one of the highest-ROI SEO opportunities for a local installer. Homeowners search by town, Google rewards specificity, and the slot is wide open for most operators — but it tends to close as larger competitors build out their footprint.";
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
    meta: {
      isModernStructure,
      modernCount,
      legacyCount,
    },
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
    detail = `Dedicated product category pages appear in place for ${categoryNavLinks.length} lines (${categoryNavLinks
      .map((c) => c.key)
      .join(", ")}). That structure tends to support clearer routing for shoppers searching by product type. May not be fully leveraged unless each category is also visible above the fold on the homepage — buried in a sub-menu, those pages tend to capture less of the demand they could.`;
    recommendation =
      "May not be fully leveraged on two fronts: (1) each category should be surfaced clearly on the homepage so shoppers can confirm specialization in 2 seconds — sub-menu-only placement tends to underperform; (2) each category page should earn its rank with real install photos, brands carried, a starting price, and a review quote. Stub pages tend to underperform meaningfully against more-specialized competitors.";
  } else if (present.length >= 3 && categoryNavLinks.length < 3) {
    score = 5;
    severity = "important";
    detail = `Product mentions appear in copy, but only ${categoryNavLinks.length} category(ies) seem to have their own dedicated page. Homeowners tend to Google by product type and click the result that looks most specialized — likely limiting how this site captures those searches.`;
    recommendation =
      "Each major product line tends to perform best when it reads like its own shop. Shutter buyers, for example, tend to spend 2–3x the blinds-only buyer, so a site that doesn’t look specialized in shutters may not be fully leveraging that demand.";
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
      "Motorization appears to have a dedicated presence on the site. This is the segment where the highest-margin jobs tend to come from — customers with 3–5x the average ticket.";
    recommendation = "May not be fully leveraged unless real installed motorized work is featured — actual homes, the specific brands carried. That tends to be what closes the high-ticket buyer rather than generic product imagery.";
  } else if (hasDedicated) {
    // Dedicated motorization page exists, but homepage doesn't reinforce it
    // with multiple keyword mentions. The dedicated page is itself a strong
    // signal, so this scores 5 (important) rather than 2 (passing-mention).
    score = 5;
    severity = "important";
    detail = "Motorization appears to have a dedicated page on the site, but the homepage may not be strongly reinforcing that capability — homeowners landing on the homepage first might not realize this product line is offered at depth.";
    recommendation = "May not be fully leveraged unless motorization is also surfaced on the homepage — a dedicated page can only convert traffic that finds it. Featuring real installed motorized work in the homepage hero or above the fold tends to lift this category meaningfully, especially since motorized buyers tend to spend 3–5x the average ticket.";
  } else if (matches.length >= 2) {
    score = 5;
    severity = "important";
    detail = "Motorization is mentioned in copy, but a dedicated page may not be implemented in navigation. These buyers tend to be the best leads in the business — whole-home jobs, higher tickets, repeat customers — so this likely limits how well the site captures that demand.";
    recommendation =
      "Motorized buyers tend to be the best-paying customers in this category. Without a dedicated page that signals serious capability in motorization, those leads often click to a competitor who shows it more prominently.";
  } else if (matches.length === 1) {
    score = 2;
    severity = "important";
    detail = "Motorization appears mentioned once on the page, in passing — which may not be strongly enough implemented for homeowners who came specifically searching for it.";
    recommendation =
      "Homeowners Googling “motorized shades” tend to be ready to spend. A passing mention may not signal serious capability, and that perception gap likely sends those leads to a competitor whose site looks more committed to the product line.";
  } else {
    score = 0;
    severity = "critical";
    detail = "Motorization may not be fully leveraged on this site. These are the best leads in the business — whole-home jobs, bigger tickets — and current visibility likely isn’t capturing those searches.";
    recommendation =
      "Motorization is where the biggest tickets tend to live. Without a clear, dedicated presence, those searches likely route to competitors who have one — and they tend to be among the easiest leads to win once a site shows up for them at all.";
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
    { name: "Years in business", found: /\b(?:\d{1,2})\s*(?:\+\s*)?years?\s+(?:in business|experience|of service|serving)\b/i.test(bodyText) || /since\s+(?:19|20)\d{2}/i.test(bodyText) || /established\s+(?:19|20)\d{2}/i.test(bodyText) || /founded\s+(?:in\s+)?(?:19|20)\d{2}/i.test(bodyText) },
    { name: "BBB accreditation", found: /\bbbb\b|better business bureau/i.test(bodyText) },
    { name: "Brand partnerships", found: /hunter douglas|gallery dealer|certified pro|norman|graber|levolor|hunterdouglas/i.test(bodyText) },
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
        ? "Trust signal coverage appears strong — multiple credibility cues (reviews, years in business, brand partnerships, warranty) are present on the page. May not be fully leveraged unless those signals are surfaced above the fold and on mobile, since homeowners tend to make a credibility judgment in the first few seconds before scrolling."
        : `Trust signals may not be fully leveraged on this page — we identified ${count} of ${signals.length} common credibility cues (${signals.filter((s) => s.found).map((s) => s.name).join(", ") || "none clearly visible"}). Homeowners tend to choose based on trust before price, so limited visibility of those signals likely costs conversions.`,
    recommendation:
      missing.length > 0
        ? `Homeowners tend to scan for reasons to trust a local business in the first few seconds. Surfacing the signals that don’t appear prominently shown (${missing.join(", ")}) — above the fold rather than buried on an About page — usually lifts conversions immediately. The signals that exist already may also not be fully leveraged unless they sit in that first-scroll real estate.`
        : "May not be fully leveraged unless these stay visible above the fold, especially on mobile. The first impression tends to be a credibility scan more than a feature scan, and signals discovered later in the page tend to do less work than signals shown immediately.",
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
    issues.push(hasViewport ? "viewport meta appears to disable zooming, which may limit accessibility" : "responsive viewport meta may not be implemented");
  }

  if (telLinks) {
    score += 2;
  } else {
    issues.push("phone may not be implemented as a tappable tel: link");
  }

  if (!heavyPage) {
    score += 2;
  } else {
    issues.push(`page weight is heavy (${scriptCount} scripts, ${imgCount} images) — likely limiting mobile performance over 4G`);
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
        ? "Mobile foundation appears solid — responsive viewport, a tappable phone link, and page weight in a reasonable range. May not be fully leveraged unless real-world load speed and tap-target quality are also tight, since perceived speed on a phone is what tends to determine whether a homeowner stays on the page long enough to convert."
        : `Mobile experience may not be fully optimized: ${issues.join("; ")}. Most homeowners tend to shop for blinds and shutters from their phone, so any friction in load time or tap-target quality likely limits how much of that traffic converts.`,
    recommendation:
      issues.length === 0
        ? "May not be fully leveraged unless tested on a real phone over a 4G connection every few months. What feels fast on desktop can feel sluggish on a thumb-driven mobile session, and small delays tend to compound across the conversion path."
        : "Over 70% of buyers tend to shop on mobile, and the difference between a 2-second load and a 5-second load is usually the difference between a lead and a bounce. A responsive, fast, one-tap-friendly site is what earns the call — when that experience isn’t tight, conversion likely suffers.",
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
    detail: passing ? "Site appears to be served over a secure HTTPS connection." : "A secure HTTPS connection may not be implemented on this site, which likely limits performance — Chrome tends to flag insecure sites and Google tends to demote them in search results.",
    recommendation: passing
      ? "May not be fully leveraged unless the certificate stays current. Most hosts auto-renew, but it’s worth confirming annually that nothing has lapsed."
      : "An insecure site tends to be flagged by Chrome and demoted by Google, which likely caps how well it can perform in search. This one is table-stakes to address.",
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
    recommendation = "The title tag tends to be the most-seen copy on your site — it’s what Google shows in search results and what the browser tab reads. When it isn’t strongly implemented, click-through from search is likely capped well below what the rankings would otherwise support.";
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
    detail = `Title appears well-sized at ${len} characters: "${title}".`;
    recommendation = "May not be fully leveraged unless it mentions a city or region — that’s where local search intent tends to live, and titles that include location often outperform generic ones in click-through.";
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
    detail = `Meta description appears well-sized at ${len} characters.`;
    recommendation = "May not be fully leveraged unless refreshed periodically to reflect current positioning. Search snippets that go stale tend to underperform fresher copy that names the actual offer.";
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
    recommendation = "Pages tend to perform best with one clear main heading. When a strong H1 isn’t implemented, the page often reads as unfocused to both visitors and search engines — likely limiting how well it ranks and converts.";
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
    detail = `A single H1 appears in place: "${first}".`;
    recommendation = "May not be fully leveraged unless it mentions your product + city in a way that reads naturally. Headings that name what you do and where tend to lift both ranking and on-page conversion.";
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
    detail = "LocalBusiness + review schema appear in place. That tends to give Google machine-readable signals it can use to show stars and service area directly in search results — extra clicks with zero extra ad spend.";
    recommendation = "May not be fully leveraged unless monitored in Search Console for structured-data errors. That’s where Google flags broken markup that quietly costs the rich-result enhancement.";
  } else if (hasLocalBusiness) {
    score = 5;
    severity = "important";
    detail = "LocalBusiness schema appears in place, but reviews schema may not be implemented — meaning Google likely isn’t pulling star ratings into your search snippets even when ranking well.";
    recommendation =
      "Adding review schema tends to lift click-through 20–30% at the same search position. Without it, the listing likely shows up but doesn’t earn the click against competitors with stars visible.";
  } else if (hasOrganization) {
    score = 2;
    severity = "important";
    detail = "Basic Organization schema appears in place, but LocalBusiness schema may not be implemented — meaning Google likely isn’t reading the site as a local service business in your area, which tends to keep listings out of the Map Pack.";
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
    detail = "Images may not be implemented on this page. For a visual business, project photos — before/afters, installed-in-a-home shots — tend to be one of the most persuasive conversion tools available.";
    recommendation = "Adding installed work to the homepage tends to lift conversion meaningfully for visual purchases like window treatments. Without proof of work, the “will it look right in my home?” objection often goes unanswered.";
  } else if (pct >= 90) {
    score = 4;
    severity = "pass";
    detail = `Alt text coverage appears strong — ${pct}% of images (${withAlt}/${total}) have descriptions in place.`;
    recommendation = "May not be fully leveraged unless those descriptions are descriptive enough to compete in image search. “Roman shades in a Provo master bedroom” tends to outrank “shade2.jpg” by a wide margin.";
  } else if (pct >= 60) {
    score = 2;
    severity = "important";
    detail = `Alt text coverage appears partial — ${pct}% of images have descriptions, with ${total - withAlt} image(s) where alt text may not be implemented. That likely limits performance in Google image search.`;
    recommendation = "Filling in the remaining alt text tends to add a small but real layer of free traffic from image search, plus improves accessibility for visitors using screen readers.";
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
    "schedule an appointment", "design consultation", "free consultation",
    "free quote", "request a quote", "get a quote", "free estimate", "request estimate",
    "calendly", "book now", "schedule now",
  ];
  const textHasBooking = bookingKeywords.some((k) => bodyText.includes(k));
  const hasCalendly = $("a[href*='calendly.com'], iframe[src*='calendly.com']").length > 0 ||
    $("a[href*='acuityscheduling'], iframe[src*='acuityscheduling']").length > 0;

  // Treat prominent links to a contact / quote / schedule page as a positive
  // booking signal even when no inline form exists on the homepage. Many sites
  // route booking through a dedicated landing page rather than embedding a form.
  // Trailing-segment terminators include `.php`, `.html`, `.htm` so older
  // PHP/HTML installer sites with paths like `/contact-us.php` or
  // `/quote.html` aren't silently missed.
  const contactLinkPattern =
    /(?:^|\/)(?:contact|contact-us|quote|get-a-quote|request-a-quote|schedule)(?:\/|\.(?:php|html?|htm)|$|\?|#)/;
  const hasContactLink = $("a[href]").toArray().some((el) => {
    const h = ($(el).attr("href") || "").toLowerCase();
    if (!h) return false;
    if (h.startsWith("#") || h.startsWith("mailto:") || h.startsWith("tel:")) return false;
    return contactLinkPattern.test(h);
  });

  // For scoring purposes, treat a clear contact-page link the same as an
  // inline form — both represent a booking pathway from the homepage.
  const hasBookingPath = hasForm || hasContactLink;

  let score = 0;
  let severity: Finding["severity"];
  let detail = "";
  let recommendation = "";

  if (hasCalendly) {
    score = 4;
    severity = "pass";
    detail = "Online booking appears to be integrated (Calendly or similar), giving homeowners a path to schedule a measure without the callback wait. May not be fully leveraged if scheduling is the only path forward — high-commitment CTAs like “book consultation” tend to convert a smaller slice of traffic than lower-friction options used alongside them.";
    recommendation = "May not be fully leveraged unless lower-friction first steps — like text-for-quote or a quick instant pricing tool — are also surfaced. A “Schedule Appointment” or “Book Consultation” asks for a meaningful commitment up front; pairing it with a smaller-ask option tends to capture the ready-to-act traffic that won’t commit to a calendar slot on the first visit.";
  } else if (hasBookingPath && textHasBooking) {
    score = 3;
    severity = "pass";
    detail = "A booking or quote pathway appears to be implemented and surfaced in the page copy, giving homeowners a clear next step. May not be fully leveraged if the CTA is high-commitment (“Schedule Appointment,” “Book Consultation”) without a lower-friction alternative beside it.";
    recommendation =
      "Booking or quote options may not be optimized for how customers want to engage. Many homeowners prefer a lower-friction first step such as text-for-quote or a quick instant quote — adding those alongside the existing pathway tends to capture ready-to-act traffic that won’t fill out a multi-field request or commit to a calendar slot.";
  } else if (hasBookingPath) {
    score = 2;
    severity = "important";
    detail = "A form appears on the page, but its “book” or “request quote” call to action may not be strongly featured — which likely leaves visitors unsure what the next step is.";
    recommendation = "Booking or quote options may not be optimized for how customers want to engage. A clearly named action (and ideally a lower-friction alternative like text-for-quote) tends to convert better than generic “Contact Us” framing, which often underperforms with ready-to-act traffic.";
  } else {
    score = 0;
    severity = "critical";
    detail = "Online booking or quote options may not be strongly implemented on this page. Many homeowners prefer a lower-friction first step such as texting or a quick instant quote — when those options aren’t obvious, ready-to-act traffic likely tries the next site that offers them.";
    recommendation =
      "Capturing the 9 PM browser tends to be how local installers double lead volume without spending more on ads. Offering multiple low-friction paths (text-for-quote, instant pricing, online booking) usually outperforms a single high-commitment form.";
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
    detail = `A gallery page appears to be linked, with ${imgCount} images on the homepage. Visual proof tends to be one of the strongest conversion tools for window treatment leads. May not be fully leveraged unless those photos are real installed work (not stock imagery) and include before/after pairs — the transformation shot tends to do most of the persuasive work in this category.`;
    recommendation = "May not be fully leveraged unless before/after pairs of real installed work are featured. Stock photos and product-only shots tend to underperform actual rooms, since the question homeowners are silently asking is “will it look right in my home?” — and only a real-install photo answers that.";
  } else if (imgCount > 8) {
    score = 2;
    severity = "important";
    detail = `${imgCount} images appear on the page, but a dedicated gallery may not be linked. Homeowners scrolling for inspiration likely don’t have a clear place to keep scrolling — which tends to send them elsewhere.`;
    recommendation = "Homeowners looking for inspiration tend to convert when there’s a place to keep scrolling. The photo of a room that looks like theirs is usually the closing tool.";
  } else if (instaLinks > 0) {
    score = 1;
    severity = "important";
    detail = "An Instagram link appears on the page, but a gallery on the site itself may not be implemented. Most visitors tend not to click off to Instagram — though they’ll often scroll 30 photos if they’re already on your site.";
    recommendation =
      "Bringing the Instagram work onto the site itself tends to convert better than relying on a follow-and-browse pattern. Visitors rarely follow off-site, but they’ll engage with a gallery that’s right where they already are.";
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
    detail = "A blog or resource section appears to be linked, giving the site a foundation for compounding organic traffic.";
    recommendation =
      "May not be fully leveraged unless updated consistently. Cadence tends to matter less than compounding — once a month answering a real customer question is usually enough.";
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
