"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../auth-provider";
import { PermissionGate } from "../permission-gate";
import { Skeleton, EmptyState } from "../ui";
import { ROLES, ROLE_LABELS, type Role } from "../../lib/permissions";

// ── Types ──────────────────────────────────────────────────────
type TeamMember = {
  id: string;
  full_name: string | null;
  role: string;
};

type PayRate = {
  id: string;
  profile_id: string;
  pay_type: string;
  rate: number;
  commission_pct: number | null;
  notes: string | null;
  active: boolean;
  created_at: string;
};

type PayStats = {
  total_earned: number;
  entry_count: number;
  last_entry_date: string | null;
};

// ── Helpers ────────────────────────────────────────────────────
function fmtMoney(n: number) {
  return "$" + (n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

const PAY_TYPE_LABELS: Record<string, string> = {
  hourly: "Hourly",
  per_job: "Per Job",
  per_window: "Per Window",
  salary: "Salary",
  commission_only: "Commission Only",
};

const PAY_TYPE_OPTIONS = Object.entries(PAY_TYPE_LABELS);

const ROLE_COLORS: Record<string, string> = {
  owner: "bg-amber-100 text-amber-800",
  lead_sales: "bg-purple-100 text-purple-700",
  sales: "bg-blue-100 text-blue-700",
  office: "bg-gray-100 text-gray-700",
  accounting: "bg-green-100 text-green-700",
  scheduler: "bg-cyan-100 text-cyan-700",
  installer: "bg-orange-100 text-orange-700",
  warehouse: "bg-stone-100 text-stone-600",
};

// ── Page ───────────────────────────────────────────────────────
export default function TeamPage() {
  return (
    <PermissionGate require="manage_team">
      <TeamPageInner />
    </PermissionGate>
  );
}

function TeamPageInner() {
  const { companyId, user } = useAuth();
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [rates, setRates] = useState<PayRate[]>([]);
  const [stats, setStats] = useState<Record<string, PayStats>>({});
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    loadAll();
  }, [companyId]); // eslint-disable-line

  async function loadAll() {
    setLoading(true);
    const [teamRes, ratesRes, entriesRes] = await Promise.all([
      supabase.from("profiles").select("id, full_name, role").eq("company_id", companyId),
      supabase.from("pay_rates").select("*").eq("active", true).order("created_at", { ascending: false }),
      supabase.from("pay_entries").select("profile_id, amount, work_date").order("work_date", { ascending: false }),
    ]);
    setTeam(teamRes.data ?? []);
    setRates(ratesRes.data ?? []);

    // Compute per-person stats
    const s: Record<string, PayStats> = {};
    for (const e of (entriesRes.data ?? [])) {
      if (!s[e.profile_id]) s[e.profile_id] = { total_earned: 0, entry_count: 0, last_entry_date: null };
      s[e.profile_id].total_earned += e.amount || 0;
      s[e.profile_id].entry_count += 1;
      if (!s[e.profile_id].last_entry_date || e.work_date > s[e.profile_id].last_entry_date!) {
        s[e.profile_id].last_entry_date = e.work_date;
      }
    }
    setStats(s);
    setLoading(false);
  }

  function getRate(pid: string): PayRate | undefined {
    return rates.find(r => r.profile_id === pid && r.active);
  }

  if (loading) {
    return (
      <div style={{ padding: "24px", maxWidth: 900, margin: "0 auto" }}>
        <Skeleton w="160px" h="28px" />
        <div style={{ height: 16 }} />
        <Skeleton lines={6} />
      </div>
    );
  }

  return (
    <div style={{ padding: "24px", maxWidth: 900, margin: "0 auto" }}>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--zr-text-primary)" }}>Team</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--zr-text-muted)" }}>
            {team.length} member{team.length !== 1 ? "s" : ""} · Manage roles, pay rates, and commissions
          </p>
        </div>
      </div>

      {team.length === 0 ? (
        <EmptyState title="No team members" subtitle="Invite your first team member from Settings." />
      ) : (
        <div className="flex flex-col gap-3">
          {team.map(m => {
            const rate = getRate(m.id);
            const stat = stats[m.id];
            const isMe = m.id === user?.id;
            const isExpanded = expandedId === m.id;

            return (
              <div key={m.id} className="rounded-lg overflow-hidden"
                style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)" }}>
                {/* Summary row */}
                <button className="w-full text-left px-4 py-3 flex items-center gap-3 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : m.id)}
                  style={{ background: isExpanded ? "var(--zr-surface-1)" : "transparent" }}>
                  {/* Avatar circle */}
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                    style={{ background: "var(--zr-primary)", color: "#fff" }}>
                    {(m.full_name || "?").charAt(0).toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm" style={{ color: "var(--zr-text-primary)" }}>
                        {m.full_name || "Unnamed"}
                      </span>
                      {isMe && <span className="text-xs" style={{ color: "var(--zr-text-muted)" }}>(you)</span>}
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[m.role] || "bg-gray-100 text-gray-600"}`}>
                        {ROLE_LABELS[m.role as Role] || m.role}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs" style={{ color: "var(--zr-text-muted)" }}>
                      {rate ? (
                        <span>
                          {PAY_TYPE_LABELS[rate.pay_type] || rate.pay_type}
                          {rate.rate > 0 && ` · ${fmtMoney(rate.rate)}`}
                          {rate.commission_pct != null && ` · ${rate.commission_pct}% comm`}
                        </span>
                      ) : (
                        <span>No pay rate set</span>
                      )}
                      {stat && <span>· {fmtMoney(stat.total_earned)} earned</span>}
                    </div>
                  </div>

                  <span className="text-xs shrink-0" style={{ color: "var(--zr-text-muted)" }}>
                    {isExpanded ? "▲" : "▼"}
                  </span>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-1" style={{ borderTop: "1px solid var(--zr-border)" }}>
                    <PayRateEditor
                      member={m}
                      currentRate={rate}
                      stats={stat}
                      onUpdated={loadAll}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Pay Rate Editor (inline per member) ────────────────────────
function PayRateEditor({ member, currentRate, stats, onUpdated }: {
  member: TeamMember;
  currentRate: PayRate | undefined;
  stats: PayStats | undefined;
  onUpdated: () => void;
}) {
  const [payType, setPayType] = useState(currentRate?.pay_type || "hourly");
  const [rate, setRate] = useState(currentRate?.rate?.toString() || "");
  const [commPct, setCommPct] = useState(currentRate?.commission_pct?.toString() || "");
  const [notes, setNotes] = useState(currentRate?.notes || "");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  function markDirty() { setDirty(true); }

  async function save() {
    setSaving(true);
    // Deactivate old rate
    if (currentRate) {
      await supabase.from("pay_rates").update({ active: false }).eq("id", currentRate.id);
    }
    // Insert new
    await supabase.from("pay_rates").insert([{
      profile_id: member.id,
      pay_type: payType,
      rate: rate ? parseFloat(rate) : 0,
      commission_pct: commPct ? parseFloat(commPct) : null,
      notes: notes || null,
      active: true,
    }]);
    setSaving(false);
    setDirty(false);
    onUpdated();
  }

  function getRateLabel(): string {
    switch (payType) {
      case "hourly": return "Hourly Rate ($)";
      case "per_job": return "Per Job Rate ($)";
      case "per_window": return "Per Window Rate ($)";
      case "salary": return "Salary Amount ($)";
      case "commission_only": return "Base Rate ($)";
      default: return "Rate ($)";
    }
  }

  return (
    <div>
      {/* Stats row */}
      {stats && (
        <div className="flex gap-4 mb-3 flex-wrap">
          <div className="rounded-lg px-3 py-2" style={{ background: "var(--zr-surface-2)" }}>
            <div className="text-xs" style={{ color: "var(--zr-text-muted)" }}>Total Earned</div>
            <div className="text-sm font-bold" style={{ color: "var(--zr-success, #22c55e)" }}>{fmtMoney(stats.total_earned)}</div>
          </div>
          <div className="rounded-lg px-3 py-2" style={{ background: "var(--zr-surface-2)" }}>
            <div className="text-xs" style={{ color: "var(--zr-text-muted)" }}>Pay Entries</div>
            <div className="text-sm font-bold" style={{ color: "var(--zr-text-primary)" }}>{stats.entry_count}</div>
          </div>
          {stats.last_entry_date && (
            <div className="rounded-lg px-3 py-2" style={{ background: "var(--zr-surface-2)" }}>
              <div className="text-xs" style={{ color: "var(--zr-text-muted)" }}>Last Entry</div>
              <div className="text-sm font-bold" style={{ color: "var(--zr-text-primary)" }}>
                {new Date(stats.last_entry_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Pay config form */}
      <div className="text-xs font-semibold mb-2" style={{ color: "var(--zr-text-muted)" }}>COMPENSATION</div>
      <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: "var(--zr-text-muted)" }}>Pay Type</label>
          <select value={payType} onChange={e => { setPayType(e.target.value); markDirty(); }}
            className="w-full text-sm rounded px-2.5 py-2"
            style={{ background: "var(--zr-surface-2)", color: "var(--zr-text-primary)", border: "1px solid var(--zr-border)" }}>
            {PAY_TYPE_OPTIONS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: "var(--zr-text-muted)" }}>{getRateLabel()}</label>
          <input type="number" step="0.01" placeholder="0.00" value={rate}
            onChange={e => { setRate(e.target.value); markDirty(); }}
            className="w-full text-sm rounded px-2.5 py-2"
            style={{ background: "var(--zr-surface-2)", color: "var(--zr-text-primary)", border: "1px solid var(--zr-border)" }} />
        </div>
      </div>

      <div className="grid gap-3 mt-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: "var(--zr-text-muted)" }}>
            Commission % {payType !== "commission_only" && payType !== "salary" ? "(optional)" : ""}
          </label>
          <input type="number" step="0.5" placeholder="0" value={commPct}
            onChange={e => { setCommPct(e.target.value); markDirty(); }}
            className="w-full text-sm rounded px-2.5 py-2"
            style={{ background: "var(--zr-surface-2)", color: "var(--zr-text-primary)", border: "1px solid var(--zr-border)" }} />
        </div>
        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: "var(--zr-text-muted)" }}>Notes</label>
          <input type="text" placeholder="e.g. Senior rate, probation rate" value={notes}
            onChange={e => { setNotes(e.target.value); markDirty(); }}
            className="w-full text-sm rounded px-2.5 py-2"
            style={{ background: "var(--zr-surface-2)", color: "var(--zr-text-primary)", border: "1px solid var(--zr-border)" }} />
        </div>
      </div>

      {/* Save button — only shows when dirty */}
      {dirty && (
        <div className="mt-3 flex items-center gap-2">
          <button onClick={save} disabled={saving}
            className="text-xs px-4 py-2 rounded font-medium transition-colors"
            style={{ background: "var(--zr-primary)", color: "#fff", opacity: saving ? 0.5 : 1 }}>
            {saving ? "Saving..." : "Save Pay Rate"}
          </button>
          <button onClick={() => {
            setPayType(currentRate?.pay_type || "hourly");
            setRate(currentRate?.rate?.toString() || "");
            setCommPct(currentRate?.commission_pct?.toString() || "");
            setNotes(currentRate?.notes || "");
            setDirty(false);
          }}
            className="text-xs px-3 py-2 rounded font-medium"
            style={{ color: "var(--zr-text-muted)" }}>
            Cancel
          </button>
        </div>
      )}

      {/* Current rate summary if no changes */}
      {!dirty && currentRate && (
        <div className="mt-3 text-xs" style={{ color: "var(--zr-text-muted)" }}>
          Current rate set {new Date(currentRate.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          {currentRate.notes && ` · ${currentRate.notes}`}
        </div>
      )}
    </div>
  );
}
