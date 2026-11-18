export async function deviceSubscription() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  return registration?.pushManager.getSubscription() ?? null;
}

export function pushApplicationKey(key: string) {
  return Uint8Array.from(
    atob(key.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(key.length / 4) * 4, "=")),
    (byte) => byte.charCodeAt(0),
  );
}
