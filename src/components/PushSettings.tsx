import { Bell, BellOff } from "lucide-react";
import { useEffect, useState } from "react";
import { api, ApiError } from "../auth/session";
import { pushApplicationKey } from "../lib/push";

export default function PushSettings() {
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const [registration, setRegistration] = useState<ServiceWorkerRegistration>();
  const [key, setKey] = useState("");
  const [device, setDevice] = useState<PushSubscription | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!supported) return;
    let alive = true;
    async function load() {
      try {
        const config = await api<{ publicKey: string | null }>("push");
        const worker = await navigator.serviceWorker.getRegistration();
        if (!alive || !worker?.active || !config.publicKey) return;
        const subscription = await worker.pushManager.getSubscription();
        const status = subscription
          ? await api<{ enabled: boolean }>("push", "POST", { action: "status", endpoint: subscription.endpoint })
          : null;
        if (!alive) return;
        setRegistration(worker);
        setKey(config.publicKey);
        setDevice(subscription);
        setEnabled(Boolean(status?.enabled));
      } catch {
        if (alive) setMessage("No pudimos consultar el estado de los avisos.");
      }
    }
    void load();
    return () => { alive = false; };
  }, [supported]);

  async function change() {
    if (!registration || !key) return;
    setBusy(true);
    setMessage("");
    try {
      if (enabled && device) {
        await api("push", "POST", { action: "off", endpoint: device.endpoint });
        setEnabled(false);
        if (await device.unsubscribe().catch(() => false)) setDevice(null);
        setMessage("Avisos desactivados en este dispositivo.");
      } else {
        const subscription = device ?? await registration.pushManager.subscribe({
          userVisibleOnly: true, applicationServerKey: pushApplicationKey(key),
        });
        setDevice(subscription);
        await api("push", "PUT", subscription.toJSON());
        setEnabled(true);
        setMessage("Avisos activados en este dispositivo.");
      }
    } catch (error) {
      setMessage(Notification.permission === "denied"
        ? "Permite las notificaciones en los ajustes del navegador y vuelve a intentarlo."
        : error instanceof Error ? error.message : "No pudimos cambiar los avisos.");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    if (!device || busy) return;
    setBusy(true);
    setMessage("");
    try {
      await api("push", "POST", { action: "test", endpoint: device.endpoint });
      setMessage("Aviso de prueba enviado.");
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        await device.unsubscribe().catch(() => false);
        setDevice(null);
        setEnabled(false);
      }
      setMessage(error instanceof Error ? error.message : "No pudimos enviar el aviso de prueba.");
    } finally {
      setBusy(false);
    }
  }

  if (!supported)
    return <p className="small-note">Para recibir avisos, usa un navegador compatible. En iPhone o iPad, añade Órbita a la pantalla de inicio desde Safari y ábrela desde ahí.</p>;

  return (
    <>
      <button className="secondary full" disabled={!registration || busy} onClick={() => void change()}>
        {enabled ? <BellOff size={15} /> : <Bell size={15} />}
        {enabled ? "Desactivar avisos en este dispositivo" : "Activar avisos en este dispositivo"}
      </button>
      {enabled && (
        <button className="text-button" disabled={busy} onClick={() => void sendTest()}>
          Enviar aviso de prueba
        </button>
      )}
      <p className="small-note" aria-live="polite">
        {message || (registration
          ? "Recibe un aviso cuando te asignen una tarea, aunque cierres Órbita."
          : "Si el botón sigue desactivado, recarga Órbita para actualizarla.")}
      </p>
    </>
  );
}
