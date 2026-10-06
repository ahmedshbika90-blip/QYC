import { useState } from "react";
import Icon from "./Icon";

// Password field with an eye button: press and HOLD to see what you typed,
// let go to hide it again — nothing stays visible by accident. Works with
// mouse, touch and keyboard (hold Space/Enter on the button).
export default function PasswordInput({ className = "", inputClassName = "", ...props }) {
  const [shown, setShown] = useState(false);
  const show = (e) => {
    e.preventDefault();
    setShown(true);
  };
  const hide = () => setShown(false);
  return (
    <div className={`relative ${className}`}>
      {/* The password is typed left-to-right in both languages, so the eye
          sits on the physical right — never on top of the first characters. */}
      <input {...props} type={shown ? "text" : "password"} dir="ltr" className={`${inputClassName} !pr-12`} />
      <button
        type="button"
        aria-label="اضغط مطولًا لإظهار كلمة المرور"
        title="اضغط مطولًا لإظهار كلمة المرور"
        aria-pressed={shown}
        onPointerDown={show}
        onPointerUp={hide}
        onPointerLeave={hide}
        onPointerCancel={hide}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => (e.key === " " || e.key === "Enter") && show(e)}
        onKeyUp={hide}
        onBlur={hide}
        className="absolute inset-y-0 right-0 w-12 flex items-center justify-center text-muted hover:text-ink select-none touch-none"
        style={{ WebkitTouchCallout: "none" }}
      >
        <Icon name={shown ? "eyeOff" : "eye"} size={20} />
      </button>
    </div>
  );
}
