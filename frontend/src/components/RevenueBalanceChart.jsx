import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  useTheme,
  alpha
} from '@mui/material';
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area
} from 'recharts';
import ChartReadyContainer from './ChartReadyContainer';

const CustomTooltip = ({ active, payload, theme }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const isDark = theme.palette.mode === 'dark';
    const historicalRate = Number(data.exchangeRate);
    const rate = historicalRate > 0
      ? historicalRate
      : (data.revenue > 0 ? (data.revenueBs / data.revenue) : 0);

    return (
      <Box sx={{
        backgroundColor: isDark ? 'rgba(26, 28, 30, 0.95)' : 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(10px)',
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: '16px',
        p: 2.5,
        boxShadow: '0 12px 40px rgba(0,0,0,0.3)',
        minWidth: '220px'
      }}>
        <Typography variant="caption" sx={{ color: theme.palette.text.secondary, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', mb: 1.5 }}>
          {data.dateLabel || data.date}
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="body2" sx={{ color: theme.palette.text.secondary, fontWeight: 600 }}>Monto:</Typography>
            <Typography variant="body1" sx={{ fontWeight: 900, color: theme.palette.text.primary }}>
              Bs. {data.revenueBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="body2" sx={{ color: theme.palette.text.secondary, fontWeight: 600 }}>Ventas:</Typography>
            <Typography variant="body2" sx={{ fontWeight: 900, color: '#FF5252' }}>
              {data.orders || 0} tks.
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="caption" sx={{ color: theme.palette.text.secondary, fontWeight: 600 }}>Productos:</Typography>
            <Typography variant="caption" sx={{ fontWeight: 800, color: '#3B82F6' }}>
              {data.units || 0} und.
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: `1px solid ${alpha(theme.palette.divider, 0.5)}`, pt: 1 }}>
            <Typography variant="caption" sx={{ color: theme.palette.text.secondary, fontWeight: 600 }}>Tasa BCV del día:</Typography>
            <Typography variant="caption" sx={{ fontWeight: 800, color: theme.palette.primary.main }}>
              {rate > 0 ? rate.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'N/A'}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="caption" sx={{ color: theme.palette.text.secondary, fontWeight: 600 }}>Monto $:</Typography>
            <Typography variant="caption" sx={{ fontWeight: 800, color: '#00D9A6' }}>
              $ {data.revenue.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Typography>
          </Box>
        </Box>
      </Box>
    );
  }
  return null;
};

const RevenueBalanceChart = ({ 
  data, 
  totalRevenue = 0, 
  totalUnits = 0, 
  totalOrders = 0,
  trend = { percent: 0, isUp: true }, 
  trendUnits = { percent: 0, isUp: true },
  trendOrders = { percent: 0, isUp: true },
  selectedMetric = 'revenue',
  onMetricChange,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const metricConfigs = {
    revenue: {
      label: 'Ingreso por ventas',
      key: 'revenueBs',
      color: '#00D9A6',
      gradient: 'revenueGradient',
      format: (val) => `Bs. ${val >= 1000 ? (val / 1000).toFixed(1) + 'k' : val.toLocaleString('es-VE')}`,
      tooltipLabel: 'Monto:',
      tooltipFormat: (val) => `Bs. ${val.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    },
    units: {
      label: 'Unidades vendidas',
      key: 'units',
      color: '#3B82F6',
      gradient: 'unitsGradient',
      format: (val) => `${val >= 1000 ? (val / 1000).toFixed(1) + 'k' : val}`,
      tooltipLabel: 'Productos:',
      tooltipFormat: (val) => `${val.toLocaleString('es-VE')} und.`
    },
    orders: {
      label: 'Total de Ventas',
      key: 'orders',
      color: '#FF5252',
      gradient: 'ordersGradient',
      format: (val) => `${val}`,
      tooltipLabel: 'Tickets:',
      tooltipFormat: (val) => `${val.toLocaleString('es-VE')} tks.`
    }
  };

  const currentConfig = metricConfigs[selectedMetric] ?? metricConfigs.revenue;

  // Usar los datos históricos según la métrica seleccionada
  const chartData = React.useMemo(() => {
    return data.map(d => ({
      ...d,
      value: d[currentConfig.key] || 0,
      dateLabel: new Date(d.date + 'T00:00:00').toLocaleDateString('es-VE', { day: 'numeric', month: 'short' })
    }));
  }, [data, selectedMetric]);

  return (
    <Card sx={{
      width: '100%',
      borderRadius: '24px',
      background: isDark
        ? 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)'
        : 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
      border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
      boxShadow: isDark ? '0 20px 40px rgba(0,0,0,0.4)' : '0 10px 30px rgba(0,0,0,0.05)',
      overflow: 'hidden',
      mb: 4
    }}>
      <CardContent sx={{ p: { xs: 2, sm: 4 } }}>
        {/* Header Section — Selector de Métricas */}
        <Box sx={{ mb: 4, display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 3 }}>

          {/* Columna: Ingreso por ventas */}
          <Box 
            onClick={() => onMetricChange('revenue')}
            sx={{ 
              flex: '0 0 auto', 
              cursor: 'pointer',
              p: 2,
              borderRadius: '20px',
              transition: 'all 0.3s ease',
              backgroundColor: selectedMetric === 'revenue' ? alpha('#00D9A6', 0.1) : 'transparent',
              border: `1px solid ${selectedMetric === 'revenue' ? alpha('#00D9A6', 0.2) : 'transparent'}`,
              '&:hover': {
                backgroundColor: alpha('#00D9A6', 0.05)
              }
            }}
          >
            <Typography variant="body2" sx={{ 
              color: selectedMetric === 'revenue' ? '#00D9A6' : theme.palette.text.secondary, 
              fontWeight: 800, 
              textTransform: 'uppercase', 
              letterSpacing: '0.1em', 
              mb: 1 
            }}>
              Ingreso por ventas
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5 }}>
              <Typography variant="h3" sx={{ 
                fontWeight: 900, 
                letterSpacing: '-0.04em',
                color: selectedMetric === 'revenue' ? theme.palette.text.primary : alpha(theme.palette.text.primary, 0.4)
              }}>
                Bs. {totalRevenue.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Typography>
            </Box>
          </Box>

          {/* Separador vertical */}
          <Box sx={{ width: '1px', alignSelf: 'stretch', bgcolor: theme.palette.divider, display: { xs: 'none', sm: 'block' }, my: 2 }} />

          {/* Columna: Unidades vendidas */}
          <Box 
            onClick={() => onMetricChange('units')}
            sx={{ 
              flex: '0 0 auto', 
              cursor: 'pointer',
              p: 2,
              borderRadius: '20px',
              transition: 'all 0.3s ease',
              backgroundColor: selectedMetric === 'units' ? alpha('#3B82F6', 0.1) : 'transparent',
              border: `1px solid ${selectedMetric === 'units' ? alpha('#3B82F6', 0.2) : 'transparent'}`,
              '&:hover': {
                backgroundColor: alpha('#3B82F6', 0.05)
              }
            }}
          >
            <Typography variant="body2" sx={{ 
              color: selectedMetric === 'units' ? '#3B82F6' : theme.palette.text.secondary, 
              fontWeight: 800, 
              textTransform: 'uppercase', 
              letterSpacing: '0.1em', 
              mb: 1 
            }}>
              Unidades vendidas
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5 }}>
              <Typography variant="h3" sx={{ 
                fontWeight: 900, 
                letterSpacing: '-0.04em',
                color: selectedMetric === 'units' ? theme.palette.text.primary : alpha(theme.palette.text.primary, 0.4)
              }}>
                {totalUnits.toLocaleString('es-VE')}
              </Typography>
            </Box>
          </Box>

          {/* Separador vertical */}
          <Box sx={{ width: '1px', alignSelf: 'stretch', bgcolor: theme.palette.divider, display: { xs: 'none', md: 'block' }, my: 2 }} />

          {/* Columna: Total de Ventas */}
          <Box 
            onClick={() => onMetricChange('orders')}
            sx={{ 
              flex: '0 0 auto', 
              cursor: 'pointer',
              p: 2,
              borderRadius: '20px',
              transition: 'all 0.3s ease',
              backgroundColor: selectedMetric === 'orders' ? alpha('#FF5252', 0.1) : 'transparent',
              border: `1px solid ${selectedMetric === 'orders' ? alpha('#FF5252', 0.2) : 'transparent'}`,
              '&:hover': {
                backgroundColor: alpha('#FF5252', 0.05)
              }
            }}
          >
            <Typography variant="body2" sx={{ 
              color: selectedMetric === 'orders' ? '#FF5252' : theme.palette.text.secondary, 
              fontWeight: 800, 
              textTransform: 'uppercase', 
              letterSpacing: '0.1em', 
              mb: 1 
            }}>
              Total de Ventas
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5 }}>
              <Typography variant="h3" sx={{ 
                fontWeight: 900, 
                letterSpacing: '-0.04em',
                color: selectedMetric === 'orders' ? theme.palette.text.primary : alpha(theme.palette.text.primary, 0.4)
              }}>
                {totalOrders.toLocaleString('es-VE')}
              </Typography>
            </Box>
          </Box>

        </Box>

        {/* Chart Container */}
        <ChartReadyContainer
          height={380}
          sx={{
            '& .recharts-cartesian-grid-horizontal line': {
              strokeOpacity: 0.1
            }
          }}
        >
          {/* Malla de puntos (Dot Grid Effect) */}
          <svg style={{ position: 'absolute', width: 0, height: 0 }}>
            <defs>
              <pattern id="dotGrid" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                <circle cx="10" cy="10" r="1" fill={isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'} />
              </pattern>
              <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#00D9A6" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#00D9A6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="unitsGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="ordersGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#FF5252" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#FF5252" stopOpacity={0} />
              </linearGradient>
            </defs>
          </svg>

          <Box sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            pointerEvents: 'none'
          }}>
            <svg width="100%" height="100%">
              <rect width="100%" height="100%" fill="url(#dotGrid)" />
            </svg>
          </Box>

          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={1}>
            <ComposedChart
              data={chartData}
              margin={{ top: 20, right: 10, left: -10, bottom: 0 }}
            >
              <CartesianGrid vertical={false} strokeDasharray="4 4" stroke={theme.palette.divider} />

              <XAxis
                dataKey="dateLabel"
                axisLine={false}
                tickLine={false}
                tick={{ fill: theme.palette.text.secondary, fontSize: 11, fontWeight: 600 }}
                tickMargin={15}
                minTickGap={30}
              />

              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: theme.palette.text.secondary, fontSize: 11, fontWeight: 600 }}
                tickFormatter={currentConfig.format}
                tickMargin={15}
              />

              <Tooltip
                content={<CustomTooltip
                  theme={{
                  ...theme,
                  metricLabel: currentConfig.tooltipLabel,
                  metricFormat: currentConfig.tooltipFormat,
                  selectedMetric
                }} />}
                cursor={{ stroke: alpha(currentConfig.color, 0.2), strokeWidth: 2 }}
              />

              <Area
                type="monotone"
                dataKey="value"
                stroke="none"
                fill={`url(#${currentConfig.gradient})`}
                isAnimationActive={false}
              />

              <Line
                type="monotone"
                dataKey="value"
                stroke={currentConfig.color}
                strokeWidth={4}
                dot={false}
                activeDot={{
                  r: 8,
                  fill: currentConfig.color,
                  stroke: isDark ? "#1A1C1E" : "#FFF",
                  strokeWidth: 3,
                }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartReadyContainer>
      </CardContent>
    </Card>
  );
};

export default React.memo(RevenueBalanceChart);
