import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  FormControl,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  Typography,
} from '@mui/material';
import {
  ChevronRight as ChevronRightIcon,
  GroupsOutlined as ClientsIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import { formatUsd } from '../../utils/accountMoney';
import {
  ACTIVE_CLIENT_DAYS,
  isActiveClient,
  resolveClientEstado,
} from '../../utils/clientStatus';
import {
  ClientStateMessage,
  ClientStatusChip,
} from './ClientVisualPrimitives';

const PAGE_SIZE = 6;
const REFERENCE_NOW = Date.now();

const SORT_FIELDS = {
  nombre: (client) => String(client.nombre || '').toLocaleLowerCase('es'),
  totalGastado: (client) => Number(client.totalGastado) || 0,
  comprasCount: (client) => Number(client.comprasCount ?? client.ventasCount) || 0,
  ultimaCompraAt: (client) => dateTimestamp(client.ultimaCompraAt),
};

function dateTimestamp(value) {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function formatDate(value) {
  const timestamp = dateTimestamp(value);
  return timestamp
    ? new Date(timestamp).toLocaleDateString('es-VE')
    : 'Sin compras';
}

function normalizeSearchValue(value) {
  return String(value || '').trim().toLocaleLowerCase('es');
}

const headerCellSx = {
  whiteSpace: 'nowrap',
  textAlign: 'center',
  verticalAlign: 'middle',
  '& .MuiTableSortLabel-root': {
    width: '100%',
    justifyContent: 'center',
  },
};

const bodyCellSx = {
  textAlign: 'center',
  verticalAlign: 'middle',
};

export default function ClientsTable({ clients, loading }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('todos');
  const [activity, setActivity] = useState('todos');
  const [sortBy, setSortBy] = useState('nombre');
  const [sortDirection, setSortDirection] = useState('asc');
  const [page, setPage] = useState(1);

  const filteredClients = useMemo(() => {
    const term = normalizeSearchValue(search);

    return clients
      .filter((client) => {
        const resolvedEstado = resolveClientEstado(client);
        if (status !== 'todos' && resolvedEstado !== status) return false;
        if (activity === 'recientes' && !isActiveClient(client, REFERENCE_NOW)) return false;
        if (activity === 'sin_compras_recientes' && isActiveClient(client, REFERENCE_NOW)) return false;
        if (!term) return true;
        return [
          client.nombre,
          client.clienteId,
          client.telefono,
          client.productoMasComprado?.nombre,
          client.topProduct?.nombre,
        ].some((value) => normalizeSearchValue(value).includes(term));
      })
      .sort((left, right) => {
        const selector = SORT_FIELDS[sortBy] || SORT_FIELDS.nombre;
        const leftValue = selector(left);
        const rightValue = selector(right);
        const comparison = typeof leftValue === 'string'
          ? leftValue.localeCompare(rightValue, 'es')
          : leftValue - rightValue;
        return sortDirection === 'asc' ? comparison : -comparison;
      });
  }, [activity, clients, search, sortBy, sortDirection, status]);

  const totalPages = Math.max(1, Math.ceil(filteredClients.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visibleClients = filteredClients.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  const changeSort = (field) => {
    setPage(1);
    if (sortBy === field) {
      setSortDirection((current) => current === 'asc' ? 'desc' : 'asc');
      return;
    }
    setSortBy(field);
    setSortDirection(field === 'nombre' ? 'asc' : 'desc');
  };

  return (
    <Paper elevation={0} sx={{ borderRadius: '14px', overflow: 'hidden' }}>
      <Box
        sx={{
          p: 2,
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'minmax(260px, 1fr) 180px 220px' },
          gap: 1.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <TextField
          size="small"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="Buscar por nombre, documento o producto"
          inputProps={{ 'aria-label': 'Buscar clientes' }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon color="action" fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
        <FormControl size="small">
          <InputLabel id="client-status-filter-label">Estado</InputLabel>
          <Select
            labelId="client-status-filter-label"
            label="Estado"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <MenuItem value="todos">Todos los estados</MenuItem>
            <MenuItem value="activo">Activos</MenuItem>
            <MenuItem value="inactivo">Inactivos</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small">
          <InputLabel id="client-activity-filter-label">Actividad</InputLabel>
          <Select
            labelId="client-activity-filter-label"
            label="Actividad"
            value={activity}
            onChange={(event) => {
              setActivity(event.target.value);
              setPage(1);
            }}
          >
            <MenuItem value="todos">Cualquier actividad</MenuItem>
            <MenuItem value="recientes">Compraron en últimos {ACTIVE_CLIENT_DAYS} días</MenuItem>
            <MenuItem value="sin_compras_recientes">Sin compras en {ACTIVE_CLIENT_DAYS} días</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {loading ? (
        <ClientStateMessage loading />
      ) : clients.length === 0 ? (
        <ClientStateMessage
          title="Aún no hay clientes"
          description="Los clientes aparecerán aquí al registrarse o al consolidar sus compras."
          icon={<ClientsIcon sx={{ fontSize: 42, opacity: 0.5 }} />}
        />
      ) : filteredClients.length === 0 ? (
        <ClientStateMessage
          title="No encontramos coincidencias"
          description="Prueba con otra búsqueda o limpia los filtros seleccionados."
          icon={<SearchIcon sx={{ fontSize: 42, opacity: 0.5 }} />}
        />
      ) : (
        <>
          <TableContainer>
            <Table size="small" sx={{ minWidth: 1240 }} aria-label="Listado de clientes">
              <TableHead>
                <TableRow>
                  <TableCell align="center" sx={headerCellSx}>
                    <TableSortLabel
                      active={sortBy === 'nombre'}
                      direction={sortBy === 'nombre' ? sortDirection : 'asc'}
                      onClick={() => changeSort('nombre')}
                    >
                      Cliente
                    </TableSortLabel>
                  </TableCell>
                  <TableCell align="center" sx={headerCellSx}>Documento</TableCell>
                  <TableCell align="center" sx={headerCellSx}>
                    <TableSortLabel
                      active={sortBy === 'ultimaCompraAt'}
                      direction={sortBy === 'ultimaCompraAt' ? sortDirection : 'desc'}
                      onClick={() => changeSort('ultimaCompraAt')}
                    >
                      Última visita
                    </TableSortLabel>
                  </TableCell>
                  <TableCell align="center" sx={headerCellSx}>
                    <TableSortLabel
                      active={sortBy === 'totalGastado'}
                      direction={sortBy === 'totalGastado' ? sortDirection : 'desc'}
                      onClick={() => changeSort('totalGastado')}
                    >
                      Total gastado
                    </TableSortLabel>
                  </TableCell>
                  <TableCell align="center" sx={headerCellSx}>Promedio mensual</TableCell>
                  <TableCell align="center" sx={headerCellSx}>
                    <TableSortLabel
                      active={sortBy === 'comprasCount'}
                      direction={sortBy === 'comprasCount' ? sortDirection : 'desc'}
                      onClick={() => changeSort('comprasCount')}
                    >
                      Compras
                    </TableSortLabel>
                  </TableCell>
                  <TableCell align="center" sx={headerCellSx}>Producto más comprado</TableCell>
                  <TableCell align="center" sx={headerCellSx}>Detalle</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {visibleClients.map((client) => {
                  const purchases = Number(client.comprasCount ?? client.ventasCount) || 0;
                  const units = Number(client.unidadesCompradas) || 0;
                  const topProduct = client.productoMasComprado
                    || client.topProducts?.[0]
                    || client.topProduct;
                  return (
                    <TableRow
                      hover
                      key={client.id}
                      onClick={() => navigate(`/clientes/${client.id}`)}
                      sx={{ cursor: 'pointer', '&:last-child td': { borderBottom: 0 } }}
                    >
                      <TableCell align="center" sx={bodyCellSx}>
                        <Box
                          sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 0.75,
                            maxWidth: '100%',
                          }}
                        >
                          <Typography variant="body2" fontWeight={800} noWrap>
                            {client.nombre || 'Cliente sin nombre'}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" noWrap display="block">
                            {client.telefono || 'Sin teléfono'}
                          </Typography>
                          <ClientStatusChip status={resolveClientEstado(client)} />
                        </Box>
                      </TableCell>
                      <TableCell align="center" sx={bodyCellSx}>
                        <Typography variant="body2" fontWeight={700}>
                          {client.clienteId || '—'}
                        </Typography>
                      </TableCell>
                      <TableCell align="center" sx={bodyCellSx}>
                        <Box
                          sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            textAlign: 'center',
                            width: '100%',
                          }}
                        >
                          <Typography variant="body2" align="center">
                            {formatDate(client.ultimaCompraAt)}
                          </Typography>
                          {client.diasDesdeUltimaCompra != null ? (
                            <Typography variant="caption" color="text.secondary" align="center" display="block">
                              Hace {client.diasDesdeUltimaCompra} días
                            </Typography>
                          ) : null}
                        </Box>
                      </TableCell>
                      <TableCell align="center" sx={bodyCellSx}>
                        <Typography variant="body2" fontWeight={800}>
                          {formatUsd(client.totalGastado)}
                        </Typography>
                      </TableCell>
                      <TableCell align="center" sx={bodyCellSx}>
                        <Typography variant="body2" fontWeight={700}>
                          {formatUsd(client.gastoPromedioMensual)}
                        </Typography>
                      </TableCell>
                      <TableCell align="center" sx={bodyCellSx}>
                        <Typography variant="body2" fontWeight={800}>{purchases}</Typography>
                        <Typography variant="caption" color="text.secondary" display="block">
                          {units} unidades
                        </Typography>
                      </TableCell>
                      <TableCell align="center" sx={bodyCellSx}>
                        <Typography variant="body2" fontWeight={700} noWrap sx={{ maxWidth: 190, mx: 'auto' }}>
                          {topProduct?.nombre || 'Sin datos'}
                        </Typography>
                        {topProduct?.cantidad ? (
                          <Typography variant="caption" color="text.secondary" display="block">
                            {topProduct.cantidad} unidades
                          </Typography>
                        ) : null}
                      </TableCell>
                      <TableCell align="center" sx={bodyCellSx}>
                        <ChevronRightIcon color="primary" />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
          <Box
            sx={{
              px: 2,
              py: 1.5,
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: '1fr auto 1fr' },
              alignItems: 'center',
              gap: 1,
              borderTop: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Typography variant="body2" color="text.secondary" textAlign={{ xs: 'center', sm: 'left' }}>
              {filteredClients.length} cliente{filteredClients.length === 1 ? '' : 's'}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5 }}>
              <Button
                size="small"
                disabled={currentPage === 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                Anterior
              </Button>
              <Typography variant="body2" fontWeight={800} color="primary">
                Página {currentPage} de {totalPages}
              </Typography>
              <Button
                size="small"
                disabled={currentPage === totalPages}
                onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
              >
                Siguiente
              </Button>
            </Box>
            <Box />
          </Box>
        </>
      )}
    </Paper>
  );
}
