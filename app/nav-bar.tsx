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

// Routes where the nav bar should never appear (public-facing portals
// and marketing pages). These have their own chrome / nav / footer.
const HIDE_NAV_ROUTES = [
  "/b/",
  "/q/",
  "/i/",
  "/intake",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/audit", // public lead magnet — owns its own nav
  "/admin", // internal admin page — owns its own shell
  "/sun-calculator", // public calculator — owns its own nav
  "/tools", // consumer calculator mini-site — owns its own chrome (isolated under /app/tools)
  "/guides", // consumer SEO guides — own their own chrome (isolated under /app/guides)
];

// ── Task Modes (imported from shared config) ──────────────────
// MODE_NAV_FILTER is no longer used — focus modes only filter dashboard
// widgets now; the nav bar always shows every item the user is entitled to.
import {
  type TaskMode,
  MODE_LABELS,
} from "../lib/focus-modes";

export function NavBar() {
  const { user, signOut, permissions, features, hiddenNav, role } = useAuth();
  const isInstaller = role === "installer";
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

        {/* Focus chip — soft pill labeled "Focus" with current mode label.
            When a specific mode is active, the chip is tinted orange so the
            filter state is obvious at a glance. No emoji. */}
        <div ref={modeRef} className="relative shrink-0 mr-1.5">
          <button onClick={() => setModeOpen(!modeOpen)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full text-[13px] font-medium transition-all active:scale-95"
            style={{
              background: taskMode === "all" ? "rgba(60,60,67,0.06)" : "rgba(214,90,49,0.12)",
              color: taskMode === "all" ? "var(--zr-text-secondary)" : "var(--zr-orange)",
              letterSpacing: "-0.012em",
            }}>
            <span>{taskMode === "all" ? "Focus" : MODE_LABELS[taskMode]}</span>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 2 }}><path d="M6 9l6 6 6-6"/></svg>
          </button>
          {modeOpen && (
            // iOS context-menu style popover. Anchored to trigger, compact,
            // hairlines between rows, backdrop blur for native feel. Selected
            // state is a checkmark + orange label only — no filled background.
            <div className="absolute left-0 top-full mt-1.5 w-52 rounded-[14px] z-50 overflow-hidden"
              style={{
                background: "rgba(255,255,255,0.88)",
                backdropFilter: "saturate(180%) blur(20px)",
                WebkitBackdropFilter: "saturate(180%) blur(20px)",
                boxShadow: "0 6px 20px rgba(0,0,0,0.10), 0 1px 3px rgba(0,0,0,0.04)",
              }}>
              {(Object.keys(MODE_LABELS) as TaskMode[]).map((mode, i, arr) => {
                const selected = taskMode === mode;
                const isLast = i === arr.length - 1;
                return (
                  <button key={mode} onClick={() => changeMode(mode)}
                    className="w-full flex items-center gap-3 text-left transition-colors"
                    style={{
                      padding: "11px 14px",
                      background: "transparent",
                      borderBottom: isLast ? "none" : "0.5px solid rgba(60,60,67,0.08)",
                      color: selected ? "var(--zr-orange)" : "var(--zr-text-primary)",
                      fontSize: "15px",
                      fontWeight: selected ? 600 : 400,
                      letterSpacing: "-0.012em",
                      WebkitTapHighlightColor: "transparent",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = "rgba(60,60,67,0.04)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
                    <span style={{ flex: 1 }}>{MODE_LABELS[mode]}</span>
                    {selected && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ─────────────────────────────────────────────────────────
            Horizontal route row tuned for field use. Typography carries
            the hierarchy (no pills, no filled active states), but
            inactive items are strong enough to read in bright sunlight
            and the active item gets a small indicator bar below it so
            selection is unmistakable at a glance. Reads like Apple News'
            category strip: clean, scannable, unambiguous.
            ───────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-x-auto scrollbar-none flex items-stretch gap-3 pl-0.5">
          {[
            { href: "/schedule",  label: "Schedule",  show: features.scheduling && (permissions.manage_schedule || permissions.complete_installs) },
            { href: "/analytics", label: "Analytics", show: features.analytics && permissions.view_reports },
            { href: "/reviews",   label: "Reviews",   show: !isInstaller && permissions.access_settings },
            { href: "/products",  label: "Products",  show: features.inventory && permissions.access_settings },
            { href: "/calculator", label: "Calculator", show: features.quoting && permissions.view_pricing },
            { href: "/payments",  label: "Payments",  show: features.quoting && permissions.view_financials },
            { href: "/warehouse", label: "Warehouse", show: true },
            { href: "/settings",  label: "Settings",  show: permissions.access_settings },
            { href: "/payroll",   label: "Payroll",   show: permissions.view_financials },
            // Installers see Specs (read-only reference for products they
            // install). Normally gated by create_quotes.
            { href: "/manufacturers", label: "Specs", show: permissions.create_quotes || isInstaller },
            // Canvas and Builders are sales/owner surfaces — hide from installers
            { href: "/builders",  label: "Builders",  show: !isInstaller && features.builder_portal && permissions.view_customers },
            { href: "/canvas",    label: "Canvas",    show: !isInstaller && features.canvassing && permissions.view_customers },
          ].filter(i => i.show).filter(i => {
            // Company-level hidden nav still applies. Focus mode doesn't.
            if (hiddenNav.length > 0 && hiddenNav.includes(i.href)) return false;
            return true;
          }).map(({ href, label }) => {
            const active = pathname === href;
            return (
              <Link key={href} href={href}
                className="shrink-0 whitespace-nowrap transition-opacity active:opacity-60 relative flex flex-col items-center justify-center"
                style={{
                  color: active ? "var(--zr-orange)" : "rgba(28,28,30,0.72)",
                  fontWeight: active ? 600 : 500,
                  fontSize: "15px",
                  letterSpacing: "-0.012em",
                  padding: "8px 2px 6px",
                }}>
                {label}
                {/* Active indicator — 3px-tall rounded bar centered beneath
                    the label. Small enough to stay calm, distinct enough
                    to read instantly in bright light. */}
                {active && (
                  <span style={{
                    position: "absolute",
                    bottom: 0,
                    left: "50%",
                    transform: "translateX(-50%)",
                    width: "60%",
                    height: 2,
                    borderRadius: 2,
                    background: "var(--zr-orange)",
                  }} />
                )}
              </Link>
            );
          })}
          {/* Sign Out — quieter, separated by extra gap */}
          <button onClick={signOut}
            className="shrink-0 whitespace-nowrap transition-opacity active:opacity-60 ml-3"
            style={{
              color: "rgba(60,60,67,0.5)",
              fontWeight: 500,
              fontSize: "15px",
              letterSpacing: "-0.012em",
              padding: "8px 2px 6px",
            }}>
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
            // Native iOS notification list. No heavy container tint, no
            // colored unread fills — unread is signaled by a small leading
            // orange dot (like Mail / Messages). Rows are edge-to-edge on
            // the canvas surface with hairline dividers; reads as a
            // scrollable list, not a floating card.
            <div className="absolute right-0 top-full mt-1.5 w-[340px] max-w-[calc(100vw-16px)] rounded-[14px] z-50 overflow-hidden"
              style={{
                background: "rgba(255,255,255,0.92)",
                backdropFilter: "saturate(180%) blur(20px)",
                WebkitBackdropFilter: "saturate(180%) blur(20px)",
                boxShadow: "0 6px 20px rgba(0,0,0,0.10), 0 1px 3px rgba(0,0,0,0.04)",
              }}>
              {/* Quiet header — list title + Mark all read. No divider; the
                  first row's hairline carries separation. */}
              <div className="flex items-center justify-between"
                style={{ padding: "12px 16px 8px" }}>
                <span style={{
                  fontSize: "15px",
                  fontWeight: 600,
                  color: "var(--zr-text-primary)",
                  letterSpacing: "-0.012em",
                }}>Notifications</span>
                {unreadCount > 0 && (
                  <button onClick={markAllRead}
                    style={{ color: "var(--zr-orange)", fontSize: "13px", fontWeight: 500 }}>
                    Mark all read
                  </button>
                )}
              </div>

              <div className="max-h-[420px] overflow-y-auto">
                {/* Reminder banner — normalized to a plain row with an
                    orange dot. Same visual weight as other notifications,
                    no colored fill. */}
                {reminderCount > 0 && (
                  <div
                    className="flex items-start gap-3 cursor-pointer transition-colors"
                    style={{
                      padding: "12px 16px",
                      borderTop: "0.5px solid rgba(60,60,67,0.08)",
                      background: "transparent",
                    }}
                    onClick={() => { setBellOpen(false); window.location.href = "/reminders"; }}
                    onMouseEnter={e => { e.currentTarget.style.background = "rgba(60,60,67,0.04)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
                    {/* Leading unread dot, aligned with title */}
                    <span style={{
                      flexShrink: 0,
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: "var(--zr-orange)",
                      marginTop: 7,
                    }} />
                    <div className="min-w-0 flex-1">
                      <div style={{
                        fontSize: "14px",
                        fontWeight: 600,
                        color: "var(--zr-text-primary)",
                        letterSpacing: "-0.012em",
                        lineHeight: 1.3,
                      }}>
                        {reminderCount} follow-up reminder{reminderCount !== 1 ? "s" : ""} due
                      </div>
                      <div style={{
                        fontSize: "13px",
                        color: "rgba(60,60,67,0.55)",
                        marginTop: 2,
                        lineHeight: 1.3,
                      }}>
                        Quotes, deposits, or customers need attention
                      </div>
                    </div>
                  </div>
                )}

                {notifications.length === 0 && reminderCount === 0 ? (
                  <div style={{
                    padding: "28px 16px",
                    textAlign: "center",
                    fontSize: "13px",
                    color: "rgba(60,60,67,0.5)",
                  }}>
                    No notifications yet
                  </div>
                ) : notifications.map((n, i) => (
                  <div key={n.id}
                    className="flex items-start gap-3 cursor-pointer transition-colors"
                    style={{
                      padding: "12px 16px",
                      borderTop: "0.5px solid rgba(60,60,67,0.08)",
                      background: "transparent",
                      // last item gets a bottom hairline too for visual closure
                      borderBottom: i === notifications.length - 1 ? "0.5px solid rgba(60,60,67,0.08)" : "none",
                    }}
                    onClick={() => {
                      if (!n.read) markRead(n.id);
                      if (n.link) { setBellOpen(false); window.location.href = n.link; }
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = "rgba(60,60,67,0.04)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
                    {/* Leading dot: orange if unread, invisible spacer if read,
                        so titles stay vertically aligned regardless of state. */}
                    <span style={{
                      flexShrink: 0,
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: n.read ? "transparent" : "var(--zr-orange)",
                      marginTop: 7,
                    }} />
                    <div className="min-w-0 flex-1">
                      <div style={{
                        fontSize: "14px",
                        fontWeight: n.read ? 500 : 600,
                        color: "var(--zr-text-primary)",
                        letterSpacing: "-0.012em",
                        lineHeight: 1.3,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}>{n.title}</div>
                      {n.message && (
                        <div style={{
                          fontSize: "13px",
                          color: "rgba(60,60,67,0.55)",
                          marginTop: 2,
                          lineHeight: 1.35,
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}>{n.message}</div>
                      )}
                      <div style={{
                        fontSize: "12px",
                        color: "rgba(60,60,67,0.42)",
                        marginTop: 4,
                        letterSpacing: "-0.005em",
                      }}>
                        {timeAgo(n.created_at)}
                      </div>
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
