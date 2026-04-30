// The audit scanner orchestrator.
//
// Entry point: scanUrl(url) — fetches the URL, parses the HTML, runs
// all 15 checks, and returns a structured AuditReport.
//
// Timeouts and safety:
//   - 10s hard timeout on the primary HTML fetch.
//   - 4s timeouts on supporting fetches (robots.txt, sitemap.xml).
//   - Follows redirects (default fetch behavior).
//   - Uses a real-ish User-Agent so sites don't treat us as a bot.

import * as cheerio from "cheerio";
import type { AuditReport, Finding, ScanContext } from "./types";
import { ALL_CHECKS } from "./checks";

const USER_AGENT =
  "Mozilla/5.0 (compatible; ZeroRemakeAuditBot/1.0; +https://zeroremake.com/audit)";

const FETCH_TIMEOUT_MS = 10_000;
const SIDECAR_FETCH_TIMEOUT_MS = 4_000;

// ── URL normalization ───────────────────────────────────────────────

export function normalizeUrl(input: string): { url: string; domain: string } | null {
  if (!input) return null;
  let raw = input.trim();
  if (!/^https?:\/\//i.test(raw)) {
    raw = "https://" + raw;
  }
  try {
    const u = new URL(raw);
    // Block intranet / localhost / IPs to avoid SSRF
    const host = u.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host.startsWith("127.") ||
      host.startsWith("10.") ||
      host.startsWith("192.168.") ||
      host.startsWith("169.254.") ||
      host.endsWith(".local") ||
      host.endsWith(".internal")
    ) {
      return null;
    }
    // Must look like a domain (at least one dot)
    if (!host.includes(".")) return null;
    // Strip www.
    const domain = host.replace(/^www\./, "");
    return { url: u.toString(), domain };
  } catch {
    return null;
  }
}

// ── Fetch with timeout ──────────────────────────────────────────────

