"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Skeleton, SkeletonCard, EmptyState } from "./ui";
import { Sparkline, MiniBarChart, PipelineFunnel, DonutChart, StatTrend } from "./charts";

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

type TodayAppt = {
  id: string;
  customer_id: string;
  customer_name: string;
  type: string;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  address: string | null;
};

type TaskDue = {
  id: string;
  title: string;
  due_date: string | null;
  customer_id: string;
  customer_name: string;
};

type WorkItem = {
  customer_id: string;
  customer_name: string;
  lead_status: string;
  heat_score: string;
  next_action: string | null;
  reason: string;
  days_inactive: number | null;
  priority: number; // 1 = highest
  assigned_to: string | null;
  assigned_name: string | null;
};

type DashboardJob = {
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

type FilterKey = "measures_to_schedule" | "measures_done" | "installs_to_schedule" | "installs_scheduled" | "issues";

export default function HomePage() {
  const [tab, setTab] = useState<"dashboard" | "customers">("dashboard");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState<FilterKey | null>(null);

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

  function toggleFilter(key: FilterKey) {
    setSelectedFilter((prev) => (prev === key ? null : key));
  }

  const filterJobs: Record<FilterKey, DashboardJob[]> = {
    measures_to_schedule: measuresToSchedule,
    measures_done: measuresDone,
    installs_to_schedule: installsToSchedule,
    installs_scheduled: installsScheduled,
    issues: issueJobs,
  };

  const filterLabels: Record<FilterKey, string> = {
    measures_to_schedule: "Measures to Schedule",
    measures_done: "Measures Done",
    installs_to_schedule: "Installs to Schedule",
    installs_scheduled: "Installs Scheduled",
    issues: "Open Issues",
  };

  function StatCard({ label, count, filterKey, color = "text-black" }: {
    label: string; count: number; filterKey: FilterKey; color?: string;
  }) {
    const active = selectedFilter === filterKey;
    return (
      <button
        type="button"
        onClick={() => toggleFilter(filterKey)}
        style={{
          background: active ? "var(--zr-orange)" : "var(--zr-surface-1)",
          border: active ? "1px solid var(--zr-orange)" : "1px solid var(--zr-border)",
          color: active ? "#fff" : "var(--zr-text-primary)",
        }}
        className="rounded p-3 text-center w-full transition-colors"
      >
        <div style={{ color: active ? "#fff" : undefined }} className={`text-2xl font-bold ${active ? "" : color}`}>
          {statsLoading ? "—" : count}
        </div>
        <div style={{ color: active ? "rgba(255,255,255,0.7)" : "var(--zr-text-muted)" }} className="text-xs mt-1">{label}</div>
      </button>
    );
  }

  const STAGE_COLORS: Record<string, string> = {
    "New": "text-gray-700", "Contacted": "text-blue-600",
    "Consult Scheduled": "text-indigo-600", "Measure Scheduled": "text-purple-600",
    "Measured": "text-amber-700", "Quoted": "text-orange-600",
    "Sold": "text-green-600", "Contact for Install": "text-teal-600",
    "Installed": "text-emerald-600", "Complete": "text-lime-700",
    "Lost": "text-red-600", "On Hold": "text-yellow-700", "Waiting": "text-slate-500",
  };
  const ALL_STAGES = ["New","Contacted","Consult Scheduled","Measure Scheduled","Measured","Quoted","Sold","Contact for Install","Installed","Complete","Lost","On Hold","Waiting"];
  const stageCounts = ALL_STAGES.reduce((acc, s) => {
    acc[s] = customers.filter(c => c.lead_status === s).length;
    return acc;
  }, {} as Record<string, number>);
  const stageCustomers = selectedStage
    ? customers.filter(c => c.lead_status === selectedStage)
    : [];

  function PipelineCard({ stage }: { stage: string }) {
    const active = selectedStage === stage;
    const count  = stageCounts[stage] ?? 0;
    const value  = pipelineValue[stage] ?? 0;
    return (
      <button
        type="button"
        onClick={() => setSelectedStage(active ? null : stage)}
        style={{
          background: active ? "var(--zr-orange)" : "var(--zr-surface-1)",
          border: active ? "1px solid var(--zr-orange)" : "1px solid var(--zr-border)",
          color: active ? "#fff" : "var(--zr-text-primary)",
        }}
        className="rounded p-2 text-center w-full transition-colors"
      >
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
    <main style={{ background: "var(--zr-black)", color: "var(--zr-text-primary)" }} className="min-h-screen p-4">
      <div className="mx-auto max-w-3xl">
        <div className="mb-3 flex items-center justify-between">
          <h1 style={{ color: "var(--zr-text-primary)" }} className="text-xl font-bold">Dashboard</h1>
          <Link href="/analytics" style={{ color: "var(--zr-orange)" }} className="text-sm hover:underline">Analytics →</Link>
        </div>

        {/* Quick-actions */}
        <div className="mb-4 grid grid-cols-3 gap-2">
          <button onClick={() => { setTab("customers"); setShowForm(true); }}
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

        <div className="mb-4 flex rounded border overflow-hidden" style={{ borderColor: "var(--zr-border)" }}>
          <button style={{ background: tab === "dashboard" ? "var(--zr-orange)" : "var(--zr-surface-1)", color: tab === "dashboard" ? "#fff" : "var(--zr-text-primary)" }} className="flex-1 py-2 text-sm font-medium" onClick={() => setTab("dashboard")}>Dashboard</button>
          <button style={{ background: tab === "customers" ? "var(--zr-orange)" : "var(--zr-surface-1)", color: tab === "customers" ? "#fff" : "var(--zr-text-primary)" }} className="flex-1 py-2 text-sm font-medium" onClick={() => setTab("customers")}>Customers</button>
        </div>

        {tab === "dashboard" && (
          <>
            {/* ── KPI Strip ── */}
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
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

            {/* ── Revenue Chart ── */}
            {revenueByMonth.some(b => b.value > 0) && (
              <div style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)", borderRadius: "var(--zr-radius-md)", padding: "12px" }} className="mb-4">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                  <span style={{ fontSize: "11px", color: "var(--zr-text-muted)", fontFamily: "var(--zr-font-mono)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Revenue — Last 6 Months</span>
                  <Link href="/analytics" style={{ color: "var(--zr-orange)", fontSize: "11px" }} className="hover:underline">Details →</Link>
                </div>
                <MiniBarChart bars={revenueByMonth} width={320} height={80} />
              </div>
            )}

            {/* ── Today's Focus ── */}
            {focusItems.length > 0 && (
              <div style={{ background: "var(--zr-surface-1)", border: "2px solid var(--zr-orange)" }} className="mb-4 rounded-xl p-3">
                <div style={{ color: "var(--zr-text-primary)" }} className="text-xs font-bold uppercase tracking-wide mb-2">Today's Focus</div>
                <ul className="space-y-2">
                  {focusItems.map((item, i) => (
                    <li key={i}>
                      <Link href={item.href}
                        className="flex items-center justify-between gap-2 rounded-lg p-2">
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
            )}

            {/* ── Sales Pipeline ── */}
            <div className="mb-1 flex items-center gap-2">
              <span style={{ color: "var(--zr-text-muted)", fontFamily: "var(--zr-font-mono)" }} className="text-xs font-semibold uppercase tracking-wide">Sales Pipeline</span>
              <div style={{ borderColor: "var(--zr-border)" }} className="flex-1 border-t" />
            </div>
            <div className="mb-2 grid grid-cols-5 gap-1.5 sm:grid-cols-10">
              {ALL_STAGES.map(s => <PipelineCard key={s} stage={s} />)}
            </div>

            {/* Pipeline funnel visualization */}
            {customers.length > 0 && (
              <div style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)", borderRadius: "var(--zr-radius-md)", padding: "12px" }} className="mb-3">
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

            {/* Stage drill-down */}
            {selectedStage && (
              <div style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }} className="mb-4 rounded p-3">
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
                              {c.address && <div style={{ color: "var(--zr-text-muted)" }} className="text-xs truncate">{formatAddressDisplay(c.address)}</div>}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {c.heat_score && (
                                <span className={`text-xs rounded px-1.5 py-0.5 ${heatStyle[c.heat_score]}`}>{c.heat_score}</span>
                              )}
                              {inactive !== null && (
                                <span style={{ color: "var(--zr-text-muted)" }} className="text-xs">{inactive}d ago</span>
                              )}
                            </div>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

            {/* ── Operations ── */}
            <div className="mb-1 flex items-center gap-2">
              <span style={{ color: "var(--zr-text-muted)", fontFamily: "var(--zr-font-mono)" }} className="text-xs font-semibold uppercase tracking-wide">Operations</span>
              <div style={{ borderColor: "var(--zr-border)" }} className="flex-1 border-t" />
            </div>
            {/* Stats grid */}
            <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <StatCard label="Measures to Schedule" count={measuresToSchedule.length} filterKey="measures_to_schedule" />
              <StatCard label="Measures Done" count={measuresDone.length} filterKey="measures_done" color="text-green-600" />
              <StatCard label="Installs to Schedule" count={installsToSchedule.length} filterKey="installs_to_schedule" />
              <StatCard label="Installs Scheduled" count={installsScheduled.length} filterKey="installs_scheduled" color="text-blue-600" />
              <StatCard label="Open Issues" count={issueJobs.length} filterKey="issues" color={issueJobs.length > 0 ? "text-red-600" : "text-black"} />
            </div>

            {/* Filtered job list */}
            {selectedFilter && (
              <div style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }} className="mb-4 rounded p-3">
                <div className="mb-2 flex items-center justify-between">
                  <h2 style={{ color: "var(--zr-text-primary)" }} className="font-semibold">{filterLabels[selectedFilter]}</h2>
                  <button type="button" onClick={() => setSelectedFilter(null)} style={{ color: "var(--zr-text-muted)" }} className="text-xs">✕ close</button>
                </div>

                {filterJobs[selectedFilter].length === 0 ? (
                  <p style={{ color: "var(--zr-text-muted)" }} className="text-sm">None right now.</p>
                ) : (
                  <ul className="space-y-2">
                    {filterJobs[selectedFilter].map((job) => (
                      <li key={job.id}>
                        <Link href={`/measure-jobs/${job.id}`} style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)" }} className="block rounded p-2">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div style={{ color: "var(--zr-orange)" }} className="text-sm font-medium">{job.title}</div>
                              <div style={{ color: "var(--zr-text-muted)" }} className="text-xs">{job.customer_name}</div>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              {job.overdue && (
                                <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Overdue</span>
                              )}
                              {job.needs_attention && !job.overdue && daysAgo(job.created_at) > 5 && (
                                <span style={{ background: "rgba(90, 86, 82, 0.3)", color: "var(--zr-text-muted)" }} className="rounded px-2 py-0.5 text-xs">Idle {daysAgo(job.created_at)}d</span>
                              )}
                              {job.install_scheduled_at && (
                                <span style={{ color: "var(--zr-text-muted)" }} className="text-xs">{job.install_scheduled_at.slice(0, 10)}</span>
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

            {/* Work Queue */}
            {workQueueLoading && (
              <div style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }} className="mb-4 rounded p-3">
                <Skeleton w="100px" h="14px" />
                <div style={{ height: 12 }} />
                <Skeleton lines={3} />
              </div>
            )}
            {!workQueueLoading && workQueue.length > 0 && (() => {
              const filteredQueue = queueFilter === "mine" && currentUserId
                ? workQueue.filter(w => w.assigned_to === currentUserId)
                : workQueue;
              return (
              <div style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }} className="mb-4 rounded p-3">
                <div className="mb-2 flex items-center justify-between">
                  <h2 style={{ color: "var(--zr-text-primary)" }} className="flex items-center gap-2 text-sm font-semibold">
                    Work Queue
                    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${filteredQueue.some((w) => w.priority === 1) ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                      {filteredQueue.length}
                    </span>
                  </h2>
                  <div className="flex rounded overflow-hidden" style={{ border: "1px solid var(--zr-border)" }}>
                    <button onClick={() => setQueueFilter("mine")}
                      className="px-2.5 py-1 text-xs font-medium"
                      style={{ background: queueFilter === "mine" ? "var(--zr-orange)" : "var(--zr-surface-2)", color: queueFilter === "mine" ? "#fff" : "var(--zr-text-secondary)" }}>
                      Mine
                    </button>
                    <button onClick={() => setQueueFilter("all")}
                      className="px-2.5 py-1 text-xs font-medium"
                      style={{ background: queueFilter === "all" ? "var(--zr-orange)" : "var(--zr-surface-2)", color: queueFilter === "all" ? "#fff" : "var(--zr-text-secondary)", borderLeft: "1px solid var(--zr-border)" }}>
                      All
                    </button>
                  </div>
                </div>
                {filteredQueue.length === 0 ? (
                  <p style={{ color: "var(--zr-text-muted)" }} className="text-xs py-2 text-center">No items in your queue right now.</p>
                ) : (
                <ul className="space-y-1.5">
                  {filteredQueue.slice(0, 8).map((w) => (
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
            })()}

            {/* Today's appointments */}
            {/* Ready to Install */}
            {readyToInstall.length > 0 && (
              <div style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)" }} className="mb-4 rounded p-3">
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
            )}

            {todayAppts.length > 0 && (() => {
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
                <div style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }} className="mb-4 rounded p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <h2 style={{ color: "var(--zr-text-primary)" }} className="text-sm font-semibold">
                      Today&apos;s Appointments
                      <span className="ml-1.5 rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700">{todayAppts.length}</span>
                    </h2>
                    <Link href="/schedule" style={{ color: "var(--zr-info)" }} className="text-xs hover:underline">View calendar →</Link>
                  </div>

                  {/* Unconfirmed alert */}
                  {unconfirmed.length > 0 && (
                    <div style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)" }} className="mb-2 flex items-center gap-1.5 rounded px-2 py-1.5">
                      <span className="text-amber-600 text-xs">⚠️</span>
                      <span style={{ color: "var(--zr-warning)" }} className="text-xs font-medium">
                        {unconfirmed.length} appointment{unconfirmed.length > 1 ? "s" : ""} not yet confirmed
                      </span>
                    </div>
                  )}

                  <ul className="space-y-1.5">
                    {todayAppts.map((a) => {
                      const dt = new Date(a.scheduled_at);
                      const timeStr = dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
                      const isNext  = nextAppt?.id === a.id;
                      return (
                        <li key={a.id}>
                          <Link href={`/customers/${a.customer_id}`}
                            style={{ background: isNext ? "rgba(59,130,246,0.1)" : "var(--zr-surface-2)", border: isNext ? "1px solid rgba(59,130,246,0.3)" : "1px solid var(--zr-border)" }}
                            className="flex items-center justify-between rounded p-2 gap-2">
                            <div className="min-w-0">
                              {isNext && (
                                <div style={{ color: "var(--zr-info)" }} className="text-xs font-semibold mb-0.5">▶ Next up</div>
                              )}
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
                              <div className={`text-xs ${
                                a.status === "confirmed"   ? "text-blue-600" :
                                a.status === "completed"   ? "text-green-600" :
                                a.status === "scheduled"   ? "text-amber-500" : "text-gray-400"
                              }`}>
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
            })()}

            {/* Tasks due today / overdue */}
            {tasksDue.length > 0 && (
              <div style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }} className="mb-4 rounded p-3">
                <h2 style={{ color: "var(--zr-text-primary)" }} className="mb-2 text-sm font-semibold">
                  Tasks Due
                  <span className="ml-1.5 rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">{tasksDue.length}</span>
                </h2>
                <ul className="space-y-1.5">
                  {tasksDue.map((t) => (
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
            )}

            {/* Quick actions */}
            <div className="flex gap-2">
              <button onClick={() => { setTab("customers"); setShowForm(true); }} style={{ background: "var(--zr-orange)", color: "#fff", borderRadius: "var(--zr-radius-md)" }} className="px-4 py-2 text-sm">
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
