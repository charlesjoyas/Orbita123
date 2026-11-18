import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { openDatabase, type Database } from "./db";
import { createApi, prepareDatabase } from "./api";
import type { Data } from "../src/types";
import { finishTask } from "../src/data/taskActions";

let db: Database;
let api: ReturnType<typeof createApi>;
let admin = "";
let editor = "";
let viewer = "";
let viewerId = "";
let usedInvite = "";
const password = "Prueba local segura 2026!";
const sendPush = vi.fn(async () => {});
const cookie = (res: Response) => res.headers.get("set-cookie")!.split(";")[0];
async function call(
  path: string,
  method = "GET",
  body?: unknown,
  session = "",
  origin = "http://orbita.test",
) {
  return api(
    new Request("http://orbita.test/api/" + path, {
      method,
      headers: {
        origin,
        "X-Orbita-Request": "1",
        "Content-Type": "application/json",
        ...(session ? { cookie: session } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );
}
async function invite(email: string, role: string) {
  const response = await call("invites", "POST", { email, role }, admin);
  expect(response.status).toBe(201);
  return new URL((await response.json()).url).searchParams.get("invite")!;
}
beforeAll(async () => {
  db = await openDatabase(":memory:");
  await prepareDatabase(db);
  api = createApi(db, {
    localSetup: true, origin: "http://orbita.test",
    pushTransport: { publicKey: "public-key-test", send: sendPush },
  });
  const first = await call("setup", "POST", {
    email: "admin@orbita.test",
    name: "Admin de prueba",
    password,
  });
  expect(first.status).toBe(201);
  admin = cookie(first);
  const e = await call("register", "POST", {
    token: await invite("editor@orbita.test", "member"),
    name: "Miembro",
    password,
  });
  expect(e.status).toBe(201);
  editor = cookie(e);
  usedInvite = await invite("lector@orbita.test", "viewer");
  const v = await call("register", "POST", {
    token: usedInvite,
    name: "Lector",
    password,
    role: "admin",
  });
  expect(v.status).toBe(201);
  viewer = cookie(v);
  viewerId = (await v.json()).user.id;
}, 15000);
afterAll(() => db.close());
describe("Cuentas, sesiones y permisos del servidor", () => {
  it("guarda hashes y no almacena contraseñas ni tokens de sesión en claro", async () => {
    const [user] = await db.all(
      "SELECT password_hash FROM orbita_users WHERE email=$1",
      ["admin@orbita.test"],
    );
    expect(user.password_hash).toMatch(/^scrypt\$/);
    expect(user.password_hash).not.toContain(password);
    const records = await db.all("SELECT token_hash FROM orbita_sessions");
    expect(records.every((r) => String(r.token_hash).length === 64)).toBe(true);
    expect(records.some((r) => admin.endsWith(String(r.token_hash)))).toBe(
      false,
    );
  });
  it("rechaza el acceso al espacio sin sesión", async () => {
    expect((await call("state")).status).toBe(401);
  });
  it("rechaza una contraseña incorrecta y permite iniciar sesión con la correcta", async () => {
    expect(
      (
        await call("login", "POST", {
          email: "admin@orbita.test",
          password: "incorrecta",
        })
      ).status,
    ).toBe(401);
    const response = await call("login", "POST", {
      email: "admin@orbita.test",
      password,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=Lax");
  });
  it("el rol procede de la invitación y no del formulario manipulado", async () => {
    const response = await call("session", "GET", undefined, viewer);
    expect((await response.json()).user.role).toBe("viewer");
  });
  it("una invitación no se puede utilizar dos veces", async () => {
    expect(
      (
        await call("register", "POST", {
          token: usedInvite,
          name: "Intruso",
          password,
        })
      ).status,
    ).toBe(400);
  });
  it("una nueva invitación para el mismo correo invalida la anterior", async () => {
    const earlier = await invite("reenviar@orbita.test", "admin");
    const latest = await invite("reenviar@orbita.test", "viewer");
    expect((await call("invite?token=" + earlier)).status).toBe(404);
    const response = await call("invite?token=" + latest);
    expect((await response.json()).role).toBe("viewer");
  });
  it("solo un administrador puede crear invitaciones o consultar usuarios", async () => {
    expect(
      (
        await call(
          "invites",
          "POST",
          { email: "extra@orbita.test", role: "admin" },
          editor,
        )
      ).status,
    ).toBe(403);
    expect((await call("users", "GET", undefined, viewer)).status).toBe(403);
  });
  it("un miembro puede trabajar con tareas pero no cambiar un tablero", async () => {
    let response = await call("state", "GET", undefined, editor);
    let payload = (await response.json()) as { data: Data; revision: number };
    payload.data.boards[0].name = "Cambio no permitido";
    expect((await call("state", "PUT", payload, editor)).status).toBe(403);
    response = await call("state", "GET", undefined, editor);
    payload = await response.json();
    const user = payload.data.currentUser;
    const now = new Date().toISOString();
    payload.data.tasks.push({
      id: "server-task",
      boardId: payload.data.boards[0].id,
      columnId: payload.data.boards[0].columns[0].id,
      title: "Tarea compartida",
      description: "",
      creator: user,
      assignee: user,
      priority: "media",
      due: "",
      tags: [],
      checklist: [],
      effort: 1,
      blocked: "",
      recurrence: "ninguna",
      attachments: [],
      comments: [],
      reactions: {},
      createdAt: now,
      movedAt: now,
      focus: [],
    });
    expect((await call("state", "PUT", payload, editor)).status).toBe(200);
  });
  it("impide escribir con rol de solo lectura incluso llamando directamente a la API", async () => {
    const payload = await (
      await call("state", "GET", undefined, viewer)
    ).json();
    payload.data.tasks[0].title = "No permitido";
    expect((await call("state", "PUT", payload, viewer)).status).toBe(403);
  });
  it("rechaza sobrescribir cambios de otra sesión con una versión antigua", async () => {
    const payload = await (
      await call("state", "GET", undefined, editor)
    ).json();
    expect((await call("state", "PUT", payload, editor)).status).toBe(200);
    expect((await call("state", "PUT", payload, editor)).status).toBe(409);
  });
  it("deshace el borrado de una tarea ajena sin permitir cambiar su autor", async () => {
    const snapshot: { data: Data; revision: number } = await (
      await call("state", "GET", undefined, admin)
    ).json();
    const withoutTask = structuredClone(snapshot);
    withoutTask.data.tasks = withoutTask.data.tasks.filter((t) => t.id !== "server-task");
    const removed = await call("state", "PUT", withoutTask, admin);
    expect(removed.status).toBe(200);
    snapshot.revision = (await removed.json()).revision;
    const forged = structuredClone(snapshot);
    forged.data.tasks[0].creator = forged.data.currentUser;
    expect((await call("state", "PUT", forged, admin)).status).toBe(403);
    expect((await call("state", "PUT", snapshot, admin)).status).toBe(200);
  });
  it("genera la próxima ocurrencia si otro usuario completa una tarea recurrente", async () => {
    const payload: { data: Data; revision: number } = await (
      await call("state", "GET", undefined, admin)
    ).json();
    const task = payload.data.tasks.find((t) => t.id === "server-task")!;
    task.recurrence = "diaria";
    finishTask(payload.data, task.id);
    const next = payload.data.tasks.at(-1)!;
    expect(next.creator).toBe(payload.data.currentUser);
    expect((await call("state", "PUT", payload, admin)).status).toBe(200);
  });
  it("rechaza una escritura de una pestaña que muestra otra cuenta", async () => {
    const payload = await (await call("state", "GET", undefined, editor)).json();
    expect((await call("state", "PUT", payload, admin)).status).toBe(403);
  });
  it("cada usuario marca actividad como leída de forma independiente", async () => {
    const reader: { data: Data; revision: number } = await (
      await call("state", "GET", undefined, viewer)
    ).json();
    expect(reader.data.activities[0].unread).toBe(true);
    reader.data.activities[0].unread = false;
    expect((await call("state", "PUT", reader, viewer)).status).toBe(200);
    const second = await (await call("state", "GET", undefined, editor)).json();
    const updated = await (await call("state", "GET", undefined, viewer)).json();
    expect(second.data.activities[0].unread).toBe(true);
    expect(updated.data.activities[0].unread).toBe(false);
    const unchanged = await (
      await call("state?revision=" + second.revision, "GET", undefined, editor)
    ).json();
    expect(unchanged.revision).toBe(second.revision);
    expect(unchanged.data).toBeUndefined();
  });
  it("rechaza peticiones de escritura desde otro origen", async () => {
    expect(
      (
        await call(
          "invites",
          "POST",
          { email: "extra@orbita.test", role: "member" },
          admin,
          "https://otro.test",
        )
      ).status,
    ).toBe(403);
  });
  it("conserva siempre un administrador activo", async () => {
    const session = await (
      await call("session", "GET", undefined, admin)
    ).json();
    expect(
      (
        await call(
          "users",
          "PATCH",
          { id: session.user.id, role: "member" },
          admin,
        )
      ).status,
    ).toBe(409);
  });
  it("desactivar un usuario revoca sus sesiones", async () => {
    expect(
      (await call("users", "PATCH", { id: viewerId, active: false }, admin))
        .status,
    ).toBe(200);
    expect((await call("state", "GET", undefined, viewer)).status).toBe(401);
    const member: { data: Data; revision: number } = await (
      await call("state", "GET", undefined, editor)
    ).json();
    expect(member.data.members.find((m) => m.id === viewerId)?.active).toBe(false);
    member.data.tasks[0].assignee = viewerId;
    expect((await call("state", "PUT", member, editor)).status).toBe(400);
  });
  it("cerrar sesión invalida la cookie en el servidor", async () => {
    const login = await call("login", "POST", {
      email: "editor@orbita.test",
      password,
    });
    const session = cookie(login);
    expect((await call("logout", "POST", {}, session)).status).toBe(200);
    expect((await call("state", "GET", undefined, session)).status).toBe(401);
  });
  it("avisa solo al destinatario suscrito después de guardar la asignación", async () => {
    const endpoint = "https://fcm.googleapis.com/fcm/send/editor-prueba";
    const endpointAdmin = "https://fcm.googleapis.com/fcm/send/admin-prueba";
    const keys = { p256dh: Buffer.alloc(65, 4).toString("base64url"), auth: Buffer.alloc(16).toString("base64url") };
    expect((await call("push", "GET")).status).toBe(401);
    expect((await call("push", "PUT", { endpoint: "https://127.0.0.1/test", keys }, editor)).status).toBe(400);
    expect((await call("push", "PUT", { endpoint, keys }, editor)).status).toBe(200);
    expect((await call("push", "PUT", { endpoint: endpointAdmin, keys }, admin)).status).toBe(200);
    expect((await (await call("push", "POST", { action: "status", endpoint }, admin)).json()).enabled).toBe(false);
    const payload: { data: Data; revision: number } = await (await call("state", "GET", undefined, admin)).json();
    const assignee = payload.data.members.find((m) => m.name === "Miembro")!.id;
    const task = { ...payload.data.tasks[0], id: "push-assignment", creator: payload.data.currentUser, assignee, comments: [] };
    payload.data.tasks.push(task);
    const saved = await call("state", "PUT", payload, admin);
    expect(saved.status).toBe(200);
    expect((await call("state", "PUT", payload, admin)).status).toBe(409);
    payload.revision = (await saved.json()).revision;
    task.title = "Cambio de título";
    expect((await call("state", "PUT", payload, admin)).status).toBe(200);
    expect(sendPush).toHaveBeenCalledTimes(1);
    expect(sendPush).toHaveBeenCalledWith(expect.objectContaining({ endpoint }), expect.objectContaining({ taskId: task.id }));

    expect((await call("logout", "POST", { endpoint }, editor)).status).toBe(200);
    expect(await db.all("SELECT endpoint FROM orbita_push_devices")).toEqual([{ endpoint: endpointAdmin }]);
  });
});
