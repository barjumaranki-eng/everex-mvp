import Link from "next/link";
import { UserRole } from "@prisma/client";
import { getSessionUser } from "@/lib/session";
import { logoutAction } from "@/app/login/login.actions";
import { getRoleHomePath, isRbacAdminRole } from "@/lib/rbac";
import { isAppUserRole } from "@/lib/roles";
import {
  canCreateBankMovement,
  canImportBankStatements,
  canManageBanks,
  canViewExpenses,
  canViewReceivablesAndPayables,
  canViewTreasurySensitiveModules,
  canRunOperations,
  canViewEstadoFinanciero,
  usesOperationalDashboard,
} from "@/lib/authz";

function roleLabel(role: UserRole): string {
  switch (role) {
    case UserRole.ADMIN:
      return "Admin";
    case UserRole.TESORERIA:
      return "Tesorería";
    case UserRole.CONCILIACION:
      return "Conciliación";
    case UserRole.OPERACIONES:
      return "Operaciones";
    case UserRole.LECTURA:
      return "Solo lectura";
    default:
      return role;
  }
}

export async function Nav() {
  const user = await getSessionUser();
  if (!user) return null;

  if (!isAppUserRole(user.role)) {
    return (
      <header className="border-b border-amber-300 bg-amber-50">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3 text-sm text-amber-950">
          <span className="font-medium">Everex</span>
          <span className="text-xs">Rol de sesión no reconocido. Cierre sesión o vuelva a entrar.</span>
          <form action={logoutAction} className="ml-auto">
            <button type="submit" className="text-xs text-amber-900 underline">
              Salir
            </button>
          </form>
        </div>
      </header>
    );
  }

  const home = getRoleHomePath(user.role);
  const admin = isRbacAdminRole(user.role);
  const ops = canRunOperations(user);
  const bankCreate = canCreateBankMovement(user);
  const readonly = user.role === UserRole.LECTURA;
  const expenses = canViewExpenses(user) || readonly;
  const arAp = canViewReceivablesAndPayables(user);
  const concilia = canImportBankStatements(user);
  const treasurySensitive = canViewTreasurySensitiveModules(user);
  const estadoFin = canViewEstadoFinanciero(user);

  return (
    <header className="border-b border-zinc-300 bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3 text-sm">
        <span className="font-medium text-zinc-800">Everex</span>
        <span className="text-xs text-zinc-600">
          {user.displayName ?? user.email} · {roleLabel(user.role)}
        </span>

        <Link className="text-blue-700 underline" href={home}>
          Inicio
        </Link>

        <Link className="text-blue-700 underline" href="/dashboard">
          Dashboard
        </Link>

        {ops ? (
          <Link className="text-blue-700 underline" href="/operaciones/nueva">
            Nueva operación
          </Link>
        ) : null}

        <Link className="text-blue-700 underline" href="/operaciones">
          Operaciones
        </Link>

        {ops || admin || readonly ? (
          <Link className="text-blue-700 underline" href="/compras-usdt">
            Compras USDT
          </Link>
        ) : null}

        <Link className="text-blue-700 underline" href="/clientes">
          Clientes
        </Link>

        <Link className="text-blue-700 underline" href="/operadores">
          Operadores
        </Link>

        {usesOperationalDashboard(user) ? (
          <Link className="text-blue-700 underline" href="/operadores#estado-cuenta-operadores">
            Estado de cuenta operadores
          </Link>
        ) : null}

        <Link className="text-blue-700 underline" href="/proveedores">
          Proveedor MX
        </Link>

        <Link className="text-blue-700 underline" href="/bancos">
          Bancos
        </Link>

        {canManageBanks(user) && treasurySensitive ? (
          <Link className="text-blue-700 underline" href="/bancos/saldos-iniciales">
            Saldos iniciales
          </Link>
        ) : null}

        {expenses ? (
          <Link className="text-blue-700 underline" href="/gastos">
            Gastos
          </Link>
        ) : null}

        {arAp ? (
          <>
            <Link className="text-blue-700 underline" href="/clientes-deudores">
              Clientes deudores
            </Link>
            <Link className="text-blue-700 underline" href="/deudas">
              Deudas
            </Link>
          </>
        ) : null}

        {concilia ? (
          <Link className="text-blue-700 underline" href="/conciliacion-bancaria">
            Conciliación
          </Link>
        ) : null}

        {user.role === UserRole.ADMIN ? (
          <Link className="text-blue-700 underline" href="/wallet">
            Wallet USDT
          </Link>
        ) : null}

        {estadoFin ? (
          <Link className="text-blue-700 underline" href="/estado-financiero">
            Estado financiero
          </Link>
        ) : null}

        {bankCreate || admin ? (
          <Link className="text-blue-700 underline" href="/bancos/nuevo-movimiento">
            + Movimiento banco
          </Link>
        ) : null}

        <form action={logoutAction} className="ml-auto">
          <button type="submit" className="text-xs text-zinc-600 underline">
            Salir
          </button>
        </form>
      </div>
    </header>
  );
}
