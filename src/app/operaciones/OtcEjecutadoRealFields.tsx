"use client";

import { OtcSide } from "@prisma/client";
import { MoneyInput } from "@/app/components/MoneyInput";

type Props = {
  side: OtcSide;
  defaultFiatRecibidoReal?: string;
  defaultUsdtEntregadoReal?: string;
};

/** Montos pactados vs ejecutados en caja / inventario (estado de cuenta). */
export function OtcEjecutadoRealFields({
  side,
  defaultFiatRecibidoReal,
  defaultUsdtEntregadoReal,
}: Props) {
  const isBuy = side === OtcSide.CLIENT_BUYS_USDT;

  return (
    <fieldset className="space-y-3 rounded border border-sky-200 bg-sky-50/50 p-3">
      <legend className="px-1 text-xs font-semibold text-sky-950">Ejecutado en caja / inventario (opcional)</legend>
      <p className="text-xs text-sky-900/85">
        Si difiere del pactado, el descuadre se suma al estado de cuenta del cliente. Deje vacío si cuadra con los montos
        de arriba.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          {isBuy ? "GTQ recibido real (banco/caja)" : "GTQ pagado real (banco/caja)"}
          <div className="mt-1">
            <MoneyInput
              name="fiatRecibidoReal"
              currency="GTQ"
              defaultValue={defaultFiatRecibidoReal}
            />
          </div>
        </label>
        <label className="block text-sm">
          {isBuy ? "USDT entregado real (inventario)" : "USDT recibido real (inventario)"}
          <div className="mt-1">
            <MoneyInput
              name="usdtEntregadoReal"
              currency="USDT"
              defaultValue={defaultUsdtEntregadoReal}
            />
          </div>
        </label>
      </div>
    </fieldset>
  );
}
