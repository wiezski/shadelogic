/**
 * Blinds vs Shades — Decision Engine
 *
 * Pure logic. No React, no DOM, no side effects.
 *
 * Pipeline:
 *   1. runEngine(answers) → applyEliminations → applyScoring → composeOutput
 *
 * Conforms to the locked engine spec:
 *   - Step 2 (Hard Elimination Rules)
 *   - Step 3 (Scoring System)
 *   - Step 4 (Output Structure) including the 10 critical rules
 */

import type {
  Answers,
  ProductId,
  Configuration,
  ScoredProduct,
  EngineOutput,
  StandardOutput,
  ConflictOutput,
  PlaceholderOutput,
  AlternativeBlock,
  GapVariant,
  Confidence,
  WhyNotBlock,
  RefineAction,
  Style,
  Insulation,
  View,
  Privacy,
  LightControl,
  RoomType,
} from "./_types";
import { ALL_PRODUCTS, PRODUCT_NAMES } from "./_data/products";

// ─────────────────────────────────────────────────────────────
// Top-level
// ─────────────────────────────────────────────────────────────

export function runEngine(answers: Answers): EngineOutput {
  // Skylight / specialty → placeholder mode (we don't have a recommendation engine for these yet)
  if (answers.opening === "skylight" || answers.opening === "specialty") {
    return composePlaceholder(answers);
  }

  // Eliminations
  const survivors = applyEliminations(answers);

  // No survivors → conflict mode
  if (survivors.length === 0) {
    return composeConflict(answers, "no_survivors");
  }

  // Scoring
  const scored = applyScoring(survivors, answers);
  scored.sort((a, b) => b.score - a.score);

  // Hidden conflict detection (Rule 7): top product survives but fails a hard requirement
  const hidden = detectHiddenConflict(scored[0], answers);
  if (hidden) {
    return composeConflict(answers, hidden);
  }

  // Standard output
  return composeStandard(scored, answers);
}

// ─────────────────────────────────────────────────────────────
// Eliminations (Step 2)
// ─────────────────────────────────────────────────────────────

function applyEliminations(answers: Answers): ProductId[] {
  let survivors: ProductId[] = [...ALL_PRODUCTS];

  // ── Q1: Opening type ────────────────────────────────────
  if (answers.opening === "standard_window") {
    survivors = survivors.filter((p) => p !== "panel_track" && p !== "vertical_cellular");
  }

  if (answers.opening === "sliding_door") {
    // Always eliminate on sliders
    const alwaysEliminate: ProductId[] = ["wood_blinds", "faux_blinds", "shutters", "zebra"];
    survivors = survivors.filter((p) => !alwaysEliminate.includes(p));

    // High-use rooms: eliminate top-lifting fabric products
    const highUseRooms: RoomType[] = ["living", "kitchen", "children", "other"];
    if (highUseRooms.includes(answers.room)) {
      const topLifting: ProductId[] = ["roller", "screen", "cellular", "roman", "woven"];
      survivors = survivors.filter((p) => !topLifting.includes(p));
    }
    // Low-use rooms keep top-lifting in consideration but heavily penalized in scoring.
  }

  if (answers.opening === "wide_opening") {
    // Wide openings >8ft: single-piece horizontal blinds become impractical.
    // We allow wood/faux to survive but configuration will flag multi-section.
    // No category eliminations here for MVP scope.
  }

  // ── Q2: Bathroom (high-moisture) ───────────────────────
  if (answers.room === "bathroom") {
    const moistureFails: ProductId[] = ["wood_blinds", "woven", "roman", "drapery"];
    survivors = survivors.filter((p) => !moistureFails.includes(p));
    // Shutters and verticals stay (will be configured to vinyl/composite material).
  }

  // ── Q3: True blackout ──────────────────────────────────
  if (answers.lightControl === "true_blackout") {
    const blackoutFails: ProductId[] = [
      "zebra",
      "screen",
      "vertical_blinds",
      "wood_blinds",
      "faux_blinds",
      "shutters",
      "panel_track",
      "vertical_cellular",
      "drapery",
    ];
    survivors = survivors.filter((p) => !blackoutFails.includes(p));
    // Cellular and roller stay (must be configured for blackout in determineConfiguration).
    // Roman and woven are conditional with blackout liner caveat.
  }

  // ── Q4: Directional privacy (privacy + view simultaneously) ─
  if (answers.privacy === "directional") {
    const directionalFails: ProductId[] = [
      "roller",
      "screen",
      "zebra",
      "vertical_blinds",
      "vertical_cellular",
      "panel_track",
      "drapery",
      "woven",
    ];
    survivors = survivors.filter((p) => !directionalFails.includes(p));
    // Cellular and roman stay only with TDBU configuration (set in determineConfiguration).
  }

  // Q5, Q6, Q7, Q8, Q9: no eliminations — handled in scoring + configuration only.

  return survivors;
}

// ─────────────────────────────────────────────────────────────
// Scoring (Step 3)
// ─────────────────────────────────────────────────────────────

function applyScoring(survivors: ProductId[], answers: Answers): ScoredProduct[] {
  return survivors.map((productId) => {
    const breakdown: Partial<Record<string, number>> = {};
    let score = 0;

    breakdown.aesthetic = aestheticScore(productId, answers.style);
    score += breakdown.aesthetic;

    breakdown.insulation = insulationScore(productId, answers.insulation);
    score += breakdown.insulation;

    breakdown.view = viewScore(productId, answers.view);
    score += breakdown.view;

    breakdown.privacy = privacyScore(productId, answers.privacy);
    score += breakdown.privacy;

    breakdown.lightControl = lightControlScore(productId, answers.lightControl);
    score += breakdown.lightControl;

    if (answers.opening === "sliding_door") {
      breakdown.slider = sliderScore(productId, answers.room);
      score += breakdown.slider;

      // Rule 8: slider default bias — vertical_cellular wins ties unless contradicted
      if (productId === "vertical_cellular") {
        breakdown.sliderBias = 1;
        score += 1;
      }
    }

    // Rule 3: Drapery guardrail — drapery cannot dominate unless slider or genuinely best fit
    if (productId === "drapery" && answers.opening !== "sliding_door") {
      breakdown.draperyGuardrail = -2;
      score -= 2;
    }

    const config = determineConfiguration(productId, answers);

    return { productId, score, config, scoreBreakdown: breakdown };
  });
}

function aestheticScore(p: ProductId, style: Style): number {
  if (style === "flexible" || style === "no_preference") return 0;

  const matrix: Record<"modern" | "traditional" | "coastal", Partial<Record<ProductId, number>>> = {
    modern: {
      roller: 3,
      panel_track: 3,
      cellular: 2,
      vertical_cellular: 2,
      zebra: 2,
      screen: 2,
      drapery: 1,
      vertical_blinds: -2,
      shutters: -1,
    },
    traditional: {
      shutters: 3,
      roman: 3,
      drapery: 3,
      wood_blinds: 2,
      faux_blinds: 1,
      roller: -1,
      zebra: -2,
      panel_track: -2,
      vertical_blinds: -2,
    },
    coastal: {
      woven: 3,
      roman: 2,
      drapery: 2,
      cellular: 1,
      shutters: 1,
      faux_blinds: 1,
      wood_blinds: 1,
      zebra: -1,
      panel_track: -1,
      vertical_blinds: -1,
    },
  };

  return matrix[style][p] ?? 0;
}

function insulationScore(p: ProductId, ins: Insulation): number {
  if (ins === "yes") {
    const points: Partial<Record<ProductId, number>> = {
      cellular: 3,
      vertical_cellular: 3,
      drapery: 2,
      wood_blinds: 1,
      roman: 1,
      faux_blinds: 0,
      roller: -1,
      screen: -1,
      panel_track: -1,
      vertical_blinds: -1,
      zebra: -1,
    };
    return points[p] ?? 0;
  }
  if (ins === "somewhat") {
    return p === "cellular" || p === "vertical_cellular" ? 1 : 0;
  }
  if (ins === "dont_know") {
    return p === "cellular" ? 1 : 0; // soft positive for cellular
  }
  return 0; // "no"
}

function viewScore(p: ProductId, v: View): number {
  if (v === "very_important") {
    const points: Partial<Record<ProductId, number>> = {
      cellular: 2,
      roller: 2,
      panel_track: 2,
      vertical_cellular: 2,
      screen: 2,
      zebra: 1,
      wood_blinds: -1,
      faux_blinds: -1,
      roman: -1,
      woven: -1,
      drapery: -1,
      shutters: -2,
    };
    return points[p] ?? 0;
  }
  if (v === "somewhat") {
    if (p === "cellular" || p === "roller" || p === "panel_track" || p === "vertical_cellular") return 1;
    if (p === "shutters" || p === "wood_blinds") return -1;
    return 0;
  }
  return 0; // "not_important" or "no_view" — view dimension neutralized
}

