/** Convierte dólares físicos a Bs con el precio del $ de hoy (BCV USD). */
export function usdToCurrentBs(usdAmount, usdRate) {
  if (typeof usdRate !== 'number' || !Number.isFinite(usdRate) || usdRate <= 0) {
    return null;
  }
  return (Number(usdAmount) || 0) * usdRate;
}

/** Dólares físicos cobrados: el historial guarda el $ del voucher, no Bs ÷ tasa. */
export function lockedCashUsdFromStats(stats) {
  const fromHistory = (stats?.history || []).reduce(
    (sum, day) => sum + (Number(day.cashUsd) || 0),
    0
  );
  if (fromHistory > 0.009) return fromHistory;
  return Number(stats?.paymentMethodsBreakdown?.cashUsd || 0);
}

/**
 * Dólares físicos (lockedUsd) se mantienen; el resto en Bs se convierte con la tasa activa.
 * Devuelve el número a mostrar, o null si no hay tasa para convertir Bs.
 */
export function amountFromLockedUsdAndBs(lockedUsd, otherBs, rate, selectedCurrency, usdRate) {
  const locked = Number(lockedUsd) || 0;
  const remainingBs = Number(otherBs) || 0;

  if (selectedCurrency === 'EUR') {
    if (rate != null && typeof usdRate === 'number' && usdRate > 0) {
      return (locked * usdRate + remainingBs) / rate;
    }
    return null;
  }

  if (rate != null) {
    return locked + remainingBs / rate;
  }

  if (remainingBs === 0 && locked > 0) {
    return locked;
  }

  return null;
}

const PAYMENT_METHOD_DEFS = [
  { key: 'cashBs', title: 'Efectivo Bs' },
  { key: 'cashUsd', title: 'Efectivo USD', isLockedUsd: true },
  { key: 'mobile', title: 'Pago Móvil' },
  { key: 'puntoVenta', title: 'Punto de venta' },
  { key: 'biopago', title: 'Biopago' },
  { key: 'transfer', title: 'Transferencia' },
  { key: 'prestamo', title: 'Préstamo / CxC' },
];

/**
 * Fuente única para ingreso bruto y desglose por método de pago.
 * El total siempre cuadra con la suma de métodos (Bs con USD físico a tasa actual).
 */
export function computeSalesRevenueBreakdown({
  stats,
  usdRate,
  activeRate,
  selectedCurrency,
  exchangeRate,
  hasValidRate,
}) {
  const pmBs = stats?.paymentMethodsBreakdownBs ?? {};
  const cashUsdActual = lockedCashUsdFromStats(stats);
  const cashUsdBsFromHistory = (stats?.history || []).reduce(
    (sum, day) => sum + (Number(day.cashUsdBs) || 0),
    0
  );
  const cashUsdBsHist = cashUsdBsFromHistory > 0.009
    ? cashUsdBsFromHistory
    : Number(pmBs.cashUsd || 0);
  const totalRevenueBs = Number(stats?.totalRevenueBs || 0);

  const otherPaymentBs =
    Number(pmBs.cashBs || 0) +
    Number(pmBs.mobile || 0) +
    Number(pmBs.puntoVenta || 0) +
    Number(pmBs.biopago || 0) +
    Number(pmBs.transfer || 0) +
    Number(pmBs.prestamo || 0);

  const breakdownBsHist = otherPaymentBs + cashUsdBsHist;
  const cashUsdBsLive = usdToCurrentBs(cashUsdActual, usdRate);
  const cashUsdBsForTotal = cashUsdBsLive ?? cashUsdBsHist;

  const hasBreakdown = breakdownBsHist > 0.009 || cashUsdActual > 0.009;

  const ingresoBsLive = hasBreakdown
    ? otherPaymentBs + cashUsdBsForTotal
    : cashUsdBsLive != null
      ? Math.max(0, totalRevenueBs - cashUsdBsHist) + cashUsdBsLive
      : totalRevenueBs;

  const otherBsForDisplay = hasBreakdown
    ? otherPaymentBs
    : Math.max(0, totalRevenueBs - cashUsdBsHist);

  const rate = hasValidRate ? activeRate : null;
  const sym = selectedCurrency === 'EUR' ? '€' : '$';

  const ingresoBrutoAmount = amountFromLockedUsdAndBs(
    cashUsdActual,
    otherBsForDisplay,
    rate,
    selectedCurrency,
    exchangeRate
  );

  const cashUsdDisplayValue = rate == null
    ? cashUsdActual
    : selectedCurrency === 'EUR' && exchangeRate != null
      ? (cashUsdActual * exchangeRate) / rate
      : cashUsdActual;

  const cashUsdDisplaySymbol = selectedCurrency === 'EUR' ? sym : '$';

  const bsToDisplayAmount = (bs) => (
    rate != null ? (Number(bs) || 0) / rate : null
  );

  const paymentMethods = PAYMENT_METHOD_DEFS.map((def) => {
    const bs = def.isLockedUsd
      ? cashUsdBsForTotal
      : Number(pmBs[def.key] || 0);

    const displayAmount = def.isLockedUsd
      ? cashUsdDisplayValue
      : bsToDisplayAmount(bs);

    const displaySymbol = def.isLockedUsd ? cashUsdDisplaySymbol : sym;

    return {
      ...def,
      bs,
      displayAmount,
      displaySymbol,
      hasActivity: bs > 0.009 || (def.isLockedUsd && cashUsdActual > 0.009),
    };
  });

  const paymentBsTotal = paymentMethods.reduce((sum, method) => sum + method.bs, 0);

  const paymentShare = (bs) => (
    ingresoBsLive > 0 ? Math.round(((Number(bs) || 0) / ingresoBsLive) * 100) : undefined
  );

  return {
    pmBs,
    cashUsdActual,
    cashUsdBsHist,
    cashUsdBsForTotal,
    otherPaymentBs,
    ingresoBsLive,
    ingresoBrutoAmount,
    rate,
    sym,
    paymentMethods,
    paymentBsTotal,
    paymentShare,
    hasBreakdown,
  };
}
