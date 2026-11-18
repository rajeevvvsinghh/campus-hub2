import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Book,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  FolderPlus,
  Lock,
  Plus,
  Presentation,
  ScrollText,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useCampus } from '../context/CampusContext';
import { createMaterialPdfBlob, triggerDownload } from '../lib/pdfExport';
import { BLUEPRINT_CONSTRAINTS, type MaterialType, type StudyMaterial } from '../types/campus';

const TYPE_LABELS: Record<MaterialType, string> = {
  notes: 'Lecture Notes',
  books: 'Books & Textbooks',
  syllabus: 'Syllabus & Curriculum',
  pyq: 'Previous Year Paper',
  assignment: 'Assignment',
  slides: 'Lecture Slides',
};

const QUICK_TYPES: Array<{
  id: MaterialType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'notes', label: 'Lecture Notes', icon: FileText },
  { id: 'books', label: 'Books & Textbooks', icon: Book },
  { id: 'syllabus', label: 'Syllabus', icon: ScrollText },
  { id: 'pyq', label: 'PYQ Papers', icon: FileSpreadsheet },
  { id: 'slides', label: 'Slides', icon: Presentation },
  { id: 'assignment', label: 'Assignments', icon: ClipboardList },
];

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

export const ContentManagementSection: React.FC = () => {
  const {
    profile,
    activeRoleView,
    isDemoMode,
    departments,
    subjects,
    materials,
    uploadAndCreateMaterial,
    removeMaterial,
    createSubjectItem,
    setActiveView,
  } = useCampus();

  // Enforce both authenticated backend role (in live mode) and active workspace role view
  const hasPrivilegedRole = isDemoMode
    ? activeRoleView === 'admin' || activeRoleView === 'faculty'
    : (profile?.role === 'admin' || profile?.role === 'faculty') &&
      (activeRoleView === 'admin' || activeRoleView === 'faculty');

  const effectiveRoleLabel = activeRoleView === 'admin' ? 'Administrator' : 'Faculty';

  // Categorization state
  const [deptId, setDeptId] = useState(departments[0]?.id || 'dept_cse');
  const [courseName, setCourseName] = useState(departments[0]?.courses[0] || 'B.Tech Computer Science');
  const [semester, setSemester] = useState<number>(5);
  const [subjectId, setSubjectId] = useState(subjects[0]?.id || '');
  const [showAllDeptSubjects, setShowAllDeptSubjects] = useState(false);
  const [unit, setUnit] = useState(subjects[0]?.units[0] || 'Unit 1');
  const [customUnit, setCustomUnit] = useState('');

  // Quick-add subject inline drawer
  const [quickSubjectOpen, setQuickSubjectOpen] = useState(false);
  const [newSubCode, setNewSubCode] = useState('');
  const [newSubName, setNewSubName] = useState('');
  const [creatingSubject, setCreatingSubject] = useState(false);

  // Material payload state
  const [title, setTitle] = useState('');
  const [materialType, setMaterialType] = useState<MaterialType>('notes');
  const [description, setDescription] = useState('');
  const [contentPreview, setContentPreview] = useState('');
  const [isOfficial, setIsOfficial] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Upload lifecycle state
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const [publishStatus, setPublishStatus] = useState<{
    kind: 'success' | 'warning';
    title: string;
    detail: string;
  } | null>(null);

  // Content library filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDeptId, setFilterDeptId] = useState('all');
  const [filterType, setFilterType] = useState<'all' | MaterialType>('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const selectedDept = useMemo(
    () => departments.find((d) => d.id === deptId) || departments[0],
    [departments, deptId]
  );

  const availableCourses = useMemo(() => {
    const deptCourses = selectedDept?.courses || [];
    const subjectCourses = subjects
      .filter((s) => s.departmentId === deptId)
      .map((s) => s.courseName);
    const merged = Array.from(new Set([...deptCourses, ...subjectCourses].filter(Boolean)));
    return merged.length > 0 ? merged : ['B.Tech Computer Science'];
  }, [selectedDept, subjects, deptId]);

  const semesterOptions = useMemo(() => {
    const count = Math.max(1, Math.min(12, selectedDept?.semestersCount || 8));
    return Array.from({ length: count }, (_, idx) => idx + 1);
  }, [selectedDept]);

  const matchingSubjects = useMemo(() => {
    const exact = subjects.filter(
      (s) =>
        s.departmentId === deptId &&
        (!courseName || s.courseName === courseName) &&
        s.semester === semester
    );
    if (exact.length > 0 && !showAllDeptSubjects) return exact;
    const deptWide = subjects.filter((s) => s.departmentId === deptId);
    return deptWide.length > 0 ? deptWide : subjects;
  }, [subjects, deptId, courseName, semester, showAllDeptSubjects]);

  const activeSubject = useMemo(
    () => matchingSubjects.find((s) => s.id === subjectId) || matchingSubjects[0] || null,
    [matchingSubjects, subjectId]
  );

  // Keep cascading selections valid when department/course/semester changes
  useEffect(() => {
    if (!availableCourses.includes(courseName)) {
      setCourseName(availableCourses[0] || '');
    }
  }, [availableCourses, courseName]);

  useEffect(() => {
    if (matchingSubjects.length > 0 && !matchingSubjects.some((s) => s.id === subjectId)) {
      const first = matchingSubjects[0];
      setSubjectId(first.id);
      setUnit(first.units[0] || 'Unit 1');
    }
  }, [matchingSubjects, subjectId]);

  useEffect(() => {
    if (
      activeSubject &&
      activeSubject.units.length > 0 &&
      !activeSubject.units.includes(unit) &&
      unit !== 'Complete Textbook' &&
      unit !== 'Full Semester Syllabus'
    ) {
      setUnit(activeSubject.units[0]);
    }
  }, [activeSubject, unit]);

  const filteredMaterials = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return materials.filter((m) => {
      if (filterDeptId !== 'all' && m.departmentId !== filterDeptId) return false;
      if (filterType !== 'all' && m.type !== filterType) return false;
      if (q) {
        const hay = `${m.title} ${m.subjectName} ${m.courseName} ${m.unit} ${m.fileName} ${m.uploadedByName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [materials, filterDeptId, filterType, searchQuery]);

  const handleFilePicked = (file: File | null) => {
    setFormError(null);
    if (!file) {
      setSelectedFile(null);
      return;
    }
    const lowerName = file.name.toLowerCase();
    const isPdf = file.type === 'application/pdf' || lowerName.endsWith('.pdf');
    const isText = file.type === 'text/plain' || lowerName.endsWith('.txt') || lowerName.endsWith('.md');

    if (!isPdf && !isText) {
      setFormError('Only PDF (.pdf) or plain/markdown note files (.txt, .md) are supported.');
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setFormError('File exceeds the 25 MB upload limit. Please compress the PDF and try again.');
      return;
    }

    setSelectedFile(file);
    if (!title.trim()) {
      const inferred = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
      setTitle(inferred.slice(0, BLUEPRINT_CONSTRAINTS.MAX_TITLE_LEN));
    }

    if (isText) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setContentPreview(reader.result.slice(0, 7500));
        }
      };
      reader.readAsText(file);
    }
  };

  const handleQuickCreateSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubCode.trim() || !newSubName.trim()) return;
    setCreatingSubject(true);
    try {
      await createSubjectItem({
        code: newSubCode.trim().toUpperCase(),
        name: newSubName.trim(),
        departmentId: deptId,
        courseName: courseName || 'B.Tech Computer Science',
        semester,
        credits: 4,
        facultyName: profile?.displayName || 'Department Faculty',
        units: ['Unit 1: Foundations', 'Unit 2: Core Concepts', 'Unit 3: Advanced Topics'],
      });
      setNewSubCode('');
      setNewSubName('');
      setQuickSubjectOpen(false);
    } finally {
      setCreatingSubject(false);
    }
  };

  const handlePublishMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setPublishStatus(null);

    if (!hasPrivilegedRole) {
      setFormError('Access denied: Administrator or Faculty privileges are required.');
      return;
    }

    const cleanTitle = title.trim();
    if (cleanTitle.length < 2) {
      setFormError('Material title must be at least 2 characters.');
      return;
    }
    if (!activeSubject) {
      setFormError('Please select or create a subject before publishing.');
      return;
    }
    if (!selectedFile && !contentPreview.trim() && !description.trim()) {
      setFormError('Please attach a PDF file or enter notes/syllabus details to publish.');
      return;
    }

    const finalUnit = (customUnit.trim() || unit || 'Unit 1').slice(0, 100);

    setUploading(true);
    setUploadProgress(selectedFile ? 8 : 50);

    try {
      const result = await uploadAndCreateMaterial({
        title: cleanTitle.slice(0, BLUEPRINT_CONSTRAINTS.MAX_TITLE_LEN),
        description: description.trim().slice(0, BLUEPRINT_CONSTRAINTS.MAX_DESC_LEN),
        type: materialType,
        departmentId: deptId,
        courseName: courseName || activeSubject.courseName,
        semester,
        subjectId: activeSubject.id,
        subjectName: activeSubject.name,
        unit: finalUnit,
        isOfficial,
        file: selectedFile,
        contentPreview: (contentPreview.trim() || description.trim()).slice(0, 8000),
        onProgress: (pct) => setUploadProgress(pct),
      });

      const deptLabel = selectedDept?.code || deptId;
      if (selectedFile && !result.storageUsed) {
        setPublishStatus({
          kind: 'warning',
          title: `Catalog entry pushed to Firestore (${result.materialId})`,
          detail: `Firebase Storage could not store "${selectedFile.name}" (${result.storageError || 'Storage unavailable'}). Enable Firebase Storage & write rules in Firebase Console to host raw PDF binaries, or include study notes in Notes Content for instant PDF preview/download.`,
        });
      } else {
        setPublishStatus({
          kind: 'success',
          title: `Published ${TYPE_LABELS[materialType]} "${cleanTitle}" to ${deptLabel} · Sem ${semester} · ${activeSubject.code}`,
          detail: selectedFile
            ? isDemoMode
              ? 'Stored in Demo Workspace with local PDF preview & download enabled.'
              : 'PDF binary uploaded to Firebase Storage and metadata pushed to Firestore library.'
            : 'Record pushed to Firestore Study Material Library.',
        });
      }

      setTitle('');
      setDescription('');
      setContentPreview('');
      setCustomUnit('');
      setSelectedFile(null);
      setUploadProgress(0);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to publish study material.');
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadMaterial = (mat: StudyMaterial) => {
    if (mat.fileUrl) {
      triggerDownload(mat.fileUrl, mat.fileName);
      return;
    }
    const blob = createMaterialPdfBlob({
      title: mat.title,
      subjectName: mat.subjectName,
      unit: mat.unit,
      author: mat.uploadedByName,
      body: mat.contentPreview || mat.description,
    });
    triggerDownload(blob, mat.fileName.endsWith('.pdf') ? mat.fileName : `${mat.fileName}.pdf`);
  };

  const handleDelete = async (mat: StudyMaterial) => {
    setDeletingId(mat.id);
    try {
      await removeMaterial(mat.id);
    } finally {
      setDeletingId(null);
    }
  };

  if (!hasPrivilegedRole) {
    return (
      <section className="cc-card p-6 space-y-3">
        <div className="flex items-center gap-2.5 text-slate-900 dark:text-white">
          <Lock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          <h3 className="font-display text-base font-semibold">Content Management — Restricted Access</h3>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          Uploading and managing official department PDFs, textbooks, syllabi, notes, and question papers requires an active{' '}
          <span className="font-semibold">Administrator</span> or <span className="font-semibold">Faculty</span> role.
        </p>
      </section>
    );
  }

  const titlePlaceholder =
    materialType === 'books'
      ? 'e.g. Database System Concepts — Silberschatz (7th Ed.)'
      : materialType === 'syllabus'
      ? 'e.g. CS502 Operating Systems Official University Syllabus'
      : materialType === 'pyq'
      ? 'e.g. CS502 End-Semester Paper Dec 2024'
      : 'e.g. Unit 3 Deadlocks & Memory Management Notes';

  const descPlaceholder =
    materialType === 'books'
      ? 'Author, publisher, edition, and chapters recommended for semester exams...'
      : materialType === 'syllabus'
      ? 'Unit-wise syllabus breakdown, credit structure, and recommended reference books...'
      : 'Concise summary of syllabus topics, exam weightage, or lecture coverage...';

  return (
    <section
      aria-labelledby="content-management-heading"
      className="cc-card p-6 space-y-6"
    >
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-white/[0.06]">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <h3 id="content-management-heading" className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Content Management — Official PDF, Books &amp; Syllabus Publisher
            </h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex flex-wrap items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>
              Authorized as <span className="font-medium text-slate-700 dark:text-slate-200">{effectiveRoleLabel}</span>
            </span>
            <span>·</span>
            <span>
              {isDemoMode
                ? 'Demo Mode (Local Session Library)'
                : 'Live Cloud Sync (Firebase Storage + Firestore /materials)'}
            </span>
          </p>
        </div>

        <button
          type="button"
          onClick={() => setActiveView('materials')}
          className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-white/[0.1] bg-white dark:bg-[#141925] text-xs font-medium hover:bg-slate-50 dark:hover:bg-white/[0.06] self-start sm:self-auto whitespace-nowrap transition-colors"
        >
          View Student Library
        </button>
      </div>

      {/* Status & Error Alerts */}
      {formError && (
        <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{formError}</span>
          </div>
          <button type="button" onClick={() => setFormError(null)} aria-label="Dismiss error" className="p-0.5">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {publishStatus && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-start justify-between gap-3 ${
            publishStatus.kind === 'warning'
              ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200'
              : 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900 text-emerald-900 dark:text-emerald-200'
          }`}
        >
          <div className="space-y-1">
            <p className="font-semibold flex items-center gap-1.5">
              {publishStatus.kind === 'warning' ? (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              )}
              {publishStatus.title}
            </p>
            <p className="opacity-90 leading-relaxed">{publishStatus.detail}</p>
          </div>
          <button type="button" onClick={() => setPublishStatus(null)} aria-label="Dismiss status" className="p-0.5">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left: Upload & Categorization Form */}
        <form onSubmit={handlePublishMaterial} className="xl:col-span-6 min-w-0 space-y-4">
          <div className="p-4 cc-inset space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                1. Choose Resource Type &amp; Categorize
              </p>
              <button
                type="button"
                onClick={() => setQuickSubjectOpen((prev) => !prev)}
                className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                {quickSubjectOpen ? 'Close Subject Creator' : 'New Subject'}
              </button>
            </div>

            {/* Visual Quick Type Picker */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {QUICK_TYPES.map((qt) => {
                const Icon = qt.icon;
                const active = materialType === qt.id;
                return (
                  <button
                    key={qt.id}
                    type="button"
                    onClick={() => {
                      setMaterialType(qt.id);
                      if (qt.id === 'books') setUnit('Complete Textbook');
                      if (qt.id === 'syllabus') setUnit('Full Semester Syllabus');
                    }}
                    className={`px-3 py-2 rounded-xl border text-left transition-all flex items-center gap-2 ${
                      active
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                        : 'bg-white dark:bg-[#0B1018] border-slate-200/80 dark:border-white/[0.08] text-slate-700 dark:text-slate-300 hover:border-blue-400'
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-white' : 'text-blue-600 dark:text-blue-400'}`} />
                    <span className="text-xs font-medium truncate">{qt.label}</span>
                  </button>
                );
              })}
            </div>

            {quickSubjectOpen && (
              <div className="p-3 rounded-xl bg-white dark:bg-[#0B1018] border border-slate-200/80 dark:border-white/[0.08] space-y-2.5">
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Add a subject under {selectedDept?.code || deptId} · {courseName} · Semester {semester}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={newSubCode}
                    onChange={(e) => setNewSubCode(e.target.value)}
                    placeholder="Code (CS509)"
                    className="px-2.5 py-1.5 text-xs cc-input"
                  />
                  <input
                    type="text"
                    value={newSubName}
                    onChange={(e) => setNewSubName(e.target.value)}
                    placeholder="Subject Name"
                    className="sm:col-span-2 px-2.5 py-1.5 text-xs cc-input"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={creatingSubject || !newSubCode.trim() || !newSubName.trim()}
                    onClick={handleQuickCreateSubject}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium disabled:opacity-50"
                  >
                    {creatingSubject ? 'Adding...' : 'Create Subject'}
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="cm-dept" className="block text-xs font-medium mb-1">
                  Department
                </label>
                <select
                  id="cm-dept"
                  value={deptId}
                  onChange={(e) => setDeptId(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#0B1018] border border-slate-200/80 dark:border-white/[0.08]"
                >
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.code} · {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="cm-course" className="block text-xs font-medium mb-1">
                  Course / Program
                </label>
                <select
                  id="cm-course"
                  value={courseName}
                  onChange={(e) => setCourseName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#0B1018] border border-slate-200/80 dark:border-white/[0.08]"
                >
                  {availableCourses.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="cm-semester" className="block text-xs font-medium mb-1">
                  Semester
                </label>
                <select
                  id="cm-semester"
                  value={semester}
                  onChange={(e) => setSemester(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#0B1018] border border-slate-200/80 dark:border-white/[0.08] font-mono tabular-nums"
                >
                  {semesterOptions.map((sem) => (
                    <option key={sem} value={sem}>
                      Semester {sem}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="cm-subject" className="block text-xs font-medium">
                    Subject
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowAllDeptSubjects((prev) => !prev)}
                    className="text-[11px] text-slate-500 hover:text-blue-600 dark:hover:text-blue-400"
                  >
                    {showAllDeptSubjects ? 'Filter by Sem' : 'All Dept Subjects'}
                  </button>
                </div>
                <select
                  id="cm-subject"
                  value={activeSubject?.id || ''}
                  onChange={(e) => setSubjectId(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#0B1018] border border-slate-200/80 dark:border-white/[0.08]"
                >
                  {matchingSubjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} · {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="cm-unit" className="block text-xs font-medium mb-1">
                  Unit / Scope
                </label>
                <select
                  id="cm-unit"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#0B1018] border border-slate-200/80 dark:border-white/[0.08]"
                >
                  {(activeSubject?.units || ['Unit 1']).map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                  <option value="Complete Textbook">Complete Textbook</option>
                  <option value="Full Semester Syllabus">Full Semester Syllabus</option>
                </select>
              </div>

              <div>
                <label htmlFor="cm-type" className="block text-xs font-medium mb-1">
                  Material Type
                </label>
                <select
                  id="cm-type"
                  value={materialType}
                  onChange={(e) => setMaterialType(e.target.value as MaterialType)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#0B1018] border border-slate-200/80 dark:border-white/[0.08]"
                >
                  <option value="notes">Lecture Notes</option>
                  <option value="books">Books &amp; Textbooks</option>
                  <option value="syllabus">Syllabus &amp; Curriculum</option>
                  <option value="pyq">Previous Year Paper (PYQ)</option>
                  <option value="assignment">Assignment</option>
                  <option value="slides">Lecture Slides</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="cm-custom-unit" className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                Optional Custom Unit / Edition Override (leave empty to use selected scope above)
              </label>
              <input
                id="cm-custom-unit"
                type="text"
                maxLength={100}
                value={customUnit}
                onChange={(e) => setCustomUnit(e.target.value)}
                placeholder="e.g. Unit 4: Transaction Management or 10th Edition"
                className="w-full px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-[#0B1018] border border-slate-200/80 dark:border-white/[0.08]"
              />
            </div>
          </div>

          {/* Step 2: File & Metadata */}
          <div className="p-4 cc-inset space-y-3">
            <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              2. Upload PDF &amp; {TYPE_LABELS[materialType]} Details
            </p>

            <div>
              <label htmlFor="cm-title" className="block text-xs font-medium mb-1">
                {materialType === 'books'
                  ? 'Book Title & Author'
                  : materialType === 'syllabus'
                  ? 'Syllabus Title'
                  : 'Material Title'}
              </label>
              <input
                id="cm-title"
                type="text"
                required
                maxLength={BLUEPRINT_CONSTRAINTS.MAX_TITLE_LEN}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={titlePlaceholder}
                className="w-full px-3 py-2 text-sm rounded-xl bg-white dark:bg-[#0B1018] border border-slate-200/80 dark:border-white/[0.08]"
              />
            </div>

            <div>
              <span className="block text-xs font-medium mb-1">
                {materialType === 'books'
                  ? 'Textbook PDF File (Max 25 MB)'
                  : materialType === 'syllabus'
                  ? 'Syllabus PDF / Document File (Max 25 MB)'
                  : 'PDF / Study Document File (Max 25 MB)'}
              </span>
              <label className="flex flex-col items-center justify-center gap-1.5 px-4 py-4 rounded-xl border border-dashed border-slate-300 dark:border-white/[0.15] bg-white dark:bg-[#0B1018] cursor-pointer hover:border-blue-600 transition-colors text-center">
                <Upload className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                  {selectedFile
                    ? `${selectedFile.name} (${Math.max(1, Math.round(selectedFile.size / 1024))} KB)`
                    : 'Select PDF (.pdf) or Notes (.txt, .md) file'}
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Pushed to Firebase Storage &amp; indexed in Firestore Study Library
                </span>
                <input
                  type="file"
                  accept=".pdf,.txt,.md,application/pdf,text/plain"
                  onChange={(e) => handleFilePicked(e.target.files?.[0] || null)}
                  className="hidden"
                />
              </label>
              {selectedFile && (
                <button
                  type="button"
                  onClick={() => setSelectedFile(null)}
                  className="mt-1.5 text-[11px] text-red-600 dark:text-red-400 hover:underline"
                >
                  Remove attached file
                </button>
              )}
            </div>

            <div>
              <label htmlFor="cm-desc" className="block text-xs font-medium mb-1">
                Description
              </label>
              <textarea
                id="cm-desc"
                rows={2}
                maxLength={BLUEPRINT_CONSTRAINTS.MAX_DESC_LEN}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={descPlaceholder}
                className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#0B1018] border border-slate-200/80 dark:border-white/[0.08]"
              />
            </div>

            <div>
              <label htmlFor="cm-preview" className="block text-xs font-medium mb-1">
                {materialType === 'syllabus'
                  ? 'Syllabus Modules & Course Outcomes (enables instant Preview & AI Quiz)'
                  : materialType === 'books'
                  ? 'Chapter Index / Key Excerpt (enables instant AI Doubt Solver & Preview)'
                  : 'Notes Excerpt / Key Concepts (enables instant AI Doubt Solver & inline preview)'}
              </label>
              <textarea
                id="cm-preview"
                rows={3}
                maxLength={8000}
                value={contentPreview}
                onChange={(e) => setContentPreview(e.target.value)}
                placeholder={
                  materialType === 'syllabus'
                    ? 'Unit 1: ...\nUnit 2: ...\nReference Textbooks & Grading Scheme...'
                    : materialType === 'books'
                    ? 'Table of contents, key chapters, or study summary...'
                    : 'Optional key points, formulas, or syllabus outline...'
                }
                className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-white dark:bg-[#0B1018] border border-slate-200/80 dark:border-white/[0.08]"
              />
            </div>

            <label className="flex items-center gap-2 text-xs font-medium cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={isOfficial}
                onChange={(e) => setIsOfficial(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-blue-600"
              />
              Publish as Official Curriculum Material
            </label>

            {uploading && (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-300">
                  <span>{selectedFile ? 'Uploading PDF to Firebase Storage...' : 'Saving to Firestore...'}</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-white/[0.1] overflow-hidden">
                  <div
                    className="h-full bg-blue-600 transition-all duration-200"
                    style={{ width: `${Math.max(8, uploadProgress)}%` }}
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={uploading}
              className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60 transition-colors"
            >
              <Plus className="w-4 h-4" />
              {uploading ? 'Publishing to Library...' : `Publish ${TYPE_LABELS[materialType]} to Firestore & Storage`}
            </button>
          </div>
        </form>

        {/* Right: Published Study Materials Catalog */}
        <div className="xl:col-span-6 min-w-0 flex flex-col border border-slate-200/80 dark:border-white/[0.08] rounded-2xl overflow-hidden bg-white dark:bg-[#0B1018]">
          <div className="p-4 bg-slate-50/80 dark:bg-[#141925] border-b border-slate-200/80 dark:border-white/[0.08] space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                Published Content Repository ({filteredMaterials.length})
              </h4>
              <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                Total: {materials.length}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search materials..."
                  className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-xl bg-white dark:bg-[#0B1018] border border-slate-200/80 dark:border-white/[0.08]"
                />
              </div>

              <select
                aria-label="Filter repository by department"
                value={filterDeptId}
                onChange={(e) => setFilterDeptId(e.target.value)}
                className="px-2.5 py-1.5 text-xs rounded-xl bg-white dark:bg-[#0B1018] border border-slate-200/80 dark:border-white/[0.08]"
              >
                <option value="all">All Departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code} · {d.name}
                  </option>
                ))}
              </select>

              <select
                aria-label="Filter repository by material type"
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as 'all' | MaterialType)}
                className="px-2.5 py-1.5 text-xs rounded-xl bg-white dark:bg-[#0B1018] border border-slate-200/80 dark:border-white/[0.08]"
              >
                <option value="all">All Types</option>
                <option value="notes">Lecture Notes</option>
                <option value="books">Books &amp; Textbooks</option>
                <option value="syllabus">Syllabus &amp; Curriculum</option>
                <option value="pyq">Previous Year Papers</option>
                <option value="assignment">Assignments</option>
                <option value="slides">Lecture Slides</option>
              </select>
            </div>
          </div>

          <div className="flex-1 divide-y divide-slate-100 dark:divide-white/[0.06] max-h-[600px] overflow-y-auto">
            {filteredMaterials.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                No study materials match these filters. Upload a PDF using the form on the left.
              </div>
            ) : (
              filteredMaterials.map((mat) => {
                const canDelete =
                  activeRoleView === 'admin' || (profile && mat.uploadedByUid === profile.uid);
                const deptCode = departments.find((d) => d.id === mat.departmentId)?.code || mat.departmentId;

                return (
                  <div key={mat.id} className="p-4 flex items-start justify-between gap-3 hover:bg-slate-50/70 dark:hover:bg-white/[0.03] transition-colors">
                    <div className="min-w-0 space-y-1">
                      <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                        {mat.title}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {deptCode} · {mat.courseName} · Sem {mat.semester} · {mat.subjectName} · {mat.unit}
                      </p>
                      <p className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-1.5">
                        <span>{TYPE_LABELS[mat.type]}</span>
                        <span>·</span>
                        <span>{mat.fileName} ({mat.fileSizeLabel})</span>
                        <span>·</span>
                        <span className={mat.fileUrl ? 'text-emerald-600 dark:text-emerald-400' : 'text-blue-600 dark:text-blue-400'}>
                          {mat.fileUrl ? 'Stored PDF' : 'Catalog PDF'}
                        </span>
                        <span>·</span>
                        <span>{mat.isOfficial ? 'Official' : 'Personal'}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleDownloadMaterial(mat)}
                        title="Open or download PDF"
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-white/[0.1] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.08]"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                      {canDelete && (
                        <button
                          type="button"
                          disabled={deletingId === mat.id}
                          onClick={() => handleDelete(mat)}
                          title="Delete material"
                          aria-label={`Delete ${mat.title}`}
                          className="p-1.5 rounded-lg border border-slate-200 dark:border-white/[0.1] text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
