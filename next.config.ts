import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Evita que Turbopack empaquete una copia cacheada de Prisma; usa siempre node_modules tras `prisma generate`.
  serverExternalPackages: ["@prisma/client", "prisma"],
};

export default nextConfig;
