# 799 Paddock store (Stripe checkout on Cloudflare)

The store on The Paddock page (`paddock.html`) shows the products and cart. It calls a small Cloudflare Worker at `https://scirocco799-store.mr-mikewhite.workers.dev`. The Worker checks prices and stock, opens Stripe Checkout, and takes sold items off stock when Stripe says an order is paid. The Stripe key lives only in Cloudflare, never on GitHub or the page.

Start in the **799 Motorsport sandbox** in Stripe. Nothing here charges real money until live keys are added.

## One-time setup (Cloudflare and Stripe dashboards, about 15 minutes)

**1. Database**
1. Cloudflare → **Storage & Databases → D1 → Create database**. Name: `scirocco799-store`.
2. Open it → **Console**. Paste the whole of [schema.sql](schema.sql) and run it. It creates the tables and the starting stock (2 jugs of each color, 2 pumps, 2 Black Ripper Caps, 2 Tuff Spouts). Rerunning is safe; it never resets counts.

**2. Worker**
1. Cloudflare → **Workers & Pages → Create → Worker**. Name: `scirocco799-store`. Deploy the starter code.
2. **Edit code**: replace everything with the whole of [worker.mjs](worker.mjs). **Deploy**.
3. **Settings → Bindings → Add → D1 database**. Variable name `DB`, database `scirocco799-store`. Save.

**3. Stripe key (sandbox)**
1. Stripe, with the **799 Motorsport sandbox** selected → **Developers → API keys → Create restricted key**.
2. Name it `799 store worker`. Set **Checkout Sessions** to **Write**. Leave everything else as None. Create, then copy the key (starts with `rk_test_`).
3. Cloudflare Worker → **Settings → Variables and Secrets → Add**. Type **Secret**, name `STRIPE_SECRET_KEY`, paste the key. Deploy.

**4. Stripe "paid" notices (webhook)**
1. Stripe sandbox → **Developers → Webhooks → Add destination** (or Add endpoint).
2. Events: `checkout.session.completed` and `checkout.session.async_payment_succeeded`.
3. Endpoint URL: `https://scirocco799-store.mr-mikewhite.workers.dev/api/stripe-webhook`
4. Copy the **Signing secret** (starts with `whsec_`). Cloudflare Worker → **Variables and Secrets → Add → Secret** named `STRIPE_WEBHOOK_SECRET`. Deploy.

**5. Check**
Open `https://scirocco799-store.mr-mikewhite.workers.dev/`. Expect:

```json
{"ok":true,"service":"Scirocco 799 store","schema":"installed","stripeKey":"test","webhookSecret":"set","tax":"off","priceWarnings":[]}
```

Then open the preview page on your phone, add a jug, check out with card `4242 4242 4242 4242`, any future date, any CVC and ZIP. The order appears in Stripe → Payments, and the stock count drops by one.

**6. Branded order confirmation (Resend, optional)**
1. Resend → **Domains**: scirocco799.com must show **Verified**.
2. Resend → **API Keys → Create API key**. Name `scirocco799-store`, permission **Sending access**, domain `scirocco799.com`. Copy it (starts with `re_`).
3. Cloudflare Worker → **Variables and Secrets → Add → Secret** named `RESEND_API_KEY`. Deploy. The health check then shows `"email":"resend"`.

After each paid order the Worker emails the buyer from `orders@scirocco799.com` (reply-to mike@scirocco799.com) with the items, part numbers, totals and pickup or shipping next steps, and sends Mike a blind copy. Optional plain variables: `ORDER_FROM` to change the sender, `ORDER_COPY` = `off` to stop the copy. If Resend fails, the order still records and the error shows in Worker → Logs; the Stripe receipt still goes out.

## Running the store

- **Prices and products** are set in `worker.mjs` (`CATALOG` and `SHIPPING`, in cents). The flat shipping rate is a **placeholder ($25)** until Mike sets it. Ask Claude to change prices, then paste the new file and Deploy.
- **Stock** lives in D1. Check it in the D1 Console: `SELECT * FROM stock;`. Set a count: `UPDATE stock SET qty = 6 WHERE key = 'jug/color/Red';`
- **Orders**: Stripe → Payments shows every order, with items, pickup or shipping, and the buyer's email, phone or address. The D1 `orders` table keeps a copy for stock.
- **Pickup orders**: email the buyer to set a time. The address is never shown on the site.
- **Promo codes**: Stripe → Product catalog → Coupons → create a coupon, then add a promotion code. Checkout has a code box. Keep codes off jugs (MSRP-only decision; Tuff Jug MAP policy).
- **Sales tax**: off by default. To use Stripe Tax, set it up in Stripe, then add a plain variable `STRIPE_TAX` = `on` to the Worker.

## Going live (only when Mike says go)

1. Activate the 799 Motorsport account in Stripe (business details and bank account).
2. Repeat steps 3 and 4 in **live mode**, and replace the two Cloudflare secrets with the live values.
3. The health check then shows `"stripeKey":"live"`.

## Troubleshooting

- `"schema":"missing"`: step 1 hasn't run, or the `DB` binding is missing.
- Checkout says "unavailable": check **Worker → Logs** for the Stripe error. If Stripe reports a missing permission, give the restricted key **Write** on the resource it names (for example Products or Prices), then try again.
- Stock didn't drop after a paid test order: check the webhook in Stripe for failed deliveries, and that the signing secret matches.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/` or `/api/health` | Setup check |
| GET | `/api/catalog` | Products, prices, shipping options and stock |
| POST | `/api/checkout` | `{fulfillment: "pickup"\|"ship", items: [...]}` → Stripe Checkout URL |
| POST | `/api/stripe-webhook` | Stripe "paid" notices (signature checked); records the order, takes stock off, sends the confirmation email |

Browser requests are accepted from scirocco799.com, www.scirocco799.com and mwtcmi.github.io. Tests: `node --test tests/store.test.mjs`.
