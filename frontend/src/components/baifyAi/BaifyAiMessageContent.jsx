import React from 'react';
import { Box, Link } from '@mui/material';
import { useBaifyAiTokens } from './baifyAiTokens';

const METRIC_SPLIT =
  /(\d{1,3}(?:\.\d{3})*(?:,\d{2})?\s*Bs\.?|\b\d+\s+ventas\b|\b\d+\s+unidades?\b)/gi;

function isAutoHighlightedMetric(piece) {
  return (
    /^\d{1,3}(?:\.\d{3})*(?:,\d{2})?\s*Bs\.?$/i.test(piece)
    || /^\d+\s+ventas$/i.test(piece)
    || /^\d+\s+unidades?$/i.test(piece)
  );
}

function renderPlainWithMetricHighlight(segment, keyPrefix) {
  const pieces = String(segment).split(METRIC_SPLIT);
  return pieces.map((piece, index) => {
    if (!piece) return null;
    if (isAutoHighlightedMetric(piece)) {
      return (
        <Box component="strong" key={`${keyPrefix}-m-${index}`} sx={{ fontWeight: 800 }}>
          {piece}
        </Box>
      );
    }
    return <React.Fragment key={`${keyPrefix}-t-${index}`}>{piece}</React.Fragment>;
  });
}

