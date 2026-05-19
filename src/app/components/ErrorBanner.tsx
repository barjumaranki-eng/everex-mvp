export function ErrorBanner({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div
      className="mb-4 whitespace-pre-wrap rounded border border-red-400 bg-red-50 px-3 py-2 text-sm text-red-900"
      role="alert"
    >
      {message}
    </div>
  );
}
