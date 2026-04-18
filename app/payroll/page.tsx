"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../auth-provider";
import { PermissionGate } from "../permission-gate";
import { Skeleton, EmptyState } from "../ui";

// ── Types (matched to actual DB schema) ────────────────────────
type TeamMember = {
  id: string;
  full_name: string | null;
  role: string;
};

type PayRate = {
  id: string;
  profile_id: string;
  pay_type: string; // hourly, per_job, per_window, salary, commission_only
  rate: number;
  commission_pct: number | null;
  notes: string | null;
  active: boolean;
  created_at: string;
};

type PayEntry = {
  id: string;
  profile_id: string;
  entry_type: string; // hours, job, commission, bonus, deduction
  hours: number | null;
  hourly_rate: number | null;
  job_id: string | null;
  job_rate: number | null;
  window_count: number | null;
  per_window_rate: number | null;
  quote_id: string | null;
  customer_id: string | null;
  sale_amount: number | null;
  commission_pct: number | null;
  amount: number;
  description: string | null;
  work_date: string;
  status: string; // pending, approved, paid
  notes: string | null;
  created_at: string;
};

type PayrollRun = {
  id: string;
  period_start: string;
  period_end: string;
  status: string; // draft, finalized, paid
  total_amount: number;
  notes: string | null;
  finalized_at: string | null;
  paid_at: string | null;
  created_at: string;
};

