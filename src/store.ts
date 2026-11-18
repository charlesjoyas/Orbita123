import { create } from "zustand";
import type { Data, Task } from "./types";
import { repository } from "./data/repository";
import { accessError } from "./auth/permissions";
import { useIdentity } from "./auth/session";
import { makeTask } from "./data/seed";
import { today, uid } from "./lib/utils";
import {
  finishTask,
  moveTask as moveTaskData,
  record,
} from "./data/taskActions";
interface Store {
  data: Data;
  past: Data[];
  future: Data[];
  toast: string;
  toastUndo: boolean;
  storageError: boolean;
  commit: (edit: (d: Data) => void, message?: string) => void;
  undo: () => void;
  redo: () => void;
  patchTask: (id: string, patch: Partial<Task>, message?: string) => void;
  complete: (id: string) => void;
  moveTask: (id: string, columnId: string, targetId?: string) => void;
  convertStep: (id: string, stepId: string) => string | undefined;
  setCurrentUser: (id: string) => void;
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
  data: repository.load(),
  past: [],
  future: [],
  toast: "",
  toastUndo: false,
  storageError: false,
  commit(edit, message = "") {
    const before = get().data;
    const data = structuredClone(before);
    if (
      useIdentity.getState().user?.role !== "viewer" &&
      data.focusDate &&
      data.focusDate !== today()
    )
      data.tasks.forEach((t) => {
        t.focus = [];
      });
    data.focusDate = today();
    edit(data);
    const denied = accessError(before, data);
    if (denied) {
      get().notify(denied);
      return;
    }
    try {
      sessionStorage.setItem("orbita:identity", data.currentUser);
    } catch {
      /* Sesión opcional. */
    }
    data.activities = data.activities.slice(0, 1000);
    if (useIdentity.getState().user)
      for (const activity of data.activities)
        if (activity.actor === data.currentUser) activity.unread = false;
    let storageError = false;
    try {
      repository.save(data);
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
      toastUndo: !storageError && !!message,
    });
  },
  undo() {
    const { past, data, future } = get();
    const snapshot = past.at(-1);
    if (!snapshot) return;
    const prev = structuredClone(snapshot);
    if (prev.members.some((m) => m.id === data.currentUser))
      prev.currentUser = data.currentUser;
    const denied = accessError(data, prev);
    if (denied) {
      get().notify(denied);
      return;
    }
    try {
      repository.save(prev);
    } catch {
      get().notify("No se pudo guardar el cambio");
      return;
    }
    set({
      data: prev,
      past: past.slice(0, -1),
      future: [data, ...future],
      toast: "Cambio deshecho",
      toastUndo: false,
      storageError: false,
    });
  },
  redo() {
    const { future, data, past } = get();
    const snapshot = future[0];
    if (!snapshot) return;
    const next = structuredClone(snapshot);
    if (next.members.some((m) => m.id === data.currentUser))
      next.currentUser = data.currentUser;
    const denied = accessError(data, next);
    if (denied) {
      get().notify(denied);
      return;
    }
    try {
      repository.save(next);
    } catch {
      get().notify("No se pudo guardar el cambio");
      return;
    }
    set({
      data: next,
      past: [...past, data],
      future: future.slice(1),
      toast: "Cambio recuperado",
      toastUndo: false,
      storageError: false,
    });
  },
  patchTask(id, patch, message) {
    const original = get().data.tasks.find((t) => t.id === id);
    if (!original) return;
    if (
      patch.assignee && patch.assignee !== original.assignee &&
      !get().data.members.some((m) => m.id === patch.assignee && m.active !== false)
    ) {
      get().notify("Selecciona una cuenta activa para asignar la tarea.");
      return;
    }
    get().commit((d) => {
      const t = d.tasks.find((t) => t.id === id);
      if (!t) return;
      const {
        columnId,
        completedAt: _completed,
        id: _id,
        boardId: _board,
        ...fields
      } = patch;
      Object.assign(t, fields);
      if (fields.assignee)
        t.focus = t.focus.filter((member) => member === t.assignee);
      if (columnId && columnId !== t.columnId) moveTaskData(d, id, columnId);
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
    const task = get().data.tasks.find((t) => t.id === id);
    if (!task || task.completedAt) return;
    get().commit((d) => finishTask(d, id), "¡Una cosa menos, un paso más! ✨");
  },
  moveTask(id, columnId, targetId) {
    const t = get().data.tasks.find((t) => t.id === id);
    const board = get().data.boards.find((b) => b.id === t?.boardId);
    if (!t || !board?.columns.some((c) => c.id === columnId)) return;
    if (t.columnId === columnId && (!targetId || targetId === id)) return;
    get().commit(
      (d) => moveTaskData(d, id, columnId, targetId),
      "Tarea movida",
    );
  },
  convertStep(id, stepId) {
    const task = get().data.tasks.find((t) => t.id === id);
    const step = task?.checklist.find((c) => c.id === stepId);
    if (!task || !step) return;
    const board = get().data.boards.find((b) => b.id === task.boardId)!;
    const targetColumn = task.completedAt ? board.columns[0].id : task.columnId;
    const child = makeTask(
      task.boardId,
      targetColumn,
      step.text,
      get().data.members.some((m) => m.active !== false && m.id === task.assignee)
        ? task.assignee
        : get().data.currentUser,
    );
    child.creator = get().data.currentUser;
    get().commit((d) => {
      d.tasks.push(child);
      d.tasks.find((t) => t.id === id)!.checklist = d.tasks
        .find((t) => t.id === id)!
        .checklist.filter((c) => c.id !== stepId);
      record(d, child, "convirtió un paso en «" + child.title + "»");
    }, "El paso ahora tiene su propia tarea ✨");
    return child.id;
  },
  setCurrentUser(id) {
    if (useIdentity.getState().user) {
      get().notify("Para cambiar de cuenta, cierra tu sesión.");
      return;
    }
    if (!get().data.members.some((m) => m.id === id)) return;
    try {
      sessionStorage.setItem("orbita:identity", id);
    } catch {
      /* Sesión opcional. */
    }
    set({
      data: { ...get().data, currentUser: id },
      toast: "Ahora ves tu propia órbita",
      toastUndo: false,
    });
  },
  removeTask(id) {
    get().commit((d) => {
      d.tasks = d.tasks.filter((t) => t.id !== id);
    }, "Tarea eliminada");
  },
  addTask(boardId, columnId, title, patch = {}) {
    if (useIdentity.getState().user?.role === "viewer") {
      get().notify("Tu cuenta tiene acceso de solo lectura.");
      return "";
    }
    const board = get().data.boards.find((b) => b.id === boardId);
    const clean = (patch.title ?? title).trim();
    if (!board || !board.columns.some((c) => c.id === columnId) || !clean) {
      get().notify("Escribe un título y elige una columna válida");
      return "";
    }
    const t = {
      ...makeTask(boardId, columnId, clean, get().data.currentUser),
      ...patch,
      id: uid(),
      boardId,
      columnId,
      title: clean,
      creator: get().data.currentUser,
      createdAt: new Date().toISOString(),
      movedAt: new Date().toISOString(),
      completedAt: undefined,
    };
    if (!get().data.members.some((m) => m.active !== false && m.id === t.assignee))
      t.assignee = get().data.currentUser;
    t.tags = [...new Set(t.tags)];
    get().commit(
      (d) => {
        const first = d.tasks.findIndex((x) => x.columnId === columnId);
        d.tasks.splice(first < 0 ? d.tasks.length : first, 0, t);
        const b = d.boards.find((b) => b.id === boardId)!;
        if (!b.members.includes(t.assignee)) b.members.push(t.assignee);
        record(d, t, "creó «" + clean + "»");
        if (columnId === b.columns.at(-1)!.id) finishTask(d, t.id);
      },
      "Añadida a " + board.columns.find((c) => c.id === columnId)!.name + " ✨",
    );
    return t.id;
  },
  notify(toast) {
    set({ toast, toastUndo: false });
  },
}));
repository.subscribe((data) => {
  const identity = useStore.getState().data.currentUser;
  if (data.members.some((m) => m.id === identity)) data.currentUser = identity;
  useStore.setState({
    data,
    past: [],
    future: [],
    toast: "Espacio actualizado desde otra pestaña",
    toastUndo: false,
  });
});
