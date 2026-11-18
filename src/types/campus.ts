export type UserRole = 'student' | 'faculty' | 'admin';

export type MaterialType = 'notes' | 'books' | 'syllabus' | 'pyq' | 'assignment' | 'slides';

export type TaskPriority = 'low' | 'medium' | 'high';
export type TaskCategory = 'syllabus' | 'revision' | 'goal' | 'assignment';

export type AnnouncementCategory = 'academic' | 'exam' | 'event' | 'urgent';

export type ExamType = 'midterm' | 'final' | 'practical' | 'quiz';

export const BLUEPRINT_CONSTRAINTS = {
  ID_REGEX: /^[a-zA-Z0-9_-]+$/,
  MAX_ID_LEN: 128,
  MAX_TITLE_LEN: 180,
  MAX_DESC_LEN: 1000,
  MAX_BODY_LEN: 2000,
  MAX_NOTE_LEN: 240,
  MAX_COURSES_PER_DEPT: 20,
  MAX_UNITS_PER_SUBJECT: 12,
  MAX_CHAT_MESSAGES: 50,
} as const;

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  role: UserRole;
  departmentId: string;
  courseName: string;
  semester: number;
  rollNumber: string;
  avatarUrl: string;
  targetAttendance: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface StudentRosterEntry {
  uid: string;
  displayName: string;
  rollNumber: string;
  departmentId: string;
  courseName: string;
  semester: number;
  updatedAt?: unknown;
}

export interface Department {
  id: string;
  name: string;
  code: string;
  courses: string[];
  semestersCount: number;
  isDemo: boolean;
  createdByUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Subject {
  id: string;
  code: string;
  name: string;
  departmentId: string;
  courseName: string;
  semester: number;
  credits: number;
  facultyName: string;
  units: string[];
  isDemo: boolean;
  createdByUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface StudyMaterial {
  id: string;
  title: string;
  description: string;
  type: MaterialType;
  departmentId: string;
  courseName: string;
  semester: number;
  subjectId: string;
  subjectName: string;
  unit: string;
  fileUrl: string;
  fileName: string;
  fileSizeLabel: string;
  contentPreview: string;
  uploadedByUid: string;
  uploadedByName: string;
  isOfficial: boolean;
  isDemo: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface UserBookmark {
  id: string;
  userId: string;
  materialId: string;
  isBookmarked: boolean;
  lastViewedAt?: unknown;
  updatedAt?: unknown;
}

export interface AttendanceRecord {
  id: string;
  studentUid: string;
  studentName: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  classesAttended: number;
  totalClasses: number;
  recordType: 'personal' | 'official';
  isDemo: boolean;
  updatedByUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AttendanceLog {
  id: string;
  studentUid: string;
  subjectId: string;
  subjectName: string;
  date: string;
  status: 'present' | 'absent' | 'late' | 'cancelled';
  recordType: 'personal' | 'official';
  note: string;
  loggedByUid: string;
  createdAt?: unknown;
}

export interface ExamSchedule {
  id: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  semester: number;
  examType: ExamType;
  examDate: string;
  startTime: string;
  endTime: string;
  venue: string;
  syllabusUnits: string;
  isDemo: boolean;
  createdByUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface StudyTask {
  id: string;
  userId: string;
  subjectId: string;
  subjectName: string;
  unit: string;
  title: string;
  dueDate: string;
  priority: TaskPriority;
  category: TaskCategory;
  completed: boolean;
  isDemo: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  category: AnnouncementCategory;
  departmentId: string;
  authorUid: string;
  authorName: string;
  authorRole: 'faculty' | 'admin';
  isPinned: boolean;
  isDemo: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface TimetableSlot {
  id: string;
  dayOfWeek: number; // 0 = Sun, 1 = Mon ... 6 = Sat
  startTime: string;
  endTime: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  room: string;
  instructor: string;
  semester: number;
  departmentId: string;
  isDemo: boolean;
  createdByUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  topicTag?: string;
}

export interface GeneratedQuiz {
  quizTitle: string;
  sourceSummary?: string;
  questions: QuizQuestion[];
}

export interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  mode?: string;
  attachmentName?: string;
  quiz?: GeneratedQuiz;
  timestamp: string;
}

export interface AiChatSession {
  id: string;
  userId: string;
  title: string;
  subjectName: string;
  language: 'en' | 'hi';
  messages: AiChatMessage[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PlatformSetting {
  id: string;
  institutionName: string;
  defaultRequiredAttendance: number;
  academicYear: string;
  activeSemester: number;
  updatedByUid: string;
  updatedAt?: unknown;
}

export type WhiteboardTool = 'pen' | 'highlighter' | 'rect' | 'circle' | 'text' | 'eraser';

export interface StudyRoom {
  id: string;
  title: string;
  topic: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  semester: number;
  hostUid: string;
  hostName: string;
  isActive: boolean;
  isDemo: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface StudyRoomParticipant {
  uid: string;
  roomId: string;
  displayName: string;
  subjectId: string;
  subjectName: string;
  studyFocus: string;
  colorHex: string;
  status: 'studying' | 'break' | 'away';
  joinedAt?: unknown;
  lastActiveAt?: unknown;
}

export interface WhiteboardStroke {
  id: string;
  roomId: string;
  authorUid: string;
  authorName: string;
  tool: WhiteboardTool;
  color: string;
  strokeWidth: number;
  pointsJson: string;
  text: string;
  createdAt?: unknown;
}

export interface StudyPresence {
  uid: string;
  displayName: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  roomId: string;
  roomTitle: string;
  studyGoal: string;
  isActive: boolean;
  updatedAt?: unknown;
}

export interface StudyRoomChatMessage {
  id: string;
  roomId: string;
  senderUid: string;
  senderName: string;
  colorHex: string;
  text: string;
  timestamp: string;
}

export interface RoomTimerState {
  running: boolean;
  mode: 'focus' | 'break';
  remainingSec: number;
  updatedAtMs: number;
}

export type RoomResourceType = 'library-note' | 'link' | 'snippet';

export interface StudyRoomResource {
  id: string;
  roomId: string;
  authorUid: string;
  authorName: string;
  title: string;
  resourceType: RoomResourceType;
  materialId: string;
  url: string;
  noteText: string;
  subjectCode: string;
  createdAt?: unknown;
}

export interface StudyContributorStat {
  uid: string;
  displayName: string;
  primarySubjectId: string;
  primarySubjectCode: string;
  primarySubjectName: string;
  totalMinutes: number;
  resourcesSharedCount: number;
  sessionsJoined: number;
  points: number;
  isDemo: boolean;
  updatedAt?: unknown;
}

export type ActiveView =
  | 'dashboard'
  | 'materials'
  | 'ai-solver'
  | 'study-room'
  | 'exam-prep'
  | 'attendance'
  | 'attendance-timeline'
  | 'calendar'
  | 'announcements'
  | 'faculty-hub'
  | 'admin-console'
  | 'profile'
  | 'settings';
