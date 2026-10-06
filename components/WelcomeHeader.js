import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { Spinner } from "./Loading";
import { apiFetch } from "../lib/apiFetch";
import { getAuthFlags } from "../lib/authFlags";
import { formatDate } from "../lib/labels";

// A quiet greeting at the top of the executive's dashboard: profile picture
// (tap to change), "good morning / evening" and the person's first name.
// No pop-up, nothing to dismiss.

const PHOTO_KEY = (uid) => `profilePhoto:${uid}`;

function greeting(now = new Date()) {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Africa/Khartoum" }).format(now));
  return h < 12 ? "صباح الخير" : "مساء الخير";
}

// Square-crops and shrinks a picked image to 256 px JPEG in the browser.
function resize(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const size = 256;
      const side = Math.min(img.width, img.height);
      const c = document.createElement("canvas");
      c.width = c.height = size;
      c.getContext("2d").drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("تعذر قراءة الصورة"));
    };
    img.src = url;
  });
}

export default function WelcomeHeader({ token, subtitle }) {
  const { name, email, uid } = getAuthFlags();
  const first = (name || email.split("@")[0] || "").trim().split(/\s+/)[0];
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef(null);

  useEffect(() => {
    if (!token || !uid) return;
    try {
      const cached = localStorage.getItem(PHOTO_KEY(uid));
      if (cached) setPhoto(cached);
    } catch {
      // ignore
    }
    apiFetch("/api/profile", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        setPhoto(d.photo || null);
        try {
          if (d.photo) localStorage.setItem(PHOTO_KEY(uid), d.photo);
          else localStorage.removeItem(PHOTO_KEY(uid));
        } catch {
          // ignore
        }
      })
      .catch(() => {});
  }, [token, uid]);

  async function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("اختر صورة");
    setBusy(true);
    setError("");
    try {
      const data = await resize(file);
      const res = await apiFetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ photo: data }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setPhoto(d.photo);
      try {
        localStorage.setItem(PHOTO_KEY(uid), d.photo);
      } catch {
        // ignore
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-4 welcome-in">
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="relative w-16 h-16 md:w-[72px] md:h-[72px] rounded-full shrink-0 overflow-hidden bg-accent-soft text-accent-ink flex items-center justify-center ring-4 ring-white shadow group"
        aria-label={photo ? "تغيير الصورة الشخصية" : "إضافة صورة شخصية"}
        title={photo ? "تغيير الصورة الشخصية" : "إضافة صورة شخصية"}
      >
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="font-display text-2xl font-bold">{first ? first[0] : <Icon name="camera" />}</span>
        )}
        <span className="absolute inset-0 bg-black/35 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
          {busy ? <Spinner className="w-5 h-5" /> : <Icon name="camera" size={20} />}
        </span>
        {!photo && !busy && (
          <span className="absolute bottom-0 end-0 w-6 h-6 rounded-full bg-accent text-on-accent flex items-center justify-center ring-2 ring-white">
            <Icon name="plus" size={14} />
          </span>
        )}
      </button>
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={pick} />
      <div className="min-w-0">
        <p className="text-sm text-muted m-0">{subtitle || formatDate(new Date().toISOString())}</p>
        <h1 className="font-display text-[26px] md:text-[30px] leading-tight font-bold text-ink mt-0.5">
          {greeting()}{first ? <>، <span data-no-translate>{first}</span></> : ""}
        </h1>
        {error && <p role="alert" className="text-xs text-red-600 mt-1">{error}</p>}
      </div>
    </div>
  );
}
