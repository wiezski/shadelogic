"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "./auth-provider";
import { EmptyState } from "./ui";
import { LandingPage } from "./landing-page";
import {
  QuickActionsWidget,
  KPIStripWidget,
  RevenueChartWidget,
  TodaysFocusWidget,
  SalesPipelineWidget,
  OperationsWidget,
  WorkQueueWidget,
  ReadyToInstallWidget,
  TodaysAppointmentsWidget,
  TasksDueWidget,
  ShipmentTrackingWidget,
  WidgetId,
  WIDGET_IDS,
  WIDGET_LABELS,
  ROLE_LAYOUTS,
  type DashboardJob,
  type TodayAppt,
  type TaskDue,
  type WorkItem,
  type ShipmentItem,
} from "./dashboard-widgets";
import { getCurrentMode, getModeWidgets, type TaskMode } from "../lib/focus-modes";

type Customer = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  lead_status: string | null;
  heat_score: string | null;
  last_activity_at: string | null;
  assigned_to: string | null;
};

function parseAddress(addr: string | null) {
  if (!addr) return { street: "", city: "", state: "", zip: "" };
  const parts = addr.split("|");
  if (parts.length === 4) return { street: parts[0], city: parts[1], state: parts[2], zip: parts[3] };
  return { street: addr, city: "", state: "", zip: "" };
}

function composeAddress(street: string, city: string, state: string, zip: string): string | null {
  if (!street && !city && !state && !zip) return null;
  return `${street}|${city}|${state}|${zip}`;
}

function formatAddressDisplay(addr: string | null): string {
  if (!addr) return "No address";
  const { street, city, state, zip } = parseAddress(addr);
  const parts = [street, city, [state, zip].filter(Boolean).join(" ")].filter(Boolean);
  return parts.join(", ") || "No address";
}

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

