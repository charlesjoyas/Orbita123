import type { Board, Data, Task } from "../types";
import { localDate, today, uid } from "../lib/utils.ts";
export function columns(): Board["columns"] {
  return [
    { id: uid(), name: "Por hacer", emoji: "💡", color: "#ad91d9" },
    { id: uid(), name: "En marcha", emoji: "⚡", color: "#e6b25d", wip: 4 },
    { id: uid(), name: "En revisión", emoji: "👀", color: "#80b4c3" },
    { id: uid(), name: "Hecho", emoji: "🌱", color: "#8cba9e" },
  ];
}
export function makeTask(
  boardId: string,
  columnId: string,
  title: string,
  assignee: string,
): Task {
  const at = new Date().toISOString();
  return {
    id: uid(),
    boardId,
    columnId,
    title,
    description: "",
    creator: assignee,
    assignee,
    priority: "media",
    due: "",
    tags: [],
    checklist: [],
    effort: 1,
    blocked: "",
    recurrence: "ninguna",
    attachments: [],
    comments: [],
    reactions: {},
    createdAt: at,
    movedAt: at,
    focus: [],
  };
}
export function seedData(): Data {
  const cols = columns();
  const board: Board = {
    id: "creative",
    name: "Nuestro próximo gran paso",
    emoji: "🚀",
    background: "lavender",
    members: ["me", "vale"],
    columns: cols,
  };
  const entries: [string, number, string, string[], string?][] = [
    [
      "Una identidad que se sienta muy nuestra",
      0,
      "vale",
      ["Diseño"],
      "violet",
    ],
    ["Ideas para el primer lanzamiento", 0, "me", ["Ideas"]],
    ["Encontrar nuestra voz en redes", 0, "vale", ["Contenido"]],
    ["Diseñar la página de inicio", 1, "me", ["Diseño"], "peach"],
    ["Preparar la propuesta para el cliente", 1, "vale", ["Trabajo"]],
    ["Darle vida al prototipo", 1, "me", ["Producto"]],
    ["Revisar los últimos detalles del logo", 2, "vale", ["Diseño"], "mint"],
    ["Compartir el moodboard", 2, "me", ["Inspiración"]],
    ["Nuestro primer café de ideas", 3, "me", ["Equipo"]],
    ["Definir el rumbo del proyecto", 3, "vale", ["Estrategia"]],
  ];
  const tasks = entries.map(([title, col, person, tags, cover], i) => {
    const task = makeTask(board.id, cols[col].id, title, person);
    task.tags = tags;
    task.cover = cover as Task["cover"];
    task.description = [
      "Pequeños detalles, grandes ideas. Busquemos una dirección visual cálida, cercana y con personalidad.",
      "Juntemos esas ideas que no nos dejan dormir. Todas son bienvenidas ✨",
    ][i % 2];
    if (i === 0 || i === 3 || i === 4) task.due = today();
    if (i === 4) task.priority = "urgente";
    if (i === 3) {
      task.priority = "alta";
      task.focus = ["me"];
      task.checklist = [
        { id: uid(), text: "Explorar referencias", done: true },
        { id: uid(), text: "Diseñar la primera versión", done: true },
        { id: uid(), text: "Revisar juntos", done: false },
      ];
    }
    if (i === 5) {
      task.due = localDate(new Date(Date.now() + 86400000));
      task.checklist = [
        { id: uid(), text: "Componentes base", done: true },
        { id: uid(), text: "Microinteracciones", done: false },
      ];
    }
    if (i === 6) {
      task.comments = [
        {
          id: uid(),
          author: "vale",
          text: "¡Ya casi! ¿Qué te parece esta dirección?",
          at: new Date().toISOString(),
          reactions: {},
        },
      ];
    }
    if (col === 3) task.completedAt = new Date().toISOString();
    return task;
  });
  return {
    version: 1,
    members: [
      {
        id: "me",
        name: "Alex",
        emoji: "👨🏻‍🚀",
        color: "#8c77cb",
        status: "disponible",
      },
      {
        id: "vale",
        name: "Vale",
        emoji: "👩🏽‍🎨",
        color: "#db9c7f",
        status: "en foco",
      },
    ],
    boards: [board],
    tasks,
    activities: [
      {
        id: uid(),
        actor: "vale",
        taskId: tasks[6].id,
        text: "dejó un comentario en «Revisar los últimos detalles del logo»",
        at: new Date().toISOString(),
        unread: true,
      },
    ],
    currentUser: "me",
    onboarded: false,
    focusDays: [],
  };
}
