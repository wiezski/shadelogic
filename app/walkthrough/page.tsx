"use client";

/*
 * /walkthrough — dedicated booking page for the 20-minute website
 * walkthrough call. Reachable from:
 *   - The "Schedule a quick call" CTA in the audit-report email
 *   - The "See what I'd fix first" CTA on the /audit results page
 *   - Direct links from sales/social
 *
 * Mirrors /audit's visual style (same nav, same color tokens, same
 * surface treatment) so the experience feels continuous. Posts to
 * /api/walkthrough/request which stores the lead and notifies the owner.
 *
 * Form is intentionally minimal — Name (required), Phone (optional),
 * Notes (optional). All placeholders are obvious-non-data labels so
 * nothing reads like pre-filled real customer info.
 */

import { useState } from "react";
import Link from "next/link";

const ORANGE = "#d65a31";
const TEXT_PRIMARY = "#1c1c1e";
const TEXT_SECONDARY = "rgba(60,60,67,0.6)";
const TEXT_MUTED = "rgba(60,60,67,0.45)";
const SURFACE_SOFT = "#fafaf9";
const INPUT_FILL = "rgba(60,60,67,0.06)";
const HAIRLINE = "0.5px solid rgba(60,60,67,0.08)";

function ZRIcon({ size = 28 }: { size?: number }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: 8,
        background: ORANGE,
        color: "#fff",
        fontWeight: 800,
        fontSize: size * 0.5,
        letterSpacing: "-0.02em",
        fontFamily: "var(--zr-font-display)",
      }}
    >
      Z
    </span>
  );
}

function Nav() {
  return (
    <nav
      style={{
        position: "sticky",
        top: 0,
        zIndex: 10,
        background: "rgba(255,255,255,0.9)",
        backdropFilter: "saturate(140%) blur(12px)",
        WebkitBackdropFilter: "saturate(140%) blur(12px)",
        borderBottom: HAIRLINE,
      }}
    >
      <div
        style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: "14px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <ZRIcon size={28} />
          <span
            style={{
              fontFamily: "var(--zr-font-display)",
              fontWeight: 800,
              letterSpacing: "-0.01em",
              fontSize: 16,
              color: TEXT_PRIMARY,
            }}
          >
            Zero<span style={{ color: ORANGE }}>Remake</span>
          </span>
        </Link>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 16 }}>
          <Link
            href="/"
            style={{
              fontSize: 14,
              color: TEXT_SECONDARY,
              textDecoration: "none",
              letterSpacing: "-0.012em",
            }}
          >
            Home
          </Link>
          <Link
            href="/audit"
            style={{
              fontSize: 14,
              color: TEXT_SECONDARY,
              textDecoration: "none",
              letterSpacing: "-0.012em",
            }}
          >
            Free audit
          </Link>
        </div>
      </div>
    </nav>
  );
}

