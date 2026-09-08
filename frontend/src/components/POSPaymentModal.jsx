import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  TextField,
  MenuItem,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Alert,
  CircularProgress,
  InputAdornment,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Payments as PaymentsIcon,
  AccountBalance as BankIcon,
  CreditCard as CardIcon,
  Smartphone as MobileIcon,
  Fingerprint as FingerprintIcon,
  Handshake as HandshakeIcon,
  History as HistoryIcon,
  PersonAdd as PersonAddIcon,
} from '@mui/icons-material';
import { getClientCreditHistory } from '../services/accountService';
import { getClientByCedula } from '../services/clientService';
import ClientCreditHistoryModal from './ClientCreditHistoryModal';
import QuickClientModal from './QuickClientModal';
import { formatUsd } from '../utils/accountMoney';

const PAYMENT_METHODS = [
  { id: 'cash-bs', label: 'Efectivo Bs', icon: <PaymentsIcon /> },
  { id: 'cash-usd', label: 'Efectivo USD', icon: <PaymentsIcon /> },
  { id: 'transfer', label: 'Transferencia', icon: <BankIcon /> },
  { id: 'mobile', label: 'Pago Móvil', icon: <MobileIcon /> },
  { id: 'card', label: 'Punto de venta', icon: <CardIcon /> },
  { id: 'biopago', label: 'Biopago', icon: <FingerprintIcon /> },
  { id: 'prestamo', label: 'Préstamo', icon: <HandshakeIcon /> },
];

const isUsdMethod = (methodId) => methodId === 'cash-usd' || methodId === 'prestamo';

const normalizeCedula = (value) => String(value || '').replace(/\D/g, '');

const todayISO = () => new Date().toISOString().split('T')[0];

