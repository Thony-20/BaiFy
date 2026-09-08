import React, { useEffect, useRef } from 'react';
import { Box } from '@mui/material';

/**
 * Fondo estelar mejorado con un sistema de partículas (constelaciones).
 * Incluye movimiento dinámico, conexiones aleatorias y reacción al cursor.
 */
export default function StarryBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;

    let particles = [];
    const connectionDistance = 160;
    const mouseRange = 180;
    let mouse = { x: null, y: null };

    // Definimos la clase Particle primero para evitar errores de hoisting
    class Particle {
      constructor() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.vx = (Math.random() - 0.5) * 0.4;
        this.vy = (Math.random() - 0.5) * 0.4;
        this.radius = Math.random() * 1.5 + 0.8;
        this.color = Math.random() > 0.6 ? '#6C63FF' : '#00D9A6';
        this.alpha = Math.random() * 0.6 + 0.2;
        this.initialAlpha = this.alpha;
      }

      draw() {
        if (!ctx) return;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        
        // Twinkle effect simple
        this.alpha = this.initialAlpha * (0.6 + Math.sin(Date.now() * 0.001 * this.radius) * 0.4);
        
        ctx.globalAlpha = this.alpha;
        ctx.fill();
        
        // Glow effect for larger stars
        if (this.radius > 1.2) {
          ctx.shadowBlur = 8;
          ctx.shadowColor = this.color;
        }
      }

      update() {
        this.x += this.vx;
        this.y += this.vy;

        // Bounce off edges with slight margin
        if (this.x < 0 || this.x > canvas.width) this.vx *= -1;
        if (this.y < 0 || this.y > canvas.height) this.vy *= -1;

        // Mouse interaction (repulsion sutil)
        if (mouse.x !== null && mouse.y !== null) {
          const dx = mouse.x - this.x;
          const dy = mouse.y - this.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          if (dist < mouseRange) {
            const angle = Math.atan2(dy, dx);
            const force = (mouseRange - dist) / mouseRange;
            this.x -= Math.cos(angle) * force * 1.5;
            this.y -= Math.sin(angle) * force * 1.5;
          }
        }
      }
    }

    const initParticles = () => {
      const particleCount = Math.min(Math.floor(window.innerWidth / 20), 80);
      particles = [];
      for (let i = 0; i < particleCount; i++) {
        particles.push(new Particle());
      }
    };

    const resize = () => {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      initParticles();
    };

    const handleMouseMove = (e) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };

    const handleMouseLeave = () => {
      mouse.x = null;
      mouse.y = null;
    };

    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseleave', handleMouseLeave);
    
    resize();

    const animate = () => {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let i = 0; i < particles.length; i++) {
        const p1 = particles[i];
        p1.update();
        p1.draw();

        // Reset shadow for lines
        ctx.shadowBlur = 0;

        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < connectionDistance) {
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            
            const alpha = (1 - dist / connectionDistance) * 0.15;
            ctx.strokeStyle = p1.color; 
            ctx.globalAlpha = alpha;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <Box
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: -1,
        overflow: 'hidden',
        pointerEvents: 'none',
        background: 'radial-gradient(ellipse 120% 80% at 50% -20%, rgba(108, 99, 255, 0.18) 0%, transparent 55%), radial-gradient(ellipse 90% 60% at 100% 50%, rgba(0, 217, 166, 0.08) 0%, transparent 45%), #0A0E1A',
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: 0,
          backgroundImage: `
            linear-gradient(rgba(108, 99, 255, 0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(108, 99, 255, 0.04) 1px, transparent 1px)
          `,
          backgroundSize: '48px 48px',
          opacity: 0.7,
        },
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          display: 'block',
          opacity: 0.8
        }}
      />
      
      {/* Decorative Light Blooms para dar profundidad */}
      <Box sx={{
        position: 'absolute',
        top: '20%',
        left: '10%',
        width: '40%',
        height: '40%',
        background: 'radial-gradient(circle, rgba(108, 99, 255, 0.08) 0%, transparent 70%)',
        filter: 'blur(60px)',
        zIndex: -2
      }} />
      <Box sx={{
        position: 'absolute',
        bottom: '10%',
        right: '5%',
        width: '35%',
        height: '35%',
        background: 'radial-gradient(circle, rgba(0, 217, 166, 0.05) 0%, transparent 70%)',
        filter: 'blur(50px)',
        zIndex: -2
      }} />
    </Box>
  );
}
