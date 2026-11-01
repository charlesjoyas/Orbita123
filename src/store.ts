import { create } from "zustand";
import type { Data, Task } from "./types";
import { localRepository } from "./data/repository";
import { makeTask } from "./data/seed";
import { nextDue, today, uid } from "./lib/utils";
interface Store {
  data: Data;
  past: Data[];
  future: Data[];
  toast: string;
  storageError: boolean;
  commit: (edit: (d: Data) => void, message?: string) => void;
  undo: () => void;
  redo: () => void;
  patchTask: (id: string, patch: Partial<Task>, message?: string) => void;
  complete: (id: string) => void;
  removeTask: (id: string) => void;
  addTask: (
    boardId: string,
    columnId: string,
    title: string,
    patch?: Partial<Task>,
  ) => string;
  notify: (message: string) => void;
}
export const useStore = create<Store>((set, get) => ({
  data: localRepository.load(),
  past: [],
  future: [],
  toast: "",
  storageError: false,
  commit(edit, message = "") {
    const before = get().data;
    const data = structuredClone(before);
    if (data.focusDate && data.focusDate !== today())
      data.tasks.forEach((t) => {
        t.focus = [];
      });
    data.focusDate = today();
    edit(data);
    try {
      sessionStorage.setItem("orbita:identity", data.currentUser);
    } catch {
      /* Sesión opcional. */
    }
    data.activities = data.activities.slice(0, 1000);
    let storageError = false;
    try {
      localRepository.save(data);
    } catch {
      storageError = true;
    }
    set({
      data,
      past: [...get().past.slice(-39), before],
      future: [],
      toast: storageError
        ? "No se pudo guardar. Exporta una copia desde tu perfil."
        : message,
      storageError,
    });
  },
  undo() {
    const { past, data, future } = get();
    const prev = past.at(-1);
    if (!prev) return;
    try {
      localRepository.save(prev);
    } catch {
      get().notify("No se pudo guardar el cambio");
      return;
    }
    set({
      data: prev,
      past: past.slice(0, -1),
      future: [data, ...future],
      toast: "Cambio deshecho",
    });
  },
  redo() {
    const { future, data, past } = get();
    const next = future[0];
    if (!next) return;
    try {
      localRepository.save(next);
    } catch {
      get().notify("No se pudo guardar el cambio");
      return;
    }
    set({
      data: next,
      past: [...past, data],
      future: future.slice(1),
      toast: "Cambio recuperado",
    });
  },
  patchTask(id, patch, message) {
    get().commit((d) => {
      const t = d.tasks.find((t) => t.id === id);
      if (!t) return;
      Object.assign(t, patch);
      const board = d.boards.find((b) => b.id === t.boardId);
      if (board && !board.members.includes(t.assignee))
        board.members.push(t.assignee);
      if (message)
        d.activities.unshift({
          id: uid(),
          actor: d.currentUser,
          taskId: id,
          text: message,
          at: new Date().toISOString(),
          unread: true,
        });
    }, message);
  },
  complete(id) {
    get().commit((d) => {
      const t = d.tasks.find((t) => t.id === id);
      if (!t || t.completedAt) return;
      const b = d.boards.find((b) => b.id === t.boardId)!;
      t.columnId = b.columns.at(-1)!.id;
      t.completedAt = new Date().toISOString();
      t.movedAt = t.completedAt;
      d.activities.unshift({
        id: uid(),
        actor: d.currentUser,
        taskId: id,
        text: `completó «${t.title}» 🎉`,
        at: t.completedAt,
        unread: true,
      });
      const focused = d.tasks.filter((x) => x.focus.includes(d.currentUser));
      if (
        focused.length > 0 &&
        focused.every((x) => x.completedAt) &&
        !d.focusDays.includes(today())
      )
        d.focusDays.push(today());
      if (t.recurrence !== "ninguna") {
        const next = {
          ...structuredClone(t),
          id: uid(),
          columnId: b.columns[0].id,
          due: nextDue(t.due, t.recurrence),
          completedAt: undefined,
          createdAt: new Date().toISOString(),
          movedAt: new Date().toISOString(),
          comments: [],
          focus: [],
          reactions: {},
          checklist: t.checklist.map((c) => ({ ...c, id: uid(), done: false })),
        };
        d.tasks.push(next);
      }
    }, "¡Una cosa menos, un paso más! ✨");
  },
  removeTask(id) {
    get().commit((d) => {
      d.tasks = d.tasks.filter((t) => t.id !== id);
    }, "Tarea eliminada");
  },
  addTask(boardId, columnId, title, patch = {}) {
    const t = {
      ...makeTask(boardId, columnId, title, get().data.currentUser),
      ...patch,
    };
    const board = get().data.boards.find((b) => b.id === boardId);
    if (columnId === board?.columns.at(-1)?.id)
      t.completedAt = new Date().toISOString();
    get().commit((d) => {
      d.tasks.push(t);
      d.activities.unshift({
        id: uid(),
        actor: d.currentUser,
        taskId: t.id,
        text: `creó «${title}»`,
        at: new Date().toISOString(),
        unread: true,
      });
    }, "Tu idea ya tiene un lugar ✨");
    return t.id;
  },
  notify(toast) {
    set({ toast });
  },
}));
localRepository.subscribe((data) => {
  const identity = useStore.getState().data.currentUser;
  if (data.members.some((m) => m.id === identity)) data.currentUser = identity;
  useStore.setState({
    data,
    past: [],
    future: [],
    toast: "Espacio actualizado desde otra pestaña",
  });
});
