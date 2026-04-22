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

// Muted Apple-style palette: soft tint background + firm label color.
// Keeps status recognizable without the old saturated bg-red-500 shout.
const heatStyle: Record<string, string> = {
  Hot:  "bg-[rgba(214,58,58,0.12)] text-[#c6443a]",
  Warm: "bg-[rgba(224,138,0,0.12)] text-[#b8710b]",
  Cold: "bg-[rgba(10,132,255,0.12)] text-[#0a84ff]",
};

const stageStyle: Record<string, string> = {
  New:       "bg-[rgba(60,60,67,0.08)] text-[#3c3c43]",
  Contacted: "bg-[rgba(10,132,255,0.12)] text-[#0a84ff]",
  Scheduled: "bg-[rgba(139,92,246,0.12)] text-[#7c3aed]",
  Measured:  "bg-[rgba(224,138,0,0.12)] text-[#b8710b]",
  Quoted:    "bg-[rgba(214,90,49,0.12)] text-[#c25a2f]",
  Sold:      "bg-[rgba(48,164,108,0.14)] text-[#288a58]",
  Installed: "bg-[rgba(48,164,108,0.14)] text-[#1f6e48]",
  Lost:      "bg-[rgba(214,58,58,0.10)] text-[#c6443a]",
};

// ── v2 Section Header — small uppercase label that floats above a card ──
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="zr-v2-section-label">{children}</div>
  );
}

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
  "shipments",
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
  shipments: "Shipments & Deliveries",
};

// ── Role-based defaults ───────────────────────────────────────
export const ROLE_LAYOUTS: Record<string, WidgetId[]> = {
  owner: ["quick_actions", "shipments", "kpi_strip", "revenue_chart", "todays_focus", "sales_pipeline", "operations", "work_queue", "ready_to_install", "todays_appointments", "tasks_due"],
  lead_sales: ["quick_actions", "todays_focus", "kpi_strip", "work_queue", "sales_pipeline", "todays_appointments", "tasks_due", "shipments", "operations", "revenue_chart", "ready_to_install"],
  sales: ["quick_actions", "todays_focus", "work_queue", "todays_appointments", "tasks_due", "sales_pipeline", "kpi_strip", "shipments", "operations", "revenue_chart", "ready_to_install"],
  office: ["quick_actions", "todays_appointments", "tasks_due", "shipments", "operations", "work_queue", "ready_to_install", "kpi_strip", "sales_pipeline", "revenue_chart", "todays_focus"],
  scheduler: ["quick_actions", "todays_appointments", "shipments", "operations", "ready_to_install", "tasks_due", "work_queue", "kpi_strip", "sales_pipeline", "revenue_chart", "todays_focus"],
  installer: ["quick_actions", "todays_appointments", "shipments", "operations", "ready_to_install", "tasks_due", "kpi_strip", "work_queue", "sales_pipeline", "revenue_chart", "todays_focus"],
  accounting: ["quick_actions", "kpi_strip", "revenue_chart", "tasks_due", "operations", "shipments", "work_queue", "sales_pipeline", "todays_appointments", "ready_to_install", "todays_focus"],
  warehouse: ["quick_actions", "shipments", "operations", "ready_to_install", "tasks_due", "todays_appointments", "kpi_strip", "work_queue", "sales_pipeline", "revenue_chart", "todays_focus"],
};

// ── 1. Quick Actions — tappable tiles on a grid ──────────────
export function QuickActionsWidget({ onNewCustomer }: { onNewCustomer: () => void }) {
  const tile = {
    background: "var(--zr-surface-1)",
    boxShadow: "var(--zr-shadow-sm)",
    color: "var(--zr-text-primary)",
  } as const;
  return (
    <div className="grid grid-cols-3 gap-3">
      <button onClick={onNewCustomer}
        style={tile}
        className="rounded-2xl py-5 text-[13px] font-medium flex flex-col items-center gap-2 transition-transform active:scale-95">
        <span className="text-2xl leading-none">👤</span>
        <span>New customer</span>
      </button>
      <Link href="/schedule"
        style={tile}
        className="rounded-2xl py-5 text-[13px] font-medium flex flex-col items-center gap-2 text-center transition-transform active:scale-95">
        <span className="text-2xl leading-none">📅</span>
        <span>Schedule</span>
      </Link>
      <Link href="/reminders"
        style={tile}
        className="rounded-2xl py-5 text-[13px] font-medium flex flex-col items-center gap-2 text-center transition-transform active:scale-95">
        <span className="text-2xl leading-none">🔔</span>
        <span>Reminders</span>
      </Link>
    </div>
  );
}

