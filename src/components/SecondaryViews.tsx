import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Bookmark,
  BookOpen,
  Building2,
  CalendarDays,
  Camera,
  CheckCircle2,
  Database,
  Link2,
  Loader2,
  Lock,
  Megaphone,
  Minus,
  Pin,
  Plus,
  Save,
  Settings,
  Shield,
  Trash2,
  Upload,
  User as UserIcon,
  Users,
  X,
} from 'lucide-react';
import { useCampus } from '../context/CampusContext';
import { ContentManagementSection } from './ContentManagementSection';
import { ProfileCameraModal } from './ProfileCameraModal';
import type { AnnouncementCategory, ExamType, UserRole } from '../types/campus';

/* ============================================================================
   1. ACADEMIC CALENDAR VIEW
============================================================================ */
export const AcademicCalendarView: React.FC = () => {
  const { exams, studyTasks, timetable } = useCampus();
  const [monthCursor, setMonthCursor] = useState(() => new Date('2026-11-01'));

  const cells = useMemo(() => {
    const year = monthCursor.getFullYear();
    const month = monthCursor.getMonth();
    const first = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const items: Array<{ dateStr: string | null; day: number | null }> = [];
    for (let i = 0; i < first; i++) items.push({ dateStr: null, day: null });
    for (let d = 1; d <= totalDays; d++) {
      items.push({
        dateStr: `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        day: d,
      });
    }
    return items;
  }, [monthCursor]);

  const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="space-y-6">
      <div className="cc-card cc-grid-pattern p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-slate-900 dark:text-white">
            Personal Academic Calendar
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Examinations, assignment deadlines, and weekly lecture schedule
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1))
            }
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/[0.1] bg-white/80 dark:bg-[#0B1018] text-xs font-medium hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
          >
            Previous Month
          </button>
          <span className="px-2 sm:px-3 py-1.5 text-xs font-semibold font-display text-slate-900 dark:text-white">
            {monthCursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </span>
          <button
            type="button"
            onClick={() =>
              setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))
            }
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/[0.1] bg-white/80 dark:bg-[#0B1018] text-xs font-medium hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
          >
            Next Month
          </button>
        </div>
      </div>

      <div className="cc-card p-4 sm:p-5">
        <div className="overflow-x-auto pb-1">
          <div className="min-w-[540px] space-y-3">
            <div className="grid grid-cols-7 gap-2 text-center text-xs font-medium text-slate-500 dark:text-slate-400">
              {DAY_SHORT.map((d) => (
                <div key={d} className="py-1">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-2">
              {cells.map((cell, idx) => {
                if (!cell.dateStr) {
                  return <div key={`c_${idx}`} className="min-h-[96px] rounded-xl bg-slate-50/50 dark:bg-[#0B1018]/60" />;
                }
                const dayExams = exams.filter((e) => e.examDate === cell.dateStr);
                const dayTasks = studyTasks.filter((t) => t.dueDate === cell.dateStr);
                const weekday = new Date(cell.dateStr).getDay();
                const daySlots = timetable.filter((s) => s.dayOfWeek === weekday);

                return (
                  <div
                    key={cell.dateStr}
                    className="min-h-[96px] p-2 rounded-xl border border-slate-200/80 dark:border-white/[0.08] bg-white/60 dark:bg-[#0B1018]/50 flex flex-col gap-1 overflow-hidden"
                  >
                    <span className="font-mono text-xs font-semibold tabular-nums text-slate-900 dark:text-white">
                      {cell.day}
                    </span>
                    {dayExams.map((ex) => (
                      <div
                        key={ex.id}
                        className="px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 text-[10px] font-medium truncate"
                      >
                        Exam · {ex.subjectCode}
                      </div>
                    ))}
                    {dayTasks.map((tk) => (
                      <div
                        key={tk.id}
                        className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 text-[10px] truncate"
                      >
                        {tk.title}
                      </div>
                    ))}
                    {daySlots.length > 0 && (
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-auto">
                        {daySlots.length} class{daySlots.length > 1 ? 'es' : ''}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
   2. ANNOUNCEMENTS VIEW
============================================================================ */
export const AnnouncementsView: React.FC = () => {
  const { activeRoleView, announcements, departments, publishAnnouncement, removeAnnouncementItem } =
    useCampus();
  const [filterCat, setFilterCat] = useState<'all' | AnnouncementCategory>('all');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<AnnouncementCategory>('academic');
  const [deptId, setDeptId] = useState(departments[0]?.id || 'dept_cse');
  const [isPinned, setIsPinned] = useState(false);

  const canPublish = activeRoleView === 'faculty' || activeRoleView === 'admin';

  const visible = useMemo(() => {
    const list = announcements.filter((a) => filterCat === 'all' || a.category === filterCat);
    return [...list].sort((a, b) => Number(b.isPinned) - Number(a.isPinned));
  }, [announcements, filterCat]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    await publishAnnouncement({
      title: title.trim(),
      body: body.trim(),
      category,
      departmentId: deptId,
      isPinned,
    });
    setTitle('');
    setBody('');
    setIsPinned(false);
  };

  return (
    <div className="space-y-6">
      <div className="cc-card cc-grid-pattern p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-slate-900 dark:text-white">
            College Announcements
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Official notices, exam circulars, and department updates
          </p>
        </div>

        <div className="cc-segmented flex flex-wrap items-center gap-1 max-w-full">
          {(['all', 'academic', 'exam', 'event', 'urgent'] as const).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setFilterCat(cat)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg capitalize transition-colors ${
                filterCat === cat
                  ? 'bg-white dark:bg-[#0B1018] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {canPublish && (
          <section className="lg:col-span-4 min-w-0 cc-card p-4 sm:p-6 space-y-4 h-fit">
            <h3 className="font-display text-base font-semibold flex items-center gap-2 text-slate-900 dark:text-white">
              <Megaphone className="w-4 h-4 text-blue-600" />
              Publish Notice
            </h3>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1">Headline</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Announcement headline"
                  className="cc-input w-full px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as AnnouncementCategory)}
                    className="cc-input w-full px-3 py-2 text-sm"
                  >
                    <option value="academic">Academic</option>
                    <option value="exam">Exam</option>
                    <option value="event">Event</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Department</label>
                  <select
                    value={deptId}
                    onChange={(e) => setDeptId(e.target.value)}
                    className="cc-input w-full px-3 py-2 text-sm"
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.code}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Details</label>
                <textarea
                  rows={4}
                  required
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Write official notice details..."
                  className="cc-input w-full px-3 py-2 text-sm"
                />
              </div>
              <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPinned}
                  onChange={(e) => setIsPinned(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600"
                />
                Pin notice to top
              </label>
              <button
                type="submit"
                className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors"
              >
                Publish Announcement
              </button>
            </form>
          </section>
        )}

        <section className={`${canPublish ? 'lg:col-span-8' : 'lg:col-span-12'} min-w-0 space-y-4`}>
          {visible.map((ann) => (
            <article
              key={ann.id}
              className="cc-card-hover p-5 space-y-2"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 flex-wrap">
                    <span className="capitalize font-medium text-blue-600 dark:text-blue-400">
                      {ann.category}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{ann.authorName}</span>
                    <span aria-hidden="true">·</span>
                    <span>{ann.isDemo ? 'Sample Notice' : 'Official Circular'}</span>
                    {ann.isPinned && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                          <Pin className="w-3 h-3" /> Pinned
                        </span>
                      </>
                    )}
                  </p>
                  <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                    {ann.title}
                  </h3>
                </div>
                {canPublish && (
                  <button
                    type="button"
                    onClick={() => removeAnnouncementItem(ann.id)}
                    aria-label="Delete announcement"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{ann.body}</p>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
};

/* ============================================================================
   3. FACULTY HUB VIEW
============================================================================ */
export const FacultyHubView: React.FC = () => {
  const {
    subjects,
    departments,
    studentRoster,
    attendanceRecords,
    setActiveView,
    createSubjectItem,
    createExamSchedule,
  } = useCampus();

  // Create Subject state
  const [subCode, setSubCode] = useState('');
  const [subName, setSubName] = useState('');
  const [subDept, setSubDept] = useState(departments[0]?.id || 'dept_cse');
  const [subSem, setSubSem] = useState(5);
  const [subCredits, setSubCredits] = useState(4);
  const [subUnits, setSubUnits] = useState('Unit 1: Introduction\nUnit 2: Core Theory\nUnit 3: Applications');

  // Create Exam state
  const [exSubId, setExSubId] = useState(subjects[0]?.id || '');
  const [exDate, setExDate] = useState('2026-12-10');
  const [exStart, setExStart] = useState('09:30');
  const [exEnd, setExEnd] = useState('12:30');
  const [exVenue, setExVenue] = useState('Academic Block A · Hall 102');
  const [exType, setExType] = useState<ExamType>('final');

  const handleAddSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subCode.trim() || !subName.trim()) return;
    const dept = departments.find((d) => d.id === subDept);
    await createSubjectItem({
      code: subCode.trim().toUpperCase(),
      name: subName.trim(),
      departmentId: subDept,
      courseName: dept?.courses[0] || 'B.Tech Computer Science',
      semester: subSem,
      credits: subCredits,
      facultyName: 'Faculty Instructor',
      units: subUnits
        .split('\n')
        .map((u) => u.trim())
        .filter(Boolean),
    });
    setSubCode('');
    setSubName('');
  };

  const handleAddExam = async (e: React.FormEvent) => {
    e.preventDefault();
    const sub = subjects.find((s) => s.id === exSubId) || subjects[0];
    if (!sub) return;
    await createExamSchedule({
      subjectId: sub.id,
      subjectCode: sub.code,
      subjectName: sub.name,
      semester: sub.semester,
      examType: exType,
      examDate: exDate,
      startTime: exStart,
      endTime: exEnd,
      venue: exVenue,
      syllabusUnits: 'Complete Syllabus',
    });
  };

  return (
    <div className="space-y-6">
      <div className="cc-card cc-grid-pattern p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-slate-900 dark:text-white">
            Faculty Workspace
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Manage subject content, books & syllabi, assessments, and review student progress
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => document.getElementById('faculty-content-management')?.scrollIntoView({ behavior: 'smooth' })}
            className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            Upload Books, Syllabi & PDFs
          </button>
          <button
            type="button"
            onClick={() => setActiveView('attendance')}
            className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-white/[0.1] bg-white/80 dark:bg-[#0B1018] text-xs font-medium hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
          >
            Manage Official Attendance
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Add Subject & Units */}
        <section className="min-w-0 cc-card p-4 sm:p-6 space-y-4">
          <h3 className="font-display text-base font-semibold flex items-center gap-2 text-slate-900 dark:text-white">
            <BookOpen className="w-4 h-4 text-blue-600" />
            Add Subject & Syllabus Units
          </h3>
          <form onSubmit={handleAddSubject} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Code</label>
                <input
                  type="text"
                  required
                  value={subCode}
                  onChange={(e) => setSubCode(e.target.value)}
                  placeholder="CS506"
                  className="cc-input w-full px-3 py-2 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium mb-1">Subject Name</label>
                <input
                  type="text"
                  required
                  value={subName}
                  onChange={(e) => setSubName(e.target.value)}
                  placeholder="Compiler Design"
                  className="cc-input w-full px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Department</label>
                <select
                  value={subDept}
                  onChange={(e) => setSubDept(e.target.value)}
                  className="cc-input w-full px-3 py-2 text-sm"
                >
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.code}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Semester</label>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={subSem}
                  onChange={(e) => setSubSem(Number(e.target.value) || 5)}
                  className="cc-input w-full px-3 py-2 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Credits</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={subCredits}
                  onChange={(e) => setSubCredits(Number(e.target.value) || 4)}
                  className="cc-input w-full px-3 py-2 text-sm font-mono"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Units (one per line)</label>
              <textarea
                rows={3}
                value={subUnits}
                onChange={(e) => setSubUnits(e.target.value)}
                className="cc-input w-full px-3 py-2 text-xs font-mono"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors"
            >
              Create Subject
            </button>
          </form>
        </section>

        {/* Schedule Examination */}
        <section className="min-w-0 cc-card p-4 sm:p-6 space-y-4">
          <h3 className="font-display text-base font-semibold flex items-center gap-2 text-slate-900 dark:text-white">
            <CalendarDays className="w-4 h-4 text-blue-600" />
            Schedule Examination
          </h3>
          <form onSubmit={handleAddExam} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Subject</label>
                <select
                  value={exSubId}
                  onChange={(e) => setExSubId(e.target.value)}
                  className="cc-input w-full px-3 py-2 text-sm"
                >
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} · {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Exam Type</label>
                <select
                  value={exType}
                  onChange={(e) => setExType(e.target.value as ExamType)}
                  className="cc-input w-full px-3 py-2 text-sm"
                >
                  <option value="midterm">Midterm</option>
                  <option value="final">Final</option>
                  <option value="practical">Practical</option>
                  <option value="quiz">Quiz</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Date</label>
                <input
                  type="date"
                  value={exDate}
                  onChange={(e) => setExDate(e.target.value)}
                  className="cc-input w-full px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Start</label>
                <input
                  type="time"
                  value={exStart}
                  onChange={(e) => setExStart(e.target.value)}
                  className="cc-input w-full px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">End</label>
                <input
                  type="time"
                  value={exEnd}
                  onChange={(e) => setExEnd(e.target.value)}
                  className="cc-input w-full px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Hall / Venue</label>
              <input
                type="text"
                required
                value={exVenue}
                onChange={(e) => setExVenue(e.target.value)}
                className="cc-input w-full px-3 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors"
            >
              Add to Exam Timetable
            </button>
          </form>
        </section>
      </div>

      {/* Student Roster Progress */}
      <section className="cc-card p-4 sm:p-6 space-y-4">
        <h3 className="font-display text-base font-semibold flex items-center gap-2 text-slate-900 dark:text-white">
          <Users className="w-4 h-4 text-blue-600" />
          Student Academic Roster
        </h3>
        {studentRoster.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            No students registered in the academic roster yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200/80 dark:border-white/[0.08] text-slate-500 dark:text-slate-400">
                  <th className="py-2 pr-3 font-medium">Roll No</th>
                  <th className="py-2 px-3 font-medium">Student Name</th>
                  <th className="py-2 px-3 font-medium">Course</th>
                  <th className="py-2 px-3 font-medium">Semester</th>
                  <th className="py-2 pl-3 font-medium text-right">Tracked Subjects</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06]">
                {studentRoster.map((st) => {
                  const recCount = attendanceRecords.filter((r) => r.studentUid === st.uid).length;
                  return (
                    <tr key={st.uid} className="hover:bg-slate-50/70 dark:hover:bg-white/[0.03]">
                      <td className="py-2.5 pr-3 font-mono">{st.rollNumber || '—'}</td>
                      <td className="py-2.5 px-3 font-medium text-slate-900 dark:text-white">{st.displayName}</td>
                      <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400">{st.courseName}</td>
                      <td className="py-2.5 px-3 font-mono tabular-nums">Sem {st.semester}</td>
                      <td className="py-2.5 pl-3 text-right font-mono tabular-nums">{recCount}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Role-Restricted Content Management for Faculty */}
      <div id="faculty-content-management">
        <ContentManagementSection />
      </div>
    </div>
  );
};

/* ============================================================================
   4. ADMIN CONSOLE VIEW
============================================================================ */
export const AdminConsoleView: React.FC = () => {
  const {
    profile,
    activeRoleView,
    isDemoMode,
    allUsers,
    departments,
    platformSettings,
    exams,
    changeUserRole,
    createDepartmentItem,
    updatePlatformConfig,
    removeExamSchedule,
    seedSampleWorkspace,
  } = useCampus();

  const isAdminAuthorized = isDemoMode
    ? activeRoleView === 'admin'
    : profile?.role === 'admin' && activeRoleView === 'admin';

  const [deptName, setDeptName] = useState('');
  const [deptCode, setDeptCode] = useState('');
  const [deptCourses, setDeptCourses] = useState('B.Tech Computer Science, M.Tech AI');

  const [instName, setInstName] = useState(platformSettings.institutionName);
  const [reqAtt, setReqAtt] = useState(platformSettings.defaultRequiredAttendance);
  const [acadYear, setAcadYear] = useState(platformSettings.academicYear);
  const [activeSem, setActiveSem] = useState(platformSettings.activeSemester);
  const [savedMsg, setSavedMsg] = useState(false);

  const handleAddDept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deptName.trim() || !deptCode.trim()) return;
    await createDepartmentItem({
      name: deptName.trim(),
      code: deptCode.trim().toUpperCase(),
      courses: deptCourses
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean),
      semestersCount: 8,
    });
    setDeptName('');
    setDeptCode('');
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    await updatePlatformConfig({
      institutionName: instName,
      defaultRequiredAttendance: reqAtt,
      academicYear: acadYear,
      activeSemester: activeSem,
    });
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 3000);
  };

  if (!isAdminAuthorized && activeRoleView !== 'faculty') {
    return (
      <div className="cc-card p-8 max-w-xl space-y-3">
        <div className="flex items-center gap-2.5 text-slate-900 dark:text-white">
          <Lock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          <h2 className="font-display text-lg font-semibold">Administration Console — Access Restricted</h2>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          This workspace is restricted to verified institution administrators and authorized faculty content managers.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="cc-card cc-grid-pattern p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-slate-900 dark:text-white">
            Administration Console
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Manage content publishing, books & syllabi, departments, user roles, exam timetables, and platform policy
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => document.getElementById('admin-content-management')?.scrollIntoView({ behavior: 'smooth' })}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            Content Management
          </button>
          {isAdminAuthorized && (
            <button
              type="button"
              onClick={seedSampleWorkspace}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-white/[0.1] bg-white/80 dark:bg-[#0B1018] text-xs font-medium hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
            >
              <Database className="w-3.5 h-3.5 text-blue-600" />
              Seed Sample College Catalog
            </button>
          )}
        </div>
      </div>

      {/* Content Management Section (Role-restricted for Admins & Faculty) */}
      <div id="admin-content-management">
        <ContentManagementSection />
      </div>

      {isAdminAuthorized && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Platform Settings */}
            <section className="min-w-0 cc-card p-4 sm:p-6 space-y-4">
              <h3 className="font-display text-base font-semibold flex items-center gap-2 text-slate-900 dark:text-white">
                <Settings className="w-4 h-4 text-blue-600" />
                Platform & Attendance Policy
              </h3>
              <form onSubmit={handleSaveSettings} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Institution Name</label>
                  <input
                    type="text"
                    required
                    value={instName}
                    onChange={(e) => setInstName(e.target.value)}
                    className="cc-input w-full px-3 py-2 text-sm"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">Min Attendance %</label>
                    <input
                      type="number"
                      min={50}
                      max={100}
                      value={reqAtt}
                      onChange={(e) => setReqAtt(Number(e.target.value) || 75)}
                      className="cc-input w-full px-3 py-2 text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Academic Year</label>
                    <input
                      type="text"
                      value={acadYear}
                      onChange={(e) => setAcadYear(e.target.value)}
                      className="cc-input w-full px-3 py-2 text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Active Semester</label>
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={activeSem}
                      onChange={(e) => setActiveSem(Number(e.target.value) || 5)}
                      className="cc-input w-full px-3 py-2 text-sm font-mono"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors"
                  >
                    Save Platform Settings
                  </button>
                  {savedMsg && (
                    <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Saved
                    </span>
                  )}
                </div>
              </form>
            </section>

            {/* Manage Departments */}
            <section className="min-w-0 cc-card p-4 sm:p-6 space-y-4">
              <h3 className="font-display text-base font-semibold flex items-center gap-2 text-slate-900 dark:text-white">
                <Building2 className="w-4 h-4 text-blue-600" />
                Departments & Courses ({departments.length})
              </h3>
              <form onSubmit={handleAddDept} className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                <input
                  type="text"
                  required
                  value={deptCode}
                  onChange={(e) => setDeptCode(e.target.value)}
                  placeholder="Code (IT)"
                  className="cc-input px-3 py-2 text-xs"
                />
                <input
                  type="text"
                  required
                  value={deptName}
                  onChange={(e) => setDeptName(e.target.value)}
                  placeholder="Department Name"
                  className="cc-input sm:col-span-2 px-3 py-2 text-xs"
                />
                <button
                  type="submit"
                  className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium inline-flex items-center justify-center gap-1 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
                <input
                  type="text"
                  value={deptCourses}
                  onChange={(e) => setDeptCourses(e.target.value)}
                  placeholder="Comma-separated courses"
                  className="cc-input sm:col-span-4 px-3 py-2 text-xs"
                />
              </form>

              <div className="divide-y divide-slate-100 dark:divide-white/[0.06] max-h-48 overflow-y-auto">
                {departments.map((d) => (
                  <div key={d.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-medium text-slate-900 dark:text-white">
                        {d.code} · {d.name}
                      </p>
                      <p className="text-slate-500 dark:text-slate-400">{d.courses.join(' · ')}</p>
                    </div>
                    <span className="font-mono text-slate-400">{d.semestersCount} sems</span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* User & Role Management */}
          <section className="cc-card p-4 sm:p-6 space-y-4">
            <h3 className="font-display text-base font-semibold flex items-center gap-2 text-slate-900 dark:text-white">
              <Shield className="w-4 h-4 text-blue-600" />
              Users & Role-Based Access Control
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200/80 dark:border-white/[0.08] text-slate-500 dark:text-slate-400">
                    <th className="py-2 pr-3 font-medium">Name</th>
                    <th className="py-2 px-3 font-medium">Email</th>
                    <th className="py-2 px-3 font-medium">Course / Sem</th>
                    <th className="py-2 pl-3 font-medium text-right">Assigned Role</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06]">
                  {allUsers.map((u) => (
                    <tr key={u.uid} className="hover:bg-slate-50/70 dark:hover:bg-white/[0.03]">
                      <td className="py-2.5 pr-3 font-medium text-slate-900 dark:text-white">{u.displayName}</td>
                      <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400">{u.email}</td>
                      <td className="py-2.5 px-3">
                        {u.courseName} · Sem {u.semester}
                      </td>
                      <td className="py-2.5 pl-3 text-right">
                        <select
                          aria-label={`Role for ${u.displayName}`}
                          value={u.role}
                          onChange={(e) =>
                            changeUserRole(u.uid, e.target.value as UserRole, u.departmentId || 'dept_cse')
                          }
                          className="cc-input px-2.5 py-1 text-xs font-medium capitalize"
                        >
                          <option value="student">Student</option>
                          <option value="faculty">Faculty</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {/* Exam Schedule Management */}
      <section className="cc-card p-4 sm:p-6 space-y-3">
        <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
          Manage Scheduled Exams ({exams.length})
        </h3>
        <div className="divide-y divide-slate-100 dark:divide-white/[0.06]">
          {exams.map((ex) => (
            <div key={ex.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
              <div>
                <p className="font-medium text-slate-900 dark:text-white">
                  {ex.subjectCode} · {ex.subjectName} ({ex.examType})
                </p>
                <p className="text-slate-500 dark:text-slate-400 font-mono">
                  {ex.examDate} · {ex.startTime}–{ex.endTime} · {ex.venue}
                </p>
              </div>
              <button
                type="button"
                onClick={() => removeExamSchedule(ex.id)}
                className="p-1.5 text-slate-400 hover:text-red-600 transition-colors"
                aria-label="Remove exam"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

/* ============================================================================
   5. PROFILE & SETTINGS VIEW
============================================================================ */
export const ProfileSettingsView: React.FC<{ initialTab?: 'profile' | 'settings' }> = ({
  initialTab = 'profile',
}) => {
  const {
    profile,
    departments,
    materials,
    bookmarks,
    theme,
    toggleTheme,
    colorPalette,
    setColorPalette,
    saveProfileChanges,
    uploadAvatarPhoto,
    removeAvatarPhoto,
    seedSampleWorkspace,
    setActiveView,
  } = useCampus();

  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [rollNumber, setRollNumber] = useState(profile?.rollNumber || '');
  const [departmentId, setDepartmentId] = useState(profile?.departmentId || 'dept_cse');
  const [courseName, setCourseName] = useState(profile?.courseName || 'B.Tech Computer Science');
  const [semester, setSemester] = useState(profile?.semester || 3);
  const [targetAttendance, setTargetAttendance] = useState(profile?.targetAttendance || 75);
  const [savingProfile, setSavingProfile] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Profile photo upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [photoStatus, setPhotoStatus] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [urlInputOpen, setUrlInputOpen] = useState(false);
  const [customUrl, setCustomUrl] = useState('');
  const [cameraModalOpen, setCameraModalOpen] = useState(false);

  useEffect(() => {
    setDisplayName(profile?.displayName || '');
    setRollNumber(profile?.rollNumber || '');
    setDepartmentId(profile?.departmentId || 'dept_cse');
    setCourseName(profile?.courseName || 'B.Tech Computer Science');
    setSemester(profile?.semester || 3);
    setTargetAttendance(profile?.targetAttendance || 75);
  }, [profile?.uid, profile?.displayName, profile?.rollNumber, profile?.departmentId, profile?.courseName, profile?.semester, profile?.targetAttendance]);

  const hasUnsavedChanges = useMemo(() => {
    if (!profile) return false;
    return (
      displayName.trim() !== (profile.displayName || '').trim() ||
      rollNumber.trim() !== (profile.rollNumber || '').trim() ||
      departmentId !== (profile.departmentId || 'dept_cse') ||
      courseName.trim() !== (profile.courseName || 'B.Tech Computer Science').trim() ||
      semester !== (profile.semester || 3) ||
      targetAttendance !== (profile.targetAttendance || 75)
    );
  }, [profile, displayName, rollNumber, departmentId, courseName, semester, targetAttendance]);

  useEffect(() => {
    if (hasUnsavedChanges && saved) {
      setSaved(false);
    }
  }, [hasUnsavedChanges, saved]);

  useEffect(() => {
    setAvatarFailed(false);
  }, [profile?.avatarUrl]);

  const bookmarkedMats = useMemo(() => {
    const ids = new Set(bookmarks.filter((b) => b.isBookmarked).map((b) => b.materialId));
    return materials.filter((m) => ids.has(m.id));
  }, [bookmarks, materials]);

  const recentMats = useMemo(() => {
    const ids = new Set(bookmarks.filter((b) => b.lastViewedAt).map((b) => b.materialId));
    return materials.filter((m) => ids.has(m.id));
  }, [bookmarks, materials]);

  const handlePhotoFile = async (file: File) => {
    if (uploadingPhoto) return;
    if (!file.type.startsWith('image/') && !/\.(png|jpe?g|webp|gif)$/i.test(file.name)) {
      setPhotoStatus(null);
      setPhotoError('Unsupported file type. Drop a PNG, JPG, WebP, or GIF image.');
      return;
    }
    setPhotoError(null);
    setPhotoStatus(null);
    setUploadingPhoto(true);
    setUploadProgress(15);
    try {
      const result = await uploadAvatarPhoto(file, (pct) => setUploadProgress(pct));
      setAvatarFailed(false);
      setUrlInputOpen(false);
      setPhotoStatus(
        result.storageUsed
          ? 'Profile photo uploaded and synced to your account.'
          : 'Profile photo updated and saved for this workspace.'
      );
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Failed to process profile photo.');
    } finally {
      setUploadingPhoto(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDropZoneDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current += 1;
    if (!uploadingPhoto) {
      setDragActive(true);
    }
  };

  const handleDropZoneDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = uploadingPhoto ? 'none' : 'copy';
    }
    if (!uploadingPhoto && !dragActive) {
      setDragActive(true);
    }
  };

  const handleDropZoneDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setDragActive(false);
    }
  };

  const handleDropZoneDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = 0;
    setDragActive(false);
    if (uploadingPhoto) return;

    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) {
      setPhotoStatus(null);
      setPhotoError('No image file detected. Drop an image file directly from your computer.');
      return;
    }
    void handlePhotoFile(files[0]);
  };

  const handleRemovePhoto = async () => {
    setPhotoError(null);
    setPhotoStatus(null);
    setUploadingPhoto(true);
    try {
      await removeAvatarPhoto();
      setPhotoStatus('Profile photo removed.');
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Could not remove photo.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleApplyUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = customUrl.trim();
    if (!clean) return;
    if (!/^https?:\/\//i.test(clean)) {
      setPhotoError('Please enter a valid http:// or https:// image URL.');
      return;
    }
    if (clean.length > 500) {
      setPhotoError('Image URL must be 500 characters or fewer.');
      return;
    }
    setPhotoError(null);
    setUploadingPhoto(true);
    try {
      await saveProfileChanges({ avatarUrl: clean });
      setAvatarFailed(false);
      setCustomUrl('');
      setUrlInputOpen(false);
      setPhotoStatus('Profile photo URL updated.');
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Could not save photo URL.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingProfile) return;
    setSaveError(null);
    setSaved(false);
    const trimmedName = displayName.trim();
    if (!trimmedName) {
      setSaveError('Please enter your Full Name before saving.');
      return;
    }
    const clampedSemester = Math.max(1, Math.min(12, Math.round(Number(semester) || 3)));
    const clampedTarget = Math.max(50, Math.min(100, Math.round(Number(targetAttendance) || 75)));
    setSemester(clampedSemester);
    setTargetAttendance(clampedTarget);

    setSavingProfile(true);
    try {
      await saveProfileChanges({
        displayName: trimmedName,
        rollNumber: rollNumber.trim(),
        departmentId,
        courseName: courseName.trim() || 'B.Tech Computer Science',
        semester: clampedSemester,
        targetAttendance: clampedTarget,
      });
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save profile changes.');
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="cc-card cc-grid-pattern p-5 sm:p-6">
        <h2 className="font-display text-xl font-semibold text-slate-900 dark:text-white">
          {initialTab === 'settings' ? 'Account & Application Settings' : 'Student Profile & Saved Resources'}
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Update profile photo, academic enrollment details, theme preferences, and saved materials
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 min-w-0 space-y-6">
          {/* Profile Photo Upload Section */}
          <section className="cc-card p-4 sm:p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-base font-semibold flex items-center gap-2 text-slate-900 dark:text-white">
                  <Camera className="w-4 h-4 text-[var(--cc-accent)]" />
                  Profile Photo
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Drag and drop an image from your desktop or browse to update your avatar
                </p>
              </div>
              {profile?.avatarUrl && (
                <button
                  type="button"
                  disabled={uploadingPhoto}
                  onClick={handleRemovePhoto}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-50 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remove
                </button>
              )}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-stretch gap-4">
              <div className="relative shrink-0 self-start sm:self-center">
                {!avatarFailed && profile?.avatarUrl ? (
                  <img
                    src={profile.avatarUrl}
                    alt={profile.displayName || 'Profile avatar'}
                    referrerPolicy="no-referrer"
                    onError={() => setAvatarFailed(true)}
                    className="w-20 h-20 rounded-2xl object-cover border border-slate-200 dark:border-white/[0.12]"
                  />
                ) : (
                  <div
                    className="w-20 h-20 rounded-2xl text-2xl font-display font-bold flex items-center justify-center border border-slate-200/80 dark:border-white/[0.1]"
                    style={{ backgroundColor: 'var(--cc-accent-light)', color: 'var(--cc-accent)' }}
                  >
                    {(profile?.displayName || 'R').slice(0, 1).toUpperCase()}
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0 space-y-2.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handlePhotoFile(file);
                  }}
                />

                {/* Dedicated Desktop Drag-and-Drop Zone */}
                <div
                  role="button"
                  tabIndex={0}
                  aria-label="Drop profile photo here or click to browse"
                  onClick={() => {
                    if (!uploadingPhoto) fileInputRef.current?.click();
                  }}
                  onKeyDown={(e) => {
                    if ((e.key === 'Enter' || e.key === ' ') && !uploadingPhoto) {
                      e.preventDefault();
                      fileInputRef.current?.click();
                    }
                  }}
                  onDragEnter={handleDropZoneDragEnter}
                  onDragOver={handleDropZoneDragOver}
                  onDragLeave={handleDropZoneDragLeave}
                  onDrop={handleDropZoneDrop}
                  className={`rounded-xl border-2 border-dashed p-3.5 sm:p-4 transition-colors cursor-pointer select-none ${
                    dragActive
                      ? 'border-[var(--cc-accent)] bg-[var(--cc-accent-light)]'
                      : 'border-slate-300/90 dark:border-white/[0.16] bg-slate-50/70 dark:bg-white/[0.02] hover:border-[var(--cc-accent)]/70 hover:bg-slate-100/70 dark:hover:bg-white/[0.04]'
                  } ${uploadingPhoto ? 'opacity-60 pointer-events-none' : ''}`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-lg shrink-0 flex items-center justify-center ${
                        dragActive
                          ? 'bg-[var(--cc-accent)] text-[var(--cc-accent-fg)]'
                          : 'bg-[var(--cc-accent-light)] text-[var(--cc-accent)]'
                      }`}
                    >
                      {uploadingPhoto ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Upload className="w-4 h-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-slate-900 dark:text-white">
                        {uploadingPhoto
                          ? 'Uploading photo...'
                          : dragActive
                          ? 'Drop image to set profile photo'
                          : 'Drag & drop image here, or click to browse'}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        PNG, JPG, WebP, or GIF up to 10 MB · Auto-cropped square
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={uploadingPhoto}
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg cc-btn-primary text-xs font-medium whitespace-nowrap disabled:opacity-60"
                  >
                    {uploadingPhoto ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="w-3.5 h-3.5" /> {profile?.avatarUrl ? 'Change Photo' : 'Browse File'}
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    disabled={uploadingPhoto}
                    onClick={() => {
                      setPhotoError(null);
                      setCameraModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg cc-btn-secondary text-xs font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap disabled:opacity-60"
                  >
                    <Camera className="w-3.5 h-3.5 text-[var(--cc-accent)]" />
                    Take Photo
                  </button>

                  <button
                    type="button"
                    disabled={uploadingPhoto}
                    onClick={() => {
                      setUrlInputOpen((prev) => !prev);
                      setPhotoError(null);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg cc-btn-secondary text-xs font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap"
                  >
                    {urlInputOpen ? <X className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5 text-[var(--cc-accent)]" />}
                    {urlInputOpen ? 'Close URL' : 'Use Image URL'}
                  </button>
                </div>
              </div>
            </div>

            {uploadingPhoto && uploadProgress > 0 && (
              <div className="space-y-1">
                <div className="w-full h-1.5 bg-slate-100 dark:bg-white/[0.08] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--cc-accent)] rounded-full transition-all duration-200"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <p className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  Uploading {uploadProgress}%
                </p>
              </div>
            )}

            {urlInputOpen && (
              <form onSubmit={handleApplyUrl} className="pt-2 flex flex-col sm:flex-row gap-2">
                <input
                  type="url"
                  required
                  maxLength={500}
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  placeholder="https://example.com/your-photo.jpg"
                  aria-label="Profile image URL"
                  className="flex-1 min-w-0 cc-input px-3 py-2 text-xs"
                />
                <button
                  type="submit"
                  disabled={uploadingPhoto || !customUrl.trim()}
                  className="px-3.5 py-2 rounded-lg cc-btn-primary text-xs font-medium whitespace-nowrap disabled:opacity-50"
                >
                  Apply URL
                </button>
              </form>
            )}

            {photoError && (
              <p className="text-xs text-red-600 dark:text-red-400">{photoError}</p>
            )}
            {photoStatus && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>{photoStatus}</span>
              </p>
            )}
          </section>

          <section className="cc-card p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-base font-semibold flex items-center gap-2 text-slate-900 dark:text-white">
                  <UserIcon className="w-4 h-4 text-[var(--cc-accent)]" />
                  Academic Profile
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Updates here appear immediately on your Dashboard Home Screen
                </p>
              </div>
              {hasUnsavedChanges && (
                <button
                  type="submit"
                  form="academic-profile-form"
                  disabled={savingProfile}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg cc-btn-primary text-xs font-semibold shrink-0 whitespace-nowrap disabled:opacity-60"
                >
                  {savingProfile ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  Save
                </button>
              )}
            </div>

            <form id="academic-profile-form" onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label htmlFor="profile-fullname-input" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Full Name
                  </label>
                  <input
                    id="profile-fullname-input"
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Rajeev Singh"
                    className="cc-input w-full px-3 py-2.5 text-sm min-h-[44px]"
                  />
                </div>
                <div>
                  <label htmlFor="profile-roll-input" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Roll / ID Number
                  </label>
                  <input
                    id="profile-roll-input"
                    type="text"
                    value={rollNumber}
                    onChange={(e) => setRollNumber(e.target.value)}
                    className="cc-input w-full px-3 py-2.5 text-sm font-mono min-h-[44px]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label htmlFor="profile-dept-select" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Department
                  </label>
                  <select
                    id="profile-dept-select"
                    value={departmentId}
                    onChange={(e) => setDepartmentId(e.target.value)}
                    className="cc-input w-full px-3 py-2.5 text-sm min-h-[44px]"
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.code} · {d.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="profile-course-input" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Course / Degree
                  </label>
                  <input
                    id="profile-course-input"
                    type="text"
                    value={courseName}
                    onChange={(e) => setCourseName(e.target.value)}
                    placeholder="B.Tech Computer Science"
                    className="cc-input w-full px-3 py-2.5 text-sm min-h-[44px]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="profile-semester-input" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Current Semester
                    </label>
                    <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      1–12
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSemester((prev) => Math.max(1, prev - 1))}
                      disabled={semester <= 1}
                      aria-label="Decrease semester"
                      className="min-w-[44px] min-h-[44px] rounded-xl cc-btn-secondary flex items-center justify-center shrink-0 disabled:opacity-40"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <input
                      id="profile-semester-input"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={12}
                      value={semester}
                      onChange={(e) => {
                        const raw = Number(e.target.value);
                        if (!Number.isNaN(raw) && e.target.value !== '') {
                          setSemester(Math.max(1, Math.min(12, Math.round(raw))));
                        }
                      }}
                      className="cc-input flex-1 min-w-0 h-[44px] px-2 text-center text-sm font-mono font-semibold tabular-nums"
                    />
                    <button
                      type="button"
                      onClick={() => setSemester((prev) => Math.min(12, prev + 1))}
                      disabled={semester >= 12}
                      aria-label="Increase semester"
                      className="min-w-[44px] min-h-[44px] rounded-xl cc-btn-secondary flex items-center justify-center shrink-0 disabled:opacity-40"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="profile-attendance-input" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Target Attendance %
                    </label>
                    <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      50%–100%
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setTargetAttendance((prev) => Math.max(50, prev - 1))}
                      disabled={targetAttendance <= 50}
                      aria-label="Decrease target attendance"
                      className="min-w-[44px] min-h-[44px] rounded-xl cc-btn-secondary flex items-center justify-center shrink-0 disabled:opacity-40"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <div className="relative flex-1 min-w-0">
                      <input
                        id="profile-attendance-input"
                        type="number"
                        inputMode="numeric"
                        min={50}
                        max={100}
                        value={targetAttendance}
                        onChange={(e) => {
                          const raw = Number(e.target.value);
                          if (!Number.isNaN(raw) && e.target.value !== '') {
                            setTargetAttendance(Math.max(50, Math.min(100, Math.round(raw))));
                          }
                        }}
                        className="cc-input w-full h-[44px] pl-2 pr-6 text-center text-sm font-mono font-semibold tabular-nums"
                      />
                      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-500 dark:text-slate-400">
                        %
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setTargetAttendance((prev) => Math.min(100, prev + 1))}
                      disabled={targetAttendance >= 100}
                      aria-label="Increase target attendance"
                      className="min-w-[44px] min-h-[44px] rounded-xl cc-btn-secondary flex items-center justify-center shrink-0 disabled:opacity-40"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {saveError && (
                <div
                  role="alert"
                  className="p-3 rounded-xl bg-red-50 dark:bg-red-950/35 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300"
                >
                  {saveError}
                </div>
              )}

              {saved && (
                <div
                  role="status"
                  className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/35 border border-emerald-200 dark:border-emerald-900/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 text-xs"
                >
                  <span className="text-emerald-700 dark:text-emerald-300 font-medium flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    Profile saved! Updated on your Dashboard Home Screen.
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveView('dashboard')}
                    className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-300 hover:underline self-start sm:self-auto"
                  >
                    Go to Dashboard <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <div className="pt-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl cc-btn-primary text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {savingProfile ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Saving Changes...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" /> Save Profile Changes
                    </>
                  )}
                </button>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {hasUnsavedChanges
                    ? 'You have unsaved profile edits'
                    : 'All profile details synced'}
                </span>
              </div>
            </form>
          </section>
        </div>

        <section className="lg:col-span-5 min-w-0 space-y-6">
          <div className="cc-card p-4 sm:p-6 space-y-5">
            <div>
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Settings className="w-4 h-4 text-[var(--cc-accent)]" />
                Smart Theme Engine
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Customize workspace accent palette and surface contrast mode
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-2.5">
                  Executive Color Palettes
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {[
                    { id: 'blue', label: 'Sapphire Blue', mood: 'Academic Focus', color: '#2563EB', tint: '#EFF6FF' },
                    { id: 'emerald', label: 'Botanical Jade', mood: 'Calm Clarity', color: '#059669', tint: '#ECFDF5' },
                    { id: 'violet', label: 'Royal Amethyst', mood: 'Deep Studio', color: '#7C3AED', tint: '#F5F3FF' },
                    { id: 'slate', label: 'Obsidian Slate', mood: 'Minimal Ink', color: '#334155', tint: '#F1F5F9' },
                  ].map((p) => {
                    const active = colorPalette === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setColorPalette(p.id as any)}
                        className={`p-3 rounded-xl border text-left transition-all space-y-2 ${
                          active
                            ? 'border-[var(--cc-accent)] bg-[var(--cc-accent-light)] shadow-xs'
                            : 'border-slate-200 dark:border-white/[0.1] hover:border-slate-300 dark:hover:border-white/[0.2] hover:bg-slate-50 dark:hover:bg-white/[0.03]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="w-4 h-4 rounded-full shrink-0 shadow-xs"
                              style={{ backgroundColor: p.color }}
                            />
                            <span
                              className="w-2.5 h-4 rounded-sm border border-black/10 shrink-0"
                              style={{ backgroundColor: p.tint }}
                            />
                          </div>
                          {active && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-[var(--cc-accent)] shrink-0" />
                          )}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                            {p.label}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {p.mood}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 dark:border-white/[0.06] space-y-2.5">
                <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Surface Contrast Mode
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (theme !== 'light') toggleTheme();
                    }}
                    className={`p-3 rounded-xl border text-left transition-all space-y-2 ${
                      theme === 'light'
                        ? 'border-[var(--cc-accent)] bg-[var(--cc-accent-light)] shadow-xs'
                        : 'border-slate-200 dark:border-white/[0.1] hover:bg-slate-50 dark:hover:bg-white/[0.03]'
                    }`}
                  >
                    <div className="h-7 rounded-lg bg-[#F4F6FA] border border-slate-200 p-1.5 flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-white border border-slate-300" />
                      <span className="h-1.5 flex-1 rounded-full bg-slate-300" />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-900 dark:text-white">
                        Ivory Light
                      </span>
                      {theme === 'light' && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-[var(--cc-accent)]" />
                      )}
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (theme !== 'dark') toggleTheme();
                    }}
                    className={`p-3 rounded-xl border text-left transition-all space-y-2 ${
                      theme === 'dark'
                        ? 'border-[var(--cc-accent)] bg-[var(--cc-accent-light)] shadow-xs'
                        : 'border-slate-200 dark:border-white/[0.1] hover:bg-slate-50 dark:hover:bg-white/[0.03]'
                    }`}
                  >
                    <div className="h-7 rounded-lg bg-[#07090E] border border-white/15 p-1.5 flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#141A27] border border-white/20" />
                      <span className="h-1.5 flex-1 rounded-full bg-white/20" />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-900 dark:text-white">
                        Obsidian Dark
                      </span>
                      {theme === 'dark' && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-[var(--cc-accent)]" />
                      )}
                    </div>
                  </button>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 dark:border-white/[0.06] flex flex-wrap items-center justify-between gap-3 text-sm">
                <div>
                  <p className="font-medium text-slate-900 dark:text-white">Sample College Data</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Populate demo attendance, books &amp; tasks
                  </p>
                </div>
                <button
                  type="button"
                  onClick={seedSampleWorkspace}
                  className="px-3 py-1.5 rounded-lg cc-btn-secondary text-xs font-medium"
                >
                  Load Samples
                </button>
              </div>
            </div>
          </div>

          <div className="cc-card p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold flex items-center gap-2 text-slate-900 dark:text-white">
                <Bookmark className="w-4 h-4 text-blue-600" />
                Bookmarked & Recent ({bookmarkedMats.length})
              </h3>
              <button
                type="button"
                onClick={() => setActiveView('materials')}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                Open Library
              </button>
            </div>
            {bookmarkedMats.length === 0 && recentMats.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Bookmark study notes, books, or syllabi in the library to keep them pinned here.
              </p>
            ) : (
              <div className="space-y-2">
                {(bookmarkedMats.length > 0 ? bookmarkedMats : recentMats).slice(0, 4).map((m) => (
                  <div key={m.id} className="text-xs py-1.5 border-b border-slate-100 dark:border-white/[0.06] last:border-0">
                    <p className="font-medium truncate text-slate-900 dark:text-white">{m.title}</p>
                    <p className="text-slate-500 dark:text-slate-400">{m.subjectName}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      <ProfileCameraModal
        open={cameraModalOpen}
        onClose={() => setCameraModalOpen(false)}
        onCapture={handlePhotoFile}
      />
    </div>
  );
};
