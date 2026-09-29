export const ENTRY_VIDEO_SRC = '/login-inventory.mp4';

/** @type {Promise<string | null> | null} */
let preloadPromise = null;
/** @type {string | null} */
let preloadedUrl = null;

/**
 * Descarga el video de entrada completo en memoria mientras el usuario escribe sus credenciales,
 * para que al iniciar sesión se reproduzca desde un blob local sin cortes por red.
 */
export function preloadEntryVideo() {
  if (preloadPromise) return preloadPromise;

  preloadPromise = fetch(ENTRY_VIDEO_SRC, { cache: 'force-cache' })
    .then((res) => {
      if (!res.ok) throw new Error(`video ${res.status}`);
      return res.blob();
    })
    .then((blob) => {
      preloadedUrl = URL.createObjectURL(blob);
      return preloadedUrl;
    })
    .catch(() => {
      // Reintentar en el próximo intento de login; mientras tanto se usa la URL de red.
      preloadPromise = null;
      return null;
    });

  return preloadPromise;
}

/** URL del video ya descargado (blob) o la ruta de red como respaldo. */
export function getEntryVideoSrc() {
  return preloadedUrl ?? ENTRY_VIDEO_SRC;
}
