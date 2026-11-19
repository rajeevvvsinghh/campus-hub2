import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  BookOpen,
  Bot,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Database,
  FileDown,
  FileText,
  GraduationCap,
  Megaphone,
  Plus,
  QrCode,
  X,
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
import { analyzeAttendance } from '../lib/attendanceMath';
import {
  exportDashboardSummaryPdfReport,
  type DashboardReportResult,
} from '../lib/dashboardPdfReport';
import { SemesterOverview } from './SemesterOverview';
import { PersonalTasksWidget } from './PersonalTasksWidget';
import { AcademicProgressChart } from './AcademicProgressChart';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const DashboardView: React.FC = () => {
  const [dashboardTab, setDashboardTab] = useState<'all' | 'semester' | 'daily'>('all');
  const {
    profile,
    activeRoleView,
    isDemoMode,
    setActiveView,
    departments,
    timetable,
    attendanceRecords,
    attendanceLogs,
    exams,
    studyTasks,
    materials,
    bookmarks,
    announcements,
    platformSettings,
    seedSampleWorkspace,
    openAiWithMaterial,
    openQrScanner,
  } = useCampus();

  const [seeding, setSeeding] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number>(() => {
    const today = new Date().getDay();
    return today === 0 ? 1 : today; // Default Monday if Sunday
  });

  // Dashboard Summary PDF Export state
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [includeCompletedTasks, setIncludeCompletedTasks] = useState(true);
  const [includeExamsInPdf, setIncludeExamsInPdf] = useState(true);
  const [includeLogsInPdf, setIncludeLogsInPdf] = useState(true);
  const [lastExportResult, setLastExportResult] = useState<DashboardReportResult | null>(null);

  const requiredPct = profile?.targetAttendance || platformSettings.defaultRequiredAttendance || 75;

  const myAttendance = useMemo(() => {
    if (!profile) return [];
    return attendanceRecords.filter((r) => r.studentUid === profile.uid);
  }, [attendanceRecords, profile]);

  const overallStats = useMemo(() => {
    const attended = myAttendance.reduce((sum, r) => sum + r.classesAttended, 0);
    const total = myAttendance.reduce((sum, r) => sum + r.totalClasses, 0);
    const analysis = analyzeAttendance(attended, total, requiredPct);
    const shortages = myAttendance.filter(
      (r) => !analyzeAttendance(r.classesAttended, r.totalClasses, requiredPct).isMeetingTarget
    ).length;
    return { attended, total, ...analysis, shortages };
  }, [myAttendance, requiredPct]);

  const todaysClasses = useMemo(() => {
    return timetable
      .filter((slot) => slot.dayOfWeek === selectedDay)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [timetable, selectedDay]);

  const upcomingExams = useMemo(() => {
    return [...exams]
      .sort((a, b) => a.examDate.localeCompare(b.examDate))
      .slice(0, 4);
  }, [exams]);

  const studyProgress = useMemo(() => {
    const total = studyTasks.length;
    const done = studyTasks.filter((t) => t.completed).length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return { total, done, pct };
  }, [studyTasks]);

  const chartData = useMemo(() => {
    return myAttendance.map((rec) => ({
      code: rec.subjectCode,
      percentage: analyzeAttendance(rec.classesAttended, rec.totalClasses, requiredPct).currentPercentage,
      target: requiredPct,
    }));
  }, [myAttendance, requiredPct]);

  const recentMaterials = useMemo(() => {
    if (bookmarks.length === 0) return materials.slice(0, 4);
    const viewedIds = new Set(bookmarks.map((b) => b.materialId));
    const viewed = materials.filter((m) => viewedIds.has(m.id));
    const rest = materials.filter((m) => !viewedIds.has(m.id));
    return [...viewed, ...rest].slice(0, 4);
  }, [materials, bookmarks]);

  const handleSeed = async () => {
    setSeeding(true);
    try {
      await seedSampleWorkspace();
    } finally {
      setSeeding(false);
    }
  };

  const daysUntil = (dateStr: string) => {
    const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (diff < 0) return 'Completed';
    if (diff === 0) return 'Today';
    return `${diff}d left`;
  };

  const myAttendanceLogs = useMemo(() => {
    if (!profile) return [];
    return attendanceLogs.filter((l) => l.studentUid === profile.uid);
  }, [attendanceLogs, profile]);

  useEffect(() => {
    if (!exportModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExportModalOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [exportModalOpen]);

  const handleExportDashboardPdf = () => {
    const deptName =
      departments.find((d) => d.id === profile?.departmentId)?.name ||
      'Department of Computer Science';

    const result = exportDashboardSummaryPdfReport({
      institutionName: platformSettings.institutionName,
      academicYear: platformSettings.academicYear,
      activeSemester: platformSettings.activeSemester,
      isDemoMode,
      student: {
        displayName: profile?.displayName || 'Rajeev Singh',
        rollNumber: profile?.rollNumber || 'N/A',
        departmentName: deptName,
        courseName: profile?.courseName || 'B.Tech Computer Science',
        semester: profile?.semester || platformSettings.activeSemester || 3,
      },
      requiredPercentage: requiredPct,
      attendanceRecords: myAttendance,
      studyTasks,
      exams,
      attendanceLogs: myAttendanceLogs,
      includeCompletedTasks,
      includeExams: includeExamsInPdf,
      includeRecentLogs: includeLogsInPdf,
    });

    setLastExportResult(result);
    setExportModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Tier 1: Focal Hero Banner */}
      <section className="relative overflow-hidden cc-hero-card p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        <div className="absolute inset-0 cc-grid-pattern opacity-40 pointer-events-none" aria-hidden="true" />
        <div className="relative z-10 space-y-2.5">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            <span className="text-slate-900 dark:text-white font-semibold">
              {profile?.courseName || 'B.Tech Computer Science'}
            </span>
            <span aria-hidden="true">·</span>
            <span>Semester {profile?.semester || 3}</span>
            <span aria-hidden="true">·</span>
            <span>{platformSettings.academicYear}</span>
            <span aria-hidden="true">·</span>
            <span className="text-[var(--cc-accent)]">
              {isDemoMode ? 'Sample Workspace' : 'Cloud Sync Active'}
            </span>
          </div>
          <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900 dark:text-white text-balance">
            Welcome back, {profile?.displayName || 'Rajeev Singh'}
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-2xl leading-relaxed">
            {activeRoleView === 'student'
              ? 'Track today’s lectures, monitor attendance thresholds, browse notes and textbooks, and solve course doubts with Gemini AI.'
              : activeRoleView === 'faculty'
              ? 'Manage subject notes, textbooks, and syllabi, publish notices, and update official student attendance records.'
              : 'Oversee departments, subjects, user roles, examination timetables, and institution-wide academic rules.'}
          </p>
        </div>

        <div className="relative z-10 flex flex-wrap items-center gap-2.5 shrink-0">
          {!isDemoMode && myAttendance.length === 0 && studyTasks.length === 0 && (
            <button
              type="button"
              onClick={handleSeed}
              disabled={seeding}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl cc-btn-secondary text-xs font-medium"
            >
              <Database className="w-3.5 h-3.5 text-[var(--cc-accent)]" />
              {seeding ? 'Loading Sample Data...' : 'Load Sample Academic Data'}
            </button>
          )}
          <button
            type="button"
            onClick={() => setActiveView('ai-solver')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl cc-btn-primary text-sm font-medium whitespace-nowrap"
          >
            <Bot className="w-4 h-4" />
            Ask AI Doubt Solver
          </button>
          <button
            type="button"
            onClick={() => setActiveView('materials')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl cc-btn-secondary text-slate-800 dark:text-slate-100 text-sm font-medium whitespace-nowrap"
          >
            <BookOpen className="w-4 h-4 text-[var(--cc-accent)]" />
            Browse Library
          </button>
          <button
            type="button"
            onClick={() => setExportModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl cc-btn-secondary text-slate-800 dark:text-slate-100 text-sm font-medium whitespace-nowrap"
          >
            <FileDown className="w-4 h-4 text-[var(--cc-accent)]" />
            Export Summary PDF
          </button>
        </div>
      </section>

      {lastExportResult && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 text-xs">
          <div className="flex items-center gap-2.5 text-emerald-800 dark:text-emerald-300 min-w-0">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <p className="truncate font-mono tabular-nums">
              <span className="font-sans font-semibold">Downloaded</span>{' '}
              {lastExportResult.fileName} · Ref {lastExportResult.referenceId} ·{' '}
              {lastExportResult.subjectCount} subject(s) · {lastExportResult.taskCount} task(s) ·{' '}
              {lastExportResult.pageCount} page(s)
            </p>
          </div>
          <button
            type="button"
            onClick={() => setLastExportResult(null)}
            aria-label="Dismiss dashboard PDF confirmation"
            className="text-emerald-700 dark:text-emerald-300 hover:opacity-75 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Dashboard View Mode Bar */}
      <section className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 cc-segmented self-start max-w-full">
          <button
            type="button"
            onClick={() => setDashboardTab('all')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
              dashboardTab === 'all'
                ? 'bg-white dark:bg-[#0B1018] text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            All Dashboard
          </button>
          <button
            type="button"
            onClick={() => setDashboardTab('semester')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
              dashboardTab === 'semester'
                ? 'bg-white dark:bg-[#0B1018] text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <GraduationCap className="w-3.5 h-3.5 text-[var(--cc-accent)]" />
            Semester &amp; Credit Weights
          </button>
          <button
            type="button"
            onClick={() => setDashboardTab('daily')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
              dashboardTab === 'daily'
                ? 'bg-white dark:bg-[#0B1018] text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Daily Feed &amp; Schedule
          </button>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400">
          {dashboardTab === 'all'
            ? 'Complete Academic Hub · KPIs, Semester Weights & Schedule'
            : dashboardTab === 'semester'
            ? `Semester ${profile?.semester || 3} · GPA Trajectory & Subject Credit Weights`
            : `${DAY_NAMES[selectedDay]} · Timetable, Attendance & Task Queue`}
        </p>
      </section>

      {/* Tier 2: Unified 4-Column Executive KPI Strip */}
      {dashboardTab !== 'semester' && (
        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <button
            type="button"
            onClick={() => setActiveView('attendance')}
            className="text-left cc-card-hover p-5 flex flex-col justify-between gap-3"
          >
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span className="font-medium">Overall Attendance</span>
              <div className="w-8 h-8 rounded-lg bg-[var(--cc-accent-light)] border border-[var(--cc-accent-subtle)] flex items-center justify-center text-[var(--cc-accent)]">
                <ClipboardCheck className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-[1.75rem] leading-none font-bold text-slate-900 dark:text-white tabular-nums">
                  {overallStats.total > 0 ? `${overallStats.currentPercentage}%` : '—'}
                </span>
                <span
                  className={`text-xs font-medium ${
                    overallStats.total === 0
                      ? 'text-slate-400'
                      : overallStats.isMeetingTarget
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {overallStats.total === 0
                    ? 'No records'
                    : overallStats.isMeetingTarget
                    ? `Target ${requiredPct}% met`
                    : `${overallStats.shortages} Shortage`}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 font-mono tabular-nums">
                {overallStats.attended} / {overallStats.total} classes attended
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setDashboardTab('semester')}
            className="text-left cc-card-hover p-5 flex flex-col justify-between gap-3"
          >
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span className="font-medium">Term Standing &amp; GPA</span>
              <div className="w-8 h-8 rounded-lg bg-[var(--cc-accent-light)] border border-[var(--cc-accent-subtle)] flex items-center justify-center text-[var(--cc-accent)]">
                <GraduationCap className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-[1.75rem] leading-none font-bold text-slate-900 dark:text-white tabular-nums">
                  3.88
                  <span className="text-xs font-normal text-slate-400 ml-1">/ 4.0</span>
                </span>
                <span className="inline-flex items-center gap-0.5 text-xs font-mono font-medium text-emerald-600 dark:text-emerald-400 tabular-nums">
                  <ArrowUpRight className="w-3.5 h-3.5" /> +0.14
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                Dean’s Honor Roll · 14-day study streak
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveView('exam-prep')}
            className="text-left cc-card-hover p-5 flex flex-col justify-between gap-3"
          >
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span className="font-medium">Next Exam &amp; Study Tasks</span>
              <div className="w-8 h-8 rounded-lg bg-[var(--cc-accent-light)] border border-[var(--cc-accent-subtle)] flex items-center justify-center text-[var(--cc-accent)]">
                <CalendarClock className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-[1.75rem] leading-none font-bold text-slate-900 dark:text-white tabular-nums">
                  {upcomingExams[0] ? daysUntil(upcomingExams[0].examDate) : 'None'}
                </span>
                <span className="text-xs font-mono font-medium text-[var(--cc-accent)] tabular-nums">
                  {studyProgress.pct}% tasks done
                </span>
              </div>
              <div className="w-full h-1.5 bg-slate-100 dark:bg-white/[0.08] rounded-full mt-2.5 overflow-hidden">
                <div
                  className="h-full bg-[var(--cc-accent)] rounded-full transition-all duration-300"
                  style={{ width: `${studyProgress.pct}%` }}
                />
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveView('materials')}
            className="text-left cc-card-hover p-5 flex flex-col justify-between gap-3"
          >
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span className="font-medium">Study Material Library</span>
              <div className="w-8 h-8 rounded-lg bg-[var(--cc-accent-light)] border border-[var(--cc-accent-subtle)] flex items-center justify-center text-[var(--cc-accent)]">
                <FileText className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-[1.75rem] leading-none font-bold text-slate-900 dark:text-white tabular-nums">
                  {materials.length}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  {bookmarks.filter((b) => b.isBookmarked).length} bookmarked
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                Notes, textbooks, syllabi, PYQs &amp; slides
              </p>
            </div>
          </button>
        </section>
      )}

      {/* Semester Overview & Credit Weights Section */}
      {(dashboardTab === 'semester' || dashboardTab === 'all') && <SemesterOverview />}

      {/* Tier 3: Main Content Split (Timetable + Attendance Analytics) */}
      {dashboardTab !== 'semester' && (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            {/* Today's Classes & Schedule */}
            <section className="xl:col-span-5 cc-card p-4 sm:p-6 flex flex-col min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-100 dark:border-white/[0.06]">
                <div>
                  <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                    Today’s Classes &amp; Schedule
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {DAY_NAMES[selectedDay]} · Semester {profile?.semester || 3}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1 cc-segmented self-start sm:self-auto max-w-full">
                  {[1, 2, 3, 4, 5].map((dayIdx) => (
                    <button
                      key={dayIdx}
                      type="button"
                      onClick={() => setSelectedDay(dayIdx)}
                      className={`px-2 py-1 text-xs font-medium rounded-md transition-colors ${
                        selectedDay === dayIdx
                          ? 'bg-white dark:bg-[#0B1018] text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {DAY_NAMES[dayIdx].slice(0, 3)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-2 divide-y divide-slate-100 dark:divide-white/[0.06] flex-1">
                {todaysClasses.length === 0 ? (
                  <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                    No scheduled lectures on {DAY_NAMES[selectedDay]}. Use this slot for self-study or revision.
                  </div>
                ) : (
                  todaysClasses.map((slot) => (
                    <div
                      key={slot.id}
                      className="py-3.5 first:pt-2 last:pb-1 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-mono text-[var(--cc-accent)] tabular-nums">
                          {slot.startTime} – {slot.endTime} · {slot.room}
                        </p>
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate mt-0.5">
                          {slot.subjectCode} · {slot.subjectName}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {slot.instructor} · {slot.isDemo ? 'Sample Schedule' : 'Official'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={openQrScanner}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cc-btn-secondary shrink-0"
                        title="Check in with QR camera scanner"
                      >
                        <QrCode className="w-3.5 h-3.5 text-[var(--cc-accent)]" />
                        Scan QR
                      </button>
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* Subject-wise Attendance Overview Chart */}
            <section className="xl:col-span-7 cc-card p-4 sm:p-6 flex flex-col min-w-0">
              <div className="flex items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-white/[0.06]">
                <div>
                  <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                    Subject Attendance Overview
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Current attendance vs {requiredPct}% institution target
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveView('attendance')}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[var(--cc-accent)] hover:underline whitespace-nowrap"
                >
                  Open Tracker <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {chartData.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center py-10 text-center space-y-3">
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    No personal attendance subjects tracked yet.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveView('attendance')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl cc-btn-primary text-xs font-medium"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Subject Attendance
                  </button>
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  <div className="h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" vertical={false} />
                        <XAxis dataKey="code" tick={{ fontSize: 12 }} stroke="#94a3b8" tickLine={false} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} stroke="#94a3b8" tickLine={false} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#0D111A',
                            borderColor: 'rgba(255,255,255,0.12)',
                            borderRadius: '10px',
                            color: '#f8fafc',
                            fontSize: '12px',
                          }}
                        />
                        <Bar dataKey="percentage" name="Attendance %" fill="var(--cc-accent)" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {overallStats.shortages > 0 && (
                    <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>
                          {overallStats.shortages} subject(s) currently below the {requiredPct}% minimum requirement.
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveView('attendance')}
                        className="font-semibold text-amber-900 dark:text-amber-200 hover:underline whitespace-nowrap"
                      >
                        Calculate Recovery
                      </button>
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>

          {/* Recharts Analytics: Historical Grade Trends & Study Hour Progress */}
          <AcademicProgressChart />

          {/* Tier 4: Bottom 3-Column Actionable Feed */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Personal Tasks Widget */}
            <PersonalTasksWidget />

            {/* Recently Uploaded & Viewed Notes */}
            <section className="cc-card p-4 sm:p-6 min-w-0">
              <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 dark:border-white/[0.06]">
                <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                  Recent Study Materials
                </h3>
                <button
                  type="button"
                  onClick={() => setActiveView('materials')}
                  className="text-xs font-medium text-[var(--cc-accent)] hover:underline"
                >
                  View All
                </button>
              </div>
              <div className="mt-3 divide-y divide-slate-100 dark:divide-white/[0.06]">
                {recentMaterials.map((mat) => {
                  const typeText =
                    mat.type === 'books'
                      ? 'Book'
                      : mat.type === 'syllabus'
                      ? 'Syllabus'
                      : mat.type === 'pyq'
                      ? 'PYQ'
                      : mat.type === 'slides'
                      ? 'Slides'
                      : mat.type === 'assignment'
                      ? 'Assignment'
                      : 'Notes';
                  return (
                    <div
                      key={mat.id}
                      className="py-3 first:pt-1 last:pb-1 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                          {mat.title}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                          {mat.subjectName} · {typeText} · {mat.isDemo ? 'Sample' : 'Official'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => openAiWithMaterial(mat)}
                        title="Ask AI Doubt Solver about this material"
                        className="px-2.5 py-1.5 rounded-lg bg-[var(--cc-accent-light)] text-[var(--cc-accent)] hover:bg-[var(--cc-accent)] hover:text-[var(--cc-accent-fg)] text-xs font-medium transition-colors shrink-0"
                      >
                        Ask AI
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Upcoming Exams & Announcements */}
            <section className="cc-card p-4 sm:p-6 space-y-5 min-w-0">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/[0.06]">
                  <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                    Upcoming Exams
                  </h3>
                  <button
                    type="button"
                    onClick={() => setActiveView('exam-prep')}
                    className="text-xs font-medium text-[var(--cc-accent)] hover:underline"
                  >
                    Timetable
                  </button>
                </div>
                <div className="mt-3 divide-y divide-slate-100 dark:divide-white/[0.06]">
                  {upcomingExams.slice(0, 3).map((ex) => (
                    <div key={ex.id} className="flex items-center justify-between text-xs py-2.5 first:pt-1 last:pb-1">
                      <div className="min-w-0 pr-2">
                        <p className="font-medium text-slate-900 dark:text-white truncate">
                          {ex.subjectCode} · {ex.subjectName}
                        </p>
                        <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                          {ex.examDate} · {ex.startTime} · {ex.venue}
                        </p>
                      </div>
                      <span className="font-mono font-semibold text-[var(--cc-accent)] shrink-0 tabular-nums">
                        {daysUntil(ex.examDate)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-white/[0.06]">
                <div className="flex items-center justify-between pb-2.5">
                  <h3 className="font-display text-sm font-semibold flex items-center gap-1.5 text-slate-900 dark:text-white">
                    <Megaphone className="w-3.5 h-3.5 text-[var(--cc-accent)]" />
                    College Announcements
                  </h3>
                  <button
                    type="button"
                    onClick={() => setActiveView('announcements')}
                    className="text-xs font-medium text-[var(--cc-accent)] hover:underline"
                  >
                    All Notices
                  </button>
                </div>
                <div className="space-y-2.5">
                  {announcements.slice(0, 2).map((ann) => (
                    <div key={ann.id} className="text-xs space-y-0.5">
                      <p className="font-medium text-slate-900 dark:text-white line-clamp-1">
                        {ann.title}
                      </p>
                      <p className="text-slate-500 dark:text-slate-400 line-clamp-2">{ann.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>
        </>
      )}

      {/* Export Dashboard Summary PDF Modal */}
      {exportModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 cc-modal-backdrop"
          onClick={() => setExportModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="export-dashboard-pdf-title"
            className="w-full max-w-lg cc-modal overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 px-5 sm:px-6 py-4 sm:py-5 border-b border-slate-200/80 dark:border-white/[0.08]">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-100 dark:border-blue-900/60 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                  <FileDown className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3
                    id="export-dashboard-pdf-title"
                    className="font-display text-base font-semibold text-slate-900 dark:text-white"
                  >
                    Export Student Dashboard Summary
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Downloadable A4 report with attendance stats and upcoming tasks
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setExportModalOpen(false)}
                aria-label="Close modal"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-5 max-h-[75vh] overflow-y-auto">
              {/* Live Snapshot Preview */}
              <div className="p-4 cc-inset space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    Report Snapshot
                  </span>
                  <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                    {platformSettings.academicYear} · Sem {profile?.semester || 3}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Attendance</p>
                    <p className="text-sm font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                      {overallStats.total > 0 ? `${overallStats.currentPercentage}%` : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Courses</p>
                    <p className="text-sm font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                      {myAttendance.length}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Pending Tasks</p>
                    <p className="text-sm font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                      {studyTasks.filter((t) => !t.completed).length}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Exams</p>
                    <p className="text-sm font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                      {upcomingExams.length}
                    </p>
                  </div>
                </div>
              </div>

              {/* Included Sections */}
              <div className="space-y-2.5">
                <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Report Sections
                </p>

                <label className="flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeCompletedTasks}
                    onChange={(e) => setIncludeCompletedTasks(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 accent-[var(--cc-accent)]"
                  />
                  <span>
                    Include completed tasks alongside pending reminders ({studyTasks.length} total tasks)
                  </span>
                </label>

                <label className="flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeExamsInPdf}
                    onChange={(e) => setIncludeExamsInPdf(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 accent-[var(--cc-accent)]"
                  />
                  <span>
                    Include upcoming examination timetable ({exams.length} scheduled)
                  </span>
                </label>

                <label className="flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeLogsInPdf}
                    onChange={(e) => setIncludeLogsInPdf(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 accent-[var(--cc-accent)]"
                  />
                  <span>
                    Include recent attendance timeline logs ({myAttendanceLogs.length} recorded)
                  </span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 px-5 sm:px-6 py-4 border-t border-slate-200/80 dark:border-white/[0.08] bg-slate-50/70 dark:bg-[#141925]">
              <button
                type="button"
                onClick={() => setExportModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-white/[0.1] text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExportDashboardPdf}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl cc-btn-primary text-xs font-semibold"
              >
                <FileDown className="w-3.5 h-3.5" />
                Download Summary PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
