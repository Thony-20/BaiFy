import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { getEntryVideoSrc } from '../utils/entryVideoPreload';

const STAGES = [
  { until: 22, label: 'Abriendo tu cuenta' },
  { until: 48, label: 'Ordenando inventario' },
  { until: 72, label: 'Acomodando productos' },
  { until: 99, label: 'Preparando tu panel' },
  { until: 100, label: '¡Todo listo!' },
];

/** Nunca dejar al usuario atrapado en el overlay (red lenta / prefetch colgado). */
const OVERLAY_HARD_CAP_MS = 20_000;
/** Sin avance de reproducción → tratar el video como no disponible y seguir solo la carga del sistema. */
const PLAYBACK_STALL_MS = 5_000;
/** Mientras el sistema carga, el % avanza de forma asintótica hacia este tope (nunca 100 sin datos). */
const SYSTEM_START = 12;
const SYSTEM_WAIT_CAP = 90;
const SYSTEM_EASE_MS = 3_000;
/** Velocidad máxima de la barra (%/s) para que el tramo final siempre se vea llegar a 100. */
const MAX_SPEED_PER_SEC = 70;
/** Pausa en 100% antes de entrar al panel. */
const DONE_HOLD_MS = 450;
/** Android a veces no dispara `ended`: margen para darlo por terminado. */
const END_EPSILON_S = 0.12;

function stageLabel(progress) {
  const stage = STAGES.find((s) => progress <= s.until) ?? STAGES[STAGES.length - 1];
  return stage.label;
}

/**
 * Pantalla de entrada post-login con el video de inventario + progreso.
 * El % es el mínimo entre el avance del video y la carga real del sistema (`ready`):
 * solo llega a 100 cuando ambos terminaron. Si el sistema tarda, el video se repite;
 * si el video no puede reproducirse, la barra sigue solo a la carga del sistema.
 */
export default function InventoryEntryOverlay({ open, ready = false, onComplete }) {
  const videoRef = useRef(null);
  const barRef = useRef(null);
  const readyRef = useRef(ready);
  const onCompleteRef = useRef(onComplete);
  const [progress, setProgress] = useState(0);
  const [videoSrc, setVideoSrc] = useState(null);

  useEffect(() => {
    readyRef.current = ready;
    onCompleteRef.current = onComplete;
  }, [ready, onComplete]);

  useEffect(() => {
    if (!open) {
      setProgress(0);
      setVideoSrc(null);
      return;
    }
    setVideoSrc(getEntryVideoSrc());
  }, [open]);

  useEffect(() => {
    if (!open || !videoSrc) return undefined;

    const video = videoRef.current;
    if (!video) return undefined;

    const openedAt = performance.now();
    let rafId = 0;
    let finishTimer = 0;
    let videoDone = false;
    let forced = false;
    let displayed = 0;
    let shownInt = -1;
    let lastFrameAt = openedAt;
    let lastVideoTime = -1;
    let lastVideoAdvanceAt = openedAt;

    video.loop = false;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', 'true');
    video.setAttribute('x5-playsinline', 'true');

    const markVideoDone = () => {
      if (videoDone) return;
      videoDone = true;
      // Si el sistema aún no está listo, repetir el video en vez de dejarlo congelado.
      if (!readyRef.current && !video.error) {
        video.loop = true;
        const p = video.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
    };

    const tryPlay = () => {
      if (videoDone) return;
      const p = video.play();
      if (p && typeof p.catch === 'function') {
        // Autoplay bloqueado (p. ej. iOS en modo ahorro de energía): seguir solo con la carga del sistema.
        p.catch(() => markVideoDone());
      }
    };

    video.addEventListener('canplay', tryPlay);
    video.addEventListener('ended', markVideoDone);
    video.addEventListener('error', markVideoDone);

    video.currentTime = 0;
    if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      tryPlay();
    } else {
      video.load();
    }

    const hardCapTimer = window.setTimeout(() => {
      forced = true;
      markVideoDone();
    }, OVERLAY_HARD_CAP_MS);

    const tick = (now) => {
      const dt = Math.min(100, now - lastFrameAt);
      lastFrameAt = now;
      const elapsed = now - openedAt;

      // Avance del video (leído por frame, no con `timeupdate`, para que la barra sea fluida)
      if (!videoDone) {
        const { currentTime, duration } = video;
        if (currentTime > lastVideoTime + 0.01) {
          lastVideoTime = currentTime;
          lastVideoAdvanceAt = now;
        } else if (now - lastVideoAdvanceAt >= PLAYBACK_STALL_MS) {
          markVideoDone();
        }
        if (duration && Number.isFinite(duration) && currentTime >= duration - END_EPSILON_S) {
          markVideoDone();
        }
      }
      const { duration } = video;
      const videoPct = videoDone
        ? 100
        : duration && Number.isFinite(duration)
          ? (video.currentTime / duration) * 100
          : 0;

      // Carga del sistema: sube sola hacia SYSTEM_WAIT_CAP y solo llega a 100 con los datos listos
      const systemReady = readyRef.current || forced;
      const systemPct = systemReady
        ? 100
        : SYSTEM_START + (SYSTEM_WAIT_CAP - SYSTEM_START) * (1 - Math.exp(-elapsed / SYSTEM_EASE_MS));

      const target = Math.min(videoPct, systemPct);
      if (target > displayed) {
        const eased = displayed + (target - displayed) * Math.min(1, dt / 180);
        displayed = Math.min(eased, displayed + (MAX_SPEED_PER_SEC * dt) / 1000);
        if (target - displayed < 0.05) displayed = target;
      }

      if (barRef.current) barRef.current.style.width = `${displayed}%`;
      const nextInt = Math.floor(displayed);
      if (nextInt !== shownInt) {
        shownInt = nextInt;
        setProgress(nextInt);
      }

      if (systemReady && videoDone && displayed >= 100) {
        finishTimer = window.setTimeout(() => onCompleteRef.current?.(), DONE_HOLD_MS);
        return;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      window.clearTimeout(hardCapTimer);
      window.clearTimeout(finishTimer);
      video.removeEventListener('canplay', tryPlay);
      video.removeEventListener('ended', markVideoDone);
      video.removeEventListener('error', markVideoDone);
      video.pause();
    };
  }, [open, videoSrc]);

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
            // Fondo casi opaco en vez de backdrop-filter: el blur a pantalla completa traba el video en móviles
            background: 'rgba(6, 8, 18, 0.94)',
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
                src={videoSrc ?? undefined}
                muted
                autoPlay
                playsInline
                preload="auto"
                disablePictureInPicture
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
                  ref={barRef}
                  style={{
                    width: '0%',
                    height: '100%',
                    borderRadius: 999,
                    background: 'linear-gradient(90deg, #38bdf8, #7cff67, #a78bfa)',
                    backgroundSize: '200% 100%',
                    willChange: 'width',
                  }}
                  animate={{ backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }}
                  transition={{
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
