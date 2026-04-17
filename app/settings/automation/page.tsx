"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../auth-provider";
import { PermissionGate } from "../../permission-gate";
import { FeatureGate } from "../../feature-gate";

// ── Types ──────────────────────────────────────────────────────
type Rule = {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  trigger_type: string;
  trigger_conditions: Record<string, any>;
  action_type: string;
  action_config: Record<string, any>;
  last_run_at: string | null;
  run_count: number;
  created_at: string;
};

type LogEntry = {
  id: string;
  rule_name: string;
  customer_id: string | null;
  action_type: string;
  status: "success" | "failed" | "skipped";
  details: string | null;
  created_at: string;
};

// ── Constants ──────────────────────────────────────────────────
const TRIGGER_TYPES = [
  { value: "time_elapsed", label: "Time Elapsed", desc: "Customer inactive for X days" },
  { value: "status_change", label: "Status Duration", desc: "Customer in a status for X days" },
];

const ACTION_TYPES = [
  { value: "send_email", label: "Send Email", icon: "📧" },
  { value: "create_task", label: "Create Task", icon: "✅" },
  { value: "update_field", label: "Update Field", icon: "✏️" },
  { value: "create_activity", label: "Log Activity", icon: "📋" },
  { value: "send_notification", label: "Send Notification", icon: "🔔" },
];

const LEAD_STATUSES = [
  "New", "Contacted", "Scheduled", "Measured", "Quoted", "Sold", "Installed", "Lost", "On Hold", "Waiting",
];

const HEAT_SCORES = ["Hot", "Warm", "Cold"];

const EMAIL_TEMPLATES = [
  { value: "quote_delivery", label: "Quote Delivery" },
  { value: "install_followup", label: "Install Follow-Up" },
  { value: "appointment_reminder", label: "Appointment Reminder" },
  { value: "custom", label: "Custom Email" },
];

const ACTIVITY_TYPES = ["Call", "Text", "Email", "Note", "Visit"];

// ── Preset Rules ───────────────────────────────────────────────
const PRESET_RULES = [
  {
    name: "Follow up on sent quotes (3 days)",
    description: "When a customer has been in Quoted status for 3+ days, create a follow-up task",
    trigger_type: "status_change",
    trigger_conditions: { target_status: "Quoted", after_days: 3, exclude_opted_out: true },
    action_type: "create_task",
    action_config: { title: "Follow up: {{customer_name}} — quote sent 3 days ago", due_days: 0 },
  },
  {
    name: "Hot lead going cold (5 days inactive)",
    description: "When a Hot lead has no activity for 5 days, downgrade to Warm and create task",
    trigger_type: "time_elapsed",
    trigger_conditions: { days_elapsed: 5, heat_score_filter: ["Hot"], exclude_opted_out: false },
    action_type: "create_task",
    action_config: { title: "URGENT: {{customer_name}} (Hot) going cold — {{daysInactive}} days inactive", due_days: 0 },
  },
  {
    name: "New lead not contacted (2 days)",
    description: "When a new lead hasn't been contacted in 2 days, create an urgent task",
    trigger_type: "status_change",
    trigger_conditions: { target_status: "New", after_days: 2, exclude_opted_out: false },
    action_type: "create_task",
    action_config: { title: "Contact new lead: {{customer_name}} — waiting {{daysSinceStatusChange}} days", due_days: 0 },
  },
  {
    name: "Post-install follow-up email",
    description: "Send a thank-you email after installation is complete",
    trigger_type: "status_change",
    trigger_conditions: { target_status: "Installed", after_days: 1, exclude_opted_out: true },
    action_type: "send_email",
    action_config: { template: "install_followup" },
  },
  {
    name: "Warm lead reminder (14 days inactive)",
    description: "Create a task when warm leads go 14 days without activity",
    trigger_type: "time_elapsed",
    trigger_conditions: { days_elapsed: 14, heat_score_filter: ["Warm"], exclude_opted_out: false },
    action_type: "create_task",
    action_config: { title: "Re-engage: {{customer_name}} (Warm) — {{daysInactive}} days inactive", due_days: 1 },
  },
];

