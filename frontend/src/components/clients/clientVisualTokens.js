export const CLIENT_COLORS = {
  primary: '#3B82F6',
  success: '#00D9A6',
  warning: '#FDA63C',
  danger: '#FF5252',
  neutral: '#64748B',
};

export function getClientSurfaces(theme) {
  const isDark = theme.palette.mode === 'dark';
  return {
    muted: isDark ? 'rgba(255, 255, 255, 0.04)' : '#FAFBFC',
    card: isDark ? 'rgba(255, 255, 255, 0.02)' : '#FFFFFF',
    iconBackground: isDark
      ? 'rgba(59, 130, 246, 0.18)'
      : 'rgba(59, 130, 246, 0.1)',
    iconColor: isDark ? '#60A5FA' : '#2563EB',
  };
}
