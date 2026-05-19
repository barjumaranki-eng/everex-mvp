import { EverexCreditorType } from "@prisma/client";

/** Tipos permitidos en alta manual (formulario deudas). */
export const PAYABLE_CREDITOR_TYPES_FORM: EverexCreditorType[] = [
  EverexCreditorType.CLIENT,
  EverexCreditorType.OPERATOR,
  EverexCreditorType.PROVIDER,
  EverexCreditorType.OTHER,
];

export type PayableCreditorResolved = {
  creditorType: EverexCreditorType;
  clientId: string | null;
  operatorId: string | null;
  providerId: string | null;
  otherName: string | null;
  displayName: string;
  creditorName: string;
};

export type PayableForDisplay = {
  creditorType: EverexCreditorType;
  displayName: string;
  creditorName: string;
  clientId: string | null;
  operatorId: string | null;
  providerId: string | null;
  otherName: string | null;
  client?: { name: string } | null;
  operator?: { name: string } | null;
  provider?: { name: string } | null;
};

const LEGACY_UNLINKED_LABEL = "Registro antiguo sin relación";

export function hasPayableEntityLink(p: PayableForDisplay): boolean {
  if (p.creditorType === EverexCreditorType.CLIENT && p.clientId) return true;
  if (p.creditorType === EverexCreditorType.OPERATOR && p.operatorId) return true;
  if (p.creditorType === EverexCreditorType.PROVIDER && p.providerId) return true;
  if (p.creditorType === EverexCreditorType.OTHER && p.otherName?.trim()) return true;
  return false;
}

export function resolvePayableDisplayLabel(p: PayableForDisplay): string {
  if (p.clientId && p.client?.name) return p.client.name;
  if (p.operatorId && p.operator?.name) return p.operator.name;
  if (p.providerId && p.provider?.name) return p.provider.name;
  if (p.creditorType === EverexCreditorType.OTHER && p.otherName?.trim()) return p.otherName.trim();
  if (p.displayName?.trim()) return p.displayName.trim();
  if (p.creditorName?.trim()) return p.creditorName.trim();
  return LEGACY_UNLINKED_LABEL;
}

export function resolvePayableListSubtitle(p: PayableForDisplay): string {
  if (!hasPayableEntityLink(p)) {
    return `${p.creditorType} · ${LEGACY_UNLINKED_LABEL}`;
  }
  return p.creditorType;
}

export function buildClientAdvancePayableCreditor(clientId: string, clientName: string): PayableCreditorResolved {
  const name = clientName.trim();
  return {
    creditorType: EverexCreditorType.CLIENT,
    clientId,
    operatorId: null,
    providerId: null,
    otherName: null,
    displayName: name,
    creditorName: name,
  };
}

export async function resolvePayableCreditorFromForm(
  formData: FormData,
  loaders: {
    clientName: (id: string) => Promise<string | null>;
    operatorName: (id: string) => Promise<string | null>;
    providerName: (id: string) => Promise<string | null>;
  },
): Promise<{ ok: true; data: PayableCreditorResolved } | { ok: false; error: string }> {
  const creditorType = String(formData.get("creditorType") ?? "") as EverexCreditorType;
  if (!PAYABLE_CREDITOR_TYPES_FORM.includes(creditorType)) {
    return { ok: false, error: "Tipo de acreedor inválido" };
  }

  const clientId = String(formData.get("clientId") ?? "").trim() || null;
  const operatorId = String(formData.get("operatorId") ?? "").trim() || null;
  const providerId = String(formData.get("providerId") ?? "").trim() || null;
  const otherName = String(formData.get("otherName") ?? "").trim() || null;

  switch (creditorType) {
    case EverexCreditorType.CLIENT: {
      if (!clientId) return { ok: false, error: "Seleccione un cliente" };
      const name = await loaders.clientName(clientId);
      if (!name) return { ok: false, error: "Cliente no encontrado" };
      return {
        ok: true,
        data: {
          creditorType,
          clientId,
          operatorId: null,
          providerId: null,
          otherName: null,
          displayName: name,
          creditorName: name,
        },
      };
    }
    case EverexCreditorType.OPERATOR: {
      if (!operatorId) return { ok: false, error: "Seleccione un operador" };
      const name = await loaders.operatorName(operatorId);
      if (!name) return { ok: false, error: "Operador no encontrado" };
      return {
        ok: true,
        data: {
          creditorType,
          clientId: null,
          operatorId,
          providerId: null,
          otherName: null,
          displayName: name,
          creditorName: name,
        },
      };
    }
    case EverexCreditorType.PROVIDER: {
      if (!providerId) return { ok: false, error: "Seleccione un proveedor MX" };
      const name = await loaders.providerName(providerId);
      if (!name) return { ok: false, error: "Proveedor no encontrado" };
      return {
        ok: true,
        data: {
          creditorType,
          clientId: null,
          operatorId: null,
          providerId,
          otherName: null,
          displayName: name,
          creditorName: name,
        },
      };
    }
    case EverexCreditorType.OTHER: {
      if (!otherName) return { ok: false, error: "Indique el nombre del acreedor" };
      return {
        ok: true,
        data: {
          creditorType,
          clientId: null,
          operatorId: null,
          providerId: null,
          otherName,
          displayName: otherName,
          creditorName: otherName,
        },
      };
    }
    default:
      return { ok: false, error: "Tipo no soportado" };
  }
}