// ── 2. KPI Strip — clean stat blocks, big numbers, soft shadow ──
export function KPIStripWidget({ totalRevenue, revenueTrend, revenueByMonth, totalLeads, leadTrend, activityByWeek, closeRate }: {
  totalRevenue: number; revenueTrend: number; revenueByMonth: { label: string; value: number }[];
  totalLeads: number; leadTrend: number; activityByWeek: number[]; closeRate: number;
}) {
  const statCard = {
    background: "var(--zr-surface-1)",
    borderRadius: "var(--zr-radius-lg)",
    boxShadow: "var(--zr-shadow-sm)",
    padding: "16px",
  } as const;
  const kpiLabel = {
    fontSize: "12px",
    color: "var(--zr-text-muted)",
    fontWeight: 500,
    letterSpacing: "-0.005em",
  } as const;
  const kpiValue = {
    fontSize: "24px",
    fontWeight: 700,
    color: "var(--zr-text-primary)",
    letterSpacing: "-0.02em",
    lineHeight: 1.1,
  } as const;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div style={statCard}>
        <div style={kpiLabel}>Revenue · MTD</div>
        <div className="flex items-end justify-between mt-2">
          <span style={kpiValue}>
            ${totalRevenue >= 1000 ? (totalRevenue / 1000).toFixed(1) + "k" : totalRevenue.toLocaleString()}
          </span>
          {revenueByMonth.length >= 2 && (
            <Sparkline data={revenueByMonth.map(b => b.value)} width={56} height={22} color={revenueTrend >= 0 ? "var(--zr-success)" : "var(--zr-error)"} fillColor={revenueTrend >= 0 ? "var(--zr-success)" : "var(--zr-error)"} />
          )}
        </div>
        {revenueTrend !== 0 && (
          <div style={{ fontSize: "12px", color: revenueTrend > 0 ? "var(--zr-success)" : "var(--zr-error)", fontWeight: 500, marginTop: "4px" }}>
            {revenueTrend > 0 ? "↑" : "↓"} {Math.abs(revenueTrend).toFixed(0)}% vs last mo
          </div>
        )}
      </div>
      <div style={statCard}>
        <div style={kpiLabel}>New leads · MTD</div>
        <div className="flex items-end justify-between mt-2">
          <span style={kpiValue}>{totalLeads}</span>
          {activityByWeek.length >= 2 && (
            <Sparkline data={activityByWeek} width={56} height={22} color="var(--zr-info)" fillColor="var(--zr-info)" />
          )}
        </div>
        {leadTrend !== 0 && (
          <div style={{ fontSize: "12px", color: leadTrend > 0 ? "var(--zr-success)" : "var(--zr-error)", fontWeight: 500, marginTop: "4px" }}>
            {leadTrend > 0 ? "↑" : "↓"} {Math.abs(leadTrend).toFixed(0)}% vs last mo
          </div>
        )}
      </div>
      <div style={statCard}>
        <div style={kpiLabel}>Close rate</div>
        <div className="flex items-end justify-between mt-2">
          <span style={kpiValue}>{closeRate.toFixed(0)}%</span>
          <DonutChart value={closeRate} size={40} strokeWidth={5} color={closeRate >= 50 ? "var(--zr-success)" : closeRate >= 30 ? "var(--zr-warning)" : "var(--zr-error)"} />
        </div>
      </div>
      <div style={statCard}>
        <div style={kpiLabel}>Activity · 8wk</div>
        <div className="flex items-end justify-between mt-2">
          <span style={kpiValue}>{activityByWeek.reduce((a, b) => a + b, 0)}</span>
          {activityByWeek.length >= 2 && (
            <Sparkline data={activityByWeek} width={56} height={22} color="var(--zr-orange)" fillColor="var(--zr-orange)" />
          )}
        </div>
        <div style={{ fontSize: "12px", color: "var(--zr-text-muted)", marginTop: "4px" }}>calls, texts, emails</div>
      </div>
    </div>
  );
}

// ── 3. Revenue Chart ──────────────────────────────────────────
export function RevenueChartWidget({ revenueByMonth }: { revenueByMonth: { label: string; value: number }[] }) {
  if (!revenueByMonth.some(b => b.value > 0)) return null;
  return (
    <div>
      <SectionLabel>Revenue — last 6 months</SectionLabel>
      <div className="zr-v2-card" style={{ padding: "18px" }}>
        <div className="flex items-center justify-between mb-3">
          <span style={{ fontSize: "15px", fontWeight: 600, color: "var(--zr-text-primary)" }}>Trend</span>
          <Link href="/analytics" style={{ color: "var(--zr-orange)", fontSize: "13px", fontWeight: 500 }}>Details ›</Link>
        </div>
        <MiniBarChart bars={revenueByMonth} width={320} height={88} />
      </div>
    </div>
  );
}