// ── Helpers ────────────────────────────────────────────────────
function fmtMoney(n: number) {
  return "$" + (n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function shortDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const PAY_TYPE_LABELS: Record<string, string> = {
  hourly: "Hourly",
  per_job: "Per Job",
  per_window: "Per Window",
  salary: "Salary",
  commission_only: "Commission Only",
};

const ENTRY_TYPE_LABELS: Record<string, string> = {
  hours: "Hours",
  job: "Job",
  commission: "Commission",
  bonus: "Bonus",
  deduction: "Deduction",
};

const STATUS_BADGE: Record<string, { bg: string; text: string }> = {
  pending: { bg: "bg-amber-100", text: "text-amber-700" },
  approved: { bg: "bg-blue-100", text: "text-blue-700" },
  paid: { bg: "bg-green-100", text: "text-green-700" },
};

// ── Page wrapper ───────────────────────────────────────────────
export default function PayrollPage() {
  return (
    <PermissionGate require="view_financials">
      <PayrollPageInner />
    </PermissionGate>
  );
}

// ── Main page ──────────────────────────────────────────────────
function PayrollPageInner() {
  const { companyId } = useAuth();
  const [tab, setTab] = useState<"entries" | "rates" | "runs">("entries");
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [rates, setRates] = useState<PayRate[]>([]);
  const [entries, setEntries] = useState<PayEntry[]>([]);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterPerson, setFilterPerson] = useState<string>("all");
  const [filterRange, setFilterRange] = useState<"7d" | "30d" | "90d" | "all">("30d");

  useEffect(() => {
    if (!companyId) return;
    loadAll();
  }, [companyId]); // eslint-disable-line

  async function loadAll() {
    setLoading(true);
    // Load team first so we can filter pay data to company members only
    const teamRes = await supabase.from("profiles").select("id, full_name, role").eq("company_id", companyId);
    const teamList = teamRes.data ?? [];
    const memberIds = teamList.map(t => t.id);
    setTeam(teamList);

    const [ratesRes, entriesRes, runsRes] = await Promise.all([
      memberIds.length > 0
        ? supabase.from("pay_rates").select("*").in("profile_id", memberIds).eq("active", true).order("created_at", { ascending: false })
        : Promise.resolve({ data: [] }),
      memberIds.length > 0
        ? supabase.from("pay_entries").select("*").in("profile_id", memberIds).order("work_date", { ascending: false }).limit(200)
        : Promise.resolve({ data: [] }),
      supabase.from("payroll_runs").select("*").order("period_start", { ascending: false }).limit(50),
    ]);
    setRates(ratesRes.data ?? []);
    setEntries(entriesRes.data ?? []);
    setRuns(runsRes.data ?? []);
    setLoading(false);
  }

  // Computed summaries
  const rangeMs = filterRange === "7d" ? 7 * 86400000
    : filterRange === "30d" ? 30 * 86400000
    : filterRange === "90d" ? 90 * 86400000
    : Infinity;
  const cutoff = rangeMs === Infinity ? "" : new Date(Date.now() - rangeMs).toISOString().slice(0, 10);

  const filteredEntries = entries.filter(e => {
    if (filterPerson !== "all" && e.profile_id !== filterPerson) return false;
    if (cutoff && e.work_date < cutoff) return false;
    return true;
  });

  const totalEarnings = filteredEntries.reduce((s, e) => s + (e.amount || 0), 0);
  const totalHours = filteredEntries.filter(e => e.entry_type === "hours").reduce((s, e) => s + (e.hours || 0), 0);
  const totalJobs = filteredEntries.filter(e => e.entry_type === "job").reduce((s, e) => s + 1, 0);
  const totalCommission = filteredEntries.filter(e => e.entry_type === "commission").reduce((s, e) => s + (e.amount || 0), 0);

  // Per-person summary
  const personSummary = new Map<string, { name: string; total: number; hours: number; jobs: number; commission: number }>();
  for (const e of filteredEntries) {
    const name = team.find(t => t.id === e.profile_id)?.full_name || "Unknown";
    if (!personSummary.has(e.profile_id)) {
      personSummary.set(e.profile_id, { name, total: 0, hours: 0, jobs: 0, commission: 0 });
    }
    const s = personSummary.get(e.profile_id)!;
    s.total += e.amount || 0;
    if (e.entry_type === "hours") s.hours += e.hours || 0;
    if (e.entry_type === "job") s.jobs += 1;
    if (e.entry_type === "commission") s.commission += e.amount || 0;
  }

  if (loading) {
    return (
      <div style={{ padding: "24px", maxWidth: 1100, margin: "0 auto" }}>
        <Skeleton w="200px" h="28px" />
        <div style={{ height: 16 }} />
        <Skeleton lines={5} />
      </div>
    );
  }

  return (
    <div style={{ padding: "24px", maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <h1 className="text-xl font-bold" style={{ color: "var(--zr-text-primary)" }}>
          Payroll & Commissions
        </h1>
        <div className="flex gap-2">
          <AddEntryButton team={team} rates={rates} onAdded={loadAll} />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <SummaryCard label="Total Earnings" value={fmtMoney(totalEarnings)} />
        <SummaryCard label="Hours Logged" value={totalHours.toFixed(1)} />
        <SummaryCard label="Jobs Completed" value={String(totalJobs)} />
        <SummaryCard label="Commissions" value={fmtMoney(totalCommission)} />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <select value={filterPerson} onChange={e => setFilterPerson(e.target.value)}
          className="text-sm rounded px-2.5 py-1.5"
          style={{ background: "var(--zr-surface-2)", color: "var(--zr-text-primary)", border: "1px solid var(--zr-border)" }}>
          <option value="all">All Team Members</option>
          {team.map(t => (
            <option key={t.id} value={t.id}>{t.full_name || t.role}</option>
          ))}
        </select>
        <div className="flex rounded overflow-hidden" style={{ border: "1px solid var(--zr-border)" }}>
          {(["7d", "30d", "90d", "all"] as const).map((r, i) => (
            <button key={r} onClick={() => setFilterRange(r)}
              className="px-3 py-1.5 text-xs font-medium transition-colors"
              style={{
                background: filterRange === r ? "var(--zr-primary)" : "var(--zr-surface-2)",
                color: filterRange === r ? "#fff" : "var(--zr-text-secondary)",
                borderLeft: i > 0 ? "1px solid var(--zr-border)" : "none",
              }}>
              {r === "all" ? "All" : r}
            </button>
          ))}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-0.5 mb-4 rounded overflow-hidden" style={{ background: "var(--zr-surface-2)", padding: 2, display: "inline-flex" }}>
        {(["entries", "rates", "runs"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="px-4 py-1.5 text-sm font-medium rounded transition-colors capitalize"
            style={{
              background: tab === t ? "var(--zr-surface-1)" : "transparent",
              color: tab === t ? "var(--zr-text-primary)" : "var(--zr-text-muted)",
              boxShadow: tab === t ? "0 1px 3px rgba(0,0,0,.15)" : "none",
            }}>
            {t === "entries" ? "Pay Entries" : t === "rates" ? "Pay Rates" : "Payroll Runs"}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "entries" && (
        <EntriesTab entries={filteredEntries} team={team} personSummary={personSummary} onUpdated={loadAll} />
      )}
      {tab === "rates" && (
        <RatesTab rates={rates} team={team} onUpdated={loadAll} />
      )}
      {tab === "runs" && (
        <RunsTab runs={runs} onUpdated={loadAll} />
      )}
    </div>
  );
}

// ── Summary Card ───────────────────────────────────────────────
function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)",
      borderRadius: "var(--zr-radius-md)", padding: "14px 16px",
    }}>
      <div className="text-xs font-medium mb-1" style={{ color: "var(--zr-text-muted)" }}>{label}</div>
      <div className="text-lg font-bold" style={{ color: "var(--zr-text-primary)" }}>{value}</div>
    </div>
  );
}

