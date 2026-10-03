import { useEffect, useRef, useState } from "react";
import Icon from "../../components/Icon";
import { useRouter } from "next/router";
import { useAuth } from "../../lib/useAuth";
import Nav from "../../components/Nav";
import BackButton from "../../components/BackButton";
import SuccessScreen from "../../components/SuccessScreen";
import InvoiceTotals from "../../components/InvoiceTotals";
import { hasDiscount, orderDiscount, orderSubtotal } from "../../lib/invoiceDiscount";
import QtyStepper from "../../components/QtyStepper";
import FreeSampleToggle from "../../components/FreeSampleToggle";
import PriceAdjust from "../../components/PriceAdjust";
import { cartLineFromOrderLine, cartLineToPayload, cartLineTotal, effectivePrice, freshPriceFields, priceProblem } from "../../lib/linePrice";
import { PageLoading, Spinner } from "../../components/Loading";
import { apiFetch } from "../../lib/apiFetch";
import { invalidate } from "../../lib/apiCache";
import { useLiveRefresh } from "../../lib/useLiveRefresh";
import { formatDate, formatDateTime, formatNumber, formatQty, shortCode } from "../../lib/labels";
import { useRequestId } from "../../lib/useRequestId";

export default function OrderDetail() {
  const { role, token, loading, logout } = useAuth();
  const router = useRouter();
  const { id } = router.query;

  const [order, setOrder] = useState(null);
  const [notes, setNotes] = useState("");
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Editing items
  const [editing, setEditing] = useState(false);
  const [cart, setCart] = useState([]); // [{ productId, name, price, unit, qty }]
  const [products, setProducts] = useState([]);
  const [productQuery, setProductQuery] = useState("");
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);
  const [savingItems, setSavingItems] = useState(false);
  // Change requests (for locked invoices — agents only)
  const [reason, setReason] = useState("");
  const [cancelRequestOpen, setCancelRequestOpen] = useState(false);
  const [editDiscount, setEditDiscount] = useState(""); // invoice-level discount while editing
  const [sendingRequest, setSendingRequest] = useState(false);
  const requestIds = useRequestId();
  const productBoxRef = useRef(null);

  useEffect(() => {
    if (!token || !id) return;
    fetchOrder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, id]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (productBoxRef.current && !productBoxRef.current.contains(e.target)) {
        setProductDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, []);

  async function fetchOrder() {
    setFetching(true);
    setError("");
    try {
      const res = await apiFetch(`/api/orders/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setOrder(data);
      setNotes(data.notes || "");
    } catch (err) {
      setError(err.message);
    } finally {
      setFetching(false);
    }
  }

  async function cancelInvoice() {
    if (needsRequest) {
      setCancelRequestOpen(true);
      return;
    }
    if (!confirm("إلغاء هذه الفاتورة؟ ستبقى في السجل لكنها لن تُحتسب ضمن المبيعات.")) return;
    try {
      const res = await apiFetch(`/api/orders/${id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: "cancelled" }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      invalidate("/api/orders/list");
      fetchOrder();
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveNotes() {
    setSaving(true);
    try {
      const res = await apiFetch(`/api/orders/${id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ notes }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function startEditing() {
    setEditing(true);
    setCart(order.items.map(cartLineFromOrderLine));
    setEditDiscount(orderDiscount(order) ? String(orderDiscount(order)) : "");
    try {
      const res = await apiFetch(`/api/products/list?route=${order.route}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) setProducts(data.products || []);
    } catch {
      // catalog fetch failing just means "add product" search won't work;
      // editing existing quantities still does, so don't block on it.
    }
  }

  function cancelEditing() {
    setEditing(false);
    setCart([]);
    setProductQuery("");
  }

  function setCartQty(productId, qty) {
    if (qty <= 0) {
      setCart((prev) => prev.filter((it) => it.productId !== productId));
      return;
    }
    setCart((prev) => prev.map((it) => (it.productId === productId ? { ...it, qty } : it)));
  }

  const cartProductIds = new Set(cart.map((it) => it.productId));
  const filteredProducts = products
    .filter((p) => !cartProductIds.has(p.id))
    .filter((p) => !productQuery || p.name.toLowerCase().includes(productQuery.toLowerCase()))
    .slice(0, 8);

  function addProduct(p) {
    setCart((prev) => [
      ...prev,
      { productId: p.id, name: p.name, price: p.price, ...freshPriceFields(p.price), unit: p.unit, qty: 1, freeSample: false },
    ]);
    setProductQuery("");
    setProductDropdownOpen(false);
  }

  function toggleFreeSample(productId) {
    setCart((prev) => prev.map((it) => (it.productId === productId ? { ...it, freeSample: !it.freeSample } : it)));
  }

  function updateLine(productId, patch) {
    setCart((prev) => prev.map((it) => (it.productId === productId ? { ...it, ...patch } : it)));
  }

  const lineTotal = cartLineTotal;

  // Agents can't change a locked invoice directly — they ask the supervisor.
  const needsRequest = order && role !== "supervisor" && order.locked;
  const [done, setDone] = useState(null); // "requested-edit" | "requested-cancel" | "saved"

  async function sendChangeRequest(type, items, discount) {
    if (!reason.trim()) {
      setError("اكتب سبب الطلب ليراه المشرف");
      return;
    }
    setSendingRequest(true);
    setError("");
    const body = {
      orderId: id,
      type,
      reason: reason.trim(),
      ...(items ? { items } : {}),
      ...(discount !== undefined ? { discount: Number(discount) || 0 } : {}),
    };
    try {
      const res = await apiFetch("/api/requests/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...body, requestId: requestIds.idFor(body) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      requestIds.reset();
      setReason("");
      setEditing(false);
      setCancelRequestOpen(false);
      setDone(type === "cancel" ? "requested-cancel" : "requested-edit");
      invalidate("/api/orders/list");
      fetchOrder();
    } catch (err) {
      if (!err.isNetworkError) requestIds.reset();
      setError(err.message);
    } finally {
      setSendingRequest(false);
    }
  }

  async function saveItems() {
    const badPrice = cart.find((it) => priceProblem(it));
    if (badPrice) {
      setError(`${badPrice.name}: ${priceProblem(badPrice)}`);
      return;
    }
    if (needsRequest) {
      return sendChangeRequest(
        "edit",
        cart.map(cartLineToPayload),
        editDiscount
      );
    }
    setSavingItems(true);
    setError("");
    try {
      const res = await apiFetch(`/api/orders/${id}/items`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          items: cart.map(cartLineToPayload),
          discount: Number(editDiscount) || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEditing(false);
      setDone("saved");
      invalidate("/api/orders/list");
      fetchOrder();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingItems(false);
    }
  }

  // Watches this invoice's own route so a supervisor's decision on a
  // change request (or any other edit) shows up here without a reload.
  useLiveRefresh(token, order ? [`orders_${order.route}`] : [], fetchOrder);

  if (loading || fetching || !order) return <PageLoading />;

  if (done) {
    const requested = done !== "saved";
    return (
      <div className="min-h-screen bg-canvas">
        <Nav role={role} logout={logout} />
        <main className="max-w-lg mx-auto px-4 pt-5 pb-8 sm:px-0">
          <SuccessScreen
            tone={requested ? "warn" : "success"}
            title={
              done === "requested-cancel"
                ? "أُرسل طلب إلغاء الفاتورة للمشرف"
                : done === "requested-edit"
                ? "أُرسل طلب تعديل الفاتورة للمشرف"
                : "تم حفظ تعديل الفاتورة"
            }
            number={shortCode(order.id)}
            hint={requested ? "لن تتغير الفاتورة حتى يوافق المشرف. ستصلك رسالة بالقرار." : "تم تحديث الكميات والمخزون."}
            secondary={{ label: "الفواتير", href: role === "supervisor" ? "/dashboard/supervisor" : `/dashboard/${order.route}` }}
            primary={{ label: "عرض الفاتورة", onClick: () => setDone(null) }}
          />
        </main>
      </div>
    );
  }

  const isCancelled = order.status === "cancelled";
  const cartSubtotal = Math.round(cart.reduce((sum, it) => sum + lineTotal(it), 0) * 100) / 100;

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav role={role} logout={logout} />
      <div className="max-w-2xl mx-auto p-4 sm:p-8">
        <div className={`bg-white rounded-lg shadow p-5 sm:p-6 ${isCancelled ? "opacity-60" : ""}`}>
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 mb-4">
            <div>
              <BackButton />
              <h1 className="text-xl font-semibold text-gray-800">
                فاتورة رقم <span className="tabular-ltr" title={order.id}>{shortCode(order.id)}</span>
              </h1>
              <p className="text-sm text-gray-500">
                العميل <span className="tabular-ltr">#{order.clientId}</span> — {order.client?.name} ({order.client?.storeName})
              </p>
              <p className="text-xs text-gray-400">{order.client?.location}</p>
              {order.client?.phone && (
                <div className="flex gap-4 mt-2">
                  <a
                    href={`tel:${order.client.phone}`}
                    className="text-sm text-blue-600 min-h-[44px] flex items-center"
                  >
                    اتصال {order.client.phone}
                  </a>
                  {order.client.whatsapp && (
                    <a
                      href={`https://wa.me/${order.client.whatsapp.replace(/[^\d]/g, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-green-600 min-h-[44px] flex items-center"
                    >
                      واتساب
                    </a>
                  )}
                </div>
              )}
            </div>
            {isCancelled ? (
              <span className="text-sm text-red-500 bg-red-50 rounded-lg px-3 h-11 flex items-center self-start">
                ملغاة
              </span>
            ) : order.pendingRequest && role !== "supervisor" ? (
              <span className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2 self-start">
                طلب {order.pendingRequest.type === "cancel" ? "إلغاء" : "تعديل"} بانتظار موافقة المشرف
              </span>
            ) : !editing && !cancelRequestOpen ? (
              <div className="flex gap-2 self-start">
                <button
                  type="button"
                  onClick={startEditing}
                  className="text-sm text-gray-700 bg-gray-100 active:bg-gray-200 rounded-lg px-4 h-11"
                >
                  {needsRequest ? "طلب تعديل" : "تعديل"}
                </button>
                <button
                  type="button"
                  onClick={cancelInvoice}
                  className="text-sm text-red-600 bg-red-50 active:bg-red-100 rounded-lg px-4 h-11"
                >
                  {needsRequest ? "طلب إلغاء" : "إلغاء الفاتورة"}
                </button>
              </div>
            ) : null}
          </div>

          {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

          {!isCancelled && (
            <p className={`text-xs mb-3 ${order.locked ? "text-gray-600" : "text-gray-400"}`}>
              {order.locked
                ? `🔒 مقفلة — ${
                    order.lockReason === "reported" ? "ضمن تقرير تمت مشاركته" : "مرّ أكثر من ٩ ساعات على إنشائها"
                  }${role !== "supervisor" ? ". أي تعديل أو إلغاء يحتاج موافقة المشرف." : "."}`
                : order.editableUntil
                ? `يمكن التعديل أو الإلغاء حتى ${formatDateTime(order.editableUntil)}، أو حتى مشاركة تقرير يشملها.`
                : ""}
            </p>
          )}

          {role === "supervisor" && order.pendingRequest && (
            <a
              href={`/requests/${order.pendingRequest.id}`}
              className="block text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3"
            >
              يوجد طلب {order.pendingRequest.type === "cancel" ? "إلغاء" : "تعديل"} بانتظار قرارك ←
            </a>
          )}

          {order.lastRequest && !order.pendingRequest && (
            <div
              className={`text-sm rounded-lg px-3 py-2 mb-3 ${
                order.lastRequest.status === "approved" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"
              }`}
            >
              {order.lastRequest.status === "approved" ? "تمت الموافقة على" : "رُفض"} طلب
              {order.lastRequest.type === "cancel" ? " الإلغاء" : " التعديل"} — {formatDateTime(order.lastRequest.decidedAt)}
              {order.lastRequest.note && <span className="block text-xs mt-0.5">ملاحظة المشرف: {order.lastRequest.note}</span>}
            </div>
          )}

          {cancelRequestOpen && (
            <div className="border border-red-200 bg-red-50 rounded-lg p-3 mb-4 space-y-2">
              <p className="text-sm text-red-700">طلب إلغاء الفاتورة — سيراجعه المشرف قبل التنفيذ.</p>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="سبب الإلغاء (مطلوب)"
                className="w-full border rounded-lg px-3 py-2 text-base bg-white"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => sendChangeRequest("cancel")}
                  disabled={sendingRequest}
                  className="flex-1 bg-red-600 text-white rounded-lg h-11 text-base disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {sendingRequest && <Spinner className="w-4 h-4" />}
                  إرسال طلب الإلغاء
                </button>
                <button type="button" onClick={() => setCancelRequestOpen(false)} className="text-gray-500 px-4 h-11">
                  تراجع
                </button>
              </div>
            </div>
          )}

          {editing ? (
            <div className="space-y-4 mb-4">
              <div ref={productBoxRef} className="relative">
                <input
                  type="text"
                  value={productQuery}
                  onChange={(e) => {
                    setProductQuery(e.target.value);
                    setProductDropdownOpen(true);
                  }}
                  onFocus={() => setProductDropdownOpen(true)}
                  placeholder="أضف منتجًا..."
                  className="w-full border rounded-lg px-3 h-12 text-base"
                />
                {productDropdownOpen && (
                  <div className="absolute z-10 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-64 overflow-y-auto">
                    {filteredProducts.length === 0 ? (
                      <p className="px-3 py-3 text-sm text-gray-400">لا توجد منتجات مطابقة</p>
                    ) : (
                      filteredProducts.map((p) => (
                        <button
                          type="button"
                          key={p.id}
                          onClick={() => addProduct(p)}
                          className="w-full text-start px-3 py-3 text-base active:bg-gray-100 border-b last:border-0 flex justify-between min-h-[44px]"
                        >
                          <span>{p.name}</span>
                          <span className="text-gray-400">
                            {formatNumber(p.price)} / {p.unit}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              <div className="border rounded-lg divide-y">
                {cart.length === 0 ? (
                  <p className="px-3 py-3 text-sm text-gray-400">لا توجد منتجات — أضف واحدًا أعلاه</p>
                ) : (
                  cart.map((it) => (
                    <div key={it.productId} className="px-3 py-3 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-base text-gray-800 truncate">{it.name}</p>
                          <p className="text-sm text-gray-400">
                            {formatNumber(effectivePrice(it))} / {it.unit}
                            {it.priceAdjusted && !it.freeSample && !priceProblem(it) && (
                              <span className="line-through text-gray-300 ms-1 num">{formatNumber(it.listPrice)}</span>
                            )}
                          </p>
                        </div>
                        <QtyStepper value={it.qty} onChange={(v) => setCartQty(it.productId, v)} min={0} />
                        <button
                          type="button"
                          onClick={() => setCartQty(it.productId, 0)}
                          aria-label={`حذف ${it.name}`}
                          className="w-11 h-11 rounded-xl flex items-center justify-center text-red-600 bg-red-50 active:bg-red-100 shrink-0"
                        >
                          <Icon name="trash" size={18} />
                        </button>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <PriceAdjust line={it} onChange={(patch) => updateLine(it.productId, patch)} />
                      </div>
                    </div>
                  ))
                )}
              </div>

              <InvoiceTotals subtotal={cartSubtotal} discount={editDiscount} onDiscountChange={setEditDiscount} />

              {needsRequest && (
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  maxLength={500}
                  placeholder="سبب التعديل (مطلوب) — سيراجعه المشرف قبل التنفيذ"
                  className="w-full border rounded-lg px-3 py-2 text-base"
                />
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={saveItems}
                  disabled={savingItems || sendingRequest || cart.length === 0}
                  className="flex-1 bg-accent text-on-accent rounded-lg h-12 text-base font-medium active:bg-accent-strong disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {(savingItems || sendingRequest) && <Spinner className="w-4 h-4" />}
                  {needsRequest
                    ? sendingRequest
                      ? "جارٍ الإرسال..."
                      : "إرسال طلب التعديل"
                    : savingItems
                    ? "جارٍ الحفظ..."
                    : "حفظ التعديلات"}
                </button>
                <button
                  type="button"
                  onClick={cancelEditing}
                  className="text-base text-gray-500 px-4 h-12"
                >
                  إلغاء
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Card list instead of a table — a table squeezes unreadably on
                  phone width, this stays legible and touch-friendly. */}
              <div className="border rounded-lg divide-y mb-4">
                {order.items.map((it, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-3 gap-3">
                    <div className="min-w-0">
                      <p className="text-base text-gray-800 truncate">{it.name}</p>
                      <p className="text-sm text-gray-400">
                        {formatQty(it.qty)} {it.unit || ""} × {formatNumber(it.price)}
                      </p>
                      {it.priceAdjusted && (
                        <p className="text-xs text-amber-800 bg-amber-50 rounded-md px-1.5 py-0.5 mt-1 inline-block">
                          سعر معدّل — سعر القائمة {formatNumber(it.listPrice)} · {it.priceReason}
                        </p>
                      )}
                    </div>
                    <p className="text-base font-medium text-gray-800 shrink-0">
                      {formatNumber(it.subtotal ?? it.price * it.qty)}
                    </p>
                  </div>
                ))}
              </div>

              {hasDiscount(order) && (
                <p className="text-sm font-semibold text-blue-700 bg-blue-50 rounded-xl px-3 py-2 mb-3">
                  يوجد تخفيض على هذه الفاتورة: {formatNumber(orderDiscount(order))}
                </p>
              )}
              <InvoiceTotals subtotal={orderSubtotal(order)} discount={orderDiscount(order)} className="mb-4" />
            </>
          )}

          <div className="text-sm text-gray-500 mb-4 space-y-0.5">
            {order.deliveryDate ? (
              <p>تاريخ التسليم: {formatDate(order.deliveryDate)}</p>
            ) : (
              <p>حسب الطلب — تواصل مع العميل لتحديد الموعد.</p>
            )}
            <p>تاريخ الفاتورة: {formatDateTime(order.createdAt)}</p>
          </div>

          {role === "supervisor" && order.editHistory?.length > 0 && (
            <details className="mb-4 text-sm">
              <summary className="text-gray-500 cursor-pointer select-none">
                سجل التعديلات ({order.editHistory.length})
              </summary>
              <div className="mt-2 space-y-2 border-s-2 border-gray-200 ps-3">
                {order.editHistory.map((h, i) => (
                  <div key={i} className="text-gray-500">
                    <p className="text-xs text-gray-400">قبل التعديل — {formatDateTime(h.editedAt)}</p>
                    <p>
                      {h.items.map((it) => `${it.name} ×${formatQty(it.qty)}${it.priceAdjusted ? ` @${formatNumber(it.price)}` : ""}`).join("، ")}
                      {h.discount ? ` — خصم ${formatNumber(h.discount)}` : ""} — الإجمالي: {formatNumber(h.total)}
                    </p>
                  </div>
                ))}
              </div>
            </details>
          )}

          <div>
            <label className="block text-sm text-gray-600 mb-1">ملاحظات</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={saveNotes}
              rows={3}
              className="w-full border rounded-lg px-3 py-2 text-base"
              placeholder="أضف أي ملاحظات حول هذه الفاتورة..."
            />
            {saving && <p className="text-xs text-gray-400 mt-1">جارٍ الحفظ...</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
