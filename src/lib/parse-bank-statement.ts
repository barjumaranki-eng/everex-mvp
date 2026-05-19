import { Prisma } from "@prisma/client";
import * as XLSX from "xlsx";

export type ParsedStmtRow = {
  rowDate: Date;
  description: string;
  reference?: string;
  credit?: Prisma.Decimal;
  debit?: Prisma.Decimal;
  balanceAfter?: Prisma.Decimal;
};

function norm(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function parseMoney(raw: string | undefined): Prisma.Decimal | undefined {
  if (raw == null || String(raw).trim() === "") return undefined;
  const t = String(raw).replace(/,/g, "").trim();
  if (t === "" || t === "-") return undefined;
  const n = Number(t);
  if (Number.isNaN(n)) return undefined;
  return new Prisma.Decimal(n);
}

function pick(headers: string[], row: string[], keys: string[]): string | undefined {
  for (const k of keys) {
    const i = headers.indexOf(k);
    if (i >= 0 && row[i] != null) return String(row[i]).trim();
  }
  return undefined;
}

function parseRowObject(obj: Record<string, unknown>): ParsedStmtRow | null {
  const keys = Object.keys(obj).reduce<Record<string, string>>((acc, k) => {
    acc[norm(k)] = k;
    return acc;
  }, {});

  const get = (...cands: string[]): string | undefined => {
    for (const c of cands) {
      const orig = keys[norm(c)];
      if (orig && obj[orig] != null && String(obj[orig]).trim() !== "") return String(obj[orig]).trim();
    }
    return undefined;
  };

  const fecha = get("fecha", "date", "f");
  if (!fecha) return null;
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return null;

  const desc = get("descripcion", "description", "concepto", "detalle") ?? "";
  const ref = get("referencia", "reference", "ref", "no referencia");
  const credit = parseMoney(get("credito", "credit", "abono", "deposito"));
  const debit = parseMoney(get("debito", "debit", "cargo", "retiro"));
  const saldo = parseMoney(get("saldo", "balance"));

  if (!credit && !debit) return null;

  return {
    rowDate: d,
    description: desc,
    reference: ref,
    credit,
    debit,
    balanceAfter: saldo,
  };
}

export function parseBankStatementCsv(text: string): ParsedStmtRow[] {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return [];
  const sep = lines[0].split(";").length > lines[0].split(",").length ? ";" : ",";
  const headers = lines[0].split(sep).map((h) => norm(h.replace(/^"|"$/g, "")));
  const out: ParsedStmtRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(sep).map((c) => c.replace(/^"|"$/g, "").trim());
    const fecha = pick(headers, cells, ["fecha", "date"]);
    if (!fecha) continue;
    const d = new Date(fecha);
    if (Number.isNaN(d.getTime())) continue;
    const desc = pick(headers, cells, ["descripcion", "description", "concepto", "detalle"]) ?? "";
    const ref = pick(headers, cells, ["referencia", "reference", "ref"]);
    const credit = parseMoney(pick(headers, cells, ["credito", "credit", "abono"]));
    const debit = parseMoney(pick(headers, cells, ["debito", "debit", "cargo"]));
    const saldo = parseMoney(pick(headers, cells, ["saldo", "balance"]));
    if (!credit && !debit) continue;
    out.push({ rowDate: d, description: desc, reference: ref, credit, debit, balanceAfter: saldo });
  }
  return out;
}

export function parseBankStatementXlsx(buf: Buffer): ParsedStmtRow[] {
  const wb = XLSX.read(buf, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  const out: ParsedStmtRow[] = [];
  for (const row of rows) {
    const p = parseRowObject(row);
    if (p) out.push(p);
  }
  return out;
}
