'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { fetchApi } from '@/lib/api';
import { useTheme } from '@/components/ThemeProvider';
import { Plus, LogOut, Sun, Moon } from 'lucide-react';

interface NavbarProps {
  userEmail?: string | null;
}

export function Navbar({ userEmail }: NavbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();

  const handleLogout = async () => {
    try {
      await fetchApi('/auth/logout', { method: 'POST' });
    } catch {
      // ignore error
    }
    router.push('/');
  };

  return (
    <nav className="border-b border-slate-200/80 dark:border-[#212330] bg-white/85 dark:bg-[#0E1017]/85 backdrop-blur-md sticky top-0 z-50 transition-colors duration-150">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center space-x-6">
          <Link href="/dashboard" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-md shadow-violet-500/20 group-hover:shadow-violet-500/35 transition-all">
              T
            </div>
            <div className="flex flex-col leading-tight">
              <div className="flex items-center gap-1">
                <span className="font-sans text-xs sm:text-sm font-bold tracking-[0.12em] uppercase text-slate-900 dark:text-slate-100">
                  Trao
                </span>
                <span className="font-sans text-xs sm:text-sm font-light tracking-[0.12em] uppercase text-violet-600 dark:text-violet-400">
                  Prep
                </span>
              </div>
              <span className="font-serif italic text-[10px] text-violet-600/70 dark:text-violet-300/60 -mt-0.5 hidden sm:inline">
                Interview preparation
              </span>
            </div>
          </Link>

          <div className="hidden sm:flex items-center space-x-1">
            <Link
              href="/dashboard"
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                pathname === '/dashboard'
                  ? 'bg-violet-50 dark:bg-[#1C1E2A] text-violet-700 dark:text-slate-100 shadow-sm font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#161722]'
              }`}
            >
              Dashboard
            </Link>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center space-x-2.5 sm:space-x-3">
          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-[#212330] hover:bg-slate-100 dark:hover:bg-[#1C1E2A] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
            aria-label="Toggle theme"
          >
            {theme === 'light' ? (
              <Moon className="w-4 h-4 text-violet-600" />
            ) : (
              <Sun className="w-4 h-4 text-amber-400" />
            )}
          </button>

          <Link
            href="/kits/new"
            className="btn-gradient flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm active:scale-[0.98]"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Kit</span>
          </Link>

          {userEmail && (
            <div className="flex items-center space-x-2 sm:space-x-3 pl-2 border-l border-slate-200 dark:border-[#212330]">
              <span className="text-xs text-slate-600 dark:text-slate-400 hidden md:inline truncate max-w-[140px]">
                {userEmail}
              </span>
              <button
                onClick={handleLogout}
                title="Log Out"
                className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-[#1C1E2A] rounded-lg transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
