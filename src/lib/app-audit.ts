import { Prisma } from "@prisma/client";

export type AuditJson = Prisma.InputJsonValue;

export function writeAppAuditLogInTx(
  tx: Prisma.TransactionClient,
  args: {
    userId: string;
    action: string;
    entityType: string;
    entityId: string;
    payloadBefore?: AuditJson | null;
    payloadAfter?: AuditJson | null;
    reason?: string | null;
  },
) {
  return tx.appAuditLog.create({
    data: {
      userId: args.userId,
      action: args.action,
      entityType: args.entityType,
      entityId: args.entityId,
      payloadBefore: args.payloadBefore === null || args.payloadBefore === undefined ? undefined : args.payloadBefore,
      payloadAfter: args.payloadAfter === null || args.payloadAfter === undefined ? undefined : args.payloadAfter,
      reason: args.reason?.trim() || null,
    },
  });
}
