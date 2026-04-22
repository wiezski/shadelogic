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

// ── v2 Section Header — sentence-case label that floats above a card ──
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="zr-v2-section-label">{children}</div>
  );
}

// ── Chevron — the iOS-style disclosure arrow rendered as inline SVG ──
function Chevron() {
  return (
    <span className="zr-v2-chevron">
      <svg width="8" height="14" viewBox="0 0 8 14" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M1 1L7 7L1 13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

// ── Monogram — initials for a person cell (iOS contacts style) ───────
function Monogram({ name, tint = "#cbd5e1" }: { name: string; tint?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0]?.toUpperCase())
    .join("");
  return (
    <span className="zr-v2-monogram" style={{ background: `${tint}33`, color: tint }}>
      {initials || "•"}
    </span>
  );
}

// Hash a string to a stable subtle tint color. Used for customer monograms.
function tintFor(s: string): string {
  const palette = ["#5b8def", "#7c3aed", "#d65a31", "#30a46c", "#b8710b", "#0d9488", "#4f46e5"];
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

// ── Mini line-icon set — inline SVGs that replace emoji for a calmer look ──
// Keep icons 18×18, 1.75 stroke, currentColor. Match iOS SF Symbols weight.
const Icon = {
  Person: (props: React.SVGProps<SVGSVGElement>) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  Calendar: (props: React.SVGProps<SVGSVGElement>) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  ),
  Bell: (props: React.SVGProps<SVGSVGElement>) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  ),
  Box: (props: React.SVGProps<SVGSVGElement>) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <path d="M3.3 7L12 12l8.7-5M12 22V12" />
    </svg>
  ),
  Truck: (props: React.SVGProps<SVGSVGElement>) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M1 3h15v13H1zM16 8h4l3 3v5h-7" />
      <circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
  ),
  Check: (props: React.SVGProps<SVGSVGElement>) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  ),
  Clock: (props: React.SVGProps<SVGSVGElement>) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
    </svg>
  ),
  Alert: (props: React.SVGProps<SVGSVGElement>) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 9v4M12 17h.01M10.3 3.86l-8.19 14.19A2 2 0 0 0 3.84 21h16.32a2 2 0 0 0 1.73-2.95L13.7 3.86a2 2 0 0 0-3.4 0z" />
    </svg>
  ),
  Pin: (props: React.SVGProps<SVGSVGElement>) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M20 10c0 7-8 12-8 12s-8-5-8-12a8 8 0 0 1 16 0z" /><circle cx="12" cy="10" r="3" />
    </svg>
  ),
  Card: (props: React.SVGProps<SVGSVGElement>) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" />
    </svg>
  ),
  Doc: (props: React.SVGProps<SVGSVGElement>) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
    </svg>
  ),
  Phone: (props: React.SVGProps<SVGSVGElement>) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  ),
  Install: (props: React.SVGProps<SVGSVGElement>) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 1 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  ),
  Ruler: (props: React.SVGProps<SVGSVGElement>) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M21.3 15.3L8.7 2.7a1 1 0 0 0-1.4 0L2.7 7.3a1 1 0 0 0 0 1.4l12.6 12.6a1 1 0 0 0 1.4 0l4.6-4.6a1 1 0 0 0 0-1.4zM6 7l1 1M9 5l1.5 1.5M11 9l1 1M14 8l1.5 1.5M13 13l1 1" />
    </svg>
  ),
  Star: (props: React.SVGProps<SVGSVGElement>) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  ),
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

