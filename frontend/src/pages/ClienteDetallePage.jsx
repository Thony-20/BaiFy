import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  Grid,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  useTheme,
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  CalendarMonth as CalendarIcon,
  Description as DescriptionIcon,
  GroupsOutlined as PurchasesIcon,
  Inventory2Outlined as ProductIcon,
  PaymentsOutlined as PaymentIcon,
  ReceiptLongOutlined as TicketIcon,
  ShoppingBagOutlined as ShoppingIcon,
  ShowChart as ChartIcon,
  TrendingUp as SpendingIcon,
} from '@mui/icons-material';
import {
  MonthlySpendingChart,
  buildMonthlySpendingFromPurchases,
} from '../components/clients/ClientAnalyticsCharts';
import {
  ClientIconCircle,
  ClientKpiCard,
  ClientSection,
  ClientStateMessage,
  ClientStatusChip,
} from '../components/clients/ClientVisualPrimitives';
import { CLIENT_COLORS } from '../components/clients/clientVisualTokens';
import { getClientAnalytics } from '../services/clientService';
import useAuthStore from '../store/useAuthStore';
import { formatUsd } from '../utils/accountMoney';

const PAYMENT_METHOD_LABELS = {
  cashBs: 'Efectivo Bs.',
  cashUsd: 'Efectivo USD',
  mobile: 'Pago móvil',
  puntoVenta: 'Punto de venta',
  biopago: 'Biopago',
  transfer: 'Transferencia',
  prestamo: 'Préstamo',
};

function formatDate(value, options = {}) {
  if (!value) return 'Sin datos';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin datos';
  return date.toLocaleDateString('es-VE', options);
}

function getPaymentMethodLabel(value) {
  if (!value) return 'Sin datos';
  return PAYMENT_METHOD_LABELS[value] || String(value);
}

const PURCHASE_PAGE_SIZE = 5;

function getComprobanteLabel(purchase) {
  return purchase.ventaId || purchase.id || '—';
}

function getPurchaseId(purchase) {
  return getComprobanteLabel(purchase);
}

function getPurchaseDate(purchase) {
  return purchase.fechaVenta || purchase.createdAt;
}

