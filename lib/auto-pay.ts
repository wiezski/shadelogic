/**
 * Auto-pay generation utilities
 *
 * 1. Commission: auto-create pay entry when quote is approved (sold)
 * 2. Contractor: auto-create pay entry when install is completed
 */

import { supabase } from "./supabase";

// ── Commission auto-generation ─────────────────────────────────
// Called when a quote status changes to "approved"
export async function generateCommissionEntry({
  quoteId,
  customerId,
  saleAmount,
  companyId,
}: {
  quoteId: string;
  customerId: string;
  saleAmount: number;
  companyId: string;
}) {
  if (!saleAmount || saleAmount <= 0) return { created: false, reason: "No sale amount" };

  // Check if a commission entry already exists for this quote (prevent duplicates)
  const { data: existing } = await supabase
    .from("pay_entries")
    .select("id")
    .eq("quote_id", quoteId)
    .eq("entry_type", "commission")
    .limit(1);
  if (existing && existing.length > 0) return { created: false, reason: "Commission already exists" };

  // Look up who the customer is assigned to (the salesperson)
  const { data: customer } = await supabase
    .from("customers")
    .select("assigned_to")
    .eq("id", customerId)
    .single();
  if (!customer?.assigned_to) return { created: false, reason: "No salesperson assigned" };

  const salesPersonId = customer.assigned_to;

  // Look up the salesperson's commission rate
  const { data: payRate } = await supabase
    .from("pay_rates")
    .select("has_commission, commission_pct")
    .eq("profile_id", salesPersonId)
    .eq("active", true)
    .single();
  if (!payRate?.has_commission || !payRate.commission_pct) {
    return { created: false, reason: "Salesperson has no commission rate configured" };
  }

  const commPct = Number(payRate.commission_pct);
  const amount = Math.round((saleAmount * commPct) / 100 * 100) / 100; // round to cents

  // Create the commission pay entry
  const { error } = await supabase.from("pay_entries").insert([{
    profile_id: salesPersonId,
    company_id: companyId,
    entry_type: "commission",
    quote_id: quoteId,
    customer_id: customerId,
    sale_amount: saleAmount,
    commission_pct: commPct,
    amount,
    work_date: new Date().toISOString().slice(0, 10),
    status: "pending",
    description: `Commission on $${saleAmount.toLocaleString()} sale (${commPct}%)`,
  }]);

  if (error) {
    console.error("Commission entry error:", error);
    return { created: false, reason: error.message };
  }

  return { created: true, amount, commPct, salesPersonId };
}


// ── Contractor pay auto-generation ─────────────────────────────
// Called when an install job is marked complete

type WindowInfo = {
  product?: string | null;
  takedown?: boolean;
  over_10_ft?: boolean;
  metal_or_concrete?: boolean;
  install_status?: string | null;
};

// Map window properties to rate card service names
function classifyWindow(w: WindowInfo): string[] {
  const services: string[] = [];
  const product = (w.product || "").toLowerCase();

  // Primary install service based on product type
  if (product.includes("shutter")) {
    services.push("Shutter Install");
  } else if (product.includes("shade") || product.includes("roller") || product.includes("solar")) {
    services.push("Shade Install");
  } else if (product.includes("motor")) {
    services.push("Motorized Install");
  } else if (product.includes("cornice") || product.includes("valance")) {
    services.push("Cornice / Valance");
  } else {
    // Default to blind install
    services.push("Blind Install");
  }

  // Also check if motorized (in addition to base type)
  if (product.includes("motor") && !services.includes("Motorized Install")) {
    services.push("Motorized Install");
  }

  // Add-on services from window flags
  if (w.takedown) services.push("Take Down / Remove Existing");
  if (w.over_10_ft) services.push("Tall Ladder (10'+)");
  if (w.metal_or_concrete) services.push("Masonry / Tile Install");

  return services;
}

export async function generateContractorPay({
  jobId,
  jobTitle,
  customerId,
  installerId,
  windows,
  companyId,
}: {
  jobId: string;
  jobTitle: string;
  customerId: string;
  installerId: string;
  windows: WindowInfo[];
  companyId: string;
}) {
  if (!installerId) return { created: false, reason: "No installer specified" };
  if (windows.length === 0) return { created: false, reason: "No windows" };

  // Check if contractor pay already exists for this job (prevent duplicates)
  const { data: existing } = await supabase
    .from("pay_entries")
    .select("id")
    .eq("job_id", jobId)
    .eq("entry_type", "job")
    .eq("profile_id", installerId)
    .limit(1);
  if (existing && existing.length > 0) return { created: false, reason: "Pay entry already exists for this job" };

  // Check if the installer is a contractor with a rate card
  const { data: payRate } = await supabase
    .from("pay_rates")
    .select("is_contractor")
    .eq("profile_id", installerId)
    .eq("active", true)
    .single();
  if (!payRate?.is_contractor) return { created: false, reason: "Installer is not set up as contractor" };

  // Load the contractor's rate card
  const { data: rateCard } = await supabase
    .from("contractor_rate_items")
    .select("service_name, rate, unit_label")
    .eq("profile_id", installerId)
    .eq("active", true);
  if (!rateCard || rateCard.length === 0) return { created: false, reason: "No rate card configured" };

  // Build a lookup map: service_name → rate
  const rateMap = new Map<string, number>();
  for (const item of rateCard) {
    rateMap.set(item.service_name, Number(item.rate) || 0);
  }

  // Count services across all completed windows
  const serviceCounts = new Map<string, number>();
  const completedWindows = windows.filter(w => w.install_status === "complete" || !w.install_status);

  for (const w of completedWindows) {
    const services = classifyWindow(w);
    for (const svc of services) {
      serviceCounts.set(svc, (serviceCounts.get(svc) || 0) + 1);
    }
  }

  // Calculate total pay
  let totalAmount = 0;
  const breakdown: string[] = [];
  for (const [service, count] of serviceCounts) {
    const rate = rateMap.get(service) || 0;
    if (rate > 0) {
      const lineTotal = rate * count;
      totalAmount += lineTotal;
      breakdown.push(`${service}: ${count} × $${rate} = $${lineTotal.toFixed(2)}`);
    }
  }

  if (totalAmount <= 0) {
    return { created: false, reason: "No billable services (all rates are $0)" };
  }

  totalAmount = Math.round(totalAmount * 100) / 100;

  // Create the pay entry
  const { error } = await supabase.from("pay_entries").insert([{
    profile_id: installerId,
    company_id: companyId,
    entry_type: "job",
    job_id: jobId,
    customer_id: customerId,
    window_count: completedWindows.length,
    amount: totalAmount,
    work_date: new Date().toISOString().slice(0, 10),
    status: "pending",
    description: `Install: ${jobTitle}\n${breakdown.join("\n")}`,
  }]);

  if (error) {
    console.error("Contractor pay entry error:", error);
    return { created: false, reason: error.message };
  }

  return { created: true, amount: totalAmount, breakdown, windowCount: completedWindows.length };
}
