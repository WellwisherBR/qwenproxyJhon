/**
 * timezone.ts — Locale-safe ASCII timezone header formatting and sanitization.
 *
 * Guarantees that HTTP headers passed into browser `window.fetch()` contain
 * exclusively ISO-8859-1 code points (<= 255), preventing:
 * `TypeError: Failed to read the 'headers' property from 'RequestInit': String contains non ISO-8859-1 code point`
 * on systems configured with non-English locales (e.g. Russian, CJK, Arabic).
 */

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * Format a Date into standard English browser date string matching Chrome,
 * guaranteed pure ASCII (<= 127).
 * Example: "Tue Oct 20 2026 14:35:10 GMT-0300"
 */
export function formatAsciiTimezone(date: Date = new Date()): string {
  const dayName = DAYS[date.getDay()];
  const monthName = MONTHS[date.getMonth()];
  const day = String(date.getDate()).padStart(2, "0");
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absOffset = Math.abs(offsetMinutes);
  const offsetHours = String(Math.floor(absOffset / 60)).padStart(2, "0");
  const offsetMins = String(absOffset % 60).padStart(2, "0");
  const tzOffset = `GMT${sign}${offsetHours}${offsetMins}`;

  return `${dayName} ${monthName} ${day} ${year} ${hours}:${minutes}:${seconds} ${tzOffset}`;
}

/**
 * Sanitizes header values for browser fetch, stripping any code points > 255.
 */
export function sanitizeHeaderForFetch(val: string): string {
  if (typeof val !== "string") return "";
  return val.replace(/[^\x00-\xFF]/g, "");
}
