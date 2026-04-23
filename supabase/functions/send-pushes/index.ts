// ── send-pushes Edge Function ─────────────────────────────────────
// Invoked by pg_cron once a minute.
//
// Flow:
//   1. SELECT all scheduled_pushes where fire_at <= now() AND sent_at IS NULL
//   2. For each, fan out to every push_subscription the target user has
//   3. Send via web-push (VAPID)
//   4. Mark sent_at OR send_error on the scheduled_pushes row
//   5. Delete push_subscription rows that return 404/410 (dead)
//
// Env (set with `supabase secrets set`):
//   VAPID_PUBLIC_KEY
//   VAPID_PRIVATE_KEY
//   VAPID_SUBJECT  (mailto:ops@yourdomain.com)
//
// Supabase URL + service role key are injected automatically.

// @ts-ignore — Deno runtime import
import webpush from "npm:web-push@3.6.7";
// @ts-ignore — Deno runtime import
import { createClient } from "jsr:@supabase/supabase-js@2";

// @ts-ignore — Deno global
const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
// @ts-ignore
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// @ts-ignore
const VAPID_PUBLIC         = Deno.env.get("VAPID_PUBLIC_KEY")!;
// @ts-ignore
const VAPID_PRIVATE        = Deno.env.get("VAPID_PRIVATE_KEY")!;
// @ts-ignore
const VAPID_SUBJECT        = Deno.env.get("VAPID_SUBJECT") || "mailto:ops@zeroremake.app";

const BATCH = 50;

type ScheduledPush = {
  id: string;
  user_id: string;
  title: string;
  body: string;
  url: string;
  kind: string;
};

type PushSub = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
};

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

// @ts-ignore — Deno.serve
Deno.serve(async (_req: Request) => {
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const nowIso = new Date().toISOString();

  // 1. Pull due rows
  const { data: due, error: dueErr } = await admin
    .from("scheduled_pushes")
    .select("id, user_id, title, body, url, kind")
    .is("sent_at", null)
    .is("cancelled_at", null)
    .lte("fire_at", nowIso)
    .order("fire_at", { ascending: true })
    .limit(BATCH);

  if (dueErr) {
    return new Response(JSON.stringify({ error: dueErr.message }), { status: 500 });
  }
  if (!due || due.length === 0) {
    return new Response(JSON.stringify({ ok: true, processed: 0 }), { status: 200 });
  }

  let sentCount = 0;
  let errorCount = 0;
  const deadEndpoints: string[] = [];

  for (const row of due as ScheduledPush[]) {
    // 2. Fan out to this user's subscriptions
    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth_key")
      .eq("user_id", row.user_id);

    if (!subs || subs.length === 0) {
      // No device registered — mark sent to avoid retry-loop. The
      // send_error note explains what happened.
      await admin
        .from("scheduled_pushes")
        .update({ sent_at: nowIso, send_error: "no-subscriptions" })
        .eq("id", row.id);
      continue;
    }

    const payload = JSON.stringify({
      title: row.title,
      body: row.body,
      url: row.url,
      kind: row.kind,
      tag: `${row.kind}-${row.id}`,
    });

    let anySuccess = false;
    let lastError: string | null = null;

    for (const sub of subs as PushSub[]) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth_key },
          },
          payload,
          { TTL: 60 * 15 } // 15 minutes max delivery window
        );
        anySuccess = true;
      } catch (err: unknown) {
        const e = err as { statusCode?: number; body?: string; message?: string };
        const code = e.statusCode ?? 0;
        lastError = `${code}:${e.message || e.body || "unknown"}`;
        // 404/410 = browser revoked this endpoint; drop it
        if (code === 404 || code === 410) deadEndpoints.push(sub.endpoint);
      }
    }

    if (anySuccess) {
      await admin
        .from("scheduled_pushes")
        .update({ sent_at: nowIso, send_error: null })
        .eq("id", row.id);
      sentCount++;
    } else {
      await admin
        .from("scheduled_pushes")
        .update({ sent_at: nowIso, send_error: lastError ?? "unknown" })
        .eq("id", row.id);
      errorCount++;
    }
  }

  // 5. Clean up dead endpoints so we stop trying to reach them
  if (deadEndpoints.length > 0) {
    await admin
      .from("push_subscriptions")
      .delete()
      .in("endpoint", deadEndpoints);
  }

  return new Response(
    JSON.stringify({
      ok: true,
      processed: due.length,
      sent: sentCount,
      errors: errorCount,
      pruned: deadEndpoints.length,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
