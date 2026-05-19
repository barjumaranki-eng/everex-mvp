import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { canRunOperations } from "@/lib/authz";
import { ClientesCreateForm } from "./ClientesCreateForm";

export default async function ClientesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const rows = await prisma.client.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-lg font-semibold">Clientes</h1>
      {canRunOperations(user) ? <ClientesCreateForm /> : null}
      <section className="mt-8">
        <h2 className="text-sm font-medium">Listado</h2>
        <ul className="mt-2 text-sm">
          {rows.map((c) => (
            <li key={c.id} className="border-b border-zinc-100 py-1">
              <Link href={`/clientes/${c.id}`} className="text-blue-700 underline">
                {c.name}
              </Link>
              {c.phone ? <span className="text-zinc-500"> · {c.phone}</span> : null}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
