import type { User } from "@prisma/client";
import { UserRole } from "@prisma/client";

export function isAdmin(user: User | null): user is User {
  return !!user && user.role === UserRole.ADMIN;
}

export function isOperationsRole(user: User | null): boolean {
  return !!user && user.role === UserRole.OPERACIONES;
}

export function isTreasury(user: User | null): boolean {
  return !!user && (user.role === UserRole.ADMIN || user.role === UserRole.TESORERIA);
}

export function isConciliation(user: User | null): boolean {
  return !!user && (user.role === UserRole.ADMIN || user.role === UserRole.CONCILIACION);
}

export function isReadOnly(user: User | null): boolean {
  return !!user && user.role === UserRole.LECTURA;
}

/** Compras USDT, operaciones OTC, catálogos operativos (mesa + conciliación operativa). */
export function canRunOperations(user: User | null): boolean {
  if (!user || user.role === UserRole.LECTURA) return false;
  return (
    user.role === UserRole.ADMIN ||
    user.role === UserRole.OPERACIONES ||
    user.role === UserRole.CONCILIACION
  );
}

/** Movimientos bancarios y conciliación simple. */
export function canManageBanks(user: User | null): boolean {
  if (!user || user.role === UserRole.LECTURA) return false;
  return (
    user.role === UserRole.ADMIN ||
    user.role === UserRole.TESORERIA ||
    user.role === UserRole.CONCILIACION
  );
}

export function canCreateBankMovement(user: User | null): boolean {
  if (!user || user.role === UserRole.LECTURA) return false;
  return user.role === UserRole.ADMIN || user.role === UserRole.TESORERIA;
}

/** Pago GTQ al operador desde cuenta bancaria Everex (débito banco + libro operador). */
export function canLiquidateOperatorBankGtq(user: User | null): boolean {
  if (!user || user.role === UserRole.LECTURA) return false;
  return (
    user.role === UserRole.ADMIN ||
    user.role === UserRole.OPERACIONES ||
    user.role === UserRole.CONCILIACION ||
    user.role === UserRole.TESORERIA
  );
}

/** Revertir / eliminar pago banco → operador. */
export function canDeleteOperatorBankPayment(user: User | null): boolean {
  return isAdmin(user);
}

export function canViewEstadoFinanciero(user: User | null): boolean {
  return isAdmin(user);
}

/** Estado de cuenta wallet USDT (inventario tesorería). */
export function canViewWallet(user: User | null): boolean {
  if (!user || user.role === UserRole.LECTURA) return false;
  return (
    user.role === UserRole.ADMIN ||
    user.role === UserRole.TESORERIA ||
    user.role === UserRole.CONCILIACION
  );
}

/**
 * Utilidad, márgenes, costo promedio de inventario y reportes equivalentes — solo administración.
 * (Operaciones / conciliación / tesorería no ven métricas de ganancia en UI ni deben recibirlas en página.)
 */
export function canViewSensitiveProfitMetrics(user: User | null): boolean {
  return isAdmin(user);
}

/**
 * Dashboard solo tareas operativas (sin inventario, volumen, saldos globales ni utilidad).
 */
export function usesOperationalDashboard(user: User | null): boolean {
  return !!user && (user.role === UserRole.OPERACIONES || user.role === UserRole.CONCILIACION);
}

/**
 * Resumen financiero completo en /dashboard (inventario, ventas del día, proveedor MX, saldos, mini estado).
 * Excluye rol operativo; ADMIN, TESORERIA y LECTURA lo usan.
 */
export function canViewFullFinancialDashboard(user: User | null): boolean {
  if (!user || user.role === UserRole.LECTURA) return false;
  return !usesOperationalDashboard(user);
}

/** Ver listados y totales de gastos operativos. */
export function canViewExpenses(user: User | null): boolean {
  if (!user || user.role === UserRole.LECTURA) return false;
  return (
    user.role === UserRole.ADMIN ||
    user.role === UserRole.TESORERIA ||
    user.role === UserRole.OPERACIONES ||
    user.role === UserRole.CONCILIACION
  );
}

