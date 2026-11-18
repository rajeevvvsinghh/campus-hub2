import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, Type } from '@google/genai';
import { WebSocketServer, type WebSocket } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '25mb' }));

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in environment secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'campusconnect-api' });
});

interface DoubtRequestBody {
  question?: string;
  mode?: 'explain' | 'step-by-step' | 'summarize' | 'revision-notes' | 'quiz' | 'chat';
  language?: 'en' | 'hi';
  subject?: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  fileData?: {
    base64: string;
    mimeType: string;
    name: string;
  } | null;
  materialContext?: string;
}

app.post('/api/ai/doubt', async (req, res) => {
  try {
    const body = req.body as DoubtRequestBody;
    const question = (body.question || '').trim();
    const mode = body.mode || 'chat';
    const language = body.language === 'hi' ? 'hi' : 'en';
    const subject = (body.subject || 'General Engineering & Sciences').trim();
    const history = Array.isArray(body.history) ? body.history.slice(-10) : [];
    const fileData = body.fileData;
    const materialContext = (body.materialContext || '').trim();

    if (!question && !fileData && !materialContext) {
      return res.status(400).json({ error: 'Please enter a question or attach a study document.' });
    }

    const ai = getGeminiClient();

    const languageInstruction =
      language === 'hi'
        ? 'Respond in clear, natural Hindi (Devanagari script) while keeping standard technical/scientific terms, formulas, and code keywords in English where helpful for college exams.'
        : 'Respond in clear, well-structured academic English.';

    const modeInstructions: Record<string, string> = {
      explain:
        'Explain the concept in simple, intuitive language first, then build up to the formal university-level definition with 2 concrete examples.',
      'step-by-step':
        'Break down the solution or derivation into numbered, easy-to-follow steps, highlighting formulas, assumptions, and common pitfalls.',
      summarize:
        'Provide a concise, high-yield structured summary of the chapter/document with key definitions, core theorems, and takeaways.',
      'revision-notes':
        'Generate crisp exam-ready revision notes with bullet points, key formulas, mnemonics, and probable 5-mark / 10-mark exam questions.',
      quiz:
        'Generate 5 high-quality multiple-choice practice questions testing conceptual understanding and problem solving.',
      chat:
        'Act as a patient, knowledgeable college professor and academic tutor. Be accurate, clear, and encouraging.',
    };

    const systemInstruction = [
      `You are the SKU Campus AI Academic Doubt Solver assisting a university student studying "${subject}".`,
      modeInstructions[mode] || modeInstructions.chat,
      languageInstruction,
      'Format text cleanly using Markdown headings, bullet points, bold emphasis for key terms, and fenced code blocks where appropriate.',
    ].join(' ');

    if (mode === 'quiz') {
      const promptParts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];
      if (fileData?.base64 && fileData?.mimeType) {
        promptParts.push({
          inlineData: {
            mimeType: fileData.mimeType,
            data: fileData.base64,
          },
        });
      }
      const quizPrompt = [
        `Subject: ${subject}`,
        materialContext ? `Reference Material:\n${materialContext.slice(0, 12000)}` : '',
        question ? `Topic / Focus: ${question}` : 'Create a practice quiz from the provided study material.',
        language === 'hi' ? 'Write questions, options, and explanations in Hindi (with technical terms in English if standard).' : '',
      ]
        .filter(Boolean)
        .join('\n\n');

      promptParts.push({ text: quizPrompt });

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: { parts: promptParts },
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              quizTitle: { type: Type.STRING, description: 'Short title for the generated quiz.' },
              questions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    question: { type: Type.STRING },
                    options: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                    correctIndex: { type: Type.INTEGER },
                    explanation: { type: Type.STRING },
                  },
                  required: ['question', 'options', 'correctIndex', 'explanation'],
                },
              },
            },
            required: ['quizTitle', 'questions'],
          },
        },
      });

      const parsed = JSON.parse((response.text || '{}').trim());
      return res.json({
        mode: 'quiz',
        text: `Generated practice quiz: **${parsed.quizTitle || subject}**`,
        quiz: parsed,
      });
    }

    const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

    if (fileData?.base64 && fileData?.mimeType) {
      parts.push({
        inlineData: {
          mimeType: fileData.mimeType,
          data: fileData.base64,
        },
      });
    }

    const historyText =
      history.length > 0
        ? `Previous conversation context:\n${history
            .map((m) => `${m.role === 'user' ? 'Student' : 'Tutor'}: ${m.content.slice(0, 1200)}`)
            .join('\n')}\n\n`
        : '';

    const contextText = materialContext
      ? `Attached study material excerpt:\n${materialContext.slice(0, 12000)}\n\n`
      : '';

    const fullUserPrompt = `${historyText}${contextText}Student request (${mode}): ${
      question || (fileData ? `Please analyze "${fileData.name}" according to the selected mode.` : '')
    }`;

    parts.push({ text: fullUserPrompt });

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: { parts },
      config: {
        systemInstruction,
      },
    });

    const answerText = response.text;
    if (!answerText) {
      return res.status(502).json({ error: 'The AI model returned an empty response. Please try again.' });
    }

    return res.json({
      mode,
      text: answerText,
    });
  } catch (error) {
    console.error('Gemini /api/ai/doubt error:', error);
    const message = error instanceof Error ? error.message : 'Failed to generate AI response.';
    const status = message.includes('GEMINI_API_KEY') ? 500 : 502;
    return res.status(status).json({ error: message });
  }
});

