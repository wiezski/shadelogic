// Business type presets — configures nav, features, dashboard, and roles
// based on how the blind company operates.

import type { Features } from "./features";

export type BusinessType =
  | "solo_installer"
  | "install_crew"
  | "solopreneur"
  | "sales_only"
  | "small_team"
  | "full_service";

export interface BusinessPreset {
  type: BusinessType;
  label: string;
  emoji: string;
  tagline: string;
  description: string;
  /** Nav hrefs to hide for this business type */
  hiddenNav: string[];
  /** Feature flag overrides (merged on top of plan defaults) */
  featureOverrides: Partial<Features>;
  /** Default dashboard widget order */
  dashboardWidgets: string[];
  /** Suggested team roles (shown as guidance, not enforced) */
  suggestedRoles: string[];
}

export const BUSINESS_PRESETS: Record<BusinessType, BusinessPreset> = {
  solo_installer: {
    type: "solo_installer",
    label: "Solo Installer",
    emoji: "🔧",
    tagline: "I install blinds for other companies",
    description: "You receive work from dealers or other companies and handle installation yourself. No quoting, no sales — just great installs.",
    hiddenNav: ["/calculator", "/payments", "/analytics", "/builders", "/manufacturers"],
    featureOverrides: {
      quoting: false,
      analytics: false,
      builder_portal: false,
      automation: false,
    },
    dashboardWidgets: ["todays_appointments", "ready_to_install", "work_queue", "quick_actions"],
    suggestedRoles: ["owner"],
  },

  install_crew: {
    type: "install_crew",
    label: "Install Crew",
    emoji: "👷",
    tagline: "We're a team that installs for other companies",
    description: "Multiple installers receiving work from dealers or other companies. You need scheduling, payroll, and material tracking — but not quoting or sales tools.",
    hiddenNav: ["/calculator", "/payments", "/builders", "/manufacturers"],
    featureOverrides: {
      quoting: false,
      builder_portal: false,
    },
    dashboardWidgets: ["todays_appointments", "ready_to_install", "operations", "work_queue", "quick_actions", "kpi_strip"],
    suggestedRoles: ["owner", "installer"],
  },

  solopreneur: {
    type: "solopreneur",
    label: "Solopreneur",
    emoji: "🏠",
    tagline: "I do it all — sell, measure, and install",
    description: "You're a one-person shop handling everything from the first call to the final install. You need the full toolkit but with a clean, focused interface.",
    hiddenNav: ["/payroll", "/builders"],
    featureOverrides: {
      builder_portal: false,
    },
    dashboardWidgets: ["quick_actions", "todays_focus", "todays_appointments", "sales_pipeline", "work_queue", "kpi_strip"],
    suggestedRoles: ["owner"],
  },

  sales_only: {
    type: "sales_only",
    label: "Sales Only",
    emoji: "💼",
    tagline: "I sell blinds and outsource installation",
    description: "You focus on measuring, quoting, and closing deals. Installation is handled by subcontractors or partner companies.",
    hiddenNav: ["/warehouse", "/builders"],
    featureOverrides: {
      builder_portal: false,
    },
    dashboardWidgets: ["quick_actions", "sales_pipeline", "kpi_strip", "revenue_chart", "todays_focus", "todays_appointments", "work_queue"],
    suggestedRoles: ["owner"],
  },

  small_team: {
    type: "small_team",
    label: "Small Team",
    emoji: "👫",
    tagline: "A couple or small crew covering sales + installs",
    description: "Husband-wife duo or 2-3 person team. You share the load between sales and installation and need most features without the complexity of a big shop.",
    hiddenNav: ["/builders"],
    featureOverrides: {
      builder_portal: false,
    },
    dashboardWidgets: ["quick_actions", "kpi_strip", "todays_focus", "sales_pipeline", "todays_appointments", "work_queue", "ready_to_install"],
    suggestedRoles: ["owner", "installer"],
  },

  full_service: {
    type: "full_service",
    label: "Full-Service Shop",
    emoji: "🏢",
    tagline: "We have office staff, salespeople, and installers",
    description: "You run a full operation with dedicated roles — office, sales, measure techs, installers. You need everything: CRM, quoting, scheduling, payroll, analytics, and more.",
    hiddenNav: [],
    featureOverrides: {},
    dashboardWidgets: ["quick_actions", "kpi_strip", "revenue_chart", "todays_focus", "sales_pipeline", "operations", "work_queue", "ready_to_install", "todays_appointments", "tasks_due"],
    suggestedRoles: ["owner", "office", "sales", "installer"],
  },
};

export const BUSINESS_TYPE_LIST: BusinessType[] = [
  "solo_installer",
  "install_crew",
  "solopreneur",
  "sales_only",
  "small_team",
  "full_service",
];
