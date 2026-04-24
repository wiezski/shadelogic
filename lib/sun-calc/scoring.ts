// Scoring engine for the Window Treatment Sun & Heat Calculator.
//
// Phase 1 — grounded in DOE-style guidance and category-specific
// strengths. Deliberately opinionated (no wishy-washy "depends") so
// the output reads like advice from an operator, not a generic quiz.
//
// All scoring is client-safe and deterministic. No external APIs.

// ─── Types ──────────────────────────────────────────────────────

export type FacingDirection = "north" | "south" | "east" | "west" | "unknown";
export type MainProblem =
  | "heat"
  | "uv"
  | "glare"
  | "privacy"
  | "darkening"
  | "energy";
export type RoomType =
  | "bedroom"
  | "living_room"
  | "office"
  | "nursery"
  | "kitchen"
  | "other";
export type Preference = "natural_light" | "max_blocking" | "balanced";

export interface SunCalcInput {
  address?: string;           // free text, full or just zip
  facing: FacingDirection;
  problem: MainProblem;
  room: RoomType;
  preference: Preference;
}

export type CategoryId =
  | "cellular"
  | "lined_drapery"
  | "solar"
  | "blackout"
  | "shutters"
  | "roller"
  | "exterior";

export interface CategoryRecord {
  id: CategoryId;
  name: string;
  tier: "budget" | "mid" | "premium";
  blurb: string;
  /** Per-criterion fit, 0-10. Higher = better for that need. */
  scores: {
    heat: number;
    uv: number;
    glare: number;
    privacy: number;
    darkening: number;
    energy: number;
    view: number;
  };
}

export interface RankedCategory {
  id: CategoryId;
  name: string;
  tier: CategoryRecord["tier"];
  blurb: string;
  fitScore: number;          // computed 0-100 for display
}

export interface SunCalcResult {
  score: number;             // 0-100 sun/heat risk
  band: "Low" | "Moderate" | "High" | "Very High";
  zip: string | null;
  rankings: RankedCategory[];
  bestOverall: RankedCategory;
  bestBudget: RankedCategory | null;
  bestPremium: RankedCategory | null;
  summary: string;           // plain-english paragraph
  headline: string;          // one-line result headline
}

// ─── Product category data ──────────────────────────────────────

export const CATEGORIES: Record<CategoryId, CategoryRecord> = {
  cellular: {
    id: "cellular",
    name: "Cellular (honeycomb) shades",
    tier: "mid",
    blurb:
      "Honeycomb cells trap air and act like window insulation. The single best window treatment for heat and cold.",
    scores: { heat: 9, uv: 5, glare: 6, privacy: 6, darkening: 7, energy: 10, view: 3 },
  },
  lined_drapery: {
    id: "lined_drapery",
    name: "Lined drapery",
    tier: "premium",
    blurb:
      "Heavy lined panels over your existing blinds or shades. Serious heat, glare, and privacy control with a traditional look.",
    scores: { heat: 8, uv: 7, glare: 8, privacy: 8, darkening: 8, energy: 7, view: 4 },
  },
  solar: {
    id: "solar",
    name: "Solar shades",
    tier: "mid",
    blurb:
      "See-through mesh that cuts glare and UV while keeping your view. The go-to for south and west-facing windows with a view worth keeping.",
    scores: { heat: 5, uv: 10, glare: 9, privacy: 4, darkening: 2, energy: 5, view: 10 },
  },
  blackout: {
    id: "blackout",
    name: "Blackout shades",
    tier: "mid",
    blurb:
      "Full light-blocking fabric with side channels. Made for sleep, screens, and nurseries.",
    scores: { heat: 7, uv: 8, glare: 8, privacy: 9, darkening: 10, energy: 7, view: 0 },
  },
  shutters: {
    id: "shutters",
    name: "Plantation shutters",
    tier: "premium",
    blurb:
      "Solid wood or composite louvered shutters. The most durable and privacy-friendly option. Adds resale value.",
    scores: { heat: 7, uv: 6, glare: 8, privacy: 10, darkening: 7, energy: 6, view: 5 },
  },
  roller: {
    id: "roller",
    name: "Roller shades",
    tier: "budget",
    blurb:
      "Clean and simple. A budget workhorse that does most jobs well without overthinking it.",
    scores: { heat: 5, uv: 6, glare: 6, privacy: 7, darkening: 6, energy: 4, view: 3 },
  },
  exterior: {
    id: "exterior",
    name: "Exterior shades or awnings",
    tier: "premium",
    blurb:
      "Mounted outside the window. Stops heat before it ever enters the glass. By far the most effective option for severe afternoon sun.",
    scores: { heat: 10, uv: 8, glare: 9, privacy: 3, darkening: 4, energy: 9, view: 6 },
  },
};

