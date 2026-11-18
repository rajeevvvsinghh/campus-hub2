import React, { useEffect, useMemo, useState } from 'react';
import {
  Book,
  Bookmark,
  Bot,
  CheckCircle2,
  ClipboardList,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  FolderTree,
  Plus,
  Presentation,
  ScrollText,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useCampus } from '../context/CampusContext';
import { createMaterialPdfBlob, triggerDownload } from '../lib/pdfExport';
import type { MaterialType, StudyMaterial } from '../types/campus';

const TYPE_LABELS: Record<MaterialType, string> = {
  notes: 'Lecture Notes',
  books: 'Books & Textbooks',
  syllabus: 'Syllabus',
  pyq: 'Previous Year Paper',
  assignment: 'Assignment',
  slides: 'Lecture Slides',
};

const TYPE_OPTIONS: Array<{
  id: MaterialType;
  label: string;
  short: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'notes', label: 'Lecture Notes', short: 'Notes', hint: 'Unit-wise handwritten or typed notes', icon: FileText },
  { id: 'books', label: 'Books & Textbooks', short: 'Book', hint: 'Reference textbooks, editions & e-books', icon: Book },
  { id: 'syllabus', label: 'Course Syllabus', short: 'Syllabus', hint: 'Official unit syllabus & outcomes', icon: ScrollText },
  { id: 'pyq', label: 'Previous Year Paper', short: 'PYQ', hint: 'Past university exam question papers', icon: FileSpreadsheet },
  { id: 'slides', label: 'Lecture Slides', short: 'Slides', hint: 'Classroom slide decks & presentations', icon: Presentation },
  { id: 'assignment', label: 'Assignment Sheet', short: 'Assignment', hint: 'Lab sheets & homework problem sets', icon: ClipboardList },
];

const getTypeIcon = (type: MaterialType) => {
  switch (type) {
    case 'books':
      return Book;
    case 'syllabus':
      return ScrollText;
    case 'pyq':
      return FileSpreadsheet;
    case 'slides':
      return Presentation;
    case 'assignment':
      return ClipboardList;
    default:
      return FileText;
  }
};

