import { BUSINESS_TIMEZONE, formatDayKeyInTimeZone } from "@/lib/business-timezone";

/** Día operativo actual (America/Guatemala), formato YYYY-MM-DD. */
export function todayDayKey(d = new Date()): string {
  return formatDayKeyInTimeZone(d, BUSINESS_TIMEZONE);
}