export default function WalkthroughPage() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Please add your name so we know who to reach out to.");
      return;
    }
    setSubmitting(true);
    try {
      const utm = typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams();
      const res = await fetch("/api/walkthrough/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim() || undefined,
          notes: notes.trim() || undefined,
          utm_source: utm.get("utm_source") || undefined,
          utm_medium: utm.get("utm_medium") || undefined,
          utm_campaign: utm.get("utm_campaign") || undefined,
          utm_term: utm.get("utm_term") || undefined,
          utm_content: utm.get("utm_content") || undefined,
          referer: typeof document !== "undefined" ? document.referrer : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Couldn't save your request. Try again in a moment.");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Network error. Try again in a moment.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ background: "#fff", color: TEXT_PRIMARY, minHeight: "100vh" }}>
      <Nav />
      <main style={{ padding: "48px 20px 96px" }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          {/* Hero */}
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div
              style={{
                fontFamily: "var(--zr-font-display)",
                color: ORANGE,
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                marginBottom: 18,
              }}
            >
              20 minutes · No pitch
            </div>
            <h1
              style={{
                fontFamily: "var(--zr-font-display)",
                fontSize: 32,
                fontWeight: 800,
                letterSpacing: "-0.025em",
                lineHeight: 1.15,
                color: TEXT_PRIMARY,
                margin: 0,
              }}
            >
              Walkthrough your website with ZeroRemake
            </h1>
            <p
              style={{
                fontSize: 16,
                color: TEXT_SECONDARY,
                lineHeight: 1.55,
                marginTop: 14,
                letterSpacing: "-0.005em",
              }}
            >
              I&apos;ll walk through your site and show exactly what I&apos;d fix
              first based on what actually drives leads. 20 minutes, no pitch.
            </p>
          </div>

          {/* Form / success state */}
          {submitted ? (
            <div
              style={{
                padding: "28px 24px",
                background: SURFACE_SOFT,
                borderRadius: 20,
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: TEXT_PRIMARY,
                  letterSpacing: "-0.015em",
                  lineHeight: 1.35,
                  marginBottom: 8,
                }}
              >
                Got it — we&apos;ll reach out within 24 hours to schedule.
              </div>
              <div
                style={{
                  fontSize: 14,
                  color: TEXT_SECONDARY,
                  letterSpacing: "-0.005em",
                  lineHeight: 1.55,
                }}
              >
                If you left a phone number we&apos;ll call. Otherwise check the
                email you used when you signed up for anything from ZeroRemake.
              </div>
            </div>
          ) : (
            <form
              onSubmit={submit}
              style={{
                padding: "28px 24px 24px",
                background: SURFACE_SOFT,
                borderRadius: 20,
              }}
            >
              <div style={{ display: "grid", gap: 14 }}>
                <Field label="Your name" required>
                  <input
                    type="text"
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    disabled={submitting}
                    style={inputStyle}
                  />
                </Field>
                <Field label="Phone (optional)">
                  <input
                    type="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(555) 555-5555"
                    disabled={submitting}
                    style={inputStyle}
                  />
                </Field>
                <Field label="Anything specific to cover? (optional)">
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. specific pages, recent changes, what feels slow"
                    disabled={submitting}
                    rows={3}
                    style={{ ...inputStyle, resize: "vertical", minHeight: 80, lineHeight: 1.5 }}
                  />
                </Field>
              </div>

              <button
                type="submit"
                disabled={submitting}
                style={{
                  marginTop: 18,
                  background: ORANGE,
                  color: "#fff",
                  fontSize: 15,
                  fontWeight: 600,
                  padding: "12px 22px",
                  borderRadius: 14,
                  border: "none",
                  cursor: submitting ? "default" : "pointer",
                  letterSpacing: "-0.012em",
                  width: "100%",
                  opacity: submitting ? 0.7 : 1,
                }}
                className="active:scale-[0.98]"
              >
                {submitting ? "Sending…" : "Request the walkthrough"}
              </button>

              {error && (
                <div
                  style={{
                    marginTop: 12,
                    padding: "10px 14px",
                    background: "rgba(214,68,58,0.08)",
                    color: "#c6443a",
                    fontSize: 13,
                    borderRadius: 10,
                    letterSpacing: "-0.005em",
                  }}
                >
                  {error}
                </div>
              )}

              <div
                style={{
                  marginTop: 12,
                  fontSize: 12.5,
                  color: TEXT_MUTED,
                  letterSpacing: "-0.003em",
                  textAlign: "center",
                }}
              >
                No spam. Just the call.
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}

// ── Small UI helpers ───────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: INPUT_FILL,
  border: "none",
  outline: "none",
  padding: "11px 14px",
  fontSize: 15,
  color: TEXT_PRIMARY,
  letterSpacing: "-0.012em",
  borderRadius: 12,
  fontFamily: "inherit",
};

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "block" }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: TEXT_MUTED,
          marginBottom: 8,
          paddingLeft: 4,
        }}
      >
        {label}
        {required && <span style={{ color: ORANGE, marginLeft: 4 }}>*</span>}
      </div>
      {children}
    </label>
  );
}
