# Testing and release guide

## 1. Three environments

| | Local | Staging | Production |
|---|---|---|---|
| Code | your PC | branch `staging` | branch `main` |
| Firebase | Emulator (no real project) | `mubashir-staging` | real project |
| URL | localhost:3000 | Vercel **Preview** link | real domain |
| Data | throw-away | demo data, safe to break | real business |
| Who | developer | you + staff testers | everyone |

Rule: **nothing reaches `main` without passing staging.**

## 2. One-time setup

### 2.1 Staging Firebase project
1. console.firebase.google.com → **Add project** → `mubashir-staging` (no Analytics).
2. **Firestore** → Create database → same location as production (eur3 / europe-west).
3. **Authentication** → Sign-in method → enable **Email/Password**.
4. Project settings → **Service accounts** → *Generate new private key* (keep the JSON safe).
5. Project settings → General → **Add app → Web** → copy the config values.
6. (Optional, to test 2FA / App Check) same steps as production, on this project.

### 2.2 `.env.staging` on your PC (never committed)
Same variable names as `.env.local`, with the staging values:
`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, all `NEXT_PUBLIC_FIREBASE_*`.

### 2.3 Rules and indexes on staging
```powershell
firebase deploy --only firestore:rules,firestore:indexes --project mubashir-staging
```

### 2.4 GitHub
```powershell
git checkout main
git pull
git checkout -b staging
git push -u origin staging
```
Then on GitHub → **Settings → Branches → Add rule** for `main`:
- ✅ Require a pull request before merging
- ✅ Require status checks to pass → select **test** and **emulator** (from CI)
- ✅ Do not allow bypassing (optional, recommended)

Secrets (**Settings → Secrets and variables → Actions**):
- `FIREBASE_SERVICE_ACCOUNT`, `FIREBASE_PROJECT_ID` → production
- `FIREBASE_SERVICE_ACCOUNT_STAGING`, `FIREBASE_PROJECT_ID_STAGING` → staging

With these, every push runs the tests, and pushes to `staging` / `main` also deploy the rules and indexes to the matching Firebase project.

### 2.5 Vercel
Project → **Settings → Environment Variables**: for every `FIREBASE_*` and `NEXT_PUBLIC_FIREBASE_*` variable add a value scoped to **Preview** with the **staging** values. Production values stay scoped to **Production**.
Do **not** add `CRON_SECRET` to Preview (crons run on production only).
Check: open a Preview link → sign in with a staging account; a production account must NOT work there.

### 2.6 Test data and accounts on staging

**Fill / clear staging in one command** (always `.env.staging`, refuses any project without "staging" in its id):
```powershell
npm run staging:fill -- --months=6 --trend=growing --volume=normal
npm run staging:clear
```
- `--months` 1–24 · `--trend` growing | flat | declining | seasonal | spike · `--volume` low | normal | high | veryhigh (or a number like 1.5) · `--seed` any number (same options + seed = same data).
- **fill** = clear + generate + align product stock. **clear** = delete business data only (products, accounts, vans stay).
- First time only: copy your products in with `node scripts/staging/copy-products.js --run --confirm=mubashir-staging`.

The older manual way:
```powershell
$env:ENV_FILE=".env.staging"
node scripts/demo/seed.js --run --confirm=mubashir-staging --reset-stock
node scripts/vans/save-defaults.js --run --confirm=mubashir-staging
Remove-Item Env:ENV_FILE
```
Create the first admin in the staging console (Authentication → Add user), give it the `admin` role the same way as production, then create from **الحسابات والصلاحيات** one account per role:

| Account | Role | Van / supervisor |
|---|---|---|
| test.admin@… | admin | — |
| test.manager@… | manager | — |
| test.acc@… | accountant | — |
| test.exec@… | executive | — |
| test.keeper@… | warehouse keeper | — |
| test.sup1@… | sales supervisor (wholesale) | عربة الجملة |
| test.sup2@… | sales supervisor (wholesale) | a 2nd wholesale van |
| test.agent1@… | agent (retail) | عربة التجزئة, supervisor sup1 |
| test.agent2@… | agent (wholesale) | 2nd wholesale van, supervisor sup2 |

Use the same simple password for all test accounts; never reuse a real password.

## 3. Daily workflow
1. Put the new code on `staging`:
   ```powershell
   git checkout staging
   git pull
   # copy the new files in
   git add -A
   git commit -m "short description"
   git push
   ```
2. Wait for GitHub ✓ (tests) and the Vercel Preview link.
3. Run the affected test cases from **docs/TEST_PLAN_AR.md** on the Preview link.
4. Problems → GitHub **Issues → New → Bug / مشكلة** (template asks for steps, role, error code, screenshot).
5. All good → GitHub **Pull request** `staging` → `main` (template checklist) → merge → production deploys.
6. After merging, run anything the PR lists under "Needs after deploy" (indexes, backfill…) on **production**.

## 4. Release discipline
- **Tag each release:** after merging, `git tag v1.4.0` → `git push --tags`. Note the tag in CHANGES.md.
- **Rollback:** Vercel → Deployments → previous production deployment → **Promote to Production** (instant). Data changes are not undone, so test data-changing features well on staging.
- **Freeze before go-live:** only bug fixes on `staging` until the full test plan passes once.
- **Refresh staging data** when it gets messy: re-run the seed command (wipes staging business data only).

## 5. Backups (production)
Firebase console → Firestore → **Backups** (or Google Cloud console → Firestore → Backups) → create a **daily backup schedule**, retention 7–14 days. Test a restore once into the staging project.

## 6. Production is protected
The demo/clear script (`scripts/demo/seed.js`, `npm run staging:fill/clear`) only ever writes to a project whose id contains staging / test / demo — there is no override. Real data can't be cleared or replaced by any script; if something goes wrong, restore from a Firestore backup.
