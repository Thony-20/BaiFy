import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
} from 'recharts';
import { Box, Typography, Paper, useTheme } from '@mui/material';
import ChartReadyContainer from './ChartReadyContainer';

// --- TENDENCIA DE MOVIMIENTOS ---
export const MovementTrendChart = ({ data }) => {
  const theme = useTheme();
  return (
    <ChartReadyContainer height={380} sx={{ mt: 2 }}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={1}>
        <BarChart data={data} margin={{ top: 20, right: 30, left: 10, bottom: 20 }} barGap={0}>
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            horizontal={true}
            stroke={theme.palette.divider}
          />
          <XAxis
            dataKey="date"
            axisLine={{ stroke: theme.palette.divider }}
            tickLine={false}
            tick={{ fill: theme.palette.text.secondary, fontSize: 11, fontWeight: 600 }}
            dy={15}
            minTickGap={10}
          />

          {/* Eje Izquierdo para Entradas (Verde) */}
          <YAxis
            yAxisId="left"
            orientation="left"
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#00D9A6', fontSize: 11, fontWeight: 700 }}
            label={{ value: 'Entradas', angle: -90, position: 'insideLeft', fill: '#00D9A6', fontSize: 10, fontWeight: 800, dx: -10 }}
          />

          {/* Eje Derecho para Salidas (Rojo) */}
          <YAxis
            yAxisId="right"
            orientation="right"
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#FF5252', fontSize: 11, fontWeight: 700 }}
            label={{ value: 'Salidas', angle: 90, position: 'insideRight', fill: '#FF5252', fontSize: 10, fontWeight: 800, dx: 10 }}
          />

          <Tooltip
            cursor={{ fill: theme.palette.action.hover }}
            contentStyle={{
              backgroundColor: theme.palette.background.paper,
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: '12px',
              padding: '12px',
              boxShadow: theme.shadows[4],
              maxWidth: '300px',
              wordBreak: 'break-word',
              whiteSpace: 'normal'
            }}
            itemStyle={{ fontSize: '13px', fontWeight: 700, padding: '4px 0' }}
            labelStyle={{ color: theme.palette.text.primary, marginBottom: '8px', fontWeight: 800, borderBottom: `1px solid ${theme.palette.divider}`, paddingBottom: '4px' }}
          />

          <Legend
            verticalAlign="top"
            align="right"
            wrapperStyle={{ paddingBottom: '20px', fontSize: '12px', fontWeight: 600 }}
          />

          <Bar
            yAxisId="left"
            dataKey="entradas"
            name="Entradas"
            fill="#00D9A6"
            radius={[4, 4, 0, 0]}
            barSize={12}
            isAnimationActive={false}
          />
          <Bar
            yAxisId="right"
            dataKey="salidas"
            name="Salidas"
            fill="#FF5252"
            radius={[4, 4, 0, 0]}
            barSize={12}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartReadyContainer>
  );
};

// --- DISTRIBUCIÓN DE STOCK (PIE) ---
export const StockDistributionChart = ({ data }) => {
  const theme = useTheme();
  return (
    <ChartReadyContainer height={260}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={1}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={80}
            paddingAngle={8}
            dataKey="value"
            isAnimationActive={false}
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: theme.palette.background.paper,
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: '12px',
              boxShadow: theme.shadows[2],
              maxWidth: '300px',
              wordBreak: 'break-word',
              whiteSpace: 'normal'
            }}
            labelStyle={{ color: theme.palette.text.primary }}
          />
          <Legend
            verticalAlign="bottom"
            align="center"
            wrapperStyle={{ paddingTop: '20px', fontSize: '12px' }}
          />
        </PieChart>
      </ResponsiveContainer>
      {/* Centro de la dona */}
      <Box sx={{
        position: 'absolute',
        top: '42%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        textAlign: 'center'
      }}>
        <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 1 }}>
          Total
        </Typography>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>
          {data.reduce((sum, item) => sum + item.value, 0)}
        </Typography>
      </Box>
    </ChartReadyContainer>
  );
};

