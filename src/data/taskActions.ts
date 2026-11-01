import type { Data, Task } from "../types";
import { nextDue, today, uid } from "../lib/utils";

export function record(data: Data, task: Task, text: string) {
  data.activities.unshift({
    id: uid(),
    actor: data.currentUser,
    taskId: task.id,
    text,
    at: new Date().toISOString(),
    unread: true,
  });
}

// Completar y generar la siguiente ocurrencia forman una sola operación reversible.
export function finishTask(data: Data, id: string) {
  const task = data.tasks.find((t) => t.id === id);
  if (!task || task.completedAt) return;
  const board = data.boards.find((b) => b.id === task.boardId);
  if (!board?.columns.length) return;
  task.columnId = board.columns.at(-1)!.id;
  task.completedAt = new Date().toISOString();
  task.movedAt = task.completedAt;
  record(data, task, `completó «${task.title}» 🎉`);
  const focused = data.tasks.filter((t) => t.focus.includes(data.currentUser));
  if (
    focused.length &&
    focused.every((t) => t.completedAt) &&
    !data.focusDays.includes(today())
  )
    data.focusDays.push(today());
  if (task.recurrence !== "ninguna") {
    data.tasks.push({
      ...structuredClone(task),
      id: uid(),
      columnId: board.columns[0].id,
      due: nextDue(task.due, task.recurrence),
      completedAt: undefined,
      createdAt: new Date().toISOString(),
      movedAt: new Date().toISOString(),
      comments: [],
      focus: [],
      reactions: {},
      checklist: task.checklist.map((c) => ({ ...c, id: uid(), done: false })),
    });
  }
}

export function moveTask(
  data: Data,
  id: string,
  columnId: string,
  targetId?: string,
) {
  const task = data.tasks.find((t) => t.id === id);
  const board = data.boards.find((b) => b.id === task?.boardId);
  if (!task || !board?.columns.some((c) => c.id === columnId)) return;
  const changed = task.columnId !== columnId;
  const target = data.tasks.find(
    (t) =>
      t.id === targetId &&
      t.boardId === task.boardId &&
      t.columnId === columnId,
  );
  const from = data.tasks.indexOf(task);
  const to = target ? data.tasks.indexOf(target) : data.tasks.length - 1;
  data.tasks.splice(from, 1);
  data.tasks.splice(to, 0, task);
  if (columnId === board.columns.at(-1)!.id) finishTask(data, id);
  else {
    task.completedAt = undefined;
    if (changed) {
      task.movedAt = new Date().toISOString();
      record(
        data,
        task,
        `movió «${task.title}» a ${board.columns.find((c) => c.id === columnId)!.name}`,
      );
    }
  }
  task.columnId = columnId;
}
