// POST /api/sun-calc/submit
//
// The calculator-run endpoint for /sun-calculator. Accepts the 5 form
// fields, computes the score and rankings via lib/sun-calc/scoring,
// inserts a row in sun_calc_requests, and returns the full result.
//
// Soft rate limiting + admin bypass via lib/admin/auth.ts, same as the
// audit scanner.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  computeSunCalc,
  type SunCalcInput,
  type FacingDirection,
  type MainProblem,
  type RoomType,
  type Preference,
} from "@/lib/sun-calc/scoring";
import { isAdminRequest, getClientIp } from "@/lib/admin/auth";

export const runtime = "nodejs";
export const maxDuration = 10;

interface SubmitBody {
  address?: string;
  facing: string;
  problem: string;
  room: string;
  preference: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  referer?: string;
}

const SOFT_NOTICE_THRESHOLD = 30;

const VALID_DIRECTIONS: FacingDirection[] = ["north", "south", "east", "west", "unknown"];
const VALID_PROBLEMS: MainProblem[] = ["heat", "uv", "glare", "privacy", "darkening", "energy"];
const VALID_ROOMS: RoomType[] = ["bedroom", "living_room", "office", "nursery", "kitchen", "other"];
const VALID_PREFS: Preference[] = ["natural_light", "max_blocking", "balanced"];

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(req: NextRequest) {
  let body: SubmitBody;
  try {
    body = (await req.json()) as SubmitBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!VALID_DIRECTIONS.includes(body.facing as FacingDirection)) {
    return NextResponse.json({ ok: false, error: "Please pick a window direction." }, { status: 400 });
  }
  if (!VALID_PROBLEMS.includes(body.problem as MainProblem)) {
    return NextResponse.json({ ok: false, error: "Please pick a main problem." }, { status: 400 });
  }
  if (!VALID_ROOMS.includes(body.room as RoomType)) {
    return NextResponse.json({ ok: false, error: "Please pick a room type." }, { status: 400 });
  }
  if (!VALID_PREFS.includes(body.preference as Preference)) {
    return NextResponse.json({ ok: false, error: "Please pick a preference." }, { status: 400 });
  }

  const input: SunCalcInput = {
    address: (body.address || "").trim() || undefined,
    facing: body.facing as FacingDirection,
    problem: body.problem as MainProblem,
    room: body.room as RoomType,
    preference: body.preference as Preference,
  };

  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent") || null;
  const admin = getAdmin();
  const isAdmin = isAdminRequest(req);

  // Soft rate notice — never blocks
  let softLimit = false;
  if (ip && !isAdmin) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("sun_calc_requests")
      .select("id", { count: "exact", head: true })
      .eq("ip", ip)
      .gte("created_at", since);
    if ((count ?? 0) >= SOFT_NOTICE_THRESHOLD) softLimit = true;
  }

  const result = computeSunCalc(input);

  const { data: inserted, error: insertErr } = await admin
    .from("sun_calc_requests")
    .insert({
      address: input.address ?? null,
      zip: result.zip,
      facing_direction: input.facing,
      main_problem: input.problem,
      room_type: input.room,
      preference: input.preference,
      score: result.score,
      best_overall: result.bestOverall.id,
      best_budget: result.bestBudget?.id ?? null,
      best_premium: result.bestPremium?.id ?? null,
      summary: result.summary,
      rankings: result.rankings,
      ip,
      user_agent: userAgent,
      referer: body.referer ?? null,
      utm_source: body.utm_source ?? null,
      utm_medium: body.utm_medium ?? null,
      utm_campaign: body.utm_campaign ?? null,
      utm_term: body.utm_term ?? null,
      utm_content: body.utm_content ?? null,
    })
    .select("id")
    .single();

  if (insertErr) {
    console.error("[sun-calc/submit] insert failed:", insertErr);
  }

  return NextResponse.json({
    ok: true,
    id: inserted?.id ?? null,
    ...result,
    softLimit,
  });
}
