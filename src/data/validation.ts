import type { Data } from "../types";
import { isValidDue } from "../lib/utils";

type Obj = Record<string, unknown>;
const object = (v: unknown): v is Obj =>
  !!v && typeof v === "object" && !Array.isArray(v);
const strings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");
const text = (v: Obj, ...keys: string[]) =>
  keys.every((k) => typeof v[k] === "string");
const unique = (items: Obj[]) =>
  items.every((x) => typeof x.id === "string" && x.id.length > 0) &&
  new Set(items.map((x) => x.id)).size === items.length;
const reactions = (v: unknown) => object(v) && Object.values(v).every(strings);
const list = (v: unknown, check: (x: Obj) => boolean): v is Obj[] =>
  Array.isArray(v) && v.every((x) => object(x) && check(x)) && unique(v);

// Rechazamos copias incompletas antes de reemplazar el espacio que funciona.
export function isData(v: unknown): v is Data {
  if (
    !object(v) ||
    v.version !== 1 ||
    typeof v.onboarded !== "boolean" ||
    !strings(v.focusDays) ||
    !text(v, "currentUser")
  )
    return false;
  if (
    !list(
      v.members,
      (m) =>
        text(m, "id", "name", "emoji", "color", "status") &&
        !!String(m.name).trim() &&
        /^#[\da-f]{6}$/i.test(String(m.color)) &&
        ["disponible", "en foco", "fuera"].includes(String(m.status)),
    ) ||
    !v.members.length ||
    v.members.length > 10
  )
    return false;
  const members = new Set(v.members.map((m) => m.id));
  if (!members.has(v.currentUser)) return false;
  if (
    !list(
      v.boards,
      (b) =>
        text(b, "id", "name", "emoji", "background") &&
        !!String(b.name).trim() &&
        strings(b.members) &&
        b.members.every((m) => members.has(m)) &&
        list(
          b.columns,
          (c) =>
            text(c, "id", "name", "emoji", "color") &&
            !!String(c.name).trim() &&
            /^#[\da-f]{6}$/i.test(String(c.color)) &&
            (c.wip === undefined ||
              (typeof c.wip === "number" &&
                Number.isInteger(c.wip) &&
                c.wip > 0)),
        ) &&
        b.columns.length >= 1,
    ) ||
    !v.boards.length
  )
    return false;
  const boards = v.boards;
  if (
    !list(v.tasks, (t) => {
      const board = boards.find((b) => b.id === t.boardId);
      return (
        text(
          t,
          "id",
          "boardId",
          "columnId",
          "title",
          "description",
          "creator",
          "assignee",
          "priority",
          "due",
          "blocked",
          "recurrence",
          "createdAt",
          "movedAt",
        ) &&
        !!String(t.title).trim() &&
        !!board &&
        (board.columns as Obj[]).some((c) => c.id === t.columnId) &&
        members.has(t.creator) &&
        members.has(t.assignee) &&
        ["baja", "media", "alta", "urgente"].includes(String(t.priority)) &&
        ["ninguna", "diaria", "semanal", "mensual"].includes(
          String(t.recurrence),
        ) &&
        isValidDue(String(t.due)) &&
        Number.isFinite(t.effort) &&
        Number(t.effort) > 0 &&
        strings(t.tags) &&
        strings(t.focus) &&
        t.focus.every((m) => members.has(m)) &&
        reactions(t.reactions) &&
        list(
          t.checklist,
          (c) => text(c, "id", "text") && typeof c.done === "boolean",
        ) &&
        list(
          t.comments,
          (c) =>
            text(c, "id", "author", "text", "at") &&
            members.has(c.author) &&
            reactions(c.reactions) &&
            Number.isFinite(Date.parse(String(c.at))),
        ) &&
        list(
          t.attachments,
          (a) =>
            text(a, "id", "name", "url") &&
            /^(https?:\/\/|data:)/i.test(String(a.url)),
        ) &&
        Number.isFinite(Date.parse(String(t.createdAt))) &&
        Number.isFinite(Date.parse(String(t.movedAt))) &&
        (t.completedAt === undefined ||
          (typeof t.completedAt === "string" &&
            Number.isFinite(Date.parse(t.completedAt)))) &&
        (t.cover === undefined ||
          ["violet", "peach", "mint"].includes(String(t.cover)))
      );
    })
  )
    return false;
  return list(
    v.activities,
    (a) =>
      text(a, "id", "actor", "text", "at") &&
      members.has(a.actor) &&
      typeof a.unread === "boolean" &&
      Number.isFinite(Date.parse(String(a.at))) &&
      (a.taskId === undefined || typeof a.taskId === "string"),
  );
}
