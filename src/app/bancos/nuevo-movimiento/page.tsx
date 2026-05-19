import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { canCreateBankMovement } from "@/lib/authz";
import { NuevoMovimientoForm } from "./NuevoMovimientoForm";

export default async function NuevoMovimientoPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canCreateBankMovement(user)) redirect("/bancos");

  const accounts = await prisma.bankAccount.findMany({
    where: { active: true },
    orderBy: { label: "asc" },
  });

  return (
    <main className="mx-auto max-w-lg px-4 py-6">
      <Link href="/bancos" className="text-sm text-blue-700 underline">
        ← Bancos
      </Link>
      <h1 className="mt-4 text-lg font-semibold">Nuevo movimiento bancario</h1>
      <NuevoMovimientoForm
        accounts={accounts.map((a) => ({ id: a.id, label: a.label, currency: a.currency }))}
      />
    </main>
  );
}
