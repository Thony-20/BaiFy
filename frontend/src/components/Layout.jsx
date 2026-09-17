import React, { useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  AppBar,
  Box,
  Button,
  CssBaseline,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  Avatar,
  Menu,
  MenuItem,
  Divider,
  Chip,
  CircularProgress,
  useMediaQuery,
  useTheme,
  Card,
  ToggleButton,
  ToggleButtonGroup,
  ListSubheader,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Dashboard as DashboardIcon,
  Inventory as InventoryIcon,
  Logout as LogoutIcon,
  Person as PersonIcon,
  Business as BusinessIcon,
  GetApp as DownloadIcon,
  AdminPanelSettings as AdminIcon,
  WorkspacePremium as WorkspacePremiumIcon,
  Autorenew as RenewIcon,
  TimerOff as TimerOffIcon,
  Assessment as AssessmentIcon,
  PointOfSale as PointOfSaleIcon,
  AccountBalance as AccountBalanceIcon,
  AttachMoney as MoneyIcon,
  GroupsOutlined as ClientsIcon,
} from '@mui/icons-material';
import { logoutUser } from '../services/authService';
import useAuthStore from '../store/useAuthStore';
import toast from 'react-hot-toast';
import UpgradePlanModal from './UpgradePlanModal';
import TechBackground from './TechBackground';
import NotificationBell from './NotificationBell';
import FloatingBaifyChat from './FloatingBaifyChat';
import useCurrencyStore from '../store/useCurrencyStore';
import useThemeStore from '../store/useThemeStore';
import {
  LightMode as LightModeIcon,
  DarkMode as DarkModeIcon,
} from '@mui/icons-material';

const DRAWER_WIDTH = 260;

const StyledThemeToggle = ({ mode, onToggle }) => {
  const isDark = mode === 'dark';

  return (
    <Box
      onClick={onToggle}
      sx={{
        width: 58,
        height: 30,
        borderRadius: 20,
        backgroundColor: isDark ? '#0A0E1A' : '#F5F7FA',
        display: 'flex',
        alignItems: 'center',
        padding: '0 4px',
        position: 'relative',
        cursor: 'pointer',
        transition: 'all 0.3s ease',
        border: '1px solid',
        borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
        boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.1)'
      }}
    >
      <Box
        sx={{
          width: 22,
          height: 22,
          borderRadius: '50%',
          backgroundColor: '#FFFFFF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'absolute',
          left: isDark ? 'calc(100% - 26px)' : '4px',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        }}
      >
        {isDark ? (
          <DarkModeIcon sx={{ fontSize: 14, color: '#2D3436' }} />
        ) : (
          <LightModeIcon sx={{ fontSize: 15, color: '#FBC02D' }} />
        )}
      </Box>
    </Box>
  );
};

const navSections = [
  {
    title: 'Inventario',
    items: [
      { text: 'Dashboard', icon: <DashboardIcon />, path: '/' },
      { text: 'Productos', icon: <InventoryIcon />, path: '/productos' },
    ]
  },
  {
    title: 'Punto de venta',
    items: [
      { text: 'Métricas de ventas', icon: <AssessmentIcon />, path: '/ventas/metricas' },
      { text: 'Punto de venta', icon: <PointOfSaleIcon />, path: '/ventas/pos' },
      { text: 'Comprobantes', icon: <AssessmentIcon />, path: '/ventas/pos/comprobantes' },
    ]
  },
  {
    title: 'Cliente',
    items: [
      { text: 'Clientes', icon: <ClientsIcon />, path: '/clientes' },
    ]
  },
  {
    title: 'Finanzas',
    items: [
      { text: 'Cuentas', icon: <AccountBalanceIcon />, path: '/cuentas' },
    ]
  },
  {
    title: 'Administración',
    adminOnly: true,
    items: [
      { text: 'Panel Admin', icon: <AdminIcon />, path: '/admin', adminOnly: true },
    ]
  }
];

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

