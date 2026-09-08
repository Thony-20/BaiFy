import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Button,
  IconButton,
  Tooltip,
  CircularProgress,
  Alert,
  Avatar,
  Tab,
  Tabs,
  TextField,
  InputAdornment,
  useTheme,
} from '@mui/material';
import {
  CheckCircle as ApproveIcon,
  Cancel as RejectIcon,
  Pending as PendingIcon,
  Business as BusinessIcon,
  Payments as PaymentIcon,
  Refresh as RefreshIcon,
  Autorenew as RenewIcon,
  Search as SearchIcon,
  Clear as ClearIcon,
} from '@mui/icons-material';
import { getPendingUsers, getAllUsers, updateUserStatus } from '../services/adminService';
import toast from 'react-hot-toast';

/**
 * Calcula los días restantes de una suscripción dada la fecha de expiración.
 */
function getDaysRemaining(subscriptionEndsAt) {
  if (!subscriptionEndsAt) return null;
  const endDate = subscriptionEndsAt._seconds
    ? new Date(subscriptionEndsAt._seconds * 1000)
    : new Date(subscriptionEndsAt);
  const now = new Date();
  const diffMs = endDate - now;
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export default function AdminPage() {
  const theme = useTheme();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [tabValue, setTabValue] = useState(0); // 0: Pendientes, 1: Todos
  const [searchQuery, setSearchQuery] = useState('');

  // Mapa legible de estados para búsqueda
  const STATUS_LABELS = {
    active: 'activo',
    pending: 'pendiente',
    rejected: 'rechazado',
    upgrade_pending: 'upgrade pendiente',
    renewal_pending: 'renovación pendiente',
  };

  const PLAN_LABELS = {
    free: 'bronce',
    standard: 'plata',
    premium: 'oro',
    diamond: 'diamante',
  };

  // Filtrar usuarios en base al texto de búsqueda
  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return users;
    const q = searchQuery.toLowerCase().trim();
    return users.filter(user => {
      const empresa = (user.empresaNombre || '').toLowerCase();
      const email = (user.email || '').toLowerCase();
      const ref = (user.paymentReference || '').toLowerCase();
      const statusLabel = (STATUS_LABELS[user.status] || user.status || '').toLowerCase();
      const planLabel = (PLAN_LABELS[user.planId] || user.planId || 'bronce').toLowerCase();
      // Fecha de registro en formato legible para búsqueda
      let fecha = '';
      if (user.createdAt) {
        const d = user.createdAt._seconds
          ? new Date(user.createdAt._seconds * 1000)
          : new Date(user.createdAt);
        fecha = d.toLocaleDateString('es-VE', { year: 'numeric', month: 'long', day: 'numeric' }).toLowerCase();
      }
      return (
        empresa.includes(q) ||
        email.includes(q) ||
        ref.includes(q) ||
        statusLabel.includes(q) ||
        planLabel.includes(q) ||
        fecha.includes(q)
      );
    });
  }, [users, searchQuery]);

  useEffect(() => {
    loadUsers();
  }, [tabValue]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = tabValue === 0 ? await getPendingUsers() : await getAllUsers();
      console.log('📦 AdminPage: Usuarios cargados:', data);
      setUsers(data);
    } catch (error) {
      console.error('Error al cargar usuarios:', error);
      toast.error('No se pudo cargar la lista de usuarios');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateObj) => {
    if (!dateObj) return 'N/A';
    // Si es un string (ISO)
    if (typeof dateObj === 'string') return new Date(dateObj).toLocaleDateString();
    // Si es un objeto de Firebase con _seconds
    if (dateObj._seconds) return new Date(dateObj._seconds * 1000).toLocaleDateString();
    // Si ya es un objeto Date
    if (dateObj instanceof Date) return dateObj.toLocaleDateString();
    return 'N/A';
  };

  const handleStatusUpdate = async (uid, newStatus) => {
    try {
      await updateUserStatus(uid, newStatus);
      toast.success(`Usuario ${newStatus === 'active' ? 'aprobado' : 'actualizado'} correctamente`);
      loadUsers();
    } catch (error) {
      console.error('Error al actualizar estado:', error);
      toast.error('No se pudo actualizar el estado del usuario');
    }
  };

  const getStatusChip = (status) => {
    const configs = {
      active: { label: 'Activo', color: 'success', icon: <ApproveIcon sx={{ fontSize: 16 }} /> },
      pending: { label: 'Pendiente', color: 'warning', icon: <PendingIcon sx={{ fontSize: 16 }} /> },
      rejected: { label: 'Rechazado', color: 'error', icon: <RejectIcon sx={{ fontSize: 16 }} /> },
      upgrade_pending: { label: 'Upgrade Pendiente', color: 'info', icon: <PendingIcon sx={{ fontSize: 16 }} /> },
      renewal_pending: { label: 'Renovación Pendiente', color: 'secondary', icon: <RenewIcon sx={{ fontSize: 16 }} /> },
    };
    const config = configs[status] || configs.pending;
    return (
      <Chip
        label={config.label}
        color={config.color}
        size="small"
        icon={config.icon}
        sx={{ fontWeight: 600, borderRadius: '8px' }}
      />
    );
  };

  const getDaysRemainingChip = (subscriptionEndsAt, planId) => {
    // Solo mostrar para planes de pago
    if (!planId || planId === 'free') return <Typography variant="body2" color="text.secondary">—</Typography>;
    
    const days = getDaysRemaining(subscriptionEndsAt);
    
    if (days === null) {
      return <Typography variant="body2" color="text.secondary">Sin fecha</Typography>;
    }

    let color, bgColor, borderColor;
    if (days <= 0) {
      color = '#FF5252';
      bgColor = 'rgba(255, 82, 82, 0.12)';
      borderColor = 'rgba(255, 82, 82, 0.25)';
    } else if (days <= 5) {
      color = '#FFA726';
      bgColor = 'rgba(255, 167, 38, 0.12)';
      borderColor = 'rgba(255, 167, 38, 0.25)';
    } else {
      color = '#00D9A6';
      bgColor = 'rgba(0, 217, 166, 0.12)';
      borderColor = 'rgba(0, 217, 166, 0.25)';
    }

    return (
      <Chip
        label={days <= 0 ? `Vencido (${Math.abs(days)}d)` : `${days} días`}
        size="small"
        sx={{
          fontWeight: 700,
          fontSize: '0.7rem',
          borderRadius: '8px',
          color,
          backgroundColor: bgColor,
          border: `1px solid ${borderColor}`,
        }}
      />
    );
  };

  return (
    <Box>
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 900, mb: 0.5 }}>
            Panel de Administración
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Gestiona los registros, renovaciones y verifica los pagos de tus clientes.
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={loadUsers}
          disabled={loading}
          sx={{ borderRadius: '12px', textTransform: 'none' }}
        >
          Refrescar
        </Button>
      </Box>

      <Card sx={{ mb: 4, borderRadius: '24px', border: `1px solid ${theme.palette.divider}` }}>
        <Tabs
          value={tabValue}
          onChange={(e, v) => setTabValue(v)}
          sx={{
            px: 2,
            pt: 1,
            borderBottom: `1px solid ${theme.palette.divider}`,
            '& .MuiTab-root': { textTransform: 'none', fontWeight: 600, minWidth: 120 }
          }}
        >
          <Tab label="Pendientes de Pago" />
          <Tab label="Todos los Usuarios" />
        </Tabs>

        {/* Barra de búsqueda */}
        <Box sx={{ px: 2.5, py: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
          <TextField
            fullWidth
            size="small"
            placeholder="Buscar por empresa, correo, estado, plan o referencia de pago..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            variant="outlined"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ color: '#9AA0B2', fontSize: 20 }} />
                </InputAdornment>
              ),
              endAdornment: searchQuery && (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setSearchQuery('')} sx={{ color: '#9AA0B2' }}>
                    <ClearIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </InputAdornment>
              ),
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: '12px',
                backgroundColor: theme.palette.action.hover,
                '& fieldset': { borderColor: theme.palette.divider },
                '&:hover fieldset': { borderColor: theme.palette.primary.light },
                '&.Mui-focused fieldset': { borderColor: theme.palette.primary.main },
              },
              '& .MuiInputBase-input::placeholder': {
                color: '#9AA0B2',
                opacity: 0.7,
              },
            }}
          />
        </Box>

        <CardContent sx={{ p: 0 }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
              <CircularProgress color="primary" />
            </Box>
          ) : filteredUsers.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 8 }}>
              <Typography color="text.secondary">
                {searchQuery ? `No se encontraron resultados para "${searchQuery}"` : 'No hay usuarios para mostrar en esta categoría.'}
              </Typography>
            </Box>
          ) : (
            <TableContainer component={Paper} elevation={0} sx={{ background: 'transparent' }}>
              <Table>
                <TableHead>
                  <TableRow sx={{ '& th': { borderBottom: `1px solid ${theme.palette.divider}`, color: theme.palette.text.secondary } }}>
                    <TableCell>Empresa / Usuario</TableCell>
                    <TableCell>Plan</TableCell>
                    <TableCell>Referencia de Pago</TableCell>
                    <TableCell>Días Restantes</TableCell>
                    <TableCell>Fecha Registro</TableCell>
                    <TableCell>Estado</TableCell>
                    <TableCell align="right">Acciones</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredUsers.map((user) => (
                    <TableRow key={user.uid} hover sx={{ '& td': { borderBottom: `1px solid ${theme.palette.divider}` } }}>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <Avatar sx={{ bgcolor: 'rgba(108, 99, 255, 0.1)', color: '#6C63FF' }}>
                            <BusinessIcon />
                          </Avatar>
                          <Box>
                            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                              {user.empresaNombre || 'N/A'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {user.email}
                            </Typography>
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="body2" sx={{ textTransform: 'capitalize', fontWeight: user.pendingPlanId ? 400 : 600, opacity: user.pendingPlanId ? 0.7 : 1 }}>
                            {user.planId || 'Bronce'}
                            </Typography>
                            {user.pendingPlanId && (
                                <>
                                    <Typography variant="caption" color="text.secondary">→</Typography>
                                    <Typography variant="body2" sx={{ textTransform: 'capitalize', fontWeight: 800, color: '#00D9A6' }}>
                                        {user.pendingPlanId}
                                    </Typography>
                                </>
                            )}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <PaymentIcon sx={{ color: '#9AA0B2', fontSize: 18 }} />
                          <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: 'monospace' }}>
                            {user.paymentReference || 'N/A'}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        {getDaysRemainingChip(user.subscriptionEndsAt, user.planId)}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {formatDate(user.createdAt)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {getStatusChip(user.status)}
                      </TableCell>
                      <TableCell align="right">
                        {user.status === 'pending' || user.status === 'upgrade_pending' || user.status === 'renewal_pending' ? (
                          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                            <Button
                              size="small"
                              variant="contained"
                              color="success"
                              onClick={() => handleStatusUpdate(user.uid, 'active')}
                              sx={{ borderRadius: '8px', textTransform: 'none' }}
                            >
                              Aprobar
                            </Button>
                            <Button
                              size="small"
                              variant="outlined"
                              color="error"
                              onClick={() => handleStatusUpdate(user.uid, 'rejected')}
                              sx={{ borderRadius: '8px', textTransform: 'none' }}
                            >
                              Rechazar
                            </Button>
                          </Box>
                        ) : (
                          <Tooltip title={user.status === 'active' ? 'Revertir a Pendiente' : 'Activar'}>
                            <IconButton 
                              size="small" 
                              onClick={() => handleStatusUpdate(user.uid, user.status === 'active' ? 'pending' : 'active')}
                            >
                              {user.status === 'active' ? <PendingIcon fontSize="small" /> : <ApproveIcon fontSize="small" />}
                            </IconButton>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      
      <Alert severity="info" sx={{ borderRadius: '16px', border: `1px solid ${theme.palette.info.main}44`, backgroundColor: `${theme.palette.info.main}11` }}>
        Como administrador, puedes ver todos los registros del sistema. Asegúrate de verificar las transferencias antes de habilitar los planes Oro o Diamante. Las renovaciones aparecerán aquí con el estado "Renovación Pendiente".
      </Alert>
    </Box>
  );
}
