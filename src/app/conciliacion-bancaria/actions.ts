"use server";

import { Prisma } from "@prisma/client";
import {
  BankMovementType,
  BankRowStatus,
  ExpenseCategory,
  FiatCurrency,
  FundsChannel,
  StatementLineStatus,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import {
  canImportBankStatements,
  canManageBanks,
  canManageExpenses,
} from "@/lib/authz";
import { parseBankStatementCsv, parseBankStatementXlsx } from "@/lib/parse-bank-statement";
import { todayDayKey } from "@/lib/day-key";

async function runSuggestions(bankAccountId: string) {
  const lines = await prisma.bankStatementLine.findMany({
    where: { bankAccountId, status: StatementLineStatus.UNMATCHED },
  });
  const movements = await prisma.bankMovement.findMany({
    where: {
      bankAccountId,
      status: { in: [BankRowStatus.UNMATCHED, BankRowStatus.POSSIBLE_MATCH] },
    },
  });

  for (const line of lines) {
    const c = line.credit && Number(line.credit.toString()) > 0;
    const amtStr = c ? line.credit!.toString() : line.debit!.toString();
    const amt = new Prisma.Decimal(amtStr);
    const typ = c ? BankMovementType.CREDIT : BankMovementType.DEBIT;
    const start = new Date(line.rowDate);
    start.setDate(start.getDate() - 2);
    const end = new Date(line.rowDate);
    end.setDate(end.getDate() + 2);

    const cands = movements.filter(
      (m) =>
        m.type === typ &&
        m.amount.equals(amt) &&
        m.date.getTime() >= start.getTime() &&
        m.date.getTime() <= end.getTime(),
    );
    if (cands.length === 1) {
      await prisma.bankStatementLine.update({
        where: { id: line.id },
        data: {
          status: StatementLineStatus.POSSIBLE_MATCH,
          suggestedMovementId: cands[0].id,
        },
      });
      await prisma.bankMovement.update({
        where: { id: cands[0].id },
        data: { status: BankRowStatus.POSSIBLE_MATCH },
      });
    }
  }
}

export async function importBankStatement(
  _prev: { error?: string; imported?: number } | null,
  formData: FormData,
): Promise<{ error?: string; imported?: number }> {
  const user = await getSessionUser();
  if (!canImportBankStatements(user)) return { error: "No autorizado" };

  const bankAccountId = String(formData.get("bankAccountId") ?? "").trim();
  if (!bankAccountId) return { error: "Cuenta requerida" };
  const label = String(formData.get("label") ?? "").trim() || `Import ${todayDayKey()}`;
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Archivo requerido" };

  const buf = Buffer.from(await file.arrayBuffer());
  const name = file.name.toLowerCase();
  let rows;
  try {
    rows = name.endsWith(".csv") || name.endsWith(".txt") ? parseBankStatementCsv(buf.toString("utf8")) : parseBankStatementXlsx(buf);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo leer el archivo" };
  }
  if (!rows.length) return { error: "Sin filas válidas (revise columnas fecha, crédito/débito)" };

  try {
    const batch = await prisma.bankImportBatch.create({
      data: {
        bankAccountId,
        label,
        createdByUserId: user!.id,
      },
    });
    await prisma.bankStatementLine.createMany({
      data: rows.map((r) => ({
        bankAccountId,
        batchId: batch.id,
        rowDate: r.rowDate,
        description: r.description,
        reference: r.reference ?? null,
        credit: r.credit ?? null,
        debit: r.debit ?? null,
        balanceAfter: r.balanceAfter ?? null,
        status: StatementLineStatus.UNMATCHED,
      })),
    });
    await runSuggestions(bankAccountId);
  } catch (e) {
    console.error(e);
    return { error: e instanceof Error ? e.message : "Error al importar" };
  }

  revalidatePath("/conciliacion-bancaria");
  revalidatePath("/bancos");
  return { imported: rows.length };
}

export async function linkLineToMovement(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!canImportBankStatements(user)) return;

  const lineId = String(formData.get("lineId") ?? "").trim();
  const movementId = String(formData.get("movementId") ?? "").trim();
  if (!lineId || !movementId) return;

  const [line, mov] = await Promise.all([
    prisma.bankStatementLine.findUnique({ where: { id: lineId } }),
    prisma.bankMovement.findUnique({ where: { id: movementId } }),
  ]);
  if (!line || !mov || line.bankAccountId !== mov.bankAccountId) return;

  await prisma.$transaction([
    prisma.bankStatementLine.update({
      where: { id: lineId },
      data: {
        matchedBankMovementId: movementId,
        status: StatementLineStatus.MATCHED,
        suggestedMovementId: null,
      },
    }),
    prisma.bankMovement.update({
      where: { id: movementId },
      data: { status: BankRowStatus.MATCHED, matchedNote: "Conciliado con extracto" },
    }),
  ]);
  revalidatePath("/conciliacion-bancaria");
}

