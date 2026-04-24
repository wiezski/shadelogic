// POST /api/sun-calc/book-call
//
// Records a call-booking request against an existing sun_calc_requests
// row and fires an owner alert so Steve can reach out.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendSunCalcOwnerAlert } from "@/lib/sun-calc/email";
import type {
  SunCalcInput, SunCalcResult,
  FacingDirection, MainProblem, RoomType, Preference,
  CategoryId, RankedCategory,
} from "@/lib/sun-calc/scoring";

export const runtime = "nodejs";
export const maxDuration = 15;

interface BookBody {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  notes?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(req: NextRequest) {
  let body: BookBody;
  try {
    body = (await req.json()) as BookBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const id = (body?.id || "").trim();
  const name = (body?.name || "").trim();
  const email = (body?.email || "").trim().toLowerCase();
  const phone = (body?.phone || "").trim();
  const notes = (body?.notes || "").trim();

  if (!id) return NextResponse.json({ ok: false, error: "Missing result id" }, { status: 400 });
  if (!name) return NextResponse.json({ ok: false, error: "Please share your name." }, { status: 400 });
  if (!phone && !email) return NextResponse.json({ ok: false, error: "Leave a phone or email so Steve can reach you." }, { status: 400 });
  if (email && !EMAIL_RE.test(email)) return NextResponse.json({ ok: false, error: "That email doesn’t look right." }, { status: 400 });

  const admin = getAdmin();
  const { data: row, error: loadErr } = await admin
    .from("sun_calc_requests")
    .select("id, address, facing_direction, main_problem, room_type, preference, score, best_overall, best_budget, best_premium, summary, rankings, email")
    .eq("id", id)
    .maybeSingle();

  if (loadErr || !row) return NextResponse.json({ ok: false, error: "Couldn’t find that result." }, { status: 404 });

  const update: Record<string, unknown> = {
    name,
    phone: phone || null,
    call_booked: true,
    call_booked_at: new Date().toISOString(),
    call_notes: notes || null,
  };
  if (email && !row.email) update.email = email;
  const { error: updErr } = await admin.from("sun_calc_requests").update(update).eq("id", id);
  if (updErr) {
    console.error("[sun-calc/book-call] update failed:", updErr);
    return NextResponse.json({ ok: false, error: "Couldn’t save that — try again." }, { status: 500 });
  }

  // Rebuild input + result for the owner alert
  const input: SunCalcInput = {
    address: row.address ?? undefined,
    facing: row.facing_direction as FacingDirection,
    problem: row.main_problem as MainProblem,
    room: row.room_type as RoomType,
    preference: row.preference as Preference,
  };
  const rankings: RankedCategory[] = (row.rankings as RankedCategory[]) || [];
  const findCat = (catId: string | null): RankedCategory | null =>
    !catId ? null : rankings.find((r) => r.id === catId as CategoryId) || null;

  const result: SunCalcResult = {
    score: row.score,
    band:
      row.score >= 75 ? "Very High" :
      row.score >= 55 ? "High" :
      row.score >= 35 ? "Moderate" : "Low",
    zip: null,
    rankings,
    bestOverall: findCat(row.best_overall) || rankings[0],
    bestBudget: findCat(row.best_budget),
    bestPremium: findCat(row.best_premium),
    summary: row.summary || "",
    headline: "",
  };

  sendSunCalcOwnerAlert({
    kind: "call_booked",
    input,
    result,
    name,
    email: email || row.email || null,
    phone: phone || null,
    notes: notes || null,
    id,
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
