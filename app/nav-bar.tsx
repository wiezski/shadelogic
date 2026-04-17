"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "./auth-provider";
import { ZRLogo } from "./zr-logo";
import { supabase } from "../lib/supabase";

// Routes where the nav bar should never appear (public-facing portals)
const HIDE_NAV_ROUTES = ["/b/", "/q/", "/i/", "/intake", "/login", "/signup", "/forgot-password", "/reset-password"];

export function NavBar() {
  const { user, signOut, permissions, features } = useAuth();
  const pathname = usePathname();
  const [reminderCount, setReminderCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    async function loadBadge() {
      const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();
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

  // Don't show nav on public pages or when not logged in
  const isPublicRoute = HIDE_NAV_ROUTES.some(r => pathname.startsWith(r));
  if (!user || isPublicRoute) return null;

  return (
    <header className="sticky top-0 z-40 shrink-0"
      style={{ background: "var(--zr-surface-1)", borderBottom: "1px solid var(--zr-border)" }}>
      <div className="flex items-center gap-1 px-3 py-2 overflow-x-auto scrollbar-none">
        <Link href="/" className="shrink-0 mr-3 no-underline">
          <ZRLogo size="sm" />
        </Link>
        <span style={{ color: "var(--zr-border)" }} className="shrink-0 mr-1">|</span>
        {[
          { href: "/",          label: "Home",      show: true },
          { href: "/schedule",  label: "Schedule",  show: features.scheduling && (permissions.manage_schedule || permissions.complete_installs) },
          { href: "/analytics", label: "Analytics", show: features.analytics && permissions.view_reports },
          { href: "/products",  label: "Products",  show: features.inventory && permissions.access_settings },
          { href: "/builders",  label: "Builders",  show: features.builder_portal && permissions.view_customers },
          { href: "/calculator", label: "Calculator", show: features.quoting && permissions.view_pricing },
          { href: "/payments",  label: "Payments",  show: features.quoting && permissions.view_financials },
          { href: "/payroll",   label: "Payroll",   show: permissions.view_financials },
          { href: "/team",      label: "Team",      show: permissions.manage_team },
          { href: "/settings",  label: "Settings",  show: permissions.access_settings },
          { href: "/setup-guide", label: "Setup Guide", show: permissions.access_settings || permissions.manage_team },
        ].filter(i => i.show).map(({ href, label }) => (
          <Link key={href} href={href}
            className="shrink-0 px-2.5 py-1.5 rounded text-sm transition-colors whitespace-nowrap"
            style={{ color: "var(--zr-text-secondary)" }}
            onMouseEnter={e => { e.currentTarget.style.color = "var(--zr-text-primary)"; e.currentTarget.style.background = "var(--zr-surface-2)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "var(--zr-text-secondary)"; e.currentTarget.style.background = "transparent"; }}>
            {label}
          </Link>
        ))}
        {/* Reminders with badge */}
        <Link href="/reminders"
          className="shrink-0 px-2.5 py-1.5 rounded text-sm transition-colors whitespace-nowrap relative"
          style={{ color: "var(--zr-text-secondary)" }}>
          Reminders
          {reminderCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center leading-none font-bold"
              style={{ background: "var(--zr-error)" }}>
              {reminderCount > 9 ? "9+" : reminderCount}
            </span>
          )}
        </Link>
        {/* Global search */}
        <Link href="/search"
          className="shrink-0 px-2 py-1.5 rounded transition-colors"
          style={{ color: "var(--zr-text-secondary)" }}>
          🔍
        </Link>
        <div className="flex-1" />
        <button onClick={signOut}
          className="shrink-0 px-2.5 py-1.5 rounded text-xs transition-colors whitespace-nowrap ml-1"
          style={{ color: "var(--zr-text-muted)" }}
          onMouseEnter={e => { e.currentTarget.style.color = "var(--zr-text-primary)"; }}
          onMouseLeave={e => { e.currentTarget.style.color = "var(--zr-text-muted)"; }}>
          Sign Out
        </button>
      </div>
    </header>
  );
}
