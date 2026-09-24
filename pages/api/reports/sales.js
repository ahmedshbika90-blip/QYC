const { adminDb } = require("../../../lib/firebaseAdmin");
const { requireUser } = require("../../../lib/apiAuth");

const ROLE_TO_ROUTE = {
  agent_car1: "car1",
  agent_car2: "car2",
};

// Builds a sales report from every invoice that ISN'T cancelled — with
// the active/cancelled-only model, any non-cancelled invoice represents
// a real sale. Only equality filters are used in the Firestore query
// (route ==) so no new composite index is ever needed; excluding
// cancelled invoices, the date range, and per-client grouping all happen
// in memory afterward, which is fine at this business's order volume.
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "طريقة الطلب غير مسموح بها" });
  }

  try {
    const decoded = await requireUser(req);

    let query = adminDb.collection("orders");

    const restrictedRoute = ROLE_TO_ROUTE[decoded.role];
    if (restrictedRoute) {
      query = query.where("route", "==", restrictedRoute);
    } else if (decoded.role === "supervisor") {
      const { route } = req.query;
      if (route) {
        if (!["car1", "car2"].includes(route)) {
          return res.status(400).json({ error: 'route يجب أن يكون "car1" أو "car2"' });
        }
        query = query.where("route", "==", route);
      }
      // no route filter → both routes combined
    } else {
      return res.status(403).json({ error: "غير مصرح: الصلاحية غير معروفة" });
    }

    const snap = await query.get();
    let orders = snap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((o) => o.status !== "cancelled");

    const { from, to } = req.query;
    if (from) {
      const fromDate = new Date(from);
      orders = orders.filter((o) => new Date(o.createdAt) >= fromDate);
    }
    if (to) {
      // Include the entire "to" day, not just up to midnight.
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      orders = orders.filter((o) => new Date(o.createdAt) <= toDate);
    }

    // Group by client, merging line items for the same product across
    // that client's multiple orders in the period.
    const byClient = new Map();
    for (const order of orders) {
      if (!byClient.has(order.clientId)) {
        byClient.set(order.clientId, { clientId: order.clientId, itemsByProduct: new Map() });
      }
      const entry = byClient.get(order.clientId);
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
      const totalPrice = Math.round(items.reduce((sum, it) => sum + it.subtotal, 0) * 100) / 100;
      const info = clientInfo.get(clientId);
      return {
        clientId,
        name: info?.name || "—",
        storeName: info?.storeName || "—",
        location: info?.location || "—",
        items,
        totalUnits,
        totalPrice,
      };
    });

    clients.sort((a, b) => b.totalPrice - a.totalPrice);

    const grandTotalUnits = clients.reduce((sum, c) => sum + c.totalUnits, 0);
    const grandTotalPrice = Math.round(clients.reduce((sum, c) => sum + c.totalPrice, 0) * 100) / 100;

    return res.status(200).json({
      from: from || null,
      to: to || null,
      route: restrictedRoute || req.query.route || "all",
      clients,
      grandTotalUnits,
      grandTotalPrice,
      orderCount: orders.length,
    });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
}
