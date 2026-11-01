import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Star,
  Check,
  CalendarDays,
  Flame,
  ArrowUpRight,
} from "lucide-react";
import type { Board, Task, View } from "../types";
import { useStore } from "../store";
import {
  dueLabel,
  isLate,
  localDate,
  priorityRank,
  streak,
  today,
} from "../lib/utils";
import { Avatar, Empty } from "./UI";
import TaskCard, { tagColor } from "./TaskCard";
export default function Views({
  view,
  board,
  tasks,
  onOpen,
  onComplete,
}: {
  view: View;
  board: Board;
  tasks: Task[];
  onOpen: (id: string) => void;
  onComplete: (id: string) => void;
}) {
  const data = useStore((s) => s.data);
  const commit = useStore((s) => s.commit);
  const [month, setMonth] = useState(new Date());
  if (view === "day") {
    const mine = tasks.filter(
      (t) => t.assignee === data.currentUser && !t.completedAt,
    );
    const focused = mine.filter((t) => t.focus.includes(data.currentUser));
    const relevant = mine
      .filter(
        (t) =>
          t.due.slice(0, 10) === today() ||
          isLate(t) ||
          t.priority === "urgente" ||
          t.focus.includes(data.currentUser),
      )
      .sort(
        (a, b) =>
          Number(b.focus.includes(data.currentUser)) -
            Number(a.focus.includes(data.currentUser)) ||
          priorityRank[a.priority] - priorityRank[b.priority],
      );
    return (
      <div className="day-view">
        <div className="day-hero">
          <div>
            <span className="eyebrow">UN PASO A LA VEZ</span>
            <h2>Hoy, menos es más.</h2>
            <p>Elige hasta 3 tareas. El resto puede esperar un poquito.</p>
          </div>
          <div className="streak">
            <Flame size={24} />
            <strong>{streak(data.focusDays)}</strong>
            <span>días en racha</span>
          </div>
        </div>
        <div className="focus-slots">
          {[0, 1, 2].map((i) => (
            <div key={i} className={focused[i] ? "filled" : ""}>
              <Star size={17} />
              {focused[i] ? (
                <button onClick={() => onOpen(focused[i].id)}>
                  {focused[i].title}
                </button>
              ) : (
                <span>Un lugar para tu foco {i + 1}</span>
              )}
            </div>
          ))}
        </div>
        <h3 className="section-title">
          Tu siguiente pequeño gran paso <span>{relevant.length} tareas</span>
        </h3>
        <div className="cards-grid">
          {relevant.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              onOpen={onOpen}
              onComplete={onComplete}
            />
          ))}
        </div>
        {!relevant.length && (
          <Empty
            message="Tu día tiene espacio 🌤️"
            detail="Marca una tarea con la estrella para traerla a tu foco."
          />
        )}
        <h3 className="section-title">
          También está en tu órbita{" "}
          <span>{mine.filter((t) => !relevant.includes(t)).length} tareas</span>
        </h3>
        <div className="cards-grid">
          {mine
            .filter((t) => !relevant.includes(t))
            .map((t) => (
              <TaskCard
                key={t.id}
                task={t}
                onOpen={onOpen}
                onComplete={onComplete}
              />
            ))}
        </div>
      </div>
    );
  }
  if (view === "team") {
    const loads = data.members
      .filter((m) => board.members.includes(m.id))
      .map((m) => ({
        member: m,
        tasks: tasks.filter((t) => t.assignee === m.id && !t.completedAt),
      }));
    const total = loads.reduce(
      (n, l) => n + l.tasks.reduce((n, t) => n + t.effort, 0),
      0,
    );
    return (
      <>
        <div className="team-summary">
          <span>Un equipo, muchas posibilidades 🤝</span>
          <p>El trabajo se siente más ligero cuando se comparte.</p>
          <div className="load-bar">
            {loads.map((l) => (
              <span
                key={l.member.id}
                style={{
                  background: l.member.color,
                  flex: l.tasks.reduce((n, t) => n + t.effort, 0) || 0.1,
                }}
              />
            ))}
          </div>
          <small>
            {loads
              .map(
                (l) =>
                  `${l.member.name}: ${l.tasks.reduce((n, t) => n + t.effort, 0)} puntos`,
              )
              .join(" · ")}{" "}
            · {total} en total
          </small>
        </div>
        <div
          className="team-grid"
          style={{
            gridTemplateColumns: `repeat(${Math.min(loads.length, 3)},minmax(250px,1fr))`,
          }}
        >
          {loads.map(({ member, tasks }) => (
            <section key={member.id}>
              <header className="member-heading">
                <Avatar member={member} />
                <div>
                  <h3>
                    {member.name}{" "}
                    {member.id === data.currentUser && <small>(tú)</small>}
                  </h3>
                  <p>{member.status}</p>
                </div>
                <b>{tasks.length}</b>
              </header>
              {tasks.map((t) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  onOpen={onOpen}
                  onComplete={onComplete}
                />
              ))}
              {!tasks.length && (
                <Empty
                  message="Un poco de aire 🌿"
                  detail="Tiene espacio para una nueva idea."
                />
              )}
            </section>
          ))}
        </div>
      </>
    );
  }
  if (view === "activity")
    return (
      <div className="activity-view">
        <header>
          <h2>Lo que se mueve por aquí</h2>
          <button
            className="text-button"
            onClick={() =>
              commit((d) => {
                d.activities.forEach((a) => (a.unread = false));
              }, "Estás al día ✨")
            }
          >
            Marcar todo como leído
          </button>
        </header>
        {data.activities.length ? (
          data.activities.map((a) => (
            <button
              key={a.id}
              className={`activity-item ${a.unread ? "unread" : ""}`}
              onClick={() => {
                if (a.taskId && data.tasks.some((t) => t.id === a.taskId))
                  onOpen(a.taskId);
                commit((d) => {
                  const item = d.activities.find((x) => x.id === a.id);
                  if (item) item.unread = false;
                });
              }}
            >
              <Avatar member={data.members.find((m) => m.id === a.actor)} />
              <div>
                <p>
                  <strong>
                    {data.members.find((m) => m.id === a.actor)?.name}
                  </strong>{" "}
                  {a.text}
                </p>
                <time>
                  {new Date(a.at).toLocaleString("es-CO", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </div>
              {a.unread && <i />}
            </button>
          ))
        ) : (
          <Empty message="El comienzo de una buena historia" />
        )}
      </div>
    );
  if (view === "calendar") {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(first);
    start.setDate(1 - offset);
    const days = Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      return d;
    });
    return (
      <div className="calendar-view">
        <header>
          <h2>
            {month.toLocaleDateString("es-CO", {
              month: "long",
              year: "numeric",
            })}
          </h2>
          <div>
            <button
              className="icon-button"
              aria-label="Mes anterior"
              onClick={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
              }
            >
              <ChevronLeft size={18} />
            </button>
            <button
              className="text-button"
              onClick={() => setMonth(new Date())}
            >
              Hoy
            </button>
            <button
              className="icon-button"
              aria-label="Mes siguiente"
              onClick={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
              }
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </header>
        <div className="calendar-week">
          {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="calendar-grid">
          {days.map((d) => (
            <div
              className={`calendar-cell ${d.getMonth() !== month.getMonth() ? "muted" : ""}`}
              key={localDate(d)}
            >
              <span className={localDate(d) === today() ? "today" : ""}>
                {d.getDate()}
              </span>
              {tasks
                .filter((t) => t.due.slice(0, 10) === localDate(d))
                .map((t) => (
                  <button
                    key={t.id}
                    onClick={() => onOpen(t.id)}
                    className={t.completedAt ? "crossed" : ""}
                    style={{
                      borderLeftColor: data.members.find(
                        (m) => m.id === t.assignee,
                      )?.color,
                    }}
                  >
                    {t.title}
                  </button>
                ))}
            </div>
          ))}
        </div>
        <p className="view-note">
          {tasks.filter((t) => !t.due).length} tareas sin fecha · asígnales una
          fecha desde su detalle.
        </p>
      </div>
    );
  }
  if (view === "timeline") {
    const start = new Date();
    start.setDate(start.getDate() - 3);
    const days = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      return localDate(d);
    });
    return (
      <div className="timeline-scroll">
        <div className="timeline">
          <div className="timeline-row timeline-head">
            <span>Las próximas dos semanas</span>
            {days.map((d) => (
              <span className={d === today() ? "current" : ""} key={d}>
                {new Date(d + "T12:00:00").toLocaleDateString("es-CO", {
                  weekday: "short",
                  day: "numeric",
                })}
              </span>
            ))}
          </div>
          {tasks
            .filter((t) => t.due)
            .map((t) => (
              <div className="timeline-row" key={t.id}>
                <button onClick={() => onOpen(t.id)}>{t.title}</button>
                {days.map((d) => (
                  <span key={d} className={d === today() ? "current" : ""}>
                    {t.due.slice(0, 10) === d && (
                      <button
                        title={t.title}
                        className="timeline-marker"
                        style={{
                          background: data.members.find(
                            (m) => m.id === t.assignee,
                          )?.color,
                        }}
                        onClick={() => onOpen(t.id)}
                      >
                        {t.completedAt ? (
                          <Check size={15} />
                        ) : (
                          <CalendarDays size={15} />
                        )}
                      </button>
                    )}
                  </span>
                ))}
              </div>
            ))}
        </div>
        <p className="view-note">
          Solo se muestran tareas con fecha. La estimación se expresa en puntos,
          no en duración.
        </p>
      </div>
    );
  }
  return (
    <div className="list-view">
      <div className="list-head">
        <span>Tarea</span>
        <span>En manos de</span>
        <span>Columna</span>
        <span>Entrega</span>
        <span>Prioridad</span>
      </div>
      {tasks.map((t) => (
        <div className="list-row" key={t.id}>
          <button className="list-title" onClick={() => onOpen(t.id)}>
            <span className={t.completedAt ? "crossed" : ""}>
              {t.completedAt ? "✓ " : ""}
              {t.title}
            </span>
            <span className="list-tags">
              {t.tags.map((tag) => (
                <i className={`tag ${tagColor(tag)}`} key={tag}>
                  {tag}
                </i>
              ))}
            </span>
          </button>
          <span>
            <Avatar
              member={data.members.find((m) => m.id === t.assignee)}
              size="small"
            />
            {data.members.find((m) => m.id === t.assignee)?.name}
          </span>
          <span>
            {board.columns.find((c) => c.id === t.columnId)?.emoji}{" "}
            {board.columns.find((c) => c.id === t.columnId)?.name}
          </span>
          <span className={isLate(t) ? "late" : ""}>
            {dueLabel(t.due) || "Sin fecha"}
          </span>
          <button onClick={() => onOpen(t.id)}>
            <span className={`priority-text ${t.priority}`}>{t.priority}</span>
            <ArrowUpRight size={13} />
          </button>
        </div>
      ))}
      {!tasks.length && <Empty />}
    </div>
  );
}
