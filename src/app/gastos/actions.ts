"use server";

import { Prisma } from "@prisma/client";
import {
  BankMovementType,
  BankRowStatus,
  ExpenseCategory,
  FiatCurrency,
  FundsChannel,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { canCreateExpenses } from "@/lib/authz";
import { dayKeyFromDateLocal, parseOperativeDateTimeFromForm } from "@/lib/operative-datetime";
import { bankMovementOperativeDate } from "@/lib/prisma-operative-fields";
import { normalizeMoneyBackend } from "@/lib/format-money";

function dec(s: string): Prisma.Decimal {
  const n = normalizeMoneyBackend(s);
  if (n === "" || Number.isNaN(Number(n))) throw new Error("Monto inválido");
  return new Prisma.Decimal(n);
}

export async function createExpense(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await getSessionUser();
  if (!canCreateExpenses(user)) return { error: "No autorizado" };

  const category = String(formData.get("category") ?? "") as ExpenseCategory;
  if (!Object.values(ExpenseCategory).includes(category)) return { error: "Categoría inválida" };

  const channel = String(formData.get("channel") ?? "") as FundsChannel;
  if (!Object.values(FundsChannel).includes(channel)) return { error: "Origen inválido" };

  const currency = String(formData.get("currency") ?? "GTQ") as FiatCurrency;
  const expenseDate = parseOperativeDateTimeFromForm(formData);
  const date = expenseDate;
  const description = String(formData.get("description") ?? "").trim() || "Gasto";
  const proofImage = String(formData.get("proofImage") ?? "").trim() || undefined;
  const bankAccountId = String(formData.get("bankAccountId") ?? "").trim() || undefined;

  if (channel === FundsChannel.BANK && !bankAccountId) {
    return { error: "Seleccione banco si el gasto sale de cuenta Everex" };
  }

  let amount: Prisma.Decimal;
  try {
    amount = dec(String(formData.get("amount") ?? ""));
  } catch {
    return { error: "Monto inválido" };
  }

  const dayKey = dayKeyFromDateLocal(date);

  try {
    await prisma.$transaction(async (tx) => {
      let bankMovementId: string | undefined;
      if (channel === FundsChannel.BANK && bankAccountId) {
        const mov = await tx.bankMovement.create({
          data: {
            bankAccountId,
            ...bankMovementOperativeDate(date),
            description: `Gasto: ${description}`,
            amount,
            type: BankMovementType.DEBIT,
            currency,
            reference: null,
            status: BankRowStatus.UNMATCHED,
            createdByUserId: user!.id,
          },
        });
        bankMovementId = mov.id;
      }

      await tx.expense.create({
        data: {
          date,
          category,
          amount,
          currency,
          channel,
          bankAccountId: channel === FundsChannel.BANK ? bankAccountId : null,
          description,
          proofImage,
          dayKey,
          bankMovementId: bankMovementId ?? null,
          createdByUserId: user!.id,
        },
      });
    });
  } catch (e) {
    console.error(e);
    return { error: e instanceof Error ? e.message : "No se pudo guardar" };
  }

  revalidatePath("/gastos");
  revalidatePath("/dashboard");
  revalidatePath("/estado-financiero");
  revalidatePath("/bancos");
  revalidatePath("/conciliacion-bancaria");
  redirect("/gastos");
}
