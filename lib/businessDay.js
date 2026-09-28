// The business day in Sudan's time zone (YYYY-MM-DD). Used for "first /
// second / third loading of the day" — must follow Khartoum's clock, not
// the server's (Vercel runs on UTC, which would roll the day over at 2 AM
// local time).
function businessDay(date = new Date()) {
  return date.toLocaleDateString("en-CA", { timeZone: "Africa/Khartoum" });
}

module.exports = { businessDay };
