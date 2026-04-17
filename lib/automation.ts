// ── ZeroRemake Automation Engine ────────────────────────────────
// Server-side automation processing for rules, triggers, and actions.
// Uses Supabase service role client for database access (bypasses RLS).
//
// Required env vars:
//   SUPABASE_SERVICE_ROLE_KEY — for service role access
//   NEXT_PUBLIC_SUPABASE_URL — Supabase project URL
//   All email env vars (RESEND_API_KEY, EMAIL_FROM_ADDRESS, etc.)

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { sendEmail, SendEmailParams, EmailType } from "./email";
import {
  appointmentConfirmation,
  appointmentReminder,
  quoteDelivery,
  installFollowup,
} from "./email-templates";

// ── Types ────────────────────────────────────────────────────

export type AutomationTriggerType = "time_elapsed" | "status_change";
export type AutomationActionType =
  | "send_email"
  | "create_task"
  | "update_field"
  | "create_activity"
  | "send_notification";
// EmailTemplateType is just EmailType from email.ts
type EmailTemplateType = EmailType;

export type AutomationRule = {
  id: string;
  company_id: string;
  name: string;
  description?: string;
  enabled: boolean;
  trigger_type: AutomationTriggerType;
  trigger_conditions: Record<string, any>; // JSONB
  action_type: AutomationActionType;
  action_config: Record<string, any>; // JSONB
  last_run_at?: string;
  run_count: number;
  created_at: string;
  updated_at: string;
};

export type AutomationLogEntry = {
  id: string;
  company_id: string;
  rule_id: string;
  rule_name: string;
  customer_id?: string;
  action_type: AutomationActionType;
  status: "success" | "failed" | "skipped";
  details?: string;
  created_at: string;
};

export type TriggerMatch = {
  customerId: string;
  context: Record<string, any>;
};

// ── Service Client ──────────────────────────────────────────

export function getServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required"
    );
  }

  return createClient(url, key);
}

// ── Main Entry Point ────────────────────────────────────────

/**
 * Process all enabled automation rules.
 * If companyId is provided, only process that company.
 * Otherwise, process all companies with automation_enabled=true.
 */
export async function processAutomationRules(
  companyId?: string
): Promise<void> {
  const supabase = getServiceClient();

  try {
    // Load companies to process
    let companiesQuery = supabase.from("companies").select("id, name");

    if (companyId) {
      companiesQuery = companiesQuery.eq("id", companyId);
    } else {
      // Check company_settings for automation_enabled flag
      // For now, process all companies
      companiesQuery = companiesQuery.limit(1000);
    }

    const { data: companies, error: companiesError } = await companiesQuery;

    if (companiesError) {
      console.error("[automation] Failed to load companies:", companiesError);
      return;
    }

    for (const company of companies || []) {
      await processCompanyRules(company.id, supabase);
    }
  } catch (err) {
    console.error("[automation] processAutomationRules error:", err);
  }
}

/**
 * Process all enabled automation rules for a specific company.
 */
async function processCompanyRules(
  companyId: string,
  supabase: SupabaseClient
): Promise<void> {
  try {
    // Load all enabled rules for this company
    const { data: rules, error } = await supabase
      .from("automation_rules")
      .select("*")
      .eq("company_id", companyId)
      .eq("enabled", true);

    if (error) {
      console.error(`[automation] Failed to load rules for ${companyId}:`, error);
      return;
    }

    for (const rule of rules || []) {
      await processRule(rule as AutomationRule, supabase);
    }
  } catch (err) {
    console.error(
      `[automation] processCompanyRules error for ${companyId}:`,
      err
    );
  }
}

/**
 * Process a single automation rule.
 */
