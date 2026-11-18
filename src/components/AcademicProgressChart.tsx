import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  BookOpen,
  Clock,
  GraduationCap,
  Pencil,
  Plus,
  RotateCcw,
  X,
} from 'lucide-react';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useCampus } from '../context/CampusContext';

interface SemesterGradeEntry {
  semester: number;
  label: string;
  sgpa: number;
  credits: number;
  termLabel: string;
}

interface StudyHourLog {
  id: string;
  date: string; // YYYY-MM-DD
  subjectCode: string;
  subjectName: string;
  hours: number;
  note?: string;
}

const DEFAULT_GRADE_HISTORY: SemesterGradeEntry[] = [
  { semester: 1, label: 'Sem 1', sgpa: 3.48, credits: 20, termLabel: 'Fall 2024' },
  { semester: 2, label: 'Sem 2', sgpa: 3.62, credits: 22, termLabel: 'Spring 2025' },
  { semester: 3, label: 'Sem 3', sgpa: 3.74, credits: 21, termLabel: 'Fall 2025' },
  { semester: 4, label: 'Sem 4', sgpa: 3.81, credits: 20, termLabel: 'Spring 2026' },
  { semester: 5, label: 'Sem 5', sgpa: 3.88, credits: 18, termLabel: 'Current Term' },
];

const DAILY_HOUR_TEMPLATES = [2.5, 3.0, 4.2, 3.5, 4.8, 3.2, 4.0]; // Mon..Sun baseline

const WEEKLY_TREND_TEMPLATES: Array<{ label: string; hours: number; target: number; focus: string }> = [
  { label: 'Wk 1', hours: 18.5, target: 22, focus: 'OS Scheduling & ER Diagrams' },
  { label: 'Wk 2', hours: 21.0, target: 22, focus: 'Memory Paging & SQL Joins' },
  { label: 'Wk 3', hours: 23.5, target: 24, focus: 'TCP/IP & Graph Traversals' },
  { label: 'Wk 4', hours: 20.0, target: 24, focus: 'Normalization & Deadlocks' },
  { label: 'Wk 5', hours: 25.5, target: 24, focus: 'Midterm Problem Sets' },
  { label: 'Wk 6', hours: 24.0, target: 25, focus: 'Dynamic Programming Labs' },
  { label: 'Wk 7', hours: 27.5, target: 25, focus: 'Past Papers & Mock Quizzes' },
];

