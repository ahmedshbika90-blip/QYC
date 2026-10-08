// Company settings — ONE place instead of constants spread through the code.
// Read on the server and in the browser, so they come from build-time
// environment variables (Vercel → Settings → Environment Variables), with
// Mahgoub Sons' values as defaults:
//
//   NEXT_PUBLIC_COMPANY_NAME     محجوب أولاد الغذائية
//   NEXT_PUBLIC_COMPANY_NAME_EN  Mahgoub Sons Food
//   NEXT_PUBLIC_CURRENCY         SDG            (stored on every invoice and payment)
//   NEXT_PUBLIC_TIME_ZONE        Africa/Khartoum (business day = this calendar day)
//   NEXT_PUBLIC_UTC_OFFSET       +02:00          (the same zone as a fixed offset)
//
// Deliberately NOT editable from a screen: every daily summary, invoice log,
// legal invoice-number year and report boundary is keyed to the business
// day of this time zone, so changing it on a live system would split days
// in two. Change it only for a new installation (or with a migration).

const TIME_ZONE = process.env.NEXT_PUBLIC_TIME_ZONE || "Africa/Khartoum";
const UTC_OFFSET = process.env.NEXT_PUBLIC_UTC_OFFSET || "+02:00";
const CURRENCY = process.env.NEXT_PUBLIC_CURRENCY || "SDG";
const COMPANY_NAME = process.env.NEXT_PUBLIC_COMPANY_NAME || "محجوب أولاد الغذائية";
const COMPANY_NAME_EN = process.env.NEXT_PUBLIC_COMPANY_NAME_EN || "Mahgoub Sons Food";

if (!/^[+-]\d{2}:\d{2}$/.test(UTC_OFFSET)) throw new Error(`NEXT_PUBLIC_UTC_OFFSET must look like +02:00 (got ${UTC_OFFSET})`);

module.exports = { TIME_ZONE, UTC_OFFSET, CURRENCY, COMPANY_NAME, COMPANY_NAME_EN };
