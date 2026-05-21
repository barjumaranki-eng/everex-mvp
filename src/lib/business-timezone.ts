/** Zona horaria operativa Everex (mesa OTC, dashboard, dayKey). */
export const BUSINESS_TIMEZONE = "America/Guatemala";

/** Guatemala no usa horario de verano: siempre UTC−6 respecto a reloj civil local. */
const GUATEMALA_UTC_OFFSET_HOURS = 6;

/** YYYY-MM-DD del instante en la zona de negocio. */
export function formatDayKeyInTimeZone(d: Date, timeZone = BUSINESS_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${day}`;
}

/** Reloj civil en Guatemala → instante UTC (para `createdAt` / `postedAt`). */
export function businessWallClockToUtc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Date {
  return new Date(Date.UTC(year, month - 1, day, hour + GUATEMALA_UTC_OFFSET_HOURS, minute, second));
}
