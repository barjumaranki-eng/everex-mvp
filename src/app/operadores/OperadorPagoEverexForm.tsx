"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { FiatCurrency } from "@prisma/client";
import { registerOperatorEverexBankPayment } from "./actions";
import { ErrorBanner } from "@/app/components/ErrorBanner";
import { MoneyInput } from "@/app/components/MoneyInput";
import { formatOperativeDateInputValue, formatOperativeTimeInputValue } from "@/lib/operative-datetime";

type BankOpt = { id: string; label: string };

export function OperadorPagoEverexForm({ operatorId, banks }: { operatorId: string; banks: BankOpt[] }) {
  const router = useRouter();
  const [defaultOp] = useState(() => {
    const n = new Date();
    return { date: formatOperativeDateInputValue(n), time: formatOperativeTimeInputValue(n) };
  });
  const [state, formAction, pending] = useActionState(
    async (p: { error?: string } | null, fd: FormData) => {
      const r = await registerOperatorEverexBankPayment(p, fd);
      if (!r.error) router.refresh();
      return r;
    },
    null,
  );

  if (banks.length === 0) {
    return (
      <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <p className="font-medium">Sin cuenta bancaria GTQ</p>
        <p className="mt-1 text-xs">Cree una cuenta en GTQ en Bancos para registrar pagos al operador.</p>
      </div>
    );
  }

  return (
    <section className="mt-4 rounded border border-emerald-200 bg-emerald-50/60 p-4 text-sm">
      <h2 className="text-sm font-semibold text-emerald-950">Registrar pago a operador</h2>
      <p className="mt-1 text-xs text-emerald-900/90">
        Débito en banco Everex (GTQ) y asiento <span className="font-mono">PAGO_EVEREX_A_OPERADOR</span> en el libro del
        operador. No afecta inventario USDT ni utilidad OTC.
      </p>
      <form action={formAction} className="mt-3 space-y-3">
        <ErrorBanner message={state?.error} />
        <input type="hidden" name="operatorId" value={operatorId} />
        <label className="block">
          <span className="text-xs font-medium text-zinc-800">Banco origen (GTQ)</span>
          <select
            name="bankAccountId"
            required
            className="mt-1 block w-full max-w-md rounded border border-zinc-400 bg-white px-2 py-1"
          >
            <option value="">—</option>
            {banks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-3">
          <label className="block">
            <span className="text-xs font-medium text-zinc-800">Fecha operativa</span>
            <input
              type="date"
              name="operativeDate"
              defaultValue={defaultOp.date}
              className="mt-1 block rounded border border-zinc-400 bg-white px-2 py-1"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-zinc-800">Hora operativa</span>
            <input
              type="time"
              name="operativeTime"
              defaultValue={defaultOp.time}
              step={60}
              className="mt-1 block rounded border border-zinc-400 bg-white px-2 py-1"
            />
          </label>
        </div>
        <label className="block">
          <span className="text-xs font-medium text-zinc-800">Monto GTQ</span>
          <div className="mt-1 max-w-xs">
            <MoneyInput name="amountGtq" currency={FiatCurrency.GTQ} required />
          </div>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-zinc-800">Referencia (opcional)</span>
          <input
            name="reference"
            className="mt-1 block w-full max-w-md rounded border border-zinc-400 bg-white px-2 py-1"
            placeholder="Ej. transferencia BAC · comprobante #"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-zinc-800">Notas (opcional)</span>
          <textarea name="notes" rows={2} className="mt-1 block w-full max-w-md rounded border border-zinc-400 bg-white px-2 py-1" />
        </label>
        <button type="submit" disabled={pending} className="rounded bg-emerald-900 px-4 py-2 text-white disabled:opacity-60">
          {pending ? "Guardando…" : "Registrar pago"}
        </button>
      </form>
    </section>
  );
}