async function fetchWithTimeout(
  url: string,
  ms: number,
  opts: RequestInit = {},
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, {
      ...opts,
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        ...(opts.headers || {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

// ── Sidecar fetches ─────────────────────────────────────────────────

async function checkSitemap(origin: string): Promise<ScanContext["sitemap"]> {
  try {
    const res = await fetchWithTimeout(`${origin}/sitemap.xml`, SIDECAR_FETCH_TIMEOUT_MS);
    if (!res.ok) return { found: false };
    const body = await res.text();
    const urlCount = (body.match(/<url>/g) || []).length;
    return { found: true, urlCount };
  } catch {
    return { found: false };
  }
}

async function checkRobots(origin: string): Promise<ScanContext["robots"]> {
  try {
    const res = await fetchWithTimeout(`${origin}/robots.txt`, SIDECAR_FETCH_TIMEOUT_MS);
    return { found: res.ok };
  } catch {
    return { found: false };
  }
}

// ── Scoring / grading ───────────────────────────────────────────────

function computeGrade(score: number): AuditReport["grade"] {
  if (score >= 80) return "Strong";
  if (score >= 60) return "Solid";
  if (score >= 40) return "Needs Work";
  return "Critical Gaps";
}

// Pick top 3 findings by: non-pass first, then by points lost (maxPoints - score),
// then by severity priority.
function pickTopThree(findings: Finding[]): Finding[] {
  const severityRank: Record<Finding["severity"], number> = {
    critical: 0,
    important: 1,
    minor: 2,
    pass: 99,
  };
  return [...findings]
    .filter((f) => f.severity !== "pass")
    .sort((a, b) => {
      const sA = severityRank[a.severity];
      const sB = severityRank[b.severity];
      if (sA !== sB) return sA - sB;
      const lostA = a.maxPoints - a.score;
      const lostB = b.maxPoints - b.score;
      return lostB - lostA;
    })
    .slice(0, 3);
}

// Build 3-5 short quick-insight one-liners for Layer 1.
// Direct, outcome-focused. No vague "has gaps" phrasing.
// Exported so cached-scan responses can regenerate insights from stored findings.
export function buildQuickInsights(findings: Finding[], score: number, domain: string): string[] {
  const insights: string[] = [];

  // Opening line — calibrated to the score band, outcome-focused.
  if (score >= 80) {
    insights.push(`${domain} is in good shape. A few refinements could widen the lead coming in.`);
  } else if (score >= 60) {
    insights.push(`${domain} is leaving traffic — and leads — on the table every week.`);
  } else if (score >= 40) {
    insights.push(`Homeowners searching for you are finding your competitors first. That’s fixable.`);
  } else {
    insights.push(`Right now, ${domain} is close to invisible to homeowners searching for your services.`);
  }

  // City pages — almost always relevant for a local installer
  const cityPages = findings.find((f) => f.id === "city_pages");
  if (cityPages && cityPages.score < cityPages.maxPoints / 2) {
    insights.push("No city pages means national brands are ranking for “blinds in [your town]” instead of you.");
  }

  // LocalBusiness schema
  const schema = findings.find((f) => f.id === "local_business_schema");
  if (schema && schema.score === 0) {
    insights.push("You’re missing the signals that put local businesses in Google’s map pack.");
  }

  // Phone visibility
  const phone = findings.find((f) => f.id === "phone_visibility");
  if (phone && phone.score <= 6) {
    insights.push("Your phone number isn’t one-tap callable on mobile. That’s the #1 action homeowners take.");
  }

  // Motorization
  const motor = findings.find((f) => f.id === "motorization");
  if (motor && motor.score === 0) {
    insights.push("No motorization on the site — the best-paying leads in this industry can’t find you.");
  }

  // Trust signals
  const trust = findings.find((f) => f.id === "trust_signals");
  if (trust && trust.score < trust.maxPoints / 2) {
    insights.push("Weak trust signals. Homeowners choose based on reviews and years in business — show them, don’t hide them.");
  }

  // Stop at 5
  return insights.slice(0, 5);
}

// ── Main entry ──────────────────────────────────────────────────────

// Status codes that are likely transient — worth retrying once. 429 (rate
// limit) is the main one; 502/503/504 happen when the target's CDN or origin
// is briefly unhappy and a 2-second wait usually resolves it.
const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);
const RETRY_DELAY_MS = 2000;

// Status codes where the target site is deliberately blocking us (anti-bot,
// firewall, etc.). These are different from transient server errors — no
// amount of retrying from our IP will get past them. The UI offers a
// manual-review email-capture flow for these cases instead of a generic error.
const BLOCKED_STATUSES = new Set([403, 429]);

/** Thrown when the target site blocks our scanner. UI offers manual review. */
export class BlockedScanError extends Error {
  status: number;
  domain: string;
  constructor(status: number, domain: string, message: string) {
    super(message);
    this.name = "BlockedScanError";
    this.status = status;
    this.domain = domain;
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// Friendly error messages for the cases users actually encounter. Keeps the
// "this tool is broken" reaction at bay by naming the cause and the fix.
function explainHttpError(status: number, domain: string): string {
  if (status === 429 || status === 403) {
    // Blocked-by-target case. Short message because the UI replaces this with
    // the manual-review CTA card; the message itself rarely shows.
    return `${domain} blocks automated scans.`;
  }
  if (status === 503 || status === 502 || status === 504) {
    return `${domain}'s server didn't respond properly (HTTP ${status}). Their site may be temporarily down or overloaded. Try again in a few minutes.`;
  }
  if (status === 404) {
    return `That URL didn't exist on ${domain} (HTTP 404). Double-check the address — most sites work with just the domain (e.g. heberblinds.com).`;
  }
  if (status >= 500) {
    return `${domain}'s server returned an error (HTTP ${status}). Likely a temporary issue on their end — try again in a few minutes.`;
  }
  return `${domain} returned an unexpected response (HTTP ${status}). Try again, or scan a different site.`;
}

export async function scanUrl(rawUrl: string): Promise<AuditReport> {
  const normalized = normalizeUrl(rawUrl);
  if (!normalized) {
    throw new Error("Invalid URL");
  }
  const { url, domain } = normalized;

  // Fetch the HTML — try once, retry on transient failures.
  let res: Response;
  try {
    res = await fetchWithTimeout(url, FETCH_TIMEOUT_MS);

    // If the first attempt hit a known-transient status, wait briefly and
    // retry once. Single retry keeps user-visible latency bounded (max ~12s
    // including timeouts) while clearing most flaky responses.
    if (RETRYABLE_STATUSES.has(res.status)) {
      await sleep(RETRY_DELAY_MS);
      try {
        res = await fetchWithTimeout(url, FETCH_TIMEOUT_MS);
      } catch {
        // If the retry attempt itself errors, fall through with the original
        // response — explainHttpError will still produce a useful message.
      }
    }
  } catch (e) {
    const err = e as Error;
    throw new Error(
      err.name === "AbortError"
        ? `${domain} took too long to respond (10s timeout). Their site may be slow or down — try again in a minute.`
        : `Couldn't reach ${domain}. Double-check the URL, or try again in a minute. (${err.message})`,
    );
  }

  if (!res.ok) {
    if (BLOCKED_STATUSES.has(res.status)) {
      throw new BlockedScanError(res.status, domain, explainHttpError(res.status, domain));
    }
    throw new Error(explainHttpError(res.status, domain));
  }

  const html = await res.text();
  const finalUrl = res.url || url;
  const https = finalUrl.startsWith("https://");

  const $ = cheerio.load(html);

  const headersObj: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    headersObj[k.toLowerCase()] = v;
  });

  // Fetch sidecars in parallel
  const origin = new URL(finalUrl).origin;
  const [sitemap, robots] = await Promise.all([
    checkSitemap(origin),
    checkRobots(origin),
  ]);

  const ctx: ScanContext = {
    url,
    domain,
    html,
    $,
    headers: headersObj,
    finalUrl,
    https,
    sitemap,
    robots,
  };

  // Run all checks in parallel (each is small and independent)
  const findings: Finding[] = await Promise.all(ALL_CHECKS.map((fn) => fn(ctx)));

  // Compute score: total earned / total max, normalized to 100.
  const earned = findings.reduce((sum, f) => sum + f.score, 0);
  const total = findings.reduce((sum, f) => sum + f.maxPoints, 0);
  const score = total === 0 ? 0 : Math.round((earned / total) * 100);

  const topThree = pickTopThree(findings);
  const quickInsights = buildQuickInsights(findings, score, domain);

  const pageTitle = ($("title").first().text() || "").trim() || null;

  return {
    score,
    grade: computeGrade(score),
    domain,
    url,
    pageTitle,
    findings,
    topThree,
    quickInsights,
    scannedAt: new Date().toISOString(),
  };
}
