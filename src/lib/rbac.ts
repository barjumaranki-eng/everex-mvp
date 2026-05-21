import { NextResponse } from "next/server";
import type { AppUserRole } from "@/lib/roles";

export function isRbacAdminRole(role: AppUserRole): boolean {
  return role === "ADMIN";
}

export function isOperationsLikeRole(role: AppUserRole): boolean {
  return role === "OPERACIONES";
}

function matches(pathname: string, patterns: RegExp[]): boolean {
  return patterns.some((re) => re.test(pathname));
}

export function getRoleHomePath(role: AppUserRole): string {
  if (isRbacAdminRole(role)) return "/dashboard";
  switch (role) {
    case "TESORERIA":
      return "/bancos";
    case "OPERACIONES":
      return "/operaciones/nueva";
    case "CONCILIACION":
      return "/dashboard";
    case "LECTURA":
      return "/dashboard";
    default:
      return "/dashboard";
  }
}

const RE = {
  root: /^\/$/,
  dashboard: /^\/dashboard(\/.*)?$/,
  operaciones: /^\/operaciones(\/.*)?$/,
  operacionesNueva: /^\/operaciones\/nueva$/,
  clientes: /^\/clientes(\/.*)?$/,
  operadores: /^\/operadores(\/.*)?$/,
  proveedores: /^\/proveedores(\/.*)?$/,
  comprasUsdt: /^\/compras-usdt(\/.*)?$/,
  bancos: /^\/bancos(\/.*)?$/,
  bancosPagarOperador: /^\/bancos\/pagar-operador$/,
  gastos: /^\/gastos(\/.*)?$/,
  clientesDeudores: /^\/clientes-deudores(\/.*)?$/,
  deudas: /^\/deudas(\/.*)?$/,
  estadoFin: /^\/estado-financiero(\/.*)?$/,
  conciliacion: /^\/conciliacion-bancaria(\/.*)?$/,
  saldosIniciales: /^\/bancos\/saldos-iniciales(\/.*)?$/,
  wallet: /^\/wallet(\/.*)?$/,
};

export function canAccessPathname(role: AppUserRole, pathname: string): boolean {
  const p = pathname !== "/" && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;

  if (isRbacAdminRole(role)) return true;

  if (RE.estadoFin.test(p)) return false;

  if (role === "LECTURA") {
    if (RE.operacionesNueva.test(p)) return false;
    return matches(p, [
      RE.root,
      RE.dashboard,
      RE.operaciones,
      RE.clientes,
      RE.operadores,
      RE.proveedores,
      RE.comprasUsdt,
      RE.bancos,
      RE.gastos,
      RE.clientesDeudores,
      RE.deudas,
      RE.conciliacion,
    ]);
  }

  if (role === "TESORERIA") {
    return matches(p, [
      RE.root,
      RE.dashboard,
      RE.bancos,
      RE.operaciones,
      RE.clientes,
      RE.operadores,
      RE.proveedores,
      RE.gastos,
      RE.clientesDeudores,
      RE.deudas,
      RE.conciliacion,
    ]);
  }

  if (isOperationsLikeRole(role)) {
    if (RE.saldosIniciales.test(p)) return false;
    return matches(p, [
      RE.root,
      RE.dashboard,
      RE.operaciones,
      RE.clientes,
      RE.operadores,
      RE.proveedores,
      RE.comprasUsdt,
      RE.bancos,
      RE.bancosPagarOperador,
      RE.gastos,
    ]);
  }

  if (role === "CONCILIACION") {
    if (RE.estadoFin.test(p)) return false;
    return matches(p, [
      RE.root,
      RE.dashboard,
      RE.bancos,
      RE.bancosPagarOperador,
      RE.operaciones,
      RE.clientes,
      RE.operadores,
      RE.proveedores,
      RE.comprasUsdt,
      RE.clientesDeudores,
      RE.deudas,
      RE.conciliacion,
      RE.gastos,
      RE.wallet,
    ]);
  }

  return false;
}

export function rbacForbiddenResponse(): NextResponse {
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>403 — No autorizado</title></head><body style="font-family:system-ui,-apple-system,sans-serif;padding:2rem;max-width:36rem;margin:auto;line-height:1.5;color:#18181b"><h1 style="font-size:1.25rem;margin:0 0 0.75rem">403 No autorizado</h1><p style="margin:0 0 1rem">No tiene permiso para acceder a este módulo.</p><p style="margin:0"><a href="/" style="color:#1d4ed8">Volver al inicio</a></p></body></html>`;
  return new NextResponse(html, {
    status: 403,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
