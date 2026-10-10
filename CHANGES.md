# Chart colours — final

- Night mode: the original chart palette (forest green / navy channels,
  cool-tone products), unchanged.
- Day mode: the original palette, with the two product families in brand
  colours — Alwafi maroon and Chipsiano orange — on the family pie and the
  per-item bars. Done with CSS variables that are unset in night mode, so
  each theme picks its own colours without any page logic.
- Pie / donut colours applied via style (works with CSS variables
  everywhere).

---

# Chipsiano cut-out + new chart colours

- Chipsiano card: the character is now cut out of the poster (no square
  behind him), with a soft shadow and the slow "breathing" motion.
- Restored `public/brand/mahgoub-mark-white.png` (day-mode watermark).
- Chart palette redone for contrast in both themes — each colour has a
  deeper day shade and a lighter night shade: wholesale emerald, retail
  indigo; products blue, orange, teal, rose, violet, gold. Alwafi vs
  Chipsiano in the pie: blue vs orange. Applies to the manager's dashboard too.

---

# Executive dashboard — night-mode polish

- Brand cards: figures and their sub-text are pure white on the Alwafi and
  Chipsiano cards in both modes; the company card's text turns white in
  night mode.
- Wheat-mark watermark in the greeting panel: white by day; by night the
  company's own blue with a soft glow instead of a grey-looking white.
- Charts back to their original colours (brand colours only on the cards).

---

# Night-mode text colours; no watermark

- Removed the wheat watermark from the greeting panel.
- "white" in this app is the surface colour, so it turns dark at night —
  white text on coloured areas became dark/unreadable. Added `snow` (always
  #fff) and `solid.*` (deep red/amber/green/ink that don't change at night):
  greeting panel, today card, brand cards, error banner, red/amber/green
  buttons and badges, admin badge, success toast now keep clear white text
  on a deep colour in both themes.

---

# Executive dashboard — brands and polish

- Brand ribbon under the greeting: Mahgoub Sons Food Division (total units
  and invoices in the period), الوافي and شيبسيانو (units and share, with a
  share bar). Cards rise in one after another, logos settle with a soft pop,
  the Chipsiano character breathes slowly; share bars grow from zero.
- A faint glow of the three brand colours fades in behind the top area, and
  the company's wheat mark drifts into the greeting panel as a watermark.
- Greeting panel is now frosted, translucent glass — calmer in night mode.
- Alwafi / Chipsiano use their brand colours in the charts (pie, item bars).
- Daily sales trend skips Fridays (no sales) — 30 working days.
- English name: "Mubashir".
- Logos in `public/brand/` (backgrounds removed, resized). All animation
  respects the phone's "reduce motion" setting.

---

# Demo data — uses your real products

- The demo generator now reads the products already in the system and uses
  their exact names, wholesale/retail prices and costs. Products aren't
  changed; stock stays as it is unless `--reset-stock` is given. Products
  missing a wholesale or retail price are skipped (and listed in the dry run).

---

# Demo data generator

- `scripts/demo/seed.js` (+ `generate.js`): wipe business data and create a
  realistic history — 7 Alwafi/Chipsiano products with English names, ~65
  wholesale/retail clients, ~900 invoices over 4 months (growth trend,
  Friday off, weekly retail routes, big wholesale buyers, samples,
  discounts, ~2% cancelled), payments (retail pays fast, wholesale on
  credit), warehouse receipts, van loadings and damage — with a stock ledger
  that adds up. Dry run by default; needs `--run --confirm=<project-id>`.
- `tests/run11.js`: the generated data loads into every dashboard,
  accounting and stock API without errors.

---

# Round 5c — search by part of a transaction reference

- Typing 3 or more digits finds payments whose reference **starts or ends**
  with them (e.g. "4417" → 44170023 and 90034417), across all banks; the
  typed part is highlighted. 1–2 digits still match an exact reference.
- Efficient: two range queries on single-field indexes (Firestore creates
  these automatically — nothing to deploy), ~one read per match, max 20.
- References saved before this update get the searchable fields added
  automatically on the first partial search (one time).

---

# Round 5b — efficient receipts history

- Receipts history (executive) and the admin change log go back to the
  efficient queries: Firebase returns only the needed documents (one read
  each). Their two indexes are back in `firestore.indexes.json`.
- Until those indexes are deployed, each query falls back to the slower
  scan automatically (and logs a warning on the server) — no error is shown.
- **Deploy once:** `firebase deploy --only firestore:indexes`

---

# Round 5 — fixes from testing

- **Phantom error banners** ("/executive", "Staff sign-in"): Next.js announces
  each page change to screen readers through a hidden role="alert" element;
  the error banner mistook it for an error. Hidden elements are now ignored.
- **Executive receipts history server error**: its query needed a Firestore
  composite index that wasn't deployed. Rewritten to need none (same for the
  admin change log); those two index entries were removed.
- **Executive page**: full tab names on phones (icon above a two-line label,
  never "…"); "view only" pill removed; hero balanced with the greeting on
  one side and a today card (day, date, year) on the other.
- **Margin % in English**: the margin lines are now translated as whole
  phrases ("12.3% margin on wholesale sales") instead of word by word.
- **Invoice — adding a product**: its quantity box takes focus with the "1"
  selected, so the keyboard opens and typing replaces it; "Done"/Enter
  closes the keyboard.
- **Invoice totals**: one clean block — just الإجمالي and "+ إضافة خصم";
  with a discount: المجموع, الخصم (with ✕ to remove), then الإجمالي.
- **Accountant search**: one search box; typing only digits also looks the
  number up as a transaction reference (exact, all banks) and shows the
  matching invoice(s) on top.
- **Numbers**: thousands separators everywhere, **while typing** too
  (100,000) — prices, costs, discount, payments, quantities, stock. No
  forced ".00" anymore.

---

# Round 4 — admin edit mode, English names, usability, executive redesign

## Admin
- Accounts are read-only until **تعديل** is pressed; then the Arabic name,
  English name, job and route are edited together and saved with **حفظ**
  (or **إلغاء**). Disable / new password live inside the edit panel.
- Every account can have an **English name** (`profiles/{uid}.nameEn`), used
  when the interface is in English (greeting, names anywhere on screen).

## English names for products
- The manager can enter an English name for each product (products page,
  add and edit). `/api/i18n/terms` serves product + staff English names;
  the English interface swaps them in automatically. Product search on the
  invoice screen matches either name.

## Easier everyday use
- **Back button** sticks under the top bar while scrolling — reachable from
  any point of a long page.
- **Errors are always seen**: if an error appears off-screen, it's mirrored in
  a red banner under the top bar (tap to jump to it). Works on every page.
- **Invoice screen**: out-of-stock products show "غير متوفر في السيارة" and
  can't be added; in-stock products are listed first; the newest added line
  goes to the top; one-tap **recent clients**; client search also matches
  phone and location.
