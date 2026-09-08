import React, { useEffect, useRef, useState } from 'react';
import { Box } from '@mui/material';

const pendingReady = [];
let flushing = false;

function enqueueReady(callback) {
  pendingReady.push(callback);
  if (flushing) return;
  flushing = true;
  requestAnimationFrame(flushReadyQueue);
}

function flushReadyQueue() {
  const next = pendingReady.shift();
  if (next) next();
  if (pendingReady.length > 0) {
    requestAnimationFrame(flushReadyQueue);
  } else {
    flushing = false;
  }
}

/**
 * Contenedor que solo monta el gráfico cuando ya tiene tamaño y está cerca del viewport.
 * Evita el warning de Recharts y el bajón de FPS al montar varios charts a la vez.
 */
export default function ChartReadyContainer({
  height = 350,
  children,
  sx = {},
  watchKey = '',
  deferUntilVisible = true,
}) {
  const ref = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(false);
    const el = ref.current;
    let cancelled = false;
    let sized = false;
    let visible = !deferUntilVisible;
    let queued = false;

    const tryReady = () => {
      if (cancelled || queued || !(sized && visible)) return;
      queued = true;
      enqueueReady(() => {
        if (!cancelled) setReady(true);
      });
    };

    if (!el || typeof ResizeObserver === 'undefined') {
      const id = requestAnimationFrame(() => {
        if (!cancelled) setReady(true);
      });
      return () => {
        cancelled = true;
        cancelAnimationFrame(id);
      };
    }

    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      sized = rect.width > 1 && rect.height > 1;
      tryReady();
    };

    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);

    let io;
    if (deferUntilVisible && typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (!entry?.isIntersecting) return;
          visible = true;
          tryReady();
          io.disconnect();
        },
        { rootMargin: '64px 0px', threshold: 0.01 }
      );
      io.observe(el);
    } else {
      visible = true;
      tryReady();
    }

    const raf = requestAnimationFrame(updateSize);
    const timeoutId = window.setTimeout(updateSize, 120);

    return () => {
      cancelled = true;
      ro.disconnect();
      io?.disconnect();
      cancelAnimationFrame(raf);
      window.clearTimeout(timeoutId);
    };
  }, [watchKey, height, deferUntilVisible]);

  return (
    <Box
      ref={ref}
      sx={{
        width: '100%',
        height,
        minWidth: 0,
        minHeight: height,
        position: 'relative',
        contain: 'layout style',
        ...sx,
      }}
    >
      {ready ? children : null}
    </Box>
  );
}
