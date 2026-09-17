import React, { useState, useEffect } from 'react';
import useCurrencyStore from '../store/useCurrencyStore';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  CircularProgress,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Alert,
  Select,
  MenuItem,
  TextField,
  Tooltip,
} from '@mui/material';
import {
  Inventory as InventoryIcon,
  Warning as WarningIcon,
  TrendingUp as TrendingUpIcon,
  AttachMoney as MoneyIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  CalendarMonth as CalendarIcon,
  Edit as EditIcon,
  Check as CheckIcon,
  Close as CloseIcon,
  AccountBalanceWallet as InvestmentIcon,
  Layers as StockIcon,
  ReportProblem as ExpiredIcon,
} from '@mui/icons-material';
import MetricCard from '../components/MetricCard';
import useAuthStore from '../store/useAuthStore';
import {
  getLowStockProducts,
  getExpiringProducts,
  getExpiredProducts
} from '../services/productService';
import { getDashboardStats } from '../services/stockService';
import { LOW_STOCK_THRESHOLD, PRODUCT_STATES } from '../utils/constants';
import { updateCompanySettings } from '../services/authService';
import { consumeDashboardPrefetch } from '../utils/dashboardPrefetch';


const RenderError = ({ error, onRetry }) => {
  const isIndexError = error?.toLowerCase().includes('index');

  return (
    <Box sx={{ py: 4, textAlign: 'center', px: 2 }}>
      <Typography variant="body2" color="error" sx={{ mb: 1, fontWeight: 600 }}>
        {isIndexError
          ? 'Estamos sincronizando esta sección para ti'
          : 'Algo no salió como esperábamos'}
      </Typography>
      {isIndexError ? (
        <Alert severity="info" sx={{ mb: 2, borderRadius: '12px', textAlign: 'left' }}>
          Este reporte está siendo procesado por el sistema. Por favor, intenta de nuevo en unos minutos o refresca la página.
        </Alert>
      ) : (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
          {error}
        </Typography>
      )}
      {onRetry && (
        <IconButton onClick={onRetry} sx={{ color: '#3B82F6', '&:hover': { background: 'rgba(59, 130, 246, 0.1)' } }}>
          <TrendingUpIcon sx={{ transform: 'rotate(90deg)' }} />
          <Typography variant="caption" sx={{ ml: 1, fontWeight: 700 }}>Actualizar</Typography>
        </IconButton>
      )}
    </Box>
  );
};

