import type { DistributionDestination, FiatCurrency } from "@prisma/client";
import {
  BankMovementType,
  BankRowStatus,
  Prisma,
  StatementLineStatus,
  StmtEntityKind,
  StmtEntryKind,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createStatementEntryCompat } from "@/lib/statement-entry-create-compat";

/** Referencia única por línea de reparto (idempotencia). */
export const OTC_ALLOC_LEDGER_REF_TYPE = "OtcAllocation";

const EPS = new Prisma.Decimal("0.01");

function decClose(a: Prisma.Decimal, b: Prisma.Decimal): boolean {
  return a.sub(b).abs().lte(EPS);
}

/** Referencia humana + llave opId|distributionId (máx. 200). */
export function buildOtcLedgerReference(operationId: string, allocationId: string, clientName: string): string {
  const key = `${operationId}|${allocationId}`;
  const extra = clientName.trim() ? `${clientName.trim()} · ` : "";
  const s = `${extra}${key}`;
  return s.length > 200 ? s.slice(0, 197) + "…" : s;
}

type Tx = Prisma.TransactionClient;

async function unlinkStmtLinesFromBankMovements(tx: Tx, where: Prisma.BankMovementWhereInput): Promise<void> {
  const rows = await tx.bankMovement.findMany({ where, select: { id: true } });
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return;
  await tx.bankStatementLine.updateMany({
    where: { matchedBankMovementId: { in: ids } },
    data: { matchedBankMovementId: null, status: StatementLineStatus.UNMATCHED },
  });
}

type OpLedgerCtx = {
  id: string;
  ref: string;
  clientId: string;
  dayKey: string;
  createdAt: Date;
  /** Fecha/hora contable para reparto banco y asientos (usa `createdAt` / `postedAt` en DB). */
  ledgerAt: Date;
};

/**
 * Crea o omite (si ya existe) el movimiento de libro para una fila OtcAllocation.
 * OPERADOR: StatementEntry PAGO_CLIENTE con monto negativo en GTQ.
 * BANCO: BankMovement CREDIT vinculado a sourceOtcAllocationId.
 */
export async function applyOtcAllocationLedgerInTx(
  tx: Tx,
  alloc: {
    id: string;
    destination: DistributionDestination;
    operatorId: string | null;
    bankAccountId: string | null;
    amount: Prisma.Decimal;
    currency: FiatCurrency;
    notes?: string | null;
  },
  op: OpLedgerCtx,
  clientName: string,
  userId: string,
): Promise<void> {
  if (alloc.destination === "OPERATOR" && alloc.operatorId) {
    const exists = await tx.statementEntry.findFirst({
      where: { refType: OTC_ALLOC_LEDGER_REF_TYPE, refId: alloc.id },
    });
    if (exists) return;

    if (alloc.currency === "USDT") {
      const ok = await createStatementEntryCompat(
        tx,
        {
          entityKind: StmtEntityKind.OPERATOR,
          operatorId: alloc.operatorId,
          clientId: op.clientId,
          providerId: null,
          amountGtq: new Prisma.Decimal(0),
          kind: StmtEntryKind.PAGO_OPERADOR_USDT,
          label: [
            "Pago operador USDT (OTC)",
            clientName.trim() || undefined,
            alloc.notes?.trim() || undefined,
          ]
            .filter(Boolean)
            .join(" · "),
          refType: OTC_ALLOC_LEDGER_REF_TYPE,
          refId: alloc.id,
          dayKey: op.dayKey,
          createdByUserId: userId,
        },
        op.ledgerAt,
      );
      if (!ok) throw new Error("No se pudo crear el asiento de libro (pago operador USDT).");
      return;
    }

    if (alloc.currency !== "GTQ") {
      throw new Error("Reparto a operador en GTQ debe usar moneda GTQ.");
    }

    const ok = await createStatementEntryCompat(
      tx,
      {
        entityKind: StmtEntityKind.OPERATOR,
        operatorId: alloc.operatorId,
        clientId: op.clientId,
        providerId: null,
        amountGtq: alloc.amount.mul(new Prisma.Decimal(-1)),
        kind: StmtEntryKind.PAGO_CLIENTE,
        label: "Pago cliente aplicado operador",
        refType: OTC_ALLOC_LEDGER_REF_TYPE,
        refId: alloc.id,
        dayKey: op.dayKey,
        createdByUserId: userId,
      },
      op.ledgerAt,
    );
    if (!ok) throw new Error("No se pudo crear el asiento de libro (reparto operador GTQ).");
    return;
  }

  if (alloc.destination === "EVEREX_BANK" && alloc.bankAccountId) {
    if (alloc.currency !== "GTQ") {
      throw new Error("Reparto a banco solo en GTQ.");
    }
    const exists = await tx.bankMovement.findFirst({
      where: { sourceOtcAllocationId: alloc.id },
    });
    if (exists) return;

    await tx.bankMovement.create({
      data: {
        bankAccountId: alloc.bankAccountId,
        date: op.ledgerAt,
        description: "Depósito cliente OTC",
        amount: alloc.amount,
        type: BankMovementType.CREDIT,
        currency: alloc.currency,
        reference: buildOtcLedgerReference(op.id, alloc.id, clientName),
        status: BankRowStatus.UNMATCHED,
        sourceOtcId: op.id,
        sourceOtcAllocationId: alloc.id,
        createdByUserId: userId,
      },
    });
  }
}

