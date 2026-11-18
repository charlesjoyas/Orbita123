import { useEffect, useState } from "react";
import { Check, Copy, Plus, ShieldCheck, UserRoundCheck } from "lucide-react";
import {
  api,
  roleLabel,
  useIdentity,
  type Account,
  type Role,
} from "./session";
import { Avatar, Modal } from "../components/UI";
import { useStore } from "../store";
import { logout } from "./AuthGate";
export default function TeamAccounts({ onClose }: { onClose: () => void }) {
  const current = useIdentity((s) => s.user)!;
  const admin = current.role === "admin";
  const members = useStore((s) => s.data.members);
  const [users, setUsers] = useState<Account[]>([]);
  const [mode, setMode] = useState<"direct" | "invite">("direct");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [created, setCreated] = useState("");
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  async function load() {
    if (!admin) return;
    try {
      const result = await api<{ users: Account[] }>("users");
      setUsers(result.users);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el equipo.");
    }
  }
  useEffect(() => {
    void load();
  }, [admin]);
  async function update(
    user: Account,
    patch: { role?: Role; active?: boolean },
  ) {
    setBusy(true);
    setError("");
    try {
      await api("users", "PATCH", { id: user.id, ...patch });
      await load();
      if (user.id === current.id && patch.role)
        useIdentity.setState({ user: { ...current, role: patch.role } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Las personas que hacen la magia" onClose={onClose}>
      <div className="dialog-content accounts-dialog">
        <h2>Nuestra pequeña órbita</h2>
        <p>Cada persona tiene su cuenta y su lugar en el equipo.</p>
        <div className="account-current">
          <Avatar member={current} />
          <div>
            <strong>
              {current.name} <small>(tú)</small>
            </strong>
            <span>{current.email}</span>
          </div>
          <span className="role-badge">
            <ShieldCheck size={12} />
            {roleLabel[current.role]}
          </span>
        </div>
        {admin ? (
          <div className="account-list">
            {users.map((u) => (
              <div
                className={`account-row ${u.active ? "" : "inactive"}`}
                key={u.id}
              >
                <Avatar member={u} size="small" />
                <div>
                  <strong>{u.name}</strong>
                  <small>{u.email}</small>
                </div>
                <select
                  aria-label={`Rol de ${u.name}`}
                  value={u.role}
                  disabled={busy}
                  onChange={(e) =>
                    void update(u, { role: e.target.value as Role })
                  }
                >
                  <option value="admin">Administrador</option>
                  <option value="member">Miembro</option>
                  <option value="viewer">Solo lectura</option>
                </select>
                <button
                  className="text-button"
                  disabled={busy || u.id === current.id}
                  onClick={() => void update(u, { active: !u.active })}
                >
                  {u.active ? "Desactivar" : "Activar"}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="team-dialog-list">
            {members.map((m) => (
              <div key={m.id}>
                <Avatar member={m} size="small" />
                <strong>{m.name}</strong>
              </div>
            ))}
          </div>
        )}
        {admin && (
          <>
            <hr />
            <h3>
              <Plus size={17} /> Añadir al equipo
            </h3>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (busy) return;
                setBusy(true);
                setError("");
                setLink("");
                setCopied(false);
                setCreated("");
                try {
                  if (mode === "direct") {
                    const { user } = await api<{ user: Account }>("users", "POST", {
                      name, email, password, role,
                    });
                    setUsers((list) => [...list.filter((item) => item.id !== user.id), user]);
                    setCreated(`${user.name} ya puede iniciar sesión con ${user.email} y la contraseña inicial.`);
                    setName("");
                    setPassword("");
                  } else {
                    const { url } = await api<{ url: string }>("invites", "POST", { email, role });
                    setLink(url);
                  }
                  setEmail("");
                } catch (e) {
                  setError(
                    e instanceof Error
                      ? e.message
                      : "No pudimos completar el alta.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                Forma de alta
                <select
                  value={mode}
                  disabled={busy}
                  onChange={(e) => {
                    setMode(e.target.value === "invite" ? "invite" : "direct");
                    setPassword("");
                    setCreated("");
                    setLink("");
                    setError("");
                  }}
                >
                  <option value="direct">Crear cuenta manualmente</option>
                  <option value="invite">Crear enlace de invitación</option>
                </select>
              </label>
              {mode === "direct" && (
                <label>
                  Nombre de la persona
                  <input required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
                </label>
              )}
              <label>
                Correo de la persona
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="su@correo.com"
                />
              </label>
              {mode === "direct" && (
                <label>
                  Contraseña inicial
                  <input
                    type="password"
                    required
                    minLength={12}
                    maxLength={128}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    aria-describedby="initial-password-help"
                  />
                </label>
              )}
              <label>
                Su rol
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as Role)}
                >
                  <option value="member">Miembro · trabaja con tareas</option>
                  <option value="viewer">
                    Solo lectura · consulta el espacio
                  </option>
                  <option value="admin">
                    Administrador · controla el espacio y sus usuarios
                  </option>
                </select>
              </label>
              {mode === "direct" ? (
                <p id="initial-password-help" className="small-note">Usa al menos 12 caracteres y comparte la contraseña en privado. La persona puede cambiarla desde su perfil.</p>
              ) : (
                <p className="small-note">El enlace caduca en 7 días y se puede usar una sola vez.</p>
              )}
              <button className="primary full" disabled={busy}>
                <UserRoundCheck size={16} />
                {busy ? "Creando…" : mode === "direct" ? "Crear cuenta" : "Crear invitación"}
              </button>
            </form>
            {created && <p role="status">{created}</p>}
            {link && (
              <div className="invite-result" role="status">
                <strong>Su lugar ya está reservado ✨</strong>
                <p>Comparte este enlace directamente con esa persona.</p>
                <input
                  readOnly
                  aria-label="Enlace de invitación"
                  value={link}
                  onFocus={(e) => e.target.select()}
                />
                <button
                  className="secondary full"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(link);
                      setCopied(true);
                    } catch {
                      setError("Selecciona y copia el enlace desde el campo.");
                    }
                  }}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}{" "}
                  {copied ? "Copiado" : "Copiar enlace"}
                </button>
              </div>
            )}
          </>
        )}
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        <div className="role-explanation">
          <p>
            <strong>Administrador:</strong> usuarios, roles, tableros y tareas.
          </p>
          <p>
            <strong>Miembro:</strong> crea, asigna y completa tareas.
          </p>
          <p>
            <strong>Solo lectura:</strong> consulta el espacio y edita su
            perfil.
          </p>
        </div>
        <button
          className="text-button danger"
          onClick={async () => {
            try {
              await logout();
              onClose();
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "No pudimos cerrar la sesión.",
              );
            }
          }}
        >
          Cerrar mi sesión
        </button>
      </div>
    </Modal>
  );
}
