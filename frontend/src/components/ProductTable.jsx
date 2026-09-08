import React, { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  Tooltip,
  Typography,
  Box,
  TextField,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  InputAdornment,
  Button,
  CircularProgress,
  useTheme,
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  Remove as RemoveIcon,
  Search as SearchIcon,
  History as HistoryIcon,
  ChevronRight as ChevronRightIcon,
} from '@mui/icons-material';
import { PRODUCT_STATES, USER_ROLES } from '../utils/constants';
import useCurrencyStore from '../store/useCurrencyStore';
import useAuthStore from '../store/useAuthStore';

/**
 * Convierte fechaVencimiento (ISO string, Timestamp Firestore o Date) a texto DD/MM/YYYY
 * y detecta si ya venció. Nunca lanza: si el formato es inválido, muestra el valor crudo.
 */
function formatExpirationDate(rawDate) {
  if (!rawDate) {
    return { displayDate: null, isExpired: false };
  }

  let dateString = '';

  if (typeof rawDate === 'string') {
    dateString = rawDate;
  } else if (rawDate instanceof Date) {
    dateString = rawDate.toISOString();
  } else if (typeof rawDate === 'object') {
    if (typeof rawDate.toDate === 'function') {
      dateString = rawDate.toDate().toISOString();
    } else if (typeof rawDate._seconds === 'number') {
      dateString = new Date(rawDate._seconds * 1000).toISOString();
    } else if (typeof rawDate.seconds === 'number') {
      dateString = new Date(rawDate.seconds * 1000).toISOString();
    } else {
      return { displayDate: String(rawDate), isExpired: false };
    }
  } else {
    dateString = String(rawDate);
  }

  let displayDate = dateString;
  let isExpired = false;

  try {
    let y;
    let m;
    let d;

    if (dateString.includes('T')) {
      const [datePart] = dateString.split('T');
      const parts = datePart.split('-');
      y = parseInt(parts[0], 10);
      m = parseInt(parts[1], 10);
      d = parseInt(parts[2], 10);
    } else if (dateString.includes('/')) {
      const parts = dateString.split('/');
      if (parts[0].length === 4) {
        [y, m, d] = parts.map(Number);
      } else {
        [d, m, y] = parts.map(Number);
      }
    } else if (dateString.includes('-')) {
      const parts = dateString.split('-');
      if (parts[0].length === 4) {
        [y, m, d] = parts.map(Number);
      } else {
        [d, m, y] = parts.map(Number);
      }
    }

    if (y && m && d && !Number.isNaN(y) && !Number.isNaN(m) && !Number.isNaN(d)) {
      if (y < 100) y += 2000;
      displayDate = `${d.toString().padStart(2, '0')}/${m.toString().padStart(2, '0')}/${y}`;

      const caracasNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Caracas' }));
      const todayTimestamp = new Date(caracasNow.getFullYear(), caracasNow.getMonth(), caracasNow.getDate()).getTime();
      const productTimestamp = new Date(y, m - 1, d).getTime();
      isExpired = productTimestamp <= todayTimestamp;
    }
  } catch (e) {
    console.error('Error parsing date for display:', e);
  }

  return { displayDate, isExpired };
}

