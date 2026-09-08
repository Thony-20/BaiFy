import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  CircularProgress,
  LinearProgress,
  Chip,
  Tooltip,
  useTheme,
} from '@mui/material';

const CATEGORY_CONFIG = {
  inventario: { label: 'Inventario', color: '#3B82F6' },
  finanzas: { label: 'Finanzas', color: '#00D9A6' },
  ventas: { label: 'Ventas', color: '#3B82F6' },
  pagos: { label: 'Pagos', color: '#00D9A6' },
  alerta: { label: 'Alerta', color: '#FF5252' },
  critico: { label: 'Crítico', color: '#FF5252' },
};

const BADGE_COLORS = {
  warning: { bg: 'rgba(255, 82, 82, 0.15)', text: '#FF5252' },
  error: { bg: 'rgba(255, 82, 82, 0.15)', text: '#FF5252' },
  success: { bg: 'rgba(0, 217, 166, 0.15)', text: '#00D9A6' },
  info: { bg: 'rgba(59, 130, 246, 0.15)', text: '#3B82F6' },
};

function MetricCard({
  title,
  value,
  subtitle,
  icon,
  color,
  bgColor,
  loading = false,
  category,
  progress,
  badge,
  extra,
  trend,
  trendTooltip,
  currencySymbol,
  isCurrency = true,
  highlightBorder = false,
  children,
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const categoryConfig = category ? CATEGORY_CONFIG[category] : null;
  const badgeColors = badge ? BADGE_COLORS[badge.severity] ?? BADGE_COLORS.info : null;

  const displayValue = value?.toString() ?? '';
  const hasEmbeddedCurrency = displayValue.startsWith('$');
  const numericDisplay = hasEmbeddedCurrency ? displayValue.substring(1) : displayValue;
  const showCurrencySymbol = isCurrency !== false && (currencySymbol || hasEmbeddedCurrency);
  const resolvedSymbol = currencySymbol ?? (hasEmbeddedCurrency ? '$' : '');
  const isBsSubtitle = typeof subtitle === 'string' && (subtitle.startsWith('≈ Bs.') || subtitle.startsWith('Bs.'));

  return (
    <Card
      sx={{
        height: '100%',
        borderRadius: '20px',
        position: 'relative',
        overflow: 'hidden',
        background: isDark ? theme.palette.background.paper : '#FFFFFF',
        border: highlightBorder
          ? `2px solid ${theme.palette.warning.main}`
          : `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
        boxShadow: isDark
          ? '0 4px 24px rgba(0, 0, 0, 0.25)'
          : '0 4px 20px rgba(0, 0, 0, 0.04)',
        transition: 'transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease',
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '3px',
          background: color,
          zIndex: 2,
        },
        '&:hover': {
          transform: 'translateY(-5px)',
          boxShadow: isDark
            ? `0 16px 48px rgba(0,0,0,0.45), 0 0 0 1px ${color}33`
            : `0 16px 40px rgba(0,0,0,0.08), 0 0 0 1px ${color}22`,
          '& .metric-watermark': {
            opacity: isDark ? 0.12 : 0.08,
            transform: 'scale(1.05) rotate(-8deg)',
          },
          '& .metric-icon-box': {
            transform: 'scale(1.08)',
            boxShadow: `0 8px 24px ${color}44`,
          },
        },
      }}
    >
      <Box
        className="metric-watermark"
        sx={{
          position: 'absolute',
          right: -16,
          bottom: -16,
          color,
          opacity: isDark ? 0.07 : 0.05,
          pointerEvents: 'none',
          transition: 'all 0.35s ease',
          transform: 'rotate(-12deg)',
          '& .MuiSvgIcon-root': { fontSize: 110 },
        }}
      >
        {icon}
      </Box>

      <CardContent
        sx={{
          p: 2.5,
          position: 'relative',
          zIndex: 1,
          '&:last-child': { pb: 2.5 },
        }}
      >
        <Box
          className="metric-icon-box"
          sx={{
            position: 'absolute',
            top: 18,
            right: 18,
            width: 40,
            height: 40,
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: bgColor,
            color,
            transition: 'all 0.35s ease',
            boxShadow: `0 4px 16px ${color}28`,
            border: `1px solid ${color}22`,
            '& .MuiSvgIcon-root': { fontSize: 22 },
          }}
        >
          {icon}
        </Box>

        {categoryConfig && (
          <Chip
            label={categoryConfig.label}
            size="small"
            sx={{
              height: 20,
              mb: 1.25,
              fontSize: '0.62rem',
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              bgcolor: isDark ? `${categoryConfig.color}22` : `${categoryConfig.color}14`,
              color: categoryConfig.color,
              border: `1px solid ${categoryConfig.color}33`,
              '& .MuiChip-label': { px: 1 },
            }}
          />
        )}

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.25, pr: 5, flexWrap: 'wrap' }}>
          <Typography
            variant="body2"
            sx={{
              fontWeight: 700,
              color: theme.palette.text.secondary,
              textTransform: 'uppercase',
              fontSize: '0.68rem',
              letterSpacing: '0.1em',
              lineHeight: 1.2,
            }}
          >
            {title}
          </Typography>

          {trend && (
            <Tooltip title={trendTooltip ?? ''} arrow placement="top" disableHoverListener={!trendTooltip}>
              <Box
                component="span"
                sx={{
                  px: 0.75,
                  py: 0.15,
                  borderRadius: '8px',
                  fontSize: '0.62rem',
                  fontWeight: 800,
                  backgroundColor: trend.isUp ? 'rgba(0, 217, 166, 0.12)' : 'rgba(255, 82, 82, 0.12)',
                  color: trend.isUp ? '#00D9A6' : '#FF5252',
                  border: `1px solid ${trend.isUp ? 'rgba(0, 217, 166, 0.25)' : 'rgba(255, 82, 82, 0.25)'}`,
                  cursor: trendTooltip ? 'help' : 'default',
                  lineHeight: 1.4,
                }}
              >
                {trend.isUp ? '↑' : '↓'} {trend.percent.toFixed(1)}%
              </Box>
            </Tooltip>
          )}
        </Box>

        {loading ? (
          <CircularProgress size={22} sx={{ color, my: 1.5 }} />
        ) : (
          <>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, mb: 1.25 }}>
              {showCurrencySymbol && (
                <Typography
                  component="span"
                  sx={{
                    fontSize: '1.1rem',
                    fontWeight: 700,
                    color: theme.palette.text.primary,
                    opacity: 0.65,
                  }}
                >
                  {resolvedSymbol}
                </Typography>
              )}
              <Typography
                variant="h4"
                sx={{
                  fontWeight: 800,
                  color: theme.palette.text.primary,
                  letterSpacing: '-0.03em',
                  fontSize: { xs: '1.65rem', sm: '1.75rem' },
                  lineHeight: 1.1,
                }}
              >
                {numericDisplay}
              </Typography>
            </Box>

            {extra && (
              <Typography
                variant="caption"
                sx={{
                  display: 'inline-block',
                  mt: 0.25,
                  mb: progress !== undefined ? 1.25 : 0.5,
                  px: 1,
                  py: 0.35,
                  borderRadius: '6px',
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  bgcolor: `${color}18`,
                  color,
                }}
              >
                {extra}
              </Typography>
            )}

            {progress !== undefined && (
              <Box sx={{ mt: 1.25, mb: badge ? 1 : 0.5 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.75 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem' }}>
                    {progress.label}
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 800, color, fontSize: '0.68rem' }}>
                    {progress.value}%
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={Math.min(Math.max(progress.value, 0), 100)}
                  sx={{
                    height: 5,
                    borderRadius: 4,
                    bgcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                    '& .MuiLinearProgress-bar': {
                      borderRadius: 4,
                      background: `linear-gradient(90deg, ${color}, ${color}AA)`,
                      transition: 'none',
                    },
                  }}
                />
              </Box>
            )}

            {badge && badgeColors && (
              <Chip
                label={badge.label}
                size="small"
                sx={{
                  mt: progress !== undefined ? 0.25 : 1,
                  mb: 0.5,
                  height: 20,
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  bgcolor: badgeColors.bg,
                  color: badgeColors.text,
                }}
              />
            )}

            {(children || subtitle) && (
              <Box
                sx={{
                  mt: 1.5,
                  pt: 1.25,
                  borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
                }}
              >
                {children ?? (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{
                      fontSize: isBsSubtitle ? '0.85rem' : '0.72rem',
                      fontWeight: isBsSubtitle ? 600 : 400,
                      lineHeight: 1.45,
                      letterSpacing: isBsSubtitle ? '-0.01em' : 'normal',
                    }}
                  >
                    {subtitle}
                  </Typography>
                )}
              </Box>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default React.memo(MetricCard);
