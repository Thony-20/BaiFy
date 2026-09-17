import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { API_URL, apiFetch } from '../services/api';
import useAuthStore from '../store/useAuthStore';
import { useBaifyAiTokens } from './baifyAi/baifyAiTokens';
import BaifyAiChatHeader from './baifyAi/BaifyAiChatHeader';
import BaifyAiChatWelcome from './baifyAi/BaifyAiChatWelcome';
import BaifyAiChatComposer from './baifyAi/BaifyAiChatComposer';
import BaifyAiMessageContent from './baifyAi/BaifyAiMessageContent';
import BaifyAiMascot from './baifyAi/BaifyAiMascot';

function getMessageText(message) {
  if (!message) return '';
  if (Array.isArray(message.parts) && message.parts.length > 0) {
    return message.parts
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('');
  }
  if (typeof message.content === 'string') return message.content;
  if (Array.isArray(message.content)) {
    return message.content
      .filter((part) => part?.type === 'text' && part.text)
      .map((part) => part.text)
      .join('');
  }
  return '';
}

function formatChatError(error) {
  const msg = error?.message || '';
  if (/límite diario|BAIFY_AI_DAILY_LIMIT/i.test(msg)) {
    return msg.includes('límite diario')
      ? msg
      : 'Alcanzaste el límite diario de mensajes a BayFi AI. Vuelve mañana.';
  }
  if (/Demasiados mensajes a Ba[iy]Fi AI/i.test(msg)) {
    return msg;
  }
  if (/ECONNRESET|Cannot connect to API|GEMINI_NETWORK|fetch failed/i.test(msg)) {
    return (
      'No hay conexión estable con Google Gemini. Revisa tu internet, desactiva VPN si usas una, ' +
      'espera 1 minuto e intenta de nuevo.'
    );
  }
  if (/quota|429|exceeded your current quota|rate.limit/i.test(msg)) {
    const retry = msg.match(/retry in ([\d.]+)s/i);
    const sec = retry ? Math.ceil(Number(retry[1])) : 60;
    return (
      `Cuota de Gemini agotada temporalmente. Espera ${sec} s o envía una pregunta a la vez.`
    );
  }
  return msg || 'No se pudo completar la respuesta de BayFi AI.';
}

function TypingIndicator() {
  const t = useBaifyAiTokens();
  return (
    <Stack direction="row" spacing={0.75} alignItems="center" sx={{ px: 0.5, py: 0.5 }}>
      <BaifyAiMascot variant="typing" />
      <Box
        sx={{
          px: 1.5,
          py: 1,
          borderRadius: 2,
          bgcolor: t.surface,
          border: `1px solid ${t.border}`,
          display: 'flex',
          gap: 0.5,
          alignItems: 'center',
        }}
      >
        {[0, 1, 2].map((i) => (
          <Box
            key={i}
            sx={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              bgcolor: t.textSecondary,
              animation: 'baifyTyping 1.2s ease-in-out infinite',
              animationDelay: `${i * 0.15}s`,
              '@keyframes baifyTyping': {
                '0%, 80%, 100%': { opacity: 0.35, transform: 'translateY(0)' },
                '40%': { opacity: 1, transform: 'translateY(-3px)' },
              },
            }}
          />
        ))}
      </Box>
    </Stack>
  );
}

/**
 * @param {{ onClose?: () => void, onMinimize?: () => void }} props
 */
