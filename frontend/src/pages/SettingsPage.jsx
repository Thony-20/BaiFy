import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Button,
  Divider,
  Chip,
  Avatar,
  useTheme,
  CircularProgress,
  IconButton,
} from '@mui/material';
import {
  WorkspacePremium as WorkspacePremiumIcon,
  Autorenew as RenewIcon,
  TimerOff as TimerOffIcon,
  Person as PersonIcon,
  Business as BusinessIcon,
  Email as EmailIcon,
  EmojiEvents as PremiumIcon,
  Phone as PhoneIcon,
  LocationOn as LocationIcon,
  Badge as BadgeIcon,
  Save as SaveIcon,
  PhotoCamera as PhotoCameraIcon,
} from '@mui/icons-material';
import { PRODUCT_STATES, USER_ROLES } from '../utils/constants';
import useAuthStore from '../store/useAuthStore';
import UpgradePlanModal from '../components/UpgradePlanModal';
import { recalculateStats } from '../services/stockService';
import { Alert, Snackbar, TextField, MenuItem } from '@mui/material';
import { API_URL, apiFetch, getHeaders } from '../services/api';
import { compressImage } from '../utils/compressImage';

/**
 * Calcula los días restantes de suscripción.
 * Retorna null si no hay fecha, un número negativo si ya expiró, o positivo si aún vigente.
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

export default function SettingsPage() {
  const theme = useTheme();
  const { userProfile, setUserProfile } = useAuthStore();
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [renewalModalOpen, setRenewalModalOpen] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef(null);

  // Estados para datos de facturación
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    rif: '',
    direccion: '',
    telefono: ''
  });

  // Sincronizar datos cuando el perfil cargue
  useEffect(() => {
    if (userProfile) {
      setFormData({
        rif: userProfile.rif || '',
        direccion: userProfile.direccion || '',
        telefono: userProfile.telefono || ''
      });
    }
  }, [userProfile]);

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const response = await apiFetch(`${API_URL}/auth/company-settings`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          empresaId: userProfile.empresaId,
          settings: formData
        })
      });

      if (!response.ok) throw new Error('Error al guardar configuración');

      const data = await response.json();

      // Actualizar perfil localmente
      const newProfile = {
        ...userProfile,
        ...formData
      };
      setUserProfile(newProfile);
      localStorage.setItem('profile', JSON.stringify(newProfile));

      setSnackbar({ open: true, message: 'Datos actualizados correctamente', severity: 'success' });
      setIsEditing(false);
    } catch (error) {
      setSnackbar({ open: true, message: error.message, severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const persistFotoEmpresa = async (fotoEmpresa) => {
    if (!userProfile?.empresaId) {
      throw new Error('No hay una empresa asignada');
    }

    const response = await apiFetch(`${API_URL}/auth/company-settings`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        empresaId: userProfile.empresaId,
        settings: { fotoEmpresa }
      })
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Error al guardar la foto');
    }

    const newProfile = {
      ...userProfile,
      fotoEmpresa
    };
    setUserProfile(newProfile);
    localStorage.setItem('profile', JSON.stringify(newProfile));
  };

  const handlePhotoChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setUploadingPhoto(true);
    try {
      const fotoEmpresa = await compressImage(file);
      await persistFotoEmpresa(fotoEmpresa);
      setSnackbar({ open: true, message: 'Foto de la empresa actualizada', severity: 'success' });
    } catch (error) {
      setSnackbar({ open: true, message: error.message, severity: 'error' });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleRemovePhoto = async () => {
    setUploadingPhoto(true);
    try {
      await persistFotoEmpresa('');
      setSnackbar({ open: true, message: 'Foto de la empresa eliminada', severity: 'success' });
    } catch (error) {
      setSnackbar({ open: true, message: error.message, severity: 'error' });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const isSuperAdmin = userProfile?.rol === 'super-admin';
  const isFreeUser = !userProfile?.planId || userProfile?.planId === 'free';

  const daysRemaining = useMemo(() => {
    if (isSuperAdmin || isFreeUser) return null;
    return getDaysRemaining(userProfile?.subscriptionEndsAt);
  }, [userProfile?.subscriptionEndsAt, isSuperAdmin, isFreeUser]);

  const isExpired = daysRemaining !== null && daysRemaining <= 0;

  // Nombre legible del plan
  const planDisplayName = (() => {
    const p = userProfile?.planId || 'free';
    return p === 'free' ? 'Bronce' : p === 'standard' ? 'Plata' : p === 'premium' ? 'Oro' : 'Diamante';
  })();

  const planColor = (() => {
    const p = userProfile?.planId || 'free';
    if (p === 'free') return '#CD7F32';
    if (p === 'standard') return '#C0C0C0';
    if (p === 'premium') return '#FFD700';
    return '#E5E4E2'; // Diamond
  })();

  return (
    <Box sx={{ maxWidth: 1000, mx: 'auto', py: 2 }}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" sx={{ fontWeight: 900, mb: 1 }}>
          Configuración de la Cuenta
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Gestiona tu perfil, empresa y plan de suscripción.
        </Typography>
      </Box>

      <Grid container spacing={4}>
        {/* Sección de Perfil */}
        <Grid item xs={12} md={6}>
          <Card sx={{
            borderRadius: '24px',
            border: `1px solid ${theme.palette.divider}`,
            height: '100%',
            overflow: 'hidden'
          }}>
            <Box sx={{ height: 100, background: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)' }} />
            <CardContent sx={{ mt: -6, px: 4, pb: 4 }}>
              <Box sx={{ position: 'relative', width: 100, mb: 1 }}>
                <Avatar
                  src={userProfile?.fotoEmpresa || undefined}
                  sx={{
                    width: 100,
                    height: 100,
                    bgcolor: theme.palette.background.paper,
                    border: `4px solid ${theme.palette.background.default}`,
                    fontSize: '2.5rem',
                    fontWeight: 700,
                    boxShadow: theme.shadows[4],
                    overflow: 'hidden',
                    '& .MuiAvatar-img': {
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                    }
                  }}
                >
                  {(userProfile?.empresaNombre || userProfile?.email || 'U').charAt(0).toUpperCase()}
                </Avatar>
                <IconButton
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingPhoto}
                  aria-label="Cambiar foto de la empresa"
                  sx={{
                    position: 'absolute',
                    bottom: 0,
                    right: 0,
                    width: 34,
                    height: 34,
                    bgcolor: '#3B82F6',
                    color: '#fff',
                    border: `2px solid ${theme.palette.background.default}`,
                    '&:hover': { bgcolor: '#2563EB' },
                    '&.Mui-disabled': { bgcolor: '#3B82F6', color: '#fff' }
                  }}
                >
                  {uploadingPhoto ? <CircularProgress size={16} color="inherit" /> : <PhotoCameraIcon sx={{ fontSize: 16 }} />}
                </IconButton>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  hidden
                  onChange={handlePhotoChange}
                />
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <Button
                  size="small"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingPhoto}
                  sx={{ textTransform: 'none', fontWeight: 600, px: 0 }}
                >
                  {userProfile?.fotoEmpresa ? 'Cambiar foto' : 'Agregar foto de la empresa'}
                </Button>
                {userProfile?.fotoEmpresa && (
                  <Button
                    size="small"
                    color="error"
                    onClick={handleRemovePhoto}
                    disabled={uploadingPhoto}
                    sx={{ textTransform: 'none', fontWeight: 600 }}
                  >
                    Quitar
                  </Button>
                )}
              </Box>

              <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.5 }}>
                {userProfile?.empresaNombre || 'Sin nombre de empresa'}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                {userProfile?.rol === 'super-admin' ? 'Administrador Maestro' : 'Cliente Stockly'}
              </Typography>

              <Divider sx={{ mb: 3, opacity: 0.1 }} />

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Box sx={{ p: 1, borderRadius: '10px', bgcolor: 'rgba(59, 130, 246, 0.1)', color: '#3B82F6' }}>
                    <EmailIcon fontSize="small" />
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary" display="block">Correo Electrónico</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{userProfile?.email}</Typography>
                  </Box>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Box sx={{ p: 1, borderRadius: '10px', bgcolor: 'rgba(0, 217, 166, 0.1)', color: '#00D9A6' }}>
                    <BusinessIcon fontSize="small" />
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary" display="block">Empresa ID</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{userProfile?.empresaId || 'No asignado'}</Typography>
                  </Box>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Sección de Suscripción */}
        <Grid item xs={12} md={6}>
          <Card sx={{
            borderRadius: '24px',
            border: `1px solid ${theme.palette.divider}`,
            height: '100%',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <CardContent sx={{ p: 4 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 4 }}>
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 800, mb: 0.5 }}>
                    Tu Suscripción
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Estado actual del servicio
                  </Typography>
                </Box>
                <Box
                  sx={{
                    p: 1.5,
                    borderRadius: '16px',
                    bgcolor: 'rgba(255, 215, 0, 0.1)',
                    color: planColor
                  }}
                >
                  <PremiumIcon />
                </Box>
              </Box>

              <Box sx={{
                p: 3,
                borderRadius: '20px',
                bgcolor: theme.palette.action.hover,
                border: `1px solid ${theme.palette.divider}`,
                mb: 4
              }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>Plan Actual</Typography>
                  <Chip
                    label={planDisplayName}
                    sx={{
                      fontWeight: 900,
                      bgcolor: `${planColor}22`,
                      color: planColor,
                      border: `1px solid ${planColor}44`,
                      textTransform: 'uppercase',
                      letterSpacing: '1px',
                      fontSize: '0.75rem'
                    }}
                  />
                </Box>

                <Box sx={{ mt: 1.5 }}>
                  <Typography variant="body2" color="text.secondary">
                    Vencimiento <strong style={{ color: isExpired ? '#FF5252' : '#00D9A6' }}>
                      {isSuperAdmin ? 'Ilimitado' : (isExpired ? 'Expirado' : `${daysRemaining || 0} días restantes`)}
                    </strong>
                  </Typography>
                </Box>
              </Box>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {!isSuperAdmin && (
                  <Button
                    fullWidth
                    variant="contained"
                    startIcon={<WorkspacePremiumIcon />}
                    onClick={() => setUpgradeModalOpen(true)}
                    sx={{
                      borderRadius: '14px',
                      py: 1.5,
                      textTransform: 'none',
                      fontWeight: 700,
                      background: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
                      boxShadow: '0 4px 14px rgba(108, 99, 255, 0.3)',
                      '&:hover': {
                        background: 'linear-gradient(135deg, #7A72FF 0%, #5D55D3 100%)',
                        transform: 'translateY(-1px)',
                      },
                      transition: 'all 0.2s'
                    }}
                  >
                    Mejorar Plan
                  </Button>
                )}

                {!isSuperAdmin && !isFreeUser && (
                  <Button
                    fullWidth
                    variant="outlined"
                    startIcon={<RenewIcon />}
                    onClick={() => setRenewalModalOpen(true)}
                    sx={{
                      borderRadius: '14px',
                      py: 1.5,
                      textTransform: 'none',
                      fontWeight: 700,
                      borderColor: 'rgba(0, 217, 166, 0.3)',
                      color: '#00D9A6',
                      '&:hover': {
                        borderColor: '#00D9A6',
                        bgcolor: 'rgba(0, 217, 166, 0.05)',
                        transform: 'translateY(-1px)',
                      },
                      transition: 'all 0.2s'
                    }}
                  >
                    Renovar Suscripción
                  </Button>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert severity={snackbar.severity} sx={{ borderRadius: '12px', fontWeight: 600 }}>
          {snackbar.message}
        </Alert>
      </Snackbar>

      {/* Modales */}
      <UpgradePlanModal
        open={upgradeModalOpen}
        onClose={() => setUpgradeModalOpen(false)}
        currentPlan={userProfile?.planId}
      />

      <UpgradePlanModal
        open={renewalModalOpen}
        onClose={() => setRenewalModalOpen(false)}
        currentPlan={userProfile?.planId}
        renewalMode={true}
      />

    </Box>
  );
}
