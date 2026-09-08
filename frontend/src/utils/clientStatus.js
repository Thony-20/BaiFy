export const ACTIVE_CLIENT_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export function getLastPurchaseTimestamp(client) {
  const raw = client?.ultimaCompraAt;
  if (!raw) return null;
  const timestamp = new Date(raw).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

export function getDaysSinceLastPurchase(client, now = Date.now()) {
  const lastPurchase = getLastPurchaseTimestamp(client);
  if (lastPurchase == null) return null;
  return Math.max(0, Math.floor((now - lastPurchase) / DAY_MS));
}

export function isActiveClient(client, now = Date.now()) {
  const daysSinceLast = getDaysSinceLastPurchase(client, now);
  if (daysSinceLast != null) {
    return daysSinceLast <= ACTIVE_CLIENT_DAYS;
  }
  return client?.estado === 'activo' || client?.estado === 'nuevo';
}

export function resolveClientEstado(client, now = Date.now()) {
  return isActiveClient(client, now) ? 'activo' : 'inactivo';
}
