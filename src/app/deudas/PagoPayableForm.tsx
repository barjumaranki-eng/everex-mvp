"use client";

import { useActionState } from "react";
import { FiatCurrency, FundsChannel } from "@prisma/client";
import { addPayablePayment } from "./actions";
import { ErrorBanner } from "@/app/components/ErrorBanner";
import { OperativeDateTimeFields } from "@/app/components/OperativeDateTimeFields";
import { MoneyInput } from "@/app/components/MoneyInput";

type BankOpt = { id: string; label: string };

export function PagoPayableForm({ payableId, banks }: { payableId: string; banks: BankOpt[] }) {
  const [state, formAction, pending] = useActionState(addPayablePayment, null);

  return (
    <form action={formAction} className="mt-4 space-y-2 rounded border border-zinc-200 bg-white p-4 text-sm">
      <ErrorBanner message={state?.error} />
      <input type="hidden" name="payableId" value={payableId} />
      <OperativeDateTimeFields />
      <label className="block">
        Monto
        <div className="mt-1">
          <MoneyInput name="amount" currency="PLAIN" required />
        </div>
      </label>
      <label className="block">
        Moneda
        <select name="currency" className="mt-1 w-full rounded border border-zinc-400 px-2 py-1">
          <option value={FiatCurrency.GTQ}>GTQ</option>
          <option value={FiatCurrency.MXN}>MXN</option>
          <option value={FiatCurrency.USD}>USD</option>
        </select>
      </label>
      <label className="block">
        Pagado desde
        <select name="channel" required className="mt-1 w-full rounded border border-zinc-400 px-2 py-1">
          <option value={FundsChannel.BANK}>Banco</option>
          <option value={FundsChannel.CASH}>Caja</option>
        </select>
      </label>
      <label className="block">
        Cuenta banco
        <select name="bankAccountId" className="mt-1 w-full rounded border border-zinc-400 px-2 py-1">
          <option value="">—</option>
          {banks.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        Referencia
        <input name="reference" className="mt-1 w-full rounded border border-zinc-400 px-2 py-1" />
      </label>
      <button type="submit" disabled={pending} className="rounded bg-zinc-900 px-3 py-2 text-white disabled:opacity-60">
        Registrar pago
      </button>
    </form>
  );
}
