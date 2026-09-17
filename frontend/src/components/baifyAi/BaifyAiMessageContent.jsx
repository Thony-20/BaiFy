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
      return (
        <React.Fragment key={`${keyPrefix}-p-${linkIndex}-${index}`}>
          {renderPlainWithMetricHighlight(boldPart, `${keyPrefix}-${linkIndex}-${index}`)}
        </React.Fragment>
      );
    });
  });
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

/** Renderizado seguro: párrafos, listas, negritas, enlaces http(s), bloques ``` */
export default function BaifyAiMessageContent({ text }) {
  const t = useBaifyAiTokens();
  const raw = String(text || '');
  const segments = raw.split(/(```[\s\S]*?```)/g);

  return segments.map((segment, segIndex) => {
    if (segment.startsWith('```') && segment.endsWith('```')) {
      const inner = segment.slice(3, -3).replace(/^\w+\n/, '');
      return renderCodeBlock(inner.trim(), `code-${segIndex}`, t.border);
    }

    const lines = segment.split('\n');
    return lines.map((line, lineIndex) => {
      const isList = /^(\s*[-•]|\s*\d+\.)\s/.test(line);
      return (
        <Box
          key={`${segIndex}-${lineIndex}`}
          component="div"
          sx={{
            mb: line.trim() === '' ? 0.75 : isList ? 0.35 : 0.5,
            pl: isList ? 1.5 : 0,
          }}
        >
          {line.trim() === '' ? '\u00A0' : renderInline(line, `l-${segIndex}-${lineIndex}`, t.accent)}
        </Box>
      );
    });
  });
}
