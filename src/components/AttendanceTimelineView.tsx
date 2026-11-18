import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownUp,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  MinusCircle,
  Plus,
  QrCode,
  Search,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { useCampus } from '../context/CampusContext';
import type { AttendanceLog } from '../types/campus';

type StatusFilter = 'all' | 'present' | 'late' | 'absent';
type EntryTypeFilter = 'all' | 'course' | 'event';

interface EnrichedTimelineEntry {
  log: AttendanceLog;
  kind: 'course' | 'event';
  subjectCode: string;
  isQrVerified: boolean;
  cleanNote: string;
  studentName?: string;
}

function isEventEntry(log: AttendanceLog): boolean {
  return (
    log.subjectId.startsWith('evt_') ||
    log.note.toLowerCase().includes('qr event check-in') ||
    log.note.toLowerCase().includes('campus event')
  );
}

function formatReadableDate(isoDate: string): {
  weekday: string;
  fullDate: string;
  relativeLabel: string | null;
} {
  if (!isoDate) {
    return { weekday: 'Unknown Date', fullDate: '—', relativeLabel: null };
  }
  const parsed = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return { weekday: 'Recorded Date', fullDate: isoDate, relativeLabel: null };
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  let relativeLabel: string | null = null;
  if (isoDate === todayStr) relativeLabel = 'Today';
  else if (isoDate === yesterday) relativeLabel = 'Yesterday';

  const weekday = parsed.toLocaleDateString('en-US', { weekday: 'long' });
  const fullDate = parsed.toLocaleDateString('en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  return { weekday, fullDate, relativeLabel };
}

function getStatusMeta(status: AttendanceLog['status']) {
  switch (status) {
    case 'present':
      return {
        label: 'Present',
        textClass: 'text-emerald-700 dark:text-emerald-400',
        nodeClass:
          'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800/70 text-emerald-600 dark:text-emerald-400',
        Icon: CheckCircle2,
      };
    case 'late':
      return {
        label: 'Late',
        textClass: 'text-amber-700 dark:text-amber-400',
        nodeClass:
          'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800/70 text-amber-600 dark:text-amber-400',
        Icon: Clock,
      };
    case 'absent':
      return {
        label: 'Absent',
        textClass: 'text-red-700 dark:text-red-400',
        nodeClass:
          'bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-800/70 text-red-600 dark:text-red-400',
        Icon: XCircle,
      };
    default:
      return {
        label: 'Cancelled',
        textClass: 'text-slate-600 dark:text-slate-400',
        nodeClass:
          'bg-slate-100 dark:bg-white/[0.06] border-slate-200 dark:border-white/[0.12] text-slate-500 dark:text-slate-400',
        Icon: MinusCircle,
      };
  }
}

export const AttendanceTimelineView: React.FC = () => {
  const {
    profile,
    activeRoleView,
    subjects,
    attendanceLogs,
    studentRoster,
    setActiveView,
    openQrScanner,
    logAttendanceTimelineEntry,
    removeAttendanceLogItem,
  } = useCampus();

  const isStaffView = activeRoleView === 'faculty' || activeRoleView === 'admin';

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [entryTypeFilter, setEntryTypeFilter] = useState<EntryTypeFilter>('all');
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [recordScopeFilter, setRecordScopeFilter] = useState<'all' | 'personal' | 'official'>('all');
  const [studentFilterUid, setStudentFilterUid] = useState<string>('mine');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  // Log New Entry Modal state
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [entryKind, setEntryKind] = useState<'course' | 'event'>('course');
  const [entrySubjectId, setEntrySubjectId] = useState<string>(subjects[0]?.id || '');
  const [entryEventTitle, setEntryEventTitle] = useState('');
  const [entryDate, setEntryDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [entryStatus, setEntryStatus] = useState<'present' | 'late' | 'absent'>('present');
  const [entryNote, setEntryNote] = useState('');
  const [updateSubjectTotals, setUpdateSubjectTotals] = useState(true);
  const [savingEntry, setSavingEntry] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!entrySubjectId && subjects.length > 0) {
      setEntrySubjectId(subjects[0].id);
    }
  }, [entrySubjectId, subjects]);

  useEffect(() => {
    if (!logModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLogModalOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [logModalOpen]);

  // Scoped logs by user role
  const scopedLogs = useMemo(() => {
    if (!profile) return [];
    if (!isStaffView) {
      return attendanceLogs.filter((l) => l.studentUid === profile.uid);
    }
    if (studentFilterUid === 'mine') {
      return attendanceLogs.filter((l) => l.studentUid === profile.uid);
    }
    if (studentFilterUid === 'all') {
      return attendanceLogs;
    }
    return attendanceLogs.filter((l) => l.studentUid === studentFilterUid);
  }, [attendanceLogs, profile, isStaffView, studentFilterUid]);

  const enrichedEntries = useMemo<EnrichedTimelineEntry[]>(() => {
    const subMap = new Map(subjects.map((s) => [s.id, s]));
    const rosterMap = new Map(studentRoster.map((s) => [s.uid, s.displayName]));

    return scopedLogs.map((log) => {
      const matchedSub = subMap.get(log.subjectId);
      const isQrVerified = /\[qr:[^\]]+\]/i.test(log.note) || log.note.toLowerCase().includes('qr ');
      const cleanNote = log.note.replace(/\s*\[qr:[^\]]+\]/g, '').trim();
      const kind: 'course' | 'event' = isEventEntry(log) ? 'event' : 'course';

      return {
        log,
        kind,
        subjectCode: matchedSub?.code || (kind === 'event' ? 'EVENT' : 'COURSE'),
        isQrVerified,
        cleanNote,
        studentName:
          log.studentUid === profile?.uid
            ? profile.displayName
            : rosterMap.get(log.studentUid),
      };
    });
  }, [scopedLogs, subjects, studentRoster, profile?.uid, profile?.displayName]);

  const summaryStats = useMemo(() => {
    const total = enrichedEntries.length;
    const present = enrichedEntries.filter((e) => e.log.status === 'present').length;
    const late = enrichedEntries.filter((e) => e.log.status === 'late').length;
    const absent = enrichedEntries.filter((e) => e.log.status === 'absent').length;
    const courseCount = enrichedEntries.filter((e) => e.kind === 'course').length;
    const eventCount = enrichedEntries.filter((e) => e.kind === 'event').length;
    const attendedRate = total > 0 ? Math.round(((present + late) / total) * 100) : 0;
    return { total, present, late, absent, courseCount, eventCount, attendedRate };
  }, [enrichedEntries]);

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const matches = enrichedEntries.filter((entry) => {
      if (statusFilter !== 'all' && entry.log.status !== statusFilter) return false;
      if (entryTypeFilter !== 'all' && entry.kind !== entryTypeFilter) return false;
      if (recordScopeFilter !== 'all' && entry.log.recordType !== recordScopeFilter) return false;
      if (subjectFilter !== 'all' && entry.log.subjectId !== subjectFilter) return false;

      if (q) {
        const haystack = [
          entry.log.subjectName,
          entry.subjectCode,
          entry.cleanNote,
          entry.log.date,
          entry.log.status,
          entry.studentName || '',
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });

    return [...matches].sort((a, b) => {
      const cmp = a.log.date.localeCompare(b.log.date);
      if (cmp !== 0) return sortOrder === 'desc' ? -cmp : cmp;
      return sortOrder === 'desc'
        ? b.log.id.localeCompare(a.log.id)
        : a.log.id.localeCompare(b.log.id);
    });
  }, [
    enrichedEntries,
    searchQuery,
    statusFilter,
    entryTypeFilter,
    recordScopeFilter,
    subjectFilter,
    sortOrder,
  ]);

  const groupedByDate = useMemo(() => {
    const groups: Array<{
      date: string;
      dateMeta: ReturnType<typeof formatReadableDate>;
      items: EnrichedTimelineEntry[];
    }> = [];

    for (const item of filteredEntries) {
      const dateKey = item.log.date || 'Unscheduled';
      const last = groups[groups.length - 1];
      if (last && last.date === dateKey) {
        last.items.push(item);
      } else {
        groups.push({
          date: dateKey,
          dateMeta: formatReadableDate(dateKey),
          items: [item],
        });
      }
    }
    return groups;
  }, [filteredEntries]);

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    statusFilter !== 'all' ||
    entryTypeFilter !== 'all' ||
    subjectFilter !== 'all' ||
    recordScopeFilter !== 'all';

  const resetFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setEntryTypeFilter('all');
    setSubjectFilter('all');
    setRecordScopeFilter('all');
  };

  const handleLogEntrySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    const selectedSubject = subjects.find((s) => s.id === entrySubjectId);
    const title =
      entryKind === 'course'
        ? selectedSubject?.name || 'Course Session'
        : entryEventTitle.trim();

    if (!title) return;

    setSavingEntry(true);
    try {
      const targetStudentUid =
        isStaffView && studentFilterUid !== 'mine' && studentFilterUid !== 'all'
          ? studentFilterUid
          : profile.uid;
      const rosterStudent = studentRoster.find((s) => s.uid === targetStudentUid);

      await logAttendanceTimelineEntry({
        kind: entryKind,
        subjectId: entryKind === 'course' ? selectedSubject?.id : undefined,
        title,
        date: entryDate,
        status: entryStatus,
        note: entryNote,
        recordType:
          isStaffView && targetStudentUid !== profile.uid ? 'official' : 'personal',
        studentUid: targetStudentUid,
        studentName: rosterStudent?.displayName || profile.displayName,
        updateSubjectTotals: entryKind === 'course' ? updateSubjectTotals : false,
      });

      setEntryEventTitle('');
      setEntryNote('');
      setLogModalOpen(false);
    } finally {
      setSavingEntry(false);
    }
  };

  const handleDeleteLog = async (log: AttendanceLog) => {
    setDeletingId(log.id);
    try {
      await removeAttendanceLogItem(log.id);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <section className="relative overflow-hidden cc-card p-4 sm:p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="absolute inset-0 cc-grid-pattern opacity-40 pointer-events-none" aria-hidden="true" />
        <div className="relative z-10 min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-medium text-slate-900 dark:text-white">
              {profile?.displayName || 'Student'}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {summaryStats.courseCount} courses · {summaryStats.eventCount} events
            </span>
          </div>
          <h2 className="font-display text-xl sm:text-2xl font-semibold tracking-tight text-slate-900 dark:text-white text-balance">
            Attendance History Timeline
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-2xl">
            Chronological log of lecture attendance, late check-ins, absences, and campus events.
          </p>
        </div>

        <div className="relative z-10 flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setLogModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl cc-btn-primary text-xs font-semibold whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            Log Entry
          </button>
          <button
            type="button"
            onClick={openQrScanner}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl cc-btn-secondary text-xs font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap shrink-0"
          >
            <QrCode className="w-3.5 h-3.5 text-[var(--cc-accent)]" />
            Scan QR Check-In
          </button>
          <button
            type="button"
            onClick={() => setActiveView('attendance')}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl cc-btn-secondary text-xs font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap shrink-0"
          >
            <ClipboardCheck className="w-3.5 h-3.5" />
            Attendance Tracker
          </button>
        </div>
      </section>

      {/* 4-Column Summary Strip */}
      <section className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <div className="cc-card p-4 sm:p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Logged Sessions</p>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="font-mono text-2xl font-semibold text-slate-900 dark:text-white tabular-nums">
              {summaryStats.total}
            </span>
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
              {summaryStats.attendedRate}% punctual/present
            </span>
          </div>
        </div>

        <div className="cc-card p-4 sm:p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Present</p>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="font-mono text-2xl font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
              {summaryStats.present}
            </span>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" /> On time
            </span>
          </div>
        </div>

        <div className="cc-card p-4 sm:p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Late</p>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="font-mono text-2xl font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
              {summaryStats.late}
            </span>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400">
              <Clock className="w-3.5 h-3.5" /> Tardiness
            </span>
          </div>
        </div>

        <div className="cc-card p-4 sm:p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Absent</p>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="font-mono text-2xl font-semibold text-red-600 dark:text-red-400 tabular-nums">
              {summaryStats.absent}
            </span>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 dark:text-red-400">
              <XCircle className="w-3.5 h-3.5" /> Missed
            </span>
          </div>
        </div>
      </section>

      {/* Filter & Search Toolbar */}
      <section className="cc-card p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Status Filter Segmented Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-1 cc-segmented max-w-full">
              {(
                [
                  { id: 'all', label: 'All Statuses' },
                  { id: 'present', label: 'Present' },
                  { id: 'late', label: 'Late' },
                  { id: 'absent', label: 'Absent' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setStatusFilter(opt.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                    statusFilter === opt.id
                      ? 'bg-white dark:bg-[#0B1018] text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-1 cc-segmented max-w-full">
              {(
                [
                  { id: 'all', label: 'Courses & Events' },
                  { id: 'course', label: 'Courses' },
                  { id: 'event', label: 'Events' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setEntryTypeFilter(opt.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                    entryTypeFilter === opt.id
                      ? 'bg-white dark:bg-[#0B1018] text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl cc-btn-secondary text-xs font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap shrink-0"
            >
              <ArrowDownUp className="w-3.5 h-3.5" />
              {sortOrder === 'desc' ? 'Newest First' : 'Oldest First'}
            </button>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="px-3 py-2 text-xs font-medium text-[var(--cc-accent)] hover:underline whitespace-nowrap shrink-0"
              >
                Reset Filters
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative sm:col-span-2 lg:col-span-2">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search course, event name, date, or note..."
              aria-label="Filter attendance timeline"
              className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm cc-input"
            />
          </div>

          <select
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            aria-label="Filter by course"
            className="w-full px-3 py-2 text-xs sm:text-sm cc-input"
          >
            <option value="all">All Courses &amp; Events</option>
            {subjects.map((sub) => (
              <option key={sub.id} value={sub.id}>
                {sub.code} · {sub.name}
              </option>
            ))}
          </select>

          {isStaffView ? (
            <select
              value={studentFilterUid}
              onChange={(e) => setStudentFilterUid(e.target.value)}
              aria-label="Filter by student"
              className="w-full px-3 py-2 text-xs sm:text-sm cc-input"
            >
              <option value="mine">My Attendance Logs</option>
              <option value="all">All Students ({attendanceLogs.length})</option>
              {studentRoster.map((stu) => (
                <option key={stu.uid} value={stu.uid}>
                  {stu.displayName} ({stu.rollNumber})
                </option>
              ))}
            </select>
          ) : (
            <select
              value={recordScopeFilter}
              onChange={(e) => setRecordScopeFilter(e.target.value as 'all' | 'personal' | 'official')}
              aria-label="Filter by record scope"
              className="w-full px-3 py-2 text-xs sm:text-sm cc-input"
            >
              <option value="all">All Record Sources</option>
              <option value="personal">Personal &amp; QR Check-Ins</option>
              <option value="official">Official College Records</option>
            </select>
          )}
        </div>
      </section>

      {/* Main Chronological Timeline */}
      <section className="cc-card p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-100 dark:border-white/[0.06]">
          <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
            Chronological Timeline
          </h3>
          <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
            Showing {filteredEntries.length} of {enrichedEntries.length} entries
          </span>
        </div>

        {enrichedEntries.length === 0 ? (
          <div className="py-12 text-center space-y-3">
            <div className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-slate-400 flex items-center justify-center mx-auto">
              <Calendar className="w-5 h-5" />
            </div>
            <div className="space-y-1 max-w-md mx-auto">
              <p className="text-sm font-medium text-slate-900 dark:text-white">
                No attendance history recorded yet
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Check into a class or campus event with QR, or log your first attendance entry to build your timeline.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setLogModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl cc-btn-primary text-xs font-semibold"
              >
                <Plus className="w-3.5 h-3.5" />
                Log First Entry
              </button>
              <button
                type="button"
                onClick={openQrScanner}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl cc-btn-secondary text-xs font-medium"
              >
                <QrCode className="w-3.5 h-3.5 text-[var(--cc-accent)]" />
                Scan QR Check-In
              </button>
            </div>
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="py-12 text-center space-y-3">
            <p className="text-sm font-medium text-slate-900 dark:text-white">
              No attendance entries match these filters
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Try clearing your search term or selecting all attendance statuses.
            </p>
            <button
              type="button"
              onClick={resetFilters}
              className="px-4 py-2 rounded-xl cc-btn-secondary text-xs font-medium"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="mt-6 space-y-8">
            {groupedByDate.map((group) => (
              <div key={group.date} className="space-y-4">
                {/* Date Group Header */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <h4 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                      {group.dateMeta.weekday}, {group.dateMeta.fullDate}
                    </h4>
                    {group.dateMeta.relativeLabel && (
                      <span className="text-xs font-medium text-[var(--cc-accent)]">
                        · {group.dateMeta.relativeLabel}
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                    {group.date} · {group.items.length} {group.items.length === 1 ? 'entry' : 'entries'}
                  </span>
                </div>

                {/* Vertical Timeline Entries */}
                <div className="relative pl-7 sm:pl-9 space-y-4">
                  <div
                    className="absolute left-[13px] sm:left-[15px] top-2 bottom-2 w-px bg-slate-200 dark:bg-white/[0.1]"
                    aria-hidden="true"
                  />

                  {group.items.map((entry) => {
                    const statusMeta = getStatusMeta(entry.log.status);
                    const StatusIcon = statusMeta.Icon;
                    const canDelete =
                      (entry.log.recordType === 'personal' && entry.log.studentUid === profile?.uid) ||
                      activeRoleView === 'admin';

                    return (
                      <article
                        key={entry.log.id}
                        className="relative pb-4 border-b border-slate-100 dark:border-white/[0.06] last:border-0 last:pb-0"
                      >
                        {/* Timeline Status Node */}
                        <div
                          className={`absolute -left-7 sm:-left-9 top-0.5 w-7 h-7 sm:w-8 sm:h-8 rounded-full border flex items-center justify-center ${statusMeta.nodeClass}`}
                          aria-hidden="true"
                        >
                          <StatusIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 sm:gap-4 min-w-0">
                          <div className="min-w-0 space-y-1">
                            {/* Clean Unboxed Metadata Line */}
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                              <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">
                                {entry.subjectCode}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span>{entry.kind === 'event' ? 'Campus Event' : 'Course Lecture'}</span>
                              <span aria-hidden="true">·</span>
                              <span>
                                {entry.log.recordType === 'official' ? 'Official Record' : 'Personal'}
                              </span>
                              {entry.isQrVerified && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="text-[var(--cc-accent)] font-medium">QR Check-In</span>
                                </>
                              )}
                              {isStaffView && studentFilterUid === 'all' && entry.studentName && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="text-slate-700 dark:text-slate-300 font-medium">
                                    {entry.studentName}
                                  </span>
                                </>
                              )}
                            </div>

                            {/* Course / Event Name */}
                            <h5 className="font-display text-sm sm:text-base font-semibold text-slate-900 dark:text-white break-words">
                              {entry.log.subjectName}
                            </h5>

                            {/* Note & Date */}
                            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed break-words">
                              <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                                {entry.log.date}
                              </span>
                              {entry.cleanNote ? ` · ${entry.cleanNote}` : ''}
                            </p>
                          </div>

                          {/* Explicit Status + Optional Delete Action */}
                          <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-0.5">
                            <span
                              className={`inline-flex items-center gap-1.5 text-xs font-semibold ${statusMeta.textClass}`}
                            >
                              <StatusIcon className="w-3.5 h-3.5" />
                              {statusMeta.label}
                            </span>

                            {canDelete && (
                              <button
                                type="button"
                                disabled={deletingId === entry.log.id}
                                onClick={() => handleDeleteLog(entry.log)}
                                title="Remove timeline entry"
                                aria-label={`Delete attendance entry for ${entry.log.subjectName}`}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-50"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Log Attendance Entry Modal */}
      {logModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 cc-modal-backdrop"
          onClick={() => setLogModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="log-timeline-entry-title"
            className="w-full max-w-lg cc-modal overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-slate-200/80 dark:border-white/[0.08]">
              <div>
                <h3
                  id="log-timeline-entry-title"
                  className="font-display text-base font-semibold text-slate-900 dark:text-white"
                >
                  Log Attendance Entry
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Record a Present, Late, or Absent entry for a course or campus event
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLogModalOpen(false)}
                aria-label="Close modal"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleLogEntrySubmit} className="p-5 space-y-4">
              {/* Entry Kind Toggle */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Session Type
                </label>
                <div className="grid grid-cols-2 gap-1 cc-segmented">
                  <button
                    type="button"
                    onClick={() => setEntryKind('course')}
                    className={`py-2 px-3 text-xs font-medium rounded-lg transition-colors ${
                      entryKind === 'course'
                        ? 'bg-white dark:bg-[#0B1018] text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Course Lecture
                  </button>
                  <button
                    type="button"
                    onClick={() => setEntryKind('event')}
                    className={`py-2 px-3 text-xs font-medium rounded-lg transition-colors ${
                      entryKind === 'event'
                        ? 'bg-white dark:bg-[#0B1018] text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Campus Event
                  </button>
                </div>
              </div>

              {entryKind === 'course' ? (
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Course / Subject
                  </label>
                  <select
                    value={entrySubjectId}
                    onChange={(e) => setEntrySubjectId(e.target.value)}
                    className="w-full px-3 py-2 text-sm cc-input"
                  >
                    {subjects.map((sub) => (
                      <option key={sub.id} value={sub.id}>
                        {sub.code} · {sub.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Event Name
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={140}
                    value={entryEventTitle}
                    onChange={(e) => setEntryEventTitle(e.target.value)}
                    placeholder="e.g., Guest Lecture on Distributed Systems"
                    className="w-full px-3 py-2 text-sm cc-input"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Date
                  </label>
                  <input
                    type="date"
                    required
                    value={entryDate}
                    onChange={(e) => setEntryDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono cc-input tabular-nums"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Attendance Status
                  </label>
                  <div className="grid grid-cols-3 gap-1 cc-segmented">
                    {(
                      [
                        { id: 'present', label: 'Present' },
                        { id: 'late', label: 'Late' },
                        { id: 'absent', label: 'Absent' },
                      ] as const
                    ).map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setEntryStatus(s.id)}
                        className={`py-1.5 px-2 text-xs font-medium rounded-lg transition-colors ${
                          entryStatus === s.id
                            ? 'bg-white dark:bg-[#0B1018] text-slate-900 dark:text-white shadow-xs'
                            : 'text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Note / Venue (optional)
                </label>
                <input
                  type="text"
                  maxLength={200}
                  value={entryNote}
                  onChange={(e) => setEntryNote(e.target.value)}
                  placeholder="e.g., Block A Hall 302 · Arrived 10 min late due to lab"
                  className="w-full px-3 py-2 text-sm cc-input"
                />
              </div>

              {entryKind === 'course' && (
                <label className="flex items-center gap-2.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={updateSubjectTotals}
                    onChange={(e) => setUpdateSubjectTotals(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>
                    Also increment course attendance counter (+1 total{entryStatus !== 'absent' ? ', +1 attended' : ''})
                  </span>
                </label>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => setLogModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-white/[0.1] text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEntry || (entryKind === 'event' && !entryEventTitle.trim())}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl cc-btn-primary text-xs font-semibold disabled:opacity-50"
                >
                  {savingEntry ? 'Saving...' : 'Save to Timeline'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