- **Register client**: location suggestions from existing clients; a gentle
  warning if the phone number already belongs to a client.
- **Dates** (from/to) always side by side on phones; long numbers scale and
  wrap inside their card instead of breaking the layout.
- Password eye sits on the right in both languages (no overlap).
- Only one menu item is highlighted (e.g. «قاعدة العملاء» no longer lights
  «لوحة المتابعة» too).

## Executive dashboard
- New hero with greeting, picture and name; sticky tab bar.
- **ملخص العمليات**: sales trend first, then the period picker (اليوم، أمس،
  آخر 7 أيام، آخر 30 يومًا، هذا الشهر، مخصص), then five headline cards
  (units, invoices, sales value at cost, customers who bought, average
  invoice at cost) each with ▲/▼ vs the previous period of the same length.
- **العملاء والمسارات**: registered customers (all time) first, then the
  period picker introducing the period-based part (routes, top 10).
- Opens on the last 7 days.

## Tests
- `tests/run10.js` now 7 scenarios. All 10 suites pass.

---

# Round 3 — sales jobs by route, payment edit/search, paid on invoices, polish

## Sales staff: job and route chosen separately
- The admin picks **مشرف المبيعات** or **مندوب المبيعات**, then **جملة** or
  **تجزئة**. Stored as `role` (route: `agent_car1`/`agent_car2`) +
  `salesSupervisor` (true/false); every route rule keeps working unchanged.
- Supervisor powers now follow the flag, on either route: every van's stock,
  approving agents' delivery requests (any route, never their own), van
  cargo history. An agent sees only their own van + depot (enforced on the
  server). A supervisor's own requests go straight to the warehouse keeper.
- Existing accounts: wholesale = supervisor, retail = agent (as before) until
  the admin re-saves them; flagged on the admin page.

## Accountant
- Search by **رقم العملية**: a "رقم العملية" tab on the invoice list asks the
  server (one lookup per bank) and lists the matching invoice(s).
- **Edit a payment** (bank, reference, amount, date, note). Same rules as
  adding; earlier values kept in the payment's `edits` history.
- After recording a payment: **رجوع إلى الفواتير**, **دفعة لفاتورة أخرى**
  (opens the list with the search ready), or another payment on the same one.

## Invoices
- Everyone who can see an invoice (manager, sales staff) now sees **paid**
  and **remaining** on the invoice card and page. Bank names, references
  and dates stay with the accountant.
- Fixed: after an invoice is sent (or saved offline), the "available"
  quantities on the order screen now drop right away, then refresh from the
  server. Before, they stayed at the old number until reload, so the next
  invoice failed on the server's stock check.

