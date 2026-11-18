import { jsPDF } from 'jspdf';
import autoTable, { type RowInput } from 'jspdf-autotable';
import type {
  AttendanceLog,
  AttendanceRecord,
  ExamSchedule,
  StudyTask,
} from '../types/campus';
import { analyzeAttendance } from './attendanceMath';

export interface DashboardReportStudentInfo {
  displayName: string;
  rollNumber: string;
  departmentName: string;
  courseName: string;
  semester: number;
}

export interface DashboardReportOptions {
  institutionName: string;
  academicYear: string;
  activeSemester: number;
  isDemoMode: boolean;
  student: DashboardReportStudentInfo;
  requiredPercentage: number;
  attendanceRecords: AttendanceRecord[];
  studyTasks: StudyTask[];
  exams: ExamSchedule[];
  attendanceLogs?: AttendanceLog[];
  includeCompletedTasks?: boolean;
  includeExams?: boolean;
  includeRecentLogs?: boolean;
  dryRun?: boolean;
}

export interface DashboardReportResult {
  fileName: string;
  referenceId: string;
  pageCount: number;
  attendancePercentage: number;
  subjectCount: number;
  taskCount: number;
  examCount: number;
  pdfBytes?: ArrayBuffer;
}

function sanitizeFileSegment(value: string): string {
  return (
    (value || 'student')
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'student'
  );
}

function formatDateDisplay(date: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = String(date.getDate()).padStart(2, '0');
  const mon = months[date.getMonth()];
  const year = date.getFullYear();
  const hrs = String(date.getHours()).padStart(2, '0');
  const mins = String(date.getMinutes()).padStart(2, '0');
  return `${day} ${mon} ${year}, ${hrs}:${mins}`;
}

