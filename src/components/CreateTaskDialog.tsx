import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import type { Board } from "../types";
import { useStore } from "../store";
import { parseQuick } from "../lib/utils";
import { Modal } from "./UI";

export default function CreateTaskDialog({
  board,
  onClose,
  onCreated,
}: {
  board: Board;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const members = useStore((s) => s.data.members);
  const currentUser = useStore((s) => s.data.currentUser);
  const [title, setTitle] = useState("");
  const [column, setColumn] = useState(board.columns[0].id);
  const [assignee, setAssignee] = useState(currentUser);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
  }, []);
  return (
    <Modal title="Un lugar para tu próxima idea" onClose={onClose}>
      <div className="dialog-content">
        <h2>¿Qué vamos a hacer?</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const parsed = parseQuick(title, members, assignee);
            if (!parsed.title) return;
            const id = useStore
              .getState()
              .addTask(board.id, column, parsed.title, parsed);
            if (id) onCreated(id);
          }}
        >
          <label>
            Título de la nueva tarea
            <input
              ref={input}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Una idea pequeña cuenta…"
              required
              maxLength={240}
            />
          </label>
          <label>
            En manos de
            <select
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
            >
              {members.filter((m) => m.active !== false).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.emoji} {m.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Columna de destino
            <select value={column} onChange={(e) => setColumn(e.target.value)}>
              {board.columns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.emoji} {c.name}
                </option>
              ))}
            </select>
          </label>
          <p className="small-note">
            También puedes escribir @persona, mañana o #urgente en el título.
          </p>
          <button
            className="primary full"
            disabled={!parseQuick(title, members, assignee).title}
          >
            <Plus size={16} /> Añadir tarea
          </button>
        </form>
      </div>
    </Modal>
  );
}