// ── 4. Today's Focus — clean grouped list, no scary border ───
export function TodaysFocusWidget({ focusItems }: { focusItems: { label: string; sub: string; href: string; color: string }[] }) {
  if (focusItems.length === 0) return null;

  // Emoji glyph per item (derived from text) for leading icon tile
  function glyph(label: string): string {
    const s = label.toLowerCase();
    if (s.includes("overdue")) return "⏰";
    if (s.includes("deposit")) return "💳";
    if (s.includes("quote")) return "📄";
    if (s.includes("call") || s.includes("contact")) return "📞";
    if (s.includes("install")) return "🔧";
    if (s.includes("measure")) return "📐";
    return "★";
  }
  // Tint color for the icon tile — derived from the item's existing tailwind
  // text color so overdue=red, deposits=amber, etc., without a loud border.
  function tileStyle(colorClass: string) {
    if (colorClass.includes("red"))    return { background: "rgba(214,58,58,0.12)", color: "#c6443a" };
    if (colorClass.includes("amber")) return { background: "rgba(224,138,0,0.12)", color: "#b8710b" };
    if (colorClass.includes("orange")) return { background: "rgba(214,90,49,0.14)", color: "#c25a2f" };
    if (colorClass.includes("blue")) return { background: "rgba(10,132,255,0.12)", color: "#0a84ff" };
    if (colorClass.includes("green")) return { background: "rgba(48,164,108,0.14)", color: "#288a58" };
    return { background: "var(--zr-surface-3)", color: "var(--zr-text-secondary)" };
  }

  return (
    <div>
      <SectionLabel>Today&apos;s focus</SectionLabel>
      <div className="zr-v2-card">
        <div className="zr-v2-list">
          {focusItems.map((item, i) => {
            const ts = tileStyle(item.color);
            return (
              <Link key={i} href={item.href} className="zr-v2-row">
                <span className="zr-v2-icon-tile" style={ts}>{glyph(item.label)}</span>
                <div className="min-w-0 flex-1">
                  <div style={{ color: "var(--zr-text-primary)", fontSize: "15px", fontWeight: 600, letterSpacing: "-0.01em" }} className="truncate">
                    {item.label}
                  </div>
                  <div style={{ color: "var(--zr-text-secondary)", fontSize: "13px", marginTop: "2px" }} className="truncate">
                    {item.sub}
                  </div>
                </div>
                <span className="zr-v2-chevron">›</span>
              </Link>
            );
          })}
        </div>
      </div>
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
        style={active
          ? { background: "var(--zr-orange)", color: "#fff", borderRadius: "var(--zr-radius-md)", boxShadow: "var(--zr-shadow-glow)" }
          : { background: "var(--zr-surface-1)", color: "var(--zr-text-primary)", borderRadius: "var(--zr-radius-md)", boxShadow: "var(--zr-shadow-sm)" }}
        className="p-2.5 text-center w-full transition-all active:scale-95">
        <div style={{ color: active ? "#fff" : undefined, letterSpacing: "-0.02em" }} className={`text-xl font-bold ${active ? "" : STAGE_COLORS[stage] ?? "text-gray-900"}`}>{count}</div>
        <div style={{ color: active ? "rgba(255,255,255,0.85)" : "var(--zr-text-muted)", fontSize: "11px" }} className="mt-1 leading-tight">{stage}</div>
        {value > 0 && (
          <div style={{ color: active ? "rgba(255,255,255,0.9)" : "var(--zr-success)", fontSize: "11px" }} className="mt-1 font-semibold">
            ${value >= 1000 ? (value / 1000).toFixed(1) + "k" : value.toFixed(0)}
          </div>
        )}
      </button>
    );
  }

  return (
    <div>
      <SectionLabel>Sales pipeline</SectionLabel>
      <div className="grid grid-cols-5 gap-2 sm:grid-cols-10 mb-3">
        {ALL_STAGES.map(s => <PipelineCard key={s} stage={s} />)}
      </div>
      {customers.length > 0 && (
        <div className="zr-v2-card" style={{ padding: "18px", marginBottom: "12px" }}>
          <PipelineFunnel
            stages={[
              { label: "New", count: stageCounts["New"] || 0, value: pipelineValue["New"], color: "#9ca3af" },
              { label: "Contacted", count: stageCounts["Contacted"] || 0, value: pipelineValue["Contacted"], color: "#3b82f6" },
              { label: "Scheduled", count: (stageCounts["Consult Scheduled"] || 0) + (stageCounts["Measure Scheduled"] || 0), color: "#8b5cf6" },
              { label: "Measured", count: stageCounts["Measured"] || 0, value: pipelineValue["Measured"], color: "#d97706" },
              { label: "Quoted", count: stageCounts["Quoted"] || 0, value: pipelineValue["Quoted"], color: "#d65a31" },
              { label: "Sold", count: stageCounts["Sold"] || 0, value: pipelineValue["Sold"], color: "#30a46c" },
              { label: "Installed", count: (stageCounts["Installed"] || 0) + (stageCounts["Complete"] || 0), color: "#1f6e48" },
            ]}
            height={22}
          />
        </div>
      )}
      {selectedStage && (
        <div className="zr-v2-card">
          <div className="flex items-center justify-between px-5 py-4">
            <h2 style={{ color: "var(--zr-text-primary)", fontSize: "17px", fontWeight: 600, letterSpacing: "-0.01em" }}>
              {selectedStage} <span style={{ color: "var(--zr-text-muted)", fontWeight: 400 }}>· {stageCustomers.length}</span>
            </h2>
            <button type="button" onClick={() => setSelectedStage(null)}
              style={{ color: "var(--zr-text-muted)", fontSize: "13px" }} className="px-2 py-1">Close</button>
          </div>
          {stageCustomers.length === 0 ? (
            <p style={{ color: "var(--zr-text-muted)" }} className="text-sm px-5 pb-5">No customers at this stage.</p>
          ) : (
            <div className="zr-v2-list" style={{ borderTop: "1px solid var(--zr-hairline)" }}>
              {stageCustomers.map(c => {
                const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unknown";
                const inactive = c.last_activity_at ? daysAgo(c.last_activity_at) : null;
                return (
                  <Link key={c.id} href={`/customers/${c.id}`} className="zr-v2-row">
                    <div className="min-w-0 flex-1">
                      <div style={{ color: "var(--zr-text-primary)", fontSize: "15px", fontWeight: 600, letterSpacing: "-0.01em" }} className="truncate">{name}</div>
                      {inactive !== null && (
                        <div style={{ color: "var(--zr-text-muted)", fontSize: "13px", marginTop: "2px" }}>Last activity {inactive}d ago</div>
                      )}
                    </div>
                    {c.heat_score && <span className={`zr-v2-pill ${heatStyle[c.heat_score]}`}>{c.heat_score}</span>}
                    <span className="zr-v2-chevron">›</span>
                  </Link>
                );
              })}
            </div>
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

  function StatCard({ label, count, filterKey, accent }: { label: string; count: number; filterKey: FilterKey; accent?: string }) {
    const active = selectedFilter === filterKey;
    return (
      <button type="button" onClick={() => setSelectedFilter(active ? null : filterKey)}
        style={active
          ? { background: "var(--zr-orange)", color: "#fff", borderRadius: "var(--zr-radius-lg)", boxShadow: "var(--zr-shadow-glow)" }
          : { background: "var(--zr-surface-1)", color: "var(--zr-text-primary)", borderRadius: "var(--zr-radius-lg)", boxShadow: "var(--zr-shadow-sm)" }}
        className="p-4 text-left w-full transition-all active:scale-[0.98]">
        <div style={{
          fontSize: "28px", fontWeight: 700, letterSpacing: "-0.02em",
          color: active ? "#fff" : (accent || "var(--zr-text-primary)"),
          lineHeight: 1,
        }}>{statsLoading ? "—" : count}</div>
        <div style={{ color: active ? "rgba(255,255,255,0.85)" : "var(--zr-text-secondary)", fontSize: "13px", marginTop: "8px", fontWeight: 500 }}>
          {label}
        </div>
      </button>
    );
  }

  return (
    <div>
      <SectionLabel>Operations</SectionLabel>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 mb-3">
        <StatCard label="Measures to schedule" count={measuresToSchedule.length} filterKey="measures_to_schedule" />
        <StatCard label="Measures done" count={measuresDone.length} filterKey="measures_done" accent="var(--zr-success)" />
        <StatCard label="Installs to schedule" count={installsToSchedule.length} filterKey="installs_to_schedule" />
        <StatCard label="Installs scheduled" count={installsScheduled.length} filterKey="installs_scheduled" accent="var(--zr-info)" />
        <StatCard label="Open issues" count={issueJobs.length} filterKey="issues" accent={issueJobs.length > 0 ? "var(--zr-error)" : undefined} />
      </div>
      {selectedFilter && (
        <div className="zr-v2-card">
          <div className="flex items-center justify-between px-5 py-4">
            <h2 style={{ color: "var(--zr-text-primary)", fontSize: "17px", fontWeight: 600, letterSpacing: "-0.01em" }}>
              {filterLabels[selectedFilter]}
            </h2>
            <button type="button" onClick={() => setSelectedFilter(null)}
              style={{ color: "var(--zr-text-muted)", fontSize: "13px" }} className="px-2 py-1">Close</button>
          </div>
          {filterJobs[selectedFilter].length === 0 ? (
            <p style={{ color: "var(--zr-text-muted)" }} className="text-sm px-5 pb-5">None right now.</p>
          ) : (
            <div className="zr-v2-list" style={{ borderTop: "1px solid var(--zr-hairline)" }}>
              {filterJobs[selectedFilter].map(job => (
                <Link key={job.id} href={`/measure-jobs/${job.id}`} className="zr-v2-row">
                  <div className="min-w-0 flex-1">
                    <div style={{ color: "var(--zr-text-primary)", fontSize: "15px", fontWeight: 600, letterSpacing: "-0.01em" }} className="truncate">
                      {job.title}
                    </div>
                    <div style={{ color: "var(--zr-text-secondary)", fontSize: "13px", marginTop: "2px" }} className="truncate">
                      {job.customer_name}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {job.overdue && (
                      <span className="zr-v2-pill" style={{ background: "rgba(224,138,0,0.14)", color: "#b8710b" }}>Overdue</span>
                    )}
                    {job.needs_attention && !job.overdue && daysAgo(job.created_at) > 5 && (
                      <span className="zr-v2-pill" style={{ background: "var(--zr-surface-3)", color: "var(--zr-text-muted)" }}>
                        Idle {daysAgo(job.created_at)}d
                      </span>
                    )}
                  </div>
                  <span className="zr-v2-chevron">›</span>
                </Link>
              ))}
            </div>
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
      <div className="zr-v2-card" style={{ padding: "18px" }}>
        <div style={{ color: "var(--zr-text-muted)" }} className="text-sm">Loading work queue...</div>
      </div>
    );
  }
  const filteredQueue = queueFilter === "mine" && currentUserId
    ? workQueue.filter(w => w.assigned_to === currentUserId)
    : workQueue;

  if (workQueue.length === 0) return null;

  const priorityStyle = (p: number) =>
    p === 1 ? { background: "rgba(214,58,58,0.12)", color: "#c6443a" } :
    p === 2 ? { background: "rgba(224,138,0,0.12)", color: "#b8710b" } :
              { background: "var(--zr-surface-3)",    color: "var(--zr-text-muted)" };

  return (
    <div>
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2">
          <span className="zr-v2-section-label" style={{ padding: 0 }}>Work queue</span>
          <span className="zr-v2-pill" style={filteredQueue.some(w => w.priority === 1)
            ? { background: "rgba(214,58,58,0.12)", color: "#c6443a" }
            : { background: "rgba(224,138,0,0.12)", color: "#b8710b" }}>
            {filteredQueue.length}
          </span>
        </div>
        {canAssign && (
          <div className="flex rounded-full p-0.5" style={{ background: "var(--zr-surface-3)" }}>
            <button onClick={() => setQueueFilter("mine")}
              className="px-3 py-1 text-[12px] font-semibold rounded-full transition-all"
              style={queueFilter === "mine"
                ? { background: "var(--zr-surface-1)", color: "var(--zr-text-primary)", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }
                : { background: "transparent", color: "var(--zr-text-secondary)" }}>Mine</button>
            <button onClick={() => setQueueFilter("all")}
              className="px-3 py-1 text-[12px] font-semibold rounded-full transition-all"
              style={queueFilter === "all"
                ? { background: "var(--zr-surface-1)", color: "var(--zr-text-primary)", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }
                : { background: "transparent", color: "var(--zr-text-secondary)" }}>All</button>
          </div>
        )}
      </div>

      <div className="zr-v2-card">
        {filteredQueue.length === 0 ? (
          <div style={{ color: "var(--zr-text-muted)", padding: "18px" }} className="text-sm text-center">
            No items in your queue right now.
          </div>
        ) : (
          <div className="zr-v2-list">
            {filteredQueue.slice(0, 8).map(w => (
              <Link key={w.customer_id} href={`/customers/${w.customer_id}`} className="zr-v2-row">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span style={{ color: "var(--zr-text-primary)", fontSize: "15px", fontWeight: 600, letterSpacing: "-0.01em" }}>
                      {w.customer_name}
                    </span>
                    {w.heat_score && w.heat_score !== "Warm" && (
                      <span className={`zr-v2-pill ${heatStyle[w.heat_score]}`}>{w.heat_score}</span>
                    )}
                    <span className={`zr-v2-pill ${stageStyle[w.lead_status] || "bg-gray-100 text-gray-600"}`}>
                      {w.lead_status}
                    </span>
                    {w.assigned_name && queueFilter === "all" && (
                      <span className="zr-v2-pill" style={{ background: "rgba(99,102,241,0.12)", color: "#4f46e5" }}>
                        {w.assigned_name}
                      </span>
                    )}
                  </div>
                  <div style={{ color: "var(--zr-text-secondary)", fontSize: "13px", marginTop: "4px" }}>
                    {w.reason}
                  </div>
                  {w.next_action && (
                    <div style={{ color: "var(--zr-orange)", fontSize: "13px", marginTop: "2px", fontWeight: 500 }}>
                      → {w.next_action}
                    </div>
                  )}
                </div>
                <span className="zr-v2-pill" style={priorityStyle(w.priority)}>
                  {w.priority === 1 ? "Now" : w.priority === 2 ? "Today" : "Soon"}
                </span>
                <span className="zr-v2-chevron">›</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {filteredQueue.length > 8 && (
        <p style={{ color: "var(--zr-text-muted)" }} className="mt-2 text-[13px] text-center">
          +{filteredQueue.length - 8} more — check Customers tab
        </p>
      )}
    </div>
  );
}

// ── 8. Ready to Install ───────────────────────────────────────
export function ReadyToInstallWidget({ readyToInstall }: { readyToInstall: { id: string; name: string }[] }) {
  if (readyToInstall.length === 0) return null;
  return (
    <div>
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2">
          <span className="zr-v2-section-label" style={{ padding: 0 }}>Ready to install</span>
          <span className="zr-v2-pill" style={{ background: "rgba(48,164,108,0.14)", color: "var(--zr-success)" }}>
            {readyToInstall.length}
          </span>
        </div>
        <span style={{ color: "var(--zr-text-muted)", fontSize: "12px" }}>All materials received</span>
      </div>
      <div className="zr-v2-card">
        <div className="zr-v2-list">
          {readyToInstall.map(c => (
            <Link key={c.id} href={`/customers/${c.id}`} className="zr-v2-row">
              <span className="zr-v2-icon-tile" style={{ background: "rgba(48,164,108,0.14)", color: "var(--zr-success)" }}>✓</span>
              <div className="min-w-0 flex-1">
                <div style={{ color: "var(--zr-text-primary)", fontSize: "15px", fontWeight: 600, letterSpacing: "-0.01em" }} className="truncate">
                  {c.name}
                </div>
                <div style={{ color: "var(--zr-success)", fontSize: "13px", marginTop: "2px", fontWeight: 500 }}>
                  Schedule install
                </div>
              </div>
              <span className="zr-v2-chevron">›</span>
            </Link>
          ))}
        </div>
      </div>
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
    sales_consultation: "Sales consult", measure: "Measure", install: "Install",
    service_call: "Service call", repair: "Repair", site_walk: "Site walk", punch: "Punch visit",
  };
  const typeColors: Record<string, string> = {
    sales_consultation: "bg-[rgba(10,132,255,0.12)] text-[#0a84ff]",
    measure:            "bg-[rgba(139,92,246,0.12)] text-[#7c3aed]",
    install:            "bg-[rgba(48,164,108,0.14)] text-[#288a58]",
    service_call:       "bg-[rgba(214,90,49,0.12)] text-[#c25a2f]",
    repair:             "bg-[rgba(224,138,0,0.12)] text-[#b8710b]",
    site_walk:          "bg-[rgba(20,184,166,0.12)] text-[#0d9488]",
    punch:              "bg-[rgba(60,60,67,0.08)] text-[#3c3c43]",
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2">
          <span className="zr-v2-section-label" style={{ padding: 0 }}>Today&apos;s appointments</span>
          <span className="zr-v2-pill" style={{ background: "rgba(10,132,255,0.12)", color: "var(--zr-info)" }}>{todayAppts.length}</span>
        </div>
        <Link href="/schedule" style={{ color: "var(--zr-orange)", fontSize: "13px", fontWeight: 500 }}>
          View calendar ›
        </Link>
      </div>

      {unconfirmed.length > 0 && (
        <div className="mb-3 rounded-2xl flex items-center gap-3 px-4 py-3"
          style={{ background: "rgba(224,138,0,0.08)" }}>
          <span style={{ fontSize: "16px" }}>⚠️</span>
          <span style={{ color: "#b8710b", fontSize: "13px", fontWeight: 500 }}>
            {unconfirmed.length} appointment{unconfirmed.length > 1 ? "s" : ""} not yet confirmed
          </span>
        </div>
      )}

      <div className="zr-v2-card">
        <div className="zr-v2-list">
          {todayAppts.map(a => {
            const dt = new Date(a.scheduled_at);
            const timeStr = dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
            const isNext = nextAppt?.id === a.id;
            return (
              <Link key={a.id} href={`/customers/${a.customer_id}`}
                className="zr-v2-row"
                style={isNext ? { background: "rgba(10,132,255,0.05)" } : undefined}>
                <div className="min-w-0 flex-1">
                  {isNext && (
                    <div style={{ color: "var(--zr-info)", fontSize: "11px", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: "4px" }}>
                      Next up
                    </div>
                  )}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span style={{ color: "var(--zr-text-primary)", fontSize: "15px", fontWeight: 600, letterSpacing: "-0.01em" }} className="truncate">
                      {a.customer_name}
                    </span>
                    <span className={`zr-v2-pill ${typeColors[a.type] ?? "bg-gray-100 text-gray-600"}`}>
                      {typeLabels[a.type] ?? a.type}
                    </span>
                  </div>
                  {a.address && (
                    <div style={{ color: "var(--zr-text-secondary)", fontSize: "13px", marginTop: "2px" }} className="truncate">
                      📍 {a.address}
                    </div>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <div style={{ color: isNext ? "var(--zr-info)" : "var(--zr-text-primary)", fontSize: "15px", fontWeight: 600, letterSpacing: "-0.01em" }}>
                    {timeStr}
                  </div>
                  <div style={{ fontSize: "12px", marginTop: "2px" }}
                    className={a.status === "confirmed" ? "text-[#0a84ff]" : a.status === "completed" ? "text-[#30a46c]" : a.status === "scheduled" ? "text-[#b8710b]" : "text-[#9ca3af]"}>
                    {a.status}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── 10. Tasks Due ─────────────────────────────────────────────
export function TasksDueWidget({ tasksDue }: { tasksDue: TaskDue[] }) {
  if (tasksDue.length === 0) return null;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div>
      <div className="flex items-center gap-2 mb-2 px-1">
        <span className="zr-v2-section-label" style={{ padding: 0 }}>Tasks due</span>
        <span className="zr-v2-pill" style={{ background: "rgba(214,58,58,0.12)", color: "#c6443a" }}>{tasksDue.length}</span>
      </div>
      <div className="zr-v2-card">
        <div className="zr-v2-list">
          {tasksDue.map(t => {
            const overdue = t.due_date && t.due_date < today;
            return (
              <Link key={t.id} href={`/customers/${t.customer_id}`} className="zr-v2-row">
                <span className="zr-v2-icon-tile" style={overdue
                  ? { background: "rgba(214,58,58,0.12)", color: "#c6443a" }
                  : { background: "rgba(224,138,0,0.12)", color: "#b8710b" }}>
                  {overdue ? "!" : "●"}
                </span>
                <div className="min-w-0 flex-1">
                  <div style={{ color: "var(--zr-text-primary)", fontSize: "15px", fontWeight: 600, letterSpacing: "-0.01em" }} className="truncate">
                    {t.title}
                  </div>
                  <div style={{ color: "var(--zr-text-secondary)", fontSize: "13px", marginTop: "2px" }} className="truncate">
                    {t.customer_name}
                  </div>
                </div>
                {t.due_date && (
                  <span className="zr-v2-pill" style={overdue
                    ? { background: "rgba(214,58,58,0.12)", color: "#c6443a" }
                    : { background: "rgba(224,138,0,0.12)", color: "#b8710b" }}>
                    {overdue ? "Overdue" : "Today"}
                  </span>
                )}
                <span className="zr-v2-chevron">›</span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── 11. Shipment Tracking Widget ─────────────────────────────
export type ShipmentItem = {
  id: string;
  description: string;
  status: "ordered" | "shipped" | "received" | "staged";
  customer_name: string;
  customer_id: string;
  quote_id: string;
  tracking_number: string | null;
  expected_packages: number | null;
  received_packages: number;
  eta: string | null;
  ordered_at: string | null;
  shipped_at: string | null;
  received_at: string | null;
  storage_location: string | null;
};

export function ShipmentTrackingWidget({ shipments, loading }: { shipments: ShipmentItem[]; loading: boolean }) {
  const ordered = shipments.filter(s => s.status === "ordered");
  const shipped = shipments.filter(s => s.status === "shipped");
  const justArrived = shipments.filter(s => s.status === "received" && s.received_at && daysAgo(s.received_at) <= 3);

  if (loading) {
    return (
      <div>
        <SectionLabel>Shipments & deliveries</SectionLabel>
        <div className="zr-v2-card" style={{ padding: "16px" }}>
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-14 rounded-xl zr-skeleton" />)}
          </div>
        </div>
      </div>
    );
  }

  if (shipments.length === 0 || (ordered.length === 0 && shipped.length === 0 && justArrived.length === 0)) {
    return null;
  }

  // Apple-style soft status tokens: tinted background + firm label color.
  // The leading icon tile carries the color so we can drop per-row borders.
  const statusStyle: Record<string, { icon: string; label: string; bg: string; fg: string }> = {
    ordered:  { icon: "🔄", label: "Ordered",    bg: "rgba(10,132,255,0.12)",  fg: "#0a84ff" },
    shipped:  { icon: "🚚", label: "In transit", bg: "rgba(224,138,0,0.12)",   fg: "#b8710b" },
    received: { icon: "✅", label: "Delivered",  bg: "rgba(48,164,108,0.14)",  fg: "#288a58" },
    staged:   { icon: "📦", label: "Staged",     bg: "rgba(60,60,67,0.08)",    fg: "#3c3c43" },
  };

  function ShipmentRow({ s }: { s: ShipmentItem }) {
    // Customer → packages arrived → warehouse location → ship date. These are
    // what the installer actually needs; product moves to the secondary row.
    const st = statusStyle[s.status];
    const pkgSummary = s.expected_packages ? `${s.received_packages}/${s.expected_packages} arrived` : null;
    const shipDate = s.shipped_at ? new Date(s.shipped_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : null;
    const etaFmt = s.eta ? `ETA ${s.eta}` : null;
    const dateChip = shipDate ? `Shipped ${shipDate}` : etaFmt;

    return (
      <Link href={`/quotes/${s.quote_id}`} className="zr-v2-row">
        <span className="zr-v2-icon-tile" style={{ background: st.bg, color: st.fg }}>
          {st.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span style={{ color: "var(--zr-text-primary)", fontSize: "15px", fontWeight: 600, letterSpacing: "-0.01em" }} className="truncate">
              {s.customer_name}
            </span>
            <span className="zr-v2-pill" style={{ background: st.bg, color: st.fg }}>
              {st.label}
            </span>
          </div>
          <div style={{ color: "var(--zr-text-secondary)", fontSize: "13px", marginTop: "3px" }} className="flex items-center gap-2 flex-wrap">
            {pkgSummary && (
              <span style={{ color: "var(--zr-text-primary)", fontWeight: 500 }}>📦 {pkgSummary}</span>
            )}
            {s.storage_location && <span>· 📍 {s.storage_location}</span>}
            {dateChip && <span>· {dateChip}</span>}
            {s.tracking_number && <span>· #{s.tracking_number.slice(-6)}</span>}
            {s.description && <span style={{ opacity: 0.7 }}>· {s.description}</span>}
          </div>
        </div>
        {s.status === "shipped" && s.expected_packages && s.expected_packages > 0 && (
          <div className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center"
            style={{ background: "rgba(224,138,0,0.12)", color: "#b8710b", fontSize: "13px", fontWeight: 700, letterSpacing: "-0.02em" }}>
            {s.received_packages}/{s.expected_packages}
          </div>
        )}
        <span className="zr-v2-chevron">›</span>
      </Link>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2">
          <span className="zr-v2-section-label" style={{ padding: 0 }}>Shipments & deliveries</span>
          <span className="zr-v2-pill" style={{ background: "rgba(10,132,255,0.12)", color: "var(--zr-info)" }}>
            {ordered.length + shipped.length} active
          </span>
        </div>
        <Link href="/warehouse" style={{ color: "var(--zr-orange)", fontSize: "13px", fontWeight: 500 }}>View all ›</Link>
      </div>

      <div className="zr-v2-card">
        <div className="zr-v2-list">
          {/* In Transit first — most urgent */}
          {shipped.map(s => <ShipmentRow key={s.id} s={s} />)}
          {/* Just delivered */}
          {justArrived.map(s => <ShipmentRow key={s.id} s={s} />)}
          {/* Ordered / waiting */}
          {ordered.slice(0, 5).map(s => <ShipmentRow key={s.id} s={s} />)}
        </div>
      </div>

      {ordered.length > 5 && (
        <p style={{ color: "var(--zr-text-muted)" }} className="mt-2 text-xs text-center">+{ordered.length - 5} more on order</p>
      )}
    </div>
  );
}

// Need useState for OperationsWidget internal state
import { useState } from "react";
