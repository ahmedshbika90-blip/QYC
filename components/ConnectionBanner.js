import { useEffect, useRef, useState } from "react";

// One banner that tells people plainly what the connection is doing:
//   offline        — device has no internet
//   unreachable    — device thinks it's online, but the server can't be
//                    reached (common on weak mobile data: "connected" but
//                    nothing gets through)
//   weak           — requests are slow / being retried right now
//   back online    — connection recovered; if saved (possibly outdated)
//                    data was shown meanwhile, offer a one-tap refresh
// Nothing is shown when everything is fine.
export default function ConnectionBanner() {
  const [online, setOnline] = useState(true);
  const [net, setNet] = useState({ slow: false, retrying: false, failed: false });
  const [showedStale, setShowedStale] = useState(false);
  const [recovered, setRecovered] = useState(false);
  const wasDown = useRef(false);
  const hideTimer = useRef(null);

  useEffect(() => {
    setOnline(navigator.onLine);
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    const onNet = (e) => setNet(e.detail);
    const onStale = () => setShowedStale(true);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    window.addEventListener("net-status", onNet);
    window.addEventListener("stale-data", onStale);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("net-status", onNet);
      window.removeEventListener("stale-data", onStale);
    };
  }, []);

  const down = !online || net.failed;

  // Detect the moment the connection comes back.
  useEffect(() => {
    if (down) {
      wasDown.current = true;
      setRecovered(false);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      return;
    }
    if (wasDown.current) {
      wasDown.current = false;
      setRecovered(true);
      if (!showedStale) {
        hideTimer.current = setTimeout(() => setRecovered(false), 4000);
      }
    }
  }, [down, showedStale]);

  const base = "text-sm text-center py-2 px-4 sticky top-0 z-30";

  if (!online) {
    return (
      <div className={`${base} bg-amber-500 text-white`}>
        لا يوجد اتصال بالإنترنت — تُعرض آخر بيانات محفوظة. الفواتير غير المرسلة تُحفظ وتُرسل تلقائيًا عند عودة الاتصال.
      </div>
    );
  }
  if (net.failed) {
    return (
      <div className={`${base} bg-amber-500 text-white`}>
        تعذر الوصول إلى الخادم — الاتصال ضعيف أو منقطع. تُعرض آخر بيانات محفوظة إن وُجدت.
      </div>
    );
  }
  if (net.slow || net.retrying) {
    return <div className={`${base} bg-gray-700 text-white`}>الاتصال ضعيف — جارٍ المحاولة، يرجى الانتظار...</div>;
  }
  if (recovered) {
    return (
      <div className={`${base} bg-green-600 text-white flex items-center justify-center gap-3`}>
        <span>عاد الاتصال{showedStale ? " — قد تكون البيانات المعروضة قديمة" : ""}</span>
        {showedStale && (
          <button
            onClick={() => window.location.reload()}
            className="bg-white text-green-700 rounded px-3 py-0.5 text-sm font-medium"
          >
            تحديث
          </button>
        )}
      </div>
    );
  }
  return null;
}
