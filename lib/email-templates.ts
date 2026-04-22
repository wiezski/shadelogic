// ── ZeroRemake Email Templates ────────────────────────────────
// Each function returns { subject, html } ready for sendEmail().
// All templates use the emailLayout wrapper for consistent branding.

import { emailLayout } from "./email";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://shadelogic.vercel.app";

// ── Helpers ──────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function fmtDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h} hour${h > 1 ? "s" : ""}`;
}

const APPT_LABELS: Record<string, string> = {
  sales_consultation: "Sales Consultation",
  measure: "Measure Appointment",
  install: "Installation",
  service_call: "Service Call",
  repair: "Repair Visit",
  site_walk: "Site Walk",
  punch: "Punch Visit",
};

// ── 1. Appointment Confirmation ──────────────────────────────

export function appointmentConfirmation(params: {
  customerFirstName: string;
  appointmentType: string;
  scheduledAt: string;
  durationMinutes: number;
  address?: string;
  companyName: string;
  companyPhone?: string;
}) {
  const typeLabel = APPT_LABELS[params.appointmentType] || params.appointmentType;
  const dateStr = fmtDate(params.scheduledAt);
  const timeStr = fmtTime(params.scheduledAt);
  const durationStr = fmtDuration(params.durationMinutes);

  const subject = `Your ${typeLabel} is confirmed — ${dateStr}`;

  const addressBlock = params.address
    ? `<div class="detail-row"><span class="detail-label">Location</span><span class="detail-value">${params.address}</span></div>`
    : "";

  const phoneBlock = params.companyPhone
    ? `<p class="muted">Need to reschedule? Call or text us at <strong>${params.companyPhone}</strong>.</p>`
    : `<p class="muted">Need to reschedule? Reply to this email and we'll get you sorted.</p>`;

  const html = emailLayout(`
    <h1>You're all set!</h1>
    <p>Hi ${params.customerFirstName}, your appointment with <strong>${params.companyName}</strong> is confirmed.</p>

    <div class="detail">
      <div class="detail-row"><span class="detail-label">What</span><span class="detail-value">${typeLabel}</span></div>
      <div class="detail-row"><span class="detail-label">Date</span><span class="detail-value">${dateStr}</span></div>
      <div class="detail-row"><span class="detail-label">Time</span><span class="detail-value">${timeStr}</span></div>
      <div class="detail-row"><span class="detail-label">Duration</span><span class="detail-value">~${durationStr}</span></div>
      ${addressBlock}
    </div>

    ${phoneBlock}
  `, params.companyName);

  return { subject, html };
}

// ── 2. Appointment Reminder (24h before) ─────────────────────

export function appointmentReminder(params: {
  customerFirstName: string;
  appointmentType: string;
  scheduledAt: string;
  address?: string;
  companyName: string;
  companyPhone?: string;
}) {
  const typeLabel = APPT_LABELS[params.appointmentType] || params.appointmentType;
  const dateStr = fmtDate(params.scheduledAt);
  const timeStr = fmtTime(params.scheduledAt);

  const subject = `Reminder: ${typeLabel} tomorrow at ${timeStr}`;

  const addressLine = params.address
    ? `<p>We'll be at <strong>${params.address}</strong>.</p>`
    : "";

  const phoneBlock = params.companyPhone
    ? `<p class="muted">Need to reschedule? Call or text <strong>${params.companyPhone}</strong>.</p>`
    : `<p class="muted">Need to reschedule? Reply to this email.</p>`;

  const html = emailLayout(`
    <h1>See you tomorrow!</h1>
    <p>Hi ${params.customerFirstName}, just a reminder about your upcoming appointment with <strong>${params.companyName}</strong>:</p>

    <div class="detail">
      <div class="detail-row"><span class="detail-label">What</span><span class="detail-value">${typeLabel}</span></div>
      <div class="detail-row"><span class="detail-label">When</span><span class="detail-value">${dateStr} at ${timeStr}</span></div>
    </div>

    ${addressLine}
    ${phoneBlock}
  `, params.companyName);

  return { subject, html };
}

// ── 3. Quote Delivery ────────────────────────────────────────

