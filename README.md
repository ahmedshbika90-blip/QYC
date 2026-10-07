# Order Portal

Route-based order dispatch system: clients register with a 4-digit ID and place
orders against it from a real product catalog. Car 1 orders are handled
on-demand (no fixed schedule) and Car 2 orders are auto-slotted into a fixed
weekly delivery day. A supervisor account sees everything.

## Roles
Roles are Firebase Auth custom claims (`role`), managed by the **admin** at
`/admin/users` — every role's definition, label and home page lives in
`lib/roles.js`.

| Role key | Title | Home | Can |
|---|---|---|---|
| `admin` | مدير النظام | `/admin/users` | create accounts, assign roles, disable/enable, set passwords; nothing else |
| `manager` | المدير | `/dashboard/supervisor` | everything operational (was `supervisor`) |
| `agent_car1` / `agent_car2` + `salesSupervisor: true` | مشرف المبيعات (جملة / تجزئة) | `/dashboard/car1` or `/car2` | invoices on their route; every van's stock; approves agents' shipping requests; `/fleet-history` |
| `agent_car1` / `agent_car2` + `salesSupervisor: false` | مندوب المبيعات (جملة / تجزئة) | `/dashboard/car1` or `/car2` | invoices and shipping requests for their own van only |
| `warehouse_keeper` | أمين المخزن | `/dashboard/warehouse` | receiving, fulfilling shipping requests, transfers — no prices |
| `accountant` | المحاسب | `/accounting/invoices` | all invoices (read-only), all stock (`/stock`), records/voids **payments** — seen by this role only |
| `executive` | الإدارة التنفيذية | `/executive` | view-only dashboard: operations summary, customers & routes, inventory |
| `depot_viewer` | مطّلع على المخزن الرئيسي | `/warehouse/view-stock` | main depot balances only |

Accounts still carrying the old `supervisor` claim keep working as `manager`
(normalised in `lib/apiAuth.js` and `lib/useAuth.js`); saving them once on the
admin page rewrites the claim.

**First admin:** `node scripts/setRole.js you@company.com admin`. After that,
everything is done from `/admin/users`.

**Role changes apply within a minute.** Changing a role, disabling an account
or setting a new password revokes that account's sessions; every API call
checks this (cached 60 s per server instance), and the browser signs the
person out with an explanation.

## Payments (accountant)
Stored apart from invoices so no other endpoint can leak them:
`invoicePayments/{orderId}` (the payments list + totals) and
`paymentRefs/{bank}__{ref}` (makes a bank reference usable once). A payment
has a bank (Bank of Khartoum, The Nile Bank, National Bank of Omdurman,
Faisal Islamic Bank — `lib/paymentsShared.js`), a reference of 1–11 digits,
an amount and a date. Payments can't exceed the invoice total, can't be
recorded on a cancelled invoice, and are voided with a reason rather than
deleted.

## English
The **EN / ع** button (top bar and login page) switches the whole
interface. Arabic stays the source; `lib/i18n.js` translates the rendered
page from `lib/i18nDict.js` (loaded only when English is chosen) and flips
the layout to left-to-right. After adding Arabic text anywhere, run
`node scripts/i18n-check.js` — it lists any string without English.

## Arabic / RTL
The whole interface is in Arabic with a global `dir="rtl"` layout (set in
`pages/_document.js`). Data stays in English internally (status values,
route codes) — only what's displayed is translated, via `lib/labels.js`.
Numbers (prices, phone numbers, client/order IDs) stay in Western digits
on purpose (`.tabular-ltr` class) since that's how they're read in daily
business use, even inside Arabic text. Dates are formatted with the
Gregorian calendar explicitly forced (`lib/labels.js` → `formatDate`),
since some browsers default Arabic locales to the Hijri calendar, which
would otherwise scramble delivery-date scheduling.

## Built for unreliable connections
- Every client-side API call goes through `lib/apiFetch.js`, which adds a
  15s timeout and retries twice with backoff before giving up — a slow
  or flaky connection gets a real chance to succeed instead of failing
  on the first hiccup.
- `components/OfflineBanner.js` shows a banner the moment the browser
  goes offline, so people aren't left guessing why nothing is loading.
- Loading states use skeleton placeholders (`components/Loading.js`)
  instead of a layout jump from blank to full, which matters more on
  connections where a fetch can visibly take a couple of seconds.

## What's in this build
- **Product catalog** — staff add products with price + unit; clients pick
  quantities from the live catalog when ordering (no more free-text items).
  Prices are looked up server-side at order time, never trusted from the client.
- **Client management** — full list (searchable), individual edit page,
  route reassignment (supervisor-only), active/inactive toggle.
