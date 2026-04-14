"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type JobStat = {
  id: string;
  title: string;
  measured_by: string | null;
  scheduled_at: string | null;
  created_at: string;
};

type IssueStat = {
  issue_type: string;
  count: number;
};

type MeasurerStat = {
  name: string;
  jobs: number;
  windows: number;
};

export default function AnalyticsPage() {
  const [jobs, setJobs] = useState<JobStat[]>([]);
  const [windowCount, setWindowCount] = useState(0);
  const [issueStats, setIssueStats] = useState<IssueStat[]>([]);
  const [measurerStats, setMeasurerStats] = useState<MeasurerStat[]>([]);
  const [installComplete, setInstallComplete] = useState(0);
  const [installIssues, setInstallIssues] = useState(0);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<"week" | "month" | "all">("month");

  useEffect(() => {
    loadStats();
  }, [range]);

  async function loadStats() {
    setLoading(true);

    const now = new Date();
    let since: string | null = null;
    if (range === "week") {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      since = d.toISOString();
    } else if (range === "month") {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      since = d.toISOString();
    }

    // Jobs
    let jobQuery = supabase
      .from("measure_jobs")
      .select("id, title, measured_by, scheduled_at, created_at")
      .order("created_at", { ascending: false });
    if (since) jobQuery = jobQuery.gte("created_at", since);
    const { data: jobData } = await jobQuery;
    const loadedJobs = (jobData || []) as JobStat[];
    setJobs(loadedJobs);

    if (loadedJobs.length === 0) {
      setWindowCount(0);
      setInstallComplete(0);
      setInstallIssues(0);
      setIssueStats([]);
      setMeasurerStats([]);
      setLoading(false);
      return;
    }

    const jobIds = loadedJobs.map((j) => j.id);

    // Windows
    const { data: roomData } = await supabase
      .from("rooms")
      .select("id")
      .in("measure_job_id", jobIds);
    const roomIds = (roomData || []).map((r: { id: string }) => r.id);

    if (roomIds.length > 0) {
      const { data: winData } = await supabase
        .from("windows")
        .select("id, install_status")
        .in("room_id", roomIds);
      const wins = winData || [];
      setWindowCount(wins.length);
      setInstallComplete(wins.filter((w: { install_status: string }) => w.install_status === "complete").length);
      setInstallIssues(wins.filter((w: { install_status: string }) => w.install_status === "issue").length);

      // Issue stats
      const winIds = wins.map((w: { id: string }) => w.id);
      if (winIds.length > 0) {
        const { data: issData } = await supabase
          .from("install_issues")
          .select("issue_type")
          .in("window_id", winIds);
        const counts: Record<string, number> = {};
        (issData || []).forEach((i: { issue_type: string }) => {
          counts[i.issue_type] = (counts[i.issue_type] || 0) + 1;
        });
        const sorted = Object.entries(counts)
          .map(([issue_type, count]) => ({ issue_type, count }))
          .sort((a, b) => b.count - a.count);
        setIssueStats(sorted);
      }
    } else {
      setWindowCount(0);
      setInstallComplete(0);
      setInstallIssues(0);
      setIssueStats([]);
    }

    // Measurer stats
    const measMap: Record<string, { jobs: number; jobIds: string[] }> = {};
    loadedJobs.forEach((j) => {
      const name = j.measured_by || "Unassigned";
      if (!measMap[name]) measMap[name] = { jobs: 0, jobIds: [] };
      measMap[name].jobs += 1;
      measMap[name].jobIds.push(j.id);
    });

    const measStats: MeasurerStat[] = await Promise.all(
      Object.entries(measMap).map(async ([name, { jobs: jobCount, jobIds: mJobIds }]) => {
        const { data: mRooms } = await supabase
          .from("rooms")
          .select("id")
          .in("measure_job_id", mJobIds);
        const mRoomIds = (mRooms || []).map((r: { id: string }) => r.id);
        let winCount = 0;
        if (mRoomIds.length > 0) {
          const { count } = await supabase
            .from("windows")
            .select("id", { count: "exact", head: true })
            .in("room_id", mRoomIds);
          winCount = count || 0;
        }
        return { name, jobs: jobCount, windows: winCount };
      })
    );
    setMeasurerStats(measStats.sort((a, b) => b.jobs - a.jobs));

    setLoading(false);
  }

  const statCard = (label: string, value: string | number, color = "text-black") => (
    <div className="rounded border p-4 text-center">
      <div className={`text-3xl font-bold ${color}`}>{value}</div>
      <div className="mt-1 text-xs text-gray-500">{label}</div>
    </div>
  );

  return (
    <main className="min-h-screen bg-white p-6 text-black">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="mb-4 inline-block text-blue-600 hover:underline">
          ← Back
        </Link>

        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Analytics</h1>
          <div className="flex gap-1 rounded border overflow-hidden">
            {(["week", "month", "all"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3 py-1 text-sm ${range === r ? "bg-black text-white" : "bg-white text-black"}`}
              >
                {r === "week" ? "7 days" : r === "month" ? "30 days" : "All time"}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="text-gray-500">Loading...</p>
        ) : (
          <>
            {/* Top stats */}
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {statCard("Measure Jobs", jobs.length)}
              {statCard("Windows Measured", windowCount)}
              {statCard("Install Complete", installComplete, "text-green-600")}
              {statCard("Install Issues", installIssues, installIssues > 0 ? "text-red-600" : "text-black")}
            </div>

            {/* Issue breakdown */}
            {issueStats.length > 0 && (
              <div className="mb-6 rounded border p-4">
                <h2 className="mb-3 font-semibold">Issues by Type</h2>
                <div className="space-y-2">
                  {issueStats.map((s) => (
                    <div key={s.issue_type} className="flex items-center gap-2">
                      <div className="w-32 truncate text-sm">{s.issue_type}</div>
                      <div className="flex-1 rounded bg-gray-100">
                        <div
                          className="h-4 rounded bg-red-400 text-right"
                          style={{ width: `${Math.min(100, (s.count / issueStats[0].count) * 100)}%` }}
                        />
                      </div>
                      <div className="w-6 text-right text-sm font-medium">{s.count}</div>
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
                  <thead>
                    <tr className="border-b text-left text-xs text-gray-500">
                      <th className="pb-2">Name</th>
                      <th className="pb-2 text-right">Jobs</th>
                      <th className="pb-2 text-right">Windows</th>
                    </tr>
                  </thead>
                  <tbody>
                    {measurerStats.map((m) => (
                      <tr key={m.name} className="border-b last:border-0">
                        <td className="py-2">{m.name}</td>
                        <td className="py-2 text-right">{m.jobs}</td>
                        <td className="py-2 text-right">{m.windows}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Recent jobs */}
            <div className="rounded border p-4">
              <h2 className="mb-3 font-semibold">Recent Jobs</h2>
              {jobs.length === 0 ? (
                <p className="text-sm text-gray-500">No jobs in this period.</p>
              ) : (
                <ul className="space-y-2">
                  {jobs.slice(0, 10).map((j) => (
                    <li key={j.id} className="flex items-center justify-between text-sm">
                      <Link href={`/measure-jobs/${j.id}`} className="text-blue-600 hover:underline">
                        {j.title}
                      </Link>
                      <span className="text-xs text-gray-400">
                        {j.measured_by || "—"} · {j.scheduled_at ? j.scheduled_at.slice(0, 10) : j.created_at.slice(0, 10)}
                      </span>
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
