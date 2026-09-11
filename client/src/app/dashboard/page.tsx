'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fetchApi } from '@/lib/api';
import { Navbar } from '@/components/Navbar';
import { Plus, Briefcase, Calendar, ExternalLink, Trash2, Clock, Building2 } from 'lucide-react';

interface KitSummary {
  _id: string;
  source: {
    company: string;
    company_url: string;
    role: string;
  };
  role: {
    title: string;
    seniority: string;
  };
  schedule: {
    days_available: number;
  };
  updatedAt: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [kits, setKits] = useState<KitSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchApi<{ user: { id: string; email: string } }>('/auth/me')
      .then((res) => {
        setUserEmail(res.user.email);
        return fetchApi<{ kits: KitSummary[] }>('/kits');
      })
      .then((res) => {
        setKits(res.kits);
        setLoading(false);
      })
      .catch((err) => {
        if (err.status === 401) {
          router.replace('/');
        } else {
          setError(err.message || 'Failed to load kits');
          setLoading(false);
        }
      });
  }, [router]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this prep kit?')) return;

    try {
      await fetchApi(`/kits/${id}`, { method: 'DELETE' });
      setKits(kits.filter(k => k._id !== id));
    } catch (err: any) {
      alert(err.message || 'Failed to delete kit');
    }
  };

  const formatRelativeTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const diffMs = Date.now() - date.getTime();
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      if (diffHours < 1) return 'Just now';
      if (diffHours < 24) return `${diffHours}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays}d ago`;
    } catch {
      return 'Recently';
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#090A0F]">
      <Navbar userEmail={userEmail} />

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-8 border-b border-[#212330] gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Your Interview Kits</h1>
            <p className="text-xs text-slate-400 mt-1">
              Select a kit to continue practicing, review requirements, or adjust your study schedule.
            </p>
          </div>
          <Link
            href="/kits/new"
            className="inline-flex items-center space-x-2 px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 active:scale-[0.98] transition-all self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>New Kit</span>
          </Link>
        </div>

        {/* Content */}
        {loading ? (
          <div className="py-24 text-center">
            <div className="inline-block animate-spin w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full mb-3" />
            <p className="text-xs text-slate-400">Loading your interview kits...</p>
          </div>
        ) : error ? (
          <div className="my-8 p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400">
            {error}
          </div>
        ) : kits.length === 0 ? (
          <div className="py-20 text-center border border-dashed border-[#262838] rounded-xl my-8 p-8 bg-[#0E1017]">
            <div className="w-12 h-12 rounded-full bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mx-auto mb-4">
              <Briefcase className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-slate-200">No interview kits yet</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              Paste a job description and company URL to generate your first structured interview preparation kit.
            </p>
            <Link
              href="/kits/new"
              className="inline-flex items-center space-x-1.5 mt-5 px-3.5 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create First Kit</span>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mt-8">
            {kits.map((kit) => {
              const roleTitle = kit.role?.title || kit.source?.role || 'Role Specification';
              const company = kit.source?.company || 'Company';
              const days = kit.schedule?.days_available || 5;

              return (
                <Link
                  key={kit._id}
                  href={`/kits/${kit._id}`}
                  className="group relative bg-[#10121B] hover:bg-[#131622] border border-[#212330] hover:border-indigo-500/50 rounded-xl p-5 transition-all shadow-sm flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-[#1C1E2B] text-slate-300 border border-[#27293A]">
                        {kit.role?.seniority || 'Mid-Level'}
                      </span>
                      <button
                        onClick={(e) => handleDelete(kit._id, e)}
                        title="Delete Kit"
                        className="text-slate-500 hover:text-red-400 p-1 rounded hover:bg-[#1C1E2B] transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <h3 className="text-base font-semibold text-slate-100 group-hover:text-indigo-300 transition-colors mt-3 line-clamp-1">
                      {roleTitle}
                    </h3>

                    <div className="flex items-center space-x-1.5 text-xs text-slate-400 mt-1">
                      <Building2 className="w-3.5 h-3.5 text-slate-500" />
                      <span className="line-clamp-1">{company}</span>
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-[#1D1F2D] flex items-center justify-between text-xs text-slate-500">
                    <div className="flex items-center space-x-1.5 text-indigo-400">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{days} Day Plan</span>
                    </div>
                    <div className="flex items-center space-x-1 text-slate-500">
                      <Clock className="w-3 h-3" />
                      <span>{formatRelativeTime(kit.updatedAt)}</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