// ── 1. Quick Actions — tap tiles with line icons, no emoji ──
export function QuickActionsWidget({ onNewCustomer }: { onNewCustomer: () => void }) {
  const tile = {
    background: "var(--zr-surface-1)",
    boxShadow: "var(--zr-shadow-sm)",
    color: "var(--zr-text-primary)",
  } as const;
  const iconWrap = {
    color: "var(--zr-orange)",
  } as const;
  return (
    <div className="grid grid-cols-3 gap-3">
      <button onClick={onNewCustomer}
        style={tile}
        className="rounded-2xl py-5 text-[13px] font-medium flex flex-col items-center gap-2 transition-all active:scale-95">
        <span style={iconWrap}><Icon.Person /></span>
        <span>New customer</span>
      </button>
      <Link href="/schedule"
        style={tile}
        className="rounded-2xl py-5 text-[13px] font-medium flex flex-col items-center gap-2 text-center transition-all active:scale-95">
        <span style={iconWrap}><Icon.Calendar /></span>
        <span>Schedule</span>
      </Link>
      <Link href="/reminders"
        style={tile}
        className="rounded-2xl py-5 text-[13px] font-medium flex flex-col items-center gap-2 text-center transition-all active:scale-95">
        <span style={iconWrap}><Icon.Bell /></span>
        <span>Reminders</span>
      </Link>
    </div>
  );
}

