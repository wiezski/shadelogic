/**
 * Types for the Blinds vs Shades decision engine.
 * Pure types — no runtime imports.
 */

export type OpeningType =
  | "standard_window"
  | "sliding_door"
  | "wide_opening"
  | "tall_opening"
  | "skylight"
  | "specialty";

export type RoomType =
  | "bedroom"
  | "children"
  | "living"
  | "kitchen"
  | "bathroom"
  | "office"
  | "dining"
  | "other";

export type LightControl =
  | "glare"
  | "soften"
  | "mostly_dark"
  | "true_blackout";

export type Privacy =
  | "night_only"
  | "day_and_night"
  | "directional"
  | "doesnt_matter";

export type Style =
  | "modern"
  | "traditional"
  | "coastal"
  | "flexible"
  | "no_preference";

export type Reach =
  | "furniture"
  | "dexterity"
  | "easy"
  | "not_sure";

export type Insulation =
  | "yes"
  | "somewhat"
  | "no"
  | "dont_know";

export type View =
  | "very_important"
  | "somewhat"
  | "not_important"
  | "no_view";

export type Budget =
  | "budget"
  | "mid"
  | "premium"
  | "not_sure";

export type Answers = {
  opening: OpeningType;
  room: RoomType;
  lightControl: LightControl;
  privacy: Privacy;
  style: Style;
  reach: Reach;
  insulation: Insulation;
  view: View;
  budget: Budget;
};

export type ProductId =
  | "wood_blinds"
  | "faux_blinds"
  | "vertical_blinds"
  | "shutters"
  | "cellular"
  | "vertical_cellular"
  | "roller"
  | "screen"
  | "roman"
  | "woven"
  | "zebra"
  | "panel_track"
  | "drapery";

export type Configuration = {
  cellCount?: "single" | "double";
  opacity?: "sheer" | "light_filter" | "room_darkening" | "blackout";
  tdbu?: boolean;
  cassette?: boolean;
  sideChannels?: boolean;
  motorized?: boolean;
  liner?: "unlined" | "privacy" | "blackout";
  mount?: "inside" | "outside";
  material?: "real_wood" | "faux" | "composite" | "vinyl" | "hybrid";
  fabricType?: "opaque" | "sheer_vane" | "screen";
  layered?: boolean;
  multiSection?: boolean;
};

export type ScoredProduct = {
  productId: ProductId;
  score: number;
  config: Configuration;
  scoreBreakdown: Partial<Record<string, number>>;
};

export type AlternativeBlock = {
  productId: ProductId;
  label: string;
  configurationLabel: string;
  whenItsBetter: string;
};

export type ConflictOption = {
  label: string;
  description: string;
  tradeoff: string;
  bestIf: string;
};

export type GapVariant = "small" | "medium" | "large" | "none";

export type Confidence = "high" | "medium" | "split";

export type WhyNotBlock = {
  productId: ProductId;
  label: string;
  reasons: string[]; // 2–3 short bullets why this alternative wasn't chosen
};

export type RefineAction = {
  label: string;
  changes: Partial<Answers>;
};

export type StandardOutput = {
  mode: "standard";
  productId: ProductId;
  gapVariant: GapVariant;
  confidence: Confidence;
  bestFor: string[];
  summary: string;
  opener: string;
  productLabel: string;
  configurationLabel: string;
  whyThisFits: string;
  whatToExpect: string[];
  tradeoff: string;
  worthKnowing: string[];
  whyNotOthers: WhyNotBlock[];
  alternatives: AlternativeBlock[];
  whenThisMightNotWork: string[];
  refineActions: RefineAction[];
  nextSteps: string[];
};

export type ConflictOutput = {
  mode: "conflict";
  summary: string;
  opener: string;
  honestAnswer: string;
  options: ConflictOption[];
  whatWedDo: string;
  nextSteps: string[];
};

export type PlaceholderOutput = {
  mode: "placeholder";
  summary: string;
  opener: string;
  body: string;
  nextSteps: string[];
};

export type EngineOutput = StandardOutput | ConflictOutput | PlaceholderOutput;

export type Question = {
  id: keyof Answers;
  text: string;
  options: ReadonlyArray<{
    value: string;
    label: string;
  }>;
};
