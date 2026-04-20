"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../auth-provider";
import { PermissionGate } from "../permission-gate";
import { PLAN_LABELS, PLAN_FEATURES, PLAN_USER_LIMITS, FEATURE_LABELS, type Plan, type FeatureKey } from "../../lib/features";
import { ROLES, ROLE_LABELS, ROLE_DEFAULTS, PERM_LABELS, resolvePermissions, type Role, type PermKey } from "../../lib/permissions";
import { WIDGET_IDS, WIDGET_LABELS, ROLE_LAYOUTS, type WidgetId } from "../dashboard-widgets";

type WarehouseLocation = { name: string; notes: string };

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
  warehouse_locations: WarehouseLocation[];
};

// ── Plan & Features ───────────────────────────────────────────

function PlanSection() {
  const { companyId, plan, features, role, permissions: myPerms } = useAuth();
  const [trialEnds, setTrialEnds] = useState<string | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    supabase.from("companies").select("trial_ends_at, subscription_status").eq("id", companyId).single()
      .then(({ data }) => {
        setTrialEnds(data?.trial_ends_at ?? null);
        setSubscriptionStatus(data?.subscription_status ?? null);
      });
  }, [companyId]);

  const canManageBilling = myPerms.manage_billing;
  const daysLeft = trialEnds ? Math.max(0, Math.ceil((new Date(trialEnds).getTime() - Date.now()) / 86400000)) : null;
  const planFeatures = PLAN_FEATURES[plan as Plan] ?? PLAN_FEATURES.trial;

  return (
    <div className="rounded p-4 space-y-4" style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }}>
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--zr-text-secondary)" }}>Plan & Features</h2>
        <span className="text-xs rounded px-2 py-0.5 font-medium" style={{
          background: plan === "business" ? "rgba(168, 85, 247, 0.2)" :
          plan === "professional" ? "rgba(59, 130, 246, 0.2)" :
          plan === "starter" ? "rgba(34, 197, 94, 0.2)" :
          "rgba(245, 158, 11, 0.2)",
          color: plan === "business" ? "#a855f7" :
          plan === "professional" ? "var(--zr-info)" :
          plan === "starter" ? "var(--zr-success)" :
          "var(--zr-warning)"
        }}>
          {PLAN_LABELS[plan as Plan] ?? plan}
        </span>
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

      {/* Manage / Upgrade link */}
      {canManageBilling && (
        <div>
          <Link href="/settings/billing" className="inline-block rounded px-4 py-2 text-sm font-medium transition-colors"
            style={{ background: "var(--zr-primary, #e63000)", color: "#fff" }}>
            {subscriptionStatus === "active" ? "Manage Subscription" : "Upgrade Plan"}
          </Link>
        </div>
      )}

      {/* Feature list (read-only, reflects current plan) */}
      <div className="space-y-2">
        <div className="text-xs font-medium" style={{ color: "var(--zr-text-secondary)" }}>
          {plan === "trial" ? "All Features (trial)" : "Included Features"}
        </div>
        <div className="space-y-1.5">
          {(Object.entries(FEATURE_LABELS) as [FeatureKey, { label: string; desc: string }][]).map(([key, { label, desc }]) => {
            const included = planFeatures[key];
            return (
              <div key={key} className="flex items-start gap-2.5 p-2 rounded">
                <span className="mt-0.5 shrink-0 text-sm">{included ? "✓" : "—"}</span>
                <div>
                  <div className="text-sm" style={{ color: included ? "var(--zr-text-primary)" : "var(--zr-text-muted)", fontWeight: included ? "500" : "normal" }}>{label}</div>
                  <div className="text-xs" style={{ color: "var(--zr-text-muted)" }}>{desc}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Warehouse Locations ──────────────────────────────────────

const DEFAULT_LOCATIONS: WarehouseLocation[] = [
  { name: "Warehouse", notes: "" },
  { name: "Garage", notes: "" },
  { name: "Shelf A", notes: "" },
  { name: "Shelf B", notes: "" },
  { name: "Shop", notes: "" },
  { name: "Truck", notes: "" },
];

function WarehouseLocationsSection({ settings, setSettings }: {
  settings: Settings | null;
  setSettings: React.Dispatch<React.SetStateAction<Settings | null>>;
}) {
  const [newName, setNewName] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editNotes, setEditNotes] = useState("");

  if (!settings) return null;

  const locations: WarehouseLocation[] = (settings.warehouse_locations && settings.warehouse_locations.length > 0)
    ? settings.warehouse_locations
    : DEFAULT_LOCATIONS;

  async function saveLocations(updated: WarehouseLocation[]) {
    await supabase.from("company_settings").update({ warehouse_locations: updated }).eq("id", settings!.id);
    setSettings(prev => prev ? { ...prev, warehouse_locations: updated } : prev);
  }

  function addLocation() {
    const name = newName.trim();
    if (!name) return;
    if (locations.some(l => l.name.toLowerCase() === name.toLowerCase())) return;
    const updated = [...locations, { name, notes: newNotes.trim() }];
    saveLocations(updated);
    setNewName("");
    setNewNotes("");
  }

  function removeLocation(idx: number) {
    const updated = locations.filter((_, i) => i !== idx);
    saveLocations(updated);
  }

  function saveNotes(idx: number) {
    const updated = locations.map((l, i) => i === idx ? { ...l, notes: editNotes } : l);
    saveLocations(updated);
    setEditIdx(null);
  }

  const inputStyle = { background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", borderRadius: "var(--zr-radius-md)", color: "var(--zr-text-primary)" };

  return (
    <div className="rounded p-4 space-y-3" style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }}>
      <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--zr-text-secondary)" }}>
        📦 Warehouse Locations
      </h2>
      <p className="text-xs" style={{ color: "var(--zr-text-muted)" }}>
        Customize where packages can be stored. These show as options when checking in deliveries.
      </p>

      {/* Location list */}
      <div className="space-y-1.5">
        {locations.map((loc, idx) => (
          <div key={idx} className="flex items-start gap-2 rounded px-3 py-2"
            style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)" }}>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium" style={{ color: "var(--zr-text-primary)" }}>{loc.name}</span>
                {loc.notes && editIdx !== idx && (
                  <span className="text-xs" style={{ color: "var(--zr-text-muted)" }}>— {loc.notes}</span>
                )}
              </div>
              {editIdx === idx ? (
                <div className="flex items-center gap-1.5 mt-1">
                  <input value={editNotes} onChange={e => setEditNotes(e.target.value)}
                    placeholder="Add a note about this location..."
                    className="flex-1 px-2 py-1 text-xs outline-none rounded" style={inputStyle}
                    onKeyDown={e => { if (e.key === "Enter") saveNotes(idx); }} />
                  <button onClick={() => saveNotes(idx)}
                    className="text-xs px-2 py-1 rounded font-medium"
                    style={{ background: "var(--zr-orange)", color: "#fff" }}>Save</button>
                  <button onClick={() => setEditIdx(null)}
                    className="text-xs" style={{ color: "var(--zr-text-muted)" }}>Cancel</button>
                </div>
              ) : null}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => { setEditIdx(idx); setEditNotes(loc.notes || ""); }}
                className="text-xs px-1.5 py-0.5 rounded" style={{ color: "var(--zr-text-muted)" }}>
                {loc.notes ? "Edit" : "+ Note"}
              </button>
              <button onClick={() => removeLocation(idx)}
                className="text-xs px-1.5 py-0.5 rounded" style={{ color: "var(--zr-error)" }}>✕</button>
            </div>
          </div>
        ))}
      </div>

      {/* Add new */}
      <div className="flex items-center gap-2">
        <input value={newName} onChange={e => setNewName(e.target.value)}
          placeholder="New location name" className="flex-1 px-2 py-1.5 text-sm outline-none rounded" style={inputStyle}
          onKeyDown={e => { if (e.key === "Enter") addLocation(); }} />
        <input value={newNotes} onChange={e => setNewNotes(e.target.value)}
          placeholder="Note (optional)" className="flex-1 px-2 py-1.5 text-sm outline-none rounded" style={inputStyle}
          onKeyDown={e => { if (e.key === "Enter") addLocation(); }} />
        <button onClick={addLocation} disabled={!newName.trim()}
          className="text-xs px-3 py-1.5 rounded font-medium disabled:opacity-40"
          style={{ background: "var(--zr-orange)", color: "#fff" }}>+ Add</button>
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

// ── Pending Approvals ────────────────────────────────────────

type PendingMember = {
  id: string;
  profile_id: string;
  requested_at: string;
  profile: { full_name: string | null } | null;
};

function PendingApprovalsSection() {
  const { user, companyId, role, plan } = useAuth();
  const [pending, setPending] = useState<PendingMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  const userLimits = PLAN_USER_LIMITS[plan as Plan] ?? PLAN_USER_LIMITS.trial;

  useEffect(() => {
    if (!companyId || role !== "owner" && role !== "admin") { setLoading(false); return; }
    loadPending();
  }, [companyId, role]); // eslint-disable-line

  async function loadPending() {
    const { data } = await supabase
      .from("pending_approvals")
      .select("id, profile_id, requested_at")
      .eq("company_id", companyId)
      .is("resolution", null)
      .order("requested_at", { ascending: true });

    if (!data || data.length === 0) { setPending([]); setLoading(false); return; }

    // Load names for pending profiles
    const profileIds = data.map(d => d.profile_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", profileIds);

    const profileMap = new Map((profiles ?? []).map(p => [p.id, p]));
    setPending(data.map(d => ({
      ...d,
      profile: profileMap.get(d.profile_id) ?? null,
    })));
    setLoading(false);
  }

  async function handleAction(profileId: string, action: "approve" | "deny") {
    setProcessing(profileId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch("/api/team/approve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ profileId, action }),
      });

      if (res.ok) {
        setPending(prev => prev.filter(p => p.profile_id !== profileId));
      }
    } catch (err) {
      console.error("Approval action failed:", err);
    }
    setProcessing(null);
  }

  if (role !== "owner" && role !== "admin" || loading || pending.length === 0) return null;

  return (
    <div className="rounded p-4 space-y-3" style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-warning)" }}>
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--zr-warning)" }}>
          Pending Team Requests ({pending.length})
        </h2>
      </div>
      <p className="text-xs" style={{ color: "var(--zr-text-secondary)" }}>
        These people signed up via your invite link but your team is at its user limit. Approving each adds <strong>${userLimits.perUserPrice}/mo</strong> to your subscription.
      </p>
      <div className="space-y-2">
        {pending.map(p => {
          const name = p.profile?.full_name || "Unnamed User";
          const ago = getTimeAgo(p.requested_at);
          const isProcessing = processing === p.profile_id;
          return (
            <div key={p.id} className="rounded p-3 flex items-center justify-between gap-3"
              style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)" }}>
              <div>
                <div className="text-sm font-medium" style={{ color: "var(--zr-text-primary)" }}>{name}</div>
                <div className="text-xs" style={{ color: "var(--zr-text-muted)" }}>Requested {ago}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleAction(p.profile_id, "approve")}
                  disabled={isProcessing}
                  className="rounded px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                  style={{ background: "var(--zr-success)" }}>
                  {isProcessing ? "..." : "Approve (+$" + userLimits.perUserPrice + "/mo)"}
                </button>
                <button
                  onClick={() => handleAction(p.profile_id, "deny")}
                  disabled={isProcessing}
                  className="rounded px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                  style={{ color: "var(--zr-error)", border: "1px solid var(--zr-error)", background: "transparent" }}>
                  Deny
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ── Invite sharing ───────────────────────────────────────────

function InviteSection({ inviteLink, perUserPrice }: { inviteLink: string; perUserPrice: number }) {
  const [copied, setCopied] = useState(false);
  const inviteMessage = `You've been invited to join our team on ZeroRemake! Sign up here: ${inviteLink}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select the text so they can manually copy
      const el = document.getElementById("invite-link-text");
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
  }

  function sendText() {
    window.open(`sms:?&body=${encodeURIComponent(inviteMessage)}`, "_blank");
  }

  function sendEmail() {
    window.open(
      `mailto:?subject=${encodeURIComponent("Join our team on ZeroRemake")}&body=${encodeURIComponent(inviteMessage)}`,
      "_blank"
    );
  }

  return (
    <div className="rounded p-3 space-y-2" style={{ background: "rgba(59, 130, 246, 0.1)", border: "1px solid var(--zr-info)" }}>
      <div className="text-xs font-medium" style={{ color: "var(--zr-info)" }}>Invite someone to your team</div>
      <div id="invite-link-text" className="text-xs font-mono break-all select-all rounded p-2" style={{ color: "var(--zr-info)", background: "rgba(59, 130, 246, 0.08)" }}>
        {inviteLink}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={copyLink}
          className="text-xs text-white rounded px-2.5 py-1.5 font-medium"
          style={{ background: copied ? "var(--zr-success)" : "var(--zr-info)" }}>
          {copied ? "✓ Copied!" : "Copy Link"}
        </button>
        <button onClick={sendText}
          className="text-xs rounded px-2.5 py-1.5 font-medium"
          style={{ background: "transparent", border: "1px solid var(--zr-info)", color: "var(--zr-info)" }}>
          Send via Text
        </button>
        <button onClick={sendEmail}
          className="text-xs rounded px-2.5 py-1.5 font-medium"
          style={{ background: "transparent", border: "1px solid var(--zr-info)", color: "var(--zr-info)" }}>
          Send via Email
        </button>
      </div>
      <p className="text-xs" style={{ color: "var(--zr-info)" }}>
        They sign up with this link and join your company. If you're at your plan's user limit, you'll need to approve them first (+${perUserPrice}/mo each).
      </p>
    </div>
  );
}

// ── Team management ───────────────────────────────────────────

type TeamMember = {
  id: string;
  full_name: string | null;
  role: string;
  permissions: Record<string, boolean>;
  status?: string;
  email?: string;
};

function TeamSection() {
  const { user, companyId, permissions: myPerms, plan } = useAuth();
  const [members,    setMembers]    = useState<TeamMember[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [inviteLink, setInviteLink] = useState("");
  const [editingId,  setEditingId]  = useState<string | null>(null);

  const activeMembers = members.filter(m => m.status !== "pending");
  const userLimits = PLAN_USER_LIMITS[plan as Plan] ?? PLAN_USER_LIMITS.trial;
  const includedUsers = userLimits.included;
  const extraUsers = Math.max(0, activeMembers.length - includedUsers);
  const extraCost = extraUsers * userLimits.perUserPrice;

  useEffect(() => {
    if (!companyId) return;
    loadTeam();
    if (typeof window !== "undefined") setInviteLink(`${window.location.origin}/signup?company=${companyId}`);
  }, [companyId]); // eslint-disable-line

  async function loadTeam() {
    const { data } = await supabase.from("profiles")
      .select("id, full_name, role, permissions, status")
      .eq("company_id", companyId)
      .in("status", ["active", "pending"]);
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

  const [removing, setRemoving] = useState<string | null>(null);
  const [approving, setApproving] = useState<string | null>(null);
  const pendingMembers = members.filter(m => m.status === "pending");

  async function approveMember(memberId: string) {
    setApproving(memberId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch("/api/team/approve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ profileId: memberId }),
      });
      if (res.ok) {
        setMembers(prev => prev.map(m => m.id === memberId ? { ...m, status: "active" } : m));
      }
    } catch (err) {
      console.error("Approve member failed:", err);
    }
    setApproving(null);
  }

  async function removeMember(memberId: string, name: string) {
    if (!confirm(`Remove ${name} from your team? This will delete their account and adjust your billing.`)) return;
    setRemoving(memberId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch("/api/team/remove", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ profileId: memberId }),
      });

      if (res.ok) {
        setMembers(prev => prev.filter(m => m.id !== memberId));
      }
    } catch (err) {
      console.error("Remove member failed:", err);
    }
    setRemoving(null);
  }

  if (!myPerms.manage_team) return null;

  return (
    <div className="rounded p-4 space-y-4" style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }}>
      <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--zr-text-secondary)" }}>Team Members</h2>

      {/* User count & plan limits */}
      <div className="rounded p-3 space-y-1" style={{ background: "var(--zr-surface-2)" }}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium" style={{ color: "var(--zr-text-primary)" }}>
            {activeMembers.length} active user{activeMembers.length !== 1 ? "s" : ""} on your team
          </span>
          <span className="text-xs" style={{ color: "var(--zr-text-muted)" }}>
            {includedUsers} included in {PLAN_LABELS[plan as Plan] ?? plan}
          </span>
        </div>
        {extraUsers > 0 && (
          <div className="text-xs" style={{ color: "var(--zr-warning)" }}>
            {extraUsers} extra user{extraUsers !== 1 ? "s" : ""} × ${userLimits.perUserPrice}/mo = +${extraCost}/mo added to your bill
          </div>
        )}
      </div>

      {/* Invite link */}
      <InviteSection inviteLink={inviteLink} perUserPrice={userLimits.perUserPrice} />

      {/* Pending approvals */}
      {pendingMembers.length > 0 && (
        <div className="rounded p-3 space-y-2" style={{ background: "rgba(245,158,11,0.08)", border: "1px dashed var(--zr-warning)" }}>
          <div className="text-xs font-semibold" style={{ color: "var(--zr-warning)" }}>PENDING APPROVAL ({pendingMembers.length})</div>
          {pendingMembers.map(m => (
            <div key={m.id} className="flex items-center justify-between gap-2 rounded p-2" style={{ background: "var(--zr-surface-1)" }}>
              <div>
                <span className="text-sm font-medium" style={{ color: "var(--zr-text-primary)" }}>{m.full_name ?? "Unnamed"}</span>
                <span className="ml-2 text-xs" style={{ color: "var(--zr-text-muted)" }}>{m.role}</span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => approveMember(m.id)} disabled={approving === m.id}
                  className="text-xs px-3 py-1 rounded font-medium disabled:opacity-50"
                  style={{ background: "var(--zr-orange)", color: "#fff" }}>
                  {approving === m.id ? "..." : "Approve"}
                </button>
                <button onClick={() => removeMember(m.id, m.full_name ?? "this user")} disabled={removing === m.id}
                  className="text-xs px-2 py-1 rounded font-medium disabled:opacity-50"
                  style={{ color: "var(--zr-error)" }}>
                  {removing === m.id ? "..." : "Deny"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Active members */}
      {loading ? <p className="text-xs" style={{ color: "var(--zr-text-muted)" }}>Loading…</p> : activeMembers.length === 0 ? (
        <p className="text-xs" style={{ color: "var(--zr-text-muted)" }}>No active team members yet.</p>
      ) : (
        <ul className="space-y-3">
          {activeMembers.map(m => {
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
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => setEditingId(editingId === m.id ? null : m.id)}
                      className="text-xs hover:underline"
                      style={{ color: "var(--zr-orange)" }}>
                      {editingId === m.id ? "Close" : "Edit permissions"}
                    </button>
                    {!isMe && (
                      <button
                        onClick={() => removeMember(m.id, m.full_name ?? "this user")}
                        disabled={removing === m.id}
                        className="text-xs hover:underline disabled:opacity-50"
                        style={{ color: "var(--zr-error)" }}>
                        {removing === m.id ? "..." : "Remove"}
                      </button>
                    )}
                  </div>
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

  if (role !== "owner" && role !== "admin") return null;

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
  // Only show for business plan OR the platform owner's company
  const canWhiteLabel = plan === "business" || companyId === OWNER_COMPANY_ID;
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
    if (!companyId || role !== "owner" && role !== "admin") return;
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

  if (role !== "owner" && role !== "admin") return null;

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

// ── Integration Toggles (SMS / Live Payments) ────────────────

function IntegrationToggles() {
  const { companyId, role } = useAuth();
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [livePayEnabled, setLivePayEnabled] = useState(false);
  const [twilioSid, setTwilioSid] = useState("");
  const [twilioToken, setTwilioToken] = useState("");
  const [twilioPhone, setTwilioPhone] = useState("");
  const [stripeConnectId, setStripeConnectId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    supabase.from("companies")
      .select("sms_enabled, live_payments_enabled, twilio_account_sid, twilio_auth_token, twilio_phone_number, stripe_connect_account_id")
      .eq("id", companyId).single()
      .then(({ data }) => {
        if (data) {
          setSmsEnabled(data.sms_enabled || false);
          setLivePayEnabled(data.live_payments_enabled || false);
          setTwilioSid(data.twilio_account_sid || "");
          setTwilioToken(data.twilio_auth_token || "");
          setTwilioPhone(data.twilio_phone_number || "");
          setStripeConnectId(data.stripe_connect_account_id || "");
        }
        setLoading(false);
      });
  }, [companyId]);

  async function saveSms() {
    if (!companyId) return;
    await supabase.from("companies").update({
      sms_enabled: smsEnabled,
      twilio_account_sid: twilioSid || null,
      twilio_auth_token: twilioToken || null,
      twilio_phone_number: twilioPhone || null,
    }).eq("id", companyId);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function toggleSms(val: boolean) {
    setSmsEnabled(val);
    if (!val) {
      await supabase.from("companies").update({ sms_enabled: false }).eq("id", companyId);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }

  async function toggleLivePay(val: boolean) {
    setLivePayEnabled(val);
    await supabase.from("companies").update({ live_payments_enabled: val }).eq("id", companyId);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (role !== "owner" && role !== "admin") return null;
  if (loading) return null;

  return (
    <div className="rounded p-4 space-y-4" style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }}>
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--zr-text-secondary)" }}>Integration Toggles</h2>
        {saved && <span className="text-xs font-medium" style={{ color: "var(--zr-success)" }}>Saved</span>}
      </div>
      <p className="text-xs" style={{ color: "var(--zr-text-muted)" }}>
        Enable cost-bearing integrations when you're ready. They're off by default.
      </p>

      {/* SMS / Twilio */}
      <div className="rounded p-3 space-y-3" style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)" }}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium" style={{ color: "var(--zr-text-primary)" }}>SMS via Twilio</div>
            <div className="text-xs" style={{ color: "var(--zr-text-muted)" }}>
              Send texts directly from ZeroRemake instead of opening the native messaging app. ~$0.0079/msg.
            </div>
          </div>
          <button
            onClick={() => toggleSms(!smsEnabled)}
            className={`relative w-10 h-5 rounded-full transition-colors ${smsEnabled ? "" : "bg-gray-300"}`}
            style={smsEnabled ? { background: "var(--zr-success)" } : {}}>
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${smsEnabled ? "translate-x-5" : "translate-x-0.5"}`} />
          </button>
        </div>

        {smsEnabled && (
          <div className="space-y-2 pt-1">
            <div className="rounded p-2 text-xs" style={{ background: "rgba(59,130,246,0.1)", color: "var(--zr-info)" }}>
              Get your Twilio credentials at <a href="https://console.twilio.com" target="_blank" rel="noreferrer" className="underline">console.twilio.com</a>. New accounts get free trial credit.
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--zr-text-secondary)" }}>Account SID</label>
              <input value={twilioSid} onChange={e => setTwilioSid(e.target.value)}
                placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="w-full rounded px-2 py-1.5 text-sm font-mono"
                style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }} />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--zr-text-secondary)" }}>Auth Token</label>
              <input value={twilioToken} onChange={e => setTwilioToken(e.target.value)}
                type="password" placeholder="Your auth token"
                className="w-full rounded px-2 py-1.5 text-sm font-mono"
                style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }} />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--zr-text-secondary)" }}>Twilio Phone Number</label>
              <input value={twilioPhone} onChange={e => setTwilioPhone(e.target.value)}
                placeholder="+18015551234"
                className="w-full rounded px-2 py-1.5 text-sm font-mono"
                style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }} />
            </div>
            <button onClick={saveSms}
              className="rounded px-3 py-1.5 text-xs font-medium text-white"
              style={{ background: "var(--zr-orange)" }}>
              Save Twilio Settings
            </button>
          </div>
        )}
      </div>

      {/* Stripe Connect / Live Payments */}
      <div className="rounded p-3 space-y-3" style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)" }}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium" style={{ color: "var(--zr-text-primary)" }}>Live Customer Payments</div>
            <div className="text-xs" style={{ color: "var(--zr-text-muted)" }}>
              Accept credit cards and ACH via Stripe Connect on customer invoices. 2.9% + 30¢ per transaction.
            </div>
          </div>
          <button
            onClick={() => toggleLivePay(!livePayEnabled)}
            className={`relative w-10 h-5 rounded-full transition-colors ${livePayEnabled ? "" : "bg-gray-300"}`}
            style={livePayEnabled ? { background: "var(--zr-success)" } : {}}>
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${livePayEnabled ? "translate-x-5" : "translate-x-0.5"}`} />
          </button>
        </div>

        {livePayEnabled && (
          <div className="space-y-2 pt-1">
            <div className="rounded p-2 text-xs" style={{ background: "rgba(59,130,246,0.1)", color: "var(--zr-info)" }}>
              Stripe Connect lets your customers pay directly on their invoice. Funds go to your Stripe account minus processing fees.
            </div>
            {stripeConnectId ? (
              <div className="rounded p-2" style={{ background: "rgba(34,197,94,0.1)", border: "1px solid var(--zr-success)" }}>
                <div className="text-xs font-medium" style={{ color: "var(--zr-success)" }}>Stripe Account Connected</div>
                <div className="text-xs font-mono mt-0.5" style={{ color: "var(--zr-text-muted)" }}>{stripeConnectId}</div>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs" style={{ color: "var(--zr-text-secondary)" }}>
                  You need a Stripe account to accept live payments. Click below to start the onboarding process.
                </p>
                <a href={`/api/stripe/connect/onboard?company_id=${companyId}`}
                  className="inline-block rounded px-3 py-1.5 text-xs font-medium text-white"
                  style={{ background: "#635BFF" }}>
                  Connect with Stripe
                </a>
              </div>
            )}
          </div>
        )}
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

// ── Setup Guide Section ────────────────────────────────────────

type SetupStep = {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  content: React.ReactNode;
  time: string;
};

function SetupSection() {
  const { companyId } = useAuth();
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>("products");

  const emailToken = companyId ? companyId.replace(/-/g, "").slice(0, 12) : "your-token";

  function toggle(id: string) {
    setExpanded(expanded === id ? null : id);
  }

  function markDone(id: string) {
    setCompleted(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const steps: SetupStep[] = [
    {
      id: "products",
      title: "Add Your Products",
      subtitle: "Import your product catalog so you can build quotes fast",
      icon: "📦",
      time: "5 min",
      content: (
        <div className="space-y-3 text-sm">
          <p style={{ color: "var(--zr-text-secondary)" }} >
            Your product catalog is the foundation of ZeroRemake. Add the products you sell
            so they auto-fill on every quote with your cost and markup.
          </p>
          <div className="rounded bg-gray-50 p-3 space-y-2">
            <div className="font-medium text-xs text-gray-800">Option 1: CSV Import (fastest)</div>
            <ol className="text-xs text-gray-600 space-y-1 list-decimal ml-4">
              <li>Export your price list from your manufacturer or create a spreadsheet with columns: name, cost, category, manufacturer, sku</li>
              <li>Save as .csv file</li>
              <li>Go to <Link href="/products" style={{ color: "var(--zr-orange)" }} className="hover:underline">Products</Link> → Import → upload your CSV</li>
              <li>Preview and confirm the import</li>
            </ol>
          </div>
          <div className="rounded bg-gray-50 p-3 space-y-2">
            <div className="font-medium text-xs text-gray-800">Option 2: Add manually</div>
            <p className="text-xs text-gray-600">
              Go to <Link href="/products" style={{ color: "var(--zr-orange)" }} className="hover:underline">Products</Link> → + Add Product. Enter the name, your cost, and your markup multiplier.
            </p>
          </div>
          <div className="rounded bg-blue-50 border border-blue-200 p-2 text-xs text-blue-700">
            💡 Don't worry about getting everything perfect — you can always edit products later. Start with your top 10-20 products.
          </div>
        </div>
      ),
    },
    {
      id: "customer",
      title: "Add Your First Customer",
      subtitle: "Create a customer record and start tracking the lead",
      icon: "👤",
      time: "2 min",
      content: (
        <div className="space-y-3 text-sm">
          <p style={{ color: "var(--zr-text-secondary)" }} >
            Every job starts with a customer. Add them from the dashboard and they'll flow through your pipeline.
          </p>
          <ol className="text-xs text-gray-600 space-y-1.5 list-decimal ml-4">
            <li>Go to <Link href="/" style={{ color: "var(--zr-orange)" }} className="hover:underline">Home</Link> → Customers tab → + Add Customer</li>
            <li>Enter their name, phone, email, and address</li>
            <li>Set their lead status (New, Contacted, Scheduled, etc.)</li>
            <li>Set heat score (Hot / Warm / Cold)</li>
          </ol>
          <div className="rounded bg-blue-50 border border-blue-200 p-2 text-xs text-blue-700">
            💡 Tap the phone number to call, or the text icon to send a message — it auto-logs the activity.
          </div>
        </div>
      ),
    },
    {
      id: "measure",
      title: "Create a Measure Job",
      subtitle: "Measure a customer's windows and track every detail",
      icon: "📐",
      time: "Varies",
      content: (
        <div className="space-y-3 text-sm">
          <p style={{ color: "var(--zr-text-secondary)" }} >
            Measure jobs are the core of ZeroRemake. Every window gets measured with fraction validation
            so bad numbers can't be entered.
          </p>
          <ol className="text-xs text-gray-600 space-y-1.5 list-decimal ml-4">
            <li>Open a customer → Measure Jobs → + New Measure Job</li>
            <li>Add rooms, then add windows to each room</li>
            <li>Enter width, height, mount type, casing depth for each window</li>
            <li>Take photos of each window</li>
            <li>Add notes (voice-to-text works great in the field)</li>
          </ol>
          <div className="rounded bg-amber-50 border border-amber-200 p-2 text-xs text-amber-700">
            ⚡ Fractions are validated to 1/16" increments — if you enter an invalid fraction, the field clears and refocuses so you can fix it immediately.
          </div>
        </div>
      ),
    },
    {
      id: "quote",
      title: "Build & Send a Quote",
      subtitle: "Pull from measurements, set pricing, and get customer approval",
      icon: "💰",
      time: "5 min",
      content: (
        <div className="space-y-3 text-sm">
          <p style={{ color: "var(--zr-text-secondary)" }} >
            Quotes pull directly from your measurements — no retyping. Set your products and pricing,
            then send for customer approval with e-signature.
          </p>
          <ol className="text-xs text-gray-600 space-y-1.5 list-decimal ml-4">
            <li>Open a customer → their measure job → Create Quote</li>
            <li>Click "Pull Windows from Measure" to auto-populate line items</li>
            <li>Assign products from your catalog (or use Quick Add)</li>
            <li>Adjust pricing if needed — margin shows in real time</li>
            <li>Send via text or email — customer gets an approval link</li>
            <li>Customer signs digitally — legally binding with timestamp</li>
          </ol>
        </div>
      ),
    },
    {
      id: "schedule",
      title: "Schedule Appointments",
      subtitle: "Use the calendar to manage your day",
      icon: "📅",
      time: "2 min",
      content: (
        <div className="space-y-3 text-sm">
          <p style={{ color: "var(--zr-text-secondary)" }} >
            Every appointment type has a default duration. After each appointment, you must select an outcome
            — this keeps your pipeline moving automatically.
          </p>
          <ol className="text-xs text-gray-600 space-y-1.5 list-decimal ml-4">
            <li>Go to <Link href="/schedule" style={{ color: "var(--zr-orange)" }} className="hover:underline">Schedule</Link> → + New Appointment</li>
            <li>Pick type: Measure, Install, Sales Consult, Service, etc.</li>
            <li>Link to a customer (auto-fills address)</li>
            <li>Send confirmation text to customer</li>
            <li>Day-of: tap "On My Way" to notify customer</li>
            <li>After: select outcome (Measured, Sold, Needs Quote, etc.)</li>
          </ol>
        </div>
      ),
    },
    {
      id: "email",
      title: "Set Up Order Tracking",
      subtitle: "Auto-track shipments by forwarding manufacturer emails",
      icon: "📧",
      time: "5 min",
      content: (
        <div className="space-y-3 text-sm">
          <p style={{ color: "var(--zr-text-secondary)" }} >
            When you place orders with manufacturers, their shipping emails can be automatically
            parsed to update your material status. No manual tracking needed.
          </p>
          <div className="rounded bg-gray-50 p-3 space-y-2">
            <div className="font-medium text-xs text-gray-800">Your unique email address:</div>
            <div className="flex items-center gap-2">
              <code className="text-xs bg-white border rounded px-2 py-1 font-mono text-blue-700 flex-1 break-all">
                orders-{emailToken}@inbound.postmarkapp.com
              </code>
              <button onClick={() => navigator.clipboard?.writeText(`orders-${emailToken}@inbound.postmarkapp.com`)}
                className="text-xs border rounded px-2 py-1 hover:bg-gray-50 shrink-0">
                Copy
              </button>
            </div>
          </div>

          <div className="rounded bg-gray-50 p-3 space-y-2">
            <div className="font-medium text-xs text-gray-800">Gmail Setup (2 minutes)</div>
            <ol className="text-xs text-gray-600 space-y-1.5 list-decimal ml-4">
              <li>Open Gmail → Settings (gear icon) → See all settings</li>
              <li>Go to "Forwarding and POP/IMAP" tab</li>
              <li>Click "Add a forwarding address"</li>
              <li>Paste: <code className="bg-white border rounded px-1 font-mono">orders-{emailToken}@inbound.postmarkapp.com</code></li>
              <li>Gmail will send a confirmation — once verified, go to Filters</li>
              <li>Create a filter: From contains your manufacturer's email (e.g. "hunterdouglas.com")</li>
              <li>Action: Forward to the address above</li>
              <li>Done! Shipping emails will auto-update your orders.</li>
            </ol>
          </div>

          <div className="rounded bg-gray-50 p-3 space-y-2">
            <div className="font-medium text-xs text-gray-800">Outlook Setup (2 minutes)</div>
            <ol className="text-xs text-gray-600 space-y-1.5 list-decimal ml-4">
              <li>Open Outlook → Settings → Mail → Rules</li>
              <li>Click "+ Add new rule"</li>
              <li>Name it "ZeroRemake Order Tracking"</li>
              <li>Condition: "From" contains your manufacturer's email</li>
              <li>Action: "Forward to" → paste: <code className="bg-white border rounded px-1 font-mono">orders-{emailToken}@inbound.postmarkapp.com</code></li>
              <li>Save the rule. Done!</li>
            </ol>
          </div>

          <div className="rounded bg-gray-50 p-3 space-y-2">
            <div className="font-medium text-xs text-gray-800">How it works after setup:</div>
            <ol className="text-xs text-gray-600 space-y-1.5 list-decimal ml-4">
              <li>You place an order with the manufacturer (by phone, web, etc.)</li>
              <li>Upload the order confirmation PDF in your quote's Materials tab</li>
              <li>ZeroRemake extracts the order number and expected packages</li>
              <li>When shipping/delivery emails come in, they auto-match to your order</li>
              <li>Package status updates automatically: Ordered → Shipped → Received</li>
              <li>When all packages arrive, you get a "Ready to schedule install" alert</li>
            </ol>
          </div>

          <div className="rounded bg-blue-50 border border-blue-200 p-2 text-xs text-blue-700">
            💡 You can add forwarding rules for multiple manufacturers. Each one's emails will be matched to the right order automatically.
          </div>
        </div>
      ),
    },
    {
      id: "team",
      title: "Invite Your Team",
      subtitle: "Add installers, sales reps, and office staff",
      icon: "👥",
      time: "2 min",
      content: (
        <div className="space-y-3 text-sm">
          <p style={{ color: "var(--zr-text-secondary)" }} >
            Each team member gets their own login with role-based permissions. Installers can't see pricing,
            sales reps can't change settings, etc.
          </p>
          <ol className="text-xs text-gray-600 space-y-1.5 list-decimal ml-4">
            <li>Go to <Link href="/settings" style={{ color: "var(--zr-orange)" }} className="hover:underline">Settings</Link> → Team section</li>
            <li>Copy the invite link and send it to your team member</li>
            <li>They sign up using that link — automatically joins your company</li>
            <li>Set their role (Installer, Sales, Office, etc.)</li>
            <li>Customize individual permissions if the preset doesn't fit</li>
          </ol>
          <div className="rounded bg-gray-50 p-3 text-xs">
            <div className="font-medium text-gray-800 mb-1">Role Quick Reference:</div>
            <div className="grid grid-cols-2 gap-1 text-gray-600">
              <div><strong>Owner</strong> — Full access to everything</div>
              <div><strong>Admin</strong> — Full access to everything</div>
              <div><strong>Lead Sales</strong> — Customers, quotes, pricing, reports</div>
              <div><strong>Sales Rep</strong> — Customers, quotes, pricing, schedule</div>
              <div><strong>Office Staff</strong> — Customers, schedule, materials</div>
              <div><strong>Installer</strong> — Install view only, no pricing</div>
              <div><strong>Warehouse</strong> — Materials tracking only</div>
              <div><strong>Scheduler</strong> — Calendar and customer names only</div>
              <div><strong>Accounting</strong> — Pricing, financials, reports</div>
            </div>
          </div>
          <div className="rounded bg-blue-50 border border-blue-200 p-2 text-xs text-blue-700">
            💡 You can override any permission on a per-person basis. The role just sets the starting point.
          </div>
        </div>
      ),
    },
    {
      id: "settings",
      title: "Set Up Your Company Info",
      subtitle: "Add your business details, defaults, and branding",
      icon: "⚙️",
      time: "3 min",
      content: (
        <div className="space-y-3 text-sm">
          <p style={{ color: "var(--zr-text-secondary)" }} >
            Your company info shows on quotes and customer communications. Set your defaults once
            and they apply everywhere.
          </p>
          <ol className="text-xs text-gray-600 space-y-1.5 list-decimal ml-4">
            <li>Go to <Link href="/settings" style={{ color: "var(--zr-orange)" }} className="hover:underline">Settings</Link></li>
            <li>Fill in your company name, phone, email, address</li>
            <li>Set your default deposit percentage (e.g. 50%)</li>
            <li>Set your default markup multiplier (e.g. 2.5x)</li>
            <li>Set quote validity days (e.g. 30 days)</li>
            <li>Add your Google Review link for post-install follow-ups</li>
          </ol>
        </div>
      ),
    },
  ];

  const completedCount = completed.size;
  const totalSteps = steps.length;
  const progressPct = Math.round((completedCount / totalSteps) * 100);

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="rounded p-3" style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium" style={{ color: "var(--zr-text-secondary)" }}>{completedCount} of {totalSteps} steps complete</span>
          <span className="text-xs" style={{ color: "var(--zr-text-muted)" }}>{progressPct}%</span>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--zr-surface-2)" }}>
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progressPct}%`, background: "var(--zr-success)" }} />
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-2">
        {steps.map(step => {
          const isDone = completed.has(step.id);
          const isOpen = expanded === step.id;
          return (
            <div key={step.id} className="rounded transition-colors" style={{
              background: isDone ? "rgba(34, 197, 94, 0.1)" : "var(--zr-surface-1)",
              border: isDone ? "1px solid var(--zr-success)" : "1px solid var(--zr-border)"
            }}>
              <button onClick={() => toggle(step.id)}
                className="w-full flex items-center gap-3 px-3 py-3 text-left">
                <button onClick={(e) => { e.stopPropagation(); markDone(step.id); }}
                  className="shrink-0 transition-colors rounded-full border-2 w-6 h-6 flex items-center justify-center"
                  style={{
                    borderColor: isDone ? "var(--zr-success)" : "var(--zr-border)",
                    background: isDone ? "var(--zr-success)" : "transparent",
                    color: isDone ? "white" : "inherit"
                  }}>
                  {isDone && <span className="text-xs">✓</span>}
                </button>
                <div className="text-xl shrink-0">{step.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm" style={{
                    color: isDone ? "var(--zr-text-muted)" : "var(--zr-text-primary)",
                    textDecoration: isDone ? "line-through" : "none"
                  }}>{step.title}</div>
                  <div className="text-xs" style={{ color: "var(--zr-text-muted)" }}>{step.subtitle}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs" style={{ color: "var(--zr-text-muted)" }}>{step.time}</span>
                  <span className="text-xs" style={{ color: "var(--zr-text-muted)" }}>{isOpen ? "▾" : "▸"}</span>
                </div>
              </button>
              {isOpen && (
                <div className="px-3 pb-3 pl-14">
                  {step.content}
                  {!isDone && (
                    <button onClick={() => markDone(step.id)}
                      className="mt-3 text-xs text-white rounded px-3 py-1.5"
                      style={{ background: "var(--zr-success)" }}>
                      Mark as Done
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* All done */}
      {completedCount === totalSteps && (
        <div className="rounded p-4 text-center space-y-2" style={{
          background: "rgba(34, 197, 94, 0.1)",
          border: "1px solid var(--zr-success)"
        }}>
          <div className="text-2xl">🎉</div>
          <div className="font-bold" style={{ color: "var(--zr-success)" }}>You're all set!</div>
          <p className="text-xs" style={{ color: "var(--zr-success)" }}>
            Your ZeroRemake account is fully configured. You can always come back here if you need a refresher.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Dashboard Widgets (per-user) ─────────────────────────────
function DashboardWidgetsSection() {
  const { role } = useAuth();
  const defaultLayout = ROLE_LAYOUTS[role] || ROLE_LAYOUTS.owner;
  const [order, setOrder] = useState<WidgetId[]>(defaultLayout);
  const [hidden, setHidden] = useState<WidgetId[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data?.user) return;
      supabase.from("profiles").select("dashboard_layout").eq("id", data.user.id).single().then(({ data: prof }) => {
        if (prof?.dashboard_layout) {
          const saved = prof.dashboard_layout as { order?: WidgetId[]; hidden?: WidgetId[] };
          if (saved.order && saved.order.length > 0) {
            const known = new Set(saved.order);
            const newWidgets = (WIDGET_IDS as readonly WidgetId[]).filter(w => !known.has(w));
            setOrder([...saved.order, ...newWidgets]);
          }
          if (saved.hidden) setHidden(saved.hidden);
        }
        setLoaded(true);
      });
    });
  }, []);

  async function persist(newOrder: WidgetId[], newHidden: WidgetId[]) {
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    if (u?.user) {
      await supabase.from("profiles").update({ dashboard_layout: { order: newOrder, hidden: newHidden } }).eq("id", u.user.id);
    }
    setSaving(false);
  }

  function move(id: WidgetId, dir: -1 | 1) {
    setOrder(prev => {
      const idx = prev.indexOf(id);
      if (idx < 0) return prev;
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      persist(next, hidden);
      return next;
    });
  }

  function toggle(id: WidgetId) {
    setHidden(prev => {
      const next = prev.includes(id) ? prev.filter(w => w !== id) : [...prev, id];
      persist(order, next);
      return next;
    });
  }

  function reset() {
    setOrder(defaultLayout);
    setHidden([]);
    persist(defaultLayout, []);
  }

  if (!loaded) return null;

  return (
    <div className="rounded p-4 space-y-3" style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }}>
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--zr-text-secondary)" }}>Dashboard Widgets</h2>
        <div className="flex items-center gap-2">
          {saving && <span className="text-xs" style={{ color: "var(--zr-text-muted)" }}>Saving...</span>}
          <button onClick={reset} className="text-xs px-2 py-1 rounded" style={{ color: "var(--zr-text-muted)", border: "1px solid var(--zr-border)" }}>
            Reset to Default
          </button>
        </div>
      </div>
      <p className="text-xs" style={{ color: "var(--zr-text-muted)" }}>
        Choose which widgets appear on your dashboard and their order. Toggle off widgets you don&apos;t need.
      </p>

      {/* Widget list */}
      <div className="space-y-1">
        {order.map((id, idx) => {
          const isHidden = hidden.includes(id);
          return (
            <div key={id} className="flex items-center justify-between py-1.5 px-2 rounded"
              style={{ background: isHidden ? "transparent" : "var(--zr-surface-2)", border: "1px solid var(--zr-border)", opacity: isHidden ? 0.5 : 1 }}>
              <div className="flex items-center gap-2.5">
                {/* Toggle */}
                <button onClick={() => toggle(id)} className="relative w-8 h-[18px] rounded-full transition-colors"
                  style={{ background: isHidden ? "var(--zr-border)" : "var(--zr-orange)" }}>
                  <span className="absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-all"
                    style={{ left: isHidden ? "2px" : "14px" }} />
                </button>
                <span className="text-xs font-medium" style={{ color: isHidden ? "var(--zr-text-muted)" : "var(--zr-text-primary)" }}>
                  {WIDGET_LABELS[id]}
                </span>
              </div>
              {!isHidden && (
                <div className="flex gap-1">
                  <button onClick={() => move(id, -1)} disabled={idx === 0}
                    className="text-xs px-1.5 py-0.5 rounded"
                    style={{ background: "var(--zr-surface-1)", color: idx === 0 ? "var(--zr-border)" : "var(--zr-text-secondary)", border: "1px solid var(--zr-border)" }}>
                    ▲
                  </button>
                  <button onClick={() => move(id, 1)} disabled={idx === order.length - 1}
                    className="text-xs px-1.5 py-0.5 rounded"
                    style={{ background: "var(--zr-surface-1)", color: idx === order.length - 1 ? "var(--zr-border)" : "var(--zr-text-secondary)", border: "1px solid var(--zr-border)" }}>
                    ▼
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { permissions: myPerms } = useAuth();
  const searchParams = useSearchParams();
  const initialTab = (["company", "team", "setup"] as const).includes(searchParams.get("tab") as any)
    ? (searchParams.get("tab") as "company" | "team" | "setup")
    : "company";
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saved,    setSaved]    = useState(false);
  const [loading,  setLoading]  = useState(true);
  const [activeTab, setActiveTab] = useState<"company" | "team" | "setup" | "dashboard">(initialTab);

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

  const showTeamTab = myPerms.manage_team;
  const showSetupTab = myPerms.access_settings || myPerms.manage_team;

  return (
    <PermissionGate require={["access_settings", "manage_team"]}>
      <main className="min-h-screen p-4 text-sm" style={{ background: "var(--zr-black)", color: "var(--zr-text-primary)" }}>
        <div className="mx-auto max-w-2xl space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold" style={{ color: "var(--zr-text-primary)" }}>Settings</h1>
          {saved && <span className="text-xs font-medium" style={{ color: "var(--zr-success)" }}>✓ Saved</span>}
        </div>

        {/* Tab bar */}
        <div className="flex gap-6 border-b" style={{ borderBottomColor: "var(--zr-border)" }}>
          <button
            onClick={() => setActiveTab("company")}
            className="px-0 py-2 text-sm font-medium transition-colors"
            style={{
              color: activeTab === "company" ? "var(--zr-orange)" : "var(--zr-text-muted)",
              borderBottom: activeTab === "company" ? "2px solid var(--zr-orange)" : "2px solid transparent"
            }}>
            Company
          </button>
          <button
            onClick={() => setActiveTab("dashboard")}
            className="px-0 py-2 text-sm font-medium transition-colors"
            style={{
              color: activeTab === "dashboard" ? "var(--zr-orange)" : "var(--zr-text-muted)",
              borderBottom: activeTab === "dashboard" ? "2px solid var(--zr-orange)" : "2px solid transparent"
            }}>
            My Dashboard
          </button>
          {showTeamTab && (
            <button
              onClick={() => setActiveTab("team")}
              className="px-0 py-2 text-sm font-medium transition-colors"
              style={{
                color: activeTab === "team" ? "var(--zr-orange)" : "var(--zr-text-muted)",
                borderBottom: activeTab === "team" ? "2px solid var(--zr-orange)" : "2px solid transparent"
              }}>
              Team
            </button>
          )}
          {showSetupTab && (
            <button
              onClick={() => setActiveTab("setup")}
              className="px-0 py-2 text-sm font-medium transition-colors"
              style={{
                color: activeTab === "setup" ? "var(--zr-orange)" : "var(--zr-text-muted)",
                borderBottom: activeTab === "setup" ? "2px solid var(--zr-orange)" : "2px solid transparent"
              }}>
              Setup
            </button>
          )}
        </div>

        {/* Company Tab */}
        {activeTab === "company" && (
          <div className="space-y-5">
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

            {/* Warehouse Locations */}
            <WarehouseLocationsSection settings={settings} setSettings={setSettings} />

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

            <IntegrationToggles />
            <PlanSection />
            <BrandingSection />
            <EmailTrackingSection />
            <ChecklistSection />
            <DataExportSection />
          </div>
        )}

        {/* My Dashboard Tab */}
        {activeTab === "dashboard" && (
          <div className="space-y-5">
            <p className="text-xs" style={{ color: "var(--zr-text-muted)" }}>Customize which widgets you see on your dashboard and their order. These settings are per-user — each team member can have their own layout.</p>
            <DashboardWidgetsSection />
          </div>
        )}

        {/* Team Tab */}
        {activeTab === "team" && (
          <div className="space-y-5">
            <PendingApprovalsSection />
            <TeamSection />
          </div>
        )}

        {/* Setup Tab */}
        {activeTab === "setup" && (
          <SetupSection />
        )}

        </div>
      </main>
    </PermissionGate>
  );
}