function formatDateSlug(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function statusRgb(status: 'On Track' | 'Borderline' | 'Shortage'): [number, number, number] {
  if (status === 'On Track') return [4, 120, 87];
  if (status === 'Borderline') return [180, 83, 9];
  return [185, 28, 28];
}

function daysUntilLabel(dateStr: string): string {
  if (!dateStr) return '—';
  const diff = Math.ceil((new Date(`${dateStr}T12:00:00`).getTime() - Date.now()) / 86400000);
  if (Number.isNaN(diff)) return dateStr;
  if (diff < 0) return 'Completed';
  if (diff === 0) return 'Today';
  return `${diff}d left`;
}

type JsPdfWithAutoTable = jsPDF & {
  lastAutoTable?: {
    finalY: number;
  };
};

export function exportDashboardSummaryPdfReport(
  options: DashboardReportOptions
): DashboardReportResult {
  const now = new Date();
  const dateSlug = formatDateSlug(now);
  const todayIso = now.toISOString().slice(0, 10);
  const shortHash = Math.abs(
    `${options.student.rollNumber}-${now.getTime()}`
      .split('')
      .reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) | 0, 11)
  )
    .toString(36)
    .toUpperCase()
    .slice(0, 5)
    .padStart(5, '0');
  const referenceId = `DSH-${dateSlug}-${shortHash}`;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  }) as JsPdfWithAutoTable;

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;
  const contentWidth = pageWidth - marginX * 2;
  const targetPct = Math.max(1, Math.min(100, Math.round(options.requiredPercentage || 75)));

  // Attendance calculations
  const totalAttended = options.attendanceRecords.reduce((s, r) => s + r.classesAttended, 0);
  const totalConducted = options.attendanceRecords.reduce((s, r) => s + r.totalClasses, 0);
  const totalMissed = Math.max(0, totalConducted - totalAttended);
  const overallAnalysis = analyzeAttendance(totalAttended, totalConducted, targetPct);

  const subjectRows = options.attendanceRecords.map((rec) => {
    const analysis = analyzeAttendance(rec.classesAttended, rec.totalClasses, targetPct);
    const advisory = analysis.isMeetingTarget
      ? `Safe: ${analysis.maxMissable} missable`
      : analysis.classesNeeded === Infinity
      ? 'Target unreachable'
      : `Attend next ${analysis.classesNeeded}`;
    return { rec, analysis, advisory };
  });
  const shortageCount = subjectRows.filter((s) => !s.analysis.isMeetingTarget).length;

  // Tasks calculations
  const totalTasks = options.studyTasks.length;
  const doneTasks = options.studyTasks.filter((t) => t.completed).length;
  const pendingTasks = options.studyTasks.filter((t) => !t.completed);
  const overdueCount = pendingTasks.filter((t) => Boolean(t.dueDate && t.dueDate < todayIso)).length;
  const completionPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const priorityRank: Record<StudyTask['priority'], number> = { high: 0, medium: 1, low: 2 };
  const tasksToRender = (options.includeCompletedTasks ? options.studyTasks : pendingTasks)
    .slice()
    .sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate && !b.dueDate) return -1;
      if (!a.dueDate && b.dueDate) return 1;
      return priorityRank[a.priority] - priorityRank[b.priority];
    });

  // Exams calculations
  const sortedExams = options.exams
    .slice()
    .sort((a, b) => a.examDate.localeCompare(b.examDate));

  // --- 1. INSTITUTIONAL LETTERHEAD BAND ---
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 28, 'F');

  doc.setFillColor(37, 99, 235);
  doc.rect(0, 28, pageWidth, 1.4, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text((options.institutionName || 'SKU Campus').toUpperCase(), marginX, 11.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(191, 219, 254);
  doc.text('STUDENT DASHBOARD ACADEMIC SUMMARY', marginX, 18.2);

  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `Academic Year: ${options.academicYear || '2025-2026'}  |  Active Term: Semester ${options.activeSemester || options.student.semester}`,
    marginX,
    23.8
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text(`Ref: ${referenceId}`, pageWidth - marginX, 11.5, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(203, 213, 225);
  doc.text(`Generated: ${formatDateDisplay(now)}`, pageWidth - marginX, 17.5, { align: 'right' });
  doc.text(
    options.isDemoMode ? 'Sample Workspace Snapshot' : 'Issued via SKU Campus Hub',
    pageWidth - marginX,
    23.2,
    { align: 'right' }
  );

  // --- 2. STUDENT PROFILE & TERM DETAILS ---
  let cursorY = 35;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.roundedRect(marginX, cursorY, contentWidth, 27, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text('STUDENT OVERVIEW & ACADEMIC STANDING', marginX + 4, cursorY + 5.2);

  doc.setDrawColor(226, 232, 240);
  doc.line(marginX + 4, cursorY + 7.2, marginX + contentWidth - 4, cursorY + 7.2);

  const col1LabelX = marginX + 4;
  const col1ValX = marginX + 34;
  const col2LabelX = marginX + contentWidth / 2 + 2;
  const col2ValX = marginX + contentWidth / 2 + 34;

  const drawMetaField = (lx: number, vx: number, y: number, label: string, value: string) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(100, 116, 139);
    doc.text(label, lx, y);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(value || '—', vx, y);
  };

  drawMetaField(col1LabelX, col1ValX, cursorY + 12.2, 'Student Name:', options.student.displayName);
  drawMetaField(col1LabelX, col1ValX, cursorY + 17.4, 'Roll / Reg No.:', options.student.rollNumber || 'N/A');
  drawMetaField(col1LabelX, col1ValX, cursorY + 22.6, 'Department:', options.student.departmentName || 'General');

  drawMetaField(
    col2LabelX,
    col2ValX,
    cursorY + 12.2,
    'Course / Sem:',
    `${options.student.courseName || 'Degree'} (Sem ${options.student.semester})`
  );
  drawMetaField(col2LabelX, col2ValX, cursorY + 17.4, 'Attendance Rule:', `${targetPct}% Minimum Required`);
  drawMetaField(
    col2LabelX,
    col2ValX,
    cursorY + 22.6,
    'Task Progress:',
    `${doneTasks} / ${totalTasks} Completed (${completionPct}%)`
  );

  cursorY += 32;

  // --- 3. 4-CARD EXECUTIVE KPI STRIP ---
  const kpiGap = 3.2;
  const kpiWidth = (contentWidth - kpiGap * 3) / 4;
  const kpiHeight = 19;

  const kpis: Array<{
    label: string;
    value: string;
    subtext: string;
    accentRgb: [number, number, number];
  }> = [
    {
      label: 'OVERALL ATTENDANCE',
      value: totalConducted > 0 ? `${overallAnalysis.currentPercentage}%` : 'N/A',
      subtext: totalConducted > 0 ? `${totalAttended}/${totalConducted} classes (${overallAnalysis.statusLabel})` : 'No classes logged',
      accentRgb: totalConducted > 0 ? statusRgb(overallAnalysis.statusLabel) : [100, 116, 139],
    },
    {
      label: 'SUBJECT SHORTAGES',
      value: `${shortageCount} / ${options.attendanceRecords.length}`,
      subtext: shortageCount === 0 ? `All meeting ${targetPct}%` : `${shortageCount} below target`,
      accentRgb: shortageCount === 0 ? [4, 120, 87] : [185, 28, 28],
    },
    {
      label: 'UPCOMING TASKS',
      value: String(pendingTasks.length),
      subtext: overdueCount > 0 ? `${overdueCount} overdue reminder(s)` : `${doneTasks} completed`,
      accentRgb: overdueCount > 0 ? [180, 83, 9] : [37, 99, 235],
    },
    {
      label: 'SCHEDULED EXAMS',
      value: String(sortedExams.length),
      subtext: sortedExams[0] ? `Next: ${sortedExams[0].subjectCode} (${daysUntilLabel(sortedExams[0].examDate)})` : 'No upcoming exams',
      accentRgb: [15, 23, 42],
    },
  ];

  kpis.forEach((kpi, idx) => {
    const x = marginX + idx * (kpiWidth + kpiGap);
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, cursorY, kpiWidth, kpiHeight, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.6);
    doc.setTextColor(100, 116, 139);
    doc.text(kpi.label, x + 3.2, cursorY + 4.8);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13.5);
    doc.setTextColor(...kpi.accentRgb);
    doc.text(kpi.value, x + 3.2, cursorY + 12.2);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.6);
    doc.setTextColor(100, 116, 139);
    doc.text(kpi.subtext, x + 3.2, cursorY + 16.6);
  });

  cursorY += kpiHeight + 7;

  // --- 4. SUBJECT-WISE ATTENDANCE STATS ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('1. Attendance Statistics by Course', marginX, cursorY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`${options.attendanceRecords.length} tracked record(s) · ${targetPct}% target`, pageWidth - marginX, cursorY, {
    align: 'right',
  });

  cursorY += 2.5;

  const subjectBody: RowInput[] =
    subjectRows.length === 0
      ? [
          [
            {
              content: 'No subject attendance records tracked yet.',
              colSpan: 9,
              styles: { halign: 'center', textColor: [100, 116, 139], fontStyle: 'italic' },
            },
          ],
        ]
      : [
          ...subjectRows.map((item, idx) => [
            String(idx + 1),
            item.rec.subjectCode,
            item.rec.subjectName,
            item.rec.recordType === 'official' ? 'Official' : 'Personal',
            String(item.rec.classesAttended),
            String(item.rec.totalClasses),
            `${item.analysis.currentPercentage}%`,
            item.analysis.statusLabel,
            item.advisory,
          ]),
          [
            { content: '', styles: { fillColor: [241, 245, 249] } },
            { content: 'TOTAL', styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
            { content: `Overall (${totalMissed} missed)`, styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
            { content: '—', styles: { halign: 'center', fillColor: [241, 245, 249] } },
            { content: String(totalAttended), styles: { halign: 'right', fontStyle: 'bold', fillColor: [241, 245, 249] } },
            { content: String(totalConducted), styles: { halign: 'right', fontStyle: 'bold', fillColor: [241, 245, 249] } },
            {
              content: totalConducted > 0 ? `${overallAnalysis.currentPercentage}%` : '—',
              styles: { halign: 'right', fontStyle: 'bold', fillColor: [241, 245, 249] },
            },
            {
              content: totalConducted > 0 ? overallAnalysis.statusLabel : 'Empty',
              styles: {
                halign: 'center',
                fontStyle: 'bold',
                fillColor: [241, 245, 249],
                textColor: totalConducted > 0 ? statusRgb(overallAnalysis.statusLabel) : [100, 116, 139],
              },
            },
            {
              content:
                totalConducted === 0
                  ? '—'
                  : overallAnalysis.isMeetingTarget
                  ? `Safe (${overallAnalysis.maxMissable} missable)`
                  : `Need +${overallAnalysis.classesNeeded} classes`,
              styles: { fontStyle: 'bold', fillColor: [241, 245, 249] },
            },
          ],
        ];

  autoTable(doc, {
    startY: cursorY,
    margin: { left: marginX, right: marginX, bottom: 18 },
    head: [['#', 'Code', 'Subject Name', 'Type', 'Attended', 'Total', 'Rate %', 'Status', 'Advisory']],
    body: subjectBody,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 7.4,
      cellPadding: { top: 2.2, right: 2.2, bottom: 2.2, left: 2.2 },
      lineColor: [226, 232, 240],
      lineWidth: 0.25,
      textColor: [30, 41, 59],
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.2,
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 7, halign: 'center' },
      1: { cellWidth: 16, fontStyle: 'bold' },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 16, halign: 'center' },
      4: { cellWidth: 15, halign: 'right' },
      5: { cellWidth: 14, halign: 'right' },
      6: { cellWidth: 15, halign: 'right', fontStyle: 'bold' },
      7: { cellWidth: 19, halign: 'center', fontStyle: 'bold' },
      8: { cellWidth: 32 },
    },
    didParseCell(data) {
      if (data.section === 'body' && data.row.index < subjectRows.length && (data.column.index === 6 || data.column.index === 7)) {
        const status = subjectRows[data.row.index].analysis.statusLabel;
        data.cell.styles.textColor = statusRgb(status);
      }
    },
  });

  cursorY = (doc.lastAutoTable?.finalY ?? cursorY) + 7;

  // --- 5. UPCOMING PERSONAL TASKS & REMINDERS ---
  if (cursorY > pageHeight - 48) {
    doc.addPage();
    cursorY = 18;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('2. Upcoming Study Tasks & Reminders', marginX, cursorY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `${pendingTasks.length} pending · ${doneTasks} completed`,
    pageWidth - marginX,
    cursorY,
    { align: 'right' }
  );

  cursorY += 2.5;

  const taskBody: RowInput[] =
    tasksToRender.length === 0
      ? [
          [
            {
              content: 'No study tasks or deadlines currently queued.',
              colSpan: 7,
              styles: { halign: 'center', textColor: [100, 116, 139], fontStyle: 'italic' },
            },
          ],
        ]
      : tasksToRender.map((t, idx) => {
          const isOverdue = Boolean(t.dueDate && !t.completed && t.dueDate < todayIso);
          const stateText = t.completed ? 'Completed' : isOverdue ? 'Overdue' : 'Pending';
          const catLabel =
            t.category === 'assignment'
              ? 'Deadline'
              : t.category === 'goal'
              ? 'Reminder'
              : t.category.charAt(0).toUpperCase() + t.category.slice(1);
          return [
            String(idx + 1),
            t.title,
            t.subjectName || 'General Study',
            catLabel,
            t.priority.toUpperCase(),
            t.dueDate || 'No due date',
            stateText,
          ];
        });

  autoTable(doc, {
    startY: cursorY,
    margin: { left: marginX, right: marginX, bottom: 18 },
    head: [['#', 'Task / Reminder', 'Course / Subject', 'Type', 'Priority', 'Due Date', 'State']],
    body: taskBody,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 7.3,
      cellPadding: { top: 2.2, right: 2.2, bottom: 2.2, left: 2.2 },
      lineColor: [226, 232, 240],
      lineWidth: 0.25,
      textColor: [30, 41, 59],
    },
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.1,
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 7, halign: 'center' },
      1: { cellWidth: 'auto', fontStyle: 'bold' },
      2: { cellWidth: 38 },
      3: { cellWidth: 18, halign: 'center' },
      4: { cellWidth: 17, halign: 'center' },
      5: { cellWidth: 22, halign: 'center' },
      6: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
    },
    didParseCell(data) {
      if (data.section === 'body' && data.row.index < tasksToRender.length) {
        if (data.column.index === 4) {
          const pri = String(data.cell.raw || '').toLowerCase();
          if (pri === 'high') data.cell.styles.textColor = [185, 28, 28];
          else if (pri === 'medium') data.cell.styles.textColor = [180, 83, 9];
        }
        if (data.column.index === 6) {
          const state = String(data.cell.raw || '').toLowerCase();
          if (state === 'completed') data.cell.styles.textColor = [4, 120, 87];
          else if (state === 'overdue') data.cell.styles.textColor = [185, 28, 28];
          else data.cell.styles.textColor = [37, 99, 235];
        }
      }
    },
  });

  cursorY = (doc.lastAutoTable?.finalY ?? cursorY) + 7;

  // --- 6. UPCOMING EXAM SCHEDULE (OPTIONAL) ---
  if (options.includeExams !== false && sortedExams.length > 0) {
    if (cursorY > pageHeight - 48) {
      doc.addPage();
      cursorY = 18;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text('3. Upcoming Examination Schedule', marginX, cursorY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`${sortedExams.length} scheduled exam(s)`, pageWidth - marginX, cursorY, { align: 'right' });

    cursorY += 2.5;

    autoTable(doc, {
      startY: cursorY,
      margin: { left: marginX, right: marginX, bottom: 18 },
      head: [['Date', 'Code', 'Course', 'Type', 'Time', 'Venue', 'Countdown']],
      body: sortedExams.slice(0, 10).map((ex) => [
        ex.examDate,
        ex.subjectCode,
        ex.subjectName,
        ex.examType.toUpperCase(),
        `${ex.startTime} - ${ex.endTime}`,
        ex.venue,
        daysUntilLabel(ex.examDate),
      ]),
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: 7.2,
        cellPadding: { top: 2, right: 2.2, bottom: 2, left: 2.2 },
        lineColor: [226, 232, 240],
        lineWidth: 0.25,
        textColor: [30, 41, 59],
      },
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7.1,
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 16, fontStyle: 'bold' },
        2: { cellWidth: 'auto' },
        3: { cellWidth: 18, halign: 'center' },
        4: { cellWidth: 26, halign: 'center' },
        5: { cellWidth: 32 },
        6: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
      },
    });

    cursorY = (doc.lastAutoTable?.finalY ?? cursorY) + 7;
  }

  // --- 7. RECENT ATTENDANCE TIMELINE LOGS (OPTIONAL) ---
  const logsToRender = (options.attendanceLogs || []).slice(0, 12);
  if (options.includeRecentLogs && logsToRender.length > 0) {
    if (cursorY > pageHeight - 48) {
      doc.addPage();
      cursorY = 18;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text('4. Recent Attendance Activity', marginX, cursorY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`Latest ${logsToRender.length} recorded session(s)`, pageWidth - marginX, cursorY, {
      align: 'right',
    });

    cursorY += 2.5;

    autoTable(doc, {
      startY: cursorY,
      margin: { left: marginX, right: marginX, bottom: 18 },
      head: [['Date', 'Course / Event', 'Scope', 'Status', 'Remarks']],
      body: logsToRender.map((log) => [
        log.date || '—',
        log.subjectName || '—',
        log.recordType === 'official' ? 'Official' : 'Personal',
        log.status.toUpperCase(),
        (log.note || '').replace(/\s*\[qr:[^\]]+\]/g, '').trim() || '—',
      ]),
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: 7.2,
        cellPadding: { top: 2, right: 2.2, bottom: 2, left: 2.2 },
        lineColor: [226, 232, 240],
        lineWidth: 0.25,
        textColor: [51, 65, 85],
      },
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7.1,
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 50, fontStyle: 'bold' },
        2: { cellWidth: 18, halign: 'center' },
        3: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
        4: { cellWidth: 'auto' },
      },
      didParseCell(data) {
        if (data.section === 'body' && data.column.index === 3) {
          const val = String(data.cell.raw || '').toLowerCase();
          if (val === 'present') data.cell.styles.textColor = [4, 120, 87];
          else if (val === 'late') data.cell.styles.textColor = [180, 83, 9];
          else if (val === 'absent') data.cell.styles.textColor = [185, 28, 28];
        }
      },
    });
  }

  // --- 8. RUNNING FOOTER ACROSS ALL PAGES ---
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p += 1) {
    doc.setPage(p);
    const footerY = pageHeight - 10;
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.25);
    doc.line(marginX, footerY - 3.5, pageWidth - marginX, footerY - 3.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `${options.institutionName || 'SKU Campus'}  |  ${options.student.rollNumber || options.student.displayName}  |  Ref: ${referenceId}`,
      marginX,
      footerY
    );
    doc.text(`Page ${p} of ${totalPages}`, pageWidth - marginX, footerY, { align: 'right' });
  }

  const fileName = `SKU_Campus_Dashboard_Summary_${sanitizeFileSegment(
    options.student.rollNumber || options.student.displayName
  )}_${dateSlug}.pdf`;

  let pdfBytes: ArrayBuffer | undefined;
  if (options.dryRun) {
    pdfBytes = doc.output('arraybuffer');
  } else {
    doc.save(fileName);
  }

  return {
    fileName,
    referenceId,
    pageCount: totalPages,
    attendancePercentage: overallAnalysis.currentPercentage,
    subjectCount: options.attendanceRecords.length,
    taskCount: tasksToRender.length,
    examCount: options.includeExams !== false ? sortedExams.length : 0,
    pdfBytes,
  };
}
