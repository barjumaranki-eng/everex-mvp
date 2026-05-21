import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/app/components/Nav";

/** Nav usa cookies (getSessionUser); evita static generation en build (Vercel). */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Everex MVP",
  description: "Control operativo mesa OTC",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-zinc-50 text-zinc-900 antialiased">
        <Nav />
        {children}
      </body>
    </html>
  );
}