- **Order detail page** — itemized breakdown, total, delivery date, status,
  and a notes field for agent context ("called twice, no answer", etc).
- **Dashboards** — car1 (flat incoming queue), car2 (grouped by delivery
  date), supervisor (all orders, filterable by route, running total value).
- **Navigation shell** — shared nav bar across all staff pages, role label,
  sign-out. Root `/` auto-redirects to the right dashboard.

## Setup

1. **Create a Firebase project** (console.firebase.google.com), enable:
   - Authentication → Email/Password sign-in method
   - Firestore Database

2. **Install dependencies**
   ```
   npm install
   ```

3. **Environment variables** — copy `.env.local.example` to `.env.local` and fill in:
   - The `NEXT_PUBLIC_FIREBASE_*` values from Project Settings → General → Your apps
   - The `FIREBASE_*` (admin) values from Project Settings → Service Accounts →
     Generate new private key. Paste `client_email` and `private_key` from the
     downloaded JSON exactly as they appear (keep the `\n` escapes and quotes).

4. **Deploy Firestore rules and indexes** — `firebase deploy --only firestore:rules,firestore:indexes`
   (or paste `firestore.rules` into the console's Rules tab and create the
   indexes listed in `firestore.indexes.json`).

5. **Create staff/agent accounts** — Firebase console → Authentication →
   Users → Add user, for each of your 3 staff members.

6. **Assign roles** to each account (needs `.env.local` filled in first):
   ```
   node scripts/setRole.js agent1@yourcompany.com agent_car1
   node scripts/setRole.js agent2@yourcompany.com agent_car2
   node scripts/setRole.js supervisor@yourcompany.com supervisor
   ```

7. **Set Car 2's real delivery day** — edit `lib/constants.js`:
   ```js
   car2: {
     deliveryDay: "tuesday", // <- change to the actual day
     cutoffHour: 18,          // <- orders after this hour on delivery day roll to next week
   }
   ```

8. **Add products** — once logged in as any staff account, go to `/products`
   and add your catalog (name, price, unit, optional category) before
   clients start placing orders.

9. **Run it**
   ```
   npm run dev
   ```

## Pages
- `/` — redirects to the right dashboard (or `/login`)
- `/login` — staff/agent sign-in
- `/register-client` — staff registers a new client, gets back their 4-digit ID
- `/clients` — searchable list of all clients (route-scoped for agents)
- `/clients/[id]` — edit a client's details, reassign route (supervisor only), deactivate
- `/products` — manage the product catalog: add, reprice per route (car1/car2), activate/deactivate/delete (supervisor only)
- `/place-order` — agents (car1/car2 only, not supervisor) place an order on behalf of an already-registered client, e.g. for phone-in orders
- `/orders/[id]` — full order detail: items, total, status, notes
- `/reports/sales` — printable sales report (date range, route filter for supervisor), grouped by client with per-client and grand totals; "طباعة / حفظ PDF" uses the browser's own print-to-PDF, so Arabic/RTL renders correctly with no server-side PDF library needed
- `/dashboard/car1` — car1 agent's order queue
- `/dashboard/car2` — car2 agent's orders grouped by delivery date
- `/dashboard/supervisor` — all orders, filterable by route, with total value

## Order status
Simplified to three values: `pending` (set automatically at creation, never
chosen manually), `delivered`, and `cancelled` — the agent picks one of the
latter two once they've handled the order. There's no more multi-step
contacted/confirmed/processing workflow. The sales report only counts
`delivered` orders; `cancelled` ones are excluded entirely, and `pending`
ones haven't happened yet so they're excluded too.

## Per-route pricing
Each product now has two prices — `prices.car1` and `prices.car2` — set
independently by the supervisor on `/products`. The correct price is
always resolved server-side from the client's actual route (never trusted
from the browser): `/place-order` resolves the price once an agent selects a client, since
the agent already knows which route they work.

**If you have existing products from before this change**, they'll have
a single old `price` field instead of `prices.car1`/`prices.car2` — open
each one in `/products` and re-enter both prices; there's no automatic
migration.

## Notes / things to revisit
- Client ID generation is sequential starting at 1000, via a Firestore
  transaction on `meta/clientIdCounter` (avoids collisions). Caps out at 9999.
- No per-order route override yet (e.g. car1 covering a car2 client) —
  `order.route` is always copied from the client at creation time.
- No pagination yet on `/clients` or dashboards — fine at current scale,
  worth adding if client/order counts grow into the hundreds+.
- The sales report fetches all delivered orders for the route(s) in scope
  and filters/groups in memory — deliberately avoids needing a new
  Firestore composite index, but worth revisiting (e.g. paginating or
  pre-aggregating) if order volume grows very large over time.