export default function BaifyAiChatPanel({ onClose, onMinimize }) {
  const t = useBaifyAiTokens();
  const { userProfile } = useAuthStore();
  const [input, setInput] = useState('');
  const [cooldownSec, setCooldownSec] = useState(0);
  const [confirmNewOpen, setConfirmNewOpen] = useState(false);
  const scrollContainerRef = useRef(null);
  const bottomRef = useRef(null);
  const stickToBottomRef = useRef(true);
  const lastPromptRef = useRef('');

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `${API_URL}/chat`,
        headers: () => {
          const token = localStorage.getItem('token');
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
        fetch: apiFetch,
      }),
    []
  );

  const { messages, sendMessage, status, stop, setMessages, error } = useChat({
    transport,
  });

  const isBusy = status === 'submitted' || status === 'streaming';
  const businessName = userProfile?.empresaNombre || 'tu comercio';
  const hasConversation = messages.length > 0;
  const sendBlocked = isBusy || cooldownSec > 0;

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distance < 96;
  }, []);

  useEffect(() => {
    if (!stickToBottomRef.current) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    const behavior = status === 'streaming' ? 'auto' : 'smooth';
    if (behavior === 'smooth') {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    } else {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, status]);

  useEffect(() => {
    if (!error) return;
    const msg = error.message || '';
    if (!/quota|429|exceeded your current quota|Cuota de Gemini/i.test(msg)) return;
    const fromUi = msg.match(/Espera (\d+) s/i);
    const fromApi = msg.match(/retry in ([\d.]+)s/i);
    const sec = fromUi
      ? Number(fromUi[1])
      : fromApi
        ? Math.ceil(Number(fromApi[1]))
        : 90;
    setCooldownSec(Math.max(30, sec));
  }, [error]);

  useEffect(() => {
    if (cooldownSec <= 0) return undefined;
    const timer = setInterval(() => {
      setCooldownSec((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSec]);

  const submitText = (text) => {
    const trimmed = String(text || '').trim();
    if (!trimmed || sendBlocked) return;
    lastPromptRef.current = trimmed;
    sendMessage({ text: trimmed });
    setInput('');
    stickToBottomRef.current = true;
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    submitText(input);
  };

  const requestNewChat = () => {
    if (isBusy) stop();
    if (hasConversation) {
      setConfirmNewOpen(true);
      return;
    }
    setMessages([]);
    setInput('');
  };

  const confirmNewChat = () => {
    setConfirmNewOpen(false);
    setMessages([]);
    setInput('');
  };

  const handleRetry = () => {
    if (!lastPromptRef.current || sendBlocked) return;
    sendMessage({ text: lastPromptRef.current });
    stickToBottomRef.current = true;
  };

  const handleMinimize = () => {
    onMinimize?.();
  };

  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        bgcolor: t.bg,
        color: t.textPrimary,
      }}
    >
      <BaifyAiChatHeader
        businessName={businessName}
        onNewChat={requestNewChat}
        onMinimize={handleMinimize}
        onClose={onClose}
      />

      {cooldownSec > 0 ? (
        <Alert
          severity="warning"
          sx={{ borderRadius: 0, py: 0.75, fontSize: '0.8rem' }}
        >
          Cuota en pausa. Podrás enviar otro mensaje en {cooldownSec} s.
        </Alert>
      ) : null}

      {error && cooldownSec <= 0 ? (
        <Alert
          severity="error"
          sx={{ borderRadius: 0, py: 0.75, fontSize: '0.8rem' }}
          action={
            lastPromptRef.current ? (
              <Button color="inherit" size="small" onClick={handleRetry} disabled={sendBlocked}>
                Reintentar
              </Button>
            ) : null
          }
        >
          {formatChatError(error)}
        </Alert>
      ) : null}

      <Box
        ref={scrollContainerRef}
        onScroll={handleScroll}
        sx={{
          flex: 1,
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          WebkitOverflowScrolling: 'touch',
          minHeight: 0,
          bgcolor: t.bg,
        }}
      >
        {!hasConversation ? (
          <Box sx={{ minHeight: '100%', boxSizing: 'border-box' }}>
            <BaifyAiChatWelcome onSelectPrompt={submitText} disabled={sendBlocked} />
          </Box>
        ) : (
          <Box
            sx={{
              minHeight: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              p: 1.5,
              gap: 1.5,
              boxSizing: 'border-box',
            }}
          >
            {messages.map((message) => {
              const isUser = message.role === 'user';
              const text = getMessageText(message);
              if (!text) return null;

              return (
                <Box
                  key={message.id}
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: isUser ? 'flex-end' : 'flex-start',
                    maxWidth: '100%',
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{ color: t.textSecondary, mb: 0.5, px: 0.5 }}
                  >
                    {isUser ? 'Tú' : 'BayFi AI'}
                  </Typography>
                  <Box
                    sx={{
                      maxWidth: '92%',
                      px: 1.5,
                      py: 1.25,
                      borderRadius: 2,
                      bgcolor: isUser ? t.userBubble : t.surface,
                      color: isUser ? t.userText : t.textPrimary,
                      border: isUser ? 'none' : `1px solid ${t.border}`,
                      wordBreak: 'break-word',
                      typography: 'body2',
                      fontSize: '0.875rem',
                      lineHeight: 1.55,
                    }}
                  >
                    {isUser ? text : <BaifyAiMessageContent text={text} />}
                  </Box>
                </Box>
              );
            })}

            {isBusy ? <TypingIndicator /> : null}
            <div ref={bottomRef} />
          </Box>
        )}
      </Box>

      <BaifyAiChatComposer
        input={input}
        onInputChange={(e) => setInput(e.target.value)}
        onSubmit={handleSubmit}
        isBusy={isBusy}
        onStop={() => stop()}
        sendDisabled={sendBlocked}
      />

      <Dialog open={confirmNewOpen} onClose={() => setConfirmNewOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Nueva conversación</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Se borrará el historial visible de este chat. ¿Continuar?
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button onClick={() => setConfirmNewOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={confirmNewChat}>
            Continuar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