export default function Layout({ children }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [renewalModalOpen, setRenewalModalOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { userProfile } = useAuthStore();
  const { mode, toggleTheme } = useThemeStore();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const {
    selectedCurrency,
    setCurrency,
    fetchRates,
    exchangeRate,
    euroRate,
    exchangeLoading,
  } = useCurrencyStore();

  const isSuperAdmin = userProfile?.rol === 'super-admin';
  const isFreeUser = !userProfile?.planId || userProfile?.planId === 'free';

  // Calcular si la suscripción expiró (solo para usuarios de pago)
  const daysRemaining = useMemo(() => {
    if (isSuperAdmin || isFreeUser) return null;
    return getDaysRemaining(userProfile?.subscriptionEndsAt);
  }, [userProfile?.subscriptionEndsAt, isSuperAdmin, isFreeUser]);

  const isExpired = daysRemaining !== null && daysRemaining <= 0;

  React.useEffect(() => {
    console.log('🏗️ Layout: Componente montado, activando escuchador PWA');

    // Si el evento ya se capturó globalmente en main.jsx, lo recuperamos
    if (window.deferredPrompt) {
      console.log('📢 PWA: Recuperando evento capturado desde window.deferredPrompt');
      setInstallPrompt(window.deferredPrompt);
    }

    const handleBeforeInstallPrompt = (e) => {
      console.log('📢 PWA: Evento beforeinstallprompt capturado');
      e.preventDefault();
      setInstallPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Initial fetch and setup auto-refresh every 5 mins
    fetchRates();
    const interval = setInterval(() => {
      console.log('🔄 Actualizando tasas de cambio globales...');
      fetchRates();
    }, 5 * 60 * 1000);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      clearInterval(interval);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      setInstallPrompt(null);
    }
  };

  const handleDrawerToggle = () => setMobileOpen(!mobileOpen);
  const handleMenuOpen = (e) => setAnchorEl(e.currentTarget);
  const handleMenuClose = () => setAnchorEl(null);

  const handleLogout = async () => {
    try {
      await logoutUser();
      toast.success('Sesión cerrada exitosamente');
      navigate('/login');
    } catch (error) {
      toast.error('Error al cerrar sesión');
    }
  };

  // Nombre legible del plan
  const planDisplayName = (() => {
    const p = userProfile?.planId || 'free';
    return p === 'free' ? 'Bronce' : p === 'standard' ? 'Plata' : p === 'premium' ? 'Oro' : 'Diamante';
  })();

  const drawer = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Box
          sx={{
            width: 140,
            height: 140,
            mx: 'auto',
            mb: 0,
            position: 'relative',
          }}
        >
          <Box
            component="img"
            src="/LOGO1.png"
            alt="BayFi Logo"
            sx={{
              width: '100%',
              height: '60%',
              objectFit: 'contain',
              borderRadius: '8px',
            }}
          />
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ mt: -9, display: 'block', lineHeight: 1 }}>
          Sistema administrativo
        </Typography>
      </Box>
      <Divider sx={{ borderColor: theme.palette.divider }} />
      <List sx={{ flex: 1, px: 1.5, pt: 1, '& .MuiListSubheader-root': { background: 'transparent', color: theme.palette.text.secondary, fontWeight: 700, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.1em', lineHeight: '32px', mt: 2, mb: 1, px: 2 } }}>
        {navSections.map((section, sectionIdx) => {
          if (section.adminOnly && userProfile?.rol !== 'super-admin') return null;

          return (
            <React.Fragment key={section.title || sectionIdx}>
              {section.title && (
                <ListSubheader disableSticky>
                  {section.title}
                </ListSubheader>
              )}
              {section.items
                .filter(item => !item.adminOnly || userProfile?.rol === 'super-admin')
                .map((item) => {
                  const isActive = location.pathname === item.path;
                  return (
                    <ListItem key={item.text} disablePadding sx={{ mb: 0.5 }}>
                      <ListItemButton
                        onClick={() => {
                          navigate(item.path);
                          if (isMobile) setMobileOpen(false);
                        }}
                        sx={{
                          borderRadius: '10px',
                          py: 1,
                          backgroundColor: isActive
                            ? 'rgba(59, 130, 246, 0.15)'
                            : 'transparent',
                          '&:hover': {
                            backgroundColor: isActive
                              ? 'rgba(59, 130, 246, 0.2)'
                              : theme.palette.action.hover,
                          },
                        }}
                      >
                        <ListItemIcon
                          sx={{
                            color: isActive ? '#3B82F6' : theme.palette.text.secondary,
                            minWidth: 36,
                          }}
                        >
                          {item.icon}
                        </ListItemIcon>
                        <ListItemText
                          primary={item.text}
                          sx={{
                            '& .MuiListItemText-primary': {
                              fontWeight: isActive ? 600 : 400,
                              color: isActive ? theme.palette.text.primary : theme.palette.text.secondary,
                              fontSize: '0.9rem',
                            },
                          }}
                        />
                      </ListItemButton>
                    </ListItem>
                  );
                })}
            </React.Fragment>
          );
        })}
      </List>
      <Divider sx={{ borderColor: theme.palette.divider }} />
      <Box sx={{ p: 2 }}>
        <Chip
          icon={<BusinessIcon sx={{ fontSize: 16 }} />}
          label={userProfile?.rol === 'super-admin' ? 'Súper Admin' : (userProfile?.rol === 'admin' ? 'Administrador' : 'Empleado')}
          size="small"
          sx={{
            width: '100%',
            backgroundColor: userProfile?.rol === 'super-admin' || userProfile?.rol === 'admin'
              ? 'rgba(59, 130, 246, 0.15)'
              : 'rgba(0, 217, 166, 0.15)',
            color: userProfile?.rol === 'super-admin' || userProfile?.rol === 'admin' ? '#60A5FA' : '#00D9A6',
            fontWeight: 600,
            mb: 1.5,
          }}
        />
        {installPrompt && (
          <Button
            fullWidth
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={handleInstallClick}
            sx={{
              borderColor: 'rgba(59, 130, 246, 0.3)',
              color: '#60A5FA',
              textTransform: 'none',
              borderRadius: '10px',
              '&:hover': {
                borderColor: '#3B82F6',
                backgroundColor: 'rgba(59, 130, 246, 0.04)',
              },
            }}
          >
            Instalar Aplicación
          </Button>
        )}

      </Box>

      {/* Renewal Modal (Solo para pantalla de bloqueo) */}
      <UpgradePlanModal
        open={renewalModalOpen}
        onClose={() => setRenewalModalOpen(false)}
        currentPlan={userProfile?.planId}
        renewalMode={true}
      />
    </Box>
  );

  // Pantalla de suscripción expirada (bloqueo completo)
  const renderExpiredScreen = () => (
    <Box
      sx={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: 2
      }}
    >
      <Card
        sx={{
          maxWidth: 520,
          width: '100%',
          background: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.02)' : theme.palette.background.paper,
          backdropFilter: 'blur(10px)',
          border: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(255, 82, 82, 0.3)' : 'rgba(255, 82, 82, 0.5)'}`,
          borderRadius: '24px',
          textAlign: 'center',
          p: 4
        }}
      >
        <Box
          sx={{
            width: 80,
            height: 80,
            borderRadius: '20px',
            background: 'rgba(255, 82, 82, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mx: 'auto',
            mb: 3,
            color: '#FF5252'
          }}
        >
          <TimerOffIcon sx={{ fontSize: 40 }} />
        </Box>
        <Typography variant="h5" sx={{ fontWeight: 800, mb: 1, color: '#FFF' }}>
          Suscripción Expirada
        </Typography>
        <Typography variant="body2" sx={{ color: '#9AA0B2', mb: 1 }}>
          Plan <strong style={{ color: '#8B83FF' }}>{planDisplayName}</strong>
        </Typography>
        <Typography variant="body1" sx={{ color: '#9AA0B2', mb: 4, lineHeight: 1.6 }}>
          Tu suscripción mensual ha vencido. Para seguir gestionando tu inventario, renueva tu plan realizando el pago correspondiente.
          <br /><br />
          {userProfile?.status === 'renewal_pending' ? (
            <Chip label="✓ Renovación en revisión" color="info" size="small" sx={{ fontWeight: 700 }} />
          ) : (
            <>Haz clic en <strong>"Renovar"</strong> para enviar tu comprobante de pago.</>
          )}
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
          {userProfile?.status !== 'renewal_pending' && (
            <Button
              variant="contained"
              startIcon={<RenewIcon />}
              onClick={() => setRenewalModalOpen(true)}
              sx={{
                borderRadius: '12px',
                textTransform: 'none',
                fontWeight: 700,
                px: 4,
                py: 1.2,
                background: 'linear-gradient(135deg, #00D9A6 0%, #00B88C 100%)',
                boxShadow: '0 4px 14px rgba(0, 217, 166, 0.3)',
                '&:hover': {
                  background: 'linear-gradient(135deg, #00E8B4 0%, #00C99A 100%)',
                  boxShadow: '0 6px 20px rgba(0, 217, 166, 0.4)',
                  transform: 'translateY(-1px)',
                },
                transition: 'all 0.2s ease-in-out',
              }}
            >
              Renovar Suscripción
            </Button>
          )}
          <Button
            variant="outlined"
            onClick={handleLogout}
            sx={{
              borderRadius: '12px',
              textTransform: 'none',
              borderColor: 'rgba(255, 82, 82, 0.3)',
              color: '#FF5252',
              '&:hover': {
                borderColor: '#FF5252',
                background: 'rgba(211, 47, 47, 0.05)'
              }
            }}
          >
            Cerrar Sesión
          </Button>
        </Box>
      </Card>
    </Box>
  );

  // Determina qué mostrar en el área principal
  const renderMainContent = () => {
    // Usuarios nuevos pending/rejected (no confundir con renewal_pending)
    if (
      (userProfile?.status === 'pending' || userProfile?.status === 'rejected') &&
      !isSuperAdmin
    ) {
      return (
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            p: 2
          }}
        >
          <Card
            sx={{
              maxWidth: 500,
              width: '100%',
              background: 'rgba(255, 255, 255, 0.02)',
              backdropFilter: 'blur(10px)',
              border: `1px solid ${userProfile?.status === 'rejected' ? 'rgba(255, 82, 82, 0.3)' : 'rgba(108, 99, 255, 0.2)'}`,
              borderRadius: '24px',
              textAlign: 'center',
              p: 4
            }}
          >
            <Box
              sx={{
                width: 80,
                height: 80,
                borderRadius: '20px',
                background: userProfile?.status === 'rejected' ? 'rgba(255, 82, 82, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mx: 'auto',
                mb: 3,
                color: userProfile?.status === 'rejected' ? '#FF5252' : '#3B82F6'
              }}
            >
              <BusinessIcon sx={{ fontSize: 40 }} />
            </Box>
            <Typography variant="h5" sx={{ fontWeight: 800, mb: 2, color: '#FFF' }}>
              {userProfile?.status === 'rejected' ? 'Acceso Denegado' : 'Verificación en Proceso'}
            </Typography>
            <Typography variant="body1" sx={{ color: '#9AA0B2', mb: 4, lineHeight: 1.6 }}>
              {userProfile?.status === 'rejected' ? (
                <>
                  Lamentablemente tu pago ha sido <strong>rechazado</strong> o la referencia era incorrecta.
                  <br /><br />
                  Por favor, contacta a soporte para solucionar el inconveniente o vuelve a realizar el proceso de registro.
                </>
              ) : (
                <>
                  ¡Gracias por confiar en BAYFI! Estamos revisando tu referencia de pago para activar tu inventario.
                  <br /><br />
                  Este proceso suele tomar entre <strong>1 y 2 horas</strong> hábiles. Te enviaremos un correo una vez esté activo.
                </>
              )}
            </Typography>
            <Button
              variant="outlined"
              onClick={handleLogout}
              sx={{
                borderRadius: '12px',
                textTransform: 'none',
                borderColor: 'rgba(255, 82, 82, 0.3)',
                color: '#FF5252',
                '&:hover': {
                  borderColor: '#FF5252',
                  background: 'rgba(211, 47, 47, 0.05)'
                }
              }}
            >
              Cerrar Sesión
            </Button>
          </Card>
        </Box>
      );
    }

    // Suscripción expirada (solo para planes de pago, no super-admin)
    if (isExpired && !isSuperAdmin) {
      return renderExpiredScreen();
    }

    // Contenido normal
    return children;
  };

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden', position: 'relative', isolation: 'isolate' }}>
      <TechBackground />
      <CssBaseline />
      <AppBar
        position="fixed"
        sx={{
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          ml: { md: `${DRAWER_WIDTH}px` },
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { md: 'none' } }}
          >
            <MenuIcon />
          </IconButton>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            {/* Selector de Moneda */}
            <ToggleButtonGroup
              value={selectedCurrency}
              exclusive
              onChange={(e, val) => val && setCurrency(val)}
              size="small"
              sx={{
                height: 32,
                backgroundColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                borderRadius: '10px',
                '& .MuiToggleButton-root': {
                  color: 'text.secondary',
                  px: 1.5,
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  border: (theme) => `1px solid ${theme.palette.divider}`,
                  '&.Mui-selected': {
                    color: '#FFF',
                    background: selectedCurrency === 'USD'
                      ? 'linear-gradient(135deg, #00D9A6 0%, #00B88C 100%)'
                      : 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
                    border: 'none',
                    '&:hover': {
                      background: selectedCurrency === 'USD'
                        ? 'linear-gradient(135deg, #00E8B4 0%, #00C99A 100%)'
                        : 'linear-gradient(135deg, #60A5FA 0%, #2563EB 100%)',
                    }
                  }
                }
              }}
            >
              <ToggleButton value="USD">USD</ToggleButton>
              <ToggleButton value="EUR">EUR</ToggleButton>
            </ToggleButtonGroup>

            {/* Tasa BCV Indicators (USD & EURO) */}
            <Box sx={{
              display: { xs: 'none', sm: 'flex' },
              alignItems: 'center',
              gap: 1.5,
              px: 1.75,
              py: 0.6,
              borderRadius: '12px',
              backgroundColor: theme.palette.action.hover,
              border: `1px solid ${theme.palette.divider}`,
            }}>
              <Box sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.85,
                opacity: selectedCurrency === 'USD' ? 1 : 0.4,
                transition: 'opacity 0.2s'
              }}>
                <MoneyIcon sx={{ color: '#00D9A6', fontSize: 18 }} />
                <Box>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary, fontWeight: 700, display: 'block', fontSize: '0.58rem', textTransform: 'uppercase', letterSpacing: '0.05em', lineHeight: 1.2 }}>
                    USD BCV {selectedCurrency === 'USD' && '●'}
                  </Typography>
                  <Typography variant="body2" sx={{ color: theme.palette.text.primary, fontWeight: 800, fontSize: '0.85rem', lineHeight: 1.25 }}>
                    {exchangeLoading && !exchangeRate ? (
                      <CircularProgress size={11} sx={{ color: '#00D9A6' }} />
                    ) : exchangeRate ? (
                      `Bs. ${exchangeRate.toLocaleString('es-VE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
                    ) : (
                      '---'
                    )}
                  </Typography>
                </Box>
              </Box>

              <Box sx={{ width: '1px', height: '24px', bgcolor: theme.palette.divider }} />

              <Box sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.85,
                opacity: selectedCurrency === 'EUR' ? 1 : 0.4,
                transition: 'opacity 0.2s'
              }}>
                <Typography sx={{ color: '#3B82F6', fontWeight: 900, fontSize: 17 }}>€</Typography>
                <Box>
                  <Typography variant="caption" sx={{ color: selectedCurrency === 'EUR' ? '#3B82F6' : theme.palette.text.secondary, fontWeight: 700, display: 'block', fontSize: '0.58rem', textTransform: 'uppercase', letterSpacing: '0.05em', lineHeight: 1.2 }}>
                    EUR BCV {selectedCurrency === 'EUR' && '●'}
                  </Typography>
                  <Typography variant="body2" sx={{ color: theme.palette.text.primary, fontWeight: 800, fontSize: '0.85rem', lineHeight: 1.25 }}>
                    {exchangeLoading && !euroRate ? (
                      <CircularProgress size={11} sx={{ color: '#3B82F6' }} />
                    ) : euroRate ? (
                      `Bs. ${euroRate.toLocaleString('es-VE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
                    ) : (
                      '---'
                    )}
                  </Typography>
                </Box>
              </Box>
            </Box>
          </Box>

          <Box sx={{ flex: 1 }} />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <NotificationBell />
            <StyledThemeToggle mode={mode} onToggle={toggleTheme} />

            <Typography variant="body2" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
              {userProfile?.empresaNombre || userProfile?.email}
            </Typography>
            <IconButton onClick={handleMenuOpen} size="small">
              <Avatar
                src={userProfile?.fotoEmpresa || undefined}
                sx={{
                  width: 36,
                  height: 36,
                  bgcolor: '#3B82F6',
                  fontSize: '0.85rem',
                  fontWeight: 700,
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
            </IconButton>
          </Box>
          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleMenuClose}
            PaperProps={{
              sx: {
                mt: 1,
                minWidth: 180,
                backgroundColor: theme.palette.background.paper,
                border: `1px solid ${theme.palette.divider}`,
              },
            }}
          >
            <MenuItem onClick={() => { navigate('/settings'); handleMenuClose(); }}>
              <ListItemIcon><PersonIcon fontSize="small" /></ListItemIcon>
              <ListItemText primary="Configuración" />
            </MenuItem>
            <Divider />
            <MenuItem onClick={handleLogout}>
              <ListItemIcon><LogoutIcon fontSize="small" sx={{ color: '#FF5252' }} /></ListItemIcon>
              <ListItemText primary="Cerrar Sesión" sx={{ '& .MuiListItemText-primary': { color: '#FF5252' } }} />
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      <Box
        component="nav"
        sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }}
      >
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', md: 'none' },
            '& .MuiDrawer-paper': { width: DRAWER_WIDTH },
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', md: 'block' },
            '& .MuiDrawer-paper': { width: DRAWER_WIDTH },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          mt: 8,
          height: 'calc(100vh - 64px)',
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {renderMainContent()}
      </Box>

      <FloatingBaifyChat />
    </Box>
  );
}
