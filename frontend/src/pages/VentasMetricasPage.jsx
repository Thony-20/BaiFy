import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  Grid,
  Alert,
  useTheme,
  CircularProgress,
  Paper,
  IconButton,
  Chip,
  Skeleton,
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  ShoppingCart as ShoppingCartIcon,
  Receipt as ReceiptIcon,
  AttachMoney as MoneyIcon,
  CalendarMonth as CalendarIcon,
  CreditCard as CardIcon,
  Smartphone as MobileIcon,
  Payments as CashIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  History as HistoryIcon,
  ArrowUpward as ArrowUpIcon,
  ArrowDownward as ArrowDownIcon,
  Inventory2 as InventoryIcon,
  Refresh as RefreshIcon,
  SwapVert as SwapVertIcon,
} from '@mui/icons-material';
import useAuthStore from '../store/useAuthStore';
import useCurrencyStore from '../store/useCurrencyStore';
import { getSalesStats, getProductRanking } from '../services/saleService';
import { getRecentMovimientos } from '../services/stockService';
import { PaymentDistributionChart, TopProductsChart } from '../components/DashboardCharts';
import RevenueBalanceChart from '../components/RevenueBalanceChart';
import MetricCard from '../components/MetricCard';
import {
  computeSalesRevenueBreakdown,
  amountFromLockedUsdAndBs,
  usdToCurrentBs,
} from '../utils/salesMetricsBreakdown';

function historicalUsdBs(amountUsd, storedBs, dayRate) {
  const histBs = Number(storedBs) || 0;
  if (histBs > 0.009) return histBs;
  const usd = Number(amountUsd) || 0;
  return usd > 0 && dayRate > 0 ? usd * dayRate : 0;
}

/** Bs del día: dólares físicos se recambian a la tasa de hoy; el resto queda en Bs cobrados. */
function liveDayRevenueBs(day, usdRate) {
  const histBs = Number(day.revenueBs || 0);
  const cashUsd = Number(day.cashUsd || 0);
  const liveCashUsdBs = usdToCurrentBs(cashUsd, usdRate);
  if (liveCashUsdBs == null) return histBs;
  const cashUsdBsHist = historicalUsdBs(cashUsd, day.cashUsdBs, dayRateFromHistory(day));
  return Math.max(0, histBs - cashUsdBsHist) + liveCashUsdBs;
}

function liveDayProfitBs(day, usdRate) {
  const histBs = Number(day.profitBs || 0);
  const lockedUsd = Number(day.profitCashUsd || 0);
  const liveLockedBs = usdToCurrentBs(lockedUsd, usdRate);
  if (liveLockedBs == null) return histBs;
  const lockedBsHist = historicalUsdBs(lockedUsd, day.profitCashUsdBs, dayRateFromHistory(day));
  return Math.max(0, histBs - lockedBsHist) + liveLockedBs;
}

function dayRateFromHistory(day) {
  if (Number(day.exchangeRate) > 0) return Number(day.exchangeRate);
  const revenue = Number(day.revenue || 0);
  return revenue > 0 ? Number(day.revenueBs || 0) / revenue : 0;
}

function dayProfitUsd(day) {
  const profitBs = Number(day.profitBs || 0);
  const raw = Number(day.profit);
  const dayRate = dayRateFromHistory(day);
  if (Number.isFinite(raw) && !(raw === 0 && profitBs > 0.01)) {
    return raw;
  }
  return dayRate > 0 ? profitBs / dayRate : 0;
}

/**
 * Ganancia de Efectivo USD en dólares del voucher; el resto de métodos queda en Bs cobrados.
 */
function splitLockedProfit(history) {
  let profitLockedUsd = 0;
  let otherProfitBs = 0;

  for (const day of history) {
    const profitBs = Number(day.profitBs || 0);

    if (day.profitCashUsd != null && Number.isFinite(Number(day.profitCashUsd))) {
      const locked = Number(day.profitCashUsd);
      const lockedBs = day.profitCashUsdBs != null
        ? Number(day.profitCashUsdBs)
        : locked * dayRateFromHistory(day);
      profitLockedUsd += locked;
      otherProfitBs += Math.max(0, profitBs - lockedBs);
      continue;
    }

    const revenue = Number(day.revenue || 0);
    const cashUsd = Number(day.cashUsd || 0);
    const share = revenue > 0
      ? (cashUsd >= revenue - 0.05 ? 1 : Math.min(1, Math.max(0, cashUsd / revenue)))
      : (cashUsd > 0 ? 1 : 0);

    profitLockedUsd += dayProfitUsd(day) * share;
    otherProfitBs += profitBs * (1 - share);
  }

  return { profitLockedUsd, otherProfitBs };
}

