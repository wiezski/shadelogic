"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

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

  useEffect(() => { loadStats(); loadCrmStats(); }, [range]);

  async function loadStats() {
    setLoading(true);
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

    // Measurer stats
    const measMap: Record<string, { jobs: number; jobIds: string[] }> = {};
    loadedJobs.forEach((j) => {
      const name = j.measured_by || "Unassigned";
      if (!measMap[name]) measMap[name] = { jobs: 0, jobIds: [] };
      measMap[name].jobs++;
      measMap[name].jobIds.push(j.id);
    });
    const measStats: MeasurerStat[] = await Promise.all(
      Object.entries(measMap).map(async ([name, { jobs: jobCount, jobIds: mJobIds }]) => {
        const { data: mRooms } = await supabase.from("rooms").select("id").in("measure_job_id", mJobIds);
        const mRoomIds = (mRooms || []).map((r: { id: string }) => r.id);
        let winCount = 0;
        if (mRoomIds.length > 0) {
          const { count } = await supabase.from("windows").select("id", { count: "exact", head: true }).in("room_id", mRoomIds);
          winCount = count || 0;
        }
        return { name, jobs: jobCount, windows: winCount };
      })
    );
    setMeasurerStats(measStats.sort((a, b) => b.jobs - a.jobs));
    setLoading(false);
  }

  async function loadCrmStats() {
    setCrmLoading(true);

    // All customers — pipeline + heat (always all-time, current state)
    const { data: custData } = await supabase
      .from("customers")
      .select("id, first_name, last_name, lead_status, heat_score, last_activity_at, created_at");
    const customers = (custData || []) as { id: string; first_name: string | null; last_name: string | null; lead_status: string | null; heat_score: string | null; last_activity_at: string | null; created_at: string }[];
    setTotalCustomers(customers.length);
    setAnalyticsCusts(customers);

    // Pipeline funnel
    const STAGES = ["New", "Contacted", "Scheduled", "Measured", "Quoted", "Sold", "Installed", "Lost"];
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

    setCrmLoading(false);
  }

  function toggleIssueExpand(issueType: string) {
    setIssueStats((prev) => prev.map((s) => s.issue_type === issueType ? { ...s, expanded: !s.expanded } : s));
  }

  const installPct = installTotal > 0 ? Math.round((installComplete / installTotal) * 100) : null;

  return (
    <main className="min-h-screen bg-white p-6 text-black">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="mb-4 inline-block text-blue-600 hover:underline">← Back</Link>

        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Analytics</h1>
          <div className="flex gap-1 rounded border overflow-hidden">
            {(["week", "month", "all"] as const).map((r) => (
              <button key={r} onClick={() => setRange(r)} className={`px-3 py-1 text-sm ${range === r ? "bg-black text-white" : "bg-white text-black"}`}>
                {r === "week" ? "7 days" : r === "month" ? "30 days" : "All time"}
              </button>
            ))}
          </div>
        </div>

        {loading ? <p className="text-gray-500">Loading...</p> : (
          <>
            {/* ── Operations Section ───────────────────── */}
            <div className="mb-4 flex items-center gap-3">
              <h2 className="text-lg font-bold">Operations</h2>
              <div className="flex-1 border-t border-gray-200" />
            </div>

            {/* Top stats — clickable → /jobs?filter=... */}
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[
                { key: "measures_to_schedule", label: "Measures to Schedule", count: measuresToSchedule, color: "text-black" },
                { key: "measures_done",         label: "Measures Done",         count: measuresDone,        color: "text-green-600" },
                { key: "installs_to_schedule",  label: "Installs to Schedule",  count: installsToSchedule,  color: "text-black" },
                { key: "installs_scheduled",    label: "Installs Scheduled",    count: installsScheduled,   color: "text-blue-600" },
                { key: "issues",                label: "Open Issues",           count: openIssues,          color: openIssues > 0 ? "text-red-600" : "text-black" },
              ].map(({ key, label, count, color }) => (
                <Link key={key} href={`/jobs?filter=${key}`}
                  className="rounded border p-4 text-center hover:bg-gray-50 transition-colors block">
                  <div className={`text-3xl font-bold ${color}`}>{count}</div>
                  <div className="mt-1 text-xs text-gray-500">{label}</div>
                  <div className="mt-1 text-xs text-blue-500">View all →</div>
                </Link>
              ))}
            </div>

            {/* Install completion % */}
            {installTotal > 0 && (
              <div className="mb-6 rounded border p-4">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-semibold">Install Completion</span>
                  <span className="font-bold text-green-600">{installPct}%</span>
                </div>
                <div className="h-3 w-full rounded bg-gray-200">
                  <div className="h-3 rounded bg-green-500 transition-all" style={{ width: `${installPct}%` }} />
                </div>
                <div className="mt-1 text-xs text-gray-500">{installComplete} of {installTotal} windows complete · {installIssueCount} issues</div>
              </div>
            )}

            {/* Issue breakdown — clickable drill-down */}
            {issueStats.length > 0 && (
              <div className="mb-6 rounded border p-4">
                <h2 className="mb-3 font-semibold">Issues by Type <span className="text-xs font-normal text-gray-400">(tap to see jobs)</span></h2>
                <div className="space-y-2">
                  {issueStats.map((s) => (
                    <div key={s.issue_type}>
                      <button type="button" onClick={() => toggleIssueExpand(s.issue_type)} className="flex w-full items-center gap-2 rounded p-1 hover:bg-gray-50">
                        <div className="w-36 truncate text-left text-sm">{s.issue_type}</div>
                        <div className="flex-1 rounded bg-gray-100">
                          <div className="h-4 rounded bg-red-400" style={{ width: `${Math.min(100, (s.count / issueStats[0].count) * 100)}%` }} />
                        </div>
                        <div className="w-6 text-right text-sm font-medium">{s.count}</div>
                        <div className="text-xs text-gray-400">{s.expanded ? "▲" : "▼"}</div>
                      </button>

                      {s.expanded && (
                        <div className="ml-2 mt-1 rounded border bg-gray-50 p-2">
                          {s.jobs.map((j, i) => (
                            <Link key={i} href={`/measure-jobs/${j.job_id}`} className="block rounded p-2 hover:bg-white">
                              <div className="text-sm font-medium text-blue-600">{j.job_title}</div>
                              <div className="text-xs text-gray-500">{j.customer_name} · {j.room_name} · {j.window_label}</div>
                              {j.notes && <div className="mt-0.5 text-xs text-gray-400 italic">"{j.notes}"</div>}
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
                            <button key={s.stage} type="button"
                              onClick={() => setSelectedStage(active ? null : s.stage)}
                              className={`rounded border p-2 text-center transition-colors ${active ? "bg-black text-white border-black" : "hover:bg-gray-50"}`}>
                              <div className={`text-xl font-bold ${active ? "text-white" : STAGE_COLORS[s.stage] ?? "text-black"}`}>{s.count}</div>
                              <div className={`text-xs mt-0.5 ${active ? "text-gray-300" : "text-gray-500"}`}>{s.stage}</div>
                            </button>
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

                {/* Heat score + stuck leads */}
                <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded border p-3 text-center">
                    <div className="text-2xl font-bold text-red-500">{hotCount}</div>
                    <div className="mt-1 text-xs text-gray-500">Hot</div>
                  </div>
                  <div className="rounded border p-3 text-center">
                    <div className="text-2xl font-bold text-amber-400">{warmCount}</div>
                    <div className="mt-1 text-xs text-gray-500">Warm</div>
                  </div>
                  <div className="rounded border p-3 text-center">
                    <div className="text-2xl font-bold text-sky-400">{coldCount}</div>
                    <div className="mt-1 text-xs text-gray-500">Cold</div>
                  </div>
                  <div className="rounded border p-3 text-center">
                    <div className={`text-2xl font-bold ${stuckCount > 0 ? "text-amber-600" : "text-black"}`}>{stuckCount}</div>
                    <div className="mt-1 text-xs text-gray-500">Stuck Leads</div>
                  </div>
                </div>

                {/* Outreach activity */}
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
                          <div key={a.type} className="rounded border p-3 text-center">
                            <div className={`text-2xl font-bold ${colors[a.type] || "text-black"}`}>{a.count}</div>
                            <div className="mt-1 text-xs text-gray-500">{a.type}s</div>
                          </div>
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

            {/* Recent jobs */}
            <div className="rounded border p-4">
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
  );
}
