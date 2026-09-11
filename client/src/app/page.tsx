'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { fetchApi } from '@/lib/api';
import { Lock, Mail, Sparkles } from 'lucide-react';
import AnimatedSpaceBackground from '@/components/AnimatedSpaceBackground';

export default function LandingPage() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if already logged in
  useEffect(() => {
    fetchApi<{ user: { id: string; email: string } }>('/auth/me')
      .then(() => router.replace('/dashboard'))
      .catch(() => {
        // Not authenticated, stay on page
      });
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const endpoint = isLogin ? '/auth/login' : '/auth/register';
      await fetchApi(endpoint, {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Layer 1: Galaxy image background */}
      <div
        className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/galaxy.jpg')" }}
        aria-hidden="true"
      />

      {/* Layer 2: Dark translucent gradient overlay */}
      <div
        className="fixed inset-0 z-[1] pointer-events-none"
        style={{
          background:
            'linear-gradient(180deg, rgba(5, 5, 15, 0.78) 0%, rgba(9, 10, 15, 0.68) 40%, rgba(5, 5, 20, 0.80) 100%)',
        }}
        aria-hidden="true"
      />

      {/* Layer 3–4: Animated stars, glow orbs, orbital streaks */}
      <AnimatedSpaceBackground />

      {/* Layer 5: Page content */}
      <div className="relative z-10 flex flex-col min-h-screen">
        {/* ─── Header ─────────────────────────────────────────────────── */}
        <header className="border-b border-white/[0.06] px-6 py-4">
          <div className="max-w-7xl mx-auto w-full flex items-center justify-between">
            {/* Logo + script subtitle */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-white font-bold text-base shadow-lg shadow-violet-500/20">
                T
              </div>
              <div className="flex flex-col leading-tight">
                <div className="flex items-center gap-1.5">
                  <span className="font-sans text-sm font-bold tracking-[0.15em] uppercase text-slate-100">
                    Trao
                  </span>
                  <span className="font-sans text-sm font-light tracking-[0.15em] uppercase text-slate-400">
                    Prep
                  </span>
                </div>
                <span className="font-serif italic text-[11px] text-violet-300/60 -mt-0.5">
                  celestial interview craft
                </span>
              </div>
            </div>

            {/* Right: toggle auth mode */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-500 hidden sm:inline">
                {isLogin ? 'Need an account?' : 'Already have an account?'}
              </span>
              <button
                onClick={() => {
                  setIsLogin(!isLogin);
                  setError(null);
                }}
                className="px-4 py-1.5 text-xs font-medium text-slate-200 border border-white/[0.1] rounded-lg hover:border-violet-500/30 hover:text-white transition-all backdrop-blur-sm"
              >
                {isLogin ? 'Register' : 'Log in'}{' '}
                <span className="sparkle sparkle-delay-1 text-violet-400 ml-0.5">✦</span>
              </button>
            </div>
          </div>
        </header>

        {/* ─── Main hero & auth container ──────────────────────────────── */}
        <main className="flex-1 max-w-7xl mx-auto px-6 py-12 md:py-16 lg:py-20 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center w-full">
          {/* Left column: Hero narrative */}
          <div className="lg:col-span-7 space-y-8">
            {/* Decorative sparkle */}
            <span className="sparkle sparkle-delay-2 text-violet-400/50 text-sm ml-16 block -mb-4">✦</span>

            {/* Pipeline badge */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full badge-pipeline text-xs tracking-wide">
              <Sparkles className="w-3.5 h-3.5 text-violet-400" />
              <span className="text-violet-200 font-medium">Multi-Stage Autonomous Interview Pipeline</span>
              <span className="sparkle text-amber-400/60 text-[10px]">✦</span>
            </div>

            {/* Decorative sparkle */}
            <span className="sparkle sparkle-delay-3 text-violet-300/30 text-lg absolute right-[55%] mt-2 hidden lg:inline">◇</span>

            <div className="space-y-5">
              <h1 className="text-[2.75rem] sm:text-[3.5rem] lg:text-[3.75rem] font-extrabold tracking-tight text-white leading-[1.1]">
                Prepare{' '}
                <span className="accent-italic">smarter.</span>
                <br />
                Understand the{' '}
                <span className="accent-italic">role.</span>
                <br />
                Know the{' '}
                <span className="accent-italic">company.</span>
              </h1>

              {/* Decorative line with sparkles */}
              <div className="flex items-center gap-3 text-violet-500/30 py-1">
                <span className="sparkle text-xs">✦</span>
                <div className="h-px w-8 bg-violet-500/20" />
                <div className="h-px w-4 bg-violet-500/15" />
                <div className="h-px w-6 bg-violet-500/10" />
                <span className="sparkle sparkle-delay-4 text-xs text-violet-400/20">◇</span>
              </div>

              <p className="text-[15px] sm:text-base text-slate-400 max-w-xl leading-relaxed">
                AI-powered interview preparation built from the actual job
                description and deep company research. Deliberate multi-step
                crawling, verified requirement coverage, and an editable bespoke
                prep kit.
              </p>
            </div>

            {/* Feature columns */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 pt-5 border-t border-white/[0.05]">
              <div className="space-y-1.5">
                <div className="flex items-baseline gap-2">
                  <span className="text-[11px] font-serif italic text-violet-400/70">01.</span>
                  <span className="text-xs font-bold uppercase tracking-[0.12em] text-slate-200">Research</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Crawls company site, ranks career pages, discovers interview process.
                </p>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-baseline gap-2">
                  <span className="text-[11px] font-serif italic text-violet-400/70">02.</span>
                  <span className="text-xs font-bold uppercase tracking-[0.12em] text-slate-200">Coverage</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Deterministic checks guarantee all must-have requirements have questions.
                </p>
                <span className="sparkle sparkle-delay-2 text-violet-400/20 text-[10px] block">✦</span>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-baseline gap-2">
                  <span className="text-[11px] font-serif italic text-violet-400/70">03.</span>
                  <span className="text-xs font-bold uppercase tracking-[0.12em] text-slate-200">Practice</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Confidence-rated flashcards and arithmetic day-by-day schedule.
                </p>
              </div>
            </div>
          </div>

          {/* ─── Right column: Glassmorphic Auth card ─────────────────── */}
          <div className="lg:col-span-5">
            <div className="glass-card rounded-2xl p-8 relative transition-all duration-300">
              {/* Card corner sparkles */}
              <span className="sparkle sparkle-delay-1 absolute top-5 left-6 text-violet-400/30 text-xs">✧ ✦</span>
              <span className="sparkle sparkle-delay-3 absolute bottom-5 right-6 text-violet-400/20 text-xs">◇</span>

              {/* Card header label */}
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h2 className="text-[1.65rem] font-bold text-white tracking-tight font-sans">
                    {isLogin ? 'Welcome Back' : 'Create an Account'}
                  </h2>
                  <p className="text-xs text-slate-400 mt-1.5 flex items-center gap-1">
                    <span className="font-serif italic text-violet-300/70">
                      {isLogin
                        ? 'Access your saved kits and practice sessions'
                        : 'Start generating tailored interview kits in seconds'}
                    </span>
                    <span className="sparkle text-amber-400/50 text-[10px]">✦</span>
                  </p>
                </div>
                <span className="text-[10px] uppercase tracking-[0.15em] text-violet-400/40 font-medium whitespace-nowrap mt-1">
                  Celestial Portal
                </span>
              </div>

              {error && (
                <div className="mb-5 p-3 rounded-lg bg-red-500/8 border border-red-500/20 text-xs text-red-400">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Email field */}
                <div>
                  <div className="flex items-baseline justify-between mb-2">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-300">
                      Email Address
                    </label>
                    <span className="text-[10px] font-serif italic text-violet-400/40">
                      invitation ready
                    </span>
                  </div>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="candidate@example.com"
                      className="glass-input w-full rounded-lg py-2.5 pl-10 pr-4 text-sm text-slate-100 placeholder:text-slate-600"
                    />
                  </div>
                </div>

                {/* Password field */}
                <div>
                  <div className="flex items-baseline justify-between mb-2">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-300">
                      Password
                    </label>
                    <span className="text-[10px] font-serif italic text-violet-400/40">
                      enchanted key
                    </span>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="glass-input w-full rounded-lg py-2.5 pl-10 pr-4 text-sm text-slate-100 placeholder:text-slate-600"
                    />
                  </div>
                  {!isLogin && (
                    <div className="flex items-center justify-between mt-1.5">
                      <p className="text-[10px] text-slate-500 flex items-center gap-1">
                        <span className="sparkle text-violet-400/30 text-[8px]">✦</span>
                        Minimum 6 characters
                      </p>
                      <p className="text-[10px] font-serif italic text-violet-400/30">
                        Safe &amp; encrypted
                      </p>
                    </div>
                  )}
                </div>

                {/* CTA button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="btn-gradient w-full flex items-center justify-center gap-2 py-3 px-4 text-white rounded-xl text-sm font-semibold tracking-wide mt-3"
                >
                  <span>
                    {loading
                      ? 'Processing...'
                      : isLogin
                      ? 'Sign In'
                      : 'Create Account'}
                  </span>
                  <span className="text-white/80">→</span>
                </button>
              </form>

              {/* Toggle auth mode */}
              <div className="mt-6 pt-5 border-t border-white/[0.05] text-center">
                <button
                  type="button"
                  onClick={() => {
                    setIsLogin(!isLogin);
                    setError(null);
                  }}
                  className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
                >
                  {isLogin ? "Don't have an account? " : 'Already registered? '}
                  <span className="font-semibold text-violet-400 hover:text-violet-300">
                    {isLogin ? 'Sign up' : 'Log in'}
                  </span>
                  {' '}
                  <span className="sparkle sparkle-delay-2 text-violet-400/50 text-[10px]">✦</span>
                </button>
              </div>
            </div>
          </div>
        </main>

        {/* ─── Footer ─────────────────────────────────────────────────── */}
        <footer className="border-t border-white/[0.05] py-5 px-6">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <span>© 2025 Trao Prep Inc.</span>
              <span className="text-violet-500/30">·</span>
              <span className="font-serif italic text-violet-300/40">Crafted under starlight</span>
            </div>
            <div className="flex items-center gap-5 text-[11px] text-slate-600">
              <span className="hover:text-slate-400 cursor-pointer transition-colors">Privacy Policy</span>
              <span className="hover:text-slate-400 cursor-pointer transition-colors">Terms of Service</span>
              <span className="hover:text-slate-400 cursor-pointer transition-colors">Security</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
