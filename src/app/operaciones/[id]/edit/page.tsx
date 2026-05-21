import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { canEditOtcOperation } from "@/lib/authz";
import { EditOtcOperationForm } from "../../EditOtcOperationForm";

export default async function EditOperacionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canEditOtcOperation(user)) redirect("/operaciones");

  const { id } = await params;
  const op = await prisma.otcOperation.findUnique({
    where: { id },
    include: {
      allocations: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!op) notFound();

  const clientOr: Prisma.ClientWhereInput[] = [{ active: true }];
  if (op.clientId) clientOr.push({ id: op.clientId });

  const [clients, operators, bankAccounts] = await Promise.all([
    prisma.client.findMany({ where: { OR: clientOr }, orderBy: { name: "asc" } }),
    prisma.operator.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.bankAccount.findMany({ where: { active: true }, orderBy: { label: "asc" } }),
  ]);

  const initialTotal = op.totalFiat.toString();

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <Link href={`/operaciones/${id}`} className="text-sm text-blue-700 underline">
        ← Volver a operación
      </Link>
      <h1 className="mt-4 text-lg font-semibold">Editar operación {op.ref.slice(0, 8)}</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Se revierten movimientos de reparto vinculados y se vuelven a generar con los nuevos datos. Requiere que no haya
        pagos aplicados al anticipo Everex del cliente.
      </p>

      <EditOtcOperationForm
        operationId={op.id}
        clients={clients.map((c) => ({ id: c.id, name: c.name }))}
        operators={operators.map((o) => ({ id: o.id, name: o.name }))}
        bankAccounts={bankAccounts.map((b) => ({ id: b.id, name: b.label }))}
        initialSide={op.side}
        initialClientId={op.clientId}
        initialUsdtBackend={op.usdtAmount.toString()}
        initialRateBackend={op.rateFiatPerUsdt.toString()}
        initialTotalFiatBackend={initialTotal}
        initialNotes={op.notes ?? ""}
        defaultOperativeIso={op.createdAt.toISOString()}
        initialFiatRecibidoRealBackend={op.fiatRecibidoReal?.toString() ?? ""}
        initialUsdtEntregadoRealBackend={op.usdtEntregadoReal?.toString() ?? ""}
        initialAllocations={op.allocations.map((a) => ({
          destination: a.destination,
          operatorId: a.operatorId,
          bankAccountId: a.bankAccountId,
          amount: a.amount,
          currency: a.currency,
          reference: a.reference,
          notes: a.notes,
        }))}
      />
    </main>
  );
}
