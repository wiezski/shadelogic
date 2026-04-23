"use client";

/* ───────────────────────────────────────────────────────────────
   Internal admin page.

   Gated by the zr_admin cookie (same cookie used by /audit for
   rate-limit bypass and /api/test-email). If the cookie isn't
   present, the page shows a prompt explaining how to set it —
   instead of silently redirecting, because "nothing happened" is
   confusing when the bypass isn't wired up yet.

   What's here:
     • Bootstrap demo workspace + shared feedback team (one-shot)
     • List + create promo codes
     • Recent audit submissions with email-delivery status
     • Quick links for demo login and sharing the feedback team

   Keep this page functional and minimal. No fancy UI.
   ─────────────────────────────────────────────────────────────── */

import { useEffect, useState } from "react";
import Link from "next/link";

type BootstrapResult =
  | {
      ok: true;
      demo?: { ok: boolean; email?: string; password?: string; company_id?: string; how_to_enter?: string; error?: string };
      feedback_team?: { ok: boolean; company_id?: string; invite_url?: string; how_to_share?: string; error?: string };
    }
  | { ok: false; error: string };

type PromoCode = {
  code: string;
  label: string | null;
  plan: string;
  duration: string;
  max_users: number;
  used_by_company: string | null;
  used_at: string | null;
  expires_at: string | null;
  created_by: string | null;
  created_at: string | null;
};

type AuditRequest = {
  id: string;
  domain: string;
  email: string | null;
  score: number;
  email_sent: boolean;
  email_error: string | null;
  created_at: string;
};

const ORANGE = "#d65a31";
const TEXT_PRIMARY = "#1c1c1e";
const TEXT_SECONDARY = "rgba(60,60,67,0.65)";
const TEXT_MUTED = "rgba(60,60,67,0.45)";
const SURFACE_SOFT = "#fafaf9";
const HAIRLINE = "0.5px solid rgba(60,60,67,0.08)";

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  for (const part of document.cookie.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export default function AdminPage() {
  const [hasAdminCookie, setHasAdminCookie] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time cookie check on mount
    setHasAdminCookie(!!getCookie("zr_admin"));
  }, []);

  if (!hasAdminCookie) {
    return <NotAdmin />;
  }
  return <AdminDashboard />;
}

// ─── Not-admin landing ───────────────────────────────────────────

function NotAdmin() {
  return (
    <div style={{ background: "#fff", minHeight: "100vh", padding: "64px 20px" }}>
      <div style={{ maxWidth: 560, margin: "0 auto", color: TEXT_PRIMARY }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 10 }}>
          Admin access required
        </h1>
        <p style={{ fontSize: 15, color: TEXT_SECONDARY, lineHeight: 1.55, marginBottom: 18 }}>
          This page is gated by the same admin cookie used by the audit bypass.
          Set it by visiting:
        </p>
        <div
          style={{
            padding: "12px 16px",
            background: SURFACE_SOFT,
            borderRadius: 12,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 13,
            color: TEXT_PRIMARY,
            marginBottom: 20,
            wordBreak: "break-all",
          }}
        >
          https://zeroremake.com/audit?admin=&lt;your AUDIT_ADMIN_TOKEN&gt;
        </div>
        <p style={{ fontSize: 14, color: TEXT_SECONDARY, lineHeight: 1.55 }}>
          That sets the cookie for 30 days. Then refresh this page.
        </p>
      </div>
    </div>
  );
}

// ─── Main dashboard ──────────────────────────────────────────────

function AdminDashboard() {
  return (
    <div style={{ background: "#fff", minHeight: "100vh", padding: "48px 20px 80px" }}>
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <div style={{ marginBottom: 40 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: TEXT_MUTED,
              marginBottom: 6,
            }}
          >
            ZeroRemake · Internal
          </div>
          <h1
            style={{
              fontSize: 28,
              fontWeight: 800,
              letterSpacing: "-0.025em",
              color: TEXT_PRIMARY,
              margin: 0,
            }}
          >
            Admin
          </h1>
          <p style={{ fontSize: 14, color: TEXT_SECONDARY, marginTop: 6, lineHeight: 1.55 }}>
            Demo workspace, shared feedback team, promo codes, and recent audit
            submissions — all from one place.
          </p>
        </div>

        <BootstrapSection />
        <PromoCodesSection />
        <RecentAuditsSection />
        <DocsSection />
      </div>
    </div>
  );
}

// ─── Bootstrap section ───────────────────────────────────────────

