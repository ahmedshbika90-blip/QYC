// The accountant's reference-search results (رقم العملية), kept in memory
// for this browser session so going back and forth between an invoice and
// the search shows them instantly. Cleared whenever a payment changes —
// saved here, or on another device (the live "payments" counter).
const cache = new Map(); // typed digits -> matches

export const getRefMatches = (digits) => cache.get(digits);
export const setRefMatches = (digits, matches) => cache.set(digits, matches);
export function clearRefCache() {
  cache.clear();
}
