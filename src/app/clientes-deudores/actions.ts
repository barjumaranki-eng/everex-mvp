"use server";

import { Prisma } from "@prisma/client";
import { BankMovementType, BankRowStatus, FiatCurrency, FundsChannel } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { canManageReceivablesAndPayables } from "@/lib/authz";
import { normalizeMoneyBackend } from "@/lib/format-money";
import { todayDayKey } from "@/lib/day-key";
import { dayKeyFromDateLocal, parseOperativeDateTimeFromForm } from "@/lib/operative-datetime";
import { bankMovementOperativeDate } from "@/lib/prisma-operative-fields";

function dec(s: string): Prisma.Decimal {
  const n = normalizeMoneyBackend(s);
  if (n === "" || Number.isNaN(Number(n))) throw new Error("Monto inválido");
  return new Prisma.Decimal(n);
}

export async function createReceivable(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await getSessionUser();
  if (!canManageReceivablesAndPayables(user)) return { error: "No autorizado" };

  const clientId = String(formData.get("clientId") ?? "").trim();
  if (!clientId) return { error: "Cliente requerido" };
  const reason = String(formData.get("reason") ?? "").trim() || "Deuda cliente";
  const notes = String(formData.get("notes") ?? "").trim() || undefined;
  const currency = String(formData.get("currency") ?? "GTQ") as FiatCurrency;

  let amount: Prisma.Decimal;
  try {
    amount = dec(String(formData.get("amount") ?? ""));
  } catch {
    return { error: "Monto inválido" };
  }

  const dayKey = todayDayKey();
  await prisma.clientReceivable.create({
    data: {
      clientId,
      originalAmount: amount,
      balance: amount,
      currency,
      reason,
      notes,
      dayKey,
      createdByUserId: user!.id,
    },
  });
  revalidatePath("/clientes-deudores");
  revalidatePath("/dashboard");
  revalidatePath("/estado-financiero");
  redirect("/clientes-deudores");
}

export async function addReceivablePayment(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await getSessionUser();
  if (!canManageReceivablesAndPayables(user)) return { error: "No autorizado" };

  const receivableId = String(formData.get("receivableId") ?? "").trim();
  if (!receivableId) return { error: "Cuenta inválida" };

  const channel = String(formData.get("channel") ?? "") as FundsChannel;
  const bankAccountId = String(formData.get("bankAccountId") ?? "").trim() || undefined;
  if (channel === FundsChannel.BANK && !bankAccountId) return { error: "Seleccione banco" };

  const payAmt = dec(String(formData.get("amount") ?? ""));
  const paymentInstant = parseOperativeDateTimeFromForm(formData);
  const paymentDate = paymentInstant;
  const reference = String(formData.get("reference") ?? "").trim() || undefined;
  const proofImage = String(formData.get("proofImage") ?? "").trim() || undefined;
  const currency = String(formData.get("currency") ?? "GTQ") as FiatCurrency;
  const dayKey = dayKeyFromDateLocal(paymentInstant);

  try {
    await prisma.$transaction(async (tx) => {
      const recv = await tx.clientReceivable.findUnique({ where: { id: receivableId } });
      if (!recv || !recv.active) throw new Error("Cuenta no encontrada");
      if (Number(recv.balance.toString()) + 1e-9 < Number(payAmt.toString())) {
        throw new Error("Pago mayor al saldo");
      }

      let bankMovementId: string | undefined;
      if (channel === FundsChannel.BANK && bankAccountId) {
        const mov = await tx.bankMovement.create({
          data: {
            bankAccountId,
            ...bankMovementOperativeDate(paymentDate),
            description: `Recuperación cuenta por cobrar`,
            amount: payAmt,
            type: BankMovementType.CREDIT,
            currency,
            reference,
            status: BankRowStatus.UNMATCHED,
            createdByUserId: user!.id,
          },
        });
        bankMovementId = mov.id;
      }

      await tx.clientReceivablePayment.create({
        data: {
          receivableId,
          amount: payAmt,
          currency,
          paymentDate,
          channel,
          bankAccountId: channel === FundsChannel.BANK ? bankAccountId : null,
          reference,
          proofImage,
          dayKey,
          bankMovementId: bankMovementId ?? null,
          createdByUserId: user!.id,
        },
      });

      const newBal = new Prisma.Decimal(recv.balance.toString()).minus(payAmt);
      const clamped = newBal.lessThan(0) ? new Prisma.Decimal(0) : newBal;
      await tx.clientReceivable.update({
        where: { id: receivableId },
        data: {
          balance: clamped,
          active: clamped.greaterThan(0),
        },
      });
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error" };
  }

  revalidatePath("/clientes-deudores");
  revalidatePath("/dashboard");
  revalidatePath("/estado-financiero");
  revalidatePath("/bancos");
  redirect(`/clientes-deudores/${receivableId}`);
}
