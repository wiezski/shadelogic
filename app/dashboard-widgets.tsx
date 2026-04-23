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
  // Contract installers see ONLY what's relevant to their work: their
  // schedule, shipments for their jobs, what's staged and ready to
  // install, and any tasks assigned to them. No financials, no sales
  // pipeline, no work queue (that's owner/sales territory).
  installer: ["quick_actions", "todays_appointments", "ready_to_install", "shipments", "tasks_due"],
  accounting: ["quick_actions", "kpi_strip", "revenue_chart", "tasks_due", "operations", "shipments", "work_queue", "sales_pipeline", "todays_appointments", "ready_to_install", "todays_focus"],
  warehouse: ["quick_actions", "shipments", "operations", "ready_to_install", "tasks_due", "todays_appointments", "kpi_strip", "work_queue", "sales_pipeline", "revenue_chart", "todays_focus"],
};

// ── 1. Quick Actions — iOS Shortcuts / Apple Wallet tile row ──────
// Three soft-tinted rounded-square tiles, each with a monochrome SF-style
// glyph centered inside and a small label BELOW the tile. Per-action tint
// (blue / orange / green) gives Apple-style color-coded recognition while
// staying calm — the fills are ~10-12% alpha, not saturated.
// No card wrapper around the group; tiles sit directly on the page canvas,
// matching the same no-box language as the refined Shipments list.
export function QuickActionsWidget({ onNewCustomer, role }: { onNewCustomer: () => void; role?: string }) {
  const isInstaller = role === "installer";
  // Per-action identity. Tint fills are soft so the row reads calm;
  // glyph colors are the saturated variant for clear affordance.
  type Action = {
    label: string;
    tintBg: string;
    tintFg: string;
    icon: React.ReactNode;
    href?: string;
    onClick?: () => void;
  };

  // Icon size & stroke — 26px with 2.25 stroke. Slightly smaller than the
  // previous pass so the icon breathes inside the tighter tile, but stroke
  // weight stays heavy so the glyph clearly out-presences its background.
  const glyph = { width: 26, height: 26, strokeWidth: 2.25 } as const;

  // Tints at 9-10% alpha — a touch lighter than before. Color identity is
  // still unmistakable at a glance, but the fill reads as "tinted paper"
  // rather than a colored surface. Glyph hue is held saturated so the icon
  // sits cleanly on top of its own tile.
  // Contract installers see "New measure" as their primary intake tile
  // rather than "New customer" — that's owner/sales territory.
  const actions: Action[] = isInstaller
    ? [
        {
          label: "New measure",
          tintBg: "rgba(10,132,255,0.09)",
          tintFg: "#0a7cff",
          icon: <Icon.Ruler {...glyph} />,
          href: "/measure-jobs/new",
        },
        {
          label: "Schedule",
          tintBg: "rgba(214,90,49,0.09)",
          tintFg: "var(--zr-orange)",
          icon: <Icon.Calendar {...glyph} />,
          href: "/schedule",
        },
        {
          label: "Reminders",
          tintBg: "rgba(48,164,108,0.10)",
          tintFg: "#228b5b",
          icon: <Icon.Bell {...glyph} />,
          href: "/reminders",
        },
      ]
    : [
        {
          label: "New customer",
          tintBg: "rgba(10,132,255,0.09)",
          tintFg: "#0a7cff",
          icon: <Icon.Person {...glyph} />,
          onClick: onNewCustomer,
        },
        {
          label: "Schedule",
          tintBg: "rgba(214,90,49,0.09)",
          tintFg: "var(--zr-orange)",
          icon: <Icon.Calendar {...glyph} />,
          href: "/schedule",
        },
        {
          label: "Reminders",
          tintBg: "rgba(48,164,108,0.10)",
          tintFg: "#228b5b",
          icon: <Icon.Bell {...glyph} />,
          href: "/reminders",
        },
      ];

  // The tile is the action affordance. 60pt tall, 14pt radius — tighter
  // and less pillowy than before. Proportions now read as intentional
  // controls, not decorative pads. Press feedback is a brightness dip
  // on the tile itself (see zr-ios-tile class).
  const tileStyle: React.CSSProperties = {
    width: "100%",
    height: 60,
    borderRadius: 14,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "filter 120ms ease, transform 120ms ease",
  };

  // Label sits crisp under the tile — 5px gap reads as one tappable unit.
  // 13px / weight 550 / primary text color.
  const labelStyle: React.CSSProperties = {
    fontSize: "13px",
    fontWeight: 550,
    letterSpacing: "-0.01em",
    color: "var(--zr-text-primary)",
    lineHeight: 1.2,
    marginTop: 5,
    textAlign: "center",
  };

  // Outer tap target wraps tile + label so both compress together on press.
  const wrapClass = "flex flex-col items-stretch transition-transform active:scale-[0.97]";
  const wrapStyle: React.CSSProperties = {
    background: "transparent",
    border: "none",
    padding: 0,
    cursor: "pointer",
    textDecoration: "none",
    color: "inherit",
    WebkitTapHighlightColor: "transparent",
  };

  function Tile({ a }: { a: Action }) {
    const inner = (
      <>
        <span className="zr-ios-tile" style={{ ...tileStyle, background: a.tintBg, color: a.tintFg }}>
          {a.icon}
        </span>
        <span style={labelStyle}>{a.label}</span>
      </>
    );
    if (a.href) {
      return (
        <Link href={a.href} className={wrapClass} style={wrapStyle}>
          {inner}
        </Link>
      );
    }
    return (
      <button type="button" onClick={a.onClick} className={wrapClass} style={wrapStyle}>
        {inner}
      </button>
    );
  }

  // Edge padding (px-5) matches the Shipments list's content alignment.
  // gap-2 (8px) between tiles: tight enough to read as one cluster, loose
  // enough that each tile has breathing room.
  return (
    <div className="grid grid-cols-3 gap-2 px-5">
      {actions.map(a => <Tile key={a.label} a={a} />)}
    </div>
  );
}