function privacyScore(p: ProductId, priv: Privacy): number {
  if (priv === "directional") {
    // Survivors get scored for TDBU vs tilt directional capability
    const points: Partial<Record<ProductId, number>> = {
      cellular: 3, // TDBU configuration
      roman: 3, // TDBU configuration
      wood_blinds: 2,
      faux_blinds: 2,
      shutters: 2,
    };
    return points[p] ?? 0;
  }
  if (priv === "day_and_night") {
    const points: Partial<Record<ProductId, number>> = {
      cellular: 2,
      roller: 2,
      shutters: 2,
      wood_blinds: 1,
      faux_blinds: 1,
      roman: 1,
      drapery: 1,
      woven: 1,
      zebra: 1,
      vertical_cellular: 1,
      panel_track: 1,
    };
    return points[p] ?? 0;
  }
  if (priv === "night_only") {
    const points: Partial<Record<ProductId, number>> = {
      screen: 3, // designed for see-out daytime
      cellular: 1,
      roller: 1,
      zebra: 1,
    };
    return points[p] ?? 0;
  }
  return 0; // doesn't_matter
}

function lightControlScore(p: ProductId, lc: LightControl): number {
  if (lc === "glare") {
    const points: Partial<Record<ProductId, number>> = {
      screen: 3,
      roller: 1,
      cellular: 1,
      vertical_blinds: 1,
    };
    return points[p] ?? 0;
  }
  if (lc === "soften") {
    const points: Partial<Record<ProductId, number>> = {
      cellular: 3,
      roman: 3,
      roller: 2,
      wood_blinds: 2,
      faux_blinds: 2,
      drapery: 2,
      vertical_blinds: 1,
      shutters: 1,
      woven: 1,
      zebra: 1,
    };
    return points[p] ?? 0;
  }
  if (lc === "mostly_dark") {
    const points: Partial<Record<ProductId, number>> = {
      cellular: 3,
      roller: 2,
      roman: 2,
      shutters: 2,
      wood_blinds: 1,
      faux_blinds: 1,
      drapery: 1,
    };
    return points[p] ?? 0;
  }
  if (lc === "true_blackout") {
    // Only cellular and roller survive elimination; roman and woven only with liner caveat
    const points: Partial<Record<ProductId, number>> = {
      cellular: 3,
      roller: 3,
      roman: 1,
      woven: 1,
    };
    return points[p] ?? 0;
  }
  return 0;
}

function sliderScore(p: ProductId, room: RoomType): number {
  // Slider-friendly products
  const baseSlider: Partial<Record<ProductId, number>> = {
    vertical_cellular: 3,
    panel_track: 3,
    vertical_blinds: 2,
    drapery: 2,
  };
  const score = baseSlider[p];
  if (score !== undefined) return score;

  // Top-lifting on low-use slider — heavy penalty
  const lowUseRooms: RoomType[] = ["bedroom", "office", "dining"];
  const isTopLifting = ["roller", "screen", "cellular", "roman", "woven"].includes(p);
  if (isTopLifting && lowUseRooms.includes(room)) {
    return -2;
  }

  return 0;
}

// ─────────────────────────────────────────────────────────────
// Configuration determination (Configuration Lock — Rule 1)
// ─────────────────────────────────────────────────────────────

function determineConfiguration(productId: ProductId, answers: Answers): Configuration {
  const config: Configuration = {};

  // Auto-motorization (Rule 9)
  const needsMotor =
    answers.reach === "furniture" ||
    answers.reach === "dexterity" ||
    answers.opening === "tall_opening" ||
    answers.opening === "wide_opening";

  switch (productId) {
    case "cellular": {
      // Cell count
      if (answers.insulation === "yes" || answers.budget === "premium") {
        config.cellCount = "double";
      } else {
        config.cellCount = "single";
      }
      // Opacity
      if (answers.lightControl === "true_blackout") {
        config.opacity = "blackout";
        // Side channels only for severe needs (children's room blackout exception applies)
        if (answers.room === "children" || answers.budget === "premium") {
          config.sideChannels = true;
        }
      } else if (answers.lightControl === "mostly_dark") {
        config.opacity = "room_darkening";
      } else if (answers.lightControl === "glare") {
        config.opacity = "sheer";
      } else {
        config.opacity = "light_filter";
      }
      // TDBU
      if (answers.privacy === "directional") {
        config.tdbu = true;
      }
      if (needsMotor) config.motorized = true;
      break;
    }

    case "vertical_cellular": {
      config.mount = "outside";
      if (answers.insulation === "yes" || answers.budget === "premium") {
        config.cellCount = "double";
      } else {
        config.cellCount = "single";
      }
      if (answers.lightControl === "mostly_dark") config.opacity = "room_darkening";
      else if (answers.lightControl === "glare") config.opacity = "sheer";
      else config.opacity = "light_filter";
      if (needsMotor) config.motorized = true;
      break;
    }

    case "roller": {
      config.cassette = true; // recommended baseline for clean light control
      config.fabricType = "opaque";
      if (answers.lightControl === "true_blackout") {
        config.opacity = "blackout";
        config.sideChannels = true; // required for true blackout per spec
      } else if (answers.lightControl === "mostly_dark") {
        config.opacity = "room_darkening";
      } else if (answers.lightControl === "glare") {
        config.opacity = "sheer";
      } else {
        config.opacity = "light_filter";
      }
      if (needsMotor) config.motorized = true;
      break;
    }

    case "screen": {
      config.cassette = true;
      config.fabricType = "screen";
      if (needsMotor) config.motorized = true;
      break;
    }

    case "roman": {
      if (answers.lightControl === "true_blackout") config.liner = "blackout";
      else if (answers.lightControl === "mostly_dark") config.liner = "blackout";
      else if (answers.privacy === "day_and_night") config.liner = "privacy";
      else config.liner = "unlined";
      if (answers.privacy === "directional") config.tdbu = true;
      if (needsMotor) config.motorized = true;
      break;
    }

    case "woven": {
      if (answers.lightControl === "true_blackout" || answers.lightControl === "mostly_dark") {
        config.liner = "blackout";
      } else if (answers.privacy === "day_and_night") {
        config.liner = "privacy";
      } else {
        config.liner = "unlined";
      }
      if (needsMotor) config.motorized = true;
      break;
    }

    case "wood_blinds": {
      config.material = "real_wood";
      if (answers.opening === "wide_opening") config.multiSection = true;
      if (answers.reach === "dexterity" || needsMotor) config.motorized = true;
      break;
    }

    case "faux_blinds": {
      config.material = answers.budget === "premium" ? "composite" : "faux";
      if (answers.opening === "wide_opening") config.multiSection = true;
      if (answers.reach === "dexterity" || needsMotor) config.motorized = true;
      break;
    }

    case "vertical_blinds": {
      // Fabric vanes for premium and dry rooms; vinyl for moisture
      if (answers.room === "bathroom" || answers.room === "kitchen") {
        config.fabricType = "opaque"; // vinyl
      } else if (answers.budget === "premium") {
        config.fabricType = "sheer_vane"; // fabric vanes
      } else {
        config.fabricType = "opaque";
      }
      if (needsMotor) config.motorized = true;
      break;
    }

    case "shutters": {
      // Material chosen by moisture exposure
      if (answers.room === "bathroom" || answers.room === "kitchen") {
        config.material = "composite";
      } else if (answers.budget === "premium") {
        config.material = "hybrid";
      } else if (answers.budget === "budget") {
        config.material = "vinyl";
      } else {
        config.material = "real_wood";
      }
      break;
    }

    case "panel_track": {
      config.mount = "outside";
      if (answers.lightControl === "mostly_dark") config.opacity = "room_darkening";
      else config.opacity = "light_filter";
      if (needsMotor) config.motorized = true;
      break;
    }

    case "drapery": {
      // Drapery as standalone vs layered — based on whether it's a slider
      config.layered = answers.opening !== "sliding_door";
      if (answers.lightControl === "true_blackout" || answers.lightControl === "mostly_dark") {
        config.liner = "blackout";
      } else if (answers.privacy === "day_and_night") {
        config.liner = "privacy";
      } else {
        config.liner = "unlined";
      }
      if (needsMotor) config.motorized = true;
      break;
    }

    case "zebra": {
      config.cassette = true;
      if (needsMotor) config.motorized = true;
      break;
    }
  }

  return config;
}

