import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FileDown,
  FileText,
  History,
  Minus,
  Plus,
  QrCode,
  ScanLine,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useCampus } from '../context/CampusContext';
import { analyzeAttendance } from '../lib/attendanceMath';
import {
  exportAttendancePdfReport,
  type AttendanceReportResult,
  type AttendanceReportScope,
} from '../lib/attendancePdfReport';
import { QrAttendanceScannerModal } from './QrAttendanceScannerModal';

export const AttendanceTrackerView: React.FC = () => {
  const {
    profile,
    activeRoleView,
    departments,
    subjects,
    attendanceRecords,
    attendanceLogs,
    studentRoster,
    platformSettings,
    saveProfileChanges,
    markAttendanceQuick,
    upsertAttendanceSubject,
    setActiveView,
    qrScannerRequested,
    clearQrScannerRequest,
  } = useCampus();

  const [targetPct, setTargetPct] = useState<number>(
    profile?.targetAttendance || platformSettings.defaultRequiredAttendance || 75
  );
  const [viewMode, setViewMode] = useState<'personal' | 'official'>('personal');

  // QR Scanner & Pass Studio modal state
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrModalInitialTab, setQrModalInitialTab] = useState<'scan' | 'generate'>('scan');
  const [lastQrResult, setLastQrResult] = useState<{
    title: string;
    kind: 'class' | 'event';
    message: string;
    updatedPercentage?: number;
  } | null>(null);

  // PDF Report Export state
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportScope, setExportScope] = useState<AttendanceReportScope>('personal');
  const [exportStudentUid, setExportStudentUid] = useState<string>(profile?.uid || '');
  const [includeLogs, setIncludeLogs] = useState(true);
  const [includeVerificationBlock, setIncludeVerificationBlock] = useState(true);
  const [includeTargetAdvisory, setIncludeTargetAdvisory] = useState(true);
  const [lastExportResult, setLastExportResult] = useState<AttendanceReportResult | null>(null);

  // Target Calculator state
  const [calcConducted, setCalcConducted] = useState<number>(40);
  const [calcAttended, setCalcAttended] = useState<number>(27);
  const [calcRequired, setCalcRequired] = useState<number>(75);

  // Add personal subject form
  const [newSubId, setNewSubId] = useState(subjects[0]?.id || '');
  const [newAttended, setNewAttended] = useState<number>(18);
  const [newTotal, setNewTotal] = useState<number>(22);
  const [addingSubject, setAddingSubject] = useState(false);

  // Faculty official attendance form
  const [offStudentUid, setOffStudentUid] = useState(studentRoster[0]?.uid || profile?.uid || '');
  const [offSubjectId, setOffSubjectId] = useState(subjects[0]?.id || '');
  const [offAttended, setOffAttended] = useState<number>(28);
  const [offTotal, setOffTotal] = useState<number>(32);

  const calcResult = useMemo(
    () => analyzeAttendance(calcAttended, calcConducted, calcRequired),
    [calcAttended, calcConducted, calcRequired]
  );

  const personalRecords = useMemo(() => {
    if (!profile) return [];
    return attendanceRecords.filter(
      (r) => r.studentUid === profile.uid && r.recordType === 'personal'
    );
  }, [attendanceRecords, profile]);

  const officialRecords = useMemo(() => {
    if (!profile) return [];
    if (activeRoleView === 'faculty' || activeRoleView === 'admin') {
      return attendanceRecords.filter((r) => r.recordType === 'official');
    }
    return attendanceRecords.filter(
      (r) => r.studentUid === profile.uid && r.recordType === 'official'
    );
  }, [attendanceRecords, profile, activeRoleView]);

  const displayedRecords = viewMode === 'personal' ? personalRecords : officialRecords;

  const overallSummary = useMemo(() => {
    const attended = displayedRecords.reduce((s, r) => s + r.classesAttended, 0);
    const total = displayedRecords.reduce((s, r) => s + r.totalClasses, 0);
    const missed = Math.max(0, total - attended);
    const analysis = analyzeAttendance(attended, total, targetPct);
    return { attended, total, missed, ...analysis };
  }, [displayedRecords, targetPct]);

  const chartSubjects = useMemo(() => {
    return displayedRecords.map((r) => ({
      code: r.subjectCode,
      percentage: analyzeAttendance(r.classesAttended, r.totalClasses, targetPct).currentPercentage,
    }));
  }, [displayedRecords, targetPct]);

  const monthlyChartData = useMemo(() => {
    const months = ['Aug', 'Sep', 'Oct', 'Nov'];
    const basePct = overallSummary.total > 0 ? overallSummary.currentPercentage : 78;
    return months.map((m, i) => ({
      month: m,
      attendance: Math.min(100, Math.max(40, Math.round(basePct - (3 - i) * 2.5 + (i % 2 === 0 ? 3 : -1)))),
    }));
  }, [overallSummary.currentPercentage, overallSummary.total]);

  const handleSaveTarget = async () => {
    await saveProfileChanges({ targetAttendance: targetPct });
  };

  const handleAddPersonalSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    const sub = subjects.find((s) => s.id === newSubId) || subjects[0];
    if (!sub) return;
    setAddingSubject(true);
    try {
      await upsertAttendanceSubject({
        studentUid: profile.uid,
        studentName: profile.displayName,
        subjectId: sub.id,
        subjectCode: sub.code,
        subjectName: sub.name,
        classesAttended: Math.min(newAttended, newTotal),
        totalClasses: Math.max(1, newTotal),
        recordType: 'personal',
      });
    } finally {
      setAddingSubject(false);
    }
  };

  const handleSaveOfficialRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    const stu = studentRoster.find((s) => s.uid === offStudentUid);
    const sub = subjects.find((s) => s.id === offSubjectId) || subjects[0];
    if (!sub) return;
    await upsertAttendanceSubject({
      studentUid: offStudentUid || profile?.uid || 'student',
      studentName: stu?.displayName || profile?.displayName || 'Student',
      subjectId: sub.id,
      subjectCode: sub.code,
      subjectName: sub.name,
      classesAttended: Math.min(offAttended, offTotal),
      totalClasses: Math.max(1, offTotal),
      recordType: 'official',
    });
  };

  const isStaffView = activeRoleView === 'faculty' || activeRoleView === 'admin';

  const exportPreview = useMemo(() => {
    const resolvedUid =
      isStaffView && exportScope === 'official'
        ? exportStudentUid || studentRoster[0]?.uid || profile?.uid || ''
        : profile?.uid || '';

    const rosterStudent = studentRoster.find((s) => s.uid === resolvedUid);
    const deptId = rosterStudent?.departmentId || profile?.departmentId || '';
    const deptName =
      departments.find((d) => d.id === deptId)?.name || 'Department of Computer Science';

    const studentInfo = {
      displayName: rosterStudent?.displayName || profile?.displayName || 'Student',
      rollNumber: rosterStudent?.rollNumber || profile?.rollNumber || 'N/A',
      email: rosterStudent && resolvedUid !== profile?.uid ? 'On institutional record' : profile?.email || '',
      departmentName: deptName,
      courseName: rosterStudent?.courseName || profile?.courseName || 'B.Tech',
      semester: rosterStudent?.semester || profile?.semester || platformSettings.activeSemester || 1,
    };

    const records = attendanceRecords.filter((r) => {
      if (resolvedUid && r.studentUid !== resolvedUid) return false;
      if (exportScope === 'combined') return true;
      return r.recordType === exportScope;
    });

    const logs = attendanceLogs.filter((l) => {
      if (resolvedUid && l.studentUid !== resolvedUid) return false;
      if (exportScope === 'combined') return true;
      return l.recordType === exportScope;
    });

    const attended = records.reduce((s, r) => s + r.classesAttended, 0);
    const conducted = records.reduce((s, r) => s + r.totalClasses, 0);
    const summary = analyzeAttendance(attended, conducted, targetPct);

    return {
      studentInfo,
      records,
      logs,
      attended,
      conducted,
      summary,
    };
  }, [
    isStaffView,
    exportScope,
    exportStudentUid,
    studentRoster,
    profile,
    departments,
    platformSettings.activeSemester,
    attendanceRecords,
    attendanceLogs,
    targetPct,
  ]);

  useEffect(() => {
    if (!exportModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExportModalOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [exportModalOpen]);

  useEffect(() => {
    if (qrScannerRequested) {
      setQrModalInitialTab('scan');
      setQrModalOpen(true);
      clearQrScannerRequest();
    }
  }, [qrScannerRequested, clearQrScannerRequest]);

  const handleOpenQrModal = (tab: 'scan' | 'generate') => {
    setQrModalInitialTab(tab);
    setQrModalOpen(true);
  };

  const handleOpenExportModal = () => {
    setExportScope(viewMode);
    if (isStaffView && studentRoster.length > 0 && !studentRoster.some((s) => s.uid === exportStudentUid)) {
      setExportStudentUid(studentRoster[0].uid);
    } else if (!exportStudentUid && profile?.uid) {
      setExportStudentUid(profile.uid);
    }
    setExportModalOpen(true);
  };

  const handleGeneratePdf = () => {
    const result = exportAttendancePdfReport({
      institutionName: platformSettings.institutionName,
      academicYear: platformSettings.academicYear,
      activeSemester: platformSettings.activeSemester,
      student: exportPreview.studentInfo,
      scope: exportScope,
      requiredPercentage: targetPct,
      records: exportPreview.records,
      logs: exportPreview.logs,
      includeLogs,
      includeVerificationBlock,
      includeTargetAdvisory,
    });
    setLastExportResult(result);
    setExportModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Top Controls & Threshold Config */}
      <section className="relative overflow-hidden cc-card p-4 sm:p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="absolute inset-0 cc-grid-pattern opacity-40 pointer-events-none" aria-hidden="true" />
        <div className="relative z-10 min-w-0">
          <h2 className="font-display text-xl sm:text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            Smart Attendance Tracker
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Formula: (Classes Attended / Total Classes) × 100 · Configurable Requirement
          </p>
        </div>

        <div className="relative z-10 flex flex-wrap items-center gap-2.5 sm:gap-3 max-w-full">
          <div className="flex flex-wrap items-center gap-1 cc-segmented max-w-full">
            <button
              type="button"
              onClick={() => setViewMode('personal')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                viewMode === 'personal'
                  ? 'bg-white dark:bg-[#0B1018] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Personal Tracking
            </button>
            <button
              type="button"
              onClick={() => setViewMode('official')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                viewMode === 'official'
                  ? 'bg-white dark:bg-[#0B1018] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Official College Records
            </button>
          </div>

          <div className="flex items-center gap-2 cc-inset px-3 py-1.5">
            <label className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
              Required %:
            </label>
            <input
              type="number"
              min={50}
              max={100}
              value={targetPct}
              onChange={(e) => setTargetPct(Math.max(50, Math.min(100, Number(e.target.value) || 75)))}
              className="w-12 text-xs font-mono font-semibold bg-transparent focus:outline-none tabular-nums"
            />
            <button
              type="button"
              onClick={handleSaveTarget}
              className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              Save
            </button>
          </div>

          <button
            type="button"
            onClick={() => handleOpenQrModal('scan')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors shadow-xs"
          >
            <ScanLine className="w-3.5 h-3.5" />
            Scan QR Check-In
          </button>

          {isStaffView && (
            <button
              type="button"
              onClick={() => handleOpenQrModal('generate')}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl cc-btn-secondary text-xs font-semibold text-slate-800 dark:text-slate-100"
            >
              <QrCode className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              Session QR
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveView('attendance-timeline')}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl cc-btn-secondary text-xs font-semibold text-slate-800 dark:text-slate-100"
          >
            <History className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            Timeline
          </button>

          <button
            type="button"
            onClick={handleOpenExportModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white/[0.08] dark:hover:bg-white/[0.12] text-white text-xs font-semibold transition-colors shadow-xs"
          >
            <FileDown className="w-3.5 h-3.5" />
            Export PDF Report
          </button>
        </div>
      </section>

      {lastQrResult && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 text-xs">
          <div className="flex items-center gap-2.5 text-blue-900 dark:text-blue-200 min-w-0">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-blue-600 dark:text-blue-400" />
            <p className="truncate">
              <span className="font-semibold">{lastQrResult.title}</span>{' '}
              <span className="text-blue-800/80 dark:text-blue-200/80">
                · {lastQrResult.kind === 'event' ? 'Event Check-In' : 'Class Check-In'} · {lastQrResult.message}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => setLastQrResult(null)}
            aria-label="Dismiss QR check-in confirmation"
            className="text-blue-700 dark:text-blue-300 hover:opacity-75 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {lastExportResult && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 text-xs">
          <div className="flex items-center gap-2.5 text-emerald-800 dark:text-emerald-300 min-w-0">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <p className="truncate">
              Downloaded <span className="font-mono font-semibold">{lastExportResult.fileName}</span>{' '}
              <span className="text-emerald-700/80 dark:text-emerald-300/80">
                · Ref {lastExportResult.referenceId} · {lastExportResult.subjectCount} subject(s) ·{' '}
                {lastExportResult.pageCount} page(s)
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => setLastExportResult(null)}
            aria-label="Dismiss export confirmation"
            className="text-emerald-700 dark:text-emerald-300 hover:opacity-75 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 4-Column Overall Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="cc-card p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Overall Attendance</p>
          <div className="mt-2.5 flex items-baseline justify-between">
            <span className="font-mono text-2xl font-semibold tabular-nums">
              {overallSummary.total > 0 ? `${overallSummary.currentPercentage}%` : '—'}
            </span>
            <span
              className={`text-xs font-medium ${
                overallSummary.total === 0
                  ? 'text-slate-400'
                  : overallSummary.isMeetingTarget
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              {overallSummary.total > 0 ? overallSummary.statusLabel : 'Empty'}
            </span>
          </div>
        </div>

        <div className="cc-card p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Classes Conducted</p>
          <p className="mt-2.5 font-mono text-2xl font-semibold tabular-nums">{overallSummary.total}</p>
        </div>

        <div className="cc-card p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Classes Attended</p>
          <p className="mt-2.5 font-mono text-2xl font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
            {overallSummary.attended}
          </p>
        </div>

        <div className="cc-card p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Classes Missed</p>
          <p className="mt-2.5 font-mono text-2xl font-semibold text-red-600 dark:text-red-400 tabular-nums">
            {overallSummary.missed}
          </p>
        </div>
      </div>

      {/* Interactive Attendance Target Calculator + Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Attendance Target Calculator */}
        <section className="xl:col-span-5 min-w-0 cc-card p-4 sm:p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Calculator className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <h3 className="font-display text-base font-semibold">Attendance Target Calculator</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                Conducted
              </label>
              <input
                type="number"
                min={0}
                value={calcConducted}
                onChange={(e) => {
                  const val = Math.max(0, Number(e.target.value) || 0);
                  setCalcConducted(val);
                  if (calcAttended > val) setCalcAttended(val);
                }}
                className="w-full px-3 py-2 text-sm font-mono cc-input tabular-nums"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                Attended
              </label>
              <input
                type="number"
                min={0}
                max={calcConducted}
                value={calcAttended}
                onChange={(e) => setCalcAttended(Math.max(0, Math.min(calcConducted, Number(e.target.value) || 0)))}
                className="w-full px-3 py-2 text-sm font-mono cc-input tabular-nums"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                Target %
              </label>
              <input
                type="number"
                min={1}
                max={100}
                value={calcRequired}
                onChange={(e) => setCalcRequired(Math.max(1, Math.min(100, Number(e.target.value) || 75)))}
                className="w-full px-3 py-2 text-sm font-mono cc-input tabular-nums"
              />
            </div>
          </div>

          <div className="p-4 cc-inset space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-400">Current Attendance Percentage</span>
              <span className="font-mono text-base font-semibold tabular-nums">
                {calcResult.currentPercentage}%
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-400">
                Additional Classes Required for {calcRequired}%
              </span>
              <span className="font-mono font-semibold text-blue-600 dark:text-blue-400 tabular-nums">
                {calcResult.classesNeeded === Infinity ? 'Not reachable' : calcResult.classesNeeded}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-400">
                Maximum Missable Classes Above {calcRequired}%
              </span>
              <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {calcResult.maxMissable}
              </span>
            </div>
          </div>
        </section>

        {/* Subject & Monthly Attendance Charts */}
        <section className="xl:col-span-7 min-w-0 cc-card p-4 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="font-display text-sm font-semibold mb-3">Subject-wise Attendance (%)</h3>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartSubjects} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" vertical={false} />
                  <XAxis dataKey="code" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <ReferenceLine y={targetPct} stroke="#dc2626" strokeDasharray="3 3" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0E121B',
                      borderColor: 'rgba(255,255,255,0.1)',
                      borderRadius: '10px',
                      color: '#f8fafc',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="percentage" name="Attendance %" fill="#2563eb" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div>
            <h3 className="font-display text-sm font-semibold mb-3">Monthly Attendance Trend</h3>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyChartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0E121B',
                      borderColor: 'rgba(255,255,255,0.1)',
                      borderRadius: '10px',
                      color: '#f8fafc',
                      fontSize: '12px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="attendance"
                    name="Monthly %"
                    stroke="#2563eb"
                    fill="#2563eb"
                    fillOpacity={0.14}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      </div>

      {/* Subject-wise Records + Quick Log / Add Subject */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <section className="xl:col-span-8 min-w-0 cc-card p-4 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-base font-semibold">
              {viewMode === 'personal' ? 'Subject-wise Personal Tracker' : 'Official College Attendance Records'}
            </h3>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {displayedRecords.length} subjects
            </span>
          </div>

          {displayedRecords.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center">
              {viewMode === 'personal'
                ? 'No personal attendance records yet. Add a subject on the right to begin tracking.'
                : 'No official faculty attendance records published yet.'}
            </p>
          ) : (
            <div className="space-y-3">
              {displayedRecords.map((rec) => {
                const stats = analyzeAttendance(rec.classesAttended, rec.totalClasses, targetPct);
                const canMutate =
                  (viewMode === 'personal' && rec.studentUid === profile?.uid) ||
                  (viewMode === 'official' && (activeRoleView === 'faculty' || activeRoleView === 'admin'));

                return (
                  <div
                    key={rec.id}
                    className="p-4 rounded-xl border border-slate-200/80 dark:border-white/[0.08] bg-slate-50/40 dark:bg-white/[0.02] flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">
                          {rec.subjectCode}
                        </span>
                        <span className="text-slate-400">·</span>
                        <span
                          className={`inline-flex items-center gap-1 font-medium ${
                            stats.statusLabel === 'On Track'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : stats.statusLabel === 'Borderline'
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-red-600 dark:text-red-400'
                          }`}
                        >
                          {stats.statusLabel === 'On Track' ? (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          ) : (
                            <AlertTriangle className="w-3.5 h-3.5" />
                          )}
                          {stats.statusLabel}
                        </span>
                        {viewMode === 'official' && (
                          <>
                            <span className="text-slate-400">·</span>
                            <span className="text-slate-500 dark:text-zinc-400">{rec.studentName}</span>
                          </>
                        )}
                      </div>
                      <h4 className="font-display text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {rec.subjectName}
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-zinc-400">
                        {stats.isMeetingTarget
                          ? `Safe buffer: you can miss up to ${stats.maxMissable} class(es) and stay at ${targetPct}%.`
                          : `Shortage warning: attend next ${stats.classesNeeded} consecutive class(es) to reach ${targetPct}%.`}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center justify-between sm:justify-end gap-3 sm:gap-4 shrink-0">
                      <div className="text-left sm:text-right">
                        <p className="font-mono text-lg font-semibold tabular-nums">
                          {stats.currentPercentage}%
                        </p>
                        <p className="font-mono text-xs text-slate-500 dark:text-zinc-400 tabular-nums">
                          {rec.classesAttended}/{rec.totalClasses}
                        </p>
                      </div>

                      {canMutate && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => markAttendanceQuick(rec, 'present')}
                            title="Mark Present (+1 attended, +1 total)"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium"
                          >
                            <Plus className="w-3.5 h-3.5" /> Present
                          </button>
                          <button
                            type="button"
                            onClick={() => markAttendanceQuick(rec, 'late')}
                            title="Mark Late (+1 attended, +1 total)"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-amber-300 dark:border-amber-800/70 hover:bg-amber-50 dark:hover:bg-amber-950/30 text-amber-700 dark:text-amber-400 text-xs font-medium"
                          >
                            <Clock className="w-3.5 h-3.5" /> Late
                          </button>
                          <button
                            type="button"
                            onClick={() => markAttendanceQuick(rec, 'absent')}
                            title="Mark Absent (+1 total)"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 hover:bg-red-50 dark:hover:bg-red-950/30 text-red-600 text-xs font-medium"
                          >
                            <Minus className="w-3.5 h-3.5" /> Absent
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Manual Entry / Official Faculty Entry + Recent History */}
        <section className="xl:col-span-4 min-w-0 space-y-6">
          {viewMode === 'personal' ? (
            <div className="cc-card p-4 sm:p-6 space-y-4">
              <h3 className="font-display text-base font-semibold flex items-center gap-2">
                <ClipboardCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                Manual Subject Entry
              </h3>
              <form onSubmit={handleAddPersonalSubject} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Subject</label>
                  <select
                    value={newSubId}
                    onChange={(e) => setNewSubId(e.target.value)}
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
                    <label className="block text-xs font-medium mb-1">Attended</label>
                    <input
                      type="number"
                      min={0}
                      max={newTotal}
                      value={newAttended}
                      onChange={(e) => setNewAttended(Math.max(0, Number(e.target.value) || 0))}
                      className="w-full px-3 py-2 text-sm font-mono cc-input"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Total Conducted</label>
                    <input
                      type="number"
                      min={1}
                      value={newTotal}
                      onChange={(e) => setNewTotal(Math.max(1, Number(e.target.value) || 1))}
                      className="w-full px-3 py-2 text-sm font-mono cc-input"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={addingSubject}
                  className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors"
                >
                  {addingSubject ? 'Saving...' : 'Add / Update Subject'}
                </button>
              </form>
            </div>
          ) : (
            (activeRoleView === 'faculty' || activeRoleView === 'admin') && (
              <div className="cc-card p-6 space-y-4">
                <h3 className="font-display text-base font-semibold flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  Record Official Attendance
                </h3>
                <form onSubmit={handleSaveOfficialRecord} className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">Student</label>
                    <select
                      value={offStudentUid}
                      onChange={(e) => setOffStudentUid(e.target.value)}
                      className="w-full px-3 py-2 text-sm cc-input"
                    >
                      {studentRoster.map((st) => (
                        <option key={st.uid} value={st.uid}>
                          {st.rollNumber} · {st.displayName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Subject</label>
                    <select
                      value={offSubjectId}
                      onChange={(e) => setOffSubjectId(e.target.value)}
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
                      <label className="block text-xs font-medium mb-1">Attended</label>
                      <input
                        type="number"
                        min={0}
                        max={offTotal}
                        value={offAttended}
                        onChange={(e) => setOffAttended(Math.max(0, Number(e.target.value) || 0))}
                        className="w-full px-3 py-2 text-sm font-mono cc-input"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Conducted</label>
                      <input
                        type="number"
                        min={1}
                        value={offTotal}
                        onChange={(e) => setOffTotal(Math.max(1, Number(e.target.value) || 1))}
                        className="w-full px-3 py-2 text-sm font-mono cc-input"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors"
                  >
                    Save Official Record
                  </button>
                </form>
              </div>
            )
          )}

          {/* Recent Attendance History */}
          <div className="cc-card p-6 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-sm font-semibold">Attendance History</h3>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setActiveView('attendance-timeline')}
                  className="text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 hover:underline inline-flex items-center gap-1"
                >
                  <History className="w-3 h-3" />
                  Full Timeline
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenQrModal('generate')}
                  className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                >
                  <QrCode className="w-3 h-3" />
                  QR Pass Studio
                </button>
              </div>
            </div>
            {attendanceLogs.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                No attendance logs recorded yet.
              </p>
            ) : (
              <div className="space-y-2.5 max-h-64 overflow-y-auto">
                {attendanceLogs.slice(0, 12).map((log) => {
                  const cleanNote = log.note.replace(/\s*\[qr:[^\]]+\]/g, '').trim();
                  return (
                    <div
                      key={log.id}
                      className="flex items-center justify-between text-xs py-1.5 border-b border-slate-100 dark:border-white/[0.06] last:border-0"
                    >
                      <div className="min-w-0 pr-2">
                        <p className="font-medium text-slate-900 dark:text-white truncate">
                          {log.subjectName}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums truncate">
                          {log.date} · {cleanNote || 'Attendance check-in'}
                        </p>
                      </div>
                      <span
                        className={`font-medium capitalize shrink-0 ${
                          log.status === 'present'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : log.status === 'late'
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {log.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Export Official PDF Report Modal */}
      {exportModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 cc-modal-backdrop"
          onClick={() => setExportModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="export-pdf-modal-title"
            className="w-full max-w-lg cc-modal overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-slate-200/80 dark:border-white/[0.08]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-100 dark:border-blue-900/60 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h3
                    id="export-pdf-modal-title"
                    className="font-display text-base font-semibold text-slate-900 dark:text-white"
                  >
                    Export Attendance PDF Report
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Formatted A4 academic summary for official record-keeping
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
              {/* Record Scope Selector */}
              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Attendance Record Scope
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'official', label: 'Official Records' },
                      { id: 'personal', label: 'Personal Tracker' },
                      { id: 'combined', label: 'Combined' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setExportScope(opt.id)}
                      className={`px-3 py-2 text-xs font-medium rounded-xl border transition-colors ${
                        exportScope === opt.id
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'bg-slate-50 dark:bg-[#141925] border-slate-200/80 dark:border-white/[0.08] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Faculty / Admin Student Selector when exporting Official Records */}
              {isStaffView && exportScope === 'official' && studentRoster.length > 0 && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Select Student Record
                  </label>
                  <select
                    value={exportStudentUid}
                    onChange={(e) => setExportStudentUid(e.target.value)}
                    className="w-full px-3 py-2 text-sm cc-input"
                  >
                    {studentRoster.map((st) => (
                      <option key={st.uid} value={st.uid}>
                        {st.rollNumber} · {st.displayName}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Report Sections Checklist */}
              <div className="space-y-2.5">
                <span className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Included Report Sections
                </span>
                <label className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeTargetAdvisory}
                    onChange={(e) => setIncludeTargetAdvisory(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>
                    <span className="font-medium text-slate-900 dark:text-white">
                      Target Compliance & Projection Notes
                    </span>
                    <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                      Include max missable buffer and classes needed per subject for {targetPct}%
                    </span>
                  </span>
                </label>

                <label className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeLogs}
                    onChange={(e) => setIncludeLogs(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>
                    <span className="font-medium text-slate-900 dark:text-white">
                      Recent Attendance Log History ({exportPreview.logs.length} entries)
                    </span>
                    <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                      Append dated session logs (latest 25 entries) below the subject breakdown
                    </span>
                  </span>
                </label>

                <label className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeVerificationBlock}
                    onChange={(e) => setIncludeVerificationBlock(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>
                    <span className="font-medium text-slate-900 dark:text-white">
                      Official Verification & Signature Block
                    </span>
                    <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                      Include student & faculty advisor sign-off lines and policy declaration
                    </span>
                  </span>
                </label>
              </div>

              {/* Pre-Export Summary Card */}
              <div className="p-4 cc-inset space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    Document Summary
                  </span>
                  <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                    {platformSettings.academicYear} · Sem {exportPreview.studentInfo.semester}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                  <div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Student</p>
                    <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                      {exportPreview.studentInfo.displayName}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Roll No.</p>
                    <p className="text-xs font-mono font-semibold text-slate-900 dark:text-white truncate">
                      {exportPreview.studentInfo.rollNumber}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Subjects</p>
                    <p className="text-xs font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                      {exportPreview.records.length}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Overall %</p>
                    <p
                      className={`text-xs font-mono font-semibold tabular-nums ${
                        exportPreview.conducted === 0
                          ? 'text-slate-400'
                          : exportPreview.summary.isMeetingTarget
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {exportPreview.conducted > 0
                        ? `${exportPreview.summary.currentPercentage}% (${exportPreview.summary.statusLabel})`
                        : 'No records'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 px-6 py-4 border-t border-slate-200/80 dark:border-white/[0.08] bg-slate-50/70 dark:bg-[#141925]">
              <button
                type="button"
                onClick={() => setExportModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-white/[0.1] text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={exportPreview.records.length === 0}
                onClick={handleGeneratePdf}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold transition-colors"
              >
                <FileDown className="w-3.5 h-3.5" />
                Download PDF Report
              </button>
            </div>
          </div>
        </div>
      )}
      {/* QR Camera Check-In & Pass Studio Modal */}
      <QrAttendanceScannerModal
        open={qrModalOpen}
        initialTab={qrModalInitialTab}
        onClose={() => setQrModalOpen(false)}
        onCheckInSuccess={(summary) => setLastQrResult(summary)}
      />
    </div>
  );
};
