'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { fetchApi } from '@/lib/api';
import { Sparkles, Plus, LogOut } from 'lucide-react';

interface NavbarProps {
  userEmail?: string | null;
}

export function Navbar({ userEmail }: NavbarProps) {
  const router = useRouter();
  const pathname = usePathname();

  const handleLogout = async () => {
    try {
      await fetchApi('/auth/logout', { method: 'POST' });
    } catch {
      // ignore error
    }
    router.push('/');
  };

  return (
    <nav className="border-b border-[#212330] bg-[#0E1017]/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center space-x-6">
          <Link href="/dashboard" className="flex items-center space-x-2 text-slate-100 font-semibold tracking-tight hover:text-indigo-400 transition-colors">
            <div className="w-6 h-6 rounded bg-indigo-600 flex items-center justify-center text-white font-mono text-xs font-bold shadow-sm shadow-indigo-500/30">
              T
            </div>
            <span className="font-mono text-sm tracking-wider uppercase text-slate-200">Trao Prep</span>
          </Link>

          <div className="hidden sm:flex items-center space-x-1">
            <Link
              href="/dashboard"
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                pathname === '/dashboard'
                  ? 'bg-[#1C1E2A] text-slate-100 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#161722]'
              }`}
            >
              Dashboard
            </Link>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center space-x-3">
          <Link
            href="/kits/new"
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-all shadow-sm shadow-indigo-600/20 active:scale-[0.98]"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Kit</span>
          </Link>

          {userEmail && (
            <div className="flex items-center space-x-3 pl-2 border-l border-[#212330]">
              <span className="text-xs text-slate-400 hidden md:inline truncate max-w-[140px]">
                {userEmail}
              </span>
              <button
                onClick={handleLogout}
                title="Log Out"
                className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-[#1C1E2A] rounded-md transition-colors"
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
