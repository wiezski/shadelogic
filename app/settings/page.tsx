"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../auth-provider";
import { PermissionGate } from "../permission-gate";
import { PLAN_LABELS, PLAN_FEATURES, FEATURE_LABELS, type Plan, type FeatureKey } from "../../lib/features";
import { ROLES, ROLE_LABELS, ROLE_DEFAULTS, PERM_LABELS, resolvePermissions, type Role, type PermKey } from "../../lib/permissions";

type Settings = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  notify_on_shipped: boolean;
  notify_on_delivered: boolean;
  notify_channel: string;
  zip: string | null;
  website: string | null;
  license_number: string | null;
  tagline: string | null;
  google_review_link: string | null;
  default_deposit_pct: number;
  default_markup: number;
  default_quote_days: number;
};

// ── Plan & Features ───────────────────────────────────────────

function PlanSection() {
  const { companyId, plan, features, role } = useAuth();
  const [trialEnds, setTrialEnds] = useState<string | null>(null);
  const [localFeatures, setLocalFeatures] = useState(features);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setLocalFeatures(features);
  }, [features]);

  useEffect(() => {
    if (!companyId) return;
    supabase.from("companies").select("trial_ends_at").eq("id", companyId).single()
      .then(({ data }) => setTrialEnds(data?.trial_ends_at ?? null));
  }, [companyId]);

  async function toggleFeature(key: FeatureKey) {
    if (role !== "owner") return;
    const updated = { ...localFeatures, [key]: !localFeatures[key] };
    setLocalFeatures(updated);
    await supabase.from("companies").update({ features: updated }).eq("id", companyId);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function changePlan(newPlan: Plan) {
    if (role !== "owner") return;
    const planFeatures = PLAN_FEATURES[newPlan];
    await supabase.from("companies").update({ plan: newPlan, features: planFeatures }).eq("id", companyId);
    setLocalFeatures(planFeatures);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    // Reload to update context
    window.location.reload();
  }

  const isOwner = role === "owner";
  const daysLeft = trialEnds ? Math.max(0, Math.ceil((new Date(trialEnds).getTime() - Date.now()) / 86400000)) : null;

  return (
    <div className="rounded p-4 space-y-4" style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }}>
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--zr-text-secondary)" }}>Plan & Features</h2>
        <span className="text-xs rounded px-2 py-0.5 font-medium" style={{
          background: plan === "enterprise" ? "rgba(168, 85, 247, 0.2)" :
          plan === "pro" ? "rgba(59, 130, 246, 0.2)" :
          plan === "basic" ? "rgba(34, 197, 94, 0.2)" :
          "rgba(245, 158, 11, 0.2)",
          color: plan === "enterprise" ? "#a855f7" :
          plan === "pro" ? "var(--zr-info)" :
          plan === "basic" ? "var(--zr-success)" :
          "var(--zr-warning)"
        }}>
          {PLAN_LABELS[plan as Plan] ?? plan}
        </span>
        {saved && <span className="text-xs font-medium" style={{ color: "var(--zr-success)" }}>✓ Saved</span>}
      </div>

      {plan === "trial" && daysLeft !== null && (
        <div className="rounded p-3 text-sm" style={{
          background: daysLeft <= 3 ? "rgba(239, 68, 68, 0.1)" : "rgba(245, 158, 11, 0.1)",
          color: daysLeft <= 3 ? "var(--zr-error)" : "var(--zr-warning)",
          border: daysLeft <= 3 ? "1px solid var(--zr-error)" : "1px solid var(--zr-warning)"
        }}>
          {daysLeft > 0
            ? <>{daysLeft} day{daysLeft !== 1 ? "s" : ""} left on your free trial. All features are unlocked during trial.</>
            : <>Your trial has expired. Choose a plan to continue using ZeroRemake.</>}
        </div>
      )}

      {/* Plan selector (owner only) */}
      {isOwner && (
        <div className="space-y-2">
          <div className="text-xs font-medium" style={{ color: "var(--zr-text-secondary)" }}>Choose Plan</div>
          <div className="grid grid-cols-2 gap-2">
            {(["basic", "pro", "enterprise"] as Plan[]).map(p => (
              <button key={p} onClick={() => p !== "enterprise" ? changePlan(p) : undefined}
                className={`rounded p-3 text-left transition-colors ${p === "enterprise" ? "col-span-2" : ""}`}
                style={{
                  border: plan === p ? "1px solid var(--zr-info)" : "1px solid var(--zr-border)",
                  background: plan === p ? "rgba(59, 130, 246, 0.1)" : "transparent"
                }}>
                <div className="font-medium text-sm" style={{ color: "var(--zr-text-primary)" }}>{PLAN_LABELS[p]}</div>
                <div className="text-xs mt-0.5" style={{ color: "var(--zr-text-secondary)" }}>
                  {p === "basic" && "Measure + Scheduling — $29/user/mo"}
                  {p === "pro" && "Full platform — $49/user/mo"}
                  {p === "enterprise" && "Everything + Builder Portal + Automation — Contact sales"}
                </div>
                {plan === p && <div className="text-xs font-medium mt-1" style={{ color: "var(--zr-info)" }}>Current plan</div>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Feature toggles */}
      <div className="space-y-2">
        <div className="text-xs font-medium" style={{ color: "var(--zr-text-secondary)" }}>
          {isOwner ? "Feature Toggles (override plan defaults)" : "Enabled Features"}
        </div>
        <div className="space-y-1.5">
          {(Object.entries(FEATURE_LABELS) as [FeatureKey, { label: string; desc: string }][]).map(([key, { label, desc }]) => (
            <label key={key} className={`flex items-start gap-2.5 p-2 rounded ${isOwner ? "cursor-pointer" : ""}`} style={{ background: isOwner ? "transparent" : "transparent" }}>
              <input type="checkbox" checked={localFeatures[key]} disabled={!isOwner}
                onChange={() => toggleFeature(key)}
                className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <div className="text-sm" style={{ color: localFeatures[key] ? "var(--zr-text-primary)" : "var(--zr-text-muted)", fontWeight: localFeatures[key] ? "500" : "normal" }}>{label}</div>
                <div className="text-xs" style={{ color: "var(--zr-text-muted)" }}>{desc}</div>
              </div>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Email order tracking ──────────────────────────────────────

function EmailTrackingSection() {
  const { companyId } = useAuth();
  const [settings,  setSettings]  = useState<{ notify_on_shipped: boolean; notify_on_delivered: boolean; notify_channel: string } | null>(null);
  const [copied,    setCopied]    = useState(false);

  const token   = companyId ? companyId.replace(/-/g, "").slice(0, 12) : "";
  const inbound = token ? `orders-${token}@inbound.postmarkapp.com` : "";

  useEffect(() => {
    supabase.from("company_settings").select("notify_on_shipped, notify_on_delivered, notify_channel").maybeSingle()
      .then(({ data }) => { if (data) setSettings(data as any); });
  }, []);

  async function toggle(field: "notify_on_shipped" | "notify_on_delivered", val: boolean) {
    await supabase.from("company_settings").update({ [field]: val });
    setSettings(prev => prev ? { ...prev, [field]: val } : prev);
  }
  async function setChannel(val: string) {
    await supabase.from("company_settings").update({ notify_channel: val });
    setSettings(prev => prev ? { ...prev, notify_channel: val } : prev);
  }

  function copy() {
    navigator.clipboard?.writeText(inbound);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded p-4 space-y-4" style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }}>
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--zr-text-secondary)" }}>Email Order Tracking</h2>
        <span className="text-xs rounded px-2 py-0.5 font-medium" style={{ background: "rgba(168, 85, 247, 0.2)", color: "#a855f7" }}>Pro Feature</span>
      </div>

      <p className="text-xs" style={{ color: "var(--zr-text-secondary)" }}>
        Forward manufacturer order emails to your unique address and ZeroRemake automatically updates order status — shipped, delivered, tracking numbers — without you lifting a finger.
      </p>

      {/* Inbound address */}
      <div className="rounded p-3 space-y-1.5" style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)" }}>
        <div className="text-xs font-medium" style={{ color: "var(--zr-text-secondary)" }}>Your inbound email address:</div>
        <div className="font-mono text-xs break-all" style={{ color: "var(--zr-text-primary)" }}>{inbound || "Loading…"}</div>
        <button onClick={copy} className="text-xs rounded px-2.5 py-1 text-white" style={{ background: copied ? "var(--zr-success)" : "var(--zr-orange)" }}>
          {copied ? "✓ Copied" : "Copy Address"}
        </button>
      </div>

      {/* Setup steps */}
      <div className="rounded p-3 space-y-2" style={{ background: "rgba(59, 130, 246, 0.1)", border: "1px solid var(--zr-info)" }}>
        <div className="text-xs font-semibold" style={{ color: "var(--zr-info)" }}>One-time setup (5 minutes):</div>
        <ol className="text-xs space-y-1 list-decimal list-inside" style={{ color: "var(--zr-info)" }}>
          <li>Create a free account at <a href="https://postmarkapp.com" target="_blank" rel="noreferrer" className="underline">postmarkapp.com</a></li>
          <li>Create an <strong>Inbound Stream</strong></li>
          <li>Set webhook URL: <code className="rounded px-1" style={{ background: "var(--zr-surface-2)" }}>https://yoursite.vercel.app/api/email-inbound</code></li>
          <li>Add <code className="rounded px-1" style={{ background: "var(--zr-surface-2)" }}>SUPABASE_SERVICE_ROLE_KEY</code> to your Vercel env vars</li>
          <li>In Gmail/Outlook: filter emails from your manufacturers → forward to the address above</li>
        </ol>
      </div>

      {/* Notification prefs */}
      {settings && (
        <div className="space-y-3">
          <div className="text-xs font-medium" style={{ color: "var(--zr-text-secondary)" }}>Notifications</div>
          <label className="flex items-center justify-between text-sm" style={{ color: "var(--zr-text-primary)" }}>
            <span>Alert when order ships</span>
            <input type="checkbox" checked={settings.notify_on_shipped}
              onChange={e => toggle("notify_on_shipped", e.target.checked)} className="h-4 w-4" />
          </label>
          <label className="flex items-center justify-between text-sm" style={{ color: "var(--zr-text-primary)" }}>
            <span>Alert when order arrives</span>
            <input type="checkbox" checked={settings.notify_on_delivered}
              onChange={e => toggle("notify_on_delivered", e.target.checked)} className="h-4 w-4" />
          </label>
          <div className="flex items-center justify-between text-sm" style={{ color: "var(--zr-text-primary)" }}>
            <span>Notification method</span>
            <select value={settings.notify_channel} onChange={e => setChannel(e.target.value)}
              className="rounded px-2 py-1 text-xs"
              style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }}>
              <option value="dashboard">Dashboard only</option>
              <option value="text">Text (requires Twilio)</option>
              <option value="both">Dashboard + Text</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Team management ───────────────────────────────────────────

type TeamMember = {
  id: string;
  full_name: string | null;
  role: string;
  permissions: Record<string, boolean>;
  email?: string;
};

function TeamSection() {
  const { user, companyId, permissions: myPerms } = useAuth();
  const [members,    setMembers]    = useState<TeamMember[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [inviteLink, setInviteLink] = useState("");
  const [editingId,  setEditingId]  = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    loadTeam();
    if (typeof window !== "undefined") setInviteLink(`${window.location.origin}/signup?company=${companyId}`);
  }, [companyId]); // eslint-disable-line

  async function loadTeam() {
    const { data } = await supabase.from("profiles")
      .select("id, full_name, role, permissions")
      .eq("company_id", companyId);
    setMembers((data || []) as TeamMember[]);
    setLoading(false);
  }

  async function updateMemberRole(memberId: string, newRole: string) {
    const defaults = ROLE_DEFAULTS[newRole as Role] ?? ROLE_DEFAULTS.office;
    await supabase.from("profiles").update({ role: newRole, permissions: defaults }).eq("id", memberId);
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role: newRole, permissions: defaults } : m));
  }

  async function togglePermission(memberId: string, perm: PermKey, current: boolean) {
    const member = members.find(m => m.id === memberId);
    if (!member) return;
    const base = ROLE_DEFAULTS[member.role as Role] ?? ROLE_DEFAULTS.office;
    const updated = { ...base, ...member.permissions, [perm]: !current };
    await supabase.from("profiles").update({ permissions: updated }).eq("id", memberId);
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, permissions: updated } : m));
  }

  if (!myPerms.manage_team) return null;

  return (
    <div className="rounded p-4 space-y-4" style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }}>
      <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--zr-text-secondary)" }}>Team Members</h2>

      {/* Invite link */}
      <div className="rounded p-3 space-y-1.5" style={{ background: "rgba(59, 130, 246, 0.1)", border: "1px solid var(--zr-info)" }}>
        <div className="text-xs font-medium" style={{ color: "var(--zr-info)" }}>Invite someone to your team</div>
        <div className="text-xs font-mono break-all" style={{ color: "var(--zr-info)" }}>{inviteLink}</div>
        <button onClick={() => navigator.clipboard?.writeText(inviteLink)}
          className="text-xs text-white rounded px-2.5 py-1"
          style={{ background: "var(--zr-info)" }}>
          Copy Invite Link
        </button>
        <p className="text-xs" style={{ color: "var(--zr-info)" }}>They sign up with this link → automatically joins your company. Set their role below.</p>
      </div>

      {loading ? <p className="text-xs" style={{ color: "var(--zr-text-muted)" }}>Loading…</p> : members.length === 0 ? (
        <p className="text-xs" style={{ color: "var(--zr-text-muted)" }}>No team members yet.</p>
      ) : (
        <ul className="space-y-3">
          {members.map(m => {
            const resolved = resolvePermissions(m.role, m.permissions);
            const isMe = m.id === user?.id;
            return (
              <li key={m.id} className="rounded p-3 space-y-2" style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)" }}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-medium text-sm" style={{ color: "var(--zr-text-primary)" }}>{m.full_name ?? "Unnamed"} {isMe && <span className="text-xs" style={{ color: "var(--zr-text-muted)" }}>(you)</span>}</div>
                    <select value={m.role} disabled={isMe}
                      onChange={e => updateMemberRole(m.id, e.target.value)}
                      className="text-xs rounded px-2 py-1 mt-1 disabled:opacity-50"
                      style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }}>
                      {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </select>
                  </div>
                  <button onClick={() => setEditingId(editingId === m.id ? null : m.id)}
                    className="text-xs hover:underline shrink-0"
                    style={{ color: "var(--zr-orange)" }}>
                    {editingId === m.id ? "Close" : "Edit permissions"}
                  </button>
                </div>

                {editingId === m.id && (
                  <div className="border-t pt-2 grid grid-cols-1 gap-1.5" style={{ borderTopColor: "var(--zr-border)" }}>
                    {(Object.entries(PERM_LABELS) as [PermKey, { label: string; desc: string }][]).map(([key, { label }]) => (
                      <label key={key} className="flex items-center gap-2 text-xs cursor-pointer">
                        <input type="checkbox"
                          checked={resolved[key]}
                          disabled={isMe && key === "manage_team"}
                          onChange={() => togglePermission(m.id, key, resolved[key])}
                          className="h-3.5 w-3.5" />
                        <span style={{ color: resolved[key] ? "var(--zr-text-primary)" : "var(--zr-text-muted)" }}>{label}</span>
                      </label>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ── Install checklist ─────────────────────────────────────────

type ChecklistItem = {
  id: string;
  label: string;
  sort_order: number;
  required: boolean;
  locked: boolean;
  active: boolean;
};

const DEFAULT_CHECKLIST = [
  "Verify all materials match order",
  "Protect floors and furniture",
  "Remove old treatments (if applicable)",
  "Install brackets/hardware",
  "Mount treatments",
  "Test operation (raise/lower/tilt)",
  "Test motorization (if applicable)",
  "Clean up workspace",
  "Walk through with customer",
  "Collect sign-off",
];

function ChecklistSection() {
  const { role } = useAuth();
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newLabel, setNewLabel] = useState("");

  useEffect(() => { loadItems(); }, []);

  async function loadItems() {
    const { data } = await supabase.from("install_checklist_items")
      .select("*").eq("active", true).order("sort_order");
    setItems((data || []) as ChecklistItem[]);
    setLoading(false);
  }

  async function addItem() {
    if (!newLabel.trim()) return;
    const { data } = await supabase.from("install_checklist_items")
      .insert([{ label: newLabel.trim(), sort_order: items.length, required: true }])
      .select("*").single();
    if (data) setItems(prev => [...prev, data as ChecklistItem]);
    setNewLabel("");
  }

  async function removeItem(id: string) {
    await supabase.from("install_checklist_items").update({ active: false }).eq("id", id);
    setItems(prev => prev.filter(i => i.id !== id));
  }

  async function toggleRequired(id: string) {
    const item = items.find(i => i.id === id);
    if (!item) return;
    await supabase.from("install_checklist_items").update({ required: !item.required }).eq("id", id);
    setItems(prev => prev.map(i => i.id === id ? { ...i, required: !i.required } : i));
  }

  async function loadDefaults() {
    if (!confirm("Add the default checklist items? Existing items will not be removed.")) return;
    const inserts = DEFAULT_CHECKLIST.map((label, i) => ({ label, sort_order: items.length + i, required: true }));
    const { data } = await supabase.from("install_checklist_items").insert(inserts).select("*");
    if (data) setItems(prev => [...prev, ...(data as ChecklistItem[])]);
  }

  if (role !== "owner") return null;

  return (
    <div className="rounded p-4 space-y-4" style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }}>
      <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--zr-text-secondary)" }}>Install Checklist</h2>
      <p className="text-xs" style={{ color: "var(--zr-text-muted)" }}>
        Define the checklist your installers must complete on every job. Required items must be checked before the job can be marked done.
      </p>

      {loading ? <p className="text-xs" style={{ color: "var(--zr-text-muted)" }}>Loading…</p> : items.length === 0 ? (
        <div className="space-y-2">
          <p className="text-xs" style={{ color: "var(--zr-text-muted)" }}>No checklist items yet.</p>
          <button onClick={loadDefaults} className="text-xs text-white rounded px-2.5 py-1" style={{ background: "var(--zr-info)" }}>
            Load Default Checklist
          </button>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {items.map(item => (
            <li key={item.id} className="flex items-center justify-between gap-2 py-1" style={{ borderBottom: "1px solid var(--zr-border)" }}>
              <span className="text-sm" style={{ color: "var(--zr-text-primary)" }}>{item.label}</span>
              <div className="flex items-center gap-2 shrink-0">
                <label className="flex items-center gap-1 text-xs cursor-pointer">
                  <input type="checkbox" checked={item.required} onChange={() => toggleRequired(item.id)} className="h-3.5 w-3.5" />
                  <span style={{ color: "var(--zr-text-secondary)" }}>Required</span>
                </label>
                <button onClick={() => removeItem(item.id)} className="text-xs" style={{ color: "var(--zr-error)" }}>✕</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <input value={newLabel} onChange={e => setNewLabel(e.target.value)}
          onKeyDown={e => e.key === "Enter" && addItem()}
          placeholder="Add checklist item…" className="flex-1 rounded px-2 py-1.5 text-sm"
          style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }} />
        <button onClick={addItem} disabled={!newLabel.trim()}
          className="rounded text-white px-3 py-1.5 text-sm disabled:opacity-50"
          style={{ background: "var(--zr-orange)" }}>Add</button>
      </div>

      {items.length > 0 && (
        <button onClick={loadDefaults} className="text-xs hover:underline" style={{ color: "var(--zr-orange)" }}>
          + Add default items
        </button>
      )}
    </div>
  );
}

// ── Branding / White-Label ────────────────────────────────────

const OWNER_COMPANY_ID = "92811199-4342-40d2-9332-dfe92e8210db";

function BrandingSection() {
  const { companyId, role, plan, branding } = useAuth();
  // Only show for enterprise plan OR the platform owner's company
  const canWhiteLabel = plan === "enterprise" || companyId === OWNER_COMPANY_ID;
  if (!canWhiteLabel) return null;
  const [slug,         setSlug]         = useState(branding?.slug ?? "");
  const [primaryColor, setPrimaryColor] = useState(branding?.primaryColor ?? "");
  const [primaryHover, setPrimaryHover] = useState(branding?.primaryHover ?? "");
  const [darkColor,    setDarkColor]    = useState(branding?.darkColor ?? "");
  const [font,         setFont]         = useState(branding?.font ?? "");
  const [logoUrl,      setLogoUrl]      = useState(branding?.logoUrl ?? "");
  const [logoMark,     setLogoMark]     = useState(branding?.logoMark ?? "");
  const [saved,        setSaved]        = useState(false);

  useEffect(() => {
    if (branding) {
      setSlug(branding.slug ?? "");
      setPrimaryColor(branding.primaryColor ?? "");
      setPrimaryHover(branding.primaryHover ?? "");
      setDarkColor(branding.darkColor ?? "");
      setFont(branding.font ?? "");
      setLogoUrl(branding.logoUrl ?? "");
      setLogoMark(branding.logoMark ?? "");
    }
  }, [branding]);

  async function saveBranding() {
    if (!companyId || role !== "owner") return;
    await supabase.from("companies").update({
      brand_slug:          slug.trim() || null,
      brand_primary_color: primaryColor.trim() || null,
      brand_primary_hover: primaryHover.trim() || null,
      brand_dark_color:    darkColor.trim() || null,
      brand_font:          font.trim() || null,
      brand_logo_url:      logoUrl.trim() || null,
      brand_logo_mark:     logoMark.trim() || null,
    }).eq("id", companyId);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    // Reload to apply new branding via auth-provider
    window.location.reload();
  }

  if (role !== "owner") return null;

  return (
    <div className="rounded p-4 space-y-3" style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }}>
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--zr-text-secondary)" }}>Branding / White-Label</h2>
        {saved && <span className="text-xs font-medium" style={{ color: "var(--zr-success)" }}>✓ Saved</span>}
      </div>
      <p className="text-xs" style={{ color: "var(--zr-text-muted)" }}>
        Customize your app appearance. Leave fields blank to use ZeroRemake defaults.
      </p>

      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: "var(--zr-text-secondary)" }}>Brand Slug</label>
          <input value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
            placeholder="acme-blinds" className="w-full rounded px-2 py-1.5 text-sm"
            style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }} />
          <p className="text-xs mt-0.5" style={{ color: "var(--zr-text-muted)" }}>Lowercase, hyphens only. Used for white-label CSS targeting.</p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--zr-text-secondary)" }}>Primary Color</label>
            <div className="flex gap-2 items-center">
              <input type="color" value={primaryColor || "#e63000"}
                onChange={e => setPrimaryColor(e.target.value)}
                className="w-8 h-8 rounded cursor-pointer border-0 p-0" />
              <input value={primaryColor} onChange={e => setPrimaryColor(e.target.value)}
                placeholder="#e63000" className="flex-1 rounded px-2 py-1.5 text-sm font-mono"
                style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--zr-text-secondary)" }}>Hover Color</label>
            <input value={primaryHover} onChange={e => setPrimaryHover(e.target.value)}
              placeholder="#cc2900" className="w-full rounded px-2 py-1.5 text-sm font-mono"
              style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }} />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--zr-text-secondary)" }}>Dark BG Color</label>
            <input value={darkColor} onChange={e => setDarkColor(e.target.value)}
              placeholder="#1a1a1a" className="w-full rounded px-2 py-1.5 text-sm font-mono"
              style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }} />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: "var(--zr-text-secondary)" }}>Custom Font (Google Fonts name)</label>
          <input value={font} onChange={e => setFont(e.target.value)}
            placeholder="Inter, Poppins, Roboto…" className="w-full rounded px-2 py-1.5 text-sm"
            style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--zr-text-secondary)" }}>Logo URL</label>
            <input value={logoUrl} onChange={e => setLogoUrl(e.target.value)}
              placeholder="https://…/logo.svg" className="w-full rounded px-2 py-1.5 text-sm"
              style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }} />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--zr-text-secondary)" }}>Logo Mark (letter)</label>
            <input value={logoMark} onChange={e => setLogoMark(e.target.value.slice(0, 2))}
              placeholder="Z" maxLength={2} className="w-full rounded px-2 py-1.5 text-sm"
              style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }} />
          </div>
        </div>

        {/* Preview */}
        {primaryColor && (
          <div className="rounded p-3 text-xs flex items-center gap-3" style={{ background: darkColor || "var(--zr-black)", border: "1px solid var(--zr-border)" }}>
            <div className="w-6 h-6 rounded" style={{ background: primaryColor }} />
            <span style={{ color: primaryColor, fontFamily: font ? `'${font}', sans-serif` : "inherit" }}>
              Preview — your primary color on dark background
            </span>
          </div>
        )}

        <button onClick={saveBranding}
          className="rounded text-white px-4 py-2 text-sm font-medium"
          style={{ background: "var(--zr-orange)" }}>
          Save Branding & Reload
        </button>
      </div>
    </div>
  );
}

