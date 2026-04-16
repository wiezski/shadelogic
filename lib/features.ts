export type FeatureKey =
  | "crm"
  | "scheduling"
  | "quoting"
  | "inventory"
  | "analytics"
  | "builder_portal"
  | "automation";

export type Features = Record<FeatureKey, boolean>;

export type Plan = "trial" | "basic" | "pro" | "enterprise";

export const PLAN_LABELS: Record<Plan, string> = {
  trial: "Free Trial",
  basic: "Basic",
  pro: "Professional",
  enterprise: "Enterprise",
};

export const PLAN_FEATURES: Record<Plan, Features> = {
  trial: {
    crm: true,
    scheduling: true,
    quoting: true,
    inventory: true,
    analytics: true,
    builder_portal: false,
    automation: false,
  },
  basic: {
    crm: false,
    scheduling: true,
    quoting: false,
    inventory: false,
    analytics: false,
    builder_portal: false,
    automation: false,
  },
  pro: {
    crm: true,
    scheduling: true,
    quoting: true,
    inventory: true,
    analytics: true,
    builder_portal: false,
    automation: false,
  },
  enterprise: {
    crm: true,
    scheduling: true,
    quoting: true,
    inventory: true,
    analytics: true,
    builder_portal: true,
    automation: true,
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
};

// Resolve: plan defaults merged with any company-specific overrides
export function resolveFeatures(plan: string, overrides: Partial<Features> = {}): Features {
  const defaults = PLAN_FEATURES[(plan as Plan)] ?? PLAN_FEATURES.trial;
  return { ...defaults, ...overrides };
}