export async function unlinkLine(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!canImportBankStatements(user)) return;
  const lineId = String(formData.get("lineId") ?? "").trim();
  if (!lineId) return;
  const line = await prisma.bankStatementLine.findUnique({ where: { id: lineId } });
  if (!line?.matchedBankMovementId) return;
  const movId = line.matchedBankMovementId;
  await prisma.$transaction([
    prisma.bankStatementLine.update({
      where: { id: lineId },
      data: {
        matchedBankMovementId: null,
        status: StatementLineStatus.UNMATCHED,
        suggestedMovementId: null,
      },
    }),
    prisma.bankMovement.update({
      where: { id: movId },
      data: { status: BankRowStatus.UNMATCHED, matchedNote: null },
    }),
  ]);
  revalidatePath("/conciliacion-bancaria");
}

export async function markLineDifference(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!canImportBankStatements(user)) return;
  const lineId = String(formData.get("lineId") ?? "").trim();
  if (!lineId) return;
  await prisma.bankStatementLine.update({
    where: { id: lineId },
    data: { status: StatementLineStatus.DIFFERENCE, suggestedMovementId: null },
  });
  revalidatePath("/conciliacion-bancaria");
}

export async function applySuggestedMatch(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!canImportBankStatements(user)) return;
  const lineId = String(formData.get("lineId") ?? "").trim();
  const movementId = String(formData.get("movementId") ?? "").trim();
  if (!lineId || !movementId) return;
  const fd = new FormData();
  fd.set("lineId", lineId);
  fd.set("movementId", movementId);
  await linkLineToMovement(fd);
}

export async function createExpenseFromStatementLine(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!canManageExpenses(user)) return;

  const lineId = String(formData.get("lineId") ?? "").trim();
  if (!lineId) return;
  const line = await prisma.bankStatementLine.findUnique({ where: { id: lineId } });
  if (!line || !line.debit || Number(line.debit.toString()) <= 0) return;

  const dayKey = todayDayKey();
  const amount = line.debit;
  const date = line.rowDate;

  try {
    await prisma.$transaction(async (tx) => {
      const mov = await tx.bankMovement.create({
        data: {
          bankAccountId: line.bankAccountId,
          date,
          description: `Gasto (desde extracto): ${line.description}`,
          amount,
          type: BankMovementType.DEBIT,
          currency: FiatCurrency.GTQ,
          reference: line.reference,
          status: BankRowStatus.MATCHED,
          matchedNote: "Creado desde extracto",
          createdByUserId: user!.id,
        },
      });
      await tx.expense.create({
        data: {
          date,
          category: ExpenseCategory.OTROS,
          amount,
          currency: FiatCurrency.GTQ,
          channel: FundsChannel.BANK,
          bankAccountId: line.bankAccountId,
          description: line.description.slice(0, 200),
          dayKey,
          bankMovementId: mov.id,
          createdByUserId: user!.id,
        },
      });
      await tx.bankStatementLine.update({
        where: { id: lineId },
        data: {
          matchedBankMovementId: mov.id,
          status: StatementLineStatus.MATCHED,
        },
      });
    });
  } catch (e) {
    console.error(e);
    return;
  }
  revalidatePath("/conciliacion-bancaria");
  revalidatePath("/gastos");
}

export async function createIncomeFromStatementLine(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!canManageBanks(user)) return;

  const lineId = String(formData.get("lineId") ?? "").trim();
  if (!lineId) return;
  const line = await prisma.bankStatementLine.findUnique({ where: { id: lineId } });
  if (!line || !line.credit || Number(line.credit.toString()) <= 0) return;

  const amount = line.credit;
  const date = line.rowDate;

  try {
    await prisma.$transaction(async (tx) => {
      const mov = await tx.bankMovement.create({
        data: {
          bankAccountId: line.bankAccountId,
          date,
          description: `Ingreso ajuste extracto: ${line.description}`,
          amount,
          type: BankMovementType.CREDIT,
          currency: FiatCurrency.GTQ,
          reference: line.reference,
          status: BankRowStatus.MATCHED,
          matchedNote: "Crédito desde extracto",
          createdByUserId: user!.id,
        },
      });
      await tx.bankStatementLine.update({
        where: { id: lineId },
        data: {
          matchedBankMovementId: mov.id,
          status: StatementLineStatus.MATCHED,
        },
      });
    });
  } catch (e) {
    console.error(e);
    return;
  }
  revalidatePath("/conciliacion-bancaria");
  revalidatePath("/bancos");
}

export async function addManualStatementLine(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!canImportBankStatements(user)) return;
  const bankAccountId = String(formData.get("bankAccountId") ?? "").trim();
  const dateStr = String(formData.get("rowDate") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || "Manual";
  const reference = String(formData.get("reference") ?? "").trim() || undefined;
  const creditRaw = String(formData.get("credit") ?? "").trim();
  const debitRaw = String(formData.get("debit") ?? "").trim();
  if (!bankAccountId || !dateStr) return;
  const rowDate = new Date(dateStr);
  const credit = creditRaw ? new Prisma.Decimal(creditRaw.replace(/,/g, "")) : undefined;
  const debit = debitRaw ? new Prisma.Decimal(debitRaw.replace(/,/g, "")) : undefined;
  if (!credit && !debit) return;

  await prisma.bankStatementLine.create({
    data: {
      bankAccountId,
      rowDate,
      description,
      reference,
      credit: credit ?? null,
      debit: debit ?? null,
      status: StatementLineStatus.UNMATCHED,
    },
  });
  await runSuggestions(bankAccountId);
  revalidatePath("/conciliacion-bancaria");
}
