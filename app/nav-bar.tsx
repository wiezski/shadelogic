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
      <div className="flex items-center gap-0 px-2 py-2 overflow-x-auto scrollbar-none">
        <Link href="/" className="shrink-0 mr-1 no-underline">
          <ZRLogo size="sm" />
        </Link>
        {[
          { href: "/schedule",  label: "Schedule",  show: features.scheduling && (permissions.manage_schedule || permissions.complete_installs) },
          { href: "/reminders", label: "Reminders", show: true, badge: reminderCount },
          { href: "/analytics", label: "Analytics", show: features.analytics && permissions.view_reports },
          { href: "/products",  label: "Products",  show: features.inventory && permissions.access_settings },
          { href: "/calculator", label: "Calculator", show: features.quoting && permissions.view_pricing },
          { href: "/payments",  label: "Payments",  show: features.quoting && permissions.view_financials },
          { href: "/settings",  label: "Settings",  show: permissions.access_settings },
          { href: "/payroll",   label: "Payroll",   show: permissions.view_financials },
          { href: "/builders",  label: "Builders",  show: features.builder_portal && permissions.view_customers },
        ].filter(i => i.show).map(({ href, label, badge }) => (
          <Link key={href} href={href}
            className="shrink-0 px-2 py-1.5 rounded text-xs transition-colors whitespace-nowrap relative"
            style={{ color: pathname === href ? "var(--zr-text-primary)" : "var(--zr-text-secondary)", fontWeight: pathname === href ? "600" : "normal" }}
            onMouseEnter={e => { e.currentTarget.style.color = "var(--zr-text-primary)"; e.currentTarget.style.background = "var(--zr-surface-2)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = pathname === href ? "var(--zr-text-primary)" : "var(--zr-text-secondary)"; e.currentTarget.style.background = "transparent"; }}>
            {label}
            {badge && badge > 0 ? (
              <span className="absolute -top-0.5 -right-0.5 text-white rounded-full w-4 h-4 flex items-center justify-center leading-none font-bold"
                style={{ background: "var(--zr-error)", fontSize: "9px" }}>
                {badge > 9 ? "9+" : badge}
              </span>
            ) : null}
          </Link>
        ))}
        <div className="flex-1" />
        <button onClick={signOut}
          className="shrink-0 px-2 py-1.5 rounded text-xs transition-colors whitespace-nowrap ml-1"
          style={{ color: "var(--zr-text-muted)" }}
          onMouseEnter={e => { e.currentTarget.style.color = "var(--zr-text-primary)"; }}
          onMouseLeave={e => { e.currentTarget.style.color = "var(--zr-text-muted)"; }}>
          Sign Out
        </button>
      </div>
    </header>
  );
}
