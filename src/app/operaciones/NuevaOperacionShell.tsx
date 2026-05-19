"use client";

import { useState } from "react";
import { OtcSide } from "@prisma/client";
import { NuevaOperacionForm } from "./NuevaOperacionForm";
import { MxnSpreadOperacionForm } from "./MxnSpreadOperacionForm";
import { OperatorMxnUsdtForm } from "./OperatorMxnUsdtForm";

type Opt = { id: string; name: string };

type Flow = "compra_gtq" | "venta_gtq" | "mxn_spread" | "operator_mxn_usdt";

type Props = {
  clients: Opt[];
  operators: Opt[];
  bankAccounts: Opt[];
  providers: Opt[];
};

export function NuevaOperacionShell({ clients, operators, bankAccounts, providers }: Props) {
  const [flow, setFlow] = useState<Flow>("compra_gtq");

  return (
    <div className="mt-4 space-y-4">
      <label className="block text-sm">
        Tipo de operación
        <select
          className="mt-1 w-full rounded border border-zinc-400 bg-white px-2 py-2 font-medium"
          value={flow}
          onChange={(e) => setFlow(e.target.value as Flow)}
        >
          <option value="compra_gtq">Cliente compra USDT GTQ</option>
          <option value="venta_gtq">Cliente vende USDT GTQ</option>
          <option value="mxn_spread">Cliente MXN Spread</option>
          <option value="operator_mxn_usdt">Operador MXN pagado con USDT</option>
        </select>
      </label>

      {flow === "mxn_spread" ? (
        <MxnSpreadOperacionForm clients={clients} providers={providers} />
      ) : flow === "operator_mxn_usdt" ? (
        <OperatorMxnUsdtForm operators={operators} providers={providers} />
      ) : (
        <NuevaOperacionForm
          key={flow}
          clients={clients}
          operators={operators}
          bankAccounts={bankAccounts}
          presetSide={flow === "compra_gtq" ? OtcSide.CLIENT_BUYS_USDT : OtcSide.CLIENT_SELLS_USDT}
        />
      )}
    </div>
  );
}
