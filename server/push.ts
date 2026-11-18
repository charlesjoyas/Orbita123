import type { Task } from "../src/types";
import type { Database, Query, Row } from "./db.ts";

type Device = Row & { endpoint: string; p256dh: string; auth: string };
type Job = Row & { id: number; endpoint: string; user_id: string; task_id: string; attempts: number };
type Payload = { taskId?: string; tag: string; test?: boolean };
export type PushTransport = {
  publicKey: string;
  send(device: Device, payload: Payload): Promise<void>;
};
const day = 24 * 60 * 60 * 1000;

export function pushEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.port || url.username || url.password || url.hash) return false;
    const hostname = url.hostname;
    return hostname === "fcm.googleapis.com" ||
      hostname === "updates.push.services.mozilla.com" ||
      hostname.endsWith(".push.apple.com") ||
      hostname.endsWith(".notify.windows.com");
  } catch {
    return false;
  }
}

export function pushKeys(value: unknown): value is { p256dh: string; auth: string } {
  if (!value || typeof value !== "object") return false;
  const { p256dh, auth } = value as { p256dh?: unknown; auth?: unknown };
  return typeof p256dh === "string" && /^[A-Za-z0-9_-]{87}$/.test(p256dh) &&
    Buffer.from(p256dh, "base64url")[0] === 4 &&
    typeof auth === "string" && /^[A-Za-z0-9_-]{22}$/.test(auth);
}

export function configuredPush(): PushTransport | undefined {
  const { PUSH_PUBLIC_KEY: publicKey, PUSH_PRIVATE_KEY: privateKey, PUSH_SUBJECT: subject } = process.env;
  if (!publicKey || !privateKey || !subject) return;
  return {
    publicKey,
    async send(device, payload) {
      const { sendNotification } = await import("web-push");
      await sendNotification({
        endpoint: device.endpoint,
        keys: { p256dh: device.p256dh, auth: device.auth },
      }, JSON.stringify(payload), {
        vapidDetails: { subject, publicKey, privateKey },
        TTL: 3600,
        timeout: 5000,
      });
    },
  };
}

function statusOf(error: unknown) {
  return error && typeof error === "object" && "statusCode" in error ? Number(error.statusCode) : 0;
}

export function assignmentChanges(before: Task[], after: Task[]) {
  const assignees = new Map(before.map((task) => [task.id, task.assignee]));
  return after.filter((task) => assignees.get(task.id) !== task.assignee)
    .map(({ id, assignee }) => ({ id, assignee }));
}

export function createPush(db: Database, transport: PushTransport) {
  let draining: Promise<void> | undefined;
  let lastCheck = 0;

  async function enqueue(q: Query, before: Task[], after: Task[]) {
    const changes = assignmentChanges(before, after);
    if (!changes.length) return false;
    const now = Date.now();
    await q.run(
      `INSERT INTO orbita_push_jobs(endpoint,user_id,task_id,created_at,next_at)
       SELECT devices.endpoint,devices.user_id,json_extract(change.value,'$.id'),$2,$2
       FROM json_each($1) AS change
       JOIN orbita_push_devices devices ON devices.user_id=json_extract(change.value,'$.assignee')
       JOIN orbita_users users ON users.id=devices.user_id AND users.active=1`,
      [JSON.stringify(changes), now],
    );
    return true;
  }

  async function deliver(job: Job, tasks: Map<string, string>) {
    const [device] = await db.all<Device>(
      `SELECT devices.* FROM orbita_push_devices devices
       JOIN orbita_users users ON users.id=devices.user_id AND users.active=1
       WHERE endpoint=$1 AND devices.user_id=$2`,
      [job.endpoint, job.user_id],
    );
    let retry = false;
    if (device && tasks.get(job.task_id) === job.user_id) {
      try {
        await transport.send(device, { taskId: job.task_id, tag: "assignment-" + job.id });
      } catch (error) {
        const status = statusOf(error);
        if (status === 404 || status === 410) {
          await db.run("DELETE FROM orbita_push_devices WHERE endpoint=$1 AND user_id=$2 AND p256dh=$3 AND auth=$4",
            [device.endpoint, job.user_id, device.p256dh, device.auth]);
        } else {
          retry = job.attempts < 4 && (status === 0 || status === 429 || status >= 500);
          if (!retry) console.warn("Órbita Push:", status || "Error de transporte");
        }
      }
    }
    if (retry)
      await db.run("UPDATE orbita_push_jobs SET next_at=$1 WHERE id=$2", [Date.now() + 30000 * 2 ** (job.attempts - 1), job.id]);
    else
      await db.run("DELETE FROM orbita_push_jobs WHERE id=$1", [job.id]);
  }

  async function drain() {
    const now = Date.now();
    const [pending] = await db.all(
      "SELECT id FROM orbita_push_jobs WHERE next_at<=$1 OR created_at<$2 LIMIT 1", [now, now - day],
    );
    if (!pending) return;
    await db.run("DELETE FROM orbita_push_jobs WHERE created_at<$1 OR (attempts>=4 AND next_at<=$2)", [now - day, now]);
    const jobs = await db.all<Job>(
      `UPDATE orbita_push_jobs SET attempts=attempts+1,next_at=$2
       WHERE id IN (SELECT id FROM orbita_push_jobs WHERE next_at<=$1 ORDER BY next_at,id LIMIT 25)
       RETURNING id,endpoint,user_id,task_id,attempts`,
      [now, now + 60000],
    );
    if (!jobs.length) return;
    const [row] = await db.all<{ payload: string }>("SELECT payload FROM orbita_state WHERE slot='main'");
    const tasks = new Map<string, string>(
      (JSON.parse(row.payload)?.tasks as Task[] | undefined ?? [])
        .map((task) => [task.id, task.assignee]),
    );
    await Promise.allSettled(jobs.map((job) => deliver(job, tasks)));
  }

  return {
    enqueue,
    flush(force = false) {
      if (draining) return draining;
      if (!force && Date.now() - lastCheck < 30000) return;
      lastCheck = Date.now();
      draining = drain().catch(() => console.warn("Órbita Push: la cola se reintentará."))
        .finally(() => { draining = undefined; });
      return draining;
    },
    async test(userId: string, endpoint: string) {
      const [device] = await db.all<Device>(
        "SELECT * FROM orbita_push_devices WHERE user_id=$1 AND endpoint=$2", [userId, endpoint],
      );
      if (!device) return false;
      try {
        await transport.send(device, { tag: "orbita-test", test: true });
        return true;
      } catch (error) {
        const status = statusOf(error);
        if (status === 404 || status === 410) {
          await db.run("DELETE FROM orbita_push_devices WHERE endpoint=$1 AND user_id=$2", [endpoint, userId]);
          return false;
        }
        throw error;
      }
    },
  };
}
