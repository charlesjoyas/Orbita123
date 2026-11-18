import { useRef, useState, useEffect } from "react";
import { ArrowUp, CalendarDays, ChevronDown, Plus, Sparkles, Tag, UserRound } from "lucide-react";
import { useStore } from "../store";
import { parseQuick, localDate, today } from "../lib/utils";
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
  const [smart, setSmart] = useState(true);
  const [assignee, setAssignee] = useState("");
  const [date, setDate] = useState<string>();
  const [tags, setTags] = useState<string>();
  const input = useRef<HTMLInputElement>(null);
  const tagsMenu = useRef<HTMLDetailsElement>(null);
  const data = useStore((s) => s.data);
  const add = useStore((s) => s.addTask);
  const parsed = parseQuick(smart ? value : "", data.members, data.currentUser);
  const title = smart ? parsed.title : value.trim();
  const people = data.members.filter((person) => person.active !== false);
  const person = assignee || parsed.assignee;
  const due = date ?? parsed.due;
  const baseDay = today();
  const nextDay = new Date();
  nextDay.setDate(nextDay.getDate() + 1);
  const tomorrow = localDate(nextDay);
  const finalTags = tags === undefined ? parsed.tags : [...new Set(tags.split(",").map((tag) => tag.trim().replace(/^#/, "")).filter(Boolean))];
  const suggestedTags = [...new Set(data.tasks.flatMap((task) => task.tags))].slice(0, 6);
  useEffect(() => {
    if (focusKey) input.current?.focus();
  }, [focusKey]);
  return (
    <form
      className={`quick-add ${compact ? "compact" : ""}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (!title) return;
        const id = add(boardId, columnId, title, { assignee: person, due, tags: finalTags, priority: parsed.priority });
        if (!id) return;
        setValue("");
        setAssignee("");
        setDate(undefined);
        setTags(undefined);
        tagsMenu.current?.removeAttribute("open");
        onCreated?.(id);
        input.current?.focus();
      }}
    >
      <div className="quick-input">
        <button
          className="quick-plus"
          type="button"
          aria-label="Escribir una nueva tarea"
          title="Escribir una nueva tarea"
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
              : "¿Qué hay por hacer?"
          }
          maxLength={240}
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.nativeEvent.isComposing)
              e.preventDefault();
          }}
        />
        {!compact && <kbd className="capture-shortcut" title="Pulsa N para enfocar la captura rápida">N</kbd>}
        <button
          className="quick-submit"
          type="submit"
          aria-label="Crear tarea"
          disabled={!title}
          title="Añadir tarea"
        >
          <span className="quick-submit-label">Añadir</span>
          <ArrowUp size={17} />
        </button>
      </div>
      {!compact && (
        <div className="capture-controls">
          <div className="capture-picker">
            <UserRound size={14} /><select aria-label="Asignar a" value={person} onChange={(event) => setAssignee(event.target.value)}>
              {people.map((member) => <option key={member.id} value={member.id}>{member.id === data.currentUser ? "Para mí" : member.name}</option>)}
            </select><ChevronDown size={12} aria-hidden />
          </div>
          <div className="capture-picker">
            <CalendarDays size={14} /><select aria-label="Fecha rápida" value={due} onChange={(event) => setDate(event.target.value)}>
              <option value="">Sin fecha</option><option value={baseDay}>Hoy</option><option value={tomorrow}>Mañana</option>
              {due && due !== baseDay && due !== tomorrow && <option value={due}>{due.replace("T", " · ")}</option>}
            </select><ChevronDown size={12} aria-hidden />
          </div>
          <details ref={tagsMenu} className="capture-tags">
            <summary><Tag size={14} /> {finalTags.length ? `${finalTags.length} ${finalTags.length === 1 ? "etiqueta" : "etiquetas"}` : "Etiquetas"} <ChevronDown size={12} /></summary>
            <div className="capture-popover">
              <label>Etiquetas separadas por comas<input value={tags ?? parsed.tags.join(", ")} onChange={(event) => setTags(event.target.value)} /></label>
              {suggestedTags.length > 0 && <div>{suggestedTags.map((tag) => (
                <button key={tag} type="button" className="tag purple" aria-pressed={finalTags.includes(tag)}
                  onClick={() => setTags((finalTags.includes(tag) ? finalTags.filter((item) => item !== tag) : [...finalTags, tag]).join(", "))}>{tag}</button>
              ))}</div>}
            </div>
          </details>
          <button className="capture-smart" type="button" aria-pressed={smart} aria-label="Interpretar menciones, fechas y etiquetas" title="Interpreta @persona, mañana y #etiquetas al escribir" onClick={() => setSmart(!smart)}>
            <Sparkles size={14} /><span>Captura inteligente</span>{smart && <span aria-hidden="true">✓</span>}
          </button>
          {parsed.priority !== "media" && <span className="capture-priority" title="Prioridad detectada">{parsed.priority}</span>}
        </div>
      )}
    </form>
  );
}