// ── Rule Editor Modal ──────────────────────────────────────────
function RuleEditorModal({ open, onClose, onSaved, editRule }: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editRule: Rule | null;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [triggerType, setTriggerType] = useState("time_elapsed");
  const [triggerConditions, setTriggerConditions] = useState<Record<string, any>>({
    days_elapsed: 7,
    exclude_opted_out: true,
  });
  const [actionType, setActionType] = useState("create_task");
  const [actionConfig, setActionConfig] = useState<Record<string, any>>({
    title: "Follow up with {{customer_name}}",
    due_days: 1,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editRule) {
      setName(editRule.name);
      setDescription(editRule.description || "");
      setTriggerType(editRule.trigger_type);
      setTriggerConditions(editRule.trigger_conditions);
      setActionType(editRule.action_type);
      setActionConfig(editRule.action_config);
    } else {
      setName("");
      setDescription("");
      setTriggerType("time_elapsed");
      setTriggerConditions({ days_elapsed: 7, exclude_opted_out: true });
      setActionType("create_task");
      setActionConfig({ title: "Follow up with {{customer_name}}", due_days: 1 });
    }
  }, [editRule, open]);

  function updateTrigger(key: string, value: any) {
    setTriggerConditions(prev => ({ ...prev, [key]: value }));
  }

  function updateAction(key: string, value: any) {
    setActionConfig(prev => ({ ...prev, [key]: value }));
  }

  async function save() {
    if (!name.trim()) return;
    setSaving(true);

    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      trigger_type: triggerType,
      trigger_conditions: triggerConditions,
      action_type: actionType,
      action_config: actionConfig,
      enabled: true,
    };

    if (editRule) {
      await supabase.from("automation_rules").update(payload).eq("id", editRule.id);
    } else {
      await supabase.from("automation_rules").insert(payload);
    }

    setSaving(false);
    onSaved();
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }}
        className="rounded-lg max-w-lg w-full p-5 space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <h2 className="font-bold text-lg">{editRule ? "Edit Rule" : "Create Automation Rule"}</h2>

        {/* Name */}
        <div>
          <label className="text-xs font-medium block mb-1">Rule Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Follow up on sent quotes"
            style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }}
            className="w-full rounded p-2 text-sm"
          />
        </div>

        <div>
          <label className="text-xs font-medium block mb-1">Description (optional)</label>
          <input
            type="text"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="What does this rule do?"
            style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }}
            className="w-full rounded p-2 text-sm"
          />
        </div>

        {/* Trigger */}
        <div className="rounded p-3 space-y-3" style={{ background: "var(--zr-surface-2)" }}>
          <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--zr-text-secondary)" }}>
            IF (Trigger)
          </h3>

          <div>
            <label className="text-xs font-medium block mb-1">Trigger Type</label>
            <select
              value={triggerType}
              onChange={e => setTriggerType(e.target.value)}
              style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }}
              className="w-full rounded p-2 text-sm"
            >
              {TRIGGER_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label} — {t.desc}</option>
              ))}
            </select>
          </div>

          {triggerType === "time_elapsed" && (
            <>
              <div>
                <label className="text-xs font-medium block mb-1">Days Inactive</label>
                <input
                  type="number"
                  value={triggerConditions.days_elapsed || 7}
                  onChange={e => updateTrigger("days_elapsed", parseInt(e.target.value) || 7)}
                  min={1}
                  style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }}
                  className="w-full rounded p-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1">Filter by Lead Status (optional)</label>
                <div className="flex flex-wrap gap-1.5">
                  {LEAD_STATUSES.filter(s => !["Installed", "Lost"].includes(s)).map(status => {
                    const selected = (triggerConditions.lead_status_filter || []).includes(status);
                    return (
                      <button
                        key={status}
                        onClick={() => {
                          const current = triggerConditions.lead_status_filter || [];
                          const updated = selected ? current.filter((s: string) => s !== status) : [...current, status];
                          updateTrigger("lead_status_filter", updated.length > 0 ? updated : undefined);
                        }}
                        className="text-xs rounded px-2 py-1"
                        style={{
                          background: selected ? "var(--zr-orange)" : "var(--zr-surface-1)",
                          color: selected ? "#fff" : "var(--zr-text-primary)",
                          border: "1px solid var(--zr-border)",
                        }}
                      >
                        {status}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium block mb-1">Filter by Heat Score (optional)</label>
                <div className="flex gap-2">
                  {HEAT_SCORES.map(score => {
                    const selected = (triggerConditions.heat_score_filter || []).includes(score);
                    return (
                      <button
                        key={score}
                        onClick={() => {
                          const current = triggerConditions.heat_score_filter || [];
                          const updated = selected ? current.filter((s: string) => s !== score) : [...current, score];
                          updateTrigger("heat_score_filter", updated.length > 0 ? updated : undefined);
                        }}
                        className="text-xs rounded px-3 py-1"
                        style={{
                          background: selected ? "var(--zr-orange)" : "var(--zr-surface-1)",
                          color: selected ? "#fff" : "var(--zr-text-primary)",
                          border: "1px solid var(--zr-border)",
                        }}
                      >
                        {score}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {triggerType === "status_change" && (
            <>
              <div>
                <label className="text-xs font-medium block mb-1">Target Status</label>
                <select
                  value={triggerConditions.target_status || ""}
                  onChange={e => updateTrigger("target_status", e.target.value)}
                  style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }}
                  className="w-full rounded p-2 text-sm"
                >
                  <option value="">-- Select status --</option>
                  {LEAD_STATUSES.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium block mb-1">After Days in Status</label>
                <input
                  type="number"
                  value={triggerConditions.after_days || 3}
                  onChange={e => updateTrigger("after_days", parseInt(e.target.value) || 3)}
                  min={1}
                  style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }}
                  className="w-full rounded p-2 text-sm"
                />
              </div>
            </>
          )}

          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={triggerConditions.exclude_opted_out || false}
              onChange={e => updateTrigger("exclude_opted_out", e.target.checked)}
            />
            Skip customers who opted out of emails
          </label>
        </div>

        {/* Action */}
        <div className="rounded p-3 space-y-3" style={{ background: "var(--zr-surface-2)" }}>
          <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--zr-text-secondary)" }}>
            THEN (Action)
          </h3>

          <div>
            <label className="text-xs font-medium block mb-1">Action Type</label>
            <select
              value={actionType}
              onChange={e => {
                setActionType(e.target.value);
                // Reset config for new type
                if (e.target.value === "create_task") setActionConfig({ title: "Follow up with {{customer_name}}", due_days: 1 });
                else if (e.target.value === "send_email") setActionConfig({ template: "custom", custom_subject: "", custom_body: "" });
                else if (e.target.value === "update_field") setActionConfig({ table: "customers", field: "heat_score", value: "Cold" });
                else if (e.target.value === "create_activity") setActionConfig({ type: "Note", notes: "Auto: {{customer_name}}" });
                else if (e.target.value === "send_notification") setActionConfig({ message: "{{customer_name}} needs attention" });
              }}
              style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }}
              className="w-full rounded p-2 text-sm"
            >
              {ACTION_TYPES.map(a => (
                <option key={a.value} value={a.value}>{a.icon} {a.label}</option>
              ))}
            </select>
          </div>

          {actionType === "create_task" && (
            <>
              <div>
                <label className="text-xs font-medium block mb-1">Task Title</label>
                <input
                  type="text"
                  value={actionConfig.title || ""}
                  onChange={e => updateAction("title", e.target.value)}
                  placeholder="Follow up with {{customer_name}}"
                  style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }}
                  className="w-full rounded p-2 text-sm"
                />
                <p className="text-xs mt-1" style={{ color: "var(--zr-text-secondary)" }}>
                  Variables: {"{{customer_name}}"}, {"{{daysInactive}}"}, {"{{leadStatus}}"}
                </p>
              </div>
              <div>
                <label className="text-xs font-medium block mb-1">Due in (days)</label>
                <input
                  type="number"
                  value={actionConfig.due_days ?? 1}
                  onChange={e => updateAction("due_days", parseInt(e.target.value) || 0)}
                  min={0}
                  style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }}
                  className="w-full rounded p-2 text-sm"
                />
              </div>
            </>
          )}

          {actionType === "send_email" && (
            <>
              <div>
                <label className="text-xs font-medium block mb-1">Email Template</label>
                <select
                  value={actionConfig.template || "custom"}
                  onChange={e => updateAction("template", e.target.value)}
                  style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }}
                  className="w-full rounded p-2 text-sm"
                >
                  {EMAIL_TEMPLATES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              {actionConfig.template === "custom" && (
                <>
                  <div>
                    <label className="text-xs font-medium block mb-1">Subject</label>
                    <input
                      type="text"
                      value={actionConfig.custom_subject || ""}
                      onChange={e => updateAction("custom_subject", e.target.value)}
                      placeholder="Following up — {{company_name}}"
                      style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }}
                      className="w-full rounded p-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium block mb-1">Body (HTML)</label>
                    <textarea
                      value={actionConfig.custom_body || ""}
                      onChange={e => updateAction("custom_body", e.target.value)}
                      placeholder="<p>Hi {{customer_name}}, just checking in...</p>"
                      rows={4}
                      style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }}
                      className="w-full rounded p-2 text-sm resize-none"
                    />
                  </div>
                </>
              )}
            </>
          )}

          {actionType === "update_field" && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium block mb-1">Field</label>
                  <select
                    value={actionConfig.field || "heat_score"}
                    onChange={e => updateAction("field", e.target.value)}
                    style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }}
                    className="w-full rounded p-2 text-sm"
                  >
                    <option value="heat_score">Heat Score</option>
                    <option value="lead_status">Lead Status</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1">New Value</label>
                  {actionConfig.field === "heat_score" ? (
                    <select
                      value={actionConfig.value || "Cold"}
                      onChange={e => updateAction("value", e.target.value)}
                      style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }}
                      className="w-full rounded p-2 text-sm"
                    >
                      {HEAT_SCORES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  ) : (
                    <select
                      value={actionConfig.value || "Lost"}
                      onChange={e => updateAction("value", e.target.value)}
                      style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }}
                      className="w-full rounded p-2 text-sm"
                    >
                      {LEAD_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  )}
                </div>
              </div>
              <input type="hidden" value="customers" onChange={() => {}} />
            </>
          )}

          {actionType === "create_activity" && (
            <>
              <div>
                <label className="text-xs font-medium block mb-1">Activity Type</label>
                <select
                  value={actionConfig.type || "Note"}
                  onChange={e => updateAction("type", e.target.value)}
                  style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }}
                  className="w-full rounded p-2 text-sm"
                >
                  {ACTIVITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium block mb-1">Notes</label>
                <input
                  type="text"
                  value={actionConfig.notes || ""}
                  onChange={e => updateAction("notes", e.target.value)}
                  placeholder="Auto: {{customer_name}} marked cold"
                  style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }}
                  className="w-full rounded p-2 text-sm"
                />
              </div>
            </>
          )}

          {actionType === "send_notification" && (
            <div>
              <label className="text-xs font-medium block mb-1">Message</label>
              <input
                type="text"
                value={actionConfig.message || ""}
                onChange={e => updateAction("message", e.target.value)}
                placeholder="{{customer_name}} needs attention — {{daysInactive}} days inactive"
                style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }}
                className="w-full rounded p-2 text-sm"
              />
            </div>
          )}
        </div>

        {/* Save/Cancel */}
        <div className="flex gap-2 pt-2">
          <button
            onClick={onClose}
            style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)" }}
            className="flex-1 rounded p-2 text-sm font-medium hover:opacity-80"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!name.trim() || saving}
            style={{ background: "var(--zr-orange)" }}
            className="flex-1 rounded p-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving..." : editRule ? "Update Rule" : "Create Rule"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────
