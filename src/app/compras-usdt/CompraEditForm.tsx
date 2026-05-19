"use client";

import { useActionState } from "react";
import { PurchaseCounterparty } from "@prisma/client";
import { updateUsdtPurchase } from "./actions";
import { ErrorBanner } from "@/app/components/ErrorBanner";
import { OperativeDateTimeFields } from "@/app/components/OperativeDateTimeFields";
import { MoneyInput } from "@/app/components/MoneyInput";
import { RateInput } from "@/app/components/RateInput";
import { FiatCurrency } from "@prisma/client";

type Props = {
  purchaseId: string;
  defaultOperativeIso: string;
  counterparty: PurchaseCounterparty;
  operatorId: string | null;
  clientId: string | null;
  providerId: string | null;
  amountMxn: string;
  gtqTotal: string;
  usdtAmount: string;
  rateXe: string;
  rateMxnToGtq: string;
  notes: string;
  operators: { id: string; name: string }[];
  clients: { id: string; name: string }[];
  providers: { id: string; name: string }[];
};

export function CompraEditForm({
  purchaseId,
  defaultOperativeIso,
  counterparty: initialCp,
  operatorId,
  clientId,
  providerId,
  amountMxn,
  gtqTotal,
  usdtAmount,
  rateXe,
  rateMxnToGtq,
  notes,
  operators,
  clients,
  providers,
}: Props) {
  const [state, formAction, pending] = useActionState(updateUsdtPurchase, null);

  return (
    <form key={purchaseId} action={formAction} className="mt-4 space-y-3 rounded border border-zinc-200 bg-white p-4 text-sm">
      <input type="hidden" name="id" value={purchaseId} />
      <ErrorBanner message={state?.error} />
      <OperativeDateTimeFields defaultOperativeIso={defaultOperativeIso} />
      <label className="block">
        Contraparte
        <select
          name="counterparty"
          required
          defaultValue={initialCp}
          className="mt-1 w-full rounded border border-zinc-400 px-2 py-1"
        >
          <option value={PurchaseCounterparty.OPERATOR}>Operador</option>
          <option value={PurchaseCounterparty.CLIENT}>Cliente</option>
          <option value={PurchaseCounterparty.PROVIDER_MX}>Proveedor MX</option>
        </select>
      </label>
      <label className="block">
        Operador
        <select name="operatorId" defaultValue={operatorId ?? ""} className="mt-1 w-full rounded border border-zinc-400 px-2 py-1">
          <option value="">—</option>
          {operators.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-zinc-500">
          Con contraparte <strong>Proveedor MX</strong> puede asociar un operador; se guarda en la compra y actualiza su
          libro.
        </p>
      </label>
      <label className="block">
        Cliente
        <select name="clientId" defaultValue={clientId ?? ""} className="mt-1 w-full rounded border border-zinc-400 px-2 py-1">
          <option value="">—</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        Proveedor MX
        <select name="providerId" defaultValue={providerId ?? ""} className="mt-1 w-full rounded border border-zinc-400 px-2 py-1">
          <option value="">—</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        MXN (opcional)
        <div className="mt-1">
          <MoneyInput name="amountMxn" currency={FiatCurrency.MXN} defaultValue={amountMxn} />
        </div>
      </label>
      <label className="block">
        GTQ total
        <div className="mt-1">
          <MoneyInput name="gtqTotal" currency={FiatCurrency.GTQ} required defaultValue={gtqTotal} />
        </div>
      </label>
      <label className="block">
        USDT recibidos
        <div className="mt-1">
          <MoneyInput name="usdtAmount" currency="USDT" required defaultValue={usdtAmount} />
        </div>
      </label>
      <label className="block">
        XE (MXN/USDT, opcional)
        <div className="mt-1">
          <RateInput name="rateXe" defaultValue={rateXe} />
        </div>
      </label>
      <label className="block">
        Tasa MXN→GTQ (opcional, hasta 6 decimales)
        <div className="mt-1">
          <RateInput name="rateMxnToGtq" defaultValue={rateMxnToGtq} />
        </div>
      </label>
      <label className="flex cursor-pointer items-start gap-2 rounded border border-zinc-200 bg-zinc-50 px-2 py-2">
        <input type="checkbox" name="recalcFromRates" value="on" className="mt-1" />
        <span>
          <span className="font-medium">Recalcular GTQ y USDT</span> desde MXN, XE y MXN→GTQ al guardar
          <span className="mt-0.5 block text-xs font-normal text-zinc-600">
            XE = MXN por 1 USDT. MXN→GTQ = GTQ por cada MXN. Si marca esto, los campos GTQ total y USDT del formulario se
            ignoran y se sustituyen por el cálculo.
          </span>
        </span>
      </label>
      <label className="block">
        Notas
        <textarea name="notes" rows={2} defaultValue={notes} className="mt-1 w-full rounded border border-zinc-400 px-2 py-1" />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-zinc-900 px-4 py-2 text-white disabled:opacity-60"
      >
        {pending ? "Guardando…" : "Guardar cambios"}
      </button>
    </form>
  );
}
