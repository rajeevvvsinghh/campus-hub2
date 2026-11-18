import { jsPDF } from 'jspdf';
import autoTable, { type RowInput } from 'jspdf-autotable';
import type { AttendanceLog, AttendanceRecord } from '../types/campus';
import { analyzeAttendance } from './attendanceMath';

export type AttendanceReportScope = 'official' | 'personal' | 'combined';

export interface AttendanceReportStudentInfo {
  displayName: string;
  rollNumber: string;
  email: string;
  departmentName: string;
  courseName: string;
  semester: number;
}

export interface AttendanceReportOptions {
  institutionName: string;
  academicYear: string;
  activeSemester: number;
  student: AttendanceReportStudentInfo;
  scope: AttendanceReportScope;
  requiredPercentage: number;
  records: AttendanceRecord[];
  logs?: AttendanceLog[];
  includeLogs?: boolean;
  includeVerificationBlock?: boolean;
  includeTargetAdvisory?: boolean;
  dryRun?: boolean;
}

export interface AttendanceReportResult {
  fileName: string;
  referenceId: string;
  pageCount: number;
  subjectCount: number;
  overallPercentage: number;
  statusLabel: 'On Track' | 'Borderline' | 'Shortage';
  pdfBytes?: ArrayBuffer;
}

function sanitizeFileSegment(value: string): string {
  return (value || 'student')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'student';
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

function scopeTitle(scope: AttendanceReportScope): string {
  if (scope === 'official') return 'OFFICIAL ATTENDANCE SUMMARY REPORT';
  if (scope === 'personal') return 'PERSONAL ATTENDANCE TRACKING REPORT';
  return 'COMBINED ATTENDANCE SUMMARY REPORT';
}

function scopeLabel(scope: AttendanceReportScope): string {
  if (scope === 'official') return 'Official College Records';
  if (scope === 'personal') return 'Personal Self-Tracking';
  return 'Combined (Official + Personal)';
}

function statusRgb(status: 'On Track' | 'Borderline' | 'Shortage'): [number, number, number] {
  if (status === 'On Track') return [4, 120, 87]; // emerald-700
  if (status === 'Borderline') return [180, 83, 9]; // amber-700
  return [185, 28, 28]; // red-700
}

type JsPdfWithAutoTable = jsPDF & {
  lastAutoTable?: {
    finalY: number;
  };
};

export function exportAttendancePdfReport(options: AttendanceReportOptions): AttendanceReportResult {
  const now = new Date();
  const dateSlug = formatDateSlug(now);
  const shortHash = Math.abs(
    `${options.student.rollNumber}-${now.getTime()}`.split('').reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) | 0, 7)
  )
    .toString(36)
    .toUpperCase()
    .slice(0, 5)
    .padStart(5, '0');
  const referenceId = `ATT-${dateSlug}-${shortHash}`;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  }) as JsPdfWithAutoTable;

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;
  const contentWidth = pageWidth - marginX * 2;

  const targetPct = Math.max(1, Math.min(100, Math.round(options.requiredPercentage)));
  const totalAttended = options.records.reduce((s, r) => s + r.classesAttended, 0);
  const totalConducted = options.records.reduce((s, r) => s + r.totalClasses, 0);
  const totalMissed = Math.max(0, totalConducted - totalAttended);
  const overallAnalysis = analyzeAttendance(totalAttended, totalConducted, targetPct);

  const subjectAnalyses = options.records.map((rec) => {
    const analysis = analyzeAttendance(rec.classesAttended, rec.totalClasses, targetPct);
    const missed = Math.max(0, rec.totalClasses - rec.classesAttended);
    const note = analysis.isMeetingTarget
      ? `Safe: max ${analysis.maxMissable} missable`
      : analysis.classesNeeded === Infinity
      ? 'Target unreachable (100%)'
      : `Attend next ${analysis.classesNeeded} consecutive`;
    return {
      record: rec,
      missed,
      analysis,
      note,
    };
  });

  const subjectsBelowTarget = subjectAnalyses.filter((item) => !item.analysis.isMeetingTarget).length;

  // --- 1. INSTITUTIONAL LETTERHEAD BAND ---
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 28, 'F');

  // Subtle blue institutional rule at bottom of header
  doc.setFillColor(37, 99, 235); // blue-600
  doc.rect(0, 28, pageWidth, 1.4, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text((options.institutionName || 'SKU Campus').toUpperCase(), marginX, 11.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(191, 219, 254); // blue-200
  doc.text(scopeTitle(options.scope), marginX, 18.2);

  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text(`Academic Year: ${options.academicYear || '2025-2026'}  |  Active Term: Semester ${options.activeSemester || options.student.semester}`, marginX, 23.8);

  // Right-aligned metadata in header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text(`Ref: ${referenceId}`, pageWidth - marginX, 11.5, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(203, 213, 225);
  doc.text(`Generated: ${formatDateDisplay(now)}`, pageWidth - marginX, 17.5, { align: 'right' });
  doc.text('Issued via SKU Campus Hub', pageWidth - marginX, 23.2, { align: 'right' });

  // --- 2. STUDENT & ACADEMIC IDENTIFICATION GRID ---
  let cursorY = 35;

  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.setLineWidth(0.3);
  doc.roundedRect(marginX, cursorY, contentWidth, 27, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text('STUDENT & ACADEMIC RECORD DETAILS', marginX + 4, cursorY + 5.2);

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

  drawMetaField(col2LabelX, col2ValX, cursorY + 12.2, 'Course / Sem:', `${options.student.courseName || 'Degree'} (Sem ${options.student.semester})`);
  drawMetaField(col2LabelX, col2ValX, cursorY + 17.4, 'Record Scope:', scopeLabel(options.scope));
  drawMetaField(col2LabelX, col2ValX, cursorY + 22.6, 'Min. Requirement:', `${targetPct}% Threshold`);

  cursorY += 32;

  // --- 3. EXECUTIVE SUMMARY KPI STRIP ---
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
      subtext: totalConducted > 0 ? overallAnalysis.statusLabel.toUpperCase() : 'NO CLASSES',
      accentRgb: totalConducted > 0 ? statusRgb(overallAnalysis.statusLabel) : [100, 116, 139],
    },
    {
      label: 'CLASSES CONDUCTED',
      value: String(totalConducted),
      subtext: `${options.records.length} Subject(s)`,
      accentRgb: [15, 23, 42],
    },
    {
      label: 'CLASSES ATTENDED',
      value: String(totalAttended),
      subtext: `${totalMissed} Missed`,
      accentRgb: [4, 120, 87],
    },
    {
      label: 'BELOW REQUIREMENT',
      value: `${subjectsBelowTarget} / ${options.records.length}`,
      subtext: subjectsBelowTarget === 0 ? 'All subjects compliant' : `${subjectsBelowTarget} shortage alert(s)`,
      accentRgb: subjectsBelowTarget === 0 ? [4, 120, 87] : [185, 28, 28],
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
    doc.setFontSize(6.8);
    doc.setTextColor(100, 116, 139);
    doc.text(kpi.subtext, x + 3.2, cursorY + 16.6);
  });

  cursorY += kpiHeight + 6;

  // --- 4. SUBJECT-WISE ATTENDANCE BREAKDOWN TABLE ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('Subject-wise Attendance Summary', marginX, cursorY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`Evaluated against ${targetPct}% minimum institutional threshold`, pageWidth - marginX, cursorY, {
    align: 'right',
  });

  cursorY += 2.5;

  const includeAdvisory = options.includeTargetAdvisory !== false;

  const subjectHead = includeAdvisory
    ? [['#', 'Code', 'Subject Name', 'Type', 'Attended', 'Conducted', 'Missed', 'Rate %', 'Status', 'Projection / Advisory']]
    : [['#', 'Code', 'Subject Name', 'Type', 'Attended', 'Conducted', 'Missed', 'Rate %', 'Status']];

  const subjectBody: RowInput[] =
    subjectAnalyses.length === 0
      ? [
          [
            {
              content: 'No attendance records found for the selected scope.',
              colSpan: includeAdvisory ? 10 : 9,
              styles: { halign: 'center', textColor: [100, 116, 139], fontStyle: 'italic' },
            },
          ],
        ]
      : subjectAnalyses.map((item, idx) => {
          const baseRow = [
            String(idx + 1),
            item.record.subjectCode,
            item.record.subjectName,
            item.record.recordType === 'official' ? 'Official' : 'Personal',
            String(item.record.classesAttended),
            String(item.record.totalClasses),
            String(item.missed),
            `${item.analysis.currentPercentage}%`,
            item.analysis.statusLabel,
          ];
          return includeAdvisory ? [...baseRow, item.note] : baseRow;
        });

  const summaryFooterRow: RowInput = includeAdvisory
    ? [
        { content: '', styles: { fillColor: [241, 245, 249] } },
        { content: 'TOTAL', styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
        { content: `Overall (${options.records.length} subjects)`, styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
        { content: '—', styles: { halign: 'center', fillColor: [241, 245, 249] } },
        { content: String(totalAttended), styles: { halign: 'right', fontStyle: 'bold', fillColor: [241, 245, 249] } },
        { content: String(totalConducted), styles: { halign: 'right', fontStyle: 'bold', fillColor: [241, 245, 249] } },
        { content: String(totalMissed), styles: { halign: 'right', fontStyle: 'bold', fillColor: [241, 245, 249] } },
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
              ? `Max ${overallAnalysis.maxMissable} missable overall`
              : `Need +${overallAnalysis.classesNeeded} classes overall`,
          styles: { fontStyle: 'bold', fillColor: [241, 245, 249] },
        },
      ]
    : [
        { content: '', styles: { fillColor: [241, 245, 249] } },
        { content: 'TOTAL', styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
        { content: `Overall (${options.records.length} subjects)`, styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
        { content: '—', styles: { halign: 'center', fillColor: [241, 245, 249] } },
        { content: String(totalAttended), styles: { halign: 'right', fontStyle: 'bold', fillColor: [241, 245, 249] } },
        { content: String(totalConducted), styles: { halign: 'right', fontStyle: 'bold', fillColor: [241, 245, 249] } },
        { content: String(totalMissed), styles: { halign: 'right', fontStyle: 'bold', fillColor: [241, 245, 249] } },
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
      ];

  autoTable(doc, {
    startY: cursorY,
    margin: { left: marginX, right: marginX, bottom: 20 },
    head: subjectHead,
    body: subjectAnalyses.length > 0 ? [...subjectBody, summaryFooterRow] : subjectBody,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 7.4,
      cellPadding: { top: 2.3, right: 2.2, bottom: 2.3, left: 2.2 },
      lineColor: [226, 232, 240],
      lineWidth: 0.25,
      textColor: [30, 41, 59],
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.2,
      halign: 'left',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: includeAdvisory
      ? {
          0: { cellWidth: 7, halign: 'center' },
          1: { cellWidth: 16, fontStyle: 'bold' },
          2: { cellWidth: 40 },
          3: { cellWidth: 15, halign: 'center' },
          4: { cellWidth: 14, halign: 'right' },
          5: { cellWidth: 16, halign: 'right' },
          6: { cellWidth: 13, halign: 'right' },
          7: { cellWidth: 15, halign: 'right', fontStyle: 'bold' },
          8: { cellWidth: 17, halign: 'center', fontStyle: 'bold' },
          9: { cellWidth: 'auto' },
        }
      : {
          0: { cellWidth: 8, halign: 'center' },
          1: { cellWidth: 19, fontStyle: 'bold' },
          2: { cellWidth: 'auto' },
          3: { cellWidth: 18, halign: 'center' },
          4: { cellWidth: 18, halign: 'right' },
          5: { cellWidth: 20, halign: 'right' },
          6: { cellWidth: 16, halign: 'right' },
          7: { cellWidth: 18, halign: 'right', fontStyle: 'bold' },
          8: { cellWidth: 22, halign: 'center', fontStyle: 'bold' },
        },
    didParseCell(data) {
      if (
        data.section === 'body' &&
        data.row.index < subjectAnalyses.length &&
        data.column.index === 8
      ) {
        const status = subjectAnalyses[data.row.index].analysis.statusLabel;
        data.cell.styles.textColor = statusRgb(status);
      }
      if (
        data.section === 'body' &&
        data.row.index < subjectAnalyses.length &&
        data.column.index === 7
      ) {
        const status = subjectAnalyses[data.row.index].analysis.statusLabel;
        data.cell.styles.textColor = statusRgb(status);
      }
    },
  });

  cursorY = (doc.lastAutoTable?.finalY ?? cursorY) + 7;

  // --- 5. RECENT ATTENDANCE LOG HISTORY (OPTIONAL) ---
  const logsToRender = (options.logs || []).slice(0, 25);
  if (options.includeLogs && logsToRender.length > 0) {
    if (cursorY > pageHeight - 52) {
      doc.addPage();
      cursorY = 18;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text('Recent Attendance Log History', marginX, cursorY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`Showing latest ${logsToRender.length} recorded session(s)`, pageWidth - marginX, cursorY, {
      align: 'right',
    });

    cursorY += 2.5;

    autoTable(doc, {
      startY: cursorY,
      margin: { left: marginX, right: marginX, bottom: 20 },
      head: [['Date', 'Subject', 'Type', 'Status', 'Remarks / Notes']],
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
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      columnStyles: {
        0: { cellWidth: 23 },
        1: { cellWidth: 52, fontStyle: 'bold' },
        2: { cellWidth: 18, halign: 'center' },
        3: { cellWidth: 22, halign: 'center', fontStyle: 'bold' },
        4: { cellWidth: 'auto' },
      },
      didParseCell(data) {
        if (data.section === 'body' && data.column.index === 3) {
          const val = String(data.cell.raw || '').toLowerCase();
          if (val === 'present') {
            data.cell.styles.textColor = [4, 120, 87];
          } else if (val === 'late') {
            data.cell.styles.textColor = [180, 83, 9];
          } else if (val === 'absent') {
            data.cell.styles.textColor = [185, 28, 28];
          } else {
            data.cell.styles.textColor = [100, 116, 139];
          }
        }
      },
    });

    cursorY = (doc.lastAutoTable?.finalY ?? cursorY) + 7;
  }

  // --- 6. COMPLIANCE POLICY NOTE & VERIFICATION SIGNATURES ---
  if (options.includeVerificationBlock !== false) {
    const blockHeight = 36;
    if (cursorY + blockHeight > pageHeight - 18) {
      doc.addPage();
      cursorY = 18;
    }

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.roundedRect(marginX, cursorY, contentWidth, blockHeight, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.4);
    doc.setTextColor(15, 23, 42);
    doc.text('ATTENDANCE POLICY & OFFICIAL VERIFICATION', marginX + 4, cursorY + 5.2);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(71, 85, 105);
    doc.text(
      `Computation Formula: Attendance % = (Classes Attended / Total Classes Conducted) x 100. Required threshold: ${targetPct}%.`,
      marginX + 4,
      cursorY + 10.2
    );
    doc.text(
      'This summary is system-generated from SKU Campus academic records for official student record-keeping and institutional review.',
      marginX + 4,
      cursorY + 14.4
    );

    const sigLineY = cursorY + 28.5;
    doc.setDrawColor(148, 163, 184);
    doc.line(marginX + 4, sigLineY, marginX + 68, sigLineY);
    doc.line(pageWidth - marginX - 68, sigLineY, pageWidth - marginX - 4, sigLineY);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(30, 41, 59);
    doc.text('Student Signature & Date', marginX + 4, sigLineY + 4);
    doc.text('Faculty Advisor / Registrar Seal', pageWidth - marginX - 68, sigLineY + 4);
  }

  // --- 7. RUNNING FOOTER ACROSS ALL PAGES ---
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

  const fileName = `SKU_Campus_Attendance_${sanitizeFileSegment(
    options.student.rollNumber || options.student.displayName
  )}_${options.scope}_${dateSlug}.pdf`;

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
    subjectCount: options.records.length,
    overallPercentage: overallAnalysis.currentPercentage,
    statusLabel: overallAnalysis.statusLabel,
    pdfBytes,
  };
}