// ─── Labels ─────────────────────────────────────────────────────

export const DIRECTION_LABEL: Record<FacingDirection, string> = {
  north: "North-facing",
  south: "South-facing",
  east: "East-facing",
  west: "West-facing",
  unknown: "Mixed / not sure",
};

export const PROBLEM_LABEL: Record<MainProblem, string> = {
  heat: "Heat",
  uv: "UV / fading",
  glare: "Glare",
  privacy: "Privacy",
  darkening: "Room darkening",
  energy: "Energy savings",
};

export const ROOM_LABEL: Record<RoomType, string> = {
  bedroom: "Bedroom",
  living_room: "Living room",
  office: "Office",
  nursery: "Nursery",
  kitchen: "Kitchen",
  other: "Other",
};

export const PREFERENCE_LABEL: Record<Preference, string> = {
  natural_light: "Keep natural light",
  max_blocking: "Maximum blocking",
  balanced: "Balanced",
};

// ─── Helpers ────────────────────────────────────────────────────

function extractZip(address: string | undefined): string | null {
  if (!address) return null;
  const m = address.match(/\b(\d{5})(?:-\d{4})?\b/);
  return m ? m[1] : null;
}

// Rough climate adjustment by state (inferred from address if present).
// Hot-sun states get +points, mild/cloudy slightly less, default 0.
// This is intentionally coarse for Phase 1 — a real climate lookup
// belongs in Phase 2.
const HOT_STATES = ["UT", "AZ", "NV", "TX", "FL", "NM", "CA", "CO", "OK", "KS", "GA", "AL", "MS", "LA", "SC"];
const COOL_STATES = ["WA", "OR", "ME", "MT", "VT", "NH", "AK", "ND", "MN", "WI"];

function climateBoost(address: string | undefined): number {
  if (!address) return 5;
  const upper = address.toUpperCase();
  for (const st of HOT_STATES) {
    if (new RegExp(`\\b${st}\\b`).test(upper)) return 12;
  }
  for (const st of COOL_STATES) {
    if (new RegExp(`\\b${st}\\b`).test(upper)) return -3;
  }
  return 5;
}

// ─── Risk score (0-100) ─────────────────────────────────────────

function baseRiskByDirection(dir: FacingDirection): number {
  switch (dir) {
    case "west":    return 55; // late-day intensity, fading champion
    case "south":   return 45; // strongest seasonal
    case "east":    return 35; // morning direct
    case "north":   return 15; // lowest direct sun
    case "unknown": return 35;
  }
}

function problemWeight(p: MainProblem): number {
  switch (p) {
    case "heat":      return 15;
    case "uv":        return 10;
    case "glare":     return 10;
    case "energy":    return 10;
    case "privacy":   return 5;
    case "darkening": return 5;
  }
}

function roomBoost(r: RoomType): number {
  switch (r) {
    case "nursery":     return 10;  // sleep + UV on skin
    case "office":      return 8;   // glare on screens
    case "bedroom":     return 5;
    case "living_room": return 3;
    case "kitchen":     return 3;
    case "other":       return 0;
  }
}

function preferenceRiskShift(p: Preference): number {
  switch (p) {
    case "max_blocking":   return 10;
    case "natural_light":  return -5;
    case "balanced":       return 0;
  }
}

// ─── Category ranking ───────────────────────────────────────────

// Weight vectors by (problem, direction) — which criteria matter
// most when scoring categories for this user. Values sum roughly
// so different combinations produce different winners.
function weightsFor(problem: MainProblem, facing: FacingDirection, preference: Preference) {
  const w = { heat: 0, uv: 0, glare: 0, privacy: 0, darkening: 0, energy: 0, view: 0 };

  // Base from the main stated problem — biggest single driver.
  w[problem] += 4;

  // Direction implications — west adds heat+glare+UV concern,
  // east adds morning glare, south adds heat/uv, north adds privacy.
  switch (facing) {
    case "west":
      w.heat += 2; w.glare += 2; w.uv += 1;
      break;
    case "east":
      w.glare += 2; w.heat += 1;
      break;
    case "south":
      w.heat += 2; w.uv += 2;
      break;
    case "north":
      w.privacy += 2;
      break;
    case "unknown":
      w.heat += 1; w.glare += 1; w.privacy += 1;
      break;
  }

  // Preference shifts the view weight (keep natural light) or
  // blocking weights (max blocking).
  if (preference === "natural_light") {
    w.view += 3;
    w.darkening -= 1;
  } else if (preference === "max_blocking") {
    w.darkening += 2;
    w.privacy += 1;
    w.view -= 1;
  }

  return w;
}