export const MaterialsLibraryView: React.FC = () => {
  const {
    profile,
    activeRoleView,
    departments,
    subjects,
    materials,
    bookmarks,
    toggleBookmarkMaterial,
    recordMaterialView,
    uploadAndCreateMaterial,
    removeMaterial,
    openAiWithMaterial,
    materialUploadRequested,
    clearMaterialUploadRequest,
  } = useCampus();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState('all');
  const [selectedCourse, setSelectedCourse] = useState('all');
  const [selectedSemester, setSelectedSemester] = useState<string>('all');
  const [selectedSubject, setSelectedSubject] = useState('all');
  const [selectedUnit, setSelectedUnit] = useState('all');
  const [selectedType, setSelectedType] = useState<'all' | MaterialType | 'bookmarked' | 'recent'>('all');

  const [previewMaterial, setPreviewMaterial] = useState<StudyMaterial | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  // Upload form state
  const [upTitle, setUpTitle] = useState('');
  const [upDesc, setUpDesc] = useState('');
  const [upType, setUpType] = useState<MaterialType>('notes');
  const [upSubjectId, setUpSubjectId] = useState(subjects[0]?.id || '');
  const [upUnit, setUpUnit] = useState(subjects[0]?.units[0] || 'Unit 1');
  const [upOfficial, setUpOfficial] = useState(activeRoleView !== 'student');
  const [upPreviewText, setUpPreviewText] = useState('');
  const [upFile, setUpFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadNotice, setUploadNotice] = useState<{ kind: 'success' | 'warning'; text: string } | null>(null);

  const openUploadModal = (presetType?: MaterialType) => {
    setUploadError(null);
    setUpOfficial(activeRoleView !== 'student');
    if (presetType) {
      setUpType(presetType);
    }
    if (!upSubjectId && subjects[0]) {
      setUpSubjectId(subjects[0].id);
      setUpUnit(subjects[0].units[0] || 'Unit 1');
    }
    setUploadOpen(true);
  };

  useEffect(() => {
    if (materialUploadRequested) {
      openUploadModal();
      clearMaterialUploadRequest();
    }
  }, [materialUploadRequested]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPreviewMaterial(null);
        setUploadOpen(false);
      }
    };
    if (previewMaterial || uploadOpen) {
      window.addEventListener('keydown', onKeyDown);
    }
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [previewMaterial, uploadOpen]);

  const bookmarkedIds = useMemo(
    () => new Set(bookmarks.filter((b) => b.isBookmarked).map((b) => b.materialId)),
    [bookmarks]
  );

  const recentIds = useMemo(
    () => new Set(bookmarks.filter((b) => b.lastViewedAt).map((b) => b.materialId)),
    [bookmarks]
  );

  const availableCourses = useMemo(() => {
    const depts = selectedDept === 'all' ? departments : departments.filter((d) => d.id === selectedDept);
    return Array.from(new Set(depts.flatMap((d) => d.courses)));
  }, [departments, selectedDept]);

  const availableSubjects = useMemo(() => {
    return subjects.filter((s) => {
      if (selectedDept !== 'all' && s.departmentId !== selectedDept) return false;
      if (selectedCourse !== 'all' && s.courseName !== selectedCourse) return false;
      if (selectedSemester !== 'all' && s.semester !== Number(selectedSemester)) return false;
      return true;
    });
  }, [subjects, selectedDept, selectedCourse, selectedSemester]);

  const availableUnits = useMemo(() => {
    const targetSubs =
      selectedSubject === 'all' ? availableSubjects : availableSubjects.filter((s) => s.id === selectedSubject);
    return Array.from(new Set(targetSubs.flatMap((s) => s.units)));
  }, [availableSubjects, selectedSubject]);

  const filteredMaterials = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return materials.filter((m) => {
      if (selectedDept !== 'all' && m.departmentId !== selectedDept) return false;
      if (selectedCourse !== 'all' && m.courseName !== selectedCourse) return false;
      if (selectedSemester !== 'all' && m.semester !== Number(selectedSemester)) return false;
      if (selectedSubject !== 'all' && m.subjectId !== selectedSubject) return false;
      if (selectedUnit !== 'all' && m.unit !== selectedUnit) return false;
      if (selectedType === 'bookmarked' && !bookmarkedIds.has(m.id)) return false;
      if (selectedType === 'recent' && !recentIds.has(m.id)) return false;
      if (
        selectedType !== 'all' &&
        selectedType !== 'bookmarked' &&
        selectedType !== 'recent' &&
        m.type !== selectedType
      ) {
        return false;
      }
      if (q) {
        const hay = `${m.title} ${m.description} ${m.subjectName} ${m.unit} ${m.uploadedByName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    materials,
    selectedDept,
    selectedCourse,
    selectedSemester,
    selectedSubject,
    selectedUnit,
    selectedType,
    bookmarkedIds,
    recentIds,
    searchQuery,
  ]);

  const libraryCounts = useMemo(() => {
    return {
      books: materials.filter((m) => m.type === 'books').length,
      syllabus: materials.filter((m) => m.type === 'syllabus').length,
      notes: materials.filter((m) => m.type === 'notes').length,
    };
  }, [materials]);

  const handleOpenPreview = async (mat: StudyMaterial) => {
    setPreviewMaterial(mat);
    await recordMaterialView(mat.id);
  };

  const handleDownload = async (mat: StudyMaterial) => {
    await recordMaterialView(mat.id);
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

  const handleFileChange = (file: File | null) => {
    setUpFile(file);
    if (!file) return;
    if (!upTitle.trim()) {
      const inferred = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
      setUpTitle(inferred);
    }
    if (file.type === 'text/plain' || file.name.endsWith('.md') || file.name.endsWith('.txt')) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setUpPreviewText(reader.result.slice(0, 7500));
        }
      };
      reader.readAsText(file);
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploadError(null);
    if (upTitle.trim().length < 2) {
      setUploadError('Please enter a descriptive material title.');
      return;
    }
    const sub = subjects.find((s) => s.id === upSubjectId) || subjects[0];
    if (!sub) {
      setUploadError('Please select a valid subject.');
      return;
    }

    setUploading(true);
    setUploadNotice(null);
    try {
      const result = await uploadAndCreateMaterial({
        title: upTitle.trim(),
        description: upDesc.trim(),
        type: upType,
        departmentId: sub.departmentId,
        courseName: sub.courseName,
        semester: sub.semester,
        subjectId: sub.id,
        subjectName: sub.name,
        unit: upUnit || sub.units[0] || 'Unit 1',
        isOfficial: activeRoleView === 'student' ? false : upOfficial,
        file: upFile,
        contentPreview: upPreviewText.trim() || upDesc.trim(),
      });
      if (upFile && !result.storageUsed) {
        setUploadNotice({
          kind: 'warning',
          text: `"${upTitle.trim()}" saved to Firestore catalog, but Firebase Storage did not accept the binary file (${upFile.name}). Ensure Firebase Storage & rules are enabled in Firebase Console, or include key notes in Notes Content for instant PDF preview/download.`,
        });
      } else {
        setUploadNotice({
          kind: 'success',
          text: `"${upTitle.trim()}" (${TYPE_LABELS[upType]}) published to ${sub.code} · ${sub.name}.`,
        });
      }
      setUploadOpen(false);
      setUpTitle('');
      setUpDesc('');
      setUpPreviewText('');
      setUpFile(null);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to upload material.');
    } finally {
      setUploading(false);
    }
  };

  const titlePlaceholder =
    upType === 'books'
      ? 'e.g. Operating System Concepts — Silberschatz (10th Edition)'
      : upType === 'syllabus'
      ? 'e.g. CS502 Complete Semester 5 Syllabus & Course Outcomes'
      : upType === 'pyq'
      ? 'e.g. End-Semester Question Paper Nov 2024'
      : 'e.g. Unit 3 B+ Trees & Indexing Notes';

  const descPlaceholder =
    upType === 'books'
      ? 'Author, edition, ISBN, and recommended chapters for this subject...'
      : upType === 'syllabus'
      ? 'Units covered, credit breakdown, lab experiments, and textbook references...'
      : 'Summary of topics covered in this document...';

  return (
    <div className="space-y-6">
      {/* Header & Quick Upload Actions */}
      <section className="relative overflow-hidden cc-card p-4 sm:p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
        <div className="absolute inset-0 cc-grid-pattern opacity-40 pointer-events-none" aria-hidden="true" />
        <div className="relative z-10 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-medium text-blue-600 dark:text-blue-400">
            <FolderTree className="w-3.5 h-3.5 shrink-0" />
            <span>Department → Course → Semester → Subject → Unit → Material</span>
          </div>
          <h2 className="font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            Smart Study Material Library
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {materials.length} total resources · {libraryCounts.notes} notes · {libraryCounts.books} books · {libraryCounts.syllabus} syllabi
          </p>
        </div>

        <div className="relative z-10 flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => openUploadModal('books')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/[0.1] bg-white dark:bg-[#141925] hover:bg-slate-50 dark:hover:bg-white/[0.06] text-xs font-medium text-slate-800 dark:text-slate-100 transition-colors whitespace-nowrap"
          >
            <Book className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            Upload Book
          </button>
          <button
            type="button"
            onClick={() => openUploadModal('syllabus')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/[0.1] bg-white dark:bg-[#141925] hover:bg-slate-50 dark:hover:bg-white/[0.06] text-xs font-medium text-slate-800 dark:text-slate-100 transition-colors whitespace-nowrap"
          >
            <ScrollText className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            Upload Syllabus
          </button>
          <button
            type="button"
            onClick={() => openUploadModal('notes')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500 text-white text-xs font-semibold transition-colors whitespace-nowrap shadow-xs"
          >
            <Plus className="w-4 h-4" />
            {activeRoleView === 'student' ? 'Add Study Note' : 'Upload Official Material'}
          </button>
        </div>
      </section>

      {uploadNotice && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-start justify-between gap-3 ${
            uploadNotice.kind === 'warning'
              ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-200'
              : 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-200'
          }`}
        >
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{uploadNotice.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setUploadNotice(null)}
            aria-label="Dismiss notification"
            className="p-0.5 opacity-70 hover:opacity-100"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Hierarchical Filter Bar */}
      <section className="cc-card p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <div className="md:col-span-2 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search notes, books, syllabi, PYQs..."
              className="w-full pl-9 pr-3 py-2 text-sm cc-input"
            />
          </div>

          <select
            aria-label="Filter by Department"
            value={selectedDept}
            onChange={(e) => {
              setSelectedDept(e.target.value);
              setSelectedCourse('all');
              setSelectedSubject('all');
              setSelectedUnit('all');
            }}
            className="px-3 py-2 text-sm cc-input"
          >
            <option value="all">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.code} · {d.name}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by Course"
            value={selectedCourse}
            onChange={(e) => {
              setSelectedCourse(e.target.value);
              setSelectedSubject('all');
            }}
            className="px-3 py-2 text-sm cc-input"
          >
            <option value="all">All Courses</option>
            {availableCourses.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by Semester"
            value={selectedSemester}
            onChange={(e) => {
              setSelectedSemester(e.target.value);
              setSelectedSubject('all');
            }}
            className="px-3 py-2 text-sm cc-input"
          >
            <option value="all">All Semesters</option>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((sem) => (
              <option key={sem} value={String(sem)}>
                Semester {sem}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by Subject"
            value={selectedSubject}
            onChange={(e) => {
              setSelectedSubject(e.target.value);
              setSelectedUnit('all');
            }}
            className="px-3 py-2 text-sm cc-input"
          >
            <option value="all">All Subjects</option>
            {availableSubjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} · {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* Unit Filter + Type Segmented Tabs */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-1 cc-segmented max-w-full">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'notes', label: 'Notes' },
                { id: 'books', label: 'Books' },
                { id: 'syllabus', label: 'Syllabus' },
                { id: 'pyq', label: 'PYQs' },
                { id: 'slides', label: 'Slides' },
                { id: 'assignment', label: 'Assignments' },
                { id: 'bookmarked', label: 'Bookmarked' },
                { id: 'recent', label: 'Recently Viewed' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedType(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                  selectedType === tab.id
                    ? 'bg-white dark:bg-[#0B1018] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <select
            aria-label="Filter by Unit"
            value={selectedUnit}
            onChange={(e) => setSelectedUnit(e.target.value)}
            className="px-3 py-1.5 text-xs cc-input w-full sm:w-auto sm:max-w-xs"
          >
            <option value="all">All Units</option>
            {availableUnits.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* Material Grid */}
      {filteredMaterials.length === 0 ? (
        <div className="cc-card p-12 text-center space-y-3">
          <FileText className="w-8 h-8 text-slate-400 mx-auto" />
          <p className="text-sm font-medium text-slate-900 dark:text-white">
            No study materials match your current filters
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Try clearing the search query, switching types, or uploading a new book, syllabus, or note.
          </p>
          <div className="flex items-center justify-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedDept('all');
                setSelectedCourse('all');
                setSelectedSemester('all');
                setSelectedSubject('all');
                setSelectedUnit('all');
                setSelectedType('all');
              }}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-white/[0.1] text-xs font-medium hover:bg-slate-50 dark:hover:bg-white/[0.06]"
            >
              Reset Filters
            </button>
            {(selectedType === 'books' || selectedType === 'syllabus') && (
              <button
                type="button"
                onClick={() => openUploadModal(selectedType)}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium"
              >
                Upload {selectedType === 'books' ? 'Book' : 'Syllabus'}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredMaterials.map((mat) => {
            const isBookmarked = bookmarkedIds.has(mat.id);
            const canDelete =
              activeRoleView === 'admin' || (profile && mat.uploadedByUid === profile.uid);
            const TypeIcon = getTypeIcon(mat.type);

            return (
              <article
                key={mat.id}
                className="cc-card-hover p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/50 border border-blue-100 dark:border-blue-900/60 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                        <TypeIcon className="w-4 h-4" />
                      </div>
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">
                        {TYPE_LABELS[mat.type]} · Sem {mat.semester} ·{' '}
                        <span className={mat.isDemo ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400'}>
                          {mat.isDemo ? 'Sample' : mat.isOfficial ? 'Official' : 'Personal'}
                        </span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleBookmarkMaterial(mat.id)}
                      aria-label={isBookmarked ? 'Remove bookmark' : 'Bookmark material'}
                      className={`p-1.5 rounded-lg transition-colors shrink-0 ${
                        isBookmarked
                          ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40'
                          : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                      }`}
                    >
                      <Bookmark className="w-4 h-4" fill={isBookmarked ? 'currentColor' : 'none'} />
                    </button>
                  </div>

                  <div>
                    <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white leading-snug">
                      {mat.title}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {mat.subjectName} · {mat.unit}
                    </p>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">
                    {mat.description}
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-white/[0.06] space-y-3">
                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                    <span className="truncate max-w-[180px]">{mat.uploadedByName}</span>
                    <span>{mat.fileSizeLabel}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenPreview(mat)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-white/[0.1] bg-white dark:bg-[#141925] hover:bg-slate-50 dark:hover:bg-white/[0.06] text-xs font-medium transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Preview
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownload(mat)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 text-xs font-medium transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => openAiWithMaterial(mat)}
                      title="Ask AI Doubt Solver about this material"
                      className="p-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                    >
                      <Bot className="w-4 h-4" />
                    </button>
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => removeMaterial(mat.id)}
                        title="Delete material"
                        className="p-2 rounded-xl border border-slate-200 dark:border-white/[0.1] text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
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
      )}

      {/* Preview Modal */}
      {previewMaterial && (
        <div
          className="fixed inset-0 z-50 cc-modal-backdrop flex items-center justify-center p-4"
          onClick={() => setPreviewMaterial(null)}
        >
          <div
            className="cc-modal max-w-3xl w-full max-h-[88vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-200/80 dark:border-white/[0.08] flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {TYPE_LABELS[previewMaterial.type]} · {previewMaterial.subjectName} · {previewMaterial.unit} · {previewMaterial.fileName}
                </p>
                <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-white mt-0.5">
                  {previewMaterial.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPreviewMaterial(null)}
                aria-label="Close preview"
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/[0.06]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {previewMaterial.fileUrl && previewMaterial.fileName.toLowerCase().endsWith('.pdf') ? (
                <iframe
                  src={previewMaterial.fileUrl}
                  title={previewMaterial.title}
                  className="w-full h-[460px] rounded-xl border border-slate-200/80 dark:border-white/[0.08]"
                />
              ) : (
                <div className="p-5 cc-inset font-mono text-xs leading-relaxed whitespace-pre-wrap text-slate-800 dark:text-slate-200">
                  {previewMaterial.contentPreview || previewMaterial.description}
                </div>
              )}
            </div>

            <div className="px-6 py-3.5 border-t border-slate-200/80 dark:border-white/[0.08] flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  const target = previewMaterial;
                  setPreviewMaterial(null);
                  openAiWithMaterial(target);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium"
              >
                <Bot className="w-4 h-4" />
                Explain or Quiz with AI Doubt Solver
              </button>
              <button
                type="button"
                onClick={() => handleDownload(previewMaterial)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-medium"
              >
                <Download className="w-4 h-4" />
                Download PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Material / Book / Syllabus Modal */}
      {uploadOpen && (
        <div
          className="fixed inset-0 z-50 cc-modal-backdrop flex items-center justify-center p-4"
          onClick={() => setUploadOpen(false)}
        >
          <div
            className="cc-modal max-w-xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200/80 dark:border-white/[0.08]">
              <div>
                <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                  {activeRoleView === 'student'
                    ? `Upload ${TYPE_LABELS[upType]}`
                    : `Publish Official ${TYPE_LABELS[upType]}`}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Attach a PDF or notes file and assign it to a subject &amp; unit
                </p>
              </div>
              <button
                type="button"
                onClick={() => setUploadOpen(false)}
                aria-label="Close upload modal"
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/[0.06]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {uploadError && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
                {uploadError}
              </div>
            )}

            <form onSubmit={handleUploadSubmit} className="space-y-4">
              {/* Visual 6-Type Picker */}
              <div>
                <span className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Select Resource Type
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {TYPE_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    const active = upType === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setUpType(opt.id)}
                        className={`p-2.5 rounded-xl border text-left transition-all flex items-center gap-2 ${
                          active
                            ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-600 text-blue-700 dark:text-blue-300 shadow-xs'
                            : 'bg-slate-50/70 dark:bg-white/[0.03] border-slate-200/80 dark:border-white/[0.08] text-slate-700 dark:text-slate-300 hover:border-blue-400'
                        }`}
                      >
                        <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`} />
                        <span className="text-xs font-medium truncate">{opt.short}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">
                  {upType === 'books' ? 'Book / Textbook Title & Author' : upType === 'syllabus' ? 'Syllabus Title' : 'Material Title'}
                </label>
                <input
                  type="text"
                  required
                  value={upTitle}
                  onChange={(e) => setUpTitle(e.target.value)}
                  placeholder={titlePlaceholder}
                  className="w-full px-3 py-2 text-sm cc-input"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Subject</label>
                  <select
                    value={upSubjectId}
                    onChange={(e) => {
                      setUpSubjectId(e.target.value);
                      const sub = subjects.find((s) => s.id === e.target.value);
                      if (sub?.units[0]) setUpUnit(sub.units[0]);
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
                  <label className="block text-xs font-medium mb-1">Unit / Scope</label>
                  <select
                    value={upUnit}
                    onChange={(e) => setUpUnit(e.target.value)}
                    className="w-full px-3 py-2 text-sm cc-input"
                  >
                    {(subjects.find((s) => s.id === upSubjectId)?.units || ['Unit 1']).map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                    <option value="Complete Textbook">Complete Textbook</option>
                    <option value="Full Semester Syllabus">Full Semester Syllabus</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Description</label>
                <textarea
                  rows={2}
                  value={upDesc}
                  onChange={(e) => setUpDesc(e.target.value)}
                  placeholder={descPlaceholder}
                  className="w-full px-3 py-2 text-sm cc-input"
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">
                  Attach {upType === 'books' ? 'Book PDF' : upType === 'syllabus' ? 'Syllabus PDF' : 'PDF or Notes File'}
                </label>
                <label className="flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl border border-dashed border-slate-300 dark:border-white/[0.15] bg-slate-50/50 dark:bg-white/[0.02] cursor-pointer hover:border-blue-600 text-xs text-slate-600 dark:text-slate-300 transition-colors">
                  <Upload className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>{upFile ? upFile.name : 'Choose PDF, TXT, or MD file'}</span>
                  <input
                    type="file"
                    accept=".pdf,.txt,.md"
                    onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                </label>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">
                  {upType === 'syllabus'
                    ? 'Syllabus Units / Outline (enables instant Preview & AI Quiz)'
                    : upType === 'books'
                    ? 'Book Table of Contents / Chapter Excerpt (enables Preview & AI Doubt Solver)'
                    : 'Notes Content / Excerpt (used for Preview & AI Doubt Solver)'}
                </label>
                <textarea
                  rows={4}
                  value={upPreviewText}
                  onChange={(e) => setUpPreviewText(e.target.value)}
                  placeholder={
                    upType === 'syllabus'
                      ? 'Unit 1: ...\nUnit 2: ...\nCourse Outcomes & Reference Books...'
                      : upType === 'books'
                      ? 'Chapter list, edition notes, or key concepts...'
                      : 'Paste key notes, formulas, or syllabus points...'
                  }
                  className="w-full px-3 py-2 text-xs font-mono cc-input"
                />
              </div>

              {activeRoleView !== 'student' && (
                <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={upOfficial}
                    onChange={(e) => setUpOfficial(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600"
                  />
                  Mark as Official Faculty / Department Material
                </label>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setUploadOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-white/[0.1] text-xs font-medium hover:bg-slate-50 dark:hover:bg-white/[0.06]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-60"
                >
                  {uploading ? 'Uploading...' : `Save ${TYPE_LABELS[upType]}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
