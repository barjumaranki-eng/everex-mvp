"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { FiatCurrency, Prisma } from "@prisma/client";
import { useRouter } from "next/navigation";
import { addOtcOperationAllocations } from "../actions";
import { ErrorBanner } from "@/app/components/ErrorBanner";
import { OperativeDateTimeFields } from "@/app/components/OperativeDateTimeFields";
import { MoneyInput } from "@/app/components/MoneyInput";
import { formatMoneyAmountCoreDisplay, normalizeMoneyBackend } from "@/lib/format-money";
import { parseRateToDecimal } from "@/lib/format-rate";
import { OtcAllocationLineFields, type OtcAllocLineMeta, type OtcAllocOpt } from "../OtcAllocationLineFields";

type Props = {
  operationId: string;
  totalFiatBackend: string;
  totalFiatLabel: string;
  pnlBasisGtqLabel: string;
  /** Tasa GTQ/USDT de la operación (string decimal) para valorizar líneas operador en USDT */
  rateFiatPerUsdtBackend: string;
  operators: OtcAllocOpt[];
  bankAccounts: OtcAllocOpt[];
};

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

export function AddOtcAllocationsForm({
  operationId,
  totalFiatBackend,
  totalFiatLabel,
  pnlBasisGtqLabel,
  rateFiatPerUsdtBackend,
  operators,
  bankAccounts,
}: Props) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(addOtcOperationAllocations, null);

  const nextLineId = useRef(1);
  const [lineIds, setLineIds] = useState<number[]>([0]);
  const [lineMeta, setLineMeta] = useState<Record<number, OtcAllocLineMeta>>({ 0: defaultLineMeta() });
  const [allocBackends, setAllocBackends] = useState<Record<number, string>>({});

  useEffect(() => {
    if (state && "ok" in state && state.ok) {
      router.refresh();
    }
  }, [state, router]);

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

  const [totalOverrideBackend, setTotalOverrideBackend] = useState("");

  const totalBackendStr = useMemo(() => {
    if (totalOverrideBackend.trim() && moneyDecimal(totalOverrideBackend).gt(0)) {
      return totalOverrideBackend;
    }
    return totalFiatBackend;
  }, [totalFiatBackend, totalOverrideBackend]);

  const allocationHint = useMemo(() => {
    const total = moneyDecimal(totalBackendStr);
    const rate = parseRateToDecimal(rateFiatPerUsdtBackend);
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
    if (
      lineIds.some((id) => {
        const d = lineMeta[id]?.dest ?? "";
        const p = lineMeta[id]?.operatorPayout ?? "GTQ";
        const raw = allocBackends[id] ?? "";
        return d === "OPERATOR" && p === "USDT" && raw.trim() && rate.lte(0);
      })
    ) {
      return { tone: "warn" as const, text: "Indique la tasa GTQ/USDT de la operación para valorizar USDT al operador." };
    }
    if (diff.abs().lte(tol)) {
      return { tone: "ok" as const, text: "Reparto cuadrado con el total de la operación." };
    }
    if (diff.lt(0)) {
      return {
        tone: "warn" as const,
        text: `Faltan Q${formatMoneyAmountCoreDisplay(Number(diff.abs().toString()))} en equivalente GTQ (objetivo Q${formatMoneyAmountCoreDisplay(Number(total.toString()))}).`,
      };
    }
    return {
      tone: "warn" as const,
      text: `Sobran Q${formatMoneyAmountCoreDisplay(Number(diff.toString()))} en equivalente GTQ (objetivo Q${formatMoneyAmountCoreDisplay(Number(total.toString()))}).`,
    };
  }, [totalBackendStr, totalFiatLabel, rateFiatPerUsdtBackend, lineIds, allocBackends, lineMeta]);

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

  return (
    <section className="mt-6 rounded border border-amber-200 bg-amber-50/40 p-4 text-sm">
      <h2 className="text-sm font-semibold text-amber-950">Agregar reparto</h2>
      <p className="mt-1 text-xs text-amber-900/85">
        Esta venta no tiene líneas de reparto. El reparto debe sumar el <strong>GTQ recibido total</strong> (todo lo que
        ingresó), no solo el tramo aplicado hoy a USDT. GTQ aplicado hoy (base utilidad):{" "}
        <span className="font-medium tabular-nums">{pnlBasisGtqLabel}</span>. Total registrado en la operación:{" "}
        <span className="font-medium tabular-nums">{totalFiatLabel}</span>. Si el cliente pagó de más y el total
        registrado es bajo, indíquelo abajo y cuadre el reparto contra el monto real recibido.
      </p>

      <form action={formAction} className="mt-3 space-y-3">
        <input type="hidden" name="operationId" value={operationId} />
        <ErrorBanner message={state?.error} />
        <OperativeDateTimeFields className="bg-white/90" />
        {state?.ok ? (
          <p className="rounded bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-900">Reparto guardado.</p>
        ) : null}

        <label className="block text-xs">
          <span className="font-medium text-amber-950">GTQ recibido total (opcional)</span>
          <p className="mt-0.5 text-[11px] text-amber-900/85">
            Si difiere del total guardado en la operación, indíquelo aquí; el reparto debe cuadrar con este monto (≥
            aplicado hoy).
          </p>
          <div className="mt-1">
            <MoneyInput
              name="totalGtqRecibido"
              currency={FiatCurrency.GTQ}
              onBackendCommit={setTotalOverrideBackend}
            />
          </div>
        </label>

        <OtcAllocationLineFields
          lineIds={lineIds}
          lineMeta={lineMeta}
          onLineMetaChange={onLineMetaChange}
          operators={operators}
          bankAccounts={bankAccounts}
          onAddLine={addLine}
          onRemoveLine={removeLine}
          onAmountCommit={(lineId, backend) =>
            setAllocBackends((prev) => ({
              ...prev,
              [lineId]: backend,
            }))
          }
        />

        <p
          className={`text-xs font-medium ${
            allocationHint.tone === "ok" ? "text-emerald-800" : "text-amber-800"
          }`}
        >
          {allocationHint.text}
        </p>

        <button
          type="submit"
          disabled={pending}
          className="rounded bg-zinc-900 px-4 py-2 text-xs font-medium text-white disabled:opacity-60"
        >
          {pending ? "Guardando…" : "Guardar reparto e impactar saldos"}
        </button>
      </form>
    </section>
  );
}