- No email/SMS notifications when an order status changes — currently
  everything is pull-based (agent checks the dashboard).


## Read efficiency (how data is fetched)
- **Clients** use a version stamp (`meta/versions.clients`, bumped on every
  client add/edit). The browser keeps the list locally; each visit costs
  1 read to check the version, and the full list is only re-downloaded
  when something actually changed. Search/filters run locally (0 reads).
  Cached client data is wiped on logout and idle logout.
- **Invoices**: last 7 days by default, with quick switches for 2 weeks and
  a month (or a custom range in the filter). Capped at 100 per page inside
  the period, with "load more" for the rest. **Inventory history**: last
  30 days by default, 200 per page,
  "load more" for the rest. Pick an earlier "from" date to go further back.
- **Pending banners** query only pending documents, never full history.
- **Sales report**: the date range is part of the query (defaults to today).

## Required Firestore indexes
Deploy once with `firebase deploy --only firestore:indexes` (uses
`firestore.indexes.json`), or create them from the error link the first
time a page needs one:
- `orders`: route ASC, createdAt DESC (you likely already have this one)
- `inventoryDocs`: route ASC, createdAt DESC (new — needed by agents'
  dashboards and Documents)

## Store class
Clients now have a store class (A/B/C), required at registration and
editable later. Clients registered before this change have no class until
edited. Invoices and clients can both be filtered by class.


## Security model
- **No public pages.** Every page and API route requires a staff login;
  clients don't use the app directly — agents place invoices for them.
- **Firestore rules are deny-all** (`firestore.rules`). All data access goes
  through the server API routes (Admin SDK), which enforce roles, route
  scoping, validation, and stock transactions. Deploy the rules with
  `firebase deploy --only firestore:rules`, or paste the file into
  Firebase console → Firestore → Rules → Publish.

## Session timeout
10 minutes of inactivity per device. The last-activity time is stored on
the device (lib/session.js), so the timeout also applies after the phone
was locked or the app was closed: reopening after more than 10 minutes
requires signing in again. Change `IDLE_TIMEOUT_MS` in lib/session.js to
adjust.

## Weak and lost connections
- **Retries:** every request waits up to 15s and retries twice. Server
  rejections (e.g. not enough stock) are never retried.
- **No duplicates:** every create (invoice, client, product, inventory
  document) carries a device-generated request ID; a repeat returns the
  original. Confirm/approve/cancel re-check status inside the transaction,
  so a double submission can never move stock twice.
- **Unsent invoices** are queued on the device per agent and sent
  automatically (on reconnect, on returning to the app, every 30s). The
  form clears once queued. If the server later refuses one (e.g. stock ran
  out meanwhile), it stays visible with the reason and can be deleted.
- **Offline data:** clients and the product catalog are saved on the device
  (wiped on logout); pages viewed this session show their last copy. The
  connection banner says when data may be outdated.
- **Offline app shell:** `public/sw.js` caches only the app's code and page
  shells (never API data), so previously opened pages open without
  internet. Unvisited pages show `public/offline.html`.
- **Limit:** login tokens last 1 hour. After ~1 hour fully offline, opening
  a new page waits for the connection (already-open pages keep working).