// ── Entries Tab ────────────────────────────────────────────────
function EntriesTab({ entries, team, personSummary, onUpdated }: {
  entries: PayEntry[];
  team: TeamMember[];
  personSummary: Map<string, { name: string; total: number; hours: number; jobs: number; commission: number }>;
  onUpdated: () => void;
}) {
  async function updateStatus(id: string, status: string) {
    await supabase.from("pay_entries").update({
      status,
      ...(status === "approved" ? { approved_at: new Date().toISOString() } : {}),
      ...(status === "paid" ? { paid_at: new Date().toISOString() } : {}),
    }).eq("id", id);
    onUpdated();
  }

  if (entries.length === 0) {
    return <EmptyState title="No pay entries yet" subtitle="Add your first pay entry to start tracking payroll." />;
  }

  return (
    <div>
      {/* Per-person summary */}
      {personSummary.size > 1 && (
        <div className="mb-4">
          <div className="text-xs font-semibold mb-2" style={{ color: "var(--zr-text-muted)" }}>BY TEAM MEMBER</div>
          <div className="flex flex-wrap gap-2">
            {[...personSummary.entries()].map(([pid, s]) => (
              <div key={pid} className="text-xs rounded-lg px-3 py-2"
                style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)" }}>
                <span className="font-semibold" style={{ color: "var(--zr-text-primary)" }}>{s.name}</span>
                <span className="ml-2" style={{ color: "var(--zr-text-secondary)" }}>{fmtMoney(s.total)}</span>
                {s.hours > 0 && <span className="ml-2" style={{ color: "var(--zr-text-muted)" }}>{s.hours.toFixed(1)}h</span>}
                {s.jobs > 0 && <span className="ml-2" style={{ color: "var(--zr-text-muted)" }}>{s.jobs} jobs</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Entries table */}
      <div style={{ overflowX: "auto" }}>
        <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--zr-border)" }}>
              {["Date", "Person", "Type", "Details", "Amount", "Status", ""].map(h => (
                <th key={h} className="text-left px-3 py-2 text-xs font-semibold"
                  style={{ color: "var(--zr-text-muted)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map(e => {
              const name = team.find(t => t.id === e.profile_id)?.full_name || "—";
              let details = "";
              if (e.entry_type === "hours" && e.hours) details = `${e.hours}h @ ${fmtMoney(e.hourly_rate || 0)}/hr`;
              else if (e.entry_type === "job") details = e.job_rate ? `@ ${fmtMoney(e.job_rate)}/job` : "";
              else if (e.entry_type === "commission" && e.sale_amount) details = `${e.commission_pct || 0}% on ${fmtMoney(e.sale_amount)}`;
              if (e.description) details += details ? ` · ${e.description}` : e.description;

              const sb = STATUS_BADGE[e.status] ?? STATUS_BADGE.pending;

              return (
                <tr key={e.id} style={{ borderBottom: "1px solid var(--zr-border)" }}
                  className="transition-colors"
                  onMouseEnter={ev => (ev.currentTarget.style.background = "var(--zr-surface-2)")}
                  onMouseLeave={ev => (ev.currentTarget.style.background = "transparent")}>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--zr-text-secondary)" }}>
                    {shortDate(e.work_date)}
                  </td>
                  <td className="px-3 py-2 font-medium" style={{ color: "var(--zr-text-primary)" }}>{name}</td>
                  <td className="px-3 py-2">
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ background: "var(--zr-surface-2)", color: "var(--zr-text-secondary)" }}>
                      {ENTRY_TYPE_LABELS[e.entry_type] || e.entry_type}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs" style={{ color: "var(--zr-text-muted)", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {details || "—"}
                  </td>
                  <td className="px-3 py-2 font-semibold whitespace-nowrap" style={{
                    color: e.entry_type === "deduction" ? "var(--zr-error)" : "var(--zr-success, #22c55e)",
                  }}>
                    {e.entry_type === "deduction" ? "−" : ""}{fmtMoney(Math.abs(e.amount))}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sb.bg} ${sb.text}`}>
                      {e.status.charAt(0).toUpperCase() + e.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      {e.status === "pending" && (
                        <button onClick={() => updateStatus(e.id, "approved")}
                          className="text-xs px-2 py-0.5 rounded font-medium transition-colors"
                          style={{ color: "var(--zr-primary)" }}>
                          Approve
                        </button>
                      )}
                      {e.status === "approved" && (
                        <>
                          <button onClick={() => updateStatus(e.id, "paid")}
                            className="text-xs px-2 py-0.5 rounded font-medium transition-colors"
                            style={{ color: "var(--zr-success, #22c55e)" }}>
                            Mark Paid
                          </button>
                          <button onClick={() => updateStatus(e.id, "pending")}
                            className="text-xs px-2 py-0.5 rounded font-medium transition-colors"
                            style={{ color: "var(--zr-text-muted)" }}
                            title="Undo approval">
                            Undo
                          </button>
                        </>
                      )}
                      {e.status === "paid" && (
                        <button onClick={() => updateStatus(e.id, "approved")}
                          className="text-xs px-2 py-0.5 rounded font-medium transition-colors"
                          style={{ color: "var(--zr-text-muted)" }}
                          title="Reverse back to approved">
                          Undo
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Rates Tab ──────────────────────────────────────────────────
function RatesTab({ rates, team, onUpdated }: {
  rates: PayRate[];
  team: TeamMember[];
  onUpdated: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formPerson, setFormPerson] = useState("");
  const [formType, setFormType] = useState<string>("hourly");
  const [formRate, setFormRate] = useState("");
  const [formCommission, setFormCommission] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [saving, setSaving] = useState(false);

  function openNew() {
    setEditingId(null);
    setFormPerson(""); setFormType("hourly"); setFormRate("");
    setFormCommission(""); setFormNotes("");
    setShowForm(true);
  }

  function openEdit(r: PayRate) {
    setEditingId(r.id);
    setFormPerson(r.profile_id);
    setFormType(r.pay_type);
    setFormRate(r.rate ? String(r.rate) : "");
    setFormCommission(r.commission_pct != null ? String(r.commission_pct) : "");
    setFormNotes(r.notes || "");
    setShowForm(true);
  }

  async function saveRate() {
    if (!formPerson || !formType) return;
    setSaving(true);
    if (editingId) {
      // Update existing rate in place
      await supabase.from("pay_rates").update({
        pay_type: formType,
        rate: formRate ? parseFloat(formRate) : 0,
        commission_pct: formCommission ? parseFloat(formCommission) : null,
        notes: formNotes || null,
      }).eq("id", editingId);
    } else {
      // Deactivate any existing rate for this person
      await supabase.from("pay_rates").update({ active: false }).eq("profile_id", formPerson).eq("active", true);
      // Insert new rate
      await supabase.from("pay_rates").insert([{
        profile_id: formPerson,
        pay_type: formType,
        rate: formRate ? parseFloat(formRate) : 0,
        commission_pct: formCommission ? parseFloat(formCommission) : null,
        notes: formNotes || null,
        active: true,
      }]);
    }
    setShowForm(false);
    setEditingId(null);
    setFormPerson(""); setFormType("hourly"); setFormRate("");
    setFormCommission(""); setFormNotes("");
    setSaving(false);
    onUpdated();
  }

  async function deleteRate(id: string) {
    if (!confirm("Remove this pay rate?")) return;
    await supabase.from("pay_rates").update({ active: false }).eq("id", id);
    onUpdated();
  }

  // Group rates by person
  const byPerson = new Map<string, PayRate>();
  for (const r of rates) {
    if (!byPerson.has(r.profile_id)) byPerson.set(r.profile_id, r);
  }

  function getRateLabel(r: PayRate): string {
    switch (r.pay_type) {
      case "hourly": return `${fmtMoney(r.rate)}/hr`;
      case "per_job": return `${fmtMoney(r.rate)}/job`;
      case "per_window": return `${fmtMoney(r.rate)}/window`;
      case "salary": return `${fmtMoney(r.rate)}/period`;
      case "commission_only": return "Commission only";
      default: return fmtMoney(r.rate);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-semibold" style={{ color: "var(--zr-text-muted)" }}>PAY RATE CONFIGURATION</div>
        <button onClick={openNew}
          className="text-xs px-3 py-1.5 rounded font-medium transition-colors"
          style={{ background: "var(--zr-primary)", color: "#fff" }}>
          + Set Pay Rate
        </button>
      </div>

      {showForm && (
        <div className="mb-4 rounded-lg p-4" style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)" }}>
          <div className="text-xs font-semibold mb-2" style={{ color: "var(--zr-text-primary)" }}>
            {editingId ? "Edit Pay Rate" : "New Pay Rate"}
          </div>
          <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: "var(--zr-text-muted)" }}>Team Member</label>
              <select value={formPerson} onChange={e => setFormPerson(e.target.value)}
                disabled={!!editingId}
                className="w-full text-sm rounded px-2.5 py-1.5"
                style={{ background: "var(--zr-surface-1)", color: "var(--zr-text-primary)", border: "1px solid var(--zr-border)", opacity: editingId ? 0.6 : 1 }}>
                <option value="">Select...</option>
                {team.map(t => <option key={t.id} value={t.id}>{t.full_name || t.role}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: "var(--zr-text-muted)" }}>Pay Type</label>
              <select value={formType} onChange={e => setFormType(e.target.value)}
                className="w-full text-sm rounded px-2.5 py-1.5"
                style={{ background: "var(--zr-surface-1)", color: "var(--zr-text-primary)", border: "1px solid var(--zr-border)" }}>
                {Object.entries(PAY_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>

          <div className="grid gap-3 mt-3" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: "var(--zr-text-muted)" }}>
                {formType === "hourly" ? "Hourly Rate ($)" :
                 formType === "per_job" ? "Per Job Rate ($)" :
                 formType === "per_window" ? "Per Window Rate ($)" :
                 formType === "salary" ? "Salary Amount ($)" : "Base Rate ($)"}
              </label>
              <input type="number" step="0.01" placeholder="0.00" value={formRate}
                onChange={e => setFormRate(e.target.value)}
                className="w-full text-sm rounded px-2.5 py-1.5"
                style={{ background: "var(--zr-surface-1)", color: "var(--zr-text-primary)", border: "1px solid var(--zr-border)" }} />
            </div>
            {(formType === "commission_only" || formType === "salary") && (
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: "var(--zr-text-muted)" }}>Commission %</label>
                <input type="number" step="0.5" placeholder="0" value={formCommission}
                  onChange={e => setFormCommission(e.target.value)}
                  className="w-full text-sm rounded px-2.5 py-1.5"
                  style={{ background: "var(--zr-surface-1)", color: "var(--zr-text-primary)", border: "1px solid var(--zr-border)" }} />
              </div>
            )}
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: "var(--zr-text-muted)" }}>Notes</label>
              <input type="text" placeholder="Optional" value={formNotes}
                onChange={e => setFormNotes(e.target.value)}
                className="w-full text-sm rounded px-2.5 py-1.5"
                style={{ background: "var(--zr-surface-1)", color: "var(--zr-text-primary)", border: "1px solid var(--zr-border)" }} />
            </div>
          </div>

          <div className="flex gap-2 mt-3">
            <button onClick={saveRate} disabled={saving || !formPerson}
              className="text-xs px-4 py-1.5 rounded font-medium transition-colors"
              style={{ background: "var(--zr-primary)", color: "#fff", opacity: saving || !formPerson ? 0.5 : 1 }}>
              {saving ? "Saving..." : editingId ? "Update Rate" : "Save Rate"}
            </button>
            <button onClick={() => { setShowForm(false); setEditingId(null); }}
              className="text-xs px-4 py-1.5 rounded font-medium transition-colors"
              style={{ color: "var(--zr-text-muted)" }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Rates by person */}
      {byPerson.size === 0 ? (
        <div className="text-center py-10">
          <div className="text-4xl mb-3">💰</div>
          <h3 className="text-base font-semibold mb-1" style={{ color: "var(--zr-text-primary)" }}>No pay rates configured</h3>
          <p className="text-sm mb-4" style={{ color: "var(--zr-text-muted)" }}>Set up pay rates for your team members to start tracking compensation.</p>
          <button onClick={openNew}
            className="text-sm px-5 py-2 rounded-lg font-semibold transition-colors"
            style={{ background: "var(--zr-primary)", color: "#fff" }}>
            + Set Pay Rate
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {[...byPerson.entries()].map(([pid, r]) => {
            const member = team.find(t => t.id === pid);
            return (
              <div key={pid} className="rounded-lg p-4"
                style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)" }}>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="font-semibold text-sm" style={{ color: "var(--zr-text-primary)" }}>
                      {member?.full_name || member?.role || "Unknown"}
                    </span>
                    <span className="ml-2 text-xs px-2 py-0.5 rounded-full"
                      style={{ background: "var(--zr-surface-1)", color: "var(--zr-text-muted)" }}>
                      {member?.role || "—"}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(r)}
                      className="text-xs px-2 py-1 rounded font-medium transition-colors"
                      style={{ color: "var(--zr-primary)" }}>
                      Edit
                    </button>
                    <button onClick={() => deleteRate(r.id)}
                      className="text-xs px-2 py-1 rounded font-medium transition-colors"
                      style={{ color: "var(--zr-error)" }}>
                      Remove
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-4 text-sm">
                  <div>
                    <span style={{ color: "var(--zr-text-muted)" }}>Type: </span>
                    <span className="font-medium" style={{ color: "var(--zr-text-primary)" }}>
                      {PAY_TYPE_LABELS[r.pay_type] || r.pay_type}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: "var(--zr-text-muted)" }}>Rate: </span>
                    <span className="font-medium" style={{ color: "var(--zr-text-primary)" }}>{getRateLabel(r)}</span>
                  </div>
                  {r.commission_pct != null && (
                    <div>
                      <span style={{ color: "var(--zr-text-muted)" }}>Commission: </span>
                      <span className="font-medium" style={{ color: "var(--zr-text-primary)" }}>{r.commission_pct}%</span>
                    </div>
                  )}
                </div>
                {r.notes && (
                  <div className="mt-1 text-xs" style={{ color: "var(--zr-text-muted)" }}>{r.notes}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Runs Tab ───────────────────────────────────────────────────
function RunsTab({ runs, onUpdated }: { runs: PayrollRun[]; onUpdated: () => void }) {
  const [creating, setCreating] = useState(false);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [saving, setSaving] = useState(false);

  async function createRun() {
    if (!periodStart || !periodEnd) return;
    setSaving(true);
    await supabase.from("payroll_runs").insert([{
      period_start: periodStart,
      period_end: periodEnd,
      status: "draft",
      total_amount: 0,
    }]);
    setCreating(false);
    setPeriodStart(""); setPeriodEnd("");
    setSaving(false);
    onUpdated();
  }

  async function updateRunStatus(id: string, status: string) {
    await supabase.from("payroll_runs").update({
      status,
      ...(status === "finalized" ? { finalized_at: new Date().toISOString() } : {}),
      ...(status === "paid" ? { paid_at: new Date().toISOString() } : {}),
    }).eq("id", id);
    onUpdated();
  }

  const statusColors: Record<string, { bg: string; text: string }> = {
    draft: { bg: "bg-gray-100", text: "text-gray-700" },
    finalized: { bg: "bg-blue-100", text: "text-blue-700" },
    paid: { bg: "bg-green-100", text: "text-green-700" },
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-semibold" style={{ color: "var(--zr-text-muted)" }}>PAYROLL PERIODS</div>
        <button onClick={() => setCreating(!creating)}
          className="text-xs px-3 py-1.5 rounded font-medium transition-colors"
          style={{ background: "var(--zr-primary)", color: "#fff" }}>
          + New Period
        </button>
      </div>

      {creating && (
        <div className="mb-4 rounded-lg p-4 flex items-end gap-3 flex-wrap"
          style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)" }}>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: "var(--zr-text-muted)" }}>Start</label>
            <input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)}
              className="text-sm rounded px-2.5 py-1.5"
              style={{ background: "var(--zr-surface-1)", color: "var(--zr-text-primary)", border: "1px solid var(--zr-border)" }} />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: "var(--zr-text-muted)" }}>End</label>
            <input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)}
              className="text-sm rounded px-2.5 py-1.5"
              style={{ background: "var(--zr-surface-1)", color: "var(--zr-text-primary)", border: "1px solid var(--zr-border)" }} />
          </div>
          <button onClick={createRun} disabled={saving || !periodStart || !periodEnd}
            className="text-xs px-4 py-1.5 rounded font-medium transition-colors"
            style={{ background: "var(--zr-primary)", color: "#fff", opacity: saving ? 0.5 : 1 }}>
            {saving ? "Creating..." : "Create"}
          </button>
          <button onClick={() => setCreating(false)}
            className="text-xs px-3 py-1.5 rounded font-medium"
            style={{ color: "var(--zr-text-muted)" }}>
            Cancel
          </button>
        </div>
      )}

      {runs.length === 0 ? (
        <EmptyState title="No payroll periods" subtitle="Create a payroll period to group and finalize pay entries." />
      ) : (
        <div className="flex flex-col gap-2">
          {runs.map(r => {
            const sc = statusColors[r.status] ?? statusColors.draft;
            return (
              <div key={r.id} className="flex items-center justify-between rounded-lg p-3"
                style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)" }}>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sc.bg} ${sc.text}`}>
                    {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                  </span>
                  <span className="text-sm font-medium" style={{ color: "var(--zr-text-primary)" }}>
                    {shortDate(r.period_start)} — {shortDate(r.period_end)}
                  </span>
                  <span className="text-sm font-semibold" style={{ color: "var(--zr-text-secondary)" }}>
                    {fmtMoney(r.total_amount)}
                  </span>
                </div>
                <div className="flex gap-1">
                  {r.status === "draft" && (
                    <button onClick={() => updateRunStatus(r.id, "finalized")}
                      className="text-xs px-2.5 py-1 rounded font-medium transition-colors"
                      style={{ background: "var(--zr-surface-1)", color: "var(--zr-text-secondary)", border: "1px solid var(--zr-border)" }}>
                      Finalize
                    </button>
                  )}
                  {r.status === "finalized" && (
                    <button onClick={() => updateRunStatus(r.id, "paid")}
                      className="text-xs px-2.5 py-1 rounded font-medium transition-colors"
                      style={{ background: "var(--zr-success, #22c55e)", color: "#fff" }}>
                      Mark Paid
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Add Entry Button + Modal ───────────────────────────────────
function AddEntryButton({ team, rates, onAdded }: {
  team: TeamMember[];
  rates: PayRate[];
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [person, setPerson] = useState("");
  const [entryType, setEntryType] = useState<string>("hours");
  const [workDate, setWorkDate] = useState(new Date().toISOString().slice(0, 10));
  const [hours, setHours] = useState("");
  const [saleAmount, setSaleAmount] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Auto-calculate amount based on rate
  useEffect(() => {
    if (!person) return;
    const rate = rates.find(r => r.profile_id === person && r.active);
    if (!rate) return;

    if (entryType === "hours" && hours && rate.pay_type === "hourly") {
      setAmount((parseFloat(hours) * rate.rate).toFixed(2));
    } else if (entryType === "commission" && saleAmount && rate.commission_pct) {
      setAmount((parseFloat(saleAmount) * rate.commission_pct / 100).toFixed(2));
    }
  }, [person, entryType, hours, saleAmount, rates]); // eslint-disable-line

  async function save() {
    if (!person || !amount) return;
    setSaving(true);
    const rate = rates.find(r => r.profile_id === person && r.active);
    await supabase.from("pay_entries").insert([{
      profile_id: person,
      entry_type: entryType,
      work_date: workDate,
      hours: entryType === "hours" && hours ? parseFloat(hours) : null,
      hourly_rate: entryType === "hours" ? (rate?.rate ?? null) : null,
      sale_amount: entryType === "commission" && saleAmount ? parseFloat(saleAmount) : null,
      commission_pct: entryType === "commission" ? (rate?.commission_pct ?? null) : null,
      amount: parseFloat(amount),
      description: description || null,
      notes: notes || null,
      status: "pending",
    }]);
    setOpen(false);
    setPerson(""); setEntryType("hours"); setHours("");
    setSaleAmount(""); setAmount(""); setDescription(""); setNotes("");
    setSaving(false);
    onAdded();
  }

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="text-xs px-3 py-1.5 rounded font-medium transition-colors"
        style={{ background: "var(--zr-primary)", color: "#fff" }}>
        + Add Entry
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,.5)" }}
          onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="rounded-xl p-5 w-full max-w-md" style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }}>
            <h3 className="text-base font-bold mb-4" style={{ color: "var(--zr-text-primary)" }}>Add Pay Entry</h3>

            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: "var(--zr-text-muted)" }}>Team Member</label>
                <select value={person} onChange={e => setPerson(e.target.value)}
                  className="w-full text-sm rounded px-2.5 py-1.5"
                  style={{ background: "var(--zr-surface-2)", color: "var(--zr-text-primary)", border: "1px solid var(--zr-border)" }}>
                  <option value="">Select...</option>
                  {team.map(t => <option key={t.id} value={t.id}>{t.full_name || t.role}</option>)}
                </select>
              </div>

              <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: "var(--zr-text-muted)" }}>Entry Type</label>
                  <select value={entryType} onChange={e => setEntryType(e.target.value)}
                    className="w-full text-sm rounded px-2.5 py-1.5"
                    style={{ background: "var(--zr-surface-2)", color: "var(--zr-text-primary)", border: "1px solid var(--zr-border)" }}>
                    {Object.entries(ENTRY_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: "var(--zr-text-muted)" }}>Date</label>
                  <input type="date" value={workDate} onChange={e => setWorkDate(e.target.value)}
                    className="w-full text-sm rounded px-2.5 py-1.5"
                    style={{ background: "var(--zr-surface-2)", color: "var(--zr-text-primary)", border: "1px solid var(--zr-border)" }} />
                </div>
              </div>

              {/* Conditional fields */}
              {entryType === "hours" && (
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: "var(--zr-text-muted)" }}>Hours</label>
                  <input type="number" step="0.25" placeholder="0" value={hours}
                    onChange={e => setHours(e.target.value)}
                    className="w-full text-sm rounded px-2.5 py-1.5"
                    style={{ background: "var(--zr-surface-2)", color: "var(--zr-text-primary)", border: "1px solid var(--zr-border)" }} />
                </div>
              )}
              {entryType === "commission" && (
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: "var(--zr-text-muted)" }}>Sale Amount (commission base)</label>
                  <input type="number" step="0.01" placeholder="0.00" value={saleAmount}
                    onChange={e => setSaleAmount(e.target.value)}
                    className="w-full text-sm rounded px-2.5 py-1.5"
                    style={{ background: "var(--zr-surface-2)", color: "var(--zr-text-primary)", border: "1px solid var(--zr-border)" }} />
                </div>
              )}

              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: "var(--zr-text-muted)" }}>
                  Amount ($) {person && rates.find(r => r.profile_id === person && r.active) ? "(auto-calculated)" : ""}
                </label>
                <input type="number" step="0.01" placeholder="0.00" value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="w-full text-sm rounded px-2.5 py-1.5"
                  style={{ background: "var(--zr-surface-2)", color: "var(--zr-text-primary)", border: "1px solid var(--zr-border)" }} />
              </div>

              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: "var(--zr-text-muted)" }}>Description (optional)</label>
                <input type="text" placeholder="e.g. Johnson residence install" value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full text-sm rounded px-2.5 py-1.5"
                  style={{ background: "var(--zr-surface-2)", color: "var(--zr-text-primary)", border: "1px solid var(--zr-border)" }} />
              </div>

              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: "var(--zr-text-muted)" }}>Notes (optional)</label>
                <input type="text" placeholder="Additional details" value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full text-sm rounded px-2.5 py-1.5"
                  style={{ background: "var(--zr-surface-2)", color: "var(--zr-text-primary)", border: "1px solid var(--zr-border)" }} />
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <button onClick={save} disabled={saving || !person || !amount}
                className="text-xs px-4 py-2 rounded font-medium transition-colors"
                style={{ background: "var(--zr-primary)", color: "#fff", opacity: saving || !person || !amount ? 0.5 : 1 }}>
                {saving ? "Saving..." : "Add Entry"}
              </button>
              <button onClick={() => setOpen(false)}
                className="text-xs px-4 py-2 rounded font-medium transition-colors"
                style={{ color: "var(--zr-text-muted)" }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
