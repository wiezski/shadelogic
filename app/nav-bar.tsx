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

// ── Task Modes (imported from shared config) ──────────────────
// MODE_NAV_FILTER is no longer used — focus modes only filter dashboard
// widgets now; the nav bar always shows every item the user is entitled to.
import {
  type TaskMode,
  MODE_LABELS,
  MODE_ICONS,
} from "../lib/focus-modes";

export function NavBar() {
  const { user, signOut, permissions, features, hiddenNav } = useAuth();
  const pathname = usePathname();
  const [reminderCount, setReminderCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  const [taskMode, setTaskMode] = useState<TaskMode>("all");
  const [modeOpen, setModeOpen] = useState(false);
  const modeRef = useRef<HTMLDivElement>(null);

  // Load saved mode from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("zr-task-mode") as TaskMode | null;
    if (saved && MODE_LABELS[saved]) setTaskMode(saved);
  }, []);

  function changeMode(mode: TaskMode) {
    setTaskMode(mode);
    setModeOpen(false);
    localStorage.setItem("zr-task-mode", mode);
  }

  // Close mode dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (modeRef.current && !modeRef.current.contains(e.target as Node)) setModeOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

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

  // Combine notification unread + reminder count for the bell badge
  const totalBellCount = unreadCount + reminderCount;

  return (
    <header className="sticky top-0 z-40 shrink-0"
      style={{
        background: "rgba(255,255,255,0.88)",
        backdropFilter: "saturate(180%) blur(20px)",
        WebkitBackdropFilter: "saturate(180%) blur(20px)",
        borderBottom: "0.5px solid rgba(60,60,67,0.1)",
      }}>
      <div className="flex items-center gap-1 px-3 py-2.5">
        {/* Icon only — no wordmark on nav */}
        <Link href="/" className="shrink-0 no-underline mr-1 transition-opacity active:opacity-60">
          <ZRLogo size="sm" iconOnly />
        </Link>

        {/* Task Mode Selector — lighter chip, no hard border */}
        <div ref={modeRef} className="relative shrink-0 mr-1.5">
          <button onClick={() => setModeOpen(!modeOpen)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[13px] font-medium transition-all active:scale-95"
            style={{
              background: taskMode === "all" ? "rgba(60,60,67,0.06)" : "rgba(214,90,49,0.1)",
              color: taskMode === "all" ? "var(--zr-text-secondary)" : "var(--zr-orange)",
            }}>
            <span style={{ fontSize: "13px" }}>{MODE_ICONS[taskMode]}</span>
            <span className="hidden sm:inline">{MODE_LABELS[taskMode]}</span>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg>
          </button>
          {modeOpen && (
            <div className="absolute left-0 top-full mt-2 w-48 rounded-2xl z-50 overflow-hidden"
              style={{ background: "var(--zr-surface-1)", boxShadow: "var(--zr-shadow-lg)" }}>
              <div className="px-3 py-1.5" style={{ borderBottom: "1px solid var(--zr-border)" }}>
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--zr-text-muted)" }}>Focus Mode</span>
              </div>
              {(Object.keys(MODE_LABELS) as TaskMode[]).map(mode => (
                <button key={mode} onClick={() => changeMode(mode)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors"
                  style={{
                    background: taskMode === mode ? "rgba(234,88,12,0.08)" : "transparent",
                    color: taskMode === mode ? "var(--zr-orange)" : "var(--zr-text-primary)",
                    fontWeight: taskMode === mode ? "600" : "normal",
                  }}
                  onMouseEnter={e => { if (taskMode !== mode) e.currentTarget.style.background = "var(--zr-surface-2)"; }}
                  onMouseLeave={e => { if (taskMode !== mode) e.currentTarget.style.background = "transparent"; }}>
                  <span>{MODE_ICONS[mode]}</span>
                  <span>{MODE_LABELS[mode]}</span>
                  {taskMode === mode && <span className="ml-auto">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Scrollable nav links — Sign Out at the far end */}
        <div className="flex-1 overflow-x-auto scrollbar-none flex items-center gap-0.5">
          {[
            { href: "/schedule",  label: "Schedule",  show: features.scheduling && (permissions.manage_schedule || permissions.complete_installs) },
            { href: "/analytics", label: "Analytics", show: features.analytics && permissions.view_reports },
            { href: "/products",  label: "Products",  show: features.inventory && permissions.access_settings },
            { href: "/calculator", label: "Calculator", show: features.quoting && permissions.view_pricing },
            { href: "/payments",  label: "Payments",  show: features.quoting && permissions.view_financials },
            { href: "/warehouse", label: "Warehouse", show: true },
            { href: "/settings",  label: "Settings",  show: permissions.access_settings },
            { href: "/payroll",   label: "Payroll",   show: permissions.view_financials },
            { href: "/manufacturers", label: "Specs", show: permissions.create_quotes },
            { href: "/builders",  label: "Builders",  show: features.builder_portal && permissions.view_customers },
            { href: "/canvas",    label: "Canvas",    show: features.canvassing && permissions.view_customers },
          ].filter(i => i.show).filter(i => {
            // Company-level hidden nav still applies. Focus mode doesn't.
            if (hiddenNav.length > 0 && hiddenNav.includes(i.href)) return false;
            return true;
          }).map(({ href, label }) => {
            const active = pathname === href;
            return (
              <Link key={href} href={href}
                className="shrink-0 px-3 py-1.5 rounded-full text-[13px] transition-all whitespace-nowrap relative"
                style={{
                  color: active ? "var(--zr-orange)" : "var(--zr-text-secondary)",
                  fontWeight: active ? 600 : 500,
                  background: active ? "rgba(214,90,49,0.08)" : "transparent",
                }}>
                {label}
              </Link>
            );
          })}
          {/* Sign Out — softer, far right */}
          <button onClick={signOut}
            className="shrink-0 px-3 py-1.5 rounded-full text-[13px] transition-all whitespace-nowrap ml-1"
            style={{ color: "rgba(60,60,67,0.5)", fontWeight: 500 }}>
            Sign Out
          </button>
        </div>

        {/* Pinned right: Bell — always visible */}
        <div ref={bellRef} className="relative shrink-0 ml-1.5">
          <button onClick={() => setBellOpen(!bellOpen)}
            className="relative p-2 rounded-full transition-all active:scale-95"
            style={{
              color: totalBellCount > 0 ? "var(--zr-orange)" : "rgba(60,60,67,0.55)",
              background: totalBellCount > 0 ? "rgba(214,90,49,0.08)" : "transparent",
            }}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {totalBellCount > 0 && (
              <span className="absolute top-0.5 right-0.5 text-white rounded-full min-w-[17px] h-[17px] flex items-center justify-center leading-none font-semibold px-1"
                style={{ background: "#d6443a", fontSize: "10px", letterSpacing: "-0.02em" }}>
                {totalBellCount > 99 ? "99+" : totalBellCount}
              </span>
            )}
          </button>

          {bellOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 rounded-2xl z-50 overflow-hidden"
              style={{ background: "var(--zr-surface-1)", boxShadow: "var(--zr-shadow-lg)" }}>
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
                {/* Reminder banner — links to /reminders page */}
                {reminderCount > 0 && (
                  <div
                    className="flex items-start gap-2.5 px-3 py-2.5 cursor-pointer transition-colors"
                    style={{
                      background: "rgba(234,88,12,0.08)",
                      borderBottom: "1px solid var(--zr-border)",
                    }}
                    onClick={() => { setBellOpen(false); window.location.href = "/reminders"; }}
                    onMouseEnter={e => { e.currentTarget.style.background = "var(--zr-surface-2)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "rgba(234,88,12,0.08)"; }}>
                    <span className="text-base shrink-0 mt-0.5">🔔</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium" style={{ color: "var(--zr-text-primary)" }}>
                          {reminderCount} follow-up reminder{reminderCount !== 1 ? "s" : ""} due
                        </span>
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "var(--zr-orange)" }} />
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: "var(--zr-text-muted)" }}>
                        Quotes, deposits, or customers need attention
                      </p>
                    </div>
                  </div>
                )}
                {notifications.length === 0 && reminderCount === 0 ? (
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
      </div>
    </header>
  );
}
