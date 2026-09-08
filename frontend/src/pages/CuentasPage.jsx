import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  Button,
  Tabs,
  Tab,
  Card,
  CardContent,
  Grid,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Skeleton,
  useTheme,
} from '@mui/material';
import {
  Add as AddIcon,
  AccountBalanceWallet as WalletIcon,
  TrendingUp as TrendingUpIcon,
  WarningAmber as WarningIcon,
} from '@mui/icons-material';
import toast from 'react-hot-toast';
import useAuthStore from '../store/useAuthStore';
import useCurrencyStore from '../store/useCurrencyStore';
import useAccounts from '../hooks/useAccounts';
import AccountsTable from '../components/AccountsTable';
import AccountFormModal from '../components/AccountFormModal';
import AccountPaymentModal from '../components/AccountPaymentModal';
import ClientCreditHistoryModal from '../components/ClientCreditHistoryModal';
import {
  createAccount,
  updateAccount,
  deleteAccount,
  registerAccountPayment,
  backfillAccountRates,
  getClientCreditHistory,
} from '../services/accountService';
import { ACCOUNT_TYPES } from '../utils/constants';
import {
  formatUsd,
  formatBsAmount,
  roundMoney,
} from '../utils/accountMoney';

function SummaryCards({ stats, statsLoading, isReceivable }) {
  const theme = useTheme();
  const { getActiveRate } = useCurrencyStore();
  const activeRate = getActiveRate();

  const pendienteBs = activeRate > 0
    ? roundMoney((Number(stats?.totalPendiente) || 0) * activeRate)
    : null;
  const vencidoBs = activeRate > 0
    ? roundMoney((Number(stats?.totalVencido) || 0) * activeRate)
    : null;

  // Cobrado/pagado: $ = Bs fijados del período ÷ tasa actual
  const movidoBs = Number(stats?.totalMovidoMesBs) || 0;
  const movidoUsdFromBs = activeRate > 0
    ? roundMoney(movidoBs / activeRate)
    : null;

  const cards = [
    {
      id: 'pendiente',
      title: 'Total pendiente',
      value: formatUsd(stats?.totalPendiente),
      valueBs: formatBsAmount(pendienteBs),
      icon: <WalletIcon />,
      color: '#3B82F6',
    },
    {
      id: 'movido',
      title: isReceivable ? 'Cobrado este mes' : 'Pagado este mes',
      value: formatUsd(movidoUsdFromBs != null ? movidoUsdFromBs : stats?.totalMovidoMes),
      valueBs: formatBsAmount(movidoBs),
      icon: <TrendingUpIcon />,
      color: '#00D9A6',
    },
    {
      id: 'vencidos',
      title: 'Vencidos',
      value: formatUsd(stats?.totalVencido),
      valueBs: formatBsAmount(vencidoBs),
      subtitle: `${stats?.vencidosCount || 0} cuenta${(stats?.vencidosCount || 0) === 1 ? '' : 's'}`,
      icon: <WarningIcon />,
      color: '#FF5252',
    },
  ];

  return (
    <Grid container spacing={2} sx={{ mb: 3 }}>
      {cards.map((card) => (
        <Grid size={{ xs: 12, sm: 4 }} key={card.id}>
          <Card
            elevation={0}
            sx={{
              borderRadius: 3,
              border: '1px solid',
              borderColor: 'divider',
              height: '100%',
              display: 'flex',
              background:
                theme.palette.mode === 'dark'
                  ? 'linear-gradient(145deg, rgba(18,24,41,0.9) 0%, rgba(26,32,53,0.95) 100%)'
                  : 'linear-gradient(145deg, #ffffff 0%, #f8fafc 100%)',
            }}
          >
            <CardContent
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                flex: 1,
                width: '100%',
                py: 2.5,
                '&:last-child': { pb: 2.5 },
              }}
            >
              <Box
                sx={{
                  width: 44,
                  height: 44,
                  borderRadius: 2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: `${card.color}22`,
                  color: card.color,
                  flexShrink: 0,
                }}
              >
                {card.icon}
              </Box>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  {card.title}
                </Typography>
                {statsLoading ? (
                  <Skeleton width="70%" height={32} />
                ) : (
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: 1,
                      flexWrap: 'wrap',
                      minWidth: 0,
                    }}
                  >
                    <Typography variant="h6" fontWeight={700} noWrap>
                      {card.value}
                    </Typography>
                    {card.valueBs && (
                      <Typography variant="body2" color="text.secondary" fontWeight={600} noWrap>
                        {card.valueBs}
                      </Typography>
                    )}
                  </Box>
                )}
                {card.subtitle && !statsLoading && (
                  <Typography variant="caption" color="text.secondary">
                    {card.subtitle}
                  </Typography>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
}

function AccountsTabPanel({ tipo }) {
  const { userProfile } = useAuthStore();
  const {
    accounts,
    stats,
    loading,
    statsLoading,
    hasMore,
    page,
    filters,
    error,
    setFilters,
    nextPage,
    prevPage,
    refetch,
  } = useAccounts(tipo);

  const isReceivable = tipo === ACCOUNT_TYPES.POR_COBRAR;

  const [formOpen, setFormOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentAccount, setPaymentAccount] = useState(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(null);
  const [formLoading, setFormLoading] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [creditOpen, setCreditOpen] = useState(false);
  const [creditHistory, setCreditHistory] = useState(null);
  const [creditLoading, setCreditLoading] = useState(false);

  const handleOpenCreate = () => {
    setEditingAccount(null);
    setFormOpen(true);
  };

  const handleOpenEdit = (account) => {
    setEditingAccount(account);
    setFormOpen(true);
  };

  const handleFormSubmit = async (formData) => {
    setFormLoading(true);
    try {
      if (editingAccount) {
        await updateAccount(editingAccount.id, formData);
        toast.success('Cuenta actualizada');
      } else {
        await createAccount({
          ...formData,
          empresaId: userProfile.empresaId,
        });
        toast.success('Cuenta creada');
      }
      setFormOpen(false);
      refetch();
    } catch (err) {
      toast.error(err.message || 'Error al guardar la cuenta');
    } finally {
      setFormLoading(false);
    }
  };

  const handleOpenPayment = (account) => {
    setPaymentAccount(account);
    setPaymentOpen(true);
  };

  const handlePaymentSubmit = async (paymentData) => {
    setPaymentLoading(true);
    try {
      await registerAccountPayment(paymentAccount.id, paymentData);
      toast.success(isReceivable ? 'Cobro registrado' : 'Pago registrado');
      setPaymentOpen(false);
      refetch();
    } catch (err) {
      toast.error(err.message || 'Error al registrar el abono');
    } finally {
      setPaymentLoading(false);
    }
  };

  const handleOpenDelete = (account) => {
    setDeletingAccount(account);
    setDeleteOpen(true);
  };

  const openCreditHistory = async (clienteId, preloaded = null) => {
    if (preloaded) {
      setCreditHistory(preloaded);
      setCreditOpen(true);
      return;
    }
    if (!clienteId || !userProfile?.empresaId) {
      toast.error('Esta cuenta no tiene cédula registrada');
      return;
    }
    setCreditOpen(true);
    setCreditLoading(true);
    setCreditHistory(null);
    try {
      const history = await getClientCreditHistory(userProfile.empresaId, clienteId);
      setCreditHistory(history);
    } catch (err) {
      toast.error(err.message || 'Error al cargar historial crediticio');
      setCreditOpen(false);
    } finally {
      setCreditLoading(false);
    }
  };

  const handleOpenCreditHistory = (account) => {
    openCreditHistory(account?.clienteId);
  };

  const handleViewCreditFromForm = (history) => {
    openCreditHistory(history?.clienteId, history);
  };

  const handleConfirmDelete = async () => {
    try {
      await deleteAccount(deletingAccount.id);
      toast.success('Cuenta eliminada');
      setDeleteOpen(false);
      refetch();
    } catch (err) {
      toast.error(err.message || 'Error al eliminar');
    }
  };

  useEffect(() => {
    const onBackfilled = () => refetch();
    window.addEventListener('accounts-rates-backfilled', onBackfilled);
    return () => window.removeEventListener('accounts-rates-backfilled', onBackfilled);
  }, [refetch]);

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 2,
          mb: 2,
        }}
      >
        <Typography variant="body2" color="text.secondary">
          {isReceivable
            ? 'Gestiona lo que tus clientes te deben'
            : 'Gestiona lo que debes a proveedores'}
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleOpenCreate}
          sx={{ minWidth: 260, whiteSpace: 'nowrap' }}
        >
          {isReceivable ? 'Nueva cuenta por cobrar' : 'Nueva cuenta por pagar'}
        </Button>
      </Box>

      <SummaryCards
        stats={stats}
        statsLoading={statsLoading}
        isReceivable={isReceivable}
      />

      {error && (
        <Typography color="error" sx={{ mb: 2 }}>
          {error}
        </Typography>
      )}

      <AccountsTable
        accounts={accounts}
        loading={loading}
        filters={filters}
        onFilterChange={setFilters}
        onEdit={handleOpenEdit}
        onDelete={handleOpenDelete}
        onPayment={handleOpenPayment}
        onCreditHistory={isReceivable ? handleOpenCreditHistory : undefined}
        onNextPage={nextPage}
        onPrevPage={prevPage}
        hasMore={hasMore}
        page={page}
        tipo={tipo}
      />

      <AccountFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSubmit={handleFormSubmit}
        account={editingAccount}
        tipo={tipo}
        loading={formLoading}
        empresaId={userProfile?.empresaId}
        onViewCreditHistory={isReceivable ? handleViewCreditFromForm : undefined}
      />

      <AccountPaymentModal
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        onSubmit={handlePaymentSubmit}
        account={paymentAccount}
        loading={paymentLoading}
      />

      <ClientCreditHistoryModal
        open={creditOpen}
        onClose={() => setCreditOpen(false)}
        history={creditHistory}
        loading={creditLoading}
        onPayment={(account) => {
          setCreditOpen(false);
          handleOpenPayment(account);
        }}
        onEdit={(account) => {
          setCreditOpen(false);
          handleOpenEdit(account);
        }}
        onDelete={(account) => {
          setCreditOpen(false);
          handleOpenDelete(account);
        }}
      />

      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)}>
        <DialogTitle>Eliminar cuenta</DialogTitle>
        <DialogContent>
          <Typography>
            ¿Seguro que deseas eliminar esta cuenta
            {deletingAccount
              ? ` de ${deletingAccount.clienteNombre || deletingAccount.proveedorNombre}`
              : ''}
            ? Esta acción no se puede deshacer.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)}>Cancelar</Button>
          <Button color="error" variant="contained" onClick={handleConfirmDelete}>
            Eliminar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default function CuentasPage() {
  const [tab, setTab] = useState(0);
  const { userProfile } = useAuthStore();
  const { getActiveRate, fetchRates, exchangeRate } = useCurrencyStore();
  const backfillDoneRef = useRef(false);
  const [ratesReady, setRatesReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const ensureRates = async () => {
      if (!getActiveRate()) {
        await fetchRates();
      }
      if (!cancelled) setRatesReady(true);
    };
    ensureRates();
    return () => { cancelled = true; };
  }, [getActiveRate, fetchRates, exchangeRate]);

  useEffect(() => {
    const empresaId = userProfile?.empresaId;
    const tasa = getActiveRate();
    if (!empresaId || !ratesReady || !tasa || backfillDoneRef.current) return;

    const storageKey = `accounts-rates-backfill-v2:${empresaId}`;
    if (sessionStorage.getItem(storageKey) === '1') {
      backfillDoneRef.current = true;
      return;
    }

    backfillDoneRef.current = true;
    backfillAccountRates(empresaId, tasa)
      .then((result) => {
        sessionStorage.setItem(storageKey, '1');
        if (result?.updatedCount > 0) {
          toast.success(
            `Tasa de hoy aplicada a ${result.updatedCount} cuenta${result.updatedCount === 1 ? '' : 's'} antigua${result.updatedCount === 1 ? '' : 's'}`
          );
          // Forzar recarga del panel activo al cambiar de tab / remount via key
          window.dispatchEvent(new CustomEvent('accounts-rates-backfilled'));
        }
      })
      .catch((err) => {
        backfillDoneRef.current = false;
        console.error('Error backfill tasas cuentas:', err);
      });
  }, [userProfile?.empresaId, ratesReady, getActiveRate, exchangeRate]);

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" fontWeight={700} gutterBottom>
          Cuentas
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Cuentas por cobrar y por pagar
        </Typography>
      </Box>

      <Tabs
        value={tab}
        onChange={(_, value) => setTab(value)}
        sx={{
          mb: 3,
          borderBottom: 1,
          borderColor: 'divider',
          '& .MuiTab-root': { textTransform: 'none', fontWeight: 600 },
        }}
      >
        <Tab label="Cuentas por cobrar" />
        <Tab label="Cuentas por pagar" />
      </Tabs>

      {tab === 0 ? (
        <AccountsTabPanel tipo={ACCOUNT_TYPES.POR_COBRAR} />
      ) : (
        <AccountsTabPanel tipo={ACCOUNT_TYPES.POR_PAGAR} />
      )}
    </Box>
  );
}
