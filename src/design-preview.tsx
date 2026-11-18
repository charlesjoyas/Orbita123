import { createRoot } from "react-dom/client";
import { configureRepository } from "./data/repository";
import { makeTask, seedData } from "./data/seed";
import { localDate, today } from "./lib/utils";
import type { Task } from "./types";
import "./styles.css";
import "./auth/auth.css";
import "./design.css";

const options = new URLSearchParams(location.search);
const dark = options.get("tema") === "oscuro";
document.documentElement.dataset.theme = dark ? "dark" : "light";
const data = seedData();
const [board] = data.boards;
board.name = "Lanzamiento de Estudio Nébula";
board.emoji = "🪐";
const date = (offset: number) => {
  const day = new Date();
  day.setDate(day.getDate() + offset);
  return localDate(day);
};
function sample(column: number, name: string, person: string, patch: Partial<Task> = {}) {
  return { ...makeTask(board.id, board.columns[column].id, name, person), ...patch };
}
const planned = sample(0, "Confirmar las fotos del catálogo", "vale", { tags: ["Diseño"], due: date(1) });
const minimal = sample(0, "Ajustar nombres del catálogo", "me");
const checklist = sample(1, "Preparar la página de lanzamiento", "me", {
  priority: "alta", tags: ["Producto"], due: today(),
  checklist: [
    { id: "wireframes", text: "Cerrar wireframes", done: true },
    { id: "hero", text: "Ajustar la portada", done: true },
    { id: "mobile", text: "Revisar la versión móvil", done: false },
  ],
  comments: [{ id: "feedback", author: "vale", text: "Revisé la portada desde el móvil.", at: new Date().toISOString(), reactions: {} }],
  attachments: [{ id: "guide", name: "Guía editorial", url: "https://example.com" }],
});
const late = sample(1, "Entregar el guion del anuncio", "vale", { priority: "urgente", due: date(-1), tags: ["Contenido"] });
const review = sample(2, "Validar el correo de bienvenida", "vale", {
  tags: ["Equipo"], due: date(2), comments: [{ id: "tone", author: "me", text: "Listo para una última lectura.", at: new Date().toISOString(), reactions: {} }],
});
const legal = sample(2, "Revisar condiciones de preventa", "me", { tags: ["Producto"], blocked: "Falta aprobación de precios." });
const done = sample(3, "Definir la identidad de Nébula", "vale", { tags: ["Diseño"], completedAt: new Date().toISOString() });
const done2 = sample(3, "Aprobar el calendario editorial", "me", { tags: ["Contenido"], completedAt: new Date().toISOString() });
data.tasks = [planned, minimal, checklist, late, review, legal, done, done2];
data.activities = [{ id: "demo-note", actor: "vale", taskId: checklist.id, text: "comentó en la página de lanzamiento", at: new Date().toISOString(), unread: true }];
data.focusDays = [date(-1), date(-2), date(-3)];
data.onboarded = true;
configureRepository({ load: () => data, save() {}, subscribe: () => () => {} });

async function render() {
  const [{ default: App }, { default: TaskCard }, { Avatar, AvatarStack }] = await Promise.all([
    import("./App"), import("./components/TaskCard"), import("./components/UI"),
  ]);
  const mode = dark ? "&tema=oscuro" : "";
  const noop = () => {};
  createRoot(document.getElementById("root")!).render(
    <>
      <nav className="design-nav" aria-label="Demostraciones de Órbita">
        <a href="/design.html">Claro</a><a href="/design.html?tema=oscuro">Oscuro</a>
        <a href={`/design.html?arrastre=1${mode}`}>Arrastre</a>
        <a href={`/design.html?componentes=1${mode}`}>Componentes</a>
      </nav>
      {options.has("componentes") ? (
        <main className="design-gallery">
          <h1>Componentes de Órbita</h1>
          <section><h2>Controles y personas</h2><div className="design-controls">
            <button className="primary">Primario</button>
            <button className="secondary">Secundario</button>
            <button className="text-button">Fantasma</button>
            <span className="tag purple">Diseño</span><span className="nav-count" title="3 sin leer">3</span>
            <Avatar member={data.members[0]} /><AvatarStack people={data.members} />
          </div></section>
          <section><h2>Tarjetas y estados</h2><div className="design-samples">
            <section><h3>Mínima</h3><TaskCard task={minimal} variant="minimal" onOpen={noop} onComplete={noop} /></section>
            <section><h3>Estándar · seleccionada</h3><TaskCard task={planned} selected onOpen={noop} onComplete={noop} /></section>
            <section><h3>Completa</h3><TaskCard task={checklist} onOpen={noop} onComplete={noop} /></section>
            <section><h3>Vencida</h3><TaskCard task={late} onOpen={noop} onComplete={noop} /></section>
            <section><h3>Completada</h3><TaskCard task={done} onOpen={noop} onComplete={noop} /></section>
            <section><h3>En arrastre</h3><TaskCard task={planned} overlay onOpen={noop} onComplete={noop} /></section>
          </div></section>
          <section><h2>Estado vacío y guardado</h2><div className="design-controls">
            <div className="column-empty">Arrastra una tarea aquí</div>
            <span className="save-chip">Guardando…</span><span className="save-chip">✓ Guardado</span>
            <span className="save-chip warning">Sin guardar <button>Reintentar</button></span>
          </div></section>
        </main>
      ) : <App demo initialDark={dark} demoDrag={options.has("arrastre")} />}
    </>,
  );
}
void render();
