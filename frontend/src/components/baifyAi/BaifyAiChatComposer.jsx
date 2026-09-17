import React from 'react';
import { Box, IconButton, TextField } from '@mui/material';
import { Send as SendIcon, Stop as StopIcon } from '@mui/icons-material';
import { useBaifyAiTokens } from './baifyAiTokens';

export default function BaifyAiChatComposer({
  input,
  onInputChange,
  onSubmit,
  isBusy,
  onStop,
  sendDisabled,
}) {
  const t = useBaifyAiTokens();

  return (
    <Box
      sx={{
        flexShrink: 0,
        px: 2,
        pt: 1.5,
        pb: 'max(12px, env(safe-area-inset-bottom, 0px))',
        borderTop: `1px solid ${t.border}`,
        bgcolor: t.panel,
      }}
    >
      <Box
        component="form"
        onSubmit={onSubmit}
        sx={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}
      >
        <TextField
          fullWidth
          multiline
          maxRows={4}
          minRows={1}
          placeholder="Escribe tu pregunta…"
          value={input}
          onChange={onInputChange}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              onSubmit(event);
            }
          }}
          disabled={sendDisabled && !isBusy}
          aria-label="Mensaje para BayFi AI"
          sx={{
            '& .MuiOutlinedInput-root': {
              bgcolor: t.surface,
              borderRadius: 2,
              color: t.textPrimary,
              fontSize: '0.875rem',
              '& fieldset': { borderColor: t.border },
              '&:hover fieldset': { borderColor: t.borderStrong },
              '&.Mui-focused fieldset': { borderColor: t.accent },
            },
            '& .MuiInputBase-input::placeholder': { color: t.textSecondary, opacity: 1 },
          }}
        />
        {isBusy ? (
          <IconButton
            onClick={onStop}
            aria-label="Detener respuesta"
            sx={{
              width: 44,
              height: 44,
              bgcolor: 'rgba(239, 68, 68, 0.15)',
              color: '#F87171',
              '&:hover': { bgcolor: 'rgba(239, 68, 68, 0.25)' },
            }}
          >
            <StopIcon fontSize="small" />
          </IconButton>
        ) : (
          <IconButton
            type="submit"
            disabled={!input.trim() || sendDisabled}
            aria-label="Enviar mensaje"
            sx={{
              width: 44,
              height: 44,
              bgcolor: t.accent,
              color: '#fff',
              '&:hover': { bgcolor: t.accentHover },
              '&.Mui-disabled': { bgcolor: 'rgba(59, 130, 246, 0.25)', color: 'rgba(255,255,255,0.4)' },
            }}
          >
            <SendIcon fontSize="small" />
          </IconButton>
        )}
      </Box>
    </Box>
  );
}
