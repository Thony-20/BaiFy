import React from 'react';
import {
  Box,
  Chip,
  CircularProgress,
  Paper,
  Typography,
  useTheme,
} from '@mui/material';
import {
  CheckCircleOutline as ActiveIcon,
  HourglassEmpty as NewIcon,
  PersonOffOutlined as InactiveIcon,
} from '@mui/icons-material';
import { CLIENT_COLORS, getClientSurfaces } from './clientVisualTokens';

const STATUS_META = {
  activo: {
    label: 'Activo',
    color: CLIENT_COLORS.success,
    background: 'rgba(0, 217, 166, 0.12)',
    Icon: ActiveIcon,
  },
  inactivo: {
    label: 'Inactivo',
    color: CLIENT_COLORS.danger,
    background: 'rgba(255, 82, 82, 0.1)',
    Icon: InactiveIcon,
  },
  nuevo: {
    label: 'Nuevo',
    color: CLIENT_COLORS.primary,
    background: 'rgba(59, 130, 246, 0.12)',
    Icon: NewIcon,
  },
};

export function ClientIconCircle({
  children,
  size = 40,
  background,
  color,
}) {
  const theme = useTheme();
  const surfaces = getClientSurfaces(theme);

  return (
    <Box
      sx={{
        width: size,
        height: size,
        borderRadius: '50%',
        bgcolor: background || surfaces.iconBackground,
        color: color || surfaces.iconColor,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {children}
    </Box>
  );
}

export function ClientStatusChip({ status }) {
  const meta = STATUS_META[status] || STATUS_META.nuevo;
  const StatusIcon = meta.Icon;

  return (
    <Chip
      size="small"
      icon={<StatusIcon sx={{ fontSize: '15px !important' }} />}
      label={meta.label}
      sx={{
        height: 27,
        borderRadius: '999px',
        bgcolor: meta.background,
        color: meta.color,
        fontWeight: 700,
        '& .MuiChip-icon': { color: 'inherit', ml: 0.6 },
      }}
    />
  );
}

export function ClientSection({
  title,
  icon,
  action,
  children,
  sx = {},
}) {
  const theme = useTheme();
  const surfaces = getClientSurfaces(theme);

  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: '14px',
        overflow: 'hidden',
        bgcolor: surfaces.card,
        ...sx,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
          px: 2,
          py: 1.4,
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: surfaces.muted,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {icon}
          <Typography variant="subtitle2" fontWeight={800}>
            {title}
          </Typography>
        </Box>
        {action}
      </Box>
      {children}
    </Paper>
  );
}

export function ClientKpiCard({ label, value, helper, icon, color, detail }) {
  const theme = useTheme();
  const surfaces = getClientSurfaces(theme);
  const isDark = theme.palette.mode === 'dark';

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        height: '100%',
        borderRadius: '14px',
        border: '1px solid',
        borderColor: 'divider',
        borderLeft: `3px solid ${color}`,
        background: isDark
          ? `linear-gradient(145deg, ${color}14 0%, rgba(255,255,255,0.02) 60%)`
          : `linear-gradient(145deg, ${color}10 0%, ${surfaces.card} 60%)`,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.25,
        transition: 'transform 0.18s ease, box-shadow 0.18s ease',
        '&:hover': {
          transform: 'translateY(-1px)',
          boxShadow: isDark
            ? `0 10px 24px ${color}18`
            : `0 10px 24px ${color}14`,
        },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
        <ClientIconCircle
          size={44}
          background={`${color}1A`}
          color={color}
        >
          {icon}
        </ClientIconCircle>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography
            variant="caption"
            color="text.secondary"
            fontWeight={700}
            display="block"
            sx={{ letterSpacing: 0.4, textTransform: 'uppercase' }}
          >
            {label}
          </Typography>
          <Typography
            variant="h5"
            fontWeight={800}
            noWrap
            sx={{ color: color || 'text.primary', lineHeight: 1.2, mt: 0.35 }}
          >
            {value}
          </Typography>
        </Box>
      </Box>
      {helper || detail ? (
        <Box
          sx={{
            pt: 0.35,
            borderTop: '1px dashed',
            borderColor: 'divider',
            display: 'grid',
            gap: 0.35,
          }}
        >
          {helper ? (
            <Typography variant="caption" color="text.secondary" display="block">
              {helper}
            </Typography>
          ) : null}
          {detail ? (
            <Typography variant="caption" fontWeight={700} sx={{ color }}>
              {detail}
            </Typography>
          ) : null}
        </Box>
      ) : null}
    </Paper>
  );
}

export function ClientStateMessage({
  title,
  description,
  icon,
  loading = false,
}) {
  return (
    <Box
      sx={{
        minHeight: 220,
        px: 3,
        py: 6,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        color: 'text.secondary',
      }}
    >
      {loading ? <CircularProgress size={34} /> : icon}
      {!loading ? (
        <>
          <Typography variant="subtitle1" fontWeight={800} color="text.primary" sx={{ mt: 1.5 }}>
            {title}
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5, maxWidth: 440 }}>
            {description}
          </Typography>
        </>
      ) : (
        <Typography variant="body2" sx={{ mt: 2 }}>
          Cargando información de clientes…
        </Typography>
      )}
    </Box>
  );
}
