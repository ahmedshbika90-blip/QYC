// Nav renders on every authenticated page and needs the current ID token
// and uid to fetch notifications, but both live inside each page's own
// useAuth() call — passing them down as props would mean touching every
// page that renders <Nav>. Instead, useAuth() publishes them here
// whenever they change, and anything that needs them (currently just
// Nav) subscribes. Not persisted anywhere — cleared on sign-out, gone on
// reload until the next useAuth() picks it up again.
let current = { token: null, uid: null };
const subscribers = new Set();

export function setCurrentAuth(next) {
  current = next;
  subscribers.forEach((fn) => fn(current));
}

export function subscribeAuth(fn) {
  subscribers.add(fn);
  fn(current);
  return () => subscribers.delete(fn);
}
