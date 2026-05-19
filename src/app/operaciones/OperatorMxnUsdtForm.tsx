"use client";

import { useActionState, useCallback, useMemo, useState } from "react";
import { FiatCurrency, Prisma } from "@prisma/client";
import { createOperatorMxnUsdtSettlement } from "./operator-mxn-usdt-actions";
import { ErrorBanner } from "@/app/components/ErrorBanner";
import { OperativeDateTimeFields } from "@/app/components/OperativeDateTimeFields";
import { MoneyInput } from "@/app/components/MoneyInput";
import { formatMoneyDisplay, normalizeMoneyBackend } from "@/lib/format-money";
import { formatRateDisplay, parseRateToDecimal } from "@/lib/format-rate";

type Opt = { id: string; name: string };

type Props = {
  operators: Opt[];
  providers: Opt[];
};

export function OperatorMxnUsdtForm({ operators, providers }: Props) {
  const [state, formAction, pending] = useActionState(createOperatorMxnUsdtSettlement, null);
  const [mxnB, setMxnB] = useState("");
  const [xeB, setXeB] = useState("");
  const [paidB, setPaidB] = useState("");

  const preview = useMemo(() => {
    let m: Prisma.Decimal;
    try {
      const raw = normalizeMoneyBackend(mxnB);
      m = raw === "" ? new Prisma.Decimal(0) : new Prisma.Decimal(raw);
      if (!m.isFinite()) m = new Prisma.Decimal(0);
    } catch {
      m = new Prisma.Decimal(0);
    }
    const x = parseRateToDecimal(xeB);
    let paid: Prisma.Decimal;
    try {
      const pr = normalizeMoneyBackend(paidB);
      paid = pr === "" ? new Prisma.Decimal(0) : new Prisma.Decimal(pr);
      if (!paid.isFinite()) paid = new Prisma.Decimal(0);
    } catch {
      paid = new Prisma.Decimal(0);
    }
    if (!(m.gt(0) && x.gt(0) && paid.gt(0))) return null;
    const refUsdt = m.div(x);
    return { refUsdt, paid, diff: refUsdt.sub(paid) };
  }, [mxnB, xeB, paidB]);

  const onMxn = useCallback((b: string) => setMxnB(b), []);
  const onXe = useCallback((b: string) => setXeB(b), []);
  const onPaid = useCallback((b: string) => setPaidB(b), []);

  return (
    <form action={formAction} className="mt-4 space-y-4 rounded border border-emerald-200 bg-emerald-50/40 p-4 text-sm">
      <ErrorBanner message={state?.error} />
      <OperativeDateTimeFields className="bg-white/90" />
      <p className="text-xs text-emerald-950">
        Operador entrega MXN; Everex paga USDT desde inventario. Sin GTQ ni movimientos bancarios GTQ. Se descuenta
        inventario por los USDT pagados.
      </p>

      <label className="block">
        Operador
        <select name="operatorId" required className="mt-1 w-full rounded border border-zinc-400 bg-white px-2 py-1">
          <option value="">—</option>
          {operators.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        Proveedor MX (opcional)
        <select name="providerId" className="mt-1 w-full rounded border border-zinc-400 bg-white px-2 py-1">
          <option value="">—</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        MXN recibidos (del operador)
        <div className="mt-1">
          <MoneyInput name="mxnReceived" currency={FiatCurrency.MXN} required onBackendCommit={onMxn} />
        </div>
      </label>

      <label className="block">
        XE referencia (MXN / USDT)
        <div className="mt-1">
          <MoneyInput name="xeReference" currency="PLAIN" mode="rate" required onBackendCommit={onXe} />
        </div>
      </label>

      <label className="block">
        USDT pagados al operador
        <div className="mt-1">
          <MoneyInput name="usdtPaid" currency="USDT" required onBackendCommit={onPaid} />
        </div>
      </label>

      <label className="block">
        Tasa pactada GTQ/USDT (opcional, referencia)
        <div className="mt-1">
          <MoneyInput name="gtqRateOptional" currency="PLAIN" mode="rate" />
        </div>
      </label>
      <p className="text-xs text-amber-900/90">
        Si deja la tasa vacía, el saldo GTQ del operador no se ajusta con esta liquidación (solo USDT e inventario). Para
        liquidar deuda en quetzales al pagar con USDT, indique la tasa pactada.
      </p>

      <div className="rounded border border-emerald-200 bg-white p-3 text-sm">
        <h3 className="text-xs font-medium text-emerald-950">Calculado</h3>
        <dl className="mt-2 space-y-1 tabular-nums">
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-600">USDT referencia (MXN ÷ XE)</dt>
            <dd>{preview ? formatMoneyDisplay(preview.refUsdt, "USDT") : "—"}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-600">USDT pagados</dt>
            <dd>{preview ? formatMoneyDisplay(preview.paid, "USDT") : "—"}</dd>
          </div>
          <div className="flex justify-between gap-4 font-medium text-emerald-900">
            <dt>Diferencia USDT (referencia − pagados)</dt>
            <dd>{preview ? formatMoneyDisplay(preview.diff, "USDT") : "—"}</dd>
          </div>
        </dl>
        {preview ? (
          <p className="mt-2 text-xs text-zinc-500">XE usado: {formatRateDisplay(xeB)}</p>
        ) : null}
      </div>

      <label className="block">
        Notas
        <textarea name="notes" rows={2} className="mt-1 w-full rounded border border-zinc-400 bg-white px-2 py-1" />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-emerald-900 px-4 py-2 text-white disabled:opacity-60"
      >
        {pending ? "Guardando…" : "Guardar operación"}
      </button>
    </form>
  );
}
