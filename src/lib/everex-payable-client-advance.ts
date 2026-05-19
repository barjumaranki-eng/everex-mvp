import { EverexCreditorType } from "@prisma/client";

/** Texto fijo en `reason` al crear anticipo por venta parcial (`createOtcOperation`). */
export const CLIENT_OTC_ADVANCE_REASON_SUBSTR = "USDT por entregar";

/** Marcador en `notes` cuando no existe FK `clientId` en EverexPayable (filtrado por cliente). */
export function clientAdvancePayableNotesMarker(clientId: string): string {
  return `ClienteId:${clientId}`;
}

export function isClientOtcAdvancePayable(p: {
  creditorType: EverexCreditorType;
  reason: string;
}): boolean {
  return p.creditorType === EverexCreditorType.CLIENT && p.reason.includes(CLIENT_OTC_ADVANCE_REASON_SUBSTR);
}
