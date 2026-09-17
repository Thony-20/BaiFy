import { useMemo } from 'react';
import { useTheme } from '@mui/material';

export const QUICK_PROMPTS = [
  {
    id: 'sales-today',
    label: 'Ver ventas de hoy',
    prompt: 'Ventas de hoy con resumen financiero',
  },
  {
    id: 'stock',
    label: 'Consultar stock',
    prompt: 'Productos con stock bajo',
  },
  {
    id: 'debt',
    label: 'Clientes con deuda',
    prompt: 'Alertas de cuentas por cobrar y clientes con deuda',
  },
];

/** @param {'light' | 'dark'} mode */
export function getBaifyAiTokens(mode) {
  const isDark = mode === 'dark';
  return {
    bg: isDark ? '#0B1220' : '#F5F7FA',
    panel: isDark ? '#111827' : '#FFFFFF',
    surface: isDark ? '#1E293B' : '#F1F5F9',
    border: isDark ? 'rgba(148, 163, 184, 0.12)' : 'rgba(0, 0, 0, 0.08)',
    borderStrong: isDark ? 'rgba(59, 130, 246, 0.35)' : 'rgba(59, 130, 246, 0.25)',
    accent: '#3B82F6',
    accentHover: '#2563EB',
    textPrimary: isDark ? '#F1F5F9' : '#1A1C1E',
    textSecondary: isDark ? '#94A3B8' : '#5E636E',
    userBubble: '#3B82F6',
    userText: '#FFFFFF',
    mascotGlow: isDark
      ? 'radial-gradient(circle, rgba(59, 130, 246, 0.22) 0%, rgba(59, 130, 246, 0.06) 45%, transparent 70%)'
      : 'radial-gradient(circle, rgba(59, 130, 246, 0.14) 0%, rgba(59, 130, 246, 0.04) 45%, transparent 70%)',
    mascotShadow: isDark
      ? 'drop-shadow(0 8px 24px rgba(59, 130, 246, 0.2))'
      : 'drop-shadow(0 6px 16px rgba(59, 130, 246, 0.15))',
    chipIconBg: isDark ? 'rgba(59, 130, 246, 0.12)' : 'rgba(59, 130, 246, 0.1)',
    fabShadow: isDark
      ? '0 8px 24px rgba(59, 130, 246, 0.35)'
      : '0 8px 24px rgba(59, 130, 246, 0.28)',
    panelShadow: isDark
      ? '0 16px 48px rgba(0, 0, 0, 0.45)'
      : '0 16px 40px rgba(15, 23, 42, 0.12)',
  };
}

export function useBaifyAiTokens() {
  const theme = useTheme();
  return useMemo(
    () => getBaifyAiTokens(theme.palette.mode),
    [theme.palette.mode]
  );
}