// ── 2. KPI Strip — one card, four stats, hairline dividers ──
// Consolidating the four KPIs into a single card removes the card-on-canvas
// boxing. Big tabular numbers; trends are small muted hints, not highlights.
export function KPIStripWidget({ totalRevenue, revenueTrend, revenueByMonth, totalLeads, leadTrend, activityByWeek, closeRate }: {
  totalRevenue: number; revenueTrend: number; revenueByMonth: { label: string; value: number }[];
  totalLeads: number; leadTrend: number; activityByWeek: number[]; closeRate: number;
}) {
  const label = { fontSize: "12px", color: "rgba(60,60,67,0.55)", fontWeight: 500 } as const;
  const value = { fontSize: "26px", fontWeight: 700, color: "var(--zr-text-primary)", letterSpacing: "-0.025em", lineHeight: 1 } as const;
  const trend = (delta: number) => ({
    fontSize: "11px",
    color: delta === 0 ? "rgba(60,60,67,0.45)" : (delta > 0 ? "var(--zr-success)" : "rgba(214,58,58,0.75)"),
    fontWeight: 500,
    marginTop: "6px",
    display: "flex",
    alignItems: "center",
    gap: "3px",
  } as const);
  const cell = "flex flex-col py-4 px-4";

  return (
    <div className="zr-v2-card">
      <div className="grid grid-cols-2 sm:grid-cols-4" style={{ gap: "1px", background: "var(--zr-hairline)" }}>
        <div className={cell} style={{ background: "var(--zr-surface-1)" }}>
          <div style={label}>Revenue · MTD</div>
          <div className="mt-2 flex items-end justify-between">
            <span style={value}>
              ${totalRevenue >= 1000 ? (totalRevenue / 1000).toFixed(1) + "k" : totalRevenue.toLocaleString()}
            </span>
            {revenueByMonth.length >= 2 && (
              <Sparkline data={revenueByMonth.map(b => b.value)} width={48} height={18}
                color={revenueTrend >= 0 ? "var(--zr-success)" : "rgba(214,58,58,0.7)"}
                fillColor={revenueTrend >= 0 ? "var(--zr-success)" : "rgba(214,58,58,0.7)"} />
            )}
          </div>
          {revenueTrend !== 0 && (
            <div style={trend(revenueTrend)}>
              <span>{revenueTrend > 0 ? "↑" : "↓"}</span>
              <span>{Math.abs(revenueTrend).toFixed(0)}% vs last mo</span>
            </div>
          )}
        </div>
        <div className={cell} style={{ background: "var(--zr-surface-1)" }}>
          <div style={label}>New leads · MTD</div>
          <div className="mt-2 flex items-end justify-between">
            <span style={value}>{totalLeads}</span>
            {activityByWeek.length >= 2 && (
              <Sparkline data={activityByWeek} width={48} height={18} color="var(--zr-info)" fillColor="var(--zr-info)" />
            )}
          </div>
          {leadTrend !== 0 && (
            <div style={trend(leadTrend)}>
              <span>{leadTrend > 0 ? "↑" : "↓"}</span>
              <span>{Math.abs(leadTrend).toFixed(0)}% vs last mo</span>
            </div>
          )}
        </div>
        <div className={cell} style={{ background: "var(--zr-surface-1)" }}>
          <div style={label}>Close rate</div>
          <div className="mt-2 flex items-end justify-between">
            <span style={value}>{closeRate.toFixed(0)}%</span>
            <DonutChart value={closeRate} size={36} strokeWidth={4}
              color={closeRate >= 50 ? "var(--zr-success)" : closeRate >= 30 ? "var(--zr-warning)" : "rgba(214,58,58,0.7)"} />
          </div>
        </div>
        <div className={cell} style={{ background: "var(--zr-surface-1)" }}>
          <div style={label}>Activity · 8wk</div>
          <div className="mt-2 flex items-end justify-between">
            <span style={value}>{activityByWeek.reduce((a, b) => a + b, 0)}</span>
            {activityByWeek.length >= 2 && (
              <Sparkline data={activityByWeek} width={48} height={18} color="var(--zr-orange)" fillColor="var(--zr-orange)" />
            )}
          </div>
          <div style={{ fontSize: "11px", color: "rgba(60,60,67,0.45)", marginTop: "6px" }}>calls, texts, emails</div>
        </div>
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

// ── 4. Today's Focus — iOS Reminders style: tiny dot + clean row ──
// Removed the icon tile entirely; a single 10px colored dot carries the
// status. Calmer, more readable. Colors live in text or dot only.
export function TodaysFocusWidget({ focusItems }: { focusItems: { label: string; sub: string; href: string; color: string }[] }) {
  if (focusItems.length === 0) return null;

  function dotColor(colorClass: string): string {
    if (colorClass.includes("red"))    return "#d6443a";
    if (colorClass.includes("amber"))  return "#c28a0e";
    if (colorClass.includes("orange")) return "#c25a2f";
    if (colorClass.includes("blue"))   return "#0a84ff";
    if (colorClass.includes("green"))  return "#288a58";
    return "rgba(60,60,67,0.35)";
  }

  return (
    <div>
      <SectionLabel>Today&apos;s focus</SectionLabel>
      <div className="zr-v2-card">
        <div className="zr-v2-list">
          {focusItems.map((item, i) => (
            <Link key={i} href={item.href} className="zr-v2-row">
              <span className="zr-v2-dot" style={{ background: dotColor(item.color) }} />
              <div className="min-w-0 flex-1">
                <div style={{ color: "var(--zr-text-primary)", fontSize: "15px", fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.3 }} className="truncate">
                  {item.label}
                </div>
                <div style={{ color: "rgba(60,60,67,0.55)", fontSize: "13px", marginTop: "3px", lineHeight: 1.35 }} className="truncate">
                  {item.sub}
                </div>
              </div>
              <Chevron />
            </Link>
          ))}
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
                    <Chevron />
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
                  <Chevron />
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
                <Chevron />
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
              <span style={{ color: "var(--zr-success)" }}><Icon.Check /></span>
              <div className="min-w-0 flex-1">
                <div style={{ color: "var(--zr-text-primary)", fontSize: "15px", fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.3 }} className="truncate">
                  {c.name}
                </div>
                <div style={{ color: "var(--zr-success)", fontSize: "13px", marginTop: "3px", fontWeight: 500, lineHeight: 1.3 }}>
                  Schedule install
                </div>
              </div>
              <Chevron />
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
                style={{ alignItems: "flex-start", paddingTop: "16px", paddingBottom: "16px", ...(isNext ? { background: "rgba(10,132,255,0.035)" } : {}) }}>
                {/* Time is the leading column — iOS Calendar pattern */}
                <div className="shrink-0 text-left" style={{ width: "60px" }}>
                  <div style={{ color: isNext ? "var(--zr-info)" : "var(--zr-text-primary)", fontSize: "15px", fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.2 }}>
                    {timeStr}
                  </div>
                  {isNext && (
                    <div style={{ color: "var(--zr-info)", fontSize: "11px", fontWeight: 500, marginTop: "3px" }}>
                      Next up
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1" style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                  <div style={{ color: "var(--zr-text-primary)", fontSize: "15px", fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.25 }} className="truncate">
                    {a.customer_name}
                  </div>
                  <div style={{ color: "rgba(60,60,67,0.55)", fontSize: "13px", lineHeight: 1.3 }} className="truncate">
                    {typeLabels[a.type] ?? a.type}{a.address ? ` · ${a.address}` : ""}
                  </div>
                </div>
                <Chevron />
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
                <span className="zr-v2-dot" style={{ background: overdue ? "#d6443a" : "#c28a0e" }} />
                <div className="min-w-0 flex-1">
                  <div style={{ color: "var(--zr-text-primary)", fontSize: "15px", fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.3 }} className="truncate">
                    {t.title}
                  </div>
                  <div style={{ color: "rgba(60,60,67,0.55)", fontSize: "13px", marginTop: "3px", lineHeight: 1.3 }} className="truncate">
                    {t.customer_name}{t.due_date ? (overdue ? " · Overdue" : " · Today") : ""}
                  </div>
                </div>
                <Chevron />
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

  // Muted status tokens — color is accent-only, not saturated highlight.
  // Icon is a line-SVG in the same color; no tinted tile background.
  const statusStyle: Record<string, { icon: React.ReactNode; label: string; fg: string }> = {
    ordered:  { icon: <Icon.Box />,   label: "Ordered",    fg: "#5b8def" },
    shipped:  { icon: <Icon.Truck />, label: "In transit", fg: "#c28a0e" },
    received: { icon: <Icon.Check />, label: "Delivered",  fg: "#30a46c" },
    staged:   { icon: <Icon.Box />,   label: "Staged",     fg: "rgba(60,60,67,0.55)" },
  };

  function ShipmentRow({ s }: { s: ShipmentItem }) {
    // Clear 3-line hierarchy per Steve's spec: name → status → details.
    // No icon tile background, no per-row separators fighting the content.
    // The right-side 2/3 badge is anchored vertically with the chevron.
    const st = statusStyle[s.status];
    const pkgSummary = s.expected_packages ? `${s.received_packages}/${s.expected_packages} packages` : null;
    const shipDate = s.shipped_at ? new Date(s.shipped_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : null;
    const etaFmt = s.eta ? `ETA ${s.eta}` : null;
    const dateChip = shipDate ? `Shipped ${shipDate}` : etaFmt;

    // Build the meta line from just the essentials — location and timing.
    // Package count moves out of this line into the right-anchored badge.
    const metaParts: string[] = [];
    if (s.storage_location) metaParts.push(s.storage_location);
    if (dateChip) metaParts.push(dateChip);

    return (
      <Link href={`/quotes/${s.quote_id}`} className="zr-v2-row" style={{ alignItems: "flex-start", paddingTop: "16px", paddingBottom: "16px" }}>
        {/* Leading line icon in accent color — no tile background */}
        <span style={{ color: st.fg, marginTop: "2px" }}>
          {st.icon}
        </span>

        {/* Name → status → details */}
        <div className="min-w-0 flex-1" style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
          <div style={{ color: "var(--zr-text-primary)", fontSize: "15px", fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.25 }} className="truncate">
            {s.customer_name}
          </div>
          <div style={{ color: st.fg, fontSize: "13px", fontWeight: 500, lineHeight: 1.25 }}>
            {st.label}
          </div>
          {metaParts.length > 0 && (
            <div style={{ color: "rgba(60,60,67,0.5)", fontSize: "12px", lineHeight: 1.3 }} className="truncate">
              {metaParts.join(" · ")}
            </div>
          )}
        </div>

        {/* Anchored right side: package count (only when in-transit) + chevron */}
        <div className="flex items-center gap-2" style={{ alignSelf: "center" }}>
          {pkgSummary && s.status === "shipped" && (
            <span style={{
              color: "rgba(194,138,14,0.9)",
              fontSize: "13px",
              fontWeight: 600,
              letterSpacing: "-0.01em",
              fontVariantNumeric: "tabular-nums",
            }}>
              {s.received_packages}/{s.expected_packages}
            </span>
          )}
          <Chevron />
        </div>
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
