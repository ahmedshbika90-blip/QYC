# مباشر (Mubashir) — Project Summary

Order, distribution, stock and collection system for **Mahgoub Sons Food Division (Sudan)**.
Staff-only (no client self-ordering). Arabic first, full English translation.

## Stack and delivery
- **Next.js (Pages Router) + Firebase** (Firestore + Auth via Admin SDK on the server; the browser never reads business data directly — `firestore.rules` deny all except `meta/versions`).
- Hosted on **Vercel** (region fra1). Repo: GitHub `ahmedshbika90-blip/QYC`.
- **Working method:** changes are delivered as a full project zip; every change ships with tests (`npm test`, 23 test files, in-memory Firestore), the translation check (`node scripts/i18n-check.js` → 0 missing) and a passing `next build`. Change history: `CHANGES.md`; setup notes: `README.md`.
- **Branches:** `main` = production; `staging` = testing (Vercel Preview → separate Firebase project). Scripts take `ENV_FILE=.env.staging` to target staging.

## Roles
| Role | Does |
|---|---|
| admin | Accounts, roles, vans (العربات), assigns each sales account a van and (agents) a supervisor |
| manager | Approves late edits/cancels/refunds, write-offs; requests free samples; dashboards, margin, stock check |
| sales supervisor (agent + flag) | Sells; approves loading requests of **his own** agents; competitor prices |
| agent (wholesale `agent_car1` / retail `agent_car2` role) | Sells on his van; refunds; shipping/offload requests; money-return requests |
| warehouse keeper | Receipts, executes loading/offloading, العربات section (one card per van), تسويات المخزون |
| accountant | Invoice logs & payments, clients & statements, collections, money returns, reports, حركة المخزون (view) |
| executive | Overview dashboards, customers, competitors |

## Core concepts and rules
- **Vans are the unit** (`vans` collection; originals `car1` wholesale, `car2` retail need no saving). Wholesale/retail are **categories** used in filters (`type:wholesale` / `type:retail` or a single van). Prices are per category (`prices.car1` wholesale, `prices.car2` retail).
- **Invoices:** legal numbers `INV-2026-000123` (gap-free per year); agent edits within **9 hours**, after that a request to the manager. Invoice-level **discount** (one amount, lowers margin), **price increase** per line with reason (never below list; raises margin), **free sample** lines (sale 0, **cost** deducted, invoice date).
- **Refunds:** by lines and quantity, sellable (back to van) or damaged (kept apart in the van as `damaged_<van>`); within 9 h by agent, later by manager approval. Partial → note on invoice; full → cancelled with "مرتجع بالكامل" (stays active "بانتظار رد المبلغ" if it was paid, until money is returned). A refund only lowers what the client owes; **credit = paid − new total** (only if > 0).
- **Money returns:** agent requests return of credit → accountant approves (bank+ref or cash) → negative payment entry; shown in statement and collections (money out).
- **Payments:** recorded only on an **invoice log** (one van, one day), with the amount each invoice received typed by the accountant — saved only when fully split. One transfer may cover several days of the same agent. Invoices carry amounts only (no reference). Search by last 4 digits; duplicate references blocked.
- **Clients:** running balances (`clientBalance`), ageing 0–30/31–60/61–90/90+, statement (كشف حساب) with running balance.
- **Collections (التحصيل):** money received by transfer date, per day/bank/van, net of money returned.
- **Stock:** every change writes a ledger record; nightly stock check compares balances to the ledger (reports, never auto-corrects). Offloading must take the van's damaged goods first (they become warehouse تالف). Damage reports (manager approves) move goods to تالف.
- **تسويات المخزون:** تسوية تالف (keeper asks: **مرتجع شركة** = out with no value / **غير صالحة** = cost deducted; manager approves), عينات مجانية (manager asks: supplier = no value / company = cost deducted; keeper executes, never sees who pays), تحويل بضاعة (existing transfers).
- **Margin deductions** (manager's margin page + accountant's report): agents' samples (invoice date), warehouse company samples and unusable damaged goods (approval date) → sales margin, deductions, net margin.
- **Notifications:** per role; menu items and their sub-sections (tabs, van cards) carry red counts; a notification opens the exact section/request. Accountant gets information-only notifications for stock adjustments.
- **Daily summaries** (`dailyStats`, `monthlyStats`, `logState`) keep dashboards cheap; nightly job (`/api/cron/nightly`, needs `CRON_SECRET`) rebuilds yesterday and runs the stock check.

## Other features
Executive dashboards; competitor prices with trends; delivery routes/locations (places); accessibility settings (text size, small-text boost, thick field borders, contrast, bold, dark mode); company settings (`lib/companyConfig.js`: time zone, currency, name); Sentry (scrubbed), App Check (off/monitor/enforce), TOTP two-step login for admin/manager/accountant; demo data generator built on real products.

## Production setup still to run (if not done)
1. `firebase deploy --only firestore:indexes` (answer N to deletions)
2. Deploy the latest zip to Vercel
3. `npm run stats:backfill -- --run --confirm=<project>` (summaries, logs, client balances, agents' sample cost)
4. Vercel env `CRON_SECRET`
5. `npm run invoices:number -- --run --confirm=<project>` (after confirming the format)
6. Optional: Sentry DSNs, two-step login (`scripts/security/enable-totp.js`), App Check, `scripts/vans/save-defaults.js`
7. **Daily Firestore backups** (not yet set up — recommended before go-live)

## Open items / next steps
- Structured staging test round per role, then fix only what testing finds.
- Accounting controls: second approval for voided payments, month-end closing, history of re-split payments.
- Possible: client credit limits, discount ceiling/approval and a discount report, applying client credit to the next invoice, expenses (net profit), supplier payables.
- Short Arabic guide per role for training.
