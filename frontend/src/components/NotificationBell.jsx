import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  Box,
  Button,
  CircularProgress,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Pagination,
  Popover,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  NotificationsNone as BellIcon,
  PersonOutline as ClientsIcon,
  Inventory2Outlined as InventoryIcon,
  AccountBalanceWalletOutlined as AccountsIcon,
  DoneAll as DoneAllIcon,
} from '@mui/icons-material';
import useAuthStore from '../store/useAuthStore';
import {
  getNotifications,
  loadReadNotificationMap,
  markAllNotificationsRead,
  markNotificationsRead,
} from '../services/notificationService';

const REFRESH_MS = 120_000;
const PAGE_SIZE = 5;

const CATEGORY_META = {
  clientes: {
    label: 'Clientes',
    color: '#3B82F6',
    Icon: ClientsIcon,
  },
  inventario: {
    label: 'Inventario',
    color: '#FDA63C',
    Icon: InventoryIcon,
  },
  cuentas: {
    label: 'Cuentas',
    color: '#FF5252',
    Icon: AccountsIcon,
  },
};

function severityDot(severity) {
  if (severity === 'critical') return '#FF5252';
  if (severity === 'warning') return '#FDA63C';
  return '#3B82F6';
}

function sortNotifications(items, readMap) {
  const severityOrder = { critical: 0, warning: 1, info: 2 };
  return [...items].sort((a, b) => {
    const aId = String(a.id);
    const bId = String(b.id);
    const aReadAt = readMap.get(aId);
    const bReadAt = readMap.get(bId);
    const aUnread = aReadAt == null;
    const bUnread = bReadAt == null;

    // No leídas siempre arriba
    if (aUnread !== bUnread) return aUnread ? -1 : 1;

    if (aUnread && bUnread) {
      const aSev = severityOrder[a.severity] ?? 9;
      const bSev = severityOrder[b.severity] ?? 9;
      if (aSev !== bSev) return aSev - bSev;

      const aTime = Date.parse(a.createdAt || '') || 0;
      const bTime = Date.parse(b.createdAt || '') || 0;
      return bTime - aTime;
    }

    // Leídas: las más recientes al fondo (debajo de las no leídas)
    if (aReadAt !== bReadAt) return aReadAt - bReadAt;

    const aSev = severityOrder[a.severity] ?? 9;
    const bSev = severityOrder[b.severity] ?? 9;
    if (aSev !== bSev) return aSev - bSev;

    const aTime = Date.parse(a.createdAt || '') || 0;
    const bTime = Date.parse(b.createdAt || '') || 0;
    return bTime - aTime;
  });
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const { userProfile } = useAuthStore();
  const empresaId = userProfile?.empresaId;

  const [anchorEl, setAnchorEl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);
  const [readMap, setReadMap] = useState(() => new Map());
  const [page, setPage] = useState(1);
  const lastFetchedAtRef = useRef(0);
  const inflightRef = useRef(null);
  const itemsRef = useRef(items);
  const prevUnreadIdsRef = useRef(new Set());
  itemsRef.current = items;

  const open = Boolean(anchorEl);

  const refresh = useCallback(async (opts = {}) => {
    if (!empresaId) return;

    const silent = opts?.silent === true;

    if (inflightRef.current) {
      await inflightRef.current;
      return;
    }

    const hasItems = itemsRef.current.length > 0;
    const showSpinner = !silent && !hasItems;
    if (showSpinner) setLoading(true);
    setError('');

    const request = (async () => {
      try {
        const data = await getNotifications(empresaId);
        setItems(Array.isArray(data.items) ? data.items : []);
        setReadMap(loadReadNotificationMap(empresaId));
        lastFetchedAtRef.current = Date.now();
      } catch (err) {
        setError(err.message || 'No se pudieron cargar las alertas');
      } finally {
        if (showSpinner) setLoading(false);
        inflightRef.current = null;
      }
    })();

    inflightRef.current = request;
    await request;
  }, [empresaId]);

  useEffect(() => {
    if (!empresaId) return undefined;

    setReadMap(loadReadNotificationMap(empresaId));
    refresh();

    let timerId = null;

    const clearTimer = () => {
      if (timerId != null) {
        window.clearInterval(timerId);
        timerId = null;
      }
    };

    const startTimer = () => {
      clearTimer();
      timerId = window.setInterval(() => {
        if (document.visibilityState === 'visible') {
          refresh({ silent: true });
        }
      }, REFRESH_MS);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const stale = Date.now() - lastFetchedAtRef.current >= REFRESH_MS;
        if (stale) refresh({ silent: true });
        startTimer();
      } else {
        clearTimer();
      }
    };

    if (document.visibilityState === 'visible') {
      startTimer();
    }

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      clearTimer();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [empresaId, refresh]);

  const readIds = useMemo(() => new Set(readMap.keys()), [readMap]);

  const unreadItems = useMemo(
    () => items.filter((item) => !readMap.has(String(item.id))),
    [items, readMap]
  );
  const unreadCount = unreadItems.length;

  const sortedItems = useMemo(
    () => sortNotifications(items, readMap),
    [items, readMap]
  );

  const pageCount = Math.max(1, Math.ceil(sortedItems.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pagedItems = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return sortedItems.slice(start, start + PAGE_SIZE);
  }, [sortedItems, currentPage]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  // Si llega una alerta nueva sin leer, volver a la página 1 (arriba).
  useEffect(() => {
    const unreadIds = new Set(
      items
        .filter((item) => !readMap.has(String(item.id)))
        .map((item) => String(item.id))
    );
    let hasNewUnread = false;
    unreadIds.forEach((id) => {
      if (!prevUnreadIdsRef.current.has(id)) hasNewUnread = true;
    });
    prevUnreadIdsRef.current = unreadIds;
    if (hasNewUnread && unreadIds.size > 0) {
      setPage(1);
    }
  }, [items, readMap]);

  const handleOpen = (event) => {
    setAnchorEl(event.currentTarget);
    setPage(1);
    setReadMap(loadReadNotificationMap(empresaId));
    refresh({ silent: items.length > 0 });
  };

  const handleClose = () => setAnchorEl(null);

  const handleMarkAllRead = () => {
    if (!empresaId) return;
    const next = markAllNotificationsRead(empresaId, items);
    setReadMap(new Map(next));
  };

  const handleItemClick = (item) => {
    if (!empresaId || !item?.id) return;
    const next = markNotificationsRead(empresaId, [item.id]);
    setReadMap(new Map(next));
    handleClose();
    if (item.href) navigate(item.href);
  };

  if (!empresaId) return null;

  const statusCaption = loading && items.length === 0
    ? 'Cargando alertas…'
    : unreadCount > 0
      ? `${unreadCount} sin leer`
      : items.length > 0
        ? 'Todo al día'
        : 'Sin alertas activas';

  return (
    <>
      <Tooltip title="Notificaciones">
        <IconButton
          color="inherit"
          onClick={handleOpen}
          aria-label={`Notificaciones${unreadCount ? `, ${unreadCount} sin leer` : ''}`}
          sx={{
            borderRadius: '12px',
            bgcolor: open ? 'action.selected' : 'transparent',
          }}
        >
          <Badge
            badgeContent={unreadCount > 99 ? '99+' : unreadCount}
            color="error"
            overlap="circular"
            invisible={unreadCount === 0}
          >
            <BellIcon />
          </Badge>
        </IconButton>
      </Tooltip>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            sx: {
              mt: 1,
              width: { xs: 'min(100vw - 24px, 380px)', sm: 380 },
              maxWidth: 'calc(100vw - 24px)',
              borderRadius: '16px',
              border: '1px solid',
              borderColor: 'divider',
              overflowX: 'hidden',
              overflowY: 'hidden',
            },
          },
        }}
      >
        <Box
          sx={{
            px: 2,
            py: 1.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1,
            borderBottom: '1px solid',
            borderColor: 'divider',
            minWidth: 0,
          }}
        >
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="subtitle2" fontWeight={800} noWrap>
              Centro de alertas
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
              {statusCaption}
            </Typography>
          </Box>
          <Button
            size="small"
            startIcon={<DoneAllIcon />}
            disabled={unreadCount === 0}
            onClick={handleMarkAllRead}
            sx={{ textTransform: 'none', fontWeight: 700, flexShrink: 0, whiteSpace: 'nowrap' }}
          >
            Marcar leídas
          </Button>
        </Box>

        <Box sx={{ overflowY: 'auto', overflowX: 'hidden', maxHeight: 400, minWidth: 0 }}>
          {loading && items.length === 0 ? (
            <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
              <CircularProgress size={28} />
            </Box>
          ) : error ? (
            <Box sx={{ p: 2 }}>
              <Typography variant="body2" color="error" sx={{ mb: 1 }}>
                {error}
              </Typography>
              <Button size="small" onClick={() => refresh()}>Reintentar</Button>
            </Box>
          ) : items.length === 0 ? (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <BellIcon sx={{ fontSize: 36, opacity: 0.35, mb: 1 }} />
              <Typography variant="body2" color="text.secondary">
                No hay alertas de clientes, inventario o cuentas por ahora.
              </Typography>
            </Box>
          ) : (
            <>
              <List disablePadding dense>
                {pagedItems.map((item, index) => {
                  const meta = CATEGORY_META[item.category] || CATEGORY_META.clientes;
                  const CategoryIcon = meta.Icon;
                  const unread = !readIds.has(String(item.id));
                  return (
                    <React.Fragment key={item.id}>
                      {index > 0 ? <Divider component="li" /> : null}
                      <ListItemButton
                        onClick={() => handleItemClick(item)}
                        sx={{
                          alignItems: 'flex-start',
                          py: 1.25,
                          px: 2,
                          bgcolor: unread ? 'action.hover' : 'transparent',
                          minWidth: 0,
                          overflow: 'hidden',
                        }}
                      >
                        <ListItemIcon sx={{ minWidth: 40, mt: 0.4 }}>
                          <Box
                            sx={{
                              width: 34,
                              height: 34,
                              borderRadius: '10px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              bgcolor: `${meta.color}18`,
                              color: meta.color,
                              position: 'relative',
                              flexShrink: 0,
                            }}
                          >
                            <CategoryIcon sx={{ fontSize: 18 }} />
                            <Box
                              sx={{
                                position: 'absolute',
                                top: -2,
                                right: -2,
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                bgcolor: severityDot(item.severity),
                                border: '1.5px solid',
                                borderColor: 'background.paper',
                              }}
                            />
                          </Box>
                        </ListItemIcon>
                        <ListItemText
                          sx={{ m: 0, minWidth: 0, overflow: 'hidden' }}
                          primary={(
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                              <Typography
                                variant="body2"
                                fontWeight={unread ? 800 : 700}
                                noWrap
                                sx={{ minWidth: 0 }}
                              >
                                {item.title}
                              </Typography>
                              {unread ? (
                                <Box
                                  sx={{
                                    width: 6,
                                    height: 6,
                                    borderRadius: '50%',
                                    bgcolor: 'primary.main',
                                    flexShrink: 0,
                                  }}
                                />
                              ) : null}
                            </Box>
                          )}
                          secondary={(
                            <>
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                component="span"
                                sx={{
                                  display: 'block',
                                  mt: 0.25,
                                  overflowWrap: 'anywhere',
                                  wordBreak: 'break-word',
                                }}
                              >
                                {item.message}
                              </Typography>
                              <Typography
                                variant="caption"
                                component="span"
                                sx={{ color: meta.color, fontWeight: 700 }}
                              >
                                {meta.label}
                              </Typography>
                            </>
                          )}
                        />
                      </ListItemButton>
                    </React.Fragment>
                  );
                })}
              </List>
              {pageCount > 1 ? (
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'center',
                    py: 1,
                    px: 1,
                    borderTop: '1px solid',
                    borderColor: 'divider',
                    overflow: 'hidden',
                    minWidth: 0,
                  }}
                >
                  <Pagination
                    count={pageCount}
                    page={currentPage}
                    onChange={(_event, value) => setPage(value)}
                    size="small"
                    color="primary"
                    siblingCount={0}
                    boundaryCount={1}
                    sx={{
                      maxWidth: '100%',
                      '& .MuiPagination-ul': {
                        flexWrap: 'nowrap',
                        justifyContent: 'center',
                      },
                    }}
                  />
                </Box>
              ) : null}
            </>
          )}
        </Box>
      </Popover>
    </>
  );
}
