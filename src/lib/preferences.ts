// Las preferencias no deben impedir usar la app si el navegador limita el almacenamiento.
const memory = new Map<string, string>();
export function readPreference(key: string) {
  try {
    return localStorage.getItem(key) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}
export function writePreference(key: string, value: string) {
  memory.set(key, value);
  try {
    localStorage.setItem(key, value);
  } catch {
    /* La sesión sigue funcionando en memoria. */
  }
}
