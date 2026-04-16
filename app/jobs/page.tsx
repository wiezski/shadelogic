"use client";

import Link from "next/link";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase";

type Job = {
  id: string;
  title: string;
  customer_id: string;
  customer_name: string;
  measured_by: string | null;
  scheduled_at: string | null;
  install_scheduled_at: string | null;
  install_mode: boolean;
  created_at: string;
  has_windows: boolean;
  has_issues: boolean;
};

const FILTER_LABELS: Record<string, string> = {
  measures_to_schedule: "Measures to Schedule",
  measures_done:        "Measures Done",
  installs_to_schedule: "Installs to Schedule",
  installs_scheduled:   "Installs Scheduled",
  issues:               "Open Issues",
};

export default function JobsPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-gray-400">Loading…</div>}>
      <JobsPageInner />
    </Suspense>
  );
}

function JobsPageInner() {
  const searchParams = useSearchParams();
  const filter    = searchParams.get("filter") ?? "";
  const measurer  = searchParams.get("measurer") ?? "";

  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true);

    const { data: jobData } = await supabase
      .from("measure_jobs")
      .select("id, title, customer_id, measured_by, scheduled_at, install_scheduled_at, install_mode, created_at")
      .order("created_at", { ascending: false });

    if (!jobData || jobData.length === 0) { setJobs([]); setLoading(false); return; }

    // Customer names
    const custIds = [...new Set(jobData.map((j: any) => j.customer_id))];
    const { data: cData } = await supabase.from("customers").select("id, first_name, last_name").in("id", custIds);
    const cMap: Record<string, string> = {};
    (cData || []).forEach((c: any) => { cMap[c.id] = [c.last_name, c.first_name].filter(Boolean).join(", "); });

    // Rooms → window counts
    const jobIds = jobData.map((j: any) => j.id);
    const { data: roomData } = await supabase.from("rooms").select("id, measure_job_id").in("measure_job_id", jobIds);
    const roomsByJob: Record<string, string[]> = {};
    (roomData || []).forEach((r: any) => {
      if (!roomsByJob[r.measure_job_id]) roomsByJob[r.measure_job_id] = [];
      roomsByJob[r.measure_job_id].push(r.id);
    });
    const allRoomIds = (roomData || []).map((r: any) => r.id);

    const winCountByRoom: Record<string, number> = {};
    const issueRoomIds = new Set<string>();
    if (allRoomIds.length > 0) {
      const { data: wData } = await supabase.from("windows").select("id, room_id, install_status").in("room_id", allRoomIds);
      (wData || []).forEach((w: any) => {
        winCountByRoom[w.room_id] = (winCountByRoom[w.room_id] || 0) + 1;
        if (w.install_status === "issue") issueRoomIds.add(w.room_id);
      });
    }

    const hasWindows = (jid: string) =>
      (roomsByJob[jid] || []).some(rid => (winCountByRoom[rid] || 0) > 0);
    const hasIssues = (jid: string) =>
      (roomsByJob[jid] || []).some(rid => issueRoomIds.has(rid));

    let enriched: Job[] = jobData.map((j: any) => ({
      ...j,
      customer_name: cMap[j.customer_id] ?? "Unknown",
      has_windows:   hasWindows(j.id),
      has_issues:    hasIssues(j.id),
    }));

    // Apply filter
    if (filter === "measures_to_schedule")  enriched = enriched.filter(j => !j.install_mode && !j.has_windows);
    else if (filter === "measures_done")    enriched = enriched.filter(j => !j.install_mode && j.has_windows);
    else if (filter === "installs_to_schedule") enriched = enriched.filter(j => j.install_mode && !j.install_scheduled_at);
    else if (filter === "installs_scheduled")   enriched = enriched.filter(j => j.install_mode && !!j.install_scheduled_at);
    else if (filter === "issues")           enriched = enriched.filter(j => j.has_issues);
    else if (measurer)                      enriched = enriched.filter(j => (j.measured_by ?? "Unassigned") === measurer);

    setJobs(enriched);
    setLoading(false);
  }

  const title = filter ? (FILTER_LABELS[filter] ?? filter) : measurer ? `Jobs by ${measurer}` : "All Jobs";

  return (
    <main style={{ background: "var(--zr-black)", color: "var(--zr-text-primary)" }} className="min-h-screen p-4 text-sm">
      <div className="mx-auto max-w-3xl">
        <Link href="/analytics" style={{ color: "var(--zr-orange)" }} className="hover:underline">← Back to Analytics</Link>

        <div className="mt-3 mb-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">{title}</h1>
          <span style={{ color: "var(--zr-text-secondary)" }} className="text-sm">{loading ? "…" : `${jobs.length} jobs`}</span>
        </div>

        {loading ? (
          <p style={{ color: "var(--zr-text-secondary)" }}>Loading…</p>
        ) : jobs.length === 0 ? (
          <p style={{ color: "var(--zr-text-secondary)" }}>No jobs match this filter.</p>
        ) : (
          <ul className="space-y-2">
            {jobs.map(j => {
              const dateStr = j.install_mode
                ? (j.install_scheduled_at ? j.install_scheduled_at.slice(0, 10) : null)
                : (j.scheduled_at ? j.scheduled_at.slice(0, 10) : null);
              const daysOld = Math.floor((Date.now() - new Date(j.created_at).getTime()) / 86400000);
              return (
                <li key={j.id}>
                  <Link href={`/measure-jobs/${j.id}`}
                    className="flex items-start justify-between rounded border p-3 hover:bg-gray-50 gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-blue-600 truncate">{j.title}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{j.customer_name}</div>
                      {j.measured_by && (
                        <div className="text-xs text-gray-400 mt-0.5">Measured by: {j.measured_by}</div>
                      )}
                    </div>
                    <div className="shrink-0 text-right space-y-1">
                      <div>
                        <span className={`text-xs rounded px-1.5 py-0.5 ${j.install_mode ? "bg-green-100 text-green-700" : "bg-purple-100 text-purple-700"}`}>
                          {j.install_mode ? "Install" : "Measure"}
                        </span>
                      </div>
                      {dateStr && <div className="text-xs text-gray-400">{dateStr}</div>}
                      {j.has_issues && <div className="text-xs text-red-600 font-medium">⚠ Issues</div>}
                      {!j.has_windows && !j.install_mode && (
                        <div className="text-xs text-amber-600">{daysOld}d old</div>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
