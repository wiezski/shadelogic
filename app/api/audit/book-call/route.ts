// POST /api/audit/book-call
//
// Layer 3: human follow-up. The prospect wants a walkthrough call.
// We flip call_booked on the audit row, save their name/phone/notes,
// and email Steve so he can reach out.

import { NextRequest, NextResponse } from "next/server";
import { getAuditAdminClient } from "@/lib/audit/db";
import { sendInternalAlertEmail } from "@/lib/audit/email";

export const runtime = "nodejs";
export const maxDuration = 15;

interface BookCallBody {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  notes?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  let body: BookCallBody;
  try {
    body = (await req.json()) as BookCallBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const id = (body?.id || "").trim();
  const name = (body?.name || "").trim();
  const email = (body?.email || "").trim().toLowerCase();
  const phone = (body?.phone || "").trim();
  const notes = (body?.notes || "").trim();

  if (!id) return NextResponse.json({ error: "Missing audit id" }, { status: 400 });
  if (!name) return NextResponse.json({ error: "Please share your name." }, { status: 400 });
  if (!phone && !email) {
    return NextResponse.json(
      { error: "Please leave a phone number or email so Steve can reach you." },
      { status: 400 },
    );
  }
  if (email && !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "That email doesn't look right." }, { status: 400 });
  }

  const admin = getAuditAdminClient();

  const { data: row, error: loadErr } = await admin
    .from("audit_requests")
    .select("id, domain, score, email")
    .eq("id", id)
    .maybeSingle();

  if (loadErr || !row) {
    return NextResponse.json(
      { error: "Couldn't find that scan. Try running the audit again." },
      { status: 404 },
    );
  }

  const update: Record<string, unknown> = {
    name,
    phone: phone || null,
    call_booked: true,
    call_booked_at: new Date().toISOString(),
    call_notes: notes || null,
  };
  if (email && !row.email) update.email = email;

  const { error: updErr } = await admin
    .from("audit_requests")
    .update(update)
    .eq("id", id);

  if (updErr) {
    console.error("[audit/book-call] update failed:", updErr);
    return NextResponse.json(
      { error: "Something went wrong saving that. Try again in a moment." },
      { status: 500 },
    );
  }

  // Internal alert so Steve can reach out.
  sendInternalAlertEmail({
    kind: "call_booked",
    domain: row.domain,
    score: row.score,
    email: email || row.email || null,
    name,
    phone: phone || null,
    notes: notes || null,
    auditId: id,
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
