// ── Permission keys ──────────────────────────────────────────

export type PermKey =
  | "view_pricing"       // see costs, retail, margins, P&L
  | "edit_customers"     // create/edit customer records
  | "create_quotes"      // build and send quotes
  | "view_financials"    // payments, deposits, balances, P&L
  | "manage_team"        // invite users, set roles, change permissions
  | "access_settings"    // company settings, product catalog
  | "complete_installs"  // mark install windows done/issue
  | "view_reports"       // analytics page
  | "manage_schedule"    // create/edit appointments
  | "manage_materials"   // update material/order status
  | "view_customers";    // read customer records at all

export type Permissions = Record<PermKey, boolean>;

// ── Role presets ─────────────────────────────────────────────

export const ROLES = [
  "owner",
  "lead_sales",
  "sales",
  "office",
  "accounting",
  "scheduler",
  "installer",
  "warehouse",
] as const;

export type Role = typeof ROLES[number];

export const ROLE_LABELS: Record<Role, string> = {
  owner:      "Owner",
  lead_sales: "Lead Sales",
  sales:      "Sales Rep",
  office:     "Office Staff",
  accounting: "Accounting",
  scheduler:  "Scheduler",
  installer:  "Installer",
  warehouse:  "Warehouse",
};

const T = true;
const F = false;

//                        view_pricing edit_customers create_quotes view_financials manage_team access_settings complete_installs view_reports manage_schedule manage_materials view_customers
export const ROLE_DEFAULTS: Record<Role, Permissions> = {
  owner:      { view_pricing:T, edit_customers:T, create_quotes:T, view_financials:T, manage_team:T, access_settings:T, complete_installs:T, view_reports:T, manage_schedule:T, manage_materials:T, view_customers:T },
  lead_sales: { view_pricing:T, edit_customers:T, create_quotes:T, view_financials:F, manage_team:F, access_settings:F, complete_installs:F, view_reports:T, manage_schedule:T, manage_materials:F, view_customers:T },
  sales:      { view_pricing:T, edit_customers:T, create_quotes:T, view_financials:F, manage_team:F, access_settings:F, complete_installs:F, view_reports:F, manage_schedule:T, manage_materials:F, view_customers:T },
  office:     { view_pricing:T, edit_customers:T, create_quotes:F, view_financials:F, manage_team:F, access_settings:F, complete_installs:F, view_reports:T, manage_schedule:T, manage_materials:T, view_customers:T },
  accounting: { view_pricing:T, edit_customers:F, create_quotes:F, view_financials:T, manage_team:F, access_settings:F, complete_installs:F, view_reports:T, manage_schedule:F, manage_materials:F, view_customers:T },
  scheduler:  { view_pricing:F, edit_customers:F, create_quotes:F, view_financials:F, manage_team:F, access_settings:F, complete_installs:F, view_reports:F, manage_schedule:T, manage_materials:F, view_customers:T },
  installer:  { view_pricing:F, edit_customers:F, create_quotes:F, view_financials:F, manage_team:F, access_settings:F, complete_installs:T, view_reports:F, manage_schedule:F, manage_materials:F, view_customers:T },
  warehouse:  { view_pricing:F, edit_customers:F, create_quotes:F, view_financials:F, manage_team:F, access_settings:F, complete_installs:F, view_reports:F, manage_schedule:F, manage_materials:T, view_customers:F },
};

export const PERM_LABELS: Record<PermKey, { label: string; desc: string }> = {
  view_customers:    { label: "View Customers",      desc: "See customer records and contact info" },
  edit_customers:    { label: "Edit Customers",      desc: "Create and modify customer records" },
  create_quotes:     { label: "Create Quotes",       desc: "Build, price, and send quotes" },
  view_pricing:      { label: "View Pricing",        desc: "See product costs, retail prices, and margins" },
  view_financials:   { label: "View Financials",     desc: "See payments, deposits, balances, and P&L" },
  view_reports:      { label: "View Reports",        desc: "Access analytics and business reports" },
  manage_schedule:   { label: "Manage Schedule",     desc: "Create and edit appointments" },
  complete_installs: { label: "Complete Installs",   desc: "Mark install windows done or flag issues" },
  manage_materials:  { label: "Manage Materials",    desc: "Update order and material status" },
  manage_team:       { label: "Manage Team",         desc: "Invite users, assign roles, set permissions" },
  access_settings:   { label: "Access Settings",     desc: "Edit company settings and product catalog" },
};

// Merge role defaults with any custom overrides stored in profile
export function resolvePermissions(role: string, overrides: Partial<Permissions> = {}): Permissions {
  const defaults = ROLE_DEFAULTS[(role as Role)] ?? ROLE_DEFAULTS.office;
  return { ...defaults, ...overrides };
}