function TopProducts({ products }) {
  const rows = Array.isArray(products) ? products.slice(0, 3) : [];
  const maxQuantity = Math.max(...rows.map((row) => Number(row.cantidad) || 0), 1);

  if (rows.length === 0) {
    return (
      <ClientStateMessage
        title="Sin productos favoritos todavía"
        description="Los productos más comprados aparecerán cuando el cliente tenga compras registradas."
        icon={<ProductIcon sx={{ fontSize: 40, opacity: 0.45 }} />}
      />
    );
  }

  return (
    <Box sx={{ p: 2, display: 'grid', gap: 1.25 }}>
      {rows.map((product, index) => {
        const quantity = Number(product.cantidad) || 0;
        return (
          <Box
            key={`${product.productId || product.nombre}-${index}`}
            sx={{
              display: 'grid',
              gridTemplateColumns: '42px minmax(0, 1fr) auto',
              alignItems: 'center',
              gap: 1.5,
              p: 1.5,
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: '12px',
            }}
          >
            <ClientIconCircle
              size={38}
              background={index === 0 ? 'rgba(253, 166, 60, 0.14)' : undefined}
              color={index === 0 ? CLIENT_COLORS.warning : undefined}
            >
              <Typography fontWeight={900}>#{index + 1}</Typography>
            </ClientIconCircle>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" fontWeight={800} noWrap>
                {product.nombre || 'Producto sin nombre'}
              </Typography>
              <LinearProgress
                variant="determinate"
                value={(quantity / maxQuantity) * 100}
                sx={{
                  mt: 0.8,
                  height: 5,
                  borderRadius: 4,
                  bgcolor: 'action.hover',
                  '& .MuiLinearProgress-bar': { borderRadius: 4 },
                }}
              />
            </Box>
            <Box sx={{ textAlign: 'right' }}>
              <Typography variant="body2" fontWeight={800}>
                {quantity} un.
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {formatUsd(product.monto)}
              </Typography>
              {product.porcentaje != null ? (
                <Typography variant="caption" color="primary" display="block" fontWeight={700}>
                  {Number(product.porcentaje).toFixed(1)}%
                </Typography>
              ) : null}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

function PreferenceInsightCard({ icon, label, value, details = [], color, empty = false }) {
  return (
    <Box
      sx={{
        p: 2,
        height: '100%',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: '14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
        background: (theme) => (
          theme.palette.mode === 'dark'
            ? `linear-gradient(145deg, ${color}14 0%, rgba(255,255,255,0.02) 55%)`
            : `linear-gradient(145deg, ${color}10 0%, #FFFFFF 55%)`
        ),
        borderLeft: `3px solid ${color}`,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
        <ClientIconCircle size={44} background={`${color}1A`} color={color}>
          {icon}
        </ClientIconCircle>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography
            variant="caption"
            color="text.secondary"
            fontWeight={700}
            sx={{ letterSpacing: 0.4, textTransform: 'uppercase' }}
          >
            {label}
          </Typography>
          <Typography
            variant="h6"
            fontWeight={800}
            sx={{
              mt: 0.35,
              lineHeight: 1.25,
              color: empty ? 'text.secondary' : 'text.primary',
            }}
          >
            {value}
          </Typography>
        </Box>
      </Box>
      {details.length > 0 ? (
        <Box
          sx={{
            display: 'grid',
            gap: 0.75,
            pt: 0.25,
            borderTop: '1px dashed',
            borderColor: 'divider',
          }}
        >
          {details.map((detail) => (
            <Box
              key={detail.label}
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 1,
              }}
            >
              <Typography variant="caption" color="text.secondary">
                {detail.label}
              </Typography>
              <Typography variant="caption" fontWeight={800} color="text.primary" textAlign="right">
                {detail.value}
              </Typography>
            </Box>
          ))}
        </Box>
      ) : null}
    </Box>
  );
}

function ValuePreferencesSummary({
  favoriteProduct,
  paymentMethod,
  paymentMethods,
  metrics,
  purchasesCount,
}) {
  const favoritePayment = paymentMethods.find(
    (entry) => getPaymentMethodLabel(entry.method) === getPaymentMethodLabel(paymentMethod)
  ) || paymentMethods[0] || null;

  const hasPurchases = purchasesCount > 0;
  const daysSinceLast = metrics.diasDesdeUltimaCompra;

  const productDetails = favoriteProduct ? [
    {
      label: 'Unidades compradas',
      value: `${Number(favoriteProduct.cantidad) || 0} un.`,
    },
    {
      label: 'Monto acumulado',
      value: formatUsd(favoriteProduct.monto),
    },
    favoriteProduct.porcentaje != null
      ? {
          label: 'Participación',
          value: `${Number(favoriteProduct.porcentaje).toFixed(1)}% del top`,
        }
      : null,
  ].filter(Boolean) : [];

  const paymentDetails = favoritePayment ? [
    favoritePayment.count != null
      ? { label: 'Veces utilizado', value: String(favoritePayment.count) }
      : null,
    favoritePayment.monto != null
      ? { label: 'Monto total', value: formatUsd(favoritePayment.monto) }
      : null,
    favoritePayment.porcentaje != null
      ? { label: 'Participación', value: `${Number(favoritePayment.porcentaje).toFixed(1)}% del gasto` }
      : null,
  ].filter(Boolean) : [];

  const recencyDetails = hasPurchases ? [
    {
      label: 'Última visita',
      value: formatDate(metrics.ultimaCompraAt, { day: '2-digit', month: 'short', year: 'numeric' }),
    },
    metrics.primeraCompraAt
      ? {
          label: 'Cliente desde',
          value: formatDate(metrics.primeraCompraAt, { day: '2-digit', month: 'short', year: 'numeric' }),
        }
      : null,
    metrics.frecuenciaCompraDias != null
      ? {
          label: 'Frecuencia habitual',
          value: `Cada ${Math.round(Number(metrics.frecuenciaCompraDias))} días`,
        }
      : null,
  ].filter(Boolean) : [];

  if (!hasPurchases) {
    return (
      <ClientStateMessage
        title="Preferencias no disponibles"
        description="Cuando el cliente registre compras, verás aquí su producto favorito, método de pago y recencia."
        icon={<PaymentIcon sx={{ fontSize: 40, opacity: 0.45 }} />}
      />
    );
  }

  return (
    <Grid container spacing={1.5} sx={{ p: 2 }}>
      <Grid size={{ xs: 12, md: 4 }}>
        <PreferenceInsightCard
          icon={<ProductIcon sx={{ fontSize: 22 }} />}
          label="Producto favorito"
          value={favoriteProduct?.nombre || 'Sin datos'}
          details={productDetails}
          color={CLIENT_COLORS.warning}
          empty={!favoriteProduct?.nombre}
        />
      </Grid>
      <Grid size={{ xs: 12, md: 4 }}>
        <PreferenceInsightCard
          icon={<PaymentIcon sx={{ fontSize: 22 }} />}
          label="Método de pago favorito"
          value={getPaymentMethodLabel(paymentMethod)}
          details={paymentDetails}
          color={CLIENT_COLORS.primary}
          empty={!paymentMethod}
        />
      </Grid>
      <Grid size={{ xs: 12, md: 4 }}>
        <PreferenceInsightCard
          icon={<CalendarIcon sx={{ fontSize: 22 }} />}
          label="Recencia de compra"
          value={daysSinceLast != null ? `Hace ${daysSinceLast} día${daysSinceLast === 1 ? '' : 's'}` : 'Sin datos'}
          details={recencyDetails}
          color={daysSinceLast != null && daysSinceLast <= 30 ? CLIENT_COLORS.success : CLIENT_COLORS.danger}
          empty={daysSinceLast == null}
        />
      </Grid>
    </Grid>
  );
}

function PurchaseHistory({ purchases }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const docIconBg = isDark ? 'rgba(59, 130, 246, 0.16)' : 'rgba(37, 99, 235, 0.08)';
  const docIconColor = isDark ? '#60A5FA' : '#2563EB';
  const [page, setPage] = useState(1);
  const rows = Array.isArray(purchases) ? purchases : [];
  const totalPages = Math.max(1, Math.ceil(rows.length / PURCHASE_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visibleRows = rows.slice(
    (currentPage - 1) * PURCHASE_PAGE_SIZE,
    currentPage * PURCHASE_PAGE_SIZE
  );

  if (rows.length === 0) {
    return (
      <ClientStateMessage
        title="Este cliente aún no tiene compras"
        description="Cuando realice su primera compra, el comprobante y sus productos aparecerán aquí."
        icon={<ShoppingIcon sx={{ fontSize: 40, opacity: 0.45 }} />}
      />
    );
  }

  return (
    <>
      <TableContainer>
        <Table size="small" sx={{ minWidth: 760 }} aria-label="Historial de compras del cliente">
          <TableHead>
            <TableRow>
              <TableCell align="center" sx={{ fontWeight: 700, color: 'text.secondary' }}>Comprobante</TableCell>
              <TableCell align="center" sx={{ fontWeight: 700, color: 'text.secondary' }}>Fecha</TableCell>
              <TableCell align="center" sx={{ fontWeight: 700, color: 'text.secondary' }}>Productos</TableCell>
              <TableCell align="center" sx={{ fontWeight: 700, color: 'text.secondary' }}>Método de pago</TableCell>
              <TableCell align="center" sx={{ fontWeight: 700, color: 'text.secondary' }}>Total</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {visibleRows.map((purchase, index) => {
              const items = Array.isArray(purchase.items) ? purchase.items : [];
              const methods = Array.isArray(purchase.metodosPago) ? purchase.metodosPago : [];
              return (
                <TableRow key={`${getPurchaseId(purchase)}-${index}`} hover>
                  <TableCell align="center" sx={{ py: 1.15 }}>
                    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.25, maxWidth: '100%' }}>
                      <ClientIconCircle size={32} background={docIconBg} color={docIconColor}>
                        <DescriptionIcon sx={{ fontSize: 16 }} />
                      </ClientIconCircle>
                      <Typography variant="body2" fontWeight={800} noWrap>
                        {getComprobanteLabel(purchase)}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell align="center">{formatDate(getPurchaseDate(purchase))}</TableCell>
                  <TableCell align="center">
                    <Typography variant="body2" noWrap sx={{ maxWidth: 260, mx: 'auto' }}>
                      {items.length > 0
                        ? items.map((item) => item.nombre || 'Producto').join(', ')
                        : 'Detalle no disponible'}
                    </Typography>
                    {items.length > 0 ? (
                      <Typography variant="caption" color="text.secondary" display="block">
                        {items.reduce((sum, item) => sum + (Number(item.cantidad) || 0), 0)} unidades
                      </Typography>
                    ) : null}
                  </TableCell>
                  <TableCell align="center">
                    {methods.length > 0
                      ? methods.map((method) => getPaymentMethodLabel(method.method || method.metodo)).join(', ')
                      : 'Sin datos'}
                  </TableCell>
                  <TableCell align="center">
                    <Typography variant="body2" fontWeight={800}>
                      {formatUsd(purchase.total)}
                    </Typography>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
      <Box
        sx={{
          px: 2,
          py: 1.5,
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '1fr auto 1fr' },
          alignItems: 'center',
          gap: 1,
          borderTop: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Typography variant="body2" color="text.secondary" textAlign={{ xs: 'center', sm: 'left' }}>
          {rows.length} comprobante{rows.length === 1 ? '' : 's'}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5 }}>
          <Button
            size="small"
            disabled={currentPage === 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            Anterior
          </Button>
          <Typography variant="body2" fontWeight={800} color="primary">
            Página {currentPage} de {totalPages}
          </Typography>
          <Button
            size="small"
            disabled={currentPage === totalPages}
            onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
          >
            Siguiente
          </Button>
        </Box>
        <Box />
      </Box>
    </>
  );
}

export default function ClienteDetallePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { userProfile } = useAuthStore();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const loadClient = async () => {
      if (!id || !userProfile?.empresaId) return;
      setLoading(true);
      setError('');
      try {
        const result = await getClientAnalytics(id, userProfile.empresaId);
        if (!cancelled) {
          setData(result);
        }
      } catch (requestError) {
        if (!cancelled) setError(requestError.message || 'No fue posible cargar el cliente');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadClient();
    return () => {
      cancelled = true;
    };
  }, [id, reloadKey, userProfile?.empresaId]);

  const client = data?.client;
  const metrics = data?.metrics || {};
  const purchases = data?.purchases || metrics.compras || [];
  const topProducts = data?.topProducts || metrics.topProducts || [];
  const monthlySpending = useMemo(() => {
    const fromApi = data?.monthlySpending || metrics.gastoMensual || [];
    if (Array.isArray(fromApi) && fromApi.length > 0) return fromApi;
    return buildMonthlySpendingFromPurchases(purchases);
  }, [data?.monthlySpending, metrics.gastoMensual, purchases]);

  if (loading) {
    return <ClientStateMessage loading />;
  }

  if (error || !client) {
    return (
      <Box>
        <Button startIcon={<BackIcon />} onClick={() => navigate('/clientes')} sx={{ mb: 2 }}>
          Volver a clientes
        </Button>
        <Alert
          severity="error"
          action={<Button color="inherit" size="small" onClick={() => setReloadKey((value) => value + 1)}>Reintentar</Button>}
        >
          {error || 'Cliente no encontrado'}
        </Alert>
      </Box>
    );
  }

  const purchasesCount = Number(metrics.comprasCount ?? metrics.ventasCount) || 0;
  const favoriteProduct = topProducts[0];
  const paymentMethod = metrics.metodoPagoFavorito || data?.metodoPagoFavorito;
  const paymentMethods = data?.paymentMethods || metrics.paymentMethods || [];

  return (
    <Box>
      <Button startIcon={<BackIcon />} onClick={() => navigate('/clientes')} sx={{ mb: 1.5 }}>
        Volver a clientes
      </Button>

      <Box
        sx={{
          mb: 3,
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          alignItems: { xs: 'flex-start', sm: 'center' },
          justifyContent: 'space-between',
          gap: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <ClientIconCircle size={48}>
            <Typography variant="h6" fontWeight={900}>
              {String(client.nombre || 'C').charAt(0).toUpperCase()}
            </Typography>
          </ClientIconCircle>
          <Box>
            <Typography variant="h4" fontWeight={800}>
              {client.nombre || 'Cliente sin nombre'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Documento: <strong>{client.clienteId || 'Sin documento'}</strong>
              {client.telefono ? ` · ${client.telefono}` : ''}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <ClientStatusChip status={metrics.estado || client.estado} />
          <Chip size="small" variant="outlined" label={`Registro: ${formatDate(client.createdAt)}`} />
        </Box>
      </Box>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <ClientKpiCard label="Total gastado" value={formatUsd(metrics.totalGastado)} helper="Valor histórico" color={CLIENT_COLORS.primary} icon={<SpendingIcon sx={{ fontSize: 21 }} />} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <ClientKpiCard label="Promedio mensual" value={formatUsd(metrics.gastoPromedioMensual)} helper={`${Number(metrics.meses) || 1} mes(es) analizados`} color={CLIENT_COLORS.success} icon={<ChartIcon sx={{ fontSize: 21 }} />} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <ClientKpiCard label="Cantidad de compras" value={purchasesCount.toLocaleString('es-VE')} helper={`${Number(metrics.unidadesCompradas) || 0} unidades`} color={CLIENT_COLORS.warning} icon={<PurchasesIcon sx={{ fontSize: 21 }} />} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <ClientKpiCard label="Última visita" value={formatDate(metrics.ultimaCompraAt, { day: '2-digit', month: 'short', year: 'numeric' })} helper={metrics.diasDesdeUltimaCompra != null ? `Hace ${metrics.diasDesdeUltimaCompra} días` : 'Sin compras'} color={CLIENT_COLORS.danger} icon={<CalendarIcon sx={{ fontSize: 21 }} />} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <ClientKpiCard label="Ticket promedio" value={formatUsd(metrics.ticketPromedio)} helper="Promedio por compra" color={CLIENT_COLORS.primary} icon={<TicketIcon sx={{ fontSize: 21 }} />} />
        </Grid>
      </Grid>

      {purchasesCount === 0 ? (
        <Alert severity="info" sx={{ mb: 3, borderRadius: '12px' }}>
          No se encontraron compras registradas para este cliente. Verifica que las ventas estén vinculadas a su cédula.
        </Alert>
      ) : null}

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, lg: 7 }}>
          <ClientSection title="Evolución del gasto mensual" icon={<ChartIcon sx={{ fontSize: 19, color: 'primary.main' }} />}>
            <MonthlySpendingChart
              data={monthlySpending}
              watchKey={`${client.id}-${monthlySpending.length}-${purchases.length}`}
            />
          </ClientSection>
        </Grid>
        <Grid size={{ xs: 12, lg: 5 }}>
          <ClientSection title="Productos más comprados" icon={<ProductIcon sx={{ fontSize: 19, color: 'primary.main' }} />}>
            <TopProducts products={topProducts} />
          </ClientSection>
        </Grid>
      </Grid>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12 }}>
          <ClientSection title="Resumen de valor y preferencias" icon={<PaymentIcon sx={{ fontSize: 19, color: 'primary.main' }} />}>
            <ValuePreferencesSummary
              favoriteProduct={favoriteProduct}
              paymentMethod={paymentMethod}
              paymentMethods={paymentMethods}
              metrics={metrics}
              purchasesCount={purchasesCount}
            />
          </ClientSection>
        </Grid>
      </Grid>

      <ClientSection
        title="Historial reciente de compras"
        icon={<ShoppingIcon sx={{ fontSize: 19, color: 'primary.main' }} />}
      >
        <PurchaseHistory key={client.id} purchases={purchases} />
      </ClientSection>
    </Box>
  );
}
