import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  IconButton,
  Tooltip,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  Close as CloseIcon,
  BarChart as BarChartIcon,
  AccessTime as AccessTimeIcon,
  CalendarMonth as CalendarIcon,
  Description as DescriptionIcon,
  ListAlt as ListAltIcon,
  Badge as BadgeIcon,
  Groups as GroupsIcon,
  Star as StarIcon,
  Schedule as ScheduleIcon,
  Sync as SyncIcon,
  CheckCircleOutline as CheckIcon,
  WarningAmber as WarningIcon,
  Payments as PaymentsIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  BadgeOutlined as IdCardIcon,
  InfoOutlined as InfoIcon,
  ThumbUpAltOutlined as ThumbUpIcon,
  HourglassBottom as HourglassIcon,
} from '@mui/icons-material';
import { ACCOUNT_STATE_LABELS, ACCOUNT_STATES } from '../utils/constants';
import {
  formatUsd,
  formatBsAmount,
  resolveAccountTotalBs,
  resolveAccountPendienteBs,
} from '../utils/accountMoney';
import useCurrencyStore from '../store/useCurrencyStore';
import { ClientIconCircle } from './clients/ClientVisualPrimitives';

const PAGE_SIZE = 5;

const BEHAVIOR_STYLES = {
  neutral: {
    color: '#64748B',
    titleColor: '#475569',
    bgcolor: 'rgba(100, 116, 139, 0.08)',
    borderColor: 'rgba(100, 116, 139, 0.2)',
    badgeBg: 'rgba(100, 116, 139, 0.12)',
    badgeColor: '#64748B',
    Icon: InfoIcon,
  },
  warning: {
    color: '#FF5252',
    titleColor: '#E53935',
    bgcolor: 'rgba(255, 82, 82, 0.08)',
    borderColor: 'rgba(255, 82, 82, 0.22)',
    badgeBg: 'rgba(255, 82, 82, 0.12)',
    badgeColor: '#FF5252',
    Icon: WarningIcon,
  },
  excellent: {
    color: '#00D9A6',
    titleColor: '#00B894',
    bgcolor: 'rgba(0, 217, 166, 0.1)',
    borderColor: 'rgba(0, 217, 166, 0.28)',
    badgeBg: 'rgba(0, 217, 166, 0.14)',
    badgeColor: '#00B894',
    Icon: StarIcon,
  },
  good: {
    color: '#3B82F6',
    titleColor: '#2563EB',
    bgcolor: 'rgba(59, 130, 246, 0.1)',
    borderColor: 'rgba(59, 130, 246, 0.24)',
    badgeBg: 'rgba(59, 130, 246, 0.14)',
    badgeColor: '#2563EB',
    Icon: ThumbUpIcon,
  },
  ok: {
    color: '#FDA63C',
    titleColor: '#E8912A',
    bgcolor: 'rgba(253, 166, 60, 0.1)',
    borderColor: 'rgba(253, 166, 60, 0.3)',
    badgeBg: 'rgba(253, 166, 60, 0.14)',
    badgeColor: '#E8912A',
    Icon: ScheduleIcon,
  },
  slow: {
    color: '#FF5252',
    titleColor: '#E53935',
    bgcolor: 'rgba(255, 82, 82, 0.08)',
    borderColor: 'rgba(255, 82, 82, 0.22)',
    badgeBg: 'rgba(255, 82, 82, 0.12)',
    badgeColor: '#FF5252',
    Icon: HourglassIcon,
  },
};

const STATE_META = {
  pendiente: {
    color: 'warning',
    icon: ScheduleIcon,
    chipSx: {
      color: '#FDA63C',
      borderColor: 'rgba(253, 166, 60, 0.45)',
      bgcolor: 'transparent',
    },
  },
  parcial: {
    color: 'info',
    icon: SyncIcon,
    chipSx: {
      color: '#3B82F6',
      borderColor: 'rgba(59, 130, 246, 0.4)',
      bgcolor: 'transparent',
    },
  },
  pagado: {
    color: 'success',
    icon: CheckIcon,
    chipSx: {
      color: '#00D9A6',
      borderColor: 'rgba(0, 217, 166, 0.4)',
      bgcolor: 'transparent',
    },
  },
  vencido: {
    color: 'error',
    icon: WarningIcon,
    chipSx: {
      color: '#FF5252',
      borderColor: 'rgba(255, 82, 82, 0.4)',
      bgcolor: 'transparent',
    },
  },
};

