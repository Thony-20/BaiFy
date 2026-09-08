import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  Grid,
  InputAdornment,
  Alert,
  CircularProgress,
} from '@mui/material';
import { History as HistoryIcon } from '@mui/icons-material';
import { ACCOUNT_TYPES, ACCOUNT_STATES } from '../utils/constants';
import useCurrencyStore from '../store/useCurrencyStore';
import {
  formatUsd,
  formatBsAmount,
  resolveAccountPendienteBs,
  roundMoney,
} from '../utils/accountMoney';
import { getClientCreditHistory } from '../services/accountService';

const todayISO = () => new Date().toISOString().split('T')[0];

const normalizeCedulaInput = (value) => String(value || '').replace(/\D/g, '');

const initialFormData = {
  clienteNombre: '',
  clienteId: '',
  proveedorNombre: '',
  proveedorId: '',
  montoTotal: '',
  tasaCambio: '',
  fechaEmision: todayISO(),
  fechaVencimiento: '',
  observaciones: '',
  ventaId: '',
};

export default function AccountFormModal({
  open,
  onClose,
  onSubmit,
  account,
  tipo,
  loading,
  empresaId,
  onViewCreditHistory,
}) {
  const [formData, setFormData] = useState(initialFormData);
  const [errors, setErrors] = useState({});
  const [creditPreview, setCreditPreview] = useState(null);
  const [creditLoading, setCreditLoading] = useState(false);
  const [creditError, setCreditError] = useState('');
  const creditLookupRef = useRef(0);
  const { getActiveRate } = useCurrencyStore();
  const activeRate = getActiveRate();

  const isEditing = Boolean(account);
  const isReceivable = tipo === ACCOUNT_TYPES.POR_COBRAR;
  const hasAbonos = Array.isArray(account?.abonos) && account.abonos.length > 0;
  const isPaid = isEditing && (
    account?.estado === ACCOUNT_STATES.PAGADO
    || (Number(account?.montoPendiente) || 0) <= 0.009
  );
  const canEditTasa = !isEditing || (!isPaid && !hasAbonos);
  const showTasaSection = !isEditing || canEditTasa || Number(account?.tasaCambio) > 0
    || Number(formData.tasaCambio) > 0;
  const tasaNum = Number(formData.tasaCambio);

  const previewBs = tasaNum > 0 && Number(formData.montoTotal) > 0
    ? roundMoney(Number(formData.montoTotal) * tasaNum)
    : null;

  const pendienteBsLabel = isEditing
    ? formatBsAmount(resolveAccountPendienteBs(account, activeRate))
    : null;

  useEffect(() => {
    if (!open) return;

    if (account) {
      const savedTasa = Number(account.tasaCambio);
      setFormData({
        clienteNombre: account.clienteNombre || '',
        clienteId: account.clienteId || '',
        proveedorNombre: account.proveedorNombre || '',
        proveedorId: account.proveedorId || '',
        montoTotal: account.montoTotal ?? '',
        tasaCambio: savedTasa > 0
          ? String(savedTasa)
          : (activeRate > 0 ? String(activeRate) : ''),
        fechaEmision: account.fechaEmision
          ? new Date(account.fechaEmision).toISOString().split('T')[0]
          : todayISO(),
        fechaVencimiento: account.fechaVencimiento
          ? new Date(account.fechaVencimiento).toISOString().split('T')[0]
          : '',
        observaciones: account.observaciones || '',
        ventaId: account.ventaId || '',
      });
    } else {
      setFormData({
        ...initialFormData,
        fechaEmision: todayISO(),
        tasaCambio: activeRate > 0 ? String(activeRate) : '',
      });
    }
    setErrors({});
    setCreditPreview(null);
    setCreditError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, open]);

  useEffect(() => {
    if (!open || account) return;
    if (!(activeRate > 0)) return;
    setFormData((prev) => {
      if (prev.tasaCambio !== '' && prev.tasaCambio != null) return prev;
      return { ...prev, tasaCambio: String(activeRate) };
    });
  }, [open, account, activeRate]);

  useEffect(() => {
    if (!open || !isReceivable || !empresaId) return;

    const cedula = normalizeCedulaInput(formData.clienteId);
    if (cedula.length < 5) {
      setCreditPreview(null);
      setCreditError('');
      setCreditLoading(false);
      return undefined;
    }

    const lookupId = ++creditLookupRef.current;
    setCreditLoading(true);
    setCreditError('');

    const timer = setTimeout(async () => {
      try {
        const history = await getClientCreditHistory(empresaId, cedula);
        if (creditLookupRef.current !== lookupId) return;
        setCreditPreview(history);
        if (history?.exists && history.clienteNombre) {
          setFormData((prev) => {
            if (String(prev.clienteNombre || '').trim()) return prev;
            return { ...prev, clienteNombre: history.clienteNombre };
          });
        }
      } catch (err) {
        if (creditLookupRef.current !== lookupId) return;
        setCreditPreview(null);
        setCreditError(err.message || 'No se pudo consultar el historial');
      } finally {
        if (creditLookupRef.current === lookupId) {
          setCreditLoading(false);
        }
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [open, isReceivable, empresaId, formData.clienteId]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    let nextValue = value;

    if (name === 'montoTotal' || name === 'tasaCambio') {
      nextValue = value === '' ? '' : Math.max(0, parseFloat(value) || 0);
    }
    if (name === 'clienteId') {
      nextValue = normalizeCedulaInput(value);
    }

    setFormData((prev) => ({
      ...prev,
      [name]: nextValue,
    }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  const handleUseDayRate = () => {
    if (!(activeRate > 0)) return;
    setFormData((prev) => ({ ...prev, tasaCambio: String(activeRate) }));
    if (errors.tasaCambio) {
      setErrors((prev) => ({ ...prev, tasaCambio: '' }));
    }
  };

  const validate = () => {
    const next = {};

    if (isReceivable && !String(formData.clienteNombre || '').trim()) {
      next.clienteNombre = 'El nombre del cliente es requerido';
    }
    if (isReceivable) {
      const cedula = normalizeCedulaInput(formData.clienteId);
      if (cedula.length < 5) {
        next.clienteId = 'La cédula es obligatoria (mín. 5 dígitos)';
      }
    }
    if (isReceivable && !String(formData.ventaId || '').trim()) {
      next.ventaId = 'El ID del comprobante es obligatorio';
    }
    if (isReceivable && !String(formData.fechaVencimiento || '').trim()) {
      next.fechaVencimiento = 'La fecha acordada para el pago es obligatoria';
    }
    if (!isReceivable && !String(formData.proveedorNombre || '').trim()) {
      next.proveedorNombre = 'El nombre del proveedor es requerido';
    }

    const monto = Number(formData.montoTotal);
    if (!formData.montoTotal || Number.isNaN(monto) || monto <= 0) {
      next.montoTotal = 'El monto debe ser mayor a 0';
    }

    if (!formData.fechaEmision) {
      next.fechaEmision = 'La fecha de emisión es requerida';
    }

    if (
      formData.fechaEmision
      && formData.fechaVencimiento
      && formData.fechaVencimiento < formData.fechaEmision
    ) {
      next.fechaVencimiento = 'No puede ser anterior a la emisión';
    }

    if (isEditing && hasAbonos && Number(formData.montoTotal) !== Number(account.montoTotal)) {
      next.montoTotal = 'No se puede cambiar el monto si ya hay abonos';
    }

    if (canEditTasa) {
      if (!formData.tasaCambio || Number.isNaN(tasaNum) || tasaNum <= 0) {
        next.tasaCambio = 'La tasa debe ser mayor a 0';
      }
    }

    if (
      isReceivable
      && creditPreview?.exists
      && creditPreview.clienteNombre
      && String(formData.clienteNombre || '').trim()
    ) {
      const incoming = String(formData.clienteNombre).trim().toLowerCase().replace(/\s+/g, ' ');
      const existing = String(creditPreview.clienteNombre).trim().toLowerCase().replace(/\s+/g, ' ');
      if (incoming !== existing) {
        next.clienteNombre = `Esta CI pertenece a "${creditPreview.clienteNombre}"`;
      }
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;

    const payload = {
      tipo,
      montoTotal: Number(formData.montoTotal),
      fechaEmision: formData.fechaEmision,
      fechaVencimiento: isReceivable
        ? formData.fechaVencimiento
        : (formData.fechaVencimiento || null),
      observaciones: formData.observaciones.trim(),
    };

    if (canEditTasa) {
      payload.tasaCambio = tasaNum;
    }

    if (isReceivable) {
      payload.clienteNombre = formData.clienteNombre.trim();
      payload.clienteId = normalizeCedulaInput(formData.clienteId);
      payload.ventaId = formData.ventaId.trim();
    } else {
      payload.proveedorNombre = formData.proveedorNombre.trim();
      payload.proveedorId = formData.proveedorId.trim() || null;
    }

    onSubmit(payload);
  };

  return (
    <Dialog open={open} onClose={loading ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {isEditing
          ? (isReceivable ? 'Editar cuenta por cobrar' : 'Editar cuenta por pagar')
          : (isReceivable ? 'Nueva cuenta por cobrar' : 'Nueva cuenta por pagar')}
      </DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 0.5 }}>
            {isReceivable ? (
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 8 }}>
                  <TextField
                    label="Cliente"
                    name="clienteNombre"
                    value={formData.clienteNombre}
                    onChange={handleChange}
                    error={Boolean(errors.clienteNombre)}
                    helperText={
                      errors.clienteNombre
                      || (creditPreview?.exists
                        ? 'Debe coincidir con el nombre registrado para esta CI'
                        : undefined)
                    }
                    fullWidth
                    required
                    autoFocus
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField
                    label="Cédula de identidad"
                    name="clienteId"
                    value={formData.clienteId}
                    onChange={handleChange}
                    placeholder="Ej: 12345678"
                    error={Boolean(errors.clienteId)}
                    helperText={errors.clienteId || 'Única por persona (mín. 5 dígitos)'}
                    fullWidth
                    required
                    inputProps={{ inputMode: 'numeric', pattern: '[0-9]*' }}
                    InputProps={{
                      endAdornment: creditLoading ? (
                        <InputAdornment position="end">
                          <CircularProgress size={16} />
                        </InputAdornment>
                      ) : null,
                    }}
                  />
                </Grid>
                <Grid size={12}>
                  <TextField
                    label="ID del comprobante"
                    name="ventaId"
                    value={formData.ventaId}
                    onChange={handleChange}
                    error={Boolean(errors.ventaId)}
                    helperText={errors.ventaId || 'Ej: VENTA-...'}
                    placeholder="Ej: VENTA-..."
                    fullWidth
                    required
                  />
                </Grid>
                {creditError && (
                  <Grid size={12}>
                    <Alert severity="warning">{creditError}</Alert>
                  </Grid>
                )}
                {creditPreview?.exists && (
                  <Grid size={12}>
                    <Alert
                      severity={creditPreview.resumen?.vencido > 0 ? 'warning' : 'info'}
                      action={
                        onViewCreditHistory ? (
                          <Button
                            color="inherit"
                            size="small"
                            startIcon={<HistoryIcon />}
                            onClick={() => onViewCreditHistory(creditPreview)}
                            sx={{ textTransform: 'none' }}
                          >
                            Ver historial
                          </Button>
                        ) : null
                      }
                    >
                      Cliente conocido: {creditPreview.totalPrestamos} préstamo
                      {creditPreview.totalPrestamos === 1 ? '' : 's'}
                      {' · '}
                      Pendiente {formatUsd(creditPreview.resumen?.montoPendiente)}
                      {creditPreview.resumen?.vencido > 0
                        ? ` · ${creditPreview.resumen.vencido} vencido${creditPreview.resumen.vencido === 1 ? '' : 's'}`
                        : ''}
                    </Alert>
                  </Grid>
                )}
                {creditPreview && !creditPreview.exists && normalizeCedulaInput(formData.clienteId).length >= 5 && (
                  <Grid size={12}>
                    <Alert severity="success">
                      Cédula nueva: no hay préstamos previos con esta CI.
                    </Alert>
                  </Grid>
                )}
              </Grid>
            ) : (
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 8 }}>
                  <TextField
                    label="Proveedor"
                    name="proveedorNombre"
                    value={formData.proveedorNombre}
                    onChange={handleChange}
                    error={Boolean(errors.proveedorNombre)}
                    helperText={errors.proveedorNombre}
                    fullWidth
                    required
                    autoFocus
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField
                    label="ID proveedor (opcional)"
                    name="proveedorId"
                    value={formData.proveedorId}
                    onChange={handleChange}
                    fullWidth
                  />
                </Grid>
              </Grid>
            )}

            <TextField
              label="Monto total (USD)"
              name="montoTotal"
              type="number"
              value={formData.montoTotal}
              onChange={handleChange}
              error={Boolean(errors.montoTotal)}
              helperText={
                errors.montoTotal
                || (isEditing && (hasAbonos || isPaid)
                  ? 'El monto quedó fijo al registrar pagos'
                  : (previewBs != null
                    ? `Equivalente: ${formatBsAmount(previewBs)}`
                    : undefined))
              }
              fullWidth
              required
              inputProps={{ min: 0, step: '0.01' }}
              disabled={isEditing && (hasAbonos || isPaid)}
            />

            {showTasaSection && (
              <Box
                sx={{
                  p: 2,
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: 'divider',
                  bgcolor: (theme) =>
                    theme.palette.mode === 'dark'
                      ? 'rgba(59, 130, 246, 0.06)'
                      : 'rgba(59, 130, 246, 0.04)',
                }}
              >
                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.5 }}>
                  Tasa
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
                  {!canEditTasa
                    ? 'Tasa fija: ya no se puede modificar porque hay pagos registrados.'
                    : (activeRate > 0
                      ? `Tasa del día: ${activeRate.toLocaleString('es-VE', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })} Bs/$. Puedes ajustarla si negociaste otra.`
                      : 'Ingresa la tasa Bs/$ a usar en esta cuenta.')}
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <TextField
                    label="Tasa (Bs/$)"
                    name="tasaCambio"
                    type="number"
                    value={formData.tasaCambio}
                    onChange={handleChange}
                    error={Boolean(errors.tasaCambio)}
                    helperText={errors.tasaCambio}
                    required={canEditTasa}
                    disabled={!canEditTasa}
                    sx={{ flex: 1, minWidth: 180 }}
                    inputProps={{ min: 0, step: '0.01' }}
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <Typography variant="caption" color="text.secondary" fontWeight={700}>
                            Bs/$
                          </Typography>
                        </InputAdornment>
                      ),
                    }}
                  />
                  {canEditTasa && (
                    <Button
                      variant="outlined"
                      onClick={handleUseDayRate}
                      disabled={!(activeRate > 0) || loading}
                      sx={{ mt: 0.5, textTransform: 'none', whiteSpace: 'nowrap' }}
                    >
                      Usar tasa del día
                    </Button>
                  )}
                </Box>
              </Box>
            )}

            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Fecha de emisión"
                  name="fechaEmision"
                  type="date"
                  value={formData.fechaEmision}
                  onChange={handleChange}
                  error={Boolean(errors.fechaEmision)}
                  helperText={errors.fechaEmision}
                  fullWidth
                  required
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label={isReceivable ? 'Fecha acordada para el pago' : 'Fecha de vencimiento'}
                  name="fechaVencimiento"
                  type="date"
                  value={formData.fechaVencimiento}
                  onChange={handleChange}
                  error={Boolean(errors.fechaVencimiento)}
                  helperText={errors.fechaVencimiento}
                  fullWidth
                  required={isReceivable}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
            </Grid>

            <TextField
              label="Observaciones"
              name="observaciones"
              value={formData.observaciones}
              onChange={handleChange}
              fullWidth
              multiline
              minRows={2}
            />

            {isEditing && (
              <Typography variant="caption" color="text.secondary">
                Saldo pendiente actual: {formatUsd(account?.montoPendiente || 0)}
                {pendienteBsLabel ? ` (${pendienteBsLabel})` : ''}
              </Typography>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button type="submit" variant="contained" disabled={loading}>
            {loading ? 'Guardando...' : (isEditing ? 'Guardar cambios' : 'Crear cuenta')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
