"use client";

import Link from "next/link";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase";

type Customer = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  lead_status: string | null;
  heat_score: string | null;
  last_activity_at: string | null;
  created_at: string;
  next_action: string | null;
};

const HEAT_BADGE: Record<string, string> = {
  Hot:  "bg-red-500 text-white",
  Warm: "bg-amber-400 text-white",
  Cold: "bg-sky-400 text-white",
};

const STAGE_BADGE: Record<string, string> = {
  "New":                  "bg-gray-100 text-gray-600",
  "Contacted":            "bg-blue-100 text-blue-700",
  "Consult Scheduled":    "bg-indigo-100 text-indigo-700",
  "Measure Scheduled":    "bg-purple-100 text-purple-700",
  "Measured":             "bg-amber-100 text-amber-700",
  "Quoted":               "bg-orange-100 text-orange-700",
  "Sold":                 "bg-green-100 text-green-700",
  "Contact for Install":  "bg-teal-100 text-teal-700",
  "Installed":            "bg-emerald-100 text-emerald-700",
  "Complete":             "bg-lime-100 text-lime-700",
  "Lost":                 "bg-red-100 text-red-600",
  "On Hold":              "bg-yellow-100 text-yellow-700",
  "Waiting":              "bg-slate-100 text-slate-600",
};

export default function CustomersListPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-gray-400">Loading…</div>}>
      <CustomersListInner />
    </Suspense>
  );
}

function CustomersListInner() {
  const searchParams = useSearchParams();
  const heat     = searchParams.get("heat")     ?? "";   // Hot | Warm | Cold
  const filter   = searchParams.get("filter")   ?? "";   // stuck
  const activity = searchParams.get("activity") ?? "";   // Call | Text | Email | Note | Visit
  const stage    = searchParams.get("stage")    ?? "";   // any stage name

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true);

    let query = supabase
      .from("customers")
      .select("id, first_name, last_name, lead_status, heat_score, last_activity_at, created_at, next_action");

    if (heat)  query = query.eq("heat_score", heat);
    if (stage) query = query.eq("lead_status", stage);

    const { data } = await query.order("last_activity_at", { ascending: true, nullsFirst: true });
    let custs = (data || []) as Customer[];

    // Client-side filter for stuck and activity
    const now = Date.now();
    if (filter === "stuck") {
      custs = custs.filter(c => {
        if (c.lead_status === "Installed" || c.lead_status === "Complete" || c.lead_status === "Lost") return false;
        const threshold = c.heat_score === "Hot" ? 5 : c.heat_score === "Cold" ? 30 : 14;
        const ref = c.last_activity_at ?? c.created_at;
        const days = Math.floor((now - new Date(ref).getTime()) / 86400000);
        return days >= threshold;
      });
    }

    if (activity) {
      // Filter to customers who have this activity type recently
      const { data: actData } = await supabase
        .from("activity_log")
        .select("customer_id")
        .eq("type", activity);
      const actCustIds = new Set((actData || []).map((a: any) => a.customer_id));
      custs = custs.filter(c => actCustIds.has(c.id));
    }

    setCustomers(custs);
    setLoading(false);
  }

  function pageTitle() {
    if (heat)     return `${heat} Leads`;
    if (stage)    return stage;
    if (filter === "stuck") return "Stuck Leads";
    if (activity) return `${activity} Activity`;
    return "Customers";
  }

  function daysInactive(c: Customer): number {
    const ref = c.last_activity_at ?? c.created_at;
    return Math.floor((Date.now() - new Date(ref).getTime()) / 86400000);
  }

  return (
    <main className="min-h-screen bg-white p-4 text-black text-sm">
      <div className="mx-auto max-w-2xl">
        <Link href="/analytics" className="text-blue-600 hover:underline">← Back to Analytics</Link>

        <div className="mt-3 mb-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">{pageTitle()}</h1>
          <span className="text-sm text-gray-400">{loading ? "…" : `${customers.length} customers`}</span>
        </div>

        {loading ? (
          <p className="text-gray-400">Loading…</p>
        ) : customers.length === 0 ? (
          <p className="text-gray-400">No customers match this filter.</p>
        ) : (
          <ul className="space-y-2">
            {customers.map(c => {
              const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unknown";
              const days = daysInactive(c);
              return (
                <li key={c.id}>
                  <Link href={`/customers/${c.id}`}
                    className="flex items-start justify-between rounded border p-3 hover:bg-gray-50 gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-blue-600">{name}</div>
                      {c.next_action && (
                        <div className="text-xs text-amber-700 mt-0.5 truncate">→ {c.next_action}</div>
                      )}
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      <div className="flex items-center gap-1.5">
                        {c.heat_score && (
                          <span className={`text-xs rounded px-1.5 py-0.5 ${HEAT_BADGE[c.heat_score] ?? "bg-gray-100 text-gray-600"}`}>
                            {c.heat_score}
                          </span>
                        )}
                        {c.lead_status && (
                          <span className={`text-xs rounded px-1.5 py-0.5 ${STAGE_BADGE[c.lead_status] ?? "bg-gray-100 text-gray-600"}`}>
                            {c.lead_status}
                          </span>
                        )}
                      </div>
                      <span className={`text-xs ${days > 14 ? "text-red-500 font-medium" : "text-gray-400"}`}>
                        {days === 0 ? "today" : `${days}d ago`}
                      </span>
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
