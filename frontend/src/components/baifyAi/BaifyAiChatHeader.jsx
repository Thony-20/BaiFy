import React from 'react';
import { Box, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import {
  Close as CloseIcon,
  Refresh as RefreshIcon,
  Remove as MinimizeIcon,
} from '@mui/icons-material';
import { useBaifyAiTokens } from './baifyAiTokens';
import BaifyAiMascot from './BaifyAiMascot';

export default function BaifyAiChatHeader({
  businessName,
  onNewChat,
  onMinimize,
  onClose,
}) {
  const t = useBaifyAiTokens();

  return (
    <Stack
      direction="row"
      alignItems="center"
      justifyContent="space-between"
      sx={{
        px: 2,
        py: 1.25,
        flexShrink: 0,
        borderBottom: `1px solid ${t.border}`,
        bgcolor: t.panel,
      }}
    >
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
        <BaifyAiMascot variant="avatar" />
        <Box sx={{ minWidth: 0 }}>
          <Typography
            variant="subtitle2"
            sx={{ fontWeight: 700, color: t.textPrimary, lineHeight: 1.25 }}
            noWrap
          >
            BayFi AI
          </Typography>
          <Typography
            variant="caption"
            sx={{ color: t.textSecondary, display: 'block' }}
            noWrap
          >
            Copiloto de {businessName}
          </Typography>
        </Box>
      </Stack>

      <Stack direction="row" spacing={0.25} alignItems="center">
        <Tooltip title="Nueva conversación">
          <IconButton
            size="small"
            onClick={onNewChat}
            aria-label="Nueva conversación"
            sx={{ color: t.textSecondary, '&:hover': { color: t.textPrimary } }}
          >
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Minimizar">
          <IconButton
            size="small"
            onClick={onMinimize}
            aria-label="Minimizar chat"
            sx={{ color: t.textSecondary, '&:hover': { color: t.textPrimary } }}
          >
            <MinimizeIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        {onClose ? (
          <Tooltip title="Cerrar panel">
            <IconButton
              size="small"
              onClick={onClose}
              aria-label="Cerrar panel del chat"
              sx={{ color: t.textSecondary, '&:hover': { color: t.textPrimary } }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        ) : null}
      </Stack>
    </Stack>
  );
}