export default function DashboardPage() {
  const { userProfile, setUserProfile } = useAuthStore();
  const [metrics, setMetrics] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Estados para Paginación de Listas Especializadas
  const [lowStockProducts, setLowStockProducts] = useState([]);
  const [lowStockLoading, setLowStockLoading] = useState(false);
  const [lowStockPage, setLowStockPage] = useState(1);
  const [lowStockHistory, setLowStockHistory] = useState([null]);
  const [lowStockHasMore, setLowStockHasMore] = useState(false);

  const [expiringProducts, setExpiringProducts] = useState([]);
  const [expiringLoading, setExpiringLoading] = useState(false);
  const [expiringPage, setExpiringPage] = useState(1);
  const [expiringHistory, setExpiringHistory] = useState([null]);
  const [expiringHasMore, setExpiringHasMore] = useState(false);

  const [expiredProducts, setExpiredProducts] = useState([]);
  const [expiredLoading, setExpiredLoading] = useState(false);
  const [expiredPage, setExpiredPage] = useState(1);
  const [expiredHistory, setExpiredHistory] = useState([null]);
  const [expiredHasMore, setExpiredHasMore] = useState(false);

  // Estados de error individuales
  const [lowStockError, setLowStockError] = useState(null);
  const [expiringError, setExpiringError] = useState(null);
  const [expiredError, setExpiredError] = useState(null);

  // Estados para edición inline del umbral de Stock Bajo
  const [isEditingThreshold, setIsEditingThreshold] = useState(false);
  const [tempThreshold, setTempThreshold] = useState(userProfile?.lowStockThreshold ?? 5);
  const [savingThreshold, setSavingThreshold] = useState(false);


  const {
    selectedCurrency,
    getActiveRate
  } = useCurrencyStore();

  const activeRate = getActiveRate();

  useEffect(() => {
    if (!userProfile?.empresaId) return;

    const prefetched = consumeDashboardPrefetch(userProfile.empresaId);
    if (prefetched) {
      applyDashboardStats(prefetched);
      setLoading(false);
      setError(null);
      return;
    }

    loadDashboardData();
  }, [userProfile?.empresaId]);

  const handleUpdateThreshold = async (newThreshold) => {
    if (!userProfile?.empresaId) return;
    const months = Number(newThreshold);
    if (!months || months < 1) return;

    // UI optimista: el select responde al instante
    const newProfile = { ...userProfile, expirationAlertThreshold: months };
    setUserProfile(newProfile);
    localStorage.setItem('profile', JSON.stringify(newProfile));

    try {
      setExpiringLoading(true);
      setExpiringError(null);

      // Persistencia en segundo plano (no bloquea la lista)
      const savePromise = updateCompanySettings(userProfile.empresaId, {
        expirationAlertThreshold: months
      }).catch((err) => {
        console.error('Error guardando umbral de vencimiento:', err);
      });

      // Solo la query liviana de próximos a vencer (+ count agregado)
      const res = await getExpiringProducts(userProfile.empresaId, {
        pageSize: 5,
        months
      });

      setExpiringProducts(res.products || []);
      setExpiringHasMore(Boolean(res.hasMore));
      setExpiringPage(1);
      setExpiringHistory([null]);

      if (typeof res.totalCount === 'number') {
        setMetrics((prev) => (prev ? { ...prev, expiringCount: res.totalCount } : prev));
      }

      await savePromise;
    } catch (err) {
      console.error('Error actualizando umbral de vencimiento:', err);
      setExpiringError(err.message || 'Error al cargar productos por vencer');
    } finally {
      setExpiringLoading(false);
    }
  };

  const handleSaveLowStockThreshold = async () => {
    const val = Number(tempThreshold);
    if (isNaN(val) || val < 0) return;
    try {
      setSavingThreshold(true);
      await updateCompanySettings(userProfile.empresaId, { lowStockThreshold: val });
      const newProfile = { ...userProfile, lowStockThreshold: val };
      setUserProfile(newProfile);
      localStorage.setItem('profile', JSON.stringify(newProfile));
      setIsEditingThreshold(false);
      // Refrescar datos del dashboard con el nuevo umbral
      await fetchStats();
    } catch (err) {
      console.error('Error guardando umbral de stock bajo:', err);
    } finally {
      setSavingThreshold(false);
    }
  };

  const fetchStats = async () => {
    try {
      const dashboardStats = await getDashboardStats(
        userProfile.empresaId,
        undefined,
        undefined,
        undefined,
        userProfile?.expirationAlertThreshold || 2
      );
      setStats(dashboardStats);
      
      const m = dashboardStats.metrics || {};
      setMetrics({
        totalProducts: m.totalProducts || 0,
        totalStock: m.totalStock || 0,
        activosBajos: m.activosBajos || 0,
        expiringCount: m.expiringCount || 0,
        expiredCount: m.expiredCount || 0,
        indexError: m.indexError || null,
      });

      // OPTIMIZACIÓN: Usar datos que ya vienen en dashboardStats en lugar de pedir de nuevo
      const initialLowStock = (m.lowStockProducts || []).slice(0, 5);
      setLowStockProducts(initialLowStock);
      setLowStockHasMore((m.activosBajos || 0) > initialLowStock.length);
      setLowStockPage(1);
      setLowStockHistory([null]);

      setExpiringProducts(m.expiringProducts || []);
      setExpiringHasMore((m.expiringCount || 0) > (m.expiringProducts?.length || 0));
      setExpiringPage(1);
      setExpiringHistory([null]);

      setExpiredProducts(m.expiredProducts || []);
      setExpiredHasMore((m.expiredCount || 0) > (m.expiredProducts?.length || 0));
      setExpiredPage(1);
      setExpiredHistory([null]);

    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  };

  const loadLowStock = async (targetPage, lastDocId = null) => {
    try {
      setLowStockLoading(true);
      setLowStockError(null);
      const res = await getLowStockProducts(userProfile.empresaId, { lastDoc: lastDocId ? { id: lastDocId } : null, pageSize: 5 });
      setLowStockProducts(res.products);
      setLowStockHasMore(res.hasMore);
      setLowStockPage(targetPage);
      if (targetPage === 1) setLowStockHistory([null]);
    } catch (err) {
      console.error(err);
      setLowStockError(err.message || 'Error al cargar stock bajo');
    } finally { setLowStockLoading(false); }
  };

  const loadExpiring = async (targetPage, lastDocId = null) => {
    try {
      setExpiringLoading(true);
      setExpiringError(null);
      const res = await getExpiringProducts(userProfile.empresaId, {
        lastDoc: lastDocId ? { id: lastDocId } : null,
        pageSize: 5,
        months: userProfile?.expirationAlertThreshold || 2
      });
      setExpiringProducts(res.products);
      setExpiringHasMore(res.hasMore);
      setExpiringPage(targetPage);
      if (targetPage === 1) setExpiringHistory([null]);
      if (typeof res.totalCount === 'number') {
        setMetrics((prev) => (prev ? { ...prev, expiringCount: res.totalCount } : prev));
      }
    } catch (err) {
      console.error(err);
      setExpiringError(err.message || 'Error al cargar productos por vencer');
    } finally { setExpiringLoading(false); }
  };

  const loadExpired = async (targetPage, lastDocId = null) => {
    try {
      setExpiredLoading(true);
      setExpiredError(null);
      const res = await getExpiredProducts(userProfile.empresaId, { lastDoc: lastDocId ? { id: lastDocId } : null, pageSize: 5 });
      setExpiredProducts(res.products);
      setExpiredHasMore(res.hasMore);
      setExpiredPage(targetPage);
      if (targetPage === 1) setExpiredHistory([null]);
    } catch (err) {
      console.error(err);
      setExpiredError(err.message || 'Error al cargar productos vencidos');
    } finally { setExpiredLoading(false); }
  };

  const handleNextLowStock = () => {
    const last = lowStockProducts[lowStockProducts.length - 1];
    if (last) {
      setLowStockHistory(prev => [...prev, last.id]);
      loadLowStock(lowStockPage + 1, last.id);
    }
  };
  const handlePrevLowStock = () => {
    const prevCursor = lowStockHistory[lowStockPage - 2];
    setLowStockHistory(prev => prev.slice(0, -1));
    loadLowStock(lowStockPage - 1, prevCursor);
  };

  const handleNextExpiring = () => {
    const last = expiringProducts[expiringProducts.length - 1];
    if (last) {
      setExpiringHistory(prev => [...prev, last.id]);
      loadExpiring(expiringPage + 1, last.id);
    }
  };
  const handlePrevExpiring = () => {
    const prevCursor = expiringHistory[expiringPage - 2];
    setExpiringHistory(prev => prev.slice(0, -1));
    loadExpiring(expiringPage - 1, prevCursor);
  };

  const handleNextExpired = () => {
    const last = expiredProducts[expiredProducts.length - 1];
    if (last) {
      setExpiredHistory(prev => [...prev, last.id]);
      loadExpired(expiredPage + 1, last.id);
    }
  };
  const handlePrevExpired = () => {
    const prevCursor = expiredHistory[expiredPage - 2];
    setExpiredHistory(prev => prev.slice(0, -1));
    loadExpired(expiredPage - 1, prevCursor);
  };

  const applyDashboardStats = (dashboardStats) => {
    setStats(dashboardStats);

    const m = dashboardStats.metrics || {};
    setMetrics({
      totalProducts: m.totalProducts || 0,
      totalStock: m.totalStock || 0,
      activosBajos: m.activosBajos || 0,
      expiringCount: m.expiringCount || 0,
      expiredCount: m.expiredCount || 0,
      indexError: m.indexError || null,
    });

    const initialLowStock = (m.lowStockProducts || []).slice(0, 5);
    setLowStockProducts(initialLowStock);
    setLowStockHasMore((m.activosBajos || 0) > initialLowStock.length);
    setLowStockPage(1);
    setLowStockHistory([null]);

    setExpiringProducts(m.expiringProducts || []);
    setExpiringHasMore((m.expiringCount || 0) > (m.expiringProducts?.length || 0));
    setExpiringPage(1);
    setExpiringHistory([null]);

    setExpiredProducts(m.expiredProducts || []);
    setExpiredHasMore((m.expiredCount || 0) > (m.expiredProducts?.length || 0));
    setExpiredPage(1);
    setExpiredHistory([null]);
  };

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      const dashboardStats = await getDashboardStats(
        userProfile.empresaId,
        undefined,
        undefined,
        undefined,
        userProfile?.expirationAlertThreshold || 2
      );
      applyDashboardStats(dashboardStats);
    } catch (error) {
      console.error('Error loading dashboard:', error);
      setError('Hubo un error al cargar las métricas. Por favor, intenta de nuevo en unos momentos.');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return '-';

    // Convertir a objeto Date independientemente de si es string ISO, Timestamp o Date
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);

    if (isNaN(date.getTime())) return '-';

    return new Intl.DateTimeFormat('es-VE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'America/Caracas'
    }).format(date);
  };

  // UI Principal se rentrenderiza de inmediato. Se muestra un layout vacío si está cargando.

  const totalProducts = metrics?.totalProducts || 0;
  const totalStock = metrics?.totalStock || 0;
  const lowStockCount = metrics?.activosBajos || 0;
  const expiringCount = metrics?.expiringCount || 0;
  const expiredCount = metrics?.expiredCount || 0;
  const inventoryValue = stats?.totalInventoryValue || 0;
  const costValue = stats?.totalCostValue || 0;
  const profitValue = inventoryValue - costValue;
  const profitMargin = costValue > 0 ? Math.round((profitValue / costValue) * 100) : null;
  const avgStockPerProduct = totalProducts > 0 ? Math.round(totalStock / totalProducts) : null;

  const metricCards = [
    {
      title: 'Valor Inventario',
      value: stats?.totalInventoryValue !== undefined ? `$${inventoryValue.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'Optimizando...',
      icon: <MoneyIcon />,
      color: '#00D9A6',
      bgColor: 'rgba(0, 217, 166, 0.12)',
      subtitle: stats?.totalInventoryValue !== undefined
        ? (activeRate ? `≈ Bs. ${Number((inventoryValue * activeRate).toFixed(2)).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (Tasa ${selectedCurrency})` : 'Cargando tasas...')
        : 'Cálculo deshabilitado tempor.',
      extra: 'Precio de venta total',
    },
    {
      title: 'Inversión inventario',
      value: stats ? `$${costValue.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'Calculando...',
      icon: <InvestmentIcon />,
      color: '#00D9A6',
      bgColor: 'rgba(0, 217, 166, 0.12)',
      subtitle: stats
        ? (activeRate ? `≈ Bs. ${Number((costValue * activeRate).toFixed(2)).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'Cargando...')
        : 'Cargando...',
      extra: inventoryValue > 0 ? `${Math.round((costValue / inventoryValue) * 100)}% del valor de venta` : 'Costo de adquisición',
    },
    {
      title: 'Ganancia',
      value: stats
        ? `$${profitValue.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : 'Calculando...',
      icon: <TrendingUpIcon />,
      color: '#00D9A6',
      bgColor: 'rgba(0, 217, 166, 0.12)',
      subtitle: stats
        ? (activeRate ? `≈ Bs. ${Number((profitValue * activeRate).toFixed(2)).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'Cargando...')
        : 'Cargando...',
      extra: profitMargin !== null ? `Margen estimado: ${profitMargin}%` : undefined,
    },
    {
      title: 'Total Productos',
      value: totalProducts.toLocaleString('es-VE'),
      icon: <InventoryIcon />,
      color: '#3B82F6',
      subtitle: 'Productos totales de tu inventario',
      bgColor: 'rgba(59, 130, 246, 0.12)',
      extra: totalStock > 0 ? `${totalStock.toLocaleString('es-VE')} uds. en stock` : undefined,
    },
    {
      title: 'Stock Bajo',
      value: lowStockCount,
      icon: <WarningIcon />,
      color: '#FF5252',
      bgColor: 'rgba(255, 82, 82, 0.12)',
      subtitle: `≤ ${userProfile?.lowStockThreshold ?? 5} unidades`,
      editable: true,
      progress: totalProducts > 0
        ? { value: Math.round((lowStockCount / totalProducts) * 100), label: 'Del total de productos' }
        : undefined,
      badge: lowStockCount > 0 ? { label: 'Revisar stock', severity: 'warning' } : undefined,
    },
    {
      title: 'Próximos a Vencer',
      value: expiringCount,
      icon: <CalendarIcon />,
      color: '#FF5252',
      bgColor: 'rgba(255, 82, 82, 0.12)',
      subtitle: `Productos que vencen en ${userProfile?.expirationAlertThreshold || 2} meses`,
      progress: totalProducts > 0
        ? { value: Math.round((expiringCount / totalProducts) * 100), label: 'Del catálogo activo' }
        : undefined,
      badge: expiringCount > 0 ? { label: 'Atención requerida', severity: 'warning' } : undefined,
    },
    {
      title: 'Productos Vencidos',
      value: expiredCount,
      icon: <ExpiredIcon />,
      color: '#FF5252',
      bgColor: 'rgba(255, 82, 82, 0.12)',
      subtitle: 'Requiere retiro inmediato',
      progress: totalProducts > 0
        ? { value: Math.round((expiredCount / totalProducts) * 100), label: 'Del catálogo activo' }
        : undefined,
      badge: expiredCount > 0 ? { label: 'Acción urgente', severity: 'error' } : undefined,
    },
    {
      title: 'Total Stock',
      value: totalStock.toLocaleString('es-VE'),
      icon: <StockIcon />,
      color: '#3B82F6',
      bgColor: 'rgba(59, 130, 246, 0.12)',
      subtitle: 'Unidades totales de productos',
      extra: avgStockPerProduct !== null ? `~${avgStockPerProduct.toLocaleString('es-VE')} uds. por producto` : undefined,
    },
  ];

  return (
    <Box sx={{ position: 'relative' }}>

      <Box sx={{ mb: 4, display: 'flex', alignItems: 'flex-end', flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 900, letterSpacing: '-0.02em' }}>
              Métricas de Inventario
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Análisis del estado actual de tu inventario en tiempo real.
            </Typography>
          </Box>

          {error && (
            <Box sx={{
              ml: 4,
              p: 1.5,
              bgcolor: 'rgba(255, 82, 82, 0.1)',
              borderRadius: '12px',
              border: '1px solid rgba(255, 82, 82, 0.2)',
              display: 'flex',
              alignItems: 'center',
              gap: 2
            }}>
              <Typography variant="body2" sx={{ color: '#FF5252', fontWeight: 600 }}>
                {error}
              </Typography>
              <Chip
                label="Reintentar"
                size="small"
                onClick={loadDashboardData}
                sx={{ bgcolor: '#FF5252', color: '#FFF', fontWeight: 700, cursor: 'pointer', '&:hover': { bgcolor: '#E53935' } }}
              />
            </Box>
          )}
        </Box>
      </Box>

      {/* Metric Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {metricCards.map((card) => (
          <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={card.title}>
            <MetricCard
              title={card.title}
              value={card.value}
              subtitle={card.editable ? undefined : card.subtitle}
              icon={card.icon}
              color={card.color}
              bgColor={card.bgColor}
              progress={card.progress}
              badge={card.badge}
              extra={card.extra}
              loading={loading}
              highlightBorder={card.editable && isEditingThreshold}
            >
              {card.editable && (
                isEditingThreshold ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.72rem', whiteSpace: 'nowrap' }}>≤</Typography>
                    <TextField
                      type="number"
                      size="small"
                      autoFocus
                      value={tempThreshold}
                      onChange={(e) => {
                        let val = e.target.value;
                        val = val.replace(/^0+(\d)/, '$1');
                        setTempThreshold(val);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveLowStockThreshold();
                        if (e.key === 'Escape') setIsEditingThreshold(false);
                      }}
                      inputProps={{ min: 0, style: { padding: '2px 6px', width: '48px', fontSize: '0.75rem' } }}
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          borderRadius: '8px',
                          '& fieldset': { borderColor: 'rgba(255,82,82,0.4)' },
                          '&:hover fieldset': { borderColor: '#FF5252' },
                          '&.Mui-focused fieldset': { borderColor: '#FF5252' },
                        },
                      }}
                    />
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.72rem', whiteSpace: 'nowrap' }}>uds.</Typography>
                    <Tooltip title="Guardar">
                      <IconButton size="small" onClick={handleSaveLowStockThreshold} disabled={savingThreshold} sx={{ color: '#00D9A6', p: 0.3 }}>
                        {savingThreshold ? <CircularProgress size={14} sx={{ color: '#00D9A6' }} /> : <CheckIcon sx={{ fontSize: 16 }} />}
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Cancelar">
                      <IconButton size="small" onClick={() => { setIsEditingThreshold(false); setTempThreshold(userProfile?.lowStockThreshold ?? 5); }} sx={{ color: '#FF5252', p: 0.3 }}>
                        <CloseIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                ) : (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.72rem' }}>
                      {card.subtitle}
                    </Typography>
                    <Tooltip title="Cambiar umbral">
                      <IconButton
                        size="small"
                        onClick={() => { setIsEditingThreshold(true); setTempThreshold(userProfile?.lowStockThreshold ?? 5); }}
                        sx={{ color: 'rgba(255,82,82,0.5)', p: 0.2, '&:hover': { color: '#FF5252' } }}
                      >
                        <EditIcon sx={{ fontSize: 13 }} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                )
              )}
            </MetricCard>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={3}>
        {/* Specialized Lists Grid */}
        <Grid size={{ xs: 12, md: 6, lg: 4 }}>
          <Card sx={{ borderRadius: '24px', border: '1px solid rgba(255,255,255,0.05)', height: '100%' }}>
            <CardContent sx={{ p: 4 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <WarningIcon sx={{ color: '#FF5252' }} />
                  <Typography variant="h6" sx={{ fontWeight: 800 }}>
                    Stock Bajo
                  </Typography>
                </Box>
                <Chip
                  label={`≤ ${userProfile?.lowStockThreshold ?? 5} uds.`}
                  size="small"
                  sx={{ bgcolor: 'rgba(255,82,82,0.1)', color: '#FF5252', fontWeight: 700, fontSize: '0.7rem' }}
                />
              </Box>
              {loading || lowStockLoading ? (
                <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
                  <CircularProgress size={30} sx={{ color: '#FF5252' }} />
                </Box>
              ) : lowStockError ? (
                <RenderError error={lowStockError} onRetry={() => loadLowStock(1, null)} />
              ) : lowStockProducts.length > 0 ? (
                <>
                  <TableContainer sx={{ minHeight: 280, overflowX: 'hidden' }}>
                    <Table size="small" sx={{ tableLayout: 'fixed', width: '100%' }}>
                      <TableBody>
                        {lowStockProducts.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell sx={{ p: 0, py: 1, overflow: 'hidden', verticalAlign: 'top' }}>
                              <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                                {p.nombre}
                              </Typography>
                              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', wordBreak: 'break-word' }}>
                                SKU: {p.sku || '-'}
                              </Typography>
                            </TableCell>
                            <TableCell align="right" sx={{ p: 0, width: 88, whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                              <Chip
                                label={`${p.stock} unid.`}
                                size="small"
                                sx={{ bgcolor: 'rgba(255,82,82,0.1)', color: '#FF5252', fontWeight: 700 }}
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                  <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', mt: 2, gap: 2 }}>
                    <IconButton size="small" disabled={lowStockPage === 1 || lowStockLoading} onClick={handlePrevLowStock} sx={{ color: '#FF5252' }}>
                      <ChevronLeftIcon />
                    </IconButton>
                    <Typography variant="caption" sx={{ fontWeight: 700, minWidth: 40, textAlign: 'center' }}>{lowStockPage}</Typography>
                    <IconButton size="small" disabled={!lowStockHasMore || lowStockLoading} onClick={handleNextLowStock} sx={{ color: '#FF5252' }}>
                      <ChevronRightIcon />
                    </IconButton>
                  </Box>
                </>
              ) : (
                <Box sx={{ py: 4, textAlign: 'center' }}>
                  <Typography color="text.secondary">Todo al día</Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6, lg: 4 }}>
          <Card sx={{ borderRadius: '24px', border: '1px solid rgba(255,255,255,0.05)', height: '100%' }}>
            <CardContent sx={{ p: 4 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <CalendarIcon sx={{ color: '#FF5252' }} />
                  <Typography variant="h6" sx={{ fontWeight: 800 }}>
                    Próx. a Vencer
                  </Typography>
                </Box>
                <Select
                  size="small"
                  value={userProfile?.expirationAlertThreshold || 2}
                  onChange={(e) => handleUpdateThreshold(e.target.value)}
                  sx={{
                    height: 32,
                    fontSize: '0.7rem',
                    bgcolor: 'rgba(255,255,255,0.03)',
                    borderRadius: '8px',
                    '& .MuiSelect-select': { py: 0.5 }
                  }}
                >
                  {[1, 2, 3, 4, 6, 12].map(m => (
                    <MenuItem key={m} value={m} sx={{ fontSize: '0.8rem' }}>{m} {m === 1 ? 'mes' : 'meses'}</MenuItem>
                  ))}
                </Select>
              </Box>
              {loading || expiringLoading ? (
                <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
                  <CircularProgress size={30} sx={{ color: '#FF5252' }} />
                </Box>
              ) : expiringError ? (
                <RenderError error={expiringError} onRetry={() => loadExpiring(1, null)} />
              ) : expiringProducts.length > 0 ? (
                <>
                  <TableContainer sx={{ minHeight: 280, overflowX: 'hidden' }}>
                    <Table size="small" sx={{ tableLayout: 'fixed', width: '100%' }}>
                      <TableBody>
                        {expiringProducts.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell sx={{ p: 0, py: 1, overflow: 'hidden', verticalAlign: 'top' }}>
                              <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                                {p.nombre}
                              </Typography>
                              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', wordBreak: 'break-word' }}>
                                {p.sku ? `SKU: ${p.sku} | ` : ''}Vence: {formatDate(p.fechaVencimiento).split(',')[0]}
                              </Typography>
                            </TableCell>
                            <TableCell align="right" sx={{ p: 0, width: 88, whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                              <Chip
                                label={`${p.stock} unid.`}
                                size="small"
                                sx={{ bgcolor: 'rgba(255,82,82,0.1)', color: '#FF5252', fontWeight: 700 }}
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                  <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', mt: 2, gap: 2 }}>
                    <IconButton size="small" disabled={expiringPage === 1 || expiringLoading} onClick={handlePrevExpiring} sx={{ color: '#FF5252' }}>
                      <ChevronLeftIcon />
                    </IconButton>
                    <Typography variant="caption" sx={{ fontWeight: 700, minWidth: 40, textAlign: 'center' }}>{expiringPage}</Typography>
                    <IconButton size="small" disabled={!expiringHasMore || expiringLoading} onClick={handleNextExpiring} sx={{ color: '#FF5252' }}>
                      <ChevronRightIcon />
                    </IconButton>
                  </Box>
                </>
              ) : (
                <Box sx={{ py: 4, textAlign: 'center' }}>
                  <Typography color="text.secondary">Sin vencimientos próximos</Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6, lg: 4 }}>
          <Card sx={{ borderRadius: '24px', border: '1px solid rgba(255,255,255,0.05)', height: '100%' }}>
            <CardContent sx={{ p: 4 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
                <WarningIcon sx={{ color: '#FF5252' }} />
                <Typography variant="h6" sx={{ fontWeight: 800 }}>
                  Vencidos
                </Typography>
              </Box>
              {loading || expiredLoading ? (
                <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
                  <CircularProgress size={30} sx={{ color: '#FF5252' }} />
                </Box>
              ) : expiredError ? (
                <RenderError error={expiredError} onRetry={() => loadExpired(1, null)} />
              ) : expiredProducts.length > 0 ? (
                <>
                  <TableContainer sx={{ minHeight: 280, overflowX: 'hidden' }}>
                    <Table size="small" sx={{ tableLayout: 'fixed', width: '100%' }}>
                      <TableBody>
                        {expiredProducts.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell sx={{ p: 0, py: 1, overflow: 'hidden', verticalAlign: 'top' }}>
                              <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                                {p.nombre}
                              </Typography>
                              <Typography variant="caption" sx={{ color: '#FF5252', fontWeight: 600, display: 'block', wordBreak: 'break-word' }}>
                                {p.sku ? `SKU: ${p.sku} | ` : ''}Venció: {formatDate(p.fechaVencimiento).split(',')[0]}
                              </Typography>
                            </TableCell>
                            <TableCell align="right" sx={{ p: 0, width: 48, whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                              <Typography variant="body2" sx={{ color: '#FF5252', fontWeight: 800 }}>{p.stock}</Typography>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                  <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', mt: 2, gap: 2 }}>
                    <IconButton size="small" disabled={expiredPage === 1 || expiredLoading} onClick={handlePrevExpired} sx={{ color: '#FF5252' }}>
                      <ChevronLeftIcon />
                    </IconButton>
                    <Typography variant="caption" sx={{ fontWeight: 700, minWidth: 40, textAlign: 'center' }}>{expiredPage}</Typography>
                    <IconButton size="small" disabled={!expiredHasMore || expiredLoading} onClick={handleNextExpired} sx={{ color: '#FF5252' }}>
                      <ChevronRightIcon />
                    </IconButton>
                  </Box>
                </>
              ) : (
                <Box sx={{ py: 4, textAlign: 'center' }}>
                  <Typography color="text.secondary">Excelente, nada vencido</Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
