/**
 * Formateo y resolución de montos en Bs para cuentas.
 *
 * Regla de negocio:
 * - Sin pagos: Bs = $ × tasa de la cuenta (elegida) o tasa actual.
 * - Con pagos / pagada: Bs de abonos fijados al registrar; no se recalculan.
 */

import { ACCOUNT_STATES } from './constants';

export function formatUsd(value) {
  return `$${(Number(value) || 0).toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatBsAmount(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return null;
  return `Bs. ${Number(Number(value).toFixed(2)).toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function isAccountPaid(account) {
  if (!account) return false;
  if (account.estado === ACCOUNT_STATES.PAGADO) return true;
  return (Number(account.montoPendiente) || 0) <= 0.009;
}

export function hasAccountPayments(account) {
  return Array.isArray(account?.abonos) && account.abonos.length > 0;
}

/** Tasa de cuenta abierta sin pagos: la elegida, o la tasa viva. */
export function resolveOpenAccountRate(account, liveRate = null) {
  const accountRate = Number(account?.tasaCambio);
  if (accountRate > 0) return accountRate;
  if (liveRate > 0) return liveRate;
  return null;
}

/** Suma Bs fijados de abonos (solo valores guardados, sin tasa viva). */
export function sumAbonosBs(abonos) {
  if (!Array.isArray(abonos) || abonos.length === 0) return null;
  let total = 0;
  let allHaveBs = true;
  for (const abono of abonos) {
    const bs = resolveAbonoBs(abono);
    if (bs == null) {
      allHaveBs = false;
      break;
    }
    total += bs;
  }
  return allHaveBs ? roundMoney(total) : null;
}

/**
 * Bs del total:
 * - Pagada o con abonos → suma de Bs fijados en abonos (+ pendiente × tasa de cuenta si parcial).
 * - Sin pagos → montoTotal × tasa de la cuenta / actual.
 */
export function resolveAccountTotalBs(account, liveRate = null) {
  if (!account) return null;

  if (isAccountPaid(account)) {
    const fromAbonos = sumAbonosBs(account.abonos);
    if (fromAbonos != null) return fromAbonos;
    if (account.montoTotalBs != null && account.montoTotalBs !== '') {
      return roundMoney(account.montoTotalBs);
    }
    const tasa = Number(account.tasaCambio);
    if (tasa > 0) return roundMoney((Number(account.montoTotal) || 0) * tasa);
    return null;
  }

  if (hasAccountPayments(account)) {
    const paidBs = sumAbonosBs(account.abonos);
    const accountRate = Number(account.tasaCambio);
    const pendingRate = accountRate > 0 ? accountRate : liveRate;
    const pendingBs = pendingRate > 0
      ? roundMoney((Number(account.montoPendiente) || 0) * pendingRate)
      : 0;
    if (paidBs != null) return roundMoney(paidBs + pendingBs);
    if (account.montoTotalBs != null && account.montoTotalBs !== '') {
      return roundMoney(account.montoTotalBs);
    }
    return pendingRate > 0
      ? roundMoney((Number(account.montoTotal) || 0) * pendingRate)
      : null;
  }

  const tasa = resolveOpenAccountRate(account, liveRate);
  if (tasa > 0) {
    return roundMoney((Number(account.montoTotal) || 0) * tasa);
  }
  return null;
}

/**
 * Bs pendiente:
 * - Pagada → 0.
 * - Con/sin pagos abiertos → pendiente × tasa de cuenta (fijada); no usa tasa viva si ya hay pagos.
 */
export function resolveAccountPendienteBs(account, liveRate = null) {
  if (!account) return null;

  if (isAccountPaid(account)) {
    if (account.montoPendienteBs != null && account.montoPendienteBs !== '') {
      return roundMoney(account.montoPendienteBs);
    }
    return 0;
  }

  if (hasAccountPayments(account)) {
    if (account.montoPendienteBs != null && account.montoPendienteBs !== '') {
      return roundMoney(account.montoPendienteBs);
    }
    const accountRate = Number(account.tasaCambio);
    if (accountRate > 0) {
      return roundMoney((Number(account.montoPendiente) || 0) * accountRate);
    }
    return null;
  }

  const tasa = resolveOpenAccountRate(account, liveRate);
  if (tasa > 0) {
    return roundMoney((Number(account.montoPendiente) || 0) * tasa);
  }
  return null;
}

/** Bs de un abono: solo el fijado al registrar. Nunca recalcula con tasa viva. */
export function resolveAbonoBs(abono) {
  if (!abono) return null;
  if (abono.montoBs != null && abono.montoBs !== '') {
    return roundMoney(abono.montoBs);
  }
  const tasa = Number(abono.tasaCambio);
  if (tasa > 0) return roundMoney((Number(abono.monto) || 0) * tasa);
  return null;
}