function renderInline(segment, keyPrefix, accent) {
  const linkParts = String(segment).split(/(\[[^\]]+\]\([^)]+\))/g);
  return linkParts.map((part, linkIndex) => {
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      const href = linkMatch[2];
      const safe =
        href.startsWith('http://') || href.startsWith('https://') || href.startsWith('/');
      if (!safe) return linkMatch[1];
      return (
        <Link
          key={`${keyPrefix}-lnk-${linkIndex}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          sx={{ color: accent, fontWeight: 600 }}
        >
          {linkMatch[1]}
        </Link>
      );
    }

    const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
    return boldParts.map((boldPart, index) => {
      if (boldPart.startsWith('**') && boldPart.endsWith('**')) {
        return (
          <Box component="strong" key={`${keyPrefix}-b-${linkIndex}-${index}`} sx={{ fontWeight: 800 }}>
            {boldPart.slice(2, -2)}
          </Box>
        );
      }
      const italicParts = boldPart.split(/(\*[^*\s][^*\n]*?\*)/g);
      return (
        <React.Fragment key={`${keyPrefix}-p-${linkIndex}-${index}`}>
          {italicParts.map((italicPart, italicIndex) => {
            const partKey = `${keyPrefix}-${linkIndex}-${index}-${italicIndex}`;
            if (/^\*[^*\s][^*\n]*?\*$/.test(italicPart)) {
              return (
                <Box component="em" key={`${partKey}-i`}>
                  {italicPart.slice(1, -1)}
                </Box>
              );
            }
            return (
              <React.Fragment key={`${partKey}-t`}>
                {renderPlainWithMetricHighlight(italicPart, partKey)}
              </React.Fragment>
            );
          })}
        </React.Fragment>
      );
    });
  });
}

const HEADING_RE = /^\s*#{1,6}\s+(.*)$/;
const BULLET_RE = /^(\s*)[-*•]\s+(.*)$/;
const NUMBERED_RE = /^(\s*)(\d+)[.)]\s+(.*)$/;
const RULE_RE = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;

function isBlockStart(line) {
  return HEADING_RE.test(line) || BULLET_RE.test(line) || NUMBERED_RE.test(line);
}

/**
 * Limpia la salida del modelo: espacios faltantes tras puntuación o negritas
 * y líneas en blanco entre párrafos, títulos y listas.
 */
function normalizeText(raw) {
  let text = String(raw || '').replace(/\r\n?/g, '\n');

  // "venta.Luego" → "venta. Luego" (solo minúscula/cierre + puntuación + mayúscula).
  text = text.replace(/([a-záéíóúñü)\]])([.!?;:,])(?=[A-ZÁÉÍÓÚÑ¿¡])/g, '$1$2 ');
  // "**Ingreso:**1.250" → "**Ingreso:** 1.250"
  text = text.replace(/(\*\*[^*\n]+?\*\*)(?=[A-Za-zÁÉÍÓÚÑáéíóúñ0-9¿¡(])/g, (match, bold, offset, full) => {
    const prev = full[offset - 1];
    return prev && /[A-Za-z0-9]/.test(prev) ? match : `${bold} `;
  });

  const lines = text.split('\n').map((line) => line.replace(/\s+$/, ''));
  const out = [];
  lines.forEach((line) => {
    const prev = out[out.length - 1];
    const prevIsText = prev != null && prev.trim() !== '';
    const needsGap =
      prevIsText &&
      ((HEADING_RE.test(line)) ||
        (isBlockStart(line) && !BULLET_RE.test(prev) && !NUMBERED_RE.test(prev)) ||
        (line.trim() !== '' && !isBlockStart(line) && (HEADING_RE.test(prev) ||
          ((BULLET_RE.test(prev) || NUMBERED_RE.test(prev)) && !/^\s{2,}/.test(line)))));
    if (needsGap) out.push('');
    out.push(line);
  });

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function renderListItem({ key, marker, body, indent, accent }) {
  return (
    <Box
      key={key}
      sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75, pl: 0.5 + indent * 1.5, mb: 0.4 }}
    >
      <Box
        component="span"
        sx={{
          flexShrink: 0,
          minWidth: marker === '•' ? '0.6em' : '1.3em',
          color: accent,
          fontWeight: 700,
          textAlign: 'right',
        }}
      >
        {marker}
      </Box>
      <Box component="span" sx={{ flex: 1, minWidth: 0 }}>
        {body}
      </Box>
    </Box>
  );
}

function renderTextBlock(segment, segIndex, t) {
  const lines = segment.split('\n');
  const nodes = [];
  let lastWasGap = true;

  lines.forEach((line, lineIndex) => {
    const key = `${segIndex}-${lineIndex}`;
    const keyPrefix = `l-${key}`;

    if (line.trim() === '') {
      if (!lastWasGap) nodes.push(<Box key={key} sx={{ height: 8 }} />);
      lastWasGap = true;
      return;
    }
    lastWasGap = false;

    if (RULE_RE.test(line)) {
      nodes.push(<Box key={key} sx={{ borderTop: `1px solid ${t.border}`, my: 1 }} />);
      return;
    }

    const heading = line.match(HEADING_RE);
    if (heading) {
      nodes.push(
        <Box key={key} sx={{ fontWeight: 700, fontSize: '0.92rem', mb: 0.5 }}>
          {renderInline(heading[1].replace(/^\*\*(.*)\*\*$/, '$1'), keyPrefix, t.accent)}
        </Box>
      );
      return;
    }

    const numbered = line.match(NUMBERED_RE);
    if (numbered) {
      nodes.push(
        renderListItem({
          key,
          marker: `${numbered[2]}.`,
          body: renderInline(numbered[3], keyPrefix, t.accent),
          indent: Math.floor(numbered[1].length / 2),
          accent: t.accent,
        })
      );
      return;
    }

    const bullet = line.match(BULLET_RE);
    if (bullet) {
      nodes.push(
        renderListItem({
          key,
          marker: '•',
          body: renderInline(bullet[2], keyPrefix, t.accent),
          indent: Math.floor(bullet[1].length / 2),
          accent: t.accent,
        })
      );
      return;
    }

    nodes.push(
      <Box key={key} sx={{ mb: 0.25 }}>
        {renderInline(line.trim(), keyPrefix, t.accent)}
      </Box>
    );
  });

  return nodes;
}

function renderCodeBlock(code, key, border) {
  return (
    <Box
      key={key}
      component="pre"
      sx={{
        my: 1,
        p: 1.25,
        borderRadius: 1.5,
        bgcolor: 'action.hover',
        border: `1px solid ${border}`,
        overflowX: 'auto',
        fontSize: '0.75rem',
        lineHeight: 1.45,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      }}
    >
      <Box component="code">{code}</Box>
    </Box>
  );
}

/** Renderizado seguro: títulos, párrafos, listas, negritas, enlaces http(s), bloques ``` */
export default function BaifyAiMessageContent({ text }) {
  const t = useBaifyAiTokens();
  const raw = String(text || '');
  const segments = raw.split(/(```[\s\S]*?```)/g);

  return segments.map((segment, segIndex) => {
    if (segment.startsWith('```') && segment.endsWith('```')) {
      const inner = segment.slice(3, -3).replace(/^\w+\n/, '');
      return renderCodeBlock(inner.trim(), `code-${segIndex}`, t.border);
    }

    return (
      <React.Fragment key={`seg-${segIndex}`}>
        {renderTextBlock(normalizeText(segment), segIndex, t)}
      </React.Fragment>
    );
  });
}
