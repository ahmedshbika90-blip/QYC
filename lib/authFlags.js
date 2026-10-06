// The signed-in person's sales flags and name, set by lib/useAuth.js the
// moment the login is read — so shared components (Nav, panels) can tell a
// sales supervisor from a sales agent without another auth listener.
let flags = { route: null, salesSupervisor: false, name: "", email: "", uid: null };

export function setAuthFlags(next) {
  flags = { ...flags, ...next };
}
export function getAuthFlags() {
  return flags;
}
export function clearAuthFlags() {
  flags = { route: null, salesSupervisor: false, name: "", email: "", uid: null };
}
