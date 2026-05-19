import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { canCreateOtcOperation } from "@/lib/authz";
import { NuevaOperacionShell } from "../NuevaOperacionShell";

export default async function NuevaOperacionPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canCreateOtcOperation(user)) redirect("/operaciones");

  const [clients, operators, banks, providers] = await Promise.all([
    prisma.client.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.operator.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.bankAccount.findMany({ where: { active: true }, orderBy: { label: "asc" } }),
    prisma.mexicoProvider.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-lg font-semibold">Nueva operación OTC</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Mesa GTQ, Cliente MXN Spread (utilidad USDT, mueve inventario) u operador MXN→USDT.
      </p>
      <NuevaOperacionShell
        clients={clients.map((c) => ({ id: c.id, name: c.name }))}
        operators={operators.map((o) => ({ id: o.id, name: o.name }))}
        bankAccounts={banks.map((b) => ({ id: b.id, name: b.label }))}
        providers={providers.map((p) => ({ id: p.id, name: p.name }))}
      />
    </main>
  );
}
