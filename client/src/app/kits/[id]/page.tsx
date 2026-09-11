'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Navbar } from '@/components/Navbar';
import { fetchApi } from '@/lib/api';
import {
  InternalKit,
  InternalQuestion,
  InternalFlashcard,
  QuestionCategory,
  Requirement,
} from '@trao/shared';
import {
  ArrowLeft,
  Download,
  Trash2,
  RefreshCw,
  Pin,
  Edit2,
  Check,
  X,
  Plus,
  ChevronUp,
  ChevronDown,
  Building2,
  Award,
  Layers,
  HelpCircle,
  Clock,
  Sparkles,
  AlertTriangle,
  RotateCcw,
  CheckCircle,
} from 'lucide-react';

type TabType = 'brief' | 'role' | 'questions' | 'flashcards' | 'schedule' | 'readiness';

export default function KitWorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const kitId = params.id as string;

  const [kit, setKit] = useState<InternalKit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('brief');

  // Question category filter
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Editing state for questions
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [editPrompt, setEditPrompt] = useState('');
  const [editOutline, setEditOutline] = useState('');

  // Editing state for brief
  const [isEditingBrief, setIsEditingBrief] = useState(false);
  const [briefSummary, setBriefSummary] = useState('');
  const [briefWhatTheyDo, setBriefWhatTheyDo] = useState('');

  // Regeneration confirmation modal state
  const [regenerationTarget, setRegenerationTarget] = useState<QuestionCategory | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);

  // New question form state
  const [showAddQuestion, setShowAddQuestion] = useState(false);
  const [newQPrompt, setNewQPrompt] = useState('');
  const [newQOutline, setNewQOutline] = useState('');
  const [newQCat, setNewQCat] = useState<QuestionCategory>('technical');
  const [newQDiff, setNewQDiff] = useState<1 | 2 | 3>(2);
  const [newQReqIds, setNewQReqIds] = useState<string[]>([]);

  // Flashcards practice state
  const [practiceIndex, setPracticeIndex] = useState(0);
  const [isAnswerRevealed, setIsAnswerRevealed] = useState(false);
  const [showAddCard, setShowAddCard] = useState(false);
  const [newFront, setNewFront] = useState('');
  const [newBack, setNewBack] = useState('');

  // Fetch Kit
  useEffect(() => {
    fetchApi<{ kit: InternalKit }>(`/kits/${kitId}`)
      .then((res) => {
        setKit(res.kit);
        setBriefSummary(res.kit.company_brief.summary);
        setBriefWhatTheyDo(res.kit.company_brief.what_they_do);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load prep kit');
        setLoading(false);
      });
  }, [kitId]);

  // Sync brief edit values when kit loads
  useEffect(() => {
    if (kit?.company_brief) {
      setBriefSummary(kit.company_brief.summary);
      setBriefWhatTheyDo(kit.company_brief.what_they_do);
    }
  }, [kit?.company_brief]);

  // Keyboard navigation for Flashcards Practice Mode
  useEffect(() => {
    if (activeTab !== 'flashcards' || !kit?.flashcards.length) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.code === 'Space') {
        e.preventDefault();
        setIsAnswerRevealed(prev => !prev);
      } else if (e.key === '1') {
        handleScoreCard(1);
      } else if (e.key === '2') {
        handleScoreCard(2);
      } else if (e.key === '3') {
        handleScoreCard(3);
      } else if (e.key === 'ArrowRight') {
        nextCard();
      } else if (e.key === 'ArrowLeft') {
        prevCard();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, kit?.flashcards, practiceIndex, isAnswerRevealed]);

  // Delete Kit
  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this kit?')) return;
    try {
      await fetchApi(`/kits/${kitId}`, { method: 'DELETE' });
      router.push('/dashboard');
    } catch (err: any) {
      alert(err.message || 'Failed to delete kit');
    }
  };

  // Export strict Appendix A JSON
  const handleExport = () => {
    if (!kit) return;
    const appendixAData = {
      role: {
        title: kit.role.title,
        seniority: kit.role.seniority,
        responsibilities: kit.role.responsibilities,
        requirements: kit.role.requirements.map(r => ({
          id: r.id,
          text: r.text,
          priority: r.priority,
          kind: r.kind,
        })),
      },
      company_brief: {
        summary: kit.company_brief.summary,
        what_they_do: kit.company_brief.what_they_do,
      },
      questions: kit.questions.map(q => ({
        id: q.id,
        requirement_ids: q.requirement_ids,
        category: q.category,
        prompt: q.prompt,
        answer_outline: q.answer_outline,
        difficulty: q.difficulty,
      })),
      flashcards: kit.flashcards.map(f => ({
        id: f.id,
        requirement_ids: f.requirement_ids,
        front: f.front,
        back: f.back,
      })),
      schedule: {
        days_available: kit.schedule.days_available,
        days: kit.schedule.days.map(d => ({
          day: d.day,
          focus: d.focus,
          question_ids: d.question_ids,
          minutes: d.minutes,
        })),
      },
      coverage: {
        uncovered_requirement_ids: kit.coverage.uncovered_requirement_ids,
        passes: kit.coverage.passes,
      },
    };

    const blob = new Blob([JSON.stringify(appendixAData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `interview-kit-${kit.source.company.toLowerCase().replace(/[^a-z0-9]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Save edited company brief
  const handleSaveBrief = async () => {
    if (!kit) return;
    try {
      const res = await fetchApi<{ kit: InternalKit }>(`/kits/${kitId}`, {
        method: 'PUT',
        body: JSON.stringify({
          company_brief: {
            summary: briefSummary,
            what_they_do: briefWhatTheyDo,
          },
        }),
      });
      setKit(res.kit);
      setIsEditingBrief(false);
    } catch (err: any) {
      alert(err.message || 'Failed to save company brief');
    }
  };

  // Regenerate Company Brief
  const handleRegenerateBrief = async () => {
    if (!kit) return;
    try {
      const res = await fetchApi<{ kit: InternalKit }>(`/kits/${kitId}/regenerate-brief`, {
        method: 'POST',
      });
      setKit(res.kit);
      setBriefSummary(res.kit.company_brief.summary);
      setBriefWhatTheyDo(res.kit.company_brief.what_they_do);
      alert('Company brief regenerated successfully!');
    } catch (err: any) {
      alert(err.message || 'Failed to regenerate brief');
    }
  };

  // Toggle Pin Question
  const handleTogglePin = async (qId: string) => {
    if (!kit) return;
    const updated = kit.questions.map(q =>
      q.id === qId ? { ...q, is_pinned: !q.is_pinned } : q
    );

    try {
      const res = await fetchApi<{ kit: InternalKit }>(`/kits/${kitId}`, {
        method: 'PUT',
        body: JSON.stringify({ questions: updated }),
      });
      setKit(res.kit);
    } catch (err: any) {
      alert(err.message || 'Failed to update question');
    }
  };

  // Edit Question
  const startEditQuestion = (q: InternalQuestion) => {
    setEditingQuestionId(q.id);
    setEditPrompt(q.prompt);
    setEditOutline(q.answer_outline);
  };

  const saveQuestionEdit = async (qId: string) => {
    if (!kit) return;
    const updated = kit.questions.map(q =>
      q.id === qId
        ? {
            ...q,
            prompt: editPrompt,
            answer_outline: editOutline,
            is_edited: true,
          }
        : q
    );

    try {
      const res = await fetchApi<{ kit: InternalKit }>(`/kits/${kitId}`, {
        method: 'PUT',
        body: JSON.stringify({ questions: updated }),
      });
      setKit(res.kit);
      setEditingQuestionId(null);
    } catch (err: any) {
      alert(err.message || 'Failed to save question edit');
    }
  };

  // Change Question Category
  const handleChangeCategory = async (qId: string, newCat: QuestionCategory) => {
    if (!kit) return;
    const updated = kit.questions.map(q =>
      q.id === qId ? { ...q, category: newCat, is_edited: true } : q
    );

    try {
      const res = await fetchApi<{ kit: InternalKit }>(`/kits/${kitId}`, {
        method: 'PUT',
        body: JSON.stringify({ questions: updated }),
      });
      setKit(res.kit);
    } catch (err: any) {
      alert(err.message || 'Failed to move category');
    }
  };

  // Delete Question
  const handleDeleteQuestion = async (qId: string) => {
    if (!kit) return;
    if (!confirm('Delete this question from your kit?')) return;
    const updated = kit.questions.filter(q => q.id !== qId);

    try {
      const res = await fetchApi<{ kit: InternalKit }>(`/kits/${kitId}`, {
        method: 'PUT',
        body: JSON.stringify({ questions: updated }),
      });
      setKit(res.kit);
    } catch (err: any) {
      alert(err.message || 'Failed to delete question');
    }
  };

  // Reorder Question Up / Down
  const handleMoveQuestion = async (index: number, direction: 'up' | 'down') => {
    if (!kit) return;
    const newIdx = direction === 'up' ? index - 1 : index + 1;
    if (newIdx < 0 || newIdx >= kit.questions.length) return;

    const list = [...kit.questions];
    const [moved] = list.splice(index, 1);
    list.splice(newIdx, 0, moved);

    try {
      const res = await fetchApi<{ kit: InternalKit }>(`/kits/${kitId}`, {
        method: 'PUT',
        body: JSON.stringify({ questions: list }),
      });
      setKit(res.kit);
    } catch (err: any) {
      alert(err.message || 'Failed to reorder');
    }
  };

  // Add Custom Question
  const handleAddQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kit || !newQPrompt.trim()) return;

    const nextIdNum = kit.questions.reduce((max, q) => {
      const match = q.id.match(/^q(\d+)$/);
      return match ? Math.max(max, parseInt(match[1], 10)) : max;
    }, 0) + 1;

    const newQ: InternalQuestion = {
      id: `q${nextIdNum}`,
      requirement_ids: newQReqIds.length > 0 ? newQReqIds : (kit.role.requirements[0] ? [kit.role.requirements[0].id] : []),
      category: newQCat,
      prompt: newQPrompt,
      answer_outline: newQOutline || 'Custom outline created by user.',
      difficulty: newQDiff,
      origin: 'user_added',
      is_edited: false,
      is_pinned: false,
    };

    try {
      const res = await fetchApi<{ kit: InternalKit }>(`/kits/${kitId}`, {
        method: 'PUT',
        body: JSON.stringify({ questions: [...kit.questions, newQ] }),
      });
      setKit(res.kit);
      setShowAddQuestion(false);
      setNewQPrompt('');
      setNewQOutline('');
      setNewQReqIds([]);
    } catch (err: any) {
      alert(err.message || 'Failed to add question');
    }
  };

  // Category Regeneration with Edit Preservation
  const confirmRegenerateCategory = async () => {
    if (!regenerationTarget || !kit) return;
    setIsRegenerating(true);

    try {
      const res = await fetchApi<{ kit: InternalKit; preservedCount: number; newCount: number }>(
        `/kits/${kitId}/regenerate-category`,
        {
          method: 'POST',
          body: JSON.stringify({ category: regenerationTarget }),
        }
      );
      setKit(res.kit);
      setRegenerationTarget(null);
      alert(`Regenerated ${regenerationTarget} questions! Preserved ${res.preservedCount} edited/pinned question(s), added ${res.newCount} fresh.`);
    } catch (err: any) {
      alert(err.message || 'Failed to regenerate category');
    } finally {
      setIsRegenerating(false);
    }
  };

  // Practice Mode scoring
  const handleScoreCard = async (score: 1 | 2 | 3) => {
    if (!kit || !kit.flashcards[practiceIndex]) return;
    const card = kit.flashcards[practiceIndex];

    try {
      await fetchApi(`/kits/${kitId}/practice`, {
        method: 'POST',
        body: JSON.stringify({
          flashcard_id: card.id,
          confidence: score,
        }),
      });

      // Update local card score
      setKit(prev => {
        if (!prev) return prev;
        const updated = prev.flashcards.map(f =>
          f.id === card.id ? { ...f, confidence: score, practice_count: (f.practice_count || 0) + 1 } : f
        );
        return { ...prev, flashcards: updated };
      });

      nextCard();
    } catch (err: any) {
      console.error('Failed to score card:', err);
    }
  };

  const nextCard = () => {
    if (!kit) return;
    setIsAnswerRevealed(false);
    setPracticeIndex(prev => (prev + 1) % kit.flashcards.length);
  };

  const prevCard = () => {
    if (!kit) return;
    setIsAnswerRevealed(false);
    setPracticeIndex(prev => (prev - 1 + kit.flashcards.length) % kit.flashcards.length);
  };

  // Prioritize low-confidence cards for next session
  const handleSortWeakFirst = () => {
    if (!kit) return;
    const sorted = [...kit.flashcards].sort((a, b) => {
      const confA = a.confidence ?? 0;
      const confB = b.confidence ?? 0;
      return confA - confB; // lowest confidence first
    });
    setKit({ ...kit, flashcards: sorted });
    setPracticeIndex(0);
    setIsAnswerRevealed(false);
  };

  // Add Custom Flashcard
  const handleAddFlashcard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kit || !newFront.trim() || !newBack.trim()) return;

    const nextIdNum = kit.flashcards.reduce((max, f) => {
      const match = f.id.match(/^f(\d+)$/);
      return match ? Math.max(max, parseInt(match[1], 10)) : max;
    }, 0) + 1;

    const newCard: InternalFlashcard = {
      id: `f${nextIdNum}`,
      front: newFront,
      back: newBack,
      requirement_ids: kit.role.requirements[0] ? [kit.role.requirements[0].id] : [],
      origin: 'user_added',
      is_edited: false,
      is_pinned: false,
      confidence: undefined,
      practice_count: 0,
    };

    try {
      const res = await fetchApi<{ kit: InternalKit }>(`/kits/${kitId}`, {
        method: 'PUT',
        body: JSON.stringify({ flashcards: [...kit.flashcards, newCard] }),
      });
      setKit(res.kit);
      setShowAddCard(false);
      setNewFront('');
      setNewBack('');
    } catch (err: any) {
      alert(err.message || 'Failed to add card');
    }
  };

  // Toggle Schedule Day Completion
  const handleToggleDay = async (dayNum: number) => {
    try {
      const res = await fetchApi<{ schedule_completed_days: number[] }>(
        `/kits/${kitId}/toggle-schedule-day`,
        {
          method: 'POST',
          body: JSON.stringify({ day: dayNum }),
        }
      );
      setKit(prev => (prev ? { ...prev, schedule_completed_days: res.schedule_completed_days } : prev));
    } catch (err: any) {
      console.error('Failed to toggle day:', err);
    }
  };

  // Filtered questions
  const filteredQuestions = useMemo(() => {
    if (!kit) return [];
    if (selectedCategory === 'all') return kit.questions;
    return kit.questions.filter(q => q.category === selectedCategory);
  }, [kit, selectedCategory]);

  // Creative Feature Calculations: Weak Spots & Readiness Diagnostic
  const readinessStats = useMemo(() => {
    if (!kit) return { percentage: 0, requirementReadiness: [], totalPracticed: 0, weakCount: 0 };

    const flashcards = kit.flashcards || [];
    const totalCards = flashcards.length;
    const practicedCards = flashcards.filter(f => f.confidence !== undefined);
    const weakCards = flashcards.filter(f => f.confidence === 1);
    const confidentCards = flashcards.filter(f => f.confidence === 3);

    // Calculate requirement-level readiness
    const reqMap = new Map<string, { total: number; scoreSum: number }>();
    for (const f of flashcards) {
      for (const reqId of f.requirement_ids) {
        const cur = reqMap.get(reqId) || { total: 0, scoreSum: 0 };
        cur.total += 1;
        cur.scoreSum += f.confidence || 0;
        reqMap.set(reqId, cur);
      }
    }

    const requirementReadiness = kit.role.requirements.map(req => {
      const stat = reqMap.get(req.id);
      let status: 'weak' | 'moderate' | 'ready' | 'unpracticed' = 'unpracticed';
      let scorePercent = 0;

      if (stat && stat.total > 0) {
        const avg = stat.scoreSum / stat.total;
        scorePercent = Math.round((avg / 3) * 100);
        if (avg >= 2.5) status = 'ready';
        else if (avg >= 1.5) status = 'moderate';
        else if (stat.scoreSum > 0) status = 'weak';
      }

      return {
        req,
        status,
        scorePercent,
      };
    });

    // Overall readiness score
    const overallScore = totalCards > 0
      ? Math.round(
          (practicedCards.reduce((acc, f) => acc + (f.confidence || 0), 0) / (totalCards * 3)) * 100
        )
      : 0;

    return {
      percentage: overallScore,
      requirementReadiness,
      totalPracticed: practicedCards.length,
      weakCount: weakCards.length,
      confidentCount: confidentCards.length,
    };
  }, [kit]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8F9FD] dark:bg-[#090A0F] flex items-center justify-center transition-colors duration-150">
        <div className="text-center">
          <div className="inline-block animate-spin w-8 h-8 border-2 border-violet-600 border-t-transparent rounded-full mb-3" />
          <p className="text-xs text-slate-600 dark:text-slate-400">Loading interview kit workspace...</p>
        </div>
      </div>
    );
  }

  if (error || !kit) {
    return (
      <div className="min-h-screen bg-[#F8F9FD] dark:bg-[#090A0F] flex flex-col items-center justify-center p-6 text-center transition-colors duration-150">
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-xs text-rose-700 dark:text-rose-400 max-w-md">
          {error || 'Kit not found'}
        </div>
        <Link
          href="/dashboard"
          className="mt-4 inline-flex items-center space-x-2 text-xs text-violet-600 dark:text-violet-400 hover:underline"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Return to Dashboard</span>
        </Link>
      </div>
    );
  }

  const roleTitle = kit.role?.title || kit.source?.role || 'Interview Prep Kit';
  const company = kit.source?.company || 'Company';

  return (
    <div className="min-h-screen flex flex-col bg-[#F8F9FD] dark:bg-[#090A0F] transition-colors duration-150">
      <Navbar />

      {/* Workspace Header */}
      <header className="border-b border-slate-200/90 dark:border-[#1F2130] bg-white/90 dark:bg-[#0E1017]/90 backdrop-blur-md sticky top-14 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center space-x-3">
            <Link
              href="/dashboard"
              className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-[#1C1E2B] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
              title="Back to Dashboard"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight line-clamp-1">
                  {roleTitle}
                </h1>
                <span className="text-slate-400 dark:text-slate-500 font-mono">@</span>
                <span className="text-slate-700 dark:text-slate-300 font-medium">{company}</span>
              </div>
              <div className="flex items-center space-x-2 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono bg-violet-50 dark:bg-[#1B1D2A] text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-[#27293C]">
                  {kit.role?.seniority || 'Mid-Level'}
                </span>
                <span>&middot;</span>
                <span>{kit.schedule?.days_available} Day Plan</span>
                <span>&middot;</span>
                <span>{kit.questions?.length} Questions</span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2.5">
            <button
              onClick={handleExport}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border border-slate-300 dark:border-[#262838] bg-white dark:bg-[#12141F] hover:bg-slate-50 dark:hover:bg-[#1C1E2B] text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white text-xs font-medium transition-colors shadow-sm"
              title="Download strict Appendix A JSON"
            >
              <Download className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
              <span>Export JSON</span>
            </button>
            <button
              onClick={handleDelete}
              className="p-1.5 rounded-xl border border-slate-300 dark:border-[#262838] hover:border-rose-300 dark:hover:border-rose-500/50 hover:bg-rose-50 dark:hover:bg-rose-500/10 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
              title="Delete Kit"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex space-x-1 overflow-x-auto border-t border-slate-200/70 dark:border-[#1B1D2A] pt-1">
          {[
            { id: 'brief', label: 'Company Brief', icon: Building2 },
            { id: 'role', label: 'Role Breakdown', icon: Layers },
            { id: 'questions', label: `Questions (${kit.questions.length})`, icon: HelpCircle },
            { id: 'flashcards', label: `Flashcards (${kit.flashcards.length})`, icon: RotateCcw },
            { id: 'schedule', label: `Schedule (${kit.schedule.days_available}d)`, icon: Clock },
            { id: 'readiness', label: `Readiness (${readinessStats.percentage}%)`, icon: Award, highlight: true },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`flex items-center space-x-2 px-3.5 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? 'border-violet-600 text-violet-600 dark:border-violet-400 dark:text-white font-semibold'
                    : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-700'
                } ${tab.highlight && !isActive ? 'text-violet-600 dark:text-violet-400' : ''}`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-violet-600 dark:text-violet-400' : ''}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </header>

      {/* Main Workspace Body */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {/* TAB 1: COMPANY BRIEF */}
        {activeTab === 'brief' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200/90 dark:border-[#212330]">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">Company Brief</h2>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  Verified overview generated from crawled site pages and public hiring discussions.
                </p>
              </div>
              <div className="flex items-center space-x-2">
                {isEditingBrief ? (
                  <>
                    <button
                      onClick={handleSaveBrief}
                      className="btn-gradient flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold shadow-sm text-white"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Save Changes</span>
                    </button>
                    <button
                      onClick={() => setIsEditingBrief(false)}
                      className="px-3 py-1.5 border border-slate-300 dark:border-[#262838] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 rounded-xl text-xs font-medium"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setIsEditingBrief(true)}
                      className="flex items-center space-x-1.5 px-3 py-1.5 border border-slate-300 dark:border-[#262838] bg-white dark:bg-[#12141F] hover:bg-slate-50 dark:hover:bg-[#1C1E2B] text-slate-700 dark:text-slate-300 rounded-xl text-xs font-medium transition-colors"
                    >
                      <Edit2 className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                      <span>Edit Brief</span>
                    </button>
                    <button
                      onClick={handleRegenerateBrief}
                      className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-50 dark:bg-[#171926] hover:bg-slate-100 dark:hover:bg-[#1E2133] border border-slate-300 dark:border-[#262838] text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded-xl text-xs font-medium transition-colors"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                      <span>Regenerate Brief</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-8 space-y-6">
                {/* What they do */}
                <div className="bg-white dark:bg-[#10121B] border border-slate-200/90 dark:border-[#212330] rounded-2xl p-6 shadow-sm">
                  <h3 className="text-xs font-mono uppercase tracking-wider text-violet-600 dark:text-violet-400 font-semibold mb-2">
                    What They Do
                  </h3>
                  {isEditingBrief ? (
                    <textarea
                      rows={3}
                      value={briefWhatTheyDo}
                      onChange={(e) => setBriefWhatTheyDo(e.target.value)}
                      className="w-full bg-slate-50/50 dark:bg-[#0A0B10] border border-slate-300 dark:border-[#262838] rounded-xl p-3 text-xs sm:text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
                    />
                  ) : (
                    <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                      {kit.company_brief.what_they_do || 'Company overview not available.'}
                    </p>
                  )}
                </div>

                {/* Company Summary */}
                <div className="bg-white dark:bg-[#10121B] border border-slate-200/90 dark:border-[#212330] rounded-2xl p-6 shadow-sm">
                  <h3 className="text-xs font-mono uppercase tracking-wider text-violet-600 dark:text-violet-400 font-semibold mb-2">
                    Company Summary &amp; Interview Relevance
                  </h3>
                  {isEditingBrief ? (
                    <textarea
                      rows={4}
                      value={briefSummary}
                      onChange={(e) => setBriefSummary(e.target.value)}
                      className="w-full bg-slate-50/50 dark:bg-[#0A0B10] border border-slate-300 dark:border-[#262838] rounded-xl p-3 text-xs sm:text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
                    />
                  ) : (
                    <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                      {kit.company_brief.summary || 'Summary not available.'}
                    </p>
                  )}
                </div>
              </div>

              {/* Research Sources Sidebar */}
              <div className="lg:col-span-4 bg-white dark:bg-[#10121B] border border-slate-200/90 dark:border-[#212330] rounded-2xl p-6 shadow-sm">
                <h3 className="text-xs font-mono uppercase tracking-wider text-slate-800 dark:text-slate-300 font-semibold mb-3">
                  Research Sources
                </h3>
                <div className="space-y-2.5">
                  {kit.source.pages_used && kit.source.pages_used.length > 0 ? (
                    kit.source.pages_used.map((url, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#0C0E15] border border-slate-200 dark:border-[#1E202E] text-xs flex items-center justify-between"
                      >
                        <span className="text-slate-700 dark:text-slate-300 font-mono text-[11px] truncate max-w-[200px]" title={url}>
                          {url}
                        </span>
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">✓ Crawled</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-500 italic">No external pages crawled.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: ROLE BREAKDOWN */}
        {activeTab === 'role' && (
          <div className="space-y-6">
            <div className="pb-4 border-b border-slate-200/90 dark:border-[#212330]">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">Role Breakdown &amp; Requirements</h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Structured requirements extracted from the job description with stable IDs and priorities.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Responsibilities */}
              <div className="lg:col-span-5 bg-white dark:bg-[#10121B] border border-slate-200/90 dark:border-[#212330] rounded-2xl p-6 shadow-sm">
                <h3 className="text-xs font-mono uppercase tracking-wider text-violet-600 dark:text-violet-400 font-semibold mb-3">
                  Key Responsibilities
                </h3>
                <ul className="space-y-2.5">
                  {kit.role.responsibilities && kit.role.responsibilities.length > 0 ? (
                    kit.role.responsibilities.map((resp, idx) => (
                      <li key={idx} className="flex items-start space-x-2 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                        <span className="text-violet-600 dark:text-violet-400 mt-1 font-bold">&bull;</span>
                        <span>{resp}</span>
                      </li>
                    ))
                  ) : (
                    <li className="text-xs text-slate-500 italic">No explicit responsibilities parsed.</li>
                  )}
                </ul>
              </div>

              {/* Requirements List */}
              <div className="lg:col-span-7 space-y-3">
                <h3 className="text-xs font-mono uppercase tracking-wider text-slate-800 dark:text-slate-300 font-semibold mb-2">
                  Extracted Requirements ({kit.role.requirements.length})
                </h3>

                <div className="space-y-2.5">
                  {kit.role.requirements.map((req) => {
                    const isMust = req.priority === 'must';
                    const isUncovered = kit.coverage.uncovered_requirement_ids.includes(req.id);

                    return (
                      <div
                        key={req.id}
                        className="bg-white dark:bg-[#10121B] border border-slate-200/90 dark:border-[#212330] rounded-2xl p-4 flex items-start justify-between gap-4 shadow-sm"
                      >
                        <div className="space-y-1.5 flex-1">
                          <div className="flex items-center space-x-2">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider ${
                                isMust
                                  ? 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/30'
                                  : 'bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/30'
                              }`}
                            >
                              {req.priority}
                            </span>
                            <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{req.id}</span>
                            <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 uppercase">
                              &middot; {req.kind}
                            </span>
                          </div>
                          <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed">{req.text}</p>
                        </div>

                        <div>
                          {isUncovered ? (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 text-[10px] font-mono dark:border-amber-500/30">
                              <AlertTriangle className="w-3 h-3" />
                              <span>Gap</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 text-[10px] font-mono dark:border-emerald-500/30">
                              <CheckCircle className="w-3 h-3" />
                              <span>Covered</span>
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: QUESTIONS BUILDER */}
        {activeTab === 'questions' && (
          <div className="space-y-6">
            {/* Action Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-200/90 dark:border-[#212330] gap-4">
              {/* Filter pills */}
              <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 sm:pb-0">
                {['all', 'technical', 'behavioural', 'system-design', 'company-fit'].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium capitalize transition-all whitespace-nowrap ${
                      selectedCategory === cat
                        ? 'btn-gradient text-white shadow-sm'
                        : 'bg-white dark:bg-[#12141E] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-slate-200/90 dark:border-[#212330]'
                    }`}
                  >
                    {cat.replace('-', ' ')}
                  </button>
                ))}
              </div>

              {/* Actions: Add Question & Regenerate */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setShowAddQuestion(!showAddQuestion)}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border border-slate-300 dark:border-[#262838] bg-white dark:bg-[#12141F] hover:bg-slate-50 dark:hover:bg-[#1C1E2B] text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white text-xs font-medium transition-colors"
                >
                  <Plus className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                  <span>Add Question</span>
                </button>

                {selectedCategory !== 'all' && (
                  <button
                    onClick={() => setRegenerationTarget(selectedCategory as QuestionCategory)}
                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-50 dark:bg-[#171926] hover:bg-slate-100 dark:hover:bg-[#1E2133] border border-slate-300 dark:border-[#262838] text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 rounded-xl text-xs font-medium transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Regenerate {selectedCategory.replace('-', ' ')}</span>
                  </button>
                )}
              </div>
            </div>

            {/* New Question Form */}
            {showAddQuestion && (
              <form onSubmit={handleAddQuestion} className="bg-white dark:bg-[#10121B] border border-violet-300 dark:border-violet-500/40 rounded-2xl p-5 shadow-lg space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-mono uppercase tracking-wider text-violet-600 dark:text-violet-400 font-semibold">
                    Add Custom Question
                  </h3>
                  <button type="button" onClick={() => setShowAddQuestion(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Question Prompt</label>
                  <textarea
                    rows={2}
                    required
                    value={newQPrompt}
                    onChange={(e) => setNewQPrompt(e.target.value)}
                    placeholder="Enter the interview question prompt..."
                    className="w-full bg-slate-50/50 dark:bg-[#0A0B10] border border-slate-300 dark:border-[#262838] rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 outline-none focus:border-violet-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Answer Outline / Notes</label>
                  <textarea
                    rows={3}
                    value={newQOutline}
                    onChange={(e) => setNewQOutline(e.target.value)}
                    placeholder="Key concepts, architecture, or STAR bullet points..."
                    className="w-full bg-slate-50/50 dark:bg-[#0A0B10] border border-slate-300 dark:border-[#262838] rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 outline-none focus:border-violet-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Category</label>
                    <select
                      value={newQCat}
                      onChange={(e) => setNewQCat(e.target.value as QuestionCategory)}
                      className="w-full bg-slate-50/50 dark:bg-[#0A0B10] border border-slate-300 dark:border-[#262838] rounded-xl p-2 text-xs text-slate-800 dark:text-slate-200 outline-none"
                    >
                      <option value="technical">Technical</option>
                      <option value="behavioural">Behavioural</option>
                      <option value="system-design">System Design</option>
                      <option value="company-fit">Company Fit</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Difficulty</label>
                    <select
                      value={newQDiff}
                      onChange={(e) => setNewQDiff(parseInt(e.target.value, 10) as 1 | 2 | 3)}
                      className="w-full bg-slate-50/50 dark:bg-[#0A0B10] border border-slate-300 dark:border-[#262838] rounded-xl p-2 text-xs text-slate-800 dark:text-slate-200 outline-none"
                    >
                      <option value={1}>1 - Foundational</option>
                      <option value={2}>2 - Applied</option>
                      <option value={3}>3 - Deep / Architectural</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Target Requirement</label>
                    <select
                      value={newQReqIds[0] || ''}
                      onChange={(e) => setNewQReqIds([e.target.value])}
                      className="w-full bg-slate-50/50 dark:bg-[#0A0B10] border border-slate-300 dark:border-[#262838] rounded-xl p-2 text-xs text-slate-800 dark:text-slate-200 outline-none"
                    >
                      {kit.role.requirements.map(r => (
                        <option key={r.id} value={r.id}>{r.id}: {r.text.slice(0, 30)}...</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex justify-end space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddQuestion(false)}
                    className="px-3 py-1.5 border border-slate-300 dark:border-[#262838] text-slate-600 dark:text-slate-400 rounded-xl text-xs font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-gradient px-4 py-1.5 rounded-xl text-xs font-semibold shadow-sm text-white"
                  >
                    Add Question
                  </button>
                </div>
              </form>
            )}

            {/* Questions List */}
            <div className="space-y-4">
              {filteredQuestions.map((q, idx) => {
                const isEditing = editingQuestionId === q.id;

                return (
                  <div
                    key={q.id}
                    className={`bg-white dark:bg-[#10121B] border rounded-2xl p-5 transition-all shadow-sm ${
                      q.is_pinned
                        ? 'border-violet-400/80 bg-violet-50/15 dark:bg-[#121422] dark:border-violet-500/50'
                        : q.is_edited
                        ? 'border-amber-300 dark:border-amber-500/30'
                        : 'border-slate-200/90 dark:border-[#212330]'
                    }`}
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#1A1C29]">
                      <div className="flex items-center space-x-2">
                        {/* Reorder arrows */}
                        <div className="flex items-center space-x-0.5 text-slate-400 dark:text-slate-500 mr-1">
                          <button
                            onClick={() => handleMoveQuestion(idx, 'up')}
                            disabled={idx === 0}
                            className="p-1 hover:text-slate-800 dark:hover:text-slate-200 disabled:opacity-30"
                            title="Move Up"
                          >
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleMoveQuestion(idx, 'down')}
                            disabled={idx === kit.questions.length - 1}
                            className="p-1 hover:text-slate-800 dark:hover:text-slate-200 disabled:opacity-30"
                            title="Move Down"
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-300">{q.id.toUpperCase()}</span>

                        {/* Category Dropdown */}
                        <select
                          value={q.category}
                          onChange={(e) => handleChangeCategory(q.id, e.target.value as QuestionCategory)}
                          className="bg-slate-50 dark:bg-[#1A1C28] text-slate-700 dark:text-slate-300 text-[11px] font-mono py-0.5 px-2 rounded-lg border border-slate-200 dark:border-[#27293C] outline-none"
                        >
                          <option value="technical">technical</option>
                          <option value="behavioural">behavioural</option>
                          <option value="system-design">system-design</option>
                          <option value="company-fit">company-fit</option>
                        </select>

                        {/* Status Badges */}
                        {q.is_pinned && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-violet-50 text-violet-700 border border-violet-200 dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/30">
                            PINNED
                          </span>
                        )}
                        {q.is_edited && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30">
                            EDITED
                          </span>
                        )}
                        {q.origin === 'user_added' && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30">
                            USER-ADDED
                          </span>
                        )}
                      </div>

                      {/* Right Action Icons */}
                      <div className="flex items-center space-x-1.5">
                        <button
                          onClick={() => handleTogglePin(q.id)}
                          className={`p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-[#1C1E2B] transition-colors ${
                            q.is_pinned ? 'text-violet-600 dark:text-violet-400' : 'text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300'
                          }`}
                          title={q.is_pinned ? 'Unpin' : 'Pin to protect from regeneration'}
                        >
                          <Pin className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => isEditing ? saveQuestionEdit(q.id) : startEditQuestion(q)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-[#1C1E2B] text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
                          title="Edit Question"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteQuestion(q.id)}
                          className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-[#1C1E2B] text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                          title="Delete Question"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="pt-3 space-y-3">
                      {isEditing ? (
                        <div className="space-y-3">
                          <div>
                            <label className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">Prompt</label>
                            <textarea
                              rows={2}
                              value={editPrompt}
                              onChange={(e) => setEditPrompt(e.target.value)}
                              className="w-full bg-slate-50/50 dark:bg-[#0A0B10] border border-slate-300 dark:border-[#262838] rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 outline-none focus:border-violet-500 mt-1"
                            />
                          </div>
                          <div>
                            <label className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">Answer Outline</label>
                            <textarea
                              rows={3}
                              value={editOutline}
                              onChange={(e) => setEditOutline(e.target.value)}
                              className="w-full bg-slate-50/50 dark:bg-[#0A0B10] border border-slate-300 dark:border-[#262838] rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 outline-none focus:border-violet-500 mt-1"
                            />
                          </div>
                          <div className="flex justify-end space-x-2">
                            <button
                              onClick={() => setEditingQuestionId(null)}
                              className="px-2.5 py-1 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => saveQuestionEdit(q.id)}
                              className="btn-gradient px-3 py-1 rounded-lg text-xs font-medium text-white shadow-sm"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <p className="text-sm text-slate-950 dark:text-slate-100 font-medium leading-relaxed">
                            {q.prompt}
                          </p>

                          {/* Answer Outline */}
                          <div className="mt-3 p-3.5 rounded-xl bg-slate-50 dark:bg-[#0A0B11] border border-slate-200/80 dark:border-[#1A1C28] text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                            <span className="text-[10px] font-mono text-violet-600 dark:text-violet-400 uppercase tracking-wider block mb-1 font-semibold">
                              Expected Answer Outline
                            </span>
                            <p className="whitespace-pre-line">{q.answer_outline}</p>
                          </div>
                        </div>
                      )}

                      {/* Footer: Tags & Difficulty */}
                      <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-1">
                        <div className="flex items-center space-x-1.5">
                          <span className="text-slate-400 dark:text-slate-500">Covers:</span>
                          {q.requirement_ids.map(rId => (
                            <span
                              key={rId}
                              className="px-1.5 py-0.5 rounded bg-violet-50 dark:bg-[#1B1D2C] text-violet-700 dark:text-slate-300 font-mono text-[10px] border border-violet-200 dark:border-[#26283C]"
                            >
                              {rId}
                            </span>
                          ))}
                        </div>

                        <div className="flex items-center space-x-1">
                          <span className="text-slate-400 dark:text-slate-500 mr-1">Difficulty:</span>
                          {[1, 2, 3].map(dot => (
                            <span
                              key={dot}
                              className={`w-2 h-2 rounded-full ${
                                dot <= q.difficulty ? 'bg-violet-600 dark:bg-violet-400' : 'bg-slate-200 dark:bg-slate-700'
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 4: FLASHCARDS PRACTICE MODE */}
        {activeTab === 'flashcards' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-200/90 dark:border-[#212330] gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">Practice Mode</h2>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  Flashcard revision with 1-3 confidence rating and low-confidence session prioritization.
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={handleSortWeakFirst}
                  className="px-3 py-1.5 border border-slate-300 dark:border-[#262838] bg-white dark:bg-[#12141F] hover:bg-slate-50 dark:hover:bg-[#1C1E2B] text-violet-600 dark:text-violet-400 rounded-xl text-xs font-medium transition-colors"
                  title="Prioritize low-confidence cards first"
                >
                  Prioritize Weak Cards
                </button>
                <button
                  onClick={() => setShowAddCard(!showAddCard)}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border border-slate-300 dark:border-[#262838] bg-white dark:bg-[#12141F] hover:bg-slate-50 dark:hover:bg-[#1C1E2B] text-slate-700 dark:text-slate-300 rounded-xl text-xs font-medium transition-colors"
                >
                  <Plus className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                  <span>Add Card</span>
                </button>
              </div>
            </div>

            {/* New Flashcard Form */}
            {showAddCard && (
              <form onSubmit={handleAddFlashcard} className="bg-white dark:bg-[#10121B] border border-violet-300 dark:border-violet-500/40 rounded-2xl p-5 shadow-lg space-y-4">
                <h3 className="text-xs font-mono uppercase tracking-wider text-violet-600 dark:text-violet-400 font-semibold">
                  Add Custom Flashcard
                </h3>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Front (Prompt)</label>
                  <input
                    type="text"
                    required
                    value={newFront}
                    onChange={(e) => setNewFront(e.target.value)}
                    placeholder="Concept or question..."
                    className="w-full bg-slate-50/50 dark:bg-[#0A0B10] border border-slate-300 dark:border-[#262838] rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Back (Explanation)</label>
                  <textarea
                    rows={3}
                    required
                    value={newBack}
                    onChange={(e) => setNewBack(e.target.value)}
                    placeholder="Concise explanation and practical application..."
                    className="w-full bg-slate-50/50 dark:bg-[#0A0B10] border border-slate-300 dark:border-[#262838] rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 outline-none"
                  />
                </div>
                <div className="flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setShowAddCard(false)}
                    className="px-3 py-1.5 border border-slate-300 dark:border-[#262838] text-slate-600 dark:text-slate-400 rounded-xl text-xs font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-gradient px-4 py-1.5 rounded-xl text-xs font-semibold shadow-sm text-white"
                  >
                    Save Flashcard
                  </button>
                </div>
              </form>
            )}

            {/* Main Interactive Flashcard Card */}
            {kit.flashcards.length > 0 ? (
              <div className="max-w-2xl mx-auto space-y-6">
                {/* Progress bar */}
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-mono font-medium">
                    Card {practiceIndex + 1} of {kit.flashcards.length}
                  </span>
                  <span className="text-[11px] text-slate-400 dark:text-slate-500">
                    Press <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#1B1D2A] text-slate-700 dark:text-slate-300 font-mono text-[10px]">Space</kbd> to reveal, <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#1B1D2A] text-slate-700 dark:text-slate-300 font-mono text-[10px]">1-3</kbd> to rate
                  </span>
                </div>

                {/* Card Container */}
                <div
                  onClick={() => setIsAnswerRevealed(!isAnswerRevealed)}
                  className="min-h-[260px] bg-white dark:bg-[#10121B] hover:bg-violet-50/15 dark:hover:bg-[#121422] border border-slate-200/90 dark:border-[#212330] hover:border-violet-400 dark:hover:border-violet-500/40 rounded-3xl p-8 flex flex-col justify-between cursor-pointer transition-all shadow-xl text-center select-none"
                >
                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                    <span className="font-bold">{kit.flashcards[practiceIndex].id.toUpperCase()}</span>
                    {kit.flashcards[practiceIndex].confidence && (
                      <span
                        className={`px-2.5 py-0.5 rounded-full font-bold text-[10px] ${
                          kit.flashcards[practiceIndex].confidence === 3
                            ? 'text-emerald-700 bg-emerald-50 border border-emerald-200 dark:text-emerald-400 dark:bg-emerald-500/10 dark:border-emerald-500/30'
                            : kit.flashcards[practiceIndex].confidence === 2
                            ? 'text-amber-700 bg-amber-50 border border-amber-200 dark:text-amber-400 dark:bg-amber-500/10 dark:border-amber-500/30'
                            : 'text-rose-700 bg-rose-50 border border-rose-200 dark:text-rose-400 dark:bg-rose-500/10 dark:border-rose-500/30'
                        }`}
                      >
                        Confidence: {kit.flashcards[practiceIndex].confidence} / 3
                      </span>
                    )}
                  </div>

                  <div className="py-6 space-y-4">
                    <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white leading-relaxed">
                      {kit.flashcards[practiceIndex].front}
                    </h3>

                    {isAnswerRevealed ? (
                      <div className="pt-4 border-t border-slate-100 dark:border-[#1C1E2B] animate-in fade-in duration-200">
                        <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                          {kit.flashcards[practiceIndex].back}
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-violet-600 dark:text-violet-400 font-medium">
                        Click card or press Space to reveal answer
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-center space-x-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                    <span>Covers:</span>
                    {kit.flashcards[practiceIndex].requirement_ids.map(rId => (
                      <span key={rId} className="font-mono text-slate-700 dark:text-slate-300 font-medium">{rId}</span>
                    ))}
                  </div>
                </div>

                {/* Confidence Rating Buttons */}
                {isAnswerRevealed && (
                  <div className="bg-white dark:bg-[#10121B] border border-slate-200/90 dark:border-[#212330] rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md animate-in fade-in">
                    <span className="text-xs text-slate-800 dark:text-slate-300 font-medium">How confident do you feel?</span>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleScoreCard(1)}
                        className="px-3.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 text-rose-700 dark:text-rose-400 text-xs font-medium border border-rose-200 dark:border-rose-500/30 transition-colors"
                      >
                        1 &middot; Needs Review
                      </button>
                      <button
                        onClick={() => handleScoreCard(2)}
                        className="px-3.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-500/10 dark:hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 text-xs font-medium border border-amber-200 dark:border-amber-500/30 transition-colors"
                      >
                        2 &middot; Medium
                      </button>
                      <button
                        onClick={() => handleScoreCard(3)}
                        className="px-3.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs font-medium border border-emerald-200 dark:border-emerald-500/30 transition-colors"
                      >
                        3 &middot; Confident
                      </button>
                    </div>
                  </div>
                )}

                {/* Navigation arrows */}
                <div className="flex items-center justify-between pt-2">
                  <button
                    onClick={prevCard}
                    className="px-4 py-2 rounded-xl border border-slate-300 dark:border-[#262838] bg-white dark:bg-[#10121B] hover:bg-slate-50 dark:hover:bg-[#1C1E2B] text-slate-700 dark:text-slate-300 text-xs font-medium transition-colors"
                  >
                    &larr; Previous Card
                  </button>
                  <button
                    onClick={nextCard}
                    className="px-4 py-2 rounded-xl border border-slate-300 dark:border-[#262838] bg-white dark:bg-[#10121B] hover:bg-slate-50 dark:hover:bg-[#1C1E2B] text-slate-700 dark:text-slate-300 text-xs font-medium transition-colors"
                  >
                    Next Card &rarr;
                  </button>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-xs text-slate-500">No flashcards in this kit.</div>
            )}
          </div>
        )}

        {/* TAB 5: STUDY SCHEDULE */}
        {activeTab === 'schedule' && (
          <div className="space-y-6">
            <div className="pb-4 border-b border-slate-200/90 dark:border-[#212330]">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                {kit.schedule.days_available} Days Study Schedule
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Deterministic arithmetic study plan allocating higher-difficulty and must-have requirements earlier.
              </p>
            </div>

            <div className="space-y-4">
              {kit.schedule.days.map((day) => {
                const isCompleted = (kit.schedule_completed_days || []).includes(day.day);
                const dayQuestions = day.question_ids
                  .map(id => kit.questions.find(q => q.id === id))
                  .filter(Boolean) as InternalQuestion[];

                return (
                  <div
                    key={day.day}
                    className={`bg-white dark:bg-[#10121B] border rounded-2xl p-5 transition-all shadow-sm ${
                      isCompleted
                        ? 'border-emerald-300 dark:border-emerald-500/40 bg-emerald-50/20 dark:bg-[#10121B]'
                        : 'border-slate-200/90 dark:border-[#212330]'
                    }`}
                  >
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#1A1C29]">
                      <div className="flex items-center space-x-3">
                        <button
                          onClick={() => handleToggleDay(day.day)}
                          className={`w-5 h-5 rounded-md flex items-center justify-center border transition-colors ${
                            isCompleted
                              ? 'bg-emerald-600 border-emerald-500 text-white'
                              : 'border-slate-300 dark:border-[#2D3042] bg-white dark:bg-[#0A0B10] hover:border-violet-500'
                          }`}
                        >
                          {isCompleted && <Check className="w-3.5 h-3.5" />}
                        </button>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white font-mono">
                          DAY {day.day}
                        </h3>
                        <span className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                          {day.focus}
                        </span>
                      </div>

                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono font-medium bg-violet-50 dark:bg-[#1A1C29] text-violet-700 dark:text-violet-400 border border-violet-200 dark:border-[#27293C]">
                        {day.minutes} min
                      </span>
                    </div>

                    <div className="pt-3 space-y-2">
                      <span className="text-[11px] font-mono text-slate-500 uppercase tracking-wider block">
                        Assigned Preparation Questions ({day.question_ids.length})
                      </span>
                      <div className="space-y-1.5">
                        {dayQuestions.map(q => (
                          <div
                            key={q.id}
                            className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#0C0E15] border border-slate-200 dark:border-[#1E202E] text-xs flex items-start justify-between gap-3"
                          >
                            <div>
                              <span className="font-mono text-violet-600 dark:text-violet-400 font-bold mr-2">{q.id.toUpperCase()}</span>
                              <span className="text-slate-800 dark:text-slate-200">{q.prompt}</span>
                            </div>
                            <span className="text-[10px] font-mono text-slate-500 uppercase shrink-0">
                              {q.category}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 6: WEAK SPOTS & READINESS DIAGNOSTIC */}
        {activeTab === 'readiness' && (
          <div className="space-y-6">
            <div className="pb-4 border-b border-slate-200/90 dark:border-[#212330]">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">Interview Readiness &amp; Weak Spots</h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Diagnostic analytics calculated directly from your flashcard practice performance and requirement coverage.
              </p>
            </div>

            {/* Top Score Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <div className="bg-white dark:bg-[#10121B] border border-slate-200/90 dark:border-[#212330] rounded-2xl p-5 shadow-sm">
                <span className="text-xs font-mono text-slate-600 dark:text-slate-400 uppercase tracking-wider block mb-1 font-semibold">
                  Overall Readiness
                </span>
                <div className="text-3xl font-black text-slate-900 dark:text-white font-mono">
                  {readinessStats.percentage}%
                </div>
                <div className="w-full bg-slate-100 dark:bg-[#1A1C29] h-2 rounded-full mt-3 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-violet-600 via-indigo-600 to-fuchsia-600 h-full rounded-full transition-all"
                    style={{ width: `${readinessStats.percentage}%` }}
                  />
                </div>
              </div>

              <div className="bg-white dark:bg-[#10121B] border border-slate-200/90 dark:border-[#212330] rounded-2xl p-5 shadow-sm">
                <span className="text-xs font-mono text-slate-600 dark:text-slate-400 uppercase tracking-wider block mb-1 font-semibold">
                  Practice Activity
                </span>
                <div className="text-3xl font-black text-violet-600 dark:text-violet-400 font-mono">
                  {readinessStats.totalPracticed} / {kit.flashcards.length}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">Cards scored in Practice Mode</p>
              </div>

              <div className="bg-white dark:bg-[#10121B] border border-slate-200/90 dark:border-[#212330] rounded-2xl p-5 shadow-sm">
                <span className="text-xs font-mono text-slate-600 dark:text-slate-400 uppercase tracking-wider block mb-1 font-semibold">
                  Identified Weak Spots
                </span>
                <div className="text-3xl font-black text-rose-600 dark:text-rose-400 font-mono">
                  {readinessStats.weakCount}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">Requirements flagged with low confidence</p>
              </div>
            </div>

            {/* Requirement Breakdown */}
            <div className="bg-white dark:bg-[#10121B] border border-slate-200/90 dark:border-[#212330] rounded-2xl p-6 shadow-sm space-y-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Requirement-by-Requirement Mastery
              </h3>

              <div className="space-y-3">
                {readinessStats.requirementReadiness.map(({ req, status, scorePercent }) => (
                  <div
                    key={req.id}
                    className="p-4 rounded-xl bg-slate-50 dark:bg-[#0C0E15] border border-slate-200 dark:border-[#1E202E] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-300">{req.id}</span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-semibold ${
                            req.priority === 'must'
                              ? 'text-rose-700 bg-rose-50 border border-rose-200 dark:text-rose-400 dark:bg-rose-500/10 dark:border-rose-500/30'
                              : 'text-sky-700 bg-sky-50 border border-sky-200 dark:text-sky-400 dark:bg-sky-500/10 dark:border-sky-500/30'
                          }`}
                        >
                          {req.priority}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">{req.kind}</span>
                      </div>
                      <p className="text-xs text-slate-800 dark:text-slate-200">{req.text}</p>
                    </div>

                    <div className="flex items-center space-x-3 shrink-0">
                      {status === 'ready' && (
                        <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 text-xs font-mono font-medium dark:border-emerald-500/30">
                          Ready ({scorePercent}%)
                        </span>
                      )}
                      {status === 'moderate' && (
                        <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 text-xs font-mono font-medium dark:border-amber-500/30">
                          Moderate ({scorePercent}%)
                        </span>
                      )}
                      {status === 'weak' && (
                        <span className="px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 text-xs font-mono font-medium dark:border-rose-500/30">
                          Weak Spot
                        </span>
                      )}
                      {status === 'unpracticed' && (
                        <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200 dark:bg-[#1B1D2A] dark:text-slate-400 text-xs font-mono dark:border-[#27293C]">
                          Not Practiced
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Regeneration Confirmation Modal */}
      {regenerationTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#12141F] border border-slate-200 dark:border-[#2A2C3E] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center space-x-2 text-violet-600 dark:text-violet-400">
              <RefreshCw className="w-5 h-5" />
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Regenerate {regenerationTarget.replace('-', ' ')} Questions?
              </h3>
            </div>

            <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
              Your custom-written, edited, and pinned questions will be <strong className="text-emerald-600 dark:text-emerald-400">strictly preserved</strong>. Only unmodified generated questions in this category will be replaced.
            </p>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0A0B10] border border-slate-200 dark:border-[#1F2130] text-[11px] text-slate-600 dark:text-slate-400 space-y-1">
              <div>✓ Preserves questions marked <span className="text-amber-600 dark:text-amber-400 font-mono font-semibold">EDITED</span></div>
              <div>✓ Preserves questions marked <span className="text-violet-600 dark:text-violet-400 font-mono font-semibold">PINNED</span></div>
              <div>✓ Preserves questions marked <span className="text-emerald-600 dark:text-emerald-400 font-mono font-semibold">USER-ADDED</span></div>
              <div>✓ Other question categories and company brief are untouched</div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                disabled={isRegenerating}
                onClick={() => setRegenerationTarget(null)}
                className="px-3.5 py-2 border border-slate-300 dark:border-[#262838] hover:bg-slate-100 dark:hover:bg-[#1C1E2B] text-slate-700 dark:text-slate-300 rounded-xl text-xs font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isRegenerating}
                onClick={confirmRegenerateCategory}
                className="btn-gradient px-4 py-2 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-md shadow-violet-500/20"
              >
                {isRegenerating ? 'Regenerating...' : 'Yes, Regenerate Category'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
