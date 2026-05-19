"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { OtcSide, Prisma } from "@prisma/client";
import { createOtcOperation } from "./actions";
import { ErrorBanner } from "@/app/components/ErrorBanner";
import { OperativeDateTimeFields } from "@/app/components/OperativeDateTimeFields";
import { MoneyInput } from "@/app/components/MoneyInput";
import { formatMoneyAmountCoreDisplay, normalizeMoneyBackend } from "@/lib/format-money";
import { parseRateToDecimal } from "@/lib/format-rate";
import { OtcAllocationLineFields, type OtcAllocLineMeta, type OtcAllocOpt } from "./OtcAllocationLineFields";

type Props = {
  clients: OtcAllocOpt[];
  operators: OtcAllocOpt[];
  bankAccounts: OtcAllocOpt[];
  presetSide: OtcSide;
};

function parseBackendNum(raw: string): number {
  const n = Number(normalizeMoneyBackend(raw));
  return Number.isFinite(n) ? n : 0;
}

function moneyDecimal(raw: string): Prisma.Decimal {
  const n = normalizeMoneyBackend(raw);
  if (n === "" || n === ".") return new Prisma.Decimal(0);
  try {
    const d = new Prisma.Decimal(n);
    return d.isFinite() ? d : new Prisma.Decimal(0);
  } catch {
    return new Prisma.Decimal(0);
  }
}

function defaultLineMeta(): OtcAllocLineMeta {
  return { dest: "", operatorPayout: "GTQ" };
}

