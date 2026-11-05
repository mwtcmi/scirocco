# 799 Paddock store (Stripe checkout on Cloudflare)

The store lives under The Paddock: the front page (`paddock.html`), category pages (`paddock/<category>/`) and product pages (`paddock/<category>/<product>/`), all sharing one cart (`paddock-store.js`, `paddock-store.css`). It calls a small Cloudflare Worker at `https://scirocco799-store.mr-mikewhite.workers.dev`. The Worker checks prices and stock, opens Stripe Checkout, and takes sold items off stock when Stripe says an order is paid. The Stripe key lives only in Cloudflare, never on GitHub or the page.

## How it's deployed

- **Website pages** deploy through Cloudflare Pages on every push (`main` = the live site, other branches = preview links).
- **This Worker** deploys through GitHub Actions ([.github/workflows/workers.yml](../.github/workflows/workers.yml)) using [wrangler.jsonc](wrangler.jsonc):
  - push to `main` → **live store** `scirocco799-store` (Stripe live keys, D1 `scirocco799-store`)
  - push to `preview` → **test store** `scirocco799-store-test` (Stripe test keys, D1 `scirocco799-store-test`, Stripe Tax off)
- Tests run first; a failing test stops the deploy. Never paste code into the Cloudflare editor: the next deploy would overwrite it.
- **Secrets** stay in Cloudflare (Worker → Settings → Variables and Secrets): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`. Deploys keep them. The GitHub Action needs the repository secret `CLOUDFLARE_API_TOKEN`.
- **Database changes** go in [migrations/](migrations/) as new numbered files (`0002_events.sql`, ...). The Action applies them before each deploy. Never edit a migration that has already run. `0001_initial.sql` was marked as applied on the live database on 2026-11-05 (its tables already existed).

## Previewing changes with the test store

1. Push the change to the `preview` branch. Cloudflare Pages builds `https://preview.scirocco-4s4.pages.dev`, and the Action deploys the test store.
2. On any `*.pages.dev` address, the cart talks to the test store, which is set in `paddock-store.js`. Pay with Stripe's test card `4242 4242 4242 4242`, any future date, any CVC and ZIP.
3. When it looks right, merge to `main`.

The test store needs its own Stripe test-mode secrets, set once on `scirocco799-store-test`: `STRIPE_SECRET_KEY` (an `sk_test_` or `rk_test_` key) and `STRIPE_WEBHOOK_SECRET` (from a Stripe test-mode webhook to `https://scirocco799-store-test.mr-mikewhite.workers.dev/api/stripe-webhook` with `checkout.session.completed` and `checkout.session.async_payment_succeeded`). There's no Resend key, so the test store sends no order emails.

Health check: `https://scirocco799-store.mr-mikewhite.workers.dev/` (live) or `https://scirocco799-store-test.mr-mikewhite.workers.dev/` (test), for example:

```json
{"ok":true,"service":"Scirocco 799 store","schema":"installed","stripeKey":"live","webhookSecret":"set","tax":"stripe","email":"resend","priceWarnings":[]}
```

After each paid order the Worker emails the buyer from `orders@scirocco799.com` (reply-to mike@scirocco799.com) with the items, part numbers, totals and pickup or shipping next steps, and sends Mike a blind copy.

## Adding or changing products

1. Edit [catalog.json](catalog.json): categories, and products with their category, photos, facts, part numbers and price. Products with `"external"` (merch for now) link out and never enter the cart.
2. Run `node scripts/build-store.mjs`. It rewrites every category and product page, plus the category tiles on `paddock.html` (between the `<!-- store:... -->` markers; don't hand-edit those parts).
3. Prices in catalog.json are what checkout charges: the Worker builds its catalog from this file. Cart products need `price`, `map` (minimum advertised price) and `checkoutNote` (the line under the item in Stripe). A new cart product also needs a stock row: add a migration such as `INSERT OR IGNORE INTO stock (key, qty) VALUES ('newthing', 0);`.
4. Run `node scripts/wrap-up.mjs` and commit the generated pages with the sitemap.

Categories with no products are hidden on the front page and get no page. A category with more than 24 products gets numbered pages (`/page/2/`, ...).

## Running the store

- **Prices and products** are set in [catalog.json](catalog.json); shipping (`SHIPPING`, in cents) is in `worker.mjs`. A push to `main` rebuilds and deploys both the pages and checkout.
- **Stock** lives in D1. Check it in the D1 Console: `SELECT * FROM stock;`. Set a count: `UPDATE stock SET qty = 6 WHERE key = 'jug/color/Red';`
- **Orders**: Stripe → Payments shows every order, with items, pickup or shipping, and the buyer's email, phone or address. The D1 `orders` table keeps a copy for stock.
- **Pickup orders**: email the buyer to set a time. The address is never shown on the site.
- **Promo codes**: Stripe → Product catalog → Coupons → create a coupon, then add a promotion code. Checkout has a code box. Keep codes off jugs (MSRP-only decision; Tuff Jug MAP policy).
- **Sales tax**: off by default. To use Stripe Tax, set it up in Stripe, then add a plain variable `STRIPE_TAX` = `on` to the Worker.

## Troubleshooting

- `"schema":"missing"`: the migrations haven't run (check the GitHub Action), or the `DB` binding is missing.
- Checkout says "unavailable": check **Worker → Logs** for the Stripe error. If Stripe reports a missing permission, give the restricted key **Write** on the resource it names (for example Products or Prices), then try again.
- Stock didn't drop after a paid test order: check the webhook in Stripe for failed deliveries, and that the signing secret matches.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/` or `/api/health` | Setup check |
| GET | `/api/catalog` | Products, prices, shipping options and stock |
| POST | `/api/checkout` | `{fulfillment: "pickup"\|"ship", items: [...]}` → Stripe Checkout URL |
| POST | `/api/stripe-webhook` | Stripe "paid" notices (signature checked); records the order, takes stock off, sends the confirmation email |

Browser requests are accepted from 799motorsport.com, www.799motorsport.com, scirocco799.com, www.scirocco799.com and mwtcmi.github.io, plus `ALLOWED_ORIGINS` (the test store allows the preview link). Tests: `node --test tests/store.test.mjs`.
