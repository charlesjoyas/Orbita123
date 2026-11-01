import { useRef, useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, Plus, Sparkles } from "lucide-react";
import { useStore } from "../store";
import { parseQuick, dueLabel } from "../lib/utils";
export default function QuickAdd({
  boardId,
  columnId,
  compact = false,
  focusKey = 0,
  onCreated,
  onRequestCreate,
}: {
  boardId: string;
  columnId: string;
  compact?: boolean;
  focusKey?: number;
  onCreated?: (id: string) => void;
  onRequestCreate?: () => void;
}) {
  const [value, setValue] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const data = useStore((s) => s.data);
  const add = useStore((s) => s.addTask);
  const parsed = parseQuick(value, data.members, data.currentUser);
  useEffect(() => {
    if (focusKey) input.current?.focus();
  }, [focusKey]);
  return (
    <form
      className={`quick-add ${compact ? "compact" : ""}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (!parsed.title) return;
        const id = add(boardId, columnId, parsed.title, parsed);
        if (!id) return;
        setValue("");
        onCreated?.(id);
        input.current?.focus();
      }}
    >
      <div className="quick-input">
        <button
          className="quick-plus"
          type="button"
          aria-label="Escribir una nueva tarea"
          onClick={() =>
            onRequestCreate ? onRequestCreate() : input.current?.focus()
          }
        >
          <Plus size={20} />
        </button>
        <input
          ref={input}
          aria-label="Crear tarea rápidamente"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={
            compact
              ? "¿Qué sigue? Escribe y pulsa Enter…"
              : "Una idea, una tarea… ¿qué hacemos hoy?"
          }
          maxLength={240}
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.nativeEvent.isComposing)
              e.preventDefault();
          }}
        />
        {!compact && (
          <span className="quick-hint">
            @persona <i>·</i> mañana <i>·</i> #etiqueta
          </span>
        )}
        <button
          className="quick-submit"
          type="submit"
          aria-label="Crear tarea"
          disabled={!parsed.title}
        >
          <span className="quick-submit-label">Añadir</span>
          <ArrowUp size={17} />
        </button>
      </div>
      <AnimatePresence>
        {value && !compact && (
          <motion.div
            className="quick-chips"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
          >
            <Sparkles size={13} />
            <span>
              {data.members.find((m) => m.id === parsed.assignee)?.name}
            </span>
            {parsed.due && (
              <span>
                {dueLabel(parsed.due)} {parsed.due.slice(11)}
              </span>
            )}
            {parsed.priority !== "media" && <span>{parsed.priority}</span>}
            {parsed.tags.map((t) => (
              <span key={t}>#{t}</span>
            ))}
            <small>Enter para crear</small>
          </motion.div>
        )}
      </AnimatePresence>
    </form>
  );
}