// ─────────────────────────────────────────────────────────────
// Hidden conflict detection (Rule 7)
// ─────────────────────────────────────────────────────────────

function detectHiddenConflict(top: ScoredProduct, answers: Answers): string | null {
  // Sliding door + directional privacy: known conflict
  if (answers.opening === "sliding_door" && answers.privacy === "directional") {
    return "slider_directional";
  }

  // Top scorer doesn't actually score positively → conflict
  if (top.score <= 0) {
    return "weak_top_score";
  }

  return null;
}

// ─────────────────────────────────────────────────────────────
// Gap variant — drives the GapDiagram visibility and width
// ─────────────────────────────────────────────────────────────

function computeGapVariant(productId: ProductId, config: Configuration): GapVariant {
  // Channels effectively close the gap — no diagram needed
  if (config.sideChannels) return "none";
  // Outside-mount products don't have an inside-mount gap to show
  if (config.mount === "outside") return "none";

  if (productId === "wood_blinds" || productId === "faux_blinds") return "small";
  if (
    productId === "cellular" ||
    productId === "roman" ||
    productId === "woven"
  ) {
    return "medium";
  }
  if (productId === "roller" || productId === "screen" || productId === "zebra") {
    return "large";
  }
  return "none";
}

// ─────────────────────────────────────────────────────────────
// Standard output composer (Step 4 template)
// ─────────────────────────────────────────────────────────────

function composeStandard(scored: ScoredProduct[], answers: Answers): StandardOutput {
  const top = scored[0];
  const altsRaw = scored.slice(1, 3);
  const productLabel = PRODUCT_NAMES[top.productId];
  const configurationLabel = describeConfiguration(top.productId, top.config);
  const summary = composeSummary(top);
  const opener = composeOpener(top, answers);
  const whyThisFits = composeWhyThisFits(top, answers);
  const whatToExpect = composeWhatToExpect(top);
  const tradeoff = composeTradeoff(top);
  const worthKnowing = composeWorthKnowing(top, answers);
  const alternatives: AlternativeBlock[] = altsRaw.map((alt) => ({
    productId: alt.productId,
    label: PRODUCT_NAMES[alt.productId],
    configurationLabel: describeConfiguration(alt.productId, alt.config),
    whenItsBetter: composeWhenAlternativeBetter(alt),
  }));
  const whyNotOthers: WhyNotBlock[] = altsRaw.map((alt) => ({
    productId: alt.productId,
    label: PRODUCT_NAMES[alt.productId],
    reasons: composeWhyNotReasons(alt.productId, top.productId, answers),
  }));
  const whenThisMightNotWork = composeWhenThisMightNotWork(top, answers);
  const nextSteps = composeNextSteps(top);

  const gapVariant = computeGapVariant(top.productId, top.config);
  const confidence = computeConfidence(scored);
  const bestFor = composeBestFor(top, answers);
  const refineActions = composeRefineActions(answers);

  return {
    mode: "standard",
    productId: top.productId,
    gapVariant,
    confidence,
    bestFor,
    summary,
    opener,
    productLabel,
    configurationLabel,
    whyThisFits,
    whatToExpect,
    tradeoff,
    worthKnowing,
    whyNotOthers,
    alternatives,
    whenThisMightNotWork,
    refineActions,
    nextSteps,
  };
}

// ─────────────────────────────────────────────────────────────
// Configuration → human-readable label
// ─────────────────────────────────────────────────────────────

function describeConfiguration(productId: ProductId, c: Configuration): string {
  const parts: string[] = [];

  switch (productId) {
    case "cellular":
      parts.push(c.cellCount === "double" ? "double-cell" : "single-cell");
      if (c.opacity === "blackout") {
        parts.push("blackout fabric");
        if (c.sideChannels) parts.push("with side channels");
      } else if (c.opacity === "room_darkening") parts.push("room-darkening fabric");
      else if (c.opacity === "sheer") parts.push("sheer fabric");
      else parts.push("light-filtering fabric");
      if (c.tdbu) parts.push("top-down/bottom-up");
      break;

    case "vertical_cellular":
      parts.push(c.cellCount === "double" ? "double-cell" : "single-cell");
      if (c.opacity === "room_darkening") parts.push("room-darkening fabric");
      else if (c.opacity === "sheer") parts.push("sheer fabric");
      else parts.push("light-filtering fabric");
      parts.push("outside mount");
      break;

    case "roller":
      if (c.opacity === "blackout") {
        parts.push("blackout fabric");
        if (c.cassette) parts.push("with cassette");
        if (c.sideChannels) parts.push("and side channels");
      } else {
        if (c.opacity === "room_darkening") parts.push("room-darkening fabric");
        else if (c.opacity === "sheer") parts.push("sheer fabric");
        else parts.push("light-filtering fabric");
        if (c.cassette) parts.push("with cassette");
      }
      break;

    case "screen":
      parts.push("solar / sun-screen fabric");
      if (c.cassette) parts.push("with cassette");
      break;

    case "roman":
      if (c.tdbu) parts.push("top-down/bottom-up");
      if (c.liner === "blackout") parts.push("blackout liner");
      else if (c.liner === "privacy") parts.push("privacy liner");
      else parts.push("unlined");
      break;

    case "woven":
      if (c.liner === "blackout") parts.push("with blackout liner");
      else if (c.liner === "privacy") parts.push("with privacy liner");
      else parts.push("unlined");
      break;

    case "wood_blinds":
      parts.push("real wood (basswood)");
      if (c.multiSection) parts.push("multi-section");
      break;

    case "faux_blinds":
      if (c.material === "composite") parts.push("composite");
      else parts.push("faux-wood (PVC)");
      if (c.multiSection) parts.push("multi-section");
      break;

    case "vertical_blinds":
      if (c.fabricType === "sheer_vane") parts.push("fabric vanes");
      else parts.push("vinyl vanes");
      break;

    case "shutters":
      if (c.material === "real_wood") parts.push("real wood");
      else if (c.material === "composite") parts.push("composite");
      else if (c.material === "vinyl") parts.push("vinyl");
      else if (c.material === "hybrid") parts.push("hybrid (wood core, polymer cladding)");
      break;

    case "panel_track":
      if (c.opacity === "room_darkening") parts.push("room-darkening fabric");
      else parts.push("light-filtering fabric");
      parts.push("outside mount");
      break;

    case "drapery":
      if (c.liner === "blackout") parts.push("with blackout liner");
      else if (c.liner === "privacy") parts.push("with privacy liner");
      else parts.push("unlined");
      if (c.layered) parts.push("layered over a shade");
      break;

    case "zebra":
      if (c.cassette) parts.push("with cassette");
      break;
  }

  if (c.motorized) parts.push("motorized");

  return parts.join(", ");
}

// ─────────────────────────────────────────────────────────────
// Narrative composers
// ─────────────────────────────────────────────────────────────

function composeSummary(top: ScoredProduct): string {
  const label = PRODUCT_NAMES[top.productId];
  const config = describeConfiguration(top.productId, top.config);
  const oneLine: Partial<Record<ProductId, string>> = {
    cellular: "strong insulation, clean look, minimal stack",
    vertical_cellular: "insulation + slider-friendly side-stacking",
    roller: "clean modern look, simple operation",
    screen: "glare control while keeping your view",
    roman: "soft fabric look with the function of a shade",
    woven: "natural texture, organic warmth",
    wood_blinds: "directional privacy, traditional warmth",
    faux_blinds: "moisture-tolerant, durable, traditional look",
    shutters: "permanent architectural look, real resale impact",
    drapery: "softness, layering, side-stacking on doors",
    zebra: "modern banded look with light modulation",
    vertical_blinds: "the slider classic — practical, not pretty",
    panel_track: "modern slider solution, clean architectural feel",
  };
  return `Best fit: ${label} (${config}) — ${oneLine[top.productId] ?? "fits your priorities"}.`;
}

function composeOpener(top: ScoredProduct, answers: Answers): string {
  const opening = openingPhrase(answers);
  const priority = topPriority(answers);
  const product = PRODUCT_NAMES[top.productId].toLowerCase();
  return `For your ${opening}${priority ? `, where ${priority}` : ""} — go with a ${product}.`;
}

function openingPhrase(answers: Answers): string {
  const room = roomLabel(answers.room);
  const opening = answers.opening === "sliding_door" ? "sliding patio door" :
    answers.opening === "wide_opening" ? "wide opening" :
    answers.opening === "tall_opening" ? "tall window" :
    "window";
  return `${room} ${opening}`;
}

