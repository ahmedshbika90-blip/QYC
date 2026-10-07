// Phase 2 (speed on weak phones): guards so the slimmer bundle doesn't
// quietly regress. Checks the source, not the browser.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
// Source without comments, so an explanation that mentions getAuth etc. doesn't count.
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8").replace(/^\s*\{?\/\*[\s\S]*?\*\/\}?/gm, "").replace(/^\s*\/\/.*$/gm, "");
let passed = 0;
const ok = (m) => console.log("PASS", ++passed + ":", m);
const walk = (d) => fs.readdirSync(path.join(ROOT, d)).flatMap((f) => (fs.statSync(path.join(ROOT, d, f)).isDirectory() ? walk(path.join(d, f)) : [path.join(d, f)]));
const sources = [...walk("pages"), ...walk("components"), ...walk("lib")].filter((f) => f.endsWith(".js"));

// 1. Firebase Auth: initializeAuth only — getAuth() pulls in pop-up/redirect + reCAPTCHA code.
const fc = read("lib/firebaseClient.js");
assert.ok(/initializeAuth\(/.test(fc) && !/\bgetAuth\b/.test(fc));
assert.deepStrictEqual(sources.filter((f) => /\bgetAuth\b/.test(read(f))), []);
ok("Firebase Auth is initialised without the pop-up/redirect and reCAPTCHA code");

// 2. Firestore SDK only through the on-demand import in lib/liveVersions.js.
const staticFirestore = sources.filter((f) => /from ["']firebase\/firestore["']/.test(read(f)));
assert.deepStrictEqual(staticFirestore, []);
assert.ok(/import\(["']firebase\/firestore["']\)/.test(read("lib/liveVersions.js")));
ok("the Firestore browser SDK is never in a page's first download");

// 3. Fonts self-hosted, no Google Fonts stylesheet.
assert.ok(!sources.some((f) => read(f).includes("fonts.googleapis.com/css")));
assert.ok(read("pages/_app.js").includes("@fontsource/ibm-plex-sans-arabic/400.css") && read("pages/_app.js").includes("@fontsource/alexandria/700.css"));
ok("fonts are served from the app's own domain");

// 4. Logos go through next/image (resized, WebP), never a raw <img src="/brand/...">.
assert.deepStrictEqual(sources.filter((f) => /<img[^>]+src="\/brand\//.test(read(f))), []);
assert.ok((read("pages/executive/index.js").match(/<Image\b/g) || []).length >= 5);
ok("brand logos are optimised images");

// 5. Code that only some screens or roles need is loaded on demand.
const ex = read("pages/executive/index.js");
assert.ok(/dynamic\(\(\) => import\("..\/..\/components\/exec\/CustomersTab"\)/.test(ex) && /dynamic\(\(\) => import\("..\/..\/components\/exec\/InventoryTab"\)/.test(ex));
assert.ok(!/^import .*(CustomersTab|InventoryTab|StockBoard)/m.test(ex));
const nav = read("components/Nav.js");
assert.ok(/dynamic\(\(\) => import\("\.\/PendingActionModal"\)/.test(nav) && /dynamic\(\(\) => import\("\.\/NotificationToast"\)/.test(nav));
assert.ok(/import\(["']html2canvas["']\)/.test(read("lib/sharePdf.js")) && /import\(["']jspdf["']\)/.test(read("lib/sharePdf.js")));
ok("executive tabs 2–3, notification pop-ups and the PDF libraries download only when needed");

console.log("ALL PHASE-2 BUNDLE GUARDS PASSED");
