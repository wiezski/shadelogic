// GET /api/test-email
//
// Probe endpoint for verifying the email delivery pipeline end-to-end.
// Fires a single test email to wiezski@gmail.com (or AUDIT_INTERNAL_ALERT_TO
// if that env var is set) and returns JSON with the outcome.
//
// Gated so random internet visitors can't spam the Resend allowance:
//   • IP is in AUDIT_WHITELIST_IPS, OR
//   • Cookie zr_admin matches AUDIT_ADMIN_TOKEN, OR
//   • Query string contains ?admin=<AUDIT_ADMIN_TOKEN>
//
// Intended for quick post-deploy smoke tests. Open it in a browser after
// you've dropped the admin cookie (via /audit?admin=TOKEN) and you'll
// see { ok: true, id: "re_..." }.

import { NextRequest, NextResponse } from "next/server";
import { sendTestEmail } from "@/lib/audit/email";

export const runtime = "nodejs";
export const maxDuration = 15;

const DEFAULT_TO = "wiezski@gmail.com";

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

function isAuthorized(req: NextRequest): boolean {
  const ip = getClientIp(req);
  const whitelist = (process.env.AUDIT_WHITELIST_IPS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (ip && whitelist.includes(ip)) return true;

  const adminToken = process.env.AUDIT_ADMIN_TOKEN;
  if (adminToken) {
    const cookieVal = getCookie(req, "zr_admin");
    if (cookieVal && cookieVal === adminToken) return true;

    const paramVal = new URL(req.url).searchParams.get("admin");
    if (paramVal && paramVal === adminToken) return true;
  }

  return false;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Unauthorized. Set the zr_admin cookie (visit /audit?admin=<AUDIT_ADMIN_TOKEN> once), or pass ?admin=<token>, or call from a whitelisted IP.",
      },
      { status: 401 },
    );
  }

  const to = process.env.AUDIT_INTERNAL_ALERT_TO || DEFAULT_TO;

  console.log("[test-email] Probe initiated — to:", to);

  const result = await sendTestEmail(to);

  if (!result.ok) {
    console.error("[test-email] Probe FAILED — error:", result.error);
    return NextResponse.json({
      ok: false,
      to,
      error: result.error,
      hint:
        "Most common causes: RESEND_API_KEY not set in Vercel env, or the sender domain isn't verified in Resend.",
    }, { status: 500 });
  }

  console.log("[test-email] Probe succeeded — message id:", result.id);
  return NextResponse.json({
    ok: true,
    to,
    id: result.id,
    message: `Test email queued for ${to}. Check the inbox.`,
  });
}
