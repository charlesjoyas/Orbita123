import type { Data } from "../types";
import { seedData } from "./seed";
import { today } from "../lib/utils";
function resetFocus(data: Data) {
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
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const data = JSON.parse(raw) as Data;
        if (
          data.version === 1 &&
          Array.isArray(data.tasks) &&
          data.boards.length
        )
          return resetFocus(data);
      }
    } catch {
      /* Se recupera con datos de ejemplo si el almacenamiento está corrupto. */
    }
    const data = resetFocus(seedData());
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      /* La app sigue disponible en memoria. */
    }
    return data;
  },
  save(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
  },
  subscribe(listener) {
    const handler = (e: StorageEvent) => {
      if (e.key === KEY && e.newValue) {
        try {
          const data = JSON.parse(e.newValue) as Data;
          if (data.version === 1) listener(resetFocus(data));
        } catch {
          /* Ignorar mensajes incompletos. */
        }
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  },
};
