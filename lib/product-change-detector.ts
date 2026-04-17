// ── Product Change Detector ─────────────────────────────────
// Compares manufacturer_library entries against previous state,
// logs changes to product_changes, and creates alerts for
// subscribed dealers with smart suggestions.
//
// Called from a cron job or admin action.

import { createClient, SupabaseClient } from "@supabase/supabase-js";

export function getServiceClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

type ChangeRecord = {
  library_product_id: string;
  change_type: string;
  field_changed: string | null;
  old_value: string | null;
  new_value: string | null;
  description: string;
  suggestion: string | null;
  suggested_product_id: string | null;
};

// ── Log a product change and notify subscribed dealers ───────
export async function logProductChange(
  supabase: SupabaseClient,
  change: ChangeRecord
) {
  // Insert change record
  const { data: changeRow } = await supabase
    .from("product_changes")
    .insert([change])
    .select("id")
    .single();

  if (!changeRow) return;

  // Get the product's manufacturer
  const { data: product } = await supabase
    .from("manufacturer_library")
    .select("manufacturer, product_name")
    .eq("id", change.library_product_id)
    .single();

  if (!product) return;

  // Find all dealer companies subscribed to this manufacturer
  const { data: subs } = await supabase
    .from("dealer_library_subscriptions")
    .select("company_id")
    .eq("manufacturer", product.manufacturer);

  if (!subs || subs.length === 0) return;

  // Also find dealers who have this product in their catalog (even if not subscribed)
  const { data: catalogUsers } = await supabase
    .from("product_catalog")
    .select("company_id")
    .eq("library_product_id", change.library_product_id);

  const companyIds = new Set<string>();
  subs.forEach(s => companyIds.add(s.company_id));
  (catalogUsers || []).forEach(c => companyIds.add(c.company_id));

  // Determine severity
  let severity = "info";
  if (change.change_type === "discontinued") severity = "critical";
  else if (change.change_type === "spec_change" || change.change_type === "price_change") severity = "warning";

  // Create alert for each dealer
  const alerts = [...companyIds].map(companyId => ({
    company_id: companyId,
    change_id: changeRow.id,
    library_product_id: change.library_product_id,
    title: `${product.manufacturer} ${product.product_name}`,
    message: change.description,
    severity,
    suggestion: change.suggestion,
    suggested_product_id: change.suggested_product_id,
  }));

  if (alerts.length > 0) {
    await supabase.from("dealer_product_alerts").insert(alerts);
  }

  return { changeId: changeRow.id, alertsSent: alerts.length };
}

// ── Find alternative products when one is discontinued ───────
export async function findAlternatives(
  supabase: SupabaseClient,
  productId: string
): Promise<{ id: string; manufacturer: string; product_name: string; score: number }[]> {
  const { data: product } = await supabase
    .from("manufacturer_library")
    .select("*")
    .eq("id", productId)
    .single();

  if (!product) return [];

  // Find active products in the same category with overlapping size ranges
  const { data: candidates } = await supabase
    .from("manufacturer_library")
    .select("id, manufacturer, product_name, category, min_width, max_width, min_height, max_height, lead_time_days")
    .eq("category", product.category)
    .eq("status", "active")
    .neq("id", productId)
    .limit(20);

  if (!candidates) return [];

  // Score each candidate based on spec similarity
  const scored = candidates.map(c => {
    let score = 0;

    // Same manufacturer = bonus (they're likely to recommend a replacement)
    if (c.manufacturer === product.manufacturer) score += 20;

    // Size range overlap
    const pMinW = parseInt(product.min_width || "0");
    const pMaxW = parseInt(product.max_width || "999");
    const cMinW = parseInt(c.min_width || "0");
    const cMaxW = parseInt(c.max_width || "999");
    if (cMinW <= pMinW && cMaxW >= pMaxW) score += 30; // fully covers
    else if (cMaxW >= pMinW && cMinW <= pMaxW) score += 15; // partial overlap

    const pMinH = parseInt(product.min_height || "0");
    const pMaxH = parseInt(product.max_height || "999");
    const cMinH = parseInt(c.min_height || "0");
    const cMaxH = parseInt(c.max_height || "999");
    if (cMinH <= pMinH && cMaxH >= pMaxH) score += 30;
    else if (cMaxH >= pMinH && cMinH <= pMaxH) score += 15;

    // Similar lead time
    if (c.lead_time_days && product.lead_time_days) {
      const diff = Math.abs(c.lead_time_days - product.lead_time_days);
      if (diff <= 3) score += 10;
      else if (diff <= 7) score += 5;
    }

    return { id: c.id, manufacturer: c.manufacturer, product_name: c.product_name, score };
  });

  return scored.sort((a, b) => b.score - a.score).slice(0, 5);
}

// ── Discontinue a product and auto-suggest alternatives ──────
export async function discontinueProduct(
  supabase: SupabaseClient,
  productId: string,
  reason: string
) {
  // Update the product
  await supabase
    .from("manufacturer_library")
    .update({
      status: "discontinued",
      discontinued_at: new Date().toISOString(),
      discontinued_reason: reason,
    })
    .eq("id", productId);

  // Find alternatives
  const alternatives = await findAlternatives(supabase, productId);
  const topAlt = alternatives[0];

  const suggestion = topAlt
    ? `Consider ${topAlt.manufacturer} ${topAlt.product_name} as a replacement (${topAlt.score}% match)`
    : "No direct alternatives found in the library. Check with your manufacturer rep for recommended replacements.";

  // Log the change
  await logProductChange(supabase, {
    library_product_id: productId,
    change_type: "discontinued",
    field_changed: "status",
    old_value: "active",
    new_value: "discontinued",
    description: `Product has been discontinued. ${reason}`,
    suggestion,
    suggested_product_id: topAlt?.id || null,
  });

  return { alternatives, suggestion };
}

// ── Update a product spec and log the change ─────────────────
export async function updateProductSpec(
  supabase: SupabaseClient,
  productId: string,
  field: string,
  oldValue: string | null,
  newValue: string | null,
  humanDescription?: string
) {
  // Determine change type
  let changeType = "spec_change";
  if (field === "msrp" || field === "dealer_cost_low" || field === "dealer_cost_high") {
    changeType = "price_change";
  } else if (field === "color_options") {
    changeType = "color_change";
  }

  const description = humanDescription || `${field.replace(/_/g, " ")} changed from "${oldValue || "none"}" to "${newValue || "none"}"`;

  // Update the product
  await supabase
    .from("manufacturer_library")
    .update({ [field]: newValue, last_verified: new Date().toISOString() })
    .eq("id", productId);

  // Log the change
  await logProductChange(supabase, {
    library_product_id: productId,
    change_type: changeType,
    field_changed: field,
    old_value: oldValue,
    new_value: newValue,
    description,
    suggestion: null,
    suggested_product_id: null,
  });
}
