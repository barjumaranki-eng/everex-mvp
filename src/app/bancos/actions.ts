"use server";

import { Prisma } from "@prisma/client";
import { BankMovementType, BankRowStatus, FiatCurrency } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import {
  canCreateBankMovement,
  canCreateBankOpeningBalance,
  canEditBankOpeningBalance,
  canManageBanks,
} from "@/lib/authz";
import { normalizeMoneyBackend } from "@/lib/format-money";
import { parseOperativeDateTimeFromForm } from "@/lib/operative-datetime";
import { bankMovementOperativeDate } from "@/lib/prisma-operative-fields";

function dec(s: string): Prisma.Decimal {
  const n = normalizeMoneyBackend(s);
  if (n === "" || Number.isNaN(Number(n))) throw new Error("Monto inválido");
  return new Prisma.Decimal(n);
}

export async function createBankAccount(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await getSessionUser();
  if (!canCreateBankMovement(user)) return { error: "No autorizado" };
  const label = String(formData.get("label") ?? "").trim();
  if (!label) return { error: "Etiqueta requerida" };
  const currency = String(formData.get("currency") ?? "GTQ") as FiatCurrency;
  await prisma.bankAccount.create({ data: { label, currency } });
  revalidatePath("/bancos");
  return {};
}

export async function createBankMovement(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await getSessionUser();
  if (!canCreateBankMovement(user)) return { error: "No autorizado" };
  const bankAccountId = String(formData.get("bankAccountId") ?? "").trim();
  if (!bankAccountId) return { error: "Cuenta requerida" };
  const type = String(formData.get("type") ?? "CREDIT") as BankMovementType;
  const currency = String(formData.get("currency") ?? "GTQ") as FiatCurrency;
  const date = parseOperativeDateTimeFromForm(formData);
  const description = String(formData.get("description") ?? "").trim() || "Movimiento";
  const reference = String(formData.get("reference") ?? "").trim() || undefined;
  try {
    const amount = dec(String(formData.get("amount") ?? ""));
    await prisma.bankMovement.create({
      data: {
        bankAccountId,
        ...bankMovementOperativeDate(date),
        description,
        amount,
        type,
        currency,
        reference,
        status: BankRowStatus.UNMATCHED,
        createdByUserId: user!.id,
      },
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error" };
  }
  revalidatePath("/bancos");
  revalidatePath("/dashboard");
  redirect("/bancos");
}

export async function submitToggleBankMatch(formData: FormData) {
  const user = await getSessionUser();
  if (!canManageBanks(user)) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await toggleBankMovementMatched(id);
}

export async function toggleBankMovementMatched(id: string): Promise<{ error?: string }> {
  const user = await getSessionUser();
  if (!canManageBanks(user)) return { error: "No autorizado" };
  const row = await prisma.bankMovement.findUnique({ where: { id } });
  if (!row) return { error: "No encontrado" };
  const next = row.status === BankRowStatus.MATCHED ? BankRowStatus.UNMATCHED : BankRowStatus.MATCHED;
  await prisma.bankMovement.update({
    where: { id },
    data: {
      status: next,
      matchedNote: next === BankRowStatus.MATCHED ? "Marcado cuadrado (manual)" : null,
    },
  });
  revalidatePath("/bancos");
  return {};
}

function fmtAuditVal(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object" && v !== null && "toString" in v) {
    return String((v as { toString: () => string }).toString());
  }
  return String(v);
}

export async function upsertBankOpeningBalance(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await getSessionUser();
  if (!user) return { error: "No autorizado" };

  const bankAccountId = String(formData.get("bankAccountId") ?? "").trim();
  if (!bankAccountId) return { error: "Banco requerido" };

  const existing = await prisma.bankOpeningBalance.findUnique({ where: { bankAccountId } });

  if (!existing) {
    if (!canCreateBankOpeningBalance(user)) return { error: "No autorizado a registrar saldo inicial" };
  } else if (!canEditBankOpeningBalance(user)) {
    return {
      error:
        "El saldo inicial ya está registrado. Solo administración puede corregirlo. Contacte a Ibrahim.",
    };
  }

  let amount: Prisma.Decimal;
  try {
    amount = dec(String(formData.get("amount") ?? ""));
  } catch {
    return { error: "Saldo inicial inválido" };
  }

  const effectiveRaw = String(formData.get("effectiveAt") ?? "").trim();
  if (!effectiveRaw) return { error: "Fecha y hora de corte requeridas" };
  const effectiveAt = new Date(effectiveRaw);
  if (Number.isNaN(effectiveAt.getTime())) return { error: "Fecha inválida" };

  const note = String(formData.get("note") ?? "").trim() || null;

  try {
    if (!existing) {
      const ob = await prisma.bankOpeningBalance.create({
        data: {
          bankAccountId,
          amount,
          effectiveAt,
          note,
          createdByUserId: user.id,
        },
      });
      await prisma.bankOpeningBalanceAudit.create({
        data: {
          openingId: ob.id,
          userId: user.id,
          field: "amount",
          oldValue: null,
          newValue: amount.toString(),
        },
      });
      await prisma.bankOpeningBalanceAudit.create({
        data: {
          openingId: ob.id,
          userId: user.id,
          field: "effectiveAt",
          oldValue: null,
          newValue: effectiveAt.toISOString(),
        },
      });
      if (note) {
        await prisma.bankOpeningBalanceAudit.create({
          data: {
            openingId: ob.id,
            userId: user.id,
            field: "note",
            oldValue: null,
            newValue: note,
          },
        });
      }
    } else {
      const diff: { field: string; oldValue: string | null; newValue: string | null }[] = [];
      const push = (field: string, oldV: unknown, newV: unknown) => {
        const o = fmtAuditVal(oldV);
        const n = fmtAuditVal(newV);
        if (o !== n) diff.push({ field, oldValue: o || null, newValue: n || null });
      };
      push("amount", existing.amount, amount);
      push("effectiveAt", existing.effectiveAt, effectiveAt);
      push("note", existing.note, note);

      await prisma.$transaction(async (tx) => {
        await tx.bankOpeningBalance.update({
          where: { id: existing.id },
          data: {
            amount,
            effectiveAt,
            note,
            updatedByUserId: user.id,
          },
        });
        for (const d of diff) {
          await tx.bankOpeningBalanceAudit.create({
            data: {
              openingId: existing.id,
              userId: user.id,
              field: d.field,
              oldValue: d.oldValue,
              newValue: d.newValue,
            },
          });
        }
      });
    }
  } catch (e) {
    console.error(e);
    return { error: e instanceof Error ? e.message : "Error al guardar" };
  }

  revalidatePath("/bancos/saldos-iniciales");
  revalidatePath("/bancos");
  revalidatePath("/dashboard");
  revalidatePath("/conciliacion-bancaria");
  return {};
}

export async function updateBankReportedBalance(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await getSessionUser();
  if (!canManageBanks(user)) return { error: "No autorizado" };

  const bankAccountId = String(formData.get("bankAccountId") ?? "").trim();
  if (!bankAccountId) return { error: "Cuenta requerida" };

  const raw = String(formData.get("reportedBalance") ?? "").trim();
  try {
    if (raw === "") {
      await prisma.bankAccount.update({
        where: { id: bankAccountId },
        data: { reportedBalance: null, reportedBalanceAt: null },
      });
    } else {
      const amt = dec(raw);
      await prisma.bankAccount.update({
        where: { id: bankAccountId },
        data: { reportedBalance: amt, reportedBalanceAt: new Date() },
      });
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error" };
  }

  revalidatePath("/bancos");
  revalidatePath("/dashboard");
  revalidatePath("/conciliacion-bancaria");
  return {};
}
