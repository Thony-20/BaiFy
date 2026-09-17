import React from 'react';
import { Box } from '@mui/material';
import { useBaifyAiTokens } from './baifyAiTokens';

export const MASCOT_SRC = '/baify-ai-mascot.png?v=2';

/**
 * @param {{ variant?: 'welcome' | 'avatar' | 'typing', sx?: object }} props
 */
export default function BaifyAiMascot({ variant = 'welcome', sx = {} }) {
  const t = useBaifyAiTokens();

  if (variant === 'avatar') {
    return (
      <Box
        sx={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          overflow: 'hidden',
          flexShrink: 0,
          border: `1px solid ${t.border}`,
          bgcolor: 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          ...sx,
        }}
      >
        <Box
          component="img"
          src={MASCOT_SRC}
          alt=""
          sx={{
            width: '108%',
            height: '108%',
            objectFit: 'contain',
            objectPosition: '50% 48%',
          }}
        />
      </Box>
    );
  }

  if (variant === 'typing') {
    return (
      <Box
        sx={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          overflow: 'hidden',
          flexShrink: 0,
          bgcolor: 'transparent',
          border: `1px solid ${t.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          ...sx,
        }}
      >
        <Box
          component="img"
          src={MASCOT_SRC}
          alt=""
          sx={{
            width: '115%',
            height: '115%',
            objectFit: 'contain',
            objectPosition: '50% 48%',
          }}
        />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        mb: 1.5,
        minHeight: 108,
        ...sx,
      }}
    >
      <Box
        aria-hidden
        sx={{
          position: 'absolute',
          width: 120,
          height: 120,
          borderRadius: '50%',
          background: t.mascotGlow,
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -52%)',
          pointerEvents: 'none',
        }}
      />
      <Box
        component="img"
        src={MASCOT_SRC}
        alt=""
        sx={{
          position: 'relative',
          width: 'auto',
          height: 108,
          maxWidth: 'min(180px, 70vw)',
          objectFit: 'contain',
          objectPosition: '50% 50%',
          display: 'block',
          filter: t.mascotShadow,
        }}
      />
    </Box>
  );
}
