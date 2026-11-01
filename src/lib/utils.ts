import type { Member, Priority, Task } from "../types";
export const uid = () => crypto.randomUUID();
export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export const today = () => localDate();
export const priorityRank: Record<Priority, number> = {
  urgente: 0,
  alta: 1,
  media: 2,
  baja: 3,
};
export const isLate = (task: Task) =>
  !!task.due && task.due.slice(0, 10) < today() && !task.completedAt;
export function dueLabel(due: string) {
  if (!due) return "";
  const d = due.slice(0, 10);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return d === today()
    ? "Hoy"
    : d === localDate(tomorrow)
      ? "Mañana"
      : new Date(`${d}T12:00:00`).toLocaleDateString("es-CO", {
          day: "numeric",
          month: "short",
        });
}
export function nextDue(due: string, recurrence: Task["recurrence"]) {
  const d = new Date(`${(due || today()).slice(0, 10)}T12:00:00`);
  if (recurrence === "mensual") {
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, end));
  } else d.setDate(d.getDate() + (recurrence === "semanal" ? 7 : 1));
  return localDate(d) + (due.includes("T") ? due.slice(10) : "");
}
export function parseQuick(
  raw: string,
  members: Member[],
  currentUser: string,
) {
  let assignee = currentUser;
  const tags: string[] = [];
  let priority: Priority = "media";
  let due = "";
  let title = raw;
  const mention = raw.match(/@([\p{L}\d_-]+)/u);
  if (mention) {
    const key = mention[1].toLowerCase();
    const person =
      members.find(
        (m) => m.name.toLowerCase().startsWith(key) || m.id === key,
      ) ||
      (key === "ella" || key === "el"
        ? members.find((m) => m.id !== currentUser)
        : undefined);
    if (person) {
      assignee = person.id;
      title = title.replace(mention[0], "");
    }
  }
  title = title.replace(/#([\p{L}\d_-]+)/gu, (_, tag: string) => {
    if (["baja", "media", "alta", "urgente"].includes(tag.toLowerCase()))
      priority = tag.toLowerCase() as Priority;
    else tags.push(tag);
    return "";
  });
  if (/\b(mañana|hoy)\b/i.test(title)) {
    const d = new Date();
    if (/mañana/i.test(title)) d.setDate(d.getDate() + 1);
    due = localDate(d);
    title = title.replace(/\b(mañana|hoy)\b/gi, "");
  }
  const iso = title.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) {
    due = iso[1];
    title = title.replace(iso[0], "");
  }
  const time = title.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (time) {
    let h = Number(time[1]) % 12;
    if (time[3].toLowerCase() === "pm") h += 12;
    due = `${due || today()}T${String(h).padStart(2, "0")}:${time[2] || "00"}`;
    title = title.replace(time[0], "");
  }
  return {
    title: title.replace(/\s+/g, " ").trim(),
    assignee,
    tags,
    priority,
    due,
  };
}
export function streak(days: string[]) {
  let count = 0;
  const d = new Date();
  if (!days.includes(localDate(d))) d.setDate(d.getDate() - 1);
  while (days.includes(localDate(d))) {
    count++;
    d.setDate(d.getDate() - 1);
  }
  return count;
}
export function safeUrl(url: string) {
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}
