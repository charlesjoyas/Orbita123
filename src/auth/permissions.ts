import type { Data } from "../types";
import { useIdentity } from "./session";
const equal = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
export function accessError(before: Data, after: Data) {
  const user = useIdentity.getState().user;
  if (!user) return "";
  if (after.currentUser !== user.id)
    return "La sesión pertenece a tu cuenta. No puedes entrar como otra persona.";
  if (
    !equal(
      before.members.map((m) => m.id),
      after.members.map((m) => m.id),
    )
  )
    return "Los usuarios se crean desde Nuestro equipo.";
  if (
    after.members.some(
      (m) =>
        m.id !== user.id &&
        !equal(
          m,
          before.members.find((x) => x.id === m.id),
        ),
    )
  )
    return "Solo puedes editar tu propio perfil.";
  if (user.role !== "admin" && !equal(before.boards, after.boards))
    return "Solo los administradores pueden cambiar tableros y columnas.";
  if (
    user.role === "viewer" &&
    (!equal(before.tasks, after.tasks) ||
      !equal(
        before.activities.map((a) => ({ ...a, unread: false })),
        after.activities.map((a) => ({ ...a, unread: false })),
      ))
  )
    return "Tu cuenta tiene acceso de solo lectura.";
  return "";
}