interface ExamQuizBody {
  subjectName?: string;
  unit?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  count?: number;
}

app.post('/api/ai/exam-quiz', async (req, res) => {
  try {
    const body = req.body as ExamQuizBody;
    const subjectName = (body.subjectName || 'Computer Science').trim();
    const unit = (body.unit || 'Core Concepts').trim();
    const difficulty = body.difficulty || 'medium';
    const count = Math.min(Math.max(Number(body.count) || 5, 3), 10);

    const ai = getGeminiClient();

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Generate ${count} ${difficulty}-level university exam practice MCQs for subject "${subjectName}", focusing on "${unit}". Provide 4 concise options per question, the zero-based correctIndex, and a crisp 1-2 sentence explanation.`,
      config: {
        systemInstruction: 'You are an expert university examination paper setter creating rigorous, accurate multiple-choice questions.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            quizTitle: { type: Type.STRING },
            questions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  question: { type: Type.STRING },
                  options: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  correctIndex: { type: Type.INTEGER },
                  explanation: { type: Type.STRING },
                },
                required: ['question', 'options', 'correctIndex', 'explanation'],
              },
            },
          },
          required: ['quizTitle', 'questions'],
        },
      },
    });

    const quiz = JSON.parse((response.text || '{}').trim());
    return res.json(quiz);
  } catch (error) {
    console.error('Gemini /api/ai/exam-quiz error:', error);
    const message = error instanceof Error ? error.message : 'Failed to generate practice quiz.';
    return res.status(502).json({ error: message });
  }
});

interface FlashcardRequestBody {
  subjectName?: string;
  unit?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  count?: number;
  materialContext?: string;
  fileData?: {
    base64: string;
    mimeType: string;
    name: string;
  } | null;
}

app.post('/api/ai/flashcards', async (req, res) => {
  try {
    const body = req.body as FlashcardRequestBody;
    const subjectName = (body.subjectName || 'Computer Science').trim();
    const unit = (body.unit || 'Core Concepts').trim();
    const difficulty = body.difficulty || 'medium';
    const count = Math.min(Math.max(Number(body.count) || 8, 4), 15);
    const materialContext = (body.materialContext || '').trim();
    const fileData = body.fileData;

    const ai = getGeminiClient();

    const promptParts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];
    if (fileData?.base64 && fileData?.mimeType) {
      promptParts.push({
        inlineData: {
          mimeType: fileData.mimeType,
          data: fileData.base64,
        },
      });
    }

    const promptText = [
      `Subject: ${subjectName}`,
      `Unit / Topic: ${unit}`,
      `Difficulty: ${difficulty}`,
      materialContext ? `Source Notes:\n${materialContext.slice(0, 10000)}` : '',
      `Generate ${count} spaced-repetition flashcards for university study. Each flashcard should have a clear "front" (term, concept, or question) and a precise "back" (explanation, definition, or solution), plus a short "hint" or mnemonic.`,
    ]
      .filter(Boolean)
      .join('\n\n');

    promptParts.push({ text: promptText });

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: { parts: promptParts },
      config: {
        systemInstruction: 'You are an expert academic tutor creating high-yield spaced-repetition flashcards for university students.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            deckTitle: { type: Type.STRING },
            cards: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  front: { type: Type.STRING, description: 'Term, formula, or question on front of flashcard' },
                  back: { type: Type.STRING, description: 'Detailed definition, answer, or derivation on back' },
                  hint: { type: Type.STRING, description: 'Optional memory hint or mnemonic' },
                },
                required: ['front', 'back'],
              },
            },
          },
          required: ['deckTitle', 'cards'],
        },
      },
    });

    const parsed = JSON.parse((response.text || '{}').trim());
    return res.json(parsed);
  } catch (error) {
    console.error('Gemini /api/ai/flashcards error:', error);
    const message = error instanceof Error ? error.message : 'Failed to generate flashcards.';
    const status = message.includes('GEMINI_API_KEY') ? 500 : 502;
    return res.status(status).json({ error: message });
  }
});

interface DocumentQuizBody {
  subjectName?: string;
  topicFocus?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  count?: number;
  language?: 'en' | 'hi';
  documentText?: string;
  fileData?: {
    base64: string;
    mimeType: string;
    name: string;
  } | null;
}

app.post('/api/ai/document-quiz', async (req, res) => {
  try {
    const body = req.body as DocumentQuizBody;
    const subjectName = (body.subjectName || 'Academic Course').trim();
    const topicFocus = (body.topicFocus || '').trim();
    const difficulty = body.difficulty || 'medium';
    const count = Math.min(Math.max(Number(body.count) || 5, 3), 12);
    const language = body.language === 'hi' ? 'hi' : 'en';
    const documentText = (body.documentText || '').trim();
    const fileData = body.fileData;

    if (!fileData && !documentText) {
      return res.status(400).json({
        error: 'Please upload a syllabus/notes file, select a library note, or paste document text.',
      });
    }

    const ai = getGeminiClient();

    const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];
    if (fileData?.base64 && fileData?.mimeType) {
      parts.push({
        inlineData: {
          mimeType: fileData.mimeType,
          data: fileData.base64,
        },
      });
    }

    const langLine =
      language === 'hi'
        ? 'Write all questions, 4 options, sourceSummary, topicTag, and explanations in clear Hindi (Devanagari script) while preserving standard English technical terms where helpful.'
        : 'Write all output in clear, rigorous academic English.';

    const promptLines = [
      `Subject: ${subjectName}`,
      `Target Count: ${count} multiple-choice questions`,
      `Difficulty: ${difficulty}`,
      topicFocus ? `Topic Focus: ${topicFocus}` : 'Coverage: Distribute questions across the key concepts in the provided syllabus or notes.',
      documentText ? `Document Content:\n${documentText.slice(0, 24000)}` : '',
      fileData ? `Uploaded File: ${fileData.name}` : '',
      langLine,
      'Every question MUST be directly grounded in the provided syllabus or notes, have exactly 4 distinct options, a valid zero-based correctIndex (0-3), a concise topicTag, and a helpful explanation.',
    ]
      .filter(Boolean)
      .join('\n\n');

    parts.push({ text: promptLines });

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: { parts },
      config: {
        systemInstruction:
          'You are an expert university professor and assessment designer. Generate accurate, syllabus-grounded multiple-choice quizzes strictly from the student’s uploaded document or notes.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            quizTitle: { type: Type.STRING, description: 'Concise title reflecting the uploaded document.' },
            sourceSummary: {
              type: Type.STRING,
              description: '1-2 sentence summary of the topics covered in the quiz from the document.',
            },
            questions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  question: { type: Type.STRING },
                  options: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  correctIndex: { type: Type.INTEGER },
                  explanation: { type: Type.STRING },
                  topicTag: { type: Type.STRING },
                },
                required: ['question', 'options', 'correctIndex', 'explanation', 'topicTag'],
              },
            },
          },
          required: ['quizTitle', 'sourceSummary', 'questions'],
        },
      },
    });

    const quiz = JSON.parse((response.text || '{}').trim());
    if (!Array.isArray(quiz.questions) || quiz.questions.length === 0) {
      return res.status(502).json({ error: 'Could not extract quiz questions from the document. Try adding more text or a clearer PDF.' });
    }

    return res.json(quiz);
  } catch (error) {
    console.error('Gemini /api/ai/document-quiz error:', error);
    const message = error instanceof Error ? error.message : 'Failed to generate document quiz.';
    const status = message.includes('GEMINI_API_KEY') ? 500 : 502;
    return res.status(status).json({ error: message });
  }
});

interface StudyPlannerBody {
  exams?: Array<{ subjectCode: string; subjectName: string; examDate: string; examType: string }>;
  subjects?: Array<{ id: string; code: string; name: string; units: string[] }>;
  completedUnits?: string[];
  studentName?: string;
}

app.post('/api/ai/study-planner', async (req, res) => {
  try {
    const body = req.body as StudyPlannerBody;
    const exams = Array.isArray(body.exams) ? body.exams : [];
    const subjects = Array.isArray(body.subjects) ? body.subjects : [];
    const studentName = String(body.studentName || 'Student').trim();

    const ai = getGeminiClient();

    const prompt = [
      `Student Name: ${studentName}`,
      `Upcoming Exams:\n${JSON.stringify(exams, null, 2)}`,
      `Subjects & Syllabus Units:\n${JSON.stringify(subjects, null, 2)}`,
      'Analyze exam dates urgency and remaining syllabus units. Generate a personalized, highly structured AI study planner with priority focus topics, daily goals, and weekly schedule blocks.',
    ].join('\n\n');

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        systemInstruction: 'You are an expert academic advisor and EdTech AI study planner. Create rigorous, realistic, high-yield study schedules prioritizing exams happening soonest and incomplete units.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            plannerTitle: { type: Type.STRING },
            summary: { type: Type.STRING },
            priorityFocus: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  subject: { type: Type.STRING },
                  urgency: { type: Type.STRING },
                  reason: { type: Type.STRING },
                },
                required: ['subject', 'urgency', 'reason'],
              },
            },
            schedule: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  timeframe: { type: Type.STRING },
                  focusSubject: { type: Type.STRING },
                  dailyGoal: { type: Type.STRING },
                  priorityTopics: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  recommendedMinutes: { type: Type.INTEGER },
                },
                required: ['timeframe', 'focusSubject', 'dailyGoal', 'priorityTopics', 'recommendedMinutes'],
              },
            },
          },
          required: ['plannerTitle', 'summary', 'priorityFocus', 'schedule'],
        },
      },
    });

    const plan = JSON.parse((response.text || '{}').trim());
    return res.json(plan);
  } catch (error) {
    console.error('Gemini /api/ai/study-planner error:', error);
    const message = error instanceof Error ? error.message : 'Failed to generate AI study plan.';
    return res.status(502).json({ error: message });
  }
});

interface WsClientMeta {
  clientId: string;
  uid: string;
  displayName: string;
  roomId: string | null;
  roomTitle: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  studyFocus: string;
  colorHex: string;
  status: 'studying' | 'break' | 'away';
}

interface WsStroke {
  id: string;
  roomId: string;
  authorUid: string;
  authorName: string;
  tool: 'pen' | 'highlighter' | 'rect' | 'circle' | 'text' | 'eraser';
  color: string;
  strokeWidth: number;
  pointsJson: string;
  text: string;
}

interface WsChatMsg {
  id: string;
  roomId: string;
  senderUid: string;
  senderName: string;
  colorHex: string;
  text: string;
  timestamp: string;
}

interface WsTimerState {
  running: boolean;
  mode: 'focus' | 'break';
  remainingSec: number;
  updatedAtMs: number;
}

interface WsRoomResource {
  id: string;
  roomId: string;
  authorUid: string;
  authorName: string;
  title: string;
  resourceType: 'library-note' | 'link' | 'snippet';
  materialId: string;
  url: string;
  noteText: string;
  subjectCode: string;
}

interface WsRoomState {
  strokes: WsStroke[];
  messages: WsChatMsg[];
  resources: WsRoomResource[];
  timer: WsTimerState;
}

function setupStudyRoomWebSocket(server: http.Server) {
  const wss = new WebSocketServer({ server, path: '/ws/study-room' });
  const clients = new Map<WebSocket, WsClientMeta>();
  const rooms = new Map<string, WsRoomState>();

  const getOrCreateRoom = (roomId: string): WsRoomState => {
    let room = rooms.get(roomId);
    if (!room) {
      room = {
        strokes: [],
        messages: [],
        resources: [],
        timer: {
          running: false,
          mode: 'focus',
          remainingSec: 25 * 60,
          updatedAtMs: Date.now(),
        },
      };
      rooms.set(roomId, room);
    }
    return room;
  };

  const sendJson = (ws: WebSocket, payload: unknown) => {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(payload));
    }
  };

  const getRoomPeers = (roomId: string) => {
    const byUid = new Map<string, WsClientMeta>();
    for (const meta of clients.values()) {
      if (meta.roomId === roomId && meta.uid) {
        byUid.set(meta.uid, meta);
      }
    }
    return Array.from(byUid.values());
  };

  const getCampusPresence = () => {
    const byUid = new Map<string, WsClientMeta>();
    for (const meta of clients.values()) {
      if (meta.uid && meta.subjectId) {
        byUid.set(meta.uid, meta);
      }
    }
    return Array.from(byUid.values());
  };

  const broadcastToRoom = (roomId: string, payload: unknown, excludeWs?: WebSocket) => {
    const serialized = JSON.stringify(payload);
    for (const [sock, meta] of clients.entries()) {
      if (sock !== excludeWs && meta.roomId === roomId && sock.readyState === 1) {
        sock.send(serialized);
      }
    }
  };

  const broadcastCampusPresence = () => {
    const serialized = JSON.stringify({
      type: 'campus:presence',
      peers: getCampusPresence(),
    });
    for (const sock of clients.keys()) {
      if (sock.readyState === 1) {
        sock.send(serialized);
      }
    }
  };

  const broadcastRoomPresence = (roomId: string) => {
    broadcastToRoom(roomId, {
      type: 'room:presence',
      roomId,
      peers: getRoomPeers(roomId),
    });
  };

  wss.on('connection', (ws) => {
    const clientId = `ws_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    clients.set(ws, {
      clientId,
      uid: '',
      displayName: 'Student',
      roomId: null,
      roomTitle: '',
      subjectId: '',
      subjectCode: '',
      subjectName: '',
      studyFocus: '',
      colorHex: '#2563eb',
      status: 'studying',
    });

    sendJson(ws, { type: 'campus:presence', peers: getCampusPresence() });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as Record<string, unknown>;
        const meta = clients.get(ws);
        if (!meta) return;

        const eventType = String(msg.type || '');

        if (eventType === 'presence:announce') {
          meta.uid = String(msg.uid || meta.uid).slice(0, 128);
          meta.displayName = String(msg.displayName || meta.displayName).slice(0, 100);
          meta.subjectId = String(msg.subjectId || '').slice(0, 64);
          meta.subjectCode = String(msg.subjectCode || '').slice(0, 24);
          meta.subjectName = String(msg.subjectName || '').slice(0, 140);
          meta.studyFocus = String(msg.studyFocus || '').slice(0, 160);
          meta.colorHex = String(msg.colorHex || meta.colorHex).slice(0, 16);
          const nextStatus = String(msg.status || 'studying');
          meta.status = nextStatus === 'break' || nextStatus === 'away' ? nextStatus : 'studying';

          if (meta.roomId) {
            broadcastRoomPresence(meta.roomId);
          }
          broadcastCampusPresence();
          return;
        }

        if (eventType === 'room:join') {
          const prevRoomId = meta.roomId;
          const nextRoomId = String(msg.roomId || '').slice(0, 64);
          if (!nextRoomId) return;

          meta.uid = String(msg.uid || meta.uid).slice(0, 128);
          meta.displayName = String(msg.displayName || meta.displayName).slice(0, 100);
          meta.roomId = nextRoomId;
          meta.roomTitle = String(msg.roomTitle || '').slice(0, 140);
          meta.subjectId = String(msg.subjectId || meta.subjectId).slice(0, 64);
          meta.subjectCode = String(msg.subjectCode || meta.subjectCode).slice(0, 24);
          meta.subjectName = String(msg.subjectName || meta.subjectName).slice(0, 140);
          meta.studyFocus = String(msg.studyFocus || meta.studyFocus).slice(0, 160);
          meta.colorHex = String(msg.colorHex || meta.colorHex).slice(0, 16);
          const nextStatus = String(msg.status || 'studying');
          meta.status = nextStatus === 'break' || nextStatus === 'away' ? nextStatus : 'studying';

          if (prevRoomId && prevRoomId !== nextRoomId) {
            broadcastRoomPresence(prevRoomId);
          }

          const room = getOrCreateRoom(nextRoomId);
          const initialStrokes = Array.isArray(msg.initialStrokes) ? (msg.initialStrokes as WsStroke[]) : [];
          if (room.strokes.length === 0 && initialStrokes.length > 0) {
            for (const s of initialStrokes.slice(0, 400)) {
              if (s && typeof s.id === 'string' && !room.strokes.some((ex) => ex.id === s.id)) {
                room.strokes.push(s);
              }
            }
          }

          const effectiveRemaining = room.timer.running
            ? Math.max(0, room.timer.remainingSec - Math.floor((Date.now() - room.timer.updatedAtMs) / 1000))
            : room.timer.remainingSec;

          sendJson(ws, {
            type: 'room:init',
            roomId: nextRoomId,
            strokes: room.strokes,
            messages: room.messages,
            resources: room.resources,
            timer: {
              ...room.timer,
              remainingSec: effectiveRemaining,
            },
            peers: getRoomPeers(nextRoomId),
          });

          broadcastRoomPresence(nextRoomId);
          broadcastCampusPresence();
          return;
        }

        if (eventType === 'room:leave') {
          const prevRoomId = meta.roomId;
          meta.roomId = null;
          meta.roomTitle = '';
          if (prevRoomId) {
            broadcastRoomPresence(prevRoomId);
          }
          broadcastCampusPresence();
          return;
        }

        if (eventType === 'stroke:add') {
          const roomId = String(msg.roomId || meta.roomId || '').slice(0, 64);
          const stroke = msg.stroke as WsStroke | undefined;
          if (!roomId || !stroke || typeof stroke.id !== 'string') return;
          const room = getOrCreateRoom(roomId);
          if (room.strokes.some((s) => s.id === stroke.id)) return;
          room.strokes.push(stroke);
          if (room.strokes.length > 400) {
            room.strokes = room.strokes.slice(-400);
          }
          broadcastToRoom(roomId, { type: 'stroke:added', roomId, stroke }, ws);
          return;
        }

        if (eventType === 'stroke:delete') {
          const roomId = String(msg.roomId || meta.roomId || '').slice(0, 64);
          const strokeId = String(msg.strokeId || '').slice(0, 128);
          if (!roomId || !strokeId) return;
          const room = getOrCreateRoom(roomId);
          room.strokes = room.strokes.filter((s) => s.id !== strokeId);
          broadcastToRoom(roomId, { type: 'stroke:deleted', roomId, strokeId }, ws);
          return;
        }

        if (eventType === 'board:clear') {
          const roomId = String(msg.roomId || meta.roomId || '').slice(0, 64);
          if (!roomId) return;
          const room = getOrCreateRoom(roomId);
          room.strokes = [];
          broadcastToRoom(roomId, { type: 'board:cleared', roomId }, ws);
          return;
        }

        if (eventType === 'cursor:move') {
          const roomId = String(msg.roomId || meta.roomId || '').slice(0, 64);
          if (!roomId || !meta.uid) return;
          broadcastToRoom(
            roomId,
            {
              type: 'cursor:moved',
              roomId,
              uid: meta.uid,
              displayName: meta.displayName,
              colorHex: meta.colorHex,
              x: Number(msg.x) || 0,
              y: Number(msg.y) || 0,
            },
            ws
          );
          return;
        }

        if (eventType === 'chat:send') {
          const roomId = String(msg.roomId || meta.roomId || '').slice(0, 64);
          const message = msg.message as WsChatMsg | undefined;
          if (!roomId || !message || typeof message.id !== 'string' || !message.text?.trim()) return;
          const room = getOrCreateRoom(roomId);
          if (room.messages.some((m) => m.id === message.id)) return;
          const cleanMsg: WsChatMsg = {
            id: message.id.slice(0, 128),
            roomId,
            senderUid: String(message.senderUid || meta.uid).slice(0, 128),
            senderName: String(message.senderName || meta.displayName).slice(0, 100),
            colorHex: String(message.colorHex || meta.colorHex).slice(0, 16),
            text: String(message.text).trim().slice(0, 600),
            timestamp: message.timestamp || new Date().toISOString(),
          };
          room.messages.push(cleanMsg);
          if (room.messages.length > 100) {
            room.messages = room.messages.slice(-100);
          }
          broadcastToRoom(roomId, { type: 'chat:message', roomId, message: cleanMsg }, ws);
          return;
        }

        if (eventType === 'resource:share') {
          const roomId = String(msg.roomId || meta.roomId || '').slice(0, 64);
          const resource = msg.resource as WsRoomResource | undefined;
          if (!roomId || !resource || typeof resource.id !== 'string' || !resource.title?.trim()) return;
          const room = getOrCreateRoom(roomId);
          if (room.resources.some((r) => r.id === resource.id)) return;
          const cleanRes: WsRoomResource = {
            id: resource.id.slice(0, 128),
            roomId,
            authorUid: String(resource.authorUid || meta.uid).slice(0, 128),
            authorName: String(resource.authorName || meta.displayName).slice(0, 100),
            title: String(resource.title).trim().slice(0, 180),
            resourceType:
              resource.resourceType === 'library-note' || resource.resourceType === 'link'
                ? resource.resourceType
                : 'snippet',
            materialId: String(resource.materialId || '').slice(0, 64),
            url: String(resource.url || '').slice(0, 1000),
            noteText: String(resource.noteText || '').slice(0, 1000),
            subjectCode: String(resource.subjectCode || meta.subjectCode || 'GEN').slice(0, 24),
          };
          room.resources.unshift(cleanRes);
          if (room.resources.length > 100) {
            room.resources = room.resources.slice(0, 100);
          }
          broadcastToRoom(roomId, { type: 'resource:shared', roomId, resource: cleanRes }, ws);
          return;
        }

        if (eventType === 'resource:delete') {
          const roomId = String(msg.roomId || meta.roomId || '').slice(0, 64);
          const resourceId = String(msg.resourceId || '').slice(0, 128);
          if (!roomId || !resourceId) return;
          const room = getOrCreateRoom(roomId);
          room.resources = room.resources.filter((r) => r.id !== resourceId);
          broadcastToRoom(roomId, { type: 'resource:deleted', roomId, resourceId }, ws);
          return;
        }

        if (eventType === 'timer:action') {
          const roomId = String(msg.roomId || meta.roomId || '').slice(0, 64);
          if (!roomId) return;
          const room = getOrCreateRoom(roomId);
          const action = String(msg.action || '');
          const now = Date.now();
          const currentRemaining = room.timer.running
            ? Math.max(0, room.timer.remainingSec - Math.floor((now - room.timer.updatedAtMs) / 1000))
            : room.timer.remainingSec;

          if (action === 'start') {
            room.timer = {
              ...room.timer,
              running: true,
              remainingSec: currentRemaining > 0 ? currentRemaining : room.timer.mode === 'focus' ? 25 * 60 : 5 * 60,
              updatedAtMs: now,
            };
          } else if (action === 'pause') {
            room.timer = {
              ...room.timer,
              running: false,
              remainingSec: currentRemaining,
              updatedAtMs: now,
            };
          } else if (action === 'reset') {
            room.timer = {
              ...room.timer,
              running: false,
              remainingSec: room.timer.mode === 'focus' ? 25 * 60 : 5 * 60,
              updatedAtMs: now,
            };
          } else if (action === 'mode') {
            const nextMode = msg.mode === 'break' ? 'break' : 'focus';
            room.timer = {
              running: false,
              mode: nextMode,
              remainingSec: nextMode === 'focus' ? 25 * 60 : 5 * 60,
              updatedAtMs: now,
            };
          }

          broadcastToRoom(roomId, { type: 'timer:state', roomId, timer: room.timer });
        }
      } catch (err) {
        console.warn('Study room WS message parse error:', err);
      }
    });

    ws.on('close', () => {
      const meta = clients.get(ws);
      const prevRoomId = meta?.roomId || null;
      clients.delete(ws);
      if (prevRoomId) {
        broadcastRoomPresence(prevRoomId);
      }
      broadcastCampusPresence();
    });
  });
}

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  const server = http.createServer(app);
  setupStudyRoomWebSocket(server);

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`SKU Campus server & Study Room WS running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
