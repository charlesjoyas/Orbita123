import { useState } from "react";
import { KeyRound, LogOut, ShieldCheck } from "lucide-react";
import { api, roleLabel, useIdentity } from "./session";
import { logout } from "./AuthGate";
export default function AccountSettings() {
  const user = useIdentity((s) => s.user);
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  if (!user) return null;
  return (
    <section className="account-settings">
      <div className="role-badge">
        <ShieldCheck size={13} />
        {roleLabel[user.role]}
      </div>
      <p>{user.email}</p>
      <button className="secondary full" onClick={() => setOpen(!open)}>
        <KeyRound size={15} /> Cambiar mi contraseña
      </button>
      {open && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setMessage("");
            if (password !== repeat) {
              setMessage("Las contraseñas no coinciden.");
              return;
            }
            setBusy(true);
            try {
              await api("password", "POST", { current, password });
              setCurrent("");
              setPassword("");
              setRepeat("");
              setOpen(false);
              setMessage(
                "Contraseña actualizada. Cerramos tus otras sesiones.",
              );
            } catch (e) {
              setMessage(
                e instanceof Error ? e.message : "No se pudo cambiar.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Contraseña actual
            <input
              type="password"
              autoComplete="current-password"
              required
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </label>
          <label>
            Nueva contraseña
            <input
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label>
            Repetir nueva contraseña
            <input
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
            />
          </label>
          <button className="primary full" disabled={busy}>
            {busy ? "Guardando…" : "Guardar contraseña"}
          </button>
        </form>
      )}
      {message && (
        <p className="auth-error" role="status">
          {message}
        </p>
      )}
      <button
        className="text-button danger"
        onClick={() => void logout().catch((e) => setMessage(e.message))}
      >
        <LogOut size={14} /> Cerrar mi sesión
      </button>
    </section>
  );
}