function roomLabel(r: RoomType): string {
  const m: Record<RoomType, string> = {
    bedroom: "bedroom",
    children: "children's room",
    living: "living room",
    kitchen: "kitchen",
    bathroom: "bathroom",
    office: "home office",
    dining: "dining room",
    other: "room",
  };
  return m[r];
}

function topPriority(answers: Answers): string | null {
  if (answers.privacy === "directional") return "privacy + view together matters";
  if (answers.lightControl === "true_blackout") return "true blackout matters";
  if (answers.insulation === "yes") return "insulation matters";
  if (answers.view === "very_important") return "preserving the view matters";
  if (answers.lightControl === "glare") return "cutting glare without losing the view matters";
  return null;
}

function composeWhyThisFits(top: ScoredProduct, answers: Answers): string {
  // Build 2-3 sentence narrative referencing the user's actual answers
  const reasons: string[] = [];

  const styleNote = styleReason(top.productId, answers.style);
  if (styleNote) reasons.push(styleNote);

  const insNote = insulationReason(top.productId, answers.insulation);
  if (insNote) reasons.push(insNote);

  const viewNote = viewReason(top.productId, answers.view);
  if (viewNote) reasons.push(viewNote);

  const privNote = privacyReason(top.productId, answers.privacy, top.config);
  if (privNote) reasons.push(privNote);

  const lightNote = lightReason(top.productId, answers.lightControl, top.config);
  if (lightNote) reasons.push(lightNote);

  const sliderNote = answers.opening === "sliding_door" ? sliderReason(top.productId) : null;
  if (sliderNote) reasons.push(sliderNote);

  // Pick top 2-3 most informative
  return reasons.slice(0, 3).join(" ");
}

function styleReason(p: ProductId, s: Style): string | null {
  if (s === "modern") {
    if (p === "roller" || p === "panel_track") return "You said you want a clean, modern look — this product is built for exactly that.";
    if (p === "cellular" || p === "vertical_cellular" || p === "zebra") return "It reads cleanly modern without trying too hard.";
  }
  if (s === "traditional") {
    if (p === "shutters") return "You're going for a traditional, formal look — shutters are the strongest answer in that space.";
    if (p === "roman" || p === "drapery") return "It delivers the soft, traditional aesthetic you described.";
    if (p === "wood_blinds") return "Real wood blinds give the warmth and traditional feel you're after.";
  }
  if (s === "coastal") {
    if (p === "woven") return "You said you want organic, natural texture — woven naturals deliver that better than anything else.";
    if (p === "roman" || p === "drapery") return "Soft and casual, fitting the relaxed look you described.";
  }
  return null;
}

function insulationReason(p: ProductId, ins: Insulation): string | null {
  if (ins === "yes" && (p === "cellular" || p === "vertical_cellular")) {
    return "You said you've got noticeable drafts — the honeycomb structure traps air and meaningfully cuts heat and cold transfer.";
  }
  if (ins === "yes" && p === "drapery") {
    return "Heavy lined drapery adds real thermal resistance — useful given the drafts you mentioned.";
  }
  return null;
}

function viewReason(p: ProductId, v: View): string | null {
  if (v === "very_important") {
    if (p === "cellular" || p === "roller" || p === "panel_track") {
      return "You said view preservation matters — this stacks small when raised so the window stays open and uncluttered.";
    }
  }
  return null;
}

function privacyReason(p: ProductId, priv: Privacy, c: Configuration): string | null {
  if (priv === "directional") {
    if (p === "wood_blinds" || p === "faux_blinds" || p === "shutters") {
      return "You wanted privacy and a view together — tilting the slats lets you see out while blocking the view in (during daylight).";
    }
    if ((p === "cellular" || p === "roman") && c.tdbu) {
      return "The top-down/bottom-up configuration solves the privacy + view problem in one product — drop the top, keep the bottom up.";
    }
  }
  return null;
}

function lightReason(p: ProductId, lc: LightControl, c: Configuration): string | null {
  if (lc === "true_blackout" && p === "cellular" && c.opacity === "blackout") {
    return "Cellular blackout fabric delivers strong darkness; works for nearly all blackout needs without channel upgrades.";
  }
  if (lc === "true_blackout" && p === "roller" && c.sideChannels) {
    return "Side channels close the gap most rollers leave at the edges; this is how rollers actually deliver true blackout.";
  }
  if (lc === "glare" && p === "screen") {
    return "Screen shades are built for exactly this — they cut glare and UV while keeping your view of what's outside.";
  }
  return null;
}

function sliderReason(p: ProductId): string | null {
  if (p === "vertical_cellular") {
    return "On a sliding door, side-stacking keeps the door usable; the cellular fabric also adds real insulation.";
  }
  if (p === "panel_track") return "Side-stacking system that suits sliders cleanly with a modern look.";
  if (p === "vertical_blinds") return "Side-stacks out of the way of the door — practical even if not premium.";
  if (p === "drapery") return "Drapery side-stacks naturally and works beautifully on a sliding door.";
  return null;
}

function composeWhatToExpect(top: ScoredProduct): string[] {
  const { productId, config } = top;
  const items: string[] = [];

  switch (productId) {
    case "cellular":
      items.push(...cellularExpectations(config));
      break;
    case "vertical_cellular":
      items.push(...verticalCellularExpectations(config));
      break;
    case "roller":
      items.push(...rollerExpectations(config));
      break;
    case "screen":
      items.push(
        "Daytime: see-out with reduced glare; very limited visibility from outside in.",
        "Nighttime: full reversal — interior visible from outside whenever lights are on.",
      );
      items.push(...sideGapLine(productId, config));
      break;
    case "roman":
      items.push(...romanExpectations(config));
      break;
    case "woven":
      items.push(...wovenExpectations(config));
      break;
    case "wood_blinds":
      items.push(
        "Tilt the slats to see out without being seen in (during daylight). At night, with interior lights on, neighbors can see lights — close fully at night for full privacy.",
        "Light gaps where slats overlap, at the bottom rail, and just below the valance — wood blinds are not a blackout product.",
        "Stack height when fully raised is roughly 8–10\" on a 60\" tall window.",
      );
      if (config.multiSection) items.push("Window is wide enough to require multi-section installation (2–3 separate units).");
      break;
    case "faux_blinds":
      items.push(
        "Same operational behavior as real wood blinds: tilt for daytime privacy + view.",
        "Faux is more moisture-tolerant and more dimensionally stable than real wood — won't warp the way real wood can.",
        "Stack and light gaps mirror real wood: roughly 8–10\" stack on a 60\" window; light at slat closure, bottom, and top.",
      );
      break;
    case "vertical_blinds":
      items.push(
        "Side-stacks to one or both sides; partial stack-back lets you clear a doorway without retracting the whole treatment.",
        "Privacy reverses from horizontal blinds: if you can see out, they can see in. There's no daytime one-way trick.",
        config.fabricType === "sheer_vane"
          ? "Fabric vanes are quieter than vinyl and read more premium, but they're not moisture-suitable and harder to clean near sinks."
          : "Vinyl vanes can clank against each other when moved or with airflow.",
      );
      break;
    case "shutters":
      items.push(
        "Panels open like French doors — typically two per window, each about half the width of the opening.",
        "Tight tilt closure — meaningfully less light leak than blinds. Rooms feel noticeably darker than expected.",
        "Hairline gaps remain where the panel meets the frame.",
        "Daily operation possible but rarely sustained; most people settle into permanent positions.",
      );
      break;
    case "drapery":
      items.push(...draperyExpectations(config));
      break;
    case "zebra":
      items.push(
        "Bands shift between view-mode (sheer aligned over opaque) and privacy-mode (opaque aligned).",
        "Bands always show as horizontal lines across the shade.",
      );
      items.push(...sideGapLine(productId, config));
      items.push("Even in privacy-mode, light leaks at band intersections — not a blackout product.");
      break;
    case "panel_track":
      items.push(
        "Side-stacking traverse system; panels slide on a track.",
        "Light gaps occur where panels overlap when closed.",
        "Outside-mount installation; sized to cover the full opening with a small visible stack at one side.",
      );
      break;
  }

  if (config.motorized) {
    items.push("Motorized — quiet operation, easy from across the room or via app/remote.");
  }

  return items;
}

// ── Per-product, config-aware "what to expect" helpers ──────────

