// POST /api/audit/scan
//
// Layer 1 endpoint for the /audit lead magnet. Takes a URL, runs the
// scanner (or returns a cached result), inserts a row in audit_requests,
// and returns score + full findings + quickInsights.
//
// Rate limiting is SOFT by design:
//   • no hard block — every scan is allowed through
//   • above SOFT_NOTICE_THRESHOLD scans/IP/day we include `softLimit: true`
//     so the client can display a subtle, non-blocking notice after results
//   • above HARD_SLOWDOWN_THRESHOLD we add a small artificial delay to
//     discourage bots, but STILL return real results
//
// Admin bypass — all limits and cache checks are skipped if:
//   • client IP is in AUDIT_WHITELIST_IPS (comma-separated env var), OR
//   • cookie zr_admin matches AUDIT_ADMIN_TOKEN env var
//
// Cache — default behavior is to reuse a recent (24h) scan for the same
// domain. Client can force a fresh scan by sending `force: true` in the
// request body ("Re-scan site" button).

import { NextRequest, NextResponse } from "next/server";
import { scanUrl, normalizeUrl, buildQuickInsights, BlockedScanError } from "@/lib/audit/scanner";
import type { Finding } from "@/lib/audit/types";
import { getAuditAdminClient } from "@/lib/audit/db";

export const runtime = "nodejs";
export const maxDuration = 20;

interface ScanBody {
  url: string;
  force?: boolean;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  referer?: string;
}

// Soft-notice kicks in above this many scans/IP in 24h. We still serve
// every request — this is just a hint so the UI can show a subtle note.
const SOFT_NOTICE_THRESHOLD = 15;
// Above this level, we add a small artificial delay to discourage bots
// without degrading the real-user experience.
const HARD_SLOWDOWN_THRESHOLD = 60;
const CACHE_WINDOW_HOURS = 24;

// ── Helpers ─────────────────────────────────────────────────────────

function getClientIp(req: NextRequest): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() ?? null;
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return null;
}

