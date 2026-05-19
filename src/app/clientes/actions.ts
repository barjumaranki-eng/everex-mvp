"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { canRunOperations } from "@/lib/authz";

export async function createClient(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await getSessionUser();
  if (!canRunOperations(user)) return { error: "No autorizado" };
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Nombre requerido" };
  const phone = String(formData.get("phone") ?? "").trim() || undefined;
  const notes = String(formData.get("notes") ?? "").trim() || undefined;
  await prisma.client.create({ data: { name, phone, notes } });
  revalidatePath("/clientes");
  return {};
}
