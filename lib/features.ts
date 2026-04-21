export type FeatureKey =
  | "crm"
  | "scheduling"
  | "quoting"
  | "inventory"
  | "analytics"
  | "builder_portal"
  | "automation"
  | "white_label";

export type Features = Record<FeatureKey, boolean>;

export type Plan = "trial" | "starter" | "professional" | "business";

export const PLAN_LABELS: Record<Plan, string> = {
  trial: "Free Trial",
  starter: "Starter",
  professional: "Professional",
  business: "Business",
};

export const PLAN_PRICES: Record<Plan, { monthly: number; label: string }> = {
  trial: { monthly: 0, label: "Free for 14 days" },
  starter: { monthly: 49, label: "$49/mo" },
  professional: { monthly: 99, label: "$99/mo" },
  business: { monthly: 199, label: "$199/mo" },
};

// Users included per plan and per-user add-on cost
export const PLAN_USER_LIMITS: Record<Plan, { included: number; perUserPrice: number }> = {
  trial: { included: 3, perUserPrice: 0 },
  starter: { included: 1, perUserPrice: 25 },
  professional: { included: 3, perUserPrice: 25 },
  business: { included: 5, perUserPrice: 25 },
};

// Max concurrent devices per user account
export const MAX_DEVICES_PER_USER = 3;

export const PLAN_FEATURES: Record<Plan, Features> = {
  // Trial gets every feature so users can experience the full product.
  // White-label is enabled on trial too so owners can set up their branding
  // BEFORE committing to a Business subscription — it just won't persist for
  // customer-facing views once they downgrade to Starter/Pro.
  trial: {
    crm: true,
    scheduling: true,
    quoting: true,
    inventory: true,
    analytics: true,
    builder_portal: true,
    automation: true,
    white_label: true,
  },
  starter: {
    crm: true,
    scheduling: true,
    quoting: true,
    inventory: false,
    analytics: false,
    builder_portal: false,
    automation: false,
    white_label: false,
  },
  professional: {
    crm: true,
    scheduling: true,
    quoting: true,
    inventory: true,
    analytics: true,
    builder_portal: false,
    automation: true,
    white_label: false,
  },
  business: {
    crm: true,
    scheduling: true,
    quoting: true,
    inventory: true,
    analytics: true,
    builder_portal: true,
    automation: true,
    white_label: true,
  },
};

export const FEATURE_LABELS: Record<FeatureKey, { label: string; desc: string }> = {
  crm: { label: "CRM & Leads", desc: "Lead pipeline, activity tracking, heat scores" },
  scheduling: { label: "Scheduling", desc: "Calendar, appointments, forced outcomes" },
  quoting: { label: "Quoting", desc: "Quote builder, pricing engine, e-signatures" },
  inventory: { label: "Inventory & Orders", desc: "Material tracking, package check-in, email parsing" },
  analytics: { label: "Analytics", desc: "Business reports and performance metrics" },
  builder_portal: { label: "Builder Portal", desc: "Contractor login, project management, bid requests" },
  automation: { label: "Automation Engine", desc: "Workflow rules, auto follow-ups, triggered actions" },
  white_label: { label: "White-Label Branding", desc: "Custom colors, font, and logo on your dashboard + all customer-facing pages (quotes, invoices, builder portal)" },
};

// Resolve: plan defaults merged with any company-specific overrides
export function resolveFeatures(plan: string, overrides: Partial<Features> = {}): Features {
  const defaults = PLAN_FEATURES[(plan as Plan)] ?? PLAN_FEATURES.trial;
  return { ...defaults, ...overrides };
}
