import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const STAGES = [
  { until: 22, label: 'Abriendo tu cuenta' },
  { until: 48, label: 'Ordenando inventario' },
  { until: 72, label: 'Acomodando productos' },
  { until: 90, label: 'Preparando tu panel' },
  { until: 100, label: '¡Todo listo!' },
];

const VIDEO_SRC = '/login-inventory.mp4';
const WAITING_PROGRESS_CAP = 95;

function stageLabel(progress) {
  const stage = STAGES.find((s) => progress <= s.until) ?? STAGES[STAGES.length - 1];
  return stage.label;
}

/**
 * Pantalla de entrada post-login con el video de inventario + progreso.
 * El overlay solo termina cuando `ready` es true (datos del panel listos).
 * Si el video acaba antes, se queda pausado en el último frame.
 */
export default function InventoryEntryOverlay({ open, ready = false, onComplete }) {
  const videoRef = useRef(null);
  const completedRef = useRef(false);
  const videoEndedRef = useRef(false);
  const readyRef = useRef(ready);
  const [progress, setProgress] = useState(0);

  readyRef.current = ready;

  useEffect(() => {
    if (!open) {
      setProgress(0);
      completedRef.current = false;
      videoEndedRef.current = false;
      return undefined;
    }

    const video = videoRef.current;
    if (!video) return undefined;

    completedRef.current = false;
    videoEndedRef.current = false;
    video.currentTime = 0;
    video.loop = false;

    const finish = () => {
      if (completedRef.current) return;
      completedRef.current = true;
      setProgress(100);
      window.setTimeout(() => onComplete?.(), 320);
    };

    const tryFinish = () => {
      if (!readyRef.current || !videoEndedRef.current) return;
      finish();
    };

    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        // Autoplay bloqueado: si los datos ya están listos, no atrapar al usuario
        videoEndedRef.current = true;
        tryFinish();
      });
    }

    const handleTimeUpdate = () => {
      const duration = video.duration;
      if (!duration || Number.isNaN(duration)) return;
      const raw = Math.min(100, Math.round((video.currentTime / duration) * 100));
      const next = readyRef.current
        ? Math.min(99, raw)
        : Math.min(WAITING_PROGRESS_CAP, raw);
      setProgress(next);
    };

    const handleEnded = () => {
      videoEndedRef.current = true;
      video.pause();
      if (!readyRef.current) {
        setProgress((prev) => Math.max(prev, WAITING_PROGRESS_CAP));
        return;
      }
      tryFinish();
    };

    const handleError = () => {
      videoEndedRef.current = true;
      tryFinish();
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('error', handleError);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('error', handleError);
      video.pause();
    };
  }, [open, onComplete]);

  // Si los datos llegan después de que el video ya terminó, cerrar el overlay
  useEffect(() => {
    if (!open || !ready || completedRef.current || !videoEndedRef.current) {
      return undefined;
    }

    completedRef.current = true;
    setProgress(100);
    const timer = window.setTimeout(() => onComplete?.(), 320);
    return () => window.clearTimeout(timer);
  }, [open, ready, onComplete]);

  const label = stageLabel(progress);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="inventory-entry"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem',
            background: 'rgba(6, 8, 18, 0.78)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
          }}
          role="status"
          aria-live="polite"
          aria-busy={progress < 100}
        >
          <motion.div
            initial={{ scale: 0.94, y: 16, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 160, damping: 18 }}
            style={{
              width: '100%',
              maxWidth: 480,
              borderRadius: '1.25rem',
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(12, 14, 28, 0.55)',
              boxShadow: '0 30px 80px rgba(0,0,0,0.55)',
              padding: '1.25rem 1.25rem 1.5rem',
              overflow: 'hidden',
            }}
          >
            <div style={{ textAlign: 'center', marginBottom: '0.75rem' }}>
              <img
                src="/LOGO1.png"
                alt="BayFi"
                style={{
                  width: 100,
                  height: 'auto',
                  objectFit: 'contain',
                  display: 'block',
                  margin: '0 auto',
                  filter: 'drop-shadow(0 8px 24px rgba(96,165,250,0.25))',
                }}
              />
            </div>

            <div
              style={{
                position: 'relative',
                borderRadius: '0.9rem',
                overflow: 'hidden',
                background: '#0a0a12',
                aspectRatio: '16 / 10',
              }}
            >
              <video
                ref={videoRef}
                src={VIDEO_SRC}
                muted
                playsInline
                preload="auto"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block',
                }}
              />
            </div>

            <div style={{ marginTop: '1rem', textAlign: 'center' }}>
              <p
                style={{
                  margin: 0,
                  fontSize: '0.95rem',
                  fontWeight: 600,
                  color: 'rgba(255,255,255,0.88)',
                  letterSpacing: '0.01em',
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                {label}
                {progress < 100 ? '…' : ''}{' '}
                <span style={{ color: '#7dd3fc', fontVariantNumeric: 'tabular-nums' }}>
                  {progress}%
                </span>
              </p>

              <div
                style={{
                  marginTop: '0.85rem',
                  height: 8,
                  borderRadius: 999,
                  background: 'rgba(255,255,255,0.08)',
                  overflow: 'hidden',
                }}
              >
                <motion.div
                  style={{
                    height: '100%',
                    borderRadius: 999,
                    background: 'linear-gradient(90deg, #38bdf8, #7cff67, #a78bfa)',
                    backgroundSize: '200% 100%',
                  }}
                  animate={{
                    width: `${progress}%`,
                    backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
                  }}
                  transition={{
                    width: { duration: 0.15, ease: 'linear' },
                    backgroundPosition: { duration: 2.4, repeat: Infinity, ease: 'linear' },
                  }}
                />
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
