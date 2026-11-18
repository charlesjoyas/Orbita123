import { create } from "zustand";
export type Role = "admin" | "member" | "viewer";
export interface Account {
  id: string;
  email: string;
  name: string;
  emoji: string;
  color: string;
  status: "disponible" | "en foco" | "fuera";
  role: Role;
  active: boolean;
}
export const roleLabel: Record<Role, string> = {
  admin: "Administrador",
  member: "Miembro",
  viewer: "Solo lectura",
};
export const useIdentity = create<{
  user: Account | null;
  ready: boolean;
  expired: boolean;
}>(() => ({ user: null, ready: false, expired: false }));
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T = Record<string, unknown>>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  let response: Response;
  const account = useIdentity.getState().user?.id;
  try {
    response = await fetch("/api/" + path, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
      headers: {
        ...(account ? { "X-Orbita-Account": account } : {}),
        ...(method === "GET" ? {} : {
          "Content-Type": "application/json",
          "X-Orbita-Request": "1",
        }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiError(503, "No podemos conectar con el servidor de Órbita.");
  }
  const type = response.headers.get("content-type");
  if (!type?.includes("application/json"))
    throw new ApiError(503, "No podemos conectar con el servidor de Órbita.");
  const result = await response.json();
  if (!response.ok)
    throw new ApiError(
      response.status,
      result.error || "No se pudo completar la acción.",
    );
  return result as T;
}
