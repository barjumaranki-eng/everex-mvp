"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { addOperatorManualAdjustment } from "./actions";
import { ErrorBanner } from "@/app/components/ErrorBanner";
import { OperativeDateTimeFields } from "@/app/components/OperativeDateTimeFields";
import { MoneyInput } from "@/app/components/MoneyInput";
import { FiatCurrency } from "@prisma/client";

export function OperadorAjusteForm({ operatorId }: { operatorId: string }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    async (p: { error?: string } | null, fd: FormData) => {
      const r = await addOperatorManualAdjustment(p, fd);
      if (!r.error) router.refresh();
      return r;
    },
    null,
  );

  return (
    <form action={formAction} className="mt-4 space-y-2 rounded border border-amber-200 bg-amber-50 p-4 text-sm">
      <ErrorBanner message={state?.error} />
      <OperativeDateTimeFields className="bg-white/90" />
      <input type="hidden" name="operatorId" value={operatorId} />
      <fieldset className="space-y-2">
        <legend className="text-xs font-medium text-zinc-700">Sentido (libro operador)</legend>
        <label className="flex items-center gap-2">
          <input type="radio" name="direction" value="debit" defaultChecked className="shrink-0" />
          Entrada GTQ — aumenta saldo pendiente a favor del operador
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="direction" value="credit" className="shrink-0" />
          Salida GTQ — disminuye saldo (pago aplicado, corrección a favor de Everex)
        </label>
      </fieldset>
      <label className="block">
        Monto GTQ (positivo)
        <div className="mt-1">
          <MoneyInput name="amountGtq" currency={FiatCurrency.GTQ} required />
        </div>
      </label>
      <label className="block">
        Motivo / descripción (obligatorio)
        <input
          name="label"
          required
          minLength={3}
          className="mt-1 w-full rounded border border-zinc-400 px-2 py-1"
          placeholder="Ej. Ajuste conciliación · PAGO_EVEREX transferencia BAC"
        />
      </label>
      <p className="text-xs text-zinc-600">
        Pago Everex→operador: inicie el motivo con <span className="font-mono">PAGO_EVEREX</span> o{" "}
        <span className="font-mono">Pago Everex</span>. Opcional: agregue <span className="font-mono">Banco: Nombre</span> para
        ver la columna Banco en el libro.
      </p>
      <button type="submit" disabled={pending} className="rounded bg-zinc-900 px-3 py-2 text-white disabled:opacity-60">
        Registrar ajuste
      </button>
    </form>
  );
}
