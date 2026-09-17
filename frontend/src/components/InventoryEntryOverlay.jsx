import React, { useCallback, useEffect, useRef, useState } from 'react';
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
/** Nunca dejar al usuario atrapado en el overlay (red lenta / prefetch colgado). */
const OVERLAY_HARD_CAP_MS = 18_000;
/** Tras tener datos listos, esperar un poco al video y luego continuar (Android a veces no dispara `ended`). */
const READY_SKIP_GRACE_MS = 3_500;
/** Sin avance de reproducción → tratar el video como terminado o fallido. */
const PLAYBACK_STALL_MS = 7_000;

function stageLabel(progress) {
  const stage = STAGES.find((s) => progress <= s.until) ?? STAGES[STAGES.length - 1];
  return stage.label;
}

/**
 * Pantalla de entrada post-login con el video de inventario + progreso.
 * Termina cuando los datos están listos y el video acabó (o fallbacks en móvil).
 */
export default function InventoryEntryOverlay({ open, ready = false, onComplete }) {
  const videoRef = useRef(null);
  const completedRef = useRef(false);
  const videoEndedRef = useRef(false);
  const readyRef = useRef(ready);
  const progressRef = useRef(0);
  const lastPlaybackAtRef = useRef(0);
  const lastVideoTimeRef = useRef(0);
  const playbackStartedRef = useRef(false);
  const [progress, setProgress] = useState(0);

  readyRef.current = ready;
  progressRef.current = progress;

  const completeOnce = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    setProgress(100);
    window.setTimeout(() => onComplete?.(), 320);
  }, [onComplete]);

  const markVideoDone = useCallback(() => {
    videoEndedRef.current = true;
    setProgress((prev) => Math.max(prev, WAITING_PROGRESS_CAP));
  }, []);

  const tryFinish = useCallback(() => {
    if (!readyRef.current || !videoEndedRef.current) return;
    completeOnce();
  }, [completeOnce]);

  const forceFinishOverlay = useCallback(() => {
    markVideoDone();
    completeOnce();
  }, [completeOnce, markVideoDone]);

  useEffect(() => {
    if (!open) {
      setProgress(0);
      completedRef.current = false;
      videoEndedRef.current = false;
      playbackStartedRef.current = false;
      lastPlaybackAtRef.current = 0;
      lastVideoTimeRef.current = 0;
      return undefined;
    }

    const video = videoRef.current;
    if (!video) return undefined;

    completedRef.current = false;
    videoEndedRef.current = false;
    playbackStartedRef.current = false;
    lastPlaybackAtRef.current = Date.now();
    lastVideoTimeRef.current = 0;
    video.currentTime = 0;
    video.loop = false;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', 'true');
    video.setAttribute('x5-playsinline', 'true');

    const hardCapTimer = window.setTimeout(forceFinishOverlay, OVERLAY_HARD_CAP_MS);

    const stallTimer = window.setInterval(() => {
      if (completedRef.current || videoEndedRef.current) return;
      const sinceProgress = Date.now() - lastPlaybackAtRef.current;
      if (sinceProgress >= PLAYBACK_STALL_MS) {
        markVideoDone();
        tryFinish();
        if (readyRef.current) {
          completeOnce();
        }
      }
    }, 800);

    const notePlaybackProgress = () => {
      lastPlaybackAtRef.current = Date.now();
    };

    const startPlayback = () => {
      if (playbackStartedRef.current || completedRef.current) return;
      playbackStartedRef.current = true;
      notePlaybackProgress();

      const playPromise = video.play();
      if (playPromise && typeof playPromise.then === 'function') {
        playPromise
          .then(() => notePlaybackProgress())
          .catch(() => {
            markVideoDone();
            tryFinish();
            if (readyRef.current) {
              completeOnce();
            }
          });
      }
    };

    const handleLoadedMetadata = () => {
      notePlaybackProgress();
      if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
        startPlayback();
      }
    };

    const handleCanPlay = () => {
      startPlayback();
    };

    const handleTimeUpdate = () => {
      const duration = video.duration;
      if (video.currentTime > lastVideoTimeRef.current + 0.01) {
        lastVideoTimeRef.current = video.currentTime;
        notePlaybackProgress();
      }
      if (!duration || Number.isNaN(duration) || !Number.isFinite(duration)) return;
      const raw = Math.min(100, Math.round((video.currentTime / duration) * 100));
      const next = readyRef.current
        ? Math.min(99, raw)
        : Math.min(WAITING_PROGRESS_CAP, raw);
      setProgress(next);
    };

    const handleEnded = () => {
      markVideoDone();
      video.pause();
      tryFinish();
    };

    const handleError = () => {
      markVideoDone();
      tryFinish();
      if (readyRef.current) {
        completeOnce();
      }
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('error', handleError);
    video.addEventListener('stalled', notePlaybackProgress);
    video.addEventListener('waiting', notePlaybackProgress);

    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      handleLoadedMetadata();
    } else {
      video.load();
    }

    return () => {
      window.clearTimeout(hardCapTimer);
      window.clearInterval(stallTimer);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('error', handleError);
      video.removeEventListener('stalled', notePlaybackProgress);
      video.removeEventListener('waiting', notePlaybackProgress);
      video.pause();
    };
  }, [open, completeOnce, forceFinishOverlay, markVideoDone, tryFinish]);

  useEffect(() => {
    if (!open || !ready || completedRef.current) return undefined;

    if (videoEndedRef.current) {
      completeOnce();
      return undefined;
    }

    const graceMs =
      progressRef.current >= 85
        ? 900
        : progressRef.current >= 50
          ? READY_SKIP_GRACE_MS
          : READY_SKIP_GRACE_MS + 1500;

    const timer = window.setTimeout(() => {
      if (completedRef.current) return;
      markVideoDone();
      completeOnce();
    }, graceMs);

    return () => window.clearTimeout(timer);
  }, [open, ready, completeOnce, markVideoDone]);

  useEffect(() => {
    if (!open || !ready || completedRef.current || !videoEndedRef.current) {
      return undefined;
    }

    completeOnce();
    return undefined;
  }, [open, ready, completeOnce]);

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
