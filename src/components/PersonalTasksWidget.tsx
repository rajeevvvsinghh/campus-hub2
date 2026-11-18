import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckSquare,
  Mic,
  MicOff,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useCampus } from '../context/CampusContext';
import type { StudyTask, Subject, TaskCategory, TaskPriority } from '../types/campus';

type TaskFilterTab = 'pending' | 'completed' | 'all';

interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionResultListLike {
  length: number;
  [index: number]: SpeechRecognitionResultLike;
}

interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
}

interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
}

interface SpeechRecognitionInstanceLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: ((this: SpeechRecognitionInstanceLike, ev: Event) => unknown) | null;
  onresult: ((this: SpeechRecognitionInstanceLike, ev: SpeechRecognitionEventLike) => unknown) | null;
  onerror: ((this: SpeechRecognitionInstanceLike, ev: SpeechRecognitionErrorEventLike) => unknown) | null;
  onend: ((this: SpeechRecognitionInstanceLike, ev: Event) => unknown) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionConstructorLike = new () => SpeechRecognitionInstanceLike;

function getSpeechRecognitionCtor(): SpeechRecognitionConstructorLike | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructorLike;
    webkitSpeechRecognition?: SpeechRecognitionConstructorLike;
  };
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
}

function formatDateOffset(daysFromToday: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function inferMetadataFromSpeech(
  transcript: string,
  subjects: Subject[]
): {
  dueDate?: string;
  priority?: TaskPriority;
  category?: TaskCategory;
  subjectId?: string;
} {
  const lower = transcript.toLowerCase();
  const inferred: {
    dueDate?: string;
    priority?: TaskPriority;
    category?: TaskCategory;
    subjectId?: string;
  } = {};

  if (/\btoday\b/.test(lower)) {
    inferred.dueDate = formatDateOffset(0);
  } else if (/\btomorrow\b/.test(lower)) {
    inferred.dueDate = formatDateOffset(1);
  } else if (/\bnext week\b/.test(lower)) {
    inferred.dueDate = formatDateOffset(7);
  }

  if (/\b(urgent|high priority|important|asap)\b/.test(lower)) {
    inferred.priority = 'high';
  } else if (/\blow priority\b/.test(lower)) {
    inferred.priority = 'low';
  }

  if (/\b(assignment|submit|submission|lab report|deadline|homework)\b/.test(lower)) {
    inferred.category = 'assignment';
  } else if (/\b(revise|revision|exam|quiz|test|midterm|final)\b/.test(lower)) {
    inferred.category = 'revision';
  } else if (/\b(syllabus|chapter|unit)\b/.test(lower)) {
    inferred.category = 'syllabus';
  }

  const matchedSubject = subjects.find(
    (s) =>
      lower.includes(s.code.toLowerCase()) ||
      lower.includes(s.name.toLowerCase())
  );
  if (matchedSubject) {
    inferred.subjectId = matchedSubject.id;
  }

  return inferred;
}

const CATEGORY_LABELS: Record<TaskCategory, string> = {
  goal: 'Reminder',
  assignment: 'Deadline',
  revision: 'Revision',
  syllabus: 'Syllabus',
};

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  high: 'High priority',
  medium: 'Medium priority',
  low: 'Low priority',
};

