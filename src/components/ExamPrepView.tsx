import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileText,
  ListChecks,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  XCircle,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useCampus } from '../context/CampusContext';
import type { GeneratedQuiz, TaskCategory, TaskPriority } from '../types/campus';

type PrepTab = 'overview' | 'syllabus' | 'planner' | 'quiz' | 'flashcards' | 'calendar';

export const ExamPrepView: React.FC = () => {
  const {
    subjects,
    exams,
    studyTasks,
    materials,
    profile,
    toggleStudyTask,
    createOrUpdateStudyTask,
    removeStudyTask,
    setActiveView,
  } = useCampus();

  const [activeTab, setActiveTab] = useState<PrepTab>('overview');
  const [selectedSemester, setSelectedSemester] = useState<string>('all');

  // Flashcard Deck state
  const [flashcardSubjectId, setFlashcardSubjectId] = useState(subjects[0]?.id || '');
  const [flashcardUnit, setFlashcardUnit] = useState(subjects[0]?.units[0] || 'Core Concepts');
  const [flashcardDifficulty, setFlashcardDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [flashcardLoading, setFlashcardLoading] = useState(false);
  const [flashcardError, setFlashcardError] = useState<string | null>(null);
  const [generatedFlashcards, setGeneratedFlashcards] = useState<{
    deckTitle: string;
    cards: Array<{ front: string; back: string; hint?: string }>;
  } | null>(null);
  const [currentCardIdx, setCurrentCardIdx] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [masteredCards, setMasteredCards] = useState<Record<number, boolean>>({});

  const handleGenerateFlashcards = async () => {
    const sub = subjects.find((s) => s.id === flashcardSubjectId) || subjects[0];
    if (!sub) return;
    setFlashcardLoading(true);
    setFlashcardError(null);
    setCurrentCardIdx(0);
    setIsFlipped(false);
    setShowHint(false);
    setMasteredCards({});
    try {
      const matchedMat = materials.find((m) => m.subjectId === sub.id);
      const res = await fetch('/api/ai/flashcards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjectName: sub.name,
          unit: flashcardUnit || sub.units[0] || 'Core Concepts',
          difficulty: flashcardDifficulty,
          count: 8,
          materialContext: matchedMat ? matchedMat.contentPreview : '',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate flashcards.');
      setGeneratedFlashcards(data);
    } catch (err) {
      setFlashcardError(err instanceof Error ? err.message : 'Unable to generate flashcard deck.');
    } finally {
      setFlashcardLoading(false);
    }
  };

  // AI Study Planner state
  const [aiPlanLoading, setAiPlanLoading] = useState(false);
  const [aiPlanError, setAiPlanError] = useState<string | null>(null);
  const [aiPlanResult, setAiPlanResult] = useState<{
    plannerTitle: string;
    summary: string;
    priorityFocus: Array<{ subject: string; urgency: string; reason: string }>;
    schedule: Array<{
      timeframe: string;
      focusSubject: string;
      dailyGoal: string;
      priorityTopics: string[];
      recommendedMinutes: number;
    }>;
  } | null>(null);

  const handleGenerateAiStudyPlan = async () => {
    setAiPlanLoading(true);
    setAiPlanError(null);
    try {
      const res = await fetch('/api/ai/study-planner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exams,
          subjects,
          studentName: profile?.displayName || 'Student',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate AI study plan.');
      }
      setAiPlanResult(data);
    } catch (err) {
      setAiPlanError(err instanceof Error ? err.message : 'Failed to generate study plan.');
    } finally {
      setAiPlanLoading(false);
    }
  };

  const handleImportPlanTasks = async () => {
    if (!aiPlanResult) return;
    for (const block of aiPlanResult.schedule) {
      const matchedSub = subjects.find((s) => s.name.toLowerCase().includes(block.focusSubject.toLowerCase())) || subjects[0];
      await createOrUpdateStudyTask({
        subjectId: matchedSub ? matchedSub.id : 'sub_gen',
        subjectName: matchedSub ? matchedSub.name : block.focusSubject,
        unit: block.priorityTopics[0] || 'General Review',
        title: block.dailyGoal,
        dueDate: '2026-11-28',
        priority: 'high',
        category: 'goal',
        completed: false,
      });
    }
  };

  // New study task form
  const [taskTitle, setTaskTitle] = useState('');
  const [taskSubjectId, setTaskSubjectId] = useState(subjects[0]?.id || '');
  const [taskCategory, setTaskCategory] = useState<TaskCategory>('goal');
  const [taskPriority, setTaskPriority] = useState<TaskPriority>('medium');
  const [taskDueDate, setTaskDueDate] = useState('2026-11-24');

  // AI Practice Quiz state
  const [quizSubjectId, setQuizSubjectId] = useState(subjects[0]?.id || '');
  const [quizUnit, setQuizUnit] = useState(subjects[0]?.units[0] || '');
  const [quizDifficulty, setQuizDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizError, setQuizError] = useState<string | null>(null);
  const [generatedQuiz, setGeneratedQuiz] = useState<GeneratedQuiz | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);

  // Calendar state
  const [calMonth, setCalMonth] = useState(() => new Date('2026-11-01'));

  const filteredExams = useMemo(() => {
    return [...exams]
      .filter((e) => selectedSemester === 'all' || e.semester === Number(selectedSemester))
      .sort((a, b) => a.examDate.localeCompare(b.examDate));
  }, [exams, selectedSemester]);

  const pyqMaterials = useMemo(
    () => materials.filter((m) => m.type === 'pyq'),
    [materials]
  );

  // Compute syllabus unit completion from studyTasks (category === 'syllabus') or all tasks per subject
  const subjectProgressData = useMemo(() => {
    return subjects.map((sub) => {
      const subTasks = studyTasks.filter((t) => t.subjectId === sub.id);
      const completedTasks = subTasks.filter((t) => t.completed).length;
      const pct = subTasks.length > 0 ? Math.round((completedTasks / subTasks.length) * 100) : 0;
      return {
        id: sub.id,
        code: sub.code,
        name: sub.name,
        completed: completedTasks,
        total: subTasks.length,
        percentage: pct,
      };
    });
  }, [subjects, studyTasks]);

  const overallProgress = useMemo(() => {
    const total = studyTasks.length;
    const done = studyTasks.filter((t) => t.completed).length;
    return total > 0 ? Math.round((done / total) * 100) : 0;
  }, [studyTasks]);

  const isUnitCompleted = (subjectId: string, unitTitle: string) => {
    const match = studyTasks.find(
      (t) => t.subjectId === subjectId && t.unit === unitTitle && t.category === 'syllabus'
    );
    return match ? match.completed : false;
  };

  const handleToggleUnit = async (subjectId: string, subjectName: string, unitTitle: string) => {
    const existing = studyTasks.find(
      (t) => t.subjectId === subjectId && t.unit === unitTitle && t.category === 'syllabus'
    );
    if (existing) {
      await toggleStudyTask(existing);
    } else {
      await createOrUpdateStudyTask({
        subjectId,
        subjectName,
        unit: unitTitle,
        title: `Complete ${unitTitle}`,
        dueDate: '',
        priority: 'medium',
        category: 'syllabus',
        completed: true,
      });
    }
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim()) return;
    const sub = subjects.find((s) => s.id === taskSubjectId) || subjects[0];
    if (!sub) return;
    await createOrUpdateStudyTask({
      subjectId: sub.id,
      subjectName: sub.name,
      unit: sub.units[0] || '',
      title: taskTitle.trim(),
      dueDate: taskDueDate,
      priority: taskPriority,
      category: taskCategory,
      completed: false,
    });
    setTaskTitle('');
  };

  const handleGenerateQuiz = async () => {
    const sub = subjects.find((s) => s.id === quizSubjectId) || subjects[0];
    if (!sub) return;
    setQuizLoading(true);
    setQuizError(null);
    setQuizSubmitted(false);
    setQuizAnswers({});
    try {
      const res = await fetch('/api/ai/exam-quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjectName: sub.name,
          unit: quizUnit || sub.units[0] || 'Core Concepts',
          difficulty: quizDifficulty,
          count: 5,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate quiz.');
      setGeneratedQuiz(data);
    } catch (err) {
      setQuizError(err instanceof Error ? err.message : 'Unable to generate practice quiz.');
    } finally {
      setQuizLoading(false);
    }
  };

  const daysUntil = (dateStr: string) => {
    const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (diff < 0) return 'Done';
    if (diff === 0) return 'Today';
    return `${diff} days`;
  };

  // Calendar grid builder
  const calendarDays = useMemo(() => {
    const year = calMonth.getFullYear();
    const month = calMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: Array<{ dateStr: string | null; dayNum: number | null }> = [];
    for (let i = 0; i < firstDay; i++) cells.push({ dateStr: null, dayNum: null });
    for (let d = 1; d <= daysInMonth; d++) {
      const mStr = String(month + 1).padStart(2, '0');
      const dStr = String(d).padStart(2, '0');
      cells.push({ dateStr: `${year}-${mStr}-${dStr}`, dayNum: d });
    }
    return cells;
  }, [calMonth]);

  return (
    <div className="space-y-6">
      {/* Header & Tabs */}
      <section className="relative overflow-hidden cc-card p-4 sm:p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="absolute inset-0 cc-grid-pattern opacity-40 pointer-events-none" aria-hidden="true" />
        <div className="relative z-10 min-w-0">
          <h2 className="font-display text-xl sm:text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            Smart Exam Preparation
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Overall study &amp; syllabus readiness: <span className="font-mono font-semibold text-blue-600 dark:text-blue-400 tabular-nums">{overallProgress}%</span>
          </p>
        </div>

        <div className="relative z-10 flex flex-wrap items-center gap-1 cc-segmented max-w-full">
          {(
            [
              { id: 'overview', label: 'Timetable & Analytics' },
              { id: 'syllabus', label: 'Syllabus Checklist' },
              { id: 'planner', label: 'Study Planner' },
              { id: 'quiz', label: 'AI Practice Quiz' },
              { id: 'flashcards', label: 'Flashcard Deck' },
              { id: 'calendar', label: 'Exam Calendar' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-white dark:bg-[#0B1018] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      {/* TAB 1: TIMETABLE & ANALYTICS */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Exam Countdown Strip */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {filteredExams.slice(0, 4).map((ex) => (
              <div
                key={ex.id}
                className="cc-card-hover p-5 space-y-2"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono font-medium text-blue-600 dark:text-blue-400">
                    {ex.subjectCode} · {ex.examType.toUpperCase()}
                  </span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                    {daysUntil(ex.examDate)}
                  </span>
                </div>
                <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white truncate">
                  {ex.subjectName}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  {ex.examDate} · {ex.startTime}–{ex.endTime}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{ex.venue}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            {/* Full Examination Timetable */}
            <section className="xl:col-span-7 min-w-0 cc-card p-4 sm:p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display text-base font-semibold">Semester Examination Timetable</h3>
                <select
                  aria-label="Filter exams by semester"
                  value={selectedSemester}
                  onChange={(e) => setSelectedSemester(e.target.value)}
                  className="px-2.5 py-1.5 text-xs cc-input"
                >
                  <option value="all">All Semesters</option>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                    <option key={s} value={String(s)}>
                      Semester {s}
                    </option>
                  ))}
                </select>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200/80 dark:border-white/[0.08] text-slate-500 dark:text-slate-400">
                      <th className="py-2.5 pr-3 font-medium">Subject</th>
                      <th className="py-2.5 px-3 font-medium">Date & Time</th>
                      <th className="py-2.5 px-3 font-medium">Venue</th>
                      <th className="py-2.5 pl-3 font-medium text-right">Countdown</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06]">
                    {filteredExams.map((ex) => (
                      <tr key={ex.id} className="hover:bg-slate-50/80 dark:hover:bg-white/[0.03]">
                        <td className="py-3 pr-3">
                          <p className="font-medium text-slate-900 dark:text-white">
                            {ex.subjectCode} · {ex.subjectName}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            {ex.syllabusUnits}
                          </p>
                        </td>
                        <td className="py-3 px-3 font-mono tabular-nums whitespace-nowrap">
                          {ex.examDate}
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {ex.startTime} – {ex.endTime}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-slate-600 dark:text-slate-300">{ex.venue}</td>
                        <td className="py-3 pl-3 text-right font-mono font-semibold text-blue-600 dark:text-blue-400 tabular-nums whitespace-nowrap">
                          {daysUntil(ex.examDate)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Study Progress Chart & Important PYQs */}
            <section className="xl:col-span-5 min-w-0 space-y-6">
              <div className="cc-card p-4 sm:p-6 space-y-4">
                <h3 className="font-display text-base font-semibold">Subject Preparation Analytics</h3>
                <div className="h-52 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={subjectProgressData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" vertical={false} />
                      <XAxis dataKey="code" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} stroke="#94a3b8" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0E121B',
                          borderColor: 'rgba(255,255,255,0.1)',
                          borderRadius: '10px',
                          color: '#f8fafc',
                          fontSize: '12px',
                        }}
                      />
                      <Bar dataKey="percentage" name="Completion %" fill="#2563eb" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="cc-card p-6 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-base font-semibold flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    PYQs, Books &amp; Syllabi
                  </h3>
                  <button
                    type="button"
                    onClick={() => setActiveView('materials')}
                    className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Open Library
                  </button>
                </div>
                {pyqMaterials.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    No previous year papers uploaded yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {materials
                      .filter((m) => m.type === 'pyq' || m.type === 'syllabus' || m.type === 'books')
                      .slice(0, 4)
                      .map((item) => (
                        <div
                          key={item.id}
                          className="p-3 rounded-xl border border-slate-200/80 dark:border-white/[0.08] bg-slate-50/40 dark:bg-white/[0.02] flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-slate-900 dark:text-white truncate">
                              {item.title}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                              {item.subjectName} · {item.type === 'books' ? 'Book' : item.type === 'syllabus' ? 'Syllabus' : 'PYQ'}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setActiveView('materials')}
                            className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline shrink-0"
                          >
                            View
                          </button>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      )}

      {/* TAB 2: SUBJECT-WISE SYLLABUS CHECKLIST */}
      {activeTab === 'syllabus' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {subjects.map((sub) => {
            const completedUnits = sub.units.filter((u) => isUnitCompleted(sub.id, u)).length;
            const pct = sub.units.length > 0 ? Math.round((completedUnits / sub.units.length) * 100) : 0;

            return (
              <section
                key={sub.id}
                className="cc-card p-6 space-y-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-mono text-blue-600 dark:text-blue-400">
                      {sub.code} · {sub.credits} Credits · {sub.facultyName}
                    </p>
                    <h3 className="font-display text-base font-semibold mt-0.5">{sub.name}</h3>
                  </div>
                  <span className="font-mono text-sm font-semibold tabular-nums">{pct}%</span>
                </div>

                <div className="w-full h-1.5 bg-slate-100 dark:bg-white/[0.08] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600 rounded-full transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>

                <div className="space-y-2">
                  {sub.units.map((unitTitle) => {
                    const checked = isUnitCompleted(sub.id, unitTitle);
                    return (
                      <label
                        key={unitTitle}
                        className="flex items-start gap-3 p-2.5 rounded-xl border border-slate-100 dark:border-white/[0.06] hover:bg-slate-50 dark:hover:bg-white/[0.03] cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => handleToggleUnit(sub.id, sub.name, unitTitle)}
                          className="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                        />
                        <span
                          className={`text-xs leading-relaxed ${
                            checked ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-700 dark:text-slate-200'
                          }`}
                        >
                          {unitTitle}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* TAB 3: PERSONAL STUDY PLANNER & REMINDERS */}
      {activeTab === 'planner' && (
        <div className="space-y-6">
          {/* AI Study Planner Generator Banner */}
          <div className="cc-card cc-grid-pattern p-6 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  AI Study Planner & Exam Sprint Generator
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Automatically analyze your upcoming exam dates and syllabus completion tracking data to generate a prioritized daily/weekly study schedule.
                </p>
              </div>
              <button
                type="button"
                onClick={handleGenerateAiStudyPlan}
                disabled={aiPlanLoading}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold shrink-0 transition-colors shadow-sm"
              >
                {aiPlanLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Analyzing Exams & Syllabus...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generate AI Study Plan
                  </>
                )}
              </button>
            </div>

            {aiPlanError && (
              <p className="text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 p-3 rounded-xl border border-rose-200 dark:border-rose-900/50">
                {aiPlanError}
              </p>
            )}

            {aiPlanResult && (
              <div className="pt-4 border-t border-slate-200/80 dark:border-white/[0.08] space-y-5 animate-in fade-in duration-300">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                      {aiPlanResult.plannerTitle}
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
                      {aiPlanResult.summary}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleImportPlanTasks}
                    className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shrink-0 transition-colors shadow-xs"
                  >
                    Import Schedule into Tasks
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {aiPlanResult.priorityFocus.map((pf, i) => (
                    <div key={i} className="cc-inset p-3.5 space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-900 dark:text-white truncate">{pf.subject}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300">
                          {pf.urgency} Urgency
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">{pf.reason}</p>
                    </div>
                  ))}
                </div>

                <div className="space-y-2.5">
                  <h5 className="text-xs font-semibold text-slate-700 dark:text-slate-300">Recommended Study Blocks</h5>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {aiPlanResult.schedule.map((block, idx) => (
                      <div key={idx} className="cc-inset p-4 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-blue-600 dark:text-blue-400">{block.timeframe}</span>
                          <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">{block.recommendedMinutes} mins</span>
                        </div>
                        <h6 className="text-xs font-semibold text-slate-900 dark:text-white">{block.focusSubject}</h6>
                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{block.dailyGoal}</p>
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {block.priorityTopics.map((top, ti) => (
                            <span key={ti} className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-[10px] font-medium">
                              {top}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <section className="lg:col-span-4 min-w-0 cc-card p-4 sm:p-6 space-y-4 h-fit">
              <h3 className="font-display text-base font-semibold flex items-center gap-2">
                <Plus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                Add Study Goal / Revision Task
              </h3>
              <form onSubmit={handleAddTask} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-medium mb-1">Task Description</label>
                  <input
                    type="text"
                    required
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    placeholder="e.g. Revise Deadlock Detection & Recovery"
                    className="w-full px-3 py-2 text-sm cc-input"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Subject</label>
                  <select
                    value={taskSubjectId}
                    onChange={(e) => setTaskSubjectId(e.target.value)}
                    className="w-full px-3 py-2 text-sm cc-input"
                  >
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code} · {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">Category</label>
                    <select
                      value={taskCategory}
                      onChange={(e) => setTaskCategory(e.target.value as TaskCategory)}
                      className="w-full px-3 py-2 text-sm cc-input"
                    >
                      <option value="goal">Daily Goal</option>
                      <option value="revision">Revision Reminder</option>
                      <option value="assignment">Assignment</option>
                      <option value="syllabus">Syllabus Topic</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Priority</label>
                    <select
                      value={taskPriority}
                      onChange={(e) => setTaskPriority(e.target.value as TaskPriority)}
                      className="w-full px-3 py-2 text-sm cc-input"
                    >
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Target Date</label>
                  <input
                    type="date"
                    value={taskDueDate}
                    onChange={(e) => setTaskDueDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm cc-input"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors"
                >
                  Add to Study Planner
                </button>
              </form>
            </section>

            <section className="lg:col-span-8 min-w-0 cc-card p-4 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-base font-semibold flex items-center gap-2">
                <ListChecks className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                Active Study Tasks & Revision Queue
              </h3>
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                {studyTasks.filter((t) => t.completed).length}/{studyTasks.length} completed
              </span>
            </div>

            {studyTasks.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 py-10 text-center">
                No study tasks yet. Create your first daily study goal or revision reminder on the left.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-white/[0.06]">
                {studyTasks.map((task) => (
                  <div key={task.id} className="py-3 flex items-start justify-between gap-3">
                    <label className="flex items-start gap-3 cursor-pointer flex-1 min-w-0">
                      <input
                        type="checkbox"
                        checked={task.completed}
                        onChange={() => toggleStudyTask(task)}
                        className="mt-1 w-4 h-4 rounded border-slate-300 text-blue-600"
                      />
                      <div className="min-w-0">
                        <p
                          className={`text-sm font-medium ${
                            task.completed ? 'line-through text-slate-400' : 'text-slate-900 dark:text-white'
                          }`}
                        >
                          {task.title}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {task.subjectName} · {task.category} ·{' '}
                          <span
                            className={
                              task.priority === 'high'
                                ? 'text-red-600 dark:text-red-400 font-medium'
                                : 'text-slate-500 dark:text-slate-400'
                            }
                          >
                            {task.priority} priority
                          </span>
                          {task.dueDate ? ` · Due ${task.dueDate}` : ''}
                        </p>
                      </div>
                    </label>
                    <button
                      type="button"
                      onClick={() => removeStudyTask(task.id)}
                      aria-label="Delete task"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    )}

      {/* TAB 4: AI PRACTICE QUIZ */}
      {activeTab === 'quiz' && (
        <div className="cc-card p-4 sm:p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div>
              <label className="block text-xs font-medium mb-1">Subject</label>
              <select
                value={quizSubjectId}
                onChange={(e) => {
                  setQuizSubjectId(e.target.value);
                  const sub = subjects.find((s) => s.id === e.target.value);
                  if (sub?.units[0]) setQuizUnit(sub.units[0]);
                }}
                className="w-full px-3 py-2 text-sm cc-input"
              >
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} · {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Syllabus Unit</label>
              <select
                value={quizUnit}
                onChange={(e) => setQuizUnit(e.target.value)}
                className="w-full px-3 py-2 text-sm cc-input"
              >
                {(subjects.find((s) => s.id === quizSubjectId)?.units || ['Core Concepts']).map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Difficulty</label>
              <select
                value={quizDifficulty}
                onChange={(e) => setQuizDifficulty(e.target.value as 'easy' | 'medium' | 'hard')}
                className="w-full px-3 py-2 text-sm cc-input"
              >
                <option value="easy">Foundational (Easy)</option>
                <option value="medium">University Exam (Medium)</option>
                <option value="hard">Competitive / GATE (Hard)</option>
              </select>
            </div>
            <button
              type="button"
              disabled={quizLoading}
              onClick={handleGenerateQuiz}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium inline-flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {quizLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />}
              {quizLoading ? 'Generating...' : 'Generate 5-Q Quiz'}
            </button>
          </div>

          {quizError && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
              {quizError}
            </div>
          )}

          {generatedQuiz && (
            <div className="space-y-5 pt-4 border-t border-slate-200/80 dark:border-white/[0.08]">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg font-semibold">{generatedQuiz.quizTitle}</h3>
                {quizSubmitted && (
                  <span className="font-mono text-sm font-semibold text-blue-600 dark:text-blue-400 tabular-nums">
                    Score:{' '}
                    {generatedQuiz.questions.reduce(
                      (acc, q, i) => acc + (quizAnswers[i] === q.correctIndex ? 1 : 0),
                      0
                    )}{' '}
                    / {generatedQuiz.questions.length}
                  </span>
                )}
              </div>

              <div className="space-y-5">
                {generatedQuiz.questions.map((q, qIdx) => (
                  <div key={qIdx} className="space-y-2.5">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">
                      {qIdx + 1}. {q.question}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {q.options.map((opt, oIdx) => {
                        const isPicked = quizAnswers[qIdx] === oIdx;
                        const isCorrect = q.correctIndex === oIdx;
                        let cls =
                          'border-slate-200/80 dark:border-white/[0.08] bg-slate-50/70 dark:bg-white/[0.02] hover:border-blue-500';
                        if (quizSubmitted) {
                          if (isCorrect) cls = 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40';
                          else if (isPicked) cls = 'border-red-500 bg-red-50 dark:bg-red-950/40';
                        } else if (isPicked) {
                          cls = 'border-blue-600 bg-blue-50 dark:bg-blue-950/40';
                        }

                        return (
                          <button
                            key={oIdx}
                            type="button"
                            disabled={quizSubmitted}
                            onClick={() => setQuizAnswers((prev) => ({ ...prev, [qIdx]: oIdx }))}
                            className={`text-left px-3.5 py-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 transition-colors ${cls}`}
                          >
                            <span>{opt}</span>
                            {quizSubmitted && isCorrect && (
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                            )}
                            {quizSubmitted && isPicked && !isCorrect && (
                              <XCircle className="w-4 h-4 text-red-600 shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                    {quizSubmitted && (
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        <span className="font-semibold">Explanation:</span> {q.explanation}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {!quizSubmitted && (
                <button
                  type="button"
                  onClick={() => setQuizSubmitted(true)}
                  className="px-5 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold"
                >
                  Submit Quiz
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB: FLASHCARD DECK */}
      {activeTab === 'flashcards' && (
        <div className="cc-card p-4 sm:p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div>
              <label className="block text-xs font-medium mb-1">Subject</label>
              <select
                value={flashcardSubjectId}
                onChange={(e) => {
                  setFlashcardSubjectId(e.target.value);
                  const sub = subjects.find((s) => s.id === e.target.value);
                  if (sub?.units[0]) setFlashcardUnit(sub.units[0]);
                }}
                className="w-full px-3 py-2 text-sm cc-input"
              >
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} · {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Syllabus Unit</label>
              <select
                value={flashcardUnit}
                onChange={(e) => setFlashcardUnit(e.target.value)}
                className="w-full px-3 py-2 text-sm cc-input"
              >
                {(subjects.find((s) => s.id === flashcardSubjectId)?.units || ['Core Concepts']).map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Difficulty</label>
              <select
                value={flashcardDifficulty}
                onChange={(e) => setFlashcardDifficulty(e.target.value as any)}
                className="w-full px-3 py-2 text-sm cc-input"
              >
                <option value="easy">Foundational (Easy)</option>
                <option value="medium">University Exam (Medium)</option>
                <option value="hard">Advanced / GATE (Hard)</option>
              </select>
            </div>
            <button
              type="button"
              disabled={flashcardLoading}
              onClick={handleGenerateFlashcards}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium inline-flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {flashcardLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {flashcardLoading ? 'Generating Deck...' : 'Generate Flashcards'}
            </button>
          </div>

          {flashcardError && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
              {flashcardError}
            </div>
          )}

          {generatedFlashcards && generatedFlashcards.cards.length > 0 && (
            <div className="space-y-6 pt-4 border-t border-slate-200/80 dark:border-white/[0.08]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                    {generatedFlashcards.deckTitle}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Card {currentCardIdx + 1} of {generatedFlashcards.cards.length} · Spaced Repetition Active
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
                    Mastered: {Object.values(masteredCards).filter(Boolean).length} / {generatedFlashcards.cards.length}
                  </span>
                </div>
              </div>

              {/* Flashcard 3D Card Simulator */}
              <div className="max-w-2xl mx-auto">
                <div
                  onClick={() => setIsFlipped(!isFlipped)}
                  className={`min-h-[240px] sm:min-h-[260px] p-5 sm:p-8 rounded-2xl border transition-all duration-300 cursor-pointer flex flex-col justify-between shadow-md ${
                    isFlipped
                      ? 'bg-blue-50/60 dark:bg-blue-950/20 border-blue-300 dark:border-blue-900'
                      : 'cc-card border-slate-200/80 dark:border-white/[0.1]'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="font-mono uppercase tracking-wider font-semibold">
                      {isFlipped ? 'Back (Answer & Explanation)' : 'Front (Term / Concept)'}
                    </span>
                    <span className="text-[11px] underline">Click to Flip</span>
                  </div>

                  <div className="py-6 text-center">
                    <p className={`font-display text-base sm:text-lg leading-relaxed ${isFlipped ? 'text-slate-800 dark:text-slate-100' : 'text-slate-900 dark:text-white font-semibold'}`}>
                      {isFlipped
                        ? generatedFlashcards.cards[currentCardIdx].back
                        : generatedFlashcards.cards[currentCardIdx].front}
                    </p>
                    {!isFlipped && generatedFlashcards.cards[currentCardIdx].hint && (
                      <div className="mt-4">
                        {showHint ? (
                          <p className="text-xs text-amber-600 dark:text-amber-400 font-medium bg-amber-50 dark:bg-amber-950/40 p-2.5 rounded-xl inline-block">
                            Hint: {generatedFlashcards.cards[currentCardIdx].hint}
                          </p>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowHint(true);
                            }}
                            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            Show Hint
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-400 border-t border-slate-200/60 dark:border-white/[0.06] pt-3">
                    <span>Use buttons below to rate recall</span>
                    <span className="font-mono tabular-nums">{Math.round(((currentCardIdx + 1) / generatedFlashcards.cards.length) * 100)}%</span>
                  </div>
                </div>

                {/* Rating & Navigation Controls */}
                <div className="flex flex-wrap items-center justify-between gap-2.5 mt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setIsFlipped(false);
                      setShowHint(false);
                      setCurrentCardIdx((prev) => Math.max(0, prev - 1));
                    }}
                    disabled={currentCardIdx === 0}
                    className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-white/[0.1] text-xs font-medium disabled:opacity-40"
                  >
                    Previous Card
                  </button>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setMasteredCards((prev) => ({ ...prev, [currentCardIdx]: false }));
                        setIsFlipped(false);
                        setShowHint(false);
                        setCurrentCardIdx((prev) => Math.min(generatedFlashcards.cards.length - 1, prev + 1));
                      }}
                      className="px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 text-xs font-semibold"
                    >
                      Need Review (Again)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMasteredCards((prev) => ({ ...prev, [currentCardIdx]: true }));
                        setIsFlipped(false);
                        setShowHint(false);
                        setCurrentCardIdx((prev) => Math.min(generatedFlashcards.cards.length - 1, prev + 1));
                      }}
                      className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs"
                    >
                      Mastered (Good)
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setIsFlipped(false);
                      setShowHint(false);
                      setCurrentCardIdx((prev) => Math.min(generatedFlashcards.cards.length - 1, prev + 1));
                    }}
                    disabled={currentCardIdx === generatedFlashcards.cards.length - 1}
                    className="px-4 py-2 rounded-xl border border-slate-200 dark:border-white/[0.1] text-xs font-medium disabled:opacity-40"
                  >
                    Next Card
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: EXAMINATION & STUDY TASK CALENDAR */}
      {activeTab === 'calendar' && (
        <div className="cc-card p-4 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-display text-base font-semibold flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              {calMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1))}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/[0.1] text-xs font-medium hover:bg-slate-50 dark:hover:bg-white/[0.06]"
              >
                Prev
              </button>
              <button
                type="button"
                onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1))}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/[0.1] text-xs font-medium hover:bg-slate-50 dark:hover:bg-white/[0.06]"
              >
                Next
              </button>
            </div>
          </div>

          <div className="overflow-x-auto pb-1">
            <div className="min-w-[540px] space-y-2">
              <div className="grid grid-cols-7 gap-2 text-center text-xs font-medium text-slate-500 dark:text-slate-400">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                  <div key={d} className="py-1">
                    {d}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-2">
                {calendarDays.map((cell, idx) => {
                  if (!cell.dateStr) {
                    return <div key={`empty_${idx}`} className="min-h-[84px] rounded-xl bg-slate-50/50 dark:bg-white/[0.02]" />;
                  }
                  const dayExams = exams.filter((e) => e.examDate === cell.dateStr);
                  const dayTasks = studyTasks.filter((t) => t.dueDate === cell.dateStr);

                  return (
                    <div
                      key={cell.dateStr}
                      className="min-h-[84px] p-2 rounded-xl border border-slate-200/80 dark:border-white/[0.08] flex flex-col gap-1"
                    >
                      <span className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
                        {cell.dayNum}
                      </span>
                      {dayExams.map((ex) => (
                        <div
                          key={ex.id}
                          className="px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 text-[10px] font-medium truncate"
                          title={`${ex.subjectName} Exam (${ex.startTime})`}
                        >
                          Exam: {ex.subjectCode}
                        </div>
                      ))}
                      {dayTasks.map((tk) => (
                        <div
                          key={tk.id}
                          className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 text-[10px] truncate"
                          title={tk.title}
                        >
                          {tk.title}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
