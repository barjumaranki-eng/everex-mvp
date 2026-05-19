"use client";

import Link from "next/link";
import { useActionState } from "react";
import { PurchaseCounterparty } from "@prisma/client";
import { createUsdtPurchase } from "./actions";
import { ErrorBanner } from "@/app/components/ErrorBanner";
import { OperativeDateTimeFields } from "@/app/components/OperativeDateTimeFields";
import { MoneyInput } from "@/app/components/MoneyInput";
import { RateInput } from "@/app/components/RateInput";
import { FiatCurrency } from "@prisma/client";

type Props = {
  operators: { id: string; name: string }[];
  providers: { id: string; name: string }[];
};

export function CompraForm({ operators, providers }: Props) {
  const [state, formAction, pending] = useActionState(createUsdtPurchase, null);

  return (
    <form action={formAction} className="mt-4 space-y-3 rounded border border-zinc-200 bg-white p-4 text-sm">
      <ErrorBanner message={state?.error} />
      <OperativeDateTimeFields />
      <div className="rounded border border-sky-200 bg-sky-50/80 p-3 text-xs text-sky-950">
        <p className="font-medium">Inventario con costo en GTQ</p>
        <p className="mt-1">
          Compras USDT registran solo entradas de inventario costeadas en quetzales (operador o proveedor MX). Si un
          cliente entrega <strong>MXN</strong> en México y recibe <strong>USDT</strong>, use{" "}
          <Link href="/operaciones/nueva" className="font-medium underline">
            Nueva operación
          </Link>{" "}
          → <strong>Cliente MXN Spread</strong> (sin GTQ total ni bancos GTQ; utilidad en USDT).
        </p>
      </div>
      <label className="block">
        Contraparte
        <select name="counterparty" required className="mt-1 w-full rounded border border-zinc-400 px-2 py-1">
          <option value={PurchaseCounterparty.OPERATOR}>Operador</option>
          <option value={PurchaseCounterparty.PROVIDER_MX}>Proveedor MX</option>
        </select>
      </label>
      <label className="block">
        Operador
        <select name="operatorId" className="mt-1 w-full rounded border border-zinc-400 px-2 py-1">
          <option value="">—</option>
          {operators.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-zinc-500">
          Con <strong>Proveedor MX</strong>, el operador es opcional: si elige uno (p. ej. Jordi con compra PAKA), se
          guarda <code className="text-zinc-600">operatorId</code> y suma GTQ/USDT a su estado de cuenta además del
          acumulado del proveedor.
        </p>
      </label>
      <label className="block">
        Proveedor MX
        <select name="providerId" className="mt-1 w-full rounded border border-zinc-400 px-2 py-1">
          <option value="">—</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        MXN (opcional, referencia de compra)
        <div className="mt-1">
          <MoneyInput name="amountMxn" currency={FiatCurrency.MXN} />
        </div>
        <p className="mt-1 text-xs text-zinc-500">
          Si ingresa MXN, use <strong>tasa MXN→GTQ</strong> solo para expresar el <strong>costo del inventario en GTQ</strong>;
          no sustituye el registro de operaciones MXN de cliente (use Cliente MXN Spread).
        </p>
      </label>
      <label className="block">
        GTQ total (costo inventario)
        <div className="mt-1">
          <MoneyInput name="gtqTotal" currency={FiatCurrency.GTQ} required />
        </div>
      </label>
      <label className="block">
        USDT recibidos
        <div className="mt-1">
          <MoneyInput name="usdtAmount" currency="USDT" required />
        </div>
      </label>
      <label className="block">
        XE (MXN/USDT, opcional)
        <div className="mt-1">
          <RateInput name="rateXe" />
        </div>
      </label>
      <label className="block">
        Tasa MXN→GTQ (opcional, hasta 6 decimales)
        <div className="mt-1">
          <RateInput name="rateMxnToGtq" />
        </div>
      </label>
      <label className="block">
        Notas
        <textarea name="notes" rows={2} className="mt-1 w-full rounded border border-zinc-400 px-2 py-1" />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-zinc-900 px-4 py-2 text-white disabled:opacity-60"
      >
        {pending ? "Guardando…" : "Registrar compra"}
      </button>
    </form>
  );
}