## Invoice locking & change requests
An invoice is **locked** 9 hours after creation, or as soon as a sales
report including it is shared (sharing asks for confirmation, locks first,
and doesn't share if the lock fails). Locked invoices can't be edited or
cancelled by agents; they send a **change request** (edit or cancel, with a
reason) that the supervisor approves or rejects in **الطلبات**. Approval
applies the change with the same logic as a direct edit (current prices,
live stock check, edit history linked to the request), in one transaction.
The supervisor can still change locked invoices directly (recorded in edit
history). Notes stay editable. Shared reports are recorded in `sentReports`.

## Operating margin (هامش التشغيل)
Selling price − supplier cost, from locked, non-cancelled invoices, by car
and period. Supplier cost is a **weighted average**: each approved goods
receipt blends its supplier price with the cost of stock on hand. Each
invoice line saves the cost at the moment of sale, so margins stay stable
and need no extra reads. Set a product's unit cost on the Products page to
give existing stock a cost. Missing costs are reported, never guessed;
older invoices without a saved cost use the current average (flagged as an
estimate). Cost data is supervisor-only in every API response.

## Tests
`npm test` runs the real API handlers against an in-memory database that
enforces Firestore's transaction rules (tests/). No Firebase needed.

## Near-live updates (no reload needed)
Open screens ask "did anything change?" every 20 seconds (and the moment
the tab regains focus) — one small read via `/api/versions`, regardless of
how much data exists. Only when the answer is yes does the screen
re-download its real data. This is deliberately NOT a live Firestore
listener: that would mean the browser reading the database directly,
which the deny-all security rules exist specifically to prevent. Areas:
`orders_car1`, `orders_car2`, `requests`, `inventory`, `clients` — each
bumped only by the actions that actually touch it (see lib/versions.js).

## Warehouse: sharing & daily numbering
Every inventory document (goods received, loading, offloading) can be
shared as a PDF from its detail page — same underlying capture logic as
the sales report (lib/sharePdf.js), with action buttons excluded from the
image. Loading and offloading are numbered per car per day in Sudan's time
zone ("this will be the 3rd loading today"), shown on the creation form
before submitting and after, on the document itself, and on its card in
every list. Numbering is assigned inside the same transaction that creates
the document, so two near-simultaneous submissions can never receive the
same number, and a retried (duplicate) submission returns its original
number rather than consuming a new one.

## Demo data (presentations)
`scripts/demo/seed.js` deletes the business data (invoices, clients,
warehouse documents, requests, payments, logs) and creates months of
realistic sales history **using your own products, prices and costs**.
Products, staff accounts and roles are kept; stock is left as it is unless
you add `--reset-stock`.

```
npm run demo:seed                                   # dry run — shows counts, changes nothing
npm run demo:seed -- --run --confirm=<project-id>   # do it (last 4 months)
npm run demo:seed -- --run --confirm=<project-id> --months=6 --seed=7
```
Same `--seed` → same data every time. Every demo document has `demo: true`.
Prefer a separate Firebase project for demos; on the live project, take a
backup first.

## Daily sales summaries (dashboard read cost)
Dashboards read pre-computed day documents instead of every invoice:
`dailyStats/{YYYY-MM-DD}` (Khartoum business day) and `monthlyStats/{YYYY-MM}`
(route totals, for the 12-month trend). Every invoice create / edit /
cancel adds its difference to its own day **in the same transaction**
(`lib/salesStats.js`, `writeInvoiceStats`). Lines without a saved unit cost
are stored as quantities and priced at the product's current average cost
when read, exactly like the old calculation.

Used by: manager summary + trend, executive overview + customers. Until
`meta/statsState.ready` is true the old invoice-by-invoice code runs, so the
code can be deployed before the backfill.

**After deploying:**
```
npm run stats:backfill                                   # dry run — shows days/invoices, writes nothing
npm run stats:backfill -- --run --confirm=<project-id>   # builds every day + month, then switches dashboards over
```
Safe to repeat; days that already match are left alone. `--from=YYYY-MM-DD
--to=YYYY-MM-DD` rebuilds just a range.

**Nightly check:** Vercel cron (`vercel.json`, 00:30 UTC = 02:30 Khartoum)
calls `/api/cron/verify-stats`, which recomputes yesterday from the raw
invoices and repairs any drift (recorded in `meta/statsCheck`, repairs in
`statsDrift`). Needs `CRON_SECRET` set in Vercel; does nothing without it.
Check any day by hand: `curl -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/cron/verify-stats?day=2026-10-01`.

The demo seed writes the summaries too.

## Server caching, delta sync, rate limit
- **Product list** and **English names** are cached per server instance
  (90 s / 120 s) and dropped as soon as a related change counter in
  `meta/versions` moves (`lib/serverCache.js`): 1 read instead of the
  whole collection when nothing changed.
- **Clients** are synced by delta: every client write stamps `syncAt`;
  a device with a copy downloads only clients written since then
  (`lib/clientsStore.js`, `/api/clients/list?since=`).
- **Notifications** carry a signature built from the change counters; a
  device that already has the current list gets `unchanged` for 1 read.
  Resolved-item history is bounded by indexes.
- **Rate limit** (public order form + route lookup): Upstash Redis when
  `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (or the
  `KV_REST_API_*` names from the Vercel integration) are set; otherwise
  in-memory per server instance. No Firestore reads/writes either way.

## Server region
`vercel.json` pins API functions to `fra1` (Frankfurt). Keep it next to the
Firestore location (Firebase console → Project settings → Default GCP
resource location): eur3 / europe-west* → `fra1`; nam5 / us-central1 →
`iad1`.

## New Firestore indexes (deploy: `firebase deploy --only firestore:indexes`)
- `inventoryDocs`: createdBy, type, finalizedAt DESC
- `changeRequests`: requestedBy, status, decidedAt DESC
- `shipmentRequests`: requestedBy, status, requestedAt DESC
(until deployed, notifications fall back to the old queries)
