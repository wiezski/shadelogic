"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "../lib/supabase";
import { useAuth } from "./auth-provider";

const CATEGORIES = [
  { value: "bug", label: "Bug Report" },
  { value: "feature", label: "Feature Request" },
  { value: "improvement", label: "Improvement" },
  { value: "praise", label: "Love It!" },
  { value: "other", label: "Other" },
];

// Hide on public-facing portals
const HIDE_ROUTES = ["/b/", "/q/", "/i/", "/intake", "/login", "/signup"];

export function FeedbackWidget() {
  const { user } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [category, setCategory] = useState("feature");
  const [message, setMessage] = useState("");
  const [page, setPage] = useState("");
  const [saving, setSaving] = useState(false);
  const [sent, setSent] = useState(false);

  const isPublicRoute = HIDE_ROUTES.some(r => pathname.startsWith(r));
  if (!user || isPublicRoute) return null;

  async function submit() {
    if (!message.trim()) return;
    setSaving(true);
    await supabase.from("app_feedback").insert([{
      rating: rating || null,
      category,
      message: message.trim(),
      page_url: window.location.pathname,
      user_agent: navigator.userAgent,
    }]);
    setSaving(false);
    setSent(true);
    setTimeout(() => {
      setOpen(false);
      setSent(false);
      setRating(0);
      setMessage("");
      setCategory("feature");
    }, 2000);
  }

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed z-50 rounded-full shadow-lg transition-all hover:scale-105"
        style={{
          bottom: 20, right: 20, width: 44, height: 44,
          background: "var(--zr-primary)", color: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 20, border: "none", cursor: "pointer",
        }}
        title="Send feedback"
      >
        {open ? "×" : "💬"}
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed z-50 rounded-xl shadow-2xl"
          style={{
            bottom: 72, right: 20, width: 320,
            background: "var(--zr-surface-1)",
            border: "1px solid var(--zr-border)",
            overflow: "hidden",
          }}>

          {/* Header */}
          <div className="px-4 py-3" style={{ background: "var(--zr-primary)" }}>
            <div className="text-sm font-bold text-white">Share Feedback</div>
            <div className="text-xs text-white/70 mt-0.5">Help us improve ZeroRemake</div>
          </div>

          {sent ? (
            <div className="p-6 text-center">
              <div className="text-2xl mb-2">✓</div>
              <div className="text-sm font-semibold" style={{ color: "var(--zr-text-primary)" }}>Thanks for your feedback!</div>
              <div className="text-xs mt-1" style={{ color: "var(--zr-text-muted)" }}>We read every submission.</div>
            </div>
          ) : (
            <div className="p-4 flex flex-col gap-3">
              {/* Star rating */}
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: "var(--zr-text-muted)" }}>
                  Rating (optional)
                </label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={n}
                      onClick={() => setRating(n)}
                      onMouseEnter={() => setHoverRating(n)}
                      onMouseLeave={() => setHoverRating(0)}
                      style={{
                        fontSize: 22, background: "none", border: "none", cursor: "pointer",
                        color: n <= (hoverRating || rating) ? "#f59e0b" : "var(--zr-border)",
                        transition: "color 0.1s",
                      }}>
                      ★
                    </button>
                  ))}
                </div>
              </div>

              {/* Category */}
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: "var(--zr-text-muted)" }}>Category</label>
                <div className="flex flex-wrap gap-1.5">
                  {CATEGORIES.map(c => (
                    <button key={c.value}
                      onClick={() => setCategory(c.value)}
                      className="text-xs px-2.5 py-1 rounded-full font-medium transition-colors"
                      style={{
                        background: category === c.value ? "var(--zr-primary)" : "var(--zr-surface-2)",
                        color: category === c.value ? "#fff" : "var(--zr-text-secondary)",
                        border: `1px solid ${category === c.value ? "var(--zr-primary)" : "var(--zr-border)"}`,
                      }}>
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Message */}
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: "var(--zr-text-muted)" }}>Message</label>
                <textarea value={message} onChange={e => setMessage(e.target.value)}
                  rows={3}
                  placeholder="Tell us what's on your mind..."
                  className="w-full text-sm rounded px-2.5 py-2 resize-none"
                  style={{ background: "var(--zr-surface-2)", color: "var(--zr-text-primary)", border: "1px solid var(--zr-border)" }} />
              </div>

              <button onClick={submit} disabled={saving || !message.trim()}
                className="text-sm px-4 py-2 rounded font-medium transition-colors w-full"
                style={{
                  background: "var(--zr-primary)", color: "#fff",
                  opacity: saving || !message.trim() ? 0.5 : 1,
                }}>
                {saving ? "Sending..." : "Send Feedback"}
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
