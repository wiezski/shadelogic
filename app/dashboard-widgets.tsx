"use client";

import Link from "next/link";
import { Sparkline, MiniBarChart, PipelineFunnel, DonutChart } from "./charts";

// ── Types ─────────────────────────────────────────────────────
export type DashboardJob = {
  id: string;
  title: string;
  customer_id: string;
  customer_name: string;
  scheduled_at: string | null;
  install_mode: boolean;
  install_scheduled_at: string | null;
  created_at: string;
  overdue?: boolean;
  needs_attention?: boolean;
};

export type TodayAppt = {
  id: string;
  customer_id: string;
  customer_name: string;
  type: string;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  address: string | null;
};

export type TaskDue = {
  id: string;
  title: string;
  due_date: string | null;
  customer_id: string;
  customer_name: string;
};

export type WorkItem = {
  customer_id: string;
  customer_name: string;
  lead_status: string;
  heat_score: string;
  next_action: string | null;
  reason: string;
  days_inactive: number | null;
  priority: number;
  assigned_to: string | null;
  assigned_name: string | null;
};

// ── Shared helpers ────────────────────────────────────────────
function daysAgo(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

const heatStyle: Record<string, string> = {
  Hot:  "bg-red-500 text-white",
  Warm: "bg-amber-400 text-white",
  Cold: "bg-sky-400 text-white",
};

const stageStyle: Record<string, string> = {
  New:       "bg-gray-100 text-gray-600",
  Contacted: "bg-blue-100 text-blue-700",
  Scheduled: "bg-purple-100 text-purple-700",
  Measured:  "bg-amber-100 text-amber-800",
  Quoted:    "bg-orange-100 text-orange-700",
  Sold:      "bg-green-100 text-green-700",
  Installed: "bg-emerald-100 text-emerald-700",
  Lost:      "bg-red-100 text-red-700",
};

// ── Widget IDs ────────────────────────────────────────────────
export const WIDGET_IDS = [
  "quick_actions",
  "kpi_strip",
  "revenue_chart",
  "todays_focus",
  "sales_pipeline",
  "operations",
  "work_queue",
  "ready_to_install",
  "todays_appointments",
  "tasks_due",
] as const;

export type WidgetId = typeof WIDGET_IDS[number];

export const WIDGET_LABELS: Record<WidgetId, string> = {
  quick_actions: "Quick Actions",
  kpi_strip: "KPI Strip",
  revenue_chart: "Revenue Chart",
  todays_focus: "Today's Focus",
  sales_pipeline: "Sales Pipeline",
  operations: "Operations",
  work_queue: "Work Queue",
  ready_to_install: "Ready to Install",
  todays_appointments: "Today's Appointments",
  tasks_due: "Tasks Due",
};

// ── Role-based defaults ───────────────────────────────────────
export const ROLE_LAYOUTS: Record<string, WidgetId[]> = {
  owner: ["quick_actions", "kpi_strip", "revenue_chart", "todays_focus", "sales_pipeline", "operations", "work_queue", "ready_to_install", "todays_appointments", "tasks_due"],
  lead_sales: ["quick_actions", "todays_focus", "kpi_strip", "work_queue", "sales_pipeline", "todays_appointments", "tasks_due", "operations", "revenue_chart", "ready_to_install"],
  sales: ["quick_actions", "todays_focus", "work_queue", "todays_appointments", "tasks_due", "sales_pipeline", "kpi_strip", "operations", "revenue_chart", "ready_to_install"],
  office: ["quick_actions", "todays_appointments", "tasks_due", "operations", "work_queue", "ready_to_install", "kpi_strip", "sales_pipeline", "revenue_chart", "todays_focus"],
  scheduler: ["quick_actions", "todays_appointments", "operations", "ready_to_install", "tasks_due", "work_queue", "kpi_strip", "sales_pipeline", "revenue_chart", "todays_focus"],
  installer: ["quick_actions", "todays_appointments", "operations", "ready_to_install", "tasks_due", "kpi_strip", "work_queue", "sales_pipeline", "revenue_chart", "todays_focus"],
  accounting: ["quick_actions", "kpi_strip", "revenue_chart", "tasks_due", "operations", "work_queue", "sales_pipeline", "todays_appointments", "ready_to_install", "todays_focus"],
  warehouse: ["quick_actions", "operations", "ready_to_install", "tasks_due", "todays_appointments", "kpi_strip", "work_queue", "sales_pipeline", "revenue_chart", "todays_focus"],
};

// ── 1. Quick Actions ──────────────────────────────────────────
export function QuickActionsWidget({ onNewCustomer }: { onNewCustomer: () => void }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <button onClick={onNewCustomer}
        style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)", color: "var(--zr-text-secondary)" }}
        className="rounded py-2.5 text-xs font-medium flex flex-col items-center gap-1">
        <span className="text-lg">👤</span>New Customer
      </button>
      <Link href="/schedule"
        style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)", color: "var(--zr-text-secondary)" }}
        className="rounded py-2.5 text-xs font-medium flex flex-col items-center gap-1 text-center">
        <span className="text-lg">📅</span>Schedule
      </Link>
      <Link href="/reminders"
        style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)", color: "var(--zr-text-secondary)" }}
        className="rounded py-2.5 text-xs font-medium flex flex-col items-center gap-1 text-center">
        <span className="text-lg">🔔</span>Reminders
      </Link>
    </div>
  );
}

