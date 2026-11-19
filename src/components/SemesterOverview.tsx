import React, { useEffect, useMemo, useState } from 'react';
import {
  Award,
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  GraduationCap,
  Info,
  Layers,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useCampus } from '../context/CampusContext';
import { analyzeAttendance } from '../lib/attendanceMath';
import type { Subject } from '../types/campus';

interface SemesterStat {
  semester: number;
  label: string;
  sgpa: number;
  cgpa: number;
  creditsAttempted: number;
  creditsEarned: number;
  status: 'completed' | 'active' | 'upcoming';
  standing: string;
}

const HISTORICAL_SEMESTERS: SemesterStat[] = [
  {
    semester: 1,
    label: 'Sem 1',
    sgpa: 3.65,
    cgpa: 3.65,
    creditsAttempted: 20,
    creditsEarned: 20,
    status: 'completed',
    standing: 'First Class with Distinction',
  },
  {
    semester: 2,
    label: 'Sem 2',
    sgpa: 3.72,
    cgpa: 3.69,
    creditsAttempted: 22,
    creditsEarned: 22,
    status: 'completed',
    standing: 'Dean’s Honor Roll',
  },
  {
    semester: 3,
    label: 'Sem 3',
    sgpa: 3.78,
    cgpa: 3.72,
    creditsAttempted: 21,
    creditsEarned: 21,
    status: 'completed',
    standing: 'Dean’s Honor Roll',
  },
  {
    semester: 4,
    label: 'Sem 4',
    sgpa: 3.82,
    cgpa: 3.75,
    creditsAttempted: 20,
    creditsEarned: 20,
    status: 'completed',
    standing: 'Dean’s Honor Roll',
  },
  {
    semester: 5,
    label: 'Sem 5',
    sgpa: 3.88,
    cgpa: 3.80,
    creditsAttempted: 18,
    creditsEarned: 14,
    status: 'upcoming',
    standing: 'Dean’s Honor Roll (Projected)',
  },
  {
    semester: 6,
    label: 'Sem 6',
    sgpa: 3.90,
    cgpa: 3.82,
    creditsAttempted: 20,
    creditsEarned: 0,
    status: 'upcoming',
    standing: 'Projected',
  },
  {
    semester: 7,
    label: 'Sem 7',
    sgpa: 3.92,
    cgpa: 3.84,
    creditsAttempted: 18,
    creditsEarned: 0,
    status: 'upcoming',
    standing: 'Projected',
  },
  {
    semester: 8,
    label: 'Sem 8',
    sgpa: 3.95,
    cgpa: 3.86,
    creditsAttempted: 16,
    creditsEarned: 0,
    status: 'upcoming',
    standing: 'Degree Completion',
  },
];

