"use client";

import { useState, useEffect, useCallback, createContext, useContext } from "react";

// ── Loading Skeleton ──────────────────────────────────────────
// Animated placeholder bars that pulse while data loads.
// Usage: <Skeleton w="120px" h="16px" /> or <Skeleton lines={3} />

export function Skeleton({ w, h = "16px", lines, className = "" }: {
  w?: string; h?: string; lines?: number; className?: string;
}) {
  if (lines) {
    return (
      <div className={className} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="zr-skeleton" style={{
            height: h,
            width: i === lines - 1 ? "60%" : "100%",
            borderRadius: "var(--zr-radius-sm)",
          }} />
        ))}
      </div>
    );
  }
  return (
    <div className={`zr-skeleton ${className}`} style={{
      width: w || "100%",
      height: h,
      borderRadius: "var(--zr-radius-sm)",
    }} />
  );
}

// Card-shaped skeleton for dashboard stat cards, product cards, etc.
export function SkeletonCard({ count = 3 }: { count?: number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "12px" }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{
          background: "var(--zr-surface-2)",
          borderRadius: "var(--zr-radius-md)",
          padding: "16px",
          border: "1px solid var(--zr-border)",
        }}>
          <Skeleton w="50%" h="12px" />
          <div style={{ height: 8 }} />
          <Skeleton w="70%" h="24px" />
          <div style={{ height: 8 }} />
          <Skeleton w="40%" h="12px" />
        </div>
      ))}
    </div>
  );
}

// Table-shaped skeleton
export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: "12px", padding: "12px 0", borderBottom: "1px solid var(--zr-border)" }}>
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} w="80%" h="12px" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: "12px", padding: "12px 0", borderBottom: "1px solid var(--zr-border)" }}>
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} w={c === 0 ? "90%" : "60%"} h="14px" />
          ))}
        </div>
      ))}
    </div>
  );
}


// ── Empty State ───────────────────────────────────────────────
// Shows when a list/table has no data. Consistent look across all pages.
// Usage: <EmptyState icon="📋" title="No customers yet" action="Add your first customer" />

const EMPTY_ICONS: Record<string, string> = {
  customers: "👥", jobs: "🔨", quotes: "📝", invoices: "📄",
  products: "📦", schedule: "📅", analytics: "📊", tasks: "✅",
  alerts: "🔔", library: "📚", payments: "💳", settings: "⚙️",
  search: "🔍", default: "📋",
};

export function EmptyState({ icon, title, subtitle, action, onAction, type }: {
  icon?: string;
  title: string;
  subtitle?: string;
  action?: string;
  onAction?: () => void;
  type?: keyof typeof EMPTY_ICONS;
}) {
  const emoji = icon || EMPTY_ICONS[type || "default"] || "📋";
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "48px 24px",
      textAlign: "center",
      color: "var(--zr-text-secondary)",
    }}>
      <div style={{ fontSize: "40px", marginBottom: "12px", opacity: 0.7 }}>{emoji}</div>
      <p style={{ fontWeight: 600, fontSize: "15px", color: "var(--zr-text-primary)", margin: "0 0 4px" }}>{title}</p>
      {subtitle && <p style={{ fontSize: "13px", margin: "0 0 16px", maxWidth: 320, lineHeight: 1.5 }}>{subtitle}</p>}
      {action && onAction && (
        <button onClick={onAction} style={{
          background: "var(--zr-orange)",
          color: "#fff",
          border: "none",
          borderRadius: "var(--zr-radius-sm)",
          padding: "8px 20px",
          fontSize: "13px",
          fontWeight: 600,
          cursor: "pointer",
        }}>
          {action}
        </button>
      )}
    </div>
  );
}


// ── Error Card ────────────────────────────────────────────────
// Shown when data fetch fails. Offers retry.
// Usage: <ErrorCard message="Couldn't load customers" onRetry={loadCustomers} />

