/**
 * Enlaza EverexPayable legacy con clientes / operadores / proveedores por nombre.
 * No borra filas. Idempotente: solo actualiza cuando faltan FK o displayName vacío.
 *
 * Uso: node scripts/migrate-debt-relations.mjs
 */
import "./load-env.mjs";
import { EverexCreditorType } from "@prisma/client";
import { createScriptPrismaClient } from "./prisma-client.mjs";

const prisma = createScriptPrismaClient();

function norm(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function buildNameMap(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = norm(row.name);
    if (!key) continue;
    if (!map.has(key)) map.set(key, row.id);
  }
  return map;
}

function pickName(p) {
  const dn = p.displayName?.trim();
  if (dn) return dn;
  return p.creditorName?.trim() ?? "";
}

async function main() {
  const [payables, clients, operators, providers] = await Promise.all([
    prisma.everexPayable.findMany({
      select: {
        id: true,
        creditorName: true,
        displayName: true,
        creditorType: true,
        clientId: true,
        operatorId: true,
        providerId: true,
        otherName: true,
        reason: true,
        notes: true,
        openedAt: true,
        active: true,
      },
    }),
    prisma.client.findMany({ select: { id: true, name: true } }),
    prisma.operator.findMany({ select: { id: true, name: true } }),
    prisma.mexicoProvider.findMany({ select: { id: true, name: true } }),
  ]);

  const clientByName = buildNameMap(clients);
  const operatorByName = buildNameMap(operators);
  const providerByName = buildNameMap(providers);

  let updated = 0;
  let skipped = 0;
  const rubenRows = [];

  for (const p of payables) {
    const label = pickName(p);
    const nameKey = norm(label || p.creditorName);

    if (/ruben/i.test(label) || /ruben/i.test(p.creditorName)) {
      rubenRows.push({
        debtId: p.id,
        creditorType: p.creditorType,
        creditorName: p.creditorName,
        displayName: p.displayName,
        clientId: p.clientId,
        operatorId: p.operatorId,
        providerId: p.providerId,
        reason: p.reason,
        notes: p.notes,
        openedAt: p.openedAt,
        active: p.active,
        source: "everexPayable",
      });
    }

    const data = {};
    let linked = !!(p.clientId || p.operatorId || p.providerId);

    if (!p.clientId && p.notes) {
      const m = p.notes.match(/ClienteId:([a-z0-9]+)/i);
      if (m) data.clientId = m[1];
    }

    if (!data.clientId && !p.clientId && nameKey) {
      if (p.creditorType === EverexCreditorType.CLIENT) {
        const id = clientByName.get(nameKey);
        if (id) data.clientId = id;
      } else if (p.creditorType === EverexCreditorType.OPERATOR) {
        const id = operatorByName.get(nameKey);
        if (id) data.operatorId = id;
      } else if (p.creditorType === EverexCreditorType.PROVIDER) {
        const id = providerByName.get(nameKey);
        if (id) data.providerId = id;
      } else {
        const cid = clientByName.get(nameKey);
        const oid = operatorByName.get(nameKey);
        const pid = providerByName.get(nameKey);
        if (cid && !oid && !pid) data.clientId = cid;
        else if (oid && !cid && !pid) data.operatorId = oid;
        else if (pid && !cid && !oid) data.providerId = pid;
      }
    }

    if (
      (p.creditorType === EverexCreditorType.OTHER || p.creditorType === EverexCreditorType.INVESTOR) &&
      !p.otherName?.trim() &&
      label
    ) {
      data.otherName = label;
    }

    if (p.creditorType === EverexCreditorType.INVESTOR) {
      data.creditorType = EverexCreditorType.OTHER;
    }

    const resolvedName =
      (data.clientId && clients.find((c) => c.id === data.clientId)?.name) ||
      (data.operatorId && operators.find((o) => o.id === data.operatorId)?.name) ||
      (data.providerId && providers.find((pr) => pr.id === data.providerId)?.name) ||
      label;

    if (resolvedName && !p.displayName?.trim()) {
      data.displayName = resolvedName;
    }
    if (resolvedName && !p.creditorName?.trim()) {
      data.creditorName = resolvedName;
    }

    linked = linked || !!(data.clientId || data.operatorId || data.providerId || p.otherName || data.otherName);

    if (Object.keys(data).length === 0) {
      skipped++;
      continue;
    }

    await prisma.everexPayable.update({ where: { id: p.id }, data });
    updated++;
    console.log("[migrate]", p.id, "→", JSON.stringify(data));
  }

  console.log("\n=== Resumen ===");
  console.log("Total payables:", payables.length);
  console.log("Actualizados:", updated);
  console.log("Sin cambios:", skipped);

  if (rubenRows.length) {
    console.log("\n=== Filas con 'Ruben' (revisar manualmente) ===");
    for (const r of rubenRows) {
      console.log(JSON.stringify(r, null, 2));
    }
  } else {
    console.log("\nNo se encontraron payables con 'Ruben' en el nombre.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
