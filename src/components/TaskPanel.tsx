import { useEffect, useState } from "react";
import {
  CalendarDays,
  Check,
  Copy,
  Flag,
  Link2,
  ListChecks,
  MessageCircle,
  Plus,
  Send,
  Star,
  Trash2,
  ArrowUpRight,
  BellRing,
  Focus,
  Paperclip,
  Repeat2,
} from "lucide-react";
import { useStore } from "../store";
import type { Priority, Recurrence, Task } from "../types";
import { safeUrl, uid } from "../lib/utils";
import { Avatar, Modal } from "./UI";
export default function TaskPanel({
  id,
  onClose,
  onComplete,
  onFocus,
}: {
  id: string;
  onClose: () => void;
  onComplete: (id: string) => void;
  onFocus: (id: string) => void;
}) {
  const data = useStore((s) => s.data);
  const task = data.tasks.find((t) => t.id === id);
  const patch = useStore((s) => s.patchTask);
  const commit = useStore((s) => s.commit);
  const notify = useStore((s) => s.notify);
  const [titleDraft, setTitleDraft] = useState(task?.title || "");
  const [tagsDraft, setTagsDraft] = useState(task?.tags.join(", ") || "");
  const tagText = task?.tags.join(", ") || "";
  useEffect(() => setTitleDraft(task?.title || ""), [task?.title]);
  useEffect(() => setTagsDraft(tagText), [tagText]);
  const [item, setItem] = useState("");
  const [comment, setComment] = useState("");
  const [note, setNote] = useState("");
  const [passing, setPassing] = useState(false);
  const [recipient, setRecipient] = useState(
    data.members.find((m) => m.id !== task?.assignee)?.id || data.currentUser,
  );
  const [link, setLink] = useState("");
  const [tab, setTab] = useState<"comments" | "history">("comments");
  if (!task) return null;
  const board = data.boards.find((b) => b.id === task.boardId)!;
  function update(p: Partial<Task>, message?: string) {
    patch(id, p, message);
  }
  function reaction(emoji: string, commentId?: string) {
    commit((d) => {
      const t = d.tasks.find((t) => t.id === id)!;
      const object = commentId
        ? t.comments.find((c) => c.id === commentId)!
        : t;
      const arr = object.reactions[emoji] || [];
      object.reactions[emoji] = arr.includes(d.currentUser)
        ? arr.filter((x) => x !== d.currentUser)
        : [...arr, d.currentUser];
    });
  }
  function addLink() {
    const url = safeUrl(link);
    if (!url) {
      notify("Añade un enlace válido con https://");
      return;
    }
    update({
      attachments: [
        ...task!.attachments,
        { id: uid(), name: new URL(url).hostname, url },
      ],
    });
    setLink("");
  }
  function upload(file: File) {
    if (file.size > 750000) {
      notify(
        "Para guardar localmente, elige un archivo de menos de 750 KB o añade un enlace.",
      );
      return;
    }
    const reader = new FileReader();
    reader.onerror = () =>
      notify("No pudimos leer ese archivo. Prueba a seleccionarlo de nuevo.");
    reader.onload = () =>
      update(
        {
          attachments: [
            ...(useStore.getState().data.tasks.find((t) => t.id === id)
              ?.attachments || []),
            { id: uid(), name: file.name, url: reader.result as string },
          ],
        },
        "Archivo adjuntado",
      );
    reader.readAsDataURL(file);
  }
  return (
    <Modal
      title={`${board.emoji} ${board.name} / ${board.columns.find((c) => c.id === task.columnId)?.name}`}
      onClose={onClose}
      wide
    >
      <div className="task-panel">
        <div className="detail-title">
          <button
            className={`complete-circle big ${task.completedAt ? "checked" : ""}`}
            disabled={!!task.completedAt}
            aria-label="Completar tarea"
            onClick={() => onComplete(id)}
          >
            {task.completedAt && <Check size={19} />}
          </button>
          <textarea
            aria-label="Título de tarea"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => {
              const clean = titleDraft.trim();
              if (clean && clean !== task.title) update({ title: clean });
              else if (!clean) setTitleDraft(task.title);
            }}
            rows={2}
          />
        </div>
        <div className="detail-actions">
          <button
            className={task.focus.includes(data.currentUser) ? "selected" : ""}
            onClick={() => {
              if(!task.focus.includes(data.currentUser)&&(task.assignee!==data.currentUser||task.completedAt)){
                notify(task.completedAt?'Esa tarea ya está lista. Elige una pendiente para tu foco 🌿':'Para traerla a tu foco, asígnatela primero.');return;
              }
              const focuses = data.tasks.filter(
                (t) => t.focus.includes(data.currentUser) && !t.completedAt,
              );
              if (
                !task.focus.includes(data.currentUser) &&
                focuses.length >= 3
              ) {
                notify(
                  "Tu foco tiene espacio para 3 cosas. Dale aire a tu día 🌿",
                );
                return;
              }
              update({
                focus: task.focus.includes(data.currentUser)
                  ? task.focus.filter((x) => x !== data.currentUser)
                  : [...task.focus, data.currentUser],
              });
            }}
          >
            <Star size={14} /> Mi foco
          </button>
          <button onClick={() => onFocus(id)}>
            <Focus size={14} /> Concentrarme
          </button>
          <button onClick={() => setPassing(!passing)}>
            <span>🏀</span> Pasar la pelota
          </button>
          <button
            onClick={() => {
              commit(
                (d) =>
                  d.activities.unshift({
                    id: uid(),
                    actor: d.currentUser,
                    taskId: id,
                    text: `dio un toque a ${d.members.find((m) => m.id === task.assignee)?.name} sobre «${task.title}» 👋`,
                    at: new Date().toISOString(),
                    unread: true,
                  }),
                "¡Toque enviado al espacio compartido! 👋",
              );
            }}
          >
            <BellRing size={14} /> Toque
          </button>
        </div>
        {passing && (
          <form
            className="pass-box"
            onSubmit={(e) => {
              e.preventDefault();
              update(
                {
                  assignee: recipient,
                  ...(note.trim()
                    ? {
                        comments: [
                          ...task.comments,
                          {
                            id: uid(),
                            author: data.currentUser,
                            text: note.trim(),
                            at: new Date().toISOString(),
                            reactions: {},
                          },
                        ],
                      }
                    : {}),
                },
                `pasó la pelota de «${task.title}» a ${data.members.find((m) => m.id === recipient)?.name} 🏀`,
              );
              setPassing(false);
              setNote("");
            }}
          >
            <label>
              ¿A quién se la pasamos?
              <select
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
              >
                {data.members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.emoji} {m.name}
                  </option>
                ))}
              </select>
            </label>
            <input
              aria-label="Nota al pasar la pelota"
              placeholder="Una nota rápida (opcional)…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <button className="primary">¡Va para ti! 🏀</button>
          </form>
        )}
        <div className="detail-grid">
          <label>
            <span>En manos de</span>
            <select
              value={task.assignee}
              onChange={(e) =>
                update({ assignee: e.target.value }, `reasignó «${task.title}»`)
              }
            >
              {data.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.emoji} {m.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>
              <Flag size={12} /> Prioridad
            </span>
            <select
              value={task.priority}
              onChange={(e) => update({ priority: e.target.value as Priority })}
            >
              {["baja", "media", "alta", "urgente"].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label>
            <span>
              <CalendarDays size={12} /> Para cuándo
            </span>
            <input
              type="datetime-local"
              value={task.due.length === 10 ? `${task.due}T12:00` : task.due}
              onChange={(e) => update({ due: e.target.value })}
            />
          </label>
          <label>
            <span>Columna</span>
            <select
              value={task.columnId}
              onChange={(e) => {
                if (e.target.value === board.columns.at(-1)?.id) onComplete(id);
                else
                  update(
                    {
                      columnId: e.target.value,
                      movedAt: new Date().toISOString(),
                      completedAt: undefined,
                    },
                    `movió «${task.title}»`,
                  );
              }}
            >
              {board.columns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.emoji} {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>
              <Repeat2 size={12} /> Repetir
            </span>
            <select
              value={task.recurrence}
              onChange={(e) =>
                update({ recurrence: e.target.value as Recurrence })
              }
            >
              {["ninguna", "diaria", "semanal", "mensual"].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Esfuerzo estimado</span>
            <select
              value={task.effort}
              onChange={(e) => update({ effort: Number(e.target.value) })}
            >
              {[1, 2, 3, 5, 8].map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? "punto" : "puntos"}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field-label">
          Etiquetas{" "}
          <input
            aria-label="Etiquetas separadas por comas"
            placeholder="Diseño, Ideas…"
            value={tagsDraft}
            onChange={(e) => setTagsDraft(e.target.value)}
            onBlur={(e) =>
              update({
                tags: e.target.value
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean),
              })
            }
          />
        </label>
        <label className="field-label">
          Descripción{" "}
          <small>Puedes usar **negrita**, *énfasis* y listas con -</small>
          <textarea
            className="description-input"
            placeholder="Dale un poco de contexto a esta idea…"
            value={task.description}
            onChange={(e) => update({ description: e.target.value })}
          />
        </label>
        <div className="description-preview">
          {task.description.split("\n").map((line, i) => (
            <p key={i}>
              {line.startsWith("- ") ? "• " : ""}
              {line
                .replace(/^- /, "")
                .split(/(\*\*[^*]+\*\*|\*[^*]+\*)/)
                .map((part, j) =>
                  part.startsWith("**") ? (
                    <strong key={j}>{part.slice(2, -2)}</strong>
                  ) : part.startsWith("*") ? (
                    <em key={j}>{part.slice(1, -1)}</em>
                  ) : (
                    part
                  ),
                )}
            </p>
          ))}
        </div>
        <label className="field-label">
          ¿Algo la bloquea?
          <input
            placeholder="Sin bloqueos, camino libre 🌿"
            value={task.blocked}
            onChange={(e) => update({ blocked: e.target.value })}
          />
        </label>
        <section className="detail-section">
          <h3>
            <ListChecks size={17} /> Paso a paso{" "}
            <span>
              {task.checklist.filter((c) => c.done).length}/
              {task.checklist.length}
            </span>
          </h3>
          <div className="wide-progress">
            <i
              style={{
                width: `${task.checklist.length ? (task.checklist.filter((c) => c.done).length / task.checklist.length) * 100 : 0}%`,
              }}
            />
          </div>
          {task.checklist.map((c) => (
            <div key={c.id} className="check-item">
              <label>
                <input
                  type="checkbox"
                  checked={c.done}
                  onChange={() =>
                    update({
                      checklist: task.checklist.map((x) =>
                        x.id === c.id ? { ...x, done: !x.done } : x,
                      ),
                    })
                  }
                />
                <span className={c.done ? "crossed" : ""}>{c.text}</span>
              </label>
              <button
                title="Convertir en tarea"
                aria-label={`Convertir ${c.text} en tarea`}
                onClick={() => {
                  useStore.getState().convertStep(id, c.id);
                }}
              >
                <ArrowUpRight size={14} />
              </button>
              <button
                aria-label={`Quitar ${c.text}`}
                onClick={() =>
                  update({
                    checklist: task.checklist.filter((x) => x.id !== c.id),
                  })
                }
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          <form
            className="line-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (item.trim()) {
                update({
                  checklist: [
                    ...task.checklist,
                    { id: uid(), text: item.trim(), done: false },
                  ],
                });
                setItem("");
              }
            }}
          >
            <Plus size={15} />
            <input
              placeholder="Añadir un pequeño paso…"
              aria-label="Nuevo paso"
              value={item}
              onChange={(e) => setItem(e.target.value)}
            />
            <button>Añadir</button>
          </form>
        </section>
        <section className="detail-section">
          <h3>
            <Paperclip size={16} /> Archivos y enlaces
          </h3>
          {task.attachments.map((a) => (
            <div className="attachment" key={a.id}>
              <a
                href={a.url.startsWith("data:") ? a.url : safeUrl(a.url) || "#"}
                target="_blank"
                rel="noreferrer"
                download={a.url.startsWith("data:") ? a.name : undefined}
              >
                <Link2 size={14} />
                {a.name}
              </a>
              <button
                aria-label={`Quitar ${a.name}`}
                onClick={() =>
                  update({
                    attachments: task.attachments.filter((x) => x.id !== a.id),
                  })
                }
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          <form
            className="line-form"
            onSubmit={(e) => {
              e.preventDefault();
              addLink();
            }}
          >
            <Link2 size={15} />
            <input
              aria-label="Enlace adjunto"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://…"
            />
            <button>Añadir</button>
          </form>
          <label className="file-button">
            Adjuntar archivo · hasta 750 KB
            <input
              type="file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) upload(file);
                e.target.value = "";
              }}
            />
          </label>
        </section>
        <div className="reaction-row">
          {["👍", "🔥", "🎉", "💪"].map((emoji) => (
            <button
              key={emoji}
              className={
                task.reactions[emoji]?.includes(data.currentUser)
                  ? "active"
                  : ""
              }
              onClick={() => reaction(emoji)}
            >
              {emoji} <span>{task.reactions[emoji]?.length || ""}</span>
            </button>
          ))}
        </div>
        <section className="detail-section">
          <div className="detail-tabs">
            <button
              className={tab === "comments" ? "active" : ""}
              onClick={() => setTab("comments")}
            >
              <MessageCircle size={15} /> Conversación ({task.comments.length})
            </button>
            <button
              className={tab === "history" ? "active" : ""}
              onClick={() => setTab("history")}
            >
              Historia de esta idea
            </button>
          </div>
          {tab === "comments" ? (
            <>
              <div className="comments">
                {task.comments.map((c) => (
                  <div className="comment" key={c.id}>
                    <Avatar
                      member={data.members.find((m) => m.id === c.author)}
                      size="small"
                    />
                    <div>
                      <strong>
                        {data.members.find((m) => m.id === c.author)?.name}
                      </strong>
                      <time>
                        {new Date(c.at).toLocaleString("es-CO", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                      <p>{c.text}</p>
                      <div className="comment-reactions">
                        {["👍", "🔥", "🎉", "💪"].map((e) => (
                          <button
                            key={e}
                            className={
                              c.reactions[e]?.includes(data.currentUser)
                                ? "active"
                                : ""
                            }
                            onClick={() => reaction(e, c.id)}
                          >
                            {e}
                            {c.reactions[e]?.length || ""}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <form
                className="line-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!comment.trim()) return;
                  update(
                    {
                      comments: [
                        ...task.comments,
                        {
                          id: uid(),
                          author: data.currentUser,
                          text: comment.trim(),
                          at: new Date().toISOString(),
                          reactions: {},
                        },
                      ],
                    },
                    `comentó en «${task.title}»`,
                  );
                  setComment("");
                }}
              >
                <input
                  placeholder="Una idea, un gracias, un ¿cómo vamos?…"
                  aria-label="Escribir comentario"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
                <button aria-label="Enviar comentario">
                  <Send size={16} />
                </button>
              </form>
            </>
          ) : (
            <div className="task-history">
              <p>
                🌱 Creada el{" "}
                {new Date(task.createdAt).toLocaleDateString("es-CO")}
              </p>
              {data.activities
                .filter((a) => a.taskId === id)
                .map((a) => (
                  <p key={a.id}>
                    {data.members.find((m) => m.id === a.actor)?.name} {a.text}{" "}
                    <small>
                      {new Date(a.at).toLocaleTimeString("es-CO", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </small>
                  </p>
                ))}
            </div>
          )}
        </section>
        <footer className="detail-footer">
          <button
            onClick={() => {
              const copy = structuredClone(task);
              useStore
                .getState()
                .addTask(board.id, task.columnId, `${task.title} (copia)`, {
                  ...copy,
                  id: uid(),
                  title: `${task.title} (copia)`,
                  completedAt: undefined,
                  focus: [],
                  comments: [],
                  reactions: {},
                  createdAt: new Date().toISOString(),
                });
            }}
          >
            <Copy size={14} /> Duplicar
          </button>
          <button
            className="danger"
            onClick={() => {
              useStore.getState().removeTask(id);
              onClose();
            }}
          >
            <Trash2 size={14} /> Eliminar tarea
          </button>
        </footer>
      </div>
    </Modal>
  );
}
