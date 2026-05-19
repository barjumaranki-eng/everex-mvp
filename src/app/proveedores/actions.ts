"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { canRunOperations } from "@/lib/authz";

export async function createMexicoProvider(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await getSessionUser();
  if (!canRunOperations(user)) return { error: "No autorizado" };
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Nombre requerido" };
  const notes = String(formData.get("notes") ?? "").trim() || undefined;
  await prisma.mexicoProvider.create({ data: { name, notes } });
  revalidatePath("/proveedores");
  return {};
}
