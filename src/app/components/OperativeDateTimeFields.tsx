"use client";

import { useMemo } from "react";
import { formatOperativeDateInputValue, formatOperativeTimeInputValue } from "@/lib/operative-datetime";

type Props = {
  className?: string;
  /** ISO 8601 desde el servidor (p. ej. edición de compra) para precargar. */
  defaultOperativeIso?: string;
};

export function OperativeDateTimeFields({ className = "", defaultOperativeIso }: Props) {
  const defaults = useMemo(() => {
    const n = defaultOperativeIso ? new Date(defaultOperativeIso) : new Date();
    if (Number.isNaN(n.getTime())) {
      const f = new Date();
      return { date: formatOperativeDateInputValue(f), time: formatOperativeTimeInputValue(f) };
    }
    return { date: formatOperativeDateInputValue(n), time: formatOperativeTimeInputValue(n) };
  }, [defaultOperativeIso]);

  return (
    <fieldset
      className={`rounded border border-zinc-300 bg-zinc-50/80 p-3 text-sm ${className}`.trim()}
    >
      <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-zinc-700">
        Fecha operativa
      </legend>
      <p className="mt-1 text-xs text-zinc-600">
        Fecha y hora reales de la transacción (puede ser anterior al momento de registro en el sistema).
      </p>
      <div className="mt-2 flex flex-wrap items-end gap-3">
        <label className="block min-w-[10rem]">
          <span className="text-xs font-medium text-zinc-700">Fecha</span>
          <input
            type="date"
            name="operativeDate"
            defaultValue={defaults.date}
            className="mt-0.5 block w-full rounded border border-zinc-400 px-2 py-1"
          />
        </label>
        <label className="block min-w-[8rem]">
          <span className="text-xs font-medium text-zinc-700">Hora</span>
          <input
            type="time"
            name="operativeTime"
            defaultValue={defaults.time}
            step={60}
            className="mt-0.5 block w-full rounded border border-zinc-400 px-2 py-1"
          />
        </label>
      </div>
    </fieldset>
  );
}
