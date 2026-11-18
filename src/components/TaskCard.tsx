import { memo, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  CalendarDays,
  Check,
  CheckCheck,
  MessageCircle,
  ArrowUpRight,
  GripVertical,
  Flag,
  LockKeyhole,
  Repeat2,
  Star,
  Paperclip,
} from "lucide-react";
import type { Task } from "../types";
import { useStore } from "../store";
import { dueLabel, isLate, today } from "../lib/utils";
import { AvatarStack } from "./UI";
import { useIdentity } from "../auth/session";
export const tagColor = (tag: string) =>
  ["Diseño", "Producto"].includes(tag)
    ? "purple"
    : ["Trabajo", "Contenido"].includes(tag)
      ? "peach"
      : ["Equipo", "Estrategia"].includes(tag)
        ? "green"
        : "blue";
export default memo(function TaskCard({
  task,
  onOpen,
  onComplete,
  overlay = false,
  selected = false,
  variant,
}: {
  task: Task;
  onOpen: (id: string) => void;
  onComplete: (id: string) => void;
  overlay?: boolean;
  selected?: boolean;
  variant?: "minimal" | "standard" | "full";
}) {
  const readOnly = useIdentity((s) => s.user?.role === "viewer");
  const reducedMotion = useReducedMotion();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: { type: "task", task },
    disabled: overlay || readOnly,
  });
  const data = useStore((s) => s.data);
  const patch = useStore((s) => s.patchTask);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const [swipe, setSwipe] = useState(0);
  const suppressClick = useRef(false);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (clickTimer.current) clearTimeout(clickTimer.current);
    },
    [],
  );
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const done = task.checklist.filter((c) => c.done).length;
  const member = data.members.find((m) => m.id === task.assignee);
  const details = task.checklist.length || task.comments.length || task.attachments.length || task.cover || task.blocked;
  const layout = variant ?? (details ? "full" : task.tags.length || task.due || task.priority !== "media" ||
    task.recurrence !== "ninguna" || task.focus.length || task.assignee !== data.currentUser ? "standard" : "minimal");
  const participants = [member, ...task.comments.map((comment) => data.members.find((person) => person.id === comment.author))]
    .filter((person) => person !== undefined);
  const people = [...new Map(participants.map((person) => [person.id, person])).values()].slice(0, 2);
  const overdue = isLate(task);
  const stale =
    !task.completedAt &&
    Date.now() - new Date(task.movedAt).getTime() > 5 * 86400000;
  return (
    <div
      className="task-shell"
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.28 : 1,
      }}
    >
      <motion.article
        onTouchStart={(e) => {
          if (readOnly) return;
          if ((e.target as HTMLElement).closest("button,input")) return;
          touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }}
        onTouchMove={(e) => {
          if (!touch.current) return;
          const dx = e.touches[0].clientX - touch.current.x;
          const dy = e.touches[0].clientY - touch.current.y;
          if (Math.abs(dx) > Math.abs(dy) * 2)
            setSwipe(Math.max(-80, Math.min(80, dx)));
        }}
        onTouchEnd={(e) => {
          const point = touch.current;
          const end = e.changedTouches[0];
          if (point) {
            const dx = end.clientX - point.x;
            const dy = end.clientY - point.y;
            if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 2) {
              suppressClick.current = true;
              if (dx > 0 && !task.completedAt) onComplete(task.id);
              else if (dx < 0) {
                const other = data.members.find((m) => m.active !== false && m.id !== task.assignee);
                if (other)
                  patch(
                    task.id,
                    { assignee: other.id },
                    `pasó la pelota de «${task.title}» 🏀`,
                  );
              }
            }
          }
          touch.current = null;
          setSwipe(0);
        }}
        onTouchCancel={() => {
          touch.current = null;
          setSwipe(0);
        }}
        layout="position"
        initial={reducedMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0, x: swipe }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ duration: reducedMotion ? 0 : 0.18, ease: [0.2, 0.8, 0.2, 1] }}
        style={
          {
            "--member-color": member?.color,
          } as React.CSSProperties
        }
        className={`task-card card-${layout} ${overlay ? "dragging" : ""} ${task.completedAt ? "completed" : ""} ${selected ? "selected" : ""} ${overdue ? "overdue" : ""}`}
        onClick={(e) => {
          if (suppressClick.current) {
            suppressClick.current = false;
            return;
          }
          if ((e.target as HTMLElement).closest("h3")) {
            if (clickTimer.current) clearTimeout(clickTimer.current);
            clickTimer.current = setTimeout(() => onOpen(task.id), 230);
          } else onOpen(task.id);
        }}
        onKeyDown={(e) => {
          if (
            e.target === e.currentTarget &&
            (e.key === "Enter" || e.key === " ")
          ) {
            e.preventDefault();
            onOpen(task.id);
          }
        }}
        tabIndex={overlay ? -1 : 0}
        aria-hidden={overlay || undefined}
        id={overlay ? undefined : `task-${task.id}`}
        aria-label={`Abrir ${task.title}`}
      >
        {layout === "full" && task.cover && (
          <div className={`card-cover ${task.cover}`} aria-hidden="true">
            {task.cover === "violet" ? (
              <>
                <span className="planet" />
                <span className="orbit-ring" />
                <i>✦</i>
                <b>✧</b>
                <small>un universo de ideas</small>
              </>
            ) : task.cover === "peach" ? (
              <>
                <span className="design-window">
                  <i />
                  <b />
                  <b />
                  <b />
                </span>
                <span className="design-flower">✳</span>
                <small>hacerlo simple. hacerlo nuestro.</small>
              </>
            ) : (
              <>
                <span className="mint-orb">o.</span>
                <span className="mint-text">
                  menos ruido.
                  <br />
                  más esencia.
                </span>
                <i>✦</i>
              </>
            )}
          </div>
        )}
        <div className="card-body">
          {layout !== "minimal" && (task.tags.length > 0 || ["alta", "urgente"].includes(task.priority)) && <div className="card-tags">
            {task.tags.slice(0, 2).map((tag) => (
              <span className={`tag ${tagColor(tag)}`} key={tag}>
                {tag}
              </span>
            ))}
            {task.priority === "urgente" && (
              <span className="tag red">
                <Flag size={10} /> Urgente
              </span>
            )}
            {task.priority === "alta" && (
              <span className="tag peach"><Flag size={12} /> Alta</span>
            )}
          </div>}
          <div className="card-title-row">
            <button
              className={`complete-circle ${task.completedAt ? "checked" : ""}`}
              aria-label={
                task.completedAt ? "Completada" : `Completar ${task.title}`
              }
              disabled={!!task.completedAt}
              onClick={(e) => {
                e.stopPropagation();
                onComplete(task.id);
              }}
            >
              <span className="check-mark"><Check size={13} /></span>
            </button>
            {editing ? (
              <input
                className="inline-title"
                autoFocus
                value={title}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => {
                  if (title.trim()) patch(task.id, { title: title.trim() });
                  setEditing(false);
                }}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") e.currentTarget.blur();
                  if (e.key === "Escape") {
                    setTitle(task.title);
                    setEditing(false);
                  }
                }}
              />
            ) : (
              <h3
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  if (clickTimer.current) clearTimeout(clickTimer.current);
                  if (readOnly) {
                    onOpen(task.id);
                    return;
                  }
                  setTitle(task.title);
                  setEditing(true);
                }}
              >
                {task.title}
              </h3>
            )}
            <button
              className="drag-handle"
              title="Arrastrar tarea"
              aria-label={`Arrastrar ${task.title}`}
              onClick={(e) => e.stopPropagation()}
              {...attributes}
              {...listeners}
            ><GripVertical size={16} /></button>
          </div>
          {layout === "full" && task.blocked && (
            <p className="blocked">
              <LockKeyhole size={11} /> {task.blocked}
            </p>
          )}
          {layout === "full" && stale && <p className="stale">Lleva más de 5 días aquí 👀</p>}
          {layout === "full" && task.checklist.length > 0 && (
            <div className="card-progress">
              <div>
                <motion.i
                  animate={{
                    width: `${(done / task.checklist.length) * 100}%`,
                  }}
                />
              </div>
              <span>
                {done}/{task.checklist.length}
              </span>
            </div>
          )}
          {layout !== "minimal" && <div className="card-footer">
            <div className="card-meta">
              {task.due && (
                <span
                  className={
                    overdue
                      ? "late"
                      : task.due.slice(0, 10) === today()
                        ? "due-today"
                        : ""
                  }
                >
                  <CalendarDays size={12} />
                  {overdue ? "Vencida · " : ""}{dueLabel(task.due)}
                </span>
              )}
              {!!task.comments.length && (
                <span title={`${task.comments.length} comentarios`}>
                  <MessageCircle size={12} />
                  {task.comments.length}
                </span>
              )}
              {!!task.attachments.length && (
                <span title={`${task.attachments.length} adjuntos`}><Paperclip size={13} /> {task.attachments.length}</span>
              )}
              {task.recurrence !== "ninguna" && <Repeat2 size={12} />}{" "}
              {!!task.focus.length && (
                <Star size={12} fill="#d6b65e" color="#d6b65e" />
              )}
              {task.completedAt && <span title="Completada" className="done-meta"><CheckCheck size={14} /></span>}
            </div>
            <div className="card-people">
              <button
                className="pass-small"
                aria-label="Pasar la pelota"
                title="Pasar la pelota"
                onClick={(e) => {
                  e.stopPropagation();
                  const other = data.members.find(
                    (m) => m.active !== false && m.id !== task.assignee,
                  );
                  if (other)
                    patch(
                      task.id,
                      { assignee: other.id },
                      `pasó la pelota de «${task.title}» a ${other.name} 🏀`,
                    );
                }}
              >
                <ArrowUpRight size={13} />
              </button>
              <AvatarStack people={people} />
            </div>
          </div>}
        </div>
      </motion.article>
    </div>
  );
});