function formatDate(raw) {
  if (!raw) return '—';
  try {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('es-VE');
  } catch {
    return '—';
  }
}

/** Etiqueta amigable de la desviación promedio (fecha pago − fecha vencimiento). */
function formatDesviacionPago(dias) {
  if (dias == null || Number.isNaN(Number(dias))) return 'Sin datos';
  const rounded = Math.round(Number(dias));
  if (rounded === 0) return 'Mismo día';
  const abs = Math.abs(rounded);
  const unit = abs === 1 ? 'día' : 'días';
  if (rounded < 0) return `${abs} ${unit} antes`;
  return `${abs} ${unit} después`;
}

/**
 * Clasificación según desviación promedio respecto al vencimiento.
 * Negativo / 0 = excelente; 1–3 = muy bueno; 4–7 = aceptable; >7 = mejorable.
 */
function resolvePaymentBehavior({ promedioDias, muestra, vencidos }) {
  if (!muestra) {
    return {
      badge: 'Sin datos',
      title: 'Sin historial de pagos',
      message: 'Cuando haya préstamos pagados podrás ver el comportamiento crediticio.',
      tone: 'neutral',
    };
  }

  if ((vencidos || 0) > 0) {
    return {
      badge: 'Atención',
      title: 'Hay préstamos vencidos',
      message: 'Revisa los vencimientos pendientes antes de otorgar más crédito.',
      tone: 'warning',
    };
  }

  const rounded = Math.round(Number(promedioDias));
  const delayDays = Math.abs(rounded);
  const delayUnit = delayDays === 1 ? 'día' : 'días';

  if (rounded < 0) {
    return {
      badge: 'Excelente',
      title: '¡Excelente comportamiento!',
      message: 'Tus pagos suelen realizarse antes de la fecha acordada.',
      tone: 'excellent',
    };
  }

  if (rounded === 0) {
    return {
      badge: 'Excelente',
      title: '¡Excelente comportamiento!',
      message: 'El cliente suele pagar en la fecha acordada.',
      tone: 'excellent',
    };
  }

  if (rounded <= 3) {
    return {
      badge: 'Muy bueno',
      title: 'Buen comportamiento',
      message: `El cliente suele pagar con un retraso promedio de ${delayDays} ${delayUnit}.`,
      tone: 'good',
    };
  }

  if (rounded <= 7) {
    return {
      badge: 'Aceptable',
      title: 'Comportamiento aceptable',
      message: `El cliente suele pagar con un retraso promedio de ${delayDays} ${delayUnit}.`,
      tone: 'ok',
    };
  }

  return {
    badge: 'Mejorable',
    title: 'Pagos con demora',
    message: `El retraso promedio es de ${delayDays} ${delayUnit}. Considera plazos más cortos.`,
    tone: 'slow',
  };
}

function DateCell({ value }) {
  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        color: 'text.secondary',
        justifyContent: 'center',
      }}
    >
      <CalendarIcon sx={{ fontSize: 15, opacity: 0.7 }} />
      <Typography variant="body2" component="span">
        {formatDate(value)}
      </Typography>
    </Box>
  );
}

