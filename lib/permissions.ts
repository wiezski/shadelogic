// ── Permission keys ──────────────────────────────────────────

export type PermKey =
  | "view_pricing"        // see costs, retail, margins, P&L
  | "edit_customers"      // create/edit customer records
  | "create_quotes"       // build and send quotes
  | "view_financials"     // payments, deposits, balances, P&L
  | "manage_team"         // invite users, set roles, change permissions
  | "access_settings"     // company settings, product catalog
  | "complete_installs"   // mark install windows done/issue
  | "view_reports"        // analytics page
  | "manage_schedule"     // create/edit appointments
  | "manage_materials"    // update material/order status
  | "view_customers"      // read customer records at all
  | "assign_to_others"    // assign customers, tasks, reminders to other team members
  | "manage_billing"      // manage subscription, billing, plan changes
  | "manage_permissions"; // change other users' roles and permissions

export type Permissions = Record<PermKey, boolean>;

// ── Role presets ─────────────────────────────────────────────

export const ROLES = [
  "owner",
  "admin",
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
  admin:      "Admin",
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

export const ROLE_DEFAULTS: Record<Role, Permissions> = {
  owner:      { view_pricing:T, edit_customers:T, create_quotes:T, view_financials:T, manage_team:T, access_settings:T, complete_installs:T, view_reports:T, manage_schedule:T, manage_materials:T, view_customers:T, assign_to_others:T, manage_billing:T, manage_permissions:T },
  admin:      { view_pricing:T, edit_customers:T, create_quotes:T, view_financials:T, manage_team:T, access_settings:T, complete_installs:T, view_reports:T, manage_schedule:T, manage_materials:T, view_customers:T, assign_to_others:T, manage_billing:T, manage_permissions:T },
  lead_sales: { view_pricing:T, edit_customers:T, create_quotes:T, view_financials:F, manage_team:F, access_settings:F, complete_installs:F, view_reports:T, manage_schedule:T, manage_materials:F, view_customers:T, assign_to_others:T, manage_billing:F, manage_permissions:F },
  sales:      { view_pricing:T, edit_customers:T, create_quotes:T, view_financials:F, manage_team:F, access_settings:F, complete_installs:F, view_reports:F, manage_schedule:T, manage_materials:F, view_customers:T, assign_to_others:F, manage_billing:F, manage_permissions:F },
  office:     { view_pricing:T, edit_customers:T, create_quotes:F, view_financials:F, manage_team:F, access_settings:F, complete_installs:F, view_reports:T, manage_schedule:T, manage_materials:T, view_customers:T, assign_to_others:F, manage_billing:F, manage_permissions:F },
  accounting: { view_pricing:T, edit_customers:F, create_quotes:F, view_financials:T, manage_team:F, access_settings:F, complete_installs:F, view_reports:T, manage_schedule:F, manage_materials:F, view_customers:T, assign_to_others:F, manage_billing:F, manage_permissions:F },
  scheduler:  { view_pricing:F, edit_customers:F, create_quotes:F, view_financials:F, manage_team:F, access_settings:F, complete_installs:F, view_reports:F, manage_schedule:T, manage_materials:F, view_customers:T, assign_to_others:F, manage_billing:F, manage_permissions:F },
  installer:  { view_pricing:F, edit_customers:F, create_quotes:F, view_financials:F, manage_team:F, access_settings:F, complete_installs:T, view_reports:F, manage_schedule:F, manage_materials:F, view_customers:T, assign_to_others:F, manage_billing:F, manage_permissions:F },
  warehouse:  { view_pricing:F, edit_customers:F, create_quotes:F, view_financials:F, manage_team:F, access_settings:F, complete_installs:F, view_reports:F, manage_schedule:F, manage_materials:T, view_customers:F, assign_to_others:F, manage_billing:F, manage_permissions:F },
};

export const PERM_LABELS: Record<PermKey, { label: string; desc: string }> = {
  view_customers:     { label: "View Customers",       desc: "See customer records and contact info" },
  edit_customers:     { label: "Edit Customers",       desc: "Create and modify customer records" },
  create_quotes:      { label: "Create Quotes",        desc: "Build, price, and send quotes" },
  view_pricing:       { label: "View Pricing",         desc: "See product costs, retail prices, and margins" },
  view_financials:    { label: "View Financials",      desc: "See payments, deposits, balances, and P&L" },
  view_reports:       { label: "View Reports",         desc: "Access analytics and business reports" },
  manage_schedule:    { label: "Manage Schedule",      desc: "Create and edit appointments" },
  complete_installs:  { label: "Complete Installs",    desc: "Mark install windows done or flag issues" },
  manage_materials:   { label: "Manage Materials",     desc: "Update order and material status" },
  assign_to_others:   { label: "Assign to Others",     desc: "Assign customers, tasks, and reminders to team members" },
  manage_team:        { label: "Manage Team",          desc: "Invite users and view team members" },
  manage_permissions: { label: "Manage Permissions",   desc: "Change team roles and permissions" },
  manage_billing:     { label: "Manage Billing",       desc: "Manage subscription, plans, and payment methods" },
  access_settings:    { label: "Access Settings",      desc: "Edit company settings and product catalog" },
};

// Merge role defaults with any custom overrides stored in profile
export function resolvePermissions(role: string, overrides: Partial<Permissions> = {}): Permissions {
  const defaults = ROLE_DEFAULTS[(role as Role)] ?? ROLE_DEFAULTS.office;
  return { ...defaults, ...overrides };
}
