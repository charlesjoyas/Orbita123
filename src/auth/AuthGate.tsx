import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  Orbit,
  RefreshCw,
} from "lucide-react";
import { api, useIdentity, type Account } from "./session";
import { connectRemote, stopRemote, type SessionResult } from "./remote";
import { useStore } from "../store";
import { seedData } from "../data/seed";
import type { Data } from "../types";
import { isData } from "../data/validation";
export function acceptSession(result: SessionResult) {
  if (!result.user || !result.data || result.revision === undefined)
    throw Error("La sesión no contiene un espacio válido.");
  useIdentity.setState({ user: result.user, ready: true, expired: false });
  connectRemote(result.data, result.revision, result.user);
  if (location.search.includes("invite="))
    history.replaceState(null, "", location.pathname);
}
export async function logout() {
  await api("logout", "POST", {});
  stopRemote();
  useIdentity.setState({ user: null, ready: true, expired: false });
  useStore.setState({
    data: seedData(),
    past: [],
    future: [],
    toast: "",
    toastUndo: false,
    storageError: false,
  });
}
export default function AuthGate({ children }: { children: ReactNode }) {
  const identity = useIdentity((s) => s.user);
  const expired = useIdentity((s) => s.expired);
  const [phase, setPhase] = useState<
    "loading" | "login" | "setup" | "register" | "error"
  >("loading");
  const [requiresToken, setRequiresToken] = useState(false);
  const [invite, setInvite] = useState<{ email: string; role: string } | null>(
    null,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [visible, setVisible] = useState(false);
  const legacyData = useStore.getState().data;
  const canImportLocal = legacyData.onboarded && legacyData.tasks.length > 0;
  const [bringData, setBringData] = useState(canImportLocal);
  const [imported, setImported] = useState<Data | null>(null);
  const invitation = new URLSearchParams(location.search).get("invite");
  async function load() {
    setPhase("loading");
    setError("");
    try {
      const session = await api<SessionResult>("session");
      if (invitation && !session.user) {
        const info = await api<{ email: string; role: string }>(
          "invite?token=" + encodeURIComponent(invitation),
        );
        setInvite(info);
        setEmail(info.email);
        setPhase("register");
      } else if (session.user) {
        acceptSession(session);
        setPhase("login");
      } else {
        setRequiresToken(!!session.requiresSetupToken);
        setPhase(session.setup ? "setup" : "login");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo conectar.");
      setPhase("error");
    }
  }
  useEffect(() => {
    void load();
    return () => stopRemote();
  }, []);
  useEffect(() => {
    if (expired) {
      setPassword("");
      setRepeat("");
      setPhase("login");
      setError("Tu sesión terminó. Vuelve a entrar para continuar.");
    }
  }, [expired]);
  if (identity) return <>{children}</>;
  const registering = phase === "register" || phase === "setup";
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (registering && password !== repeat) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    try {
      const result = await api<SessionResult>(
        phase === "setup"
          ? "setup"
          : phase === "register"
            ? "register"
            : "login",
        "POST",
        {
          email,
          name,
          password,
          ...(phase === "setup"
            ? {
                setupToken,
                legacy: bringData
                  ? imported || useStore.getState().data
                  : undefined,
              }
            : {}),
          ...(phase === "register" ? { token: invitation } : {}),
        },
      );
      setPassword("");
      setRepeat("");
      acceptSession(result);
      setPhase("login");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos iniciar sesión.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <aside className="auth-story">
        <div className="auth-brand">
          <Orbit size={29} /> órbita.
        </div>
        <div className="auth-planet">
          <i />
          <b>✦</b>
          <span>✧</span>
        </div>
        <h1>
          Las grandes cosas
          <br />
          empiezan juntos.
        </h1>
        <p>
          Tus ideas, tu equipo y un pequeño espacio para hacer que las cosas
          pasen.
        </p>
        <span className="auth-story-note">
          Un paso a la vez. Una órbita compartida.
        </span>
      </aside>
      <main className="auth-main">
        <div className="auth-box">
          <span className="eyebrow">BIENVENIDO A TU ESPACIO</span>
          <h2>
            {phase === "setup"
              ? "Demos el primer paso."
              : phase === "register"
                ? "Tu lugar en el equipo."
                : "Qué bueno verte por aquí."}
          </h2>
          <p>
            {phase === "setup"
              ? "Crea tu cuenta administradora y conserva lo que ya empezaste."
              : phase === "register"
                ? `Te invitaron a Órbita como ${invite?.role === "admin" ? "administrador" : invite?.role === "viewer" ? "lector" : "miembro"}. Crea tu contraseña para entrar.`
                : "Entra y sigamos construyendo algo bonito."}
          </p>
          {phase === "loading" ? (
            <div className="auth-loading" role="status">
              <Orbit size={28} />
              <span>Buscando tu órbita…</span>
            </div>
          ) : phase === "error" ? (
            <div className="auth-error" role="alert">
              {error}
              <button className="secondary full" onClick={() => void load()}>
                <RefreshCw size={15} /> Volver a intentar
              </button>
            </div>
          ) : (
            <form onSubmit={submit}>
              {registering && (
                <label>
                  Tu nombre
                  <input
                    autoComplete="name"
                    required
                    maxLength={40}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="¿Cómo te llamas?"
                  />
                </label>
              )}
              <label>
                Correo electrónico
                <input
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  readOnly={phase === "register"}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@correo.com"
                />
              </label>
              <label>
                Contraseña
                <div className="password-field">
                  <input
                    type={visible ? "text" : "password"}
                    autoComplete={
                      registering ? "new-password" : "current-password"
                    }
                    minLength={registering ? 12 : undefined}
                    maxLength={128}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={
                      registering ? "Al menos 12 caracteres" : "Tu contraseña"
                    }
                  />
                  <button
                    type="button"
                    aria-label={
                      visible ? "Ocultar contraseña" : "Mostrar contraseña"
                    }
                    onClick={() => setVisible(!visible)}
                  >
                    {visible ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </label>
              {registering && (
                <label>
                  Repite la contraseña
                  <input
                    type={visible ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    minLength={12}
                    maxLength={128}
                    value={repeat}
                    onChange={(e) => setRepeat(e.target.value)}
                  />
                </label>
              )}
              {phase === "setup" && requiresToken && (
                <label>
                  Código de configuración inicial
                  <input
                    type="password"
                    required
                    value={setupToken}
                    onChange={(e) => setSetupToken(e.target.value)}
                    autoComplete="off"
                  />
                </label>
              )}
              {phase === "setup" &&
                canImportLocal && (
                  <label className="example-choice">
                    <input
                      type="checkbox"
                      checked={bringData}
                      onChange={(e) => setBringData(e.target.checked)}
                    />{" "}
                    Conservar las tareas de este navegador
                  </label>
                )}
              {phase === "setup" && (
                <label className="file-button">
                  Traer una copia JSON del espacio
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        const data: unknown = JSON.parse(await file.text());
                        if (!isData(data)) throw Error();
                        setImported(data);
                        setBringData(true);
                        setError("");
                      } catch {
                        setImported(null);
                        setBringData(canImportLocal);
                        setError("Esa copia de Órbita no es válida.");
                      }
                    }}
                  />
                </label>
              )}
              {phase === "setup" && imported && (
                <p className="small-note">
                  Copia lista: {imported.boards.length} tableros y{" "}
                  {imported.tasks.length} tareas.
                </p>
              )}
              {phase === "setup" && bringData && (
                <p className="small-note">
                  Los perfiles locales se sustituirán por tu cuenta. Podrás
                  invitar a tu compañero/a después.
                </p>
              )}
              {error && (
                <p className="auth-error" role="alert">
                  {error}
                </p>
              )}
              <button className="primary full" disabled={busy}>
                {busy
                  ? "Un momento…"
                  : registering
                    ? "Crear mi cuenta"
                    : "Entrar a mi órbita"}
                <ArrowRight size={16} />
              </button>
              {!registering && (
                <p className="auth-invite-hint">
                  ¿Primera vez? Pídele al administrador una invitación para
                  crear tu cuenta.
                </p>
              )}
            </form>
          )}
          <footer>
            <LockKeyhole size={13} /> Tu sesión se guarda de forma segura en
            este dispositivo.
          </footer>
        </div>
      </main>
    </div>
  );
}
export type { Account };
