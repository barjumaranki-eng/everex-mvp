import Link from "next/link";

import { redirect } from "next/navigation";

import { FiatCurrency } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { getSessionUser } from "@/lib/session";

import { canManageOperatorCatalog } from "@/lib/authz";

import { formatMoneyDisplay } from "@/lib/format-money";

import { OperadorAltaForm } from "./OperadorAltaForm";

import { OperadorRowManage } from "./OperadorRowManage";

import { getOperatorBalance, getOperatorLedgerSummary } from "@/lib/operator-ledger";

export const dynamic = "force-dynamic";

export default async function OperadoresPage() {

  const user = await getSessionUser();

  if (!user) redirect("/login");



  const allOperators = await prisma.operator.findMany({ orderBy: { name: "asc" } });



  const [balances, summaries] = await Promise.all([

    Promise.all(allOperators.map((o) => getOperatorBalance(o.id))),

    Promise.all(allOperators.map((o) => getOperatorLedgerSummary(o.id))),

  ]);

  const balById = new Map(allOperators.map((o, i) => [o.id, balances[i]!]));

  const meta = new Map(allOperators.map((o, i) => [o.id, summaries[i]!]));



  const activeOps = allOperators.filter((o) => o.active);

  const inactiveOps = allOperators.filter((o) => !o.active);



  return (

    <main className="mx-auto max-w-3xl px-4 py-6" id="estado-cuenta-operadores">

      <h1 className="text-lg font-semibold">Operadores</h1>

      <p className="mt-1 text-sm text-zinc-600">

        Estado de cuenta interno (GTQ). Los clientes con operaciones GTQ y MXN siguen en{" "}

        <Link href="/clientes" className="text-blue-700 underline">

          Clientes

        </Link>

        ; aquí solo operadores de mesa.

        {canManageOperatorCatalog(user)

          ? " Puede dar de alta, corregir nombres, archivar o eliminar filas vacías sin historial."

          : " Consulta de saldos y movimientos; la administración del catálogo la hace el rol operaciones o admin."}

      </p>

      <p className="mt-2 text-xs text-zinc-500">

        Compras USDT con <code className="text-zinc-600">counterparty = OPERATOR</code> suman GTQ y USDT al operador; las

        de <code className="text-zinc-600">PROVIDER_MX</code> suman al proveedor MX y, si llevan{" "}

        <code className="text-zinc-600">operatorId</code>, también al operador asociado e inventario. PAKA no es operador

        por sí solo.{" "}

        <Link href="/proveedores" className="text-blue-700 underline">

          Proveedores MX

        </Link>

        .

      </p>

      {canManageOperatorCatalog(user) ? <OperadorAltaForm /> : null}



      <h2 className="mt-8 text-sm font-medium text-zinc-800">Activos</h2>

      <ul className="mt-2 space-y-3 text-sm">

        {activeOps.map((o) => {

          const b = balById.get(o.id)!;

          return (

            <li key={o.id} className="rounded border border-zinc-200 bg-white px-3 py-2">

              <div className="flex flex-wrap items-center justify-between gap-2">

                <div>

                  <Link href={`/operadores/${o.id}`} className="font-medium text-blue-700 underline">

                    {o.name}

                  </Link>

                  <p className="mt-0.5 text-xs text-zinc-500">Ver estado de cuenta y libro mayor →</p>

                </div>

                <div className="text-right text-xs tabular-nums">

                  <div className="font-medium">{formatMoneyDisplay(b.balanceGtq, FiatCurrency.GTQ)}</div>

                  <div className="text-zinc-500">{formatMoneyDisplay(b.balanceUsdt, "USDT")} libro</div>

                </div>

              </div>

              {canManageOperatorCatalog(user) ? (

                <OperadorRowManage id={o.id} name={o.name} active={o.active} canDelete={meta.get(o.id)!.canHardDelete} />

              ) : null}

            </li>

          );

        })}

      </ul>



      {inactiveOps.length > 0 ? (

        <>

          <h2 className="mt-10 text-sm font-medium text-zinc-800">Archivados (ocultos en formularios nuevos)</h2>

          <ul className="mt-2 space-y-3 text-sm">

            {inactiveOps.map((o) => {

              const b = balById.get(o.id)!;

              return (

                <li key={o.id} className="rounded border border-zinc-300 bg-zinc-50 px-3 py-2">

                  <div className="flex flex-wrap items-center justify-between gap-2">

                    <div>

                      <Link href={`/operadores/${o.id}`} className="font-medium text-blue-700 underline">

                        {o.name}

                      </Link>

                      <p className="mt-0.5 text-xs text-zinc-500">Ver estado de cuenta y libro mayor →</p>

                    </div>

                    <div className="text-right text-xs tabular-nums">

                      <div className="font-medium">{formatMoneyDisplay(b.balanceGtq, FiatCurrency.GTQ)}</div>

                      <div className="text-zinc-500">{formatMoneyDisplay(b.balanceUsdt, "USDT")} libro</div>

                    </div>

                  </div>

                  {canManageOperatorCatalog(user) ? (

                    <OperadorRowManage id={o.id} name={o.name} active={o.active} canDelete={meta.get(o.id)!.canHardDelete} />

                  ) : null}

                </li>

              );

            })}

          </ul>

        </>

      ) : null}

    </main>

  );

}

