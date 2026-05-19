# Everex MVP

Control operativo mesa OTC (GTQ, MXN, USD, USDT TRC20). UI mínima; reglas de negocio y roles en servidor.

## Stack

- Next.js (App Router) + TypeScript + Tailwind v4
- Prisma + SQLite por defecto (`DATABASE_URL=file:./dev.db`)

## Roles

- **ADMIN_IBRAHIM**: aprueba pagos, confirma movimientos MX/proveedor, **confirma envíos USDT** (`SENT_CONFIRMED` + TX), cierra operaciones.
- **ASSISTANT**: crea operaciones, registra pagos (pendientes), movimientos operador MX y proveedor MX (pendientes), **prepara** envíos USDT (`PREPARED`), no confirma envío final ni cierra.

## Modelos principales (Prisma)

- `Payment` — varios por operación; boleta; `PENDING` / `APPROVED` (Ibrahim).
- `UsdtTransfer` — varios por operación; `PREPARED` → `SENT_CONFIRMED` (solo Ibrahim confirma).
- `MxnOperatorMovement` — pesos operador; comprobante; `PENDING` / `CONFIRMED` (Ibrahim).
- `MexicoProvider` + `ProviderMovement` — participación proveedor MX.
- `Operation` — `OPEN` / `CLOSED`; `expectedUsdtOut` para reconciliación y alertas.

## Reglas de cierre

- No cerrar si hay pagos `PENDING`.
- No cerrar si hay `UsdtTransfer` en `PREPARED`.
- Alertas en UI: USDT sobre lo esperado, diferencias, movimientos pendientes, pagos vs USDT (heurística).

## Rutas

- `/login` — cookie `everex_uid`
- `/dashboard` — Ibrahim: compras por operador, USDT/GTQ, wallet, utilidad real GTQ del día, alertas
- `/operadores` — alta/listado de operadores MXN, saldo MXN acumulado e historial de compras USDT
- `/compras-usdt` — compras al proveedor MX (cálculos automáticos USDT, costo GTQ, costo/USDT)
- `/wallet` — saldo inicial/cierre, saldo esperado vs real, diferencia; utilidad real explicada
- `/operaciones/nueva`, `/operaciones/[id]`
- `/clientes`, `/proveedores` (proveedores MX)

## Utilidad real (automática)

No se captura utilidad en la operación. Por día: costo promedio USDT en GTQ = (suma costo GTQ compras) / (suma USDT comprado); costo del vendido = USDT enviado × promedio; fees GTQ = fees USDT × promedio; **utilidad GTQ** = GTQ recibido (pagos GTQ aprobados) − costo vendido − fees GTQ. Cada envío USDT confirmado suma **1 USDT** de fee en wallet.

Compras USDT y Ventas OTC se manejan por separado:
- Compras USDT: `Operator` (MXN) + `MexicoProvider` + wallet.
- Ventas OTC: cliente + pagos + envíos USDT.

`UsdtPurchase` exige `operatorId` obligatorio.

## Local

```bash
cp .env.example .env
npm install
npx prisma generate
npx prisma db push
npx prisma db seed
npm run dev
```

**Seed**

- `ibrahim@everex.local` / `ibrahim123`
- `asistente@everex.local` / `asistente123`

## Interfaz mínima (operación)

Ver sección **Rutas**. Detalle de operación: pagos, USDT (preparar / confirmar), operador MX, proveedor MX, totales calculados y alertas.
