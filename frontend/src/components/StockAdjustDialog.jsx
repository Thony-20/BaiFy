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
  ToggleButton,
  ToggleButtonGroup,
  IconButton,
  Alert,
} from '@mui/material';
import {
  Add as AddIcon,
  Remove as RemoveIcon,
  Close as CloseIcon,
} from '@mui/icons-material';

export default function StockAdjustDialog({ open, onClose, onSubmit, product, loading, initialTipo }) {
  const [tipo, setTipo] = useState(initialTipo || 'incremento');
  const [cantidad, setCantidad] = useState('');
  const [notas, setNotas] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setTipo(initialTipo || 'incremento');
    }
  }, [open, initialTipo]);

  const handleSubmit = () => {
    const cantidadNum = parseInt(cantidad);

    if (!cantidadNum || cantidadNum <= 0) {
      setError('Ingresa una cantidad válida mayor a 0');
      return;
    }

    if (tipo === 'reduccion' && cantidadNum > (product?.stock || 0)) {
      setError(`Stock insuficiente. Stock actual: ${product?.stock || 0}`);
      return;
    }

    setError('');
    onSubmit({ tipo, cantidad: cantidadNum, notas });
    setCantidad('');
    setNotas('');
    setTipo('incremento');
  };

  const handleClose = () => {
    setCantidad('');
    setNotas('');
    setTipo('incremento');
    setError('');
    onClose();
  };

  const newStock = product
    ? tipo === 'incremento'
      ? (product.stock || 0) + (parseInt(cantidad) || 0)
      : (product.stock || 0) - (parseInt(cantidad) || 0)
    : 0;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{
        sx: {
          background: (theme) => theme.palette.mode === 'dark' 
            ? 'linear-gradient(180deg, #141A2E 0%, #121829 100%)' 
            : 'linear-gradient(180deg, #FFFFFF 0%, #F8F9FA 100%)',
        },
      }}
    >
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          Ajustar Stock
        </Typography>
        <IconButton onClick={handleClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 1 }}>
          <Box sx={{
            textAlign: 'center',
            p: 2,
            borderRadius: 2,
            background: (theme) => theme.palette.mode === 'dark' ? 'rgba(108, 99, 255, 0.08)' : 'rgba(108, 99, 255, 0.04)',
            border: (theme) => `1px solid ${theme.palette.mode === 'dark' ? 'rgba(108, 99, 255, 0.15)' : 'rgba(108, 99, 255, 0.1)'}`,
          }}>
            <Typography variant="body2" color="text.secondary">
              {product?.nombre}
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 700, mt: 0.5 }}>
              {product?.stock || 0}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Stock actual
            </Typography>
          </Box>

          <ToggleButtonGroup
            value={tipo}
            exclusive
            onChange={(_, v) => v && setTipo(v)}
            fullWidth
            sx={{
              '& .MuiToggleButton-root': {
                borderRadius: '10px !important',
                border: (theme) => `1px solid ${theme.palette.divider} !important`,
                py: 1.2,
                '&.Mui-selected': {
                  backgroundColor: tipo === 'incremento'
                    ? 'rgba(0, 217, 166, 0.15)'
                    : 'rgba(255, 82, 82, 0.15)',
                  color: tipo === 'incremento' ? '#00D9A6' : '#FF5252',
                },
              },
            }}
          >
            <ToggleButton value="incremento">
              <AddIcon sx={{ mr: 1 }} /> Incrementar
            </ToggleButton>
            <ToggleButton value="reduccion">
              <RemoveIcon sx={{ mr: 1 }} /> Reducir
            </ToggleButton>
          </ToggleButtonGroup>

          <TextField
            label="Cantidad"
            type="number"
            value={cantidad}
            onChange={(e) => {
              setCantidad(e.target.value);
              setError('');
            }}
            inputProps={{ min: 1 }}
            fullWidth
            autoFocus
          />

          {cantidad && parseInt(cantidad) > 0 && (
            <Box sx={{
              textAlign: 'center',
              py: 1.5,
              borderRadius: 2,
              backgroundColor: newStock >= 0
                ? 'rgba(0, 217, 166, 0.08)'
                : 'rgba(255, 82, 82, 0.08)',
              border: `1px solid ${newStock >= 0 ? 'rgba(0, 217, 166, 0.2)' : 'rgba(255, 82, 82, 0.2)'}`,
            }}>
              <Typography variant="caption" color="text.secondary">
                Stock resultante
              </Typography>
              <Typography
                variant="h5"
                sx={{
                  fontWeight: 700,
                  color: newStock >= 0 ? '#00D9A6' : '#FF5252',
                }}
              >
                {newStock}
              </Typography>
            </Box>
          )}

          <TextField
            label="Notas (opcional)"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            multiline
            rows={2}
            fullWidth
            placeholder="Motivo del ajuste..."
          />

          {error && <Alert severity="error">{error}</Alert>}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={handleClose} color="inherit" sx={{ color: 'text.secondary' }}>
          Cancelar
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={loading || !cantidad}
          sx={{
            backgroundColor: tipo === 'incremento' ? '#00D9A6' : '#FF5252',
            '&:hover': {
              backgroundColor: tipo === 'incremento' ? '#00AD85' : '#E04848',
            },
            boxShadow: tipo === 'incremento'
              ? '0 4px 14px rgba(0, 217, 166, 0.3)'
              : '0 4px 14px rgba(255, 82, 82, 0.3)',
          }}
        >
          {loading ? 'Procesando...' : tipo === 'incremento' ? 'Incrementar' : 'Reducir'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
