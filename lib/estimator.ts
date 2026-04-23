/**
 * Job Duration Estimator.
 *
 * Reads owner-defined rules from `estimation_rules` and returns a
 * total minutes figure for a given job based on its product mix and
 * flags. The calling code is responsible for passing in the line
 * items and flag state — this file is pure math.
 *
 * Rule types:
 *   'setup_time'         — base minutes added to every estimate
 *   'per_product_type'   — N minutes per unit of a product category
 *                          (key = category slug like 'blind')
 *   'fixed_if_flag'      — adds M minutes if the named flag is true
 *                          (key = flag name like 'motorized')
 */

import { supabase } from "./supabase";

export type EstimationRule = {
  id: string;
  rule_type: "setup_time" | "per_product_type" | "fixed_if_flag";
  key: string | null;
  minutes: number;
  label: string;
  active: boolean;
  sort_order: number;
};

export type EstimationInput = {
  /** Count of units per product category ({ blind: 12, shade: 3, ... }) */
  productCounts: Record<string, number>;
  /** Boolean flags that may match a 'fixed_if_flag' rule */
  flags: Record<string, boolean>;
};

export type EstimationBreakdown = {
  totalMinutes: number;
  items: Array<{ label: string; minutes: number }>;
};

/**
 * Fetch the company's active rules. Returns [] if the table doesn't
 * exist yet (i.e. migration not applied) so callers can safely check
 * `.length === 0` for an "estimator not configured" empty state.
 */
export async function loadRules(companyId: string): Promise<EstimationRule[]> {
  try {
    const { data, error } = await supabase
      .from("estimation_rules")
      .select("id, rule_type, key, minutes, label, active, sort_order")
      .eq("company_id", companyId)
      .eq("active", true)
      .order("sort_order", { ascending: true });
    if (error) return [];
    return (data || []) as EstimationRule[];
  } catch {
    return [];
  }
}

/** Pure computation — call this with a loaded rule set + the job's inputs. */
export function computeEstimate(rules: EstimationRule[], input: EstimationInput): EstimationBreakdown {
  const items: Array<{ label: string; minutes: number }> = [];
  let total = 0;

  for (const r of rules) {
    if (!r.active) continue;
    if (r.rule_type === "setup_time") {
      total += r.minutes;
      items.push({ label: r.label, minutes: r.minutes });
    } else if (r.rule_type === "per_product_type") {
      if (!r.key) continue;
      const count = input.productCounts[r.key] || 0;
      if (count > 0) {
        const m = r.minutes * count;
        total += m;
        items.push({ label: `${r.label} × ${count}`, minutes: m });
      }
    } else if (r.rule_type === "fixed_if_flag") {
      if (!r.key) continue;
      if (input.flags[r.key]) {
        total += r.minutes;
        items.push({ label: r.label, minutes: r.minutes });
      }
    }
  }

  return { totalMinutes: total, items };
}

/** Round up to the nearest 15-minute block — appointments slot cleanly. */
export function roundToQuarterHour(minutes: number): number {
  return Math.ceil(minutes / 15) * 15;
}

/**
 * High-level helper: compute an estimate for a customer's most recent
 * useful quote. Returns { totalMinutes, items, source } or null if no
 * rules are configured / no quote is found / tables don't exist.
 *
 * Joins:
 *   customers → quotes (latest, prefers approved) → quote_line_items → product_catalog
 *
 * Builds productCounts from product_catalog.category + flags.motorized
 * from any line with is_motorized = true. Callers can round the result
 * with roundToQuarterHour.
 */
export async function estimateForCustomer(
  companyId: string | null,
  customerId: string | null,
): Promise<null | (EstimationBreakdown & { source: { quoteId: string; title: string | null } })> {
  if (!companyId || !customerId) return null;

  const rules = await loadRules(companyId);
  if (rules.length === 0) return null;

  // Find the customer's most recent quote. Approved > sent > any.
  // We pull a few and pick the one with line items.
  let quoteId: string | null = null;
  let quoteTitle: string | null = null;
  try {
    const { data: quotes } = await supabase
      .from("quotes")
      .select("id, title, status, created_at")
      .eq("customer_id", customerId)
      .in("status", ["approved", "sold", "sent", "draft"])
      .order("status", { ascending: false }) // approved sorts last alphabetically — override below
      .order("created_at", { ascending: false })
      .limit(5);
    if (!quotes || quotes.length === 0) return null;
    // Prefer approved, then sent, then most recent
    const order = ["approved", "sold", "sent", "draft"];
    const sorted = [...quotes].sort((a: { status: string; created_at: string }, b: { status: string; created_at: string }) => {
      const ai = order.indexOf(a.status);
      const bi = order.indexOf(b.status);
      if (ai !== bi) return ai - bi;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    quoteId = sorted[0].id as string;
    quoteTitle = (sorted[0] as { title: string | null }).title;
  } catch {
    return null;
  }
  if (!quoteId) return null;

  // Pull the line items for this quote, joined to the product catalog
  // category. Products can be null (custom line items) — those don't
  // contribute to per_product_type counts.
  let lines: Array<{ product_id: string | null; is_motorized: boolean }>;
  try {
    const { data, error } = await supabase
      .from("quote_line_items")
      .select("product_id, is_motorized")
      .eq("quote_id", quoteId);
    if (error || !data) return null;
    lines = data as Array<{ product_id: string | null; is_motorized: boolean }>;
  } catch {
    return null;
  }
  if (lines.length === 0) return null;

  // Resolve categories
  const productIds = [...new Set(lines.map(l => l.product_id).filter(Boolean) as string[])];
  const categoryByProduct: Record<string, string> = {};
  if (productIds.length > 0) {
    try {
      const { data: products } = await supabase
        .from("product_catalog")
        .select("id, category")
        .in("id", productIds);
      (products || []).forEach((p: { id: string; category: string }) => {
        categoryByProduct[p.id] = p.category;
      });
    } catch { /* graceful — categories just stay empty */ }
  }

  // Build counts
  const productCounts: Record<string, number> = {};
  let anyMotorized = false;
  for (const l of lines) {
    if (l.is_motorized) anyMotorized = true;
    if (!l.product_id) continue;
    const cat = categoryByProduct[l.product_id];
    if (!cat) continue;
    productCounts[cat] = (productCounts[cat] || 0) + 1;
  }

  const breakdown = computeEstimate(rules, {
    productCounts,
    flags: { motorized: anyMotorized },
  });

  if (breakdown.totalMinutes === 0) return null;

  return {
    ...breakdown,
    source: { quoteId, title: quoteTitle },
  };
}
