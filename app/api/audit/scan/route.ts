// POST /api/audit/scan
//
// The Layer 1 endpoint for the /audit lead magnet. Takes a URL, runs
// the scanner, inserts a row in audit_requests, and returns the
// public-safe summary (score + top 3 + quick insights).
//
// The full findings list stays server-side until /api/audit/unlock
// is called with an email (Layer 2).

import { NextRequest, NextResponse } from "next/server";
import { scanUrl, normalizeUrl } from "@/lib/audit/scanner";
import { getAuditAdminClient } from "@/lib/audit/db";

export const runtime = "nodejs";
// Allow up to 20s (scan itself is capped to ~10s + sidecar fetches + DB).
export const maxDuration = 20;

interface ScanBody {
  url: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  referer?: string;
}

const RATE_LIMIT_PER_IP_PER_DAY = 10;
const CACHE_WINDOW_HOURS = 24;

function getClientIp(req: NextRequest): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() ?? null;
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return null;
}

function summarize(report: Awaited<ReturnType<typeof scanUrl>>) {
  // Public payload for Layer 1. We include the full findings array so
  // the client can render a dimmed/blurred preview behind the email gate
  // (the findings aren't sensitive — they're checks on a public URL). The
  // email capture is a psychological unlock, not a data gate.
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
    // Count of non-top-3 findings — used for copy like "N total issues"
    additionalFindings: Math.max(0, report.findings.length - report.topThree.length),
  };
}

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
      { error: "That doesn't look like a valid public website URL." },
      { status: 400 },
    );
  }

  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent") || null;
  const admin = getAuditAdminClient();

  // Rate limit by IP (skip if we couldn't resolve one)
  if (ip) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("audit_requests")
      .select("id", { count: "exact", head: true })
      .eq("ip", ip)
      .gte("created_at", since);
    if ((count ?? 0) >= RATE_LIMIT_PER_IP_PER_DAY) {
      return NextResponse.json(
        {
          error:
            "You've hit the daily scan limit. Try again tomorrow or reach out directly — we can run a deeper check for you.",
        },
        { status: 429 },
      );
    }
  }

  // Cache window: if this same domain was scanned recently (regardless of
  // who asked), return that result instead of hitting the site again. Keeps
  // us from hammering any one site and from paying for duplicate work.
  const cacheSince = new Date(Date.now() - CACHE_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
  const { data: cached } = await admin
    .from("audit_requests")
    .select("id, score, findings, top_three, url, domain, created_at")
    .eq("domain", normalized.domain)
    .gte("created_at", cacheSince)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let report: Awaited<ReturnType<typeof scanUrl>>;

  if (cached && cached.findings) {
    // Reuse cached scan but create a new submission row so we track each
    // unique visitor's intent (they'll unlock under their own row).
    report = {
      score: cached.score,
      grade: (cached.score >= 80
        ? "Strong"
        : cached.score >= 60
          ? "Solid"
          : cached.score >= 40
            ? "Needs Work"
            : "Critical Gaps") as Awaited<ReturnType<typeof scanUrl>>["grade"],
      domain: cached.domain,
      url: cached.url,
      pageTitle: null,
      findings: cached.findings,
      topThree: cached.top_three || [],
      quickInsights: [],
      scannedAt: cached.created_at,
    };
    // Regenerate topThree / quickInsights fresh from cached findings so we
    // don't rely on old shape. But if they're there, keep them.
    if (!report.topThree || report.topThree.length === 0) {
      // Fallback: recompute from findings
      report.topThree = (cached.findings as typeof report.findings)
        .filter((f) => f.severity !== "pass")
        .sort((a, b) => b.maxPoints - b.score - (a.maxPoints - a.score))
        .slice(0, 3);
    }
  } else {
    try {
      report = await scanUrl(rawUrl);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown scan error";
      return NextResponse.json({ error: msg }, { status: 422 });
    }
  }

  // Insert submission row — one per scan, each prospect gets their own row
  // even if the underlying findings are cached.
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
    // We have a valid report — don't fail the user-facing response just
    // because we couldn't log. Return the report with a warning.
    console.error("[audit/scan] insert failed:", insertErr);
    return NextResponse.json(summarize(report));
  }

  return NextResponse.json({
    id: inserted.id,
    ...summarize(report),
  });
}
