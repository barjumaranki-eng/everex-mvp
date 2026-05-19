import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

export async function saveUploadedImage(file: File, subdir: string): Promise<string> {
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Archivo requerido");
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error("Archivo demasiado grande (máx 8MB)");
  }
  const mime = file.type || "";
  if (!mime.startsWith("image/")) {
    throw new Error("Solo imágenes");
  }
  const ext = path.extname(file.name) || ".bin";
  const key = `${randomUUID()}${ext}`;
  const dir = path.join(process.cwd(), "public", "uploads", subdir);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, key), Buffer.from(await file.arrayBuffer()));
  return `/uploads/${subdir}/${key}`;
}