## Polish
- Brand: the icon is gone — just the word **مباشر** (top bar, login).
- Sign-out asks for confirmation (automatic idle sign-out doesn't).
- Money always shows two decimals: on the dashboards and in every money
  field (price, supplier cost, discount, adjusted price, payment) — the field
  rounds to `0.00` form when you leave it.
- Password fields: **press and hold** the eye to see the password.
- Executive: a quiet greeting at the top (صباح الخير / مساء الخير + first
  name) with a profile picture — tap to add or change; resized to 256 px in
  the browser and stored in `profiles/{uid}` (≈20 KB).

## Tests
- `tests/run10.js` (5 scenarios). All 10 suites pass.

---

# Roles round — admin, manager, sales supervisor, accountant, executive, English

## Roles
- New `lib/roles.js`: one place for role keys, Arabic titles, descriptions and
  home pages (the home map used to be copied in three files, and one copy was
  missing the depot viewer).
- `supervisor` → `manager` everywhere (API checks, pages, wording "المشرف" →
  "المدير"). Old `supervisor` claims are normalised to `manager`, so nobody is
  locked out before the admin re-saves them.
- `agent_car1` is now titled **مشرف المبيعات**, `agent_car2` **مندوب المبيعات**
  (keys unchanged — they're tied to the van routes in stored data).
- New roles: `admin`, `accountant`, `executive`.

## Admin — `/admin/users`
- List / search / filter accounts; create (email, temporary password, name,
  role); change role; disable / re-enable; set a new password.
- An admin can't change their own role or disable themselves.
- Every change goes to `auditLog` (shown at the bottom of the page).
- Role change, disable and password reset revoke the person's sessions.
  `requireUser` now checks for that (60 s cache per instance), returns 401 +
  `X-Session-Revoked`, and the browser signs out with a message on the login
  page. Before this, a demoted user kept the old role for up to an hour.

## Sales supervisor (car1) — `/fleet-history`
- Every van's cargo documents (deliveries, returns, damage), **confirmed only**,
  with a visible van filter built from `ROUTES` (a car3 appears automatically).
- Server: `/api/inventory/list?scope=fleet`; car1 may open other vans'
  confirmed documents. Supplier cost is now stripped from documents for every
  role except the manager.

## Accountant
- `/accounting/invoices`: all routes, payment status (unpaid / partial / paid),
  totals for what's shown, filters, search.
- `/accounting/invoices/[id]`: invoice (read-only) + payments: bank, reference
  (digits only, max 11 — Arabic digits accepted), amount, date, note.
  Several payments per invoice; void with a reason (kept for the record).
- Rules enforced on the server: no overpayment, no payments on cancelled
  invoices, a bank + reference pair only once across all invoices, retry-safe.
- `/stock`: every location's balance (no average cost).
- Payments are stored outside the invoice document, so no existing endpoint
  can expose them to another role.

## Executive — `/executive` (view only)
- **ملخص العمليات**: sales trend (same chart as the manager's), donut
  wholesale vs retail units with the total inside, pie الوافي vs شيبسيانو,
  units per item with % of total, invoices split by route, sales value **at
  inventory cost** split by route.
- **العملاء والمسارات**: registered customers by route with %, route cards
  (invoices, units, buyers, reach), top 10 customers (invoices, units, % of
  units), link to `/executive/customers` (full database, searchable, 50 at a
  time, cached on the device).
- **المخزون**: current stock (quantities only) and approved goods-received
  history with totals per product; sub-tabs keep each view short.
- The executive never receives selling prices, margin, supplier prices or
  average cost.

## English
- EN / ع toggle in the top bar and on the login page; choice saved per device
  and applied before first paint (no RTL flash).
- `lib/i18n.js` translates the rendered page from `lib/i18nDict.js` (1,028
  strings incl. server error messages), flips to LTR, translates dialogs,
  and puts the Arabic back when switching back. The dictionary is a separate
  chunk loaded only in English mode. Dates switch to English month names; the
  trend chart follows the reading direction.
- `node scripts/i18n-check.js` lists any Arabic string without English.

## Data / deploy
- `firestore.rules`: live-update counter readable by the new roles.
- `firestore.indexes.json`: + `auditLog (area, at desc)`,
  `inventoryDocs (type, createdAt desc)`.
- New live-update area `payments`.
- Tests: `tests/run9.js` (11 scenarios) — all 9 suites pass.

---

# Masar — round 3 (Oct 2026)

`npm test` (5 suites, new `tests/run5.js`) passes; `next build` succeeds.

1. **Goods received → supervisor's الطلبات.** New section "مستندات المخزن بانتظار اعتمادك" at the top of /requests. المخزون shows them only once approved (just a pointer while pending).
2. **Invoice discount — one amount for the whole invoice** (`lib/invoiceDiscount.js`). Stored as `subtotal`, `discount`, `total`. Shown on the new-invoice form, edit form and invoice page (المجموع / خصم الفاتورة / الإجمالي). Server refuses a discount above the invoice. Counted in the sales report (per client and grand total), the margin report (spread across lines by value, so revenue and margin are after discount), edits and change requests. Tag "يوجد تخفيض" on invoices with a discount. Old invoices read as discount 0, unchanged.
3. **Damage needs supervisor approval.** The keeper's تالف is saved pending; nothing leaves stock until the supervisor approves in الطلبات (balance re-checked then; double approval can't deduct twice). Keeper notified of the decision. A supervisor's own damage entry is still immediate.
4. **"تسليم بضاعة"** for the document sent back to the agent (document page, archive, history filter, notifications). "أمر شحن" stays for the agent's request.
5. **إضافة عميل inside العملاء.** Removed from the menu; big button on the العملاء page; the agents' home shortcut now opens العملاء.
6. **Phones on an Arabic keyboard** — ٠-٩ (and ۰-۹) accepted and stored as English digits, on the forms and on the server (`lib/validation.js`).
7. **SDG** on every amount via the shared `formatNumber` ("12,500.00 SDG", kept together inside Arabic text).
8. **Note on a new invoice** before submitting.
9. **No per-product discount** — refused by the server.
10. **Discount filter** (فيها خصم / بدون خصم) on the car1, car2 and supervisor invoice lists.
11. **Free sample removed** — refused by the server; old invoices keep their totals.

Also: the public order form no longer returns supplier cost to the browser.

Note: editing an OLD invoice that has a free-sample line re-prices that line normally (free samples no longer exist). Untouched old invoices stay as they are.

---

# Masar — field feedback round (Oct 2026)

All tests pass (`npm test`, now 4 suites incl. new `tests/run4.js`) and `next build` succeeds.

## Rules (enforced on the server, shown on screen)
- **Warehouse keeper can't change a request.** Shipping orders and cargo returns are read-only for him: accept as-is or cancel. `fulfill.js` ignores any `items` sent.
- **Cancel with a note** — `PATCH /api/shipment-requests/[id]/cancel` (keeper only, note required). Nothing moves. The agent is notified with the note (toast, app-open prompt, request page).
- **One open request per agent.** A new shipping order / return is refused (409) while one is `pending_car1` or `pending_warehouse`. Race-proof via `agentOpenShipment/{uid}` in the create transaction. Accept vs cancel can't both happen (status re-checked inside the document transaction).
- **Cargo return = only what's on the car**, each line capped at the car's quantity (screen + server). Duplicate lines refused.
- **Client edits lock 12 h after registration** for agents (`lib/clientEditLock.js`). After that the save becomes a request (`POST /api/clients/[id]/edit-request`, type `client_edit` in `changeRequests`) that the supervisor approves in الطلبات. Supervisor edits directly.
- **Decimal quantities** (2 places) everywhere: invoices, requests, receiving, damage, product stock. Arabic digits and `٫` accepted. Balances rounded so float noise never gets stored (`lib/qty.js`).

## Screens
- **One success card** (`components/SuccessScreen.js`, matches the reference): replaces the form on the same page — client registered, invoice, shipping order/return, keeper accept/cancel, car1 approve/reject, goods received, damage, client edit, invoice change request, supervisor decision. The **new tab on client registration is gone**.
- **Warehouse keeper**: each car's section (مبيعات جملة / تجزئة) now shows that car's waiting requests first; each nav item has its own dot, plus طلبات الشحن.
- **Agent**: المستندات nav item now gets the dot (bug: Nav read `badge`, server sends `bucket`).
- **App-open prompt**: items needing action show every time the app opens (or returns after 10 min in background); resolved items show once, then never again.
- **Floating notifications**: click and ✕ work on desktop (bug: pointer capture on every press swallowed the click). No auto-dismiss.
- **Back button**: big, labelled, 48 px, same on phone and desktop.
- **Filters**: no more "الكل / كل الأنواع" options — tap a choice to filter, tap it again to clear.
- `/shipment-requests` (orphaned, out of sync) now redirects to المستندات.

---

# Masar — notification & flow changes

Seven files touched. Drop them in over the same paths in your repo.

```
components/
  NotificationToast.js       (rewritten)
  Nav.js                     (modified)
  InventoryDocCard.js        (modified)
pages/
  dashboard/warehouse.js     (modified)
  dashboard/car1.js          (modified)
  inventory/[id].js          (modified)
  warehouse/shipment-requests.js  (modified — small copy fix)
```

Note: `pages/dashboard/car2.js` did NOT need changes — the label swap
propagates through the shared `TYPE_LABELS`, and car2 has no
"awaiting my approval" queue (only car1 approves car2, not the
reverse).

---

## 1. Warehouse keeper wasn't seeing new requests

**Was:** `dashboard/warehouse.js` only queried `/api/inventory/list?status=pending`
— documents that had already been fulfilled and were waiting on the
other party. Brand-new shipment requests from agents didn't appear
anywhere on the home screen. The keeper had to remember to open the
shipment-requests page.

**Now:** the dashboard fetches both queues in parallel and renders two
inboxes:

- **بانتظار تنفيذك** — pending shipment requests, amber-toned CTA
  "نفّذ". This is the new work; it comes first.
- **بانتظار الطرف الآخر** — fulfilled docs waiting on agent/supervisor
  confirmation. Toned down (accent, no CTA) because it's a tracker,
  not work.

`useLiveRefresh` was extended to `["inventory", "shipmentRequests"]`
so a new request pushes into the inbox in real time.

**Also needed (backend / hook side, outside this diff):** if
`useNotifications` doesn't emit a `toasts` entry to the warehouse
keeper when a request enters `pending_warehouse`, add that. Without
it, the on-screen inbox will update but no popup will fire while the
keeper is on a different page. The subscription key you'll want is
essentially "shipmentRequests where status=pending_warehouse", scoped
to role `warehouse_keeper`.

---

## 2. Notifications: visible, sticky, swipe-to-dismiss

Old toast was a small card in the top corner that (evidently) auto-
disappeared. Rewrite in `components/NotificationToast.js`:

- **Position:** top-center on desktop, top-full-width on mobile. Hard
  to miss.
- **Look:** larger card (44 × 44 icon well), amber ring around the
  card, pulsing amber dot on the bell icon. Explicit hint text at the
  bottom: "اسحب جانبًا للإغلاق · اضغط للفتح".
- **Persistence:** the component holds a local list of toasts.
  Anything that arrives is added, but the component NEVER removes a
  toast just because the parent stopped passing it. Only a user
  gesture (swipe past 90px in either direction, or tap the X, or tap
  the body to open) can remove it. That means even if the old
  `useNotifications` still schedules an auto-timeout, the toast will
  stay visible — and there's a `dismissedIds` guard so a dismissed
  toast doesn't reappear if the hook re-pushes it.
- **Swipe gesture:** pointer events (works for touch and mouse), 8px
  axis-lock so vertical scrolling still works, opacity fades with
  drag distance for tactile feedback, animates off-screen on release
  past threshold.
- **Accessibility:** `role="alert"`, `aria-live="polite"`, keyboard
  users can still tab to the X button.

**Also worth doing (outside this diff):** in `lib/useNotifications`
find any `setTimeout(...dismissToast, ...)` (or similar auto-purge)
and remove it — the component tolerates it, but the cleanest solution
is to stop dispatching auto-removals.

---

## 3. Agent nav: documents before requests

`Nav.js`, `layoutFor("agent_car1"|"agent_car2")`:

- **Desktop:** was `home, placeOrder, requests, documents, ...` →
  now `home, placeOrder, documents, requests, ...`
- **Mobile tabs:** was `home, clients, documents` (documents was
  already before requests, but requests wasn't in the tab bar at all
  — it lived in "المزيد"). Now `home, documents, clients` — bumps
  documents into a more prominent slot next to home.
- **"المزيد" sheet:** requests stays there (below the fold, in line
  with its lower priority now).

---

## 4. Notification dot excludes resolved items

Old behaviour computed `shippingCount` inside `useNotifications` and
appears to have counted everything unseen, including approved and
rejected items.

Fix in `Nav.js`: derive counts from the `items` array directly.

```js
const isActionable = (it) => {
  if (it?.needsAction === true) return true;
  if (it?.needsAction === false) return false;
  const s = String(it?.state || it?.status || "").toLowerCase();
  return !/(approved|rejected|fulfilled|confirmed|cancelled|resolved|done)/.test(s);
};
```

Approved/rejected items are `needsAction: false` (or their `state`
matches the resolved regex), so they drop from the count immediately.
Only items still needing the user's action light up the dot. First-
view seen-tracking still runs for the modal popup — this is a
separate concern about what the *badge* means.

---

## 5. "بانتظار موافقتي" — its own section, its own dot

Was: on `dashboard/car1.js`, car1's inbox mixed two very different
piles of work:

1. Loading/offloading docs where car1 himself needs to confirm
   receipt (his own delivery).
2. car2's shipment requests waiting for car1 to approve before they
   reach the warehouse (someone else's request he gates).

Same amber cards, same "بانتظارك" heading. Easy to conflate.

Now:

- The main **بانتظارك** inbox only holds category (1) — car1's own
  deliveries.
- A new **بانتظار موافقتي** section holds category (2). Full request
  list (not just count), each row links to `/shipping/[id]` so car1
  can approve/reject with one tap.
- **Dot indicator:** an amber ping dot next to the section title
  whenever count > 0. Clears when the list is empty.
- **Visual differentiation:** blue icon well (vs amber for own
  deliveries), right-side amber accent bar on the list container,
  small "من مبيعات التجزئة" hint on the header. Different enough at
  a glance that you know which pile you're looking at.
- Empty state: dashed border + muted "no requests" — visually calmer
  than the main inbox's "all clear" so an empty approval queue
  doesn't compete for attention.

Component is defined at the bottom of `car1.js` as `ApprovalQueue`;
kept local because no other role has this pattern.

---

## 6. "تسليم شحنة" instead of "أمر شحن" for the returning doc

The word "أمر شحن" was overloaded. It meant two different things at
two different points in the flow:

1. The **request** an agent sends: "please load me this stuff." Lives
   in `shipment-requests`, has statuses like `pending_warehouse`.
2. The **fulfilled inventory document** the warehouse creates and
   pushes back to the agent for receipt confirmation. Lives in
   `inventory`, of type `loading`.

Same words, different objects — the agent sees "أمر شحن" and can't
tell whether he's supposed to send something or receive something.

Fix: rename (2) only. The request stays "أمر شحن" (it IS an order).
The finalized doc becomes **"تسليم شحنة"** — a shipment delivery, the
thing physically arriving at the agent.

Changes:

- `components/InventoryDocCard.js` → `TYPE_LABELS.loading = "تسليم شحنة"`
- `pages/inventory/[id].js` → same, plus the daily-sequence text
  `"أمر الشحن الأول اليوم"` → `"تسليم الشحنة الأول اليوم"`
- `pages/warehouse/shipment-requests.js` → post-fulfillment success
  banner text: "تم إنشاء تسليم الشحنة — بانتظار تأكيد المندوب"

Not changed:
- `pages/shipping/[id].js`, `pages/shipment-requests/index.js`,
  `components/ShipmentRequestsPanel.js` — these render the REQUEST
  (concept 1), which is correctly still "أمر شحن".

---

## Benchmark notes (against standard systems)

A few of the choices above are cribbed from common patterns worth
naming:

- **Swipe-to-dismiss with persistence** is how iOS Notification Center
  and Slack in-app banners behave. Auto-timeouts on important
  notifications are a known usability failure (WCAG 2.2.1 — "users
  need enough time to read and use content"). The 90px threshold and
  8px axis-lock are lifted from Material's `Swipeable` component.
- **Splitting "your own work" from "work you gate for others"** is the
  same shape GitHub uses on the pull-request inbox ("Assigned" vs
  "Review requests"), and Linear on the triage view. Mixing them
  measurably increases missed reviews.
- **Amber ping dot + numeric badge** together (rather than either
  alone) is what Gmail and Asana do for "new + unresolved". The ping
  attracts the eye; the number tells you if it's worth interrupting
  what you're doing.
- **Terminology per lifecycle stage** — a document changing its name
  as its status changes ("Order" → "Shipment" → "Delivery") mirrors
  how ERP systems like SAP and NetSuite label the same physical goods
  differently across the warehouse-to-customer flow, and reduces the
  overloaded-noun problem.

---

# Round: competitor prices, delivery route (المسار), accountant reference search

## 1. Competitor prices — أسعار المنافسين
- **Sales supervisor** (Abdalbagi): new page `/competitors` (menu → أسعار المنافسين). Company, SKU, item name, price, date. Same large one-column layout as the invoice form. Company / SKU / item suggest earlier entries; picking a known SKU fills its item name. After saving, company and date stay filled for the next product from the same visit. "آخر ما أدخلته" lists his last 20 entries with delete.
- **Executive** (Amel): new tab `/executive/competitors`. "حسب الصنف": one card per SKU, each company's latest price cheapest first, "الأقل سعرًا" tag, price range, and the change since that company's previous entry (amount and %). "كل الإدخالات": the full log with who entered it. Search and company filter. Updates live. The manager can open it too.
- Data: `competitorPrices/{requestId}` (resend-safe). Only sales supervisors can add; the person who entered an entry (or the manager) can delete it. Live counter `competitors`.
- Files: `lib/competitors.js`, `lib/competitorView.js`, `pages/api/competitors/*`, `pages/competitors.js`, `pages/executive/competitors.js`, `components/Nav.js`.

## 2. Delivery route — المسار (above الموقع)
- New client field `deliveryRoute` (e.g. "خط بحري"), required for new clients. Picker (`components/DeliveryRoutePicker.js`): dropdown of routes already used on the same sales type, plus "+ إضافة مسار جديد" which opens a text box in place.
- In client registration and client edit (and edit requests), above الموقع.
- Shown above/before the location on invoice cards, the invoice page, the accountant's invoice, the clients list and the executive customer base. New "المسار" filter (above location) in invoice and client search.
- The old wholesale/retail field that was also labelled "المسار" is now **"نوع البيع"** everywhere, so the two never get mixed up.
- Existing clients have no route until someone picks one when editing (not forced on old clients).

## 3. Accountant — reference search by the last 4 digits
- Search now matches the **last 4 digits** of رقم العملية (5+ digits = references ending in them, or the exact one). Starts-with search removed — bank references share their first digits.
- Speed: one indexed query (`last4`) + one parallel batch of reads, instead of ~4 sequential round trips. Amount, date and client are copied onto each reference record. The one-time upgrade flag is remembered per server. The page waits for 4 digits, ignores stale replies and keeps results in memory until a payment changes.
- **Same last 4 on save:** the payment is NOT saved; an amber panel lists the matching payments (client, bank, reference with last 4 highlighted, amount, date, link to invoice) with "مراجعة الرقم" / "اعتماد الدفعة". Approving saves it with the same request ID. Same bank + same reference is still refused outright. Editing warns only if the reference changes.
- Old references are upgraded automatically on the first search (`meta/paymentRefsSearch2`).

Tests: `tests/run12.js` (new), `run9/run10/run11` updated. `npm test` and `node scripts/i18n-check.js` both pass.

---

# Phase 1 — dashboard cost & speed

## 1. Daily summaries
- `lib/salesStats.js` + `lib/salesStatsModel.js`: day documents (per route, product, client), monthly route totals, readiness flag, rebuild/verify helpers.
- Written inside the invoice transaction: `pages/api/orders/create-staff.js`, `pages/api/orders/create.js`, `lib/invoiceChanges.js` (edits, cancels, approved change requests).
- Read by `lib/dashboardSummary.js` (summary, trend) and `lib/executiveSummary.js` (overview, customers). Old functions kept as `*FromOrders` — used until the backfill marks the summaries ready, and by the tests as the reference.
- A comparison window cut part-way through a day ("same point yesterday") reads that one day from raw invoices — the only way to stay exact.
- Manager summary fetches client names only for the clients it shows (was: every buyer).
- Ties in rankings are now broken by id (old order depended on document order) — the only visible difference, and only between equal values.
- `scripts/stats/backfill.js` (dry run by default), `pages/api/cron/verify-stats.js` + `vercel.json` cron, demo generator/seed write the summaries.
- Tests `tests/run13.js`: old vs new on 4 months of demo data (7 ranges × 3 screens + 3 trends), after live creates/edits/cancels (incl. a 20-day-old invoice), after a damaged day is repaired, and after a backfill from empty.

## 2. Region — `vercel.json` `regions: ["fra1"]` (see README for matching Firestore).

## 3. Server cache — `lib/serverCache.js`; `/api/products/list`, `/api/i18n/terms`. New change counters `products` (product create/update/delete) and `profiles` (staff names).

## 4. Client delta sync — `syncAt` on every client write (register, edit, edit request, decision); `movedFrom` when the manager changes a client's sales type; `/api/clients/list?since=`; `lib/clientsStore.js` applies deltas, offline copy unchanged.

## 5. Notifications — `lib/notifySig.js`; `/api/notifications` and `/api/action-items` answer `unchanged` for the same signature; history queries bounded with indexes (fallback until deployed). Devices keep the last list across page changes. Implemented on the existing `meta/versions` counters rather than new per-person documents (same 1-read cost, no new write paths to keep in step).

## 6. Rate limit — `lib/rateLimit.js`: Upstash Redis REST (INCR + PEXPIRE NX) or in-memory fallback; the `rateLimits` Firestore collection is no longer used.

## Fixes found on the way
- Public order form didn't bump its route's change counter (open screens never refreshed).
- Demo seed set the old payment-search flag (`paymentRefsSearch` → `paymentRefsSearch2`).
- Test mock (`tests/mockfs.js`): deep merge for `set(…, {merge:true})`, `in` / `>` / `<` filters, and a billed-read counter.

Tests: `tests/run13.js`, `tests/run14.js` new; `npm test` (14 files) and `next build` pass; i18n check 0 missing.

---

# Client self-ordering removed
- Deleted `pages/new-order.js`, `pages/api/orders/create.js`, `pages/api/clients/lookup-route.js`, and `lib/rateLimit.js` (only those two endpoints used it). No public, no-login endpoints remain; `tests/run14.js` now fails if any API route lacks `requireUser` (the nightly cron uses `CRON_SECRET` instead).
- Upstash / rate-limit setup is no longer needed.
- Added `firebase.json` so `firebase deploy --only firestore:indexes` works.

# Phase 2 — speed on weak phones
- `lib/firebaseClient.js`: `initializeAuth` with IndexedDB + local persistence (same sign-in persistence as before) instead of `getAuth()` → −4 kB gzip on every page.
- Fonts self-hosted (`@fontsource/ibm-plex-sans-arabic`, `@fontsource/alexandria`, same weights) — Google Fonts `<link>` removed from `pages/_document.js`.
- Executive logos and watermarks → `next/image` with static imports; `next.config.js` image cache 1 year, WebP. The hidden-theme watermark is no longer downloaded (lazy).
- Executive tabs "العملاء والمسارات" and "المخزون" moved to `components/exec/` and loaded with `next/dynamic`; shared pieces in `components/exec/parts.js`.
- `components/Nav.js`: notification prompt and toasts loaded on demand, and only for manager / sales / warehouse roles.
- `tests/run15.js`: bundle guards.

---

# Routes, locations, competitor prices
- `components/SearchCombobox.js` (search-as-you-type pick-or-add) for الموقع on client register/edit; `lib/arabicSearch.js` (Arabic spelling-variant matching).
- `lib/usePlaceOptions.js`: route/location lists from clients + `places`; reloaded after every save — fixes "new route missing until refresh" after "تسجيل عميل آخر".
- `places` collection, `lib/places.js`, `/api/places` (GET/POST), live key `places`; `components/AddPlaceDialog.js` + "إضافة مسار أو موقع" button on the clients screen (sales staff, manager).
- Competitor prices: fields date → route → company → item → weight+unit → price; SKU removed (old entries still show it); `itemKey` grouping; a new route typed here is added to `places`; `/api/competitors?days=`.
- Executive: redesigned `/executive/competitors`; "أسعار المنافسين" card on the overview (`components/exec/CompetitorsCard.js`, loaded on demand).

# Phase 3 — safety & quality
- Sentry: `lib/monitor.js` (server, all 58 API routes report from their catch block, 500s only, response held ≤1.5 s until sent), `lib/clientMonitor.js` (browser, lazy), `lib/scrub.js`. `@sentry/nextjs` added.
- App Check: `lib/appCheckClient.js` (lazy, header on API calls, before the Firestore listener), `lib/appCheckServer.js` (off / monitor / enforce), checked in `requireUser`.
- Two-step login: `lib/mfa.js`, `pages/security.js` (QR via `qrcode`, loaded on that page only), second step on `pages/login.js`, redirect in `lib/useAuth.js`, enforcement in `requireUser`, `scripts/security/enable-totp.js`, menu link for admin/manager/accountant. `qrcode` added.
- Emulator tests `tests/emulator/run.js` (rules, real tokens, stock race, daily summaries, disabled account); `firebase.json` emulator ports; `npm run test:emulator`.
- GitHub Actions `.github/workflows/ci.yml`: tests, i18n check, build, emulator tests, optional rules/indexes deploy (never deletes console-only indexes).
- `lib/firebaseAdmin.js`: credential-free init only when talking to the emulator.
- Tests: `tests/run16.js` (scrubbing, Sentry gating, App Check modes, 2FA enforcement); `tests/run12.js` extended (places, weight/route, day window).

---

# Staff testing round — readability and accounting by invoice log
- Clearer default text colours (true black / true white), px font sizes → rem.
- Reading settings page `/accessibility` (text size, high contrast, bold, underlined links, dark mode), «أأ» button in the top bar; `lib/a11y.js`; applied before first paint.
- Invoice logs: `lib/invoiceLogs.js` (logState totals written in invoice/payment transactions), `lib/logPayments.js` (record / distribute / void), `lib/accountingViews.js`, APIs `/api/accounting/logs`, `/api/accounting/logs/[id]`, `/api/accounting/agents`, `/api/accounting/report`.
- Pages: `/accounting/agents` (new accountant home), `/accounting/agents/[route]`, `/accounting/logs`, `/accounting/logs/[id]`, `/accounting/reports`. Accountant menu: المناديب · السجلات · التقارير · الفواتير.
- Single-invoice payments update the log; shares from a log payment can't be edited/voided on the invoice. Reference search finds log payments.
- Nightly check / backfill (`rebuildDay`) also rebuild logState. Demo data and seed include logState.
- Tests: `tests/run17.js`.

---

# Operating margin in accounting
- `lib/accountingViews.js` `attachMargins` (from dailyStats + product costs); margin on log rows, log page, agent cards, combined, agent detail, reports (+ CSV column). Test in `tests/run17.js`.

# Phase 4 (part 1) — invoice numbers, stock check
- `lib/invoiceNumbers.js` (`prepareInvoiceNumber` in `create-staff` transaction, `numberExisting`), `scripts/invoices/number-existing.js` (`npm run invoices:number`), `invoiceNo()` in `lib/labels.js`; shown on invoice, accountant list/search, logs, payment search. Demo data numbered.
- Stock ledger: `writeLedger` in `lib/inventory.js` (every `applyStockMovements`), depot corrections now transactional with a ledger record, opening balances on product create.
- `lib/stockCheck.js`, `/api/stock-check` (manager), `pages/stock-check.js`, manager notification, `/api/cron/nightly` (stats check + stock check; `vercel.json` now points here — one cron job). Live key `stockCheck`.
- Tests: `tests/run18.js`.
- Still to do in Phase 4: vans as data, company settings.

---

# Staff feedback round 2 + Phase 4 (part 2)
- Negative margin no longer shows the floating error banner: `ErrorSpotlight` skips red numbers (`.num`); `TodayMargin` opted out.
- Sign-in prompt: decided per sign-in (`newLoginSession` in `lib/notificationSeen.js`, called on sign-in and sign-out), so needs-action items show at every sign-in even without a page reload; informative ones still once.
- Documents (`components/ShipmentRequestsPanel.js`): tabs removed; big "طلب جديد" button → chooser (أمر شحن / مرتجع بضاعة) → form; "طلباتي" shows "بحاجة لإجراء منك" (the shipping items behind the nav badge) above the list.
- Company settings: `lib/companyConfig.js` (time zone, offset, currency, company name from env, Mahgoub Sons defaults); all hard-coded `Africa/Khartoum` / `+02:00` replaced; `currency` stored on invoices, invoice payments and log payments.
- Tests: `tests/run19.js`. Remaining Phase 4 item: vans as data.

---

# Accounting redesign + accessibility round 2
- Accounting is built around the **invoice log**: accountant home is `/accounting/logs` — big cards "سجل فواتير YYYY-MM-DD" (weekday, agent, value, paid bar, paid / remaining, status, payment waiting to be entered), filters as large wrap-around chips (period presets / dates, agent, status).
- Log page: header with value / paid / remaining / margin; "إضافة دفعة لهذا السجل"; payments as cards; "تسجيل ما دفعه كل عميل" opens a full-height sheet grouped by client — every amount typed by the accountant, nothing filled in automatically (the auto button is gone); clients section with each client's invoices, totals and phone.
- Agents page simplified (one card per agent → "سجلاته" opens the filtered logs); `/accounting/agents/[route]` redirects there. Reports: wrap-around filters, responsive grid. Dates shown as YYYY-MM-DD in accounting.
- Server errors now return a short code (e.g. "رمز K3F9Q") that is also in the Vercel log line.
- Accessibility: new "تكبير النصوص الصغيرة" (labels, hints, text inside fields) and "حدود أسمك للحقول"; the page rebuilt to wrap on the smallest phones; dark mode moved off the top bar into this page; top-bar icons keep a fixed size so larger text never pushes them off screen.
- `tests/run8.js`: trend assertions no longer fail on Fridays (the daily trend skips Fridays).

---

# Logs-only accounting + fix for "Server error" when opening a log
- Opening a log failed on the live database: its invoices were read with a route + date query that needs a composite index (not deployed). Now the day's invoices are read by date only (automatic index) and the van is picked out in code; the same for the logs list filtered by agent and the per-agent report. The two composite indexes added for logs are removed from `firestore.indexes.json` — no index deploy is needed for accounting.
- Logs page: search by the last 4 digits of the transfer reference (log payments and single-invoice payments; opens the log); filters behind a "تصفية" button with an active-filter count, like the rest of the system, plus "مسح التصفية".
- Accountant menu: سجلات الفواتير · التقارير · المخزون · الأمان. The invoice list and agents pages now redirect to the logs; an invoice's back button returns to its log.

---

# Payments only on the invoice log, fully split before saving
- A payment (reference, bank, amount, date, note) is entered on the log in ONE sheet together with the amount each invoice received; "حفظ الدفعة" stays disabled — and the server refuses — until the amounts add up to the payment exactly and none exceeds what an invoice owes. Saved in one transaction (`addLogPayment` with `allocations`); nothing half-saved.
- Re-splitting an existing payment must also use all of it (`allocateLogPayment`). Older partly-split payments show "غير مكتملة — أكمل التوزيع".
- Invoices carry only amounts: their payment entries are `{ amount, date, logId }` (no reference, bank or note). The invoice page is read-only: total, paid, remaining, and the amounts received with a link to their log. `POST /api/payments/:id` no longer adds payments (409); editing/voiding older direct payments still works.
- Tests: `tests/run17.js` rewritten for the new flow; library-level payment rules still tested through `directPay` in `tests/run.js`.

---

# New demo data for testing the whole system
- `scripts/demo/generate.js` / `seed.js`: payments are now recorded on INVOICE LOGS (reference on the log payment, split exactly over that log's invoices; invoices get amounts only). Retail days settle within a day or two (sometimes one client short); wholesale clients pay in one or two rounds; the newest wholesale days stay open — so paid / partial / unpaid logs all exist. Also: legal invoice numbers, daily summaries + log totals, ~200 competitor prices (4 competitors × 5 items with weights and routes, drifting over time), saved routes/locations. Wipes the new collections too (log payments, places, competitor prices, stock ledger/checks); the stock check starts fresh.
- `tests/run11.js` checks all of it, including a recount of the log totals; `tests/run13.js` loads the log payments.
- Stock check: a movement saved in the same millisecond as a check is now counted exactly once (`boundary` ids on the checkpoint) — found by a flaky test.

---

# Accounting: one transfer over several days, client statements & ageing, collections
1. **One payment over several logs** of the same agent: in the payment sheet, "الدفعة تشمل يومًا آخر لنفس المندوب" lists his other unpaid days; each added day's clients appear under it. Stored as `logIds`, `days`, `allocLogs` on the log payment; each log counts (received / paid) the part it got; the payment shows on every log it covers; re-split, void and the nightly recount handle it. Older single-log payments work unchanged.
2. **Clients (العملاء)** — `clientBalance/{clientId}` kept in the same transactions as invoices and payments (one write per client per transaction): balance, client credit, open invoices, ageing 0–30 / 31–60 / 61–90 / 90+ by invoice age. List with search, filters (agent, debt age, all clients) and an ageing bar; **statement (كشف حساب)** per client: invoices (debit) and amounts received (credit), oldest first, running balance, print/PDF and Excel.
3. **Collections (التحصيل)** — money received by transfer date: total, per agent, per bank, per day, and every payment with its logs.
- Accountant menu: السجلات · العملاء · التحصيل · التقارير (+ المخزون, الأمان).
- `npm run stats:backfill` also builds client balances. Demo data includes client balances and some two-day transfers.
- Tests: `tests/run20.js`; `tests/run11.js` checks the demo's client balances against a full recount.

---

# Refunds (مرتجع) and money returns (رد مبلغ)
- **Refund by lines** (`lib/refunds.js`, `POST /api/orders/:id/refund`): the agent (or manager) picks quantities per line and whether the goods are sellable (back into the van) or damaged (damaged stock). Value from sale prices with the invoice discount scaled to the remaining lines (preview with `preview: true`). One transaction: stock, invoice, daily summary, invoice log, client balance.
- Within 9 hours the agent applies it; after that it's a change request (type `refund`, reason required) the manager approves on the usual requests screen.
- Partial refund: the invoice keeps the remaining lines; a purple note lists what came back and its value ("مرتجع … بقيمة …"). Full refund: invoice cancelled with "مرتجع بالكامل"; if money had been paid it stays with the active invoices as "بانتظار رد المبلغ" until the money is returned.
- Money: the new total applies — a refund on a partly paid invoice only lowers what's owed; credit = paid − new total, only when above zero.
- **Money returns** (`lib/moneyReturns.js`, `/api/money-returns`): the agent picks invoices holding credit ("طلب جديد" → "رد مبلغ لعميل", page `/money-return`); the accountant approves on **رد المبالغ** (`/accounting/returns`) with bank + reference or cash, or rejects. Approval adds a negative payment ("return") to each invoice, in one transaction with logs and client balances; shown in the statement and in التحصيل as money out (net shown).
- Invoice lists: new **مرتجع** tab next to نشطة / ملغاة; cards show a refund tag. Request screens show refund requests.
- Tests: `tests/run21.js`.

---

# Vans as data (part 1) + several supervisors
- `vans` collection (`lib/vans.js`, `/api/vans`, live key `vans`): id, label, type (wholesale | retail), active. The original vans keep ids `car1` / `car2` — no migration; they exist without being saved.
- Sales accounts: role still picks the sales type (wholesale / retail) as before; new claims `van` (which van) and `supervisorUid` (agents: which supervisor). Accounts without them keep working on car1 / car2. Admin screen: **العربات** panel (add, rename, deactivate; type fixed) and, on each sales account, its van and (agents) its supervisor.
- Everything that read the van from the role now reads the account's van (`decoded.route`): invoices, clients, stock, requests, refunds, money returns, documents, reports.
- Prices are per sales type: a van uses `prices.car1` (wholesale) or `prices.car2` (retail) by its type (server and the new-invoice screen).
- Dashboards (manager summary/trend, executive overview/customers), invoice logs and accounting cover every van; vans count toward their sales type. Invoice-log ids accept any van id.
- Shipment requests carry the agent's `supervisorUid`; a supervisor sees / decides only his own agents' requests (`lib/supervision.js`); requests made before assignment stay open to any supervisor.
- New vans have no fixed delivery day (like car1).
- Tests: `tests/run22.js`.
- Not yet: screens that still show exactly two van columns/sections (warehouse per-van sections, stock board, products stock, fleet history, transfers target, some filters) — next round.

---

# Vans as data (part 2) — every screen shows every van
- `lib/vanNames.js`: van names for all screens (filled by `useVans`, loaded once by the nav); `ROUTE_LABELS` / `ROUTE_LABELS_SHORT` fall back to it, so existing labels work for any van.
- Filters list every van (invoices, clients, margin, requests, sales report, executive customers, fleet history, warehouse history); invoice/request/document cards and the shipping page name any van; executive customer colours by sales type; margin page shows every van.
- Stock: the stock board, products page and the agent's stock sections show every van found in the stock.
- Warehouse keeper: one section per van from the dashboard (`/warehouse/[route]`; car1/car2 keep their pages).
- Clients: the manager picks any active van when registering/editing a client; routes/locations lists follow the van's sales type. Agent screens use the account's van (`van` claim) instead of the role.
- A new van's changes refresh the screens of its sales type (`orders_car1` / `orders_car2`).
- Tests: `tests/run22.js` step 5.

---

# Staging support
- Every script reads `ENV_FILE` (default `.env.local`) so it can target the test Firebase project; `.env.staging` / `.env*.local` ignored by git.
- `scripts/vans/save-defaults.js`: optional — writes car1 / car2 into `vans` so they're visible in Firestore.

---

# Vans first; wholesale / retail as categories
- **Warehouse keeper:** menu section **العربات** (`/warehouse/vans`): one card per van with its name, its type, the people assigned to it (supervisor first) and a red count of what needs the keeper on that van. On desktop each van is its own menu link with its own dot; on phones the العربات tab carries the total. Each van opens its section (requests to execute, movements, filters) — `/warehouse/[route]`, with the assigned people under the van's name.
- Notifications: per-van counts (`shipping:<van>`) for any van; item "from" lines name the van.
- `/api/vans` returns each van with its assigned people (`lib/vanPeople.js`, refreshed when accounts or vans change).
- **Filters everywhere take a van OR a whole category:** "كل الجملة", "كل التجزئة", then each van — invoices, clients, margin, sales report, requests, executive customers, fleet / warehouse history. Server side `lib/vanFilter.js` (`type:wholesale` / `type:retail` / van id) in the report query, invoice list, inventory history and shipment requests.
- Margin page: wholesale vs retail as a whole, then each van.
- Tests: `tests/run22.js` step 6.

---

# Damaged goods, write-offs, free samples, margin deductions
- **تالف stays in stock:** a damage report (manager approves) moves goods to the warehouse تالف balance; the stock board shows "تالف (المخزن)" and "تالف في العربات" per product with a "التالف فقط" filter; the products page shows تالف per product.
- **Refunds marked damaged** stay in the van's own damaged balance (`stock.damaged_<van>`), not sellable. An **offload must carry all of the van's damaged goods first** (server-enforced; the offload form adds them automatically); they become warehouse تالف.
- **تسويات المخزون** (`/stock-adjustments`, `lib/stockAdjustments.js`, `/api/stock-adjustments`):
  - **تسوية تالف**: keeper picks transfer or obsolete and items from تالف → manager approves. Transfer: out with no value. Obsolete: COST deducted from the margin.
  - **عينات مجانية**: manager picks supplier or company and items from the depot → keeper executes. Supplier: out with no value. Company: COST deducted from the margin.
  - **تحويل بضاعة**: the existing transfers, linked from here.
  - Cost = average cost at approval; stock moves on approval with the stock ledger; filters by status and type.
- **Margin deductions** dated on the approval day: shown on the manager's margin page and the accountant's report (with net margin and the list).
- **Accountant → حركة المخزون** (`/accounting/stock-movements`): damage reports, write-offs and free samples (pending / approved / rejected), filter by kind, status, period; information-only notifications when one is requested or decided.
- Notifications: manager for pending write-offs, keeper for pending free samples.
- Tests: `tests/run23.js`.

---

# Menu tidy-up
- Warehouse keeper: vans are sub-sections of **العربات** only (no menu item per van); goods transfers are reached from **تسويات المخزون** (no separate menu item). Manager: same — no separate التحويلات item.
- **تسويات المخزون** has its own dot: write-offs, free samples and goods transfers waiting for you (notification bucket `adjust`); the manager's requests dot no longer counts them.

---

# Adjustments wording
- Damaged write-off modes renamed: **مرتجع شركة** (company return — leaves with no value) and **غير صالحة** (unusable — cost deducted from the margin).
- The warehouse keeper sees only the plain names: no margin wording, no costs, no deduction lines. The manager and accountant still see the margin effect.
- Filters on تسويات المخزون open from a **تصفية** button, like the rest of the system.

---

# Notifications to the exact place; agents' samples as a margin deduction
- Warehouse keeper never sees who pays for free samples: notifications say "طلب عينات مجانية", the list and filters hide supplier/company.
- Section tabs carry the menu item's red count (`components/SectionTabs.js`): a free-sample request lights تسويات المخزون **and** its "عينات مجانية" tab (same for تسوية تالف and تحويل بضاعة).
- Adjustment notifications open the exact section and highlight the request (`?tab=…&focus=…`), for keeper, manager and accountant (other notifications already open the exact request).
- Accountant now actually receives notifications (the client hook had him excluded). Manager is told how his free-sample requests ended; keeper how his write-offs ended (information).
- Agents' free samples: their cost is shown as **"عينات المناديب"** under margin deductions (invoice date, per van) on the manager's margin page and the accountant's report, with "هامش المبيعات (قبل الخصومات)" and the net. The margin itself was already net of them. Daily summaries carry the sample cost (`sCost`) — rerun the backfill once to fill history.

---

# Staging test data tool
- `npm run staging:fill -- --months= --trend= --volume= [--seed=]` and `npm run staging:clear` (`scripts/staging/data.js`): always the staging project (refuses any id without "staging").
- Generator: trends `growing | flat | declining | seasonal | spike` (shape both invoice count and size), volume `low | normal | high | veryhigh` or a number (clients and invoices), 1–24 months.
- Seed: `--clear` (business data only); refuses `--run` on a project whose id doesn't contain staging/test/demo unless `--allow-production`.
- `scripts/staging/copy-products.js` copies the catalogue from production (read only) into staging. `scripts/setRole.js` accepts `ENV_FILE`.
- Tests: `tests/run11.js` step 6.

---

# Account menu; damaged goods on the keeper's stock
- Top bar: the reading-settings, language and sign-out icons are replaced by **one account button** (the person's initial). It opens a small menu: name and role, **الوضع الداكن** switch (one tap), **اللغة** ع / EN, **سهولة القراءة**, **تسجيل الخروج** (`components/AccountMenu.js`). Night mode also stays in the reading settings.
- Warehouse stock (رصيد المخزن): each product with damaged goods shows "تالف: N — غير محسوب في الرصيد" until they leave through تسويات المخزون; a **التالف فقط** filter (with a count) shows only those products.