function toIsoDateOffset(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function buildDefaultDailyLogs(uid: string, subjectCodes: Array<{ code: string; name: string }>): StudyHourLog[] {
  const fallbacks =
    subjectCodes.length > 0
      ? subjectCodes
      : [
          { code: 'CS301', name: 'Operating Systems' },
          { code: 'CS302', name: 'Database Systems' },
          { code: 'CS303', name: 'Computer Networks' },
        ];
  return DAILY_HOUR_TEMPLATES.map((hrs, idx) => {
    const daysAgo = 6 - idx;
    const subj = fallbacks[idx % fallbacks.length];
    return {
      id: `seed_${uid}_${daysAgo}`,
      date: toIsoDateOffset(daysAgo),
      subjectCode: subj.code,
      subjectName: subj.name,
      hours: hrs,
      note: 'Focused revision session',
    };
  });
}

interface CustomTooltipPayloadItem {
  name?: string;
  value?: number | string;
  color?: string;
  dataKey?: string;
  payload?: Record<string, unknown>;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: CustomTooltipPayloadItem[];
  label?: string;
  mode: 'semester' | 'subject' | 'daily' | 'weekly';
}

const ChartTooltip: React.FC<ChartTooltipProps> = ({ active, payload, label, mode }) => {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload || {};

  return (
    <div className="rounded-xl bg-[#0D111A] text-slate-100 border border-white/12 px-3.5 py-2.5 shadow-xl text-xs space-y-1.5 min-w-[170px]">
      <div className="flex items-center justify-between gap-3 pb-1 border-b border-white/10">
        <span className="font-semibold text-white">{label}</span>
        {mode === 'semester' && typeof row.termLabel === 'string' && (
          <span className="text-[11px] text-slate-400">{row.termLabel}</span>
        )}
        {mode === 'subject' && typeof row.gradeLetter === 'string' && (
          <span className="font-mono font-semibold text-emerald-400">
            Grade {row.gradeLetter}
          </span>
        )}
      </div>

      <div className="space-y-1">
        {payload.map((entry, idx) => {
          const val = entry.value;
          const formatted =
            mode === 'semester'
              ? typeof val === 'number'
                ? val.toFixed(2)
                : String(val ?? '')
              : mode === 'subject'
              ? `${val}%`
              : `${Number(val ?? 0).toFixed(1)} hrs`;
          return (
            <div key={`${entry.dataKey || idx}`} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-slate-300">
                <span
                  className="w-2 h-2 rounded-xs shrink-0"
                  style={{ backgroundColor: entry.color || '#3B82F6' }}
                />
                {entry.name}
              </span>
              <span className="font-mono font-semibold text-white tabular-nums">{formatted}</span>
            </div>
          );
        })}
      </div>

      {mode === 'semester' && typeof row.credits === 'number' && (
        <p className="text-[11px] text-slate-400 pt-1 border-t border-white/10 font-mono tabular-nums">
          {row.credits} credits · ~{Math.round(Number(row.sgpa || 0) * 25)}% equiv.
        </p>
      )}
      {mode === 'daily' && typeof row.topSubject === 'string' && row.topSubject && (
        <p className="text-[11px] text-slate-400 pt-1 border-t border-white/10 truncate">
          Top focus: {row.topSubject}
        </p>
      )}
      {mode === 'weekly' && typeof row.focus === 'string' && row.focus && (
        <p className="text-[11px] text-slate-400 pt-1 border-t border-white/10 truncate">
          {row.focus}
        </p>
      )}
    </div>
  );
};

export const AcademicProgressChart: React.FC = () => {
  const { profile, subjects, studyTasks, studyContributors } = useCampus();
  const uid = profile?.uid || 'guest';
  const currentSem = Math.min(8, Math.max(1, profile?.semester || 5));

  const [gradeMode, setGradeMode] = useState<'semester' | 'subject'>('semester');
  const [studyRange, setStudyRange] = useState<'daily' | 'weekly'>('daily');
  const [weeklyTargetHours, setWeeklyTargetHours] = useState<number>(25);

  const [editingGrades, setEditingGrades] = useState(false);
  const [loggingHours, setLoggingHours] = useState(false);

  // Persistent Grade History per user
  const gradeStorageKey = `skucampus_grade_history_${uid}`;
  const [gradeHistory, setGradeHistory] = useState<SemesterGradeEntry[]>(DEFAULT_GRADE_HISTORY);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(gradeStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setGradeHistory(parsed);
          return;
        }
      }
    } catch {
      // Ignore storage errors
    }
    setGradeHistory(
      DEFAULT_GRADE_HISTORY.filter((entry) => entry.semester <= Math.max(currentSem, 5))
    );
  }, [gradeStorageKey, currentSem]);

  const saveGradeHistory = (next: SemesterGradeEntry[]) => {
    setGradeHistory(next);
    try {
      localStorage.setItem(gradeStorageKey, JSON.stringify(next));
    } catch {
      // Ignore storage errors
    }
  };

  // Persistent Study Hour Logs per user
  const studyStorageKey = `skucampus_study_hours_${uid}`;
  const [studyLogs, setStudyLogs] = useState<StudyHourLog[]>([]);

  const activeSubjects = useMemo(() => {
    const semMatches = subjects.filter((s) => s.semester === currentSem);
    return (semMatches.length > 0 ? semMatches : subjects).slice(0, 6);
  }, [subjects, currentSem]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(studyStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setStudyLogs(parsed);
          return;
        }
      }
    } catch {
      // Ignore storage errors
    }
    const seeded = buildDefaultDailyLogs(
      uid,
      activeSubjects.map((s) => ({ code: s.code, name: s.name }))
    );
    setStudyLogs(seeded);
  }, [studyStorageKey, uid, activeSubjects]);

  const persistStudyLogs = (next: StudyHourLog[]) => {
    setStudyLogs(next);
    try {
      localStorage.setItem(studyStorageKey, JSON.stringify(next));
    } catch {
      // Ignore storage errors
    }
  };

  // Quick Log Study Session form state
  const [logSubjectId, setLogSubjectId] = useState<string>('');
  const [logHoursInput, setLogHoursInput] = useState<string>('1.5');
  const [logDateInput, setLogDateInput] = useState<string>(() => toIsoDateOffset(0));

  useEffect(() => {
    if (!logSubjectId && activeSubjects.length > 0) {
      setLogSubjectId(activeSubjects[0].id);
    }
  }, [activeSubjects, logSubjectId]);

  const handleAddStudySession = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedHours = Number(logHoursInput);
    if (!Number.isFinite(parsedHours) || parsedHours <= 0 || parsedHours > 16) return;

    const chosen = activeSubjects.find((s) => s.id === logSubjectId) || activeSubjects[0];
    const entry: StudyHourLog = {
      id: `sh_${Date.now()}`,
      date: logDateInput || toIsoDateOffset(0),
      subjectCode: chosen?.code || 'STUDY',
      subjectName: chosen?.name || 'General Revision',
      hours: Math.round(parsedHours * 10) / 10,
    };
    persistStudyLogs([entry, ...studyLogs]);
    setLoggingHours(false);
    setLogHoursInput('1.5');
  };

  const handleUpdateSemesterSgpa = (semesterNum: number, rawVal: string) => {
    const val = Number(rawVal);
    if (!Number.isFinite(val)) return;
    const clamped = Math.min(4.0, Math.max(0, Math.round(val * 100) / 100));
    const next = gradeHistory.map((item) =>
      item.semester === semesterNum ? { ...item, sgpa: clamped } : item
    );
    saveGradeHistory(next);
  };

  const handleResetGradeHistory = () => {
    const baseline = DEFAULT_GRADE_HISTORY.filter((e) => e.semester <= Math.max(currentSem, 5));
    saveGradeHistory(baseline);
  };

  // Derived Historical Grade Data (with running weighted CGPA)
  const semesterChartData = useMemo(() => {
    let cumulativeWeighted = 0;
    let cumulativeCredits = 0;
    return gradeHistory.map((item) => {
      cumulativeWeighted += item.sgpa * item.credits;
      cumulativeCredits += item.credits;
      const cgpa =
        cumulativeCredits > 0 ? Math.round((cumulativeWeighted / cumulativeCredits) * 100) / 100 : item.sgpa;
      return {
        ...item,
        cgpa,
      };
    });
  }, [gradeHistory]);

  // Derived Subject Assessment Grade Trends
  const subjectGradeData = useMemo(() => {
    return activeSubjects.map((sub, idx) => {
      const relatedTasks = studyTasks.filter(
        (t) => t.subjectId === sub.id || t.subjectName.toLowerCase() === sub.name.toLowerCase()
      );
      const taskRatio =
        relatedTasks.length > 0
          ? relatedTasks.filter((t) => t.completed).length / relatedTasks.length
          : 0.72;
      const priorScore = Math.min(96, 74 + ((idx * 5) % 16));
      const currentScore = Math.min(98, Math.round(76 + taskRatio * 20));
      const gradeLetter =
        currentScore >= 90
          ? 'A+'
          : currentScore >= 85
          ? 'A'
          : currentScore >= 80
          ? 'A-'
          : currentScore >= 75
          ? 'B+'
          : 'B';
      return {
        code: sub.code,
        name: sub.name,
        priorScore,
        currentScore,
        gradeLetter,
      };
    });
  }, [activeSubjects, studyTasks]);

  const gradeStats = useMemo(() => {
    if (semesterChartData.length === 0) {
      return { latestSgpa: 0, latestCgpa: 0, delta: 0, peakLabel: '—', peakSgpa: 0 };
    }
    const latest = semesterChartData[semesterChartData.length - 1];
    const prev = semesterChartData.length > 1 ? semesterChartData[semesterChartData.length - 2] : latest;
    const delta = Math.round((latest.sgpa - prev.sgpa) * 100) / 100;
    const peak = semesterChartData.reduce((best, cur) => (cur.sgpa > best.sgpa ? cur : best), semesterChartData[0]);
    return {
      latestSgpa: latest.sgpa,
      latestCgpa: latest.cgpa,
      delta,
      peakLabel: peak.label,
      peakSgpa: peak.sgpa,
    };
  }, [semesterChartData]);

  // Live Study Room minutes contributed by this student
  const liveStudyRoomHours = useMemo(() => {
    const mine = studyContributors.find((c) => c.uid === uid);
    return mine ? Math.round((mine.totalMinutes / 60) * 10) / 10 : 0;
  }, [studyContributors, uid]);

  interface StudyChartPoint {
    label: string;
    hours: number;
    target: number;
    date?: string;
    topSubject?: string;
    focus?: string;
  }

  // Derived 7-Day Daily Study Hour Data
  const dailyStudyData = useMemo<StudyChartPoint[]>(() => {
    const dailyGoal = Math.round((weeklyTargetHours / 7) * 10) / 10;
    const todayIso = toIsoDateOffset(0);
    const result: StudyChartPoint[] = [];

    for (let offset = 6; offset >= 0; offset--) {
      const iso = toIsoDateOffset(offset);
      const d = new Date(`${iso}T12:00:00`);
      const dayLabel = d.toLocaleDateString('en-US', { weekday: 'short' });
      const logsForDay = studyLogs.filter((l) => l.date === iso);
      const sumHours = logsForDay.reduce((acc, l) => acc + l.hours, 0) + (iso === todayIso ? liveStudyRoomHours : 0);

      const subjectTotals: Record<string, number> = {};
      logsForDay.forEach((l) => {
        subjectTotals[l.subjectCode] = (subjectTotals[l.subjectCode] || 0) + l.hours;
      });
      const topSubject =
        Object.entries(subjectTotals).sort((a, b) => b[1] - a[1])[0]?.[0] ||
        (iso === todayIso && liveStudyRoomHours > 0 ? 'Study Room' : 'Self Study');

      result.push({
        label: offset === 0 ? `${dayLabel} (Today)` : dayLabel,
        date: iso,
        hours: Math.round(sumHours * 10) / 10,
        target: dailyGoal,
        topSubject,
      });
    }
    return result;
  }, [studyLogs, weeklyTargetHours, liveStudyRoomHours]);

  // Derived 8-Week Study Hour Trend (Wk 1..7 history + live current Wk 8)
  const weeklyStudyData = useMemo<StudyChartPoint[]>(() => {
    const currentWeekHours = dailyStudyData.reduce((acc, d) => acc + d.hours, 0);
    return [
      ...WEEKLY_TREND_TEMPLATES,
      {
        label: 'This Wk',
        hours: Math.round(currentWeekHours * 10) / 10,
        target: weeklyTargetHours,
        focus: 'Current Week Logged Sessions',
      },
    ];
  }, [dailyStudyData, weeklyTargetHours]);

  const activeStudyData: StudyChartPoint[] =
    studyRange === 'daily' ? dailyStudyData : weeklyStudyData;

  const studyStats = useMemo(() => {
    const activeData = studyRange === 'daily' ? dailyStudyData : weeklyStudyData;
    const totalHours = Math.round(activeData.reduce((acc, d) => acc + d.hours, 0) * 10) / 10;
    const avgHours = activeData.length > 0 ? Math.round((totalHours / activeData.length) * 10) / 10 : 0;
    const targetSum =
      studyRange === 'daily'
        ? weeklyTargetHours
        : activeData.reduce((acc, d) => acc + d.target, 0);
    const attainmentPct = targetSum > 0 ? Math.round((totalHours / targetSum) * 100) : 0;
    return { totalHours, avgHours, attainmentPct, targetSum };
  }, [studyRange, dailyStudyData, weeklyStudyData, weeklyTargetHours]);

  return (
    <section
      aria-label="Academic Performance and Study Progress Analytics"
      className="grid grid-cols-1 xl:grid-cols-12 gap-6"
    >
      {/* Left Card: Historical Grade Trends */}
      <div className="xl:col-span-6 cc-card p-4 sm:p-6 flex flex-col min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 pb-4 border-b border-slate-100 dark:border-white/[0.06]">
          <div className="min-w-0">
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-[var(--cc-accent)] shrink-0" />
              Historical Grade Trends
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {gradeMode === 'semester'
                ? 'Term SGPA vs Cumulative CGPA progression across semesters'
                : 'Course assessment progression from earlier quiz to current standing'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="flex items-center gap-1 cc-segmented">
              <button
                type="button"
                onClick={() => setGradeMode('semester')}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                  gradeMode === 'semester'
                    ? 'bg-white dark:bg-[#0B1018] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                By Semester
              </button>
              <button
                type="button"
                onClick={() => setGradeMode('subject')}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                  gradeMode === 'subject'
                    ? 'bg-white dark:bg-[#0B1018] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                By Subject
              </button>
            </div>

            {gradeMode === 'semester' && (
              <button
                type="button"
                onClick={() => setEditingGrades((prev) => !prev)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg cc-btn-secondary text-xs font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap"
              >
                {editingGrades ? <X className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5 text-[var(--cc-accent)]" />}
                {editingGrades ? 'Done' : 'Edit GPA'}
              </button>
            )}
          </div>
        </div>

        {/* Inline Key Metrics Strip */}
        <div className="py-3.5 grid grid-cols-3 gap-3 border-b border-slate-100 dark:border-white/[0.06]">
          <div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Latest SGPA</p>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="font-mono text-lg font-bold text-slate-900 dark:text-white tabular-nums">
                {gradeStats.latestSgpa.toFixed(2)}
              </span>
              <span
                className={`inline-flex items-center text-[11px] font-mono font-medium tabular-nums ${
                  gradeStats.delta >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-amber-600 dark:text-amber-400'
                }`}
              >
                {gradeStats.delta >= 0 ? (
                  <ArrowUpRight className="w-3 h-3" />
                ) : (
                  <ArrowDownRight className="w-3 h-3" />
                )}
                {gradeStats.delta >= 0 ? `+${gradeStats.delta.toFixed(2)}` : gradeStats.delta.toFixed(2)}
              </span>
            </div>
          </div>

          <div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Cumulative CGPA</p>
            <p className="font-mono text-lg font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">
              {gradeStats.latestCgpa.toFixed(2)}
              <span className="text-[11px] font-normal text-slate-400 ml-1">/ 4.0</span>
            </p>
          </div>

          <div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Peak Term</p>
            <p className="font-mono text-sm sm:text-base font-semibold text-slate-900 dark:text-white tabular-nums mt-1 truncate">
              {gradeStats.peakLabel} · {gradeStats.peakSgpa.toFixed(2)}
            </p>
          </div>
        </div>

        {/* Inline Semester SGPA Editor */}
        {editingGrades && gradeMode === 'semester' && (
          <div className="mt-3 p-3.5 cc-inset space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
                Adjust Semester SGPA (0.00 – 4.00)
              </span>
              <button
                type="button"
                onClick={handleResetGradeHistory}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                <RotateCcw className="w-3 h-3" />
                Reset
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {gradeHistory.map((item) => (
                <label key={item.semester} className="space-y-1 text-[11px]">
                  <span className="block text-slate-500 dark:text-slate-400 font-medium">
                    {item.label}
                  </span>
                  <input
                    type="number"
                    min="0"
                    max="4"
                    step="0.01"
                    value={item.sgpa}
                    onChange={(e) => handleUpdateSemesterSgpa(item.semester, e.target.value)}
                    className="w-full cc-input px-2.5 py-1.5 text-xs font-mono tabular-nums text-slate-900 dark:text-white"
                  />
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Recharts Visualization */}
        <div className="mt-4 h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            {gradeMode === 'semester' ? (
              <ComposedChart
                data={semesterChartData}
                margin={{ top: 10, right: 12, left: -18, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="dashSgpaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--cc-accent)" stopOpacity={0.34} />
                    <stop offset="95%" stopColor="var(--cc-accent)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#94a3b8" tickLine={false} />
                <YAxis
                  domain={[2.8, 4.0]}
                  ticks={[2.8, 3.2, 3.6, 4.0]}
                  tick={{ fontSize: 11 }}
                  stroke="#94a3b8"
                  tickLine={false}
                />
                <ReferenceLine
                  y={3.75}
                  stroke="#f59e0b"
                  strokeDasharray="4 4"
                  label={{
                    value: 'Honors 3.75',
                    position: 'insideTopRight',
                    fill: '#f59e0b',
                    fontSize: 10,
                  }}
                />
                <Tooltip content={<ChartTooltip mode="semester" />} />
                <Legend
                  verticalAlign="top"
                  align="right"
                  iconType="circle"
                  wrapperStyle={{ fontSize: '11px', paddingBottom: '6px' }}
                />
                <Area
                  type="monotone"
                  dataKey="sgpa"
                  name="Term SGPA"
                  stroke="var(--cc-accent)"
                  strokeWidth={2.5}
                  fill="url(#dashSgpaGrad)"
                  dot={{ r: 3.5, fill: 'var(--cc-accent)' }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="cgpa"
                  name="Cumulative CGPA"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#10b981' }}
                />
              </ComposedChart>
            ) : (
              <BarChart
                data={subjectGradeData}
                margin={{ top: 10, right: 12, left: -18, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" vertical={false} />
                <XAxis dataKey="code" tick={{ fontSize: 11 }} stroke="#94a3b8" tickLine={false} />
                <YAxis domain={[50, 100]} unit="%" tick={{ fontSize: 11 }} stroke="#94a3b8" tickLine={false} />
                <Tooltip content={<ChartTooltip mode="subject" />} />
                <Legend
                  verticalAlign="top"
                  align="right"
                  iconType="circle"
                  wrapperStyle={{ fontSize: '11px', paddingBottom: '6px' }}
                />
                <Bar
                  dataKey="priorScore"
                  name="Midterm Baseline"
                  fill="#94a3b8"
                  radius={[5, 5, 0, 0]}
                  maxBarSize={24}
                />
                <Bar
                  dataKey="currentScore"
                  name="Projected Final"
                  fill="var(--cc-accent)"
                  radius={[5, 5, 0, 0]}
                  maxBarSize={24}
                />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>

      {/* Right Card: Study Hour Progress */}
      <div className="xl:col-span-6 cc-card p-4 sm:p-6 flex flex-col min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 pb-4 border-b border-slate-100 dark:border-white/[0.06]">
          <div className="min-w-0">
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-[var(--cc-accent)] shrink-0" />
              Study Hour Progress
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {studyRange === 'daily'
                ? 'Focused study hours logged over the past 7 days vs daily target'
                : 'Weekly study volume progression across the active semester'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="flex items-center gap-1 cc-segmented">
              <button
                type="button"
                onClick={() => setStudyRange('daily')}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                  studyRange === 'daily'
                    ? 'bg-white dark:bg-[#0B1018] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Last 7 Days
              </button>
              <button
                type="button"
                onClick={() => setStudyRange('weekly')}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                  studyRange === 'weekly'
                    ? 'bg-white dark:bg-[#0B1018] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                8 Weeks
              </button>
            </div>

            <button
              type="button"
              onClick={() => setLoggingHours((prev) => !prev)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg cc-btn-primary text-xs font-medium whitespace-nowrap"
            >
              {loggingHours ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              {loggingHours ? 'Close' : 'Log Hours'}
            </button>
          </div>
        </div>

        {/* Inline Key Metrics Strip */}
        <div className="py-3.5 grid grid-cols-3 gap-3 border-b border-slate-100 dark:border-white/[0.06]">
          <div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {studyRange === 'daily' ? '7-Day Total' : '8-Week Total'}
            </p>
            <p className="font-mono text-lg font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">
              {studyStats.totalHours.toFixed(1)}
              <span className="text-[11px] font-normal text-slate-400 ml-1">hrs</span>
            </p>
          </div>

          <div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {studyRange === 'daily' ? 'Daily Average' : 'Weekly Average'}
            </p>
            <p className="font-mono text-lg font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">
              {studyStats.avgHours.toFixed(1)}
              <span className="text-[11px] font-normal text-slate-400 ml-1">
                {studyRange === 'daily' ? 'hrs/d' : 'hrs/wk'}
              </span>
            </p>
          </div>

          <div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Goal Attainment</p>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span
                className={`font-mono text-lg font-bold tabular-nums ${
                  studyStats.attainmentPct >= 100
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : studyStats.attainmentPct >= 80
                    ? 'text-slate-900 dark:text-white'
                    : 'text-amber-600 dark:text-amber-400'
                }`}
              >
                {studyStats.attainmentPct}%
              </span>
              <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                / {studyStats.targetSum}h
              </span>
            </div>
          </div>
        </div>

        {/* Inline Log Study Hours Form */}
        {loggingHours && (
          <form onSubmit={handleAddStudySession} className="mt-3 p-3.5 cc-inset space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-[var(--cc-accent)]" />
                Log Study Session
              </span>
              <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                Weekly Goal (hrs):
                <input
                  type="number"
                  min="5"
                  max="70"
                  step="1"
                  value={weeklyTargetHours}
                  onChange={(e) => setWeeklyTargetHours(Math.max(5, Math.min(70, Number(e.target.value) || 25)))}
                  className="w-14 cc-input px-2 py-1 text-xs font-mono tabular-nums text-slate-900 dark:text-white"
                />
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <select
                value={logSubjectId}
                onChange={(e) => setLogSubjectId(e.target.value)}
                aria-label="Course subject"
                className="sm:col-span-5 cc-input px-2.5 py-2 text-xs text-slate-900 dark:text-white"
              >
                {activeSubjects.map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {sub.code} · {sub.name}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={logDateInput}
                onChange={(e) => setLogDateInput(e.target.value)}
                aria-label="Study session date"
                className="sm:col-span-4 cc-input px-2.5 py-2 text-xs font-mono text-slate-900 dark:text-white"
              />
              <input
                type="number"
                min="0.5"
                max="16"
                step="0.5"
                value={logHoursInput}
                onChange={(e) => setLogHoursInput(e.target.value)}
                placeholder="Hrs"
                aria-label="Study hours"
                className="sm:col-span-3 cc-input px-2.5 py-2 text-xs font-mono tabular-nums text-slate-900 dark:text-white"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setLoggingHours(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-white/[0.06]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3.5 py-1.5 rounded-lg cc-btn-primary text-xs font-semibold"
              >
                Save Session
              </button>
            </div>
          </form>
        )}

        {/* Recharts Visualization */}
        <div className="mt-4 h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={activeStudyData}
              margin={{ top: 10, right: 12, left: -18, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#94a3b8" tickLine={false} />
              <YAxis unit="h" tick={{ fontSize: 11 }} stroke="#94a3b8" tickLine={false} />
              <Tooltip content={<ChartTooltip mode={studyRange} />} />
              <Legend
                verticalAlign="top"
                align="right"
                iconType="circle"
                wrapperStyle={{ fontSize: '11px', paddingBottom: '6px' }}
              />
              <Bar
                dataKey="hours"
                name="Logged Hours"
                fill="var(--cc-accent)"
                radius={[6, 6, 0, 0]}
                maxBarSize={32}
              />
              <Line
                type="monotone"
                dataKey="target"
                name="Study Goal"
                stroke="#10b981"
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
};
