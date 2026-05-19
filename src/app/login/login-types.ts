/** Estado del formulario de login (cliente + servidor). Sin `"use server"` para imports seguros desde Client Components. */
export type LoginFormState = { error?: string; redirectTo?: string } | null;
