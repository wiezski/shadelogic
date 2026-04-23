// Types for the Website Audit lead magnet scanner.

export type FindingCategory =
  | "phone_visibility"
  | "city_pages"
  | "product_categories"
  | "motorization"
  | "trust_signals"
  | "mobile_usability"
  | "technical_seo"
  | "content_conversion";

export type FindingSeverity = "critical" | "important" | "minor" | "pass";

export interface Finding {
  /** Stable check ID — do not change once published; used for analytics. */
  id: string;
  category: FindingCategory;
  severity: FindingSeverity;
  /** Short, human-readable title shown on results card. */
  title: string;
  /** What we detected, in plain English. */
  detail: string;
  /** What we'd recommend they do. */
  recommendation: string;
  /** Points earned (0 — maxPoints). */
  score: number;
  /** Max points this check can contribute to the total. */
  maxPoints: number;
}

export interface AuditReport {
  /** 0-100 computed score. */
  score: number;
  /** Grade band for display ("Strong" / "Solid" / "Needs Work" / "Critical Gaps"). */
  grade: "Strong" | "Solid" | "Needs Work" | "Critical Gaps";
  /** Normalized hostname without www. */
  domain: string;
  /** What we scanned. */
  url: string;
  /** Title tag from the page. */
  pageTitle: string | null;
  /** All checks, ordered by severity. */
  findings: Finding[];
  /** Top 3 non-pass findings by weight × severity — used for Layer 1. */
  topThree: Finding[];
  /** 3-5 short "quick insights" — punchy one-liners for Layer 1. */
  quickInsights: string[];
  /** Timestamp for the scan. */
  scannedAt: string;
  /** If we couldn't complete the scan, this is populated and findings may be partial. */
  error?: string;
}

export interface ScanContext {
  url: string;
  domain: string;
  html: string;
  $: import("cheerio").CheerioAPI;
  /** Response headers from the primary page fetch. */
  headers: Record<string, string>;
  /** Final URL after redirects. */
  finalUrl: string;
  /** True if primary page served over HTTPS. */
  https: boolean;
  /** Sitemap.xml if we found it. */
  sitemap: { found: boolean; urlCount?: number };
  /** Robots.txt if we found it. */
  robots: { found: boolean };
}

export type CheckFn = (ctx: ScanContext) => Finding | Promise<Finding>;