function scoreCategory(
  cat: CategoryRecord,
  weights: ReturnType<typeof weightsFor>,
): number {
  let total = 0;
  let weightSum = 0;
  (Object.keys(weights) as Array<keyof typeof weights>).forEach((k) => {
    const weight = weights[k];
    if (weight === 0) return;
    total += cat.scores[k] * weight;
    weightSum += Math.abs(weight);
  });
  if (weightSum === 0) return 50;
  // Normalize to 0-100 (each raw score is 0-10; weighted avg × 10)
  return Math.round((total / weightSum) * 10);
}

// ─── Plain-English summary ──────────────────────────────────────

function directionBlurb(d: FacingDirection): string {
  switch (d) {
    case "west":
      return "late-day heat and glare — the sun is lowest and most intense from about 3 p.m. to sunset. Furniture and fabrics fade fastest on this side of the house";
    case "east":
      return "morning glare and heat — sun comes in low and direct from sunrise until about 10 a.m., then backs off";
    case "south":
      return "year-round sun exposure — hot and fading-prone in summer, but useful passive warmth in winter";
    case "north":
      return "lower direct sun, so the bigger concerns are usually privacy and evenly diffused light rather than heat";
    case "unknown":
      return "variable sun exposure — the safe play is to plan for the worst-offending window first and work from there";
  }
}

function problemBlurb(p: MainProblem): string {
  switch (p) {
    case "heat":      return "reducing heat gain";
    case "uv":        return "protecting floors, furniture, and art from UV fading";
    case "glare":     return "controlling glare on screens and surfaces";
    case "privacy":   return "keeping the room private while still letting in light";
    case "darkening": return "blocking light for sleep or screen work";
    case "energy":    return "keeping heating and cooling costs down";
  }
}

function preferenceBlurb(p: Preference): string {
  switch (p) {
    case "natural_light":  return "Because you want to keep the natural light, lean toward solar shades or sheer cellular — they cut the problem without killing the view.";
    case "max_blocking":   return "Since you want maximum blocking, pair a blackout or heavy lined option with side channels to close the light gaps most shades leave.";
    case "balanced":       return "For a balanced approach, the top-ranked option below is usually the right starting point — you can always add drapery on top if you want more control.";
  }
}

function bandFor(score: number): SunCalcResult["band"] {
  if (score >= 75) return "Very High";
  if (score >= 55) return "High";
  if (score >= 35) return "Moderate";
  return "Low";
}

// ─── Main entry ─────────────────────────────────────────────────

export function computeSunCalc(input: SunCalcInput): SunCalcResult {
  // Risk score
  const rawScore =
    baseRiskByDirection(input.facing) +
    problemWeight(input.problem) +
    roomBoost(input.room) +
    preferenceRiskShift(input.preference) +
    climateBoost(input.address);

  const score = Math.max(0, Math.min(100, Math.round(rawScore)));
  const band = bandFor(score);
  const zip = extractZip(input.address);

  // Category ranking
  const weights = weightsFor(input.problem, input.facing, input.preference);
  const scored = (Object.values(CATEGORIES) as CategoryRecord[])
    .map((c): RankedCategory => ({
      id: c.id,
      name: c.name,
      tier: c.tier,
      blurb: c.blurb,
      fitScore: scoreCategory(c, weights),
    }))
    .sort((a, b) => b.fitScore - a.fitScore);

  const bestOverall = scored[0];
  const bestBudget =
    scored.find((r) => CATEGORIES[r.id].tier === "budget") || null;
  const bestPremium =
    scored.find((r) => CATEGORIES[r.id].tier === "premium") || null;

  // Plain-English summary
  const dirLabel = DIRECTION_LABEL[input.facing].toLowerCase();
  const dirText = directionBlurb(input.facing);
  const probText = problemBlurb(input.problem);
  const prefText = preferenceBlurb(input.preference);

  const summary =
    `For ${dirLabel} windows, your biggest issue is ${dirText}. ` +
    `The top priority here is ${probText}. ` +
    `${bestOverall.name} is the strongest fit: ${bestOverall.blurb} ` +
    prefText;

  // One-line headline
  const headlineByBand: Record<SunCalcResult["band"], string> = {
    "Very High": "This window is working against you.",
    "High":      "There’s real heat and glare to solve here.",
    "Moderate":  "A straightforward fix — the right product will handle it.",
    "Low":       "Not much to worry about — you have good options.",
  };

  return {
    score,
    band,
    zip,
    rankings: scored,
    bestOverall,
    bestBudget,
    bestPremium,
    summary,
    headline: headlineByBand[band],
  };
}
