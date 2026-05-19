import { BankMovementType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

function d(x: Prisma.Decimal | null | undefined): number {
  if (x == null) return 0;
  const n = Number(x.toString());
  return Number.isFinite(n) ? n : 0;
}

export type BankBalanceBreakdown = {
  openingAmount: number | null;
  openingEffectiveAt: Date | null;
  creditsToday: number;
  debitsToday: number;
  netSinceOpening: number;
  /** Sin saldo inicial: suma neta de todos los movimientos. Con saldo inicial: saldo inicial + movimientos desde corte. */
  systemBalance: number;
  reportedBalance: number | null;
  difference: number | null;
};

/** Límites del día local para un dayKey YYYY-MM-DD. */
/** Valor para input type="datetime-local" en zona horaria del servidor. */
export function toDatetimeLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function localBoundsForDayKey(dayKey: string): { start: Date; end: Date } {
  const [y, m, d] = dayKey.split("-").map(Number);
  const start = new Date(y, m - 1, d, 0, 0, 0, 0);
  const end = new Date(y, m - 1, d + 1, 0, 0, 0, 0);
  return { start, end };
}

export async function getBankBalanceBreakdown(
  bankAccountId: string,
  dayKey: string,
): Promise<BankBalanceBreakdown> {
  const [account, opening, movements] = await Promise.all([
    prisma.bankAccount.findUnique({
      where: { id: bankAccountId },
      select: { reportedBalance: true },
    }),
    prisma.bankOpeningBalance.findUnique({
      where: { bankAccountId },
    }),
    prisma.bankMovement.findMany({
      where: { bankAccountId },
      orderBy: { date: "asc" },
      select: { date: true, type: true, amount: true, createdAt: true },
    }),
  ]);

  const { start: dayStart, end: dayEnd } = localBoundsForDayKey(dayKey);
  const openTs = opening?.effectiveAt.getTime() ?? null;
  const openingAmount = opening ? d(opening.amount) : null;

  let creditsToday = 0;
  let debitsToday = 0;
  let netSinceOpening = 0;
  let netAll = 0;

  for (const m of movements) {
    const amt = d(m.amount);
    const eventAt = m.createdAt;
    const signed = m.type === BankMovementType.CREDIT ? amt : -amt;
    netAll += signed;
    if (eventAt >= dayStart && eventAt < dayEnd) {
      if (m.type === BankMovementType.CREDIT) creditsToday += amt;
      else debitsToday += amt;
    }
    if (openTs == null || eventAt.getTime() >= openTs) {
      netSinceOpening += signed;
    }
  }

  const systemBalance = openingAmount != null ? openingAmount + netSinceOpening : netAll;
  const reportedBalance = account?.reportedBalance != null ? d(account.reportedBalance) : null;
  const difference = reportedBalance != null ? reportedBalance - systemBalance : null;

  return {
    openingAmount,
    openingEffectiveAt: opening?.effectiveAt ?? null,
    creditsToday,
    debitsToday,
    netSinceOpening,
    systemBalance,
    reportedBalance,
    difference,
  };
}