export function quoteDelivery(params: {
  customerFirstName: string;
  quoteNumber: string;
  quoteId: string;
  totalAmount: string;
  validDays: number;
  companyName: string;
  companyPhone?: string;
}) {
  const subject = `Your quote from ${params.companyName} is ready`;

  const approvalUrl = `${APP_URL}/q/${params.quoteId}`;

  const html = emailLayout(`
    <h1>Your Quote is Ready</h1>
    <p>Hi ${params.customerFirstName}, thanks for your time! Here's your quote from <strong>${params.companyName}</strong>.</p>

    <div class="detail">
      <div class="detail-row"><span class="detail-label">Quote</span><span class="detail-value">#${params.quoteNumber}</span></div>
      <div class="detail-row"><span class="detail-label">Total</span><span class="detail-value">${params.totalAmount}</span></div>
      <div class="detail-row"><span class="detail-label">Valid for</span><span class="detail-value">${params.validDays} days</span></div>
    </div>

    <p>Review the full details and approve online:</p>

    <p style="text-align: center;">
      <a href="${approvalUrl}" class="btn">View & Approve Quote</a>
    </p>

    <p class="muted">Questions? ${params.companyPhone ? `Call or text <strong>${params.companyPhone}</strong> or reply` : "Reply"} to this email.</p>
  `, params.companyName);

  return { subject, html };
}

// ── 4. Install Follow-Up ─────────────────────────────────────

export function installFollowup(params: {
  customerFirstName: string;
  companyName: string;
  googleReviewLink?: string;
}) {
  const subject = `Thanks for choosing ${params.companyName}!`;

  const reviewBlock = params.googleReviewLink
    ? `<p>If you're happy with the work, a quick Google review goes a long way:</p>
       <p style="text-align: center;">
         <a href="${params.googleReviewLink}" class="btn" style="background: #16a34a;">Leave a Review</a>
       </p>`
    : "";

  const html = emailLayout(`
    <h1>Installation Complete!</h1>
    <p>Hi ${params.customerFirstName}, your window treatments have been installed! We hope you love the result.</p>

    <p>If anything doesn't look right or you have questions, don't hesitate to reach out — we want to make sure everything is perfect.</p>

    ${reviewBlock}

    <p class="muted">Thank you for choosing ${params.companyName}. We appreciate your business!</p>
  `, params.companyName);

  return { subject, html };
}

// ── 5. Password Reset ───────────────────────────────────────

export function passwordReset(params: {
  email: string;
  resetUrl: string;
}) {
  const subject = "Reset your password — ZeroRemake";

  const html = emailLayout(`
    <h1>Reset Your Password</h1>
    <p>We received a request to reset the password for <strong>${params.email}</strong>.</p>

    <p>Click the button below to set a new password. This link expires in 1 hour.</p>

    <p style="text-align: center;">
      <a href="${params.resetUrl}" class="btn">Reset Password</a>
    </p>

    <p class="muted">If you didn't request this, you can safely ignore this email. Your password won't be changed.</p>
  `, "ZeroRemake");

  return { subject, html };
}

// ── 6. Quote Follow-Up (no response) ─────────────────────────

export function quoteFollowup(params: {
  customerFirstName: string;
  quoteId: string;
  daysSinceSent: number;
  companyName: string;
}) {
  const subject = `Following up on your quote — ${params.companyName}`;
  const approvalUrl = `${APP_URL}/q/${params.quoteId}`;

  const html = emailLayout(`
    <h1>Still thinking it over?</h1>
    <p>Hi ${params.customerFirstName}, just checking in! We sent your quote ${params.daysSinceSent} days ago and wanted to make sure you had everything you need.</p>

    <p>Your quote is still available to review and approve online:</p>

    <p style="text-align: center;">
      <a href="${approvalUrl}" class="btn">View Your Quote</a>
    </p>

    <p>Have questions about pricing, products, or timeline? We're happy to walk you through it — just reply to this email.</p>

    <p class="muted">No pressure at all. We just don't want you to miss out if you're interested!</p>
  `, params.companyName);

  return { subject, html };
}

// ── 7. Trial Reminder (3 days left) ──────────────────────────

export function trialReminder3Days(params: {
  firstName: string;
  trialEndsAt: string;
  companyName: string;
}) {
  const subject = "3 days left in your ZeroRemake trial";
  const billingUrl = `${APP_URL}/settings/billing`;

  const html = emailLayout(`
    <h1>3 days left, ${params.firstName} 👋</h1>
    <p>Your free trial of ZeroRemake ends on <strong>${fmtDate(params.trialEndsAt)}</strong>.</p>

    <p>Subscribe now to keep running ${params.companyName} out of ZeroRemake without interruption. All your customers, quotes, measure jobs, and photos will stay exactly where you left them.</p>

    <p style="text-align: center;">
      <a href="${billingUrl}" class="btn">Choose a Plan</a>
    </p>

    <p class="muted">Starter is $49/mo. Professional is $99/mo. Business is $199/mo. Cancel anytime — no contracts.</p>

    <p class="muted">Questions? Just reply to this email.</p>
  `, "ZeroRemake");

  return { subject, html };
}