function cellularExpectations(c: Configuration): string[] {
  const items: string[] = [];
  items.push(privacyLine("cellular", c));
  items.push(...sideGapLine("cellular", c));
  items.push("Stack height when fully raised is just a few inches.");
  if (c.tdbu) items.push("Top-down/bottom-up lets you drop the top while keeping the bottom up — privacy with a partial view.");
  if (c.cellCount === "double") items.push("Double-cell delivers meaningfully better insulation than single-cell — noticeable in cold or hot weather, especially right at the window.");
  return items;
}

function verticalCellularExpectations(c: Configuration): string[] {
  const items: string[] = [];
  items.push(privacyLine("vertical_cellular", c));
  items.push("Side-stacking system — slides to one side or splits center; you don't have to lift it to use the door.");
  items.push("Stacks back to a small bundle on one side — not invisible but minimal.");
  items.push("Outside-mount installation — covers the entire opening cleanly.");
  if (c.cellCount === "double") items.push("Double-cell adds meaningful insulation on a slider, which loses heat fast in winter.");
  return items;
}

function rollerExpectations(c: Configuration): string[] {
  const items: string[] = [];
  items.push(privacyLine("roller", c));
  items.push(...sideGapLine("roller", c));
  if (c.cassette) {
    items.push("Cassette mount seals light leakage at the top of the shade.");
  } else {
    items.push("Without a cassette, expect significant light leakage over the top of the shade.");
  }
  return items;
}

function romanExpectations(c: Configuration): string[] {
  const items: string[] = [];
  items.push(privacyLine("roman", c));
  items.push("Stacks into folds at the top when raised — bigger and bulkier than rollers or cellulars.");
  items.push(...sideGapLine("roman", c));
  if (c.tdbu) items.push("TDBU on Romans is available but less stable than cellular TDBU.");
  return items;
}

function wovenExpectations(c: Configuration): string[] {
  const items: string[] = [];
  items.push(privacyLine("woven", c));
  items.push("Natural variation in color and weave is part of the look — not a defect.");
  items.push(...sideGapLine("woven", c));
  items.push("Stack is bulky and irregular when raised — natural materials don't fold uniformly.");
  return items;
}

function draperyExpectations(c: Configuration): string[] {
  const items: string[] = [];
  if (c.liner === "blackout") {
    items.push("With a blackout liner, the fabric blocks most light — but drapery alone still leaks at the top, sides, and between panels. Pair with a blackout shade behind for true blackout.");
  } else if (c.liner === "privacy") {
    items.push("With a privacy liner, drapery gives functional privacy when closed and softens daylight.");
  } else {
    items.push("Unlined drapery filters light and adds visual softness, but doesn't block light or provide strong privacy on its own.");
  }
  items.push("Side-stacking when traversed; opens and closes horizontally like a curtain.");
  items.push("Significant stack-back occupies wall space when fully open.");
  if (c.layered) items.push("Layered install — drapery on top of a shade for combined function and softness.");
  return items;
}

// ── Privacy/light line based on opacity (for fabric products) ──

function privacyLine(productId: ProductId, c: Configuration): string {
  const isVertical = productId === "vertical_cellular";
  const orientation = isVertical
    ? "Privacy is binary — fully closed or fully open"
    : "Privacy is binary — the shade is up or down";

  switch (c.opacity) {
    case "sheer":
      return `${orientation} — and the sheer fabric is partially see-through. Daytime: you can see out and the room stays bright. Nighttime: with interior lights on, people outside can see in until you close another layer.`;
    case "light_filter":
      return `${orientation}. Light-filtering fabric gives you full functional privacy whenever it's closed, while still letting soft diffused daylight into the room.`;
    case "room_darkening":
      return `${orientation}. Room-darkening fabric blocks most light when closed — the room reads dim but not pitch black; some perimeter light may remain visible.`;
    case "blackout":
      if (c.sideChannels) {
        return `${orientation}. Blackout fabric with side channels delivers near-total light blocking when closed; only a faint halo near the headrail edge remains.`;
      }
      return `${orientation}. Blackout fabric blocks the bulk of light when closed; without side channels, expect about a half-inch of light bleed along each edge — most noticeable at night.`;
  }
  return orientation + ".";
}

// ── Side-gap line, suppressed when channels close it ───────────

function sideGapLine(productId: ProductId, c: Configuration): string[] {
  if (c.sideChannels) {
    // Channels close the gap — say so, don't repeat the standard gap measurement
    return ["Side channels close the gap on each side of the shade — only a faint headrail-edge halo can remain."];
  }
  switch (productId) {
    case "cellular":
    case "roman":
    case "woven":
      return ["Side gap on inside-mount is roughly 3/8\" overall — barely noticeable in most rooms."];
    case "roller":
    case "screen":
    case "zebra":
      return ["Side gap is roughly 1/2\" per side — visible at oblique angles, especially at night with lights on inside."];
  }
  return [];
}

function composeTradeoff(top: ScoredProduct): string {
  const { productId, config } = top;

  switch (productId) {
    case "cellular":
      if (config.opacity === "sheer") {
        return "Sheer cellular keeps the room bright and the view open by day, but at night with interior lights on the room is visible from outside. If you need night privacy, choose a heavier opacity or layer drapery behind.";
      }
      if (config.opacity === "blackout" && !config.sideChannels) {
        return "Blackout fabric without side channels gets you most of the way to a dark room, but a half-inch of edge light remains visible at night. Add side channels to close it, or accept the slight halo.";
      }
      return "Cellulars don't tilt — privacy is up or down, not adjustable mid-position. If that turns out to matter, horizontal blinds or shutters are the answer.";

    case "vertical_cellular":
      return "Outside mount is the standard — inside mount leaves visible bottom and side gaps. The slider stays usable in exchange for non-directional, on/off privacy.";

    case "roller":
      if (config.opacity === "blackout" && config.sideChannels) {
        return "Side channels add cost and add a slim track on each side of the window. The tradeoff for near-total light control is a faint headrail-edge halo at night and a slightly less minimal look than a bare roller.";
      }
      if (config.opacity === "sheer") {
        return "Sheer rollers preserve the view by day but reverse at night with interior lights on. Daytime tool, not a privacy tool.";
      }
      if (config.opacity === "blackout") {
        return "Blackout fabric without side channels still leaks about a half-inch on each side. For genuine darkness, pair with channels or accept the edge bleed.";
      }
      return "Without a cassette, light leaks over the top of the shade. Without side channels, expect about a half-inch on each side. Configure them in or accept the bare-roll modern look.";

    case "screen":
      return "These are daytime products. At night with interior lights on, the room is visible from outside. If night privacy matters, layer with a blackout shade or drapery behind.";

    case "roman":
      if (config.liner === "blackout") {
        return "Bulkier stack than rollers or cellulars when raised, and edge gaps remain even with the blackout liner. For true blackout, pair with drapery or choose blackout cellular.";
      }
      if (!config.liner || config.liner === "unlined") {
        return "Without a liner, Romans filter daylight prettily but offer only weak privacy and no real light blocking — buy them for the look, not the function.";
      }
      return "Bulkier stack than rollers or cellulars; the lined fabric blocks light well in the middle, but edges still leak.";

    case "woven":
      if (config.liner === "blackout") {
        return "Even with a blackout liner, woven naturals leak through the weave's natural irregularities and at the edges. Buy them for the texture, not for tight light control.";
      }
      return "Light filtering is uneven by design and edge gaps are larger than typical shades. If precise light or privacy matters, layer a liner or pair with drapery.";

    case "wood_blinds":
      return "Not a blackout product. Light leaks at slat closure, the bottom rail, and below the valance. If genuine darkness matters more than the directional-privacy advantage, choose cellular blackout instead.";

    case "faux_blinds":
      return "Faux looks fine but reads plastic up close — most people don't touch blinds so it rarely matters, but if the close-range look is critical, real wood is the upgrade. In humidity or a kid's room, faux is the right call regardless.";

    case "vertical_blinds":
      if (config.fabricType === "sheer_vane") {
        return "Fabric vanes fix the clank and feel more premium, but they cost more, can't go in moisture-prone rooms, and are harder to clean near sinks.";
      }
      return "Most customers carry an 'apartment cheap' association. Vinyl vanes also clank against each other. Fabric vanes solve both but at a price premium and with moisture limits.";

    case "shutters":
      return "Panels are visible even when fully open — they're architecture, not a removable treatment. Rooms feel noticeably darker than expected. The investment pays back in resale impact, but the room is permanently changed.";

    case "drapery":
      return "Drapery alone doesn't deliver tight light or privacy control. Treat it as the softness and layering layer; pair with a shade behind for real function.";

    case "zebra":
      return "Visible horizontal lines are always present, and even in privacy-mode the band intersections leak light. If you need true blackout or a clean uninterrupted look, this isn't the right product.";

    case "panel_track":
      return "Panels are oversized for typical residential window scale — they feel intentional on a sliding door or large opening, less so on a standard window. Light gaps where panels overlap, and insulation is weaker than vertical cellular.";
  }
  return "Every category has tradeoffs; this one's are minor for your situation.";
}