export default function ProductTable({
  products,
  loading,
  filters,
  onFilterChange,
  onEdit,
  onDelete,
  onStockAdjust,
  onViewMovimientos,
  onNextPage,
  onPrevPage,
  page,
  hasMore,
  userRole,
}) {
  const isAuthorized = userRole === USER_ROLES.ADMIN || userRole === USER_ROLES.SUPER_ADMIN;
  const { getActiveRate } = useCurrencyStore();
  const activeRate = getActiveRate();
  const { userProfile } = useAuthStore();
  const lowStockThreshold = userProfile?.lowStockThreshold ?? 5;
  const theme = useTheme();

  const [actionsAnchorEl, setActionsAnchorEl] = useState(null);
  const [actionsProduct, setActionsProduct] = useState(null);
  const actionsMenuOpen = Boolean(actionsAnchorEl);

  const handleOpenActions = (event, product) => {
    setActionsAnchorEl(event.currentTarget);
    setActionsProduct(product);
  };

  const handleCloseActions = () => {
    setActionsAnchorEl(null);
    setActionsProduct(null);
  };

  const runAction = (action) => {
    if (!actionsProduct) return;
    action(actionsProduct);
    handleCloseActions();
  };

  return (
    <Box>
      {/* Filtros */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <TextField
          placeholder="Buscar por nombre o SKU..."
          size="small"
          value={filters.search}
          onChange={(e) => onFilterChange({ ...filters, search: e.target.value })}
          sx={{ flex: 1, minWidth: 220 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ color: '#9AA0B2' }} />
              </InputAdornment>
            ),
          }}
        />
        <TextField
          select
          label="Estado"
          size="small"
          value={filters.estado}
          onChange={(e) => onFilterChange({ ...filters, estado: e.target.value })}
          sx={{ minWidth: 150 }}
        >
          <MenuItem value="">Todos</MenuItem>
          <MenuItem value={PRODUCT_STATES.ACTIVO}>Activo</MenuItem>
          <MenuItem value={PRODUCT_STATES.INACTIVO}>Inactivo</MenuItem>
        </TextField>
      </Box>

      {/* Tabla */}
      <TableContainer
        component={Paper}
        sx={{
          backgroundColor: theme.palette.background.paper,
          borderRadius: 3,
          border: `1px solid ${theme.palette.divider}`,
        }}
      >
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Nombre</TableCell>
              <TableCell align="center" sx={{ display: { xs: 'none', lg: 'table-cell' } }}>SKU</TableCell>
              <TableCell align="center" sx={{ display: { xs: 'none', md: 'table-cell' } }}>Ubicación</TableCell>
              <TableCell align="center" sx={{ display: { xs: 'none', md: 'table-cell' } }}>Descripción</TableCell>
              <TableCell align="center">Vencimiento</TableCell>
              <TableCell align="center">Stock</TableCell>
              <TableCell align="center">Estado</TableCell>
              <TableCell align="center" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Atributos</TableCell>
              <TableCell align="center">Costo (Unitario)</TableCell>
              <TableCell align="center">Precio (Venta)</TableCell>
              <TableCell align="center">Acciones</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && products.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                  <CircularProgress size={32} sx={{ color: '#3B82F6' }} />
                </TableCell>
              </TableRow>
            ) : products.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                  <Typography color="text.secondary">
                    No se encontraron productos
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              products.map((product) => (
                <TableRow key={product.id} hover>
                  <TableCell>
                    <Typography 
                      variant="body2" 
                      sx={{ 
                        fontWeight: 600,
                        minWidth: 150,
                        maxWidth: 250,
                        whiteSpace: 'normal',
                        wordBreak: 'break-word',
                        lineHeight: 1.2
                      }}
                    >
                      {product.nombre}
                    </Typography>
                    {/* Ubicación visible solo en móviles debajo del nombre */}
                    <Typography
                      variant="caption"
                      sx={{
                        display: { xs: 'block', md: 'none' },
                        color: theme.palette.primary.light,
                        mt: 0.5,
                        fontWeight: 500,
                        opacity: 0.9
                      }}
                    >
                      {product.ubicacion || 'Sin ubicación'}
                    </Typography>
                  </TableCell>
                  <TableCell align="center" sx={{ display: { xs: 'none', lg: 'table-cell' } }}>
                    <Typography variant="caption" sx={{ color: theme.palette.text.secondary, fontWeight: 500 }}>
                      {product.sku || '-'}
                    </Typography>
                  </TableCell>
                  <TableCell align="center" sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                    <Typography variant="body2" sx={{ fontWeight: 500, color: theme.palette.primary.light }}>
                      {product.ubicacion || '-'}
                    </Typography>
                  </TableCell>
                  <TableCell align="center" sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                    <Tooltip title={product.descripcion || 'Sin descripción'} arrow>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{
                          minWidth: 150,
                          maxWidth: 300,
                          whiteSpace: 'normal',
                          wordBreak: 'break-word',
                          lineHeight: 1.4,
                          cursor: 'default',
                          mx: 'auto',
                        }}
                      >
                        {product.descripcion || '-'}
                      </Typography>
                    </Tooltip>
                  </TableCell>
                  <TableCell align="center">
                    {(() => {
                      const { displayDate, isExpired } = formatExpirationDate(product.fechaVencimiento);
                      if (!displayDate) {
                        return <Typography variant="body2" color="text.secondary">-</Typography>;
                      }

                      return (
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <Typography variant="body2" sx={{ 
                            fontWeight: 600, 
                            color: isExpired ? theme.palette.error.main : theme.palette.text.primary 
                          }}>
                            {displayDate}
                          </Typography>
                          {isExpired && (
                            <Typography variant="caption" sx={{ color: '#FF5252', fontWeight: 700, fontSize: '0.65rem' }}>
                              VENCIDO
                            </Typography>
                          )}
                        </Box>
                      );
                    })()}
                  </TableCell>
                  <TableCell align="center">
                    <Chip
                      label={product.stock}
                      size="small"
                      sx={{
                        fontWeight: 700,
                        minWidth: 48,
                        backgroundColor:
                          product.stock <= 0
                            ? 'rgba(255, 82, 82, 0.12)'
                            : product.stock <= lowStockThreshold
                              ? 'rgba(255, 183, 77, 0.12)'
                              : 'rgba(0, 217, 166, 0.12)',
                        color:
                          product.stock <= 0
                            ? '#FF5252'
                            : product.stock <= lowStockThreshold
                              ? '#FFB74D'
                              : '#00D9A6',
                      }}
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Chip
                      label={product.estado === PRODUCT_STATES.ACTIVO ? 'Activo' : 'Inactivo'}
                      size="small"
                      sx={{
                        backgroundColor:
                          product.estado === PRODUCT_STATES.ACTIVO
                            ? 'rgba(0, 217, 166, 0.12)'
                            : 'rgba(255, 82, 82, 0.12)',
                        color:
                          product.estado === PRODUCT_STATES.ACTIVO ? '#00D9A6' : '#FF5252',
                        fontWeight: 600,
                      }}
                    />
                  </TableCell>
                  <TableCell align="center" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', justifyContent: 'center' }}>
                      {product.atributos &&
                        Object.entries(product.atributos).slice(0, 3).map(([key, value]) => (
                          <Chip
                            key={key}
                            label={`${key}: ${value}`}
                            size="small"
                            variant="outlined"
                            sx={{
                              fontSize: '0.7rem',
                              borderColor: theme.palette.mode === 'dark' ? 'rgba(108, 99, 255, 0.3)' : 'rgba(108, 99, 255, 0.1)',
                              color: theme.palette.primary.light,
                            }}
                          />
                        ))}
                      {product.atributos && Object.keys(product.atributos).length > 3 && (
                        <Chip
                          label={`+${Object.keys(product.atributos).length - 3}`}
                          size="small"
                          sx={{ fontSize: '0.7rem', color: theme.palette.text.secondary }}
                        />
                      )}
                    </Box>
                  </TableCell>
                  <TableCell align="center">
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="body2" sx={{ fontWeight: 700, color: '#FFB74D' }}>
                        ${(product.costo || 0).toLocaleString('es-VE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                      </Typography>
                      {activeRate && (
                        <Typography variant="caption" sx={{ color: theme.palette.text.secondary, fontWeight: 600, display: 'block' }}>
                          Bs. {Number(((product.costo || 0) * activeRate).toFixed(2)).toLocaleString('es-VE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                        </Typography>
                      )}
                    </Box>
                  </TableCell>
                  <TableCell align="center">
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="body2" sx={{ fontWeight: 700, color: '#00D9A6' }}>
                        ${(product.valor || 0).toLocaleString('es-VE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                      </Typography>
                      {activeRate && (
                        <Typography variant="caption" sx={{ color: theme.palette.text.secondary, fontWeight: 600, display: 'block' }}>
                          Bs. {Number(((product.valor || 0) * activeRate).toFixed(2)).toLocaleString('es-VE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                        </Typography>
                      )}
                    </Box>
                  </TableCell>
                  <TableCell align="center">
                    <IconButton
                      size="small"
                      onClick={(e) => handleOpenActions(e, product)}
                      aria-label="Acciones"
                      aria-haspopup="true"
                      aria-expanded={actionsMenuOpen && actionsProduct?.id === product.id}
                    >
                      <ChevronRightIcon
                        color="primary"
                        sx={{
                          transition: 'transform 0.2s ease',
                          transform:
                            actionsMenuOpen && actionsProduct?.id === product.id
                              ? 'rotate(90deg)'
                              : 'none',
                        }}
                      />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Menu
        anchorEl={actionsAnchorEl}
        open={actionsMenuOpen}
        onClose={handleCloseActions}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        transformOrigin={{ vertical: 'top', horizontal: 'center' }}
        slotProps={{
          paper: {
            sx: {
              mt: 0.5,
              minWidth: 200,
              borderRadius: 2,
              border: `1px solid ${theme.palette.divider}`,
              boxShadow:
                theme.palette.mode === 'dark'
                  ? '0 8px 24px rgba(0, 0, 0, 0.45)'
                  : '0 8px 24px rgba(15, 23, 42, 0.12)',
            },
          },
        }}
      >
        <MenuItem
          onClick={() => runAction((p) => onStockAdjust(p, 'incremento'))}
          sx={{ py: 1 }}
        >
          <ListItemIcon>
            <AddIcon fontSize="small" sx={{ color: '#00D9A6' }} />
          </ListItemIcon>
          <ListItemText primary="Incrementar stock" />
        </MenuItem>
        <MenuItem
          onClick={() => runAction((p) => onStockAdjust(p, 'reduccion'))}
          sx={{ py: 1 }}
        >
          <ListItemIcon>
            <RemoveIcon fontSize="small" sx={{ color: '#FF5252' }} />
          </ListItemIcon>
          <ListItemText primary="Reducir stock" />
        </MenuItem>
        <MenuItem
          onClick={() => runAction(onViewMovimientos)}
          sx={{ py: 1 }}
        >
          <ListItemIcon>
            <HistoryIcon fontSize="small" sx={{ color: theme.palette.text.secondary }} />
          </ListItemIcon>
          <ListItemText primary="Historial" />
        </MenuItem>
        {isAuthorized && (
          <MenuItem
            onClick={() => runAction(onEdit)}
            sx={{ py: 1 }}
          >
            <ListItemIcon>
              <EditIcon fontSize="small" sx={{ color: '#3B82F6' }} />
            </ListItemIcon>
            <ListItemText primary="Editar" />
          </MenuItem>
        )}
        {isAuthorized && (
          <MenuItem
            onClick={() => runAction(onDelete)}
            sx={{ py: 1, color: '#FF5252' }}
          >
            <ListItemIcon>
              <DeleteIcon fontSize="small" sx={{ color: '#FF5252' }} />
            </ListItemIcon>
            <ListItemText primary="Eliminar" />
          </MenuItem>
        )}
      </Menu>

      {/* Paginación */}
      <Box sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        mt: 3,
        gap: 2,
        pb: 2
      }}>
        <Button
          size="small"
          disabled={page === 1 || loading}
          onClick={onPrevPage}
          sx={{
            color: theme.palette.text.secondary,
            minWidth: 100,
            '&:disabled': { opacity: 0.3 }
          }}
        >
          Anterior
        </Button>
        <Typography variant="body2" sx={{
          fontWeight: 700,
          minWidth: 100,
          textAlign: 'center',
          color: theme.palette.primary.light
        }}>
          Página {page}
        </Typography>
        <Button
          size="small"
          disabled={!hasMore || loading}
          onClick={onNextPage}
          sx={{
            color: '#3B82F6',
            fontWeight: 800,
            minWidth: 100,
            '&:disabled': { opacity: 0.3 }
          }}
        >
          Siguiente
        </Button>
      </Box>
    </Box>
  );
}
