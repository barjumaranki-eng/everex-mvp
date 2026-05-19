import { parseDayEndExclusiveLocal, parseDayStartLocal } from "@/lib/operator-statement-dates";

/** Fecha local YYYY-MM-DD a partir de un instante (reloj del servidor). */
export function dayKeyFromDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Combina `operativeDate` (YYYY-MM-DD) + `operativeTime` (HH:mm).
 * Vacío o inválido → fallback. Si falta hora → 00:00:00 local.
 */
export function parseOperativeDateTimeFromForm(
  formData: FormData,
  dateField = "operativeDate",
  timeField = "operativeTime",
  fallback: Date = new Date(),
): Date {
  const dStr = String(formData.get(dateField) ?? "").trim();
  const tStr = String(formData.get(timeField) ?? "").trim();
  if (!dStr) return new Date(fallback.getTime());
  let timePart = "00:00:00";
  if (tStr) {
    const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(tStr.trim());
    if (m) {
      const hh = String(Number(m[1])).padStart(2, "0");
      const mm = String(Number(m[2])).padStart(2, "0");
      const ss = m[3] != null ? String(Number(m[3])).padStart(2, "0") : "00";
      timePart = `${hh}:${mm}:${ss}`;
    }
  }
  const parsed = new Date(`${dStr}T${timePart}`);
  if (Number.isNaN(parsed.getTime())) return new Date(fallback.getTime());
  return parsed;
}

export function formatOperativeDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatOperativeTimeInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Rango [startDay, endDay] inclusive en fechas locales. */
export function operativeDayRangeWhere(startDay: string, endDay: string): { gte: Date; lt: Date } | null {
  const gte = parseDayStartLocal(startDay);
  const lt = parseDayEndExclusiveLocal(endDay);
  if (!gte || !lt) return null;
  return { gte, lt };
}

/** Filtro Prisma por `createdAt` en ventana de día(s) local(es). */
export function prismaWhereCreatedInDayRange(startDay: string, endDay: string) {
  const r = operativeDayRangeWhere(startDay, endDay);
  if (!r) return { id: { in: [] as string[] } };
  return { createdAt: { gte: r.gte, lt: r.lt } };
}

/** Filtro por `date` (movimientos bancarios). */
export function prismaWhereDateInDayRange(startDay: string, endDay: string) {
  const r = operativeDayRangeWhere(startDay, endDay);
  if (!r) return { id: { in: [] as string[] } };
  return { date: { gte: r.gte, lt: r.lt } };
}

/** Filtro por `paymentDate`. */
export function prismaWherePaymentDateInDayRange(startDay: string, endDay: string) {
  const r = operativeDayRangeWhere(startDay, endDay);
  if (!r) return { id: { in: [] as string[] } };
  return { paymentDate: { gte: r.gte, lt: r.lt } };
}

export function toDatetimeLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function prismaWhereCreatedSince(since: Date) {
  return { createdAt: { gte: since } };
}

export function prismaWhereBankDateSince(since: Date) {
  return { date: { gte: since } };
}

export function prismaWherePaymentDateSince(since: Date) {
  return { paymentDate: { gte: since } };
}
