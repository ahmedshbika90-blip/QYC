import { useEffect, useState } from "react";

// Sudan's mobile networks drop out often enough that people need to SEE
// when they've gone offline, not just get a cryptic failed request later.
export default function OfflineBanner() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    function goOnline() {
      setOnline(true);
    }
    function goOffline() {
      setOnline(false);
    }
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div className="bg-amber-500 text-white text-sm text-center py-2 px-4 sticky top-0 z-30">
      لا يوجد اتصال بالإنترنت — سيتم استئناف العمل تلقائيًا عند عودة الاتصال
    </div>
  );
}