// ── 8. Trial Reminder (1 day left) ───────────────────────────

// ── 10. Materials Shipped (customer-facing) ──────────────────

export function materialsShipped(params: {
  customerFirstName: string;
  companyName: string;
  materialDescription: string;
  trackingNumber?: string | null;
  eta?: string | null;
}) {
  const subject = `Your order has shipped — ${params.companyName}`;

  const html = emailLayout(`
    <h1>Your order has shipped 📦</h1>
    <p>Good news, ${params.customerFirstName}! Your <strong>${params.materialDescription}</strong> has left the warehouse and is on its way.</p>

    ${params.trackingNumber ? `
    <div class="detail">
      <div class="detail-row"><span class="detail-label">Tracking #</span><span class="detail-value">${params.trackingNumber}</span></div>
      ${params.eta ? `<div class="detail-row"><span class="detail-label">Estimated arrival</span><span class="detail-value">${params.eta}</span></div>` : ""}
    </div>
    ` : ""}

    <p>We'll reach out again as soon as everything's in our hands and we can schedule your install.</p>

    <p class="muted">Questions? Just reply to this email.</p>
  `, params.companyName);

  return { subject, html };
}

// ── 11. Order Arrived / Ready for Install (customer-facing) ──

export function orderReadyForInstall(params: {
  customerFirstName: string;
  companyName: string;
}) {
  const subject = `Your order is in — let's schedule your install`;

  const html = emailLayout(`
    <h1>Everything's in! 🎉</h1>
    <p>Hi ${params.customerFirstName}, all of your materials have arrived safely at <strong>${params.companyName}</strong>.</p>

    <p>We're ready to schedule your installation whenever you are. Reply to this email or give us a call with a few dates that work for you.</p>

    <p class="muted">Thanks for your patience through the ordering process — excited to get these installed!</p>
  `, params.companyName);

  return { subject, html };
}

// ── 9. Welcome Email (fires on signup) ───────────────────────

export function welcomeEmail(params: {
  firstName: string;
  companyName: string;
  trialEndsAt: string;
}) {
  const subject = `Welcome to ZeroRemake, ${params.firstName}!`;
  const loginUrl = `${APP_URL}/login`;
  const setupUrl = `${APP_URL}/setup-guide`;

  const html = emailLayout(`
    <h1>Welcome aboard 👋</h1>
    <p>Thanks for signing up, ${params.firstName}. Your ZeroRemake account for <strong>${params.companyName}</strong> is ready to go.</p>

    <p><strong>Your 14-day free trial runs through ${fmtDate(params.trialEndsAt)}.</strong> No card required. You'll get a reminder before it ends.</p>

    <p>To get the most out of ZeroRemake fast:</p>

    <div class="detail">
      <div class="detail-row"><span class="detail-label">1.</span><span class="detail-value">Add your first customer — start tracking leads right away</span></div>
      <div class="detail-row"><span class="detail-label">2.</span><span class="detail-value">Create a measure job — capture windows, photos, measurements</span></div>
      <div class="detail-row"><span class="detail-label">3.</span><span class="detail-value">Send a quote — your customer can review + sign online</span></div>
    </div>

    <p style="text-align: center;">
      <a href="${loginUrl}" class="btn">Sign In</a>
    </p>

    <p class="muted">Want a more detailed walkthrough? <a href="${setupUrl}">Open the setup guide →</a></p>

    <p class="muted">Got questions? Just reply to this email.</p>
  `, "ZeroRemake");

  return { subject, html };
}

export function trialReminder1Day(params: {
  firstName: string;
  trialEndsAt: string;
  companyName: string;
}) {
  const subject = "Your ZeroRemake trial ends tomorrow";
  const billingUrl = `${APP_URL}/settings/billing`;

  const html = emailLayout(`
    <h1>Tomorrow's the day, ${params.firstName}</h1>
    <p>Heads up — your free trial ends <strong>tomorrow (${fmtDate(params.trialEndsAt)})</strong>.</p>

    <p>To keep using ZeroRemake for ${params.companyName}, pick a plan now. Your data stays safe either way; without a subscription the app just locks until you upgrade.</p>

    <p style="text-align: center;">
      <a href="${billingUrl}" class="btn">Upgrade Now</a>
    </p>

    <p class="muted">Questions? Reply here and we'll help you figure out which plan fits.</p>
  `, "ZeroRemake");

  return { subject, html };
}
