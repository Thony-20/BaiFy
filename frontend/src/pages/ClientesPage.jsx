import React, { useMemo } from 'react';
import {
  Alert,
  Box,
  Button,
  Grid,
  Typography,
} from '@mui/material';
import {
  CheckCircleOutline as ActiveIcon,
  GroupsOutlined as ClientsIcon,
  PersonOffOutlined as InactiveIcon,
  TrendingUp as ValueIcon,
} from '@mui/icons-material';
import ClientsTable from '../components/clients/ClientsTable';
import { ClientKpiCard } from '../components/clients/ClientVisualPrimitives';
import { CLIENT_COLORS } from '../components/clients/clientVisualTokens';
import useClients from '../hooks/useClients';
import useAuthStore from '../store/useAuthStore';
import { formatUsd } from '../utils/accountMoney';
import {
  ACTIVE_CLIENT_DAYS,
  isActiveClient,
} from '../utils/clientStatus';

export default function ClientesPage() {
  const { userProfile } = useAuthStore();
  const { clients, loading, error, refetch } = useClients(userProfile?.empresaId);

  const summary = useMemo(() => clients.reduce(
    (accumulator, client) => {
      const active = isActiveClient(client);
      return {
        total: accumulator.total + 1,
        activos: accumulator.activos + (active ? 1 : 0),
        inactivos: accumulator.inactivos + (active ? 0 : 1),
        valor: accumulator.valor + (Number(client.totalGastado) || 0),
      };
    },
    { total: 0, activos: 0, inactivos: 0, valor: 0 }
  ), [clients]);

  const activePercent = summary.total > 0
    ? Math.round((summary.activos / summary.total) * 100)
    : 0;
  const inactivePercent = summary.total > 0
    ? Math.round((summary.inactivos / summary.total) * 100)
    : 0;
  const averageClientValue = summary.total > 0 ? summary.valor / summary.total : 0;

  return (
    <Box>
      <Box sx={{ mb: 2 }}>
        <Typography variant="h4" fontWeight={700} gutterBottom>
          Clientes
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Conoce el comportamiento de cada cliente.
        </Typography>
      </Box>

      {error ? (
        <Alert
          severity="error"
          sx={{ mb: 2, borderRadius: '12px' }}
          action={<Button color="inherit" size="small" onClick={refetch}>Reintentar</Button>}
        >
          {error}
        </Alert>
      ) : null}

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <ClientKpiCard
            label="Clientes registrados"
            value={loading ? '—' : summary.total.toLocaleString('es-VE')}
            helper="Total en tu base"
            detail={!loading && summary.total > 0 ? 'Base consolidada de clientes' : undefined}
            color={CLIENT_COLORS.primary}
            icon={<ClientsIcon sx={{ fontSize: 21 }} />}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <ClientKpiCard
            label="Clientes activos"
            value={loading ? '—' : summary.activos.toLocaleString('es-VE')}
            helper={`Compraron en los últimos ${ACTIVE_CLIENT_DAYS} días`}
            detail={!loading && summary.total > 0 ? `${activePercent}% de la base` : undefined}
            color={CLIENT_COLORS.success}
            icon={<ActiveIcon sx={{ fontSize: 21 }} />}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <ClientKpiCard
            label="Sin actividad reciente"
            value={loading ? '—' : summary.inactivos.toLocaleString('es-VE')}
            helper={`Más de ${ACTIVE_CLIENT_DAYS} días sin comprar`}
            detail={!loading && summary.total > 0 ? `${inactivePercent}% de la base` : undefined}
            color={CLIENT_COLORS.danger}
            icon={<InactiveIcon sx={{ fontSize: 21 }} />}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <ClientKpiCard
            label="Valor histórico"
            value={loading ? '—' : formatUsd(summary.valor)}
            helper="Gasto acumulado"
            detail={!loading && summary.total > 0 ? `Promedio ${formatUsd(averageClientValue)} por cliente` : undefined}
            color={CLIENT_COLORS.warning}
            icon={<ValueIcon sx={{ fontSize: 21 }} />}
          />
        </Grid>
      </Grid>

      <ClientsTable clients={clients} loading={loading} />
    </Box>
  );
}
