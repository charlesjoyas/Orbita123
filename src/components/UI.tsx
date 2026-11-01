import { useEffect, useRef, type ReactNode } from "react";
import { AnimatePresence, motion, useIsPresent } from "framer-motion";
import { X } from "lucide-react";
import type { Member } from "../types";
export function Avatar({
  member,
  size = "normal",
}: {
  member?: Member;
  size?: "small" | "normal" | "large";
}) {
  return (
    <span
      className={`avatar ${size}`}
      style={{ background: `${member?.color}25`, borderColor: member?.color }}
      title={member ? `${member.name} · ${member.status}` : "Sin asignar"}
    >
      {member?.emoji || "🙂"}
      <i
        className={`presence ${member?.status === "disponible" ? "available" : member?.status === "en foco" ? "focused" : "away"}`}
      />
    </span>
  );
}
export function Modal({
  children,
  title,
  onClose,
  wide = false,
}: {
  children: ReactNode;
  title: string;
  onClose: () => void;
  wide?: boolean;
}) {
  const isPresent = useIsPresent();
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        closeRef.current();
      }
      if (e.key === "Tab") {
        const nodes = ref.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]),a[href],input,select,textarea,[tabindex="0"]',
        );
        if (!nodes?.length) return;
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler, true);
    return () => {
      document.body.style.overflow = old;
      document.removeEventListener("keydown", handler, true);
      previous?.focus();
    };
  }, []);
  return (
    <motion.div
      className="modal-backdrop"
      style={{ pointerEvents: isPresent ? "auto" : "none" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`modal ${wide ? "wide" : ""}`}
        initial={{ opacity: 0, y: 22, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 15, scale: 0.97 }}
        transition={{ type: "spring", stiffness: 400, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <span className="eyebrow">{title}</span>
          <button className="icon-button" aria-label="Cerrar" onClick={onClose}>
            <X size={19} />
          </button>
        </header>
        {children}
      </motion.div>
    </motion.div>
  );
}
export function Empty({
  message = "Todo limpio ✨",
  detail = "Una idea pequeña puede ser el comienzo de algo grande.",
  action,
}: {
  message?: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span>🌱</span>
      <h3>{message}</h3>
      <p>{detail}</p>
      {action}
    </div>
  );
}
export function Toast({
  message,
  onUndo,
  onClose,
  canUndo = true,
}: {
  message: string;
  onUndo: () => void;
  onClose: () => void;
  canUndo?: boolean;
}) {
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(onClose, 6500);
    return () => clearTimeout(id);
  }, [message, onClose]);
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          role="status"
          className="toast"
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 30, opacity: 0 }}
        >
          <span>✦</span>
          <p>{message}</p>
          {canUndo && <button onClick={onUndo}>Deshacer</button>}
          <button onClick={onClose} aria-label="Cerrar aviso">
            <X size={15} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
