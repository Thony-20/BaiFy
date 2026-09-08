import { getDashboardStats } from '../services/stockService';

const PREFETCH_TTL_MS = 60_000;

/** @type {{ empresaId: string, data: object | null, at: number } | null} */
let prefetched = null;

/**
 * Precarga las métricas del panel tras el login para sincronizar el overlay de entrada.
 */
export async function prefetchDashboardData(profile) {
  const empresaId = profile?.empresaId;
  if (!empresaId) {
    prefetched = null;
    return null;
  }

  const expirationMonths = profile?.expirationAlertThreshold || 2;
  try {
    const data = await getDashboardStats(
      empresaId,
      undefined,
      undefined,
      undefined,
      expirationMonths
    );
    prefetched = { empresaId, data, at: Date.now() };
    return data;
  } catch (error) {
    prefetched = { empresaId, data: null, at: Date.now() };
    throw error;
  }
}

/**
 * Consume el prefetch si pertenece a la empresa y sigue vigente.
 * @returns {object | null}
 */
export function consumeDashboardPrefetch(empresaId) {
  if (!prefetched || prefetched.empresaId !== empresaId || !prefetched.data) {
    return null;
  }

  if (Date.now() - prefetched.at > PREFETCH_TTL_MS) {
    prefetched = null;
    return null;
  }

  const { data } = prefetched;
  prefetched = null;
  return data;
}