function BootstrapSection() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BootstrapResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runBootstrap() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/bootstrap", { method: "POST" });
      const data = (await res.json()) as BootstrapResult;
      if (!res.ok || !("ok" in data) || data.ok === false) {
        setError((data as { error?: string })?.error || "Bootstrap failed");
      } else {
        setResult(data);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Section title="Demo workspace + shared feedback team">
      <p style={{ fontSize: 14, color: TEXT_SECONDARY, lineHeight: 1.55, marginBottom: 14 }}>
        One-click provisioning. Idempotent — clicking again just returns the
        same credentials; doesn&apos;t duplicate anything.
      </p>
      <button
        type="button"
        onClick={runBootstrap}
        disabled={loading}
        style={{
          background: ORANGE,
          color: "#fff",
          fontSize: 14,
          fontWeight: 600,
          padding: "9px 18px",
          borderRadius: 999,
          border: "none",
          cursor: loading ? "default" : "pointer",
          opacity: loading ? 0.7 : 1,
          letterSpacing: "-0.012em",
        }}
      >
        {loading ? "Setting up…" : "Create / refresh demo + team"}
      </button>
      {error && (
        <div style={{ marginTop: 14, padding: "10px 14px", background: "rgba(214,68,58,0.08)", color: "#c6443a", fontSize: 13, borderRadius: 10 }}>
          {error}
        </div>
      )}
      {result && "ok" in result && result.ok && (
        <div style={{ marginTop: 18, display: "grid", gap: 14 }}>
          {result.demo && (
            <Card>
              <CardLabel>Demo workspace</CardLabel>
              {result.demo.ok ? (
                <>
                  <KV k="Email" v={<code style={codeStyle}>{result.demo.email}</code>} />
                  <KV k="Password" v={<code style={codeStyle}>{result.demo.password}</code>} />
                  <p style={{ fontSize: 13, color: TEXT_SECONDARY, marginTop: 10, lineHeight: 1.55 }}>
                    {result.demo.how_to_enter}
                  </p>
                  <Link
                    href="/login"
                    style={{ color: ORANGE, fontSize: 13.5, fontWeight: 500, textDecoration: "underline" }}
                  >
                    Go to login →
                  </Link>
                </>
              ) : (
                <div style={{ color: "#c6443a", fontSize: 13 }}>Error: {result.demo.error}</div>
              )}
            </Card>
          )}
          {result.feedback_team && (
            <Card>
              <CardLabel>Steve Feedback Team</CardLabel>
              {result.feedback_team.ok ? (
                <>
                  <KV k="Company ID" v={<code style={codeStyle}>{result.feedback_team.company_id}</code>} />
                  <KV
                    k="Invite link"
                    v={
                      <a href={result.feedback_team.invite_url} style={{ color: ORANGE, wordBreak: "break-all" }}>
                        {result.feedback_team.invite_url}
                      </a>
                    }
                  />
                  <p style={{ fontSize: 13, color: TEXT_SECONDARY, marginTop: 10, lineHeight: 1.55 }}>
                    {result.feedback_team.how_to_share}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      if (result.feedback_team?.invite_url) {
                        navigator.clipboard.writeText(result.feedback_team.invite_url);
                      }
                    }}
                    style={{ color: ORANGE, fontSize: 13.5, fontWeight: 500, background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
                  >
                    Copy invite link
                  </button>
                </>
              ) : (
                <div style={{ color: "#c6443a", fontSize: 13 }}>Error: {result.feedback_team.error}</div>
              )}
            </Card>
          )}
        </div>
      )}
    </Section>
  );
}

// ─── Promo codes section ─────────────────────────────────────────

