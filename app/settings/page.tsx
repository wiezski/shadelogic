"use client";

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
    <div className="rounded border p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Plan & Features</h2>
        <span className={`text-xs rounded px-2 py-0.5 font-medium ${
          plan === "enterprise" ? "bg-purple-100 text-purple-700" :
          plan === "pro" ? "bg-blue-100 text-blue-700" :
          plan === "basic" ? "bg-green-100 text-green-700" :
          "bg-amber-100 text-amber-700"
        }`}>
          {PLAN_LABELS[plan as Plan] ?? plan}
        </span>
        {saved && <span className="text-xs text-green-600 font-medium">✓ Saved</span>}
      </div>

      {plan === "trial" && daysLeft !== null && (
        <div className={`rounded p-3 text-sm ${daysLeft <= 3 ? "bg-red-50 text-red-700 border border-red-200" : "bg-amber-50 text-amber-700 border border-amber-200"}`}>
          {daysLeft > 0
            ? <>{daysLeft} day{daysLeft !== 1 ? "s" : ""} left on your free trial. All features are unlocked during trial.</>
            : <>Your trial has expired. Choose a plan to continue using ZeroRemake.</>}
        </div>
      )}

      {/* Plan selector (owner only) */}
      {isOwner && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-gray-500">Choose Plan</div>
          <div className="grid grid-cols-2 gap-2">
            {(["basic", "pro", "enterprise"] as Plan[]).map(p => (
              <button key={p} onClick={() => p !== "enterprise" ? changePlan(p) : undefined}
                className={`rounded border p-3 text-left transition-colors ${
                  plan === p ? "border-blue-500 bg-blue-50" : "hover:border-gray-300"
                } ${p === "enterprise" ? "col-span-2" : ""}`}>
                <div className="font-medium text-sm">{PLAN_LABELS[p]}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {p === "basic" && "Measure + Scheduling — $29/user/mo"}
                  {p === "pro" && "Full platform — $49/user/mo"}
                  {p === "enterprise" && "Everything + Builder Portal + Automation — Contact sales"}
                </div>
                {plan === p && <div className="text-xs text-blue-600 font-medium mt-1">Current plan</div>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Feature toggles */}
      <div className="space-y-2">
        <div className="text-xs font-medium text-gray-500">
          {isOwner ? "Feature Toggles (override plan defaults)" : "Enabled Features"}
        </div>
        <div className="space-y-1.5">
          {(Object.entries(FEATURE_LABELS) as [FeatureKey, { label: string; desc: string }][]).map(([key, { label, desc }]) => (
            <label key={key} className={`flex items-start gap-2.5 p-2 rounded ${isOwner ? "cursor-pointer hover:bg-gray-50" : ""}`}>
              <input type="checkbox" checked={localFeatures[key]} disabled={!isOwner}
                onChange={() => toggleFeature(key)}
                className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <div className={`text-sm ${localFeatures[key] ? "text-gray-800 font-medium" : "text-gray-400"}`}>{label}</div>
                <div className="text-xs text-gray-400">{desc}</div>
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
    <div className="rounded border p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Email Order Tracking</h2>
        <span className="text-xs rounded bg-purple-100 text-purple-700 px-2 py-0.5 font-medium">Pro Feature</span>
      </div>

      <p className="text-xs text-gray-500">
        Forward manufacturer order emails to your unique address and ZeroRemake automatically updates order status — shipped, delivered, tracking numbers — without you lifting a finger.
      </p>

      {/* Inbound address */}
      <div className="rounded bg-gray-50 border p-3 space-y-1.5">
        <div className="text-xs font-medium text-gray-500">Your inbound email address:</div>
        <div className="font-mono text-xs break-all text-gray-800">{inbound || "Loading…"}</div>
        <button onClick={copy} className={`text-xs rounded px-2.5 py-1 ${copied ? "bg-green-600 text-white" : "bg-black text-white"}`}>
          {copied ? "✓ Copied" : "Copy Address"}
        </button>
      </div>

      {/* Setup steps */}
      <div className="rounded bg-blue-50 border border-blue-200 p-3 space-y-2">
        <div className="text-xs font-semibold text-blue-700">One-time setup (5 minutes):</div>
        <ol className="text-xs text-blue-700 space-y-1 list-decimal list-inside">
          <li>Create a free account at <a href="https://postmarkapp.com" target="_blank" rel="noreferrer" className="underline">postmarkapp.com</a></li>
          <li>Create an <strong>Inbound Stream</strong></li>
          <li>Set webhook URL: <code className="bg-white rounded px-1">https://yoursite.vercel.app/api/email-inbound</code></li>
          <li>Add <code className="bg-white rounded px-1">SUPABASE_SERVICE_ROLE_KEY</code> to your Vercel env vars</li>
          <li>In Gmail/Outlook: filter emails from your manufacturers → forward to the address above</li>
        </ol>
      </div>

      {/* Notification prefs */}
      {settings && (
        <div className="space-y-3">
          <div className="text-xs font-medium text-gray-500">Notifications</div>
          <label className="flex items-center justify-between text-sm">
            <span>Alert when order ships</span>
            <input type="checkbox" checked={settings.notify_on_shipped}
              onChange={e => toggle("notify_on_shipped", e.target.checked)} className="h-4 w-4" />
          </label>
          <label className="flex items-center justify-between text-sm">
            <span>Alert when order arrives</span>
            <input type="checkbox" checked={settings.notify_on_delivered}
              onChange={e => toggle("notify_on_delivered", e.target.checked)} className="h-4 w-4" />
          </label>
          <div className="flex items-center justify-between text-sm">
            <span>Notification method</span>
            <select value={settings.notify_channel} onChange={e => setChannel(e.target.value)}
              className="border rounded px-2 py-1 text-xs">
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
    <div className="rounded border p-4 space-y-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Team Members</h2>

      {/* Invite link */}
      <div className="rounded bg-blue-50 border border-blue-200 p-3 space-y-1.5">
        <div className="text-xs font-medium text-blue-700">Invite someone to your team</div>
        <div className="text-xs text-blue-600 font-mono break-all">{inviteLink}</div>
        <button onClick={() => navigator.clipboard?.writeText(inviteLink)}
          className="text-xs bg-blue-600 text-white rounded px-2.5 py-1">
          Copy Invite Link
        </button>
        <p className="text-xs text-blue-500">They sign up with this link → automatically joins your company. Set their role below.</p>
      </div>

      {loading ? <p className="text-xs text-gray-400">Loading…</p> : members.length === 0 ? (
        <p className="text-xs text-gray-400">No team members yet.</p>
      ) : (
        <ul className="space-y-3">
          {members.map(m => {
            const resolved = resolvePermissions(m.role, m.permissions);
            const isMe = m.id === user?.id;
            return (
              <li key={m.id} className="rounded border p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-medium text-sm">{m.full_name ?? "Unnamed"} {isMe && <span className="text-xs text-gray-400">(you)</span>}</div>
                    <select value={m.role} disabled={isMe}
                      onChange={e => updateMemberRole(m.id, e.target.value)}
                      className="text-xs border rounded px-2 py-1 mt-1 disabled:opacity-50">
                      {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </select>
                  </div>
                  <button onClick={() => setEditingId(editingId === m.id ? null : m.id)}
                    className="text-xs text-blue-600 hover:underline shrink-0">
                    {editingId === m.id ? "Close" : "Edit permissions"}
                  </button>
                </div>

                {editingId === m.id && (
                  <div className="border-t pt-2 grid grid-cols-1 gap-1.5">
                    {(Object.entries(PERM_LABELS) as [PermKey, { label: string; desc: string }][]).map(([key, { label }]) => (
                      <label key={key} className="flex items-center gap-2 text-xs cursor-pointer">
                        <input type="checkbox"
                          checked={resolved[key]}
                          disabled={isMe && key === "manage_team"}
                          onChange={() => togglePermission(m.id, key, resolved[key])}
                          className="h-3.5 w-3.5" />
                        <span className={resolved[key] ? "text-gray-700" : "text-gray-400"}>{label}</span>
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
    <div className="rounded border p-4 space-y-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Install Checklist</h2>
      <p className="text-xs text-gray-400">
        Define the checklist your installers must complete on every job. Required items must be checked before the job can be marked done.
      </p>

      {loading ? <p className="text-xs text-gray-400">Loading…</p> : items.length === 0 ? (
        <div className="space-y-2">
          <p className="text-xs text-gray-400">No checklist items yet.</p>
          <button onClick={loadDefaults} className="text-xs bg-blue-600 text-white rounded px-2.5 py-1">
            Load Default Checklist
          </button>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {items.map(item => (
            <li key={item.id} className="flex items-center justify-between gap-2 py-1 border-b border-gray-100">
              <span className="text-sm">{item.label}</span>
              <div className="flex items-center gap-2 shrink-0">
                <label className="flex items-center gap-1 text-xs cursor-pointer">
                  <input type="checkbox" checked={item.required} onChange={() => toggleRequired(item.id)} className="h-3.5 w-3.5" />
                  <span className="text-gray-500">Required</span>
                </label>
                <button onClick={() => removeItem(item.id)} className="text-xs text-red-400 hover:text-red-600">✕</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <input value={newLabel} onChange={e => setNewLabel(e.target.value)}
          onKeyDown={e => e.key === "Enter" && addItem()}
          placeholder="Add checklist item…" className="flex-1 border rounded px-2 py-1.5 text-sm" />
        <button onClick={addItem} disabled={!newLabel.trim()}
          className="rounded bg-black text-white px-3 py-1.5 text-sm disabled:opacity-50">Add</button>
      </div>

      {items.length > 0 && (
        <button onClick={loadDefaults} className="text-xs text-blue-600 hover:underline">
          + Add default items
        </button>
      )}
    </div>
  );
}

// ── Branding / White-Label ────────────────────────────────────

function BrandingSection() {
  const { companyId, role, branding } = useAuth();
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
    <div className="rounded border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Branding / White-Label</h2>
        {saved && <span className="text-xs text-green-600 font-medium">✓ Saved</span>}
      </div>
      <p className="text-xs text-gray-400">
        Customize your app appearance. Leave fields blank to use ZeroRemake defaults.
      </p>

      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Brand Slug</label>
          <input value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
            placeholder="acme-blinds" className="w-full border rounded px-2 py-1.5 text-sm" />
          <p className="text-xs text-gray-400 mt-0.5">Lowercase, hyphens only. Used for white-label CSS targeting.</p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Primary Color</label>
            <div className="flex gap-2 items-center">
              <input type="color" value={primaryColor || "#e63000"}
                onChange={e => setPrimaryColor(e.target.value)}
                className="w-8 h-8 rounded cursor-pointer border-0 p-0" />
              <input value={primaryColor} onChange={e => setPrimaryColor(e.target.value)}
                placeholder="#e63000" className="flex-1 border rounded px-2 py-1.5 text-sm font-mono" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Hover Color</label>
            <input value={primaryHover} onChange={e => setPrimaryHover(e.target.value)}
              placeholder="#cc2900" className="w-full border rounded px-2 py-1.5 text-sm font-mono" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Dark BG Color</label>
            <input value={darkColor} onChange={e => setDarkColor(e.target.value)}
              placeholder="#1a1a1a" className="w-full border rounded px-2 py-1.5 text-sm font-mono" />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Custom Font (Google Fonts name)</label>
          <input value={font} onChange={e => setFont(e.target.value)}
            placeholder="Inter, Poppins, Roboto…" className="w-full border rounded px-2 py-1.5 text-sm" />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Logo URL</label>
            <input value={logoUrl} onChange={e => setLogoUrl(e.target.value)}
              placeholder="https://…/logo.svg" className="w-full border rounded px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Logo Mark (letter)</label>
            <input value={logoMark} onChange={e => setLogoMark(e.target.value.slice(0, 2))}
              placeholder="Z" maxLength={2} className="w-full border rounded px-2 py-1.5 text-sm" />
          </div>
        </div>

        {/* Preview */}
        {primaryColor && (
          <div className="rounded p-3 text-xs flex items-center gap-3" style={{ background: darkColor || "#1a1a1a", border: "1px solid #333" }}>
            <div className="w-6 h-6 rounded" style={{ background: primaryColor }} />
            <span style={{ color: "#fff", fontFamily: font ? `'${font}', sans-serif` : "inherit" }}>
              Preview — your primary color on dark background
            </span>
          </div>
        )}

        <button onClick={saveBranding}
          className="rounded bg-black text-white px-4 py-2 text-sm font-medium hover:bg-gray-800">
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
    <div className="rounded border p-4 space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Data & Privacy</h2>
      <div>
        <div className="text-sm font-medium">Export All Company Data</div>
        <div className="text-xs text-gray-400 mt-0.5 mb-2">
          Download a complete copy of all your customers, quotes, jobs, and activity as a JSON file. You own your data — always.
        </div>
        <button onClick={exportAll} disabled={exporting}
          className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50">
          {exporting ? "Preparing export…" : "⬇ Download Full Export"}
        </button>
      </div>
      <div className="text-xs text-gray-400 border-t pt-2">
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
    if (data) setSettings(data as Settings);
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
        <label className="text-xs font-medium text-gray-500 block mb-1">{label}</label>
        <input
          type={type}
          defaultValue={String(val)}
          onBlur={e => {
            const v = e.target.value.trim();
            save(field, type === "number" ? parseFloat(v) || 0 : v || null);
          }}
          placeholder={placeholder}
          className="w-full border rounded px-2 py-1.5 text-sm"
        />
      </div>
    );
  }

  if (loading) return <div className="p-4 text-sm text-gray-400">Loading…</div>;
  if (!settings) return <div className="p-4 text-sm text-gray-400">No settings found. Run the phase9 SQL first.</div>;

  return (
    <PermissionGate require="access_settings">
      <main className="min-h-screen bg-white p-4 text-black text-sm">
        <div className="mx-auto max-w-2xl space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Company Settings</h1>
          {saved && <span className="text-xs text-green-600 font-medium">✓ Saved</span>}
        </div>
        <p className="text-xs text-gray-400">This information appears on your PDF quotes and customer-facing documents.</p>

        {/* Company info */}
        <div className="rounded border p-4 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Company</h2>
          <Field label="Company Name *" field="name" placeholder="Aspen Blinds" />
          <Field label="Tagline" field="tagline" placeholder="Window Treatments for Every Home" />
          <Field label="License # (optional)" field="license_number" placeholder="Utah Contractor #12345" />
          <Field label="Google Review Link" field="google_review_link" placeholder="https://g.page/r/YOUR_ID/review" />
          <p className="text-xs text-gray-400">Paste your Google Business review link — it goes into every review request text after installs.</p>
        </div>

        {/* Contact */}
        <div className="rounded border p-4 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Contact</h2>
          <Field label="Phone" field="phone" type="tel" placeholder="801-555-1234" />
          <Field label="Email" field="email" type="email" placeholder="info@aspenblinds.com" />
          <Field label="Website" field="website" placeholder="www.aspenblinds.com" />
        </div>

        {/* Address */}
        <div className="rounded border p-4 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Address</h2>
          <Field label="Street" field="address" placeholder="123 Main St" />
          <div className="grid grid-cols-[1fr_56px_88px] gap-2">
            <Field label="City" field="city" placeholder="Orem" />
            <Field label="State" field="state" placeholder="UT" />
            <Field label="Zip" field="zip" placeholder="84057" />
          </div>
        </div>

        {/* Defaults */}
        <div className="rounded border p-4 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Quote Defaults</h2>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Deposit %</label>
              <input type="number" min="0" max="100"
                defaultValue={settings.default_deposit_pct}
                onBlur={e => save("default_deposit_pct", parseFloat(e.target.value) || 50)}
                className="w-full border rounded px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Default Markup</label>
              <input type="number" min="1" step="0.01"
                defaultValue={settings.default_markup}
                onBlur={e => save("default_markup", parseFloat(e.target.value) || 2.5)}
                className="w-full border rounded px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Quote Valid (days)</label>
              <input type="number" min="1"
                defaultValue={settings.default_quote_days}
                onBlur={e => save("default_quote_days", parseInt(e.target.value) || 30)}
                className="w-full border rounded px-2 py-1.5 text-sm" />
            </div>
          </div>
          <p className="text-xs text-gray-400">These pre-fill on every new quote but can be changed per job.</p>
        </div>

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
