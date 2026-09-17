import React from 'react';
import {
  Box,
  Card,
  CardActionArea,
  Typography,
} from '@mui/material';
import {
  BarChartOutlined as SalesIcon,
  Inventory2Outlined as StockIcon,
  AccountBalanceWalletOutlined as DebtIcon,
} from '@mui/icons-material';
import { QUICK_PROMPTS, useBaifyAiTokens } from './baifyAiTokens';
import BaifyAiMascot from './BaifyAiMascot';

const ICONS = {
  'sales-today': SalesIcon,
  stock: StockIcon,
  debt: DebtIcon,
};

export default function BaifyAiChatWelcome({ onSelectPrompt, disabled = false }) {
  const t = useBaifyAiTokens();

  return (
    <Box
      sx={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        px: 2,
        pt: 1,
        pb: 2,
        textAlign: 'center',
        width: '100%',
      }}
    >
      <BaifyAiMascot variant="welcome" sx={{ mt: 0.5, mb: 0.5 }} />
      <Typography
        variant="subtitle1"
        sx={{ fontWeight: 700, color: t.textPrimary, mb: 1 }}
      >
        ¡Hola! Soy BayFi AI 👋
      </Typography>
      <Typography
        variant="body2"
        sx={{ color: t.textSecondary, maxWidth: 320, mb: 2, lineHeight: 1.5 }}
      >
        Te ayudo con ventas, stock y clientes. ¿Qué necesitas consultar?
      </Typography>

      <Box
        sx={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'stretch',
          gap: 1,
          width: '100%',
          maxWidth: 360,
          mx: 'auto',
        }}
      >
        {QUICK_PROMPTS.map((item) => {
          const Icon = ICONS[item.id] || SalesIcon;
          return (
            <Card
              key={item.id}
              elevation={0}
              sx={{
                flex: '1 1 0',
                minWidth: 0,
                bgcolor: t.surface,
                border: `1px solid ${t.border}`,
                borderRadius: 2,
              }}
            >
              <CardActionArea
                disabled={disabled}
                onClick={() => onSelectPrompt(item.prompt)}
                sx={{
                  height: '100%',
                  px: 0.75,
                  py: 1.25,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                }}
              >
                <Box
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: 1.5,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: t.chipIconBg,
                    color: t.accent,
                    mb: 0.75,
                  }}
                >
                  <Icon sx={{ fontSize: 18 }} />
                </Box>
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 600,
                    color: t.textPrimary,
                    lineHeight: 1.25,
                    fontSize: '0.68rem',
                  }}
                >
                  {item.label}
                </Typography>
              </CardActionArea>
            </Card>
          );
        })}
      </Box>
    </Box>
  );
}
