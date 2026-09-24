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
- `/products` — manage the product catalog: add, reprice, activate/deactivate
- `/new-order` — public page, clients place orders using their ID (no login)
- `/place-order` — agents (car1/car2 only, not supervisor) place an order on behalf of an already-registered client, e.g. for phone-in orders
- `/orders/[id]` — full order detail: items, total, status, notes
- `/dashboard/car1` — car1 agent's order queue
- `/dashboard/car2` — car2 agent's orders grouped by delivery date
- `/dashboard/supervisor` — all orders, filterable by route, with total value

## Notes / things to revisit
- Client ID generation is sequential starting at 1000, via a Firestore
  transaction on `meta/clientIdCounter` (avoids collisions). Caps out at 9999.
- No per-order route override yet (e.g. car1 covering a car2 client) —
  `order.route` is always copied from the client at creation time.
- No pagination yet on `/clients` or dashboards — fine at current scale,
  worth adding if client/order counts grow into the hundreds+.
- Reporting beyond the simple running total on the supervisor dashboard
  (e.g. revenue by month, by product) isn't built — Firestore isn't great
  at this; denormalize into a summary collection or export to BigQuery
  later if you need it.
- No email/SMS notifications when an order status changes — currently
  everything is pull-based (agent checks the dashboard).
