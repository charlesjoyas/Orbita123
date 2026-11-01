import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextDue, parseQuick, streak } from "./utils";
import { seedData } from "../data/seed";
const values = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => values.get(k) || null,
  setItem: (k: string, v: string) => values.set(k, v),
  removeItem: (k: string) => values.delete(k),
});
vi.stubGlobal("window", {
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});
const { useStore } = await import("../store");
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 31, 12));
  useStore.setState({ data: seedData(), past: [], future: [], toast: "" });
});
afterEach(() => vi.useRealTimers());
describe("Creación natural", () => {
  it("interpreta persona, fecha, hora, prioridad y etiqueta sin perder el título", () => {
    const data = seedData();
    expect(
      parseQuick(
        "Enviar propuesta @Vale mañana 3pm #urgente #Cliente",
        data.members,
        "me",
      ),
    ).toEqual({
      title: "Enviar propuesta",
      assignee: "vale",
      due: "2026-11-01T15:00",
      priority: "urgente",
      tags: ["Cliente"],
    });
  });
  it("conserva menciones desconocidas para no perder información", () => {
    expect(
      parseQuick("Hablar con @Pedro", seedData().members, "me").title,
    ).toBe("Hablar con @Pedro");
  });
  it("entiende medianoche y mediodía", () => {
    expect(parseQuick("Revisar hoy 12am", seedData().members, "me").due).toBe(
      "2026-10-31T00:00",
    );
    expect(parseQuick("Revisar hoy 12pm", seedData().members, "me").due).toBe(
      "2026-10-31T12:00",
    );
  });
});
describe("Recurrencia y calendario", () => {
  it("limita el día al último válido del mes siguiente", () => {
    expect(nextDue("2027-01-31T15:00", "mensual")).toBe("2027-02-28T15:00");
  });
  it("conserva la hora en recurrencia semanal", () => {
    expect(nextDue("2026-10-31T09:30", "semanal")).toBe("2026-11-07T09:30");
  });
  it("cuenta una racha que termina ayer", () => {
    expect(streak(["2026-10-29", "2026-10-30"])).toBe(2);
    expect(streak(["2026-10-28"])).toBe(0);
  });
});
describe("Cambios reversibles", () => {
  it("marca como completada una tarea creada directamente en Hecho", () => {
    const board=useStore.getState().data.boards[0];
    const id=useStore.getState().addTask(board.id,board.columns.at(-1)!.id,"Una victoria");
    expect(useStore.getState().data.tasks.find(t=>t.id===id)?.completedAt).toBeTruthy();
  });
  it("incluye en el tablero a una persona al asignarle una tarea", () => {
    useStore.getState().commit(d=>{d.members.push({id:'new',name:'Sol',emoji:'☀️',color:'#aabbcc',status:'disponible'})});
    const id=useStore.getState().data.tasks[0].id;
    useStore.getState().patchTask(id,{assignee:'new'});
    expect(useStore.getState().data.boards[0].members).toContain('new');
  });
  it("renueva el foco al cambiar el día y conserva las rachas", () => {
    useStore.getState().commit(d=>{d.focusDays=['2026-10-30']});
    vi.setSystemTime(new Date(2026,10,1,12));
    useStore.getState().commit(()=>{});
    expect(useStore.getState().data.tasks.every(t=>t.focus.length===0)).toBe(true);
    expect(useStore.getState().data.focusDays).toEqual(['2026-10-30']);
  });
  it("mantiene integridad y deshacer con más de 250 tarjetas", () => {
    useStore.getState().commit(d=>{const source=d.tasks[0];for(let i=0;i<250;i++)d.tasks.push({...structuredClone(source),id:`bulk-${i}`,title:`Idea ${i}`})});
    const before=structuredClone(useStore.getState().data);
    useStore.getState().patchTask('bulk-249',{title:'Última idea revisada',priority:'urgente'});
    expect(useStore.getState().data.tasks.length).toBe(260);
    expect(useStore.getState().data.tasks.find(t=>t.id==='bulk-249')?.title).toBe('Última idea revisada');
    useStore.getState().undo();
    expect(useStore.getState().data).toEqual(before);
  });
  it("recupera una tarea eliminada con sus datos y permite rehacer", () => {
    const original = useStore.getState().data.tasks[0];
    useStore.getState().removeTask(original.id);
    expect(
      useStore.getState().data.tasks.find((t) => t.id === original.id),
    ).toBeUndefined();
    useStore.getState().undo();
    expect(
      useStore.getState().data.tasks.find((t) => t.id === original.id),
    ).toEqual(original);
    useStore.getState().redo();
    expect(
      useStore.getState().data.tasks.find((t) => t.id === original.id),
    ).toBeUndefined();
  });
  it("crea solo una siguiente ocurrencia y reinicia sus pasos", () => {
    const original = useStore.getState().data.tasks[3];
    useStore
      .getState()
      .patchTask(original.id, { recurrence: "semanal", due: "2026-10-31" });
    const before = useStore.getState().data.tasks.length;
    useStore.getState().complete(original.id);
    useStore.getState().complete(original.id);
    const data = useStore.getState().data;
    expect(data.tasks.length).toBe(before + 1);
    const next = data.tasks.find(
      (t) => t.title === original.title && t.id !== original.id,
    )!;
    expect(next.due).toBe("2026-11-07");
    expect(next.checklist.every((c) => !c.done)).toBe(true);
    expect(next.completedAt).toBeUndefined();
    expect(next.columnId).toBe(data.boards[0].columns[0].id);
  });
  it("deshace la finalización y su siguiente ocurrencia juntas", () => {
    const t = useStore.getState().data.tasks[0];
    useStore.getState().patchTask(t.id, { recurrence: "diaria" });
    const before = structuredClone(useStore.getState().data);
    useStore.getState().complete(t.id);
    useStore.getState().undo();
    expect(useStore.getState().data).toEqual(before);
  });
  it("registra racha al terminar todas las tareas de foco", () => {
    const task = useStore
      .getState()
      .data.tasks.find((t) => t.focus.includes("me"))!;
    useStore.getState().complete(task.id);
    expect(useStore.getState().data.focusDays).toContain("2026-10-31");
  });
  it("avisa cuando falla el almacenamiento y conserva el trabajo en memoria", () => {
    const save = localStorage.setItem;
    localStorage.setItem = () => {
      throw new Error("quota");
    };
    const task = useStore.getState().data.tasks[0];
    useStore.getState().patchTask(task.id, { title: "Trabajo conservado" });
    expect(useStore.getState().storageError).toBe(true);
    expect(useStore.getState().data.tasks[0].title).toBe("Trabajo conservado");
    localStorage.setItem = save;
  });
});