function getCookie(req: NextRequest, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function isAdminRequest(req: NextRequest, ip: string | null): boolean {
  // IP allow-list
  const whitelist = (process.env.AUDIT_WHITELIST_IPS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (ip && whitelist.includes(ip)) return true;

  // Cookie-based admin token
  const token = process.env.AUDIT_ADMIN_TOKEN;
  if (token) {
    const cookieVal = getCookie(req, "zr_admin");
    if (cookieVal && cookieVal === token) return true;
  }

  return false;
}

function summarize(
  report: Awaited<ReturnType<typeof scanUrl>>,
  opts: { fromCache: boolean; softLimit?: boolean; rateLimitNote?: string | null },
) {
  return {
    score: report.score,
    grade: report.grade,
    domain: report.domain,
    pageTitle: report.pageTitle,
    findings: report.findings,
    topThree: report.topThree.map((f) => ({
      id: f.id,
      title: f.title,
      detail: f.detail,
      severity: f.severity,
    })),
    quickInsights: report.quickInsights,
    scannedAt: report.scannedAt,
    additionalFindings: Math.max(0, report.findings.length - report.topThree.length),
    fromCache: opts.fromCache,
    softLimit: opts.softLimit ?? false,
    rateLimitNote: opts.rateLimitNote ?? null,
  };
}

function gradeFor(score: number): Awaited<ReturnType<typeof scanUrl>>["grade"] {
  if (score >= 80) return "Strong";
  if (score >= 60) return "Solid";
  if (score >= 40) return "Needs Work";
  return "Critical Gaps";
}

// ── Handler ─────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: ScanBody;
  try {
    body = (await req.json()) as ScanBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawUrl = body?.url?.trim();
  if (!rawUrl) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  const normalized = normalizeUrl(rawUrl);
  if (!normalized) {
    return NextResponse.json(
      { error: "That doesn’t look like a valid public website URL." },
      { status: 400 },
    );
  }

  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent") || null;
  const admin = getAuditAdminClient();
  const isAdmin = isAdminRequest(req, ip);
  const forceFresh = body.force === true || isAdmin;

  // Soft-limit check — NEVER blocks. Only used to flag the response so
  // the UI can display a subtle note.
  let softLimit = false;
  let rateLimitNote: string | null = null;
  let scanCountToday = 0;

  if (ip && !isAdmin) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("audit_requests")
      .select("id", { count: "exact", head: true })
      .eq("ip", ip)
      .gte("created_at", since);
    scanCountToday = count ?? 0;

    if (scanCountToday >= SOFT_NOTICE_THRESHOLD) {
      softLimit = true;
      rateLimitNote =
        "You’ve run several scans today — still open, but full reports may be limited.";
    }
    // Bot mitigation: high-volume IPs get a small delay. Still resolves
    // normally — we just slow them down.
    if (scanCountToday >= HARD_SLOWDOWN_THRESHOLD) {
      await new Promise((r) => setTimeout(r, 1200));
    }
  }

  // Cache lookup — only when not forcing a fresh scan.
  const cacheSince = new Date(Date.now() - CACHE_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
  const { data: cached } = forceFresh
    ? { data: null as null }
    : await admin
        .from("audit_requests")
        .select("id, score, findings, top_three, url, domain, created_at")
        .eq("domain", normalized.domain)
        .gte("created_at", cacheSince)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

  let report: Awaited<ReturnType<typeof scanUrl>>;
  let fromCache = false;

  if (cached && cached.findings) {
    fromCache = true;
    const cachedFindings = cached.findings as Finding[];
    let topThree = cached.top_three as Finding[] | null;
    if (!topThree || topThree.length === 0) {
      topThree = cachedFindings
        .filter((f) => f.severity !== "pass")
        .sort((a, b) => (b.maxPoints - b.score) - (a.maxPoints - a.score))
        .slice(0, 3);
    }

    report = {
      score: cached.score,
      grade: gradeFor(cached.score),
      domain: cached.domain,
      url: cached.url,
      pageTitle: null,
      findings: cachedFindings,
      topThree,
      quickInsights: buildQuickInsights(cachedFindings, cached.score, cached.domain),
      scannedAt: cached.created_at,
    };
  } else {
    try {
      report = await scanUrl(rawUrl);
    } catch (e) {
      // Blocked-by-target failures get a `blocked: true` flag so the UI can
      // offer a manual-review email-capture flow instead of a generic error.
      // Other scan errors (timeouts, server 5xx, network) keep the existing
      // generic-error JSON shape.
      if (e instanceof BlockedScanError) {
        return NextResponse.json(
          { error: e.message, blocked: true, domain: e.domain, url: rawUrl },
          { status: 422 },
        );
      }
      const msg = e instanceof Error ? e.message : "Unknown scan error";
      return NextResponse.json({ error: msg }, { status: 422 });
    }
  }

  // Insert submission row (admin scans also get logged so you can still
  // see what was tested — feature, not a leak).
  const insertRow = {
    url: normalized.url,
    domain: normalized.domain,
    score: report.score,
    findings: report.findings,
    top_three: report.topThree,
    ip,
    user_agent: userAgent,
    referer: body.referer ?? null,
    utm_source: body.utm_source ?? null,
    utm_medium: body.utm_medium ?? null,
    utm_campaign: body.utm_campaign ?? null,
    utm_term: body.utm_term ?? null,
    utm_content: body.utm_content ?? null,
  };

  const { data: inserted, error: insertErr } = await admin
    .from("audit_requests")
    .insert(insertRow)
    .select("id")
    .single();

  if (insertErr || !inserted) {
    console.error("[audit/scan] insert failed:", insertErr);
    return NextResponse.json(summarize(report, { fromCache, softLimit, rateLimitNote }));
  }

  return NextResponse.json({
    id: inserted.id,
    ...summarize(report, { fromCache, softLimit, rateLimitNote }),
  });
}
