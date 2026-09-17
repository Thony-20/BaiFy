import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Box } from '@mui/material';
import { keyframes } from '@mui/system';

const STROKE = 2;
const IDLE_ARC = 0.11;
const PATH_LEN = 1000;
const idleDash = `${PATH_LEN * IDLE_ARC} ${PATH_LEN * (1 - IDLE_ARC)}`;
const CONNECT_MS = 1350;
const RELEASE_MS = 650;

const borderTravel = keyframes({
  '0%': { strokeDashoffset: 0 },
  '100%': { strokeDashoffset: -PATH_LEN },
});

const borderConnect = keyframes({
  '0%': { strokeDasharray: idleDash, strokeDashoffset: 0 },
  '100%': { strokeDasharray: `${PATH_LEN} 0`, strokeDashoffset: 0 },
});

const borderRelease = keyframes({
  '0%': { strokeDasharray: `${PATH_LEN} 0`, strokeDashoffset: 0 },
  '100%': { strokeDasharray: idleDash, strokeDashoffset: 0 },
});

/**
 * Borde animado: arco corto girando en reposo; al enviar mensaje crece hasta cerrar el perímetro.
 */
export default function BaifyAiChatBorder({
  busy,
  radius,
  accent,
  reduceMotion,
  panelShadow,
  panelSize,
  fillParent = false,
  children,
}) {
  const wrapRef = useRef(null);
  const rectRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [ringPhase, setRingPhase] = useState('idle');
  const gradId = useId().replace(/:/g, '');

  const measure = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
  }, []);

  useLayoutEffect(() => {
    measure();
    const wrap = wrapRef.current;
    if (!wrap) return undefined;
    const ro = new ResizeObserver(() => measure());
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [measure]);

  useEffect(() => {
    if (busy) {
      setRingPhase('connect');
      return;
    }
    setRingPhase((prev) => (prev === 'closed' || prev === 'connect' ? 'release' : 'idle'));
  }, [busy]);

  useEffect(() => {
    if (ringPhase !== 'connect') return undefined;
    const timer = setTimeout(() => setRingPhase('closed'), CONNECT_MS);
    return () => clearTimeout(timer);
  }, [ringPhase]);

  useEffect(() => {
    if (ringPhase !== 'release') return undefined;
    const timer = setTimeout(() => setRingPhase('idle'), RELEASE_MS);
    return () => clearTimeout(timer);
  }, [ringPhase]);

  const inset = STROKE / 2;
  const rx = Math.max(0, radius - 2);
  const rectW = Math.max(0, size.w - STROKE);
  const rectH = Math.max(0, size.h - STROKE);
  const ringReady = size.w > 0 && size.h > 0;

  let ringAnimation = `${borderTravel} 6s linear infinite`;
  if (ringPhase === 'connect') {
    ringAnimation = `${borderConnect} ${CONNECT_MS}ms ease-out forwards`;
  } else if (ringPhase === 'closed') {
    ringAnimation = 'none';
  } else if (ringPhase === 'release') {
    ringAnimation = `${borderRelease} ${RELEASE_MS}ms ease-in forwards`;
  }

  const ringDasharray =
    ringPhase === 'closed' ? `${PATH_LEN} 0` : ringPhase === 'idle' ? idleDash : undefined;

  return (
    <Box
      ref={wrapRef}
      sx={{
        position: 'relative',
        pointerEvents: 'auto',
        borderRadius: `${radius}px`,
        p: '1.5px',
        overflow: 'hidden',
        boxShadow: panelShadow,
        ...(fillParent
          ? { width: '100%', height: '100%', maxHeight: '100%', minHeight: 0 }
          : panelSize),
        ...(reduceMotion ? { border: `1.5px solid ${accent}` } : null),
      }}
    >
      {!reduceMotion && ringReady ? (
        <Box
          component="svg"
          viewBox={`0 0 ${size.w} ${size.h}`}
          preserveAspectRatio="none"
          aria-hidden
          sx={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            zIndex: 2,
            overflow: 'visible',
          }}
        >
          <defs>
            <linearGradient
              id={gradId}
              gradientUnits="userSpaceOnUse"
              x1="0"
              y1="0"
              x2={size.w}
              y2={size.h}
            >
              <stop offset="0%" stopColor={accent} />
              <stop offset="45%" stopColor="#60A5FA" />
              <stop offset="100%" stopColor={accent} />
            </linearGradient>
          </defs>
          <rect
            ref={rectRef}
            x={inset}
            y={inset}
            width={rectW}
            height={rectH}
            rx={rx}
            ry={rx}
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth={STROKE}
            strokeLinecap="round"
            pathLength={PATH_LEN}
            style={{
              strokeDasharray: ringDasharray,
              strokeDashoffset: 0,
              animation: ringAnimation,
            }}
          />
        </Box>
      ) : null}

      <Box
        sx={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          height: '100%',
          borderRadius: `${Math.max(0, radius - 2)}px`,
          overflow: 'hidden',
          bgcolor: 'transparent',
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
