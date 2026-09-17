import { registerSW } from 'virtual:pwa-register';

/** Cada cuánto comprobar si hay un build nuevo (con la app abierta). */
const SW_UPDATE_INTERVAL_MS = 30 * 60 * 1000;

function checkForUpdates(registration) {
  if (!registration) return;
  registration.update().catch(() => {});
}

/**
 * Registra el SW y aplica cada deploy sin que el usuario borre caché:
 * - registerType: autoUpdate (vite.config) activa el SW nuevo
 * - onNeedRefresh recarga la pestaña/app al detectar versión nueva
 * - Al volver a la app o cada 30 min se pide al servidor si hay SW nuevo
 */
export function registerAppUpdates() {
  let registrationRef = null;

  const updateSW = registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      registrationRef = registration;
      if (!registration) return;

      const check = () => checkForUpdates(registration);

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
      window.addEventListener('focus', check);
      setInterval(check, SW_UPDATE_INTERVAL_MS);
    },
    onNeedRefresh() {
      // Hay un build nuevo en el servidor: recargar para usar JS/CSS actualizado
      updateSW(true);
    },
  });

  return { updateSW, getRegistration: () => registrationRef };
}
