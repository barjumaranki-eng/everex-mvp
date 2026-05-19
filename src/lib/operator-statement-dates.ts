import type { Prisma } from "@prisma/client";

/** YYYY-MM-DD → inicio del día local. */
export function parseDayStartLocal(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  return new Date(y, mo - 1, d, 0, 0, 0, 0);
}

/** YYYY-MM-DD → fin del día local (exclusive upper bound for Prisma lt). */
export function parseDayEndExclusiveLocal(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  return new Date(y, mo - 1, d + 1, 0, 0, 0, 0);
}

export function postedAtFilterFromQuery(from?: string | null, to?: string | null): Prisma.DateTimeFilter | undefined {
  const postedAt: Prisma.DateTimeFilter = {};
  if (from) {
    const s = parseDayStartLocal(from);
    if (s) postedAt.gte = s;
  }
  if (to) {
    const e = parseDayEndExclusiveLocal(to);
    if (e) postedAt.lt = e;
  }
  return Object.keys(postedAt).length > 0 ? postedAt : undefined;
}

export function escapeCsvField(s: string): string {
  const t = String(s ?? "").replace(/\r\n/g, "\n");
  if (/[",\n]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}
