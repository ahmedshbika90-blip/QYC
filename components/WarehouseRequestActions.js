import { useState } from "react";
import { Spinner } from "./Loading";
import { apiFetch } from "../lib/apiFetch";
import { invalidate } from "../lib/apiCache";
import { useRequestId } from "../lib/useRequestId";
import { MAX_CANCEL_NOTE } from "../lib/shipmentStatus";

// The warehouse keeper's ONLY two moves on a shipping order / cargo
// return: accept it exactly as the agent sent it, or cancel it with a
// reason. There is deliberately no way here to change a quantity, add a
// line or drop one — the request is read-only for the keeper (and the
// server ignores any items sent with an accept, see fulfill.js).
//
// onDone({ action: "fulfilled" | "cancelled", docId, dailySeq, note })
export default function WarehouseRequestActions({ request: r, token, onDone }) {
  const [mode, setMode] = useState("idle"); // idle | cancelling
  const [cancelNote, setCancelNote] = useState("");
  const [acting, setActing] = useState(null); // "accept" | "cancel"
  const [error, setError] = useState("");
  const requestIds = useRequestId();

  async function accept() {
    setActing("accept");
    setError("");
    try {
      const body = { sourceId: r.id };
      const res = await apiFetch(`/api/shipment-requests/${r.id}/fulfill`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ requestId: requestIds.idFor(body) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      requestIds.reset();
      invalidate("/api/shipment-requests");
      invalidate("/api/inventory");
      onDone?.({ action: "fulfilled", docId: data.id, dailySeq: data.dailySeq });
    } catch (err) {
      if (!err.isNetworkError) requestIds.reset();
      setError(err.message);
    } finally {
      setActing(null);
    }
  }

  async function cancel(e) {
    e.preventDefault();
    const note = cancelNote.trim();
    if (!note) {
      setError("اكتب سبب الإلغاء — سيصل للمندوب مع الإشعار");
      return;
    }
    setActing("cancel");
    setError("");
    try {
      const res = await apiFetch(`/api/shipment-requests/${r.id}/cancel`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ note }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      invalidate("/api/shipment-requests");
      onDone?.({ action: "cancelled", note });
    } catch (err) {
      setError(err.message);
    } finally {
      setActing(null);
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2.5">
          {error}
        </p>
      )}

      {mode === "cancelling" ? (
        <form onSubmit={cancel} className="space-y-3 rounded-2xl border-2 border-red-200 bg-red-50/40 p-3">
          <label className="block text-sm font-semibold text-ink" htmlFor={`cancel-${r.id}`}>
            سبب الإلغاء — يصل للمندوب مع الإشعار
          </label>
          <textarea
            id={`cancel-${r.id}`}
            value={cancelNote}
            onChange={(e) => setCancelNote(e.target.value)}
            rows={3}
            maxLength={MAX_CANCEL_NOTE}
            autoFocus
            placeholder="مثال: الكمية غير متوفرة اليوم"
            className="w-full border border-line rounded-xl px-3 py-2 text-base bg-white"
            required
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setMode("idle");
                setError("");
              }}
              className="h-12 rounded-xl bg-white border border-line text-ink font-semibold"
            >
              تراجع
            </button>
            <button
              type="submit"
              disabled={acting !== null || !cancelNote.trim()}
              className="h-12 rounded-xl bg-solid-red text-snow font-bold disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {acting === "cancel" && <Spinner className="w-4 h-4" />}
              تأكيد الإلغاء
            </button>
          </div>
        </form>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              setMode("cancelling");
              setError("");
            }}
            disabled={acting !== null}
            className="h-12 rounded-xl bg-red-50 text-red-600 font-bold disabled:opacity-50"
          >
            إلغاء الطلب
          </button>
          <button
            type="button"
            onClick={accept}
            disabled={acting !== null}
            className="h-12 rounded-xl bg-accent text-on-accent font-bold active:bg-accent-strong disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {acting === "accept" && <Spinner className="w-4 h-4" />}
            {r.type === "offloading" ? "قبول واستلام" : "قبول وتنفيذ"}
          </button>
        </div>
      )}
    </div>
  );
}
