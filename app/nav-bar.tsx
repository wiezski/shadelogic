"use client";

import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "./auth-provider";
import { ZRLogo } from "./zr-logo";
import { supabase } from "../lib/supabase";

// ── Notification types ──────────────────────────────────────
type Notification = {
  id: string;
  type: string;
  title: string;
  message: string | null;
  icon: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
};

// Routes where the nav bar should never appear (public-facing portals)
const HIDE_NAV_ROUTES = ["/b/", "/q/", "/i/", "/intake", "/login", "/signup", "/forgot-password", "/reset-password"];

export function NavBar() {
  const { user, signOut, permissions, features } = useAuth();
  const pathname = usePathname();
  const [reminderCount, setReminderCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);

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
    loadNotifications();

    // Poll for new notifications every 30 seconds
    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
  }, [user]);

  // Close bell dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function loadNotifications() {
    const { data, count } = await supabase
      .from("notifications")
      .select("id, type, title, message, icon, link, read, created_at", { count: "exact" })
      .eq("read", false)
      .order("created_at", { ascending: false })
      .limit(20);
    // Also get recent read ones for the dropdown
    const { data: recentAll } = await supabase
      .from("notifications")
      .select("id, type, title, message, icon, link, read, created_at")
      .order("created_at", { ascending: false })
      .limit(15);
    setNotifications(recentAll || []);
    setUnreadCount(count || 0);
  }

  async function markRead(id: string) {
    await supabase.from("notifications").update({ read: true }).eq("id", id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  }

  async function markAllRead() {
    const unreadIds = notifications.filter(n => !n.read).map(n => n.id);
    if (unreadIds.length === 0) return;
    await supabase.from("notifications").update({ read: true }).in("id", unreadIds);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  }

  function timeAgo(dateStr: string): string {
    const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

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
          { href: "/manufacturers", label: "Specs", show: permissions.create_quotes },
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

        {/* Notification Bell */}
        <div ref={bellRef} className="relative shrink-0 mr-1">
          <button onClick={() => setBellOpen(!bellOpen)}
            className="relative p-1.5 rounded transition-colors"
            style={{ color: unreadCount > 0 ? "var(--zr-orange)" : "var(--zr-text-muted)" }}
            onMouseEnter={e => { e.currentTarget.style.background = "var(--zr-surface-2)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 text-white rounded-full min-w-[16px] h-4 flex items-center justify-center leading-none font-bold px-1"
                style={{ background: "var(--zr-error)", fontSize: "9px" }}>
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>

          {bellOpen && (
            <div className="absolute right-0 top-full mt-1 w-80 rounded-lg shadow-xl z-50 overflow-hidden"
              style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }}>
              <div className="flex items-center justify-between px-3 py-2"
                style={{ borderBottom: "1px solid var(--zr-border)" }}>
                <span className="text-sm font-semibold" style={{ color: "var(--zr-text-primary)" }}>Notifications</span>
                {unreadCount > 0 && (
                  <button onClick={markAllRead} className="text-xs hover:underline" style={{ color: "var(--zr-orange)" }}>
                    Mark all read
                  </button>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="p-4 text-center text-xs" style={{ color: "var(--zr-text-muted)" }}>
                    No notifications yet
                  </div>
                ) : notifications.map(n => (
                  <div key={n.id}
                    className="flex items-start gap-2.5 px-3 py-2.5 cursor-pointer transition-colors"
                    style={{
                      background: n.read ? "transparent" : "rgba(234,88,12,0.05)",
                      borderBottom: "1px solid var(--zr-border)",
                    }}
                    onClick={() => {
                      if (!n.read) markRead(n.id);
                      if (n.link) { setBellOpen(false); window.location.href = n.link; }
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = "var(--zr-surface-2)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = n.read ? "transparent" : "rgba(234,88,12,0.05)"; }}>
                    <span className="text-base shrink-0 mt-0.5">{n.icon || "🔔"}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium truncate" style={{ color: "var(--zr-text-primary)" }}>{n.title}</span>
                        {!n.read && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "var(--zr-orange)" }} />}
                      </div>
                      {n.message && (
                        <p className="text-xs mt-0.5 line-clamp-2" style={{ color: "var(--zr-text-muted)" }}>{n.message}</p>
                      )}
                      <span className="text-xs mt-0.5 block" style={{ color: "var(--zr-text-muted)", opacity: 0.7 }}>
                        {timeAgo(n.created_at)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

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
