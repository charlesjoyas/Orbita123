import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "framer-motion";
import confetti from "canvas-confetti";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  CloudOff,
  CloudUpload,
  Command,
  Flame,
  HelpCircle,
  LayoutGrid,
  List,
  Moon,
  MoreHorizontal,
  Orbit,
  Plus,
  Search,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Users,
  X,
  Rows3,
  Undo2,
  Redo2,
  Play,
  Pause,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCcw,
} from "lucide-react";
import type { Board, Column, Member, View } from "./types";
import { useStore } from "./store";
import { columns } from "./data/seed";
import {
  dueLabel,
  isLate,
  parseQuick,
  priorityRank,
  streak,
  today,
  uid,
} from "./lib/utils";
import { Avatar, Modal, Toast } from "./components/UI";
import BoardView from "./components/BoardView";
import QuickAdd from "./components/QuickAdd";
import TaskPanel from "./components/TaskPanel";
import Views from "./components/Views";
import TeamAccounts from "./auth/TeamAccounts";
import AccountSettings from "./auth/AccountSettings";
import PushSettings from "./components/PushSettings";
import { roleLabel, useIdentity } from "./auth/session";
import { retrySave, useSaveStatus } from "./auth/remote";
import { readPreference, writePreference } from "./lib/preferences";
import CreateTaskDialog from "./components/CreateTaskDialog";
import { isData } from "./data/validation";
import { getRecoveryData, repositoryWarning } from "./data/repository";
type Dialog =
  | "board"
  | "column"
  | "team"
  | "settings"
  | "help"
  | "command"
  | "onboarding"
  | "create"
  | "templates"
  | null;
