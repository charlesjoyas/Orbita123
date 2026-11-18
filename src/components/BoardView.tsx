import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCorners,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MoreHorizontal, Plus, GripVertical } from "lucide-react";
import type { Board, Column, Task } from "../types";
import TaskCard from "./TaskCard";
import { Empty } from "./UI";
import QuickAdd from "./QuickAdd";
import { useStore } from "../store";
import { useIdentity } from "../auth/session";
function BoardColumn({
  column,
  tasks,
  board,
  onOpen,
  onComplete,
  onEdit,
  onAdd,
}: {
  column: Column;
  tasks: Task[];
  board: Board;
  onOpen: (id: string) => void;
  onComplete: (id: string) => void;
  onEdit: (c: Column) => void;
  onAdd: (id: string) => void;
}) {
  const role = useIdentity((s) => s.user?.role);
  const sortable = useSortable({
    id: column.id,
    data: { type: "column" },
    disabled: !!role && role !== "admin",
  });
  const { setNodeRef, isOver } = useDroppable({
    id: `drop-${column.id}`,
    data: { columnId: column.id },
  });
  const count = useStore(
    (s) => s.data.tasks.filter((t) => t.columnId === column.id).length,
  );
  const finished = column.id === board.columns.at(-1)?.id;
  return (
    <section
      data-column-id={column.id}
      ref={sortable.setNodeRef}
      className={`board-column ${isOver ? "over" : ""}`}
      style={
        {
          transform: CSS.Transform.toString(sortable.transform),
          transition: sortable.transition,
          "--column-color": column.color,
        } as React.CSSProperties
      }
    >
      <header className="column-header">
        <span className="column-emoji">{column.emoji}</span>
        <h2
          onDoubleClick={() => {
            if (!role || role === "admin") onEdit(column);
          }}
        >
          {column.name}
        </h2>
        <span className="column-count">{count}</span>
        <button
          {...sortable.attributes}
          {...sortable.listeners}
          className="column-grip"
          aria-label={`Reordenar columna ${column.name}`}
        >
          <GripVertical size={13} />
        </button>
        <button
          className="icon-button"
          aria-label={`Editar columna ${column.name}`}
          onClick={() => onEdit(column)}
        >
          <MoreHorizontal size={18} />
        </button>
        <button
          className="icon-button"
          aria-label={`Añadir a ${column.name}`}
          onClick={() => onAdd(column.id)}
        >
          <Plus size={17} />
        </button>
      </header>
      <div className="column-indicator">
        <span
          style={{
            width: finished
              ? "100%"
              : `${Math.min(100, (count / (column.wip || 8)) * 100)}%`,
          }}
        />
      </div>
      {column.wip && count >= column.wip && (
        <span className="wip">
          {count > column.wip ? "Sobre el" : "En el"} límite de {column.wip}{" "}
          tareas · primero terminemos algo
        </span>
      )}
      <div className="column-content" ref={setNodeRef}>
        <SortableContext
          items={tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          <AnimatePresence initial={false}>
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onOpen={onOpen}
                onComplete={onComplete}
              />
            ))}
          </AnimatePresence>
        </SortableContext>
        {!tasks.length && (
          <div className="column-empty">
            {finished
              ? "Aquí van las pequeñas victorias 🌱"
              : "Un espacio para lo que viene ✨"}
          </div>
        )}
        <button className="add-card" onClick={() => onAdd(column.id)}>
          <Plus size={15} /> Añadir una tarea
        </button>
      </div>
    </section>
  );
}
export default function BoardView({
  board,
  tasks,
  onOpen,
  onComplete,
  onEditColumn,
  onAddColumn,
  onTaskCreated,
}: {
  board: Board;
  tasks: Task[];
  onOpen: (id: string) => void;
  onComplete: (id: string) => void;
  onEditColumn: (c: Column) => void;
  onAddColumn: () => void;
  onTaskCreated: (id: string) => void;
}) {
  const [drag, setDrag] = useState<Task | null>(null);
  const [quickColumn, setQuickColumn] = useState("");
  const commit = useStore((s) => s.commit);
  const moveTask = useStore((s) => s.moveTask);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 220, tolerance: 7 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  function end(e: DragEndEvent) {
    setDrag(null);
    if (!e.over || e.active.id === e.over.id) return;
    const activeType = e.active.data.current?.type;
    if (activeType === "column") {
      commit((d) => {
        const b = d.boards.find((b) => b.id === board.id)!;
        const from = b.columns.findIndex((c) => c.id === e.active.id);
        const destination =
          e.over!.data.current?.columnId ||
          e.over!.data.current?.task?.columnId ||
          String(e.over!.id).replace(/^drop-/, "");
        const to = b.columns.findIndex((c) => c.id === destination);
        if (from >= 0 && to >= 0 && from < b.columns.length - 1)
          b.columns = arrayMove(
            b.columns,
            from,
            Math.min(to, b.columns.length - 2),
          );
      }, "Columnas reordenadas");
      return;
    }
    const target = e.over.data.current;
    const targetTask = tasks.find((t) => t.id === e.over!.id);
    const columnId =
      target?.columnId ||
      targetTask?.columnId ||
      (board.columns.some((c) => c.id === e.over!.id) ? e.over.id : undefined);
    if (!columnId) return;
    const moving = tasks.find((t) => t.id === e.active.id);
    if (!moving) return;
    const finish = columnId === board.columns.at(-1)?.id && !moving.completedAt;
    moveTask(moving.id, String(columnId), targetTask?.id);
    if (finish) onComplete(moving.id);
  }
  if (!board.columns.length)
    return (
      <Empty
        action={
          <button className="primary" onClick={onAddColumn}>
            Crear columna
          </button>
        }
      />
    );
  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={(e: DragStartEvent) =>
          setDrag(tasks.find((t) => t.id === e.active.id) || null)
        }
        onDragCancel={() => setDrag(null)}
        onDragEnd={end}
        accessibility={{
          screenReaderInstructions: {
            draggable:
              "Pulsa espacio para tomar una tarjeta. Usa las flechas para moverla y espacio para soltarla. Escape para cancelar.",
          },
        }}
      >
        <div className="kanban">
          {" "}
          <SortableContext
            items={board.columns.map((c) => c.id)}
            strategy={horizontalListSortingStrategy}
          >
            {board.columns.map((c) => (
              <BoardColumn
                key={c.id}
                column={c}
                board={board}
                tasks={tasks.filter((t) => t.columnId === c.id)}
                onOpen={onOpen}
                onComplete={onComplete}
                onEdit={onEditColumn}
                onAdd={setQuickColumn}
              />
            ))}
          </SortableContext>
          <button
            className="add-column"
            onClick={onAddColumn}
            aria-label="Crear columna"
          >
            <Plus size={18} />
          </button>
        </div>
        <DragOverlay>
          {drag && (
            <TaskCard
              task={drag}
              onOpen={() => {}}
              onComplete={() => {}}
              overlay
            />
          )}
        </DragOverlay>
      </DndContext>
      {quickColumn && (
        <div className="inline-composer">
          <span>
            {board.columns.find((c) => c.id === quickColumn)?.emoji}{" "}
            {board.columns.find((c) => c.id === quickColumn)?.name}
          </span>
          <QuickAdd
            boardId={board.id}
            columnId={quickColumn}
            focusKey={1}
            onCreated={onTaskCreated}
            compact
          />
          <button className="text-button" onClick={() => setQuickColumn("")}>
            Cerrar
          </button>
        </div>
      )}
    </>
  );
}
