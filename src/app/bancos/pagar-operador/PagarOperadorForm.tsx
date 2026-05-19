"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { FiatCurrency } from "@prisma/client";
import { registerOperatorEverexBankPayment } from "@/app/operadores/actions";
import { ErrorBanner } from "@/app/components/ErrorBanner";
import { OperativeDateTimeFields } from "@/app/components/OperativeDateTimeFields";
import { MoneyInput } from "@/app/components/MoneyInput";

type Opt = { id: string; name: string };
type BankOpt = { id: string; label: string };

type Props = {
  operators: Opt[];
  banks: BankOpt[];
};

export function PagarOperadorForm({ operators, banks }: Props) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    async (p: { error?: string } | null, fd: FormData) => {
      const r = await registerOperatorEverexBankPayment(p, fd);
      if (!r.error) router.push("/bancos");
      return r;
    },
    null,
  );

  if (banks.length === 0) {
    return (
      <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <p className="font-medium">Sin cuenta bancaria GTQ</p>
        <p className="mt-1 text-xs">Cree una cuenta en GTQ en Bancos para registrar pagos a operadores.</p>
      </div>
    );
  }

  if (operators.length === 0) {
    return (
      <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <p className="font-medium">Sin operadores activos</p>
        <p className="mt-1 text-xs">Alta de operadores en el catálogo de operadores.</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-4 space-y-4 rounded border border-emerald-200 bg-emerald-50/50 p-4 text-sm">
      <ErrorBanner message={state?.error} />
      <p className="text-xs text-emerald-950">
        Débito en banco (GTQ), reduce saldo GTQ del operador y aparece en su libro mayor como{" "}
        <span className="font-mono">PAGO_EVEREX_A_OPERADOR</span>. No afecta inventario USDT ni utilidad OTC.
      </p>

      <OperativeDateTimeFields className="bg-white/90" />

      <label className="block">
        <span className="text-xs font-medium text-zinc-800">Banco origen (GTQ)</span>
        <select name="bankAccountId" required className="mt-1 w-full max-w-md rounded border border-zinc-400 bg-white px-2 py-1">
          <option value="">—</option>
          {banks.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-xs font-medium text-zinc-800">Operador</span>
        <select name="operatorId" required className="mt-1 w-full max-w-md rounded border border-zinc-400 bg-white px-2 py-1">
          <option value="">—</option>
          {operators.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-xs font-medium text-zinc-800">Monto GTQ</span>
        <div className="mt-1 max-w-xs">
          <MoneyInput name="amountGtq" currency={FiatCurrency.GTQ} required />
        </div>
      </label>

      <label className="block">
        <span className="text-xs font-medium text-zinc-800">Referencia / comprobante (opcional)</span>
        <input
          name="reference"
          className="mt-1 block w-full max-w-md rounded border border-zinc-400 bg-white px-2 py-1"
          placeholder="Nº transferencia, comprobante…"
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
  );
}