function PromoCodesSection() {
  const [codes, setCodes] = useState<PromoCode[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // new-code form state
  const [newCode, setNewCode] = useState("");
  const [newPlan, setNewPlan] = useState<"starter" | "professional" | "business">("business");
  const [newDuration, setNewDuration] = useState<"3mo" | "6mo" | "12mo" | "lifetime">("12mo");
  const [newMaxUsers, setNewMaxUsers] = useState(5);
  const [newLabel, setNewLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/promo-codes");
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setErr(data.error || "Failed to load");
      } else {
        setCodes(data.codes || []);
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createCode(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateMsg(null);
    try {
      const res = await fetch("/api/admin/promo-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: newCode,
          plan: newPlan,
          duration: newDuration,
          max_users: newMaxUsers,
          label: newLabel || null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setCreateMsg(data.error || "Create failed");
      } else {
        setCreateMsg(`Created: ${data.created.code}`);
        setNewCode("");
        setNewLabel("");
        load();
      }
    } catch (e) {
      setCreateMsg((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <Section title="Promo codes">
      <form onSubmit={createCode} style={{ marginBottom: 20, padding: "16px 18px", background: SURFACE_SOFT, borderRadius: 14 }}>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr", marginBottom: 10 }}>
          <LabeledField label="Code">
            <input
              value={newCode}
              onChange={(e) => setNewCode(e.target.value.toUpperCase())}
              placeholder="e.g. HOUTZ-FRIENDS"
              required
              style={inputStyle}
            />
          </LabeledField>
          <LabeledField label="Label (optional)">
            <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="e.g. Houtz — 12 months free" style={inputStyle} />
          </LabeledField>
          <LabeledField label="Plan">
            <select value={newPlan} onChange={(e) => setNewPlan(e.target.value as typeof newPlan)} style={inputStyle}>
              <option value="starter">Starter</option>
              <option value="professional">Professional</option>
              <option value="business">Business</option>
            </select>
          </LabeledField>
          <LabeledField label="Duration">
            <select value={newDuration} onChange={(e) => setNewDuration(e.target.value as typeof newDuration)} style={inputStyle}>
              <option value="3mo">3 months</option>
              <option value="6mo">6 months</option>
              <option value="12mo">12 months</option>
              <option value="lifetime">Lifetime</option>
            </select>
          </LabeledField>
          <LabeledField label="Max users">
            <input type="number" min={1} max={50} value={newMaxUsers} onChange={(e) => setNewMaxUsers(parseInt(e.target.value) || 5)} style={inputStyle} />
          </LabeledField>
        </div>
        <button
          type="submit"
          disabled={creating || !newCode.trim()}
          style={{
            background: ORANGE,
            color: "#fff",
            fontSize: 13.5,
            fontWeight: 600,
            padding: "8px 16px",
            borderRadius: 999,
            border: "none",
            cursor: creating || !newCode.trim() ? "default" : "pointer",
            opacity: creating || !newCode.trim() ? 0.5 : 1,
          }}
        >
          {creating ? "Creating…" : "Create code"}
        </button>
        {createMsg && (
          <div style={{ marginTop: 10, fontSize: 13, color: createMsg.startsWith("Created") ? "#1d8052" : "#c6443a" }}>
            {createMsg}
          </div>
        )}
      </form>

      {err && <div style={{ color: "#c6443a", fontSize: 13, marginBottom: 12 }}>{err}</div>}
      {loading && !codes && <div style={{ color: TEXT_MUTED, fontSize: 13 }}>Loading codes…</div>}

      {codes && codes.length > 0 && (
        <div style={{ borderTop: HAIRLINE }}>
          {codes.map((c) => (
            <div key={c.code} style={{ padding: "12px 4px", borderBottom: HAIRLINE, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", color: TEXT_PRIMARY }}>{c.code}</div>
                {c.label && <div style={{ fontSize: 12.5, color: TEXT_MUTED, marginTop: 2 }}>{c.label}</div>}
              </div>
              <div style={{ fontSize: 12.5, color: TEXT_SECONDARY, lineHeight: 1.5 }}>
                {c.plan} · {c.duration} · {c.max_users} users
              </div>
              <div style={{ fontSize: 12.5, color: c.used_by_company ? "#1d8052" : TEXT_MUTED, textAlign: "right" }}>
                {c.used_by_company
                  ? `Redeemed ${c.used_at ? new Date(c.used_at).toLocaleDateString() : ""}`
                  : "Unused"}
                {c.expires_at && c.used_by_company && (
                  <div style={{ fontSize: 11, color: TEXT_MUTED, marginTop: 2 }}>
                    Expires {new Date(c.expires_at).toLocaleDateString()}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

// ─── Recent audits section ───────────────────────────────────────

function RecentAuditsSection() {
  const [rows, setRows] = useState<AuditRequest[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/audits");
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setErr(data.error || "Failed to load");
        } else {
          setRows(data.rows || []);
        }
      } catch (e) {
        setErr((e as Error).message);
      }
    })();
  }, []);

  return (
    <Section title="Recent audit submissions">
      {err && <div style={{ color: "#c6443a", fontSize: 13 }}>{err}</div>}
      {!rows && !err && <div style={{ color: TEXT_MUTED, fontSize: 13 }}>Loading…</div>}
      {rows && rows.length === 0 && <div style={{ color: TEXT_MUTED, fontSize: 13 }}>No audits yet.</div>}
      {rows && rows.length > 0 && (
        <div style={{ borderTop: HAIRLINE }}>
          {rows.map((r) => (
            <div
              key={r.id}
              style={{
                padding: "12px 4px",
                borderBottom: HAIRLINE,
                display: "grid",
                gridTemplateColumns: "1.2fr 1fr 0.6fr 0.9fr",
                gap: 10,
                alignItems: "center",
              }}
            >
              <div style={{ fontSize: 13.5, fontWeight: 600, color: TEXT_PRIMARY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.domain}
              </div>
              <div style={{ fontSize: 12.5, color: TEXT_SECONDARY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.email || <span style={{ color: TEXT_MUTED }}>(no email)</span>}
              </div>
              <div style={{ fontSize: 12.5, color: TEXT_SECONDARY, fontVariantNumeric: "tabular-nums" }}>
                {r.score}/100
              </div>
              <div style={{ fontSize: 12, color: r.email_error ? "#c6443a" : r.email_sent ? "#1d8052" : TEXT_MUTED, textAlign: "right" }}>
                {r.email_error ? "Bounced" : r.email_sent ? "Delivered" : r.email ? "Pending" : "No email"}
                <div style={{ fontSize: 11, color: TEXT_MUTED, marginTop: 2 }}>
                  {new Date(r.created_at).toLocaleString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

// ─── Docs section ────────────────────────────────────────────────

function DocsSection() {
  return (
    <Section title="How this works">
      <div style={{ fontSize: 14, color: TEXT_SECONDARY, lineHeight: 1.7 }}>
        <p style={{ margin: "0 0 10px 0" }}>
          <strong style={{ color: TEXT_PRIMARY }}>Demo mode:</strong> use the
          credentials returned above. Sign in at <code style={codeStyle}>/login</code> and you&apos;ll land in a
          Business-plan workspace with no data.
        </p>
        <p style={{ margin: "0 0 10px 0" }}>
          <strong style={{ color: TEXT_PRIMARY }}>Shared Feedback Team:</strong> share the
          invite URL with your friends. Each signs up with their own email + password at
          <code style={codeStyle}> /signup?invite=&lt;team-id&gt;</code> and auto-joins the workspace.
          All changes are shared.
        </p>
        <p style={{ margin: "0 0 10px 0" }}>
          <strong style={{ color: TEXT_PRIMARY }}>Promo codes:</strong> a new signup
          enters the code at <code style={codeStyle}>/signup</code> → Promo field. Redeeming sets
          <code style={codeStyle}> companies.plan</code> and marks the code as used. 12-month codes set
          <code style={codeStyle}> promo_codes.expires_at</code> for future downgrade logic.
        </p>
        <p style={{ margin: 0 }}>
          <strong style={{ color: TEXT_PRIMARY }}>Admin gate:</strong> this page and every
          /api/admin/* route check the <code style={codeStyle}>zr_admin</code> cookie against
          <code style={codeStyle}> AUDIT_ADMIN_TOKEN</code>, or the caller&apos;s IP against
          <code style={codeStyle}> AUDIT_WHITELIST_IPS</code>. Public visitors see a “set the cookie first” prompt.
        </p>
      </div>
    </Section>
  );
}

// ─── Layout primitives ───────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 40 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.015em", color: TEXT_PRIMARY, margin: "0 0 14px 0" }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: "16px 18px", background: SURFACE_SOFT, borderRadius: 14 }}>
      {children}
    </div>
  );
}

function CardLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: TEXT_MUTED, marginBottom: 10 }}>
      {children}
    </div>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: 10, alignItems: "center", padding: "4px 0", fontSize: 13 }}>
      <div style={{ color: TEXT_SECONDARY, fontWeight: 500 }}>{k}</div>
      <div style={{ color: TEXT_PRIMARY }}>{v}</div>
    </div>
  );
}

function LabeledField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block", fontSize: 12, color: TEXT_SECONDARY, fontWeight: 500 }}>
      <span style={{ display: "block", marginBottom: 4 }}>{label}</span>
      {children}
    </label>
  );
}

const codeStyle: React.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: "13px",
  background: "rgba(60,60,67,0.06)",
  padding: "2px 6px",
  borderRadius: 6,
  color: TEXT_PRIMARY,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "rgba(60,60,67,0.06)",
  border: "none",
  borderRadius: 10,
  padding: "9px 12px",
  fontSize: 13.5,
  color: TEXT_PRIMARY,
  outline: "none",
  fontFamily: "inherit",
};
