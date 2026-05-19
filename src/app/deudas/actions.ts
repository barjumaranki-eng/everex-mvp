"use server";

import { Prisma } from "@prisma/client";
import {
  BankMovementType,
  BankRowStatus,
  FiatCurrency,
  FundsChannel,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { canManageReceivablesAndPayables } from "@/lib/authz";
import { resolvePayableCreditorFromForm, resolvePayableDisplayLabel } from "@/lib/payable-creditor";
import { normalizeMoneyBackend } from "@/lib/format-money";
import { todayDayKey } from "@/lib/day-key";
import { dayKeyFromDateLocal, parseOperativeDateTimeFromForm } from "@/lib/operative-datetime";
import { bankMovementOperativeDate } from "@/lib/prisma-operative-fields";

function dec(s: string): Prisma.Decimal {
  const n = normalizeMoneyBackend(s);
  if (n === "" || Number.isNaN(Number(n))) throw new Error("Monto inválido");
  return new Prisma.Decimal(n);
}

const entityLoaders = {
  clientName: async (id: string) => {
    const r = await prisma.client.findUnique({ where: { id }, select: { name: true } });
    return r?.name ?? null;
  },
  operatorName: async (id: string) => {
    const r = await prisma.operator.findUnique({ where: { id }, select: { name: true } });
    return r?.name ?? null;
  },
  providerName: async (id: string) => {
    const r = await prisma.mexicoProvider.findUnique({ where: { id }, select: { name: true } });
    return r?.name ?? null;
  },
};

export async function createPayable(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await getSessionUser();
  if (!canManageReceivablesAndPayables(user)) return { error: "No autorizado" };

  const resolved = await resolvePayableCreditorFromForm(formData, entityLoaders);
  if (!resolved.ok) return { error: resolved.error };

  const reason = String(formData.get("reason") ?? "").trim() || "Deuda Everex";
  const notes = String(formData.get("notes") ?? "").trim() || undefined;
  const currency = String(formData.get("currency") ?? "GTQ") as FiatCurrency;
  const amount = dec(String(formData.get("amount") ?? ""));
  const dayKey = todayDayKey();

  await prisma.everexPayable.create({
    data: {
      ...resolved.data,
      originalAmount: amount,
      balance: amount,
      currency,
      reason,
      notes,
      dayKey,
      createdByUserId: user!.id,
    },
  });
  revalidatePath("/deudas");
  revalidatePath("/dashboard");
  revalidatePath("/estado-financiero");
  redirect("/deudas");
}

export async function addPayablePayment(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await getSessionUser();
  if (!canManageReceivablesAndPayables(user)) return { error: "No autorizado" };

  const payableId = String(formData.get("payableId") ?? "").trim();
  if (!payableId) return { error: "Deuda inválida" };

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
      const pay = await tx.everexPayable.findUnique({
        where: { id: payableId },
        include: { client: true, operator: true, provider: true },
      });
      if (!pay || !pay.active) throw new Error("Deuda no encontrada");
      if (new Prisma.Decimal(pay.balance.toString()).lessThan(payAmt)) {
        throw new Error("Pago mayor al saldo");
      }

      const label = resolvePayableDisplayLabel(pay);

      let bankMovementId: string | undefined;
      if (channel === FundsChannel.BANK && bankAccountId) {
        const mov = await tx.bankMovement.create({
          data: {
            bankAccountId,
            ...bankMovementOperativeDate(paymentDate),
            description: `Pago deuda: ${label}`,
            amount: payAmt,
            type: BankMovementType.DEBIT,
            currency,
            reference,
            status: BankRowStatus.UNMATCHED,
            createdByUserId: user!.id,
          },
        });
        bankMovementId = mov.id;
      }

      await tx.everexPayablePayment.create({
        data: {
          payableId,
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

      const newBal = new Prisma.Decimal(pay.balance.toString()).minus(payAmt);
      const clamped = newBal.lessThan(0) ? new Prisma.Decimal(0) : newBal;
      await tx.everexPayable.update({
        where: { id: payableId },
        data: {
          balance: clamped,
          active: clamped.greaterThan(0),
        },
      });
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error" };
  }

  revalidatePath("/deudas");
  revalidatePath("/dashboard");
  revalidatePath("/estado-financiero");
  revalidatePath("/bancos");
  redirect(`/deudas/${payableId}`);
}
