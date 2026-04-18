# Stripe Setup Guide for ZeroRemake

Follow these steps in order. Total time: ~15 minutes.

---

## Step 1: Install Stripe SDK

Run this in your terminal:

```bash
cd ~/shadelogic && npm install stripe
```

Then commit:

```bash
git add package.json package-lock.json && git commit -m "install stripe SDK" && git push
```

---

## Step 2: Create a Stripe Account

1. Go to https://dashboard.stripe.com/register
2. Sign up with your email (wiezski@gmail.com)
3. You do NOT need to activate your account yet — test mode works immediately

---

## Step 3: Get Your Test API Keys

1. Go to https://dashboard.stripe.com/test/apikeys
2. You'll see two keys:
   - **Publishable key** — starts with `pk_test_...` (you don't need this one yet)
   - **Secret key** — click "Reveal test key", starts with `sk_test_...`
3. Copy the **Secret key** — you'll need it in Step 5

---

## Step 4: Create Your 4 Products + Prices

Go to https://dashboard.stripe.com/test/products and create each product:

### Product 1: Starter
- Click **+ Add product**
- Name: `ZeroRemake Starter`
- Description: `CRM, scheduling & quoting for 1 user`
- Price: `$49.00` / `month` / `recurring`
- Click **Save product**
- Click into the product, find the Price section, click the price
- Copy the **Price ID** (starts with `price_...`)

### Product 2: Professional
- Click **+ Add product**
- Name: `ZeroRemake Professional`
- Description: `CRM, scheduling, quoting, inventory, analytics & automation for 3 users`
- Price: `$99.00` / `month` / `recurring`
- Click **Save product**
- Copy the **Price ID**

### Product 3: Business
- Click **+ Add product**
- Name: `ZeroRemake Business`
- Description: `Full platform with builder portal and automation for 5 users`
- Price: `$199.00` / `month` / `recurring`
- Click **Save product**
- Copy the **Price ID**

### Product 4: Additional User
- Click **+ Add product**
- Name: `Additional User`
- Description: `Extra team member seat — added automatically when team exceeds plan limit`
- Price: `$25.00` / `month` / `recurring`
- Click **Save product**
- Copy the **Price ID**

You should now have 4 Price IDs that look like:
```
price_1Qx...  (Starter)
price_1Qx...  (Professional)
price_1Qx...  (Business)
price_1Qx...  (Additional User)
```

---

## Step 5: Set Vercel Environment Variables

Go to https://vercel.com/wiezskis-projects/shadelogic/settings/environment-variables

Add each of these (set for **all environments**: Production, Preview, Development):

| Variable Name | Value |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_...` (from Step 3) |
| `STRIPE_PRICE_STARTER` | `price_...` (Starter price ID from Step 4) |
| `STRIPE_PRICE_PROFESSIONAL` | `price_...` (Professional price ID from Step 4) |
| `STRIPE_PRICE_BUSINESS` | `price_...` (Business price ID from Step 4) |
| `STRIPE_PRICE_EXTRA_USER` | `price_...` (Additional User price ID from Step 4) |
| `STRIPE_WEBHOOK_SECRET` | (from Step 6 below) |

**Don't add STRIPE_WEBHOOK_SECRET yet** — you'll get it in the next step.

---

## Step 6: Set Up the Stripe Webhook

1. Go to https://dashboard.stripe.com/test/webhooks
2. Click **+ Add endpoint**
3. Endpoint URL: 
```
https://shadelogic.vercel.app/api/stripe/webhook
```
4. Under "Select events to listen to", click **+ Select events** and add:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
5. Click **Add endpoint**
6. On the webhook detail page, click **Reveal** under "Signing secret"
7. Copy the signing secret (starts with `whsec_...`)
8. Go back to Vercel env vars (Step 5 URL) and add:
   - `STRIPE_WEBHOOK_SECRET` = `whsec_...`

---

## Step 7: Redeploy

After setting all env vars, redeploy to pick them up:

```bash
cd ~/shadelogic && git push
```

Or if the git webhook doesn't trigger a build:

```bash
cd ~/shadelogic && npx vercel --prod
```

---

## Step 8: Test It!

1. Go to https://shadelogic.vercel.app
2. Log in, go to **Settings → Billing & Subscription**
3. Click **Upgrade** on any plan
4. You'll be redirected to Stripe Checkout
5. Use this test card:
   - Card number: `4242 4242 4242 4242`
   - Expiry: any future date (e.g. `12/30`)
   - CVC: any 3 digits (e.g. `123`)
   - Name/Zip: anything
6. Complete the payment
7. You should be redirected back and your plan should update

### Test Extra User Billing
1. On the Professional plan (3 users included), invite 3 more people via the invite link
2. The first 3 join freely. The 4th will show "Waiting for Approval"
3. Go to Settings → you'll see a yellow "Pending Team Requests" section
4. Click **Approve** — this automatically adds a $25/mo "Additional User" line item to your Stripe subscription
5. Check your Stripe dashboard — you'll see the subscription now has 2 line items: the plan + extra user(s)

---

## How Extra User Billing Works

- Each plan includes a set number of users: Starter (1), Professional (3), Business (5)
- When someone joins via invite and the team is at its limit, they enter **pending** status
- The owner sees the request in Settings and clicks **Approve (+$25/mo)** or **Deny**
- On approve: the Stripe subscription gets an "Additional User" line item (or its quantity increases)
- On remove: the line item quantity decreases (or is removed entirely)
- Stripe handles proration automatically — no surprise charges

---

## Going Live (When Ready)

When you're ready to accept real payments:

1. Activate your Stripe account (complete their verification)
2. Create the same 4 products in **live mode** (not test mode)
3. Replace ALL env vars in Vercel with live keys:
   - `STRIPE_SECRET_KEY` → `sk_live_...`
   - `STRIPE_PRICE_STARTER` → live price ID
   - `STRIPE_PRICE_PROFESSIONAL` → live price ID
   - `STRIPE_PRICE_BUSINESS` → live price ID
   - `STRIPE_PRICE_EXTRA_USER` → live price ID
   - `STRIPE_WEBHOOK_SECRET` → live webhook signing secret
4. Create a new webhook endpoint in Stripe **live mode** with the same URL and events
5. Redeploy

---

## Troubleshooting

**"Error creating checkout session"**
- Check that all STRIPE_* env vars are set in Vercel
- Make sure you redeployed after adding env vars

**Webhook not updating plan after payment**
- Check Stripe Dashboard → Webhooks → click your endpoint → check "Attempts" tab
- Make sure STRIPE_WEBHOOK_SECRET is correct
- Check Vercel function logs: https://vercel.com/wiezskis-projects/shadelogic/logs

**Plan not changing after checkout**
- The webhook handles this. Check that `checkout.session.completed` is in your webhook events
- Look at Vercel logs for errors from `/api/stripe/webhook`

**Extra user billing not working**
- Make sure `STRIPE_PRICE_EXTRA_USER` env var is set in Vercel
- Check that the "Additional User" product exists in Stripe with a $25/mo recurring price
- Check Vercel function logs for `/api/team/approve` errors
