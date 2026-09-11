'use client';

import React, { useRef, useEffect, useCallback } from 'react';

/**
 * AnimatedSpaceBackground — Canvas-based animated stars and atmospheric effects.
 * Renders behind all UI content as a fixed full-viewport layer.
 *
 * Features:
 * - Deterministic star field (seeded PRNG) so layout doesn't change on re-render
 * - Gentle twinkling with varied speeds and phases
 * - A few slowly drifting "shooting" particles
 * - Soft atmospheric glow orbs that move very slowly
 * - Respects prefers-reduced-motion
 */

// Simple seeded PRNG (mulberry32) for deterministic star placement
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Star {
  x: number; // 0-1 normalized
  y: number; // 0-1 normalized
  size: number;
  baseOpacity: number;
  twinkleSpeed: number;
  twinklePhase: number;
}

interface DriftParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  life: number;
  maxLife: number;
}

interface GlowOrb {
  x: number;
  y: number;
  radius: number;
  color: string;
  vx: number;
  vy: number;
  baseX: number;
  baseY: number;
  angle: number;
  orbitRadius: number;
  orbitSpeed: number;
}

const STAR_COUNT = 120;
const DRIFT_PARTICLE_COUNT = 5;

export default function AnimatedSpaceBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const reducedMotionRef = useRef(false);
  const starsRef = useRef<Star[]>([]);
  const driftRef = useRef<DriftParticle[]>([]);
  const glowRef = useRef<GlowOrb[]>([]);
  const mouseRef = useRef({ x: 0.5, y: 0.5 });
  const initDoneRef = useRef(false);

  const initStars = useCallback(() => {
    const rng = mulberry32(42);
    const stars: Star[] = [];
    for (let i = 0; i < STAR_COUNT; i++) {
      stars.push({
        x: rng(),
        y: rng(),
        size: rng() * 1.8 + 0.3, // 0.3–2.1px
        baseOpacity: rng() * 0.5 + 0.2, // 0.2–0.7
        twinkleSpeed: rng() * 0.8 + 0.3, // 0.3–1.1
        twinklePhase: rng() * Math.PI * 2,
      });
    }
    starsRef.current = stars;
  }, []);

  const initDriftParticles = useCallback((w: number, h: number) => {
    const rng = mulberry32(137);
    const particles: DriftParticle[] = [];
    for (let i = 0; i < DRIFT_PARTICLE_COUNT; i++) {
      particles.push({
        x: rng() * w,
        y: rng() * h,
        vx: (rng() - 0.5) * 0.15,
        vy: (rng() - 0.5) * 0.1,
        size: rng() * 1.2 + 0.5,
        opacity: rng() * 0.3 + 0.1,
        life: 0,
        maxLife: rng() * 10000 + 8000,
      });
    }
    driftRef.current = particles;
  }, []);

  const initGlowOrbs = useCallback(() => {
    const orbs: GlowOrb[] = [
      {
        x: 0, y: 0, baseX: 0.25, baseY: 0.35,
        radius: 180, color: 'rgba(99, 60, 180, 0.04)',
        vx: 0, vy: 0, angle: 0, orbitRadius: 40, orbitSpeed: 0.0002,
      },
      {
        x: 0, y: 0, baseX: 0.7, baseY: 0.6,
        radius: 150, color: 'rgba(50, 100, 200, 0.035)',
        vx: 0, vy: 0, angle: Math.PI, orbitRadius: 35, orbitSpeed: 0.00015,
      },
      {
        x: 0, y: 0, baseX: 0.5, baseY: 0.2,
        radius: 120, color: 'rgba(130, 50, 160, 0.03)',
        vx: 0, vy: 0, angle: Math.PI / 2, orbitRadius: 25, orbitSpeed: 0.00025,
      },
    ];
    glowRef.current = orbs;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Check reduced motion preference
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotionRef.current = mql.matches;
    const handleMotionChange = (e: MediaQueryListEvent) => {
      reducedMotionRef.current = e.matches;
    };
    mql.addEventListener('change', handleMotionChange);

    // Resize handler
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (!initDoneRef.current) {
        initStars();
        initDriftParticles(window.innerWidth, window.innerHeight);
        initGlowOrbs();
        initDoneRef.current = true;
      }
    };

    resize();
    window.addEventListener('resize', resize);

    // Mouse tracking (subtle parallax)
    const handleMouse = (e: MouseEvent) => {
      mouseRef.current = {
        x: e.clientX / window.innerWidth,
        y: e.clientY / window.innerHeight,
      };
    };
    window.addEventListener('mousemove', handleMouse, { passive: true });

    let lastTime = performance.now();

    const draw = (time: number) => {
      const dt = time - lastTime;
      lastTime = time;
      const w = window.innerWidth;
      const h = window.innerHeight;

      ctx.clearRect(0, 0, w, h);

      const isReduced = reducedMotionRef.current;

      // Subtle parallax offset from mouse
      const px = isReduced ? 0 : (mouseRef.current.x - 0.5) * 4;
      const py = isReduced ? 0 : (mouseRef.current.y - 0.5) * 3;

      // Draw atmospheric glow orbs
      for (const orb of glowRef.current) {
        if (!isReduced) {
          orb.angle += orb.orbitSpeed * dt;
        }
        orb.x = orb.baseX * w + Math.cos(orb.angle) * orb.orbitRadius + px * 2;
        orb.y = orb.baseY * h + Math.sin(orb.angle) * orb.orbitRadius + py * 2;

        const gradient = ctx.createRadialGradient(orb.x, orb.y, 0, orb.x, orb.y, orb.radius);
        gradient.addColorStop(0, orb.color);
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, orb.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw stars with twinkling
      for (const star of starsRef.current) {
        let opacity = star.baseOpacity;
        if (!isReduced) {
          opacity *= 0.6 + 0.4 * Math.sin(time * 0.001 * star.twinkleSpeed + star.twinklePhase);
        }
        const sx = star.x * w + px;
        const sy = star.y * h + py;

        ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
        ctx.fillStyle = '#e8e0ff';
        ctx.beginPath();
        ctx.arc(sx, sy, star.size, 0, Math.PI * 2);
        ctx.fill();

        // Add a tiny glow to brighter stars
        if (star.size > 1.2 && opacity > 0.4) {
          ctx.globalAlpha = opacity * 0.15;
          ctx.beginPath();
          ctx.arc(sx, sy, star.size * 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      // Draw drift particles
      if (!isReduced) {
        for (const p of driftRef.current) {
          p.x += p.vx * (dt * 0.06);
          p.y += p.vy * (dt * 0.06);
          p.life += dt;

          // Fade in/out over life cycle
          const lifeFrac = p.life / p.maxLife;
          let alpha = p.opacity;
          if (lifeFrac < 0.15) alpha *= lifeFrac / 0.15;
          else if (lifeFrac > 0.85) alpha *= (1 - lifeFrac) / 0.15;

          if (p.life > p.maxLife || p.x < -20 || p.x > w + 20 || p.y < -20 || p.y > h + 20) {
            // Reset particle
            p.x = Math.random() * w;
            p.y = Math.random() * h;
            p.life = 0;
            p.vx = (Math.random() - 0.5) * 0.15;
            p.vy = (Math.random() - 0.5) * 0.1;
          }

          ctx.globalAlpha = Math.max(0, alpha);
          ctx.fillStyle = '#c8b8ff';
          ctx.beginPath();
          ctx.arc(p.x + px, p.y + py, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      // Draw a couple of very faint orbital light streaks
      if (!isReduced) {
        const streakTime = time * 0.00008;
        ctx.save();
        ctx.globalAlpha = 0.015;
        ctx.strokeStyle = '#8b5cf6';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i <= 60; i++) {
          const angle = streakTime + (i / 60) * Math.PI * 0.6;
          const r = 250 + i * 2.5;
          const cx = w * 0.55 + px * 3;
          const cy = h * 0.4 + py * 3;
          const x = cx + Math.cos(angle) * r;
          const y = cy + Math.sin(angle) * r * 0.5;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();

        ctx.globalAlpha = 0.012;
        ctx.strokeStyle = '#6366f1';
        ctx.beginPath();
        for (let i = 0; i <= 50; i++) {
          const angle = -streakTime * 0.7 + (i / 50) * Math.PI * 0.5 + Math.PI;
          const r = 200 + i * 3;
          const cx = w * 0.35 + px * 2;
          const cy = h * 0.55 + py * 2;
          const x = cx + Math.cos(angle) * r;
          const y = cy + Math.sin(angle) * r * 0.4;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();
      }

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', handleMouse);
      mql.removeEventListener('change', handleMotionChange);
    };
  }, [initStars, initDriftParticles, initGlowOrbs]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-[2] pointer-events-none"
      aria-hidden="true"
    />
  );
}
