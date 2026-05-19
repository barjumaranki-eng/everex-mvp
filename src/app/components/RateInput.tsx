"use client";

import { useCallback, useState } from "react";
import { finalizeRateInput, formatRateInput } from "@/lib/format-rate";

type Props = {
  name: string;
  defaultValue?: string;
  required?: boolean;
  className?: string;
  inputClassName?: string;
};

/**
 * Tasas (ej. MXN→GTQ, XE): hasta 6 decimales, sin formateo tipo moneda de 2 decimales al escribir.
 */
export function RateInput({ name, defaultValue = "", required, className, inputClassName }: Props) {
  const init = defaultValue.trim() ? finalizeRateInput(defaultValue) : { display: "", backend: "" };
  const [display, setDisplay] = useState(init.display);
  const [backend, setBackend] = useState(init.backend);

  const onChange = useCallback((raw: string) => {
    const next = formatRateInput(raw);
    setDisplay(next.display);
    setBackend(next.backend);
  }, []);

  const onBlur = useCallback(() => {
    if (!display.trim()) {
      setBackend("");
      return;
    }
    const fin = finalizeRateInput(display);
    setDisplay(fin.display);
    setBackend(fin.backend);
  }, [display]);

  return (
    <div className={className ?? ""}>
      <div className="flex min-h-[34px] items-stretch overflow-hidden rounded border border-zinc-400 bg-white focus-within:ring-1 focus-within:ring-zinc-500">
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          required={required}
          aria-required={required}
          title="Tasa: hasta 6 decimales (ej. 7.658988, 17.312500). type=text permite escritura flexible; el valor respeta 6 decimales."
          value={display}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          className={
            inputClassName ??
            "min-w-0 flex-1 border-0 bg-transparent px-2 py-1 text-sm outline-none focus:ring-0"
          }
        />
      </div>
      <input type="hidden" name={name} value={backend} />
    </div>
  );
}