// ── 2. KPI Strip — canvas-level stats, hairlines only ──
// No card wrapper. Four KPIs sit directly on the page canvas, separated
// by subtle hairlines. Big tabular numbers carry the visual weight;
// trends are small muted hints beneath. Matches the no-box language of
// Shipments and Today's Focus.
export function KPIStripWidget({ totalRevenue, revenueTrend, revenueByMonth, totalLeads, leadTrend, activityByWeek, closeRate }: {
  totalRevenue: number; revenueTrend: number; revenueByMonth: { label: string; value: number }[];
  totalLeads: number; leadTrend: number; activityByWeek: number[]; closeRate: number;
}) {
  const C_DIVIDER = "rgba(60,60,67,0.08)";
  const label = { fontSize: "12px", color: "rgba(60,60,67,0.55)", fontWeight: 500, letterSpacing: "-0.005em" } as const;
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

  // 2-col mobile / 4-col desktop. Right/bottom hairlines on each cell
  // except the last column/row — gives the grid rhythm without a card.
  function cellStyle(i: number, total: number): React.CSSProperties {
    const isLastCol = (i % 2 === 1);             // mobile 2-col; desktop handled by media query below
    const isLastRow = (i >= total - 2);
    return {
      padding: "16px 20px",
      borderRight: isLastCol ? "none" : `0.5px solid ${C_DIVIDER}`,
      borderBottom: isLastRow ? "none" : `0.5px solid ${C_DIVIDER}`,
    };
  }

  const cells = [
    {
      label: "Revenue · MTD",
      value: `$${totalRevenue >= 1000 ? (totalRevenue / 1000).toFixed(1) + "k" : totalRevenue.toLocaleString()}`,
      accent: revenueByMonth.length >= 2 ? (
        <Sparkline data={revenueByMonth.map(b => b.value)} width={48} height={18}
          color={revenueTrend >= 0 ? "var(--zr-success)" : "rgba(214,58,58,0.7)"}
          fillColor={revenueTrend >= 0 ? "var(--zr-success)" : "rgba(214,58,58,0.7)"} />
      ) : null,
      foot: revenueTrend !== 0 ? (
        <div style={trend(revenueTrend)}>
          <span>{revenueTrend > 0 ? "↑" : "↓"}</span>
          <span>{Math.abs(revenueTrend).toFixed(0)}% vs last mo</span>
        </div>
      ) : null,
    },
    {
      label: "New leads · MTD",
      value: String(totalLeads),
      accent: activityByWeek.length >= 2 ? (
        <Sparkline data={activityByWeek} width={48} height={18} color="var(--zr-info)" fillColor="var(--zr-info)" />
      ) : null,
      foot: leadTrend !== 0 ? (
        <div style={trend(leadTrend)}>
          <span>{leadTrend > 0 ? "↑" : "↓"}</span>
          <span>{Math.abs(leadTrend).toFixed(0)}% vs last mo</span>
        </div>
      ) : null,
    },
    {
      label: "Close rate",
      value: `${closeRate.toFixed(0)}%`,
      accent: (
        <DonutChart value={closeRate} size={36} strokeWidth={4}
          color={closeRate >= 50 ? "var(--zr-success)" : closeRate >= 30 ? "var(--zr-warning)" : "rgba(214,58,58,0.7)"} />
      ),
      foot: null,
    },
    {
      label: "Activity · 8wk",
      value: String(activityByWeek.reduce((a, b) => a + b, 0)),
      accent: activityByWeek.length >= 2 ? (
        <Sparkline data={activityByWeek} width={48} height={18} color="var(--zr-orange)" fillColor="var(--zr-orange)" />
      ) : null,
      foot: <div style={{ fontSize: "11px", color: "rgba(60,60,67,0.45)", marginTop: "6px" }}>calls, texts, emails</div>,
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4">
      {cells.map((c, i) => (
        <div key={i} style={cellStyle(i, cells.length)}>
          <div style={label}>{c.label}</div>
          <div className="mt-2 flex items-end justify-between">
            <span style={value}>{c.value}</span>
            {c.accent}
          </div>
          {c.foot}
        </div>
      ))}
    </div>
  );
}

// ── 3. Revenue Chart — canvas-level, no card wrapper ──────────
export function RevenueChartWidget({ revenueByMonth }: { revenueByMonth: { label: string; value: number }[] }) {
  if (!revenueByMonth.some(b => b.value > 0)) return null;
  return (
    <div>
      <div className="flex items-end justify-between mb-1 px-5">
        <span className="zr-v2-section-label" style={{ padding: 0 }}>Revenue — last 6 months</span>
        <Link href="/analytics" style={{ color: "var(--zr-orange)", fontSize: "13px", fontWeight: 500 }} className="pb-[10px]">Details</Link>
      </div>
      <div style={{ padding: "4px 20px 8px" }}>
        <MiniBarChart bars={revenueByMonth} width={320} height={88} />
      </div>
    </div>
  );
}

// ── 4. Today's Focus — native iOS list, no card wrapper ──
// Rows sit directly on the page canvas with a hairline divider between
// them (matches the refined Shipments list). Priority is signaled by a
// small leading colored dot plus — for overdue items only — a tinted
// red primary label. No chevron, no card, no alert styling.
export function TodaysFocusWidget({ focusItems }: { focusItems: { label: string; sub: string; href: string; color: string }[] }) {
  if (focusItems.length === 0) return null;

  // Map the legacy Tailwind color class into our Apple-style palette.
  // Color is accent-only — it lives on the leading dot, never the label.
  // Red is desaturated so overdue reads as "noted" rather than "alarm".
  function priorityColor(c: string): string {
    if (c.includes("red"))   return "#c87070"; // muted rose, not alert red
    if (c.includes("amber")) return "var(--zr-warning)";
    if (c.includes("blue"))  return "var(--zr-info)";
    if (c.includes("green")) return "var(--zr-success)";
    return "rgba(60,60,67,0.3)";
  }

  const C_DIVIDER = "rgba(60,60,67,0.08)";

  return (
    <div>
      <div className="flex items-end justify-between mb-1 px-5">
        <span className="zr-v2-section-label" style={{ padding: 0 }}>
          Today&apos;s focus
        </span>
      </div>

      {/* No card wrapper. Rows sit directly on the page canvas, same
          language as the Shipments list above. */}
      <div>
        {focusItems.map((item, i) => {
          const dot = priorityColor(item.color);
          const isLast = i === focusItems.length - 1;
          return (
            <Link
              key={i}
              href={item.href}
              className="zr-ios-row"
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                textDecoration: "none",
                color: "inherit",
                padding: "16px 20px 14px",
                borderBottom: isLast ? "none" : `0.5px solid ${C_DIVIDER}`,
                transition: "background-color 120ms ease",
              }}
            >
              {/* Leading priority dot — 5px, aligned with the primary line.
                  Color is the only accent; the label stays dark. */}
              <span style={{
                flexShrink: 0,
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: dot,
                marginTop: 9,
              }} />

              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{
                  color: "var(--zr-text-primary)",
                  fontSize: "16px",
                  fontWeight: 600,
                  letterSpacing: "-0.018em",
                  lineHeight: 1.25,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}>
                  {item.label}
                </div>
                <div style={{
                  color: "rgba(60,60,67,0.55)",
                  fontSize: "13.5px",
                  fontWeight: 400,
                  letterSpacing: "-0.005em",
                  lineHeight: 1.3,
                  marginTop: 2,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}>
                  {item.sub}
                </div>
              </div>
            </Link>
          );
        })}
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

  // Pipeline stage cell — transparent on canvas. Active state is a soft
  // orange tint (not a solid fill) so selection stays calm.
  function PipelineCard({ stage }: { stage: string }) {
    const active = selectedStage === stage;
    const count = stageCounts[stage] ?? 0;
    const value = pipelineValue[stage] ?? 0;
    return (
      <button type="button" onClick={() => setSelectedStage(active ? null : stage)}
        className="w-full text-center transition-all active:scale-95"
        style={{
          padding: "10px 6px",
          borderRadius: 12,
          background: active ? "rgba(214,90,49,0.10)" : "transparent",
          color: active ? "var(--zr-orange)" : "var(--zr-text-primary)",
          WebkitTapHighlightColor: "transparent",
        }}>
        <div style={{
          color: active ? "var(--zr-orange)" : "var(--zr-text-primary)",
          fontSize: "20px",
          fontWeight: 700,
          letterSpacing: "-0.02em",
          lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
        }}>{count}</div>
        <div style={{
          color: active ? "var(--zr-orange)" : "rgba(60,60,67,0.6)",
          fontSize: "11px",
          marginTop: "6px",
          letterSpacing: "-0.005em",
          lineHeight: 1.15,
          fontWeight: active ? 600 : 500,
        }}>{stage}</div>
        {value > 0 && (
          <div style={{
            color: active ? "var(--zr-orange)" : "rgba(60,60,67,0.45)",
            fontSize: "11px",
            marginTop: "4px",
            fontWeight: 500,
            fontVariantNumeric: "tabular-nums",
          }}>
            ${value >= 1000 ? (value / 1000).toFixed(1) + "k" : value.toFixed(0)}
          </div>
        )}
      </button>
    );
  }

  return (
    <div>
      <div className="flex items-end justify-between mb-1 px-5">
        <span className="zr-v2-section-label" style={{ padding: 0 }}>Sales pipeline</span>
      </div>
      {/* No card wrapper. Transparent cells on canvas with tight gaps. */}
      <div className="grid grid-cols-5 gap-1 sm:grid-cols-10 mb-4 px-3">
        {ALL_STAGES.map(s => <PipelineCard key={s} stage={s} />)}
      </div>
      {customers.length > 0 && (
        <div style={{ padding: "4px 20px 16px" }}>
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
        <div>
          <div className="flex items-end justify-between px-5 mb-2">
            <span className="zr-v2-section-label" style={{ padding: 0 }}>
              {selectedStage} · {stageCustomers.length}
            </span>
            <button type="button" onClick={() => setSelectedStage(null)}
              style={{ color: "var(--zr-orange)", fontSize: "13px", fontWeight: 500 }} className="pb-[10px]">
              Close
            </button>
          </div>
          {stageCustomers.length === 0 ? (
            <div className="zr-v2-open-list" style={{ padding: "24px 18px" }}>
              <p style={{ color: "rgba(60,60,67,0.5)" }} className="text-[14px] text-center">No customers at this stage.</p>
            </div>
          ) : (
            <div className="zr-v2-open-list">
              {stageCustomers.map(c => {
                const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unknown";
                const inactive = c.last_activity_at ? daysAgo(c.last_activity_at) : null;
                return (
                  <Link key={c.id} href={`/customers/${c.id}`} className="zr-v2-row">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-3">
                        <span style={{
                          color: "var(--zr-text-primary)",
                          fontSize: "16px",
                          fontWeight: 600,
                          letterSpacing: "-0.015em",
                          lineHeight: 1.25,
                          flex: 1,
                          minWidth: 0,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}>
                          {name}
                        </span>
                        {c.heat_score && (
                          <span style={{
                            color: c.heat_score === "Hot" ? "rgba(214,68,58,0.8)"
                                 : c.heat_score === "Cold" ? "rgba(91,141,239,0.8)"
                                 : "rgba(60,60,67,0.5)",
                            fontSize: "13px",
                            fontWeight: 500,
                            flexShrink: 0,
                          }}>
                            {c.heat_score}
                          </span>
                        )}
                      </div>
                      {inactive !== null && (
                        <div style={{
                          color: "rgba(60,60,67,0.5)",
                          fontSize: "13px",
                          marginTop: "4px",
                          letterSpacing: "-0.005em",
                        }}>
                          Last activity {inactive}d ago
                        </div>
                      )}
                    </div>
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

  // Stat cells sit transparent on canvas. Active state is a soft orange
  // tint — matches the Pipeline grid and Quick Actions tile language.
  const statCells: { label: string; count: number; filterKey: FilterKey; accent?: string }[] = [
    { label: "Measures to schedule", count: measuresToSchedule.length, filterKey: "measures_to_schedule" },
    { label: "Measures done",        count: measuresDone.length,        filterKey: "measures_done", accent: "var(--zr-success)" },
    { label: "Installs to schedule", count: installsToSchedule.length, filterKey: "installs_to_schedule" },
    { label: "Installs scheduled",   count: installsScheduled.length,   filterKey: "installs_scheduled", accent: "var(--zr-info)" },
    { label: "Open issues",          count: issueJobs.length,           filterKey: "issues", accent: issueJobs.length > 0 ? "var(--zr-error)" : undefined },
  ];

  return (
    <div>
      <div className="flex items-end justify-between mb-1 px-5">
        <span className="zr-v2-section-label" style={{ padding: 0 }}>Operations</span>
      </div>
      <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 mb-4 px-3">
        {statCells.map(({ label, count, filterKey, accent }) => {
          const active = selectedFilter === filterKey;
          return (
            <button key={filterKey} type="button"
              onClick={() => setSelectedFilter(active ? null : filterKey)}
              className="text-left w-full transition-all active:scale-[0.98]"
              style={{
                padding: "14px 16px",
                borderRadius: 14,
                background: active ? "rgba(214,90,49,0.10)" : "transparent",
                WebkitTapHighlightColor: "transparent",
              }}>
              <div style={{
                fontSize: "28px", fontWeight: 700, letterSpacing: "-0.025em",
                color: active ? "var(--zr-orange)" : (accent || "var(--zr-text-primary)"),
                lineHeight: 1,
                fontVariantNumeric: "tabular-nums",
              }}>{statsLoading ? "—" : count}</div>
              <div style={{
                color: active ? "var(--zr-orange)" : "rgba(60,60,67,0.6)",
                fontSize: "13px",
                marginTop: "8px",
                fontWeight: active ? 600 : 500,
                letterSpacing: "-0.005em",
                lineHeight: 1.25,
              }}>
                {label}
              </div>
            </button>
          );
        })}
      </div>
      {selectedFilter && (
        <div>
          <div className="flex items-end justify-between px-5 mb-2">
            <span className="zr-v2-section-label" style={{ padding: 0 }}>
              {filterLabels[selectedFilter]}
            </span>
            <button type="button" onClick={() => setSelectedFilter(null)}
              style={{ color: "var(--zr-orange)", fontSize: "13px", fontWeight: 500 }} className="pb-[10px]">
              Close
            </button>
          </div>
          {filterJobs[selectedFilter].length === 0 ? (
            <div className="zr-v2-open-list" style={{ padding: "24px 18px" }}>
              <p style={{ color: "rgba(60,60,67,0.5)" }} className="text-[14px] text-center">None right now.</p>
            </div>
          ) : (
            <div className="zr-v2-open-list">
              {filterJobs[selectedFilter].map(job => {
                const overdueLabel = job.overdue
                  ? "Overdue"
                  : job.needs_attention && daysAgo(job.created_at) > 5
                  ? `Idle ${daysAgo(job.created_at)}d`
                  : null;
                return (
                  <Link key={job.id} href={`/measure-jobs/${job.id}`} className="zr-v2-row">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-3">
                        <span style={{
                          color: "var(--zr-text-primary)",
                          fontSize: "16px",
                          fontWeight: 600,
                          letterSpacing: "-0.015em",
                          lineHeight: 1.25,
                          flex: 1,
                          minWidth: 0,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}>
                          {job.title}
                        </span>
                        {overdueLabel && (
                          <span style={{
                            color: job.overdue ? "rgba(194,138,14,0.9)" : "rgba(60,60,67,0.5)",
                            fontSize: "13px",
                            fontWeight: 500,
                            flexShrink: 0,
                          }}>
                            {overdueLabel}
                          </span>
                        )}
                      </div>
                      <div style={{
                        color: "rgba(60,60,67,0.5)",
                        fontSize: "13px",
                        marginTop: "4px",
                        letterSpacing: "-0.005em",
                      }} className="truncate">
                        {job.customer_name}
                      </div>
                    </div>
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
      <div className="flex items-end justify-between mb-2 px-5">
        <span className="zr-v2-section-label" style={{ padding: 0 }}>
          Work queue · {filteredQueue.length}
        </span>
        {canAssign && (
          <div className="flex rounded-full p-0.5 pb-0.5" style={{ background: "rgba(60,60,67,0.08)" }}>
            <button onClick={() => setQueueFilter("mine")}
              className="px-3 py-1 text-[12px] font-semibold rounded-full transition-all"
              style={queueFilter === "mine"
                ? { background: "var(--zr-surface-1)", color: "var(--zr-text-primary)" }
                : { background: "transparent", color: "rgba(60,60,67,0.55)" }}>Mine</button>
            <button onClick={() => setQueueFilter("all")}
              className="px-3 py-1 text-[12px] font-semibold rounded-full transition-all"
              style={queueFilter === "all"
                ? { background: "var(--zr-surface-1)", color: "var(--zr-text-primary)" }
                : { background: "transparent", color: "rgba(60,60,67,0.55)" }}>All</button>
          </div>
        )}
      </div>

      {filteredQueue.length === 0 ? (
        <div className="zr-v2-open-list" style={{ padding: "24px 18px" }}>
          <div style={{ color: "rgba(60,60,67,0.5)" }} className="text-[14px] text-center">
            No items in your queue right now.
          </div>
        </div>
      ) : (
        <div className="zr-v2-open-list">
          {filteredQueue.slice(0, 8).map(w => {
            const priorityLabel =
              w.priority === 1 ? "Now" : w.priority === 2 ? "Today" : "Soon";
            const priorityColor =
              w.priority === 1 ? "rgba(214,68,58,0.85)" : "rgba(60,60,67,0.5)";
            return (
              <Link key={w.customer_id} href={`/customers/${w.customer_id}`} className="zr-v2-row">
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-3">
                    <span style={{
                      color: "var(--zr-text-primary)",
                      fontSize: "16px",
                      fontWeight: 600,
                      letterSpacing: "-0.015em",
                      lineHeight: 1.25,
                      flex: 1,
                      minWidth: 0,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}>
                      {w.customer_name}
                    </span>
                    <span style={{ color: priorityColor, fontSize: "13px", fontWeight: 500, flexShrink: 0 }}>
                      {priorityLabel}
                    </span>
                  </div>
                  <div style={{
                    color: "rgba(60,60,67,0.5)",
                    fontSize: "13px",
                    marginTop: "4px",
                    letterSpacing: "-0.005em",
                  }} className="truncate">
                    {w.lead_status}
                    {w.next_action ? ` · ${w.next_action}` : w.reason ? ` · ${w.reason}` : ""}
                    {w.assigned_name && queueFilter === "all" ? ` · ${w.assigned_name}` : ""}
                  </div>
                </div>
                <Chevron />
              </Link>
            );
          })}
        </div>
      )}

      {filteredQueue.length > 8 && (
        <p style={{ color: "rgba(60,60,67,0.5)" }} className="mt-3 text-[13px] text-center">
          +{filteredQueue.length - 8} more in Customers
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
      <div className="flex items-end justify-between mb-2 px-5">
        <span className="zr-v2-section-label" style={{ padding: 0 }}>
          Ready to install · {readyToInstall.length}
        </span>
        <span style={{ color: "rgba(60,60,67,0.45)", fontSize: "13px" }} className="pb-[10px]">
          Materials received
        </span>
      </div>
      <div className="zr-v2-open-list">
        {readyToInstall.map(c => (
          <Link key={c.id} href={`/customers/${c.id}`} className="zr-v2-row">
            <div className="min-w-0 flex-1">
              <div style={{
                color: "var(--zr-text-primary)",
                fontSize: "16px",
                fontWeight: 600,
                letterSpacing: "-0.015em",
                lineHeight: 1.25,
              }} className="truncate">
                {c.name}
              </div>
              <div style={{
                color: "rgba(60,60,67,0.5)",
                fontSize: "13px",
                marginTop: "4px",
                letterSpacing: "-0.005em",
              }}>
                Schedule install
              </div>
            </div>
            <Chevron />
          </Link>
        ))}
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
      <div className="flex items-end justify-between mb-2 px-5">
        <span className="zr-v2-section-label" style={{ padding: 0 }}>
          Today · {todayAppts.length} {todayAppts.length === 1 ? "appointment" : "appointments"}
          {unconfirmed.length > 0 ? ` · ${unconfirmed.length} unconfirmed` : ""}
        </span>
        <Link href="/schedule" style={{ color: "var(--zr-orange)", fontSize: "13px", fontWeight: 500 }} className="pb-[10px]">
          Calendar
        </Link>
      </div>

      <div className="zr-v2-open-list">
        {todayAppts.map(a => {
          const dt = new Date(a.scheduled_at);
          const timeStr = dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
          const isNext = nextAppt?.id === a.id;
          return (
            <Link key={a.id} href={`/customers/${a.customer_id}`} className="zr-v2-row">
              {/* Time is the leading column — iOS Calendar */}
              <div className="shrink-0" style={{ width: "56px" }}>
                <div style={{
                  color: isNext ? "var(--zr-orange)" : "var(--zr-text-primary)",
                  fontSize: "15px",
                  fontWeight: 600,
                  letterSpacing: "-0.015em",
                  lineHeight: 1.2,
                  fontVariantNumeric: "tabular-nums",
                }}>
                  {timeStr}
                </div>
                {isNext && (
                  <div style={{
                    color: "var(--zr-orange)",
                    fontSize: "11px",
                    fontWeight: 500,
                    marginTop: "3px",
                  }}>
                    Next
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div style={{
                  color: "var(--zr-text-primary)",
                  fontSize: "16px",
                  fontWeight: 600,
                  letterSpacing: "-0.015em",
                  lineHeight: 1.25,
                }} className="truncate">
                  {a.customer_name}
                </div>
                <div style={{
                  color: "rgba(60,60,67,0.5)",
                  fontSize: "13px",
                  marginTop: "4px",
                  letterSpacing: "-0.005em",
                }} className="truncate">
                  {typeLabels[a.type] ?? a.type}{a.address ? ` · ${a.address}` : ""}
                </div>
              </div>
              <Chevron />
            </Link>
          );
        })}
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
      <div className="flex items-end justify-between mb-2 px-5">
        <span className="zr-v2-section-label" style={{ padding: 0 }}>
          Tasks due · {tasksDue.length}
        </span>
      </div>
      <div className="zr-v2-open-list">
        {tasksDue.map(t => {
          const overdue = t.due_date && t.due_date < today;
          return (
            <Link key={t.id} href={`/customers/${t.customer_id}`} className="zr-v2-row">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-3">
                  <span style={{
                    color: "var(--zr-text-primary)",
                    fontSize: "16px",
                    fontWeight: 600,
                    letterSpacing: "-0.015em",
                    lineHeight: 1.25,
                    flex: 1,
                    minWidth: 0,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}>
                    {t.title}
                  </span>
                  {t.due_date && (
                    <span style={{
                      color: overdue ? "rgba(214,68,58,0.85)" : "rgba(60,60,67,0.5)",
                      fontSize: "13px",
                      fontWeight: 500,
                      flexShrink: 0,
                    }}>
                      {overdue ? "Overdue" : "Today"}
                    </span>
                  )}
                </div>
                <div style={{
                  color: "rgba(60,60,67,0.5)",
                  fontSize: "13px",
                  marginTop: "4px",
                  letterSpacing: "-0.005em",
                }} className="truncate">
                  {t.customer_name}
                </div>
              </div>
              <Chevron />
            </Link>
          );
        })}
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

  // ─────────────────────────────────────────────────────────────
  // Native iOS list design (Apple Reminders / Mail / Messages).
  // No card wrapper. No chevrons. No inner boxes. Rows are edge-
  // to-edge text on the page canvas, separated by a hairline that
  // inset-starts after the left-edge padding — the iOS convention.
  // ─────────────────────────────────────────────────────────────

  // Soft gray tokens tuned to Apple's informational hierarchy
  const C_NAME      = "var(--zr-text-primary)";   // bold primary
  const C_STATUS    = "rgba(60,60,67,0.42)";      // status (muted, barely there)
  const C_PRIMARY   = "rgba(60,60,67,0.62)";      // key detail line
  const C_SECONDARY = "rgba(60,60,67,0.38)";      // optional tertiary line
  const C_DIVIDER   = "rgba(60,60,67,0.08)";      // hairline between rows

  if (loading) {
    return (
      <div>
        <div className="flex items-end justify-between mb-1 px-5">
          <span className="zr-v2-section-label" style={{ padding: 0 }}>Shipments</span>
        </div>
        <div>
          {[1,2,3].map(i => (
            <div key={i} style={{ padding: "18px 20px", borderBottom: i < 3 ? `0.5px solid ${C_DIVIDER}` : "none" }}>
              <div style={{ height: 18, width: "45%", borderRadius: 4 }} className="zr-skeleton" />
              <div style={{ height: 13, width: "30%", borderRadius: 4, marginTop: 8 }} className="zr-skeleton" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (shipments.length === 0 || (ordered.length === 0 && shipped.length === 0 && justArrived.length === 0)) {
    return null;
  }

  const statusLabel: Record<string, string> = {
    ordered:  "Ordered",
    shipped:  "In transit",
    received: "Delivered",
    staged:   "Staged",
  };

  // Key detail (line 2) picker — whichever is most informative for the state
  function keyDetail(s: ShipmentItem): string | null {
    const fmt = (d: string) => new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    if (s.status === "received" && s.received_at) return `Arrived ${fmt(s.received_at)}`;
    if (s.status === "shipped") {
      if (s.eta) return `ETA ${s.eta}`;
      if (s.shipped_at) return `Shipped ${fmt(s.shipped_at)}`;
    }
    if (s.status === "ordered" && s.ordered_at) return `Ordered ${fmt(s.ordered_at)}`;
    if (s.status === "staged") return "Ready to install";
    return null;
  }

  function ShipmentRow({ s, isLast }: { s: ShipmentItem; isLast: boolean }) {
    // Package progress shows inline with status on line 1 as plain text — never a pill or circle
    const pkgProgress = s.expected_packages && s.expected_packages > 0 && (s.status === "shipped" || s.status === "ordered")
      ? `${s.received_packages}/${s.expected_packages}`
      : null;

    const primary = keyDetail(s);
    // Secondary line only if we have location OR a description that isn't
    // already captured by the primary line. Keeps the row from ever stacking
    // redundant info.
    const secondary = s.storage_location || s.description || null;
    const showSecondary = secondary && secondary !== primary;

    return (
      <Link
        href={`/quotes/${s.quote_id}`}
        style={{
          display: "block",
          textDecoration: "none",
          color: "inherit",
          padding: "18px 20px 16px",
          borderBottom: isLast ? "none" : `0.5px solid ${C_DIVIDER}`,
          transition: "background-color 120ms ease",
        }}
        className="zr-ios-row"
      >
        {/* ── Line 1: Name (bold) · Status + pkg count (muted, right-anchored) ── */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 3 }}>
          <span style={{
            flex: 1,
            minWidth: 0,
            color: C_NAME,
            fontSize: "17px",
            fontWeight: 600,
            letterSpacing: "-0.022em",
            lineHeight: 1.25,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}>
            {s.customer_name}
          </span>
          <span style={{
            flexShrink: 0,
            color: C_STATUS,
            fontSize: "13px",
            fontWeight: 400,
            letterSpacing: "-0.003em",
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1.25,
          }}>
            {statusLabel[s.status] || s.status}
            {pkgProgress && (
              <span style={{ marginLeft: 8, color: C_STATUS, fontVariantNumeric: "tabular-nums" }}>
                {pkgProgress}
              </span>
            )}
          </span>
        </div>

        {/* ── Line 2: Key detail ── */}
        {primary && (
          <div style={{
            color: C_PRIMARY,
            fontSize: "14px",
            fontWeight: 400,
            letterSpacing: "-0.006em",
            lineHeight: 1.3,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}>
            {primary}
          </div>
        )}

        {/* ── Line 3 (optional): Secondary, very light ── */}
        {showSecondary && (
          <div style={{
            color: C_SECONDARY,
            fontSize: "13px",
            fontWeight: 400,
            letterSpacing: "-0.003em",
            lineHeight: 1.3,
            marginTop: 2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}>
            {secondary}
          </div>
        )}
      </Link>
    );
  }

  // Ordered list of rows in display priority: in-transit first, recent arrivals, then orders
  const rows: ShipmentItem[] = [
    ...shipped,
    ...justArrived,
    ...ordered.slice(0, 5),
  ];

  return (
    <div>
      <div className="flex items-end justify-between mb-1 px-5">
        <span className="zr-v2-section-label" style={{ padding: 0 }}>
          Shipments · {ordered.length + shipped.length} active
        </span>
        <Link href="/warehouse" style={{ color: "var(--zr-orange)", fontSize: "13px", fontWeight: 500 }} className="pb-[10px]">
          View all
        </Link>
      </div>

      {/* No card wrapper. Rows sit directly on the page canvas. */}
      <div>
        {rows.map((s, i) => (
          <ShipmentRow key={s.id} s={s} isLast={i === rows.length - 1} />
        ))}
      </div>

      {ordered.length > 5 && (
        <p style={{ color: "var(--zr-text-muted)", marginTop: 8, paddingLeft: 20, fontSize: "12px" }}>
          +{ordered.length - 5} more on order
        </p>
      )}
    </div>
  );
}

// Need useState for OperationsWidget internal state
import { useState } from "react";
