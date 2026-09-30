import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { Spinner } from "./Loading";

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

  const pill =
    "conn-pill fixed inset-x-0 z-40 mx-auto w-fit max-w-[calc(100%-1.5rem)] rounded-2xl px-4 py-2.5 text-sm shadow-lg flex items-center gap-2.5";

  if (!online) {
    return (
      <div role="status" aria-live="polite" className={`${pill} bg-amber-100 text-amber-800 border border-amber-200`}>
        <Icon name="wifiOff" size={18} />
        <span>
          <strong className="font-semibold">لا يوجد اتصال</strong> — الفواتير تُحفظ على الجهاز وتُرسل تلقائيًا
        </span>
      </div>
    );
  }
  if (net.failed) {
    return (
      <div role="status" aria-live="polite" className={`${pill} bg-amber-100 text-amber-800 border border-amber-200`}>
        <Icon name="alert" size={18} />
        <span>
          <strong className="font-semibold">تعذّر الوصول للخادم</strong> — تُعرض آخر بيانات محفوظة
        </span>
      </div>
    );
  }
  if (net.slow || net.retrying) {
    return (
      <div role="status" aria-live="polite" className={`${pill} bg-white text-ink border border-line`}>
        <Spinner className="w-4 h-4 text-accent" />
        <span>الاتصال ضعيف — جارٍ المحاولة...</span>
      </div>
    );
  }
  if (recovered) {
    return (
      <div role="status" aria-live="polite" className={`${pill} bg-green-100 text-green-800 border border-green-200`}>
        <Icon name="check" size={18} strokeWidth={2.6} />
        <span>عاد الاتصال{showedStale ? " — قد تكون البيانات قديمة" : ""}</span>
        {showedStale && (
          <button
            onClick={() => window.location.reload()}
            className="h-8 px-3 rounded-lg bg-accent text-on-accent text-sm font-semibold"
          >
            تحديث
          </button>
        )}
      </div>
    );
  }
  return null;
}
