'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Navbar } from '@/components/Navbar';
import { fetchApi } from '@/lib/api';
import {
  ArrowLeft,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  FileText,
  Globe,
  Calendar,
  Upload,
} from 'lucide-react';

interface StageState {
  stage: string;
  label: string;
  status: 'pending' | 'running' | 'completed' | 'warning' | 'failed';
  message?: string;
}

const INITIAL_STAGES: StageState[] = [
  { stage: 'extracting_jd', label: 'Extracting role requirements', status: 'pending' },
  { stage: 'crawling_company', label: 'Researching company website', status: 'pending' },
  { stage: 'researching_interview', label: 'Finding hiring process information', status: 'pending' },
  { stage: 'generating_brief', label: 'Synthesizing verified company brief', status: 'pending' },
  { stage: 'generating_questions', label: 'Generating categorized questions', status: 'pending' },
  { stage: 'checking_coverage', label: 'Checking requirement coverage', status: 'pending' },
  { stage: 'closing_coverage_gaps', label: 'Closing coverage gaps (Pass 2)', status: 'pending' },
  { stage: 'generating_flashcards', label: 'Generating revision flashcards', status: 'pending' },
  { stage: 'creating_schedule', label: 'Allocating study schedule', status: 'pending' },
  { stage: 'validating_kit', label: 'Validating final kit structure', status: 'pending' },
];

