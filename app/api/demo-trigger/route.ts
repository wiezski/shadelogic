// ── Demo Trigger API ────────────────────────────────────────
// POST /api/demo-trigger
//
// Simulates a shipment status change for live demos.
// Creates a notification + updates a material's status.
//
// Body: { type: "ship" | "deliver" | "order", secret: "demo2026" }
//
// "ship"    → Marks an ordered material as shipped, creates notification
// "deliver" → Marks a shipped material as received, creates notification
// "order"   → Creates a new order confirmed notification
//
// Uses the first matching material it finds for the company.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const DEMO_SECRET = "demo2026";
const COMPANY_ID = "92811199-4342-40d2-9332-dfe92e8210db";

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (body.secret !== DEMO_SECRET) {
    return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
  }

  const admin = getAdmin();
  const type = body.type || "ship";

  if (type === "ship") {
    // Find an ordered material and mark it shipped
    const { data: mat } = await admin
      .from("quote_materials")
      .select("id, description, quote_id, quotes(customer_id, customers(first_name, last_name))")
      .eq("company_id", COMPANY_ID)
      .eq("status", "ordered")
      .limit(1)
      .single();

    if (!mat) return NextResponse.json({ error: "No ordered materials to ship" }, { status: 404 });

    const trackNum = "1Z" + Math.random().toString(36).substring(2, 14).toUpperCase();
    await admin.from("quote_materials").update({
      status: "shipped",
      shipped_at: new Date().toISOString(),
      tracking_number: trackNum,
    }).eq("id", mat.id);

    const cust = (mat as any).quotes?.customers;
    const name = cust ? [cust.first_name, cust.last_name].filter(Boolean).join(" ") : "Customer";

    await admin.from("notifications").insert([{
      company_id: COMPANY_ID,
      type: "shipment_shipped",
      title: `🚚 Shipment In Transit — ${name}`,
      message: `${mat.description || "Materials"} just shipped! Tracking: ${trackNum}`,
      icon: "🚚",
      link: `/quotes/${mat.quote_id}`,
      customer_id: (mat as any).quotes?.customer_id,
      quote_id: mat.quote_id,
    }]);

    return NextResponse.json({ success: true, action: "shipped", material: mat.description, customer: name, tracking: trackNum });
  }

  if (type === "deliver") {
    // Find a shipped material and mark it received
    const { data: mat } = await admin
      .from("quote_materials")
      .select("id, description, quote_id, expected_packages, quotes(customer_id, customers(first_name, last_name))")
      .eq("company_id", COMPANY_ID)
      .eq("status", "shipped")
      .limit(1)
      .single();

    if (!mat) return NextResponse.json({ error: "No shipped materials to deliver" }, { status: 404 });

    await admin.from("quote_materials").update({
      status: "received",
      received_at: new Date().toISOString(),
      received_packages: mat.expected_packages || 1,
    }).eq("id", mat.id);

    // Mark all packages as received
    await admin.from("material_packages").update({
      status: "received",
      received_at: new Date().toISOString(),
      received_by: "Demo Auto-Delivery",
    }).eq("material_id", mat.id).neq("status", "received");

    const cust = (mat as any).quotes?.customers;
    const name = cust ? [cust.first_name, cust.last_name].filter(Boolean).join(" ") : "Customer";

    await admin.from("notifications").insert([{
      company_id: COMPANY_ID,
      type: "shipment_received",
      title: `✅ Materials Delivered — ${name}`,
      message: `${mat.description || "Materials"} just arrived at your warehouse!`,
      icon: "✅",
      link: `/quotes/${mat.quote_id}`,
      customer_id: (mat as any).quotes?.customer_id,
      quote_id: mat.quote_id,
    }]);

    return NextResponse.json({ success: true, action: "delivered", material: mat.description, customer: name });
  }

  if (type === "order") {
    // Create a fresh order notification for any quote
    const { data: q } = await admin
      .from("quotes")
      .select("id, customer_id, customers(first_name, last_name)")
      .eq("company_id", COMPANY_ID)
      .limit(1)
      .single();

    if (!q) return NextResponse.json({ error: "No quotes found" }, { status: 404 });

    const cust = (q as any).customers;
    const name = cust ? [cust.first_name, cust.last_name].filter(Boolean).join(" ") : "Customer";

    await admin.from("notifications").insert([{
      company_id: COMPANY_ID,
      type: "shipment_ordered",
      title: `🔄 Order Confirmed — ${name}`,
      message: `New order placed with manufacturer. ETA: 5-7 business days.`,
      icon: "🔄",
      link: `/quotes/${q.id}`,
      customer_id: q.customer_id,
      quote_id: q.id,
    }]);

    return NextResponse.json({ success: true, action: "order_confirmed", customer: name });
  }

  return NextResponse.json({ error: "Invalid type. Use: ship, deliver, or order" }, { status: 400 });
}
