const { isValidPhone } = require("./validation");
const { STORE_CLASSES } = require("./labels");

// The editable fields on a client and how each is checked — used by the
// direct edit (PATCH /api/clients/[id]) AND by the supervisor-approval
// edit request, so both paths accept and reject exactly the same input.
const EDITABLE = ["name", "storeName", "location", "active", "phone", "whatsapp", "storeClass"];

function fail(message) {
  const err = new Error(message);
  err.statusCode = 400;
  throw err;
}

// Returns only the fields that were sent, normalised. `current` is the
// client as stored (used for the whatsapp fallback).
function buildClientUpdates(body, current) {
  const { name, storeName, location, active, phone, whatsapp, storeClass } = body || {};
  const out = {};
  if (name !== undefined) {
    if (typeof name !== "string" || !name.trim()) fail("اسم العميل مطلوب");
    out.name = name.trim();
  }
  if (storeName !== undefined) {
    if (typeof storeName !== "string" || !storeName.trim()) fail("اسم المتجر مطلوب");
    out.storeName = storeName.trim();
  }
  if (location !== undefined) {
    if (typeof location !== "string" || !location.trim()) fail("الموقع مطلوب");
    out.location = location.trim();
  }
  if (phone !== undefined) {
    if (!isValidPhone(phone)) fail("رقم الهاتف يجب أن يتكون من 10 أرقام ويبدأ بصفر");
    out.phone = phone;
  }
  if (storeClass !== undefined) {
    if (!STORE_CLASSES.includes(storeClass)) fail("تصنيف المتجر يجب أن يكون A أو B أو C");
    out.storeClass = storeClass;
  }
  if (whatsapp !== undefined) {
    if (whatsapp && !isValidPhone(whatsapp)) fail("رقم الواتساب يجب أن يتكون من 10 أرقام ويبدأ بصفر");
    out.whatsapp = whatsapp || out.phone || phone || current?.phone || "";
  }
  if (active !== undefined) out.active = Boolean(active);
  return out;
}

// Only what would actually change — an edit request that changes nothing
// shouldn't land in the supervisor's queue.
function changedFields(updates, current) {
  const diff = {};
  for (const k of EDITABLE) {
    if (updates[k] === undefined) continue;
    const before = k === "active" ? current?.active !== false : current?.[k] ?? "";
    if (updates[k] !== before) diff[k] = updates[k];
  }
  return diff;
}

function snapshot(client) {
  const s = {};
  for (const k of EDITABLE) s[k] = k === "active" ? client?.active !== false : client?.[k] ?? "";
  return s;
}

const FIELD_LABELS = {
  name: "اسم العميل",
  storeName: "اسم المتجر",
  location: "الموقع",
  phone: "رقم الهاتف",
  whatsapp: "رقم الواتساب",
  storeClass: "تصنيف المتجر",
  active: "الحالة",
};

module.exports = { EDITABLE, FIELD_LABELS, buildClientUpdates, changedFields, snapshot };
