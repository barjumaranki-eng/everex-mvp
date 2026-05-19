export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    console.log("[everex] servidor Next (instrumentation): listo para arrancar");
  }
}
