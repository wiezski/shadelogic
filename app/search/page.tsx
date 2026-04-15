"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { supabase } from "../../lib/supabase";

type Result = {
  id: string;
  type: "customer" | "quote" | "job";
  title: string;
  subtitle: string;
  href: string;
  badge?: string;
  badgeColor?: string;
};

export default function SearchPage() {
  const [query,   setQuery]   = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      if (query.trim().length >= 2) search(query.trim());
      else setResults([]);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  async function search(q: string) {
    setLoading(true);
    const like = `%${q}%`;

    const [custRes, quoteRes, jobRes] = await Promise.all([
      supabase.from("customers")
        .select("id, first_name, last_name, phone, email, lead_status, heat_score")
        .or(`first_name.ilike.${like},last_name.ilike.${like},phone.ilike.${like},email.ilike.${like}`)
        .limit(8),
      supabase.from("quotes")
        .select("id, title, status, total, customer_id")
        .ilike("title", like)
        .limit(5),
      supabase.from("measure_jobs")
        .select("id, title, customer_id, install_mode")
        .ilike("title", like)
        .limit(5),
    ]);

    const out: Result[] = [];

    // Customer names
    const custIds = [
      ...new Set([
        ...(quoteRes.data || []).map((q: any) => q.customer_id),
        ...(jobRes.data   || []).map((j: any) => j.customer_id),
      ])
    ];
    const custNameMap: Record<string, string> = {};
    if (custIds.length > 0) {
      const { data: cn } = await supabase.from("customers").select("id, first_name, last_name").in("id", custIds);
      (cn || []).forEach((c: any) => { custNameMap[c.id] = [c.first_name, c.last_name].filter(Boolean).join(" "); });
    }

    // Customers
    const HEAT: Record<string, string> = { Hot: "bg-red-500 text-white", Warm: "bg-amber-400 text-white", Cold: "bg-sky-400 text-white" };
    (custRes.data || []).forEach((c: any) => {
      const name = [c.first_name, c.last_name].filter(Boolean).join(" ");
      out.push({
        id: c.id, type: "customer",
        title: name || "Unknown",
        subtitle: [c.phone, c.email].filter(Boolean).join(" · ") || "No contact info",
        href: `/customers/${c.id}`,
        badge: c.heat_score, badgeColor: HEAT[c.heat_score],
      });
    });

    // Quotes
    (quoteRes.data || []).forEach((q: any) => {
      const STATUS_BADGE: Record<string, string> = { draft: "bg-gray-100 text-gray-600", sent: "bg-blue-100 text-blue-700", approved: "bg-green-100 text-green-700", rejected: "bg-red-100 text-red-600" };
      out.push({
        id: q.id, type: "quote",
        title: q.title ?? "Untitled Quote",
        subtitle: `${custNameMap[q.customer_id] ?? "Unknown"} · $${(q.total || 0).toFixed(0)}`,
        href: `/quotes/${q.id}`,
        badge: q.status, badgeColor: STATUS_BADGE[q.status],
      });
    });

    // Jobs
    (jobRes.data || []).forEach((j: any) => {
      out.push({
        id: j.id, type: "job",
        title: j.title,
        subtitle: custNameMap[j.customer_id] ?? "Unknown",
        href: `/measure-jobs/${j.id}`,
        badge: j.install_mode ? "Install" : "Measure",
        badgeColor: j.install_mode ? "bg-green-100 text-green-700" : "bg-purple-100 text-purple-700",
      });
    });

    setResults(out);
    setLoading(false);
  }

  const TYPE_ICON: Record<string, string> = { customer: "👤", quote: "📋", job: "📐" };
  const TYPE_LABEL: Record<string, string> = { customer: "Customer", quote: "Quote", job: "Job" };

  return (
    <main className="min-h-screen bg-white p-4 text-black text-sm">
      <div className="mx-auto max-w-2xl">
        <div className="mb-4 relative">
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search customers, quotes, jobs…"
            className="w-full border-2 border-black rounded-xl px-4 py-3 text-base pr-10"
          />
          {loading && (
            <div className="absolute right-3 top-3.5 text-gray-400 text-xs">…</div>
          )}
        </div>

        {query.length >= 2 && results.length === 0 && !loading && (
          <div className="text-center py-12 text-gray-400">
            <div className="text-3xl mb-2">🔍</div>
            No results for "{query}"
          </div>
        )}

        {query.length < 2 && (
          <div className="text-center py-12 text-gray-300 text-xs">
            Type at least 2 characters to search
          </div>
        )}

        {results.length > 0 && (
          <ul className="space-y-2">
            {results.map(r => (
              <li key={r.type + r.id}>
                <Link href={r.href}
                  className="flex items-center gap-3 rounded-xl border p-3 hover:bg-gray-50">
                  <span className="text-xl shrink-0">{TYPE_ICON[r.type]}</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{r.title}</div>
                    <div className="text-xs text-gray-400 truncate">{TYPE_LABEL[r.type]} · {r.subtitle}</div>
                  </div>
                  {r.badge && (
                    <span className={`shrink-0 text-xs rounded-full px-2 py-0.5 font-medium ${r.badgeColor ?? "bg-gray-100 text-gray-600"}`}>
                      {r.badge}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