export const PersonalTasksWidget: React.FC = () => {
  const {
    subjects,
    studyTasks,
    toggleStudyTask,
    createOrUpdateStudyTask,
    removeStudyTask,
    setActiveView,
  } = useCampus();

  const [filterTab, setFilterTab] = useState<TaskFilterTab>('pending');
  const [formOpen, setFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<StudyTask | null>(null);

  const [title, setTitle] = useState('');
  const [subjectId, setSubjectId] = useState<string>('sub_general');
  const [dueDate, setDueDate] = useState<string>(() => formatDateOffset(0));
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [category, setCategory] = useState<TaskCategory>('goal');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Voice-to-text dictation state
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstanceLike | null>(null);
  const titleBaseRef = useRef<string>('');
  const finalSpeechRef = useRef<string>('');

  const todayIso = formatDateOffset(0);
  const speechSupported = useMemo(() => Boolean(getSpeechRecognitionCtor()), []);

  const stopListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore stop errors if already stopped
      }
    }
    setIsListening(false);
    setInterimTranscript('');
  };

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // Ignore abort errors on unmount
        }
      }
    };
  }, []);

  const startDictation = (existingBaseTitle?: string) => {
    setVoiceError(null);
    setFormError(null);

    const RecognitionCtor = getSpeechRecognitionCtor();
    if (!RecognitionCtor) {
      setFormOpen(true);
      setVoiceError(
        'Voice dictation is not supported in this browser. Try Chrome or Edge, or type your reminder below.'
      );
      return;
    }

    if (isListening) {
      stopListening();
      return;
    }

    const base = (existingBaseTitle !== undefined ? existingBaseTitle : title).trim();
    titleBaseRef.current = base;
    finalSpeechRef.current = '';
    setInterimTranscript('');

    const recognition = new RecognitionCtor();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
      setVoiceError(null);
    };

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      let finalChunk = '';
      let interimChunk = '';

      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript || '';
        if (result.isFinal) {
          finalChunk += `${text} `;
        } else {
          interimChunk += text;
        }
      }

      const cleanFinal = finalChunk.trim();
      const cleanInterim = interimChunk.trim();
      finalSpeechRef.current = cleanFinal;
      setInterimTranscript(cleanInterim);

      const combinedSpeech = [cleanFinal, cleanInterim].filter(Boolean).join(' ').trim();
      if (combinedSpeech) {
        const formattedSpeech =
          combinedSpeech.charAt(0).toUpperCase() + combinedSpeech.slice(1);
        const nextTitle = titleBaseRef.current
          ? `${titleBaseRef.current} ${formattedSpeech}`
          : formattedSpeech;
        setTitle(nextTitle.slice(0, 200));

        if (!editingTask && cleanFinal) {
          const inferred = inferMetadataFromSpeech(cleanFinal, subjects);
          if (inferred.dueDate) setDueDate(inferred.dueDate);
          if (inferred.priority) setPriority(inferred.priority);
          if (inferred.category) setCategory(inferred.category);
          if (inferred.subjectId) setSubjectId(inferred.subjectId);
        }
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
      setIsListening(false);
      setInterimTranscript('');
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setVoiceError(
          'Microphone permission denied. Allow microphone access in your browser and try again.'
        );
      } else if (event.error === 'no-speech') {
        setVoiceError('No speech detected. Tap the microphone and speak your reminder.');
      } else if (event.error === 'audio-capture') {
        setVoiceError('No microphone detected on this device.');
      } else if (event.error !== 'aborted') {
        setVoiceError('Voice recognition could not complete. Please try again or type manually.');
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimTranscript('');
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      setIsListening(false);
      setVoiceError('Could not start microphone listener. Check browser audio permissions.');
    }
  };

  const counts = useMemo(() => {
    const pending = studyTasks.filter((t) => !t.completed).length;
    const completed = studyTasks.filter((t) => t.completed).length;
    return { pending, completed, total: studyTasks.length };
  }, [studyTasks]);

  const visibleTasks = useMemo(() => {
    const filtered = studyTasks.filter((t) => {
      if (filterTab === 'pending') return !t.completed;
      if (filterTab === 'completed') return t.completed;
      return true;
    });

    const priorityRank: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };
    return [...filtered].sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) {
        return a.dueDate.localeCompare(b.dueDate);
      }
      if (a.dueDate && !b.dueDate) return -1;
      if (!a.dueDate && b.dueDate) return 1;
      return priorityRank[a.priority] - priorityRank[b.priority];
    });
  }, [studyTasks, filterTab]);

  const resetForm = () => {
    stopListening();
    setEditingTask(null);
    setTitle('');
    setSubjectId(subjects[0]?.id || 'sub_general');
    setDueDate(formatDateOffset(0));
    setPriority('medium');
    setCategory('goal');
    setFormError(null);
    setVoiceError(null);
  };

  const handleOpenAdd = () => {
    resetForm();
    setFormOpen(true);
  };

  const handleQuickDictate = () => {
    if (!formOpen || editingTask) {
      resetForm();
      setFormOpen(true);
      startDictation('');
      return;
    }
    startDictation();
  };

  const handleOpenEdit = (task: StudyTask) => {
    stopListening();
    setEditingTask(task);
    setTitle(task.title);
    setSubjectId(
      subjects.some((s) => s.id === task.subjectId) ? task.subjectId : 'sub_general'
    );
    setDueDate(task.dueDate || '');
    setPriority(task.priority);
    setCategory(task.category);
    setFormError(null);
    setVoiceError(null);
    setFormOpen(true);
  };

  const handleCancelForm = () => {
    setFormOpen(false);
    resetForm();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    stopListening();
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setFormError('Please enter or dictate a reminder title.');
      return;
    }

    const matchedSubject = subjects.find((s) => s.id === subjectId);
    const resolvedSubjectId = matchedSubject ? matchedSubject.id : 'sub_general';
    const resolvedSubjectName = matchedSubject ? matchedSubject.name : 'General Study';

    setSaving(true);
    setFormError(null);
    try {
      await createOrUpdateStudyTask({
        id: editingTask?.id,
        subjectId: resolvedSubjectId,
        subjectName: resolvedSubjectName,
        unit: editingTask?.unit || '',
        title: cleanTitle.slice(0, 200),
        dueDate: dueDate || '',
        priority,
        category,
        completed: editingTask ? editingTask.completed : false,
      });
      setFormOpen(false);
      resetForm();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save reminder.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (taskId: string) => {
    setDeletingId(taskId);
    try {
      await removeStudyTask(taskId);
      if (editingTask?.id === taskId) {
        handleCancelForm();
      }
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className="cc-card p-4 sm:p-6 min-w-0 flex flex-col">
      {/* Widget Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 pb-3.5 border-b border-slate-100 dark:border-white/[0.06]">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Personal Tasks
            </h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono tabular-nums">
            {counts.pending} pending · {counts.completed} completed
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleQuickDictate}
            title={
              isListening
                ? 'Stop voice dictation'
                : speechSupported
                ? 'Dictate a new study reminder'
                : 'Voice dictation unavailable in this browser'
            }
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              isListening
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'cc-btn-secondary text-slate-700 dark:text-slate-200'
            }`}
          >
            {isListening ? (
              <>
                <MicOff className="w-3.5 h-3.5" /> Stop
              </>
            ) : (
              <>
                <Mic className="w-3.5 h-3.5 text-[var(--cc-accent)]" /> Dictate
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => (formOpen && !editingTask ? handleCancelForm() : handleOpenAdd())}
            aria-expanded={formOpen}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg cc-btn-primary text-xs font-medium whitespace-nowrap"
          >
            {formOpen && !editingTask ? (
              <>
                <X className="w-3.5 h-3.5" /> Close
              </>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5" /> Add Task
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveView('exam-prep')}
            className="text-xs font-medium text-[var(--cc-accent)] hover:underline whitespace-nowrap"
          >
            All Prep
          </button>
        </div>
      </div>

      {/* Filter Segmented Control */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 cc-segmented max-w-full">
          {(
            [
              { id: 'pending', label: `Pending (${counts.pending})` },
              { id: 'completed', label: `Done (${counts.completed})` },
              { id: 'all', label: `All (${counts.total})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterTab(tab.id)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap tabular-nums ${
                filterTab === tab.id
                  ? 'bg-white dark:bg-[#0B1018] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Add / Edit Reminder Form */}
      {formOpen && (
        <form
          onSubmit={handleSubmit}
          className="mt-3.5 p-3.5 cc-inset space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-900 dark:text-white">
              {editingTask ? 'Edit Reminder / Deadline' : 'New Study Reminder'}
            </span>
            <button
              type="button"
              onClick={handleCancelForm}
              aria-label="Cancel task form"
              className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <input
                type="text"
                required
                maxLength={200}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Type or dictate: e.g., Submit DBMS lab tomorrow"
                aria-label="Task title"
                className="flex-1 min-w-0 px-3 py-2 text-xs sm:text-sm cc-input"
              />
              <button
                type="button"
                onClick={() => startDictation()}
                aria-label={isListening ? 'Stop voice dictation' : 'Dictate task with microphone'}
                title={isListening ? 'Stop listening' : 'Speak reminder'}
                className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium shrink-0 transition-colors ${
                  isListening
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'cc-btn-secondary text-slate-700 dark:text-slate-200'
                }`}
              >
                {isListening ? (
                  <>
                    <MicOff className="w-3.5 h-3.5" />
                    <span>Stop</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-3.5 h-3.5 text-[var(--cc-accent)]" />
                    <span className="hidden sm:inline">Speak</span>
                  </>
                )}
              </button>
            </div>

            {isListening && (
              <div
                role="status"
                aria-live="polite"
                className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-[var(--cc-accent-light)] border border-[var(--cc-accent-subtle)] text-xs"
              >
                <span className="text-slate-800 dark:text-slate-100 truncate">
                  <span className="font-semibold text-[var(--cc-accent)]">Listening:</span>{' '}
                  {interimTranscript || 'Speak your reminder (e.g. "Revise OS Unit 3 tomorrow")'}
                </span>
                <button
                  type="button"
                  onClick={stopListening}
                  className="font-semibold text-[var(--cc-accent)] hover:underline shrink-0"
                >
                  Done
                </button>
              </div>
            )}

            {voiceError && (
              <p className="text-xs text-amber-700 dark:text-amber-400">{voiceError}</p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <select
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                aria-label="Course or subject"
                className="w-full px-2.5 py-2 text-xs cc-input"
              >
                <option value="sub_general">General Study</option>
                {subjects.map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {sub.code} · {sub.name}
                  </option>
                ))}
              </select>

              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                aria-label="Due date"
                className="w-full px-2.5 py-2 text-xs font-mono cc-input tabular-nums"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as TaskCategory)}
                aria-label="Reminder category"
                className="w-full px-2.5 py-2 text-xs cc-input"
              >
                <option value="goal">Study Reminder</option>
                <option value="assignment">Deadline / Assignment</option>
                <option value="revision">Exam Revision</option>
                <option value="syllabus">Syllabus Topic</option>
              </select>

              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                aria-label="Task priority"
                className="w-full px-2.5 py-2 text-xs cc-input"
              >
                <option value="high">High Priority</option>
                <option value="medium">Medium Priority</option>
                <option value="low">Low Priority</option>
              </select>
            </div>
          </div>

          {formError && (
            <p className="text-xs text-red-600 dark:text-red-400">{formError}</p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={handleCancelForm}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/[0.1] text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !title.trim()}
              className="px-3.5 py-1.5 rounded-lg cc-btn-primary text-xs font-semibold disabled:opacity-50"
            >
              {saving ? 'Saving...' : editingTask ? 'Update Task' : 'Save Task'}
            </button>
          </div>
        </form>
      )}

      {/* Task List */}
      <div className="mt-3 divide-y divide-slate-100 dark:divide-white/[0.06] max-h-[340px] overflow-y-auto pr-0.5 flex-1">
        {visibleTasks.length === 0 ? (
          <div className="py-8 text-center space-y-2.5">
            <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-white/[0.06] text-slate-400 flex items-center justify-center mx-auto">
              <CheckSquare className="w-4 h-4" />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {filterTab === 'completed'
                ? 'No completed reminders yet.'
                : 'No pending study reminders or deadlines.'}
            </p>
            {filterTab !== 'completed' && !formOpen && (
              <div className="flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={handleOpenAdd}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[var(--cc-accent)] hover:underline"
                >
                  <Plus className="w-3.5 h-3.5" /> Add reminder
                </button>
                <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">
                  ·
                </span>
                <button
                  type="button"
                  onClick={handleQuickDictate}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[var(--cc-accent)] hover:underline"
                >
                  <Mic className="w-3.5 h-3.5" /> Dictate with mic
                </button>
              </div>
            )}
          </div>
        ) : (
          visibleTasks.map((task) => {
            const isOverdue = Boolean(task.dueDate && !task.completed && task.dueDate < todayIso);
            const priorityClass =
              task.priority === 'high'
                ? 'text-red-600 dark:text-red-400'
                : task.priority === 'medium'
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-slate-500 dark:text-slate-400';

            return (
              <div
                key={task.id}
                className="flex items-start justify-between gap-2.5 py-3 first:pt-1 last:pb-1 group"
              >
                <label className="flex items-start gap-2.5 min-w-0 flex-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={task.completed}
                    onChange={() => toggleStudyTask(task)}
                    aria-label={`Mark "${task.title}" as ${task.completed ? 'pending' : 'completed'}`}
                    className="mt-0.5 w-4 h-4 rounded border-slate-300 accent-[var(--cc-accent)] shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm font-medium leading-snug break-words transition-colors ${
                        task.completed
                          ? 'line-through text-slate-400 dark:text-slate-500'
                          : 'text-slate-900 dark:text-slate-100 group-hover:text-[var(--cc-accent)]'
                      }`}
                    >
                      {task.title}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                      <span className="truncate max-w-[160px]">{task.subjectName}</span>
                      <span aria-hidden="true">·</span>
                      <span>{CATEGORY_LABELS[task.category]}</span>
                      <span aria-hidden="true">·</span>
                      <span className={priorityClass}>{PRIORITY_LABELS[task.priority]}</span>
                      {task.dueDate && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span
                            className={`font-mono tabular-nums ${
                              isOverdue ? 'text-red-600 dark:text-red-400 font-medium' : ''
                            }`}
                          >
                            {isOverdue ? `Overdue (${task.dueDate})` : `Due ${task.dueDate}`}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                </label>

                <div className="flex items-center gap-1 shrink-0 pt-0.5">
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(task)}
                    aria-label={`Edit "${task.title}"`}
                    title="Edit reminder"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={deletingId === task.id}
                    onClick={() => handleDelete(task.id)}
                    aria-label={`Delete "${task.title}"`}
                    title="Delete reminder"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
};
