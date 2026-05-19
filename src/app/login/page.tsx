import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const error = params?.error;

  return (
    <main className="mx-auto max-w-md p-6">
      <div className="rounded border border-zinc-300 bg-white p-4 shadow-sm">
        <h1 className="text-xl font-semibold">Everex Login</h1>

        <p className="mt-1 text-xs text-zinc-600">
          Operaciones: fernanda@everex.local o alyson@everex.local — contraseña everex123
        </p>

        <LoginForm urlError={error} />
      </div>
    </main>
  );
}