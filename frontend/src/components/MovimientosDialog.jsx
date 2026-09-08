import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Box,
  Chip,
  CircularProgress,
  Button,
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import { getMovimientos } from '../services/stockService';
import useAuthStore from '../store/useAuthStore';

export default function MovimientosDialog({ open, onClose, product }) {
  const [movimientos, setMovimientos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastDocId, setLastDocId] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const { userProfile } = useAuthStore();

  useEffect(() => {
    if (open && product?.id && userProfile?.empresaId) {
      loadMovimientos(true);
    }
    if (!open) {
      setMovimientos([]);
      setLastDocId(null);
      setHasMore(false);
    }
  }, [open, product?.id]);

  const loadMovimientos = async (reset) => {
    if (reset) setLoading(true);
    else setLoadingMore(true);
    try {
      const data = await getMovimientos(product.id, userProfile.empresaId, {
        lastDocId: reset ? null : lastDocId,
        limit: 30
      });
      const page = Array.isArray(data) ? data : (data.movimientos || []);
      setMovimientos((prev) => (reset ? page : [...prev, ...page]));
      setLastDocId(data.lastDocId || null);
      setHasMore(Boolean(data.hasMore));
    } catch (error) {
      console.error('Error loading movimientos:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return '-';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return new Intl.DateTimeFormat('es', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
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
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Historial de Movimientos
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {product?.nombre}
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={36} sx={{ color: '#6C63FF' }} />
          </Box>
        ) : movimientos.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography color="text.secondary">
              No hay movimientos registrados para este producto.
            </Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Fecha</TableCell>
                  <TableCell>Tipo</TableCell>
                  <TableCell align="right">Cantidad</TableCell>
                  <TableCell align="right">Stock Anterior</TableCell>
                  <TableCell align="right">Stock Nuevo</TableCell>
                  <TableCell>Notas</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {movimientos.map((mov) => (
                  <TableRow key={mov.id} hover>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {formatDate(mov.fecha)}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={mov.tipo === 'incremento' ? 'Entrada' : 'Salida'}
                        size="small"
                        sx={{
                          backgroundColor: mov.tipo === 'incremento'
                            ? 'rgba(0, 217, 166, 0.12)'
                            : 'rgba(255, 82, 82, 0.12)',
                          color: mov.tipo === 'incremento' ? '#00D9A6' : '#FF5252',
                          fontWeight: 600,
                        }}
                      />
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      {mov.tipo === 'incremento' ? '+' : '-'}{mov.cantidad}
                    </TableCell>
                    <TableCell align="right">{mov.stockAnterior ?? '-'}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      {mov.stockNuevo ?? '-'}
                    </TableCell>
                    <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {mov.notas || '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
        {hasMore && !loading && (
          <Box sx={{ textAlign: 'center', py: 2 }}>
            <Button
              onClick={() => loadMovimientos(false)}
              disabled={loadingMore}
              sx={{ fontWeight: 700 }}
            >
              {loadingMore ? 'Cargando...' : 'Cargar más'}
            </Button>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}
