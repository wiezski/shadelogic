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
  pay_type: string; // legacy — kept for backwards compat
  rate: number;
  commission_pct: number | null;
  has_hourly: boolean;
  hourly_rate: number;
  has_commission: boolean;
  has_salary: boolean;
  salary_amount: number;
  is_contractor: boolean;
  notes: string | null;
  active: boolean;
  created_at: string;
};

type ContractorRateItem = {
  id: string;
  profile_id: string;
  service_name: string;
  rate: number;
  unit_label: string;
  sort_order: number;
  active: boolean;
  notes: string | null;
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

// Default contractor service line items (based on industry standard)
const DEFAULT_CONTRACTOR_SERVICES = [
  { service_name: "Blind Install", rate: 0, unit_label: "each" },
  { service_name: "Shutter Install", rate: 0, unit_label: "each" },
  { service_name: "Shade Install", rate: 0, unit_label: "each" },
  { service_name: "Motorized Install", rate: 0, unit_label: "each" },
  { service_name: "Take Down / Remove Existing", rate: 0, unit_label: "each" },
  { service_name: "Haul Away", rate: 0, unit_label: "each" },
  { service_name: "Tall Ladder (10'+)", rate: 0, unit_label: "each" },
  { service_name: "Arch / Specialty Shape", rate: 0, unit_label: "each" },
  { service_name: "Masonry / Tile Install", rate: 0, unit_label: "each" },
  { service_name: "Cornice / Valance", rate: 0, unit_label: "per LF" },
  { service_name: "Adjustment / Restring", rate: 0, unit_label: "each" },
  { service_name: "Distance Charge", rate: 0, unit_label: "per mile" },
];

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
  const [contractorRates, setContractorRates] = useState<ContractorRateItem[]>([]);
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

    const [ratesRes, entriesRes, runsRes, contractorRatesRes] = await Promise.all([
      memberIds.length > 0
        ? supabase.from("pay_rates").select("*").in("profile_id", memberIds).eq("active", true).order("created_at", { ascending: false })
        : Promise.resolve({ data: [] }),
      memberIds.length > 0
        ? supabase.from("pay_entries").select("*").in("profile_id", memberIds).order("work_date", { ascending: false }).limit(200)
        : Promise.resolve({ data: [] }),
      supabase.from("payroll_runs").select("*").order("period_start", { ascending: false }).limit(50),
      supabase.from("contractor_rate_items").select("*").eq("active", true).order("sort_order"),
    ]);
    setRates(ratesRes.data ?? []);
    setEntries(entriesRes.data ?? []);
    setRuns(runsRes.data ?? []);
    setContractorRates(contractorRatesRes.data ?? []);
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
                background: filterRange === r ? "var(--zr-orange)" : "var(--zr-surface-2)",
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
        <RatesTab rates={rates} team={team} contractorRates={contractorRates} companyId={companyId} filterPerson={filterPerson} onUpdated={loadAll} />
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
                          style={{ color: "var(--zr-orange)" }}>
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
function RatesTab({ rates, team, contractorRates, companyId, filterPerson, onUpdated }: {
  rates: PayRate[];
  team: TeamMember[];
  contractorRates: ContractorRateItem[];
  companyId: string | null;
  filterPerson: string;
  onUpdated: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formPerson, setFormPerson] = useState("");
  const [formHourly, setFormHourly] = useState(false);
  const [formHourlyRate, setFormHourlyRate] = useState("");
  const [formCommission, setFormCommission] = useState(false);
  const [formCommissionPct, setFormCommissionPct] = useState("");
  const [formSalary, setFormSalary] = useState(false);
  const [formSalaryAmt, setFormSalaryAmt] = useState("");
  const [formContractor, setFormContractor] = useState(false);
  const [formNotes, setFormNotes] = useState("");
  const [saving, setSaving] = useState(false);
  // Contractor rate card editing
  const [editingContractor, setEditingContractor] = useState<string | null>(null);
  const [crItems, setCrItems] = useState<{ service_name: string; rate: string; unit_label: string }[]>([]);
  const [savingCr, setSavingCr] = useState(false);

  function openNew() {
    setEditingId(null);
    setFormPerson(""); setFormHourly(false); setFormHourlyRate("");
    setFormCommission(false); setFormCommissionPct(""); setFormSalary(false);
    setFormSalaryAmt(""); setFormContractor(false); setFormNotes("");
    setShowForm(true);
  }

  function openEdit(r: PayRate) {
    setEditingId(r.id);
    setFormPerson(r.profile_id);
    setFormHourly(r.has_hourly);
    setFormHourlyRate(r.hourly_rate ? String(r.hourly_rate) : "");
    setFormCommission(r.has_commission);
    setFormCommissionPct(r.commission_pct != null ? String(r.commission_pct) : "");
    setFormSalary(r.has_salary);
    setFormSalaryAmt(r.salary_amount ? String(r.salary_amount) : "");
    setFormContractor(r.is_contractor);
    setFormNotes(r.notes || "");
    setShowForm(true);
  }

  const [saveError, setSaveError] = useState<string | null>(null);

  async function saveRate() {
    if (!formPerson || (!formHourly && !formCommission && !formSalary && !formContractor)) return;
    setSaving(true);
    setSaveError(null);
    const payType = formContractor ? "contractor" : formSalary ? "salary" : formHourly ? "hourly" : "commission_only";
    const data = {
      pay_type: payType,
      has_hourly: formHourly,
      hourly_rate: formHourly && formHourlyRate ? parseFloat(formHourlyRate) : 0,
      has_commission: formCommission,
      commission_pct: formCommission && formCommissionPct ? parseFloat(formCommissionPct) : null,
      has_salary: formSalary,
      salary_amount: formSalary && formSalaryAmt ? parseFloat(formSalaryAmt) : 0,
      is_contractor: formContractor,
      rate: formHourly ? (formHourlyRate ? parseFloat(formHourlyRate) : 0) : formSalary ? (formSalaryAmt ? parseFloat(formSalaryAmt) : 0) : 0,
      notes: formNotes || null,
    };
    try {
      if (editingId) {
        const { error } = await supabase.from("pay_rates").update(data).eq("id", editingId);
        if (error) throw error;
      } else {
        // Deactivate old rate (if any)
        await supabase.from("pay_rates").update({ active: false }).eq("profile_id", formPerson).eq("active", true);
        // Insert new rate — always include company_id explicitly
        const { error } = await supabase.from("pay_rates").insert([{
          profile_id: formPerson,
          company_id: companyId,
          active: true,
          ...data,
        }]);
        if (error) throw error;
        // If contractor, seed default rate card if none exists
        if (formContractor) {
          const existing = contractorRates.filter(cr => cr.profile_id === formPerson);
          if (existing.length === 0) {
            const { error: crError } = await supabase.from("contractor_rate_items").insert(
              DEFAULT_CONTRACTOR_SERVICES.map((s, i) => ({ profile_id: formPerson, company_id: companyId, ...s, sort_order: i }))
            );
            if (crError) console.error("Rate card seed error:", crError);
          }
        }
      }
      setShowForm(false); setEditingId(null);
    } catch (err: any) {
      console.error("Save rate error:", err);
      setSaveError(err?.message || "Failed to save pay rate. Please try again.");
    }
    setSaving(false);
    onUpdated();
  }

  async function deleteRate(id: string) {
    if (!confirm("Remove this pay rate?")) return;
    await supabase.from("pay_rates").update({ active: false }).eq("id", id);
    onUpdated();
  }

  // Contractor rate card editing
  function openContractorCard(profileId: string) {
    const items = contractorRates.filter(cr => cr.profile_id === profileId);
    setCrItems(items.map(i => ({ service_name: i.service_name, rate: String(i.rate), unit_label: i.unit_label })));
    setEditingContractor(profileId);
  }

  async function saveContractorCard() {
    if (!editingContractor) return;
    setSavingCr(true);
    // Deactivate all existing items for this contractor
    await supabase.from("contractor_rate_items").update({ active: false }).eq("profile_id", editingContractor);
    // Insert updated items
    const toInsert = crItems.filter(i => i.service_name.trim()).map((i, idx) => ({
      profile_id: editingContractor,
      company_id: companyId,
      service_name: i.service_name.trim(),
      rate: i.rate ? parseFloat(i.rate) : 0,
      unit_label: i.unit_label || "each",
      sort_order: idx,
      active: true,
    }));
    if (toInsert.length > 0) await supabase.from("contractor_rate_items").insert(toInsert);
    setEditingContractor(null);
    setSavingCr(false);
    onUpdated();
  }

  // Group rates by person
  const byPerson = new Map<string, PayRate>();
  for (const r of rates) {
    if (!byPerson.has(r.profile_id)) byPerson.set(r.profile_id, r);
  }

  // Filter team by selected person
  const filteredTeam = filterPerson === "all" ? team : team.filter(t => t.id === filterPerson);

  function getPaySummary(r: PayRate): string[] {
    const parts: string[] = [];
    if (r.has_hourly && r.hourly_rate) parts.push(`${fmtMoney(r.hourly_rate)}/hr`);
    if (r.has_commission && r.commission_pct) parts.push(`${r.commission_pct}% commission`);
    if (r.has_salary && r.salary_amount) parts.push(`${fmtMoney(r.salary_amount)}/period salary`);
    if (r.is_contractor) parts.push("Contractor");
    // Legacy fallback
    if (parts.length === 0 && r.rate) parts.push(`${fmtMoney(r.rate)} (${PAY_TYPE_LABELS[r.pay_type] || r.pay_type})`);
    return parts;
  }

  const inputStyle = { background: "var(--zr-surface-1)", color: "var(--zr-text-primary)", border: "1px solid var(--zr-border)" };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-semibold" style={{ color: "var(--zr-text-muted)" }}>PAY RATE CONFIGURATION</div>
        <button onClick={openNew}
          className="text-xs px-3 py-1.5 rounded font-medium transition-colors"
          style={{ background: "var(--zr-orange)", color: "#fff" }}>
          + Set Pay Rate
        </button>
      </div>

      {/* ── New/Edit Pay Rate Form ── */}
      {showForm && (
        <div className="mb-4 rounded-lg p-4" style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)" }}>
          <div className="text-sm font-semibold mb-3" style={{ color: "var(--zr-text-primary)" }}>
            {editingId ? "Edit Pay Rate" : "New Pay Rate"}
          </div>

          {/* Person selector */}
          <div className="mb-3">
            <label className="text-xs font-medium mb-1 block" style={{ color: "var(--zr-text-muted)" }}>Team Member</label>
            <select value={formPerson} onChange={e => setFormPerson(e.target.value)}
              disabled={!!editingId}
              className="w-full text-sm rounded px-2.5 py-1.5" style={{ ...inputStyle, opacity: editingId ? 0.6 : 1 }}>
              <option value="">Select...</option>
              {team.map(t => <option key={t.id} value={t.id}>{t.full_name || t.role}</option>)}
            </select>
          </div>

          {/* Pay component toggles */}
          <div className="text-xs font-medium mb-2" style={{ color: "var(--zr-text-muted)" }}>Pay Components (select all that apply)</div>
          <div className="flex flex-col gap-3">
            {/* Hourly */}
            <div className="rounded p-3" style={{ border: `1px solid ${formHourly ? "var(--zr-orange)" : "var(--zr-border)"}`, background: formHourly ? "rgba(230,48,0,0.04)" : "transparent" }}>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={formHourly} onChange={e => setFormHourly(e.target.checked)} className="accent-orange-600" />
                <span className="text-sm font-medium" style={{ color: "var(--zr-text-primary)" }}>Hourly</span>
              </label>
              {formHourly && (
                <div className="mt-2 ml-6">
                  <label className="text-xs mb-1 block" style={{ color: "var(--zr-text-muted)" }}>Rate ($/hr)</label>
                  <input type="number" step="0.50" placeholder="0.00" value={formHourlyRate}
                    onChange={e => setFormHourlyRate(e.target.value)}
                    className="text-sm rounded px-2.5 py-1.5 w-40" style={inputStyle} />
                </div>
              )}
            </div>

            {/* Commission */}
            <div className="rounded p-3" style={{ border: `1px solid ${formCommission ? "var(--zr-orange)" : "var(--zr-border)"}`, background: formCommission ? "rgba(230,48,0,0.04)" : "transparent" }}>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={formCommission} onChange={e => setFormCommission(e.target.checked)} className="accent-orange-600" />
                <span className="text-sm font-medium" style={{ color: "var(--zr-text-primary)" }}>Commission</span>
              </label>
              {formCommission && (
                <div className="mt-2 ml-6">
                  <label className="text-xs mb-1 block" style={{ color: "var(--zr-text-muted)" }}>Commission %</label>
                  <input type="number" step="0.5" placeholder="0" value={formCommissionPct}
                    onChange={e => setFormCommissionPct(e.target.value)}
                    className="text-sm rounded px-2.5 py-1.5 w-40" style={inputStyle} />
                </div>
              )}
            </div>

            {/* Salary */}
            <div className="rounded p-3" style={{ border: `1px solid ${formSalary ? "var(--zr-orange)" : "var(--zr-border)"}`, background: formSalary ? "rgba(230,48,0,0.04)" : "transparent" }}>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={formSalary} onChange={e => setFormSalary(e.target.checked)} className="accent-orange-600" />
                <span className="text-sm font-medium" style={{ color: "var(--zr-text-primary)" }}>Salary</span>
              </label>
              {formSalary && (
                <div className="mt-2 ml-6">
                  <label className="text-xs mb-1 block" style={{ color: "var(--zr-text-muted)" }}>Amount per period ($)</label>
                  <input type="number" step="100" placeholder="0.00" value={formSalaryAmt}
                    onChange={e => setFormSalaryAmt(e.target.value)}
                    className="text-sm rounded px-2.5 py-1.5 w-40" style={inputStyle} />
                </div>
              )}
            </div>

            {/* Contractor */}
            <div className="rounded p-3" style={{ border: `1px solid ${formContractor ? "var(--zr-orange)" : "var(--zr-border)"}`, background: formContractor ? "rgba(230,48,0,0.04)" : "transparent" }}>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={formContractor} onChange={e => setFormContractor(e.target.checked)} className="accent-orange-600" />
                <span className="text-sm font-medium" style={{ color: "var(--zr-text-primary)" }}>Contractor (per-unit rate card)</span>
              </label>
              {formContractor && (
                <p className="mt-1 ml-6 text-xs" style={{ color: "var(--zr-text-muted)" }}>
                  A rate card with per-service rates will be created after saving. You can customize rates for each service type.
                </p>
              )}
            </div>
          </div>

          {/* Notes */}
          <div className="mt-3">
            <label className="text-xs font-medium mb-1 block" style={{ color: "var(--zr-text-muted)" }}>Notes (optional)</label>
            <input type="text" placeholder="e.g. Senior installer rate" value={formNotes}
              onChange={e => setFormNotes(e.target.value)}
              className="w-full text-sm rounded px-2.5 py-1.5" style={inputStyle} />
          </div>

          {saveError && (
            <div className="mt-2 text-xs px-3 py-2 rounded" style={{ background: "rgba(220,38,38,0.1)", color: "var(--zr-error)" }}>
              {saveError}
            </div>
          )}

          <div className="flex gap-2 mt-4">
            <button onClick={saveRate} disabled={saving || !formPerson || (!formHourly && !formCommission && !formSalary && !formContractor)}
              className="text-xs px-4 py-1.5 rounded font-medium transition-colors"
              style={{ background: "var(--zr-orange)", color: "#fff", opacity: saving || !formPerson ? 0.5 : 1 }}>
              {saving ? "Saving..." : editingId ? "Update" : "Save Pay Rate"}
            </button>
            <button onClick={() => { setShowForm(false); setEditingId(null); setSaveError(null); }}
              className="text-xs px-4 py-1.5 rounded font-medium transition-colors"
              style={{ color: "var(--zr-text-muted)" }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Contractor Rate Card Editor (modal-like) ── */}
      {editingContractor && (
        <div className="mb-4 rounded-lg p-4" style={{ background: "var(--zr-surface-2)", border: "2px solid var(--zr-orange)" }}>
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold" style={{ color: "var(--zr-text-primary)" }}>
              Rate Card — {team.find(t => t.id === editingContractor)?.full_name || "Contractor"}
            </div>
            <button onClick={() => setCrItems([...crItems, { service_name: "", rate: "", unit_label: "each" }])}
              className="text-xs px-2 py-1 rounded font-medium"
              style={{ background: "var(--zr-orange)", color: "#fff" }}>
              + Add Line
            </button>
          </div>
          <div className="flex flex-col gap-2">
            <div className="grid gap-2 text-xs font-semibold" style={{ gridTemplateColumns: "1fr 100px 90px 30px", color: "var(--zr-text-muted)" }}>
              <span>Service</span><span>Rate ($)</span><span>Unit</span><span></span>
            </div>
            {crItems.map((item, idx) => (
              <div key={idx} className="grid gap-2 items-center" style={{ gridTemplateColumns: "1fr 100px 90px 30px" }}>
                <input type="text" value={item.service_name} placeholder="e.g. Custom Service"
                  onChange={e => { const n = [...crItems]; n[idx].service_name = e.target.value; setCrItems(n); }}
                  className="text-sm rounded px-2 py-1.5" style={inputStyle} />
                <input type="number" step="0.01" value={item.rate} placeholder="0.00"
                  onChange={e => { const n = [...crItems]; n[idx].rate = e.target.value; setCrItems(n); }}
                  className="text-sm rounded px-2 py-1.5" style={inputStyle} />
                <select value={item.unit_label}
                  onChange={e => { const n = [...crItems]; n[idx].unit_label = e.target.value; setCrItems(n); }}
                  className="text-xs rounded px-1.5 py-1.5" style={inputStyle}>
                  <option value="each">each</option>
                  <option value="per LF">per LF</option>
                  <option value="per SF">per SF</option>
                  <option value="per hour">per hour</option>
                  <option value="per mile">per mile</option>
                  <option value="per window">per window</option>
                  <option value="per panel">per panel</option>
                  <option value="flat">flat</option>
                </select>
                <button onClick={() => setCrItems(crItems.filter((_, i) => i !== idx))}
                  className="text-xs font-bold" style={{ color: "var(--zr-error)" }}>✕</button>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-3">
            <button onClick={saveContractorCard} disabled={savingCr}
              className="text-xs px-4 py-1.5 rounded font-medium"
              style={{ background: "var(--zr-orange)", color: "#fff", opacity: savingCr ? 0.5 : 1 }}>
              {savingCr ? "Saving..." : "Save Rate Card"}
            </button>
            <button onClick={() => setCrItems([...crItems, { service_name: "", rate: "", unit_label: "each" }])}
              className="text-xs px-3 py-1.5 rounded font-medium transition-colors"
              style={{ border: "1px dashed var(--zr-border)", color: "var(--zr-text-secondary)" }}>
              + Add Custom Service
            </button>
            <button onClick={() => setEditingContractor(null)}
              className="text-xs px-4 py-1.5 rounded font-medium transition-colors"
              style={{ color: "var(--zr-text-muted)" }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Rate Cards by Person ── */}
      {filteredTeam.length === 0 ? (
        <EmptyState title="No team members found" subtitle="Adjust the filter or add team members first." />
      ) : (
        <div className="flex flex-col gap-3">
          {filteredTeam.map(member => {
            const r = byPerson.get(member.id);
            const personCrItems = contractorRates.filter(cr => cr.profile_id === member.id);

            // No rate configured yet
            if (!r) {
              return (
                <div key={member.id} className="rounded-lg p-4"
                  style={{ background: "var(--zr-surface-2)", border: "1px dashed var(--zr-border)" }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-sm" style={{ color: "var(--zr-text-primary)" }}>
                        {member.full_name || member.role}
                      </span>
                      <span className="ml-2 text-xs px-2 py-0.5 rounded-full"
                        style={{ background: "var(--zr-surface-1)", color: "var(--zr-text-muted)" }}>
                        {member.role}
                      </span>
                    </div>
                    <button onClick={() => { openNew(); setFormPerson(member.id); }}
                      className="text-xs px-3 py-1.5 rounded font-medium transition-colors"
                      style={{ background: "var(--zr-orange)", color: "#fff" }}>
                      + Set Pay Rate
                    </button>
                  </div>
                  <div className="mt-1 text-xs" style={{ color: "var(--zr-text-muted)" }}>No pay rate configured</div>
                </div>
              );
            }

            const summary = getPaySummary(r);

            return (
              <div key={member.id} className="rounded-lg p-4"
                style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)" }}>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="font-semibold text-sm" style={{ color: "var(--zr-text-primary)" }}>
                      {member.full_name || member.role}
                    </span>
                    <span className="ml-2 text-xs px-2 py-0.5 rounded-full"
                      style={{ background: "var(--zr-surface-1)", color: "var(--zr-text-muted)" }}>
                      {r.is_contractor ? "Contractor" : member.role}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(r)}
                      className="text-xs px-2 py-1 rounded font-medium transition-colors"
                      style={{ color: "var(--zr-orange)" }}>
                      Edit
                    </button>
                    {r.is_contractor && (
                      <button onClick={() => openContractorCard(member.id)}
                        className="text-xs px-2 py-1 rounded font-medium transition-colors"
                        style={{ color: "var(--zr-info)" }}>
                        Rate Card
                      </button>
                    )}
                    <button onClick={() => deleteRate(r.id)}
                      className="text-xs px-2 py-1 rounded font-medium transition-colors"
                      style={{ color: "var(--zr-error)" }}>
                      Remove
                    </button>
                  </div>
                </div>

                {/* Pay summary badges */}
                <div className="flex flex-wrap gap-2 text-xs">
                  {summary.map((s, i) => (
                    <span key={i} className="px-2.5 py-1 rounded-full font-medium"
                      style={{ background: "var(--zr-surface-1)", color: "var(--zr-text-secondary)", border: "1px solid var(--zr-border)" }}>
                      {s}
                    </span>
                  ))}
                </div>

                {/* Contractor rate card preview */}
                {r.is_contractor && (
                  <div className="mt-3 pt-2" style={{ borderTop: "1px solid var(--zr-border)" }}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="text-xs font-semibold" style={{ color: "var(--zr-text-muted)" }}>RATE CARD</div>
                      <button onClick={() => openContractorCard(member.id)}
                        className="text-xs font-medium transition-colors"
                        style={{ color: "var(--zr-orange)" }}>
                        Edit / Add Services
                      </button>
                    </div>
                    {personCrItems.length > 0 ? (
                      <div className="grid gap-1" style={{ gridTemplateColumns: "1fr auto auto" }}>
                        {personCrItems.map(item => (
                          <div key={item.id} className="contents text-xs">
                            <span style={{ color: "var(--zr-text-primary)" }}>{item.service_name}</span>
                            <span className="font-semibold text-right" style={{ color: item.rate > 0 ? "var(--zr-text-primary)" : "var(--zr-text-muted)" }}>
                              {item.rate > 0 ? fmtMoney(item.rate) : "—"}
                            </span>
                            <span style={{ color: "var(--zr-text-muted)" }}>/{item.unit_label}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs" style={{ color: "var(--zr-text-muted)" }}>
                        No services configured — click "Edit / Add Services" above
                      </span>
                    )}
                  </div>
                )}

                {r.notes && (
                  <div className="mt-2 text-xs" style={{ color: "var(--zr-text-muted)" }}>{r.notes}</div>
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
          style={{ background: "var(--zr-orange)", color: "#fff" }}>
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
            style={{ background: "var(--zr-orange)", color: "#fff", opacity: saving ? 0.5 : 1 }}>
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
        style={{ background: "var(--zr-orange)", color: "#fff" }}>
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
                style={{ background: "var(--zr-orange)", color: "#fff", opacity: saving || !person || !amount ? 0.5 : 1 }}>
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
