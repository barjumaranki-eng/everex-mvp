import type { FiatCurrency } from "@prisma/client";

/** Display-only monetary typing + backend-safe strings (no Prisma enum objects at runtime). */
export type MoneyFormatCurrency = FiatCurrency | "PLAIN" | "USDT";

const nfInt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0, useGrouping: true });
const nfMoneyUi = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
  useGrouping: true,
});

export function currencyPrefix(code: MoneyFormatCurrency): string {
  if (code === "PLAIN") return "";
  if (code === "USDT") return "USDT";
  if (code === "MXN" || code === "USD") return "$";
  if (code === "GTQ") return "Q";
  return "";
}

export function normalizeMoneyBackend(raw: string): string {
  return String(raw ?? "")
    .trim()
    .replace(/\s/g, "")
    .replace(/,/g, "");
}

function stripMoneyTyping(s: string): string {
  let t = s.replace(/,/g, "").replace(/[^\d.]/g, "");
  const fd = t.indexOf(".");
  if (fd !== -1) {
    t = t.slice(0, fd + 1) + t.slice(fd + 1).replace(/\./g, "");
  }
  return t;
}

function formatGroupedInt(intDigits: string): string {
  if (intDigits === "") return "";
  try {
    return nfInt.format(BigInt(intDigits));
  } catch {
    return intDigits;
  }
}

export function formatMoneyAmountCoreDisplay(n: number): string {
  if (!Number.isFinite(n)) return "";
  const rounded = Math.round(n * 100) / 100;
  if (Math.abs(rounded - Math.round(rounded)) < 1e-9) {
    return nfInt.format(Math.round(rounded));
  }
  return nfMoneyUi.format(rounded);
}

export function formatMoneyInput(rawVisible: string): { display: string; backend: string } {
  const cleaned = stripMoneyTyping(rawVisible);
  if (cleaned === "") return { display: "", backend: "" };

  if (cleaned === ".") {
    return { display: "0.", backend: "0." };
  }

  const hasDot = cleaned.includes(".");
  const [intRaw = "", fracRaw = ""] = cleaned.split(".");
  let intDigits = intRaw.replace(/\D/g, "");
  intDigits = intDigits.replace(/^0+(?=\d)/, "") || (hasDot || fracRaw.length > 0 ? "0" : intDigits === "0" ? "0" : "");

  const frac = fracRaw.replace(/\D/g, "").slice(0, 2);

  if (!hasDot) {
    if (intDigits === "") return { display: "", backend: "" };
    const grouped = formatGroupedInt(intDigits);
    return {
      display: grouped,
      backend: intDigits,
    };
  }

  const groupedInt = formatGroupedInt(intDigits);
  const intShown = groupedInt || "0";

  if (frac.length === 0) {
    return {
      display: `${intShown}.`,
      backend: `${intDigits}.`,
    };
  }

  return {
    display: `${intShown}.${frac}`,
    backend: `${intDigits}.${frac}`,
  };
}

export function finalizeMoneyInput(rawVisible: string): { display: string; backend: string } {
  const normalized = normalizeMoneyBackend(stripMoneyTyping(rawVisible));
  if (normalized === "" || normalized === ".") return { display: "", backend: "" };

  const n = Number(normalized);
  if (Number.isNaN(n)) return { display: "", backend: "" };

  const rounded = Math.round(n * 100) / 100;
  const isWhole = Math.abs(rounded - Math.round(rounded)) < 1e-9;
  const display = formatMoneyAmountCoreDisplay(rounded);
  const backend = isWhole ? String(Math.round(rounded)) : rounded.toFixed(2);
  return { display, backend };
}

export function formatMoneyDisplay(
  value: { toString(): string } | number | string | null | undefined,
  currency: MoneyFormatCurrency,
): string {
  if (value == null || value === "") return "—";
  const raw = typeof value === "number" ? String(value) : typeof value === "string" ? value : value.toString();
  const normalized = normalizeMoneyBackend(raw);
  if (normalized === "" || normalized === ".") return "—";
  const n = Number(normalized);
  if (Number.isNaN(n)) return "—";

  const core = formatMoneyAmountCoreDisplay(n);
  if (currency === "PLAIN") return core;
  if (currency === "USDT") return `USDT ${core}`;
  const p = currencyPrefix(currency);
  return `${p}${core}`;
}