export const SemesterOverview: React.FC = () => {
  const {
    profile,
    subjects,
    attendanceRecords,
    studyTasks,
    setActiveView,
    platformSettings,
  } = useCampus();

  const currentActiveSemester = profile?.semester || 3;
  const [selectedSemester, setSelectedSemester] = useState<number>(currentActiveSemester);
  const [activeChartTab, setActiveChartTab] = useState<'gpa' | 'credits'>('gpa');

  useEffect(() => {
    setSelectedSemester(currentActiveSemester);
  }, [currentActiveSemester]);

  const dynamicSemesters = useMemo<SemesterStat[]>(() => {
    return HISTORICAL_SEMESTERS.map((item) => {
      const status: SemesterStat['status'] =
        item.semester < currentActiveSemester
          ? 'completed'
          : item.semester === currentActiveSemester
          ? 'active'
          : 'upcoming';
      return {
        ...item,
        status,
        label: item.semester === currentActiveSemester ? `Sem ${item.semester} (Current)` : `Sem ${item.semester}`,
        creditsEarned:
          status === 'completed'
            ? item.creditsAttempted
            : status === 'active'
            ? Math.min(item.creditsAttempted, 14)
            : 0,
      };
    });
  }, [currentActiveSemester]);

  const requiredPct = profile?.targetAttendance || platformSettings.defaultRequiredAttendance || 75;

  // Subjects corresponding to the selected semester
  const semesterSubjects = useMemo(() => {
    const list = subjects.filter((s) => s.semester === selectedSemester);
    if (list.length > 0) return list;

    // Fallback representative subjects if selected semester has no catalog entries
    return [
      {
        id: `mock_sub_${selectedSemester}_1`,
        code: `CS${selectedSemester}01`,
        name: 'Advanced Systems Architecture',
        departmentId: profile?.departmentId || 'dept_cse',
        courseName: profile?.courseName || 'B.Tech Computer Science',
        semester: selectedSemester,
        credits: 4,
        facultyName: 'Dr. Meera Kulkarni',
        units: ['Unit 1', 'Unit 2', 'Unit 3', 'Unit 4'],
        isDemo: true,
        createdByUid: 'demo',
      },
      {
        id: `mock_sub_${selectedSemester}_2`,
        code: `CS${selectedSemester}02`,
        name: 'Distributed Cloud Systems',
        departmentId: profile?.departmentId || 'dept_cse',
        courseName: profile?.courseName || 'B.Tech Computer Science',
        semester: selectedSemester,
        credits: 4,
        facultyName: 'Prof. Arvind Deshmukh',
        units: ['Unit 1', 'Unit 2', 'Unit 3', 'Unit 4'],
        isDemo: true,
        createdByUid: 'demo',
      },
      {
        id: `mock_sub_${selectedSemester}_3`,
        code: `CS${selectedSemester}03`,
        name: 'Machine Learning & Neural Networks',
        departmentId: profile?.departmentId || 'dept_cse',
        courseName: profile?.courseName || 'B.Tech Computer Science',
        semester: selectedSemester,
        credits: 3,
        facultyName: 'Dr. Rohan Banerjee',
        units: ['Unit 1', 'Unit 2', 'Unit 3', 'Unit 4'],
        isDemo: true,
        createdByUid: 'demo',
      },
      {
        id: `mock_sub_${selectedSemester}_4`,
        code: `CS${selectedSemester}04`,
        name: 'Software Verification & Security Lab',
        departmentId: profile?.departmentId || 'dept_cse',
        courseName: profile?.courseName || 'B.Tech Computer Science',
        semester: selectedSemester,
        credits: 3,
        facultyName: 'Dr. Kavita Nair',
        units: ['Unit 1', 'Unit 2', 'Unit 3'],
        isDemo: true,
        createdByUid: 'demo',
      },
    ] as Subject[];
  }, [subjects, selectedSemester, profile]);

  // Total credit hours for selected semester
  const semesterCreditStats = useMemo(() => {
    const totalCredits = semesterSubjects.reduce((acc, s) => acc + (s.credits || 3), 0);
    const theoryCredits = semesterSubjects
      .filter((s) => !s.name.toLowerCase().includes('lab'))
      .reduce((acc, s) => acc + (s.credits || 3), 0);
    const labCredits = totalCredits - theoryCredits;

    // Degree totals
    const totalDegreeCredits = 160;
    // Calculate total earned credits up to current semester
    const priorCompleted = dynamicSemesters.filter((s) => s.status === 'completed');
    const priorEarned = priorCompleted.reduce((acc, s) => acc + s.creditsEarned, 0);
    const currentEarned = selectedSemester === currentActiveSemester ? 14 : selectedSemester < currentActiveSemester ? totalCredits : 0;
    const totalEarnedToDate = priorEarned + (selectedSemester >= currentActiveSemester ? currentEarned : 0);
    const degreeProgressPct = Math.min(100, Math.round((totalEarnedToDate / totalDegreeCredits) * 100));

    return {
      totalCredits,
      theoryCredits,
      labCredits,
      totalDegreeCredits,
      totalEarnedToDate,
      degreeProgressPct,
    };
  }, [semesterSubjects, selectedSemester, currentActiveSemester, dynamicSemesters]);

  // Aggregated subject performance & attendance matrix
  const subjectPerformanceList = useMemo(() => {
    // Total credit hours for denominator
    const totalSemCredits = Math.max(
      1,
      semesterSubjects.reduce((sum, item) => sum + (item.credits || 4), 0)
    );

    return semesterSubjects.map((sub, idx) => {
      const matchAtt = attendanceRecords.find(
        (r) => r.subjectId === sub.id || r.subjectCode.toLowerCase() === sub.code.toLowerCase()
      );

      const attPct = matchAtt
        ? analyzeAttendance(matchAtt.classesAttended, matchAtt.totalClasses, requiredPct).currentPercentage
        : 82 + ((idx * 3) % 14); // Realistic fallback

      // Syllabus progress estimation from completed tasks
      const relatedTasks = studyTasks.filter(
        (t) => t.subjectId === sub.id || t.subjectName.toLowerCase().includes(sub.name.toLowerCase())
      );
      const completedTasks = relatedTasks.filter((t) => t.completed).length;
      const progressPct =
        relatedTasks.length > 0
          ? Math.round((completedTasks / relatedTasks.length) * 100)
          : Math.min(95, 60 + idx * 8);

      const projectedGrade =
        attPct >= 85 && progressPct >= 75 ? 'A+' : attPct >= 75 ? 'A' : attPct >= 65 ? 'B+' : 'B';
      const gradePoints =
        projectedGrade === 'A+' ? 10 : projectedGrade === 'A' ? 9 : projectedGrade === 'B+' ? 8 : 7;
      const credits = sub.credits || 4;
      const weightPct = Math.round((credits / totalSemCredits) * 1000) / 10;

      return {
        id: sub.id,
        code: sub.code,
        name: sub.name,
        facultyName: sub.facultyName,
        credits,
        weightPct,
        attendancePct: attPct,
        progressPct,
        projectedGrade,
        gradePoints,
        isMeetingAttendance: attPct >= requiredPct,
      };
    });
  }, [semesterSubjects, attendanceRecords, studyTasks, requiredPct]);

  // Aggregated progress score for selected semester
  const aggregatedSemesterScore = useMemo(() => {
    if (subjectPerformanceList.length === 0) return 0;
    const totalProgress = subjectPerformanceList.reduce((acc, s) => acc + s.progressPct, 0);
    return Math.round(totalProgress / subjectPerformanceList.length);
  }, [subjectPerformanceList]);

  // Recharts credit breakdown data
  const creditBarData = useMemo(() => {
    return subjectPerformanceList.map((item) => ({
      code: item.code,
      name: item.name,
      credits: item.credits,
      weightPct: item.weightPct,
      progress: item.progressPct,
      attendance: item.attendancePct,
    }));
  }, [subjectPerformanceList]);

  // Selected semester GPA info
  const selectedSemInfo = useMemo(() => {
    return (
      dynamicSemesters.find((s) => s.semester === selectedSemester) || {
        semester: selectedSemester,
        label: selectedSemester === currentActiveSemester ? `Sem ${selectedSemester} (Current)` : `Sem ${selectedSemester}`,
        sgpa: 3.85,
        cgpa: 3.79,
        creditsAttempted: 20,
        creditsEarned: 0,
        status: selectedSemester < currentActiveSemester ? 'completed' : 'upcoming',
        standing: 'Dean’s Honor Roll',
      }
    );
  }, [selectedSemester, currentActiveSemester, dynamicSemesters]);

  return (
    <div className="space-y-6">
      {/* Semester Header & Selector Banner */}
      <section className="relative overflow-hidden cc-hero-card p-6 sm:p-7 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        <div className="absolute inset-0 cc-grid-pattern opacity-40 pointer-events-none" aria-hidden="true" />
        
        <div className="relative z-10 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-slate-900 dark:text-white">
              {profile?.courseName || 'B.Tech Computer Science'}
            </span>
            <span>·</span>
            <span>Academic Year {platformSettings.academicYear}</span>
            <span>·</span>
            <span className="text-[var(--cc-accent)] font-medium">
              {selectedSemester === currentActiveSemester ? 'Active Term' : `Semester ${selectedSemester}`}
            </span>
          </div>

          <h2 className="font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-[var(--cc-accent)]" />
            Semester {selectedSemester} Overview &amp; Credit Weights
          </h2>

          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-2xl leading-relaxed">
            Holistic tracking of academic performance, cumulative GPA trajectory, subject credit weightage,
            and course progress toward degree fulfillment.
          </p>
        </div>

        {/* Semester Segmented Switcher */}
        <div className="relative z-10 flex flex-wrap items-center gap-1 cc-segmented self-start lg:self-center">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((semNum) => {
            const isCurrent = semNum === currentActiveSemester;
            const isSelected = semNum === selectedSemester;
            return (
              <button
                key={semNum}
                type="button"
                onClick={() => setSelectedSemester(semNum)}
                title={isCurrent ? `Semester ${semNum} (Current Term)` : `Semester ${semNum}`}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap ${
                  isSelected
                    ? 'bg-white dark:bg-[#0B1018] text-slate-900 dark:text-white shadow-xs font-semibold ring-1 ring-[var(--cc-accent-subtle)]'
                    : isCurrent
                    ? 'text-[var(--cc-accent)] font-semibold hover:bg-white/60 dark:hover:bg-white/[0.04]'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Sem {semNum}
              </button>
            );
          })}
        </div>
      </section>

      {/* 4-Card Aggregated Metrics Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Semester SGPA & Standing */}
        <div className="cc-card p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="font-medium">Term SGPA</span>
            <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-3xl font-bold tracking-tight text-slate-900 dark:text-white tabular-nums">
              {selectedSemInfo.sgpa.toFixed(2)}
            </span>
            <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400 font-medium">
              CGPA {selectedSemInfo.cgpa.toFixed(2)}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
            {selectedSemInfo.standing}
          </p>
        </div>

        {/* Metric 2: Credit Hours Tracking */}
        <div className="cc-card p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="font-medium">Semester Credit Hours</span>
            <Layers className="w-4 h-4 text-[var(--cc-accent)]" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-3xl font-bold tracking-tight text-slate-900 dark:text-white tabular-nums">
              {semesterCreditStats.totalCredits}
            </span>
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
              {semesterCreditStats.theoryCredits} Theory · {semesterCreditStats.labCredits} Lab
            </span>
          </div>
          <div className="w-full h-1.5 bg-slate-100 dark:bg-white/[0.08] rounded-full overflow-hidden mt-1">
            <div
              className="h-full bg-[var(--cc-accent)] rounded-full transition-all duration-300"
              style={{
                width: `${Math.round((semesterCreditStats.theoryCredits / semesterCreditStats.totalCredits) * 100)}%`,
              }}
            />
          </div>
        </div>

        {/* Metric 3: Aggregated Syllabus & Topic Progress */}
        <div className="cc-card p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="font-medium">Aggregated Syllabus Progress</span>
            <CheckCircle2 className="w-4 h-4 text-[var(--cc-accent)]" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-3xl font-bold tracking-tight text-slate-900 dark:text-white tabular-nums">
              {aggregatedSemesterScore}%
            </span>
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
              {semesterSubjects.length} Registered Courses
            </span>
          </div>
          <div className="w-full h-1.5 bg-slate-100 dark:bg-white/[0.08] rounded-full overflow-hidden mt-1">
            <div
              className="h-full bg-[var(--cc-accent)] rounded-full transition-all duration-300"
              style={{ width: `${aggregatedSemesterScore}%` }}
            />
          </div>
        </div>

        {/* Metric 4: Degree Credit Hours Fulfillment */}
        <div className="cc-card p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="font-medium">Degree Credit Progress</span>
            <Award className="w-4 h-4 text-amber-500" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-3xl font-bold tracking-tight text-slate-900 dark:text-white tabular-nums">
              {semesterCreditStats.totalEarnedToDate}
              <span className="text-xs font-normal text-slate-400">/{semesterCreditStats.totalDegreeCredits}</span>
            </span>
            <span className="text-xs font-mono font-medium text-amber-600 dark:text-amber-400 tabular-nums">
              {semesterCreditStats.degreeProgressPct}% Earned
            </span>
          </div>
          <div className="w-full h-1.5 bg-slate-100 dark:bg-white/[0.08] rounded-full overflow-hidden mt-1">
            <div
              className="h-full bg-amber-500 rounded-full transition-all duration-300"
              style={{ width: `${semesterCreditStats.degreeProgressPct}%` }}
            />
          </div>
        </div>
      </section>

      {/* Main Visualizations: Recharts Visual Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Visualization: Multi-Semester GPA Trajectory */}
        <section className="lg:col-span-7 cc-card p-4 sm:p-6 space-y-4 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100 dark:border-white/[0.06]">
            <div>
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-[var(--cc-accent)]" />
                GPA Trajectory &amp; Historical Standing
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Semester SGPA vs Cumulative CGPA with 3.75 Dean’s List benchmark
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1 cc-segmented self-start sm:self-auto max-w-full">
              <button
                type="button"
                onClick={() => setActiveChartTab('gpa')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  activeChartTab === 'gpa'
                    ? 'bg-white dark:bg-[#0B1018] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                GPA Progression
              </button>
              <button
                type="button"
                onClick={() => setActiveChartTab('credits')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  activeChartTab === 'credits'
                    ? 'bg-white dark:bg-[#0B1018] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                Credits / Term
              </button>
            </div>
          </div>

          <div className="h-64 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              {activeChartTab === 'gpa' ? (
                <AreaChart
                  data={HISTORICAL_SEMESTERS}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="sgpaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--cc-accent)" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="var(--cc-accent)" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="cgpaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11 }}
                    stroke="#94a3b8"
                    tickLine={false}
                  />
                  <YAxis
                    domain={[3.0, 4.0]}
                    ticks={[3.0, 3.25, 3.5, 3.75, 4.0]}
                    tick={{ fontSize: 11 }}
                    stroke="#94a3b8"
                    tickLine={false}
                  />
                  <ReferenceLine
                    y={3.75}
                    stroke="#f59e0b"
                    strokeDasharray="4 4"
                    label={{
                      value: 'Dean’s Honor: 3.75',
                      position: 'insideTopRight',
                      fill: '#f59e0b',
                      fontSize: 10,
                    }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0E121B',
                      borderColor: 'rgba(255,255,255,0.1)',
                      borderRadius: '10px',
                      color: '#f8fafc',
                      fontSize: '12px',
                    }}
                    formatter={((val: any, name: any) => [
                      typeof val === 'number' ? val.toFixed(2) : String(val ?? ''),
                      name === 'sgpa' ? 'Term SGPA' : 'Cumulative CGPA',
                    ]) as any}
                  />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    iconType="circle"
                    wrapperStyle={{ fontSize: '11px', paddingBottom: '8px' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="sgpa"
                    name="Term SGPA"
                    stroke="var(--cc-accent)"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#sgpaGrad)"
                  />
                  <Area
                    type="monotone"
                    dataKey="cgpa"
                    name="Cumulative CGPA"
                    stroke="#10b981"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#cgpaGrad)"
                  />
                </AreaChart>
              ) : (
                <BarChart
                  data={HISTORICAL_SEMESTERS}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#94a3b8" tickLine={false} />
                  <YAxis domain={[0, 26]} tick={{ fontSize: 11 }} stroke="#94a3b8" tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0E121B',
                      borderColor: 'rgba(255,255,255,0.1)',
                      borderRadius: '10px',
                      color: '#f8fafc',
                      fontSize: '12px',
                    }}
                  />
                  <Legend verticalAlign="top" align="right" wrapperStyle={{ fontSize: '11px' }} />
                  <Bar
                    dataKey="creditsAttempted"
                    name="Credits Registered"
                    fill="var(--cc-accent)"
                    radius={[6, 6, 0, 0]}
                  />
                  <Bar
                    dataKey="creditsEarned"
                    name="Credits Cleared"
                    fill="#10b981"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </section>

        {/* Right Visualization: Credit Hours & Course Load Distribution */}
        <section className="lg:col-span-5 cc-card p-4 sm:p-6 space-y-4 min-w-0">
          <div className="pb-3 border-b border-slate-100 dark:border-white/[0.06] flex items-start justify-between gap-2">
            <div>
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-[var(--cc-accent)]" />
                Course Credit Weight &amp; Mastery
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Proportional credit share and current syllabus completion
              </p>
            </div>
            <span className="font-mono text-xs font-semibold text-[var(--cc-accent)] tabular-nums shrink-0">
              {semesterCreditStats.totalCredits} Cr Total
            </span>
          </div>

          {/* Credit Weight Proportional Allocation Strip */}
          <div className="space-y-2">
            <div className="h-2.5 w-full rounded-full overflow-hidden flex gap-0.5 bg-slate-100 dark:bg-white/[0.06]">
              {subjectPerformanceList.map((item, idx) => {
                const opacities = ['1', '0.78', '0.58', '0.4', '0.28'];
                return (
                  <div
                    key={item.id}
                    title={`${item.code}: ${item.credits} Cr (${item.weightPct}% weight)`}
                    className="h-full first:rounded-l-full last:rounded-r-full transition-all"
                    style={{
                      width: `${item.weightPct}%`,
                      backgroundColor: 'var(--cc-accent)',
                      opacity: opacities[idx % opacities.length],
                    }}
                  />
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
              {subjectPerformanceList.map((item, idx) => {
                const opacities = ['1', '0.78', '0.58', '0.4', '0.28'];
                return (
                  <span key={item.id} className="inline-flex items-center gap-1.5 font-mono tabular-nums">
                    <span
                      className="w-2 h-2 rounded-xs shrink-0"
                      style={{
                        backgroundColor: 'var(--cc-accent)',
                        opacity: opacities[idx % opacities.length],
                      }}
                    />
                    <span className="text-slate-700 dark:text-slate-300 font-medium">{item.code}</span>
                    <span>{item.weightPct}%</span>
                  </span>
                );
              })}
            </div>
          </div>

          <div className="h-52 w-full pt-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={creditBarData}
                layout="vertical"
                margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} stroke="#94a3b8" tick={{ fontSize: 11 }} unit="%" />
                <YAxis
                  type="category"
                  dataKey="code"
                  stroke="#94a3b8"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  width={60}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0D111A',
                    borderColor: 'rgba(255,255,255,0.12)',
                    borderRadius: '10px',
                    color: '#f8fafc',
                    fontSize: '12px',
                  }}
                  formatter={((value: any, name: any, entry: any) => [
                    `${value}% (${entry?.payload?.credits || 0} Cr · ${entry?.payload?.weightPct || 0}% weight)`,
                    name === 'progress' ? 'Syllabus Coverage' : 'Attendance',
                  ]) as any}
                />
                <Bar
                  dataKey="progress"
                  name="Syllabus %"
                  fill="var(--cc-accent)"
                  radius={[0, 6, 6, 0]}
                  barSize={14}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      {/* Course Roster & Detailed Credit Hour Tracking Table */}
      <section className="cc-card p-4 sm:p-6 space-y-4 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100 dark:border-white/[0.06]">
          <div>
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-[var(--cc-accent)]" />
              Semester {selectedSemester} Registered Subject Roster
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Subject credit weights, instructor assignments, attendance compliance, and projected grades
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setActiveView('exam-prep')}
              className="px-3 py-1.5 rounded-lg cc-btn-secondary text-slate-700 dark:text-slate-300 font-medium"
            >
              Open Syllabus Tracker
            </button>
            <button
              type="button"
              onClick={() => setActiveView('attendance')}
              className="px-3 py-1.5 rounded-lg cc-btn-primary font-medium"
            >
              Log Attendance
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200/80 dark:border-white/[0.08] text-slate-500 dark:text-slate-400">
                <th className="py-2.5 pr-4 font-medium">Course Code &amp; Title</th>
                <th className="py-2.5 px-4 font-medium">Faculty</th>
                <th className="py-2.5 px-4 font-medium text-center">Credits</th>
                <th className="py-2.5 px-4 font-medium">Credit Weight</th>
                <th className="py-2.5 px-4 font-medium">Syllabus Progress</th>
                <th className="py-2.5 px-4 font-medium text-center">Attendance</th>
                <th className="py-2.5 pl-4 font-medium text-right">Projected Grade</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06]">
              {subjectPerformanceList.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/80 dark:hover:bg-white/[0.02] transition-colors">
                  <td className="py-3 pr-4">
                    <p className="font-semibold text-slate-900 dark:text-white">
                      {item.code} · {item.name}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {item.name.toLowerCase().includes('lab') ? 'Practical / Laboratory' : 'Core Theory Course'}
                    </p>
                  </td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                    {item.facultyName}
                  </td>
                  <td className="py-3 px-4 text-center font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                    {item.credits} Cr
                  </td>
                  <td className="py-3 px-4 min-w-[120px]">
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="font-mono font-medium tabular-nums text-slate-700 dark:text-slate-300">
                        {item.weightPct}%
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 dark:bg-white/[0.08] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[var(--cc-accent)] opacity-80 rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, item.weightPct * 2.2)}%` }}
                      />
                    </div>
                  </td>
                  <td className="py-3 px-4 min-w-[140px]">
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="font-mono tabular-nums text-slate-600 dark:text-slate-300">
                        {item.progressPct}%
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 dark:bg-white/[0.08] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[var(--cc-accent)] rounded-full transition-all duration-300"
                        style={{ width: `${item.progressPct}%` }}
                      />
                    </div>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span
                      className={`font-mono text-xs font-semibold tabular-nums ${
                        item.isMeetingAttendance
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {item.attendancePct}%
                    </span>
                  </td>
                  <td className="py-3 pl-4 text-right">
                    <span className="font-mono text-xs font-bold text-slate-900 dark:text-white tabular-nums">
                      {item.projectedGrade}{' '}
                      <span className="text-[10px] text-slate-400 font-normal">({item.gradePoints}.0)</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
