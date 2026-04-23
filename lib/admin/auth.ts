// Shared admin-gate helper for /api/admin/* and /admin routes.
//
// Mirrors the audit-bypass admin check: either the caller's IP is in
// AUDIT_WHITELIST_IPS, or they carry the zr_admin cookie matching
// AUDIT_ADMIN_TOKEN. Anything else → not authorized.

import type { NextRequest } from "next/server";

export function getClientIp(req: NextRequest): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() ?? null;
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return null;
}

export function getCookie(req: NextRequest, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function isAdminRequest(req: NextRequest): boolean {
  const ip = getClientIp(req);
  const whitelist = (process.env.AUDIT_WHITELIST_IPS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (ip && whitelist.includes(ip)) return true;

  const token = process.env.AUDIT_ADMIN_TOKEN;
  if (token) {
    const cookieVal = getCookie(req, "zr_admin");
    if (cookieVal && cookieVal === token) return true;
    const paramVal = new URL(req.url).searchParams.get("admin");
    if (paramVal && paramVal === token) return true;
  }
  return false;
}