const backgrounds = [
  { id: "lavender", name: "Lavanda", color: "#e6def7" },
  { id: "sand", name: "Arena", color: "#eedecb" },
  { id: "mint", name: "Jardín", color: "#d9e8de" },
  { id: "dots", name: "Papel", color: "#e5e5ed" },
];
const boardViews = [
  { id: "board", label: "Tablero", icon: LayoutGrid },
  { id: "list", label: "Lista", icon: List },
  { id: "calendar", label: "Calendario", icon: CalendarDays },
  { id: "timeline", label: "Línea de tiempo", icon: Rows3 },
] as const;
function App({ demo = false, initialDark, demoDrag = false }: {
  demo?: boolean; initialDark?: boolean; demoDrag?: boolean;
} = {}) {
  const account = useIdentity((s) => s.user);
  const data = useStore((s) => s.data);
  const notify = useStore((s) => s.notify);
  const storageError = useStore((s) => s.storageError);
  const saving = useSaveStatus((s) => s.saving);
  const reducedMotion = useReducedMotion();
  const [rail, setRail] = useState(() => !demo && readPreference("orbita:sidebar") === "compact");
  const [boardId, setBoardId] = useState(
    () => readPreference("orbita:board") || data.boards[0].id,
  );
  const board = data.boards.find((b) => b.id === boardId) || data.boards[0];
  const user = data.members.find((m) => m.id === data.currentUser)!;
  const [view, setView] = useState<View>("board");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(() =>
    data.onboarded ? null : "onboarding",
  );
  const [editingColumn, setEditingColumn] = useState<Column | null>(null);
  const [dark, setDark] = useState(
    () => initialDark ?? readPreference("orbita:dark") === "true",
  );
  const [search, setSearch] = useState("");
  const [person, setPerson] = useState("all");
  const [priority, setPriority] = useState("all");
  const [tag, setTag] = useState("all");
  const [due, setDue] = useState("all");
  const [status, setStatus] = useState("all");
  const [filters, setFilters] = useState(false);
  const [quickFocus, setQuickFocus] = useState(0);
  const [menu, setMenu] = useState(false);
  const [concentrating, setConcentrating] = useState<string | null>(null);
  const [timer, setTimer] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [flying, setFlying] = useState(false);
  useEffect(() => {
    if (repositoryWarning) notify(repositoryWarning);
  }, [notify]);
  useEffect(() => {
    const url = new URL(location.href);
    const linkedId = url.searchParams.get("task");
    if (!linkedId) return;
    const task = data.tasks.find((item) => item.id === linkedId);
    if (task) {
      setBoardId(task.boardId);
      setTaskId(task.id);
    } else {
      notify("Esta tarea ya no está disponible.");
    }
    url.searchParams.delete("task");
    history.replaceState(null, "", url);
  }, [data.tasks, notify]);
  const lastActivity = useRef(data.activities[0]?.id);
  const pull = useRef(0);
  useEffect(() => {
    const newest = data.activities[0];
    if (!newest || lastActivity.current === newest.id) return;
    lastActivity.current = newest.id;
    if (newest.text.includes("pasó la pelota")) {
      setFlying(true);
      const timeout = setTimeout(() => setFlying(false), 700);
      return () => clearTimeout(timeout);
    }
  }, [data.activities]);
  useEffect(() => {
    const id = setInterval(() => {
      const store = useStore.getState();
      if (store.data.focusDate && store.data.focusDate !== today())
        store.commit(() => {}, "Un nuevo día, un nuevo foco ☀️");
    }, 60000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    if (!demo) writePreference("orbita:dark", String(dark));
  }, [dark, demo]);
  useEffect(() => {
    if (!demo) writePreference("orbita:board", board.id);
  }, [board.id, demo]);
  useEffect(() => {
    const on = () => setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
    };
  }, []);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(
      () =>
        setTimer((t) => {
          if (t <= 1) {
            setRunning(false);
            notify("Tu pausa se la ha ganado 🌿");
            return 0;
          }
          return t - 1;
        }),
      1000,
    );
    return () => clearInterval(id);
  }, [running, notify]);
  const finish = useCallback((id: string) => {
    useStore.getState().complete(id);
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      confetti({
        particleCount: 18,
        spread: 52,
        ticks: 48,
        origin: { y: 0.75 },
        colors: ["#9d8bcf", "#f2bd9c", "#a4c7af", "#ead18f"],
        disableForReducedMotion: true,
      });
    if (readPreference("orbita:sound") === "true") {
      try {
        const audio = new AudioContext();
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        oscillator.connect(gain);
        gain.connect(audio.destination);
        oscillator.frequency.value = 660;
        gain.gain.setValueAtTime(0.05, audio.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.25);
        oscillator.start();
        oscillator.stop(audio.currentTime + 0.25);
        oscillator.onended = () => void audio.close();
      } catch {
        /* El sonido es opcional. */
      }
    }
  }, []);
  const changeBoard = (id: string) => {
    setBoardId(id);
    setView("board");
    setPerson("all");
    setSearch("");
    setTag("all");
    setPriority("all");
    setDue("all");
    setStatus("all");
    setMenu(false);
  };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const input = (e.target as HTMLElement).closest(
        "input,textarea,select,[contenteditable=true]",
      );
      if ((dialog && dialog !== "command") || taskId || concentrating) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setDialog((d) => (d === "command" ? null : "command"));
        return;
      }
      if (dialog || taskId || concentrating) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !input) {
        e.preventDefault();
        e.shiftKey ? useStore.getState().redo() : useStore.getState().undo();
        return;
      }
      if (input) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "?") setDialog("help");
      if (e.key === "n") {
        if (account?.role === "viewer") return;
        e.preventDefault();
        setQuickFocus((x) => x + 1);
      }
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "1") setView("day");
      if (e.key === "2") setView("board");
      if (e.key === "3") setView("team");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [dialog, taskId, concentrating, account?.role]);
  const taskCreated = (id: string) => {
    const task = useStore.getState().data.tasks.find((t) => t.id === id);
    if (!task) return;
    changeBoard(task.boardId);
    const kanban = document.querySelector<HTMLElement>(".kanban");
    const column = kanban?.querySelector<HTMLElement>(
      `[data-column-id="${task.columnId}"]`,
    );
    if (kanban && column)
      kanban.scrollTo?.({
        left: column.offsetLeft - kanban.offsetLeft,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      });
  };
  const allTasks = data.tasks.filter((t) => t.boardId === board.id);
  const tasks = useMemo(
    () =>
      data.tasks.filter(
        (t) =>
          (view === "day" || t.boardId === board.id) &&
          (!search ||
            `${t.title} ${t.description} ${t.tags.join(" ")}`
              .toLowerCase()
              .includes(search.toLowerCase())) &&
          (person === "all" || t.assignee === person) &&
          (priority === "all" || t.priority === priority) &&
          (tag === "all" || t.tags.includes(tag)) &&
          (due === "all" ||
            (due === "today"
              ? t.due.slice(0, 10) === today()
              : due === "late"
                ? isLate(t)
                : !t.due)) &&
          (status === "all" ||
            (status === "blocked"
              ? !!t.blocked
              : status === "done"
                ? !!t.completedAt
                : !t.completedAt)),
      ),
    [data.tasks, board.id, view, search, person, priority, tag, due, status],
  );
  const completed = allTasks.filter((t) => t.completedAt).length;
  const progress = allTasks.length
    ? Math.round((completed / allTasks.length) * 100)
    : 0;
  const unread = data.activities.filter((a) => a.unread).length;
  const activeFilters = [person, priority, tag, due, status].filter(
    (s) => s !== "all",
  ).length;
  const focusedTask = data.tasks.find((t) => t.id === concentrating);
  const dayName = new Date().toLocaleDateString("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const streakDays = streak(data.focusDays);
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Buenos días" : hour < 18 ? "Buenas tardes" : "Buenas noches";
  const clearToast = useCallback(() => useStore.setState({ toast: "" }), []);
  return (
    <MotionConfig reducedMotion="user">
      <div
        className={`app bg-${board.background} role-${account?.role || "local"} ${rail ? "rail" : ""}`}
      >
        <aside className="sidebar">
          <div className="sidebar-head"><a
            className="brand"
            href="#"
            aria-label="Órbita · Tablero"
            onClick={(e) => {
              e.preventDefault();
              setView("board");
            }}
          >
            <span className="brand-icon">
              <Orbit size={25} />
            </span>
            <span className="brand-name">
              órbita<span className="brand-dot">.</span>
            </span>
          </a>
          <button className="icon-button rail-toggle" aria-label={rail ? "Expandir barra lateral" : "Colapsar barra lateral"} title={rail ? "Expandir barra lateral" : "Colapsar barra lateral"} onClick={() => {
            setRail(!rail);
            if (!demo) writePreference("orbita:sidebar", rail ? "expanded" : "compact");
          }}>{rail ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}</button></div>
          <button className="workspace-switch" title="Cambiar de tablero" onClick={() => setDialog("command")}>
            <span className="workspace-icon" aria-hidden="true"><Orbit size={17} /></span>
            <span className="workspace-name">
              <strong>Nuestro espacio</strong>
            </span>
            <ChevronDown size={14} />
          </button>
          <div className="sidebar-label"><span>Personal</span></div>
          <nav className="main-nav" aria-label="Navegación principal">
            <button
              className={view === "day" ? "active" : ""}
              aria-current={view === "day" ? "page" : undefined}
              title="Mi día"
              aria-label="Mi día"
              onClick={() => setView("day")}
            >
              <Sun size={18} /> <span className="nav-label">Mi día</span>
              <span className="nav-count">
                {
                  allTasks.filter(
                    (t) =>
                      t.assignee === data.currentUser &&
                      !t.completedAt &&
                      t.due.slice(0, 10) === today(),
                  ).length
                }
              </span>
            </button>
            <button
              className={view === "team" ? "active" : ""}
              aria-current={view === "team" ? "page" : undefined}
              title="Tú y yo"
              aria-label="Tú y yo"
              onClick={() => setView("team")}
            >
              <Users size={18} /> <span className="nav-label">Tú y yo</span>
            </button>
            <button
              className={view === "activity" ? "active" : ""}
              aria-current={view === "activity" ? "page" : undefined}
              title="Actividad"
              aria-label={unread ? `Actividad, ${unread} sin leer` : "Actividad"}
              onClick={() => setView("activity")}
            >
              <Activity size={18} /> <span className="nav-label">Actividad</span>
              {unread > 0 && <span className="nav-count" aria-label={`${unread} sin leer`}>{unread}</span>}
            </button>
          </nav>
          <div className="sidebar-label">
            <span>Tableros</span>
            <button
              aria-label="Crear tablero"
              title="Crear tablero"
              onClick={() => setDialog("board")}
            >
              <Plus size={15} />
            </button>
          </div>
          <nav className="boards-nav" aria-label="Tableros">
            {data.boards.map((b) => (
              <button
                key={b.id}
                title={b.name}
                aria-label={b.name}
                aria-current={board.id === b.id && ["board", "list", "calendar", "timeline"].includes(view) ? "page" : undefined}
                className={
                  board.id === b.id &&
                  ["board", "list", "calendar", "timeline"].includes(view)
                    ? "active"
                    : ""
                }
                onClick={() => changeBoard(b.id)}
              >
                <span>{b.emoji}</span>
                <span className="nav-label">{b.name}</span>
              </button>
            ))}
            <button className="new-board" aria-label="Nuevo tablero" title="Nuevo tablero" onClick={() => setDialog("board")}>
              <Plus size={15} /> <span className="nav-label">Nuevo tablero</span>
            </button>
          </nav>
          <div className="sidebar-label team-label">
            <span>Equipo</span>
            <button
              aria-label="Añadir persona"
              title="Añadir persona"
              onClick={() => setDialog("team")}
            >
              <Plus size={15} />
            </button>
          </div>
          <div className="sidebar-members">
            {data.members
              .filter((m) => board.members.includes(m.id))
              .map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    if (m.id === data.currentUser) setDialog("settings");
                    else {
                      setPerson(m.id);
                      setView("board");
                    }
                  }}
                >
                  <Avatar member={m} size="small" />
                  <span>
                    {m.name} {m.id === data.currentUser && <small>(tú)</small>}
                    <small>{m.status}</small>
                  </span>
                  <i style={{ background: m.color }} />
                </button>
              ))}
          </div>
          <div className="sidebar-bottom">
            <button className="sidebar-help" aria-label="Atajos y ayuda" title="Atajos y ayuda" onClick={() => setDialog("help")}>
              <HelpCircle size={16} /> <span className="nav-label">Atajos y ayuda</span> <kbd>?</kbd>
            </button>
            <div className="sidebar-profile">
              <button aria-label="Perfil y ajustes" title="Perfil y ajustes" onClick={() => setDialog("settings")}>
                <Avatar member={user} size="small" />
                <span>
                  {user.name}
                  {account && <small>{roleLabel[account.role]}</small>}
                </span>
              </button>
              <button
                className="icon-button"
                aria-label="Cambiar tema"
                title="Cambiar tema"
                aria-pressed={dark}
                onClick={() => setDark(!dark)}
              >
                {dark ? <Sun size={17} /> : <Moon size={17} />}
              </button>
            </div>
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <div className="breadcrumb">
              <span>Nuestro espacio</span>
              <span>/</span>
              <strong>
                {view === "day"
                  ? "Mi día"
                  : view === "team"
                    ? "Tú y yo"
                    : view === "activity"
                      ? "Actividad"
                      : board.name}
              </strong>
            </div>
            <div className="topbar-actions">
              <button
                className="command-shortcut"
                onClick={() => setDialog("command")}
              >
                <Search size={15} />
                <span>Encuentra tu próxima idea</span>
                <kbd>⌘ K</kbd>
              </button>
              <div className={`save-chip ${storageError || !online ? "warning" : saving ? "saving" : ""}`}>
                <span role="status">
                  {storageError || !online ? <CloudOff size={15} /> : saving ? <CloudUpload size={15} /> : <Check size={15} />}
                  {storageError ? "Sin guardar" : !online ? "Sin conexión" : saving ? "Guardando…" : "Guardado"}
                </span>
                {storageError && <button onClick={retrySave} title="Reintentar guardado">Reintentar</button>}
              </div>
              <button
                className="icon-button notification-button"
                aria-label={`Notificaciones, ${unread} sin leer`}
                title="Notificaciones"
                onClick={() => setView("activity")}
              >
                <Bell size={19} />
                {unread > 0 && <b>{unread}</b>}
              </button>
              <button
                className="profile-button"
                aria-label="Mi perfil"
                onClick={() => setDialog("settings")}
              >
                <Avatar member={user} size="small" />
              </button>
            </div>
          </header>
          <main
            onTouchStart={(e) => {
              pull.current = window.scrollY === 0 ? e.touches[0].clientY : 0;
            }}
            onTouchEnd={(e) => {
              if (
                pull.current &&
                e.changedTouches[0].clientY - pull.current > 110
              ) {
                notify(storageError
                  ? "Tienes cambios sin guardar."
                  : !online ? "Sigues sin conexión."
                    : saving ? "Guardando tus cambios…" : "Estás al día.");
              }
              pull.current = 0;
            }}
          >
            <div className="board-intro">
            <div className="greeting">
              <span>
                {greeting}, {user.name}
              </span>
              <span aria-hidden="true">·</span>
              <span>{dayName}</span>
            </div>
            <div className="board-heading">
              <div>
                <div className="board-title">
                  <span className="board-emoji">
                    {view === "day"
                      ? "☀️"
                      : view === "team"
                        ? "🤝"
                        : view === "activity"
                          ? "✨"
                          : board.emoji}
                  </span>
                  <h1 onDoubleClick={() => setDialog("settings")}>
                    {view === "day"
                      ? "Tu pequeño gran día"
                      : view === "team"
                        ? "Mejor en compañía"
                        : view === "activity"
                          ? "El pulso del equipo"
                          : board.name}
                  </h1>
                  <button
                    className="heading-menu icon-button"
                    aria-label="Ajustes del tablero"
                    title="Ajustes del tablero"
                    aria-expanded={menu}
                    onClick={() => setMenu(!menu)}
                  >
                    <MoreHorizontal size={22} />
                  </button>
                </div>
              </div>
              <div className="board-team">
                <div className="avatar-stack">
                  {data.members
                    .filter((m) => board.members.includes(m.id))
                    .slice(0, 4)
                    .map((m) => (
                      <Avatar member={m} key={m.id} size="small" />
                    ))}
                  <button
                    className="invite-circle"
                    aria-label="Añadir al equipo"
                    title="Añadir al equipo"
                    onClick={() => setDialog("team")}
                  >
                    <Plus size={14} />
                  </button>
                </div>
                <button
                  className="invite-button"
                  title="Nuestro equipo"
                  aria-label="Nuestro equipo"
                  onClick={() => setDialog("team")}
                >
                  <Users size={16} /> <span>Nuestro equipo</span>
                </button>
              </div>
              {menu && (
                <div className="board-menu">
                  <button
                    onClick={() => {
                      setDialog("settings");
                      setMenu(false);
                    }}
                  >
                    <Settings2 size={15} /> Personalizar tablero
                  </button>
                  <button
                    onClick={() => {
                      useStore.getState().undo();
                      setMenu(false);
                    }}
                  >
                    <Undo2 size={15} /> Deshacer
                  </button>
                  <button
                    onClick={() => {
                      useStore.getState().redo();
                      setMenu(false);
                    }}
                  >
                    <Redo2 size={15} /> Rehacer
                  </button>
                  {!account && (
                    <button
                      onClick={() => {
                        setDialog("onboarding");
                        setMenu(false);
                      }}
                    >
                      <Sparkles size={15} /> Presentar mi espacio
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="mobile-personal-tabs">
              <button
                className={view === "day" ? "active" : ""}
                onClick={() => setView("day")}
              >
                <Sun size={13} /> Mi día
              </button>
              <button
                className={view === "team" ? "active" : ""}
                onClick={() => setView("team")}
              >
                <Users size={13} /> Tú y yo
              </button>
            </div>
            <section className="board-insights" aria-label="Progreso del tablero">
              <div className="insight-head">
                <span><Check size={16} /> Pequeñas victorias</span>
                <motion.strong key={completed} initial={reducedMotion ? false : { opacity: 0.5, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: reducedMotion ? 0 : 0.18, ease: [0.2, 0.8, 0.2, 1] }}>{completed} de {allTasks.length}</motion.strong>
              </div>
              <div className="board-progress" role="progressbar" aria-label="Tareas completadas" aria-valuenow={progress}>
                <motion.i animate={{ width: `${progress}%` }} transition={{ duration: reducedMotion ? 0 : 0.24, ease: [0.2, 0.8, 0.2, 1] }} />
              </div>
              <div className="insight-foot">
                <span>{progress}% completado</span>
                <motion.span className="streak-mini" key={streakDays} initial={reducedMotion ? false : { opacity: 0.55, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: reducedMotion ? 0 : 0.22, ease: [0.2, 0.8, 0.2, 1] }}>
                  <Flame size={14} /> {streakDays ? `${streakDays} ${streakDays === 1 ? "día" : "días"} en racha` : "Sin racha"}
                </motion.span>
              </div>
            </section>
            </div>
            <div className="quick-row">
              <QuickAdd
                boardId={board.id}
                columnId={board.columns[0]?.id || ""}
                focusKey={quickFocus}
                onCreated={taskCreated}
                onRequestCreate={() => setDialog("create")}
              />
              <button
                className="template-button"
                aria-label="Crear desde plantilla"
                title="Crear desde plantilla"
                onClick={() => setDialog("templates")}
              >
                <Sparkles size={17} />
                <span>Plantillas</span>
              </button>
            </div>
            <div className="view-toolbar">
              <div
                className="view-tabs"
                role="tablist"
                aria-label="Vista del tablero"
              >
                {boardViews.map((v, index) => (
                  <button
                    role="tab"
                    aria-label={v.label}
                    title={v.label}
                    aria-selected={view === v.id}
                    tabIndex={view === v.id || (index === 0 && !boardViews.some((item) => item.id === view)) ? 0 : -1}
                    className={view === v.id ? "active" : ""}
                    key={v.id}
                    onClick={() => setView(v.id)}
                    onKeyDown={(event) => {
                      const offset = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
                      const last = boardViews.length - 1;
                      if (!offset && event.key !== "Home" && event.key !== "End") return;
                      event.preventDefault();
                      const next = event.key === "Home" ? 0 : event.key === "End" ? last : (index + offset + boardViews.length) % boardViews.length;
                      setView(boardViews[next].id);
                      event.currentTarget.parentElement?.querySelectorAll("button")[next]?.focus();
                    }}
                  >
                    <v.icon size={15} />
                    <span>{v.label}</span>
                  </button>
                ))}
              </div>
              <div className="view-controls">
                <div className="board-search">
                  <Search size={15} />
                  <input
                    ref={searchRef}
                    aria-label="Buscar tareas"
                    placeholder="Buscar una tarea…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  {search && (
                    <button
                      aria-label="Limpiar búsqueda"
                      onClick={() => setSearch("")}
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
                <button
                  aria-label="Filtrar tareas"
                  title="Filtrar tareas"
                  aria-expanded={filters}
                  className={`filter-button ${filters || activeFilters ? "active" : ""}`}
                  onClick={() => setFilters(!filters)}
                >
                  <SlidersHorizontal size={14} />
                  <span>Filtros</span>
                  {activeFilters > 0 && <b>{activeFilters}</b>}
                </button>
                <button
                  className="icon-button board-settings-button"
                  aria-label="Opciones de vista"
                  title="Opciones de vista"
                  onClick={() => setDialog("settings")}
                >
                  <MoreHorizontal size={19} />
                </button>
              </div>
            </div>
            <AnimatePresence>
              {filters && (
                <motion.div
                  className="filter-panel"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                >
                  <label>
                    Persona
                    <select
                      value={person}
                      onChange={(e) => setPerson(e.target.value)}
                    >
                      <option value="all">Todas</option>
                      {data.members.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Prioridad
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value)}
                    >
                      <option value="all">Todas</option>
                      {["urgente", "alta", "media", "baja"].map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Etiqueta
                    <select
                      value={tag}
                      onChange={(e) => setTag(e.target.value)}
                    >
                      <option value="all">Todas</option>
                      {[...new Set(allTasks.flatMap((t) => t.tags))].map(
                        (t) => (
                          <option key={t}>{t}</option>
                        ),
                      )}
                    </select>
                  </label>
                  <label>
                    Fecha
                    <select
                      value={due}
                      onChange={(e) => setDue(e.target.value)}
                    >
                      <option value="all">Cualquier fecha</option>
                      <option value="today">Hoy</option>
                      <option value="late">Atrasadas</option>
                      <option value="none">Sin fecha</option>
                    </select>
                  </label>
                  <label>
                    Estado
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                    >
                      <option value="all">Todos</option>
                      <option value="open">Pendientes</option>
                      <option value="done">Completadas</option>
                      <option value="blocked">Bloqueadas</option>
                    </select>
                  </label>
                  <button
                    className="text-button"
                    onClick={() => {
                      setPerson("all");
                      setPriority("all");
                      setTag("all");
                      setDue("all");
                      setStatus("all");
                      setSearch("");
                    }}
                  >
                    Limpiar
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
            <AnimatePresence mode="wait">
              <motion.div
                key={`${view}-${board.id}`}
                className="view-body"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.17 }}
              >
                {view === "board" ? (
                  <BoardView
                    board={board}
                    tasks={tasks}
                    selectedTask={taskId}
                    demoDrag={demoDrag}
                    onOpen={setTaskId}
                    onComplete={finish}
                    onEditColumn={(c) => {
                      setEditingColumn(c);
                      setDialog("column");
                    }}
                    onTaskCreated={taskCreated}
                    onAddColumn={() => {
                      setEditingColumn(null);
                      setDialog("column");
                    }}
                  />
                ) : (
                  <Views
                    view={view}
                    board={board}
                    tasks={tasks}
                    onOpen={setTaskId}
                    onComplete={finish}
                  />
                )}
              </motion.div>
            </AnimatePresence>
            <footer className="board-footer">
              <button onClick={() => setDialog("help")}>
                <Command size={12} /> Atajos de teclado
              </button>
            </footer>
          </main>
        </div>
        <nav className="mobile-nav" aria-label="Navegación móvil">
          <button
            className={view === "day" ? "active" : ""}
            onClick={() => setView("day")}
          >
            <Sun size={20} />
            Mi día
          </button>
          <button
            className={view === "board" ? "active" : ""}
            onClick={() => setView("board")}
          >
            <LayoutGrid size={20} />
            Tablero
          </button>
          <button
            className="mobile-create"
            aria-label="Crear tarea"
            onClick={() => {
              setDialog("create");
            }}
          >
            <Plus size={25} />
          </button>
          <button
            className={view === "activity" ? "active" : ""}
            onClick={() => setView("activity")}
          >
            <Activity size={20} />
            Actividad
          </button>
          <button onClick={() => setDialog("settings")}>
            <Avatar member={user} size="small" />
            Perfil
          </button>
        </nav>
        <AnimatePresence>
          {dialog === "create" && (
            <CreateTaskDialog
              board={board}
              onClose={() => setDialog(null)}
              onCreated={(id) => {
                taskCreated(id);
                setDialog(null);
              }}
            />
          )}
          {flying && (
            <motion.span
              className="flying-ball"
              aria-hidden="true"
              initial={{ x: -150, y: 80, rotate: -180, opacity: 0 }}
              animate={{ x: 0, y: 0, rotate: 90, opacity: [0, 1, 1, 0] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.65, type: "tween" }}
            >
              🏀
            </motion.span>
          )}
          {taskId && data.tasks.some((t) => t.id === taskId) && (
            <TaskPanel
              key={taskId}
              id={taskId}
              onClose={() => setTaskId(null)}
              onComplete={finish}
              onFocus={(id) => {
                setTaskId(null);
                setConcentrating(id);
                setTimer(1500);
                setRunning(false);
              }}
            />
          )}
          {dialog === "templates" && (
            <TemplateDialog
              board={board}
              onClose={() => setDialog(null)}
              onTask={(id) => {
                setTaskId(id);
                setDialog(null);
              }}
            />
          )}
          {dialog === "board" && (
            <BoardDialog
              onClose={() => setDialog(null)}
              onCreated={(id) => {
                changeBoard(id);
                setDialog(null);
              }}
            />
          )}
          {dialog === "column" && (
            <ColumnDialog
              board={board}
              column={editingColumn}
              onClose={() => setDialog(null)}
            />
          )}
          {dialog === "team" && (
            <TeamAccounts onClose={() => setDialog(null)} />
          )}
          {dialog === "settings" && (
            <SettingsDialog
              board={board}
              dark={dark}
              setDark={setDark}
              onClose={() => setDialog(null)}
              changeBoard={changeBoard}
            />
          )}
          {dialog === "help" && <Help onClose={() => setDialog(null)} />}
          {dialog === "command" && (
            <CommandDialog
              board={board}
              onClose={() => setDialog(null)}
              onTask={(id) => {
                setTaskId(id);
                setDialog(null);
              }}
              onBoard={(id) => {
                changeBoard(id);
                setDialog(null);
              }}
              onView={(v) => {
                setView(v);
                setDialog(null);
              }}
            />
          )}
          {dialog === "onboarding" && (
            <Onboarding onClose={() => setDialog(null)} />
          )}
          {focusedTask && (
            <Modal
              title="Un ratito solo para esto"
              onClose={() => {
                setConcentrating(null);
                setRunning(false);
              }}
            >
              <div className="focus-mode">
                <span>🌿</span>
                <p className="eyebrow">AHORA MISMO, SOLO UNA COSA</p>
                <h2>{focusedTask.title}</h2>
                <p>{focusedTask.description}</p>
                <div className="timer">
                  {String(Math.floor(timer / 60)).padStart(2, "0")}
                  <span>:</span>
                  {String(timer % 60).padStart(2, "0")}
                </div>
                <div className="timer-controls">
                  <button
                    className="primary"
                    onClick={() => {
                      if (timer === 0) setTimer(1500);
                      setRunning(!running);
                    }}
                  >
                    {running ? <Pause size={16} /> : <Play size={16} />}{" "}
                    {running ? "Pausar" : "Empezar 25 minutos"}
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Reiniciar temporizador"
                    onClick={() => {
                      setRunning(false);
                      setTimer(1500);
                    }}
                  >
                    <RotateCcw size={16} />
                  </button>
                </div>
                <button
                  className="focus-complete"
                  onClick={() => {
                    finish(focusedTask.id);
                    setConcentrating(null);
                    setRunning(false);
                  }}
                >
                  <Check size={17} /> Ya está. Lo hice.
                </button>
              </div>
            </Modal>
          )}
        </AnimatePresence>
        <Toast
          message={useStore((s) => s.toast)}
          onUndo={useStore((s) => s.undo)}
          canUndo={useStore((s) => s.toastUndo && s.past.length > 0)}
          onClose={clearToast}
        />
        {!online && (
          <div className="offline-badge">
            Sin conexión · tus cambios se guardan aquí
          </div>
        )}
      </div>
    </MotionConfig>
  );
}
function BoardDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🚀");
  const [template, setTemplate] = useState("pareja");
  const [background, setBackground] = useState("lavender");
  const commit = useStore((s) => s.commit);
  return (
    <Modal title="Una nueva órbita" onClose={onClose}>
      <div className="dialog-content">
        <h2>¿Qué vamos a crear juntos?</h2>
        <p>Cada gran cosa empieza con un pequeño espacio.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            const id = uid();
            commit((d) => {
              const cols =
                template === "semana"
                  ? [
                      {
                        id: uid(),
                        name: "Esta semana",
                        emoji: "🗓️",
                        color: "#ad91d9",
                      },
                      { id: uid(), name: "Hoy", emoji: "☀️", color: "#e6b25d" },
                      {
                        id: uid(),
                        name: "Hecho",
                        emoji: "🌱",
                        color: "#8cba9e",
                      },
                    ]
                  : template === "vacio"
                    ? [
                        {
                          id: uid(),
                          name: "Ideas",
                          emoji: "💡",
                          color: "#ad91d9",
                        },
                        {
                          id: uid(),
                          name: "Hecho",
                          emoji: "🌱",
                          color: "#8cba9e",
                        },
                      ]
                    : columns();
              d.boards.push({
                id,
                name: name.trim(),
                emoji,
                background,
                members: d.members.map((m) => m.id),
                columns: cols,
              });
            }, "Tu nuevo tablero está listo ✨");
            onCreated(id);
          }}
        >
          <div className="name-and-emoji">
            <label>
              Emoji
              <input
                aria-label="Emoji del tablero"
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                maxLength={8}
              />
            </label>
            <label>
              Nombre del tablero
              <input
                autoFocus
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nuestra próxima aventura"
                maxLength={60}
              />
            </label>
          </div>
          <label>
            Un punto de partida
            <select
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
            >
              <option value="pareja">🤝 Trabajo en pareja · 4 columnas</option>
              <option value="proyecto">
                🚀 Proyecto creativo · 4 columnas
              </option>
              <option value="semana">🗓️ Nuestra semana · 3 columnas</option>
              <option value="vacio">🌱 Desde cero · 2 columnas</option>
            </select>
          </label>
          <label>El ambiente</label>
          <div className="background-options">
            {backgrounds.map((b) => (
              <button
                key={b.id}
                type="button"
                aria-pressed={background === b.id}
                style={{ background: b.color }}
                onClick={() => setBackground(b.id)}
              >
                {background === b.id && <Check size={14} />} {b.name}
              </button>
            ))}
          </div>
          <button className="primary full" type="submit">
            Crear nuestro tablero <ArrowRight size={16} />
          </button>
        </form>
      </div>
    </Modal>
  );
}
function ColumnDialog({
  board,
  column,
  onClose,
}: {
  board: Board;
  column: Column | null;
  onClose: () => void;
}) {
  const [name, setName] = useState(column?.name || "");
  const [emoji, setEmoji] = useState(column?.emoji || "✨");
  const [color, setColor] = useState(column?.color || "#ad91d9");
  const [wip, setWip] = useState(column?.wip?.toString() || "");
  const [deleting, setDeleting] = useState(false);
  const commit = useStore((s) => s.commit);
  const isLast = column?.id === board.columns.at(-1)?.id;
  return (
    <Modal
      title={column ? "Un poquito más tuya" : "Dale un lugar a tus ideas"}
      onClose={onClose}
    >
      <div className="dialog-content">
        <h2>{column ? "Editar columna" : "Nueva columna"}</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            commit((d) => {
              const b = d.boards.find((b) => b.id === board.id)!;
              const c = {
                id: column?.id || uid(),
                name: name.trim(),
                emoji,
                color,
                wip: wip ? Number(wip) : undefined,
              };
              if (column)
                b.columns = b.columns.map((x) => (x.id === column.id ? c : x));
              else b.columns.splice(Math.max(0, b.columns.length - 1), 0, c);
            }, "Columna lista ✨");
            onClose();
          }}
        >
          <div className="name-and-emoji">
            <label>
              Emoji
              <input
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                maxLength={8}
              />
            </label>
            <label>
              Nombre
              <input
                autoFocus
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={40}
              />
            </label>
          </div>
          <label>
            Color
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
          </label>
          <label>
            Límite de tareas (opcional)
            <input
              type="number"
              min="1"
              max="200"
              value={wip}
              onChange={(e) => setWip(e.target.value)}
              placeholder="Un poco de espacio para respirar"
            />
          </label>
          {isLast && (
            <p className="info-note">
              La última columna marca las tareas como completadas.
            </p>
          )}
          <button className="primary full">Guardar columna</button>
        </form>
        {column &&
          board.columns.length > 2 &&
          !isLast &&
          (deleting ? (
            <div className="confirm-box">
              <p>Sus tareas volverán a la primera columna disponible.</p>
              <button
                className="danger"
                onClick={() => {
                  commit((d) => {
                    const b = d.boards.find((b) => b.id === board.id)!;
                    b.columns = b.columns.filter((c) => c.id !== column.id);
                    d.tasks
                      .filter((t) => t.columnId === column.id)
                      .forEach((t) => {
                        t.columnId = b.columns[0].id;
                        t.completedAt = undefined;
                      });
                  }, "Columna eliminada");
                  onClose();
                }}
              >
                Sí, eliminar columna
              </button>
            </div>
          ) : (
            <button
              className="danger text-button"
              onClick={() => setDeleting(true)}
            >
              Eliminar columna
            </button>
          ))}
      </div>
    </Modal>
  );
}
function SettingsDialog({
  board,
  dark,
  setDark,
  onClose,
  changeBoard,
}: {
  board: Board;
  dark: boolean;
  setDark: (d: boolean) => void;
  onClose: () => void;
  changeBoard: (id: string) => void;
}) {
  const role = useIdentity((s) => s.user?.role);
  const admin = !role || role === "admin";
  const data = useStore((s) => s.data);
  const commit = useStore((s) => s.commit);
  const notify = useStore((s) => s.notify);
  const user = data.members.find((m) => m.id === data.currentUser)!;
  const [sound, setSound] = useState(readPreference("orbita:sound") === "true");
  const [deleting, setDeleting] = useState(false);
  const [importText, setImportText] = useState("");
  function member(p: Partial<Member>) {
    commit((d) =>
      Object.assign(
        d.members.find((m) => m.id === d.currentUser)!,
        p,
      ),
    );
  }
  function exportData() {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orbita-${today()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <Modal title="Hazlo un poquito más tuyo" onClose={onClose}>
      <div className="dialog-content settings-dialog">
        <AccountSettings />
        <h2>Tu espacio, tu ritmo.</h2>
        <div className="settings-profile">
          <Avatar member={user} size="large" />
          <div>
            <strong>{user.name}</strong>
            <span>Una parte importante de esta órbita.</span>
          </div>
        </div>
        <label>
          Tu nombre
          <input
            defaultValue={user.name}
            onBlur={(e) => {
              if (e.target.value.trim())
                member({ name: e.target.value.trim() });
            }}
            maxLength={30}
          />
        </label>
        <div className="two-fields">
          <label>
            Tu emoji
            <input
              defaultValue={user.emoji}
              onBlur={(e) => member({ emoji: e.target.value })}
              maxLength={8}
            />
          </label>
          <label>
            Tu color
            <input
              type="color"
              value={user.color}
              onChange={(e) => member({ color: e.target.value })}
            />
          </label>
        </div>
        <label>
          Ahora estoy…
          <select
            value={user.status}
            onChange={(e) =>
              member({ status: e.target.value as Member["status"] })
            }
          >
            <option value="disponible">🟢 Disponible</option>
            <option value="en foco">🟡 En foco</option>
            <option value="fuera">⚪ Fuera por un rato</option>
          </select>
        </label>
        <div className="setting-toggle">
          <span>
            <Moon size={16} /> Modo oscuro
          </span>
          <button
            role="switch"
            aria-checked={dark}
            aria-label="Modo oscuro"
            className={`toggle ${dark ? "on" : ""}`}
            onClick={() => setDark(!dark)}
          >
            <i />
          </button>
        </div>
        <div className="setting-toggle">
          <span>🎵 Un sonido al completar</span>
          <button
            role="switch"
            aria-checked={sound}
            aria-label="Sonidos al completar"
            className={`toggle ${sound ? "on" : ""}`}
            onClick={() => {
              setSound(!sound);
              writePreference("orbita:sound", String(!sound));
            }}
          >
            <i />
          </button>
        </div>
        {role && <PushSettings />}
        <hr />
        <h3 className="board-settings-heading">{board.emoji} Este tablero</h3>
        <label>
          Nombre
          <input
            defaultValue={board.name}
            disabled={!admin}
            onBlur={(e) => {
              if (e.target.value.trim())
                commit((d) => {
                  d.boards.find((b) => b.id === board.id)!.name =
                    e.target.value.trim();
                });
            }}
            maxLength={60}
          />
        </label>
        <div className="background-options">
          {backgrounds.map((b) => (
            <button
              key={b.id}
              style={{ background: b.color }}
              disabled={!admin}
              aria-pressed={board.background === b.id}
              onClick={() =>
                commit((d) => {
                  d.boards.find((b) => b.id === board.id)!.background = b.id;
                })
              }
            >
              {board.background === b.id && <Check size={13} />} {b.name}
            </button>
          ))}
        </div>
        <hr />
        <h3>Tus datos, contigo</h3>
        {getRecoveryData() && (
          <button
            className="secondary full"
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob([getRecoveryData()!], { type: "application/json" }),
              );
              const a = document.createElement("a");
              a.href = url;
              a.download = "orbita-recuperacion.json";
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            Descargar datos de recuperación
          </button>
        )}
        <button className="secondary full" onClick={exportData}>
          <ArrowDownToLine size={15} /> Exportar copia del espacio
        </button>
        {admin && (
          <label className="file-button">
            Leer una copia JSON
            <input
              type="file"
              accept="application/json,.json"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                setImportText("");
                if (!f) return;
                try {
                  const text = await f.text();
                  const parsed = JSON.parse(text);
                  if (!isData(parsed)) throw Error();
                  setImportText(text);
                } catch {
                  notify("Ese archivo no es una copia válida de Órbita.");
                }
              }}
            />
          </label>
        )}
        {admin && importText && (
          <div className="confirm-box">
            <p>
              Esta copia reemplazará el espacio actual. Puedes deshacer el
              cambio.
            </p>
            <button
              className="secondary"
              onClick={() => {
                const next = JSON.parse(importText) as typeof data;
                if (role) {
                  const known = new Set(data.members.map((m) => m.id));
                  if (!next.members.every((m) => known.has(m.id))) {
                    notify("Esta copia pertenece a otro espacio. Puedes usarla al configurar una base vacía.");
                    return;
                  }
                  next.currentUser = data.currentUser;
                  next.members = data.members;
                  const active = data.boards[0].members;
                  next.boards.forEach((b) => { b.members = active; });
                }
                commit((d) => Object.assign(d, next), "Copia importada");
                changeBoard(next.boards[0].id);
                onClose();
              }}
            >
              Reemplazar con esta copia
            </button>
          </div>
        )}
        {admin && data.boards.length > 1 && (
          <>
            <hr />
            {deleting ? (
              <div className="confirm-box">
                <p>Se eliminarán el tablero y sus tareas. Puedes deshacerlo.</p>
                <button
                  className="danger"
                  onClick={() => {
                    const next = data.boards.find((b) => b.id !== board.id)!;
                    commit((d) => {
                      d.boards = d.boards.filter((b) => b.id !== board.id);
                      d.tasks = d.tasks.filter((t) => t.boardId !== board.id);
                    }, "Tablero eliminado");
                    changeBoard(next.id);
                    onClose();
                  }}
                >
                  Eliminar tablero y tareas
                </button>
              </div>
            ) : (
              <button
                className="danger text-button"
                onClick={() => setDeleting(true)}
              >
                Eliminar este tablero
              </button>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
function Help({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Unos pequeños superpoderes" onClose={onClose}>
      <div className="dialog-content">
        <h2>Menos clics. Más ideas.</h2>
        <div className="shortcuts">
          {[
            ["⌘ / Ctrl + K", "Buscar y hacer de todo"],
            ["N", "Crear una tarea"],
            ["/", "Buscar en el tablero"],
            ["1 / 2 / 3", "Mi día / Tablero / Tú y yo"],
            ["⌘ / Ctrl + Z", "Deshacer"],
            ["⌘ / Ctrl + Shift + Z", "Rehacer"],
            ["?", "Ver estos atajos"],
            ["Esc", "Cerrar un panel"],
            ["Espacio + flechas", "Arrastrar desde el asa"],
          ].map(([key, text]) => (
            <div key={key}>
              <span>{text}</span>
              <kbd>{key}</kbd>
            </div>
          ))}
        </div>
        <div className="info-note">
          <strong>Escribe como hablas ✨</strong>
          <p>Enviar propuesta @Vale mañana 3pm #urgente</p>
          <p>
            Reconocemos nombres, hoy, mañana, fechas AAAA-MM-DD, horas am/pm,
            etiquetas y prioridades.
          </p>
        </div>
        <p className="small-note">
          Doble clic en el título de una tarjeta para editarlo; en el nombre de
          una columna para personalizarla. La última columna siempre representa
          «Hecho».
        </p>
      </div>
    </Modal>
  );
}
function CommandDialog({
  board,
  onClose,
  onTask,
  onBoard,
  onView,
}: {
  board: Board;
  onClose: () => void;
  onTask: (id: string) => void;
  onBoard: (id: string) => void;
  onView: (v: View) => void;
}) {
  const [query, setQuery] = useState("");
  const data = useStore((s) => s.data);
  const add = useStore((s) => s.addTask);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector("input")?.focus();
  }, []);
  const results = data.tasks
    .filter((t) => t.title.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority])
    .slice(0, 7);
  return (
    <Modal title="¿Qué quieres hacer?" onClose={onClose}>
      <div
        ref={ref}
        className="command-dialog"
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            const elements = Array.from(
              ref.current!.querySelectorAll<HTMLElement>("input,button"),
            );
            const index = elements.indexOf(
              document.activeElement as HTMLElement,
            );
            e.preventDefault();
            elements[
              (index + (e.key === "ArrowDown" ? 1 : -1) + elements.length) %
                elements.length
            ]?.focus();
          }
        }}
      >
        <div className="command-input">
          <Search size={21} />
          <input
            aria-label="Buscar o ejecutar comando"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Una tarea, un tablero, una idea…"
          />
        </div>
        {query.trim() && (
          <button
            className="command-create"
            onClick={() => {
              const parsed = parseQuick(query, data.members, data.currentUser);
              if (parsed.title) {
                const id = add(
                  board.id,
                  board.columns[0].id,
                  parsed.title,
                  parsed,
                );
                onTask(id);
              }
            }}
          >
            <Plus size={16} /> Crear «{query}» <ArrowRight size={15} />
          </button>
        )}
        <p className="eyebrow">IR A</p>
        <div className="command-views">
          <button onClick={() => onView("day")}>
            <Sun size={15} /> Mi día
          </button>
          <button onClick={() => onView("team")}>
            <Users size={15} /> Tú y yo
          </button>
          <button onClick={() => onView("activity")}>
            <Activity size={15} /> Actividad
          </button>
        </div>
        <p className="eyebrow">TAREAS</p>
        {results.map((t) => (
          <button
            className="command-result"
            key={t.id}
            onClick={() => onTask(t.id)}
          >
            <span>{t.completedAt ? "✓" : "○"}</span>
            <span>
              {t.title}
              <small>{data.boards.find((b) => b.id === t.boardId)?.name}</small>
            </span>
            <small>{dueLabel(t.due)}</small>
          </button>
        ))}
        {!results.length && (
          <p className="small-note">
            No encontramos esa idea. Puedes crearla arriba.
          </p>
        )}
        <p className="eyebrow">TABLEROS</p>
        {data.boards
          .filter((b) => b.name.toLowerCase().includes(query.toLowerCase()))
          .map((b) => (
            <button
              key={b.id}
              className="command-result"
              onClick={() => onBoard(b.id)}
            >
              {b.emoji} {b.name}
            </button>
          ))}
        <footer>↑ ↓ para explorar · Enter para elegir · Esc para salir</footer>
      </div>
    </Modal>
  );
}
function Onboarding({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const data = useStore((s) => s.data);
  const user = data.members.find((m) => m.id === data.currentUser)!;
  const commit = useStore((s) => s.commit);
  const [partner, setPartner] = useState(data.members[1]?.name || "");
  const [withExamples, setWithExamples] = useState(true);
  const [boardName, setBoardName] = useState(data.boards[0].name);
  return (
    <Modal
      title="Bienvenido a tu órbita"
      onClose={() => {
        commit((d) => {
          d.onboarded = true;
        });
        onClose();
      }}
    >
      <div className="onboarding">
        <span className="onboarding-art">
          {step === 0 ? "🪐" : step === 1 ? "👋" : "🌱"}
        </span>
        <h2>
          {step === 0
            ? "Las grandes cosas empiezan de a dos."
            : step === 1
              ? "Hazte un lugar por aquí."
              : "Un lugar para avanzar juntos."}
        </h2>
        <p>
          {step === 0
            ? "Un espacio ligero para compartir ideas, avanzar y celebrar lo que van logrando."
            : step === 1
              ? "Tu nombre, tu color y un emoji que se sienta como tú."
              : "Empezamos en este navegador. Podrás añadir perfiles y crear más tableros cuando quieras."}
        </p>
        {step === 1 && (
          <>
            <label>
              Tu nombre
              <input
                defaultValue={user.name}
                onBlur={(e) => {
                  if (e.target.value.trim())
                    commit((d) => {
                      d.members.find((m) => m.id === d.currentUser)!.name =
                        e.target.value.trim();
                    });
                }}
              />
            </label>
            <div className="emoji-choices">
              {["👨🏻‍🚀", "👩🏽‍🎨", "🦊", "🌻", "🐱", "🧑🏽‍💻"].map((e) => (
                <button
                  className={user.emoji === e ? "active" : ""}
                  key={e}
                  onClick={() =>
                    commit((d) => {
                      d.members.find((m) => m.id === d.currentUser)!.emoji = e;
                    })
                  }
                >
                  {e}
                </button>
              ))}
            </div>
            <label>
              Tu color
              <input
                type="color"
                value={user.color}
                onChange={(e) =>
                  commit((d) => {
                    d.members.find((m) => m.id === d.currentUser)!.color =
                      e.target.value;
                  })
                }
              />
            </label>
          </>
        )}
        {step === 2 && (
          <>
            <label>
              Nombre del primer tablero
              <input
                value={boardName}
                onChange={(e) => setBoardName(e.target.value)}
                maxLength={60}
              />
            </label>
            <label>
              ¿Quién te acompaña?
              <input
                value={partner}
                onChange={(e) => setPartner(e.target.value)}
                placeholder="Nombre de tu compañero/a"
                maxLength={30}
              />
            </label>
            {!data.onboarded && (
              <label className="example-choice">
                <input
                  type="checkbox"
                  checked={withExamples}
                  onChange={(e) => setWithExamples(e.target.checked)}
                />{" "}
                Empezar con ideas de ejemplo
              </label>
            )}
            <p className="small-note">
              Los enlaces de invitación estarán disponibles al conectar la
              sincronización remota.
            </p>
          </>
        )}
        <button
          className="primary full"
          onClick={() => {
            if (step < 2) setStep(step + 1);
            else {
              commit((d) => {
                if (!d.onboarded && !withExamples) {
                  d.tasks = [];
                  d.activities = [];
                }
                d.boards[0].name =
                  boardName.trim() || "Nuestra primera aventura";
                if (d.members[1] && partner.trim())
                  d.members[1].name = partner.trim();
                d.onboarded = true;
              });
              onClose();
            }
          }}
        >
          {step === 2
            ? "Vamos a crear algo bonito"
            : step === 1
              ? "Ya casi estamos"
              : "Demos el primer paso"}
          <ArrowRight size={16} />
        </button>
        <div className="onboarding-dots">
          {[0, 1, 2].map((i) => (
            <i className={step === i ? "active" : ""} key={i} />
          ))}
        </div>
      </div>
    </Modal>
  );
}
function TemplateDialog({
  board,
  onClose,
  onTask,
}: {
  board: Board;
  onClose: () => void;
  onTask: (id: string) => void;
}) {
  const data = useStore((s) => s.data);
  const templates = [
    {
      emoji: "🎨",
      title: "Una nueva pieza creativa",
      tag: "Diseño",
      steps: [
        "Reunir referencias",
        "Explorar una primera idea",
        "Compartir y recoger feedback",
        "Dar los últimos retoques",
      ],
    },
    {
      emoji: "🚀",
      title: "Preparar un lanzamiento",
      tag: "Producto",
      steps: [
        "Definir qué vamos a contar",
        "Revisar los detalles",
        "Preparar el contenido",
        "Publicar y celebrar",
      ],
    },
    {
      emoji: "🤝",
      title: "Nuestra revisión semanal",
      tag: "Equipo",
      steps: [
        "Celebrar las pequeñas victorias",
        "Compartir los bloqueos",
        "Elegir tres prioridades",
        "Dejar espacio para lo inesperado",
      ],
    },
  ];
  return (
    <Modal title="Un pequeño empujón para empezar" onClose={onClose}>
      <div className="dialog-content">
        <h2>No empezamos de cero.</h2>
        <p>Elige una plantilla y hazla tuya. Incluye los primeros pasos.</p>
        <div className="template-list">
          {templates.map((t) => (
            <button
              key={t.title}
              onClick={() => {
                const id = useStore
                  .getState()
                  .addTask(board.id, board.columns[0].id, t.title, {
                    assignee: data.currentUser,
                    tags: [t.tag],
                    checklist: t.steps.map((text) => ({
                      id: uid(),
                      text,
                      done: false,
                    })),
                    recurrence: t.tag === "Equipo" ? "semanal" : "ninguna",
                  });
                onTask(id);
              }}
            >
              <span>{t.emoji}</span>
              <div>
                <strong>{t.title}</strong>
                <small>
                  {t.steps.length} pasos para avanzar{" "}
                  {t.tag === "Equipo" ? "· se repite cada semana" : ""}
                </small>
              </div>
              <ArrowRight size={16} />
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
export default App;
