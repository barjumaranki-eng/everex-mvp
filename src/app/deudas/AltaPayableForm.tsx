"use client";

import { useActionState, useState } from "react";
import { EverexCreditorType, FiatCurrency } from "@prisma/client";
import { createPayable } from "./actions";
import { ErrorBanner } from "@/app/components/ErrorBanner";
import { MoneyInput } from "@/app/components/MoneyInput";
import { PAYABLE_CREDITOR_TYPES_FORM } from "@/lib/payable-creditor";

type Opt = { id: string; name: string };

type Props = {
  clients: Opt[];
  operators: Opt[];
  providers: Opt[];
};

const TYPE_LABELS: Record<string, string> = {
  CLIENT: "Cliente",
  OPERATOR: "Operador",
  PROVIDER: "Proveedor MX",
  OTHER: "Otro",
};

export function AltaPayableForm({ clients, operators, providers }: Props) {
  const [creditorType, setCreditorType] = useState<EverexCreditorType>(EverexCreditorType.CLIENT);
  const [state, formAction, pending] = useActionState(createPayable, null);

  return (
    <form action={formAction} className="mt-4 space-y-2 rounded border border-zinc-200 bg-white p-4 text-sm">
      <ErrorBanner message={state?.error} />
      <label className="block">
        Tipo de acreedor
        <select
          name="creditorType"
          required
          value={creditorType}
          onChange={(e) => setCreditorType(e.target.value as EverexCreditorType)}
          className="mt-1 w-full rounded border border-zinc-400 px-2 py-1"
        >
          {PAYABLE_CREDITOR_TYPES_FORM.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t] ?? t}
            </option>
          ))}
        </select>
      </label>

      {creditorType === EverexCreditorType.CLIENT ? (
        <label className="block">
          Cliente
          <select name="clientId" required className="mt-1 w-full rounded border border-zinc-400 px-2 py-1">
            <option value="">—</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {creditorType === EverexCreditorType.OPERATOR ? (
        <label className="block">
          Operador
          <select name="operatorId" required className="mt-1 w-full rounded border border-zinc-400 px-2 py-1">
            <option value="">—</option>
            {operators.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {creditorType === EverexCreditorType.PROVIDER ? (
        <label className="block">
          Proveedor MX
          <select name="providerId" required className="mt-1 w-full rounded border border-zinc-400 px-2 py-1">
            <option value="">—</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {creditorType === EverexCreditorType.OTHER ? (
        <label className="block">
          Nombre del acreedor
          <input name="otherName" required className="mt-1 w-full rounded border border-zinc-400 px-2 py-1" />
        </label>
      ) : null}

      <label className="block">
        Monto original
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
        Motivo
        <input name="reason" required className="mt-1 w-full rounded border border-zinc-400 px-2 py-1" />
      </label>
      <label className="block">
        Notas
        <textarea name="notes" rows={2} className="mt-1 w-full rounded border border-zinc-400 px-2 py-1" />
      </label>
      <button type="submit" disabled={pending} className="rounded bg-zinc-900 px-3 py-2 text-white disabled:opacity-60">
        Registrar deuda
      </button>
    </form>
  );
}
