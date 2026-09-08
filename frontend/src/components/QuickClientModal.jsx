import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  Alert,
} from '@mui/material';
import { createClient } from '../services/clientService';

const normalizeCedula = (value) => String(value || '').replace(/\D/g, '');
const normalizePhone = (value) => String(value || '').replace(/\D/g, '');

export default function QuickClientModal({
  open,
  onClose,
  onCreated,
  empresaId,
  initialCedula = '',
}) {
  const [nombre, setNombre] = useState('');
  const [cedula, setCedula] = useState('');
  const [telefono, setTelefono] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setNombre('');
      setCedula(normalizeCedula(initialCedula));
      setTelefono('');
      setError('');
      setLoading(false);
    }
  }, [open, initialCedula]);

  const handleSubmit = async () => {
    const name = String(nombre || '').trim();
    const ci = normalizeCedula(cedula);
    const phone = normalizePhone(telefono);

    if (!name) {
      setError('Nombre y apellido son requeridos');
      return;
    }
    if (ci.length < 5) {
      setError('La cédula debe tener al menos 5 dígitos');
      return;
    }
    if (!empresaId) {
      setError('empresaId no disponible');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const client = await createClient({
        empresaId,
        nombre: name,
        clienteId: ci,
        telefono: phone,
        limiteCredito: 0,
      });
      onCreated?.(client);
      onClose?.();
    } catch (err) {
      setError(err.message || 'No se pudo registrar el cliente');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={loading ? undefined : onClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{ sx: { borderRadius: '18px' } }}
    >
      <DialogTitle sx={{ fontWeight: 800, pb: 1 }}>
        Registrar cliente
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Completa los datos para vincular esta cédula a las ventas.
        </Typography>
        {error ? (
          <Alert severity="error" sx={{ mb: 2, borderRadius: '12px' }}>
            {error}
          </Alert>
        ) : null}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            label="Nombre y apellido"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
            fullWidth
            autoFocus
            InputProps={{ sx: { borderRadius: '12px', fontWeight: 700 } }}
          />
          <TextField
            label="Cédula / DNI"
            value={cedula}
            onChange={(e) => setCedula(normalizeCedula(e.target.value))}
            required
            fullWidth
            inputProps={{ inputMode: 'numeric' }}
            helperText="Identificador único (mín. 5 dígitos)"
            InputProps={{ sx: { borderRadius: '12px', fontWeight: 700 } }}
          />
          <TextField
            label="Teléfono celular"
            value={telefono}
            onChange={(e) => setTelefono(normalizePhone(e.target.value))}
            fullWidth
            inputProps={{ inputMode: 'tel' }}
            InputProps={{ sx: { borderRadius: '12px', fontWeight: 700 } }}
          />
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
        <Button onClick={onClose} disabled={loading} sx={{ fontWeight: 700 }}>
          Cancelar
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={loading}
          sx={{
            borderRadius: '12px',
            fontWeight: 800,
            textTransform: 'none',
            bgcolor: '#3B82F6',
            '&:hover': { bgcolor: '#2563EB' },
          }}
        >
          {loading ? 'Guardando...' : 'Guardar cliente'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
