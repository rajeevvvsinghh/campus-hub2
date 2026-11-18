import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  FileText,
  FileUp,
  Loader2,
  MessageSquare,
  RotateCcw,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useCampus } from '../context/CampusContext';
import type { GeneratedQuiz } from '../types/campus';

interface DocumentQuizStudioProps {
  defaultSubjectName: string;
  defaultLanguage: 'en' | 'hi';
  defaultMaterialId?: string;
  onAskTutorAboutQuestion: (questionPrompt: string) => void;
}

type SourceTab = 'upload' | 'library' | 'paste';

export const DocumentQuizStudio: React.FC<DocumentQuizStudioProps> = ({
  defaultSubjectName,
  defaultLanguage,
  defaultMaterialId = '',
  onAskTutorAboutQuestion,
}) => {
  const { subjects, materials } = useCampus();

  const [sourceTab, setSourceTab] = useState<SourceTab>(defaultMaterialId ? 'library' : 'upload');
  const [subjectName, setSubjectName] = useState(defaultSubjectName);
  const [selectedLibraryId, setSelectedLibraryId] = useState(defaultMaterialId || materials[0]?.id || '');
  const [pastedText, setPastedText] = useState('');
  const [uploadedDoc, setUploadedDoc] = useState<{
    name: string;
    mimeType: string;
    sizeLabel: string;
    base64?: string;
    textContent?: string;
  } | null>(null);

  const [topicFocus, setTopicFocus] = useState('');
  const [questionCount, setQuestionCount] = useState<number>(5);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [language, setLanguage] = useState<'en' | 'hi'>(defaultLanguage);

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quiz, setQuiz] = useState<GeneratedQuiz | null>(null);

  // Interactive runner state
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);

  const selectedLibraryMaterial = useMemo(
    () => materials.find((m) => m.id === selectedLibraryId) || null,
    [materials, selectedLibraryId]
  );

  const handleFileSelect = (file: File | null) => {
    if (!file) return;
    setError(null);
    if (file.size > 12 * 1024 * 1024) {
      setError('Please select a syllabus or note file smaller than 12 MB.');
      return;
    }

    const sizeLabel = `${Math.max(1, Math.round(file.size / 1024))} KB`;
    const isPlainText =
      file.type === 'text/plain' ||
      file.type === 'text/markdown' ||
      file.name.toLowerCase().endsWith('.txt') ||
      file.name.toLowerCase().endsWith('.md');

    const reader = new FileReader();
    if (isPlainText) {
      reader.onload = () => {
        const textContent = typeof reader.result === 'string' ? reader.result : '';
        setUploadedDoc({
          name: file.name,
          mimeType: file.type || 'text/plain',
          sizeLabel,
          textContent,
        });
      };
      reader.readAsText(file);
    } else {
      reader.onload = () => {
        const raw = typeof reader.result === 'string' ? reader.result : '';
        const base64 = raw.includes(',') ? raw.split(',')[1] : raw;
        setUploadedDoc({
          name: file.name,
          mimeType: file.type || 'application/pdf',
          sizeLabel,
          base64,
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerate = async () => {
    setError(null);

    let documentText = '';
    let fileData: { name: string; mimeType: string; base64: string } | null = null;

    if (sourceTab === 'upload') {
      if (!uploadedDoc) {
        setError('Upload a PDF, TXT, Markdown, or image document first.');
        return;
      }
      if (uploadedDoc.textContent) {
        documentText = uploadedDoc.textContent;
      } else if (uploadedDoc.base64) {
        fileData = {
          name: uploadedDoc.name,
          mimeType: uploadedDoc.mimeType,
          base64: uploadedDoc.base64,
        };
      }
    } else if (sourceTab === 'library') {
      if (!selectedLibraryMaterial) {
        setError('Select a syllabus or note from the Study Library.');
        return;
      }
      documentText = [
        `Title: ${selectedLibraryMaterial.title}`,
        `Subject: ${selectedLibraryMaterial.subjectName} (${selectedLibraryMaterial.unit})`,
        selectedLibraryMaterial.description,
        selectedLibraryMaterial.contentPreview,
      ]
        .filter(Boolean)
        .join('\n\n');
    } else {
      if (pastedText.trim().length < 30) {
        setError('Paste at least a short paragraph of syllabus topics or lecture notes (30+ characters).');
        return;
      }
      documentText = pastedText.trim();
    }

    setGenerating(true);
    try {
      const res = await fetch('/api/ai/document-quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjectName,
          topicFocus,
          difficulty,
          count: questionCount,
          language,
          documentText,
          fileData,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate document quiz.');
      }

      setQuiz(data);
      setCurrentIdx(0);
      setAnswers({});
      setSubmitted(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to generate quiz from document.');
    } finally {
      setGenerating(false);
    }
  };

  const scoreCount = useMemo(() => {
    if (!quiz) return 0;
    return quiz.questions.reduce((acc, q, i) => acc + (answers[i] === q.correctIndex ? 1 : 0), 0);
  }, [quiz, answers]);

  const answeredCount = Object.keys(answers).length;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
      {/* Left Configuration & Source Panel */}
      <section className="xl:col-span-5 min-w-0 cc-card p-4 sm:p-5 space-y-5 h-fit">
        <div>
          <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
            Document-to-Quiz Generator
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Upload a syllabus, book excerpt, or notes document to generate an interactive MCQ knowledge check.
          </p>
        </div>

        {/* Source Mode Switcher */}
        <div className="flex flex-wrap sm:grid sm:grid-cols-3 gap-1 cc-segmented max-w-full">
          {(
            [
              { id: 'upload', label: 'Upload File' },
              { id: 'library', label: 'Study Library' },
              { id: 'paste', label: 'Paste Text' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setSourceTab(tab.id);
                setError(null);
              }}
              className={`py-1.5 px-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                sourceTab === tab.id
                  ? 'bg-white dark:bg-[#0B1018] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Source Input Body */}
        {sourceTab === 'upload' && (
          <div className="space-y-2.5">
            <label className="flex flex-col items-center justify-center gap-2 p-6 rounded-xl border border-dashed border-slate-300 dark:border-white/[0.15] hover:border-blue-600 cursor-pointer transition-colors text-center bg-slate-50/60 dark:bg-white/[0.02]">
              <FileUp className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              <div className="space-y-0.5">
                <p className="text-xs font-medium text-slate-900 dark:text-white">
                  Click to upload syllabus, book chapter, or note document
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Supports PDF, TXT, Markdown, PNG, or JPG (max 12 MB)
                </p>
              </div>
              <input
                type="file"
                accept=".pdf,.txt,.md,image/png,image/jpeg,image/webp"
                onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
                className="hidden"
              />
            </label>

            {uploadedDoc && (
              <div className="flex items-center justify-between gap-2 px-3 py-2 cc-inset text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                  <span className="truncate font-medium">{uploadedDoc.name}</span>
                  <span className="text-slate-400 font-mono shrink-0">{uploadedDoc.sizeLabel}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setUploadedDoc(null)}
                  aria-label="Remove uploaded document"
                  className="text-slate-400 hover:text-red-600 p-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}

        {sourceTab === 'library' && (
          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Select Syllabus, Book, or Notes from Library
            </label>
            <select
              value={selectedLibraryId}
              onChange={(e) => {
                setSelectedLibraryId(e.target.value);
                const mat = materials.find((m) => m.id === e.target.value);
                if (mat) setSubjectName(mat.subjectName);
              }}
              className="w-full px-3 py-2 text-xs cc-input"
            >
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.subjectName} · {m.title} ({m.type.toUpperCase()})
                </option>
              ))}
            </select>
            {selectedLibraryMaterial && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                {selectedLibraryMaterial.unit} · {selectedLibraryMaterial.description}
              </p>
            )}
          </div>
        )}

        {sourceTab === 'paste' && (
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Paste Syllabus Outline or Study Notes
            </label>
            <textarea
              rows={5}
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              placeholder="Paste unit syllabus topics, definitions, theorems, or lecture excerpts here..."
              className="w-full px-3 py-2 text-xs cc-input"
            />
          </div>
        )}

        {/* Quiz Parameters */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1">Subject</label>
            <select
              value={subjectName}
              onChange={(e) => setSubjectName(e.target.value)}
              className="w-full px-2.5 py-2 text-xs cc-input"
            >
              {subjects.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.code} · {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Questions</label>
            <select
              value={questionCount}
              onChange={(e) => setQuestionCount(Number(e.target.value))}
              className="w-full px-2.5 py-2 text-xs font-mono cc-input"
            >
              <option value={5}>5 Questions</option>
              <option value={8}>8 Questions</option>
              <option value={10}>10 Questions</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Difficulty</label>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as 'easy' | 'medium' | 'hard')}
              className="w-full px-2.5 py-2 text-xs cc-input"
            >
              <option value="easy">Easy · Foundational</option>
              <option value="medium">Medium · University Exam</option>
              <option value="hard">Hard · Analytical</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Language</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as 'en' | 'hi')}
              className="w-full px-2.5 py-2 text-xs cc-input"
            >
              <option value="en">English</option>
              <option value="hi">Hindi (हिन्दी)</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium mb-1">Topic Focus (Optional)</label>
          <input
            type="text"
            value={topicFocus}
            onChange={(e) => setTopicFocus(e.target.value)}
            placeholder="e.g. Deadlock avoidance, Normalization, or leave blank for full document"
            className="w-full px-3 py-2 text-xs cc-input"
          />
        </div>

        {error && (
          <div
            role="alert"
            className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300"
          >
            {error}
          </div>
        )}

        <button
          type="button"
          disabled={generating}
          onClick={handleGenerate}
          className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
        >
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardList className="w-4 h-4" />}
          {generating ? 'Analyzing Document & Building Quiz...' : 'Generate Interactive Quiz'}
        </button>
      </section>

      {/* Right Interactive Quiz Runner & Review */}
      <section className="xl:col-span-7 min-w-0 cc-card p-4 sm:p-6 flex flex-col justify-between min-h-[420px] sm:min-h-[480px]">
        {!quiz ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-3 py-12">
            <div className="w-11 h-11 rounded-2xl bg-blue-50 dark:bg-blue-950/50 border border-blue-100 dark:border-blue-900/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <BookOpen className="w-5 h-5" />
            </div>
            <h4 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Test your understanding from any syllabus, book, or notes
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Choose an uploaded PDF/note or a Study Library resource on the left, pick your question count and difficulty, and generate a graded multiple-choice check.
            </p>
          </div>
        ) : !submitted ? (
          <div className="space-y-6 flex-1 flex flex-col justify-between">
            <div className="space-y-4">
              {/* Quiz Header & Progress */}
              <div className="flex flex-wrap items-start justify-between gap-2 pb-4 border-b border-slate-100 dark:border-white/[0.06]">
                <div className="space-y-0.5">
                  <h4 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                    {quiz.quizTitle}
                  </h4>
                  {quiz.sourceSummary && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">{quiz.sourceSummary}</p>
                  )}
                </div>
                <span className="font-mono text-xs font-medium text-blue-600 dark:text-blue-400 tabular-nums shrink-0">
                  {answeredCount}/{quiz.questions.length} answered
                </span>
              </div>

              {/* Question Number Stepper */}
              <div className="flex flex-wrap items-center gap-1.5">
                {quiz.questions.map((_, idx) => {
                  const isCurrent = idx === currentIdx;
                  const isAnswered = answers[idx] !== undefined;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setCurrentIdx(idx)}
                      className={`w-8 h-8 rounded-lg font-mono text-xs font-medium transition-colors tabular-nums ${
                        isCurrent
                          ? 'bg-blue-600 text-white'
                          : isAnswered
                          ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                          : 'bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/[0.12]'
                      }`}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>

              {/* Active Question */}
              {quiz.questions[currentIdx] && (
                <div className="space-y-3 pt-2">
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                    Question {currentIdx + 1} of {quiz.questions.length}
                    {quiz.questions[currentIdx].topicTag
                      ? ` · ${quiz.questions[currentIdx].topicTag}`
                      : ''}
                  </p>
                  <p className="text-base font-medium text-slate-900 dark:text-white leading-snug">
                    {quiz.questions[currentIdx].question}
                  </p>

                  <div className="space-y-2.5 pt-1">
                    {quiz.questions[currentIdx].options.map((opt, optIdx) => {
                      const picked = answers[currentIdx] === optIdx;
                      return (
                        <button
                          key={optIdx}
                          type="button"
                          onClick={() => setAnswers((prev) => ({ ...prev, [currentIdx]: optIdx }))}
                          className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-colors flex items-center gap-3 ${
                            picked
                              ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-950 dark:text-blue-100'
                              : 'border-slate-200/80 dark:border-white/[0.08] bg-slate-50/50 dark:bg-white/[0.02] hover:border-slate-400 dark:hover:border-white/[0.2]'
                          }`}
                        >
                          <span className="font-mono text-xs font-semibold w-6 h-6 rounded-md border border-current/25 flex items-center justify-center shrink-0">
                            {String.fromCharCode(65 + optIdx)}
                          </span>
                          <span>{opt}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Navigation & Submit Footer */}
            <div className="pt-5 border-t border-slate-100 dark:border-white/[0.06] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={currentIdx === 0}
                  onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-white/[0.1] text-xs font-medium disabled:opacity-40"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Prev
                </button>
                <button
                  type="button"
                  disabled={currentIdx >= quiz.questions.length - 1}
                  onClick={() => setCurrentIdx((i) => Math.min(quiz.questions.length - 1, i + 1))}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-white/[0.1] text-xs font-medium disabled:opacity-40"
                >
                  Next <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <button
                type="button"
                disabled={answeredCount === 0}
                onClick={() => setSubmitted(true)}
                className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold disabled:opacity-50"
              >
                Submit Quiz ({answeredCount}/{quiz.questions.length})
              </button>
            </div>
          </div>
        ) : (
          /* Submitted Diagnostic Score & Review */
          <div className="space-y-5">
            <div className="p-4 cc-inset flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Quiz Score</p>
                <p className="font-mono text-2xl font-semibold text-slate-900 dark:text-white tabular-nums mt-0.5">
                  {scoreCount} / {quiz.questions.length} (
                  {Math.round((scoreCount / quiz.questions.length) * 100)}%)
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSubmitted(false);
                    setAnswers({});
                    setCurrentIdx(0);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-white/[0.1] text-xs font-medium"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Retake
                </button>
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={generating}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium"
                >
                  New Question Set
                </button>
              </div>
            </div>

            <div className="space-y-4 max-h-[520px] overflow-y-auto pr-1">
              {quiz.questions.map((q, idx) => {
                const picked = answers[idx];
                const isCorrect = picked === q.correctIndex;
                return (
                  <div
                    key={idx}
                    className="p-4 rounded-xl border border-slate-200/80 dark:border-white/[0.08] space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-medium text-slate-900 dark:text-white leading-relaxed">
                        {idx + 1}. {q.question}
                      </p>
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-medium shrink-0 ${
                          isCorrect
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {isCorrect ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" /> Correct
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3.5 h-3.5" /> Incorrect
                          </>
                        )}
                      </span>
                    </div>

                    <div className="text-xs space-y-1">
                      <p className="text-slate-600 dark:text-slate-300">
                        Your answer:{' '}
                        <span className="font-medium">
                          {picked !== undefined ? q.options[picked] : 'Skipped'}
                        </span>
                      </p>
                      {!isCorrect && (
                        <p className="text-emerald-700 dark:text-emerald-400">
                          Correct answer: <span className="font-medium">{q.options[q.correctIndex]}</span>
                        </p>
                      )}
                      <p className="text-slate-500 dark:text-slate-400 pt-1 leading-relaxed">
                        {q.explanation}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        onAskTutorAboutQuestion(
                          `Please explain this question and why the correct answer is "${q.options[q.correctIndex]}":\n\n${q.question}`
                        )
                      }
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      Explain in AI Tutor Chat
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
