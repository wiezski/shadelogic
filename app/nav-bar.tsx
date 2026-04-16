"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "./auth-provider";
// nav items filtered by permissions below
import { supabase } from "../lib/supabase";

export function NavBar() {
  const { user, signOut, permissions, features } = useAuth();
  const [reminderCount, setReminderCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    async function loadBadge() {
      const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const [dep, sent, measured] = await Promise.all([
        supabase.from("quotes").select("id", { count: "exact", head: true })
          .eq("status", "approved").eq("deposit_paid", false).lt("created_at", threeDaysAgo),
        supabase.from("quotes").select("id", { count: "exact", head: true })
          .eq("status", "sent").lt("created_at", threeDaysAgo),
        supabase.from("customers").select("id", { count: "exact", head: true })
          .eq("lead_status", "Measured").lt("last_activity_at", threeDaysAgo),
      ]);
      setReminderCount((dep.count || 0) + (sent.count || 0) + (measured.count || 0));
    }
    loadBadge();
  }, [user]);

  // Don't show nav on public pages
  if (!user) return null;

  return (
    <header className="sticky top-0 z-40 bg-black text-white shrink-0">
      <div className="flex items-center gap-0.5 px-3 py-2 overflow-x-auto scrollbar-none">
        <Link href="/" className="font-bold text-white tracking-tight text-base shrink-0 mr-2">SL</Link>
        <span className="text-white/20 shrink-0 mr-0.5">|</span>
        {[
          { href: "/",          label: "Home",      show: true },
          { href: "/schedule",  label: "Schedule",  show: features.scheduling && (permissions.manage_schedule || permissions.complete_installs) },
          { href: "/analytics", label: "Analytics", show: features.analytics && permissions.view_reports },
          { href: "/products",  label: "Products",  show: features.inventory && permissions.access_settings },
          { href: "/payments",  label: "Payments",  show: features.quoting && permissions.view_financials },
          { href: "/settings",  label: "Settings",  show: permissions.access_settings },
          { href: "/setup-guide", label: "Setup Guide", show: permissions.access_settings || permissions.manage_team },
        ].filter(i => i.show).map(({ href, label }) => (
          <Link key={href} href={href}
            className="shrink-0 px-2.5 py-1.5 rounded text-sm text-gray-300 hover:text-white hover:bg-white/10 transition-colors whitespace-nowrap">
            {label}
          </Link>
        ))}
        {/* Reminders with badge */}
        <Link href="/reminders"
          className="shrink-0 px-2.5 py-1.5 rounded text-sm text-gray-300 hover:text-white hover:bg-white/10 transition-colors whitespace-nowrap relative">
          Reminders
          {reminderCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center leading-none font-bold">
              {reminderCount > 9 ? "9+" : reminderCount}
            </span>
          )}
        </Link>
        {/* Global search */}
        <Link href="/search"
          className="shrink-0 px-2 py-1.5 rounded text-gray-300 hover:text-white hover:bg-white/10 transition-colors">
          🔍
        </Link>
        <div className="flex-1" />
        <button onClick={signOut}
          className="shrink-0 px-2.5 py-1.5 rounded text-xs text-gray-500 hover:text-white hover:bg-white/10 transition-colors whitespace-nowrap ml-1">
          Sign Out
        </button>
      </div>
    </header>
  );
}
