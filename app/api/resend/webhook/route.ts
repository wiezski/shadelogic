// POST /api/resend/webhook
//
// Receives Resend email events (sent, delivered, bounced, complained,
// delivery_delayed) so we have visibility into what actually happened
// after Resend accepted the API call.
//
// Without this, we only know that Resend *queued* the email. A bounce
// or spam complaint arrives asynchronously via this webhook and gets
// persisted back to the audit_requests row so Steve can tell apart
// "sent" from "actually-delivered" — and from "this address bounces."
//
// Security: verifies the Svix signature using RESEND_WEBHOOK_SECRET.
// Without the secret set the endpoint logs a warning and rejects —
// we never want anonymous writes to audit_requests.
//
// To enable:
//   1. In Resend dashboard → Webhooks → add https://zeroremake.com/api/resend/webhook
//   2. Subscribe to: email.sent, email.delivered, email.bounced,
//      email.complained, email.delivery_delayed
//   3. Copy the signing secret → Vercel env RESEND_WEBHOOK_SECRET
//   4. Redeploy

import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { getAuditAdminClient } from "@/lib/audit/db";

export const runtime = "nodejs";
export const maxDuration = 15;

interface ResendEvent {
  type: string;
  created_at?: string;
  data: {
    email_id?: string;
    to?: string[] | string;
    from?: string;
    subject?: string;
    bounce?: {
      type?: string;
      sub_type?: string;
      message?: string;
    };
    // Other event-specific fields ignored for now
  };
}

function verifySvixSignature(
  headers: { id: string | null; ts: string | null; sig: string | null },
  body: string,
  secret: string,
): boolean {
  if (!headers.id || !headers.ts || !headers.sig) return false;

  // Svix secrets start with "whsec_" and are base64. Strip the prefix.
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signed = `${headers.id}.${headers.ts}.${body}`;
  const expected = createHmac("sha256", key).update(signed).digest("base64");

  // Header format: "v1,<sig1> v1,<sig2>" — any match is OK.
  const candidates = headers.sig
    .split(" ")
    .map((part) => part.split(",")[1])
    .filter((s): s is string => typeof s === "string" && s.length > 0);

  const expectedBytes = Buffer.from(expected);
  return candidates.some((cand) => {
    const candBytes = Buffer.from(cand);
    if (candBytes.length !== expectedBytes.length) return false;
    try {
      return timingSafeEqual(candBytes, expectedBytes);
    } catch {
      return false;
    }
  });
}

function normalizeTo(to: unknown): string | null {
  if (!to) return null;
  if (typeof to === "string") return to.toLowerCase().trim();
  if (Array.isArray(to) && to.length > 0 && typeof to[0] === "string") {
    return (to[0] as string).toLowerCase().trim();
  }
  return null;
}

export async function POST(req: NextRequest) {
  // Read the raw body first — signature verification needs exact bytes.
  const bodyText = await req.text();

  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error(
      "[resend/webhook] RESEND_WEBHOOK_SECRET not set — rejecting webhook. Set it in Vercel env vars to enable bounce/complaint tracking.",
    );
    return NextResponse.json({ ok: false, error: "Webhook not configured" }, { status: 503 });
  }

  const verified = verifySvixSignature(
    {
      id: req.headers.get("svix-id"),
      ts: req.headers.get("svix-timestamp"),
      sig: req.headers.get("svix-signature"),
    },
    bodyText,
    secret,
  );

  if (!verified) {
    console.warn("[resend/webhook] Invalid signature — rejecting");
    return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 401 });
  }

  let event: ResendEvent;
  try {
    event = JSON.parse(bodyText) as ResendEvent;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const to = normalizeTo(event.data?.to);
  const subject = event.data?.subject || "";

  console.log(
    "[resend/webhook] event:",
    event.type,
    "to:",
    to,
    "subject:",
    subject,
    "email_id:",
    event.data?.email_id || "(none)",
  );

  // Only update audit_requests rows for events that indicate a real
  // delivery problem. Delivered/sent events are informational only.
  const isBounce = event.type === "email.bounced";
  const isComplaint = event.type === "email.complained";
  const isDelay = event.type === "email.delivery_delayed";

  if ((isBounce || isComplaint) && to) {
    const bounceMessage =
      event.data?.bounce?.message ||
      event.data?.bounce?.sub_type ||
      event.data?.bounce?.type ||
      (isComplaint ? "Spam complaint from recipient" : "Email bounced");

    const errorText = isBounce
      ? `Bounce: ${bounceMessage}`
      : `Complaint: ${bounceMessage}`;

    const admin = getAuditAdminClient();

    // Find the most recent audit_request row for this email and flag it.
    const { data: matchedRows, error: findErr } = await admin
      .from("audit_requests")
      .select("id")
      .eq("email", to)
      .order("created_at", { ascending: false })
      .limit(1);

    if (findErr) {
      console.error("[resend/webhook] failed to find matching audit row:", findErr);
    } else if (matchedRows && matchedRows[0]) {
      const { error: updErr } = await admin
        .from("audit_requests")
        .update({ email_sent: false, email_error: errorText })
        .eq("id", matchedRows[0].id);
      if (updErr) {
        console.error("[resend/webhook] failed to update row:", matchedRows[0].id, updErr);
      } else {
        console.log(
          "[resend/webhook] updated audit_requests row",
          matchedRows[0].id,
          "with error:",
          errorText,
        );
      }
    } else {
      console.log(
        "[resend/webhook] no audit_requests row found for bounced email:",
        to,
      );
    }
  }

  if (isDelay) {
    // Just log — delivery_delayed often resolves on its own.
    console.log("[resend/webhook] delivery delayed for:", to);
  }

  // Resend expects a 2xx to ack the event; anything else triggers retries.
  return NextResponse.json({ ok: true });
}