function composeWorthKnowing(top: ScoredProduct, answers: Answers): string[] {
  const items: string[] = [];

  // Light gap rule — suppressed when channels close the gap
  const channelsClose = top.config.sideChannels === true;
  switch (top.productId) {
    case "wood_blinds":
    case "faux_blinds":
      items.push("Inside-mount installs leave about 1/4\" of light gap on each side at the narrowest point of the window — more wherever the window is wider.");
      break;
    case "cellular":
    case "roman":
    case "woven":
      if (!channelsClose) {
        items.push("Inside-mount has roughly 3/8\" of side light gap overall.");
      }
      break;
    case "roller":
    case "screen":
    case "zebra":
      if (channelsClose) {
        items.push("With side channels, the side-gap leak is effectively closed; only a faint halo near the headrail edge can remain at night.");
      } else {
        items.push("Inside-mount has about 1/2\" of side light gap per side. A side-channel system can close this if it matters.");
      }
      break;
  }

  // Day/night privacy reversal warning
  const sheerLikely =
    (top.productId === "screen") ||
    (top.productId === "cellular" && top.config.opacity === "sheer") ||
    (top.productId === "roller" && top.config.opacity === "sheer") ||
    (top.productId === "vertical_blinds" && top.config.fabricType === "sheer_vane");
  if (sheerLikely) {
    items.push("With a sheer or see-through fabric, daytime privacy is good but at night with interior lights on, people outside can see in. Plan for this.");
  }

  // Motorization
  if (top.config.motorized) {
    items.push("Motorization is part of this configuration because of accessibility or window size — confirm power and remote/app preferences with the dealer.");
  } else if (answers.reach === "easy") {
    // No note needed
  }

  // Roller install-level rule
  if (top.productId === "roller" || top.productId === "screen" || top.productId === "zebra") {
    items.push("Rollers must install perfectly level even if your window casing isn't square — the shade will look correct relative to gravity but slightly offset relative to the window. Most people don't notice.");
  }

  // Stack size on shorter windows
  if ((top.productId === "wood_blinds" || top.productId === "faux_blinds") && answers.view === "very_important") {
    items.push("Stack of 8–10\" at the top is real on a 60\" window — proportionally larger on shorter windows. Confirm window height before ordering.");
  }

  // Real wood and moisture
  if (top.productId === "wood_blinds" && answers.room !== "bathroom") {
    items.push("Real wood is durable in dry rooms — keep it out of bathrooms or steam-heavy spaces.");
  }

  // Multi-section
  if (top.config.multiSection) {
    items.push("Wider than ~8 feet means the order will be split into 2–3 separate units; can be on separate headrails or a single continuous one — your call, mostly cost-driven.");
  }

  // Mount issue for vertical cellular
  if (top.productId === "vertical_cellular") {
    items.push("Outside-mount is strongly recommended; inside-mount leaks at the bottom and sides because the traverse rails need clearance.");
  }

  return items.slice(0, 4); // template says 2-4 max
}

// ── Confidence: how clear is the winner ──────────────────────

function computeConfidence(scored: ScoredProduct[]): Confidence {
  if (scored.length < 2) return "high";
  const gap = scored[0].score - scored[1].score;
  if (gap >= 3) return "high";
  if (gap >= 1) return "medium";
  return "split";
}

// ── Best-for tags: short summary of strengths in this context ─

function composeBestFor(top: ScoredProduct, answers: Answers): string[] {
  const tags: string[] = [];
  const b = top.scoreBreakdown;

  if (answers.insulation === "yes" && (b.insulation ?? 0) >= 2) {
    tags.push("insulation");
  }
  if (answers.view === "very_important" && (b.view ?? 0) >= 2) {
    tags.push("minimal stack");
  }

  if ((b.aesthetic ?? 0) >= 2) {
    if (answers.style === "modern") tags.push("clean modern look");
    else if (answers.style === "traditional") tags.push("traditional warmth");
    else if (answers.style === "coastal") tags.push("organic texture");
  }

  if (answers.privacy === "directional" && (b.privacy ?? 0) >= 2) {
    tags.push("privacy + view together");
  } else if (answers.privacy === "day_and_night" && (b.privacy ?? 0) >= 2) {
    tags.push("strong privacy");
  } else if (answers.privacy === "night_only" && (b.privacy ?? 0) >= 2) {
    tags.push("night privacy");
  }

  if ((b.lightControl ?? 0) >= 2) {
    if (answers.lightControl === "true_blackout") tags.push("blackout performance");
    else if (answers.lightControl === "glare") tags.push("glare control with view");
    else if (answers.lightControl === "mostly_dark") tags.push("room-darkening at night");
    else if (answers.lightControl === "soften") tags.push("soft daytime light");
  }

  if (answers.opening === "sliding_door" && (b.slider ?? 0) >= 2) {
    tags.push("slider-friendly");
  }

  // Always include at least one tag — fall back to a product-specific default
  if (tags.length === 0) {
    const defaults: Partial<Record<ProductId, string[]>> = {
      cellular: ["insulation", "minimal stack"],
      vertical_cellular: ["insulation on sliders", "side-stacking"],
      roller: ["clean modern look", "simple operation"],
      screen: ["glare control with view"],
      roman: ["soft fabric look"],
      woven: ["organic texture"],
      wood_blinds: ["directional privacy", "traditional warmth"],
      faux_blinds: ["moisture tolerance", "durability"],
      shutters: ["architectural permanence", "directional privacy"],
      drapery: ["softness", "layering"],
      vertical_blinds: ["practical slider operation"],
      panel_track: ["modern slider look"],
      zebra: ["modern look", "light modulation"],
    };
    return defaults[top.productId] ?? ["fits your priorities"];
  }

  return tags.slice(0, 4);
}

// ── Why not the other products: 2–3 reasons per alternative ───

function composeWhyNotReasons(alt: ProductId, top: ProductId, answers: Answers): string[] {
  const reasons: string[] = [];

  // Aesthetic mismatch — relative to user's stated style
  if (answers.style === "modern" && (alt === "wood_blinds" || alt === "shutters" || alt === "roman" || alt === "vertical_blinds" || alt === "woven")) {
    reasons.push("Reads more traditional than the modern look you wanted");
  }
  if (answers.style === "traditional" && (alt === "roller" || alt === "panel_track" || alt === "zebra" || alt === "vertical_cellular")) {
    reasons.push("Too modern for the traditional look you wanted");
  }
  if (answers.style === "coastal" && (alt === "panel_track" || alt === "zebra" || alt === "vertical_blinds")) {
    reasons.push("Lacks the organic texture you described");
  }

  // Insulation mismatch
  if (answers.insulation === "yes" && (alt === "roller" || alt === "screen" || alt === "panel_track" || alt === "vertical_blinds" || alt === "zebra")) {
    reasons.push("Less insulating than honeycomb-style shades");
  }

  // View / stack mismatch
  if (answers.view === "very_important") {
    if (alt === "wood_blinds" || alt === "faux_blinds") {
      reasons.push("Larger stack (8–10\" on a 60\" window) eats into your view");
    } else if (alt === "roman" || alt === "woven") {
      reasons.push("Bulky fabric stack when raised");
    } else if (alt === "shutters") {
      reasons.push("Louvers always visible, even when panels are open");
    } else if (alt === "drapery") {
      reasons.push("Stack-back occupies wall space when fully open");
    }
  }

  // Light control mismatch
  if (answers.lightControl === "true_blackout") {
    if (alt === "wood_blinds" || alt === "faux_blinds" || alt === "vertical_blinds" || alt === "shutters") {
      reasons.push("Not a blackout product — light leaks at slat closure and edges");
    } else if (alt === "zebra" || alt === "screen") {
      reasons.push("Cannot deliver blackout — structural light leak");
    } else if (alt === "woven") {
      reasons.push("Even with a blackout liner, weave irregularities leak light");
    }
  }

  // Privacy mismatch
  if (answers.privacy === "directional" && (alt === "roller" || alt === "screen" || alt === "vertical_cellular" || alt === "panel_track" || alt === "drapery" || alt === "zebra")) {
    reasons.push("No directional privacy mode (binary closure only)");
  }

  // Product-specific weak points (always relevant, regardless of user answers)
  const productSpecific: Partial<Record<ProductId, string[]>> = {
    roller: ["~1/2\" side gap per side without channels"],
    screen: ["Reverses at night — interior visible from outside with lights on"],
    wood_blinds: ["Light gaps at slat closure, bottom rail, and valance"],
    faux_blinds: ["Reads plastic at close range"],
    shutters: ["Architecturally permanent — significant visual weight"],
    drapery: ["Doesn't deliver tight light control on its own"],
    vertical_blinds: ["Carries an 'apartment cheap' association for many people"],
    roman: ["Edge gaps remain even with a blackout liner"],
    woven: ["Light passes through the weave unevenly"],
    zebra: ["Visible horizontal lines always present; band intersections leak"],
    panel_track: ["Weaker insulation than vertical cellular"],
    cellular: ["No directional tilt — privacy is binary"],
    vertical_cellular: ["Slider-only — not designed for standard windows"],
  };

  // Fill remaining slots with product-specific cons (avoiding duplicates with what's already in reasons)
  for (const con of productSpecific[alt] ?? []) {
    if (reasons.length >= 3) break;
    if (!reasons.some((r) => r === con)) reasons.push(con);
  }

  // Suppress any awkward identical text
  const unique: string[] = [];
  for (const r of reasons) {
    if (!unique.includes(r)) unique.push(r);
  }
  return unique.slice(0, 3);
}

