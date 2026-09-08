import { API_URL, getHeaders, apiFetch } from './api';

export async function getNotifications(empresaId) {
  const query = new URLSearchParams({ empresaId });
  const res = await apiFetch(`${API_URL}/notifications?${query.toString()}`, {
    headers: getHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error al cargar notificaciones');
  return data;
}

const storageKey = (empresaId) => `baify:notifications:read:${empresaId}`;

/**
 * @param {string} empresaId
 * @returns {Map<string, number>} id -> timestamp de lectura
 */
export function loadReadNotificationMap(empresaId) {
  if (!empresaId || typeof window === 'undefined') return new Map();
  try {
    const raw = window.localStorage.getItem(storageKey(empresaId));
    const parsed = raw ? JSON.parse(raw) : null;
    const map = new Map();

    if (Array.isArray(parsed)) {
      // Formato antiguo: solo ids
      parsed.forEach((id, index) => {
        if (id != null) map.set(String(id), index + 1);
      });
      return map;
    }

    if (parsed && typeof parsed === 'object') {
      Object.entries(parsed).forEach(([id, ts]) => {
        const time = Number(ts);
        map.set(String(id), Number.isFinite(time) ? time : 0);
      });
    }

    return map;
  } catch {
    return new Map();
  }
}

export function loadReadNotificationIds(empresaId) {
  return new Set(loadReadNotificationMap(empresaId).keys());
}

/**
 * @param {string} empresaId
 * @param {Map<string, number>|Set<string>|Iterable<string>} idsOrMap
 */
export function saveReadNotificationMap(empresaId, idsOrMap) {
  if (!empresaId || typeof window === 'undefined') return;
  try {
    const obj = {};
    if (idsOrMap instanceof Map) {
      idsOrMap.forEach((ts, id) => {
        obj[String(id)] = ts;
      });
    } else {
      const now = Date.now();
      [...idsOrMap].forEach((id) => {
        obj[String(id)] = now;
      });
    }
    window.localStorage.setItem(storageKey(empresaId), JSON.stringify(obj));
  } catch {
    // ignore quota errors
  }
}

export function saveReadNotificationIds(empresaId, ids) {
  saveReadNotificationMap(empresaId, ids);
}

export function markNotificationsRead(empresaId, idsToMark = []) {
  const current = loadReadNotificationMap(empresaId);
  const now = Date.now();
  idsToMark.forEach((id) => {
    if (id == null) return;
    const key = String(id);
    if (!current.has(key)) current.set(key, now);
  });
  saveReadNotificationMap(empresaId, current);
  return current;
}

export function markAllNotificationsRead(empresaId, allItems = []) {
  return markNotificationsRead(
    empresaId,
    allItems.map((item) => item.id).filter(Boolean)
  );
}
