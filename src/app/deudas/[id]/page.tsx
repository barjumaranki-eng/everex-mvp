import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { canManageReceivablesAndPayables, canViewReceivablesAndPayables } from "@/lib/authz";
import { formatMoneyDisplay } from "@/lib/format-money";
import {
  hasPayableEntityLink,
  resolvePayableDisplayLabel,
  resolvePayableListSubtitle,
} from "@/lib/payable-creditor";
import { isClientOtcAdvancePayable } from "@/lib/everex-payable-client-advance";
import { PagoPayableForm } from "../PagoPayableForm";

export default async function PayableDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canViewReceivablesAndPayables(user)) redirect("/dashboard");
  const { id } = await params;

  const p = await prisma.everexPayable.findUnique({
    where: { id },
    include: {
      client: true,
      operator: true,
      provider: true,
      payments: { orderBy: { paymentDate: "desc" } },
    },
  });
  if (!p) notFound();

  const banks = await prisma.bankAccount.findMany({ where: { active: true }, orderBy: { label: "asc" } });
  const label = resolvePayableDisplayLabel(p);
  const linked = hasPayableEntityLink(p);

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <Link href="/deudas" className="text-sm text-blue-700 underline">
        ← Deudas
      </Link>
      <h1 className="mt-4 text-lg font-semibold">{label}</h1>
      <p className="text-sm text-zinc-600">
        Saldo: {formatMoneyDisplay(p.balance, p.currency)} · Original: {formatMoneyDisplay(p.originalAmount, p.currency)}
      </p>
      <p className="mt-2 text-sm">
        {isClientOtcAdvancePayable(p) ? (
          <span className="mr-1 rounded bg-amber-100 px-1 text-xs font-medium text-amber-900">Anticipo cliente</span>
        ) : null}
        {resolvePayableListSubtitle(p)}
      </p>
      {!linked ? <p className="mt-1 text-sm font-medium text-amber-800">Registro antiguo sin relación</p> : null}
      <p className="mt-2 text-sm font-medium text-zinc-800">{p.reason}</p>
      {p.notes ? <p className="text-sm text-zinc-500">{p.notes}</p> : null}

      {p.active && canManageReceivablesAndPayables(user) ? (
        <PagoPayableForm payableId={p.id} banks={banks.map((b) => ({ id: b.id, label: b.label }))} />
      ) : null}

      <h2 className="mt-8 text-sm font-medium">Pagos</h2>
      <ul className="mt-2 text-sm">
        {p.payments.map((x) => (
          <li key={x.id} className="border-b border-zinc-100 py-1 tabular-nums">
            {x.paymentDate.toLocaleDateString()} — {formatMoneyDisplay(x.amount, x.currency)} ({x.channel})
          </li>
        ))}
      </ul>
    </main>
  );
}
