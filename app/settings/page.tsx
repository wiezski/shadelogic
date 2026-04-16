"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../auth-provider";
import { PermissionGate } from "../permission-gate";
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

// ── Email order tracking ──────────────────────────────────────

function EmailTrackingSection() {
  const { companyId } = useAuth();
  const [settings,  setSettings]  = useState<{ notify_on_shipped: boolean; notify_on_delivered: boolean; notify_channel: string } | null>(null);
  const [copied,    setCopied]    = useState(false);

  const token   = companyId ? companyId.replace(/-/g, "").slice(0, 12) : "";
  const inbound = token ? `orders-${token}@inbound.postmarkapp.com` : "";

  useEffect(() => {
    supabase.from("company_settings").select("notify_on_shipped, notify_on_delivered, notify_channel").limit(1).single()
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
        Forward manufacturer order emails to your unique address and ShadeLogic automatically updates order status — shipped, delivered, tracking numbers — without you lifting a finger.
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
    a.download = `shadelogic-export-${new Date().toISOString().slice(0,10)}.json`;
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
    const { data } = await supabase.from("company_settings").select("*").limit(1).single();
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

        <EmailTrackingSection />
        <TeamSection />
        <DataExportSection />

        </div>
      </main>
    </PermissionGate>
  );
}
