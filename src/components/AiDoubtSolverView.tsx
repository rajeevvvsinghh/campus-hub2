import React, { useEffect, useRef, useState } from 'react';
import {
  Bot,
  CheckCircle2,
  ClipboardList,
  FileUp,
  Languages,
  Loader2,
  MessageSquarePlus,
  Paperclip,
  Send,
  X,
  XCircle,
} from 'lucide-react';
import { useCampus } from '../context/CampusContext';
import { makeSafeId } from '../services/campusService';
import { MarkdownContent } from './MarkdownContent';
import { DocumentQuizStudio } from './DocumentQuizStudio';
import type { AiChatMessage, AiChatSession, GeneratedQuiz } from '../types/campus';

type DoubtMode = 'chat' | 'explain' | 'step-by-step' | 'summarize' | 'revision-notes' | 'quiz';

const MODE_OPTIONS: Array<{ id: DoubtMode; label: string }> = [
  { id: 'chat', label: 'Tutor Chat' },
  { id: 'explain', label: 'Explain Simply' },
  { id: 'step-by-step', label: 'Step-by-Step' },
  { id: 'summarize', label: 'Summarize' },
  { id: 'revision-notes', label: 'Revision Notes' },
  { id: 'quiz', label: 'Practice Quiz' },
];

const InteractiveQuizCard: React.FC<{ quiz: GeneratedQuiz }> = ({ quiz }) => {
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);

  const score = quiz.questions.reduce((acc, q, idx) => {
    return acc + (selectedAnswers[idx] === q.correctIndex ? 1 : 0);
  }, 0);

  return (
    <div className="mt-3 p-4 cc-inset space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
          {quiz.quizTitle}
        </h4>
        {submitted && (
          <span className="font-mono text-xs font-semibold text-blue-600 dark:text-blue-400 tabular-nums">
            Score: {score} / {quiz.questions.length}
          </span>
        )}
      </div>

      <div className="space-y-4">
        {quiz.questions.map((q, qIdx) => {
          const picked = selectedAnswers[qIdx];
          return (
            <div key={qIdx} className="space-y-2">
              <p className="text-xs font-medium text-slate-900 dark:text-slate-100">
                {qIdx + 1}. {q.question}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {q.options.map((opt, optIdx) => {
                  const isPicked = picked === optIdx;
                  const isCorrect = q.correctIndex === optIdx;
                  let style =
                    'border-slate-200/80 dark:border-white/[0.08] bg-white dark:bg-[#0B1018] hover:border-blue-500';
                  if (submitted) {
                    if (isCorrect) {
                      style = 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200';
                    } else if (isPicked && !isCorrect) {
                      style = 'border-red-500 bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-200';
                    }
                  } else if (isPicked) {
                    style = 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200';
                  }

                  return (
                    <button
                      key={optIdx}
                      type="button"
                      disabled={submitted}
                      onClick={() => setSelectedAnswers((prev) => ({ ...prev, [qIdx]: optIdx }))}
                      className={`text-left px-3 py-2 rounded-xl border text-xs transition-colors flex items-center justify-between gap-2 ${style}`}
                    >
                      <span>{opt}</span>
                      {submitted && isCorrect && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                      {submitted && isPicked && !isCorrect && <XCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />}
                    </button>
                  );
                })}
              </div>
              {submitted && (
                <p className="text-[11px] text-slate-600 dark:text-slate-400">
                  <span className="font-semibold">Explanation:</span> {q.explanation}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {!submitted ? (
        <button
          type="button"
          onClick={() => setSubmitted(true)}
          className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
        >
          Check Answers
        </button>
      ) : (
        <button
          type="button"
          onClick={() => {
            setSubmitted(false);
            setSelectedAnswers({});
          }}
          className="px-4 py-2 rounded-xl border border-slate-200 dark:border-white/[0.1] text-xs font-medium"
        >
          Retake Quiz
        </button>
      )}
    </div>
  );
};

export const AiDoubtSolverView: React.FC = () => {
  const {
    profile,
    subjects,
    materials,
    aiChats,
    persistAiChat,
    aiPrefillMaterial,
  } = useCampus();

  const [solverSection, setSolverSection] = useState<'chat' | 'quiz-studio'>('chat');
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [subjectName, setSubjectName] = useState(subjects[0]?.name || 'Operating Systems');
  const [mode, setMode] = useState<DoubtMode>('explain');
  const [language, setLanguage] = useState<'en' | 'hi'>('en');
  const [input, setInput] = useState('');
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>('');
  const [uploadedFile, setUploadedFile] = useState<{
    name: string;
    mimeType: string;
    base64: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (aiPrefillMaterial) {
      setSelectedMaterialId(aiPrefillMaterial.id);
      setSubjectName(aiPrefillMaterial.subjectName);
      setInput(`Explain the key concepts and exam questions from "${aiPrefillMaterial.title}".`);
    }
  }, [aiPrefillMaterial]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSelectSession = (session: AiChatSession) => {
    setActiveChatId(session.id);
    setMessages(session.messages || []);
    setSubjectName(session.subjectName || subjects[0]?.name || 'Operating Systems');
    setLanguage(session.language || 'en');
  };

  const handleNewChat = () => {
    setActiveChatId(null);
    setMessages([]);
    setError(null);
  };

  const handleFileUpload = (file: File | null) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError('Please upload a PDF or image smaller than 10 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      setUploadedFile({
        name: file.name,
        mimeType: file.type || 'application/pdf',
        base64,
      });
      setError(null);
    };
    reader.readAsDataURL(file);
  };

  const sendPrompt = async (customPrompt?: string) => {
    const promptText = (customPrompt ?? input).trim();
    if (!promptText && !uploadedFile && !selectedMaterialId) return;

    setError(null);
    const attachedMaterial = materials.find((m) => m.id === selectedMaterialId);
    const userMsg: AiChatMessage = {
      id: makeSafeId('msg'),
      role: 'user',
      content:
        promptText ||
        (uploadedFile
          ? `Analyze uploaded document: ${uploadedFile.name}`
          : `Analyze study material: ${attachedMaterial?.title}`),
      mode,
      attachmentName: uploadedFile?.name || attachedMaterial?.fileName,
      timestamp: new Date().toISOString(),
    };

    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    if (!customPrompt) setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/ai/doubt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: promptText,
          mode,
          language,
          subject: subjectName,
          history: messages.slice(-8).map((m) => ({ role: m.role, content: m.content })),
          fileData: uploadedFile,
          materialContext: attachedMaterial
            ? `${attachedMaterial.title}\n${attachedMaterial.description}\n${attachedMaterial.contentPreview}`
            : '',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to get response from Gemini AI.');
      }

      const aiMsg: AiChatMessage = {
        id: makeSafeId('msg'),
        role: 'assistant',
        content: data.text,
        mode: data.mode,
        quiz: data.quiz,
        timestamp: new Date().toISOString(),
      };

      const finalMessages = [...nextMessages, aiMsg];
      setMessages(finalMessages);
      setUploadedFile(null);

      if (profile) {
        const isNew = !activeChatId;
        const sessionId = activeChatId || makeSafeId('chat');
        setActiveChatId(sessionId);
        await persistAiChat(
          {
            id: sessionId,
            userId: profile.uid,
            title: userMsg.content.slice(0, 80),
            subjectName,
            language,
            messages: finalMessages,
          },
          isNew
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reach AI Doubt Solver.');
    } finally {
      setLoading(false);
    }
  };

  const handleAskTutorFromQuiz = (questionPrompt: string) => {
    setSolverSection('chat');
    setMode('step-by-step');
    sendPrompt(questionPrompt);
  };

  return (
    <div className="space-y-4">
      {/* AI Doubt Solver Sub-Module Navigation */}
      <section className="cc-card p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-100 dark:border-blue-900/60 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white leading-tight">
              AI Doubt Solver
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Interactive tutoring, PDF analysis, and document-grounded knowledge quizzes
            </p>
          </div>
        </div>

        <div className="inline-flex flex-wrap items-center gap-1 cc-segmented self-start sm:self-auto max-w-full">
          <button
            type="button"
            onClick={() => setSolverSection('chat')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              solverSection === 'chat'
                ? 'bg-white dark:bg-[#0B1018] text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            Tutor Chat
          </button>
          <button
            type="button"
            onClick={() => setSolverSection('quiz-studio')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              solverSection === 'quiz-studio'
                ? 'bg-white dark:bg-[#0B1018] text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <ClipboardList className="w-3.5 h-3.5" />
            Document Quiz Studio
          </button>
        </div>
      </section>

      {solverSection === 'quiz-studio' ? (
        <DocumentQuizStudio
          defaultSubjectName={subjectName}
          defaultLanguage={language}
          defaultMaterialId={selectedMaterialId}
          onAskTutorAboutQuestion={handleAskTutorFromQuiz}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:h-[calc(100vh-15rem)] lg:min-h-[560px]">
          {/* Session History & Context Sidebar */}
          <aside className="lg:col-span-3 min-w-0 max-h-[380px] lg:max-h-none cc-card p-4 flex flex-col gap-4 overflow-hidden">
            <button
              type="button"
              onClick={handleNewChat}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500 text-white text-xs font-semibold transition-colors"
            >
              <MessageSquarePlus className="w-4 h-4" />
              New Doubt Session
            </button>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Subject Context
                </label>
                <select
                  value={subjectName}
                  onChange={(e) => setSubjectName(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs cc-input"
                >
                  {subjects.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.code} · {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Reference Library Note / Book / Syllabus
                </label>
                <select
                  value={selectedMaterialId}
                  onChange={(e) => setSelectedMaterialId(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs cc-input"
                >
                  <option value="">None attached</option>
                  {materials.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Response Language
                </label>
                <div className="grid grid-cols-2 gap-1 cc-segmented">
                  <button
                    type="button"
                    onClick={() => setLanguage('en')}
                    className={`py-1.5 text-xs font-medium rounded-lg flex items-center justify-center gap-1 ${
                      language === 'en'
                        ? 'bg-white dark:bg-[#0B1018] text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Languages className="w-3.5 h-3.5" /> English
                  </button>
                  <button
                    type="button"
                    onClick={() => setLanguage('hi')}
                    className={`py-1.5 text-xs font-medium rounded-lg flex items-center justify-center gap-1 ${
                      language === 'hi'
                        ? 'bg-white dark:bg-[#0B1018] text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    हिन्दी
                  </button>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto pt-2 border-t border-slate-100 dark:border-white/[0.06] space-y-1.5">
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 px-1">
                Saved Sessions ({aiChats.length})
              </p>
              {aiChats.length === 0 ? (
                <p className="text-xs text-slate-400 dark:text-slate-500 px-1 py-2">
                  Your AI study conversations will appear here.
                </p>
              ) : (
                aiChats.map((chat) => (
                  <button
                    key={chat.id}
                    type="button"
                    onClick={() => handleSelectSession(chat)}
                    className={`w-full text-left px-2.5 py-2 rounded-xl text-xs transition-colors ${
                      activeChatId === chat.id
                        ? 'bg-slate-100 dark:bg-white/[0.08] text-slate-900 dark:text-white font-medium'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/[0.04]'
                    }`}
                  >
                    <p className="truncate">{chat.title}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                      {chat.subjectName} · {chat.language.toUpperCase()}
                    </p>
                  </button>
                ))
              )}
            </div>
          </aside>

          {/* Main Chat Workspace */}
          <section className="lg:col-span-9 min-w-0 min-h-[480px] lg:min-h-0 cc-card flex flex-col overflow-hidden">
            {/* Mode Bar */}
            <div className="px-4 py-3 border-b border-slate-200/80 dark:border-white/[0.08] flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Bot className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <span className="font-display text-sm font-semibold shrink-0">AI Doubt Solver</span>
                <span className="text-xs text-slate-400 truncate">· {subjectName}</span>
              </div>

              <div className="flex flex-wrap items-center gap-1 cc-segmented max-w-full">
                {MODE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setMode(opt.id)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                      mode === opt.id
                        ? 'bg-white dark:bg-[#0B1018] text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Message Stream */}
            <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 space-y-5">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto space-y-5">
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/50 border border-blue-100 dark:border-blue-900/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                    <Bot className="w-6 h-6" />
                  </div>
                  <div className="space-y-1.5">
                    <h3 className="font-display text-lg font-semibold">
                      Ask any academic question or upload a PDF
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      Powered by Gemini AI. Get step-by-step derivations, simple explanations, chapter summaries, revision notes, or interactive quizzes in English or Hindi.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full text-left">
                    {[
                      'Explain Banker’s Algorithm with a numerical example step-by-step.',
                      'Summarize 3NF vs BCNF normalization with examples.',
                      'Create 5 exam practice MCQs on TCP Congestion Control.',
                      'Virtual Memory और Paging को सरल हिंदी में समझाइए।',
                    ].map((sampleQ) => (
                      <button
                        key={sampleQ}
                        type="button"
                        onClick={() => sendPrompt(sampleQ)}
                        className="p-3 rounded-xl border border-slate-200/80 dark:border-white/[0.08] bg-slate-50/50 dark:bg-white/[0.02] hover:border-blue-600 text-xs text-slate-700 dark:text-slate-300 text-left transition-colors"
                      >
                        {sampleQ}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                        msg.role === 'user'
                          ? 'bg-slate-900 dark:bg-blue-600 text-white'
                          : 'cc-inset text-slate-900 dark:text-slate-100'
                      }`}
                    >
                      {msg.attachmentName && (
                        <div className="flex items-center gap-1.5 text-[11px] opacity-80 mb-1.5">
                          <Paperclip className="w-3 h-3" />
                          <span>{msg.attachmentName}</span>
                        </div>
                      )}
                      {msg.role === 'user' ? (
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      ) : (
                        <>
                          <MarkdownContent content={msg.content} />
                          {msg.quiz && msg.quiz.questions && <InteractiveQuizCard quiz={msg.quiz} />}
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}

              {loading && (
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                  <span>Analyzing and generating response...</span>
                </div>
              )}

              {error && (
                <div
                  role="alert"
                  className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300"
                >
                  {error}
                </div>
              )}

              <div ref={bottomRef} />
            </div>

            {/* Input Composer */}
            <div className="p-4 border-t border-slate-200/80 dark:border-white/[0.08] space-y-2.5">
              {uploadedFile && (
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 text-xs text-blue-800 dark:text-blue-200">
                  <Paperclip className="w-3.5 h-3.5" />
                  <span className="truncate max-w-[240px]">{uploadedFile.name}</span>
                  <button
                    type="button"
                    onClick={() => setUploadedFile(null)}
                    aria-label="Remove attached file"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  sendPrompt();
                }}
                className="flex items-end gap-2.5"
              >
                <label
                  title="Upload PDF or Image"
                  className="p-2.5 rounded-xl border border-slate-200/80 dark:border-white/[0.1] hover:bg-slate-50 dark:hover:bg-white/[0.06] cursor-pointer shrink-0 transition-colors"
                >
                  <FileUp className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                  <input
                    type="file"
                    accept=".pdf,image/png,image/jpeg,image/webp"
                    onChange={(e) => handleFileUpload(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                </label>

                <textarea
                  rows={2}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendPrompt();
                    }
                  }}
                  placeholder={
                    language === 'hi'
                      ? 'अपना प्रश्न पूछें या PDF अपलोड करें...'
                      : 'Type your academic doubt, paste a problem, or ask about an uploaded PDF...'
                  }
                  className="flex-1 px-3.5 py-2 text-sm cc-input resize-none"
                />

                <button
                  type="submit"
                  disabled={loading || (!input.trim() && !uploadedFile && !selectedMaterialId)}
                  className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50 shrink-0"
                >
                  <Send className="w-4 h-4" />
                  <span className="hidden sm:inline">Send</span>
                </button>
              </form>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