// ── 2. KPI Strip ──────────────────────────────────────────────
export function KPIStripWidget({ totalRevenue, revenueTrend, revenueByMonth, totalLeads, leadTrend, activityByWeek, closeRate }: {
  totalRevenue: number; revenueTrend: number; revenueByMonth: { label: string; value: number }[];
  totalLeads: number; leadTrend: number; activityByWeek: number[]; closeRate: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <div style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)", borderRadius: "var(--zr-radius-md)", padding: "10px" }}>
        <div style={{ fontSize: "10px", color: "var(--zr-text-muted)", fontFamily: "var(--zr-font-mono)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Revenue (MTD)</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "4px" }}>
          <span style={{ fontSize: "18px", fontWeight: 700, color: "var(--zr-text-primary)" }}>
            ${totalRevenue >= 1000 ? (totalRevenue / 1000).toFixed(1) + "k" : totalRevenue.toLocaleString()}
          </span>
          {revenueByMonth.length >= 2 && (
            <Sparkline data={revenueByMonth.map(b => b.value)} width={60} height={22} color={revenueTrend >= 0 ? "var(--zr-success)" : "var(--zr-error)"} fillColor={revenueTrend >= 0 ? "var(--zr-success)" : "var(--zr-error)"} />
          )}
        </div>
        {revenueTrend !== 0 && (
          <div style={{ fontSize: "10px", color: revenueTrend > 0 ? "var(--zr-success)" : "var(--zr-error)", fontWeight: 500, marginTop: "2px" }}>
            {revenueTrend > 0 ? "↑" : "↓"} {Math.abs(revenueTrend).toFixed(0)}% vs last mo
          </div>
        )}
      </div>
      <div style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)", borderRadius: "var(--zr-radius-md)", padding: "10px" }}>
        <div style={{ fontSize: "10px", color: "var(--zr-text-muted)", fontFamily: "var(--zr-font-mono)", textTransform: "uppercase", letterSpacing: "0.05em" }}>New Leads (MTD)</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "4px" }}>
          <span style={{ fontSize: "18px", fontWeight: 700, color: "var(--zr-text-primary)" }}>{totalLeads}</span>
          {activityByWeek.length >= 2 && (
            <Sparkline data={activityByWeek} width={60} height={22} color="var(--zr-info)" fillColor="var(--zr-info)" />
          )}
        </div>
        {leadTrend !== 0 && (
          <div style={{ fontSize: "10px", color: leadTrend > 0 ? "var(--zr-success)" : "var(--zr-error)", fontWeight: 500, marginTop: "2px" }}>
            {leadTrend > 0 ? "↑" : "↓"} {Math.abs(leadTrend).toFixed(0)}% vs last mo
          </div>
        )}
      </div>
      <div style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)", borderRadius: "var(--zr-radius-md)", padding: "10px" }}>
        <div style={{ fontSize: "10px", color: "var(--zr-text-muted)", fontFamily: "var(--zr-font-mono)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Close Rate</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "4px" }}>
          <span style={{ fontSize: "18px", fontWeight: 700, color: "var(--zr-text-primary)" }}>{closeRate.toFixed(0)}%</span>
          <DonutChart value={closeRate} size={36} strokeWidth={5} color={closeRate >= 50 ? "var(--zr-success)" : closeRate >= 30 ? "var(--zr-warning)" : "var(--zr-error)"} />
        </div>
      </div>
      <div style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)", borderRadius: "var(--zr-radius-md)", padding: "10px" }}>
        <div style={{ fontSize: "10px", color: "var(--zr-text-muted)", fontFamily: "var(--zr-font-mono)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Activity (8wk)</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "4px" }}>
          <span style={{ fontSize: "18px", fontWeight: 700, color: "var(--zr-text-primary)" }}>{activityByWeek.reduce((a, b) => a + b, 0)}</span>
          {activityByWeek.length >= 2 && (
            <Sparkline data={activityByWeek} width={60} height={22} color="var(--zr-orange)" fillColor="var(--zr-orange)" />
          )}
        </div>
        <div style={{ fontSize: "10px", color: "var(--zr-text-muted)", marginTop: "2px" }}>calls, texts, emails</div>
      </div>
    </div>
  );
}

// ── 3. Revenue Chart ──────────────────────────────────────────
export function RevenueChartWidget({ revenueByMonth }: { revenueByMonth: { label: string; value: number }[] }) {
  if (!revenueByMonth.some(b => b.value > 0)) return null;
  return (
    <div style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)", borderRadius: "var(--zr-radius-md)", padding: "12px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
        <span style={{ fontSize: "11px", color: "var(--zr-text-muted)", fontFamily: "var(--zr-font-mono)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Revenue — Last 6 Months</span>
        <Link href="/analytics" style={{ color: "var(--zr-orange)", fontSize: "11px" }} className="hover:underline">Details →</Link>
      </div>
      <MiniBarChart bars={revenueByMonth} width={320} height={80} />
    </div>
  );
}

// ── 4. Today's Focus ──────────────────────────────────────────
export function TodaysFocusWidget({ focusItems }: { focusItems: { label: string; sub: string; href: string; color: string }[] }) {
  if (focusItems.length === 0) return null;
  return (
    <div style={{ background: "var(--zr-surface-1)", border: "2px solid var(--zr-orange)" }} className="rounded-xl p-3">
      <div style={{ color: "var(--zr-text-primary)" }} className="text-xs font-bold uppercase tracking-wide mb-2">Today&apos;s Focus</div>
      <ul className="space-y-2">
        {focusItems.map((item, i) => (
          <li key={i}>
            <Link href={item.href} className="flex items-center justify-between gap-2 rounded-lg p-2">
              <div className="min-w-0">
                <div className={`text-sm font-semibold ${item.color}`}>{item.label}</div>
                <div style={{ color: "var(--zr-text-muted)" }} className="text-xs truncate">{item.sub}</div>
              </div>
              <span style={{ color: "var(--zr-text-muted)" }} className="shrink-0">→</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── 5. Sales Pipeline ─────────────────────────────────────────
const ALL_STAGES = ["New","Contacted","Consult Scheduled","Measure Scheduled","Measured","Quoted","Sold","Contact for Install","Installed","Complete","Lost","On Hold","Waiting"];
const STAGE_COLORS: Record<string, string> = {
  "New": "text-gray-700", "Contacted": "text-blue-600",
  "Consult Scheduled": "text-indigo-600", "Measure Scheduled": "text-purple-600",
  "Measured": "text-amber-700", "Quoted": "text-orange-600",
  "Sold": "text-green-600", "Contact for Install": "text-teal-600",
  "Installed": "text-emerald-600", "Complete": "text-lime-700",
  "Lost": "text-red-600", "On Hold": "text-yellow-700", "Waiting": "text-slate-500",
};

export function SalesPipelineWidget({ customers, pipelineValue, selectedStage, setSelectedStage }: {
  customers: { id: string; first_name: string | null; last_name: string | null; lead_status: string | null; heat_score: string | null; last_activity_at: string | null; address: string | null }[];
  pipelineValue: Record<string, number>;
  selectedStage: string | null;
  setSelectedStage: (s: string | null) => void;
}) {
  const stageCounts = ALL_STAGES.reduce((acc, s) => {
    acc[s] = customers.filter(c => c.lead_status === s).length;
    return acc;
  }, {} as Record<string, number>);

  const stageCustomers = selectedStage ? customers.filter(c => c.lead_status === selectedStage) : [];

  function PipelineCard({ stage }: { stage: string }) {
    const active = selectedStage === stage;
    const count = stageCounts[stage] ?? 0;
    const value = pipelineValue[stage] ?? 0;
    return (
      <button type="button" onClick={() => setSelectedStage(active ? null : stage)}
        style={{ background: active ? "var(--zr-orange)" : "var(--zr-surface-1)", border: active ? "1px solid var(--zr-orange)" : "1px solid var(--zr-border)", color: active ? "#fff" : "var(--zr-text-primary)" }}
        className="rounded p-2 text-center w-full transition-colors">
        <div style={{ color: active ? "#fff" : undefined }} className={`text-xl font-bold ${active ? "" : STAGE_COLORS[stage] ?? "text-black"}`}>{count}</div>
        <div style={{ color: active ? "rgba(255,255,255,0.7)" : "var(--zr-text-muted)" }} className="text-xs mt-0.5 leading-tight">{stage}</div>
        {value > 0 && (
          <div style={{ color: active ? "rgba(34,197,94,0.8)" : "var(--zr-success)" }} className="text-xs mt-0.5 font-medium">
            ${value >= 1000 ? (value / 1000).toFixed(1) + "k" : value.toFixed(0)}
          </div>
        )}
      </button>
    );
  }

  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <span style={{ color: "var(--zr-text-muted)", fontFamily: "var(--zr-font-mono)" }} className="text-xs font-semibold uppercase tracking-wide">Sales Pipeline</span>
        <div style={{ borderColor: "var(--zr-border)" }} className="flex-1 border-t" />
      </div>
      <div className="mb-2 grid grid-cols-5 gap-1.5 sm:grid-cols-10">
        {ALL_STAGES.map(s => <PipelineCard key={s} stage={s} />)}
      </div>
      {customers.length > 0 && (
        <div style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)", borderRadius: "var(--zr-radius-md)", padding: "12px" }} className="mb-1">
          <PipelineFunnel
            stages={[
              { label: "New", count: stageCounts["New"] || 0, value: pipelineValue["New"], color: "#9ca3af" },
              { label: "Contacted", count: stageCounts["Contacted"] || 0, value: pipelineValue["Contacted"], color: "#3b82f6" },
              { label: "Scheduled", count: (stageCounts["Consult Scheduled"] || 0) + (stageCounts["Measure Scheduled"] || 0), color: "#8b5cf6" },
              { label: "Measured", count: stageCounts["Measured"] || 0, value: pipelineValue["Measured"], color: "#d97706" },
              { label: "Quoted", count: stageCounts["Quoted"] || 0, value: pipelineValue["Quoted"], color: "#ea580c" },
              { label: "Sold", count: stageCounts["Sold"] || 0, value: pipelineValue["Sold"], color: "#16a34a" },
              { label: "Installed", count: (stageCounts["Installed"] || 0) + (stageCounts["Complete"] || 0), color: "#059669" },
            ]}
            height={22}
          />
        </div>
      )}
      {selectedStage && (
        <div style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }} className="rounded p-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 style={{ color: "var(--zr-text-primary)" }} className="font-semibold">{selectedStage} <span style={{ color: "var(--zr-text-muted)" }} className="font-normal text-sm">({stageCustomers.length})</span></h2>
            <button type="button" onClick={() => setSelectedStage(null)} style={{ color: "var(--zr-text-muted)" }} className="text-xs">✕ close</button>
          </div>
          {stageCustomers.length === 0 ? (
            <p style={{ color: "var(--zr-text-muted)" }} className="text-sm">No customers at this stage.</p>
          ) : (
            <ul className="space-y-1.5">
              {stageCustomers.map(c => {
                const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unknown";
                const inactive = c.last_activity_at ? daysAgo(c.last_activity_at) : null;
                return (
                  <li key={c.id}>
                    <Link href={`/customers/${c.id}`}
                      style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)" }}
                      className="flex items-center justify-between rounded p-2 gap-2">
                      <div className="min-w-0">
                        <div style={{ color: "var(--zr-orange)" }} className="text-sm font-medium truncate">{name}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {c.heat_score && <span className={`text-xs rounded px-1.5 py-0.5 ${heatStyle[c.heat_score]}`}>{c.heat_score}</span>}
                        {inactive !== null && <span style={{ color: "var(--zr-text-muted)" }} className="text-xs">{inactive}d ago</span>}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ── 6. Operations ─────────────────────────────────────────────
type FilterKey = "measures_to_schedule" | "measures_done" | "installs_to_schedule" | "installs_scheduled" | "issues";

export function OperationsWidget({ measuresToSchedule, measuresDone, installsToSchedule, installsScheduled, issueJobs, statsLoading }: {
  measuresToSchedule: DashboardJob[]; measuresDone: DashboardJob[];
  installsToSchedule: DashboardJob[]; installsScheduled: DashboardJob[];
  issueJobs: DashboardJob[]; statsLoading: boolean;
}) {
  const [selectedFilter, setSelectedFilter] = useState<FilterKey | null>(null);

  const filterJobs: Record<FilterKey, DashboardJob[]> = {
    measures_to_schedule: measuresToSchedule, measures_done: measuresDone,
    installs_to_schedule: installsToSchedule, installs_scheduled: installsScheduled,
    issues: issueJobs,
  };
  const filterLabels: Record<FilterKey, string> = {
    measures_to_schedule: "Measures to Schedule", measures_done: "Measures Done",
    installs_to_schedule: "Installs to Schedule", installs_scheduled: "Installs Scheduled",
    issues: "Open Issues",
  };

  function StatCard({ label, count, filterKey, color = "text-black" }: { label: string; count: number; filterKey: FilterKey; color?: string }) {
    const active = selectedFilter === filterKey;
    return (
      <button type="button" onClick={() => setSelectedFilter(active ? null : filterKey)}
        style={{ background: active ? "var(--zr-orange)" : "var(--zr-surface-1)", border: active ? "1px solid var(--zr-orange)" : "1px solid var(--zr-border)", color: active ? "#fff" : "var(--zr-text-primary)" }}
        className="rounded p-3 text-center w-full transition-colors">
        <div style={{ color: active ? "#fff" : undefined }} className={`text-2xl font-bold ${active ? "" : color}`}>{statsLoading ? "—" : count}</div>
        <div style={{ color: active ? "rgba(255,255,255,0.7)" : "var(--zr-text-muted)" }} className="text-xs mt-1">{label}</div>
      </button>
    );
  }

  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <span style={{ color: "var(--zr-text-muted)", fontFamily: "var(--zr-font-mono)" }} className="text-xs font-semibold uppercase tracking-wide">Operations</span>
        <div style={{ borderColor: "var(--zr-border)" }} className="flex-1 border-t" />
      </div>
      <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <StatCard label="Measures to Schedule" count={measuresToSchedule.length} filterKey="measures_to_schedule" />
        <StatCard label="Measures Done" count={measuresDone.length} filterKey="measures_done" color="text-green-600" />
        <StatCard label="Installs to Schedule" count={installsToSchedule.length} filterKey="installs_to_schedule" />
        <StatCard label="Installs Scheduled" count={installsScheduled.length} filterKey="installs_scheduled" color="text-blue-600" />
        <StatCard label="Open Issues" count={issueJobs.length} filterKey="issues" color={issueJobs.length > 0 ? "text-red-600" : "text-black"} />
      </div>
      {selectedFilter && (
        <div style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }} className="rounded p-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 style={{ color: "var(--zr-text-primary)" }} className="font-semibold">{filterLabels[selectedFilter]}</h2>
            <button type="button" onClick={() => setSelectedFilter(null)} style={{ color: "var(--zr-text-muted)" }} className="text-xs">✕ close</button>
          </div>
          {filterJobs[selectedFilter].length === 0 ? (
            <p style={{ color: "var(--zr-text-muted)" }} className="text-sm">None right now.</p>
          ) : (
            <ul className="space-y-2">
              {filterJobs[selectedFilter].map(job => (
                <li key={job.id}>
                  <Link href={`/measure-jobs/${job.id}`} style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)" }} className="block rounded p-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div style={{ color: "var(--zr-orange)" }} className="text-sm font-medium">{job.title}</div>
                        <div style={{ color: "var(--zr-text-muted)" }} className="text-xs">{job.customer_name}</div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {job.overdue && <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Overdue</span>}
                        {job.needs_attention && !job.overdue && daysAgo(job.created_at) > 5 && (
                          <span style={{ background: "rgba(90,86,82,0.3)", color: "var(--zr-text-muted)" }} className="rounded px-2 py-0.5 text-xs">Idle {daysAgo(job.created_at)}d</span>
                        )}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ── 7. Work Queue ─────────────────────────────────────────────
export function WorkQueueWidget({ workQueue, workQueueLoading, currentUserId, queueFilter, setQueueFilter, canAssign = false }: {
  workQueue: WorkItem[]; workQueueLoading: boolean;
  currentUserId: string | null; queueFilter: "mine" | "all"; setQueueFilter: (f: "mine" | "all") => void;
  canAssign?: boolean;
}) {
  if (workQueueLoading) {
    return (
      <div style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }} className="rounded p-3">
        <div style={{ color: "var(--zr-text-muted)" }} className="text-xs">Loading work queue...</div>
      </div>
    );
  }
  const filteredQueue = queueFilter === "mine" && currentUserId
    ? workQueue.filter(w => w.assigned_to === currentUserId)
    : workQueue;

  if (workQueue.length === 0) return null;

  return (
    <div style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }} className="rounded p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 style={{ color: "var(--zr-text-primary)" }} className="flex items-center gap-2 text-sm font-semibold">
          Work Queue
          <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${filteredQueue.some(w => w.priority === 1) ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
            {filteredQueue.length}
          </span>
        </h2>
        {canAssign ? (
          <div className="flex rounded overflow-hidden" style={{ border: "1px solid var(--zr-border)" }}>
            <button onClick={() => setQueueFilter("mine")} className="px-2.5 py-1 text-xs font-medium"
              style={{ background: queueFilter === "mine" ? "var(--zr-orange)" : "var(--zr-surface-2)", color: queueFilter === "mine" ? "#fff" : "var(--zr-text-secondary)" }}>Mine</button>
            <button onClick={() => setQueueFilter("all")} className="px-2.5 py-1 text-xs font-medium"
              style={{ background: queueFilter === "all" ? "var(--zr-orange)" : "var(--zr-surface-2)", color: queueFilter === "all" ? "#fff" : "var(--zr-text-secondary)", borderLeft: "1px solid var(--zr-border)" }}>All</button>
          </div>
        ) : null}
      </div>
      {filteredQueue.length === 0 ? (
        <p style={{ color: "var(--zr-text-muted)" }} className="text-xs py-2 text-center">No items in your queue right now.</p>
      ) : (
        <ul className="space-y-1.5">
          {filteredQueue.slice(0, 8).map(w => (
            <li key={w.customer_id}>
              <Link href={`/customers/${w.customer_id}`} style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)" }} className="flex items-start justify-between gap-2 rounded p-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span style={{ color: "var(--zr-orange)" }} className="text-sm font-medium">{w.customer_name}</span>
                    {w.heat_score && w.heat_score !== "Warm" && (
                      <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${w.heat_score === "Hot" ? "bg-red-500 text-white" : "bg-sky-400 text-white"}`}>{w.heat_score}</span>
                    )}
                    <span className={`rounded px-1.5 py-0.5 text-xs ${stageStyle[w.lead_status] || "bg-gray-100 text-gray-600"}`}>{w.lead_status}</span>
                    {w.assigned_name && queueFilter === "all" && (
                      <span className="rounded px-1.5 py-0.5 text-xs bg-indigo-100 text-indigo-700">{w.assigned_name}</span>
                    )}
                  </div>
                  <div style={{ color: "var(--zr-text-muted)" }} className="mt-0.5 text-xs">{w.reason}</div>
                  {w.next_action && <div style={{ color: "var(--zr-warning)" }} className="mt-0.5 text-xs font-medium">→ {w.next_action}</div>}
                </div>
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${w.priority === 1 ? "bg-red-100 text-red-700" : w.priority === 2 ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500"}`}>
                  {w.priority === 1 ? "Now" : w.priority === 2 ? "Today" : "Soon"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {filteredQueue.length > 8 && (
        <p style={{ color: "var(--zr-text-muted)" }} className="mt-2 text-xs text-center">+{filteredQueue.length - 8} more — check Customers tab</p>
      )}
    </div>
  );
}

// ── 8. Ready to Install ───────────────────────────────────────
export function ReadyToInstallWidget({ readyToInstall }: { readyToInstall: { id: string; name: string }[] }) {
  if (readyToInstall.length === 0) return null;
  return (
    <div style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)" }} className="rounded p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 style={{ color: "var(--zr-success)" }} className="text-sm font-semibold">
          ✓ Ready to Install
          <span style={{ background: "rgba(34,197,94,0.2)", color: "var(--zr-success)" }} className="ml-1.5 rounded px-1.5 py-0.5 text-xs font-medium">{readyToInstall.length}</span>
        </h2>
        <span style={{ color: "var(--zr-success)" }} className="text-xs">All materials received</span>
      </div>
      <ul className="space-y-1">
        {readyToInstall.map(c => (
          <li key={c.id}>
            <Link href={`/customers/${c.id}`}
              style={{ background: "var(--zr-surface-2)", border: "1px solid rgba(34,197,94,0.2)" }}
              className="flex items-center justify-between rounded p-2">
              <span style={{ color: "var(--zr-success)" }} className="text-sm font-medium">{c.name}</span>
              <span style={{ color: "var(--zr-success)" }} className="text-xs">Schedule install →</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── 9. Today's Appointments ───────────────────────────────────
export function TodaysAppointmentsWidget({ todayAppts }: { todayAppts: TodayAppt[] }) {
  if (todayAppts.length === 0) return null;

  const now = new Date();
  const nextAppt = todayAppts.find(a =>
    new Date(a.scheduled_at) >= now && a.status !== "completed" && a.status !== "canceled"
  ) ?? null;
  const unconfirmed = todayAppts.filter(a => a.status === "scheduled");

  const typeLabels: Record<string, string> = {
    sales_consultation: "Sales Consult", measure: "Measure", install: "Install",
    service_call: "Service Call", repair: "Repair", site_walk: "Site Walk", punch: "Punch Visit",
  };
  const typeColors: Record<string, string> = {
    sales_consultation: "bg-blue-100 text-blue-700", measure: "bg-purple-100 text-purple-700",
    install: "bg-green-100 text-green-700", service_call: "bg-orange-100 text-orange-700",
    repair: "bg-amber-100 text-amber-700", site_walk: "bg-teal-100 text-teal-700", punch: "bg-slate-100 text-slate-600",
  };

  return (
    <div style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }} className="rounded p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 style={{ color: "var(--zr-text-primary)" }} className="text-sm font-semibold">
          Today&apos;s Appointments
          <span className="ml-1.5 rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700">{todayAppts.length}</span>
        </h2>
        <Link href="/schedule" style={{ color: "var(--zr-info)" }} className="text-xs hover:underline">View calendar →</Link>
      </div>
      {unconfirmed.length > 0 && (
        <div style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)" }} className="mb-2 flex items-center gap-1.5 rounded px-2 py-1.5">
          <span className="text-amber-600 text-xs">⚠️</span>
          <span style={{ color: "var(--zr-warning)" }} className="text-xs font-medium">
            {unconfirmed.length} appointment{unconfirmed.length > 1 ? "s" : ""} not yet confirmed
          </span>
        </div>
      )}
      <ul className="space-y-1.5">
        {todayAppts.map(a => {
          const dt = new Date(a.scheduled_at);
          const timeStr = dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
          const isNext = nextAppt?.id === a.id;
          return (
            <li key={a.id}>
              <Link href={`/customers/${a.customer_id}`}
                style={{ background: isNext ? "rgba(59,130,246,0.1)" : "var(--zr-surface-2)", border: isNext ? "1px solid rgba(59,130,246,0.3)" : "1px solid var(--zr-border)" }}
                className="flex items-center justify-between rounded p-2 gap-2">
                <div className="min-w-0">
                  {isNext && <div style={{ color: "var(--zr-info)" }} className="text-xs font-semibold mb-0.5">▶ Next up</div>}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`text-xs rounded px-1.5 py-0.5 ${typeColors[a.type] ?? "bg-gray-100 text-gray-600"}`}>
                      {typeLabels[a.type] ?? a.type}
                    </span>
                    <span style={{ color: "var(--zr-orange)" }} className="text-sm font-medium truncate">{a.customer_name}</span>
                  </div>
                  {a.address && <div style={{ color: "var(--zr-text-muted)" }} className="text-xs truncate mt-0.5">📍 {a.address}</div>}
                </div>
                <div className="shrink-0 text-right">
                  <div style={{ color: isNext ? "var(--zr-info)" : "var(--zr-text-primary)" }} className="text-sm font-medium">{timeStr}</div>
                  <div className={`text-xs ${a.status === "confirmed" ? "text-blue-600" : a.status === "completed" ? "text-green-600" : a.status === "scheduled" ? "text-amber-500" : "text-gray-400"}`}>
                    {a.status}
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── 10. Tasks Due ─────────────────────────────────────────────
export function TasksDueWidget({ tasksDue }: { tasksDue: TaskDue[] }) {
  if (tasksDue.length === 0) return null;
  return (
    <div style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }} className="rounded p-3">
      <h2 style={{ color: "var(--zr-text-primary)" }} className="mb-2 text-sm font-semibold">
        Tasks Due
        <span className="ml-1.5 rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">{tasksDue.length}</span>
      </h2>
      <ul className="space-y-1.5">
        {tasksDue.map(t => (
          <li key={t.id}>
            <Link href={`/customers/${t.customer_id}`} style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)" }} className="flex items-center justify-between rounded p-2">
              <div>
                <div style={{ color: "var(--zr-orange)" }} className="text-sm font-medium">{t.title}</div>
                <div style={{ color: "var(--zr-text-muted)" }} className="text-xs">{t.customer_name}</div>
              </div>
              {t.due_date && (
                <span className={`text-xs font-medium ${t.due_date < new Date().toISOString().slice(0, 10) ? "text-red-600" : "text-amber-600"}`}>
                  {t.due_date < new Date().toISOString().slice(0, 10) ? "Overdue" : "Today"}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Need useState for OperationsWidget internal state
import { useState } from "react";
