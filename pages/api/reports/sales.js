const { adminDb } = require("../../../lib/firebaseAdmin");
const { requireUser } = require("../../../lib/apiAuth");
const { fetchReportOrders } = require("../../../lib/reportQuery");
const { orderDiscount, round2 } = require("../../../lib/invoiceDiscount");
const { marginForOrders } = require("../../../lib/marginCalc");
const { reportServerError } = require("../../../lib/monitor");

// Builds a sales report from every invoice that ISN'T cancelled — with
// the active/cancelled-only model, any non-cancelled invoice represents
// a real sale. The date range is part of the Firestore query itself, so
// a one-day report reads one day of invoices, not the entire history.
// Uses the same (route, createdAt) index as the dashboards. Cancelled
// invoices and per-client grouping are handled in memory afterward.
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  }

  try {
    const decoded = await requireUser(req);

    const { from, to } = req.query;
    const { route: reportRoute, orders: all } = await fetchReportOrders(decoded, req.query);
    const orders = all.filter((o) => o.status !== "cancelled");

    // Group by client, merging line items for the same product across
    // that client's multiple orders in the period.
    const byClient = new Map();
    for (const order of orders) {
      if (!byClient.has(order.clientId)) {
        byClient.set(order.clientId, { clientId: order.clientId, itemsByProduct: new Map(), discount: 0 });
      }
      const entry = byClient.get(order.clientId);
      // Invoice-level discounts are kept per client and taken off the
      // client's total — the line amounts stay at their real prices.
      entry.discount += orderDiscount(order);
      for (const item of order.items) {
        const key = item.productId || item.name;
        const existing = entry.itemsByProduct.get(key);
        if (existing) {
          existing.qty += item.qty;
          existing.subtotal += item.subtotal ?? item.price * item.qty;
        } else {
          entry.itemsByProduct.set(key, {
            productId: item.productId || null,
            name: item.name,
            unit: item.unit,
            price: item.price,
            qty: item.qty,
            subtotal: item.subtotal ?? item.price * item.qty,
          });
        }
      }
    }

    // Batch-fetch client details (name/store/location) for every client
    // that appears in the report.
    const clientIds = [...byClient.keys()];
    const clientDocs = clientIds.length
      ? await adminDb.getAll(...clientIds.map((id) => adminDb.collection("clients").doc(id)))
      : [];
    const clientInfo = new Map(
      clientDocs.map((doc) => [doc.id, doc.exists ? doc.data() : null])
    );

    const clients = clientIds.map((clientId) => {
      const entry = byClient.get(clientId);
      const items = [...entry.itemsByProduct.values()].map((it) => ({
        ...it,
        subtotal: Math.round(it.subtotal * 100) / 100,
      }));
      const totalUnits = items.reduce((sum, it) => sum + it.qty, 0);
      const grossPrice = round2(items.reduce((sum, it) => sum + it.subtotal, 0));
      const discount = round2(entry.discount);
      const totalPrice = round2(grossPrice - discount);
      const info = clientInfo.get(clientId);
      return {
        clientId,
        name: info?.name || "—",
        storeName: info?.storeName || "—",
        location: info?.location || "—",
        items,
        totalUnits,
        grossPrice,
        discount,
        totalPrice,
      };
    });

    clients.sort((a, b) => b.totalPrice - a.totalPrice);

    const grandTotalUnits = clients.reduce((sum, c) => sum + c.totalUnits, 0);
    const grandTotalPrice = round2(clients.reduce((sum, c) => sum + c.totalPrice, 0));
    const grandDiscount = round2(clients.reduce((sum, c) => sum + c.discount, 0));

    // Operating margin of exactly the invoices in THIS report (not only the
    // finalized ones), visible to every role that can open the report.
    const margin = await marginForOrders(orders);

    return res.status(200).json({
      margin,
      from: from || null,
      to: to || null,
      route: reportRoute,
      clients,
      grandTotalUnits,
      grandTotalPrice,
      grandDiscount,
      orderCount: orders.length,
    });
  } catch (err) {
    reportServerError(err, req, res);
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