export type BackfillOtcLedgerResult = {
  createdOperatorEntries: number;
  createdBankMovements: number;
  repairedLegacyOperator: number;
  linkedLegacyBank: number;
  skipped: number;
};

/**
 * Idempotente: enlaza repartos existentes sin duplicar.
 * - Repara asientos viejos OTC_ALLOCATION positivos (ref OtcOperation) → PAGO_CLIENTE negativo (ref OtcAllocation).
 * - Enlaza movimientos bancarios viejos sin sourceOtcAllocationId cuando cuadran monto/cuenta/op.
 */
export async function backfillOtcAllocationLedger(): Promise<BackfillOtcLedgerResult> {
  const result: BackfillOtcLedgerResult = {
    createdOperatorEntries: 0,
    createdBankMovements: 0,
    repairedLegacyOperator: 0,
    linkedLegacyBank: 0,
    skipped: 0,
  };

  const allocations = await prisma.otcAllocation.findMany({
    include: { operation: { include: { client: true } } },
    orderBy: { createdAt: "asc" },
  });

  const usedStmtIds = new Set<string>();
  const usedBankIds = new Set<string>();

  const fallbackUser = await prisma.user.findFirst({
    where: { active: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  const fallbackUserId = fallbackUser?.id;
  if (!fallbackUserId) {
    return result;
  }

  for (const alloc of allocations) {
    const op = alloc.operation;
    const clientName = op.client.name;
    const actorId = op.createdByUserId ?? fallbackUserId;
    const opLedgerAt = op.createdAt;

    if (
      alloc.destination === "OPERATOR" &&
      alloc.operatorId &&
      alloc.currency === "GTQ"
    ) {
      const has = await prisma.statementEntry.findFirst({
        where: { refType: OTC_ALLOC_LEDGER_REF_TYPE, refId: alloc.id },
      });
      if (has) {
        result.skipped++;
        continue;
      }

      const legacyCandidates = await prisma.statementEntry.findMany({
        where: {
          entityKind: StmtEntityKind.OPERATOR,
          operatorId: alloc.operatorId,
          refType: "OtcOperation",
          refId: op.id,
          kind: StmtEntryKind.OTC_ALLOCATION,
        },
      });

      const legacy = legacyCandidates.find(
        (c) =>
          !usedStmtIds.has(c.id) &&
          Number(c.amountGtq.toString()) > 0 &&
          decClose(c.amountGtq, alloc.amount),
      );

      if (legacy) {
        usedStmtIds.add(legacy.id);
        await prisma.statementEntry.update({
          where: { id: legacy.id },
          data: {
            amountGtq: alloc.amount.mul(new Prisma.Decimal(-1)),
            kind: StmtEntryKind.PAGO_CLIENTE,
            label: "Pago cliente aplicado operador",
            refType: OTC_ALLOC_LEDGER_REF_TYPE,
            refId: alloc.id,
            clientId: op.clientId,
          },
        });
        result.repairedLegacyOperator++;
        continue;
      }

      const ok = await createStatementEntryCompat(
        prisma,
        {
          entityKind: StmtEntityKind.OPERATOR,
          operatorId: alloc.operatorId,
          clientId: op.clientId,
          providerId: null,
          amountGtq: alloc.amount.mul(new Prisma.Decimal(-1)),
          kind: StmtEntryKind.PAGO_CLIENTE,
          label: "Pago cliente aplicado operador",
          refType: OTC_ALLOC_LEDGER_REF_TYPE,
          refId: alloc.id,
          dayKey: op.dayKey,
          createdByUserId: actorId,
        },
        opLedgerAt,
      );
      if (ok) result.createdOperatorEntries++;
      else result.skipped++;
      continue;
    }

    if (alloc.destination === "EVEREX_BANK" && alloc.bankAccountId && alloc.currency === "GTQ") {
      const has = await prisma.bankMovement.findFirst({
        where: { sourceOtcAllocationId: alloc.id },
      });
      if (has) {
        result.skipped++;
        continue;
      }

      const legacyCandidates = await prisma.bankMovement.findMany({
        where: {
          sourceOtcId: op.id,
          bankAccountId: alloc.bankAccountId,
          type: BankMovementType.CREDIT,
          sourceOtcAllocationId: null,
        },
      });

      const legacyBank = legacyCandidates.find(
        (b) => !usedBankIds.has(b.id) && decClose(b.amount, alloc.amount),
      );

      if (legacyBank) {
        usedBankIds.add(legacyBank.id);
        await prisma.bankMovement.update({
          where: { id: legacyBank.id },
          data: {
            sourceOtcAllocationId: alloc.id,
            description: "Depósito cliente OTC",
            reference: buildOtcLedgerReference(op.id, alloc.id, clientName),
          },
        });
        result.linkedLegacyBank++;
        continue;
      }

      await prisma.bankMovement.create({
        data: {
          bankAccountId: alloc.bankAccountId,
          date: opLedgerAt,
          description: "Depósito cliente OTC",
          amount: alloc.amount,
          type: BankMovementType.CREDIT,
          currency: "GTQ",
          reference: buildOtcLedgerReference(op.id, alloc.id, clientName),
          status: BankRowStatus.UNMATCHED,
          sourceOtcId: op.id,
          sourceOtcAllocationId: alloc.id,
          createdByUserId: actorId,
        },
      });
      result.createdBankMovements++;
    }
  }

  return result;
}

/** Alias pedido para backfill: sincroniza distribuciones ya guardadas sin movimiento. */
export const syncExistingDistributions = backfillOtcAllocationLedger;

export type RevertOtcLedgerOptions = {
  /** Movimientos banco viejos con sourceOtcId pero sin sourceOtcAllocationId (pre-enlace). */
  legacyOrphanBankMovements?: boolean;
  /** Asientos operador viejos con refType OtcOperation (pre-reparto por fila). */
  legacyOperationRefStatementEntries?: boolean;
};

/**
 * Elimina movimientos de libro generados por repartos de una operación OTC.
 * No borra la operación ni las filas OtcAllocation.
 *
 * Para borrado completo de operación: pasar todos los allocationIds y ambas flags legacy en true.
 */
export async function revertOtcOperationLedgerInTx(
  tx: Tx,
  operationId: string,
  allocationIds: string[],
  options?: RevertOtcLedgerOptions,
): Promise<void> {
  if (allocationIds.length > 0) {
    await tx.statementEntry.deleteMany({
      where: { refType: OTC_ALLOC_LEDGER_REF_TYPE, refId: { in: allocationIds } },
    });
    await unlinkStmtLinesFromBankMovements(tx, { sourceOtcAllocationId: { in: allocationIds } });
    await tx.bankMovement.deleteMany({
      where: { sourceOtcAllocationId: { in: allocationIds } },
    });
  }

  if (options?.legacyOrphanBankMovements) {
    await unlinkStmtLinesFromBankMovements(tx, { sourceOtcId: operationId, sourceOtcAllocationId: null });
    await tx.bankMovement.deleteMany({
      where: { sourceOtcId: operationId, sourceOtcAllocationId: null },
    });
  }

  if (options?.legacyOperationRefStatementEntries) {
    await tx.statementEntry.deleteMany({
      where: {
        refType: "OtcOperation",
        refId: operationId,
        kind: {
          in: [StmtEntryKind.OTC_ALLOCATION, StmtEntryKind.PAGO_CLIENTE, StmtEntryKind.PAGO_OPERADOR_USDT],
        },
      },
    });
  }
}
