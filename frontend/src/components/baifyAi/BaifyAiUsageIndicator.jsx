import React, { useEffect, useState } from 'react';
import { Box, CircularProgress, IconButton, LinearProgress, Popover, Tooltip, Typography } from '@mui/material';
import { InfoOutlined as InfoIcon } from '@mui/icons-material';
import { useBaifyAiTokens } from './baifyAiTokens';

const formatNumber = (value) => new Intl.NumberFormat('es-VE').format(Math.round(value || 0));
const formatPercent = (value) => `${(value ?? 0).toLocaleString('es-VE', { maximumFractionDigits: 1 })} %`;

function formatResetDate(isoDay) {
  if (!isoDay) return '';
  const [year, month, day] = isoDay.split('-');
  return `${day}/${month}/${year}`;
}

/**
 * Ícono discreto del consumo mensual de tokens (solo planes con cupo, p. ej. Diamante).
 * Un anillo muestra el % de fondo; al hacer clic se abre el detalle.
 * El panel del chat se oculta sin desmontarse al minimizar, así que `visible` cierra el detalle.
 * @param {{ visible?: boolean, usage: { limited: boolean, used: number, limit: number, remaining: number, percent: number, exhausted: boolean, resetsOn: string } | null }} props
 */
export default function BaifyAiUsageIndicator({ usage, visible = true }) {
  const t = useBaifyAiTokens();
  const [anchorEl, setAnchorEl] = useState(null);

  useEffect(() => {
    if (!visible) setAnchorEl(null);
  }, [visible]);
  if (!usage?.limited) return null;

  const percent = Math.min(100, usage.percent ?? 0);
  const level = usage.exhausted || percent >= 100 ? 'exhausted' : percent >= 80 ? 'warning' : 'normal';
  const levelColor = { normal: t.accent, warning: '#F59E0B', exhausted: '#EF4444' }[level];
  // En uso normal el ícono se funde con los demás botones; solo destaca cerca del límite.
  const iconColor = level === 'normal' ? t.textSecondary : levelColor;
  const open = visible && Boolean(anchorEl);

  return (
    <>
      <Tooltip
        title={open || !visible ? '' : `Uso mensual de BayFi AI: ${formatPercent(percent)}`}
        disableFocusListener
        disableTouchListener
      >
        <IconButton
          size="small"
          onClick={(event) => setAnchorEl(event.currentTarget)}
          aria-label={`Uso mensual de BayFi AI: ${formatPercent(percent)}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          sx={{ color: iconColor, position: 'relative', '&:hover': { color: level === 'normal' ? t.textPrimary : iconColor } }}
        >
          <CircularProgress
            variant="determinate"
            value={Math.max(percent, 2)}
            size={24}
            thickness={3}
            sx={{
              position: 'absolute',
              color: level === 'normal' ? `${t.accent}99` : levelColor,
              '& .MuiCircularProgress-circle': { strokeLinecap: 'round' },
            }}
          />
          <InfoIcon sx={{ fontSize: 15 }} />
        </IconButton>
      </Tooltip>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        disableRestoreFocus
        // El chat flotante vive en zIndex.modal + 1; el detalle debe quedar por encima.
        sx={{ zIndex: (theme) => theme.zIndex.modal + 2 }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            sx: {
              mt: 0.75,
              p: 1.75,
              width: 260,
              borderRadius: 2,
              bgcolor: t.panel,
              border: `1px solid ${t.border}`,
              boxShadow: t.panelShadow,
            },
          },
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 0.75 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: t.textPrimary }}>
            Uso mensual de BayFi AI
          </Typography>
          <Typography variant="caption" sx={{ fontWeight: 700, color: levelColor }}>
            {formatPercent(percent)}
          </Typography>
        </Box>

        <LinearProgress
          variant="determinate"
          value={percent}
          sx={{
            height: 6,
            borderRadius: 3,
            bgcolor: t.surface,
            '& .MuiLinearProgress-bar': { bgcolor: levelColor, borderRadius: 3 },
          }}
        />

        <Typography variant="body2" sx={{ color: t.textPrimary, mt: 1, fontSize: '0.8rem' }}>
          <strong>{formatNumber(usage.used)}</strong> de {formatNumber(usage.limit)} tokens
        </Typography>
        <Typography variant="caption" component="div" sx={{ color: t.textSecondary }}>
          {usage.exhausted
            ? `Cupo agotado · se renueva el ${formatResetDate(usage.resetsOn)}`
            : `Quedan ${formatNumber(usage.remaining)} · se renueva el ${formatResetDate(usage.resetsOn)}`}
        </Typography>

        <Typography variant="caption" component="p" sx={{ color: t.textSecondary, mt: 1, mb: 0, lineHeight: 1.4 }}>
          El cupo es compartido por todos los usuarios de tu empresa. Solo cuentan los tokens que la IA procesa en
          cada respuesta.
        </Typography>
      </Popover>
    </>
  );
}
