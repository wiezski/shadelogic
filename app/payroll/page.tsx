"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../auth-provider";
import { PermissionGate } from "../permission-gate";
import { Skeleton, EmptyState } from "../ui";

// ── Types ──────────────────────────────────────────────────────
type TeamMember = {
  id: string;
  full_name: string | null;
  role: string;
};

type PayRate = {
  id: string;
  profile_id: string;
  pay_type: "hourly" | "per_job" | "per_window" | "salary" | "commission_only";
  hourly_rate: number | null;
  per_job_rate: number | null;
  per_window_rate: number | null;
  salary_amount: number | null;
  commission_pct: number | null;
  effective_date: string;
  notes: string | null;
};

type PayEntry = {
  id: string;
  profile_id: string;
  entry_date: string;
  entry_type: "hours" | "job" | "windows" | "commission" | "bonus" | "deduction";
  hours: number | null;
  job_count: number | null;
  window_count: number | null;
  commission_base: number | null;
  amount: number;
  customer_id: string | null;
  customer_name: string | null;
  quote_id: string | null;
  notes: string | null;
  created_at: string;
};

type PayrollRun = {
  id: string;
  period_start: string;
  period_end: string;
  status: "draft" | "finalized" | "paid";
  total_amount: number;
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
  windows: "Windows",
  commission: "Commission",
  bonus: "Bonus",
  deduction: "Deduction",
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
    const [teamRes, ratesRes, entriesRes, runsRes] = await Promise.all([
      supabase.from("profiles").select("id, full_name, role").eq("company_id", companyId),
      supabase.from("pay_rates").select("*").order("effective_date", { ascending: false }),
      supabase.from("pay_entries").select("*").order("entry_date", { ascending: false }).limit(200),
      supabase.from("payroll_runs").select("*").order("period_start", { ascending: false }).limit(50),
    ]);
    setTeam(teamRes.data ?? []);
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
  const cutoff = rangeMs === Infinity ? "" : new Date(Date.now() - rangeMs).toISOString();

  const filteredEntries = entries.filter(e => {
    if (filterPerson !== "all" && e.profile_id !== filterPerson) return false;
    if (cutoff && e.entry_date < cutoff) return false;
    return true;
  });

  const totalEarnings = filteredEntries.reduce((s, e) => s + (e.amount || 0), 0);
  const totalHours = filteredEntries.filter(e => e.entry_type === "hours").reduce((s, e) => s + (e.hours || 0), 0);
  const totalJobs = filteredEntries.filter(e => e.entry_type === "job").reduce((s, e) => s + (e.job_count || 0), 0);
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
    if (e.entry_type === "job") s.jobs += e.job_count || 0;
    if (e.entry_type === "commission") s.commission += e.amount || 0;
  }

  // Rate lookup for team member
  function getRate(profileId: string): PayRate | undefined {
    return rates.find(r => r.profile_id === profileId);
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
      <div className="grid gap-3 mb-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
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
          {(["7d", "30d", "90d", "all"] as const).map(r => (
            <button key={r} onClick={() => setFilterRange(r)}
              className="px-3 py-1.5 text-xs font-medium transition-colors"
              style={{
                background: filterRange === r ? "var(--zr-primary)" : "var(--zr-surface-2)",
                color: filterRange === r ? "#fff" : "var(--zr-text-secondary)",
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
        <EntriesTab entries={filteredEntries} team={team} personSummary={personSummary} />
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
function EntriesTab({ entries, team, personSummary }: {
  entries: PayEntry[];
  team: TeamMember[];
  personSummary: Map<string, { name: string; total: number; hours: number; jobs: number; commission: number }>;
}) {
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
              {["Date", "Person", "Type", "Details", "Amount", "Notes"].map(h => (
                <th key={h} className="text-left px-3 py-2 text-xs font-semibold"
                  style={{ color: "var(--zr-text-muted)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map(e => {
              const name = team.find(t => t.id === e.profile_id)?.full_name || "—";
              let details = "";
              if (e.entry_type === "hours" && e.hours) details = `${e.hours}h`;
              else if (e.entry_type === "job" && e.job_count) details = `${e.job_count} job(s)`;
              else if (e.entry_type === "windows" && e.window_count) details = `${e.window_count} windows`;
              else if (e.entry_type === "commission" && e.commission_base) details = `on ${fmtMoney(e.commission_base)}`;
              if (e.customer_name) details += details ? ` • ${e.customer_name}` : e.customer_name;

              return (
                <tr key={e.id} style={{ borderBottom: "1px solid var(--zr-border)" }}
                  className="transition-colors"
                  onMouseEnter={ev => (ev.currentTarget.style.background = "var(--zr-surface-2)")}
                  onMouseLeave={ev => (ev.currentTarget.style.background = "transparent")}>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--zr-text-secondary)" }}>
                    {shortDate(e.entry_date)}
                  </td>
                  <td className="px-3 py-2 font-medium" style={{ color: "var(--zr-text-primary)" }}>{name}</td>
                  <td className="px-3 py-2">
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ background: "var(--zr-surface-2)", color: "var(--zr-text-secondary)" }}>
                      {ENTRY_TYPE_LABELS[e.entry_type] || e.entry_type}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs" style={{ color: "var(--zr-text-muted)" }}>{details || "—"}</td>
                  <td className="px-3 py-2 font-semibold whitespace-nowrap" style={{
                    color: e.entry_type === "deduction" ? "var(--zr-error)" : "var(--zr-success, #22c55e)",
                  }}>
                    {e.entry_type === "deduction" ? "−" : ""}{fmtMoney(Math.abs(e.amount))}
                  </td>
                  <td className="px-3 py-2 text-xs" style={{ color: "var(--zr-text-muted)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {e.notes || ""}
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
  const [formPerson, setFormPerson] = useState("");
  const [formType, setFormType] = useState<string>("hourly");
  const [formHourly, setFormHourly] = useState("");
  const [formPerJob, setFormPerJob] = useState("");
  const [formPerWindow, setFormPerWindow] = useState("");
  const [formSalary, setFormSalary] = useState("");
  const [formCommission, setFormCommission] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function saveRate() {
    if (!formPerson || !formType) return;
    setSaving(true);
    await supabase.from("pay_rates").insert([{
      profile_id: formPerson,
      pay_type: formType,
      hourly_rate: formHourly ? parseFloat(formHourly) : null,
      per_job_rate: formPerJob ? parseFloat(formPerJob) : null,
      per_window_rate: formPerWindow ? parseFloat(formPerWindow) : null,
      salary_amount: formSalary ? parseFloat(formSalary) : null,
      commission_pct: formCommission ? parseFloat(formCommission) : null,
      effective_date: new Date().toISOString().slice(0, 10),
      notes: formNotes || null,
    }]);
    setShowForm(false);
    setFormPerson(""); setFormType("hourly"); setFormHourly(""); setFormPerJob("");
    setFormPerWindow(""); setFormSalary(""); setFormCommission(""); setFormNotes("");
    setSaving(false);
    onUpdated();
  }

  // Group rates by person
  const byPerson = new Map<string, PayRate[]>();
  for (const r of rates) {
    if (!byPerson.has(r.profile_id)) byPerson.set(r.profile_id, []);
    byPerson.get(r.profile_id)!.push(r);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-semibold" style={{ color: "var(--zr-text-muted)" }}>PAY RATE CONFIGURATION</div>
        <button onClick={() => setShowForm(!showForm)}
          className="text-xs px-3 py-1.5 rounded font-medium transition-colors"
          style={{ background: "var(--zr-primary)", color: "#fff" }}>
          + Set Pay Rate
        </button>
      </div>

      {showForm && (
        <div className="mb-4 rounded-lg p-4" style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)" }}>
          <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: "var(--zr-text-muted)" }}>Team Member</label>
              <select value={formPerson} onChange={e => setFormPerson(e.target.value)}
                className="w-full text-sm rounded px-2.5 py-1.5"
                style={{ background: "var(--zr-surface-1)", color: "var(--zr-text-primary)", border: "1px solid var(--zr-border)" }}>
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

          <div className="grid gap-3 mt-3" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
            {(formType === "hourly" || formType === "salary") && (
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: "var(--zr-text-muted)" }}>
                  {formType === "hourly" ? "Hourly Rate ($)" : "Salary Amount ($)"}
                </label>
                <input type="number" step="0.01" placeholder="0.00"
                  value={formType === "hourly" ? formHourly : formSalary}
                  onChange={e => formType === "hourly" ? setFormHourly(e.target.value) : setFormSalary(e.target.value)}
                  className="w-full text-sm rounded px-2.5 py-1.5"
                  style={{ background: "var(--zr-surface-1)", color: "var(--zr-text-primary)", border: "1px solid var(--zr-border)" }} />
              </div>
            )}
            {formType === "per_job" && (
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: "var(--zr-text-muted)" }}>Per Job Rate ($)</label>
                <input type="number" step="0.01" placeholder="0.00" value={formPerJob}
                  onChange={e => setFormPerJob(e.target.value)}
                  className="w-full text-sm rounded px-2.5 py-1.5"
                  style={{ background: "var(--zr-surface-1)", color: "var(--zr-text-primary)", border: "1px solid var(--zr-border)" }} />
              </div>
            )}
            {formType === "per_window" && (
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: "var(--zr-text-muted)" }}>Per Window Rate ($)</label>
                <input type="number" step="0.01" placeholder="0.00" value={formPerWindow}
                  onChange={e => setFormPerWindow(e.target.value)}
                  className="w-full text-sm rounded px-2.5 py-1.5"
                  style={{ background: "var(--zr-surface-1)", color: "var(--zr-text-primary)", border: "1px solid var(--zr-border)" }} />
              </div>
            )}
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
              {saving ? "Saving..." : "Save Rate"}
            </button>
            <button onClick={() => setShowForm(false)}
              className="text-xs px-4 py-1.5 rounded font-medium transition-colors"
              style={{ color: "var(--zr-text-muted)" }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Rates by person */}
      {byPerson.size === 0 ? (
        <EmptyState title="No pay rates configured" subtitle="Set up pay rates for your team members to start tracking compensation." />
      ) : (
        <div className="flex flex-col gap-3">
          {[...byPerson.entries()].map(([pid, personRates]) => {
            const member = team.find(t => t.id === pid);
            const currentRate = personRates[0]; // Most recent
            return (
              <div key={pid} className="rounded-lg p-4"
                style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)" }}>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="font-semibold text-sm" style={{ color: "var(--zr-text-primary)" }}>
                      {member?.full_name || "Unknown"}
                    </span>
                    <span className="ml-2 text-xs px-2 py-0.5 rounded-full"
                      style={{ background: "var(--zr-surface-1)", color: "var(--zr-text-muted)" }}>
                      {member?.role || "—"}
                    </span>
                  </div>
                  <span className="text-xs" style={{ color: "var(--zr-text-muted)" }}>
                    Effective {fmtDate(currentRate.effective_date)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-4 text-sm">
                  <div>
                    <span style={{ color: "var(--zr-text-muted)" }}>Type: </span>
                    <span className="font-medium" style={{ color: "var(--zr-text-primary)" }}>
                      {PAY_TYPE_LABELS[currentRate.pay_type] || currentRate.pay_type}
                    </span>
                  </div>
                  {currentRate.hourly_rate != null && (
                    <div>
                      <span style={{ color: "var(--zr-text-muted)" }}>Hourly: </span>
                      <span className="font-medium" style={{ color: "var(--zr-text-primary)" }}>{fmtMoney(currentRate.hourly_rate)}</span>
                    </div>
                  )}
                  {currentRate.per_job_rate != null && (
                    <div>
                      <span style={{ color: "var(--zr-text-muted)" }}>Per Job: </span>
                      <span className="font-medium" style={{ color: "var(--zr-text-primary)" }}>{fmtMoney(currentRate.per_job_rate)}</span>
                    </div>
                  )}
                  {currentRate.per_window_rate != null && (
                    <div>
                      <span style={{ color: "var(--zr-text-muted)" }}>Per Window: </span>
                      <span className="font-medium" style={{ color: "var(--zr-text-primary)" }}>{fmtMoney(currentRate.per_window_rate)}</span>
                    </div>
                  )}
                  {currentRate.salary_amount != null && (
                    <div>
                      <span style={{ color: "var(--zr-text-muted)" }}>Salary: </span>
                      <span className="font-medium" style={{ color: "var(--zr-text-primary)" }}>{fmtMoney(currentRate.salary_amount)}</span>
                    </div>
                  )}
                  {currentRate.commission_pct != null && (
                    <div>
                      <span style={{ color: "var(--zr-text-muted)" }}>Commission: </span>
                      <span className="font-medium" style={{ color: "var(--zr-text-primary)" }}>{currentRate.commission_pct}%</span>
                    </div>
                  )}
                </div>
                {currentRate.notes && (
                  <div className="mt-1 text-xs" style={{ color: "var(--zr-text-muted)" }}>{currentRate.notes}</div>
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
    await supabase.from("payroll_runs").update({ status }).eq("id", id);
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
        <div className="mb-4 rounded-lg p-4 flex items-end gap-3"
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
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [hours, setHours] = useState("");
  const [jobCount, setJobCount] = useState("");
  const [windowCount, setWindowCount] = useState("");
  const [commissionBase, setCommissionBase] = useState("");
  const [amount, setAmount] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Auto-calculate amount based on rate
  useEffect(() => {
    if (!person) return;
    const rate = rates.find(r => r.profile_id === person);
    if (!rate) return;

    if (entryType === "hours" && hours && rate.hourly_rate) {
      setAmount((parseFloat(hours) * rate.hourly_rate).toFixed(2));
    } else if (entryType === "job" && jobCount && rate.per_job_rate) {
      setAmount((parseInt(jobCount) * rate.per_job_rate).toFixed(2));
    } else if (entryType === "windows" && windowCount && rate.per_window_rate) {
      setAmount((parseInt(windowCount) * rate.per_window_rate).toFixed(2));
    } else if (entryType === "commission" && commissionBase && rate.commission_pct) {
      setAmount((parseFloat(commissionBase) * rate.commission_pct / 100).toFixed(2));
    }
  }, [person, entryType, hours, jobCount, windowCount, commissionBase, rates]); // eslint-disable-line

  async function save() {
    if (!person || !amount) return;
    setSaving(true);
    await supabase.from("pay_entries").insert([{
      profile_id: person,
      entry_date: entryDate,
      entry_type: entryType,
      hours: hours ? parseFloat(hours) : null,
      job_count: jobCount ? parseInt(jobCount) : null,
      window_count: windowCount ? parseInt(windowCount) : null,
      commission_base: commissionBase ? parseFloat(commissionBase) : null,
      amount: parseFloat(amount),
      customer_name: customerName || null,
      notes: notes || null,
    }]);
    setOpen(false);
    setPerson(""); setEntryType("hours"); setHours(""); setJobCount("");
    setWindowCount(""); setCommissionBase(""); setAmount("");
    setCustomerName(""); setNotes("");
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
                  <input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)}
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
              {entryType === "job" && (
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: "var(--zr-text-muted)" }}>Number of Jobs</label>
                  <input type="number" placeholder="0" value={jobCount}
                    onChange={e => setJobCount(e.target.value)}
                    className="w-full text-sm rounded px-2.5 py-1.5"
                    style={{ background: "var(--zr-surface-2)", color: "var(--zr-text-primary)", border: "1px solid var(--zr-border)" }} />
                </div>
              )}
              {entryType === "windows" && (
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: "var(--zr-text-muted)" }}>Number of Windows</label>
                  <input type="number" placeholder="0" value={windowCount}
                    onChange={e => setWindowCount(e.target.value)}
                    className="w-full text-sm rounded px-2.5 py-1.5"
                    style={{ background: "var(--zr-surface-2)", color: "var(--zr-text-primary)", border: "1px solid var(--zr-border)" }} />
                </div>
              )}
              {entryType === "commission" && (
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: "var(--zr-text-muted)" }}>Sale Amount (commission base)</label>
                  <input type="number" step="0.01" placeholder="0.00" value={commissionBase}
                    onChange={e => setCommissionBase(e.target.value)}
                    className="w-full text-sm rounded px-2.5 py-1.5"
                    style={{ background: "var(--zr-surface-2)", color: "var(--zr-text-primary)", border: "1px solid var(--zr-border)" }} />
                </div>
              )}

              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: "var(--zr-text-muted)" }}>
                  Amount ($) {person && rates.find(r => r.profile_id === person) ? "(auto-calculated from rate)" : ""}
                </label>
                <input type="number" step="0.01" placeholder="0.00" value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="w-full text-sm rounded px-2.5 py-1.5"
                  style={{ background: "var(--zr-surface-2)", color: "var(--zr-text-primary)", border: "1px solid var(--zr-border)" }} />
              </div>

              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: "var(--zr-text-muted)" }}>Customer (optional)</label>
                <input type="text" placeholder="Customer name" value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  className="w-full text-sm rounded px-2.5 py-1.5"
                  style={{ background: "var(--zr-surface-2)", color: "var(--zr-text-primary)", border: "1px solid var(--zr-border)" }} />
              </div>

              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: "var(--zr-text-muted)" }}>Notes (optional)</label>
                <input type="text" placeholder="Description" value={notes}
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
