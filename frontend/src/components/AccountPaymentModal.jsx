import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  MenuItem,
  Divider,
  List,
  ListItem,
  ListItemText,
} from '@mui/material';
import { ACCOUNT_TYPES } from '../utils/constants';
import useCurrencyStore from '../store/useCurrencyStore';
import {
  formatUsd,
  formatBsAmount,
  resolveAbonoBs,
  resolveAccountPendienteBs,
  resolveAccountTotalBs,
  roundMoney,
} from '../utils/accountMoney';

const todayISO = () => new Date().toISOString().split('T')[0];

const PAYMENT_METHODS = [
  { value: 'cash-bs', label: 'Efectivo Bs' },
  { value: 'cash-usd', label: 'Efectivo USD' },
  { value: 'transfer', label: 'Transferencia' },
  { value: 'mobile', label: 'Pago móvil' },
  { value: 'card', label: 'Punto de venta' },
  { value: 'biopago', label: 'Biopago' },
];

const METODO_LABELS = {
  'cash-bs': 'Efectivo Bs',
  'cash-usd': 'Efectivo USD',
  transfer: 'Transferencia',
  mobile: 'Pago móvil',
  card: 'Punto de venta',
  biopago: 'Biopago',
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  'pago-movil': 'Pago móvil',
  tarjeta: 'Tarjeta',
  otro: 'Otro',
};

const metodoLabel = (value) => METODO_LABELS[value] || value || 'sin método';

export default function AccountPaymentModal({
  open,
  onClose,
  onSubmit,
  account,
  loading,
}) {
  const [monto, setMonto] = useState('');
  const [fecha, setFecha] = useState(todayISO());
  const [metodoPago, setMetodoPago] = useState('transfer');
  const [notas, setNotas] = useState('');
  const [errors, setErrors] = useState({});
  const { getActiveRate } = useCurrencyStore();
  const activeRate = getActiveRate();

  const isReceivable = account?.tipo === ACCOUNT_TYPES.POR_COBRAR;
  const pendiente = Number(account?.montoPendiente) || 0;
  const abonos = Array.isArray(account?.abonos) ? account.abonos : [];
  const pendienteBsLabel = formatBsAmount(resolveAccountPendienteBs(account, activeRate));
  const totalBsLabel = formatBsAmount(resolveAccountTotalBs(account, activeRate));

  const amountNum = Number(monto) || 0;
  const lockedBsPreview = activeRate > 0 && amountNum > 0
    ? roundMoney(amountNum * activeRate)
    : null;

  useEffect(() => {
    if (open && account) {
      setMonto(pendiente > 0 ? String(pendiente) : '');
      setFecha(todayISO());
      setMetodoPago('transfer');
      setNotas('');
      setErrors({});
    }
  }, [open, account, pendiente]);

  const validate = () => {
    const next = {};
    const amount = Number(monto);

    if (!monto || Number.isNaN(amount) || amount <= 0) {
      next.monto = 'El monto debe ser mayor a 0';
    } else if (amount > pendiente + 0.009) {
      next.monto = `No puede superar el saldo pendiente (${formatUsd(pendiente)})`;
    }

    if (!fecha) {
      next.fecha = 'La fecha es requerida';
    }

    if (!activeRate || activeRate <= 0) {
      next.monto = 'No hay tasa de cambio disponible para fijar el Bs';
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;
    onSubmit({
      monto: Number(monto),
      fecha,
      metodoPago,
      notas: notas.trim(),
      tasaCambio: activeRate,
    });
  };

  if (!account) return null;

  return (
    <Dialog open={open} onClose={loading ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {isReceivable ? 'Registrar cobro' : 'Registrar pago'}
      </DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box
              sx={{
                p: 2,
                borderRadius: 2,
                bgcolor: (theme) =>
                  theme.palette.mode === 'dark'
                    ? 'rgba(59, 130, 246, 0.08)'
                    : 'rgba(59, 130, 246, 0.06)',
              }}
            >
              <Typography variant="body2" color="text.secondary">
                {isReceivable ? account.clienteNombre : account.proveedorNombre}
              </Typography>
              <Typography variant="h6" sx={{ mt: 0.5 }}>
                Saldo pendiente: {formatUsd(pendiente)}
                {pendienteBsLabel && (
                  <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                    ({pendienteBsLabel})
                  </Typography>
                )}
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block">
                Total original: {formatUsd(account.montoTotal)}
                {totalBsLabel ? ` (${totalBsLabel})` : ''}
              </Typography>
            </Box>

            <TextField
              label={isReceivable ? 'Monto a cobrar (USD)' : 'Monto a pagar (USD)'}
              type="number"
              value={monto}
              onChange={(e) => {
                setMonto(e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value) || 0));
                if (errors.monto) setErrors((prev) => ({ ...prev, monto: '' }));
              }}
              error={Boolean(errors.monto)}
              helperText={
                errors.monto
                || (lockedBsPreview != null && activeRate
                  ? `Al registrar se fijará: ${formatBsAmount(lockedBsPreview)} a tasa ${activeRate.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs/$`
                  : 'La tasa del día fijará el Bs al registrar el cobro/pago')
              }
              fullWidth
              required
              autoFocus
              inputProps={{ min: 0, step: '0.01', max: pendiente }}
            />

            <TextField
              label="Fecha del abono"
              type="date"
              value={fecha}
              onChange={(e) => {
                setFecha(e.target.value);
                if (errors.fecha) setErrors((prev) => ({ ...prev, fecha: '' }));
              }}
              error={Boolean(errors.fecha)}
              helperText={errors.fecha}
              fullWidth
              required
              InputLabelProps={{ shrink: true }}
            />

            <TextField
              select
              label="Método"
              value={metodoPago}
              onChange={(e) => setMetodoPago(e.target.value)}
              fullWidth
            >
              {PAYMENT_METHODS.map((m) => (
                <MenuItem key={m.value} value={m.value}>
                  {m.label}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              label="Notas"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              fullWidth
              multiline
              minRows={2}
            />

            {abonos.length > 0 && (
              <>
                <Divider />
                <Typography variant="subtitle2">Historial de abonos</Typography>
                <List dense disablePadding sx={{ maxHeight: 160, overflow: 'auto' }}>
                  {abonos
                    .slice()
                    .reverse()
                    .map((abono) => {
                      const abonoBs = formatBsAmount(resolveAbonoBs(abono));
                      const tasaLabel = Number(abono.tasaCambio) > 0
                        ? ` · tasa ${Number(abono.tasaCambio).toLocaleString('es-VE', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}`
                        : '';
                      return (
                        <ListItem key={abono.id} disableGutters>
                          <ListItemText
                            primary={
                              abonoBs
                                ? `${formatUsd(abono.monto)} (${abonoBs})`
                                : formatUsd(abono.monto)
                            }
                            secondary={`${abono.fecha
                              ? new Date(abono.fecha).toLocaleDateString('es-VE')
                              : '—'} · ${metodoLabel(abono.metodoPago)}${tasaLabel}${
                              abono.notas ? ` · ${abono.notas}` : ''
                            }`}
                          />
                        </ListItem>
                      );
                    })}
                </List>
              </>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={loading || pendiente <= 0 || !activeRate}
          >
            {loading
              ? 'Registrando...'
              : (isReceivable ? 'Registrar cobro' : 'Registrar pago')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
