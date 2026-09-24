# Order Portal

Route-based order dispatch system: clients register with a 4-digit ID and place
orders against it from a real product catalog. Car 1 orders are handled
on-demand (no fixed schedule) and Car 2 orders are auto-slotted into a fixed
weekly delivery day. A supervisor account sees everything.

## Roles
- `agent_car1` — sees/manages only car1 clients and orders
- `agent_car2` — sees/manages only car2 clients and orders
- `supervisor` — sees/manages all clients and orders, only one who can reassign a client's route

Roles are stored as Firebase Auth custom claims, not in Firestore, so
security rules and API routes can check them directly off the ID token.

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
- `/new-order`'s product catalog is cached in `localStorage`; if the live
  fetch fails, it falls back to the last successfully loaded catalog so
  clients can still browse and place an order (with a note that prices
  may be stale) instead of hitting a dead page.
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

4. **Deploy Firestore rules** — paste `firestore.rules` into the console's
   Rules tab, or `firebase deploy --only firestore:rules` with the CLI.

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
- `/new-order` — public page: client enters their ID, catalog loads priced for their route, then places the order
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
from the browser): `/new-order` looks up the client's route first via
`/api/clients/lookup-route`, then loads the catalog priced for that route;
`/place-order` resolves the price once an agent selects a client, since
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

