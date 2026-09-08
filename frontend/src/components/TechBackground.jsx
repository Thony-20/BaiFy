import React from 'react';
import { Box, useTheme } from '@mui/material';

const TechBackground = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box
      sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 0,
        overflow: 'hidden',
        background: theme.palette.background.default,
        transition: 'background 0.3s ease',
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundImage: `
            linear-gradient(${isDark ? 'rgba(108, 99, 255, 0.03)' : 'rgba(108, 99, 255, 0.04)'} 1px, transparent 1px),
            linear-gradient(90deg, ${isDark ? 'rgba(108, 99, 255, 0.03)' : 'rgba(108, 99, 255, 0.04)'} 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        },
      }}
    >
      {/* Decorative Light Blooms (The requested "destellos") */}
      <Box sx={{
        position: 'absolute',
        top: '-10%',
        left: '-10%',
        width: '40%',
        height: '40%',
        background: isDark 
          ? 'radial-gradient(circle, rgba(108, 99, 255, 0.15) 0%, rgba(108, 99, 255, 0) 70%)'
          : 'radial-gradient(circle, rgba(108, 99, 255, 0.06) 0%, rgba(108, 99, 255, 0) 70%)',
        filter: 'blur(60px)',
        animation: 'bloomFloat 8s infinite alternate ease-in-out',
        zIndex: 1,
      }} />
      <Box sx={{
        position: 'absolute',
        bottom: '-10%',
        right: '-10%',
        width: '50%',
        height: '50%',
        background: isDark
          ? 'radial-gradient(circle, rgba(0, 217, 166, 0.1) 0%, rgba(0, 217, 166, 0) 70%)'
          : 'radial-gradient(circle, rgba(0, 217, 166, 0.04) 0%, rgba(0, 217, 166, 0) 70%)',
        filter: 'blur(80px)',
        animation: 'bloomFloat 12s infinite alternate-reverse ease-in-out',
        zIndex: 1,
      }} />
      <Box sx={{
        position: 'absolute',
        top: '20%',
        right: '-5%',
        width: '30%',
        height: '30%',
        background: 'radial-gradient(circle, rgba(255, 82, 82, 0.05) 0%, rgba(255, 82, 82, 0) 70%)',
        filter: 'blur(50px)',
        animation: 'bloomFloat 10s infinite alternate ease-in-out',
        zIndex: 1,
      }} />

      <style>
        {`
          @keyframes bloomFloat {
            0% { transform: translate(0, 0) scale(1); opacity: 0.5; }
            50% { transform: translate(20px, 30px) scale(1.1); opacity: 0.8; }
            100% { transform: translate(-10px, -20px) scale(0.9); opacity: 0.4; }
          }
          @keyframes twinkle {
            0%, 100% { opacity: 0.1; transform: scale(1); }
            50% { opacity: 0.6; transform: scale(2); }
          }
        `}
      </style>

      {/* Circuit Lines Layer */}
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 1000 1000"
          preserveAspectRatio="none"
          style={{ position: 'absolute', top: 0, left: 0, opacity: isDark ? 0.2 : 0.04, transition: 'opacity 0.3s ease', zIndex: 2 }}
        >
          <defs>
            <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#6C63FF" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#00D9A6" stopOpacity="0.2" />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <g stroke="url(#lineGrad)" strokeWidth="1.2" fill="none" filter="url(#glow)">
            {/* Esquina Superior Izquierda */}
            <path d="M 0 50 L 60 50 L 60 120 L 120 120" />
            <circle cx="120" cy="120" r="2.5" fill="#6C63FF" />
            
            {/* Esquina Superior Derecha */}
            <path d="M 1000 80 L 930 80 L 930 160 L 870 160" />
            <circle cx="870" cy="160" r="2.5" fill="#00D9A6" />

            {/* Esquina Inferior Izquierda */}
            <path d="M 0 900 L 50 900 L 50 820 L 100 820" />
            <circle cx="100" cy="820" r="2.5" fill="#6C63FF" />

            {/* Esquina Inferior Derecha */}
            <path d="M 1000 940 L 920 940 L 920 860 L 850 860" />
            <circle cx="850" cy="860" r="2.5" fill="#00D9A6" />
          </g>
        </svg>

      {/* Central Hexagon Symbol */}
      <Box 
        sx={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '350px',
          height: '350px',
          opacity: 0.04,
          pointerEvents: 'none',
          zIndex: 0
        }}
      >
        <svg width="100%" height="100%" viewBox="0 0 100 100">
           <path 
            d="M 50 5 L 89 27.5 L 89 72.5 L 50 95 L 11 72.5 L 11 27.5 Z" 
            fill="none" 
            stroke="#6C63FF" 
            strokeWidth="0.3"
          />
        </svg>
      </Box>

      {/* Floating Sparkles */}
      {[...Array(15)].map((_, i) => (
        <Box
          key={i}
          sx={{
            position: 'absolute',
            width: '2px',
            height: '2px',
            borderRadius: '50%',
            backgroundColor: i % 2 === 0 ? '#6C63FF' : '#00D9A6',
            top: `${Math.random() * 100}%`,
            left: `${Math.random() * 100}%`,
            opacity: 0.2,
            animation: `twinkle ${3 + Math.random() * 5}s infinite ease-in-out`,
          }}
        />
      ))}
    </Box>
  );
};

export default TechBackground;
