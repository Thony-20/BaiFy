import React, { useState } from 'react';
import { Box, Fab, Paper, Slide, useMediaQuery, useTheme } from '@mui/material';
import { AutoAwesome as AutoAwesomeIcon } from '@mui/icons-material';
import BaifyAiChatPanel from './BaifyAiChatPanel';
import { useBaifyAiTokens } from './baifyAi/baifyAiTokens';

const BORDER_RADIUS = { mobile: 16, desktop: 20 };

export default function FloatingBaifyChat() {
  const theme = useTheme();
  const t = useBaifyAiTokens();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [panelOpen, setPanelOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);

  const radius = isMobile ? BORDER_RADIUS.mobile : BORDER_RADIUS.desktop;

  const panelSize = {
    width: isMobile ? 'min(100%, calc(100vw - 24px))' : 392,
    height: isMobile
      ? 'min(88dvh, calc(100dvh - 48px))'
      : 'min(520px, calc(100dvh - 96px))',
    maxHeight: isMobile ? 'min(88dvh, calc(100dvh - 48px))' : 'calc(100dvh - 96px)',
  };

  const openPanel = () => {
    setEverOpened(true);
    setPanelOpen(true);
  };

  const hidePanel = () => {
    setPanelOpen(false);
  };

  return (
    <Box
      sx={{
        position: 'fixed',
        zIndex: (th) => th.zIndex.modal + 1,
        pointerEvents: 'none',
        ...(isMobile
          ? {
              right: 12,
              bottom: 12,
              left: panelOpen ? 12 : 'auto',
              top: 'auto',
            }
          : {
              right: 24,
              bottom: 24,
              left: 'auto',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: 1.5,
            }),
      }}
    >
      <Slide direction="up" in={panelOpen} mountOnEnter unmountOnExit={false}>
        <Box
          sx={{
            position: 'relative',
            pointerEvents: 'auto',
            borderRadius: `${radius}px`,
            p: '1.5px',
            overflow: 'hidden',
            boxShadow: t.panelShadow,
            ...panelSize,
          }}
        >
          <Box
            aria-hidden
            sx={{
              position: 'absolute',
              inset: '-120%',
              pointerEvents: 'none',
              background: `conic-gradient(from 0deg,
                transparent 0deg,
                transparent 300deg,
                ${t.accent} 318deg,
                #60A5FA 334deg,
                ${t.accent} 350deg,
                transparent 360deg)`,
              animation: reduceMotion ? 'none' : 'baifyChatBorderSpin 6s linear infinite',
              '@keyframes baifyChatBorderSpin': {
                '0%': { transform: 'rotate(0deg)' },
                '100%': { transform: 'rotate(360deg)' },
              },
            }}
          />
          <Paper
            elevation={0}
            sx={{
              position: 'relative',
              zIndex: 1,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              minHeight: 0,
              bgcolor: t.bg,
              border: 'none',
              backgroundImage: 'none',
              borderRadius: `${radius - 2}px`,
              width: '100%',
              height: '100%',
            }}
          >
            {everOpened ? (
              <BaifyAiChatPanel onClose={hidePanel} onMinimize={hidePanel} />
            ) : null}
          </Paper>
        </Box>
      </Slide>

      {!panelOpen ? (
        <Fab
          color="primary"
          aria-label="Abrir BayFi AI"
          onClick={openPanel}
          sx={{
            pointerEvents: 'auto',
            width: 56,
            height: 56,
            bgcolor: t.accent,
            boxShadow: t.fabShadow,
            '&:hover': { bgcolor: t.accentHover },
            ...(isMobile ? {} : { position: 'relative' }),
          }}
        >
          <AutoAwesomeIcon />
        </Fab>
      ) : null}
    </Box>
  );
}
