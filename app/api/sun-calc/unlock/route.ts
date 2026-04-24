// POST /api/sun-calc/unlock
//
// Captures name + email (+ optional phone) after the calculator runs,
// sends the prospect the branded result email, and fires the owner alert.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  sendSunCalcResultEmail,
  sendSunCalcOwnerAlert,
} from "@/lib/sun-calc/email";
import type {
  SunCalcInput,
  SunCalcResult,
  FacingDirection,
  MainProblem,
  RoomType,
  Preference,
  CategoryId,
  RankedCategory,
} from "@/lib/sun-calc/scoring";

export const runtime = "nodejs";
export const maxDuration = 15;

interface UnlockBody {
  id: string;
  name: string;
  email: string;
  phone?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(req: NextRequest) {
  let body: UnlockBody;
  try {
    body = (await req.json()) as UnlockBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const id = (body?.id || "").trim();
  const name = (body?.name || "").trim();
  const email = (body?.email || "").trim().toLowerCase();
  const phone = (body?.phone || "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "Missing result id" }, { status: 400 });
  if (!name) return NextResponse.json({ ok: false, error: "Please share your name." }, { status: 400 });
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ ok: false, error: "That email doesn’t look right." }, { status: 400 });
  }

  const admin = getAdmin();

  const { data: row, error: loadErr } = await admin
    .from("sun_calc_requests")
    .select("id, address, facing_direction, main_problem, room_type, preference, score, best_overall, best_budget, best_premium, summary, rankings")
    .eq("id", id)
    .maybeSingle();

  if (loadErr || !row) {
    return NextResponse.json({ ok: false, error: "Couldn’t find that result. Run the calculator again." }, { status: 404 });
  }

  // Persist contact — first capture wins.
  const update: Record<string, unknown> = {
    name,
    phone: phone || null,
    email_captured_at: new Date().toISOString(),
  };
  update.email = email; // always overwrite in case they changed it
  await admin.from("sun_calc_requests").update(update).eq("id", id);

  // Rebuild an input + result structure from the row for the email
  // templates. Ordering is stable because scoring is deterministic,
  // but we use the stored rankings so the email matches what was shown.
  const input: SunCalcInput = {
    address: row.address ?? undefined,
    facing: row.facing_direction as FacingDirection,
    problem: row.main_problem as MainProblem,
    room: row.room_type as RoomType,
    preference: row.preference as Preference,
  };

  const bandOf = (score: number): SunCalcResult["band"] => {
    if (score >= 75) return "Very High";
    if (score >= 55) return "High";
    if (score >= 35) return "Moderate";
    return "Low";
  };

  const rankings: RankedCategory[] = (row.rankings as RankedCategory[]) || [];
  const findCat = (catId: string | null): RankedCategory | null => {
    if (!catId) return null;
    return rankings.find((r) => r.id === catId as CategoryId) || null;
  };

  const bestOverall = findCat(row.best_overall) || rankings[0];
  const bestBudget  = findCat(row.best_budget);
  const bestPremium = findCat(row.best_premium);

  if (!bestOverall) {
    return NextResponse.json({ ok: false, error: "Stored result is malformed — run again." }, { status: 500 });
  }

  const result: SunCalcResult = {
    score: row.score,
    band: bandOf(row.score),
    zip: null,
    rankings,
    bestOverall,
    bestBudget,
    bestPremium,
    summary: row.summary || "",
    headline:
      row.score >= 75 ? "This window is working against you." :
      row.score >= 55 ? "There’s real heat and glare to solve here." :
      row.score >= 35 ? "A straightforward fix — the right product will handle it." :
                         "Not much to worry about — you have good options.",
  };

  console.log(`[sun-calc/unlock] processing id=${id} email=${email} score=${result.score}`);

  const [prospectRes, ownerRes] = await Promise.all([
    sendSunCalcResultEmail(email, input, result),
    sendSunCalcOwnerAlert({
      kind: "email_captured",
      input,
      result,
      name,
      email,
      phone: phone || null,
      id,
    }),
  ]);

  const statusUpdate = prospectRes.ok
    ? { email_sent: true, email_sent_at: new Date().toISOString(), email_error: null }
    : { email_sent: false, email_error: prospectRes.error || "Unknown send failure" };
  await admin.from("sun_calc_requests").update(statusUpdate).eq("id", id);

  if (!prospectRes.ok) {
    return NextResponse.json({
      ok: false,
      emailSent: false,
      error: "Something went wrong sending the email. Try again, or email steve@zeroremake.com.",
    });
  }

  if (!ownerRes.ok) {
    console.warn("[sun-calc/unlock] owner alert failed (prospect email DID succeed):", ownerRes.error);
  }

  return NextResponse.json({ ok: true, emailSent: true, id });
}
