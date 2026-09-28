import { useRef } from "react";
import { newRequestId } from "./requestId";

// For create forms (client, product, inventory document). Returns the same
// request ID for repeated submissions of the SAME data — so pressing
// "retry" after a connection failure can never create a duplicate, even
// if the first attempt actually reached the server. Changing the form
// data gets a fresh ID (it's a different submission). Call reset() after
// a success or a server rejection.
export function useRequestId() {
  const ref = useRef(null);
  return {
    idFor(payload) {
      const key = JSON.stringify(payload);
      if (!ref.current || ref.current.key !== key) ref.current = { key, id: newRequestId() };
      return ref.current.id;
    },
    reset() {
      ref.current = null;
    },
  };
}
