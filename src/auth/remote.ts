import type { Data } from "../types";
import {
  configureRepository,
  publishData,
  type Repository,
} from "../data/repository";
import { useStore } from "../store";
import { api, ApiError, useIdentity, type Account } from "./session";
export interface SessionResult {
  user: Account | null;
  setup?: boolean;
  requiresSetupToken?: boolean;
  data?: Data;
  revision?: number;
}
let retry: () => void = () => {};
let stop: () => void = () => {};
export const retrySave = () => retry();
export function stopRemote() {
  stop();
  stop = () => {};
  retry = () => {};
}
export function connectRemote(initial: Data, version: number, user: Account) {
  stopRemote();
  let revision = version;
  let closed = false;
  let working = false;
  let queued: Data | null = null;
  let sending: Data | null = null;
  let failed: Data | null = null;
  let edits = 0;
  let polling = false;
  let recoveryDraft: string | null = null;
  const key = `orbita:unsaved:${user.id}`;
  const backup = (data: Data) => {
    recoveryDraft = JSON.stringify(data);
    try {
      localStorage.setItem(key, recoveryDraft);
    } catch {
      /* El borrador sigue en memoria. */
    }
  };
  const clearSavedBackup = (data: Data) => {
    const saved = JSON.stringify(data);
    if (recoveryDraft === saved) recoveryDraft = null;
    try {
      if (localStorage.getItem(key) === saved) localStorage.removeItem(key);
    } catch {
      /* El navegador puede bloquear el almacenamiento. */
    }
  };
  const refreshIdentity = (account: Account | null) => {
    useIdentity.setState({ user: account, ready: true, expired: !account });
    if (!account) stopRemote();
  };
  async function drain() {
    if (working || closed) return;
    working = true;
    try {
      while (queued && !closed) {
        const data: Data = queued;
        sending = data;
        queued = null;
        try {
          const result = await api<{ revision: number }>("state", "PUT", {
            data,
            revision,
          });
          if (closed) return;
          revision = result.revision;
          if (failed) clearSavedBackup(data);
          failed = null;
          useStore.setState({ storageError: false });
        } catch (error) {
          if (closed) return;
          failed = queued || data;
          backup(failed);
          queued = null;
          useStore.setState({ storageError: true });
          if (error instanceof ApiError && error.status === 401) {
            refreshIdentity(null);
            break;
          }
          useStore
            .getState()
            .notify(
              error instanceof Error
                ? error.message
                : "No se pudo guardar. Tus cambios están en una copia local.",
            );
          if (
            error instanceof ApiError &&
            [400, 403, 409, 413].includes(error.status)
          ) {
            try {
              const fresh = await api<SessionResult>("state");
              if (closed) return;
              if (fresh.data && fresh.user) {
                if (queued) backup(queued);
                queued = null;
                revision = fresh.revision!;
                publishData(fresh.data);
                refreshIdentity(fresh.user);
                failed = null;
                useStore.setState({ storageError: false });
                useStore
                  .getState()
                  .notify(
                    "El servidor conservó el espacio actual. Puedes exportar tus cambios pendientes desde tu perfil.",
                  );
              }
            } catch (refreshError) {
              if (!closed && queued) {
                failed = queued;
                backup(queued);
                queued = null;
              }
              if (!closed && refreshError instanceof ApiError && refreshError.status === 401)
                refreshIdentity(null);
            }
          }
          break;
        }
      }
    } finally {
      sending = null;
      working = false;
    }
  }
  const repo: Repository = {
    load: () => initial,
    save(data) {
      edits++;
      queued = structuredClone(data);
      void drain();
    },
    subscribe: () => () => {},
    recovery() {
      if (recoveryDraft) return recoveryDraft;
      try {
        return (
          localStorage.getItem(key) || (failed ? JSON.stringify(failed) : null)
        );
      } catch {
        return failed ? JSON.stringify(failed) : null;
      }
    },
  };
  configureRepository(repo);
  useStore.setState({
    data: initial,
    past: [],
    future: [],
    toast: "",
    toastUndo: false,
    storageError: false,
  });
  async function poll() {
    if (closed || working || queued || polling) return;
    const startedAfter = edits;
    polling = true;
    try {
      const result = await api<SessionResult>(`state?revision=${revision}`);
      if (closed || startedAfter !== edits || working || queued) return;
      refreshIdentity(result.user);
      if (!failed && result.data && result.revision !== revision) {
        revision = result.revision!;
        publishData(result.data);
      }
    } catch (error) {
      if (!closed && startedAfter === edits && error instanceof ApiError && error.status === 401)
        refreshIdentity(null);
    } finally {
      polling = false;
    }
  }
  const timer = setInterval(() => void poll(), 7000);
  retry = () => {
    if (failed) {
      queued ??= failed;
      void drain();
    } else void poll();
  };
  const online = () => retry();
  const leave = () => {
    const draft = queued || sending || failed;
    if (draft) backup(draft);
  };
  const confirmLeave = (event: BeforeUnloadEvent) => {
    if (queued || sending || failed) {
      leave();
      event.preventDefault();
      event.returnValue = "";
    }
  };
  window.addEventListener("online", online);
  window.addEventListener("pagehide", leave);
  window.addEventListener("beforeunload", confirmLeave);
  stop = () => {
    leave();
    closed = true;
    clearInterval(timer);
    window.removeEventListener("online", online);
    window.removeEventListener("pagehide", leave);
    window.removeEventListener("beforeunload", confirmLeave);
    queued = null;
  };
}
