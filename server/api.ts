import { randomUUID } from "node:crypto";
import type { Data, Member } from "../src/types";
import { isData, MAX_REQUEST_BYTES } from "../src/data/validation.ts";
import { columns } from "../src/data/seed.ts";
import type { Database, Query, Row } from "./db";
import { configuredPush, createPush, pushEndpoint, pushKeys, type PushTransport } from "./push.ts";
import {
  equalSecret,
  hashPassword,
  hashToken,
  token,
  validEmail,
  validPassword,
  verifyPassword,
} from "./security.ts";

type Role = "admin" | "member" | "viewer";
interface User extends Row {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  emoji: string;
  color: string;
  status: Member["status"];
  role: Role;
  active: number;
  created_at: string;
}
interface Stored extends Row {
  payload: string;
  revision: number;
}
const roleNames = ["admin", "member", "viewer"];
const SESSION_AGE = 7 * 24 * 60 * 60 * 1000;
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
const profile = (u: User) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  emoji: u.emoji,
  color: u.color,
  status: u.status,
  role: u.role,
  active: !!u.active,
});
const member = (u: User): Member => ({
  id: u.id,
  name: u.name,
  emoji: u.emoji,
  color: u.color,
  status: u.status,
  active: !!u.active,
});
const json = (
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
class HttpError extends Error {
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
  readonly status: number;
}
function assert(
  condition: unknown,
  status: number,
  message: string,
): asserts condition {
  if (!condition) throw new HttpError(status, message);
}
const nameValid = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0 && v.trim().length <= 40;
const colorValid = (v: unknown): v is string =>
  typeof v === "string" && /^#[a-f0-9]{6}$/i.test(v);
interface Attribution {
  author: string;
  fingerprint: string;
}
function attribution(data: Data) {
  const entries = new Map<string, Attribution>();
  const add = (key: string[], author: string, fields: unknown[]) =>
    entries.set(JSON.stringify(key), { author, fingerprint: hashToken(JSON.stringify([author, ...fields])) });
  for (const task of data.tasks) {
    add(["task", task.id], task.creator, []);
    for (const comment of task.comments)
      add(["comment", task.id, comment.id], comment.author, [comment.text, comment.at]);
  }
  for (const activity of data.activities)
    add(["activity", activity.id], activity.actor, [activity.text, activity.at, activity.taskId]);
  return entries;
}
async function preserveAttribution(
  q: Query,
  before: Data,
  draft: Data,
  user: User,
) {
  const previous = attribution(before);
  const proposed = attribution(draft);
  for (const [key, item] of proposed) {
    const old = previous.get(key);
    if (old) {
      assert(item.fingerprint === old.fingerprint, 403, "El autor o el historial del espacio no es válido.");
    } else {
      const [removed] = await q.all("SELECT fingerprint FROM orbita_removed WHERE key=$1", [key]);
      assert(
        removed ? item.fingerprint === removed.fingerprint : item.author === user.id,
        403,
        "El autor o el historial del espacio no es válido.",
      );
      if (removed) await q.run("DELETE FROM orbita_removed WHERE key=$1", [key]);
    }
  }
  for (const [key, item] of previous)
    if (!proposed.has(key))
      await q.run("INSERT INTO orbita_removed(key,fingerprint) VALUES($1,$2)", [key, item.fingerprint]);
}
async function users(q: Query) {
  return q.all<User>("SELECT * FROM orbita_users ORDER BY created_at,id");
}
async function insertTeamUser(
  q: Query,
  { email, name, passwordHash, role }: { email: string; name: string; passwordHash: string; role: Role },
) {
  const people = await users(q);
  assert(!people.some((person) => person.email === email), 409, "Ya existe una cuenta con ese correo.");
  assert(people.length < 10, 409, "Este espacio tiene un máximo de 10 usuarios.");
  const user: User = {
    id: randomUUID(),
    email,
    password_hash: passwordHash,
    name: name.trim(),
    emoji: "🦊",
    color: "#7aa8b1",
    status: "disponible",
    role,
    active: 1,
    created_at: new Date().toISOString(),
  };
  await q.run(
    "INSERT INTO orbita_users(id,email,password_hash,name,emoji,color,status,role,active,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
    Object.values(user),
  );
  await q.run("UPDATE orbita_state SET revision=revision+1 WHERE slot='main'");
  return user;
}
async function state(q: Query, user: User) {
  const [row] = await q.all<Stored>(
    "SELECT * FROM orbita_state WHERE slot='main'",
  );
  const people = await users(q);
  const data = JSON.parse(row.payload) as Data;
  data.currentUser = user.id;
  data.members = people.map(member);
  const seen = new Set((await q.all<{ activity_id: string }>(
    "SELECT activity_id FROM orbita_activity_read WHERE user_id=$1", [user.id],
  )).map((row) => row.activity_id));
  for (const activity of data.activities)
    activity.unread = activity.actor !== user.id && !seen.has(activity.id);
  data.boards.forEach(
    (b) => (b.members = people.filter((p) => p.active).map((p) => p.id)),
  );
  return { data, revision: Number(row.revision) };
}
function initialData(user: User, legacy: unknown): Data {
  const first = columns();
  const empty: Data = {
    version: 1,
    members: [member(user)],
    boards: [
      {
        id: randomUUID(),
        name: "Nuestro espacio compartido",
        emoji: "🚀",
        background: "lavender",
        members: [user.id],
        columns: first,
      },
    ],
    tasks: [],
    activities: [],
    currentUser: user.id,
    onboarded: true,
    focusDays: [],
  };
  if (!legacy) return empty;
  assert(
    isData(legacy),
    400,
    "La copia local no es válida. Puedes empezar sin importarla.",
  );
  const data = structuredClone(legacy);
  data.currentUser = user.id;
  data.members = [member(user)];
  data.onboarded = true;
  data.focusDays = [];
  data.boards.forEach((b) => {
    b.members = [user.id];
  });
  data.tasks.forEach((t) => {
    t.assignee = user.id;
    t.creator = user.id;
    t.focus = [];
    t.reactions = {};
    t.comments.forEach((c) => {
      c.author = user.id;
      c.reactions = {};
    });
  });
  data.activities = data.activities.map((a) => ({ ...a, actor: user.id }));
  return data;
}

export async function prepareDatabase(db: Database) {
  await db.run(
    "INSERT INTO orbita_state(slot,payload,revision) VALUES('main','null',0) ON CONFLICT(slot) DO NOTHING",
  );
}
export function createApi(
  db: Database,
  {
    localSetup = false,
    origin = process.env.APP_ORIGIN,
    setupToken = process.env.SETUP_TOKEN,
    maxRequestBytes = MAX_REQUEST_BYTES,
    pushTransport = configuredPush(),
    background,
  }: {
    localSetup?: boolean;
    origin?: string;
    setupToken?: string;
    maxRequestBytes?: number;
    pushTransport?: PushTransport;
    background?: (work: Promise<void>) => void;
  } = {},
) {
  const push = pushTransport && createPush(db, pushTransport);
  async function flushPush(force = false) {
    const work = push?.flush(force);
    if (!work) return;
    if (background) background(work);
    else await work;
  }
  const secureCookie = (req: Request) => new URL(origin || req.url).protocol === "https:";
  const cookieName = (req: Request) =>
    secureCookie(req) ? "__Host-orbita_session" : "orbita_session";
  const cookie = (req: Request, value: string, age = SESSION_AGE) =>
    `${cookieName(req)}=${value}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${Math.floor(age / 1000)}${secureCookie(req) ? "; Secure" : ""}`;
  async function session(req: Request, q: Query = db) {
    const name = cookieName(req);
    const raw = req.headers
      .get("cookie")
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(name + "="))
      ?.slice(name.length + 1);
    if (!raw || !/^[a-f0-9]{64}$/.test(raw)) return null;
    const [user] = await q.all<User>(
      "SELECT u.* FROM orbita_sessions s JOIN orbita_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>$2 AND u.active=1",
      [hashToken(raw), Date.now()],
    );
    const expected = req.headers.get("x-orbita-account");
    assert(!expected || !user || user.id === expected, 401, "La cuenta cambió en otra pestaña. Inicia sesión de nuevo.");
    return user || null;
  }
  async function requireSession(req: Request, q: Query, admin = false) {
    const user = await session(req, q);
    assert(user, 401, "Tu sesión terminó. Inicia sesión de nuevo.");
    assert(!admin || user.role === "admin", 403, "Se requiere un administrador.");
    return user;
  }
  async function startSession(req: Request, u: User, q: Query) {
    const value = token();
    await q.run(
      "INSERT INTO orbita_sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)",
      [hashToken(value), u.id, Date.now() + SESSION_AGE],
    );
    await q.run("DELETE FROM orbita_sessions WHERE expires_at<$1", [
      Date.now(),
    ]);
    return cookie(req, value);
  }
  async function reserveAttempt(key: string) {
    await db.transaction(async (q) => {
      const now = Date.now();
      await q.run("DELETE FROM orbita_limits WHERE expires_at<=$1", [now]);
      const [row] = await q.all("SELECT attempts FROM orbita_limits WHERE key=$1", [key]);
      assert(
        !row || Number(row.attempts) < 10,
        429,
        "Demasiados intentos. Espera 15 minutos y vuelve a intentarlo.",
      );
      await q.run(
        "INSERT INTO orbita_limits(key,attempts,expires_at) VALUES($1,1,$2) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1",
        [key, now + 15 * 60 * 1000],
      );
    });
  }
  let hashing = 0;
  async function usePassword<T>(operation: () => Promise<T>) {
    assert(hashing < 2, 429, "Hay demasiados accesos simultáneos. Inténtalo de nuevo.");
    hashing++;
    try {
      return await operation();
    } finally {
      hashing--;
    }
  }
  return async (req: Request): Promise<Response> => {
    try {
      const url = new URL(req.url);
      const route = url.pathname.replace(/\/$/, "");
      const mutating = !["GET", "HEAD"].includes(req.method);
      if (mutating) {
        assert(
          req.headers.get("x-orbita-request") === "1" &&
            req.headers.get("content-type")?.split(";")[0].trim().toLowerCase() === "application/json",
          403,
          "Solicitud no válida. Recarga la página.",
        );
        const sent = req.headers.get("origin");
        assert(
          !sent || sent === (origin || url.origin),
          403,
          "La solicitud viene de otro sitio.",
        );
      }
      if (route === "/api/session" && req.method === "GET") {
        return await db.transaction(async (q) => {
          const user = await session(req, q);
          if (user) return json({ user: profile(user), setup: false, ...(await state(q, user)) });
          const [count] = await q.all("SELECT COUNT(*) AS n FROM orbita_users");
          return json({ user: null, setup: Number(count.n) === 0, requiresSetupToken: !localSetup });
        }, "read");
      }
      if (route === "/api/state" && req.method === "GET") {
        const response = await db.transaction(async (q) => {
          const user = await requireSession(req, q);
          const known = url.searchParams.get("revision");
          if (known !== null) {
            const [row] = await q.all<Stored>("SELECT revision FROM orbita_state WHERE slot='main'");
            if (known === String(row.revision)) return json({ user: profile(user), revision: row.revision });
          }
          return json({ user: profile(user), ...(await state(q, user)) });
        }, "read");
        await flushPush();
        return response;
      }
      let body: Record<string, unknown> = {};
      if (mutating) {
        const raw = await req.text();
        assert(
          Buffer.byteLength(raw) <= maxRequestBytes,
          413,
          "La solicitud es demasiado grande. Usa enlaces para archivos grandes.",
        );
        try {
          body = JSON.parse(raw);
        } catch {
          throw new HttpError(400, "La solicitud no contiene JSON válido.");
        }
        assert(
          body && typeof body === "object" && !Array.isArray(body),
          400,
          "Solicitud no válida.",
        );
      }
      if (route === "/api/setup" && req.method === "POST") {
        assert(
          localSetup ||
            (typeof setupToken === "string" &&
              setupToken.length >= 32 &&
              typeof body.setupToken === "string" &&
              equalSecret(body.setupToken, setupToken)),
          403,
          "El código de configuración inicial no es correcto.",
        );
        assert(
          validEmail(body.email) &&
            nameValid(body.name) &&
            validPassword(body.password),
          400,
          "Escribe un nombre, un correo válido y una contraseña de 12 a 128 caracteres.",
        );
        const [existing] = await db.all(
          "SELECT COUNT(*) AS n FROM orbita_users",
        );
        assert(
          Number(existing.n) === 0,
          409,
          "El administrador ya está creado. Inicia sesión.",
        );
        const password = await usePassword(() => hashPassword(body.password as string));
        const { user, snapshot, sessionCookie } = await db.transaction(async (q) => {
          const [count] = await q.all("SELECT COUNT(*) AS n FROM orbita_users");
          assert(
            Number(count.n) === 0,
            409,
            "El administrador ya está creado. Inicia sesión.",
          );
          const u: User = {
            id: randomUUID(),
            email: (body.email as string).trim().toLowerCase(),
            password_hash: password,
            name: (body.name as string).trim(),
            emoji: "🧑‍🚀",
            color: "#8c77cb",
            status: "disponible",
            role: "admin",
            active: 1,
            created_at: new Date().toISOString(),
          };
          await q.run(
            "INSERT INTO orbita_users(id,email,password_hash,name,emoji,color,status,role,active,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
            Object.values(u),
          );
          await q.run(
            "UPDATE orbita_state SET payload=$1,revision=1 WHERE slot='main'",
            [JSON.stringify(initialData(u, body.legacy))],
          );
          return { user: u, snapshot: await state(q, u), sessionCookie: await startSession(req, u, q) };
        });
        return json({ user: profile(user), ...snapshot }, 201, {
          "Set-Cookie": sessionCookie,
        });
      }
      if (route === "/api/login" && req.method === "POST") {
        const email =
          typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
        const key = hashToken("login:" + email);
        assert(
          validEmail(email) &&
            typeof body.password === "string" &&
            body.password.length <= 128,
          400,
          "Escribe tu correo y contraseña.",
        );
        const [user] = await db.all<User>(
          "SELECT * FROM orbita_users WHERE email=$1",
          [email],
        );
        const okay = await usePassword(async () => {
          await reserveAttempt(key);
          return verifyPassword(
            body.password as string,
            user?.password_hash ?? ("scrypt$00000000000000000000000000000000$" + "00".repeat(64)),
          );
        });
        assert(okay && user?.active, 401, "Correo o contraseña incorrectos.");
        return await db.transaction(async (q) => {
          const [fresh] = await q.all<User>("SELECT * FROM orbita_users WHERE id=$1", [user.id]);
          assert(fresh?.active && fresh.password_hash === user.password_hash, 401, "Correo o contraseña incorrectos.");
          await q.run("DELETE FROM orbita_limits WHERE key=$1", [key]);
          return json({ user: profile(fresh), ...(await state(q, fresh)) }, 200, {
            "Set-Cookie": await startSession(req, fresh, q),
          });
        });
      }
      if (route === "/api/invite" && req.method === "GET") {
        const raw = url.searchParams.get("token") || "";
        const [invite] = await db.all(
            "SELECT i.email,i.role,i.expires_at FROM orbita_invites i JOIN orbita_users u ON u.id=i.created_by WHERE i.token_hash=$1 AND i.used_at IS NULL AND i.expires_at>$2 AND u.active=1 AND u.role='admin'",
          [hashToken(raw), Date.now()],
        );
        assert(
          invite,
          404,
          "La invitación caducó o ya se utilizó. Pide una nueva.",
        );
        return json(invite);
      }
      if (route === "/api/register" && req.method === "POST") {
        assert(
          typeof body.token === "string" && /^[a-f0-9]{64}$/.test(body.token) &&
            nameValid(body.name) &&
            validPassword(body.password),
          400,
          "Completa tu nombre y una contraseña de al menos 12 caracteres.",
        );
        const [validInvite] = await db.all(
          "SELECT i.token_hash FROM orbita_invites i JOIN orbita_users u ON u.id=i.created_by WHERE i.token_hash=$1 AND i.used_at IS NULL AND i.expires_at>$2 AND u.active=1 AND u.role='admin'",
          [hashToken(body.token), Date.now()],
        );
        assert(validInvite, 400, "La invitación caducó o ya se utilizó.");
        const encoded = await usePassword(() => hashPassword(body.password as string));
        const { user, snapshot, sessionCookie } = await db.transaction(async (q) => {
          const [invite] = await q.all(
            "SELECT i.* FROM orbita_invites i JOIN orbita_users u ON u.id=i.created_by WHERE i.token_hash=$1 AND i.used_at IS NULL AND i.expires_at>$2 AND u.active=1 AND u.role='admin'",
            [hashToken(body.token as string), Date.now()],
          );
          assert(invite, 400, "La invitación caducó o ya se utilizó.");
          const u = await insertTeamUser(q, {
            email: String(invite.email),
            passwordHash: encoded,
            name: body.name as string,
            role: invite.role as Role,
          });
          await q.run(
            "UPDATE orbita_invites SET used_at=$1 WHERE token_hash=$2",
            [Date.now(), hashToken(body.token as string)],
          );
          return { user: u, snapshot: await state(q, u), sessionCookie: await startSession(req, u, q) };
        });
        return json({ user: profile(user), ...snapshot }, 201, {
          "Set-Cookie": sessionCookie,
        });
      }
      const current = await session(req);
      if (route === "/api/logout" && req.method === "POST") {
        const all = req.headers
          .get("cookie")
          ?.split(";")
          .map((c) => c.trim())
          .find((c) => c.startsWith(cookieName(req) + "="));
        if (all) await db.transaction(async (q) => {
          if (current && pushEndpoint(body.endpoint))
            await q.run("DELETE FROM orbita_push_devices WHERE endpoint=$1 AND user_id=$2", [body.endpoint, current.id]);
          await q.run("DELETE FROM orbita_sessions WHERE token_hash=$1", [hashToken(all.slice(all.indexOf("=") + 1))]);
        });
        return json({ ok: true }, 200, { "Set-Cookie": cookie(req, "", 0) });
      }
      assert(current, 401, "Tu sesión terminó. Inicia sesión de nuevo.");
      if (route === "/api/push") {
        if (req.method === "GET") return json({ publicKey: pushTransport?.publicKey ?? null });
        if (req.method === "PUT") {
          assert(pushTransport, 503, "Los avisos del dispositivo todavía no están disponibles.");
          const { endpoint, keys } = body;
          assert(pushEndpoint(endpoint) && pushKeys(keys), 400, "Este navegador no proporcionó una suscripción compatible.");
          await db.transaction(async (q) => {
            const user = await requireSession(req, q);
            await q.run(
              `INSERT INTO orbita_push_devices(endpoint,user_id,p256dh,auth,updated_at)
               VALUES($1,$2,$3,$4,$5)
               ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id,p256dh=excluded.p256dh,auth=excluded.auth,updated_at=excluded.updated_at`,
              [endpoint, user.id, keys.p256dh, keys.auth, Date.now()],
            );
            await q.run(
              `DELETE FROM orbita_push_devices WHERE user_id=$1 AND endpoint NOT IN
               (SELECT endpoint FROM orbita_push_devices WHERE user_id=$1 ORDER BY updated_at DESC, endpoint LIMIT 8)`,
              [user.id],
            );
          });
          return json({ enabled: true });
        }
        if (req.method === "POST") {
          const { action, endpoint } = body;
          assert(pushEndpoint(endpoint), 400, "El dispositivo no tiene una suscripción compatible.");
          if (action === "off") {
            await db.run("DELETE FROM orbita_push_devices WHERE endpoint=$1 AND user_id=$2", [endpoint, current.id]);
            return json({ enabled: false });
          }
          if (action === "test") {
            assert(push, 503, "Los avisos del dispositivo todavía no están disponibles.");
            await reserveAttempt(hashToken("push-test:" + current.id));
            assert(await push.test(current.id, endpoint), 409, "Activa los avisos en este dispositivo primero.");
            return json({ sent: true });
          }
          if (action === "status") {
            const [device] = await db.all(
              "SELECT endpoint FROM orbita_push_devices WHERE endpoint=$1 AND user_id=$2", [endpoint, current.id],
            );
            return json({ enabled: Boolean(device) });
          }
        }
      }
      if (route === "/api/password" && req.method === "POST") {
        assert(
          validPassword(body.current) && validPassword(body.password),
          400,
          "La nueva contraseña debe tener de 12 a 128 caracteres.",
        );
        const key = hashToken("password:" + current.id);
        const encoded = await usePassword(async () => {
          await reserveAttempt(key);
          assert(
            await verifyPassword(body.current as string, current.password_hash),
            400,
            "La contraseña actual no coincide.",
          );
          return hashPassword(body.password as string);
        });
        const sessionCookie = await db.transaction(async (q) => {
          const user = await requireSession(req, q);
          await q.run("UPDATE orbita_users SET password_hash=$1 WHERE id=$2", [
            encoded,
            current.id,
          ]);
          await q.run("DELETE FROM orbita_sessions WHERE user_id=$1", [
            current.id,
          ]);
          await q.run("DELETE FROM orbita_limits WHERE key=$1", [key]);
          return startSession(req, user, q);
        });
        return json({ ok: true }, 200, {
          "Set-Cookie": sessionCookie,
        });
      }
      if (route === "/api/users" && req.method === "GET") {
        return await db.transaction(async (q) => {
          await requireSession(req, q, true);
          return json({ users: (await users(q)).map(profile) });
        }, "read");
      }
      if (route === "/api/users" && req.method === "POST") {
        assert(current.role === "admin", 403, "Solo un administrador puede crear cuentas.");
        const { name, password, role } = body;
        const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
        assert(
          nameValid(name) && validEmail(email) && validPassword(password) &&
            typeof role === "string" && roleNames.includes(role),
          400,
          "Escribe un nombre, un correo válido, un rol y una contraseña de 12 a 128 caracteres.",
        );
        const passwordHash = await usePassword(() => hashPassword(password));
        const user = await db.transaction(async (q) => {
          await requireSession(req, q, true);
          const created = await insertTeamUser(q, { email, name, passwordHash, role: role as Role });
          await q.run("DELETE FROM orbita_invites WHERE email=$1 AND used_at IS NULL", [email]);
          return created;
        });
        return json({ user: profile(user) }, 201);
      }
      if (route === "/api/invites" && req.method === "POST") {
        assert(
          validEmail(body.email) &&
            typeof body.role === "string" &&
            roleNames.includes(body.role),
          400,
          "Revisa el correo y el rol.",
        );
        const email = body.email.trim().toLowerCase();
        const raw = token();
        const expiresAt = Date.now() + SESSION_AGE;
        await db.transaction(async (q) => {
          await requireSession(req, q, true);
          const people = await users(q);
          assert(!people.some((p) => p.email === email), 409, "Ese correo ya tiene cuenta. Puedes cambiar su rol en el equipo.");
          assert(people.length < 10, 409, "Este espacio tiene un máximo de 10 usuarios.");
          await q.run("DELETE FROM orbita_invites WHERE email=$1 OR expires_at<=$2", [email, Date.now()]);
          await q.run(
            "INSERT INTO orbita_invites(token_hash,email,role,created_by,expires_at,used_at) VALUES($1,$2,$3,$4,$5,NULL)",
            [hashToken(raw), email, body.role, current.id, expiresAt],
          );
        });
        return json(
          {
            url: `${origin || url.origin}/?invite=${raw}`,
            expiresAt,
          },
          201,
        );
      }
      if (route === "/api/users" && req.method === "PATCH") {
        assert(
          current.role === "admin",
          403,
          "Solo un administrador puede cambiar roles.",
        );
        assert(
          typeof body.id === "string" &&
            (body.role === undefined ||
              (typeof body.role === "string" &&
                roleNames.includes(body.role))) &&
            (body.active === undefined || typeof body.active === "boolean"),
          400,
          "Usuario o rol no válido.",
        );
        await db.transaction(async (q) => {
          await requireSession(req, q, true);
          const people = await users(q);
          const target = people.find((u) => u.id === body.id);
          assert(target, 404, "No encontramos ese usuario.");
          const role = (body.role || target.role) as Role;
          const active =
            body.active === undefined ? target.active : body.active ? 1 : 0;
          if (
            target.role === "admin" &&
            target.active &&
            (!active || role !== "admin")
          )
            assert(
              people.filter((u) => u.active && u.role === "admin").length > 1,
              409,
              "Debe quedar al menos un administrador activo.",
            );
          assert(
            target.id !== current.id || active,
            409,
            "No puedes desactivar tu propia cuenta.",
          );
          await q.run("UPDATE orbita_users SET role=$1,active=$2 WHERE id=$3", [
            role,
            active,
            target.id,
          ]);
          if (!active)
            await q.run("DELETE FROM orbita_sessions WHERE user_id=$1", [
              target.id,
            ]);
          if (!active)
            await q.run("DELETE FROM orbita_push_devices WHERE user_id=$1", [target.id]);
          if (!active || role !== "admin")
            await q.run("DELETE FROM orbita_invites WHERE created_by=$1 AND used_at IS NULL", [target.id]);
          await q.run(
            "UPDATE orbita_state SET revision=revision+1 WHERE slot='main'",
          );
        });
        return json({ ok: true });
      }
      if (route === "/api/state" && req.method === "PUT") {
        assert(
          isData(body.data) && Number.isInteger(body.revision),
          400,
          "El espacio contiene datos o referencias no válidos.",
        );
        const draft = body.data;
        const result = await db.transaction(async (q) => {
          const current = await requireSession(req, q);
          assert(draft.currentUser === current.id, 403, "El espacio pertenece a otra cuenta.");
          const { data: before, revision } = await state(q, current);
          assert(
            revision === body.revision,
            409,
            "El espacio cambió en otra sesión. Conservamos una copia de tus cambios para que puedas revisarlos.",
          );
          assert(
            same(
              draft.members.map((m) => m.id),
              before.members.map((m) => m.id),
            ),
            403,
            "Los usuarios se administran desde Nuestro equipo.",
          );
          for (const m of draft.members) {
            const old = before.members.find((p) => p.id === m.id)!;
            if (m.id !== current.id)
              assert(same(m, old), 403, "Solo puedes editar tu propio perfil.");
            else {
              assert(
                nameValid(m.name) &&
                  colorValid(m.color) &&
                  m.active === old.active &&
                  typeof m.emoji === "string" &&
                  m.emoji.length <= 16,
                400,
                "Revisa tu perfil.",
              );
            }
          }
          if (current.role !== "admin")
            assert(
              same(draft.boards, before.boards),
              403,
              "Solo los administradores pueden cambiar tableros y columnas.",
            );
          if (current.role === "viewer") {
            assert(
              same(draft.tasks, before.tasks),
              403,
              "Tu rol es de solo lectura.",
            );
            assert(
              same(
                draft.activities.map((a) => ({ ...a, unread: false })),
                before.activities.map((a) => ({ ...a, unread: false })),
              ),
              403,
              "Tu rol es de solo lectura.",
            );
          }
          const inactive = new Set(before.members.filter((m) => m.active === false).map((m) => m.id));
          const assignees = new Map(before.tasks.map((t) => [t.id, t.assignee]));
          for (const task of draft.tasks) {
            if (!inactive.has(task.assignee) || assignees.get(task.id) === task.assignee) continue;
            const [removed] = assignees.has(task.id) ? [] : await q.all(
              "SELECT key FROM orbita_removed WHERE key=$1",
              [JSON.stringify(["task", task.id])],
            );
            assert(removed, 400, "Selecciona una cuenta activa para asignar la tarea.");
          }
          await preserveAttribution(q, before, draft, current);
          const previousRead = new Map(before.activities.map((a) => [a.id, !a.unread]));
          for (const a of draft.activities) {
            if (a.actor === current.id || !previousRead.has(a.id) || previousRead.get(a.id) === !a.unread) continue;
            if (a.unread)
              await q.run("DELETE FROM orbita_activity_read WHERE user_id=$1 AND activity_id=$2", [current.id, a.id]);
            else
              await q.run("INSERT OR IGNORE INTO orbita_activity_read(user_id,activity_id) VALUES($1,$2)", [current.id, a.id]);
          }
          const own = draft.members.find((m) => m.id === current.id)!;
          await q.run(
            "UPDATE orbita_users SET name=$1,emoji=$2,color=$3,status=$4 WHERE id=$5",
            [own.name, own.emoji, own.color, own.status, current.id],
          );
          draft.currentUser = current.id;
          draft.members = (await users(q)).map(member);
          draft.onboarded = true;
          await q.run(
            "UPDATE orbita_state SET payload=$1,revision=revision+1 WHERE slot='main'",
            [JSON.stringify(draft)],
          );
          const queued = await push?.enqueue(q, before.tasks, draft.tasks);
          return { revision: revision + 1, queued };
        });
        await flushPush(result.queued);
        return json({ revision: result.revision });
      }
      return json({ error: "No encontramos esa acción." }, 404);
    } catch (error) {
      if (error instanceof HttpError)
        return json({ error: error.message }, error.status);
      console.error(
        "Órbita API:",
        error instanceof Error ? error.message : "Error interno",
      );
      return json(
        { error: "No se pudo completar la acción. Tus datos no se borraron." },
        500,
      );
    }
  };
}
