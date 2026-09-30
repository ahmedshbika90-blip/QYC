import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { REQUESTS_HREF } from "../lib/useActionCount";

const SEEN_KEY = "pendingActionsSeen";

// Shown once per browser session (cleared on logout, and naturally gone
// once the tab/browser closes) — not on every page navigation, which
// would just be noise. Only appears when there's something to act on.
export default function PendingActionModal({ role, count }) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(true);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!role) return;
    let seen = false;
    try {
      seen = sessionStorage.getItem(SEEN_KEY) === "1";
    } catch {
      // private browsing etc. — treat as not yet seen
    }
    setDismissed(seen);
    setChecked(true);
  }, [role]);

  if (!checked || dismissed || !count || count <= 0 || !REQUESTS_HREF[role]) return null;

  function markSeen() {
    try {
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      // ignore
    }
    setDismissed(true);
  }

  function goToRequests() {
    markSeen();
    router.push(REQUESTS_HREF[role]);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 text-center">
        <p className="text-lg font-semibold text-gray-800 mb-2">
          لديك {count} {count === 1 ? "طلب" : "طلبات"} بحاجة لإجرائك
        </p>
        <p className="text-sm text-gray-500 mb-6">يمكنك مراجعتها الآن أو لاحقًا من صفحة الطلبات.</p>
        <div className="flex flex-col gap-2">
          <button
            onClick={goToRequests}
            className="w-full bg-gray-900 text-white rounded-lg h-12 text-base font-medium active:bg-gray-700"
          >
            الذهاب إلى الطلبات
          </button>
          <button onClick={markSeen} className="w-full text-gray-500 h-11 text-sm">
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
