import { formatDayKeyInTimeZone } from "@/lib/business-timezone";

/** Mes calendario como dayKeys YYYY-MM-DD en zona operativa (America/Guatemala). */
export function getMonthBoundsDayKeys(date = new Date()) {
  const anchor = formatDayKeyInTimeZone(date);
  const [y, m] = anchor.split("-").map(Number);
  const startDayKey = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDom = new Date(y, m, 0).getDate();
  const endDayKey = `${y}-${String(m).padStart(2, "0")}-${String(lastDom).padStart(2, "0")}`;
  return { startDayKey, endDayKey };
}