/** Registrar gastos (no eliminar). */
export function canCreateExpenses(user: User | null): boolean {
  return canViewExpenses(user);
}

export function canManageExpenses(user: User | null): boolean {
  return canCreateExpenses(user);
}

export function canDeleteExpenses(user: User | null): boolean {
  return isAdmin(user);
}

/** Deudas Everex y clientes deudores (tesorería / admin / conciliación). */
export function canManageReceivablesAndPayables(user: User | null): boolean {
  if (!user || user.role === UserRole.LECTURA) return false;
  return (
    user.role === UserRole.ADMIN ||
    user.role === UserRole.TESORERIA ||
    user.role === UserRole.CONCILIACION
  );
}

export function canViewReceivablesAndPayables(user: User | null): boolean {
  if (!user) return false;
  if (user.role === UserRole.LECTURA) return true;
  return canManageReceivablesAndPayables(user);
}

/** Módulos sensibles que OPERACIONES no debe ver (deudas, conciliación, estado financiero, saldos iniciales). */
export function canViewTreasurySensitiveModules(user: User | null): boolean {
  if (!user || user.role === UserRole.LECTURA) return false;
  if (isOperationsRole(user)) return false;
  return (
    user.role === UserRole.ADMIN ||
    user.role === UserRole.TESORERIA ||
    user.role === UserRole.CONCILIACION
  );
}

export function canImportBankStatements(user: User | null): boolean {
  if (!user || user.role === UserRole.LECTURA) return false;
  return user.role === UserRole.ADMIN || user.role === UserRole.CONCILIACION;
}

/** Crear operaciones OTC de mesa (no conciliación). */
export function canCreateOtcOperation(user: User | null): boolean {
  return isAdmin(user) || isOperationsRole(user);
}

/** Crear compras USDT de inventario. */
export function canCreateUsdtPurchase(user: User | null): boolean {
  return isAdmin(user) || isOperationsRole(user);
}

/** Editar operación OTC (mesa GTQ en MVP). */
export function canEditOtcOperation(user: User | null): boolean {
  return isAdmin(user) || isOperationsRole(user);
}

/** Eliminar operación OTC (reversión de libro + anticipos). Solo administración. */
export function canDeleteOtcOperation(user: User | null): boolean {
  return isAdmin(user);
}

/** Editar compra USDT (inventario / estado de cuenta). */
export function canEditUsdtPurchase(user: User | null): boolean {
  return isAdmin(user) || isOperationsRole(user);
}

/** Eliminar compra USDT. Solo administración. */
export function canDeleteUsdtPurchase(user: User | null): boolean {
  return isAdmin(user);
}

/** Alta de saldo inicial bancario (tesorería o admin). */
export function canCreateBankOpeningBalance(user: User | null): boolean {
  return isTreasury(user);
}

/** Corrección de saldo inicial ya guardado (solo admin). */
export function canEditBankOpeningBalance(user: User | null): boolean {
  return isAdmin(user);
}

/** Alta, renombrar, archivar o eliminar operador (no aplica a rol solo conciliación). */
export function canManageOperatorCatalog(user: User | null): boolean {
  return isAdmin(user) || isOperationsRole(user);
}

/** Libro mayor / estado de cuenta por operador (sin métricas de utilidad Everex). */
export function canViewOperatorLedger(user: User | null): boolean {
  if (!user || user.role === UserRole.LECTURA) return false;
  return (
    user.role === UserRole.ADMIN ||
    user.role === UserRole.OPERACIONES ||
    user.role === UserRole.CONCILIACION ||
    user.role === UserRole.TESORERIA
  );
}

export function canExportOperatorLedger(user: User | null): boolean {
  return canViewOperatorLedger(user);
}

/** Ajustes manuales al libro del operador: solo administración. */
export function canCreateOperatorManualAdjustment(user: User | null): boolean {
  return isAdmin(user);
}