export default function VentasMetricasPage() {
  const theme = useTheme();
  const { userProfile } = useAuthStore();
  const {
    selectedCurrency,
    getActiveRate,
    exchangeRate,
  } = useCurrencyStore();
  const activeRate = getActiveRate();
  const displayCurrencySymbol = selectedCurrency === 'EUR' ? '€' : '$';
  /** Solo tasas cargadas desde la API (sin valor inventado). */
  const hasValidRate =
    typeof activeRate === 'number' &&
    Number.isFinite(activeRate) &&
    activeRate > 0;
  const usdRate =
    typeof exchangeRate === 'number' && Number.isFinite(exchangeRate) && exchangeRate > 0
      ? exchangeRate
      : null;

  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedMetric, setSelectedMetric] = useState('revenue'); // 'revenue', 'units', 'orders'

  const [topRanking, setTopRanking] = useState({ data: [], total: 0, page: 1, totalPages: 1 });
  const [rankingLoading, setRankingLoading] = useState(false);

  const [recentMovimientos, setRecentMovimientos] = useState([]);
  const [movimientosLoading, setMovimientosLoading] = useState(false);
  const [movimientosHasMore, setMovimientosHasMore] = useState(false);
  const [movimientosPage, setMovimientosPage] = useState(1);
  const [movimientosHistory, setMovimientosHistory] = useState([null]);
  const [movimientosError, setMovimientosError] = useState(null);

  const dateFromRef = useRef(null);
  const dateToRef = useRef(null);

  const getCaracasISODate = (date = new Date()) => {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Caracas',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(date);
  };

  const [dateFrom, setDateFrom] = useState(() => {
    const saved = localStorage.getItem('sales_dateFrom');
    if (saved) return saved;
    const d = new Date();
    d.setDate(1); // Primero de mes
    return getCaracasISODate(d);
  });

  const [dateTo, setDateTo] = useState(() => getCaracasISODate());

  useEffect(() => {
    localStorage.setItem('sales_dateFrom', dateFrom);
    localStorage.setItem('sales_dateTo', dateTo);
    if (userProfile?.empresaId) {
      fetchStats();
      fetchTopRanking();
      loadRecentMovimientos(1, null);
    }
  }, [dateFrom, dateTo, userProfile?.empresaId]);

  const formatDateTime = (timestamp) => {
    if (!timestamp) return '-';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    if (isNaN(date.getTime())) return '-';
    return new Intl.DateTimeFormat('es-VE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Caracas',
    }).format(date);
  };

  const movimientosSummary = React.useMemo(() => {
    const entradas = recentMovimientos.filter((m) => m.tipo === 'incremento').length;
    return {
      entradas,
      salidas: recentMovimientos.length - entradas,
    };
  }, [recentMovimientos]);

  const loadRecentMovimientos = async (page, lastDocId = null) => {
    try {
      setMovimientosLoading(true);
      const response = await getRecentMovimientos(userProfile.empresaId, {
        from: dateFrom,
        to: dateTo,
        lastDocId,
        limitCount: 5
      });

      setRecentMovimientos(response.movimientos || []);
      setMovimientosHasMore(response.hasMore);
      setMovimientosError(null);

      if (page === 1 && !lastDocId) {
        setMovimientosHistory([null]);
        setMovimientosPage(1);
      } else if (page > movimientosPage) {
        setMovimientosHistory((prev) => [...prev, lastDocId]);
        setMovimientosPage(page);
      } else if (page < movimientosPage) {
        setMovimientosPage(page);
      }
    } catch (err) {
      console.error('Error fetching movements:', err);
      setMovimientosError(err.message || 'Error al cargar movimientos');
    } finally {
      setMovimientosLoading(false);
    }
  };

  const handleNextMovimientos = async () => {
    const lastMovId = recentMovimientos[recentMovimientos.length - 1]?.id;
    if (lastMovId) {
      await loadRecentMovimientos(movimientosPage + 1, lastMovId);
    }
  };

  const handlePrevMovimientos = async () => {
    if (movimientosPage > 1) {
      const prevDocId = movimientosHistory[movimientosPage - 2];
      setMovimientosHistory((prev) => prev.slice(0, -1));
      await loadRecentMovimientos(movimientosPage - 1, prevDocId);
    }
  };

  const fetchTopRanking = async () => {
    try {
      setRankingLoading(true);
      const data = await getProductRanking(userProfile.empresaId, {
        type: 'top',
        page: 1,
        limit: 10,
        from: dateFrom,
        to: dateTo
      });
      setTopRanking(data);
    } catch (err) {
      console.error('Error fetching top ranking:', err);
    } finally {
      setRankingLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getSalesStats(userProfile.empresaId, dateFrom, dateTo);
      setStats(data);
    } catch (err) {
      console.error('Error fetching sales stats:', err);
      setError(`Error: ${err.message || 'No se pudieron cargar las métricas'}`);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount, symbol = '$') => {
    return `${symbol} ${(amount || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatNumber = (amount) => {
    return (amount || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatCardTrendValue = (card, rawAmount) => {
    if (card.isCurrency === false) {
      return (rawAmount || 0).toLocaleString('es-VE');
    }

    if (card.trendInDisplayCurrency) {
      if (selectedCurrency === 'EUR') {
        if (hasValidRate && typeof exchangeRate === 'number' && exchangeRate > 0) {
          return `€ ${formatNumber(((rawAmount || 0) * exchangeRate) / activeRate)}`;
        }
        return '—';
      }
      return `$ ${formatNumber(rawAmount || 0)}`;
    }

    if (hasValidRate) {
      return `${card.currencySymbol ?? displayCurrencySymbol} ${formatNumber((rawAmount || 0) / activeRate)}`;
    }

    return `Bs. ${formatNumber(rawAmount || 0)}`;
  };

  // Función para calcular la tendencia porcentual (Día anterior vs Día actual)
  const calculateTrend = (historyData, key = 'revenue') => {
    if (!historyData || historyData.length < 2) return { percent: 0, isUp: true, firstHalf: 0, secondHalf: 0 };

    // Tomamos los últimos dos días del historial
    const lastDay = historyData[historyData.length - 1];
    const prevDay = historyData[historyData.length - 2];

    const firstHalf = prevDay[key] || 0;  // Valor de ayer (o penúltimo día)
    const secondHalf = lastDay[key] || 0; // Valor de hoy (o último día)

    if (firstHalf === 0) return { percent: secondHalf > 0 ? 100 : 0, isUp: true, firstHalf, secondHalf };
    const diff = ((secondHalf - firstHalf) / firstHalf) * 100;
    return { percent: Math.abs(diff), isUp: diff >= 0, firstHalf, secondHalf };
  };

  const buildTrendTooltip = (card) => {
    if (!card.trend) return null;

    return (
      <Box sx={{ p: 0.5 }}>
        <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, mb: 0.5 }}>
          Comparativa diaria:
        </Typography>
        <Typography variant="caption" sx={{ display: 'block', color: 'rgba(255,255,255,0.7)' }}>
          Ayer: {formatCardTrendValue(card, card.trend.firstHalf)}
        </Typography>
        <Typography
          variant="caption"
          sx={{ display: 'block', fontWeight: 800, color: card.trend.isUp ? '#00D9A6' : '#FF5252' }}
        >
          Hoy: {formatCardTrendValue(card, card.trend.secondHalf)}
        </Typography>
      </Box>
    );
  };

  const revenueBreakdown = React.useMemo(() => computeSalesRevenueBreakdown({
    stats,
    usdRate,
    activeRate,
    selectedCurrency,
    exchangeRate,
    hasValidRate,
  }), [stats, usdRate, activeRate, selectedCurrency, exchangeRate, hasValidRate]);

  const metricCards = React.useMemo(() => {
    const history = stats?.history || [];
    const {
      ingresoBsLive,
      ingresoBrutoAmount,
      paymentMethods,
      paymentShare,
      rate,
      sym,
    } = revenueBreakdown;

    const { profitLockedUsd, otherProfitBs } = splitLockedProfit(history);
    const gananciaRealAmount = amountFromLockedUsdAndBs(
      profitLockedUsd,
      otherProfitBs,
      rate,
      selectedCurrency,
      exchangeRate
    );
    const lockedProfitBsLive = usdToCurrentBs(profitLockedUsd, usdRate);
    const gananciaBsLive = lockedProfitBsLive != null
      ? lockedProfitBsLive + otherProfitBs
      : Number(stats?.grossProfitBs || 0);

    const historyLive = history.map((day) => ({
      ...day,
      revenueBs: liveDayRevenueBs(day, usdRate),
      profitBs: liveDayProfitBs(day, usdRate),
    }));

    const totalOrders = stats?.totalOrders || 0;
    const totalUnits = stats?.totalUnitsSold || 0;
    const avgUnitsPerOrder = totalOrders > 0 ? (totalUnits / totalOrders).toFixed(1) : null;
    const profitMargin = ingresoBrutoAmount != null && ingresoBrutoAmount > 0 && gananciaRealAmount != null
      ? Math.min(100, Math.round((gananciaRealAmount / ingresoBrutoAmount) * 100))
      : null;

    const formatMethodAmount = (amount) => (
      amount != null ? formatNumber(amount) : '—'
    );

    const methodByKey = Object.fromEntries(
      paymentMethods.map((method) => [method.key, method])
    );

    const mainCards = [
      {
        title: 'Ingreso Bruto',
        value: ingresoBrutoAmount != null ? formatNumber(ingresoBrutoAmount) : '—',
        subtitle: `Bs. ${formatNumber(ingresoBsLive)} • Ventas totales`,
        icon: <MoneyIcon />,
        color: '#00D9A6',
        bgColor: 'rgba(0, 217, 166, 0.12)',
        trend: calculateTrend(historyLive, 'revenueBs'),
        isCurrency: true,
        currencySymbol: sym,
        extra: totalOrders > 0 ? `${totalOrders.toLocaleString('es-VE')} ventas registradas` : undefined,
      },
      {
        title: 'Ganancia Real',
        value: gananciaRealAmount != null ? formatNumber(gananciaRealAmount) : '—',
        subtitle: `Bs. ${formatNumber(gananciaBsLive)} • Ingreso bruto - Costos`,
        icon: <TrendingUpIcon />,
        color: '#00D9A6',
        bgColor: 'rgba(0, 217, 166, 0.12)',
        trend: calculateTrend(historyLive, 'profitBs'),
        isCurrency: true,
        currencySymbol: selectedCurrency === 'EUR' ? '€' : '$',
        extra: profitMargin !== null ? `Margen: ${profitMargin}%` : undefined,
      },
      {
        title: 'Unidades Vendidas',
        value: totalUnits.toLocaleString('es-VE'),
        subtitle: 'Productos físicos vendidos',
        icon: <ShoppingCartIcon />,
        color: '#3B82F6',
        bgColor: 'rgba(59, 130, 246, 0.12)',
        trend: calculateTrend(history, 'units'),
        isCurrency: false,
        extra: avgUnitsPerOrder !== null ? `Promedio: ~${avgUnitsPerOrder} uds. por venta` : undefined,
      },
      {
        title: 'Ventas Totales',
        value: totalOrders.toLocaleString('es-VE'),
        subtitle: 'Números de comprobantes',
        icon: <ReceiptIcon />,
        color: '#3B82F6',
        bgColor: 'rgba(59, 130, 246, 0.12)',
        trend: calculateTrend(history, 'orders'),
        isCurrency: false,
        extra: totalUnits > 0 ? `${totalUnits.toLocaleString('es-VE')} unidades movidas` : undefined,
      },
    ];

    const paymentCardUi = {
      cashBs: { icon: <CashIcon />, color: '#00D9A6', bgColor: 'rgba(0, 217, 166, 0.12)' },
      cashUsd: { icon: <MoneyIcon />, color: '#3B82F6', bgColor: 'rgba(59, 130, 246, 0.12)' },
      mobile: { icon: <MobileIcon />, color: '#FF5252', bgColor: 'rgba(255, 82, 82, 0.12)' },
      puntoVenta: { icon: <CardIcon />, color: '#00D9A6', bgColor: 'rgba(0, 217, 166, 0.12)' },
      biopago: { icon: <CardIcon />, color: '#3B82F6', bgColor: 'rgba(59, 130, 246, 0.12)' },
      transfer: { icon: <ReceiptIcon />, color: '#FF5252', bgColor: 'rgba(255, 82, 82, 0.12)' },
    };

    const paymentCards = ['cashBs', 'cashUsd', 'mobile', 'puntoVenta', 'biopago', 'transfer'].map((key) => {
      const method = methodByKey[key];
      const ui = paymentCardUi[key];
      const share = paymentShare(method?.bs);
      return {
        title: method?.title || key,
        value: formatMethodAmount(method?.displayAmount),
        subtitle: key === 'cashUsd'
          ? `Bs. ${formatNumber(method?.bs)} • Equivalente a tasa actual`
          : `Bs. ${formatNumber(method?.bs)}`,
        icon: ui.icon,
        color: ui.color,
        bgColor: ui.bgColor,
        isCurrency: true,
        currencySymbol: method?.displaySymbol || sym,
        progress: share !== undefined
          ? { value: share, label: 'Del ingreso bruto' }
          : undefined,
      };
    });

    return [...mainCards, ...paymentCards].map((card) => ({
      ...card,
      trendTooltip: buildTrendTooltip(card),
    }));
  }, [stats, revenueBreakdown, selectedCurrency, exchangeRate, usdRate]);

  const paymentData = React.useMemo(() => {
    const colorByKey = {
      cashBs: '#00D9A6',
      cashUsd: '#3B82F6',
      mobile: '#FF5252',
      puntoVenta: '#00D9A6',
      biopago: '#3B82F6',
      transfer: '#FF5252',
    };

    const rows = revenueBreakdown.paymentMethods
      .filter((method) => method.key !== 'prestamo')
      .map((method) => ({
        name: method.title,
        value: method.displayAmount == null ? 0 : Number(method.displayAmount),
        valueBs: Number(method.bs) || 0,
        displayValue: method.displayAmount,
        displaySymbol: method.displaySymbol,
        color: colorByKey[method.key] || '#3B82F6',
      }));

    if (revenueBreakdown.rate == null) {
      return rows.filter((item) => Number(item.valueBs) > 0 || Number(item.value) > 0);
    }
    return rows.filter((item) => item.value > 0);
  }, [revenueBreakdown]);

  const chartHistory = React.useMemo(
    () => (stats?.history || []).map((day) => ({
      ...day,
      revenueBs: liveDayRevenueBs(day, usdRate),
    })),
    [stats, usdRate]
  );

  const chartTotalRevenueBs = React.useMemo(
    () => revenueBreakdown.ingresoBsLive,
    [revenueBreakdown]
  );

  const paymentBsTotal = React.useMemo(
    () => paymentData.reduce((sum, item) => sum + Number(item.valueBs || 0), 0),
    [paymentData]
  );

  const revenueTrend = React.useMemo(
    () => calculateTrend(chartHistory, 'revenueBs'),
    [chartHistory]
  );
  const unitsTrend = React.useMemo(
    () => calculateTrend(stats?.history || [], 'units'),
    [stats]
  );
  const ordersTrend = React.useMemo(
    () => calculateTrend(stats?.history || [], 'orders'),
    [stats]
  );

  const paperSurfaceSx = {
    p: 4,
    borderRadius: '24px',
    border: `1px solid ${theme.palette.divider}`,
    background: theme.palette.mode === 'dark' ? 'rgba(18, 24, 41, 0.92)' : 'rgba(255, 255, 255, 0.96)',
    transition: 'border-color 0.25s ease, box-shadow 0.25s ease',
  };

  return (
    <Box>
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 900, letterSpacing: '-0.02em' }}>
              Métricas de Ventas
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Análisis de rendimiento financiero basado en facturación real.
            </Typography>
          </Box>
        </Box>

        {/* Filtros de Fecha */}
        <Box sx={{
          display: 'flex',
          gap: 3,
          alignItems: 'center',
          backgroundColor: theme.palette.mode === 'dark' ? 'rgba(18, 24, 41, 0.92)' : theme.palette.background.paper,
          p: 2,
          borderRadius: '20px',
          border: `1px solid ${theme.palette.divider}`,
          boxShadow: theme.palette.mode === 'dark' ? '0 4px 20px rgba(0,0,0,0.2)' : theme.shadows[2],
        }}>
          <Box
            sx={{ display: 'flex', alignItems: 'center', gap: 1.5, cursor: 'pointer' }}
            onClick={() => dateFromRef.current?.showPicker()}
          >
            <CalendarIcon sx={{ color: '#3B82F6', fontSize: 24 }} />
            <Box>
              <Typography variant="caption" sx={{ display: 'block', color: theme.palette.text.secondary, fontWeight: 700, textTransform: 'uppercase', fontSize: '0.6rem' }}>Desde</Typography>
              <input
                ref={dateFromRef}
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                style={{
                  background: 'transparent',
                  color: theme.palette.text.primary,
                  border: 'none',
                  outline: 'none',
                  fontFamily: 'inherit',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              />
            </Box>
          </Box>

          <Box sx={{ height: 30, width: '1px', bgcolor: theme.palette.divider }} />

          <Box
            sx={{ display: 'flex', alignItems: 'center', gap: 1.5, cursor: 'pointer' }}
            onClick={() => dateToRef.current?.showPicker()}
          >
            <CalendarIcon sx={{ color: '#00D9A6', fontSize: 24 }} />
            <Box>
              <Typography variant="caption" sx={{ display: 'block', color: theme.palette.text.secondary, fontWeight: 700, textTransform: 'uppercase', fontSize: '0.6rem' }}>Hasta</Typography>
              <input
                ref={dateToRef}
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                style={{
                  background: 'transparent',
                  color: theme.palette.text.primary,
                  border: 'none',
                  outline: 'none',
                  fontFamily: 'inherit',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              />
            </Box>
          </Box>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 4, borderRadius: '12px' }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
          <CircularProgress sx={{ color: '#3B82F6' }} />
        </Box>
      ) : (
        <>
          <Grid container spacing={3}>
            {metricCards.map((card) => (
              <Grid size={{ xs: 12, sm: 6, md: 3 }} key={card.title}>
                <MetricCard
                  title={card.title}
                  value={card.value}
                  subtitle={card.subtitle}
                  icon={card.icon}
                  color={card.color}
                  bgColor={card.bgColor}
                  progress={card.progress}
                  extra={card.extra}
                  trend={card.trend}
                  trendTooltip={card.trendTooltip}
                  currencySymbol={card.currencySymbol}
                  isCurrency={card.isCurrency}
                />
              </Grid>
            ))}
          </Grid>

          <Box sx={{ mt: 4, mb: 4 }}>
            <Paper sx={{
              ...paperSurfaceSx,
              '&:hover': {
                borderColor: 'rgba(59, 130, 246, 0.35)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
              },
            }}>
              <Box sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: { xs: 'flex-start', sm: 'center' },
                flexDirection: { xs: 'column', sm: 'row' },
                gap: 2,
                mb: 3,
              }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                  <Box sx={{
                    p: 1.25,
                    borderRadius: '14px',
                    bgcolor: 'rgba(59, 130, 246, 0.12)',
                    display: 'flex',
                    flexShrink: 0,
                  }}>
                    <HistoryIcon sx={{ color: '#3B82F6', fontSize: 24 }} />
                  </Box>
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
                      Movimientos Recientes
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                      Entradas y salidas de inventario en el rango seleccionado
                    </Typography>
                  </Box>
                </Box>

                {!movimientosLoading && !movimientosError && recentMovimientos.length > 0 && (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    <Chip
                      icon={<ArrowUpIcon sx={{ fontSize: '16px !important' }} />}
                      label={`${movimientosSummary.entradas} entradas`}
                      size="small"
                      sx={{
                        fontWeight: 700,
                        bgcolor: 'rgba(0, 217, 166, 0.12)',
                        color: '#00D9A6',
                        '& .MuiChip-icon': { color: '#00D9A6' },
                      }}
                    />
                    <Chip
                      icon={<ArrowDownIcon sx={{ fontSize: '16px !important' }} />}
                      label={`${movimientosSummary.salidas} salidas`}
                      size="small"
                      sx={{
                        fontWeight: 700,
                        bgcolor: 'rgba(255, 82, 82, 0.12)',
                        color: '#FF5252',
                        '& .MuiChip-icon': { color: '#FF5252' },
                      }}
                    />
                  </Box>
                )}
              </Box>

              {movimientosLoading ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, minHeight: 280 }}>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <Box
                      key={i}
                      sx={{
                        display: 'flex',
                        gap: 2,
                        p: 2,
                        borderRadius: '16px',
                        border: `1px solid ${theme.palette.divider}`,
                      }}
                    >
                      <Skeleton variant="rounded" width={40} height={40} sx={{ borderRadius: '12px', flexShrink: 0 }} />
                      <Box sx={{ flex: 1 }}>
                        <Skeleton width="55%" height={22} sx={{ mb: 1 }} />
                        <Skeleton width="35%" height={18} />
                        <Skeleton width="70%" height={16} sx={{ mt: 1.5 }} />
                      </Box>
                      <Skeleton variant="rounded" width={48} height={32} sx={{ borderRadius: '10px' }} />
                    </Box>
                  ))}
                </Box>
              ) : movimientosError ? (
                <Box sx={{
                  py: 5,
                  textAlign: 'center',
                  px: 2,
                  borderRadius: '16px',
                  bgcolor: theme.palette.mode === 'dark' ? 'rgba(255, 82, 82, 0.06)' : 'rgba(255, 82, 82, 0.04)',
                  border: '1px dashed rgba(255, 82, 82, 0.25)',
                }}>
                  <Typography variant="body2" color="error" sx={{ mb: 1, fontWeight: 700 }}>
                    Algo no salió como esperábamos
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2.5 }}>
                    {movimientosError}
                  </Typography>
                  <Chip
                    icon={<RefreshIcon />}
                    label="Reintentar"
                    onClick={() => loadRecentMovimientos(1, null)}
                    clickable
                    sx={{
                      fontWeight: 700,
                      bgcolor: 'rgba(59, 130, 246, 0.12)',
                      color: '#3B82F6',
                      '& .MuiChip-icon': { color: '#3B82F6' },
                    }}
                  />
                </Box>
              ) : recentMovimientos.length === 0 ? (
                <Box sx={{
                  py: 6,
                  textAlign: 'center',
                  borderRadius: '16px',
                  bgcolor: theme.palette.action.hover,
                  border: `1px dashed ${theme.palette.divider}`,
                }}>
                  <SwapVertIcon sx={{ fontSize: 44, color: 'text.secondary', opacity: 0.35, mb: 1.5 }} />
                  <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                    Sin actividad en este rango
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Prueba ampliando las fechas o registra un ajuste de stock
                  </Typography>
                </Box>
              ) : (
                <>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, minHeight: 280 }}>
                    {recentMovimientos.slice(0, 5).map((mov) => {
                      const isEntrada = mov.tipo === 'incremento';
                      const accentColor = isEntrada ? '#00D9A6' : '#FF5252';
                      const accentBg = isEntrada ? 'rgba(0, 217, 166, 0.12)' : 'rgba(255, 82, 82, 0.12)';

                      return (
                        <Box
                          key={mov.id}
                          sx={{
                            display: 'flex',
                            alignItems: 'stretch',
                            gap: 2,
                            p: 2,
                            borderRadius: '16px',
                            bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                            border: `1px solid ${theme.palette.divider}`,
                            borderLeft: `3px solid ${accentColor}`,
                            transition: 'all 0.2s ease',
                            '&:hover': {
                              bgcolor: theme.palette.action.hover,
                              borderColor: `${accentColor}55`,
                              boxShadow: `0 4px 16px ${accentBg}`,
                            },
                          }}
                        >
                          <Box sx={{
                            width: 40,
                            height: 40,
                            borderRadius: '12px',
                            bgcolor: accentBg,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}>
                            {isEntrada
                              ? <ArrowUpIcon sx={{ color: accentColor, fontSize: 20 }} />
                              : <ArrowDownIcon sx={{ color: accentColor, fontSize: 20 }} />}
                          </Box>

                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Box sx={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              justifyContent: 'space-between',
                              gap: 2,
                            }}>
                              <Box sx={{ minWidth: 0 }}>
                                <Typography
                                  variant="body2"
                                  sx={{
                                    fontWeight: 700,
                                    lineHeight: 1.3,
                                    mb: 0.75,
                                    wordBreak: 'break-word',
                                  }}
                                >
                                  {mov.productoNombre}
                                </Typography>
                                <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
                                  <Chip
                                    label={isEntrada ? 'Entrada' : 'Salida'}
                                    size="small"
                                    sx={{
                                      height: 22,
                                      fontSize: '0.68rem',
                                      fontWeight: 700,
                                      bgcolor: accentBg,
                                      color: accentColor,
                                    }}
                                  />
                                  {mov.productoSku && (
                                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                                      SKU: {mov.productoSku}
                                    </Typography>
                                  )}
                                </Box>
                              </Box>

                              <Box sx={{
                                px: 1.5,
                                py: 0.75,
                                borderRadius: '10px',
                                bgcolor: accentBg,
                                flexShrink: 0,
                                alignSelf: 'flex-start',
                              }}>
                                <Typography variant="subtitle2" sx={{ fontWeight: 900, color: accentColor, lineHeight: 1 }}>
                                  {isEntrada ? '+' : '-'}{mov.cantidad}
                                </Typography>
                              </Box>
                            </Box>

                            <Box sx={{
                              display: 'flex',
                              flexWrap: 'wrap',
                              alignItems: 'center',
                              gap: 1.5,
                              mt: 1.25,
                            }}>
                              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                                {formatDateTime(mov.fecha)}
                              </Typography>
                              {(mov.stockAnterior != null || mov.stockNuevo != null) && (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                  <InventoryIcon sx={{ fontSize: 14, color: 'text.secondary', opacity: 0.75 }} />
                                  <Typography variant="caption" color="text.secondary">
                                    Stock: {mov.stockAnterior ?? '—'}
                                    {' → '}
                                    <Box component="span" sx={{ fontWeight: 800, color: 'text.primary' }}>
                                      {mov.stockNuevo ?? '—'}
                                    </Box>
                                  </Typography>
                                </Box>
                              )}
                              {mov.notas && (
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                  sx={{
                                    fontStyle: 'italic',
                                    opacity: 0.85,
                                    maxWidth: 220,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {mov.notas}
                                </Typography>
                              )}
                            </Box>
                          </Box>
                        </Box>
                      );
                    })}
                  </Box>

                  <Box sx={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    mt: 3,
                    gap: 0.5,
                    p: 0.75,
                    borderRadius: '14px',
                    bgcolor: theme.palette.action.hover,
                    width: 'fit-content',
                    mx: 'auto',
                  }}>
                    <IconButton
                      size="small"
                      disabled={movimientosPage === 1 || movimientosLoading}
                      onClick={handlePrevMovimientos}
                      sx={{
                        color: '#3B82F6',
                        '&:hover': { bgcolor: 'rgba(59, 130, 246, 0.12)' },
                        '&.Mui-disabled': { opacity: 0.35 },
                      }}
                    >
                      <ChevronLeftIcon fontSize="small" />
                    </IconButton>
                    <Typography variant="caption" sx={{ fontWeight: 800, minWidth: 72, textAlign: 'center', letterSpacing: '0.04em' }}>
                      PÁG. {movimientosPage}
                    </Typography>
                    <IconButton
                      size="small"
                      disabled={!movimientosHasMore || movimientosLoading}
                      onClick={handleNextMovimientos}
                      sx={{
                        color: '#3B82F6',
                        '&:hover': { bgcolor: 'rgba(59, 130, 246, 0.12)' },
                        '&.Mui-disabled': { opacity: 0.35 },
                      }}
                    >
                      <ChevronRightIcon fontSize="small" />
                    </IconButton>
                  </Box>
                </>
              )}
            </Paper>
          </Box>

          <Box sx={{ mt: 4 }}>
            <RevenueBalanceChart
              data={chartHistory}
              totalRevenue={chartTotalRevenueBs}
              totalUnits={stats?.totalUnitsSold || 0}
              totalOrders={stats?.totalOrders || 0}
              trend={revenueTrend}
              trendUnits={unitsTrend}
              trendOrders={ordersTrend}
              selectedMetric={selectedMetric}
              onMetricChange={setSelectedMetric}
              usdRate={usdRate}
            />
          </Box>
        </>
      )}

      {/* Gráfico de Distribución de Pagos */}
      {!loading && stats && (
        <Box sx={{ mt: 6 }}>
          <Paper sx={{
            ...paperSurfaceSx,
            '&:hover': {
              borderColor: 'rgba(59, 130, 246, 0.4)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
            }
          }}>
            <Typography variant="h6" sx={{ fontWeight: 800, mb: 4, textAlign: 'center' }}>
              {selectedCurrency === 'EUR'
                ? 'Distribución por Método de Pago (equivalente en EUR)'
                : 'Distribución por Método de Pago (equivalente en USD)'}
            </Typography>
            <Grid container spacing={4} alignItems="center">
              <Grid size={{ xs: 12, md: 7 }} sx={{ minWidth: 0 }}>
                <PaymentDistributionChart data={paymentData} currencySymbol={displayCurrencySymbol} />
              </Grid>
              <Grid size={{ xs: 12, md: 5 }} sx={{ minWidth: 0 }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {paymentData.map((item) => (
                    <Box key={item.name} sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      p: 2,
                      borderRadius: '16px',
                      bgcolor: theme.palette.action.hover
                    }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: item.color }} />
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>{item.name}</Typography>
                      </Box>
                      <Box sx={{ textAlign: 'right' }}>
                        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, justifyContent: 'flex-end' }}>
                          <Typography component="span" sx={{ fontSize: '0.75rem', fontWeight: 800, opacity: 0.8, color: theme.palette.text.primary }}>{item.displaySymbol ?? displayCurrencySymbol}</Typography>
                          <Typography variant="subtitle2" sx={{ fontWeight: 900 }}>
                            {(item.displayValue ?? item.value).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </Typography>
                        </Box>
                        <Typography variant="caption" color="text.secondary">
                          {paymentBsTotal > 0
                            ? `${((item.valueBs / paymentBsTotal) * 100).toFixed(1)}% del total`
                            : '0% del total'}
                        </Typography>
                      </Box>
                    </Box>
                  ))}
                </Box>
              </Grid>
            </Grid>
          </Paper>
        </Box>
      )}

      {!loading && stats && (
        <Box sx={{ mt: 6 }}>
          <Paper sx={{
            ...paperSurfaceSx,
            '&:hover': {
              borderColor: 'rgba(0, 217, 166, 0.4)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
            }
          }}>
            <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="h6" sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <TrendingUpIcon sx={{ color: '#00D9A6' }} />
                Top Más Vendidos
              </Typography>
              <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Top 10 del rango
              </Typography>
            </Box>
            <Box sx={{ position: 'relative', minHeight: 300, display: 'flex', flexDirection: 'column' }}>
              {rankingLoading && (
                <Box sx={{ position: 'absolute', inset: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', bgcolor: 'rgba(0,0,0,0.05)', zIndex: 1, borderRadius: '12px' }}>
                  <CircularProgress size={24} />
                </Box>
              )}
              {topRanking.data.length > 0 ? (
                <TopProductsChart data={topRanking.data} color="#00D9A6" name="Unidades" />
              ) : (
                <Box sx={{ display: 'flex', flexGrow: 1, justifyContent: 'center', alignItems: 'center', flexDirection: 'column', opacity: 0.6, py: 4 }}>
                  <TrendingUpIcon sx={{ fontSize: 48, mb: 1, color: '#00D9A6' }} />
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>No hay ventas en este rango</Typography>
                  <Typography variant="caption">Prueba con otras fechas o registra una venta</Typography>
                </Box>
              )}
            </Box>
          </Paper>
        </Box>
      )}
    </Box>
  );
}
