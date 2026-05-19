import { Prisma } from "@prisma/client";

/** Tasas OTC: sin símbolo, sin miles, hasta 6 decimales en UI (precisión distinta del dinero). */
export const MAX_RATE_DECIMALS = 6;

/** Cadena limpia para enviar al servidor (sin espacios ni comas). */
export function normalizeRateBackend(raw: string): string {
  return String(raw ?? "")
    .trim()
    .replace(/\s/g, "")
    .replace(/,/g, "");
}

function stripRateTyping(s: string): string {
  let t = s.replace(/,/g, "").replace(/[^\d.]/g, "");
  const fd = t.indexOf(".");
  if (fd !== -1) {
    t = t.slice(0, fd + 1) + t.slice(fd + 1).replace(/\./g, "");
  }
  return t;
}

function normalizeIntegerDigits(intDigits: string): string {
  if (intDigits === "") return "";
  const trimmed = intDigits.replace(/^0+/, "");
  return trimmed === "" ? "0" : trimmed;
}

/**
 * UX al escribir: solo dígitos y un punto, parte entera sin separadores de miles,
 * hasta MAX_RATE_DECIMALS decimales (sin redondeo ni padding tipo dinero).
 */
export function formatRateInput(rawVisible: string): { display: string; backend: string } {
  const cleaned = stripRateTyping(rawVisible);
  if (cleaned === "") return { display: "", backend: "" };

  if (cleaned === ".") {
    return { display: "0.", backend: "0." };
  }

  const hasDot = cleaned.includes(".");
  const [intRaw = "", fracRaw = ""] = cleaned.split(".");
  const intDigits = intRaw.replace(/\D/g, "");
  const frac = fracRaw.replace(/\D/g, "").slice(0, MAX_RATE_DECIMALS);

  if (!hasDot) {
    const id = normalizeIntegerDigits(intDigits);
    if (id === "") return { display: "", backend: "" };
    return { display: id, backend: id };
  }

  const id = intDigits === "" ? "0" : normalizeIntegerDigits(intDigits);

  if (frac.length === 0) {
    return { display: `${id}.`, backend: `${id}.` };
  }

  return { display: `${id}.${frac}`, backend: `${id}.${frac}` };
}

/** Blur: validar número; no acorta decimales válidos ni fuerza ceros finales. */
export function finalizeRateInput(rawVisible: string): { display: string; backend: string } {
  let { display, backend } = formatRateInput(rawVisible);
  if (backend === "") return { display: "", backend: "" };

  if (backend.endsWith(".")) {
    backend = backend.slice(0, -1);
    display = display.endsWith(".") ? display.slice(0, -1) : display;
  }

  const n = Number(backend);
  if (Number.isNaN(n)) return { display: "", backend: "" };

  return { display, backend };
}

function stripFracTrailingZeros(s: string): string {
  if (!s.includes(".")) return s;
  const [i, f] = s.split(".");
  const ft = f.replace(/0+$/, "");
  return ft.length > 0 ? `${i}.${ft}` : i;
}

/** Listados / dashboard: sin miles; hasta 6 decimales (redondeo solo para vista). */
export function formatRateDisplay(
  value: Prisma.Decimal | number | string | null | undefined,
): string {
  if (value == null || value === "") return "—";
  const raw =
    typeof value === "number"
      ? String(value)
      : typeof value === "string"
        ? value
        : value instanceof Prisma.Decimal
          ? value.toString()
          : String(value);
  const normalized = normalizeRateBackend(raw);
  if (normalized === "" || normalized === ".") return "—";

  let d: Prisma.Decimal;
  try {
    d = new Prisma.Decimal(normalized);
  } catch {
    return "—";
  }
  if (!d.isFinite()) return "—";

  const s = d.toDecimalPlaces(MAX_RATE_DECIMALS).toFixed(MAX_RATE_DECIMALS);
  return stripFracTrailingZeros(s);
}

/** Parseo seguro de tasa desde formulario (hasta 6 decimales en cadena). */
export function parseRateToDecimal(raw: string): Prisma.Decimal {
  const n = normalizeRateBackend(String(raw ?? ""));
  if (n === "" || n === ".") return new Prisma.Decimal(0);
  try {
    const d = new Prisma.Decimal(n);
    return d.isFinite() ? d : new Prisma.Decimal(0);
  } catch {
    return new Prisma.Decimal(0);
  }
}

export function parseRateBackendNumber(raw: string): number {
  const d = parseRateToDecimal(raw);
  const x = Number(d.toString());
  return Number.isFinite(x) ? x : 0;
}
