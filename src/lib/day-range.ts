import { getMonthBoundsDayKeys } from "@/lib/date-bounds";

/** dayKey YYYY-MM-DD comparación lexicográfica es válida. */
export function monthBoundsDayKeys(d = new Date()): { start: string; end: string } {
  const { startDayKey, endDayKey } = getMonthBoundsDayKeys(d);
  return { start: startDayKey, end: endDayKey };
}

export function weekBoundsDayKeys(d = new Date()): { start: string; end: string } {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(d);
  mon.setDate(diff);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const fmt = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  return { start: fmt(mon), end: fmt(sun) };
}

export function parseRangeFromSearch(
  sp: Record<string, string | string[] | undefined>,
): { mode: "day" | "week" | "month" | "custom"; start: string; end: string } {
  const modeRaw = typeof sp.range === "string" ? sp.range : "month";
  const mode =
    modeRaw === "day" || modeRaw === "week" || modeRaw === "month" || modeRaw === "custom" ? modeRaw : "month";
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  if (mode === "day") {
    const d = typeof sp.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? sp.day : todayKey;
    return { mode, start: d, end: d };
  }
  if (mode === "week") {
    const w = weekBoundsDayKeys(today);
    return { mode, start: w.start, end: w.end };
  }
  if (mode === "month") {
    const m = monthBoundsDayKeys(today);
    return { mode, start: m.start, end: m.end };
  }
  const from = typeof sp.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : monthBoundsDayKeys(today).start;
  const to = typeof sp.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : monthBoundsDayKeys(today).end;
  return { mode: "custom", start: from, end: to };
}