export default function HomePage() {
  const { user, role, permissions } = useAuth();

  // Show landing page for unauthenticated visitors
  if (!user) return <LandingPage />;
  const [tab, setTab] = useState<"dashboard" | "customers">("dashboard");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);

  const [measuresToSchedule, setMeasuresToSchedule] = useState<DashboardJob[]>([]);
  const [measuresDone, setMeasuresDone] = useState<DashboardJob[]>([]);
  const [installsToSchedule, setInstallsToSchedule] = useState<DashboardJob[]>([]);
  const [installsScheduled, setInstallsScheduled] = useState<DashboardJob[]>([]);
  const [issueJobs, setIssueJobs] = useState<DashboardJob[]>([]);
  const [tasksDue, setTasksDue] = useState<TaskDue[]>([]);
  const [todayAppts, setTodayAppts] = useState<TodayAppt[]>([]);
  const [readyToInstall, setReadyToInstall] = useState<{ id: string; name: string }[]>([]);
  const [focusItems, setFocusItems] = useState<{ label: string; sub: string; href: string; color: string }[]>([]);
  const [custSearch, setCustSearch] = useState("");
  const [workQueue, setWorkQueue] = useState<WorkItem[]>([]);
  const [workQueueLoading, setWorkQueueLoading] = useState(true);
  const [queueFilter, setQueueFilter] = useState<"mine" | "all">("all");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [teamMap, setTeamMap] = useState<Record<string, string>>({});
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  const [pipelineValue, setPipelineValue] = useState<Record<string, number>>({});
  const [shipments, setShipments] = useState<ShipmentItem[]>([]);
  const [shipmentsLoading, setShipmentsLoading] = useState(true);

  // Layout state — per-user, saved to profiles.dashboard_layout
  const defaultLayout = ROLE_LAYOUTS[role] || ROLE_LAYOUTS.owner;
  const [widgetOrder, setWidgetOrder] = useState<WidgetId[]>(defaultLayout);
  const [hiddenWidgets, setHiddenWidgets] = useState<WidgetId[]>([]);
  const [editingLayout, setEditingLayout] = useState(false);
  const [layoutLoaded, setLayoutLoaded] = useState(false);

  // Focus mode — filter dashboard widgets when a mode is active
  const [taskMode, setTaskMode] = useState<TaskMode>("all");
  useEffect(() => {
    setTaskMode(getCurrentMode());
    // Listen for mode changes from nav-bar (uses storage event for cross-component sync)
    function onStorage(e: StorageEvent) {
      if (e.key === "zr-task-mode") setTaskMode((e.newValue as TaskMode) || "all");
    }
    window.addEventListener("storage", onStorage);
    // Also poll for same-tab changes (storage event doesn't fire in same tab)
    const interval = setInterval(() => {
      const current = getCurrentMode();
      setTaskMode(prev => prev !== current ? current : prev);
    }, 500);
    return () => { window.removeEventListener("storage", onStorage); clearInterval(interval); };
  }, []);

  // Load saved layout from profile
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data?.user) return;
      supabase.from("profiles").select("dashboard_layout").eq("id", data.user.id).single().then(({ data: prof }) => {
        if (prof?.dashboard_layout) {
          const saved = prof.dashboard_layout as { order?: WidgetId[]; hidden?: WidgetId[] };
          if (saved.order && saved.order.length > 0) {
            // Merge in any new widgets that weren't in saved layout
            const known = new Set(saved.order);
            const newWidgets = (WIDGET_IDS as readonly WidgetId[]).filter(w => !known.has(w));
            setWidgetOrder([...saved.order, ...newWidgets]);
          }
          if (saved.hidden) setHiddenWidgets(saved.hidden);
        }
        setLayoutLoaded(true);
      });
    });
  }, []); // eslint-disable-line

  // Persist layout to profile
  async function saveLayout(order: WidgetId[], hidden: WidgetId[]) {
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user) return;
    await supabase.from("profiles").update({
      dashboard_layout: { order, hidden },
    }).eq("id", u.user.id);
  }

  // Chart data
  const [revenueByMonth, setRevenueByMonth] = useState<{ label: string; value: number }[]>([]);
  const [activityByWeek, setActivityByWeek] = useState<number[]>([]);
  const [closeRate, setCloseRate] = useState(0);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [revenueTrend, setRevenueTrend] = useState(0);
  const [totalLeads, setTotalLeads] = useState(0);
  const [leadTrend, setLeadTrend] = useState(0);

  // Add customer form
  const [showForm, setShowForm] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [addrState, setAddrState] = useState("");
  const [zip, setZip] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Load current user ID + team map
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setCurrentUserId(data.user.id);
    });
    supabase.from("profiles").select("id, full_name").then(({ data }) => {
      const m: Record<string, string> = {};
      (data || []).forEach((p: { id: string; full_name: string | null }) => { m[p.id] = p.full_name || "Unnamed"; });
      setTeamMap(m);
    });
    loadDashboard();
    loadCustomers();
    loadTasksDue();
    loadTodayAppts();
    loadPipelineValue();
    loadReadyToInstall();
    loadTodayFocus();
    loadWorkQueue();
    loadChartData();
    loadShipments();
  }, []);

  async function loadDashboard() {
    setStatsLoading(true);

    const { data: jobData } = await supabase
      .from("measure_jobs")
      .select("id, title, customer_id, scheduled_at, install_mode, install_scheduled_at, created_at")
      .order("created_at", { ascending: false });

    const jobs = (jobData || []) as Omit<DashboardJob, "customer_name">[];
    if (jobs.length === 0) { setStatsLoading(false); return; }

    // Customer names
    const custIds = [...new Set(jobs.map((j) => j.customer_id))];
    const { data: custData } = await supabase
      .from("customers").select("id, first_name, last_name").in("id", custIds);
    const custMap: Record<string, string> = {};
    (custData || []).forEach((c: { id: string; first_name: string | null; last_name: string | null }) => {
      custMap[c.id] = [c.last_name, c.first_name].filter(Boolean).join(", ");
    });

    // Rooms
    const jobIds = jobs.map((j) => j.id);
    const { data: roomData } = await supabase.from("rooms").select("id, measure_job_id").in("measure_job_id", jobIds);
    const roomsByJob: Record<string, string[]> = {};
    (roomData || []).forEach((r: { id: string; measure_job_id: string }) => {
      if (!roomsByJob[r.measure_job_id]) roomsByJob[r.measure_job_id] = [];
      roomsByJob[r.measure_job_id].push(r.id);
    });
    const allRoomIds = (roomData || []).map((r: { id: string }) => r.id);

    // Windows
    const winCountByRoom: Record<string, number> = {};
    const issueJobIds = new Set<string>();
    if (allRoomIds.length > 0) {
      const { data: winData } = await supabase
        .from("windows").select("id, room_id, install_status").in("room_id", allRoomIds);
      (winData || []).forEach((w: { id: string; room_id: string; install_status: string }) => {
        winCountByRoom[w.room_id] = (winCountByRoom[w.room_id] || 0) + 1;
        if (w.install_status === "issue") {
          const jobId = Object.keys(roomsByJob).find((jid) => roomsByJob[jid].includes(w.room_id));
          if (jobId) issueJobIds.add(jobId);
        }
      });
    }

    const hasWindows = (jobId: string) =>
      (roomsByJob[jobId] || []).some((rid) => (winCountByRoom[rid] || 0) > 0);

    const now = Date.now();
    const enrich = (j: Omit<DashboardJob, "customer_name">): DashboardJob => ({
      ...j,
      customer_name: custMap[j.customer_id] || "Unknown",
      overdue: !j.install_mode && !hasWindows(j.id) && daysAgo(j.created_at) > 7,
      needs_attention: daysAgo(j.created_at) > 5,
    });

    setMeasuresToSchedule(jobs.filter((j) => !j.install_mode && !hasWindows(j.id)).map(enrich));
    setMeasuresDone(jobs.filter((j) => !j.install_mode && hasWindows(j.id)).map(enrich));
    setInstallsToSchedule(jobs.filter((j) => j.install_mode && !j.install_scheduled_at).map(enrich));
    setInstallsScheduled(jobs.filter((j) => j.install_mode && j.install_scheduled_at).map(enrich));
    setIssueJobs(jobs.filter((j) => issueJobIds.has(j.id)).map(enrich));

    setStatsLoading(false);
  }

  async function loadCustomers() {
    const { data } = await supabase
      .from("customers")
      .select("id, first_name, last_name, address, phone, email, lead_status, heat_score, last_activity_at, assigned_to")
      .order("created_at", { ascending: false });
    setCustomers((data || []) as Customer[]);
  }

  async function loadTasksDue() {
    const today = new Date().toISOString().slice(0, 10);
    const { data: taskData } = await supabase
      .from("tasks")
      .select("id, title, due_date, customer_id")
      .eq("completed", false)
      .lte("due_date", today)
      .order("due_date", { ascending: true });
    if (!taskData || taskData.length === 0) return;

    const custIds = [...new Set(taskData.map((t: { customer_id: string }) => t.customer_id))];
    const { data: custData } = await supabase
      .from("customers").select("id, first_name, last_name").in("id", custIds);
    const custMap: Record<string, string> = {};
    (custData || []).forEach((c: { id: string; first_name: string | null; last_name: string | null }) => {
      custMap[c.id] = [c.first_name, c.last_name].filter(Boolean).join(" ");
    });

    setTasksDue(taskData.map((t: { id: string; title: string; due_date: string | null; customer_id: string }) => ({
      ...t,
      customer_name: custMap[t.customer_id] || "Unknown",
    })));
  }

  async function loadTodayFocus() {
    const today = new Date().toISOString().slice(0, 10);
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();
    const items: { label: string; sub: string; href: string; color: string; priority: number }[] = [];

    // Overdue tasks
    const { data: overdue } = await supabase.from("tasks")
      .select("id, title, customer_id").eq("completed", false).lt("due_date", today).limit(3);
    if (overdue && overdue.length > 0) {
      const custIds = overdue.map((t: any) => t.customer_id);
      const { data: cn } = await supabase.from("customers").select("id, first_name, last_name").in("id", custIds);
      const nm: Record<string, string> = {};
      (cn || []).forEach((c: any) => { nm[c.id] = [c.first_name, c.last_name].filter(Boolean).join(" "); });
      items.push({ label: `${overdue.length} overdue task${overdue.length > 1 ? "s" : ""}`, sub: (overdue as any[])[0].title, href: `/customers/${(overdue as any[])[0].customer_id}`, color: "text-red-600", priority: 1 });
    }

    // Deposits not collected
    const { count: depCount } = await supabase.from("quotes")
      .select("id", { count: "exact", head: true }).eq("status", "approved").eq("deposit_paid", false).lt("created_at", threeDaysAgo);
    if (depCount && depCount > 0) {
      items.push({ label: `${depCount} deposit${depCount > 1 ? "s" : ""} not collected`, sub: "Collect before ordering materials", href: "/payments", color: "text-amber-600", priority: 2 });
    }

    // Quotes waiting on response
    const { count: sentCount } = await supabase.from("quotes")
      .select("id", { count: "exact", head: true }).eq("status", "sent").lt("created_at", threeDaysAgo);
    if (sentCount && sentCount > 0) {
      items.push({ label: `${sentCount} quote${sentCount > 1 ? "s" : ""} waiting for response`, sub: "Follow up today", href: "/payments", color: "text-blue-600", priority: 3 });
    }

    // Today's appointments
    const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
    const endToday   = new Date(); endToday.setHours(23, 59, 59, 999);
    const { count: apptCount } = await supabase.from("appointments")
      .select("id", { count: "exact", head: true })
      .gte("scheduled_at", startToday.toISOString())
      .lte("scheduled_at", endToday.toISOString())
      .not("status", "in", '("canceled","completed")');
    if (apptCount && apptCount > 0) {
      items.push({ label: `${apptCount} appointment${apptCount > 1 ? "s" : ""} today`, sub: "View your schedule", href: "/schedule", color: "text-green-600", priority: 1 });
    }

    items.sort((a, b) => a.priority - b.priority);
    setFocusItems(items.slice(0, 3));
  }

  async function loadReadyToInstall() {
    // Customers whose next_action contains "ready to schedule install"
    const { data } = await supabase
      .from("customers")
      .select("id, first_name, last_name")
      .ilike("next_action", "%ready to schedule install%")
      .not("lead_status", "in", '("Installed","Complete")');
    setReadyToInstall((data || []).map((c: any) => ({
      id: c.id,
      name: [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unknown",
    })));
  }

  async function loadPipelineValue() {
    // Load latest approved/sent/draft quote total per customer, keyed by customer lead_status
    const { data: quotes } = await supabase
      .from("quotes")
      .select("customer_id, total, status")
      .not("status", "eq", "rejected")
      .gt("total", 0);
    if (!quotes || quotes.length === 0) return;

    // Get customer stages
    const custIds = [...new Set(quotes.map((q: any) => q.customer_id))];
    const { data: custs } = await supabase.from("customers").select("id, lead_status").in("id", custIds);
    const stageMap: Record<string, string> = {};
    (custs || []).forEach((c: any) => { stageMap[c.id] = c.lead_status ?? "New"; });

    // Sum highest quote per customer per stage
    const bestQuote: Record<string, number> = {};
    (quotes as any[]).forEach(q => {
      const key = q.customer_id;
      if (!bestQuote[key] || q.total > bestQuote[key]) bestQuote[key] = q.total;
    });

    const valueByStage: Record<string, number> = {};
    Object.entries(bestQuote).forEach(([custId, total]) => {
      const stage = stageMap[custId] ?? "New";
      valueByStage[stage] = (valueByStage[stage] || 0) + total;
    });
    setPipelineValue(valueByStage);
  }

  async function loadTodayAppts() {
    const today = new Date();
    const start = new Date(today); start.setHours(0, 0, 0, 0);
    const end   = new Date(today); end.setHours(23, 59, 59, 999);
    const { data: raw } = await supabase
      .from("appointments")
      .select("id, customer_id, type, scheduled_at, duration_minutes, status, address")
      .gte("scheduled_at", start.toISOString())
      .lte("scheduled_at", end.toISOString())
      .not("status", "in", '("canceled","no_show")')
      .order("scheduled_at", { ascending: true });
    if (!raw || raw.length === 0) return;
    const custIds = [...new Set(raw.map((a: any) => a.customer_id as string))];
    const { data: cData } = await supabase.from("customers").select("id, first_name, last_name").in("id", custIds);
    const cMap: Record<string, string> = {};
    (cData || []).forEach((c: any) => { cMap[c.id] = [c.first_name, c.last_name].filter(Boolean).join(" "); });
    setTodayAppts(raw.map((a: any) => ({ ...a, customer_name: cMap[a.customer_id] ?? "Unknown" })));
  }

  async function loadWorkQueue() {
    setWorkQueueLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    const now = Date.now();

    // Load all active customers
    const { data: custData } = await supabase
      .from("customers")
      .select("id, first_name, last_name, lead_status, heat_score, last_activity_at, next_action, created_at, assigned_to")
      .not("lead_status", "in", '("Installed","Lost")')
      .order("created_at", { ascending: false });
    const customers = (custData || []) as {
      id: string; first_name: string | null; last_name: string | null;
      lead_status: string; heat_score: string; last_activity_at: string | null;
      next_action: string | null; created_at: string; assigned_to: string | null;
    }[];

    // Load team names for assignment display
    const { data: profileData } = await supabase.from("profiles").select("id, full_name");
    const nameMap: Record<string, string> = {};
    (profileData || []).forEach((p: { id: string; full_name: string | null }) => { nameMap[p.id] = p.full_name || "Unnamed"; });

    // Load overdue tasks grouped by customer
    const { data: taskData } = await supabase
      .from("tasks").select("customer_id, title, due_date")
      .eq("completed", false).lte("due_date", today);
    const overdueByCustomer: Record<string, string[]> = {};
    (taskData || []).forEach((t: { customer_id: string; title: string }) => {
      if (!overdueByCustomer[t.customer_id]) overdueByCustomer[t.customer_id] = [];
      overdueByCustomer[t.customer_id].push(t.title);
    });

    const items: WorkItem[] = [];

    customers.forEach((c) => {
      const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unknown";
      const daysInactive = c.last_activity_at
        ? Math.floor((now - new Date(c.last_activity_at).getTime()) / 86400000)
        : Math.floor((now - new Date(c.created_at).getTime()) / 86400000);
      const stuckThreshold = c.heat_score === "Hot" ? 5 : c.heat_score === "Cold" ? 30 : 14;
      const overdueTasks = overdueByCustomer[c.id];
      const base = { customer_id: c.id, customer_name: name, lead_status: c.lead_status, heat_score: c.heat_score,
        next_action: c.next_action, days_inactive: daysInactive, assigned_to: c.assigned_to ?? null, assigned_name: c.assigned_to ? (nameMap[c.assigned_to] ?? null) : null };

      // Priority 1: overdue task
      if (overdueTasks?.length) {
        items.push({ ...base, reason: `Overdue: ${overdueTasks[0]}${overdueTasks.length > 1 ? ` +${overdueTasks.length - 1} more` : ""}`, priority: 1 });
        return;
      }
      // Priority 1: hot lead stuck
      if (c.heat_score === "Hot" && daysInactive >= stuckThreshold) {
        items.push({ ...base, reason: `Hot lead — no activity in ${daysInactive}d`, priority: 1 });
        return;
      }
      // Priority 2: new lead, never contacted
      if (c.lead_status === "New" && !c.last_activity_at) {
        const hoursOld = Math.floor((now - new Date(c.created_at).getTime()) / 3600000);
        items.push({ ...base, reason: `New lead — not yet contacted (${hoursOld < 24 ? hoursOld + "h old" : daysInactive + "d old"})`, priority: 2 });
        return;
      }
      // Priority 2: quoted, no follow-up in 3+ days
      if (c.lead_status === "Quoted" && daysInactive >= 3) {
        items.push({ ...base, reason: `Quote sent ${daysInactive}d ago — follow up`, priority: 2 });
        return;
      }
      // Priority 2: measured but quote not yet sent (still in Measured stage 2+ days)
      if (c.lead_status === "Measured" && daysInactive >= 2) {
        items.push({ ...base, reason: `Measured ${daysInactive}d ago — send the quote`, priority: 2 });
        return;
      }
      // Priority 2: measured but no quote yet
      if (c.lead_status === "Measured" && daysInactive >= 3) {
        items.push({ ...base, reason: `Measured ${daysInactive}d ago — send quote`, priority: 2 });
        return;
      }
      // Priority 2: sold but hasn't moved to contact for install
      if (c.lead_status === "Sold" && daysInactive >= 2) {
        items.push({ ...base, reason: `Sold ${daysInactive}d ago — contact to schedule install`, priority: 2 });
        return;
      }
      // Priority 2: contact for install stuck
      if (c.lead_status === "Contact for Install" && daysInactive >= 2) {
        items.push({ ...base, reason: `Waiting to schedule install — ${daysInactive}d inactive`, priority: 2 });
        return;
      }
      // Priority 3: warm/cold stuck
      if (daysInactive >= stuckThreshold) {
        items.push({ ...base, reason: `No activity in ${daysInactive}d`, priority: 3 });
      }
    });

    // Sort by priority then days inactive desc
    items.sort((a, b) => a.priority !== b.priority ? a.priority - b.priority : (b.days_inactive || 0) - (a.days_inactive || 0));
    setWorkQueue(items);
    setWorkQueueLoading(false);
  }

  async function loadChartData() {
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString();

    // Revenue by month from paid invoices
    const { data: invData } = await supabase
      .from("invoices")
      .select("total, amount_paid, status, created_at")
      .in("status", ["paid", "partial"])
      .gte("created_at", sixMonthsAgo);

    const monthBuckets: Record<string, number> = {};
    const monthLabels = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("en-US", { month: "short" });
      monthBuckets[key] = 0;
      monthLabels.push({ key, label });
    }
    (invData || []).forEach((inv: any) => {
      const key = inv.created_at.slice(0, 7);
      if (monthBuckets[key] !== undefined) monthBuckets[key] += (inv.amount_paid || 0);
    });
    const revBars = monthLabels.map(m => ({ label: m.label, value: monthBuckets[m.key] }));
    setRevenueByMonth(revBars);

    // Revenue trend: compare last 2 months
    const vals = revBars.map(b => b.value);
    const curMonth = vals[vals.length - 1] || 0;
    const prevMonth = vals[vals.length - 2] || 0;
    setTotalRevenue(curMonth);
    setRevenueTrend(prevMonth > 0 ? ((curMonth - prevMonth) / prevMonth) * 100 : 0);

    // Activity by week (last 8 weeks)
    const eightWeeksAgo = new Date(Date.now() - 56 * 86400000).toISOString();
    const { data: actData } = await supabase
      .from("activity_log")
      .select("created_at")
      .gte("created_at", eightWeeksAgo);
    const weekBuckets: number[] = new Array(8).fill(0);
    (actData || []).forEach((a: any) => {
      const weeksAgo = Math.floor((Date.now() - new Date(a.created_at).getTime()) / (7 * 86400000));
      const idx = 7 - Math.min(weeksAgo, 7);
      weekBuckets[idx]++;
    });
    setActivityByWeek(weekBuckets);

    // New leads this month vs last month
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    const { count: thisMonthLeads } = await supabase
      .from("customers").select("id", { count: "exact", head: true }).gte("created_at", thisMonthStart);
    const { count: lastMonthLeads } = await supabase
      .from("customers").select("id", { count: "exact", head: true })
      .gte("created_at", lastMonthStart).lt("created_at", thisMonthStart);
    setTotalLeads(thisMonthLeads || 0);
    setLeadTrend(lastMonthLeads && lastMonthLeads > 0 ? (((thisMonthLeads || 0) - lastMonthLeads) / lastMonthLeads) * 100 : 0);

    // Close rate: sold / (sold + lost)
    const { count: soldCount } = await supabase
      .from("customers").select("id", { count: "exact", head: true }).eq("lead_status", "Sold");
    const { count: installedCount } = await supabase
      .from("customers").select("id", { count: "exact", head: true }).eq("lead_status", "Installed");
    const { count: completeCount } = await supabase
      .from("customers").select("id", { count: "exact", head: true }).eq("lead_status", "Complete");
    const { count: lostCount } = await supabase
      .from("customers").select("id", { count: "exact", head: true }).eq("lead_status", "Lost");
    const won = (soldCount || 0) + (installedCount || 0) + (completeCount || 0);
    const total = won + (lostCount || 0);
    setCloseRate(total > 0 ? (won / total) * 100 : 0);
  }

  async function loadShipments() {
    setShipmentsLoading(true);
    try {
      // Fetch quote_materials with active statuses
      const { data: matData } = await supabase
        .from("quote_materials")
        .select("id, description, status, tracking_number, expected_packages, received_packages, eta, ordered_at, shipped_at, received_at, storage_location, quote_id, quotes!inner(customer_id, customers!inner(first_name, last_name))")
        .in("status", ["ordered", "shipped", "received"])
        .order("created_at", { ascending: false })
        .limit(30);

      const items: ShipmentItem[] = (matData || []).map((m: any) => {
        const cust = m.quotes?.customers;
        const name = cust ? [cust.first_name, cust.last_name].filter(Boolean).join(" ") : "Unknown";
        return {
          id: m.id,
          description: m.description || "Materials",
          status: m.status,
          customer_name: name,
          customer_id: m.quotes?.customer_id || "",
          quote_id: m.quote_id || "",
          tracking_number: m.tracking_number || null,
          expected_packages: m.expected_packages || null,
          received_packages: m.received_packages || 0,
          eta: m.eta || null,
          ordered_at: m.ordered_at || null,
          shipped_at: m.shipped_at || null,
          received_at: m.received_at || null,
          storage_location: m.storage_location || null,
        };
      });
      setShipments(items);
    } catch (err) {
      console.error("[loadShipments]", err);
    }
    setShipmentsLoading(false);
  }

  async function addCustomer(e: React.FormEvent) {
    e.preventDefault();
    const first = firstName.trim();
    const last = lastName.trim();
    if (!first || !last) { alert("First and last name required."); return; }
    const composedAddress = composeAddress(street.trim(), city.trim(), addrState.trim(), zip.trim());
    setSaving(true);
    const { data, error } = await supabase
      .from("customers")
      .insert([{ name: `${first} ${last}`, first_name: first, last_name: last, address: composedAddress, phone: phone.trim() || null, email: email.trim() || null }])
      .select("id, first_name, last_name, address, phone, email").single();
    setSaving(false);
    if (error) { alert("Error: " + error.message); return; }
    if (data) setCustomers((prev) => [data as Customer, ...prev]);
    setFirstName(""); setLastName(""); setStreet(""); setCity(""); setAddrState(""); setZip(""); setPhone(""); setEmail("");
    setShowForm(false);
  }

  function moveWidget(id: WidgetId, dir: -1 | 1) {
    setWidgetOrder(prev => {
      const idx = prev.indexOf(id);
      if (idx < 0) return prev;
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      saveLayout(next, hiddenWidgets);
      return next;
    });
  }

  function toggleWidget(id: WidgetId) {
    setHiddenWidgets(prev => {
      const next = prev.includes(id) ? prev.filter(w => w !== id) : [...prev, id];
      saveLayout(widgetOrder, next);
      return next;
    });
  }

  function resetLayout() {
    setWidgetOrder(defaultLayout);
    setHiddenWidgets([]);
    saveLayout(defaultLayout, []);
    setEditingLayout(false);
  }

  function renderWidget(id: WidgetId) {
    switch (id) {
      case "quick_actions":
        return <QuickActionsWidget onNewCustomer={() => { setTab("customers"); setShowForm(true); }} />;
      case "kpi_strip":
        return <KPIStripWidget totalRevenue={totalRevenue} revenueTrend={revenueTrend} revenueByMonth={revenueByMonth} totalLeads={totalLeads} leadTrend={leadTrend} activityByWeek={activityByWeek} closeRate={closeRate} />;
      case "revenue_chart":
        return <RevenueChartWidget revenueByMonth={revenueByMonth} />;
      case "todays_focus":
        return <TodaysFocusWidget focusItems={focusItems} />;
      case "sales_pipeline":
        return <SalesPipelineWidget customers={customers} pipelineValue={pipelineValue} selectedStage={selectedStage} setSelectedStage={setSelectedStage} />;
      case "operations":
        return <OperationsWidget measuresToSchedule={measuresToSchedule} measuresDone={measuresDone} installsToSchedule={installsToSchedule} installsScheduled={installsScheduled} issueJobs={issueJobs} statsLoading={statsLoading} />;
      case "work_queue":
        return <WorkQueueWidget workQueue={workQueue} workQueueLoading={workQueueLoading} currentUserId={currentUserId} queueFilter={queueFilter} setQueueFilter={setQueueFilter} canAssign={permissions.assign_to_others} />;
      case "ready_to_install":
        return <ReadyToInstallWidget readyToInstall={readyToInstall} />;
      case "todays_appointments":
        return <TodaysAppointmentsWidget todayAppts={todayAppts} />;
      case "tasks_due":
        return <TasksDueWidget tasksDue={tasksDue} />;
      case "shipments":
        return <ShipmentTrackingWidget shipments={shipments} loading={shipmentsLoading} />;
      default:
        return null;
    }
  }

  return (
    <main style={{ background: "var(--zr-canvas)", color: "var(--zr-text-primary)" }} className="min-h-screen pt-5 pb-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        {/* ── Large iOS-style page title + action row ──────────────── */}
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h1 style={{ color: "var(--zr-text-primary)", letterSpacing: "-0.03em" }} className="text-[34px] font-bold leading-[1.1]">
              Dashboard
            </h1>
            <Link href="/analytics"
              style={{ color: "var(--zr-orange)" }}
              className="text-[15px] font-medium mt-1.5 inline-flex items-center gap-1">
              Analytics
              <svg width="7" height="12" viewBox="0 0 8 14" fill="none" style={{ marginLeft: "2px" }}>
                <path d="M1 1L7 7L1 13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </div>
          {tab === "dashboard" && (
            <div className="flex items-center gap-2">
              {editingLayout && (
                <button onClick={resetLayout}
                  className="text-[13px] px-3 py-2 rounded-full"
                  style={{ color: "var(--zr-text-secondary)", background: "var(--zr-surface-2)" }}>
                  Reset
                </button>
              )}
              <button onClick={() => setEditingLayout(!editingLayout)}
                className="text-[13px] px-3.5 py-2 rounded-full font-medium transition-colors"
                style={editingLayout
                  ? { background: "var(--zr-orange)", color: "#fff", boxShadow: "0 1px 2px rgba(214,90,49,0.25)" }
                  : { background: "var(--zr-surface-1)", color: "var(--zr-text-secondary)", boxShadow: "var(--zr-shadow-sm)" }}>
                {editingLayout ? "Done" : "Customize"}
              </button>
            </div>
          )}
        </div>

        {/* ── iOS-style segmented control ──────────────────────────── */}
        <div className="mb-6 grid grid-cols-2 p-1 rounded-full"
          style={{ background: "var(--zr-surface-3)" }}>
          <button onClick={() => setTab("dashboard")}
            className="py-2 text-[14px] font-semibold rounded-full transition-all"
            style={tab === "dashboard"
              ? { background: "var(--zr-surface-1)", color: "var(--zr-text-primary)", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }
              : { background: "transparent", color: "var(--zr-text-secondary)" }}>
            Dashboard
          </button>
          <button onClick={() => setTab("customers")}
            className="py-2 text-[14px] font-semibold rounded-full transition-all"
            style={tab === "customers"
              ? { background: "var(--zr-surface-1)", color: "var(--zr-text-primary)", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }
              : { background: "transparent", color: "var(--zr-text-secondary)" }}>
            Customers
          </button>
        </div>

        {tab === "dashboard" && (
          <>
            {/* First-run welcome — soft card, no border, warm gradient accent */}
            {customers.length === 0 && !statsLoading && (
              <div
                className="mb-6 rounded-2xl p-5 flex items-start gap-4"
                style={{
                  background: "linear-gradient(135deg, rgba(214,90,49,0.08) 0%, rgba(214,90,49,0.02) 100%)",
                  boxShadow: "var(--zr-shadow-md)",
                }}
              >
                <div className="text-3xl leading-none pt-0.5">👋</div>
                <div className="flex-1 min-w-0">
                  <div className="text-[17px] font-semibold mb-1" style={{ color: "var(--zr-text-primary)" }}>
                    Welcome to ZeroRemake
                  </div>
                  <div className="text-[14px] mb-3 leading-relaxed" style={{ color: "var(--zr-text-secondary)" }}>
                    Add your first customer to start tracking leads, quotes, and installs — everything here will populate as you go.
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => { setTab("customers"); setShowForm(true); }}
                      className="zr-v2-btn-primary text-[14px]"
                    >
                      Add your first customer
                    </button>
                    <Link
                      href="/setup-guide"
                      className="text-[14px] font-medium px-4 py-3 rounded-xl"
                      style={{ color: "var(--zr-orange)", background: "var(--zr-surface-1)", boxShadow: "var(--zr-shadow-sm)" }}
                    >
                      Setup guide
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {/* Visible widgets — generous spacing, no borders */}
            <div className="flex flex-col gap-9">
              {widgetOrder.filter(id => {
                if (hiddenWidgets.includes(id)) return false;
                const modeWidgets = getModeWidgets(taskMode);
                if (modeWidgets.length > 0 && !modeWidgets.includes(id)) return false;
                return true;
              }).map((id, idx, visibleArr) => (
                <div key={id}>
                  {editingLayout && (
                    <div className="flex items-center justify-between mb-2 px-1">
                      <span className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: "var(--zr-text-muted)" }}>
                        {WIDGET_LABELS[id]}
                      </span>
                      <div className="flex gap-1.5">
                        <button onClick={() => toggleWidget(id)}
                          className="text-[12px] px-2.5 py-1 rounded-full font-medium"
                          style={{ background: "rgba(214,58,58,0.1)", color: "var(--zr-error)" }}>
                          Hide
                        </button>
                        <button onClick={() => moveWidget(id, -1)} disabled={idx === 0}
                          className="text-[12px] w-7 h-7 rounded-full flex items-center justify-center"
                          style={{ background: "var(--zr-surface-1)", color: idx === 0 ? "var(--zr-text-muted)" : "var(--zr-text-secondary)", boxShadow: "var(--zr-shadow-sm)", opacity: idx === 0 ? 0.4 : 1 }}>
                          ↑
                        </button>
                        <button onClick={() => moveWidget(id, 1)} disabled={idx === visibleArr.length - 1}
                          className="text-[12px] w-7 h-7 rounded-full flex items-center justify-center"
                          style={{ background: "var(--zr-surface-1)", color: idx === visibleArr.length - 1 ? "var(--zr-text-muted)" : "var(--zr-text-secondary)", boxShadow: "var(--zr-shadow-sm)", opacity: idx === visibleArr.length - 1 ? 0.4 : 1 }}>
                          ↓
                        </button>
                      </div>
                    </div>
                  )}
                  {renderWidget(id)}
                </div>
              ))}
            </div>

            {/* Hidden widgets — soft tray shown only during customize */}
            {editingLayout && hiddenWidgets.length > 0 && (
              <div className="mt-7 rounded-2xl p-4"
                style={{ background: "var(--zr-surface-1)", boxShadow: "var(--zr-shadow-sm)" }}>
                <div className="text-[12px] font-semibold uppercase tracking-wide mb-3 px-1" style={{ color: "var(--zr-text-muted)" }}>
                  Hidden widgets
                </div>
                <div className="flex flex-wrap gap-2">
                  {hiddenWidgets.map(id => (
                    <button key={id} onClick={() => toggleWidget(id)}
                      className="text-[13px] px-3 py-2 rounded-full font-medium"
                      style={{ background: "var(--zr-surface-2)", color: "var(--zr-text-primary)" }}>
                      + {WIDGET_LABELS[id]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Bottom quick action */}
            <div className="mt-7 flex gap-2">
              <button onClick={() => { setTab("customers"); setShowForm(true); }} className="zr-v2-btn-primary">
                + New Customer
              </button>
            </div>
          </>
        )}

        {tab === "customers" && (
          <>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 style={{ color: "var(--zr-text-primary)" }} className="font-semibold shrink-0">Customers ({customers.length})</h2>
              <button onClick={() => setShowForm((v) => !v)} style={{ background: "var(--zr-orange)", color: "#fff" }} className="shrink-0 rounded px-3 py-1 text-sm">
                {showForm ? "Cancel" : "+ New"}
              </button>
            </div>
            <div className="mb-3">
              <input
                type="search"
                placeholder="Search by name, address, phone…"
                value={custSearch}
                onChange={e => setCustSearch(e.target.value)}
                style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }}
                className="w-full rounded px-3 py-2 text-sm"
              />
            </div>

            {showForm && (
              <form onSubmit={addCustomer} style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }} className="mb-6 rounded p-4">
                <h3 style={{ color: "var(--zr-text-primary)" }} className="mb-3 font-semibold">New Customer</h3>
                <div className="mb-3 grid grid-cols-2 gap-3">
                  <div><label style={{ color: "var(--zr-text-secondary)" }} className="mb-1 block text-xs font-medium">First Name</label><input style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }} className="w-full rounded px-3 py-2" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="John" /></div>
                  <div><label style={{ color: "var(--zr-text-secondary)" }} className="mb-1 block text-xs font-medium">Last Name</label><input style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }} className="w-full rounded px-3 py-2" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Johnson" /></div>
                </div>
                <div className="mb-3"><label style={{ color: "var(--zr-text-secondary)" }} className="mb-1 block text-xs font-medium">Street Address</label><input style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }} className="w-full rounded px-3 py-2" value={street} onChange={(e) => setStreet(e.target.value)} placeholder="123 Main St" /></div>
                <div className="mb-3 grid grid-cols-[1fr_72px_104px] gap-3">
                  <div><label style={{ color: "var(--zr-text-secondary)" }} className="mb-1 block text-xs font-medium">City</label><input style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }} className="w-full rounded px-3 py-2" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Salt Lake City" /></div>
                  <div><label style={{ color: "var(--zr-text-secondary)" }} className="mb-1 block text-xs font-medium">State</label><input style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }} className="w-full rounded px-3 py-2 uppercase" value={addrState} onChange={(e) => setAddrState(e.target.value.toUpperCase())} placeholder="UT" maxLength={2} /></div>
                  <div><label style={{ color: "var(--zr-text-secondary)" }} className="mb-1 block text-xs font-medium">Zip</label><input style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }} className="w-full rounded px-3 py-2" value={zip} onChange={(e) => setZip(e.target.value)} placeholder="84101" /></div>
                </div>
                <div className="mb-4 grid grid-cols-2 gap-3">
                  <div><label style={{ color: "var(--zr-text-secondary)" }} className="mb-1 block text-xs font-medium">Phone</label><input type="tel" style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }} className="w-full rounded px-3 py-2" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="801-555-1234" /></div>
                  <div><label style={{ color: "var(--zr-text-secondary)" }} className="mb-1 block text-xs font-medium">Email</label><input type="email" style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }} className="w-full rounded px-3 py-2" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="john@example.com" /></div>
                </div>
                <button type="submit" disabled={saving} style={{ background: "var(--zr-orange)", color: "#fff" }} className="rounded px-4 py-2 disabled:opacity-50">{saving ? "Saving..." : "Save Customer"}</button>
              </form>
            )}

            {(() => {
              const q = custSearch.toLowerCase();
              const filtered = q
                ? customers.filter(c =>
                    [c.first_name, c.last_name, c.address, c.phone, c.email]
                      .filter(Boolean).join(" ").toLowerCase().includes(q)
                  )
                : customers;
              return filtered.length === 0 ? (
                custSearch ? (
                  <EmptyState type="search" title="No results" subtitle={`No customers match "${custSearch}"`} />
                ) : (
                  <EmptyState type="customers" title="No customers yet" subtitle="Add your first customer to get started." action="+ New Customer" onAction={() => setShowForm(true)} />
                )
              ) : (
              <ul className="space-y-2">
                {filtered.map((customer) => (
                  <li key={customer.id} style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }} className="rounded p-3">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/customers/${customer.id}`} style={{ color: "var(--zr-orange)" }} className="font-semibold hover:underline">
                        {[customer.first_name, customer.last_name].filter(Boolean).join(" ")}
                      </Link>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {customer.heat_score && customer.heat_score !== "Warm" && (
                          <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${heatStyle[customer.heat_score] || "bg-gray-100 text-gray-500"}`}>
                            {customer.heat_score}
                          </span>
                        )}
                        {customer.lead_status && customer.lead_status !== "New" && (
                          <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${stageStyle[customer.lead_status] || "bg-gray-100 text-gray-500"}`}>
                            {customer.lead_status}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ color: "var(--zr-text-muted)" }} className="mt-0.5 text-sm">
                      {formatAddressDisplay(customer.address)}
                      {customer.assigned_to && teamMap[customer.assigned_to] && (
                        <span className="ml-2 inline-block rounded px-1.5 py-0.5 text-xs bg-indigo-100 text-indigo-700">{teamMap[customer.assigned_to]}</span>
                      )}
                    </div>
                    {customer.phone && <div style={{ color: "var(--zr-text-muted)" }} className="text-sm">{customer.phone}</div>}
                  </li>
                ))}
              </ul>
              );
            })()}
          </>
        )}
      </div>
    </main>
  );
}
