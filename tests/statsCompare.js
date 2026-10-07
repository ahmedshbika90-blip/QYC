// Compares two API results field by field. Integers and strings must be
// identical; fractional numbers may differ only by float noise (1e-6), since
// the old code added amounts in a different order.
const assert = require("assert");
function sameResult(a, b, path = "$") {
  if (typeof a === "number" && typeof b === "number") {
    if (Number.isInteger(a) && Number.isInteger(b)) return assert.strictEqual(a, b, `${path}: ${a} ≠ ${b}`);
    return assert.ok(Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a)), `${path}: ${a} ≠ ${b}`);
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    assert.ok(Array.isArray(a) && Array.isArray(b), `${path}: array vs non-array`);
    assert.strictEqual(a.length, b.length, `${path}: length ${a.length} ≠ ${b.length}`);
    return a.forEach((x, i) => sameResult(x, b[i], `${path}[${i}]`));
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) sameResult(a[k], b[k], `${path}.${k}`);
    return;
  }
  assert.strictEqual(a, b, `${path}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
}
module.exports = { sameResult };