// ── Refine actions: clickable answer-mutations to re-route engine ──

function composeRefineActions(answers: Answers): RefineAction[] {
  const candidates: Array<{ priority: number; action: RefineAction }> = [];

  if (answers.lightControl !== "true_blackout") {
    candidates.push({
      priority: 3,
      action: {
        label: "I need true blackout",
        changes: { lightControl: "true_blackout" },
      },
    });
  }
  if (answers.lightControl !== "glare") {
    candidates.push({
      priority: 2,
      action: {
        label: "I want to keep my view (glare control only)",
        changes: { lightControl: "glare" },
      },
    });
  }
  if (answers.privacy !== "directional") {
    candidates.push({
      priority: 3,
      action: {
        label: "I want privacy and a view at the same time",
        changes: { privacy: "directional" },
      },
    });
  }
  if (answers.style !== "traditional") {
    candidates.push({
      priority: 2,
      action: {
        label: "I prefer a more traditional look",
        changes: { style: "traditional" },
      },
    });
  }
  if (answers.style !== "modern") {
    candidates.push({
      priority: 2,
      action: {
        label: "I prefer a more modern look",
        changes: { style: "modern" },
      },
    });
  }
  if (answers.insulation !== "yes") {
    candidates.push({
      priority: 2,
      action: {
        label: "Insulation matters more to me",
        changes: { insulation: "yes" },
      },
    });
  }
  if (answers.view !== "very_important") {
    candidates.push({
      priority: 2,
      action: {
        label: "Preserving the view matters more",
        changes: { view: "very_important" },
      },
    });
  }
  if (answers.budget !== "premium") {
    candidates.push({
      priority: 1,
      action: {
        label: "I'm willing to invest in premium",
        changes: { budget: "premium" },
      },
    });
  }
  if (answers.budget !== "budget") {
    candidates.push({
      priority: 1,
      action: {
        label: "Keep it budget-friendly",
        changes: { budget: "budget" },
      },
    });
  }

  candidates.sort((a, b) => b.priority - a.priority);
  return candidates.slice(0, 4).map((c) => c.action);
}

function composeWhenAlternativeBetter(alt: ScoredProduct): string {
  const conditions: Partial<Record<ProductId, string>> = {
    cellular: "if insulation matters more than the modern look",
    vertical_cellular: "if you want the strongest insulation on a slider",
    roller: "if you want a cleaner, less textured aesthetic and you can give up some insulation",
    screen: "if your priority is keeping the view while cutting glare",
    roman: "if you want softness and a custom-fabric feel",
    woven: "if you want organic texture and a casual, natural look",
    wood_blinds: "if you want authentic wood grain and traditional warmth",
    faux_blinds: "if the room is humid or you want the lower-maintenance, durable option",
    vertical_blinds: "if budget is the priority",
    shutters: "if you want a permanent, architectural feature with real resale impact",
    drapery: "if you want softness layered over a functional shade",
    zebra: "if you want the modern banded look with simple light modulation",
    panel_track: "if the opening is wide and you want a clean, modern, architectural feel",
  };
  return conditions[alt.productId] ?? "in adjacent priorities";
}

function composeWhenThisMightNotWork(top: ScoredProduct, answers: Answers): string[] {
  const scenarios: string[] = [];

  // Generic regret detection (Rule 10)
  if (top.productId === "cellular") {
    if (answers.lightControl !== "true_blackout") {
      scenarios.push("If your blackout sensitivity turns out to be greater than you thought (sunrise wakes you up), you'd want to reroute to a blackout cellular configuration.");
    }
    if (answers.privacy !== "directional") {
      scenarios.push("If this room becomes a TV or media room where you'd want to see out without raising fully, you'd want a TDBU upgrade or different product.");
    }
    scenarios.push("If you decide you want directional tilt-style privacy, this isn't that product — wood blinds or shutters would be the answer.");
  } else if (top.productId === "shutters") {
    scenarios.push("If you start wanting to use this room as a bright, open-feeling space, the panels will frame the glass even when open. Consider a cellular or roller instead.");
    scenarios.push("If you're staging the home for sale to a younger or modern-leaning buyer, shutters can read traditional in a way that doesn't fit every taste.");
    scenarios.push("If furniture (a console, sofa back, dresser) ends up close to the window, the panels will hit it when opened.");
  } else if (top.productId === "roller") {
    scenarios.push("If side-gap light at night becomes a real annoyance, you'd need to add side channels — that's an upgrade, not a default.");
    scenarios.push("If you decide you want directional privacy after all (tilt to see out), rollers can't do that — wood blinds or shutters are the rerouting.");
    scenarios.push("If insulation becomes a higher priority later, cellular shades are a meaningful upgrade.");
  } else if (top.productId === "vertical_cellular") {
    scenarios.push("If you change your mind about outside mount and want this inside-mounted, expect light leaks at the bottom and sides.");
    scenarios.push("If your slider is in a low-use room and you'd really prefer a top-lifting modern look, cellular or roller becomes acceptable with motorization.");
  } else if (top.productId === "wood_blinds" || top.productId === "faux_blinds") {
    scenarios.push("If you decide you need true blackout, wood and faux blinds can't deliver — light gaps at slat closure, bottom rail, and the top valance are structural.");
    scenarios.push("If your window stack height (8–10\" on a 60\" window) becomes annoying when you raise the blind, cellular shades give back nearly all of that.");
    if (top.productId === "wood_blinds" && answers.room !== "bathroom") {
      scenarios.push("If this room becomes humid (renovation, kitchen relocation, etc.), real wood becomes the wrong choice — faux is the moisture-tolerant alternative.");
    }
  } else if (top.productId === "screen") {
    scenarios.push("If nighttime privacy becomes important — they reverse with interior lights on. Layer drapery or pair with a blackout shade if the room ever needs darkness.");
  } else if (top.productId === "drapery") {
    scenarios.push("If you decide you want functional light or privacy control, drapery alone doesn't deliver it — pair with a shade behind for real function.");
  } else if (top.productId === "vertical_blinds") {
    scenarios.push("If the apartment-feel association bothers you in your home, fabric vanes are the upgrade — or pivot to vertical cellular for a more premium feel.");
    scenarios.push("If your slider casing has less than ~3.5\" of depth, inside-mount won't work and you'll need outside-mount.");
  } else if (top.productId === "roman") {
    scenarios.push("If precision light control becomes a need (TV glare, light-sensitive sleep), Romans aren't ideal — cellular is the upgrade.");
    scenarios.push("If the window is in a high-moisture area, fabric and folds retain moisture poorly.");
  } else if (top.productId === "woven") {
    scenarios.push("If you decide you want strong privacy or light control, woven naturals leak through the weave — layer with drapery or pair with another product.");
  } else if (top.productId === "panel_track") {
    scenarios.push("If you want strong insulation, panel tracks are weaker than vertical cellular — consider vertical cellular instead.");
    scenarios.push("If you want full blackout, panel overlap gaps prevent it.");
  } else if (top.productId === "zebra") {
    scenarios.push("If you decide you want true blackout, zebras can't deliver — band intersections always leak.");
    scenarios.push("If the visible horizontal lines bother you in certain lighting, that's a permanent feature of this product.");
  }

  return scenarios.slice(0, 3);
}

