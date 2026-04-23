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