export default function POSPaymentModal({
  open,
  onClose,
  total,
  onConfirm,
  loading,
  exchangeRate,
  empresaId,
}) {
  const [payments, setPayments] = useState([]);
  const [currentMethod, setCurrentMethod] = useState('cash-bs');
  const [currentAmount, setCurrentAmount] = useState('');
  const [clienteNombre, setClienteNombre] = useState('');
  const [cedula, setCedula] = useState('');
  const [clienteTelefono, setClienteTelefono] = useState('');
  const [registeredClient, setRegisteredClient] = useState(null);
  const [clientLookupDone, setClientLookupDone] = useState(false);
  const [clientLoading, setClientLoading] = useState(false);
  const [quickClientOpen, setQuickClientOpen] = useState(false);
  const [fechaAcordada, setFechaAcordada] = useState('');
  const [error, setError] = useState('');
  const [creditPreview, setCreditPreview] = useState(null);
  const [creditLoading, setCreditLoading] = useState(false);
  const [creditOpen, setCreditOpen] = useState(false);
  const creditLookupRef = useRef(0);
  const clientLookupRef = useRef(0);

  const payableTotal = Math.max(0, Math.round(total * 100) / 100);

  const totalPaid = payments.reduce((sum, p) => sum + parseFloat(p.amountUSD), 0);
  const remaining = Math.max(0, payableTotal - totalPaid);
  const hasPrestamo = payments.some((p) => p.method === 'prestamo') || currentMethod === 'prestamo';
  const cedulaNorm = normalizeCedula(cedula);

  useEffect(() => {
    if (open) {
      setPayments([]);
      setCurrentMethod('cash-bs');
      setCurrentAmount((total * exchangeRate).toFixed(2));
      setClienteNombre('');
      setCedula('');
      setClienteTelefono('');
      setRegisteredClient(null);
      setClientLookupDone(false);
      setClientLoading(false);
      setQuickClientOpen(false);
      setFechaAcordada('');
      setError('');
      setCreditPreview(null);
      setCreditLoading(false);
      setCreditOpen(false);
    }
  }, [open, total, exchangeRate]);

  useEffect(() => {
    if (isUsdMethod(currentMethod)) {
      setCurrentAmount(remaining.toFixed(2));
    } else {
      setCurrentAmount((remaining * exchangeRate).toFixed(2));
    }
  }, [currentMethod, remaining, exchangeRate]);

  // Lookup catálogo clientes (siempre, cédula opcional)
  useEffect(() => {
    if (!open || !empresaId) return undefined;

    if (cedulaNorm.length < 5) {
      setRegisteredClient(null);
      setClientLookupDone(false);
      setClientLoading(false);
      return undefined;
    }

    const lookupId = ++clientLookupRef.current;
    setClientLoading(true);
    setClientLookupDone(false);

    const timer = setTimeout(async () => {
      try {
        const result = await getClientByCedula(empresaId, cedulaNorm);
        if (clientLookupRef.current !== lookupId) return;
        if (result?.exists && result.client) {
          setRegisteredClient(result.client);
          setClienteNombre(result.client.nombre || '');
          setClienteTelefono(result.client.telefono || '');
        } else {
          setRegisteredClient(null);
          setQuickClientOpen(true);
        }
        setClientLookupDone(true);
      } catch {
        if (clientLookupRef.current !== lookupId) return;
        setRegisteredClient(null);
        setClientLookupDone(true);
      } finally {
        if (clientLookupRef.current === lookupId) {
          setClientLoading(false);
        }
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [open, empresaId, cedulaNorm]);

  // Historial crediticio (CxC) cuando hay préstamo
  useEffect(() => {
    if (!open || !hasPrestamo || !empresaId) return undefined;

    if (cedulaNorm.length < 5) {
      setCreditPreview(null);
      setCreditLoading(false);
      return undefined;
    }

    const lookupId = ++creditLookupRef.current;
    setCreditLoading(true);

    const timer = setTimeout(async () => {
      try {
        const history = await getClientCreditHistory(empresaId, cedulaNorm);
        if (creditLookupRef.current !== lookupId) return;
        setCreditPreview(history);
        if (history?.exists && history.clienteNombre && !registeredClient) {
          setClienteNombre((prev) => (String(prev || '').trim() ? prev : history.clienteNombre));
        }
      } catch {
        if (creditLookupRef.current !== lookupId) return;
        setCreditPreview(null);
      } finally {
        if (creditLookupRef.current === lookupId) {
          setCreditLoading(false);
        }
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [open, hasPrestamo, empresaId, cedulaNorm, registeredClient]);

  const handleAddPayment = () => {
    const entered = parseFloat(currentAmount);
    if (!entered || entered <= 0) {
      setError('Monto inválido');
      return;
    }

    if (currentMethod === 'prestamo') {
      if (!String(clienteNombre || '').trim()) {
        setError('El nombre del cliente es obligatorio para Préstamo');
        return;
      }
      if (cedulaNorm.length < 5) {
        setError('La cédula de identidad es obligatoria (mín. 5 dígitos)');
        return;
      }
      if (
        creditPreview?.exists
        && creditPreview.clienteNombre
        && String(clienteNombre).trim().toLowerCase().replace(/\s+/g, ' ')
          !== String(creditPreview.clienteNombre).trim().toLowerCase().replace(/\s+/g, ' ')
      ) {
        setError(`Esta CI pertenece a "${creditPreview.clienteNombre}"`);
        return;
      }
      if (!String(fechaAcordada || '').trim()) {
        setError('La fecha acordada para el pago es obligatoria');
        return;
      }
      if (fechaAcordada < todayISO()) {
        setError('La fecha acordada no puede ser anterior a hoy');
        return;
      }
    }

    const amountUSD = isUsdMethod(currentMethod) ? entered : entered / exchangeRate;

    if (amountUSD > remaining + 0.01) {
      setError('El monto supera el total pendiente');
      return;
    }

    const methodLabel = PAYMENT_METHODS.find((m) => m.id === currentMethod)?.label;
    setPayments([
      ...payments,
      {
        method: currentMethod,
        label: methodLabel,
        amountUSD: amountUSD.toFixed(2),
        amountOriginal: entered.toFixed(2),
        currency: isUsdMethod(currentMethod) ? '$' : 'Bs.',
      },
    ]);

    setError('');
  };

  const handleRemovePayment = (index) => {
    setPayments(payments.filter((_, i) => i !== index));
  };

  const buildClientePayload = () => {
    if (cedulaNorm.length >= 5) {
      const nombre = String(clienteNombre || registeredClient?.nombre || '').trim();
      const payload = {
        nombre: nombre || 'Cliente',
        cedula: cedulaNorm,
        clienteId: cedulaNorm,
      };
      const phone = String(clienteTelefono || registeredClient?.telefono || '').replace(/\D/g, '');
      if (phone) payload.telefono = phone;
      return payload;
    }
    return { nombre: 'Cliente General' };
  };

  const handleConfirm = () => {
    if (Math.abs(totalPaid - payableTotal) > 0.01) {
      setError('El monto pagado no coincide con el total');
      return;
    }

    if (cedulaNorm.length < 5) {
      setError('La cédula del cliente es obligatoria (mín. 5 dígitos)');
      return;
    }

    if (clientLoading) {
      setError('Espera a que termine la búsqueda del cliente');
      return;
    }

    const prestamoPayments = payments.filter((p) => p.method === 'prestamo');
    let cliente = buildClientePayload();

    if (prestamoPayments.length > 0) {
      const nombre = String(clienteNombre || registeredClient?.nombre || '').trim();
      if (!nombre) {
        setError('El nombre del cliente es obligatorio para Préstamo. Registra al cliente o escribe el nombre.');
        if (!registeredClient) setQuickClientOpen(true);
        return;
      }
      if (
        creditPreview?.exists
        && creditPreview.clienteNombre
        && nombre.toLowerCase().replace(/\s+/g, ' ')
          !== String(creditPreview.clienteNombre).trim().toLowerCase().replace(/\s+/g, ' ')
      ) {
        setError(`Esta CI pertenece a "${creditPreview.clienteNombre}"`);
        return;
      }
      if (!String(fechaAcordada || '').trim()) {
        setError('La fecha acordada para el pago es obligatoria');
        return;
      }
      if (fechaAcordada < todayISO()) {
        setError('La fecha acordada no puede ser anterior a hoy');
        return;
      }
      cliente = {
        ...cliente,
        nombre,
        cedula: cedulaNorm,
        clienteId: cedulaNorm,
        fechaVencimiento: fechaAcordada,
      };
    } else if (registeredClient?.nombre) {
      cliente.nombre = registeredClient.nombre;
      if (registeredClient.telefono) cliente.telefono = registeredClient.telefono;
    }

    const finalPayments = payments.map((p) => ({
      method: p.method,
      label: p.label,
      amount: p.amountUSD,
    }));

    onConfirm(finalPayments, cliente);
  };

  const showRegisterCta =
    clientLookupDone
    && !registeredClient
    && cedulaNorm.length >= 5
    && !clientLoading;

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '24px', p: 1 } }}>
        <DialogTitle sx={{ fontWeight: 900, textAlign: 'center', pb: 0, fontSize: '1.5rem' }}>
          Procesar Pago
        </DialogTitle>
        <DialogContent>
          <Box sx={{ textAlign: 'center', my: 3, p: 3, borderRadius: '20px', bgcolor: 'rgba(59, 130, 246, 0.05)', border: '1px solid rgba(59, 130, 246, 0.1)' }}>
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'baseline', gap: 1 }}>
              <Typography variant="h3" sx={{ fontWeight: 900, color: '#3B82F6' }}>
                ${payableTotal.toFixed(2)}
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 700, color: 'text.secondary', opacity: 0.8 }}>
                / Bs. {(payableTotal * exchangeRate).toLocaleString()}
              </Typography>
            </Box>
            <Typography variant="caption" sx={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'text.secondary' }}>
              Total a cobrar
            </Typography>
          </Box>

          {/* Cliente (opcional) */}
          <Box
            sx={{
              mb: 2,
              p: 2,
              borderRadius: '16px',
              border: '1px solid',
              borderColor: 'divider',
              bgcolor: (theme) =>
                theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
            }}
          >
            <Typography
              variant="caption"
              sx={{
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'text.secondary',
                display: 'block',
                mb: 1.5,
              }}
            >
              Cliente (obligatorio)
            </Typography>
            <TextField
              label="Cédula / DNI"
              value={cedula}
              onChange={(e) => {
                setCedula(normalizeCedula(e.target.value));
                setError('');
              }}
              required
              fullWidth
              placeholder="Ej: 12345678"
              helperText="Obligatoria en todas las ventas (mín. 5 dígitos)"
              inputProps={{ inputMode: 'numeric', pattern: '[0-9]*' }}
              InputProps={{
                sx: { borderRadius: '12px', fontWeight: 700 },
                endAdornment: clientLoading ? (
                  <InputAdornment position="end">
                    <CircularProgress size={16} />
                  </InputAdornment>
                ) : null,
              }}
            />
            {registeredClient ? (
              <Alert severity="success" sx={{ mt: 1.5, borderRadius: '12px' }}>
                <Typography variant="body2" fontWeight={700}>
                  {registeredClient.nombre}
                </Typography>
                {registeredClient.telefono ? (
                  <Typography variant="caption" display="block">
                    Tel: {registeredClient.telefono}
                  </Typography>
                ) : null}
              </Alert>
            ) : null}
            {showRegisterCta ? (
              <Button
                fullWidth
                variant="outlined"
                startIcon={<PersonAddIcon />}
                onClick={() => setQuickClientOpen(true)}
                sx={{
                  mt: 1.5,
                  borderRadius: '12px',
                  textTransform: 'none',
                  fontWeight: 800,
                  borderColor: 'rgba(59, 130, 246, 0.4)',
                }}
              >
                Registrar cliente con esta cédula
              </Button>
            ) : null}
          </Box>

          {hasPrestamo && (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                gap: 2,
                mb: 2,
                p: 2,
                borderRadius: '16px',
                border: '1px solid',
                borderColor: 'rgba(245, 158, 11, 0.35)',
                bgcolor: 'rgba(245, 158, 11, 0.06)',
              }}
            >
              <TextField
                label="Nombre del cliente"
                value={clienteNombre}
                onChange={(e) => setClienteNombre(e.target.value)}
                required
                fullWidth
                disabled={Boolean(registeredClient)}
                helperText={
                  registeredClient
                    ? 'Tomado del registro de clientes'
                    : creditPreview?.exists
                      ? 'Debe coincidir con el nombre registrado para esta CI'
                      : undefined
                }
                InputProps={{ sx: { borderRadius: '12px', fontWeight: 700 } }}
                sx={{ gridColumn: { xs: '1', sm: registeredClient ? '1 / -1' : '1' } }}
              />
              {!registeredClient ? (
                <TextField
                  label="Confirmar cédula"
                  value={cedula}
                  onChange={(e) => setCedula(normalizeCedula(e.target.value))}
                  required
                  fullWidth
                  inputProps={{ inputMode: 'numeric' }}
                  InputProps={{
                    sx: { borderRadius: '12px', fontWeight: 700 },
                    endAdornment: creditLoading ? (
                      <InputAdornment position="end">
                        <CircularProgress size={16} />
                      </InputAdornment>
                    ) : null,
                  }}
                />
              ) : null}
              <TextField
                label="Fecha acordada para el pago"
                type="date"
                value={fechaAcordada}
                onChange={(e) => setFechaAcordada(e.target.value)}
                required
                fullWidth
                inputProps={{ min: todayISO() }}
                InputLabelProps={{ shrink: true }}
                InputProps={{ sx: { borderRadius: '12px', fontWeight: 700 } }}
                sx={{ gridColumn: { xs: '1', sm: '1 / -1' } }}
              />
              {creditPreview?.exists && (
                <Alert
                  severity={creditPreview.resumen?.vencido > 0 ? 'warning' : 'info'}
                  sx={{ gridColumn: '1 / -1', borderRadius: '12px' }}
                  action={(
                    <Button
                      color="inherit"
                      size="small"
                      startIcon={<HistoryIcon />}
                      onClick={() => setCreditOpen(true)}
                      sx={{ textTransform: 'none', fontWeight: 700 }}
                    >
                      Ver historial
                    </Button>
                  )}
                >
                  {creditPreview.totalPrestamos} préstamo
                  {creditPreview.totalPrestamos === 1 ? '' : 's'} previos
                  {' · '}
                  Pendiente {formatUsd(creditPreview.resumen?.montoPendiente)}
                  {creditPreview.resumen?.vencido > 0
                    ? ` · ${creditPreview.resumen.vencido} vencido${creditPreview.resumen.vencido === 1 ? '' : 's'}`
                    : ''}
                </Alert>
              )}
            </Box>
          )}

          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 2, mb: 3 }}>
            <TextField
              select
              label="Método"
              value={currentMethod}
              onChange={(e) => setCurrentMethod(e.target.value)}
              fullWidth
              SelectProps={{ sx: { borderRadius: '12px', fontWeight: 700 } }}
            >
              {PAYMENT_METHODS.map((option) => (
                <MenuItem key={option.id} value={option.id}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, fontWeight: 700 }}>
                    {React.cloneElement(option.icon, { sx: { fontSize: 20, color: '#3B82F6' } })}
                    {option.label}
                  </Box>
                </MenuItem>
              ))}
            </TextField>

            <TextField
              label={`Monto en ${isUsdMethod(currentMethod) ? 'Dólares' : 'Bolívares'}`}
              type="number"
              value={currentAmount}
              onChange={(e) => setCurrentAmount(e.target.value)}
              fullWidth
              InputProps={{
                startAdornment: (
                  <Typography sx={{ mr: 1, fontWeight: 900, color: '#3B82F6' }}>
                    {isUsdMethod(currentMethod) ? '$' : 'Bs.'}
                  </Typography>
                ),
                sx: { borderRadius: '12px', fontWeight: 800 },
              }}
            />

            <Button
              variant="contained"
              onClick={handleAddPayment}
              sx={{ borderRadius: '12px', minWidth: 56, bgcolor: '#3B82F6', '&:hover': { bgcolor: '#2563EB' } }}
            >
              <AddIcon />
            </Button>
          </Box>

          {error && <Alert severity="error" sx={{ mb: 2, borderRadius: '12px', fontWeight: 700 }}>{error}</Alert>}

          <Typography variant="subtitle2" sx={{ fontWeight: 900, mb: 1, color: 'text.secondary', textTransform: 'uppercase', fontSize: '0.7rem' }}>
            Desglose de Pagos
          </Typography>

          <List sx={{ bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)'), borderRadius: '20px', mb: 2, overflow: 'hidden' }}>
            {payments.length === 0 ? (
              <ListItem sx={{ py: 3, justifyContent: 'center' }}>
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>Agregue un método de pago para continuar</Typography>
              </ListItem>
            ) : (
              payments.map((p, i) => (
                <ListItem key={i} divider={i !== payments.length - 1} sx={{ py: 1.5 }}>
                  <ListItemText
                    primary={p.label}
                    secondary={!isUsdMethod(p.method) ? `Equivale a $${p.amountUSD}` : null}
                    primaryTypographyProps={{ fontWeight: 800 }}
                  />
                  <Box sx={{ textAlign: 'right', mr: 2 }}>
                    <Typography sx={{ fontWeight: 900, color: '#3B82F6' }}>
                      {p.currency} {parseFloat(p.amountOriginal).toLocaleString()}
                    </Typography>
                  </Box>
                  <ListItemSecondaryAction>
                    <IconButton edge="end" onClick={() => handleRemovePayment(i)} color="error" sx={{ bgcolor: 'rgba(239, 68, 68, 0.1)', '&:hover': { bgcolor: 'rgba(239, 68, 68, 0.2)' } }}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </ListItemSecondaryAction>
                </ListItem>
              ))
            )}
          </List>

          <Box sx={{ p: 2, borderRadius: '20px', border: '1px dashed', borderColor: (theme) => theme.palette.divider }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>Pendiente por pagar:</Typography>
              <Typography variant="body2" sx={{ fontWeight: 900, color: remaining > 0.01 ? '#EF4444' : '#22C55E' }}>
                ${remaining.toFixed(2)} / Bs. {(remaining * exchangeRate).toLocaleString()}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 900 }}>Total Registrado:</Typography>
              <Typography variant="h5" sx={{ fontWeight: 900, color: '#3B82F6' }}>
                ${totalPaid.toFixed(2)}
              </Typography>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 3, gap: 1 }}>
          <Button onClick={onClose} sx={{ fontWeight: 700, color: 'text.secondary' }}>Cerrar</Button>
          <Button
            variant="contained"
            disabled={remaining > 0.01 || loading}
            onClick={handleConfirm}
            sx={{
              borderRadius: '16px',
              px: 6,
              py: 1.5,
              fontWeight: 900,
              background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
              boxShadow: '0 8px 20px rgba(37, 99, 235, 0.3)',
              '&:hover': { background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)' },
            }}
          >
            {loading ? 'Procesando...' : 'FINALIZAR VENTA'}
          </Button>
        </DialogActions>
      </Dialog>

      <ClientCreditHistoryModal
        open={creditOpen}
        onClose={() => setCreditOpen(false)}
        history={creditPreview}
        loading={false}
      />

      <QuickClientModal
        open={quickClientOpen}
        onClose={() => setQuickClientOpen(false)}
        empresaId={empresaId}
        initialCedula={cedulaNorm}
        onCreated={(client) => {
          setRegisteredClient(client);
          setCedula(client.clienteId || cedulaNorm);
          setClienteNombre(client.nombre || '');
          setClienteTelefono(client.telefono || '');
          setClientLookupDone(true);
        }}
      />
    </>
  );
}
