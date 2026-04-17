// ── Automated Rule Processing + Stuck Lead Detection ─────────
// GET /api/cron/process-automation
//
// Runs all enabled automation rules for all companies,
// checks for stuck leads, and processes the automation queue.
//
// Called via Vercel Cron daily at 8am (same schedule as reminders).
// Can also be hit manually for testing.

import { NextRequest, NextResponse } from "next/server";
import { processAutomationRules, checkStuckLeads, processQueue, getServiceClient } from "../../../../lib/automation";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not set" }, { status: 500 });
  }

  const results: Record<string, any> = {};

  try {
    // 1. Process all automation rules
    console.log("[cron/automation] Processing automation rules...");
    await processAutomationRules();
    results.rules = "processed";
  } catch (err) {
    console.error("[cron/automation] Rules error:", err);
    results.rules = `error: ${err instanceof Error ? err.message : String(err)}`;
  }

  try {
    // 2. Check stuck leads for all companies
    console.log("[cron/automation] Checking stuck leads...");
    const supabase = getServiceClient();

    const { data: companies } = await supabase
      .from("companies")
      .select("id")
      .limit(1000);

    let stuckChecked = 0;
    for (const company of companies || []) {
      await checkStuckLeads(company.id, supabase);
      stuckChecked++;
    }
    results.stuckLeads = `checked ${stuckChecked} companies`;
  } catch (err) {
    console.error("[cron/automation] Stuck leads error:", err);
    results.stuckLeads = `error: ${err instanceof Error ? err.message : String(err)}`;
  }

  try {
    // 3. Process automation queue
    console.log("[cron/automation] Processing queue...");
    const supabase = getServiceClient();
    await processQueue(supabase);
    results.queue = "processed";
  } catch (err) {
    console.error("[cron/automation] Queue error:", err);
    results.queue = `error: ${err instanceof Error ? err.message : String(err)}`;
  }

  return NextResponse.json({ ok: true, ...results });
}
