import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { canManageReceivablesAndPayables } from "@/lib/authz";
import { formatMoneyDisplay } from "@/lib/format-money";
import { PagoReceivableForm } from "../PagoReceivableForm";

export default async function ReceivableDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { id } = await params;

  const r = await prisma.clientReceivable.findUnique({
    where: { id },
    include: { client: true, payments: { orderBy: { paymentDate: "desc" } } },
  });
  if (!r) notFound();

  const banks = await prisma.bankAccount.findMany({ where: { active: true }, orderBy: { label: "asc" } });

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <Link href="/clientes-deudores" className="text-sm text-blue-700 underline">
        ← Clientes deudores
      </Link>
      <h1 className="mt-4 text-lg font-semibold">{r.client.name}</h1>
      <p className="text-sm text-zinc-600">
        Saldo: {formatMoneyDisplay(r.balance, r.currency)} · Original: {formatMoneyDisplay(r.originalAmount, r.currency)}
      </p>
      <p className="mt-2 text-sm">{r.reason}</p>
      {r.notes ? <p className="text-sm text-zinc-600">{r.notes}</p> : null}

      {r.active && canManageReceivablesAndPayables(user) ? (
        <PagoReceivableForm receivableId={r.id} banks={banks.map((b) => ({ id: b.id, label: b.label }))} />
      ) : null}

      <h2 className="mt-8 text-sm font-medium">Pagos</h2>
      <ul className="mt-2 text-sm">
        {r.payments.map((p) => (
          <li key={p.id} className="border-b border-zinc-100 py-1 tabular-nums">
            {p.paymentDate.toLocaleDateString()} — {formatMoneyDisplay(p.amount, p.currency)} ({p.channel})
          </li>
        ))}
      </ul>
    </main>
  );
}