export default function ClientCreditHistoryModal({
  open,
  onClose,
  history,
  loading,
  onPayment,
  onEdit,
  onDelete,
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { getActiveRate } = useCurrencyStore();
  const activeRate = getActiveRate();
  const [page, setPage] = useState(1);

  const surfaceMuted = isDark ? 'rgba(255, 255, 255, 0.04)' : '#FAFBFC';
  const surfaceCard = isDark ? 'rgba(255, 255, 255, 0.02)' : '#ffffff';
  const iconCircleBg = isDark ? 'rgba(59, 130, 246, 0.18)' : 'rgba(59, 130, 246, 0.1)';
  const iconCircleColor = isDark ? '#60A5FA' : '#2563EB';
  const docIconBg = isDark ? 'rgba(59, 130, 246, 0.16)' : 'rgba(37, 99, 235, 0.08)';

  const resumen = history?.resumen;
  const cuentas = Array.isArray(history?.cuentas) ? history.cuentas : [];
  const totalPages = Math.max(1, Math.ceil(cuentas.length / PAGE_SIZE));

  const sessionKey = open
    ? `${history?.clienteId || ''}|${history?.totalPrestamos || 0}`
    : 'closed';
  const [trackedSession, setTrackedSession] = useState(sessionKey);
  if (sessionKey !== trackedSession) {
    setTrackedSession(sessionKey);
    if (open) setPage(1);
  }

  const currentPage = Math.min(Math.max(1, page), totalPages);
  const pageSlice = cuentas.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const hasMore = currentPage < totalPages;
  const hasActions = Boolean(onPayment || onEdit || onDelete);

  const behavior = resolvePaymentBehavior({
    promedioDias:
      resumen?.desviacionPromedioPagoDias ?? resumen?.tiempoPromedioPagoDias,
    muestra: resumen?.prestamosPagadosMuestra || 0,
    vencidos: resumen?.vencido || 0,
  });
  const behaviorStyle = BEHAVIOR_STYLES[behavior.tone] || BEHAVIOR_STYLES.neutral;
  const BehaviorIcon = behaviorStyle.Icon;
  // En dark, el título usa el color más claro del tono para mejor contraste
  const behaviorTitleColor = isDark ? behaviorStyle.color : behaviorStyle.titleColor;
  const behaviorBadgeColor = isDark ? behaviorStyle.color : behaviorStyle.badgeColor;

  const statusPills = [
    {
      key: ACCOUNT_STATES.PENDIENTE,
      label: `Pendientes: ${resumen?.pendiente || 0}`,
      ...STATE_META.pendiente,
    },
    {
      key: ACCOUNT_STATES.PARCIAL,
      label: `Parciales: ${resumen?.parcial || 0}`,
      ...STATE_META.parcial,
    },
    {
      key: ACCOUNT_STATES.PAGADO,
      label: `Pagados: ${resumen?.pagado || 0}`,
      ...STATE_META.pagado,
    },
    {
      key: ACCOUNT_STATES.VENCIDO,
      label: `Vencidos: ${resumen?.vencido || 0}`,
      ...STATE_META.vencido,
    },
  ];

  const summaryMetrics = [
    {
      label: 'Prestado',
      value: formatUsd(resumen?.montoTotalPrestado),
      color: '#3B82F6',
    },
    {
      label: 'Pendiente',
      value: formatUsd(resumen?.montoPendiente),
      color: '#FDA63C',
    },
    {
      label: 'Cobrado',
      value: formatUsd(resumen?.montoCobrado),
      color: '#00D9A6',
    },
    {
      label: 'Vencidos',
      value: String(resumen?.vencido || 0),
      color: '#FF5252',
    },
  ];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      fullScreen={isMobile}
      PaperProps={{
        sx: {
          borderRadius: isMobile ? 0 : '18px',
          overflow: 'hidden',
          boxShadow: isDark
            ? '0 24px 64px rgba(0, 0, 0, 0.45)'
            : '0 24px 64px rgba(15, 23, 42, 0.16)',
          bgcolor: 'background.paper',
          maxHeight: isMobile ? '100%' : '92vh',
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      {/* Header */}
      <Box
        sx={{
          px: { xs: 2, sm: 3 },
          pt: { xs: 2, sm: 2.5 },
          pb: 1.5,
          position: 'relative',
          flexShrink: 0,
        }}
      >
        <IconButton
          aria-label="Cerrar"
          onClick={onClose}
          size="small"
          sx={{
            position: 'absolute',
            top: 12,
            right: 12,
            color: 'text.secondary',
            zIndex: 1,
          }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>

        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            alignItems: { xs: 'stretch', md: 'flex-start' },
            justifyContent: 'space-between',
            gap: 2,
            pr: { xs: 4, md: 5 },
          }}
        >
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', minWidth: 0 }}>
            <ClientIconCircle size={44} background={iconCircleBg} color={iconCircleColor}>
              <BarChartIcon sx={{ fontSize: 22 }} />
            </ClientIconCircle>
            <Box sx={{ minWidth: 0 }}>
              <Typography
                variant="h6"
                fontWeight={800}
                sx={{ lineHeight: 1.25, letterSpacing: '-0.02em', color: 'text.primary' }}
              >
                Historial crediticio
              </Typography>
              {history?.clienteNombre ? (
                <Typography
                  variant="subtitle1"
                  fontWeight={700}
                  sx={{ color: 'text.primary', lineHeight: 1.3, mt: 1 }}
                >
                  {history.clienteNombre}
                </Typography>
              ) : null}
              {history?.exists ? (
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: 'row',
                    flexWrap: 'nowrap',
                    alignItems: 'center',
                    gap: 1.25,
                    mt: 1.25,
                    color: 'text.secondary',
                    overflow: 'hidden',
                  }}
                >
                  <Box
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 0.5,
                      flexShrink: 0,
                    }}
                  >
                    <IdCardIcon sx={{ fontSize: 15 }} />
                    <Typography variant="body2" component="span" noWrap>
                      Cédula:{' '}
                      <Box component="strong" sx={{ color: 'text.primary', fontWeight: 700 }}>
                        {history.clienteId}
                      </Box>
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      width: '1px',
                      height: 14,
                      bgcolor: 'divider',
                      flexShrink: 0,
                      alignSelf: 'center',
                    }}
                  />
                  <Box
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 0.5,
                      minWidth: 0,
                    }}
                  >
                    <GroupsIcon sx={{ fontSize: 15, flexShrink: 0 }} />
                    <Typography variant="body2" component="span" noWrap>
                      Total de préstamos:{' '}
                      <Box component="strong" sx={{ color: 'text.primary', fontWeight: 700 }}>
                        {history.totalPrestamos}
                      </Box>
                    </Typography>
                  </Box>
                </Box>
              ) : null}
            </Box>
          </Box>

          {history?.exists && !loading ? (
            <Box
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: '14px',
                px: { xs: 2, sm: 2.5 },
                py: { xs: 1.5, sm: 1.75 },
                minWidth: { md: 380 },
                width: { md: 'auto' },
                flex: { md: '1 1 380px' },
                maxWidth: { md: 460 },
                flexShrink: 0,
                bgcolor: surfaceMuted,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1.25 }}>
                <CalendarIcon sx={{ fontSize: 17, color: '#6B9BEF' }} />
                <Typography
                  variant="body2"
                  fontWeight={700}
                  color="text.secondary"
                  sx={{ fontSize: '0.8rem' }}
                >
                  Resumen general
                </Typography>
              </Box>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: {
                    xs: 'repeat(2, minmax(0, 1fr))',
                    sm: 'repeat(4, minmax(0, 1fr))',
                  },
                  gap: { xs: 1.5, sm: 2 },
                }}
              >
                {summaryMetrics.map((metric) => (
                  <Box key={metric.label} sx={{ minWidth: 0 }}>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      display="block"
                      sx={{ mb: 0.35, fontSize: '0.75rem' }}
                    >
                      {metric.label}
                    </Typography>
                    <Typography
                      variant="h6"
                      fontWeight={800}
                      sx={{ color: metric.color, lineHeight: 1.2, fontSize: '1.15rem' }}
                      noWrap
                    >
                      {metric.value}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          ) : null}
        </Box>
      </Box>

      <DialogContent
        sx={{
          px: { xs: 2, sm: 3 },
          pt: 0.5,
          pb: 1.5,
          display: 'flex',
          flexDirection: 'column',
          gap: 1.75,
          flex: '1 1 auto',
          minHeight: 0,
          overflowY: 'auto',
        }}
      >
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress size={36} />
          </Box>
        ) : !history?.exists ? (
          <Typography color="text.secondary" sx={{ py: 5, textAlign: 'center' }}>
            No hay préstamos registrados para esta cédula.
          </Typography>
        ) : (
          <>
            {/* Comportamiento de pago */}
            <Box
              sx={{
                display: 'flex',
                flexDirection: { xs: 'column', sm: 'row' },
                alignItems: { xs: 'stretch', sm: 'center' },
                justifyContent: 'space-between',
                gap: 1.5,
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: '14px',
                px: { xs: 1.5, sm: 2 },
                py: 1.25,
                bgcolor: surfaceMuted,
                flexShrink: 0,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
                <ClientIconCircle size={42} background={iconCircleBg} color={iconCircleColor}>
                  <AccessTimeIcon sx={{ fontSize: 22 }} />
                </ClientIconCircle>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="caption" color="text.secondary" display="block">
                    Comportamiento de pago
                  </Typography>
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 1,
                      mt: 0.15,
                    }}
                  >
                    <Typography
                      variant="h6"
                      fontWeight={800}
                      sx={{ color: 'text.primary', lineHeight: 1.2 }}
                    >
                      {formatDesviacionPago(
                        resumen?.desviacionPromedioPagoDias ?? resumen?.tiempoPromedioPagoDias
                      )}
                    </Typography>
                    <Chip
                      size="small"
                      label={behavior.badge}
                      sx={{
                        height: 22,
                        fontWeight: 700,
                        fontSize: '0.7rem',
                        bgcolor: behaviorStyle.badgeBg,
                        color: behaviorBadgeColor,
                        border: 'none',
                      }}
                    />
                  </Box>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.35 }}>
                    {resumen?.prestamosPagadosMuestra > 0
                      ? `Promedio basado en ${resumen.prestamosPagadosMuestra} préstamo${
                          resumen.prestamosPagadosMuestra === 1 ? '' : 's'
                        } pagado${resumen.prestamosPagadosMuestra === 1 ? '' : 's'}`
                      : 'Aún no hay préstamos pagados con fecha de cierre'}
                  </Typography>
                </Box>
              </Box>

              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.75,
                  px: 1.5,
                  py: 1.25,
                  borderRadius: '12px',
                  bgcolor: behaviorStyle.bgcolor,
                  border: '1px solid',
                  borderColor: behaviorStyle.borderColor,
                  maxWidth: { sm: 400 },
                  minWidth: { sm: 340 },
                  flex: { sm: '0 1 400px' },
                  flexShrink: 0,
                }}
              >
                <BehaviorIcon
                  sx={{
                    fontSize: 24,
                    flexShrink: 0,
                    color: behaviorStyle.color,
                  }}
                />
                <Box sx={{ pl: 0.5 }}>
                  <Typography
                    variant="body2"
                    fontWeight={800}
                    sx={{
                      color: behaviorTitleColor,
                      lineHeight: 1.25,
                    }}
                  >
                    {behavior.title}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.25 }}>
                    {behavior.message}
                  </Typography>
                </Box>
              </Box>
            </Box>

            {/* Estados */}
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {statusPills.map((pill) => {
                const PillIcon = pill.icon;
                return (
                  <Chip
                    key={pill.key}
                    size="small"
                    variant="outlined"
                    icon={<PillIcon sx={{ fontSize: '16px !important' }} />}
                    label={pill.label}
                    sx={{
                      height: 28,
                      fontWeight: 600,
                      borderRadius: '999px',
                      ...pill.chipSx,
                      '& .MuiChip-icon': { color: 'inherit', ml: 0.75 },
                    }}
                  />
                );
              })}
            </Box>

            {/* Tabla */}
            <Box
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: '14px',
                overflow: 'hidden',
                bgcolor: surfaceCard,
                flexShrink: 0,
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  px: 2,
                  py: 1.35,
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  bgcolor: surfaceMuted,
                }}
              >
                <ListAltIcon sx={{ fontSize: 18, color: iconCircleColor }} />
                <Typography variant="subtitle2" fontWeight={800} sx={{ color: 'text.primary' }}>
                  Historial de préstamos
                </Typography>
              </Box>

              <TableContainer sx={{ overflowX: 'auto', overflowY: 'visible' }}>
                <Table size="small" sx={{ minWidth: hasActions ? 780 : 680 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700, color: 'text.secondary', py: 1.25 }}>
                        Comprobante
                      </TableCell>
                      <TableCell align="center" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                        Total
                      </TableCell>
                      <TableCell align="center" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                        Pendiente
                      </TableCell>
                      <TableCell align="center" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                        Emisión
                      </TableCell>
                      <TableCell align="center" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                        Vencimiento
                      </TableCell>
                      <TableCell align="center" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                        Estado
                      </TableCell>
                      {hasActions ? (
                        <TableCell align="center" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                          Acciones
                        </TableCell>
                      ) : null}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {pageSlice.map((cuenta) => {
                      const totalBs = formatBsAmount(
                        resolveAccountTotalBs(cuenta, activeRate)
                      );
                      const pendienteBs = formatBsAmount(
                        resolveAccountPendienteBs(cuenta, activeRate)
                      );
                      const stateMeta = STATE_META[cuenta.estado] || STATE_META.pendiente;
                      const StateIcon = stateMeta.icon;
                      const canPay =
                        cuenta.estado !== ACCOUNT_STATES.PAGADO
                        && Number(cuenta.montoPendiente) > 0;

                      return (
                        <TableRow
                          key={cuenta.id}
                          hover
                          sx={{
                            '&:last-child td': { borderBottom: 0 },
                            bgcolor:
                              cuenta.estado === ACCOUNT_STATES.VENCIDO
                                ? isDark
                                  ? 'rgba(255, 82, 82, 0.08)'
                                  : 'rgba(220, 38, 38, 0.03)'
                                : 'transparent',
                          }}
                        >
                          <TableCell sx={{ py: 1.15 }}>
                            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25 }}>
                              <ClientIconCircle size={32} background={docIconBg} color={iconCircleColor}>
                                <DescriptionIcon sx={{ fontSize: 16 }} />
                              </ClientIconCircle>
                              <Box sx={{ minWidth: 0 }}>
                                <Typography variant="body2" fontWeight={700} noWrap>
                                  {cuenta.ventaId || '—'}
                                </Typography>
                                {cuenta.observaciones ? (
                                  <Typography
                                    variant="caption"
                                    color="text.secondary"
                                    display="block"
                                    noWrap
                                    sx={{ maxWidth: 220 }}
                                  >
                                    {cuenta.observaciones}
                                  </Typography>
                                ) : null}
                              </Box>
                            </Box>
                          </TableCell>
                          <TableCell align="center">
                            <Typography variant="body2" fontWeight={700}>
                              {formatUsd(cuenta.montoTotal)}
                            </Typography>
                            {totalBs ? (
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                display="block"
                                fontWeight={600}
                              >
                                {totalBs}
                              </Typography>
                            ) : null}
                          </TableCell>
                          <TableCell align="center">
                            <Typography
                              variant="body2"
                              fontWeight={700}
                              color={cuenta.montoPendiente > 0 ? 'warning.main' : 'success.main'}
                            >
                              {formatUsd(cuenta.montoPendiente)}
                            </Typography>
                            {pendienteBs ? (
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                display="block"
                                fontWeight={600}
                              >
                                {pendienteBs}
                              </Typography>
                            ) : null}
                          </TableCell>
                          <TableCell align="center">
                            <DateCell value={cuenta.fechaEmision} />
                          </TableCell>
                          <TableCell align="center">
                            <DateCell value={cuenta.fechaVencimiento} />
                          </TableCell>
                          <TableCell align="center">
                            <Chip
                              size="small"
                              variant="outlined"
                              icon={<StateIcon sx={{ fontSize: '15px !important' }} />}
                              label={ACCOUNT_STATE_LABELS[cuenta.estado] || cuenta.estado}
                              sx={{
                                height: 26,
                                fontWeight: 700,
                                borderRadius: '999px',
                                ...stateMeta.chipSx,
                                '& .MuiChip-icon': { color: 'inherit', ml: 0.6 },
                              }}
                            />
                          </TableCell>
                          {hasActions ? (
                            <TableCell align="center">
                              <Box
                                sx={{
                                  display: 'flex',
                                  justifyContent: 'center',
                                  alignItems: 'center',
                                  gap: 0.25,
                                }}
                              >
                                {onPayment ? (
                                  <Tooltip title="Registrar cobro">
                                    <span>
                                      <IconButton
                                        size="small"
                                        color="primary"
                                        disabled={!canPay}
                                        onClick={() => onPayment(cuenta)}
                                        aria-label="Registrar cobro"
                                      >
                                        <PaymentsIcon fontSize="small" />
                                      </IconButton>
                                    </span>
                                  </Tooltip>
                                ) : null}
                                {onEdit ? (
                                  <Tooltip title="Editar">
                                    <IconButton
                                      size="small"
                                      onClick={() => onEdit(cuenta)}
                                      aria-label="Editar préstamo"
                                    >
                                      <EditIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                ) : null}
                                {onDelete ? (
                                  <Tooltip title="Eliminar">
                                    <IconButton
                                      size="small"
                                      color="error"
                                      onClick={() => onDelete(cuenta)}
                                      aria-label="Eliminar préstamo"
                                    >
                                      <DeleteIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                ) : null}
                              </Box>
                            </TableCell>
                          ) : null}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          </>
        )}
      </DialogContent>

      <DialogActions
        sx={{
          px: { xs: 2, sm: 3 },
          py: 1.75,
          borderTop: '1px solid',
          borderColor: 'divider',
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '1fr auto 1fr' },
          alignItems: 'center',
          gap: 1.5,
          flexShrink: 0,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            color: 'text.secondary',
            justifyContent: { xs: 'center', sm: 'flex-start' },
          }}
        >
          <BadgeIcon sx={{ fontSize: 16, opacity: 0.7 }} />
          <Typography variant="body2">
            {history?.exists && !loading
              ? `Mostrando ${
                  cuentas.length === 0
                    ? '0'
                    : `${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(
                        currentPage * PAGE_SIZE,
                        cuentas.length
                      )}`
                } de ${cuentas.length} préstamo${cuentas.length === 1 ? '' : 's'}`
              : '—'}
          </Typography>
        </Box>

        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
            minHeight: 32,
          }}
        >
          {history?.exists && !loading && totalPages > 1 ? (
            <>
              <Button
                size="small"
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, Math.min(p, totalPages) - 1))}
                sx={{
                  color: theme.palette.text.secondary,
                  minWidth: 100,
                  '&:disabled': { opacity: 0.3 },
                }}
              >
                Anterior
              </Button>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 700,
                  minWidth: 100,
                  textAlign: 'center',
                  color: theme.palette.primary.light,
                }}
              >
                Página {currentPage}
              </Typography>
              <Button
                size="small"
                disabled={!hasMore}
                onClick={() => setPage((p) => Math.min(totalPages, Math.max(1, p) + 1))}
                sx={{
                  color: '#3B82F6',
                  fontWeight: 800,
                  minWidth: 100,
                  '&:disabled': { opacity: 0.3 },
                }}
              >
                Siguiente
              </Button>
            </>
          ) : null}
        </Box>

        <Box
          sx={{
            display: 'flex',
            justifyContent: { xs: 'center', sm: 'flex-end' },
          }}
        >
          <Button
            onClick={onClose}
            variant="contained"
            sx={{
              borderRadius: '12px',
              px: 3,
              py: 1,
              fontWeight: 700,
              textTransform: 'none',
              bgcolor: 'primary.main',
              boxShadow: isDark
                ? '0 8px 18px rgba(59, 130, 246, 0.22)'
                : '0 8px 18px rgba(37, 99, 235, 0.28)',
              '&:hover': { bgcolor: 'primary.dark' },
            }}
          >
            Cerrar
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
}
