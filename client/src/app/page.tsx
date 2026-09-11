'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { fetchApi } from '@/lib/api';
import { ArrowRight, Lock, Mail, Sparkles, CheckCircle2, ShieldCheck } from 'lucide-react';
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
            'linear-gradient(180deg, rgba(5, 5, 15, 0.72) 0%, rgba(9, 10, 15, 0.65) 40%, rgba(5, 5, 20, 0.75) 100%)',
        }}
        aria-hidden="true"
      />

      {/* Layer 3–4: Animated stars, glow orbs, orbital streaks */}
      <AnimatedSpaceBackground />

      {/* Layer 5: Page content */}
      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Top minimal header */}
        <header className="border-b border-white/[0.06] backdrop-blur-sm px-6 py-4 flex items-center justify-between max-w-7xl mx-auto w-full">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded bg-indigo-600 flex items-center justify-center text-white font-mono text-sm font-bold shadow-sm shadow-indigo-500/30">
              T
            </div>
            <span className="font-mono text-sm tracking-wider uppercase text-slate-200">Trao Prep</span>
          </div>
          <button
            onClick={() => {
              setIsLogin(!isLogin);
              setError(null);
            }}
            className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            {isLogin ? 'Need an account? Register' : 'Already have an account? Log in'}
          </button>
        </header>

        {/* Main hero & auth container */}
        <main className="flex-1 max-w-7xl mx-auto px-6 py-12 md:py-20 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center w-full">
          {/* Left column: Hero narrative */}
          <div className="lg:col-span-7 space-y-8">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full border border-indigo-500/20 bg-indigo-500/10 text-indigo-400 text-xs font-mono backdrop-blur-sm">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Multi-Stage Autonomous Interview Pipeline</span>
            </div>

            <div className="space-y-4">
              <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white leading-tight drop-shadow-lg">
                Prepare smarter.<br />
                <span className="text-slate-300/80">Understand the role.</span><br />
                Know the company.
              </h1>
              <p className="text-base sm:text-lg text-slate-300/70 max-w-xl leading-relaxed">
                AI-powered interview preparation built from the actual job description and company research. Deliberate multi-step crawling, verified requirement coverage, and an editable prep kit.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-white/[0.06]">
              <div className="space-y-1">
                <div className="text-xs font-mono text-indigo-400 font-semibold uppercase tracking-wider">01. Research</div>
                <div className="text-xs text-slate-400">Crawls company site, ranks career pages, discovers interview process.</div>
              </div>
              <div className="space-y-1">
                <div className="text-xs font-mono text-indigo-400 font-semibold uppercase tracking-wider">02. Coverage</div>
                <div className="text-xs text-slate-400">Deterministic checks guarantee all must-have requirements have questions.</div>
              </div>
              <div className="space-y-1">
                <div className="text-xs font-mono text-indigo-400 font-semibold uppercase tracking-wider">03. Practice</div>
                <div className="text-xs text-slate-400">Confidence-rated flashcards and arithmetic day-by-day schedule.</div>
              </div>
            </div>
          </div>

          {/* Right column: Auth card */}
          <div className="lg:col-span-5">
            <div className="bg-[#10121A]/90 border border-white/[0.08] rounded-xl p-8 shadow-2xl shadow-black/60 backdrop-blur-md">
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-slate-100">
                  {isLogin ? 'Sign in to Trao Prep' : 'Create an Account'}
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  {isLogin
                    ? 'Access your saved kits and practice sessions'
                    : 'Start generating tailored interview kits in seconds'}
                </p>
              </div>

              {error && (
                <div className="mb-5 p-3 rounded-md bg-red-500/10 border border-red-500/30 text-xs text-red-400">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="candidate@example.com"
                      className="w-full bg-[#0A0B10]/80 border border-[#262838] focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-md py-2 pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-600 outline-none transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-[#0A0B10]/80 border border-[#262838] focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-md py-2 pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-600 outline-none transition-colors"
                    />
                  </div>
                  {!isLogin && (
                    <p className="text-[11px] text-slate-500 mt-1">Minimum 6 characters</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-md text-sm font-medium transition-all shadow-md shadow-indigo-600/20 active:scale-[0.99] mt-2"
                >
                  <span>{loading ? 'Processing...' : isLogin ? 'Sign In →' : 'Create Account →'}</span>
                </button>
              </form>

              <div className="mt-6 pt-5 border-t border-white/[0.06] text-center">
                <button
                  type="button"
                  onClick={() => {
                    setIsLogin(!isLogin);
                    setError(null);
                  }}
                  className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  {isLogin ? "Don't have an account? Sign up" : 'Already registered? Log in'}
                </button>
              </div>
            </div>
          </div>
        </main>

        {/* Minimal Footer */}
        <footer className="border-t border-white/[0.06] py-6 text-center text-xs text-slate-500">
          Trao Full-Stack Engineering Assessment &middot; Built with Groq &amp; Next.js
        </footer>
      </div>
    </div>
  );
}
