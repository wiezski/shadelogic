import type { Question } from "../_types";

/**
 * The 9 input questions for the decision engine.
 * Wording locked per Step 1 of the spec.
 */
export const QUESTIONS: ReadonlyArray<Question> = [
  {
    id: "opening",
    text: "What are you covering?",
    options: [
      { value: "standard_window", label: "A standard window" },
      { value: "sliding_door", label: "A sliding patio door" },
      { value: "wide_opening", label: "A wide opening (over ~8 feet) — not a sliding door" },
      { value: "tall_opening", label: "A tall opening — floor-to-ceiling or close" },
      { value: "skylight", label: "A skylight" },
      { value: "specialty", label: "A specialty shape — arch, octagon, half-round, angle-top" },
    ],
  },
  {
    id: "room",
    text: "What kind of room?",
    options: [
      { value: "bedroom", label: "Bedroom (primary or guest)" },
      { value: "children", label: "Children's room or nursery" },
      { value: "living", label: "Living room or family room" },
      { value: "kitchen", label: "Kitchen" },
      { value: "bathroom", label: "Bathroom or laundry / other high-moisture room" },
      { value: "office", label: "Home office or study" },
      { value: "dining", label: "Dining room or formal living" },
      { value: "other", label: "Other / not sure" },
    ],
  },
  {
    id: "lightControl",
    text: "How much light do you want to control?",
    options: [
      { value: "glare", label: "Just glare reduction — I want to keep my view but cut harsh sun" },
      { value: "soften", label: "Soften daytime light — fine with the room being naturally bright" },
      { value: "mostly_dark", label: "Mostly dark at night — some light around the edges is OK" },
      { value: "true_blackout", label: "True blackout — newborns, shift workers, light-sensitive sleepers" },
    ],
  },
  {
    id: "privacy",
    text: "How do you think about privacy?",
    options: [
      { value: "night_only", label: "Privacy only at night — daytime visibility from outside is fine" },
      { value: "day_and_night", label: "Privacy day and night — when the treatment is closed" },
      { value: "directional", label: "I want privacy AND a view at the same time — adjustable directional control" },
      { value: "doesnt_matter", label: "Doesn't matter much" },
    ],
  },
  {
    id: "style",
    text: "What look are you going for?",
    options: [
      { value: "modern", label: "Modern, minimalist, contemporary" },
      { value: "traditional", label: "Traditional, classic, formal" },
      { value: "coastal", label: "Coastal, bohemian, casual, organic / natural texture" },
      { value: "flexible", label: "Flexible / mix of styles" },
      { value: "no_preference", label: "No strong preference" },
    ],
  },
  {
    id: "reach",
    text: "Will reaching the window be a problem?",
    options: [
      { value: "furniture", label: "Yes — furniture blocks the window" },
      { value: "dexterity", label: "Yes — manual operation would be difficult" },
      { value: "easy", label: "No — easy to reach" },
      { value: "not_sure", label: "Not sure" },
    ],
  },
  {
    id: "insulation",
    text: "Is energy efficiency / insulation a priority?",
    options: [
      { value: "yes", label: "Yes — noticeable drafts or temperature swings" },
      { value: "somewhat", label: "Somewhat — nice to have" },
      { value: "no", label: "No — not important" },
      { value: "dont_know", label: "Don't know" },
    ],
  },
  {
    id: "view",
    text: "How important is preserving the view when the treatment is open?",
    options: [
      { value: "very_important", label: "Very important — minimal stack" },
      { value: "somewhat", label: "Somewhat important" },
      { value: "not_important", label: "Not important" },
      { value: "no_view", label: "No view to preserve" },
    ],
  },
  {
    id: "budget",
    text: "Budget sensitivity?",
    options: [
      { value: "budget", label: "Budget-conscious — prioritize value" },
      { value: "mid", label: "Mid-range — balance" },
      { value: "premium", label: "Premium — willing to invest" },
      { value: "not_sure", label: "Not sure" },
    ],
  },
];
