"use client";

import { MoneyInput } from "@/app/components/MoneyInput";

export type OtcAllocOpt = { id: string; name: string };

type OperatorPayoutChoice = "GTQ" | "USDT";

export type OtcAllocLineMeta = {
  dest: string;
  operatorPayout: OperatorPayoutChoice;
};

export type OtcAllocLineDefaults = {
  operatorId?: string;
  bankAccountId?: string;
  amountBackend?: string;
  ref?: string;
  notes?: string;
};

type Props = {
  lineIds: number[];
  lineMeta: Record<number, OtcAllocLineMeta>;
  onLineMetaChange: (lineId: number, patch: Partial<OtcAllocLineMeta>) => void;
  operators: OtcAllocOpt[];
  bankAccounts: OtcAllocOpt[];
  onAddLine: () => void;
  onRemoveLine: (lineId: number) => void;
  onAmountCommit: (lineId: number, backend: string) => void;
  /** Valores iniciales al editar una operación existente. */
  allocLineDefaults?: Record<number, OtcAllocLineDefaults>;
};

export function OtcAllocationLineFields({
  lineIds,
  lineMeta,
  onLineMetaChange,
  operators,
  bankAccounts,
  onAddLine,
  onRemoveLine,
  onAmountCommit,
  allocLineDefaults,
}: Props) {
  return (
    <div className="space-y-3">
      {lineIds.map((lineId) => {
        const meta = lineMeta[lineId] ?? { dest: "", operatorPayout: "GTQ" };
        const isOperator = meta.dest === "OPERATOR";
        const isUsdt = isOperator && meta.operatorPayout === "USDT";
        const lineCurrency = isUsdt ? "USDT" : "GTQ";

        return (
          <div
            key={lineId}
            className="space-y-2 rounded border border-zinc-200 bg-zinc-50/80 p-3 sm:grid sm:grid-cols-12 sm:gap-2 sm:space-y-0"
          >
            <input type="hidden" name={`alloc_${lineId}_currency`} value={lineCurrency} />

            <label className="block sm:col-span-3">
              <span className="text-xs text-zinc-600">Destino</span>
              <select
                name={`alloc_${lineId}_dest`}
                required
                value={meta.dest}
                onChange={(e) => {
                  const dest = e.target.value;
                  onLineMetaChange(lineId, {
                    dest,
                    operatorPayout:
                      dest === "OPERATOR"
                        ? meta.operatorPayout
                        : "GTQ",
                  });
                }}
                className="mt-0.5 w-full rounded border border-zinc-300 px-2 py-1 text-xs"
              >
                <option value="">—</option>
                <option value="OPERATOR">Operador</option>
                <option value="EVEREX_BANK">Banco</option>
                <option value="CASH">Cash</option>
              </select>
            </label>

            <label className="block sm:col-span-3">
              <span className="text-xs text-zinc-600">Operador</span>
              <select
                name={`alloc_${lineId}_operatorId`}
                defaultValue={allocLineDefaults?.[lineId]?.operatorId ?? ""}
                className="mt-0.5 w-full rounded border border-zinc-300 px-2 py-1 text-xs"
              >
                <option value="">—</option>
                {operators.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block sm:col-span-3">
              <span className="text-xs text-zinc-600">Cuenta banco</span>
              <select
                name={`alloc_${lineId}_bankAccountId`}
                defaultValue={allocLineDefaults?.[lineId]?.bankAccountId ?? ""}
                className="mt-0.5 w-full rounded border border-zinc-300 px-2 py-1 text-xs"
              >
                <option value="">—</option>
                {bankAccounts.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>

            {isOperator ? (
              <label className="block sm:col-span-6">
                <span className="text-xs text-zinc-600">Moneda del pago al operador</span>
                <select
                  value={meta.operatorPayout}
                  onChange={(e) =>
                    onLineMetaChange(lineId, {
                      operatorPayout: e.target.value as OperatorPayoutChoice,
                    })
                  }
                  className="mt-0.5 w-full max-w-xs rounded border border-zinc-300 px-2 py-1 text-xs"
                >
                  <option value="GTQ">GTQ (libro y saldo operador en quetzales)</option>
                  <option value="USDT">USDT (inventario Everex; libro operador en USDT)</option>
                </select>
              </label>
            ) : null}

            <div className={isOperator ? "sm:col-span-6" : "sm:col-span-2"}>
              <span className="text-xs text-zinc-600">{isUsdt ? "Monto USDT" : "Monto GTQ"}</span>
              <div className="mt-0.5">
                <MoneyInput
                  name={`alloc_${lineId}_amount`}
                  currency={isUsdt ? "USDT" : "GTQ"}
                  required
                  defaultValue={allocLineDefaults?.[lineId]?.amountBackend ?? ""}
                  onBackendCommit={(backend) => onAmountCommit(lineId, backend)}
                />
              </div>
            </div>

            <div className="flex items-end gap-1 sm:col-span-1">
              {lineIds.length > 1 ? (
                <button
                  type="button"
                  onClick={() => onRemoveLine(lineId)}
                  className="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100"
                >
                  Quitar
                </button>
              ) : (
                <span className="text-xs text-zinc-400 sm:pl-1">—</span>
              )}
            </div>

            <label className="block sm:col-span-12">
              <span className="text-xs text-zinc-600">Referencia (opcional)</span>
              <input
                name={`alloc_${lineId}_ref`}
                defaultValue={allocLineDefaults?.[lineId]?.ref ?? ""}
                className="mt-0.5 w-full rounded border border-zinc-300 px-2 py-1 text-xs"
                placeholder="Ref. interna / comprobante"
              />
            </label>
            <label className="block sm:col-span-12">
              <span className="text-xs text-zinc-600">Notas (opcional)</span>
              <textarea
                name={`alloc_${lineId}_notes`}
                rows={2}
                defaultValue={allocLineDefaults?.[lineId]?.notes ?? ""}
                className="mt-0.5 w-full rounded border border-zinc-300 px-2 py-1 text-xs"
                placeholder="Ej. compensación acordada con operador"
              />
            </label>
          </div>
        );
      })}

      <button
        type="button"
        onClick={onAddLine}
        className="rounded border border-dashed border-zinc-400 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
      >
        + Agregar línea
      </button>
    </div>
  );
}
