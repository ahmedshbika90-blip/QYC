/**
 * Lists Arabic interface strings that have no English yet.
 * Run from the project root:  node scripts/i18n-check.js
 * Exit code 1 if anything is missing (usable in CI).
 *
 * It parses every file in pages/, components/ and lib/ and collects Arabic
 * string literals, JSX text and template strings (values become {0}, {1}…),
 * then compares them with lib/i18nDict.js.
 */
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const { parse } = require(path.join(ROOT, "node_modules/next/dist/compiled/babel/parser.js"));

const AR = /[\u0600-\u06FF]/;
const norm = (s) => s.replace(/\s+/g, " ").trim();
const exact = new Map();
const patterns = new Map();

function visit(node, file) {
  if (!node || typeof node.type !== "string") return;
  if ((node.type === "StringLiteral" || node.type === "JSXText") && AR.test(node.value)) {
    const k = norm(node.value);
    if (k) exact.set(k, file);
  }
  if (node.type === "TemplateLiteral" && node.quasis.some((q) => AR.test(q.value.cooked || ""))) {
    let k = "";
    node.quasis.forEach((q, i) => {
      k += q.value.cooked;
      if (i < node.expressions.length) k += `{${i}}`;
    });
    k = norm(k);
    if (node.expressions.length === 0) exact.set(k, file);
    else if (k.replace(/\{\d+\}/g, "").trim()) patterns.set(k, file);
  }
  for (const key of Object.keys(node)) {
    if (["loc", "start", "end", "extra"].includes(key)) continue;
    const v = node[key];
    if (Array.isArray(v)) v.forEach((c) => visit(c, file));
    else if (v && typeof v === "object") visit(v, file);
  }
}

function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (p.endsWith(".js") && !p.endsWith("i18nDict.js")) {
      visit(parse(fs.readFileSync(p, "utf8"), { sourceType: "module", plugins: ["jsx"] }).program, path.relative(ROOT, p));
    }
  }
}
["pages", "components", "lib"].forEach((d) => walk(path.join(ROOT, d)));

const src = fs.readFileSync(path.join(ROOT, "lib/i18nDict.js"), "utf8");
const grab = (name) => JSON.parse(src.match(new RegExp(`export const ${name} = ([\\s\\S]*?);\\n`))[1]);
const DICT = grab("DICT");
const PATTERNS = new Set(grab("PATTERNS").map((p) => p[0]));

const missingExact = [...exact].filter(([k]) => DICT[k] === undefined);
const missingPatterns = [...patterns].filter(([k]) => !PATTERNS.has(k));
for (const [k, f] of missingExact) console.log(`DICT     ${JSON.stringify(k)}   (${f})`);
for (const [k, f] of missingPatterns) console.log(`PATTERN  ${JSON.stringify(k)}   (${f})`);
console.log(`${missingExact.length + missingPatterns.length} missing of ${exact.size + patterns.size}`);
process.exit(missingExact.length + missingPatterns.length ? 1 : 0);