function composeNextSteps(top: ScoredProduct): string[] {
  const steps: string[] = [];

  // Universal: measurement
  steps.push("Measure your window width and height at three points each — windows aren't perfectly square. Use the smallest measurement for inside-mount.");

  // Casing depth check
  if (top.productId === "vertical_blinds") {
    steps.push("Check your casing depth — vertical blinds need at least 3.5\" for inside-mount; less than that means outside-mount.");
  } else if (top.productId === "wood_blinds" || top.productId === "faux_blinds") {
    steps.push("Check casing depth — 2\" blinds typically need ~2\" of depth for a clean inside-mount.");
  } else if (top.productId === "shutters") {
    steps.push("Check casing depth — shutters can outside-mount with a build-out frame if the casing is shallow, so depth isn't a deal-breaker.");
  } else if (top.productId === "vertical_cellular" || top.productId === "panel_track") {
    steps.push("These are outside-mount products — measure the full opening you want to cover, including any frame surround you'd want it to extend over.");
  }

  // Inside vs outside mount decision
  if (top.productId === "cellular" || top.productId === "roller" || top.productId === "screen" || top.productId === "roman") {
    steps.push("Decide inside-mount (cleaner look) vs outside-mount (better light control). Outside-mount needs ~2\" of clearance around the window for the bracket.");
  }

  // Bring photo to dealer
  steps.push("If working with a dealer, bring a photo of the window with the treatment area framed — it helps with mount-style and color decisions.");

  // Order a sample
  if (top.productId === "cellular" || top.productId === "roller" || top.productId === "roman" || top.productId === "drapery" || top.productId === "woven") {
    steps.push("Order a fabric sample before committing — fabric color and texture look different at home than in a showroom.");
  }

  return steps;
}

// ─────────────────────────────────────────────────────────────
// Conflict mode composer
// ─────────────────────────────────────────────────────────────

function composeConflict(answers: Answers, conflictReason: string): ConflictOutput {
  if (conflictReason === "slider_directional") {
    return {
      mode: "conflict",
      summary: "No single product gives you both true directional privacy AND a sliding-door-friendly install.",
      opener: "Honest answer up front: no product on the market gives you what you're asking for on a sliding patio door.",
      honestAnswer:
        "The products that work well on sliding doors are all side-stacking — vertical blinds, vertical cellular, panel track, drapery. Every one of those gives binary privacy: closed = private, open = not. The 'tilt-to-see-out-while-blocking-view-in' feature you want is a property of horizontal blinds and shutters, and those don't work on a slider you actually use every day. This is a real-world constraint, not a system limit.",
      options: [
        {
          label: "Vertical cellular shade with insulation",
          description: "Accept binary privacy on the slider itself. Get the strongest insulation available for sliders, plus a modern minimalist look.",
          tradeoff: "Privacy is binary on the door. If you want directional privacy on adjacent windows, install a different product there.",
          bestIf: "Insulation and modern look matter most. You're OK with the slider in fully-open or fully-closed mode.",
        },
        {
          label: "Panel track shade with layered drapery",
          description: "Panel track gives the cleanest modern look on the door. Add drapery panels on either side for added discretion at night and softer aesthetics.",
          tradeoff: "Drapery doesn't give tilt privacy either, but it adds a visual layer that softens the binary feel.",
          bestIf: "You want the most polished, designed-looking solution and accept the layered cost.",
        },
        {
          label: "Different products in different rooms (and openings)",
          description: "Modern slider product (vertical cellular or panel track) on the door; wood blinds, shutters, or TDBU cellular on the room's other windows.",
          tradeoff: "Mixing products is intentional — the room reads as a designed mix, not a uniform set.",
          bestIf: "You're decorating room-by-room and want each opening to have the right product, not the same product.",
        },
      ],
      whatWedDo:
        "For most living rooms with a frequently used slider, the vertical cellular option is the cleanest answer. You give up the directional-privacy feature on the slider — but in real-world use, customers don't operate the slider's daytime privacy mid-position the way they imagine they will. The door is mostly fully open or fully closed. So you're giving up a feature you wouldn't actually have used much, in exchange for real insulation, a clean look, and operation that doesn't get in the way of the door.",
      nextSteps: [
        "Measure the full slider opening (top of frame to floor, edge to edge — including any side trim you'd want to cover).",
        "Take a photo of the slider with the door closed, plus photos of any adjacent windows in the same room.",
        "Bring all photos to a dealer so they can size adjacent treatments together if you go the mixed-product route.",
      ],
    };
  }

  // Generic conflict (no survivors or weak top score)
  return {
    mode: "conflict",
    summary: "Your priorities pull in directions no single product can fully reconcile.",
    opener: "Honest answer up front: based on the constraints you described, no single product fully covers everything.",
    honestAnswer:
      "The combination of inputs you selected doesn't have a clean winner in the mainstream catalog. This usually means a real-world tradeoff is unavoidable — and rather than recommend a product that won't actually deliver, here are the directions you could go.",
    options: [
      {
        label: "Relax one priority",
        description: "If you can soften the requirement that's most flexible (often light control or budget), the recommendation tree opens up considerably.",
        tradeoff: "Compromise on one input you marked as a hard requirement.",
        bestIf: "You're flexible on the priority that matters least to your daily life.",
      },
      {
        label: "Layered solution",
        description: "Pair two products — for example, a blackout shade with drapery on top — to achieve what no single product delivers.",
        tradeoff: "Higher cost and a more complex install.",
        bestIf: "Budget allows, and the room benefits from added softness or a polished layered look.",
      },
      {
        label: "Talk to a local installer",
        description: "If your situation is genuinely unusual (specialty shape, custom requirement, structural constraint), a local installer can survey the space and recommend something this engine can't.",
        tradeoff: "Adds a consultation step.",
        bestIf: "Your inputs don't fit the standard catalog cleanly.",
      },
    ],
    whatWedDo:
      "In our experience, the cleanest path is usually relaxing one priority — most people find that one input on their list is more flexible than they thought. If insulation and view preservation are equally important and you've also asked for directional privacy, dropping the directional-privacy input usually opens up a clean cellular recommendation.",
    nextSteps: [
      "Re-answer Q3 (light control) or Q4 (privacy) with your second-choice answer — see if the recommendation reroutes cleanly.",
      "If you're decorating room-by-room, consider what each room's actual top priority is and use different products in different rooms.",
      "Consider a layered solution (shade + drapery) if budget allows.",
    ],
  };
}

// ─────────────────────────────────────────────────────────────
// Placeholder mode (skylight, specialty)
// ─────────────────────────────────────────────────────────────

function composePlaceholder(answers: Answers): PlaceholderOutput {
  if (answers.opening === "skylight") {
    return {
      mode: "placeholder",
      summary: "Skylight shades — we don't yet have a recommendation engine for these.",
      opener: "Skylight shades are a specialty category we haven't yet built into this tool.",
      body:
        "Skylight shades almost always need motorization (the angle and height make manual operation impractical), and the right cellular shade choice depends on factors specific to your skylight — frame type, manufacturer (Velux, Andersen, etc.), inside-vs-outside mount on the frame, and whether you want light-filtering, room-darkening, or blackout. Generic recommendations don't serve this category well.",
      nextSteps: [
        "Identify your skylight manufacturer and model number (often on the frame interior).",
        "Measure the inside dimensions of the frame.",
        "Talk to a local installer or order direct from the skylight manufacturer's accessory line — most major brands offer their own shade kits.",
      ],
    };
  }

  return {
    mode: "placeholder",
    summary: "Specialty shapes — we don't yet have a recommendation engine for these.",
    opener: "Arches, octagons, half-rounds, and angle-tops are specialty categories we haven't yet built into this tool.",
    body:
      "Specialty-shape window treatments are almost always custom-fabricated to the specific shape of your window. The right answer depends on factors that don't generalize — your shape's exact dimensions, whether the treatment needs to operate (open/close) or just stay fixed, and how the shape's geometry interacts with light and privacy in your specific room.",
    nextSteps: [
      "Photograph the window straight-on with a tape measure visible at the widest point.",
      "Decide whether you need an operating treatment or a fixed/decorative one.",
      "Consult a local installer experienced with custom shapes — most major manufacturers offer arched and shaped products through dealers, not online configurators.",
    ],
  };
}