async function processRule(
  rule: AutomationRule,
  supabase: SupabaseClient
): Promise<void> {
  try {
    // Evaluate trigger to find matching customers
    const matches = await evaluateTrigger(rule, supabase);

    if (matches.length === 0) {
      console.log(`[automation] No matches for rule "${rule.name}"`);
      return;
    }

    console.log(
      `[automation] Rule "${rule.name}" matched ${matches.length} customer(s)`
    );

    // Execute action for each match
    for (const match of matches) {
      await executeAction(rule, match.customerId, match.context, supabase);
    }

    // Update rule.last_run_at and increment run_count
    await supabase
      .from("automation_rules")
      .update({
        last_run_at: new Date().toISOString(),
        run_count: (rule.run_count || 0) + 1,
      })
      .eq("id", rule.id);
  } catch (err) {
    console.error(`[automation] Error processing rule "${rule.name}":`, err);
    await logAutomation(
      supabase,
      rule.company_id,
      rule.id,
      rule.name,
      undefined,
      rule.action_type,
      "failed",
      `Error: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

// ── Trigger Evaluation ──────────────────────────────────────

/**
 * Evaluate trigger conditions and return matching customers.
 * Supports:
 *   - time_elapsed: customers inactive for X days
 *   - status_change: customers in a status for X days
 */
async function evaluateTrigger(
  rule: AutomationRule,
  supabase: SupabaseClient
): Promise<TriggerMatch[]> {
  const { trigger_type, trigger_conditions } = rule;

  if (trigger_type === "time_elapsed") {
    return evaluateTimeElapsedTrigger(rule, supabase);
  } else if (trigger_type === "status_change") {
    return evaluateStatusChangeTrigger(rule, supabase);
  }

  console.warn(`[automation] Unknown trigger type: ${trigger_type}`);
  return [];
}

/**
 * Evaluate time_elapsed trigger.
 * Finds customers inactive for X days.
 */
async function evaluateTimeElapsedTrigger(
  rule: AutomationRule,
  supabase: SupabaseClient
): Promise<TriggerMatch[]> {
  const {
    company_id,
    trigger_conditions: {
      days_elapsed,
      lead_status_filter,
      heat_score_filter,
      exclude_opted_out,
    },
  } = rule;

  if (!days_elapsed) {
    console.warn(`[automation] time_elapsed trigger missing days_elapsed`);
    return [];
  }

  try {
    // Query customers
    let query = supabase
      .from("customers")
      .select("id, first_name, email, phone, lead_status, heat_score, last_activity_at, email_opted_out")
      .eq("company_id", company_id);

    // Optional: filter by lead_status
    if (lead_status_filter && Array.isArray(lead_status_filter)) {
      query = query.in("lead_status", lead_status_filter);
    }

    // Optional: filter by heat_score
    if (heat_score_filter && Array.isArray(heat_score_filter)) {
      query = query.in("heat_score", heat_score_filter);
    }

    // Exclude Installed and Lost
    query = query
      .not("lead_status", "in", '("Installed","Lost")')
      .order("id");

    const { data: customers, error } = await query;

    if (error) {
      console.error(
        `[automation] Failed to query customers for time_elapsed:`,
        error
      );
      return [];
    }

    const matches: TriggerMatch[] = [];
    const now = new Date();
    const cutoffMs = now.getTime() - days_elapsed * 24 * 60 * 60 * 1000;

    for (const customer of customers || []) {
      // Check if opted out (for email actions)
      if (exclude_opted_out && customer.email_opted_out) {
        continue;
      }

      // Check if inactive for X days
      if (customer.last_activity_at) {
        const activityMs = new Date(customer.last_activity_at).getTime();
        if (activityMs > cutoffMs) {
          continue; // Too recent, skip
        }
      }

      // Check deduplication: has this rule fired for this customer in last 7 days?
      const isDuplicate = await checkDuplicate(
        supabase,
        rule.id,
        customer.id,
        7
      );
      if (isDuplicate) {
        console.log(
          `[automation] Skipping ${customer.id} (duplicate within 7 days)`
        );
        continue;
      }

      matches.push({
        customerId: customer.id,
        context: {
          firstName: customer.first_name,
          email: customer.email,
          phone: customer.phone,
          leadStatus: customer.lead_status,
          heatScore: customer.heat_score,
          daysInactive: Math.floor(
            (now.getTime() - new Date(customer.last_activity_at).getTime()) /
              (24 * 60 * 60 * 1000)
          ),
        },
      });
    }

    return matches;
  } catch (err) {
    console.error(`[automation] evaluateTimeElapsedTrigger error:`, err);
    return [];
  }
}

/**
 * Evaluate status_change trigger.
 * Finds customers in a specific status for X days.
 */
async function evaluateStatusChangeTrigger(
  rule: AutomationRule,
  supabase: SupabaseClient
): Promise<TriggerMatch[]> {
  const {
    company_id,
    trigger_conditions: { target_status, after_days, exclude_opted_out },
  } = rule;

  if (!target_status || !after_days) {
    console.warn(
      `[automation] status_change trigger missing target_status or after_days`
    );
    return [];
  }

  try {
    let query = supabase
      .from("customers")
      .select("id, first_name, email, phone, lead_status, heat_score, last_activity_at, email_opted_out")
      .eq("company_id", company_id)
      .eq("lead_status", target_status)
      .not("lead_status", "in", '("Installed","Lost")')
      .order("id");

    const { data: customers, error } = await query;

    if (error) {
      console.error(
        `[automation] Failed to query customers for status_change:`,
        error
      );
      return [];
    }

    const matches: TriggerMatch[] = [];
    const now = new Date();
    const cutoffMs = now.getTime() - after_days * 24 * 60 * 60 * 1000;

    for (const customer of customers || []) {
      // Check if opted out
      if (exclude_opted_out && customer.email_opted_out) {
        continue;
      }

      // Check if in status for X days
      if (customer.last_activity_at) {
        const activityMs = new Date(customer.last_activity_at).getTime();
        if (activityMs > cutoffMs) {
          continue; // Too recent, skip
        }
      }

      // Check deduplication
      const isDuplicate = await checkDuplicate(
        supabase,
        rule.id,
        customer.id,
        7
      );
      if (isDuplicate) {
        continue;
      }

      matches.push({
        customerId: customer.id,
        context: {
          firstName: customer.first_name,
          email: customer.email,
          phone: customer.phone,
          leadStatus: customer.lead_status,
          heatScore: customer.heat_score,
          daysSinceStatusChange: Math.floor(
            (now.getTime() - new Date(customer.last_activity_at).getTime()) /
              (24 * 60 * 60 * 1000)
          ),
        },
      });
    }

    return matches;
  } catch (err) {
    console.error(`[automation] evaluateStatusChangeTrigger error:`, err);
    return [];
  }
}

/**
 * Check if this rule has already fired for this customer in the last N days.
 */
async function checkDuplicate(
  supabase: SupabaseClient,
  ruleId: string,
  customerId: string,
  withinDays: number
): Promise<boolean> {
  try {
    const cutoff = new Date(
      Date.now() - withinDays * 24 * 60 * 60 * 1000
    ).toISOString();

    const { data, error } = await supabase
      .from("automation_log")
      .select("id")
      .eq("rule_id", ruleId)
      .eq("customer_id", customerId)
      .eq("status", "success")
      .gte("created_at", cutoff)
      .limit(1);

    if (error) {
      console.warn(`[automation] checkDuplicate error:`, error);
      return false;
    }

    return (data?.length || 0) > 0;
  } catch (err) {
    console.warn(`[automation] checkDuplicate unexpected error:`, err);
    return false;
  }
}

// ── Action Execution ────────────────────────────────────────

/**
 * Execute the action for a matched customer.
 */
async function executeAction(
  rule: AutomationRule,
  customerId: string,
  context: Record<string, any>,
  supabase: SupabaseClient
): Promise<void> {
  const { action_type, action_config, company_id, id: rule_id, name: rule_name } = rule;

  try {
    let success = false;
    let details = "";

    if (action_type === "send_email") {
      ({ success, details } = await executeEmailAction(
        rule,
        customerId,
        context,
        supabase
      ));
    } else if (action_type === "create_task") {
      ({ success, details } = await executeCreateTaskAction(
        rule,
        customerId,
        context,
        supabase
      ));
    } else if (action_type === "update_field") {
      ({ success, details } = await executeUpdateFieldAction(
        rule,
        customerId,
        context,
        supabase
      ));
    } else if (action_type === "create_activity") {
      ({ success, details } = await executeCreateActivityAction(
        rule,
        customerId,
        context,
        supabase
      ));
    } else if (action_type === "send_notification") {
      ({ success, details } = await executeSendNotificationAction(
        rule,
        customerId,
        context,
        supabase
      ));
    } else {
      console.warn(`[automation] Unknown action type: ${action_type}`);
      details = `Unknown action type: ${action_type}`;
    }

    // Log the result
    await logAutomation(
      supabase,
      company_id,
      rule_id,
      rule_name,
      customerId,
      action_type,
      success ? "success" : "failed",
      details
    );
  } catch (err) {
    console.error(
      `[automation] executeAction error for rule "${rule_name}":`,
      err
    );
    await logAutomation(
      supabase,
      rule.company_id,
      rule.id,
      rule.name,
      customerId,
      rule.action_type,
      "failed",
      `Exception: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Execute send_email action.
 * Requires: template (or custom_subject + custom_body), email recipient
 */
async function executeEmailAction(
  rule: AutomationRule,
  customerId: string,
  context: Record<string, any>,
  supabase: SupabaseClient
): Promise<{ success: boolean; details: string }> {
  const { action_config, company_id } = rule;
  const { template, custom_subject, custom_body } = action_config;

  try {
    // Fetch customer
    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .select("id, first_name, email")
      .eq("id", customerId)
      .single();

    if (customerError || !customer?.email) {
      return {
        success: false,
        details: `Customer not found or no email: ${customerError?.message || "missing email"}`,
      };
    }

    // Fetch company settings
    const { data: settings } = await supabase
      .from("company_settings")
      .select("name, phone")
      .eq("company_id", company_id)
      .single();

    const companyName = settings?.name || "ZeroRemake";
    const companyPhone = settings?.phone;

    let subject = "";
    let html = "";

    // Use template or custom content
    if (template) {
      const templateResult = renderEmailTemplate(
        template as EmailTemplateType,
        customer.first_name,
        companyName,
        companyPhone,
        context
      );
      subject = templateResult.subject;
      html = templateResult.html;
    } else if (custom_subject && custom_body) {
      subject = replaceVars(custom_subject, {
        customer_name: customer.first_name,
        company_name: companyName,
        ...context,
      });
      html = replaceVars(custom_body, {
        customer_name: customer.first_name,
        company_name: companyName,
        ...context,
      });
    } else {
      return {
        success: false,
        details: "Template or custom_subject/custom_body required",
      };
    }

    // Send email
    const result = await sendEmail({
      to: customer.email,
      subject,
      html,
      type: (template as EmailType) || "custom",
      customerId,
      companyId: company_id,
    });

    if (!result.success) {
      return {
        success: false,
        details: `Email send failed: ${result.error}`,
      };
    }

    return {
      success: true,
      details: `Email sent to ${customer.email}`,
    };
  } catch (err) {
    return {
      success: false,
      details: `Exception: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Execute create_task action.
 * Requires: title (can include {{variable}})
 * Optional: due_days (days from now), description
 */
async function executeCreateTaskAction(
  rule: AutomationRule,
  customerId: string,
  context: Record<string, any>,
  supabase: SupabaseClient
): Promise<{ success: boolean; details: string }> {
  const { action_config, company_id } = rule;
  const { title, due_days } = action_config;

  if (!title) {
    return { success: false, details: "Task title required" };
  }

  try {
    const taskTitle = replaceVars(title, {
      customer_name: context.firstName || "Customer",
      ...context,
    });

    const dueDate = due_days
      ? new Date(Date.now() + due_days * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0]
      : null;

    const { error } = await supabase.from("tasks").insert({
      customer_id: customerId,
      company_id,
      title: taskTitle,
      due_date: dueDate,
      completed: false,
    });

    if (error) {
      return { success: false, details: `Task creation failed: ${error.message}` };
    }

    return { success: true, details: `Task created: "${taskTitle}"` };
  } catch (err) {
    return {
      success: false,
      details: `Exception: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Execute update_field action.
 * Requires: table, field, value
 */
async function executeUpdateFieldAction(
  rule: AutomationRule,
  customerId: string,
  context: Record<string, any>,
  supabase: SupabaseClient
): Promise<{ success: boolean; details: string }> {
  const { action_config, company_id } = rule;
  const { table, field, value } = action_config;

  if (!table || !field) {
    return { success: false, details: "table and field required" };
  }

  try {
    const updateValue = typeof value === "string" ? replaceVars(value, context) : value;

    // Simple validation: only allow certain tables
    const allowedTables = ["customers", "measure_jobs"];
    if (!allowedTables.includes(table)) {
      return { success: false, details: `Table not allowed: ${table}` };
    }

    const { error } = await supabase
      .from(table)
      .update({ [field]: updateValue })
      .eq("id", table === "customers" ? customerId : undefined);

    if (error) {
      return {
        success: false,
        details: `Update failed: ${error.message}`,
      };
    }

    return {
      success: true,
      details: `Updated ${table}.${field} = ${updateValue}`,
    };
  } catch (err) {
    return {
      success: false,
      details: `Exception: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Execute create_activity action.
 * Requires: type (call, text, email, note, visit), notes
 */
async function executeCreateActivityAction(
  rule: AutomationRule,
  customerId: string,
  context: Record<string, any>,
  supabase: SupabaseClient
): Promise<{ success: boolean; details: string }> {
  const { action_config, company_id } = rule;
  const { type, notes } = action_config;

  if (!type || !notes) {
    return { success: false, details: "type and notes required" };
  }

  try {
    const activityNotes = replaceVars(notes, {
      customer_name: context.firstName || "Customer",
      ...context,
    });

    const { error: activityError } = await supabase.from("activity_log").insert({
      customer_id: customerId,
      company_id,
      type,
      notes: activityNotes,
      created_by: "automation",
      created_at: new Date().toISOString(),
    });

    if (activityError) {
      return {
        success: false,
        details: `Activity creation failed: ${activityError.message}`,
      };
    }

    // Update customer.last_activity_at
    await supabase
      .from("customers")
      .update({ last_activity_at: new Date().toISOString() })
      .eq("id", customerId);

    return {
      success: true,
      details: `Activity logged: ${type}`,
    };
  } catch (err) {
    return {
      success: false,
      details: `Exception: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Execute send_notification action.
 * For now, just logs it (future: push notification).
 */
async function executeSendNotificationAction(
  rule: AutomationRule,
  customerId: string,
  context: Record<string, any>,
  supabase: SupabaseClient
): Promise<{ success: boolean; details: string }> {
  const { action_config } = rule;
  const { message } = action_config;

  if (!message) {
    return { success: false, details: "message required" };
  }

  try {
    const notificationMessage = replaceVars(message, context);
    console.log(
      `[automation] Notification for customer ${customerId}: ${notificationMessage}`
    );
    return {
      success: true,
      details: `Notification logged: ${notificationMessage}`,
    };
  } catch (err) {
    return {
      success: false,
      details: `Exception: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ── Email Template Rendering ────────────────────────────────

/**
 * Render an email template based on template type.
 */
function renderEmailTemplate(
  template: EmailTemplateType,
  customerFirstName: string,
  companyName: string,
  companyPhone: string | undefined,
  context: Record<string, any>
): { subject: string; html: string } {
  switch (template) {
    case "appointment_confirmation":
      return appointmentConfirmation({
        customerFirstName,
        appointmentType: context.appointmentType || "Appointment",
        scheduledAt: context.scheduledAt || new Date().toISOString(),
        durationMinutes: context.durationMinutes || 60,
        address: context.address,
        companyName,
        companyPhone,
      });

    case "appointment_reminder":
      return appointmentReminder({
        customerFirstName,
        appointmentType: context.appointmentType || "Appointment",
        scheduledAt: context.scheduledAt || new Date().toISOString(),
        address: context.address,
        companyName,
        companyPhone,
      });

    case "quote_delivery":
      return quoteDelivery({
        customerFirstName,
        quoteNumber: context.quoteNumber || "000",
        quoteId: context.quoteId || "",
        totalAmount: context.totalAmount || "$0.00",
        validDays: context.validDays || 30,
        companyName,
        companyPhone,
      });

    case "install_followup":
      return installFollowup({
        customerFirstName,
        companyName,
        googleReviewLink: context.googleReviewLink,
      });

    case "custom":
      // For custom emails, caller should provide custom_subject/custom_body in action_config
      return {
        subject: "Message from " + companyName,
        html: `<h1>Message</h1><p>Hi ${customerFirstName},</p><p>Custom email template.</p>`,
      };

    default:
      return {
        subject: "Message from " + companyName,
        html: `<h1>Message</h1><p>Hi ${customerFirstName},</p><p>No template rendered.</p>`,
      };
  }
}

// ── Variable Replacement ────────────────────────────────────

/**
 * Replace {{variable}} placeholders in a template string.
 */
export function replaceVars(
  template: string,
  vars: Record<string, any>
): string {
  let result = template;

  for (const [key, value] of Object.entries(vars)) {
    const placeholder = `{{${key}}}`;
    result = result.replace(
      new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
      String(value || "")
    );
  }

  return result;
}

// ── Stuck Lead Detection ────────────────────────────────────

/**
 * Check for stuck leads and create follow-up tasks.
 * Stuck = no activity for X days based on heat score thresholds.
 */
export async function checkStuckLeads(
  companyId: string,
  supabase: SupabaseClient
): Promise<void> {
  try {
    // Fetch company thresholds (use defaults if not set)
    const { data: settings } = await supabase
      .from("company_settings")
      .select("*")
      .eq("company_id", companyId)
      .single();

    const thresholds = {
      hot: 5,
      warm: 14,
      cold: 30,
    };

    // Query customers not in Installed or Lost status
    const { data: customers, error } = await supabase
      .from("customers")
      .select("id, first_name, last_name, heat_score, last_activity_at")
      .eq("company_id", companyId)
      .not("lead_status", "in", '("Installed","Lost")')
      .order("id");

    if (error) {
      console.error(`[automation] Failed to check stuck leads:`, error);
      return;
    }

    const now = new Date();

    for (const customer of customers || []) {
      const threshold =
        thresholds[customer.heat_score?.toLowerCase() as keyof typeof thresholds] ||
        14;
      const cutoffMs = now.getTime() - threshold * 24 * 60 * 60 * 1000;

      if (customer.last_activity_at) {
        const activityMs = new Date(customer.last_activity_at).getTime();
        if (activityMs > cutoffMs) {
          continue; // Not stuck
        }
      }

      // Calculate days stuck
      const daysSinceLast = customer.last_activity_at
        ? Math.floor(
            (now.getTime() - new Date(customer.last_activity_at).getTime()) /
              (24 * 60 * 60 * 1000)
          )
        : 999;

      // Check if we already created a task for this stuck lead
      const { data: existingTasks } = await supabase
        .from("tasks")
        .select("id")
        .eq("customer_id", customer.id)
        .like("title", `%Follow up:%${customer.first_name}%stuck%`)
        .eq("completed", false)
        .limit(1);

      if ((existingTasks?.length || 0) > 0) {
        continue; // Task already exists
      }

      // Create task
      const fullName = [customer.first_name, customer.last_name]
        .filter(Boolean)
        .join(" ");
      const taskTitle = `Follow up: ${fullName} stuck ${daysSinceLast} days`;

      await supabase.from("tasks").insert({
        customer_id: customer.id,
        company_id: companyId,
        title: taskTitle,
        due_date: new Date().toISOString().split("T")[0],
        completed: false,
      });

      // Log to automation_log
      await logAutomation(
        supabase,
        companyId,
        "stuck-lead-check",
        "Stuck Lead Detection",
        customer.id,
        "create_task",
        "success",
        `Created task: ${taskTitle}`
      );
    }
  } catch (err) {
    console.error(`[automation] checkStuckLeads error:`, err);
  }
}

// ── Automation Logging ──────────────────────────────────────

/**
 * Log an automation action to the automation_log table.
 */
async function logAutomation(
  supabase: SupabaseClient,
  companyId: string,
  ruleId: string,
  ruleName: string,
  customerId: string | undefined,
  actionType: AutomationActionType,
  status: "success" | "failed" | "skipped",
  details?: string
): Promise<void> {
  try {
    await supabase.from("automation_log").insert({
      company_id: companyId,
      rule_id: ruleId,
      rule_name: ruleName,
      customer_id: customerId || null,
      action_type: actionType,
      status,
      details: details || null,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[automation] Failed to log automation:", err);
  }
}

// ── Queue Processing ────────────────────────────────────────

/**
 * Process automation_queue items that are ready to fire.
 * Finds items where fire_at <= now() and status = 'pending'.
 */
export async function processQueue(supabase: SupabaseClient): Promise<void> {
  try {
    const now = new Date().toISOString();

    // Find pending items ready to fire
    const { data: items, error } = await supabase
      .from("automation_queue")
      .select("*")
      .eq("status", "pending")
      .lte("fire_at", now)
      .limit(100);

    if (error) {
      console.error(`[automation] Failed to load queue items:`, error);
      return;
    }

    for (const item of items || []) {
      try {
        // TODO: execute the queued action based on item.action_type and item.action_config
        console.log(`[automation] Firing queued item ${item.id}`);

        // Mark as fired
        await supabase
          .from("automation_queue")
          .update({ status: "fired" })
          .eq("id", item.id);
      } catch (err) {
        console.error(`[automation] Error processing queue item ${item.id}:`, err);
        await supabase
          .from("automation_queue")
          .update({ status: "failed", error: String(err) })
          .eq("id", item.id);
      }
    }
  } catch (err) {
    console.error(`[automation] processQueue error:`, err);
  }
}

