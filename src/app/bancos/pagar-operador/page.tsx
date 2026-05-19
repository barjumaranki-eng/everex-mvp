import Link from "next/link";
import { redirect } from "next/navigation";
import { FiatCurrency } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { canLiquidateOperatorBankGtq } from "@/lib/authz";
import { PagarOperadorForm } from "./PagarOperadorForm";

export default async function PagarOperadorPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canLiquidateOperatorBankGtq(user)) redirect("/bancos");

  const [operators, banks] = await Promise.all([
    prisma.operator.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.bankAccount.findMany({
      where: { active: true, currency: FiatCurrency.GTQ },
      orderBy: { label: "asc" },
      select: { id: true, label: true },
    }),
  ]);

  return (
    <main className="mx-auto max-w-lg px-4 py-6">
      <Link href="/bancos" className="text-sm text-blue-700 underline">
        ← Bancos
      </Link>
      <h1 className="mt-4 text-lg font-semibold">Pagar operador desde banco</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Débito en cuenta GTQ, reduce el saldo GTQ del operador y registra{" "}
        <span className="font-mono text-xs">PAGO_EVEREX_A_OPERADOR</span> en su libro mayor.
      </p>
      <PagarOperadorForm
        operators={operators.map((o) => ({ id: o.id, name: o.name }))}
        banks={banks.map((b) => ({ id: b.id, label: b.label }))}
      />
    </main>
  );
}
