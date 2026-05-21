import { OtcSide as OtcSideEnum, Prisma } from "@prisma/client";
import type { OtcSide } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const EPS = new Prisma.Decimal("0.01");

export type OtcBalanceDelta = {
  saldoGTQ: Prisma.Decimal;
  saldoUSDT: Prisma.Decimal;
};

export type OtcBalanceInput = {
  side: OtcSide;
  totalFiat: Prisma.Decimal;
  usdtAmount: Prisma.Decimal;
  fiatRecibidoReal: Prisma.Decimal | null;
  usdtEntregadoReal: Prisma.Decimal | null;
};

/**
 * Ajuste al estado de cuenta por diferencia pactado vs ejecutado.
 * saldoGTQ: + = cliente nos debe GTQ; saldoUSDT: + = cliente nos debe USDT.
 */
export function computeOtcBalanceDelta(input: OtcBalanceInput): OtcBalanceDelta {
  const fiatReal = input.fiatRecibidoReal ?? input.totalFiat;
  const usdtReal = input.usdtEntregadoReal ?? input.usdtAmount;

  if (input.side === OtcSideEnum.CLIENT_BUYS_USDT) {
    return {
      saldoGTQ: input.totalFiat.sub(fiatReal),
      saldoUSDT: usdtReal.sub(input.usdtAmount),
    };
  }

  return {
    saldoGTQ: fiatReal.sub(input.totalFiat),
    saldoUSDT: input.usdtAmount.sub(usdtReal),
  };
}

export function isDescuadradaDelta(delta: OtcBalanceDelta): boolean {
  return delta.saldoGTQ.abs().gt(EPS) || delta.saldoUSDT.abs().gt(EPS);
}

export async function applyClientBalanceDeltaInTx(
  tx: Prisma.TransactionClient,
  clientId: string,
  delta: OtcBalanceDelta,
): Promise<void> {
  if (!isDescuadradaDelta(delta)) return;

  await tx.clientBalance.upsert({
    where: { clientId },
    create: {
      clientId,
      saldoGTQ: delta.saldoGTQ,
      saldoUSDT: delta.saldoUSDT,
    },
    update: {
      saldoGTQ: { increment: delta.saldoGTQ },
      saldoUSDT: { increment: delta.saldoUSDT },
    },
  });
}

export async function revertClientBalanceDeltaInTx(
  tx: Prisma.TransactionClient,
  clientId: string,
  delta: OtcBalanceDelta,
): Promise<void> {
  if (!isDescuadradaDelta(delta)) return;

  const row = await tx.clientBalance.findUnique({ where: { clientId } });
  if (!row) return;

  await tx.clientBalance.update({
    where: { clientId },
    data: {
      saldoGTQ: row.saldoGTQ.sub(delta.saldoGTQ),
      saldoUSDT: row.saldoUSDT.sub(delta.saldoUSDT),
    },
  });
}

export async function getClientBalance(clientId: string) {
  return prisma.clientBalance.findUnique({ where: { clientId } });
}
