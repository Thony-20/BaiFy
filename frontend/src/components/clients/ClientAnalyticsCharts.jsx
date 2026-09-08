import React, { useMemo } from 'react';
import { Box, Typography, useTheme } from '@mui/material';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import ChartReadyContainer from '../ChartReadyContainer';
import { ClientStateMessage } from './ClientVisualPrimitives';
import { ShowChart as ChartIcon } from '@mui/icons-material';

const CATEGORY_COLORS = ['#3B82F6', '#00D9A6', '#FDA63C', '#8B5CF6', '#FF5252'];
const MIN_MONTHLY_POINTS = 4;
const CLIENT_TIME_ZONE = 'America/Caracas';

const calendarDayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: CLIENT_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function calendarMonthKey(date) {
  return calendarDayFormatter.format(date).slice(0, 7);
}

function tooltipStyle(theme) {
  return {
    backgroundColor: theme.palette.background.paper,
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: '12px',
    boxShadow: theme.shadows[4],
  };
}

function formatMonth(value) {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return value || '—';
  return new Date(`${value}-01T12:00:00-04:00`).toLocaleDateString('es-VE', {
    timeZone: CLIENT_TIME_ZONE,
    month: 'short',
    year: '2-digit',
  });
}

function normalizeMonthlyRow(row) {
  const month = String(row?.month || row?.mes || row?.label || '').trim();
  const total = Number(row?.total ?? row?.monto ?? row?.value ?? 0);
  return {
    month,
    total: Number.isFinite(total) ? total : 0,
  };
}

function shiftMonthKey(month, offset) {
  const [year, monthPart] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, monthPart - 1, 1));
  date.setUTCMonth(date.getUTCMonth() + offset);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function prepareMonthlySpendingRows(data) {
  const rows = (Array.isArray(data) ? data : [])
    .map(normalizeMonthlyRow)
    .filter((row) => row.month)
    .sort((left, right) => left.month.localeCompare(right.month));

  if (rows.length === 0) return rows;
  if (rows.length >= MIN_MONTHLY_POINTS) return rows;

  const byMonth = new Map(rows.map((row) => [row.month, row.total]));
  const startMonth = rows[0].month;
  const padded = [];

  for (let index = MIN_MONTHLY_POINTS - 1; index >= 0; index -= 1) {
    const month = shiftMonthKey(startMonth, -index);
    padded.push({
      month,
      total: byMonth.get(month) || 0,
    });
  }

  rows.slice(1).forEach((row) => {
    if (!padded.some((entry) => entry.month === row.month)) {
      padded.push(row);
    }
  });

  return padded.sort((left, right) => left.month.localeCompare(right.month));
}

export function buildMonthlySpendingFromPurchases(purchases) {
  const monthlyTotals = new Map();

  (Array.isArray(purchases) ? purchases : []).forEach((purchase) => {
    const rawDate = purchase?.fechaVenta || purchase?.createdAt;
    if (!rawDate) return;
    const date = new Date(rawDate);
    if (Number.isNaN(date.getTime())) return;

    const month = calendarMonthKey(date);
    const total = Number(purchase?.total) || 0;
    monthlyTotals.set(month, (monthlyTotals.get(month) || 0) + total);
  });

  return [...monthlyTotals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([month, total]) => ({ month, total: Math.round(total * 100) / 100 }));
}

export function MonthlySpendingChart({ data, watchKey = '' }) {
  const theme = useTheme();
  const rows = useMemo(() => prepareMonthlySpendingRows(data), [data]);
  const hasSpending = rows.some((row) => row.total > 0);

  if (!hasSpending) {
    return (
      <ClientStateMessage
        title="Sin evolución disponible"
        description="La evolución mensual aparecerá cuando el cliente registre compras."
        icon={<ChartIcon sx={{ fontSize: 40, opacity: 0.45 }} />}
      />
    );
  }

  return (
    <Box sx={{ p: { xs: 1, sm: 2 }, minHeight: 300 }}>
      <ChartReadyContainer height={300} watchKey={watchKey || rows.length}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={300}>
          <BarChart data={rows} margin={{ top: 12, right: 16, left: 4, bottom: 4 }} barCategoryGap="24%">
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.palette.divider} />
            <XAxis
              dataKey="month"
              tickFormatter={formatMonth}
              axisLine={false}
              tickLine={false}
              tick={{ fill: theme.palette.text.secondary, fontSize: 11 }}
              minTickGap={12}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              width={72}
              tick={{ fill: theme.palette.text.secondary, fontSize: 11 }}
              tickFormatter={(value) => `$${Number(value).toLocaleString('es-VE')}`}
            />
            <Tooltip
              contentStyle={tooltipStyle(theme)}
              labelFormatter={formatMonth}
              formatter={(value) => [
                `$${Number(value || 0).toLocaleString('es-VE', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}`,
                'Gasto',
              ]}
            />
            <Bar
              dataKey="total"
              name="Gasto"
              fill="#3B82F6"
              radius={[8, 8, 0, 0]}
              maxBarSize={56}
            />
          </BarChart>
        </ResponsiveContainer>
      </ChartReadyContainer>
    </Box>
  );
}

export function CategoryDistributionChart({ data, watchKey = '' }) {
  const theme = useTheme();
  const rows = (Array.isArray(data) ? data : [])
    .filter((row) => Number(row.value ?? row.total ?? row.monto ?? row.cantidad) > 0)
    .map((row, index) => ({
      name: row.name || row.nombre || row.category || 'Sin categoría',
      value: Number(row.value ?? row.total ?? row.monto ?? row.cantidad) || 0,
      color: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
    }));

  if (rows.length === 0) {
    return (
      <ClientStateMessage
        title="Categorías no disponibles"
        description="Las ventas históricas no incluyen suficiente información de categoría para mostrar una distribución confiable."
        icon={<ChartIcon sx={{ fontSize: 40, opacity: 0.45 }} />}
      />
    );
  }

  return (
    <Box sx={{ p: 1, minHeight: 300 }}>
      <ChartReadyContainer height={300} watchKey={watchKey || rows.length}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={300}>
          <PieChart>
            <Pie
              data={rows}
              dataKey="value"
              nameKey="name"
              innerRadius={68}
              outerRadius={100}
              paddingAngle={5}
            >
              {rows.map((row) => (
                <Cell key={row.name} fill={row.color} stroke="none" />
              ))}
            </Pie>
            <Tooltip
              contentStyle={tooltipStyle(theme)}
              formatter={(value) => [
                `$${Number(value || 0).toLocaleString('es-VE', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}`,
                'Monto',
              ]}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      </ChartReadyContainer>
      <Typography variant="caption" color="text.secondary" display="block" textAlign="center">
        Distribución basada en las categorías actualmente disponibles.
      </Typography>
    </Box>
  );
}
