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
