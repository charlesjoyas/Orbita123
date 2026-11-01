import type { Data } from "../types";
import { seedData } from "./seed";
import { today } from "../lib/utils";
import { isData } from "./validation";
export let repositoryWarning = "";
let recoveryRaw: string | null = null;
export function getRecoveryData() {
  try {
    return recoveryRaw || localStorage.getItem("orbita:recovery");
  } catch {
    return recoveryRaw;
  }
}
function resetFocus(data: Data) {
  // Repara inconsistencias que podía dejar el antiguo Deshacer de arrastre.
  for(const task of data.tasks){
    const board=data.boards.find(b=>b.id===task.boardId)!;
    if(!board.members.includes(task.assignee))board.members.push(task.assignee);
    if(task.columnId===board.columns.at(-1)!.id)task.completedAt ||= task.movedAt;
    else task.completedAt=undefined;
    task.focus=task.focus.filter(member=>member===task.assignee);
    task.tags=[...new Set(task.tags)];
  }
  if (data.focusDate && data.focusDate !== today())
    data.tasks.forEach((t) => {
      t.focus = [];
    });
  data.focusDate = today();
  try {
    const identity = sessionStorage.getItem("orbita:identity");
    if (identity && data.members.some((m) => m.id === identity))
      data.currentUser = identity;
  } catch {
    /* Identidad local opcional. */
  }
  return data;
}
export interface Repository {
  load(): Data;
  save(data: Data): void;
  subscribe(listener: (data: Data) => void): () => void;
}
const KEY = "orbita:data:v1";
export const localRepository: Repository = {
  load() {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(KEY);
      if (raw) {
        const data: unknown = JSON.parse(raw);
        if (isData(data)) return resetFocus(data);
        repositoryWarning =
          "Los datos guardados están incompletos. Conservamos una copia de recuperación.";
        recoveryRaw = raw;
        localStorage.setItem("orbita:recovery", raw);
      }
    } catch {
      if (raw) recoveryRaw = raw;
      repositoryWarning =
        "No se pudieron leer tus datos. El original no se borró; exporta la copia de recuperación desde tu perfil.";
    }
    const data = resetFocus(seedData());
    try {
      if (!repositoryWarning) localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      /* La app sigue disponible en memoria. */
    }
    return data;
  },
  save(data) {
    if (recoveryRaw) localStorage.setItem("orbita:recovery", recoveryRaw);
    localStorage.setItem(KEY, JSON.stringify(data));
  },
  subscribe(listener) {
    const handler = (e: StorageEvent) => {
      if (e.key === KEY && e.newValue) {
        try {
          const data: unknown = JSON.parse(e.newValue);
          if (isData(data)) listener(resetFocus(data));
        } catch {
          /* Ignorar mensajes incompletos. */
        }
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  },
};