// ── Data export ───────────────────────────────────────────────

function DataExportSection() {
  const { companyId, permissions: myPerms } = useAuth();
  const [exporting, setExporting] = useState(false);

  async function exportAll() {
    if (!companyId) return;
    setExporting(true);

    const [custs, quotes, jobs, appts, activities] = await Promise.all([
      supabase.from("customers").select("*"),
      supabase.from("quotes").select("*"),
      supabase.from("measure_jobs").select("*"),
      supabase.from("appointments").select("*"),
      supabase.from("activity_log").select("*"),
    ]);

    const exportData = {
      exported_at: new Date().toISOString(),
      customers:   custs.data   ?? [],
      quotes:      quotes.data  ?? [],
      measure_jobs: jobs.data   ?? [],
      appointments: appts.data  ?? [],
      activity_log: activities.data ?? [],
    };

    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `zeroremake-export-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setExporting(false);
  }

  if (!myPerms.access_settings) return null;

  return (
    <div className="rounded p-4 space-y-3" style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }}>
      <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--zr-text-secondary)" }}>Data & Privacy</h2>
      <div>
        <div className="text-sm font-medium" style={{ color: "var(--zr-text-primary)" }}>Export All Company Data</div>
        <div className="text-xs mt-0.5 mb-2" style={{ color: "var(--zr-text-muted)" }}>
          Download a complete copy of all your customers, quotes, jobs, and activity as a JSON file. You own your data — always.
        </div>
        <button onClick={exportAll} disabled={exporting}
          className="rounded px-3 py-1.5 text-sm disabled:opacity-50"
          style={{ border: "1px solid var(--zr-border)", color: "var(--zr-text-secondary)", background: "transparent" }}>
          {exporting ? "Preparing export…" : "⬇ Download Full Export"}
        </button>
      </div>
      <div className="text-xs border-t pt-2" style={{ borderTopColor: "var(--zr-border)", color: "var(--zr-text-muted)" }}>
        Need to cancel your account? Email us and we'll send you a final export before deleting your data.
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saved,    setSaved]    = useState(false);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    const { data } = await supabase.from("company_settings").select("*").maybeSingle();
    if (data) {
      setSettings(data as Settings);
    } else {
      // Auto-create a settings row if none exists
      const { data: created } = await supabase
        .from("company_settings")
        .insert([{ name: "My Company" }])
        .select("*")
        .single();
      if (created) setSettings(created as Settings);
    }
    setLoading(false);
  }

  async function save(field: keyof Settings, value: string | number | null) {
    if (!settings) return;
    await supabase.from("company_settings").update({ [field]: value }).eq("id", settings.id);
    setSettings(prev => prev ? { ...prev, [field]: value } : prev);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function Field({ label, field, type = "text", placeholder = "" }: {
    label: string; field: keyof Settings; type?: string; placeholder?: string;
  }) {
    const val = settings ? (settings[field] ?? "") : "";
    return (
      <div>
        <label className="text-xs font-medium block mb-1" style={{ color: "var(--zr-text-secondary)" }}>{label}</label>
        <input
          type={type}
          defaultValue={String(val)}
          onBlur={e => {
            const v = e.target.value.trim();
            save(field, type === "number" ? parseFloat(v) || 0 : v || null);
          }}
          placeholder={placeholder}
          className="w-full rounded px-2 py-1.5 text-sm"
          style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }}
        />
      </div>
    );
  }

  if (loading) return (
    <main style={{ background: "var(--zr-black)", minHeight: "100vh", padding: "24px" }}>
      <div style={{ maxWidth: 672, margin: "0 auto" }}>
        <div className="zr-skeleton" style={{ width: "180px", height: "22px", borderRadius: "var(--zr-radius-sm)", marginBottom: "20px" }} />
        {[1,2,3].map(i => (
          <div key={i} style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)", borderRadius: "var(--zr-radius-md)", padding: "16px", marginBottom: "12px" }}>
            <div className="zr-skeleton" style={{ width: "30%", height: "14px", borderRadius: "var(--zr-radius-sm)", marginBottom: "10px" }} />
            <div className="zr-skeleton" style={{ width: "100%", height: "36px", borderRadius: "var(--zr-radius-sm)" }} />
          </div>
        ))}
      </div>
    </main>
  );
  if (!settings) return <div className="p-4 text-sm" style={{ background: "var(--zr-black)", color: "var(--zr-text-muted)" }}>Unable to load settings. Check that your company_settings table exists and RLS is configured.</div>;

  return (
    <PermissionGate require="access_settings">
      <main className="min-h-screen p-4 text-sm" style={{ background: "var(--zr-black)", color: "var(--zr-text-primary)" }}>
        <div className="mx-auto max-w-2xl space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold" style={{ color: "var(--zr-text-primary)" }}>Company Settings</h1>
          {saved && <span className="text-xs font-medium" style={{ color: "var(--zr-success)" }}>✓ Saved</span>}
        </div>
        <p className="text-xs" style={{ color: "var(--zr-text-muted)" }}>This information appears on your PDF quotes and customer-facing documents.</p>

        {/* Company info */}
        <div className="rounded p-4 space-y-3" style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }}>
          <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--zr-text-secondary)" }}>Company</h2>
          <Field label="Company Name *" field="name" placeholder="Aspen Blinds" />
          <Field label="Tagline" field="tagline" placeholder="Window Treatments for Every Home" />
          <Field label="License # (optional)" field="license_number" placeholder="Utah Contractor #12345" />
          <Field label="Google Review Link" field="google_review_link" placeholder="https://g.page/r/YOUR_ID/review" />
          <p className="text-xs" style={{ color: "var(--zr-text-muted)" }}>Paste your Google Business review link — it goes into every review request text after installs.</p>
        </div>

        {/* Contact */}
        <div className="rounded p-4 space-y-3" style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }}>
          <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--zr-text-secondary)" }}>Contact</h2>
          <Field label="Phone" field="phone" type="tel" placeholder="801-555-1234" />
          <Field label="Email" field="email" type="email" placeholder="info@aspenblinds.com" />
          <Field label="Website" field="website" placeholder="www.aspenblinds.com" />
        </div>

        {/* Address */}
        <div className="rounded p-4 space-y-3" style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }}>
          <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--zr-text-secondary)" }}>Address</h2>
          <Field label="Street" field="address" placeholder="123 Main St" />
          <div className="grid grid-cols-[1fr_56px_88px] gap-2">
            <Field label="City" field="city" placeholder="Orem" />
            <Field label="State" field="state" placeholder="UT" />
            <Field label="Zip" field="zip" placeholder="84057" />
          </div>
        </div>

        {/* Defaults */}
        <div className="rounded p-4 space-y-3" style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }}>
          <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--zr-text-secondary)" }}>Quote Defaults</h2>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--zr-text-secondary)" }}>Deposit %</label>
              <input type="number" min="0" max="100"
                defaultValue={settings.default_deposit_pct}
                onBlur={e => save("default_deposit_pct", parseFloat(e.target.value) || 50)}
                className="w-full rounded px-2 py-1.5 text-sm"
                style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }} />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--zr-text-secondary)" }}>Default Markup</label>
              <input type="number" min="1" step="0.01"
                defaultValue={settings.default_markup}
                onBlur={e => save("default_markup", parseFloat(e.target.value) || 2.5)}
                className="w-full rounded px-2 py-1.5 text-sm"
                style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }} />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--zr-text-secondary)" }}>Quote Valid (days)</label>
              <input type="number" min="1"
                defaultValue={settings.default_quote_days}
                onBlur={e => save("default_quote_days", parseInt(e.target.value) || 30)}
                className="w-full rounded px-2 py-1.5 text-sm"
                style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }} />
            </div>
          </div>
          <p className="text-xs" style={{ color: "var(--zr-text-muted)" }}>These pre-fill on every new quote but can be changed per job.</p>
        </div>

        {/* Payment Connections link */}
        <Link
          href="/settings/integrations"
          className="rounded p-4 flex items-center justify-between hover:opacity-80 transition-opacity"
          style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }}
        >
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--zr-text-secondary)" }}>Payment Connections</h2>
            <p className="text-xs mt-1" style={{ color: "var(--zr-text-muted)" }}>
              Connect Stripe, Square, PayPal, QuickBooks, and more. Manage how your customers pay.
            </p>
          </div>
          <span className="text-lg" style={{ color: "var(--zr-text-secondary)" }}>→</span>
        </Link>

        {/* Billing & Subscription */}
        <Link
          href="/settings/billing"
          className="rounded p-4 flex items-center justify-between hover:opacity-80 transition-opacity"
          style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }}
        >
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--zr-text-secondary)" }}>Billing & Subscription</h2>
            <p className="text-xs mt-1" style={{ color: "var(--zr-text-muted)" }}>
              Manage your plan, view invoices, and update payment method.
            </p>
          </div>
          <span className="text-lg" style={{ color: "var(--zr-text-secondary)" }}>→</span>
        </Link>

        {/* Automations link */}
        <Link
          href="/settings/automation"
          className="rounded p-4 flex items-center justify-between hover:opacity-80 transition-opacity"
          style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }}
        >
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--zr-text-secondary)" }}>Automations</h2>
            <p className="text-xs mt-1" style={{ color: "var(--zr-text-muted)" }}>
              Set up rules for automatic follow-ups, stuck lead alerts, email sequences, and more.
            </p>
          </div>
          <span className="text-lg" style={{ color: "var(--zr-text-secondary)" }}>→</span>
        </Link>

        <PlanSection />
        <BrandingSection />
        <EmailTrackingSection />
        <TeamSection />
        <ChecklistSection />
        <DataExportSection />

        </div>
      </main>
    </PermissionGate>
  );
}