export default function NewKitPage() {
  const router = useRouter();
  const [jd, setJd] = useState('');
  const [companyUrl, setCompanyUrl] = useState('');
  const [days, setDays] = useState(5);
  const [isGenerating, setIsGenerating] = useState(false);
  const [stages, setStages] = useState<StageState[]>(INITIAL_STAGES);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [batchFileNote, setBatchFileNote] = useState<string | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const first = parsed[0];
          if (first.jd) setJd(first.jd);
          if (first.company_url) setCompanyUrl(first.company_url);
          if (first.days) setDays(first.days);
          setBatchFileNote(`Loaded first of ${parsed.length} role(s) from "${file.name}".`);
        } else if (parsed.jd) {
          setJd(parsed.jd);
          if (parsed.company_url) setCompanyUrl(parsed.company_url);
          if (parsed.days) setDays(parsed.days);
          setBatchFileNote(`Loaded role from "${file.name}".`);
        }
      } catch {
        alert('Invalid JSON file. Expected { jd, company_url, days } or an array of cases.');
      }
    };
    reader.readAsText(file);
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jd.trim()) {
      alert('Please provide a job description.');
      return;
    }

    setIsGenerating(true);
    setGeneralError(null);
    setStages(INITIAL_STAGES.map(s => ({ ...s, status: 'pending' })));

    try {
      const response = await fetch('http://localhost:5000/api/kits/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        credentials: 'include',
        body: JSON.stringify({
          jd,
          company_url: companyUrl,
          days: Number(days),
        }),
      });

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      if (!response.body) {
        throw new Error('ReadableStream not supported in response');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.replace(/^data:\s*/, '');
            try {
              const event = JSON.parse(dataStr);

              // Update stage state
              setStages(prev =>
                prev.map(s => {
                  if (s.stage === event.stage) {
                    return {
                      ...s,
                      status: event.status,
                      message: event.message,
                    };
                  }
                  return s;
                })
              );

              // Check if completed
              if (event.stage === 'completed' && event.data?.kitId) {
                setTimeout(() => {
                  router.push(`/kits/${event.data.kitId}`);
                }, 1000);
              }
            } catch {
              // json parse ignore
            }
          }
        }
      }
    } catch (err: any) {
      console.error('Generation error:', err);
      setGeneralError(err.message || 'Failed to generate kit');
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#090A0F]">
      <Navbar />

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {/* Back Link */}
        <Link
          href="/dashboard"
          className="inline-flex items-center space-x-2 text-xs text-slate-400 hover:text-slate-200 transition-colors mb-6"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Dashboard</span>
        </Link>

        {isGenerating ? (
          /* Page 4: Real-time Generation Progress Screen */
          <div className="max-w-2xl mx-auto bg-[#10121B] border border-[#212330] rounded-xl p-8 shadow-2xl">
            <div className="flex items-center justify-between pb-6 border-b border-[#1F2130]">
              <div>
                <h2 className="text-xl font-bold text-white tracking-tight">Generating Interview Kit</h2>
                <p className="text-xs text-slate-400 mt-1">
                  Executing deliberate 10-stage research and generation pipeline.
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-500"></span>
                </span>
                <span className="text-xs font-mono text-indigo-400">Processing</span>
              </div>
            </div>

            {/* Stages Stepper */}
            <div className="divide-y divide-[#1B1D2B] my-6">
              {stages.map((st) => (
                <div key={st.stage} className="py-3.5 flex items-start space-x-3.5">
                  <div className="mt-0.5">
                    {st.status === 'completed' && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    )}
                    {st.status === 'running' && (
                      <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
                    )}
                    {st.status === 'warning' && (
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                    )}
                    {st.status === 'failed' && (
                      <AlertTriangle className="w-4 h-4 text-red-400" />
                    )}
                    {st.status === 'pending' && (
                      <div className="w-4 h-4 rounded-full border border-slate-700 bg-slate-900" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p
                        className={`text-xs font-medium ${
                          st.status === 'completed'
                            ? 'text-slate-200'
                            : st.status === 'running'
                            ? 'text-indigo-300 font-semibold'
                            : st.status === 'warning'
                            ? 'text-amber-300'
                            : 'text-slate-500'
                        }`}
                      >
                        {st.label}
                      </p>
                      <span className="text-[10px] font-mono text-slate-500 uppercase">
                        {st.status}
                      </span>
                    </div>
                    {st.message && (
                      <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                        {st.message}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <p className="text-[11px] text-slate-500 text-center pt-2 border-t border-[#1F2130]">
              This usually completes within 30 to 60 seconds depending on site structure.
            </p>
          </div>
        ) : (
          /* Page 3: Two-column Input Form */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Column: Input Form */}
            <div className="lg:col-span-8 bg-[#10121B] border border-[#212330] rounded-xl p-6 sm:p-8 shadow-sm">
              <div className="pb-6 border-b border-[#1F2130]">
                <h1 className="text-xl font-bold text-white tracking-tight">Create Interview Kit</h1>
                <p className="text-xs text-slate-400 mt-1">
                  Paste the role description and company site. The pipeline will discover hiring process details and generate your study plan.
                </p>
              </div>

              {generalError && (
                <div className="my-5 p-3 rounded-md bg-red-500/10 border border-red-500/30 text-xs text-red-400">
                  {generalError}
                </div>
              )}

              <form onSubmit={handleGenerate} className="space-y-6 mt-6">
                {/* Job Description Textarea */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-slate-200 flex items-center space-x-1.5">
                      <FileText className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Job Description</span>
                    </label>
                    <span className="text-[11px] text-slate-500">
                      {jd.length} characters
                    </span>
                  </div>
                  <textarea
                    rows={8}
                    required
                    value={jd}
                    onChange={(e) => setJd(e.target.value)}
                    placeholder="Paste the complete job description text here (responsibilities, required skills, preferred qualifications)..."
                    className="w-full bg-[#0A0B10] border border-[#262838] focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-md p-3.5 text-xs sm:text-sm text-slate-100 placeholder:text-slate-600 outline-none transition-colors resize-y leading-relaxed font-mono"
                  />
                </div>

                {/* Company Website & Days Inputs */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-200 flex items-center space-x-1.5 mb-2">
                      <Globe className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Company Website URL</span>
                    </label>
                    <input
                      type="text"
                      value={companyUrl}
                      onChange={(e) => setCompanyUrl(e.target.value)}
                      placeholder="https://company.com"
                      className="w-full bg-[#0A0B10] border border-[#262838] focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-md py-2 px-3 text-xs sm:text-sm text-slate-100 placeholder:text-slate-600 outline-none transition-colors"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">
                      Crawler will rank internal hiring and career links automatically.
                    </p>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-200 flex items-center space-x-1.5 mb-2">
                      <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Days Until Interview</span>
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      required
                      value={days}
                      onChange={(e) => setDays(parseInt(e.target.value, 10) || 5)}
                      className="w-full bg-[#0A0B10] border border-[#262838] focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-md py-2 px-3 text-xs sm:text-sm text-slate-100 outline-none transition-colors"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">
                      Arithmetic allocates harder topics earlier across exactly this many days.
                    </p>
                  </div>
                </div>

                {/* Multi-role upload support */}
                <div className="pt-2">
                  <label className="inline-flex items-center space-x-2 text-xs text-slate-400 hover:text-slate-200 cursor-pointer border border-[#262838] hover:border-slate-600 rounded-md px-3 py-1.5 transition-colors">
                    <Upload className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Upload Case File (.json)</span>
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                  {batchFileNote && (
                    <span className="text-[11px] text-emerald-400 ml-3">
                      ✓ {batchFileNote}
                    </span>
                  )}
                </div>

                <div className="pt-4 border-t border-[#1F2130] flex items-center justify-end">
                  <button
                    type="submit"
                    className="flex items-center space-x-2 py-2.5 px-6 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-xs sm:text-sm font-semibold transition-all shadow-md shadow-indigo-600/20 active:scale-[0.98]"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Generate Interview Kit →</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Right Column: Helpful Information */}
            <div className="lg:col-span-4 bg-[#10121B] border border-[#212330] rounded-xl p-6 shadow-sm space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-slate-200">How This Works</h3>
                <p className="text-xs text-slate-400 mt-1">
                  A deliberate multi-step pipeline built to prevent hallucinations and guarantee coverage.
                </p>
              </div>

              <div className="space-y-4 text-xs">
                <div className="flex items-start space-x-3">
                  <span className="font-mono text-indigo-400 font-bold">01</span>
                  <div>
                    <h4 className="font-medium text-slate-200">Role Extraction</h4>
                    <p className="text-slate-400 mt-0.5">
                      Extracts structured must-have and nice-to-have requirements with stable sequential IDs.
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <span className="font-mono text-indigo-400 font-bold">02</span>
                  <div>
                    <h4 className="font-medium text-slate-200">Site Crawling & Research</h4>
                    <p className="text-slate-400 mt-0.5">
                      Ranks discovered internal links (careers, handbook, blog) and searches public interview discussions.
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <span className="font-mono text-indigo-400 font-bold">03</span>
                  <div>
                    <h4 className="font-medium text-slate-200">Two-Pass Coverage Check</h4>
                    <p className="text-slate-400 mt-0.5">
                      Application code compares question requirement IDs against must-haves, triggering targeted Pass 2 generation for any gaps.
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <span className="font-mono text-indigo-400 font-bold">04</span>
                  <div>
                    <h4 className="font-medium text-slate-200">Arithmetic Day Planner</h4>
                    <p className="text-slate-400 mt-0.5">
                      Distributes all material across exactly the requested days, scheduling higher-difficulty topics earlier.
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-3.5 rounded-lg bg-[#0C0E15] border border-[#1E202E] text-[11px] text-slate-400">
                <p className="font-medium text-slate-300 mb-1">💡 Preservation Guarantee</p>
                Once generated, you can edit, pin, or reorder any section. Regenerating a category will strictly preserve your custom and edited questions.
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
