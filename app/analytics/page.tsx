"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { groupByPerson, type ProfileLite } from "../../lib/name-normalize";
import { FeatureGate } from "../feature-gate";
import { PermissionGate } from "../permission-gate";

type JobStat = {
  id: string;
  title: string;
  customer_id: string;
  measured_by: string | null;
  scheduled_at: string | null;
  install_scheduled_at: string | null;
  install_mode: boolean;
  created_at: string;
};

type IssueDrillJob = {
  job_id: string;
  job_title: string;
  customer_name: string;
  window_label: string;
  room_name: string;
  notes: string | null;
};

type IssueStat = {
  issue_type: string;
  count: number;
  jobs: IssueDrillJob[];
  expanded: boolean;
};

type MeasurerStat = {
  name: string;
  jobs: number;
  windows: number;
};

type StageStat = {
  stage: string;
  count: number;
};

type ActivityTypeStat = {
  type: string;
  count: number;
};

export default function AnalyticsPage() {
  const [jobs, setJobs] = useState<JobStat[]>([]);
  const [windowCount, setWindowCount] = useState(0);
  const [issueStats, setIssueStats] = useState<IssueStat[]>([]);
  const [measurerStats, setMeasurerStats] = useState<MeasurerStat[]>([]);
  const [installComplete, setInstallComplete] = useState(0);
  const [installIssueCount, setInstallIssueCount] = useState(0);
  const [installTotal, setInstallTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<"week" | "month" | "all">("month");

  // Dashboard-matching 5-category counts
  const [measuresToSchedule, setMeasuresToSchedule] = useState(0);
  const [measuresDone, setMeasuresDone] = useState(0);
  const [installsToSchedule, setInstallsToSchedule] = useState(0);
  const [installsScheduled, setInstallsScheduled] = useState(0);
  const [openIssues, setOpenIssues] = useState(0);

  // CRM stats
  const [stageStats, setStageStats] = useState<StageStat[]>([]);
  const [hotCount, setHotCount] = useState(0);
  const [warmCount, setWarmCount] = useState(0);
  const [coldCount, setColdCount] = useState(0);
  const [stuckCount, setStuckCount] = useState(0);
  const [activityTypeStats, setActivityTypeStats] = useState<ActivityTypeStat[]>([]);
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [soldCount, setSoldCount] = useState(0);
  const [crmLoading, setCrmLoading] = useState(true);
  const [avgDaysByStage, setAvgDaysByStage] = useState<Record<string, number>>({});
  const [conversionRates, setConversionRates] = useState<{ from: string; to: string; rate: number }[]>([]);
  const [analyticsCusts, setAnalyticsCusts] = useState<{ id: string; first_name: string | null; last_name: string | null; lead_status: string | null; heat_score: string | null; last_activity_at: string | null }[]>([]);
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  const [totalRevenue,  setTotalRevenue]  = useState(0);
  const [pipelineTotal, setPipelineTotal] = useState(0);
  const [avgDealSize,   setAvgDealSize]   = useState(0);
  const [monthlyPL, setMonthlyPL] = useState<{ month: string; revenue: number; cost: number; profit: number; margin: number; deals: number }[]>([]);

  // Phase 11 — Advanced Analytics
  const [leadSourceStats, setLeadSourceStats] = useState<{ source: string; total: number; sold: number; rate: number; revenue: number }[]>([]);
  const [installerStats, setInstallerStats] = useState<{ name: string; jobs: number; completed: number; issues: number; avgDays: number }[]>([]);
  const [forecast, setForecast] = useState<{ nextMonth: string; projected: number; trend: "up" | "down" | "flat" } | null>(null);
  const [reMeasureRate, setReMeasureRate] = useState<{ total: number; rework: number; rate: number } | null>(null);

  // Job Costing
  type JobCostRow = {
    quoteId: string;
    title: string;
    customerName: string;
    saleAmount: number;
    materialCost: number;
    laborCost: number;
    commissionCost: number;
    totalCost: number;
    grossProfit: number;
    margin: number;
    collected: number;
    status: string;
  };
  const [jobCosts, setJobCosts] = useState<JobCostRow[]>([]);
  const [jobCostLoading, setJobCostLoading] = useState(false);
  const [showJobCost, setShowJobCost] = useState(false);

  useEffect(() => { loadStats(); loadCrmStats(); }, [range]);

  async function loadStats() {
    setLoading(true);
    try {
    const now = new Date();
    let since: string | null = null;
    if (range === "week") { const d = new Date(now); d.setDate(d.getDate() - 7); since = d.toISOString(); }
    else if (range === "month") { const d = new Date(now); d.setDate(d.getDate() - 30); since = d.toISOString(); }

    let jobQuery = supabase.from("measure_jobs").select("id, title, customer_id, measured_by, scheduled_at, install_scheduled_at, install_mode, created_at").order("created_at", { ascending: false });
    if (since) jobQuery = jobQuery.gte("created_at", since);
    const { data: jobData } = await jobQuery;
    const loadedJobs = (jobData || []) as JobStat[];
    setJobs(loadedJobs);

    if (loadedJobs.length === 0) { setWindowCount(0); setInstallComplete(0); setInstallIssueCount(0); setInstallTotal(0); setIssueStats([]); setMeasurerStats([]); setLoading(false); return; }

    const jobIds = loadedJobs.map((j) => j.id);

    // Rooms
    const { data: roomData } = await supabase.from("rooms").select("id, measure_job_id, name").in("measure_job_id", jobIds);
    const rooms = (roomData || []) as { id: string; measure_job_id: string; name: string }[];
    const roomIds = rooms.map((r) => r.id);
    const roomById: Record<string, { measure_job_id: string; name: string }> = {};
    rooms.forEach((r) => { roomById[r.id] = { measure_job_id: r.measure_job_id, name: r.name }; });

    // Windows
    type WinRow = { id: string; room_id: string; install_status: string | null; sort_order: number | null };
    let wins: WinRow[] = [];
    if (roomIds.length > 0) {
      const { data: winData } = await supabase.from("windows").select("id, room_id, install_status, sort_order").in("room_id", roomIds);
      wins = (winData || []) as WinRow[];
    }
    setWindowCount(wins.length);

    // 5-category dashboard stats
    const roomsByJob: Record<string, string[]> = {};
    rooms.forEach((r) => {
      if (!roomsByJob[r.measure_job_id]) roomsByJob[r.measure_job_id] = [];
      roomsByJob[r.measure_job_id].push(r.id);
    });
    const winCountByRoom: Record<string, number> = {};
    const issueJobIds = new Set<string>();
    wins.forEach((w) => {
      winCountByRoom[w.room_id] = (winCountByRoom[w.room_id] || 0) + 1;
      if (w.install_status === "issue") {
        const jobId = Object.keys(roomsByJob).find((jid) => roomsByJob[jid].includes(w.room_id));
        if (jobId) issueJobIds.add(jobId);
      }
    });
    const hasWins = (jobId: string) =>
      (roomsByJob[jobId] || []).some((rid) => (winCountByRoom[rid] || 0) > 0);

    setMeasuresToSchedule(loadedJobs.filter((j) => !j.install_mode && !hasWins(j.id)).length);
    setMeasuresDone(loadedJobs.filter((j) => !j.install_mode && hasWins(j.id)).length);
    setInstallsToSchedule(loadedJobs.filter((j) => j.install_mode && !j.install_scheduled_at).length);
    setInstallsScheduled(loadedJobs.filter((j) => j.install_mode && j.install_scheduled_at).length);
    setOpenIssues(loadedJobs.filter((j) => issueJobIds.has(j.id)).length);

    const installWins = wins.filter((w) => {
      const jobId = roomById[w.room_id]?.measure_job_id;
      return jobId && loadedJobs.find((j) => j.id === jobId)?.install_mode;
    });
    setInstallTotal(installWins.length);
    setInstallComplete(installWins.filter((w) => w.install_status === "complete").length);
    setInstallIssueCount(installWins.filter((w) => w.install_status === "issue").length);

    // Issues drill-down
    const winIds = wins.map((w) => w.id);
    let issueRows: { id: string; window_id: string; issue_type: string; notes: string | null }[] = [];
    if (winIds.length > 0) {
      const { data: issData } = await supabase.from("install_issues").select("id, window_id, issue_type, notes").in("window_id", winIds);
      issueRows = (issData || []) as typeof issueRows;
    }

    // Customer names
    const custIds = [...new Set(loadedJobs.map((j) => j.customer_id).filter(Boolean))];
    const custMap: Record<string, string> = {};
    if (custIds.length > 0) {
      const { data: custData } = await supabase.from("customers").select("id, first_name, last_name").in("id", custIds);
      (custData || []).forEach((c: { id: string; first_name: string | null; last_name: string | null }) => {
        custMap[c.id] = [c.last_name, c.first_name].filter(Boolean).join(", ");
      });
    }

    // Build issue stats with drill-down
    const counts: Record<string, IssueDrillJob[]> = {};
    issueRows.forEach((issue) => {
      if (!counts[issue.issue_type]) counts[issue.issue_type] = [];
      const win = wins.find((w) => w.id === issue.window_id);
      if (!win) return;
      const room = roomById[win.room_id];
      if (!room) return;
      const job = loadedJobs.find((j) => j.id === room.measure_job_id);
      if (!job) return;
      counts[issue.issue_type].push({
        job_id: job.id,
        job_title: job.title,
        customer_name: custMap[job.customer_id] || "Unknown",
        room_name: room.name,
        window_label: `Window ${(win.sort_order ?? 0) + 1}`,
        notes: issue.notes,
      });
    });

    const sorted = Object.entries(counts)
      .map(([issue_type, jobs]) => ({ issue_type, count: jobs.length, jobs, expanded: false }))
      .sort((a, b) => b.count - a.count);
    setIssueStats(sorted);

    // Measurer stats — normalize free-text measured_by against profile full_names
    // so "Steve" / "steve" / "Steve Wiezbowski" collapse into one row.
    const { data: profileRows } = await supabase.from("profiles").select("id, full_name");
    const companyProfiles: ProfileLite[] = (profileRows || []) as ProfileLite[];

    const measBuckets = groupByPerson(loadedJobs, (j) => j.measured_by, companyProfiles);
    const measStats: MeasurerStat[] = await Promise.all(
      Array.from(measBuckets.values()).map(async (bucket) => {
        const mJobIds = bucket.items.map(j => j.id);
        const { data: mRooms } = await supabase.from("rooms").select("id").in("measure_job_id", mJobIds);
        const mRoomIds = (mRooms || []).map((r: { id: string }) => r.id);
        let winCount = 0;
        if (mRoomIds.length > 0) {
          const { count } = await supabase.from("windows").select("id", { count: "exact", head: true }).in("room_id", mRoomIds);
          winCount = count || 0;
        }
        return { name: bucket.displayName, jobs: mJobIds.length, windows: winCount };
      })
    );
    setMeasurerStats(measStats.sort((a, b) => b.jobs - a.jobs));
    } catch (err) {
      console.error("loadStats error:", err);
    } finally {
      setLoading(false);
    }
  }

  async function loadCrmStats() {
    setCrmLoading(true);
    try {

    // All customers — pipeline + heat (always all-time, current state)
    const { data: custData } = await supabase
      .from("customers")
      .select("id, first_name, last_name, lead_status, heat_score, last_activity_at, created_at, lead_source");
    const customers = (custData || []) as { id: string; first_name: string | null; last_name: string | null; lead_status: string | null; heat_score: string | null; last_activity_at: string | null; created_at: string }[];
    setTotalCustomers(customers.length);
    setAnalyticsCusts(customers);

    // Pipeline funnel
    const STAGES = ["New","Contacted","Consult Scheduled","Measure Scheduled","Measured","Quoted","Sold","Contact for Install","Installed","Complete","Lost"];
    const stageCounts: Record<string, number> = {};
    STAGES.forEach((s) => { stageCounts[s] = 0; });
    customers.forEach((c) => { const s = c.lead_status || "New"; if (stageCounts[s] !== undefined) stageCounts[s]++; });
    setStageStats(STAGES.map((s) => ({ stage: s, count: stageCounts[s] })));
    setSoldCount((stageCounts["Sold"] || 0) + (stageCounts["Installed"] || 0));

    // Average days at current stage (since last activity or creation)
    const nowMs = Date.now();
    const avgDays: Record<string, number> = {};
    STAGES.forEach((s) => {
      const group = customers.filter(c => (c.lead_status || "New") === s);
      if (group.length === 0) { avgDays[s] = 0; return; }
      const total = group.reduce((sum, c) => {
        const ref = c.last_activity_at ?? c.created_at;
        return sum + Math.floor((nowMs - new Date(ref).getTime()) / 86400000);
      }, 0);
      avgDays[s] = Math.round(total / group.length);
    });
    setAvgDaysByStage(avgDays);

    // Conversion rates through the sales funnel
    const funnelSteps = ["New", "Contacted", "Measured", "Quoted", "Sold"];
    const activeCusts = customers.filter(c => c.lead_status !== "Lost");
    const rates: { from: string; to: string; rate: number }[] = [];
    for (let i = 0; i < funnelSteps.length - 1; i++) {
      const fromStage = funnelSteps[i];
      const toStage   = funnelSteps[i + 1];
      const fromIdx   = funnelSteps.indexOf(fromStage);
      const toIdx     = funnelSteps.indexOf(toStage);
      const reachedFrom = activeCusts.filter(c => {
        const idx = funnelSteps.indexOf(c.lead_status || "New");
        return idx >= fromIdx;
      }).length;
      const reachedTo = activeCusts.filter(c => {
        const idx = funnelSteps.indexOf(c.lead_status || "New");
        return idx >= toIdx;
      }).length;
      rates.push({ from: fromStage, to: toStage, rate: reachedFrom > 0 ? Math.round((reachedTo / reachedFrom) * 100) : 0 });
    }
    setConversionRates(rates);

    // Heat score
    let hot = 0, warm = 0, cold = 0;
    customers.forEach((c) => {
      if (c.heat_score === "Hot") hot++;
      else if (c.heat_score === "Cold") cold++;
      else warm++;
    });
    setHotCount(hot); setWarmCount(warm); setColdCount(cold);

    // Stuck leads
    const now = Date.now();
    const stuck = customers.filter((c) => {
      const threshold = c.heat_score === "Hot" ? 5 : c.heat_score === "Cold" ? 30 : 14;
      if (!c.last_activity_at) return true; // never contacted = stuck
      const days = Math.floor((now - new Date(c.last_activity_at).getTime()) / (1000 * 60 * 60 * 24));
      return days >= threshold;
    });
    // Exclude Installed and Lost from stuck
    setStuckCount(stuck.filter((c) => c.lead_status !== "Installed" && c.lead_status !== "Lost").length);

    // Activity log — filtered by date range
    const nowDate = new Date();
    let since: string | null = null;
    if (range === "week") { const d = new Date(nowDate); d.setDate(d.getDate() - 7); since = d.toISOString(); }
    else if (range === "month") { const d = new Date(nowDate); d.setDate(d.getDate() - 30); since = d.toISOString(); }

    let actQuery = supabase.from("activity_log").select("type");
    if (since) actQuery = actQuery.gte("created_at", since);
    const { data: actData } = await actQuery;
    const acts = (actData || []) as { type: string }[];
    const actCounts: Record<string, number> = {};
    acts.forEach((a) => { actCounts[a.type] = (actCounts[a.type] || 0) + 1; });
    const TYPES = ["Call", "Text", "Email", "Note", "Visit"];
    setActivityTypeStats(TYPES.filter((t) => actCounts[t] > 0).map((t) => ({ type: t, count: actCounts[t] })));

    // Revenue from quotes — include created_at + cost_total for P&L
    const { data: quoteData } = await supabase
      .from("quotes").select("total, cost_total, status, created_at").gt("total", 0);
    const quotes = (quoteData || []) as { total: number; cost_total: number; status: string; created_at: string }[];
    const sold     = quotes.filter(q => q.status === "approved");
    const pipeline = quotes.filter(q => q.status !== "rejected" && q.status !== "approved");
    setTotalRevenue(sold.reduce((s, q) => s + q.total, 0));
    setPipelineTotal(pipeline.reduce((s, q) => s + q.total, 0));
    setAvgDealSize(sold.length > 0 ? sold.reduce((s, q) => s + q.total, 0) / sold.length : 0);

    // Monthly P&L — last 12 months of closed jobs
    const monthMap: Record<string, { revenue: number; cost: number; deals: number }> = {};
    sold.forEach(q => {
      const mo = q.created_at.slice(0, 7); // "2026-04"
      if (!monthMap[mo]) monthMap[mo] = { revenue: 0, cost: 0, deals: 0 };
      monthMap[mo].revenue += q.total;
      monthMap[mo].cost    += q.cost_total || 0;
      monthMap[mo].deals   += 1;
    });
    const sortedMonths = Object.keys(monthMap).sort().slice(-12);
    setMonthlyPL(sortedMonths.map(mo => {
      const { revenue, cost, deals } = monthMap[mo];
      const profit = revenue - cost;
      const margin = revenue > 0 ? Math.round((profit / revenue) * 100) : 0;
      const [yr, mn] = mo.split("-");
      const label = new Date(parseInt(yr), parseInt(mn) - 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
      return { month: label, revenue, cost, profit, margin, deals };
    }));

    // ── Phase 11: Close Rate by Lead Source ──────────────
    const sourceMap: Record<string, { total: number; sold: number; revenue: number }> = {};
    customers.forEach(c => {
      const src = (c as any).lead_source || "Unknown";
      if (!sourceMap[src]) sourceMap[src] = { total: 0, sold: 0, revenue: 0 };
      sourceMap[src].total++;
      const ls = c.lead_status || "New";
      if (["Sold", "Contact for Install", "Installed", "Complete"].includes(ls)) sourceMap[src].sold++;
    });
    // Attach revenue per source via quotes joined to customers
    const { data: quoteSourceData } = await supabase
      .from("quotes").select("customer_id, total, status").eq("status", "approved").gt("total", 0);
    const qsByCust: Record<string, number> = {};
    (quoteSourceData || []).forEach((q: any) => { qsByCust[q.customer_id] = (qsByCust[q.customer_id] || 0) + q.total; });
    customers.forEach(c => {
      const src = (c as any).lead_source || "Unknown";
      if (qsByCust[c.id]) sourceMap[src].revenue += qsByCust[c.id];
    });
    const leadSrcArr = Object.entries(sourceMap)
      .map(([source, { total, sold, revenue }]) => ({
        source, total, sold, rate: total > 0 ? Math.round((sold / total) * 100) : 0, revenue,
      }))
      .filter(s => s.total >= 1)
      .sort((a, b) => b.sold - a.sold);
    setLeadSourceStats(leadSrcArr);

    // ── Phase 11: Installer Performance ───────────────────
    const { data: installJobs } = await supabase
      .from("measure_jobs")
      .select("id, measured_by, install_mode, install_status, install_scheduled_at, created_at")
      .eq("install_mode", true);
    const instJobs = (installJobs || []) as { id: string; measured_by: string | null; install_mode: boolean; install_status: string | null; install_scheduled_at: string | null; created_at: string }[];
    // Normalize installer names using profile lookups, same as measurer stats above.
    const { data: instProfileRows } = await supabase.from("profiles").select("id, full_name");
    const instProfiles: ProfileLite[] = (instProfileRows || []) as ProfileLite[];
    const instBuckets = groupByPerson(instJobs, (j) => j.measured_by, instProfiles);
    const instMap: Record<string, { displayName: string; jobs: number; completed: number; totalDays: number; completedWithDays: number; jobIds: string[] }> = {};
    const nowMs2 = Date.now();
    instBuckets.forEach((bucket, key) => {
      instMap[key] = { displayName: bucket.displayName, jobs: 0, completed: 0, totalDays: 0, completedWithDays: 0, jobIds: [] };
      bucket.items.forEach(j => {
        instMap[key].jobs++;
        instMap[key].jobIds.push(j.id);
        if (j.install_status === "completed") instMap[key].completed++;
        if (j.install_scheduled_at) {
          const days = Math.max(1, Math.floor((nowMs2 - new Date(j.install_scheduled_at).getTime()) / 86400000));
          if (j.install_status === "completed") {
            instMap[key].totalDays += days;
            instMap[key].completedWithDays++;
          }
        }
      });
    });
    // Count issues per installer
    const allInstJobIds = instJobs.map(j => j.id);
    let issueCountByJob: Record<string, number> = {};
    if (allInstJobIds.length > 0) {
      const { data: instRooms } = await supabase.from("rooms").select("id, measure_job_id").in("measure_job_id", allInstJobIds);
      const instRoomIds = (instRooms || []).map((r: any) => r.id);
      const roomToJob: Record<string, string> = {};
      (instRooms || []).forEach((r: any) => { roomToJob[r.id] = r.measure_job_id; });
      if (instRoomIds.length > 0) {
        const { data: instWins } = await supabase.from("windows").select("id, room_id").in("room_id", instRoomIds);
        const winToJob: Record<string, string> = {};
        (instWins || []).forEach((w: any) => { winToJob[w.id] = roomToJob[w.room_id]; });
        const winIds2 = (instWins || []).map((w: any) => w.id);
        if (winIds2.length > 0) {
          const { data: issData2 } = await supabase.from("install_issues").select("id, window_id").in("window_id", winIds2);
          (issData2 || []).forEach((iss: any) => {
            const jid = winToJob[iss.window_id];
            if (jid) issueCountByJob[jid] = (issueCountByJob[jid] || 0) + 1;
          });
        }
      }
    }
    const instArr = Object.values(instMap).map((data) => {
      const issues = data.jobIds.reduce((sum, jid) => sum + (issueCountByJob[jid] || 0), 0);
      const avgDays = data.completedWithDays > 0 ? Math.round(data.totalDays / data.completedWithDays) : 0;
      return { name: data.displayName, jobs: data.jobs, completed: data.completed, issues, avgDays };
    }).sort((a, b) => b.jobs - a.jobs);
    setInstallerStats(instArr);

    // ── Phase 11: Revenue Forecast ────────────────────────
    // Simple linear trend from last 3 months
    if (sortedMonths.length >= 2) {
      const recent = sortedMonths.slice(-3);
      const revenues = recent.map(mo => monthMap[mo]?.revenue || 0);
      const avgRecent = revenues.reduce((s, r) => s + r, 0) / revenues.length;
      const first = revenues[0];
      const last = revenues[revenues.length - 1];
      const trend = last > first * 1.05 ? "up" as const : last < first * 0.95 ? "down" as const : "flat" as const;
      // Next month label
      const lastMo = sortedMonths[sortedMonths.length - 1];
      const [yr2, mn2] = lastMo.split("-").map(Number);
      const nextDate = new Date(yr2, mn2); // mn2 is already 1-based so this gives next month
      const nextLabel = nextDate.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
      // Project with simple momentum
      const growth = revenues.length >= 2 ? (revenues[revenues.length - 1] - revenues[0]) / (revenues.length - 1) : 0;
      const projected = Math.max(0, Math.round(avgRecent + growth));
      setForecast({ nextMonth: nextLabel, projected, trend });
    } else {
      setForecast(null);
    }

    // ── Phase 11: Re-measure / Rework Rate ────────────────
    const { data: allMJobs } = await supabase
      .from("measure_jobs")
      .select("id, install_mode, install_status")
      .eq("install_mode", true);
    const allInstall = (allMJobs || []) as { id: string; install_mode: boolean; install_status: string | null }[];
    const reworkJobs = allInstall.filter(j => j.install_status === "needs_rework");
    const reworkRate = allInstall.length > 0 ? Math.round((reworkJobs.length / allInstall.length) * 100) : 0;
    setReMeasureRate({ total: allInstall.length, rework: reworkJobs.length, rate: reworkRate });

    } catch (err) {
      console.error("loadCrmStats error:", err);
    } finally {
      setCrmLoading(false);
    }
  }

  async function exportCSV() {
    const { data: custs } = await supabase.from("customers")
      .select("first_name, last_name, phone, email, lead_status, heat_score, lead_source, address, created_at")
      .order("created_at", { ascending: false });
    if (!custs || custs.length === 0) { alert("No customers to export."); return; }

    const header = ["First Name","Last Name","Phone","Email","Status","Heat","Source","Address","Created"];
    const rows = custs.map((c: any) => {
      const addr = c.address ? c.address.replace(/\|/g, ", ") : "";
      return [c.first_name ?? "", c.last_name ?? "", c.phone ?? "", c.email ?? "", c.lead_status ?? "", c.heat_score ?? "", c.lead_source ?? "", addr, c.created_at?.slice(0,10) ?? ""];
    });
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `zeroremake-customers-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  async function loadJobCosts() {
    if (jobCosts.length > 0) { setShowJobCost(!showJobCost); return; }
    setJobCostLoading(true);
    setShowJobCost(true);

    // 1. Load all approved quotes with cost data
    const { data: qData } = await supabase
      .from("quotes")
      .select("id, customer_id, title, total, cost_total, status, created_at")
      .eq("status", "approved")
      .gt("total", 0)
      .order("created_at", { ascending: false })
      .limit(100);
    const quotes2 = (qData || []) as { id: string; customer_id: string; title: string | null; total: number; cost_total: number; status: string; created_at: string }[];
    if (quotes2.length === 0) { setJobCostLoading(false); return; }

    // 2. Load customer names
    const custIds = [...new Set(quotes2.map(q => q.customer_id))];
    const { data: custData } = await supabase.from("customers").select("id, first_name, last_name").in("id", custIds);
    const custMap: Record<string, string> = {};
    (custData || []).forEach((c: any) => { custMap[c.id] = [c.first_name, c.last_name].filter(Boolean).join(" "); });

    // 3. Load pay entries linked to these quotes (commissions)
    const quoteIds = quotes2.map(q => q.id);
    const { data: commData } = await supabase
      .from("pay_entries")
      .select("quote_id, amount, entry_type")
      .in("quote_id", quoteIds);
    const commByQuote: Record<string, number> = {};
    (commData || []).forEach((e: any) => {
      if (e.entry_type === "commission") {
        commByQuote[e.quote_id] = (commByQuote[e.quote_id] || 0) + (e.amount || 0);
      }
    });

    // 4. Load pay entries linked to install jobs
    const { data: installLinks } = await supabase
      .from("quotes")
      .select("id, install_job_id")
      .in("id", quoteIds)
      .not("install_job_id", "is", null);
    const jobIdToQuoteId: Record<string, string> = {};
    (installLinks || []).forEach((q: any) => {
      if (q.install_job_id) jobIdToQuoteId[q.install_job_id] = q.id;
    });
    const installJobIds = Object.keys(jobIdToQuoteId);
    let laborByQuote: Record<string, number> = {};
    if (installJobIds.length > 0) {
      const { data: laborData } = await supabase
        .from("pay_entries")
        .select("job_id, amount, entry_type")
        .in("job_id", installJobIds)
        .eq("entry_type", "job");
      (laborData || []).forEach((e: any) => {
        const qid = jobIdToQuoteId[e.job_id];
        if (qid) laborByQuote[qid] = (laborByQuote[qid] || 0) + (e.amount || 0);
      });
    }

    // 5. Load invoices for collection data
    const { data: invData } = await supabase
      .from("invoices")
      .select("quote_id, amount_paid, status")
      .in("quote_id", quoteIds);
    const collectedByQuote: Record<string, number> = {};
    (invData || []).forEach((inv: any) => {
      if (inv.quote_id) collectedByQuote[inv.quote_id] = (collectedByQuote[inv.quote_id] || 0) + (inv.amount_paid || 0);
    });

    // 6. Build rows
    const rows: JobCostRow[] = quotes2.map(q => {
      const materialCost = q.cost_total || 0;
      const commissionCost = commByQuote[q.id] || 0;
      const laborCost = laborByQuote[q.id] || 0;
      const totalCost = materialCost + commissionCost + laborCost;
      const grossProfit = q.total - totalCost;
      const margin = q.total > 0 ? Math.round((grossProfit / q.total) * 100) : 0;
      const collected = collectedByQuote[q.id] || 0;

      // Determine status
      let status = "Sold";
      if (collected >= q.total) status = "Paid";
      else if (collected > 0) status = "Partial";
      else if (installJobIds.some(jid => jobIdToQuoteId[jid] === q.id)) status = "Installing";

      return {
        quoteId: q.id,
        title: q.title || "Untitled",
        customerName: custMap[q.customer_id] || "Unknown",
        saleAmount: q.total,
        materialCost,
        laborCost,
        commissionCost,
        totalCost,
        grossProfit,
        margin,
        collected,
        status,
      };
    });

    setJobCosts(rows);
    setJobCostLoading(false);
  }

  function exportJobCostCSV() {
    if (jobCosts.length === 0) return;
    const headers = ["Customer","Job Title","Sale Amount","Material Cost","Labor Cost","Commission","Total Cost","Gross Profit","Margin %","Collected","Status"];
    const rows = jobCosts.map(r => [
      `"${r.customerName}"`,
      `"${r.title}"`,
      r.saleAmount.toFixed(2),
      r.materialCost.toFixed(2),
      r.laborCost.toFixed(2),
      r.commissionCost.toFixed(2),
      r.totalCost.toFixed(2),
      r.grossProfit.toFixed(2),
      r.margin + "%",
      r.collected.toFixed(2),
      r.status,
    ]);

    const totals = jobCosts.reduce((acc, r) => ({
      sale: acc.sale + r.saleAmount,
      mat: acc.mat + r.materialCost,
      labor: acc.labor + r.laborCost,
      comm: acc.comm + r.commissionCost,
      cost: acc.cost + r.totalCost,
      profit: acc.profit + r.grossProfit,
      collected: acc.collected + r.collected,
    }), { sale: 0, mat: 0, labor: 0, comm: 0, cost: 0, profit: 0, collected: 0 });

    let csv = "JOB COSTING REPORT\n";
    csv += `Generated: ${new Date().toLocaleDateString()}\n\n`;
    csv += headers.join(",") + "\n";
    csv += rows.map(r => r.join(",")).join("\n");
    csv += `\n\n,TOTALS,${totals.sale.toFixed(2)},${totals.mat.toFixed(2)},${totals.labor.toFixed(2)},${totals.comm.toFixed(2)},${totals.cost.toFixed(2)},${totals.profit.toFixed(2)},${totals.sale > 0 ? Math.round((totals.profit / totals.sale) * 100) : 0}%,${totals.collected.toFixed(2)},\n`;

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `job-costing-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  function toggleIssueExpand(issueType: string) {
    setIssueStats((prev) => prev.map((s) => s.issue_type === issueType ? { ...s, expanded: !s.expanded } : s));
  }

  const installPct = installTotal > 0 ? Math.round((installComplete / installTotal) * 100) : null;

  return (
    <FeatureGate require="analytics">
      <PermissionGate require="view_reports">
        <main style={{ background: "var(--zr-canvas)", color: "var(--zr-text-primary)" }} className="min-h-screen pt-2 pb-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        {/* iOS-style back row */}
        <div className="mb-3">
          <Link href="/" style={{ color: "var(--zr-orange)", display: "inline-flex", alignItems: "center", gap: 2, fontSize: "15px", fontWeight: 400, letterSpacing: "-0.012em" }}
            className="transition-opacity active:opacity-60">
            <svg width="10" height="16" viewBox="0 0 10 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginRight: 2 }}>
              <path d="M8 1 L2 8 L8 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Home
          </Link>
        </div>

        {/* Title */}
        <div className="mb-3 px-1">
          <h1 style={{ fontSize: "28px", fontWeight: 700, letterSpacing: "-0.025em", color: "var(--zr-text-primary)" }}>Analytics</h1>
        </div>

        {/* Combined filter row — segmented control + Export on the same line */}
        <div className="mb-5 flex items-center gap-3">
          <div className="flex-1 grid grid-cols-3 p-1 rounded-full"
            style={{ background: "var(--zr-surface-3)" }}>
            {(["week", "month", "all"] as const).map((r) => (
              <button key={r} onClick={() => setRange(r)}
                className="py-1.5 text-[13px] font-semibold rounded-full transition-all"
                style={range === r
                  ? { background: "var(--zr-surface-1)", color: "var(--zr-text-primary)", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }
                  : { background: "transparent", color: "var(--zr-text-secondary)" }}>
                {r === "week" ? "7d" : r === "month" ? "30d" : "All"}
              </button>
            ))}
          </div>
          <button onClick={exportCSV}
            style={{ color: "var(--zr-orange)", fontSize: "14px", fontWeight: 500, letterSpacing: "-0.012em", flexShrink: 0 }}
            className="transition-opacity active:opacity-60">
            Export
          </button>
        </div>

        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "12px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "12px" }}>
              {[1,2,3,4,5].map(i => (
                <div key={i} style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)", borderRadius: "var(--zr-radius-sm)", padding: "16px", textAlign: "center" }}>
                  <div className="zr-skeleton" style={{ width: "50%", height: "24px", margin: "0 auto", borderRadius: "var(--zr-radius-sm)" }} />
                  <div style={{ height: 8 }} />
                  <div className="zr-skeleton" style={{ width: "70%", height: "12px", margin: "0 auto", borderRadius: "var(--zr-radius-sm)" }} />
                </div>
              ))}
            </div>
            <div className="zr-skeleton" style={{ width: "100%", height: "200px", borderRadius: "var(--zr-radius-md)" }} />
          </div>
        ) : (
          <>
            {/* Operations — calm muted section label, no divider line */}
            <div className="mb-2 px-5">
              <span className="zr-v2-section-label" style={{ padding: 0 }}>Operations</span>
            </div>

            {/* Canvas stat grid — transparent cells, no borders. Matches
                the dashboard Operations widget language. Accent color is
                applied only to the number, and only when it carries
                meaning (green = done, blue = scheduled, red = issues). */}
            <div className="mb-6 grid grid-cols-2 gap-1 sm:grid-cols-3 px-3">
              {[
                { key: "measures_to_schedule", label: "Measures to schedule", count: measuresToSchedule, accent: "var(--zr-text-primary)" },
                { key: "measures_done",         label: "Measures done",         count: measuresDone,        accent: "var(--zr-success)" },
                { key: "installs_to_schedule",  label: "Installs to schedule",  count: installsToSchedule,  accent: "var(--zr-text-primary)" },
                { key: "installs_scheduled",    label: "Installs scheduled",    count: installsScheduled,   accent: "var(--zr-info)" },
                { key: "issues",                label: "Open issues",           count: openIssues,          accent: openIssues > 0 ? "#c6443a" : "var(--zr-text-primary)" },
              ].map(({ key, label, count, accent }) => (
                <Link key={key} href={`/jobs?filter=${key}`}
                  className="block text-left transition-opacity active:opacity-60"
                  style={{
                    padding: "14px 16px",
                    borderRadius: 14,
                    background: "transparent",
                    WebkitTapHighlightColor: "transparent",
                  }}>
                  <div style={{
                    fontSize: "28px", fontWeight: 700, letterSpacing: "-0.025em",
                    color: accent,
                    lineHeight: 1,
                    fontVariantNumeric: "tabular-nums",
                  }}>{count}</div>
                  <div style={{
                    color: "rgba(60,60,67,0.6)",
                    fontSize: "13px",
                    marginTop: "8px",
                    fontWeight: 500,
                    letterSpacing: "-0.005em",
                    lineHeight: 1.25,
                  }}>{label}</div>
                </Link>
              ))}
            </div>

            {/* Install completion — no card, just a calm progress row on canvas */}
            {installTotal > 0 && (
              <div className="mb-6 px-5">
                <div className="mb-2 flex items-center justify-between">
                  <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--zr-text-primary)", letterSpacing: "-0.012em" }}>Install completion</span>
                  <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--zr-success)", fontVariantNumeric: "tabular-nums" }}>{installPct}%</span>
                </div>
                <div style={{ height: 6, width: "100%", borderRadius: 3, background: "rgba(60,60,67,0.08)", overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 3, background: "var(--zr-success)", width: `${installPct}%`, transition: "width 300ms ease" }} />
                </div>
                <div style={{ marginTop: 6, fontSize: "12.5px", color: "rgba(60,60,67,0.55)", letterSpacing: "-0.005em" }}>
                  {installComplete} of {installTotal} windows complete · {installIssueCount} issues
                </div>
              </div>
            )}

            {/* Issue breakdown — no card, calm rows on canvas */}
            {issueStats.length > 0 && (
              <div className="mb-6">
                <div className="mb-2 px-5">
                  <span className="zr-v2-section-label" style={{ padding: 0 }}>Issues by type</span>
                </div>
                <div className="px-5" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {issueStats.map((s) => (
                    <div key={s.issue_type}>
                      <button type="button" onClick={() => toggleIssueExpand(s.issue_type)}
                        className="flex w-full items-center gap-3 transition-opacity active:opacity-60"
                        style={{ padding: "6px 0", WebkitTapHighlightColor: "transparent" }}>
                        <div style={{
                          width: 120, flexShrink: 0,
                          fontSize: "14px",
                          color: "var(--zr-text-primary)",
                          letterSpacing: "-0.01em",
                          textAlign: "left",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}>{s.issue_type}</div>
                        <div style={{ flex: 1, height: 6, borderRadius: 3, background: "rgba(60,60,67,0.08)", overflow: "hidden" }}>
                          <div style={{ height: "100%", borderRadius: 3, background: "rgba(214,68,58,0.55)", width: `${Math.min(100, (s.count / issueStats[0].count) * 100)}%`, transition: "width 300ms ease" }} />
                        </div>
                        <div style={{ width: 28, textAlign: "right", fontSize: "14px", fontWeight: 600, color: "var(--zr-text-primary)", fontVariantNumeric: "tabular-nums" }}>{s.count}</div>
                        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" style={{ color: "rgba(60,60,67,0.4)", transform: s.expanded ? "rotate(180deg)" : "none", transition: "transform 150ms ease" }}>
                          <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>

                      {s.expanded && (
                        <div style={{ marginTop: 4, paddingLeft: 0 }}>
                          {s.jobs.map((j, i) => (
                            <Link key={i} href={`/measure-jobs/${j.job_id}`}
                              style={{
                                display: "block",
                                padding: "10px 0 10px 12px",
                                textDecoration: "none",
                                borderLeft: "2px solid rgba(60,60,67,0.1)",
                                marginLeft: 4,
                              }}
                              className="transition-opacity active:opacity-60">
                              <div style={{ fontSize: "14px", fontWeight: 500, color: "var(--zr-orange)", letterSpacing: "-0.012em" }}>{j.job_title}</div>
                              <div style={{ fontSize: "13px", color: "rgba(60,60,67,0.55)", marginTop: 2 }}>{j.customer_name} · {j.room_name} · {j.window_label}</div>
                              {j.notes && <div style={{ marginTop: 4, fontSize: "12.5px", color: "rgba(60,60,67,0.45)", fontStyle: "italic" }}>&ldquo;{j.notes}&rdquo;</div>}
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Per measurer */}
            {measurerStats.length > 0 && (
              <div className="mb-6 rounded border p-4">
                <h2 className="mb-3 font-semibold">By Measurer</h2>
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-xs text-gray-500"><th className="pb-2">Name</th><th className="pb-2 text-right">Jobs</th><th className="pb-2 text-right">Windows</th></tr></thead>
                  <tbody>
                    {measurerStats.map((m) => (
                      <tr key={m.name} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="py-2">
                          <Link href={`/jobs?measurer=${encodeURIComponent(m.name)}`}
                            className="text-blue-600 hover:underline">
                            {m.name}
                          </Link>
                        </td>
                        <td className="py-2 text-right">{m.jobs}</td>
                        <td className="py-2 text-right">{m.windows}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── CRM Section ──────────────────────────── */}
            <div className="mb-2 mt-8 flex items-center gap-3">
              <h2 className="text-lg font-bold">CRM</h2>
              <div className="flex-1 border-t border-gray-200" />
            </div>

            {crmLoading ? <p className="mb-6 text-sm text-gray-400">Loading CRM data...</p> : (
              <>
                {/* ── Revenue summary ── */}
                <div className="mb-4 grid grid-cols-3 gap-3">
                  <div style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }} className="rounded p-3 text-center">
                    <div className="text-xl font-bold text-green-600">
                      ${totalRevenue >= 1000 ? (totalRevenue / 1000).toFixed(1) + "k" : totalRevenue.toFixed(0)}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">Revenue</div>
                    <div className="text-xs text-gray-400">(approved quotes)</div>
                  </div>
                  <div style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }} className="rounded p-3 text-center">
                    <div className="text-xl font-bold text-blue-600">
                      ${pipelineTotal >= 1000 ? (pipelineTotal / 1000).toFixed(1) + "k" : pipelineTotal.toFixed(0)}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">In Pipeline</div>
                    <div className="text-xs text-gray-400">(sent / draft quotes)</div>
                  </div>
                  <div style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }} className="rounded p-3 text-center">
                    <div className="text-xl font-bold text-gray-700">
                      ${avgDealSize >= 1000 ? (avgDealSize / 1000).toFixed(1) + "k" : avgDealSize.toFixed(0)}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">Avg Deal</div>
                    <div className="text-xs text-gray-400">(closed jobs)</div>
                  </div>
                </div>

                {/* ── P&L monthly breakdown ── */}
                {monthlyPL.length > 0 && (
                  <div className="mb-4 rounded border overflow-hidden">
                    <div className="px-3 py-2 border-b bg-gray-50 flex items-center justify-between">
                      <h3 className="font-semibold text-sm">P&amp;L by Month</h3>
                      <span className="text-xs text-gray-400">closed jobs only</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b bg-gray-50 text-gray-500">
                            <th className="text-left px-3 py-2">Month</th>
                            <th className="text-right px-3 py-2">Revenue</th>
                            <th className="text-right px-3 py-2">COGS</th>
                            <th className="text-right px-3 py-2">Gross Profit</th>
                            <th className="text-right px-3 py-2">Margin</th>
                            <th className="text-right px-3 py-2">Jobs</th>
                          </tr>
                        </thead>
                        <tbody>
                          {monthlyPL.map((row, i) => (
                            <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                              <td className="px-3 py-2 font-medium">{row.month}</td>
                              <td className="px-3 py-2 text-right text-green-700">${row.revenue.toFixed(0)}</td>
                              <td className="px-3 py-2 text-right text-gray-500">${row.cost.toFixed(0)}</td>
                              <td className="px-3 py-2 text-right font-semibold">${row.profit.toFixed(0)}</td>
                              <td className={`px-3 py-2 text-right font-semibold ${row.margin >= 55 ? "text-green-600" : row.margin >= 40 ? "text-amber-600" : "text-red-500"}`}>
                                {row.margin}%
                              </td>
                              <td className="px-3 py-2 text-right text-gray-500">{row.deals}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="border-t bg-gray-50 font-semibold">
                          <tr>
                            <td className="px-3 py-2">Total</td>
                            <td className="px-3 py-2 text-right text-green-700">${monthlyPL.reduce((s, r) => s + r.revenue, 0).toFixed(0)}</td>
                            <td className="px-3 py-2 text-right text-gray-500">${monthlyPL.reduce((s, r) => s + r.cost, 0).toFixed(0)}</td>
                            <td className="px-3 py-2 text-right">${monthlyPL.reduce((s, r) => s + r.profit, 0).toFixed(0)}</td>
                            <td className="px-3 py-2 text-right">
                              {(() => { const rev = monthlyPL.reduce((s, r) => s + r.revenue, 0); const prof = monthlyPL.reduce((s, r) => s + r.profit, 0); return rev > 0 ? Math.round((prof / rev) * 100) + "%" : "—"; })()}
                            </td>
                            <td className="px-3 py-2 text-right text-gray-500">{monthlyPL.reduce((s, r) => s + r.deals, 0)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}

                {/* ── Advanced Analytics Section ─────────── */}
                <div className="mb-4 mt-8 flex items-center gap-3">
                  <h2 className="text-lg font-bold">Advanced Analytics</h2>
                  <div style={{ borderTop: "1px solid var(--zr-border)" }} className="flex-1" />
                </div>

                {/* ── Revenue Forecast ── */}
                <div className="mb-4 rounded border p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-sm">Revenue Forecast</h3>
                    {forecast && (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                        forecast.trend === "up" ? "bg-green-100 text-green-700" :
                        forecast.trend === "down" ? "bg-red-100 text-red-700" :
                        "bg-gray-100 text-gray-600"
                      }`}>
                        {forecast.trend === "up" ? "↑ Trending Up" : forecast.trend === "down" ? "↓ Trending Down" : "→ Steady"}
                      </span>
                    )}
                  </div>
                  {forecast ? (
                    <>
                      <div className="flex items-end gap-2">
                        <div className="text-2xl font-bold text-green-600">
                          ${forecast.projected >= 1000 ? (forecast.projected / 1000).toFixed(1) + "k" : forecast.projected.toFixed(0)}
                        </div>
                        <div className="text-xs text-gray-500 mb-1">projected for {forecast.nextMonth}</div>
                      </div>
                      <p className="mt-1 text-xs text-gray-400">Based on {monthlyPL.length}-month average + trend momentum</p>
                    </>
                  ) : (
                    <p className="text-sm text-gray-400">Needs at least 2 months of closed deals to project revenue.</p>
                  )}
                </div>

                {/* ── Close Rate by Lead Source ── */}
                <div className="mb-4 rounded border overflow-hidden">
                  <div className="px-3 py-2 border-b bg-gray-50 flex items-center justify-between">
                    <h3 className="font-semibold text-sm">Close Rate by Lead Source</h3>
                    <span className="text-xs text-gray-400">all time</span>
                  </div>
                  {leadSourceStats.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b bg-gray-50 text-gray-500">
                            <th className="text-left px-3 py-2">Source</th>
                            <th className="text-right px-3 py-2">Leads</th>
                            <th className="text-right px-3 py-2">Sold</th>
                            <th className="text-right px-3 py-2">Close %</th>
                            <th className="text-right px-3 py-2">Revenue</th>
                          </tr>
                        </thead>
                        <tbody>
                          {leadSourceStats.map((s, i) => (
                            <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                              <td className="px-3 py-2 font-medium">{s.source}</td>
                              <td className="px-3 py-2 text-right text-gray-600">{s.total}</td>
                              <td className="px-3 py-2 text-right text-green-700">{s.sold}</td>
                              <td className="px-3 py-2 text-right">
                                <span className={`font-semibold ${s.rate >= 50 ? "text-green-600" : s.rate >= 25 ? "text-amber-600" : "text-red-500"}`}>
                                  {s.rate}%
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right text-green-700">
                                ${s.revenue >= 1000 ? (s.revenue / 1000).toFixed(1) + "k" : s.revenue.toFixed(0)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="px-3 py-4 text-sm text-gray-400">Set a lead source on your customers to see close rates by source.</p>
                  )}
                </div>

                {/* ── Installer Performance ── */}
                <div className="mb-4 rounded border overflow-hidden">
                  <div className="px-3 py-2 border-b bg-gray-50 flex items-center justify-between">
                    <h3 className="font-semibold text-sm">Installer Performance</h3>
                    <span className="text-xs text-gray-400">install jobs</span>
                  </div>
                  {installerStats.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b bg-gray-50 text-gray-500">
                            <th className="text-left px-3 py-2">Installer</th>
                            <th className="text-right px-3 py-2">Jobs</th>
                            <th className="text-right px-3 py-2">Done</th>
                            <th className="text-right px-3 py-2">Rate</th>
                            <th className="text-right px-3 py-2">Issues</th>
                            <th className="text-right px-3 py-2">Avg Days</th>
                          </tr>
                        </thead>
                        <tbody>
                          {installerStats.map((s, i) => {
                            const rate = s.jobs > 0 ? Math.round((s.completed / s.jobs) * 100) : 0;
                            return (
                              <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                                <td className="px-3 py-2 font-medium">{s.name}</td>
                                <td className="px-3 py-2 text-right text-gray-600">{s.jobs}</td>
                                <td className="px-3 py-2 text-right text-green-700">{s.completed}</td>
                                <td className={`px-3 py-2 text-right font-semibold ${rate >= 80 ? "text-green-600" : rate >= 50 ? "text-amber-600" : "text-red-500"}`}>
                                  {rate}%
                                </td>
                                <td className={`px-3 py-2 text-right ${s.issues > 0 ? "text-red-500 font-semibold" : "text-gray-400"}`}>
                                  {s.issues}
                                </td>
                                <td className="px-3 py-2 text-right text-gray-600">
                                  {s.avgDays > 0 ? `${s.avgDays}d` : "—"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="px-3 py-4 text-sm text-gray-400">No install jobs yet. Convert a quote to an install job to track installer performance.</p>
                  )}
                </div>

                {/* ── Measurement Accuracy / Rework Rate ── */}
                <div className="mb-4 rounded border p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-sm">Measurement Accuracy</h3>
                    {reMeasureRate && reMeasureRate.total > 0 && (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                        reMeasureRate.rate <= 5 ? "bg-green-100 text-green-700" :
                        reMeasureRate.rate <= 15 ? "bg-amber-100 text-amber-700" :
                        "bg-red-100 text-red-700"
                      }`}>
                        {100 - reMeasureRate.rate}% accurate
                      </span>
                    )}
                  </div>
                  {reMeasureRate && reMeasureRate.total > 0 ? (
                    <>
                      <div className="flex items-center gap-4">
                        <div className="flex-1">
                          <div className="h-4 w-full rounded bg-gray-100 overflow-hidden">
                            <div className="h-4 rounded bg-green-400" style={{ width: `${100 - reMeasureRate.rate}%` }} />
                          </div>
                        </div>
                        <div className="text-xs text-gray-500 shrink-0">
                          {reMeasureRate.rework} rework / {reMeasureRate.total} installs
                        </div>
                      </div>
                      <p className="mt-1 text-xs text-gray-400">
                        {reMeasureRate.rate <= 5 ? "Excellent — very few installs needing rework." :
                         reMeasureRate.rate <= 15 ? "Good — some rework needed, room to improve." :
                         "Needs attention — high rework rate indicates measurement issues."}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-gray-400">No install jobs yet. Accuracy tracking starts once installs are completed.</p>
                  )}
                </div>

                {/* ── Stage cards (clickable) ── */}
                <div className="mb-4 rounded border p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="font-semibold">Lead Pipeline</h3>
                    <span className="text-xs text-gray-400">{totalCustomers} total</span>
                  </div>
                  {(() => {
                    const STAGE_COLORS: Record<string, string> = {
                      New: "text-gray-700", Contacted: "text-blue-600", Scheduled: "text-purple-600",
                      Measured: "text-amber-700", Quoted: "text-orange-600", Sold: "text-green-600",
                      Installed: "text-emerald-600", Lost: "text-red-600",
                    };
                    return (
                      <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                        {stageStats.map(s => {
                          const active = selectedStage === s.stage;
                          return (
                            <Link key={s.stage} href={`/customers?stage=${encodeURIComponent(s.stage)}`}
                              onClick={(e) => { e.preventDefault(); setSelectedStage(active ? null : s.stage); }}
                              className={`rounded border p-2 text-center transition-colors block ${active ? "bg-black text-white border-black" : "hover:bg-gray-50"}`}>
                              <div className={`text-xl font-bold ${active ? "text-white" : STAGE_COLORS[s.stage] ?? "text-black"}`}>{s.count}</div>
                              <div className={`text-xs mt-0.5 ${active ? "text-gray-300" : "text-gray-500"}`}>{s.stage}</div>
                            </Link>
                          );
                        })}
                      </div>
                    );
                  })()}

                  {/* Stage drill-down */}
                  {selectedStage && (
                    <div className="mt-3 border-t pt-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-medium">{selectedStage}</span>
                        <button type="button" onClick={() => setSelectedStage(null)} className="text-xs text-gray-400">✕</button>
                      </div>
                      {analyticsCusts.filter(c => (c.lead_status || "New") === selectedStage).length === 0
                        ? <p className="text-sm text-gray-400">None.</p>
                        : (
                          <ul className="space-y-1 max-h-48 overflow-y-auto">
                            {analyticsCusts
                              .filter(c => (c.lead_status || "New") === selectedStage)
                              .map(c => {
                                const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unknown";
                                const days = c.last_activity_at
                                  ? Math.floor((Date.now() - new Date(c.last_activity_at).getTime()) / 86400000)
                                  : null;
                                return (
                                  <li key={c.id}>
                                    <Link href={`/customers/${c.id}`}
                                      className="flex items-center justify-between rounded border px-2 py-1.5 hover:bg-gray-50 text-sm gap-2">
                                      <span className="text-blue-600 font-medium truncate">{name}</span>
                                      <div className="flex items-center gap-2 shrink-0">
                                        {c.heat_score && (
                                          <span className={`text-xs rounded px-1.5 py-0.5 ${
                                            c.heat_score === "Hot" ? "bg-red-500 text-white" :
                                            c.heat_score === "Cold" ? "bg-sky-400 text-white" :
                                            "bg-amber-400 text-white"
                                          }`}>{c.heat_score}</span>
                                        )}
                                        {days !== null && <span className="text-xs text-gray-400">{days}d ago</span>}
                                      </div>
                                    </Link>
                                  </li>
                                );
                              })
                            }
                          </ul>
                        )
                      }
                    </div>
                  )}
                </div>

                {/* ── Conversion rates ── */}
                {conversionRates.length > 0 && (
                  <div className="mb-4 rounded border p-4">
                    <h3 className="font-semibold mb-3">Funnel Conversion</h3>
                    <div className="space-y-2">
                      {conversionRates.map(r => (
                        <div key={r.from + r.to} className="flex items-center gap-3">
                          <div className="w-36 shrink-0 text-xs text-gray-500">{r.from} → {r.to}</div>
                          <div className="flex-1 rounded bg-gray-100 h-5">
                            <div className={`h-5 rounded transition-all ${r.rate >= 60 ? "bg-green-400" : r.rate >= 30 ? "bg-amber-400" : "bg-red-300"}`}
                              style={{ width: `${Math.max(3, r.rate)}%` }} />
                          </div>
                          <div className={`w-10 text-right text-sm font-bold ${r.rate >= 60 ? "text-green-600" : r.rate >= 30 ? "text-amber-600" : "text-red-500"}`}>
                            {r.rate}%
                          </div>
                        </div>
                      ))}
                    </div>
                    {soldCount > 0 && totalCustomers > 0 && (
                      <div className="mt-3 text-xs text-gray-500 border-t pt-2">
                        Overall close rate: <span className="font-semibold text-green-600">{Math.round((soldCount / totalCustomers) * 100)}%</span>
                        <span className="ml-1">({soldCount} sold / {totalCustomers} total)</span>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Avg days stuck per stage ── */}
                {Object.keys(avgDaysByStage).length > 0 && (
                  <div className="mb-6 rounded border p-4">
                    <h3 className="font-semibold mb-3">Avg Days at Each Stage</h3>
                    <div className="space-y-1.5">
                      {stageStats.filter(s => s.count > 0).map(s => {
                        const days = avgDaysByStage[s.stage] ?? 0;
                        const warn = days > 14;
                        return (
                          <div key={s.stage} className="flex items-center gap-3 text-sm">
                            <div className="w-24 shrink-0 text-gray-600">{s.stage}</div>
                            <div className="flex-1 rounded bg-gray-100 h-4">
                              <div className={`h-4 rounded transition-all ${warn ? "bg-red-300" : "bg-blue-200"}`}
                                style={{ width: `${Math.min(100, Math.max(3, days * 2))}%` }} />
                            </div>
                            <div className={`w-16 text-right text-xs font-medium ${warn ? "text-red-600" : "text-gray-600"}`}>
                              {days}d avg {warn ? "⚠️" : ""}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <p className="mt-2 text-xs text-gray-400">Based on days since last activity. Red = over 14 days.</p>
                  </div>
                )}

                {/* Heat score + stuck leads — clickable */}
                <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    { label: "Hot",         count: hotCount,   color: "text-red-500",                href: "/customers?heat=Hot" },
                    { label: "Warm",        count: warmCount,  color: "text-amber-400",              href: "/customers?heat=Warm" },
                    { label: "Cold",        count: coldCount,  color: "text-sky-400",                href: "/customers?heat=Cold" },
                    { label: "Stuck Leads", count: stuckCount, color: stuckCount > 0 ? "text-amber-600" : "text-black", href: "/customers?filter=stuck" },
                  ].map(({ label, count, color, href }) => (
                    <Link key={label} href={href}
                      style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }}
                      className="rounded p-3 text-center hover:opacity-80 transition-opacity block">
                      <div className={`text-2xl font-bold ${color}`}>{count}</div>
                      <div className="mt-1 text-xs text-gray-500">{label}</div>
                      <div className="mt-0.5 text-xs text-blue-500">View →</div>
                    </Link>
                  ))}
                </div>

                {/* Outreach activity — clickable */}
                {activityTypeStats.length > 0 && (
                  <div className="mb-6 rounded border p-4">
                    <h3 className="mb-3 font-semibold">
                      Outreach Activity
                      <span className="ml-2 text-xs font-normal text-gray-400">
                        {range === "week" ? "last 7 days" : range === "month" ? "last 30 days" : "all time"}
                      </span>
                    </h3>
                    <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
                      {activityTypeStats.map((a) => {
                        const colors: Record<string, string> = {
                          Call: "text-green-600", Text: "text-blue-600",
                          Email: "text-purple-600", Note: "text-gray-600", Visit: "text-amber-600",
                        };
                        return (
                          <Link key={a.type} href={`/customers?activity=${a.type}`}
                            style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }}
                      className="rounded p-3 text-center hover:opacity-80 transition-opacity block">
                            <div className={`text-2xl font-bold ${colors[a.type] || "text-black"}`}>{a.count}</div>
                            <div className="mt-1 text-xs text-gray-500">{a.type}s</div>
                            <div className="mt-0.5 text-xs text-blue-500">View →</div>
                          </Link>
                        );
                      })}
                    </div>
                    <div className="mt-2 text-xs text-gray-400">
                      Total: {activityTypeStats.reduce((sum, a) => sum + a.count, 0)} touchpoints
                    </div>
                  </div>
                )}

                {activityTypeStats.length === 0 && (
                  <div className="mb-6 rounded border p-4 text-sm text-gray-400">
                    No outreach activity logged in this period yet.
                  </div>
                )}
              </>
            )}

            {/* ── JOB COSTING ── */}
            <div style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }} className="rounded p-4 mb-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold">Job Costing & Profitability</h2>
                <div className="flex gap-1.5">
                  {showJobCost && jobCosts.length > 0 && (
                    <button onClick={exportJobCostCSV}
                      className="text-xs rounded px-2 py-1" style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-secondary)" }}>
                      📤 Export CSV
                    </button>
                  )}
                  <button onClick={loadJobCosts}
                    className="text-xs rounded px-2.5 py-1 font-medium"
                    style={{ background: showJobCost ? "var(--zr-surface-2)" : "var(--zr-orange)", color: showJobCost ? "var(--zr-text-secondary)" : "#fff", border: showJobCost ? "1px solid var(--zr-border)" : "none" }}>
                    {jobCostLoading ? "Loading…" : showJobCost ? "Hide" : "Load Job Costs"}
                  </button>
                </div>
              </div>

              {!showJobCost && (
                <p className="text-sm" style={{ color: "var(--zr-text-muted)" }}>
                  See profit on every job — material cost + labor + commissions vs. sale price.
                </p>
              )}

              {showJobCost && jobCosts.length > 0 && (() => {
                const totals = jobCosts.reduce((acc, r) => ({
                  sale: acc.sale + r.saleAmount,
                  mat: acc.mat + r.materialCost,
                  labor: acc.labor + r.laborCost,
                  comm: acc.comm + r.commissionCost,
                  cost: acc.cost + r.totalCost,
                  profit: acc.profit + r.grossProfit,
                  collected: acc.collected + r.collected,
                }), { sale: 0, mat: 0, labor: 0, comm: 0, cost: 0, profit: 0, collected: 0 });
                const totalMargin = totals.sale > 0 ? Math.round((totals.profit / totals.sale) * 100) : 0;

                return (
                  <div>
                    {/* Summary cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                      <div className="rounded p-2.5 text-center" style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)" }}>
                        <div className="text-lg font-bold text-green-600">${totals.sale >= 1000 ? (totals.sale / 1000).toFixed(1) + "k" : totals.sale.toFixed(0)}</div>
                        <div className="text-[10px]" style={{ color: "var(--zr-text-muted)" }}>Total Sales</div>
                      </div>
                      <div className="rounded p-2.5 text-center" style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)" }}>
                        <div className="text-lg font-bold" style={{ color: "var(--zr-text-primary)" }}>${totals.cost >= 1000 ? (totals.cost / 1000).toFixed(1) + "k" : totals.cost.toFixed(0)}</div>
                        <div className="text-[10px]" style={{ color: "var(--zr-text-muted)" }}>Total Costs</div>
                      </div>
                      <div className="rounded p-2.5 text-center" style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)" }}>
                        <div className={`text-lg font-bold ${totals.profit >= 0 ? "text-green-600" : "text-red-600"}`}>${totals.profit >= 1000 ? (totals.profit / 1000).toFixed(1) + "k" : totals.profit.toFixed(0)}</div>
                        <div className="text-[10px]" style={{ color: "var(--zr-text-muted)" }}>Gross Profit</div>
                      </div>
                      <div className="rounded p-2.5 text-center" style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)" }}>
                        <div className={`text-lg font-bold ${totalMargin >= 30 ? "text-green-600" : totalMargin >= 15 ? "text-amber-600" : "text-red-600"}`}>{totalMargin}%</div>
                        <div className="text-[10px]" style={{ color: "var(--zr-text-muted)" }}>Avg Margin</div>
                      </div>
                    </div>

                    {/* Cost breakdown bar */}
                    {totals.cost > 0 && (
                      <div className="mb-4">
                        <div className="text-xs font-medium mb-1.5" style={{ color: "var(--zr-text-muted)" }}>COST BREAKDOWN</div>
                        <div className="flex rounded overflow-hidden h-5">
                          {totals.mat > 0 && <div style={{ width: `${(totals.mat / totals.cost) * 100}%`, background: "#60a5fa" }} className="flex items-center justify-center text-[9px] text-white font-medium">Materials</div>}
                          {totals.labor > 0 && <div style={{ width: `${(totals.labor / totals.cost) * 100}%`, background: "#f59e0b" }} className="flex items-center justify-center text-[9px] text-white font-medium">Labor</div>}
                          {totals.comm > 0 && <div style={{ width: `${(totals.comm / totals.cost) * 100}%`, background: "#a78bfa" }} className="flex items-center justify-center text-[9px] text-white font-medium">Commission</div>}
                        </div>
                        <div className="flex gap-4 mt-1.5">
                          <span className="text-[10px]" style={{ color: "var(--zr-text-muted)" }}><span className="inline-block w-2 h-2 rounded-full bg-blue-400 mr-1" />Materials: ${totals.mat.toFixed(0)}</span>
                          <span className="text-[10px]" style={{ color: "var(--zr-text-muted)" }}><span className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-1" />Labor: ${totals.labor.toFixed(0)}</span>
                          <span className="text-[10px]" style={{ color: "var(--zr-text-muted)" }}><span className="inline-block w-2 h-2 rounded-full bg-purple-400 mr-1" />Commissions: ${totals.comm.toFixed(0)}</span>
                        </div>
                      </div>
                    )}

                    {/* Job table */}
                    <div className="overflow-x-auto -mx-4 px-4">
                      <table className="w-full text-xs">
                        <thead>
                          <tr style={{ borderBottom: "1px solid var(--zr-border)" }}>
                            <th className="text-left py-2 pr-2 font-medium" style={{ color: "var(--zr-text-muted)" }}>Customer / Job</th>
                            <th className="text-right py-2 px-1 font-medium" style={{ color: "var(--zr-text-muted)" }}>Sale</th>
                            <th className="text-right py-2 px-1 font-medium" style={{ color: "var(--zr-text-muted)" }}>Cost</th>
                            <th className="text-right py-2 px-1 font-medium" style={{ color: "var(--zr-text-muted)" }}>Profit</th>
                            <th className="text-right py-2 px-1 font-medium" style={{ color: "var(--zr-text-muted)" }}>%</th>
                            <th className="text-right py-2 pl-1 font-medium" style={{ color: "var(--zr-text-muted)" }}>Collected</th>
                          </tr>
                        </thead>
                        <tbody>
                          {jobCosts.map(r => (
                            <tr key={r.quoteId} style={{ borderBottom: "1px solid var(--zr-border)" }} className="hover:opacity-80">
                              <td className="py-2 pr-2">
                                <Link href={`/quotes/${r.quoteId}`} className="text-blue-600 hover:underline font-medium">{r.customerName}</Link>
                                <div style={{ color: "var(--zr-text-muted)" }}>{r.title}</div>
                              </td>
                              <td className="py-2 px-1 text-right text-green-700">${r.saleAmount.toFixed(0)}</td>
                              <td className="py-2 px-1 text-right" style={{ color: "var(--zr-text-secondary)" }}>
                                ${r.totalCost.toFixed(0)}
                                {(r.laborCost > 0 || r.commissionCost > 0) && (
                                  <div style={{ color: "var(--zr-text-muted)", fontSize: "9px" }}>
                                    {r.materialCost > 0 ? `M:$${r.materialCost.toFixed(0)}` : ""}
                                    {r.laborCost > 0 ? ` L:$${r.laborCost.toFixed(0)}` : ""}
                                    {r.commissionCost > 0 ? ` C:$${r.commissionCost.toFixed(0)}` : ""}
                                  </div>
                                )}
                              </td>
                              <td className={`py-2 px-1 text-right font-medium ${r.grossProfit >= 0 ? "text-green-700" : "text-red-600"}`}>
                                ${r.grossProfit.toFixed(0)}
                              </td>
                              <td className={`py-2 px-1 text-right ${r.margin >= 30 ? "text-green-700" : r.margin >= 15 ? "text-amber-600" : "text-red-600"}`}>
                                {r.margin}%
                              </td>
                              <td className={`py-2 pl-1 text-right ${r.collected >= r.saleAmount ? "text-green-700" : r.collected > 0 ? "text-amber-600" : ""}`} style={{ color: r.collected === 0 ? "var(--zr-text-muted)" : undefined }}>
                                ${r.collected.toFixed(0)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}

              {showJobCost && jobCosts.length === 0 && !jobCostLoading && (
                <p className="text-sm text-center py-4" style={{ color: "var(--zr-text-muted)" }}>No approved quotes with pricing data found.</p>
              )}
            </div>

            {/* Recent jobs */}
            <div style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }} className="rounded p-4">
              <h2 className="mb-3 font-semibold">Recent Jobs</h2>
              {jobs.length === 0 ? <p className="text-sm text-gray-500">No jobs in this period.</p> : (
                <ul className="space-y-2">
                  {jobs.slice(0, 10).map((j) => (
                    <li key={j.id} className="flex items-center justify-between text-sm">
                      <div>
                        <Link href={`/measure-jobs/${j.id}`} className="text-blue-600 hover:underline">{j.title}</Link>
                        <span className={`ml-2 rounded px-1.5 py-0.5 text-xs ${j.install_mode ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}`}>
                          {j.install_mode ? "Install" : "Measure"}
                        </span>
                      </div>
                      <span className="text-xs text-gray-400">{j.measured_by || "—"} · {(j.scheduled_at || j.created_at).slice(0, 10)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
        </div>
      </main>
      </PermissionGate>
    </FeatureGate>
  );
}