export function NuevaOperacionForm({ clients, operators, bankAccounts, presetSide }: Props) {
  const [state, formAction, pending] = useActionState(createOtcOperation, null);
  const isBuy = presetSide === OtcSide.CLIENT_BUYS_USDT;

  const nextLineId = useRef(1);
  const [lineIds, setLineIds] = useState<number[]>([0]);
  const [lineMeta, setLineMeta] = useState<Record<number, OtcAllocLineMeta>>({ 0: defaultLineMeta() });
  const [totalFiatBackend, setTotalFiatBackend] = useState("");
  const [rateFiatBackend, setRateFiatBackend] = useState("");
  const [usdtDeliveredBackend, setUsdtDeliveredBackend] = useState("");
  const [allocBackends, setAllocBackends] = useState<Record<number, string>>({});

  const onLineMetaChange = (lineId: number, patch: Partial<OtcAllocLineMeta>) => {
    setLineMeta((m) => {
      const cur = m[lineId] ?? defaultLineMeta();
      const next = { ...cur, ...patch };
      if (patch.dest != null && patch.dest !== "OPERATOR") {
        next.operatorPayout = "GTQ";
      }
      return { ...m, [lineId]: next };
    });
  };

  const allocationHint = useMemo(() => {
    if (!isBuy) return null;
    const total = moneyDecimal(totalFiatBackend);
    const rate = parseRateToDecimal(rateFiatBackend);
    let sumEquiv = new Prisma.Decimal(0);
    for (const id of lineIds) {
      const raw = allocBackends[id] ?? "";
      if (!raw.trim()) continue;
      const amt = moneyDecimal(raw);
      const dest = lineMeta[id]?.dest ?? "";
      const payout = lineMeta[id]?.operatorPayout ?? "GTQ";
      if (dest === "OPERATOR" && payout === "USDT") {
        if (rate.lte(0)) continue;
        sumEquiv = sumEquiv.add(amt.mul(rate));
      } else {
        sumEquiv = sumEquiv.add(amt);
      }
    }
    const diff = sumEquiv.sub(total);
    const tol = new Prisma.Decimal("0.01");
    if (!totalFiatBackend.trim() && sumEquiv.isZero()) {
      return {
        tone: "muted" as const,
        text: "Indique el total GTQ y reparto. Líneas operador en USDT cuentan como monto × tasa GTQ/USDT hacia el total.",
      };
    }
    if (lineIds.some((id) => {
      const d = lineMeta[id]?.dest ?? "";
      const p = lineMeta[id]?.operatorPayout ?? "GTQ";
      const raw = allocBackends[id] ?? "";
      return d === "OPERATOR" && p === "USDT" && raw.trim() && rate.lte(0);
    })) {
      return { tone: "warn" as const, text: "Indique la tasa GTQ/USDT para valorizar líneas operador en USDT." };
    }
    if (diff.abs().lte(tol)) {
      return { tone: "ok" as const, text: "Reparto cuadrado con el total GTQ (equivalente)." };
    }
    if (diff.lt(0)) {
      return {
        tone: "warn" as const,
        text: `Faltan Q${formatMoneyAmountCoreDisplay(Number(diff.abs().toString()))} en equivalente GTQ (${formatMoneyAmountCoreDisplay(Number(total.toString()))} total).`,
      };
    }
    return {
      tone: "warn" as const,
      text: `Sobran Q${formatMoneyAmountCoreDisplay(Number(diff.toString()))} en equivalente GTQ (${formatMoneyAmountCoreDisplay(Number(total.toString()))} total).`,
    };
  }, [isBuy, totalFiatBackend, rateFiatBackend, lineIds, allocBackends, lineMeta]);

  const partialDeliveryPreview = useMemo(() => {
    if (!isBuy) return null;
    const total = moneyDecimal(totalFiatBackend);
    const rate = parseRateToDecimal(rateFiatBackend);
    const usdt = moneyDecimal(usdtDeliveredBackend);
    if (!(total.gt(0) && rate.gt(0) && usdt.gt(0))) return null;
    const applied = usdt.mul(rate);
    const pending = total.sub(applied);
    const usdtEst = rate.gt(0) ? pending.div(rate) : new Prisma.Decimal(0);
    return {
      applied: Number(applied.toString()),
      pending: Number(pending.toString()),
      usdtEst: Number(usdtEst.toString()),
    };
  }, [isBuy, totalFiatBackend, rateFiatBackend, usdtDeliveredBackend]);

  const addLine = () => {
    const id = nextLineId.current++;
    setLineIds((prev) => [...prev, id]);
    setLineMeta((m) => ({ ...m, [id]: defaultLineMeta() }));
  };

  const removeLine = (lineId: number) => {
    setLineIds((prev) => (prev.length <= 1 ? prev : prev.filter((x) => x !== lineId)));
    setAllocBackends((prev) => {
      const next = { ...prev };
      delete next[lineId];
      return next;
    });
    setLineMeta((m) => {
      const next = { ...m };
      delete next[lineId];
      return next;
    });
  };

  const onAllocAmountCommit = (lineId: number, backend: string) => {
    setAllocBackends((prev) => ({ ...prev, [lineId]: backend }));
  };

  return (
    <form action={formAction} className="mt-4 space-y-4 rounded border border-zinc-200 bg-white p-4 text-sm">
      <ErrorBanner message={state?.error} />
      <input type="hidden" name="side" value={presetSide} />
      <input type="hidden" name="fiatCurrency" value="GTQ" />

      <OperativeDateTimeFields />

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

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          {isBuy ? "USDT entregado hoy" : "USDT recibido"}
          <div className="mt-1">
            <MoneyInput
              name="usdtAmount"
              currency="USDT"
              required
              onBackendCommit={setUsdtDeliveredBackend}
            />
          </div>
        </label>
        <label className="block">
          {isBuy ? "Tasa venta (GTQ/USDT)" : "Tasa GTQ/USDT"}
          <div className="mt-1">
            <MoneyInput
              name="rateFiatPerUsdt"
              currency="PLAIN"
              mode="rate"
              required
              onBackendCommit={setRateFiatBackend}
            />
          </div>
        </label>
      </div>

      <label className="block">
        {isBuy ? "Total recibido GTQ (incluye lo no entregado hoy en USDT)" : "Total GTQ pagado"}
        <div className="mt-1">
          <MoneyInput
            name={isBuy ? "gtqRecibidoTotal" : "totalFiat"}
            currency="GTQ"
            required
            onBackendCommit={setTotalFiatBackend}
          />
        </div>
      </label>

      {isBuy && partialDeliveryPreview && partialDeliveryPreview.pending > 0.01 ? (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
          <p className="font-medium">Entrega parcial</p>
          <p className="mt-1 tabular-nums">
            GTQ aplicado hoy (USDT × tasa): Q{formatMoneyAmountCoreDisplay(partialDeliveryPreview.applied)} · Pendiente: Q
            {formatMoneyAmountCoreDisplay(partialDeliveryPreview.pending)}
            {partialDeliveryPreview.usdtEst > 0
              ? ` (~${formatMoneyAmountCoreDisplay(partialDeliveryPreview.usdtEst)} USDT a la misma tasa)`
              : ""}
          </p>
          <p className="mt-2 font-medium text-amber-900">
            El saldo pendiente queda como anticipo / pasivo con el cliente (deuda Everex), no como utilidad.
          </p>
          <p className="mt-2 text-xs text-amber-900/90">
            En el reparto, la suma debe igualar el <strong>total GTQ recibido</strong> (campo arriba), no solo el GTQ
            aplicado hoy a USDT.
          </p>
        </div>
      ) : null}

      {isBuy ? (
        <fieldset className="space-y-2 rounded border border-amber-200 bg-amber-50/40 p-3">
          <legend className="px-1 text-xs font-semibold text-amber-950">Reparto del dinero recibido (obligatorio)</legend>
          <p className="text-xs text-amber-900/80">
            La suma en equivalente GTQ debe igualar el total: líneas en GTQ suman directo; líneas operador en USDT cuentan
            como USDT × tasa. Pago operador en USDT reduce inventario Everex y registra libro operador en USDT (no mueve
            saldo GTQ del operador).
          </p>
          <OtcAllocationLineFields
            lineIds={lineIds}
            lineMeta={lineMeta}
            onLineMetaChange={onLineMetaChange}
            operators={operators}
            bankAccounts={bankAccounts}
            onAddLine={addLine}
            onRemoveLine={removeLine}
            onAmountCommit={onAllocAmountCommit}
          />
          {allocationHint ? (
            <p
              className={`text-xs font-medium ${
                allocationHint.tone === "ok"
                  ? "text-emerald-800"
                  : allocationHint.tone === "warn"
                    ? "text-amber-800"
                    : "text-zinc-600"
              }`}
            >
              {allocationHint.text}
            </p>
          ) : null}
        </fieldset>
      ) : null}

      <label className="block">
        Notas (opcional)
        <textarea name="notes" rows={2} className="mt-1 w-full rounded border border-zinc-400 px-2 py-1" />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-zinc-900 px-4 py-2 text-white disabled:opacity-60"
      >
        {pending ? "Guardando…" : "Guardar operación"}
      </button>
    </form>
  );
}
