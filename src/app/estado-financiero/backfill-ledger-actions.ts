"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/session";
import { isAdmin } from "@/lib/authz";
import { backfillOtcAllocationLedger } from "@/lib/otc-allocation-ledger";

export async function runBackfillOtcAllocationLedger(
  _prev: { ok?: boolean; message?: string } | null,
  _formData: FormData,
): Promise<{ ok?: boolean; message?: string }> {
  const user = await getSessionUser();
  if (!user || !isAdmin(user)) {
    return { ok: false, message: "No autorizado" };
  }

  const r = await backfillOtcAllocationLedger();

  revalidatePath("/dashboard");
  revalidatePath("/bancos");
  revalidatePath("/operadores");
  revalidatePath("/estado-financiero");
  revalidatePath("/operaciones");

  const message = [
    `Operadores: ${r.createdOperatorEntries} asientos nuevos, ${r.repairedLegacyOperator} legados corregidos (signo y vínculo).`,
    `Bancos: ${r.createdBankMovements} movimientos nuevos, ${r.linkedLegacyBank} movimientos existentes enlazados.`,
    `Líneas ya enlazadas (omitidas): ${r.skipped}.`,
  ].join(" ");

  return { ok: true, message };
}