export default function AutomationPage() {
  const { role } = useAuth();
  const [rules, setRules] = useState<Rule[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [activeTab, setActiveTab] = useState<"rules" | "log">("rules");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [rulesRes, logsRes] = await Promise.all([
      supabase.from("automation_rules").select("*").order("created_at", { ascending: false }),
      supabase.from("automation_log").select("*").order("created_at", { ascending: false }).limit(50),
    ]);
    setRules(rulesRes.data || []);
    setLogs(logsRes.data || []);
    setLoading(false);
  }

  async function toggleRule(id: string, enabled: boolean) {
    await supabase.from("automation_rules").update({ enabled: !enabled }).eq("id", id);
    load();
  }

  async function deleteRule(id: string) {
    if (!confirm("Delete this automation rule?")) return;
    await supabase.from("automation_rules").delete().eq("id", id);
    load();
  }

  async function addPreset(preset: typeof PRESET_RULES[0]) {
    await supabase.from("automation_rules").insert({
      name: preset.name,
      description: preset.description,
      trigger_type: preset.trigger_type,
      trigger_conditions: preset.trigger_conditions,
      action_type: preset.action_type,
      action_config: preset.action_config,
      enabled: true,
    });
    load();
  }

  function openEditor(rule?: Rule) {
    setEditingRule(rule || null);
    setEditorOpen(true);
  }

  function getTriggerSummary(rule: Rule) {
    const tc = rule.trigger_conditions;
    if (rule.trigger_type === "time_elapsed") {
      const filters = [];
      if (tc.lead_status_filter?.length) filters.push(`status: ${tc.lead_status_filter.join(", ")}`);
      if (tc.heat_score_filter?.length) filters.push(`heat: ${tc.heat_score_filter.join(", ")}`);
      return `Inactive ${tc.days_elapsed || "?"} days${filters.length ? ` (${filters.join("; ")})` : ""}`;
    }
    if (rule.trigger_type === "status_change") {
      return `In "${tc.target_status}" for ${tc.after_days || "?"} days`;
    }
    return rule.trigger_type;
  }

  function getActionSummary(rule: Rule) {
    const ac = rule.action_config;
    const info = ACTION_TYPES.find(a => a.value === rule.action_type);
    if (rule.action_type === "create_task") return `${info?.icon} Create task: "${ac.title || "..."}"`;
    if (rule.action_type === "send_email") return `${info?.icon} Send ${ac.template || "custom"} email`;
    if (rule.action_type === "update_field") return `${info?.icon} Set ${ac.field} = ${ac.value}`;
    if (rule.action_type === "create_activity") return `${info?.icon} Log ${ac.type}: "${ac.notes || "..."}"`;
    if (rule.action_type === "send_notification") return `${info?.icon} Notify: "${ac.message || "..."}"`;
    return `${info?.icon || ""} ${info?.label || rule.action_type}`;
  }

  // Check which presets are already added
  const existingNames = new Set(rules.map(r => r.name));
  const availablePresets = PRESET_RULES.filter(p => !existingNames.has(p.name));

  return (
    <FeatureGate require="automation">
      <PermissionGate require="access_settings">
        <main style={{ background: "var(--zr-black)", color: "var(--zr-text-primary)" }} className="min-h-screen p-4 text-sm">
          <div className="mx-auto max-w-2xl space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold">Automations</h1>
                <p className="text-xs mt-1" style={{ color: "var(--zr-text-secondary)" }}>
                  Set up rules that automatically create tasks, send emails, and update leads.
                </p>
              </div>
              <Link href="/settings" className="text-xs hover:underline" style={{ color: "var(--zr-orange)" }}>
                ← Settings
              </Link>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b" style={{ borderColor: "var(--zr-border)" }}>
              {(["rules", "log"] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className="px-3 py-2 text-sm font-medium border-b-2"
                  style={{
                    borderBottomColor: activeTab === tab ? "var(--zr-orange)" : "transparent",
                    color: activeTab === tab ? "var(--zr-orange)" : "var(--zr-text-secondary)",
                  }}
                >
                  {tab === "rules" ? `Rules (${rules.length})` : `Activity Log (${logs.length})`}
                </button>
              ))}
            </div>

            {loading ? (
              <p style={{ color: "var(--zr-text-secondary)" }}>Loading…</p>
            ) : activeTab === "rules" ? (
              <>
                {/* Create button */}
                <button
                  onClick={() => openEditor()}
                  style={{ background: "var(--zr-orange)" }}
                  className="w-full rounded p-2 text-sm font-medium text-white hover:opacity-90"
                >
                  Create Custom Rule
                </button>

                {/* Preset suggestions */}
                {availablePresets.length > 0 && (
                  <div style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }} className="rounded-lg p-4">
                    <h3 className="text-xs font-semibold mb-2" style={{ color: "var(--zr-text-secondary)" }}>
                      SUGGESTED AUTOMATIONS
                    </h3>
                    <div className="space-y-2">
                      {availablePresets.map((preset, i) => (
                        <div key={i} className="flex items-center justify-between gap-3 text-xs">
                          <div className="min-w-0">
                            <p className="font-medium truncate">{preset.name}</p>
                            <p className="truncate" style={{ color: "var(--zr-text-secondary)" }}>{preset.description}</p>
                          </div>
                          <button
                            onClick={() => addPreset(preset)}
                            className="shrink-0 rounded px-2 py-1 text-xs font-medium hover:opacity-80"
                            style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)" }}
                          >
                            + Add
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Rules list */}
                {rules.length === 0 ? (
                  <p style={{ color: "var(--zr-text-secondary)" }}>No automation rules yet. Create one or add a suggested preset above.</p>
                ) : (
                  <div className="space-y-2">
                    {rules.map(rule => (
                      <div
                        key={rule.id}
                        style={{
                          background: "var(--zr-surface-1)",
                          border: rule.enabled ? "1px solid var(--zr-orange)" : "1px solid var(--zr-border)",
                          opacity: rule.enabled ? 1 : 0.6,
                        }}
                        className="rounded-lg p-3 space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="font-medium truncate">{rule.name}</p>
                              {!rule.enabled && (
                                <span className="text-xs rounded px-1.5 py-0.5 bg-gray-100 text-gray-500">Paused</span>
                              )}
                            </div>
                            {rule.description && (
                              <p className="text-xs truncate mt-0.5" style={{ color: "var(--zr-text-secondary)" }}>
                                {rule.description}
                              </p>
                            )}
                          </div>
                          <button
                            onClick={() => toggleRule(rule.id, rule.enabled)}
                            className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${rule.enabled ? "" : "bg-gray-300"}`}
                            style={rule.enabled ? { background: "var(--zr-orange)" } : {}}
                          >
                            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${rule.enabled ? "translate-x-5" : "translate-x-0.5"}`} />
                          </button>
                        </div>

                        <div className="text-xs space-y-1" style={{ color: "var(--zr-text-secondary)" }}>
                          <p><span className="font-medium" style={{ color: "var(--zr-text-primary)" }}>IF:</span> {getTriggerSummary(rule)}</p>
                          <p><span className="font-medium" style={{ color: "var(--zr-text-primary)" }}>THEN:</span> {getActionSummary(rule)}</p>
                        </div>

                        <div className="flex items-center justify-between pt-1">
                          <div className="text-xs" style={{ color: "var(--zr-text-secondary)" }}>
                            {rule.run_count > 0 ? `Ran ${rule.run_count}x` : "Never ran"}
                            {rule.last_run_at && ` · Last: ${new Date(rule.last_run_at).toLocaleDateString()}`}
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => openEditor(rule)}
                              className="text-xs hover:underline"
                              style={{ color: "var(--zr-orange)" }}
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => deleteRule(rule.id)}
                              className="text-xs text-red-500 hover:underline"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              /* Activity Log Tab */
              <>
                {logs.length === 0 ? (
                  <p style={{ color: "var(--zr-text-secondary)" }}>No automation activity yet. Rules run daily at 8am.</p>
                ) : (
                  <div className="space-y-1">
                    {logs.map(log => {
                      const statusColors: Record<string, { bg: string; text: string }> = {
                        success: { bg: "bg-green-100", text: "text-green-700" },
                        failed: { bg: "bg-red-100", text: "text-red-700" },
                        skipped: { bg: "bg-gray-100", text: "text-gray-500" },
                      };
                      const sc = statusColors[log.status] || statusColors.skipped;
                      const actionInfo = ACTION_TYPES.find(a => a.value === log.action_type);
                      return (
                        <div
                          key={log.id}
                          style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }}
                          className="rounded p-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span>{actionInfo?.icon || "⚙️"}</span>
                                <span className="font-medium text-xs truncate">{log.rule_name}</span>
                                <span className={`text-xs rounded px-1.5 py-0.5 ${sc.bg} ${sc.text}`}>
                                  {log.status}
                                </span>
                              </div>
                              {log.details && (
                                <p className="text-xs mt-1 truncate" style={{ color: "var(--zr-text-secondary)" }}>
                                  {log.details}
                                </p>
                              )}
                            </div>
                            <span className="text-xs shrink-0" style={{ color: "var(--zr-text-secondary)" }}>
                              {new Date(log.created_at).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* Info box */}
            <div className="rounded-lg p-4 text-xs" style={{ background: "var(--zr-surface-2)", color: "var(--zr-text-secondary)" }}>
              <p className="font-semibold mb-1" style={{ color: "var(--zr-text-primary)" }}>How automations work</p>
              <p>
                Rules are evaluated once daily at 8am. Each rule checks a trigger condition (like &quot;customer inactive for 7 days&quot;) and executes an action (like creating a task or sending an email).
                Rules won&apos;t fire for the same customer more than once per week to prevent spam.
                Stuck lead detection also runs daily — it creates follow-up tasks based on your heat score thresholds.
              </p>
            </div>
          </div>

          <RuleEditorModal
            open={editorOpen}
            onClose={() => { setEditorOpen(false); setEditingRule(null); }}
            onSaved={load}
            editRule={editingRule}
          />
        </main>
      </PermissionGate>
    </FeatureGate>
  );
}