export function ErrorCard({ message, onRetry }: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "32px 24px",
      textAlign: "center",
      color: "var(--zr-error)",
    }}>
      <div style={{ fontSize: "32px", marginBottom: "8px" }}>⚠️</div>
      <p style={{ fontWeight: 600, fontSize: "14px", margin: "0 0 4px" }}>Something went wrong</p>
      <p style={{ fontSize: "13px", color: "var(--zr-text-secondary)", margin: "0 0 16px", maxWidth: 320 }}>
        {message || "We couldn't load this data. Please try again."}
      </p>
      {onRetry && (
        <button onClick={onRetry} style={{
          background: "var(--zr-surface-3)",
          color: "var(--zr-text-primary)",
          border: "1px solid var(--zr-border)",
          borderRadius: "var(--zr-radius-sm)",
          padding: "8px 20px",
          fontSize: "13px",
          fontWeight: 500,
          cursor: "pointer",
        }}>
          Try Again
        </button>
      )}
    </div>
  );
}


// ── Toast Notification System ─────────────────────────────────
// Global toast system with context.
// Wrap app in <ToastProvider>, then useToast() in any component.

type Toast = {
  id: number;
  message: string;
  type: "success" | "error" | "info" | "warning";
};

type ToastCtx = {
  toast: (message: string, type?: Toast["type"]) => void;
};

const ToastContext = createContext<ToastCtx>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

let toastIdCounter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: Toast["type"] = "success") => {
    const id = ++toastIdCounter;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      {/* Toast container */}
      {toasts.length > 0 && (
        <div style={{
          position: "fixed",
          bottom: 20,
          right: 20,
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          maxWidth: "360px",
        }}>
          {toasts.map(t => (
            <div
              key={t.id}
              onClick={() => removeToast(t.id)}
              className="zr-toast-enter"
              style={{
                padding: "12px 16px",
                borderRadius: "var(--zr-radius-md)",
                boxShadow: "var(--zr-shadow-lg)",
                fontSize: "13px",
                fontWeight: 500,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                background: t.type === "success" ? "#ecfdf5" :
                            t.type === "error" ? "#fef2f2" :
                            t.type === "warning" ? "#fffbeb" : "#eff6ff",
                color: t.type === "success" ? "#065f46" :
                       t.type === "error" ? "#991b1b" :
                       t.type === "warning" ? "#92400e" : "#1e40af",
                border: `1px solid ${
                  t.type === "success" ? "#a7f3d0" :
                  t.type === "error" ? "#fecaca" :
                  t.type === "warning" ? "#fde68a" : "#bfdbfe"
                }`,
              }}
            >
              <span>{t.type === "success" ? "✓" : t.type === "error" ? "✕" : t.type === "warning" ? "!" : "ℹ"}</span>
              <span>{t.message}</span>
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}


// ── Page Wrapper ──────────────────────────────────────────────
// Consistent padding + max-width + mobile-safe container for all pages.
// Usage: <PageShell title="Products" subtitle="3 items">…</PageShell>

export function PageShell({ children, title, subtitle, actions, noPad }: {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  noPad?: boolean;
}) {
  return (
    <main style={{
      minHeight: "calc(100vh - 56px)",
      background: "var(--zr-black)",
      padding: noPad ? 0 : undefined,
    }}>
      <div style={{
        maxWidth: 1200,
        margin: "0 auto",
        padding: noPad ? 0 : "16px",
      }}>
        {title && (
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "8px",
            marginBottom: "16px",
          }}>
            <div>
              <h1 style={{
                fontSize: "20px",
                fontWeight: 700,
                color: "var(--zr-text-primary)",
                margin: 0,
                fontFamily: "var(--zr-font-display)",
              }}>{title}</h1>
              {subtitle && (
                <p style={{ fontSize: "13px", color: "var(--zr-text-secondary)", margin: "2px 0 0" }}>{subtitle}</p>
              )}
            </div>
            {actions && <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>{actions}</div>}
          </div>
        )}
        {children}
      </div>
    </main>
  );
}
