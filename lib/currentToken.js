// Nav renders on every authenticated page and needs the current ID token
// to fetch the pending-action count, but the token itself lives inside
// each page's own useAuth() call — passing it down as a prop would mean
// touching every page that renders <Nav>. Instead, useAuth() publishes it
// here whenever it changes, and anything that needs it (just Nav, so far)
// subscribes. Not persisted anywhere — cleared on sign-out, gone on reload
// until the next useAuth() picks it up again.
let current = null;
const subscribers = new Set();

export function setCurrentToken(token) {
  current = token;
  subscribers.forEach((fn) => fn(current));
}

export function subscribeToken(fn) {
  subscribers.add(fn);
  fn(current);
  return () => subscribers.delete(fn);
}