// --- TOP PRODUCTOS (BAR) ---
export const TopProductsChart = React.memo(({ data, color = "#3B82F6", name = "Vendidos" }) => {
  const theme = useTheme();
  return (
    <ChartReadyContainer height={440}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={1}>
        <BarChart data={data} layout="vertical" margin={{ left: 20, right: 30, top: 10, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={theme.palette.divider} />
          <XAxis type="number" hide />
          <YAxis
            dataKey="nombre"
            type="category"
            axisLine={false}
            tickLine={false}
            tick={{ fill: theme.palette.text.primary, fontSize: 10, fontWeight: 700 }}
            width={120}
            tickFormatter={(value) => value.length > 20 ? `${value.substring(0, 20)}...` : value}
          />
          <Tooltip
            cursor={{ fill: theme.palette.action.hover }}
            contentStyle={{
              backgroundColor: theme.palette.background.paper,
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: '16px',
              boxShadow: theme.shadows[4],
              maxWidth: '300px',
              wordBreak: 'break-word',
              whiteSpace: 'normal'
            }}
            labelStyle={{ color: theme.palette.text.primary, fontWeight: 900 }}
          />
          <Bar
            dataKey="cantidad"
            name={name}
            fill={color}
            radius={[0, 10, 10, 0]}
            barSize={16}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartReadyContainer>
  );
});

// --- DISTRIBUCIÓN DE PAGOS (PIE) ---
export const PaymentDistributionChart = React.memo(({ data, currencySymbol = 'Bs.' }) => {
  const theme = useTheme();
  const chartData = Array.isArray(data) ? data : [];

  return (
    <ChartReadyContainer height={350}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={1}>
        <PieChart>
          <Pie
            data={chartData.length > 0 ? chartData : [{ name: 'Sin datos', value: 1, color: theme.palette.divider }]}
            cx="50%"
            cy="50%"
            innerRadius={80}
            outerRadius={110}
            paddingAngle={5}
            dataKey="value"
            isAnimationActive={false}
          >
            {(chartData.length > 0 ? chartData : [{ color: theme.palette.divider }]).map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: theme.palette.background.paper,
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: '16px',
              boxShadow: theme.shadows[4],
              maxWidth: '300px',
              wordBreak: 'break-word',
              whiteSpace: 'normal'
            }}
            formatter={(value, _name, item) => {
              const row = item?.payload;
              const symbol = row?.displaySymbol || currencySymbol;
              const amount = row?.displayValue ?? value;
              return [`${symbol} ${Number(amount || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 'Monto'];
            }}
          />
          <Legend
            verticalAlign="bottom"
            align="center"
            wrapperStyle={{ paddingTop: '20px', fontSize: '12px', fontWeight: 600 }}
          />
        </PieChart>
      </ResponsiveContainer>
      <Box sx={{
        position: 'absolute',
        top: '44%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        textAlign: 'center'
      }}>
        <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: 2, fontWeight: 800 }}>
          Total Ventas
        </Typography>
        <Typography variant="h5" sx={{ fontWeight: 900, color: theme.palette.text.primary }}>
          {chartData.reduce((sum, item) => sum + item.value, 0) > 0
            ? `${currencySymbol} ${chartData.reduce((sum, item) => sum + item.value, 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : '---'}
        </Typography>
      </Box>
    </ChartReadyContainer>
  );
});
// --- Datos estáticos decorativos por paleta de colores ---
const DECORATIVE_DATA = {
  '#3B82F6': [4, 7, 5, 9, 6, 11, 8, 13, 10, 14],
  '#00D9A6': [6, 4, 8, 5, 10, 7, 12, 9, 11, 14],
  '#FF5252': [3, 6, 4, 8, 5, 7, 4, 6, 5, 3],
};
const DEFAULT_DATA = [5, 8, 6, 10, 7, 12, 9, 11, 8, 13];

// --- MINI SPARKLINE PARA CARDS (Optimizado con SVG puro) ---
export const MiniSparklineChart = React.memo(({ color = "#3B82F6" }) => {
  const data = DECORATIVE_DATA[color] ?? DEFAULT_DATA;

  const maxVal = 16;
  const points = data.map((v, i) => {
    const x = (i * 100) / (data.length - 1);
    const y = 40 - (v * 40) / maxVal;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const pathData = `M ${points.join(' L ')}`;
  const areaData = `${pathData} L 100,40 L 0,40 Z`;
  const gradId = `grad-spark-${color.replace('#', '')}`;

  return (
    <Box sx={{ width: '100%', height: 40, mt: 1, pointerEvents: 'none', opacity: 0.8 }}>
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 100 40"
        preserveAspectRatio="none"
        style={{ display: 'block' }}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaData} fill={`url(#${gradId})`} />
        <path
          d={pathData}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </Box>
  );
});
