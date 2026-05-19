"use client";

import Link from "next/link";
import { useActionState, useCallback, useMemo, useState } from "react";
import { FiatCurrency, Prisma } from "@prisma/client";
import { createMxnSpreadOperation } from "./mxn-spread-actions";
import { ErrorBanner } from "@/app/components/ErrorBanner";
import { OperativeDateTimeFields } from "@/app/components/OperativeDateTimeFields";
import { MoneyInput } from "@/app/components/MoneyInput";
import { formatMoneyDisplay, normalizeMoneyBackend } from "@/lib/format-money";
import { formatRateDisplay, parseRateToDecimal } from "@/lib/format-rate";

type Opt = { id: string; name: string };

type Props = {
  clients: Opt[];
  providers: Opt[];
};

export function MxnSpreadOperacionForm({ clients, providers }: Props) {
  const [state, formAction, pending] = useActionState(createMxnSpreadOperation, null);
  const [mxnB, setMxnB] = useState("");
  const [xeB, setXeB] = useState("");
  const [rateB, setRateB] = useState("");

  const onMxn = useCallback((b: string) => setMxnB(b), []);
  const onXe = useCallback((b: string) => setXeB(b), []);
  const onRate = useCallback((b: string) => setRateB(b), []);

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
    const r = parseRateToDecimal(rateB);
    if (!(m.gt(0) && x.gt(0) && r.gt(0))) return null;
    const usdtP = m.div(x);
    const usdtC = m.div(r);
    const profit = usdtP.sub(usdtC);
    return { usdtP, usdtC, profit };
  }, [mxnB, xeB, rateB]);

  if (providers.length === 0) {
    return (
      <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <p className="font-medium">Falta proveedor MX</p>
        <p className="mt-1 text-xs">
          Cree uno en{" "}
          <Link href="/proveedores" className="underline">
            Proveedores
          </Link>{" "}
          para registrar Cliente MXN Spread.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-4 space-y-4 rounded border border-violet-200 bg-violet-50/40 p-4 text-sm">
      <ErrorBanner message={state?.error} />
      <OperativeDateTimeFields className="bg-white/90" />
      <p className="text-xs text-violet-900">
        MXN con el proveedor en México; <strong>sin GTQ</strong> ni bancos GTQ. Al guardar: entra USDT del proveedor al
        inventario, sale USDT al cliente, utilidad en <strong>USDT</strong>. Se registra movimiento de proveedor MX en
        libro (ref. spread).
      </p>

      <label className="block">
        Cliente
        <select name="clientId" required className="mt-1 w-full rounded border border-zinc-400 bg-white px-2 py-1">
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
        <select name="providerId" required className="mt-1 w-full rounded border border-zinc-400 bg-white px-2 py-1">
          <option value="">—</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        MXN recibido
        <div className="mt-1">
          <MoneyInput name="mxnReceived" currency={FiatCurrency.MXN} required onBackendCommit={onMxn} />
        </div>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          XE proveedor (MXN / USDT)
          <div className="mt-1">
            <MoneyInput name="xeProvider" currency="PLAIN" mode="rate" required onBackendCommit={onXe} />
          </div>
        </label>
        <label className="block">
          Tasa cliente (MXN / USDT)
          <div className="mt-1">
            <MoneyInput name="clientRate" currency="PLAIN" mode="rate" required onBackendCommit={onRate} />
          </div>
        </label>
      </div>

      <div className="rounded border border-violet-200 bg-white p-3 text-sm">
        <h3 className="text-xs font-medium text-violet-950">Calculado (mismo criterio al guardar)</h3>
        <dl className="mt-2 space-y-1 tabular-nums">
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-600">USDT recibido proveedor</dt>
            <dd>{preview ? formatMoneyDisplay(preview.usdtP, "USDT") : "—"}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-600">USDT entregado cliente</dt>
            <dd>{preview ? formatMoneyDisplay(preview.usdtC, "USDT") : "—"}</dd>
          </div>
          <div className="flex justify-between gap-4 font-medium text-emerald-900">
            <dt>Utilidad USDT</dt>
            <dd>{preview ? formatMoneyDisplay(preview.profit, "USDT") : "—"}</dd>
          </div>
        </dl>
        {preview ? (
          <p className="mt-2 text-xs text-zinc-500">
            Tasas mostradas: proveedor {formatRateDisplay(xeB)} · cliente {formatRateDisplay(rateB)}
          </p>
        ) : null}
      </div>

      <label className="block">
        Notas
        <textarea name="notes" rows={2} className="mt-1 w-full rounded border border-zinc-400 bg-white px-2 py-1" />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-violet-900 px-4 py-2 text-white disabled:opacity-60"
      >
        {pending ? "Guardando…" : "Guardar Cliente MXN Spread"}
      </button>
    </form>
  );
}
