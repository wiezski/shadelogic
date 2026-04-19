// ── Password Reset API Route ─────────────────────────────────
// POST /api/auth/reset-password
//
// Generates a recovery link via Supabase admin API and sends
// a branded email via Resend instead of Supabase's default.
//
// Body: { email: string }

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "../../../../lib/email";
import { passwordReset } from "../../../../lib/email-templates";

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");
  return createClient(url, key);
}

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const admin = getAdminClient();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://shadelogic.vercel.app";

    // Generate a recovery link via Supabase admin API
    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: email.trim(),
      options: {
        redirectTo: `${appUrl}/reset-password`,
      },
    });

    if (error) {
      console.error("[reset-password] Supabase error:", error);
      // Don't reveal whether the email exists
      return NextResponse.json({ success: true });
    }

    if (!data?.properties?.action_link) {
      // No link generated (e.g. email doesn't exist) — still return success
      // to prevent email enumeration
      return NextResponse.json({ success: true });
    }

    // Send branded email via Resend
    const resetUrl = data.properties.action_link;
    const tpl = passwordReset({ email: email.trim(), resetUrl });

    const result = await sendEmail({
      to: email.trim(),
      subject: tpl.subject,
      html: tpl.html,
      type: "password_reset",
      companyId: "system", // Not company-specific
    });

    if (!result.success) {
      console.error("[reset-password] Email send failed:", result.error);
      // Still return success to client (don't reveal failure)
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[reset-password] Error:", err);
    // Always return success to prevent information leakage
    return NextResponse.json({ success: true });
  }
}
