// "Has anything this person could be notified about changed?" — answered
// from the change counters in meta/versions (1 read) instead of re-running
// every notification query on each page.
//
// The device keeps its last list and sends back the signature it came
// with; the same signature → nothing changed → nothing else is read. The
// counters are bumped wherever these items change (requests, warehouse
// documents, shipping requests, transfers), so a real change is never
// missed. The uid is part of the signature, so a list can never be reused
// for another person signing in on the same phone.

const { getAllVersions } = require("./versions");

const KEYS_BY_ROLE = {
  manager: ["requests", "inventory", "stockCheck"],
  accountant: ["inventory"],
  warehouse_keeper: ["shipmentRequests", "transfers", "inventory"],
  agent_car1: ["requests", "inventory", "shipmentRequests"],
  agent_car2: ["requests", "inventory", "shipmentRequests"],
};

async function notifySignature(decoded) {
  const keys = KEYS_BY_ROLE[decoded.role];
  if (!keys) return null;
  const v = await getAllVersions();
  return `${decoded.uid}:${decoded.salesSupervisor ? "s" : ""}:${keys.map((k) => v[k] || 0).join(".")}`;
}

module.exports = { notifySignature, KEYS_BY_ROLE };
