import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Chip,
  Tooltip,
  Typography,
  Box,
  TextField,
  MenuItem,
  InputAdornment,
  Button,
  CircularProgress,
  useTheme,
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  Payments as PaymentsIcon,
  History as HistoryIcon,
} from '@mui/icons-material';
import {
  ACCOUNT_TYPES,
  ACCOUNT_STATES,
  ACCOUNT_STATE_LABELS,
} from '../utils/constants';
import useCurrencyStore from '../store/useCurrencyStore';
import {
  formatUsd,
  formatBsAmount,
  resolveAccountTotalBs,
  resolveAccountPendienteBs,
} from '../utils/accountMoney';

const STATE_COLORS = {
  pendiente: 'warning',
  parcial: 'info',
  pagado: 'success',
  vencido: 'error',
};

function formatDate(raw) {
  if (!raw) return '—';
  try {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('es-VE');
  } catch {
    return '—';
  }
}

export default function AccountsTable({
  accounts,
  loading,
  filters,
  onFilterChange,
  onEdit,
  onDelete,
  onPayment,
  onCreditHistory,
  onNextPage,
  onPrevPage,
  hasMore,
  page,
  tipo,
}) {
  const theme = useTheme();
  const { getActiveRate } = useCurrencyStore();
  const activeRate = getActiveRate();
  const isReceivable = tipo === ACCOUNT_TYPES.POR_COBRAR;
  const counterpartLabel = isReceivable ? 'Cliente' : 'Proveedor';

  return (
    <Box>
      <Paper
        elevation={0}
        sx={{
          borderRadius: 3,
          border: '1px solid',
          borderColor: 'divider',
          overflow: 'hidden',
        }}
      >
      <Box
        sx={{
          p: 2,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 1.5,
          alignItems: 'center',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <TextField
          size="small"
          placeholder={isReceivable
            ? 'Buscar cliente, CI o comprobante...'
            : `Buscar ${counterpartLabel.toLowerCase()}...`}
          value={filters.search}
          onChange={(e) => onFilterChange({ ...filters, search: e.target.value })}
          sx={{ minWidth: 200, flex: 1 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" color="action" />
              </InputAdornment>
            ),
          }}
        />
        <TextField
          select
          size="small"
          label="Estado"
          value={filters.estado}
          onChange={(e) => onFilterChange({ ...filters, estado: e.target.value })}
          sx={{ minWidth: 140 }}
          InputLabelProps={{ shrink: true }}
          SelectProps={{ displayEmpty: true }}
        >
          <MenuItem value="">Todos</MenuItem>
          {Object.values(ACCOUNT_STATES).map((state) => (
            <MenuItem key={state} value={state}>
              {ACCOUNT_STATE_LABELS[state]}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          size="small"
          label="Desde"
          type="date"
          value={filters.fechaDesde}
          onChange={(e) => onFilterChange({ ...filters, fechaDesde: e.target.value })}
          InputLabelProps={{ shrink: true }}
          sx={{ minWidth: 150 }}
        />
        <TextField
          size="small"
          label="Hasta"
          type="date"
          value={filters.fechaHasta}
          onChange={(e) => onFilterChange({ ...filters, fechaHasta: e.target.value })}
          InputLabelProps={{ shrink: true }}
          sx={{ minWidth: 150 }}
        />
      </Box>

      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{counterpartLabel}</TableCell>
              <TableCell align="center">Total</TableCell>
              <TableCell align="center">Pendiente</TableCell>
              <TableCell align="center">Emisión</TableCell>
              <TableCell align="center">Vencimiento</TableCell>
              <TableCell align="center">Estado</TableCell>
              <TableCell align="center">Acciones</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                  <CircularProgress size={32} />
                </TableCell>
              </TableRow>
            ) : accounts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                  <Typography color="text.secondary">
                    No hay cuentas registradas con estos filtros
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              accounts.map((account) => {
                const nombre = isReceivable
                  ? account.clienteNombre
                  : account.proveedorNombre;
                const canPay = account.estado !== ACCOUNT_STATES.PAGADO
                  && Number(account.montoPendiente) > 0;
                const totalBsLabel = formatBsAmount(resolveAccountTotalBs(account, activeRate));
                const pendienteBsLabel = formatBsAmount(resolveAccountPendienteBs(account, activeRate));

                return (
                  <TableRow
                    key={account.id}
                    hover
                    sx={{
                      '&:last-child td': { borderBottom: 0 },
                      bgcolor:
                        account.estado === ACCOUNT_STATES.VENCIDO
                          ? theme.palette.mode === 'dark'
                            ? 'rgba(255, 82, 82, 0.06)'
                            : 'rgba(255, 82, 82, 0.04)'
                          : 'transparent',
                    }}
                  >
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>
                        {nombre || '—'}
                      </Typography>
                      {account.clienteId && isReceivable && (
                        <Typography variant="caption" color="text.secondary" display="block">
                          CI: {account.clienteId}
                        </Typography>
                      )}
                      {account.ventaId && (
                        <Typography variant="caption" color="text.secondary" display="block">
                          {account.ventaId}
                        </Typography>
                      )}
                      {account.observaciones && (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          display="block"
                          noWrap
                          sx={{ maxWidth: 220 }}
                        >
                          {account.observaciones}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="center">
                      <Box sx={{ textAlign: 'center' }}>
                        <Typography variant="body2" fontWeight={600}>
                          {formatUsd(account.montoTotal)}
                        </Typography>
                        {totalBsLabel && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            fontWeight={600}
                            display="block"
                          >
                            {totalBsLabel}
                          </Typography>
                        )}
                      </Box>
                    </TableCell>
                    <TableCell align="center">
                      <Box sx={{ textAlign: 'center' }}>
                        <Typography
                          variant="body2"
                          fontWeight={600}
                          color={account.montoPendiente > 0 ? 'warning.main' : 'success.main'}
                        >
                          {formatUsd(account.montoPendiente)}
                        </Typography>
                        {pendienteBsLabel && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            fontWeight={600}
                            display="block"
                          >
                            {pendienteBsLabel}
                          </Typography>
                        )}
                      </Box>
                    </TableCell>
                    <TableCell align="center">{formatDate(account.fechaEmision)}</TableCell>
                    <TableCell align="center">{formatDate(account.fechaVencimiento)}</TableCell>
                    <TableCell align="center">
                      <Chip
                        size="small"
                        label={ACCOUNT_STATE_LABELS[account.estado] || account.estado}
                        color={STATE_COLORS[account.estado] || 'default'}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                        {isReceivable && onCreditHistory && (
                          <Tooltip title="Historial crediticio">
                            <span>
                              <IconButton
                                size="small"
                                color="secondary"
                                disabled={!account.clienteId}
                                onClick={() => onCreditHistory(account)}
                              >
                                <HistoryIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        )}
                        <Tooltip title={isReceivable ? 'Registrar cobro' : 'Registrar pago'}>
                          <span>
                            <IconButton
                              size="small"
                              color="primary"
                              disabled={!canPay}
                              onClick={() => onPayment(account)}
                            >
                              <PaymentsIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title="Editar">
                          <IconButton size="small" onClick={() => onEdit(account)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Eliminar">
                          <IconButton size="small" color="error" onClick={() => onDelete(account)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>

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
          disabled={page <= 1 || loading}
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
