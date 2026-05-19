"use client";

import { useCallback, useState } from "react";
import { currencyPrefix, finalizeMoneyInput, formatMoneyInput, type MoneyFormatCurrency } from "@/lib/format-money";
import { finalizeRateInput, formatRateInput } from "@/lib/format-rate";

type Props = {
  name: string;
  currency: MoneyFormatCurrency;
  /** `rate`: hasta 6 decimales (tasas XE, GTQ/USDT, MXN→GTQ). `money` (defecto): montos con 2 decimales. */
  mode?: "money" | "rate";
  defaultValue?: string;
  required?: boolean;
  className?: string;
  inputClassName?: string;
  onBackendCommit?: (backend: string) => void;
};

export function MoneyInput({
  name,
  currency,
  mode = "money",
  defaultValue = "",
  required,
  className,
  inputClassName,
  onBackendCommit,
}: Props) {
  const initParsed = defaultValue.trim()
    ? mode === "rate"
      ? finalizeRateInput(defaultValue)
      : finalizeMoneyInput(defaultValue)
    : { display: "", backend: "" };
  const initial = initParsed.display;
  const initialBackend = initParsed.backend;

  const [display, setDisplay] = useState(initial);
  const [backend, setBackend] = useState(initialBackend);

  const prefix = currency === "PLAIN" ? "" : currencyPrefix(currency);

  const onChange = useCallback(
    (raw: string) => {
      const next = mode === "rate" ? formatRateInput(raw) : formatMoneyInput(raw);
      setDisplay(next.display);
      setBackend(next.backend);
    },
    [mode],
  );

  const onBlur = useCallback(() => {
    if (!display.trim()) {
      setBackend("");
      onBackendCommit?.("");
      return;
    }
    const fin = mode === "rate" ? finalizeRateInput(display) : finalizeMoneyInput(display);
    setDisplay(fin.display);
    setBackend(fin.backend);
    onBackendCommit?.(fin.backend);
  }, [display, onBackendCommit, mode]);

  return (
    <div className={className ?? ""}>
      <div className="flex min-h-[34px] items-stretch overflow-hidden rounded border border-zinc-400 bg-white focus-within:ring-1 focus-within:ring-zinc-500">
        {prefix ? (
          <span className="flex shrink-0 items-center border-r border-zinc-200 bg-zinc-50 px-2 text-xs font-medium text-zinc-600 select-none">
            {prefix}
          </span>
        ) : null}
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          required={required}
          aria-required={required}
          title={mode === "rate" ? "Tasa: hasta 6 decimales (ej. 7.658988)" : undefined}
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
