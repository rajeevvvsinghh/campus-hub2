import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { auth, testConnection } from '../lib/firebase';
import {
  adminSetUserRole,
  clearRoomWhiteboardStrokes,
  createAttendanceLog,
  deleteAnnouncement,
  deleteAttendanceLog,
  deleteExam,
  deleteStudyMaterial,
  deleteStudyRoom,
  deleteStudyRoomResource,
  deleteStudyTask,
  deleteWhiteboardStroke,
  ensureAndJoinRoomParticipant,
  ensureUserProfile,
  incrementStudyContributorStat,
  leaveStudyRoomParticipant,
  makeSafeId,
  saveAiChatSession,
  saveAnnouncement,
  saveAttendanceRecord,
  saveDepartment,
  saveExam,
  savePlatformSettings,
  saveStudyMaterial,
  saveStudyRoom,
  saveStudyRoomResource,
  saveStudyTask,
  saveSubject,
  saveWhiteboardStroke,
  seedInstitutionCatalogData,
  seedPersonalWorkspaceData,
  subscribeCollection,
  updateUserProfile,
  uploadMaterialFile,
  uploadProfileAvatar,
  upsertBookmark,
  upsertStudyPresence,
} from '../services/campusService';
import {
  buildSampleAttendance,
  buildSampleAttendanceLogs,
  buildSampleStudyTasks,
  DEFAULT_PLATFORM_SETTINGS,
  SAMPLE_ANNOUNCEMENTS,
  SAMPLE_DEPARTMENTS,
  SAMPLE_EXAMS,
  SAMPLE_MATERIALS,
  SAMPLE_STUDY_CONTRIBUTORS,
  SAMPLE_STUDY_ROOMS,
  SAMPLE_SUBJECTS,
  SAMPLE_TIMETABLE,
} from '../data/sampleData';
import type {
  ActiveView,
  AiChatSession,
  Announcement,
  AttendanceLog,
  AttendanceRecord,
  Department,
  ExamSchedule,
  PlatformSetting,
  StudentRosterEntry,
  StudyContributorStat,
  StudyMaterial,
  StudyPresence,
  StudyRoom,
  StudyRoomParticipant,
  StudyRoomResource,
  StudyTask,
  Subject,
  TimetableSlot,
  UserBookmark,
  UserProfile,
  UserRole,
  WhiteboardStroke,
} from '../types/campus';
import { analyzeAttendance } from '../lib/attendanceMath';
import type { ParsedQrCheckIn } from '../lib/attendanceQr';
import { processAvatarImageFile } from '../lib/avatarImage';

export type NotificationKind = 'announcement' | 'deadline' | 'attendance';

export interface NotificationItem {
  id: string;
  title: string;
  detail: string;
  meta: string;
  kind: NotificationKind;
  severity: 'info' | 'warning' | 'urgent';
  targetView: ActiveView;
}

interface CampusContextValue {
  // Auth & Mode
  firebaseUser: User | null;
  authReady: boolean;
  isDemoMode: boolean;
  isEmailUnverified: boolean;
  profile: UserProfile | null;
  activeRoleView: UserRole;
  setActiveRoleView: (role: UserRole) => void;
  enterDemoMode: (role?: UserRole) => void;
  exitDemoMode: () => void;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (name: string, email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  refreshVerification: () => Promise<boolean>;
  logout: () => Promise<void>;

  // Navigation & Theme
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  colorPalette: 'blue' | 'emerald' | 'violet' | 'slate';
  setColorPalette: (palette: 'blue' | 'emerald' | 'violet' | 'slate') => void;
  globalSearchQuery: string;
  setGlobalSearchQuery: (q: string) => void;
  aiPrefillMaterial: StudyMaterial | null;
  openAiWithMaterial: (material: StudyMaterial) => void;
  materialUploadRequested: boolean;
  openMaterialUploader: () => void;
  clearMaterialUploadRequest: () => void;
  qrScannerRequested: boolean;
  openQrScanner: () => void;
  clearQrScannerRequest: () => void;

  // Data Collections
  departments: Department[];
  subjects: Subject[];
  materials: StudyMaterial[];
  bookmarks: UserBookmark[];
  attendanceRecords: AttendanceRecord[];
  attendanceLogs: AttendanceLog[];
  exams: ExamSchedule[];
  studyTasks: StudyTask[];
  announcements: Announcement[];
  timetable: TimetableSlot[];
  aiChats: AiChatSession[];
  platformSettings: PlatformSetting;
  allUsers: UserProfile[];
  studentRoster: StudentRosterEntry[];
  studyRooms: StudyRoom[];
  studyPresenceList: StudyPresence[];
  studyContributors: StudyContributorStat[];
  notifications: NotificationItem[];
  readNotificationIds: string[];
  liveAlerts: NotificationItem[];
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  dismissLiveAlert: (id: string) => void;

  // Actions
  seedSampleWorkspace: () => Promise<void>;
  saveProfileChanges: (updates: Partial<Pick<UserProfile, 'displayName' | 'departmentId' | 'courseName' | 'semester' | 'rollNumber' | 'avatarUrl' | 'targetAttendance'>>) => Promise<void>;
  uploadAvatarPhoto: (
    file: File,
    onProgress?: (percent: number) => void
  ) => Promise<{ avatarUrl: string; storageUsed: boolean; storageError?: string }>;
  removeAvatarPhoto: () => Promise<void>;
  toggleBookmarkMaterial: (materialId: string) => Promise<void>;
  recordMaterialView: (materialId: string) => Promise<void>;
  uploadAndCreateMaterial: (payload: {
    title: string;
    description: string;
    type: StudyMaterial['type'];
    departmentId: string;
    courseName: string;
    semester: number;
    subjectId: string;
    subjectName: string;
    unit: string;
    isOfficial: boolean;
    file?: File | null;
    contentPreview: string;
    onProgress?: (percent: number) => void;
  }) => Promise<{ storageUsed: boolean; storageError?: string; materialId: string; fileUrl: string }>;
  removeMaterial: (id: string) => Promise<void>;
  markAttendanceQuick: (record: AttendanceRecord, status: 'present' | 'absent' | 'late', note?: string) => Promise<void>;
  upsertAttendanceSubject: (payload: {
    id?: string;
    studentUid: string;
    studentName: string;
    subjectId: string;
    subjectCode: string;
    subjectName: string;
    classesAttended: number;
    totalClasses: number;
    recordType: 'personal' | 'official';
  }) => Promise<void>;
  logAttendanceTimelineEntry: (payload: {
    kind: 'course' | 'event';
    subjectId?: string;
    title: string;
    date: string;
    status: 'present' | 'absent' | 'late';
    note?: string;
    recordType?: 'personal' | 'official';
    studentUid?: string;
    studentName?: string;
    updateSubjectTotals?: boolean;
  }) => Promise<void>;
  removeAttendanceLogItem: (logId: string) => Promise<void>;
  checkInWithQr: (parsed: ParsedQrCheckIn) => Promise<{
    status: 'checked-in' | 'duplicate' | 'error';
    message: string;
    updatedPercentage?: number;
  }>;
  toggleStudyTask: (task: StudyTask) => Promise<void>;
  createOrUpdateStudyTask: (task: Omit<StudyTask, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'isDemo'> & { id?: string }) => Promise<void>;
  removeStudyTask: (taskId: string) => Promise<void>;
  publishAnnouncement: (payload: { title: string; body: string; category: Announcement['category']; departmentId: string; isPinned: boolean }) => Promise<void>;
  removeAnnouncementItem: (id: string) => Promise<void>;
  createExamSchedule: (payload: Omit<ExamSchedule, 'id' | 'isDemo' | 'createdByUid' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  removeExamSchedule: (id: string) => Promise<void>;
  createDepartmentItem: (payload: { name: string; code: string; courses: string[]; semestersCount: number }) => Promise<void>;
  createSubjectItem: (payload: { code: string; name: string; departmentId: string; courseName: string; semester: number; credits: number; facultyName: string; units: string[] }) => Promise<void>;
  updatePlatformConfig: (payload: Omit<PlatformSetting, 'id' | 'updatedByUid' | 'updatedAt'>) => Promise<void>;
  changeUserRole: (targetUid: string, role: UserRole, deptId: string) => Promise<void>;
  persistAiChat: (session: AiChatSession, isNew: boolean) => Promise<void>;
  createStudyRoomItem: (payload: { title: string; topic: string; subjectId: string; subjectCode: string; subjectName: string; semester: number }) => Promise<StudyRoom | null>;
  removeStudyRoomItem: (roomId: string) => Promise<void>;
  publishMyStudyPresence: (payload: { subjectId: string; subjectCode: string; subjectName: string; roomId: string; roomTitle: string; studyGoal: string; isActive: boolean }) => Promise<void>;
  joinStudyRoomInFirestore: (room: StudyRoom, participant: Omit<StudyRoomParticipant, 'joinedAt' | 'lastActiveAt'>) => Promise<void>;
  leaveStudyRoomInFirestore: (roomId: string) => Promise<void>;
  persistRoomStroke: (stroke: Omit<WhiteboardStroke, 'createdAt'>) => Promise<void>;
  removeRoomStroke: (roomId: string, strokeId: string) => Promise<void>;
  clearRoomStrokesInFirestore: (roomId: string, isHostOrAdmin: boolean) => Promise<void>;
  recordStudyContribution: (payload: {
    subjectId: string;
    subjectCode: string;
    subjectName: string;
    minutesDelta?: number;
    resourcesDelta?: number;
    sessionsDelta?: number;
  }) => Promise<void>;
  persistRoomResource: (resource: Omit<StudyRoomResource, 'createdAt'>) => Promise<void>;
  removeRoomResource: (roomId: string, resourceId: string) => Promise<void>;
}

const CampusContext = createContext<CampusContextValue | null>(null);

function readLocalAvatarOverride(uid: string): string | null {
  if (typeof window === 'undefined' || !uid) return null;
  try {
    return localStorage.getItem(`skucampus_local_avatar_${uid}`);
  } catch {
    return null;
  }
}

function writeLocalAvatarOverride(uid: string, value: string | null): void {
  if (typeof window === 'undefined' || !uid) return;
  try {
    const key = `skucampus_local_avatar_${uid}`;
    if (value === null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  } catch {
    // Ignore storage quota or access errors
  }
}

type EditableProfileFields = Pick<
  UserProfile,
  'displayName' | 'departmentId' | 'courseName' | 'semester' | 'rollNumber' | 'targetAttendance'
>;

function readDemoProfileOverride(role: UserRole): Partial<EditableProfileFields> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`skucampus_demo_profile_v1_${role}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Partial<EditableProfileFields>) : null;
  } catch {
    return null;
  }
}

function writeDemoProfileOverride(role: UserRole, profile: UserProfile): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: EditableProfileFields = {
      displayName: profile.displayName,
      departmentId: profile.departmentId,
      courseName: profile.courseName,
      semester: profile.semester,
      rollNumber: profile.rollNumber,
      targetAttendance: profile.targetAttendance,
    };
    localStorage.setItem(`skucampus_demo_profile_v1_${role}`, JSON.stringify(payload));
  } catch {
    // Ignore storage errors
  }
}

export const CampusProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [activeRoleView, setActiveRoleView] = useState<UserRole>('student');
  const [activeView, setActiveView] = useState<ActiveView>('dashboard');
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [aiPrefillMaterial, setAiPrefillMaterial] = useState<StudyMaterial | null>(null);
  const [materialUploadRequested, setMaterialUploadRequested] = useState(false);
  const [qrScannerRequested, setQrScannerRequested] = useState(false);

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('campusconnect_theme');
      if (saved === 'dark' || saved === 'light') return saved;
    }
    return 'light';
  });

  // Live or Demo datasets
  const [departments, setDepartments] = useState<Department[]>(SAMPLE_DEPARTMENTS);
  const [subjects, setSubjects] = useState<Subject[]>(SAMPLE_SUBJECTS);
  const [materials, setMaterials] = useState<StudyMaterial[]>(SAMPLE_MATERIALS);
  const [bookmarks, setBookmarks] = useState<UserBookmark[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceLog[]>([]);
  const [exams, setExams] = useState<ExamSchedule[]>(SAMPLE_EXAMS);
  const [studyTasks, setStudyTasks] = useState<StudyTask[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>(SAMPLE_ANNOUNCEMENTS);
  const [timetable, setTimetable] = useState<TimetableSlot[]>(SAMPLE_TIMETABLE);
  const [aiChats, setAiChats] = useState<AiChatSession[]>([]);
  const [platformSettings, setPlatformSettings] = useState<PlatformSetting>(DEFAULT_PLATFORM_SETTINGS);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [studentRoster, setStudentRoster] = useState<StudentRosterEntry[]>([]);
  const [studyRooms, setStudyRooms] = useState<StudyRoom[]>(SAMPLE_STUDY_ROOMS);
  const [studyPresenceList, setStudyPresenceList] = useState<StudyPresence[]>([]);
  const [studyContributors, setStudyContributors] = useState<StudyContributorStat[]>([]);
  const [readNotificationIds, setReadNotificationIds] = useState<string[]>([]);
  const [liveAlerts, setLiveAlerts] = useState<NotificationItem[]>([]);
  const seenNotifIdsRef = useRef<Set<string>>(new Set());
  const notifBaselineReadyRef = useRef<boolean>(false);
  const prevNotifScopeRef = useRef<string>('');

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('campusconnect_theme', theme);
  }, [theme]);

  const [colorPalette, setColorPaletteState] = useState<'blue' | 'emerald' | 'violet' | 'slate'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('campusconnect_palette');
      if (saved === 'blue' || saved === 'emerald' || saved === 'violet' || saved === 'slate') return saved;
    }
    return 'blue';
  });

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-palette', colorPalette);
    localStorage.setItem('campusconnect_palette', colorPalette);

    const paletteMap: Record<
      string,
      { accent: string; hover: string; light: string; subtle: string; rgb: string; fg: string }
    > = {
      emerald: {
        accent: theme === 'dark' ? '#10B981' : '#059669',
        hover: theme === 'dark' ? '#059669' : '#047857',
        light: theme === 'dark' ? 'rgba(16, 185, 129, 0.16)' : '#ECFDF5',
        subtle: theme === 'dark' ? 'rgba(16, 185, 129, 0.28)' : 'rgba(5, 150, 105, 0.18)',
        rgb: theme === 'dark' ? '16, 185, 129' : '5, 150, 105',
        fg: '#FFFFFF',
      },
      violet: {
        accent: theme === 'dark' ? '#8B5CF6' : '#7C3AED',
        hover: theme === 'dark' ? '#7C3AED' : '#6D28D9',
        light: theme === 'dark' ? 'rgba(139, 92, 246, 0.18)' : '#F5F3FF',
        subtle: theme === 'dark' ? 'rgba(139, 92, 246, 0.28)' : 'rgba(124, 58, 237, 0.18)',
        rgb: theme === 'dark' ? '139, 92, 246' : '124, 58, 237',
        fg: '#FFFFFF',
      },
      slate: {
        accent: theme === 'dark' ? '#CBD5E1' : '#334155',
        hover: theme === 'dark' ? '#94A3B8' : '#1E293B',
        light: theme === 'dark' ? 'rgba(148, 163, 184, 0.14)' : '#F1F5F9',
        subtle: theme === 'dark' ? 'rgba(148, 163, 184, 0.24)' : 'rgba(51, 65, 85, 0.16)',
        rgb: theme === 'dark' ? '148, 163, 184' : '51, 65, 85',
        fg: theme === 'dark' ? '#07090E' : '#FFFFFF',
      },
      blue: {
        accent: theme === 'dark' ? '#3B82F6' : '#2563EB',
        hover: theme === 'dark' ? '#2563EB' : '#1D4ED8',
        light: theme === 'dark' ? 'rgba(59, 130, 246, 0.16)' : '#EFF6FF',
        subtle: theme === 'dark' ? 'rgba(59, 130, 246, 0.28)' : 'rgba(37, 99, 235, 0.18)',
        rgb: theme === 'dark' ? '59, 130, 246' : '37, 99, 235',
        fg: '#FFFFFF',
      },
    };

    const p = paletteMap[colorPalette] || paletteMap.blue;
    root.style.setProperty('--cc-accent', p.accent);
    root.style.setProperty('--cc-accent-hover', p.hover);
    root.style.setProperty('--cc-accent-light', p.light);
    root.style.setProperty('--cc-accent-subtle', p.subtle);
    root.style.setProperty('--cc-accent-rgb', p.rgb);
    root.style.setProperty('--cc-accent-fg', p.fg);
  }, [colorPalette, theme]);

  const setColorPalette = (palette: 'blue' | 'emerald' | 'violet' | 'slate') => {
    setColorPaletteState(palette);
  };

  useEffect(() => {
    testConnection();
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        setIsDemoMode(false);
        if (user.emailVerified) {
          try {
            const p = await ensureUserProfile({
              uid: user.uid,
              email: user.email || '',
              displayName: user.displayName || user.email?.split('@')[0] || 'Student',
              avatarUrl: user.photoURL || '',
            });
            const localOverride = readLocalAvatarOverride(user.uid);
            const resolvedAvatar =
              localOverride === '__REMOVED__' ? '' : localOverride || p.avatarUrl;
            setProfile({ ...p, avatarUrl: resolvedAvatar });
            setActiveRoleView(p.role);
          } catch (err) {
            console.error('Error initializing profile:', err);
          }
        } else {
          setProfile({
            uid: user.uid,
            displayName: user.displayName || user.email?.split('@')[0] || 'Rajeev Singh',
            email: user.email || '',
            role: 'student',
            departmentId: 'dept_cse',
            courseName: 'B.Tech Computer Science',
            semester: 3,
            rollNumber: 'PENDING',
            avatarUrl: user.photoURL || '',
            targetAttendance: 75,
          });
        }
      } else {
        setProfile(null);
      }
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  const isEmailUnverified = Boolean(firebaseUser && !firebaseUser.emailVerified);

  // Attach Firestore realtime listeners ONLY when authenticated and verified
  useEffect(() => {
    if (!authReady || !firebaseUser || !firebaseUser.emailVerified || isDemoMode) {
      return;
    }

    const uid = firebaseUser.uid;
    const unsubs: Array<() => void> = [];

    unsubs.push(
      subscribeCollection<Department>('departments', (items) => {
        setDepartments(items.length > 0 ? items : SAMPLE_DEPARTMENTS);
      })
    );
    unsubs.push(
      subscribeCollection<Subject>('subjects', (items) => {
        setSubjects(items.length > 0 ? items : SAMPLE_SUBJECTS);
      })
    );
    unsubs.push(
      subscribeCollection<StudyMaterial>('materials', (items) => {
        setMaterials(items.length > 0 ? items : SAMPLE_MATERIALS);
      })
    );
    unsubs.push(
      subscribeCollection<UserBookmark>('userBookmarks', (items) => {
        setBookmarks(items);
      }, 'userId', uid)
    );
    unsubs.push(
      subscribeCollection<AttendanceRecord>(
        'attendanceSubjects',
        (items) => setAttendanceRecords(items),
        profile?.role === 'student' ? 'studentUid' : undefined,
        profile?.role === 'student' ? uid : undefined
      )
    );
    unsubs.push(
      subscribeCollection<AttendanceLog>(
        'attendanceLogs',
        (items) => setAttendanceLogs(items),
        profile?.role === 'student' ? 'studentUid' : undefined,
        profile?.role === 'student' ? uid : undefined
      )
    );
    unsubs.push(
      subscribeCollection<ExamSchedule>('exams', (items) => {
        setExams(items.length > 0 ? items : SAMPLE_EXAMS);
      })
    );
    unsubs.push(
      subscribeCollection<StudyTask>('studyTasks', (items) => {
        setStudyTasks(items);
      }, 'userId', uid)
    );
    unsubs.push(
      subscribeCollection<Announcement>('announcements', (items) => {
        setAnnouncements(items.length > 0 ? items : SAMPLE_ANNOUNCEMENTS);
      })
    );
    unsubs.push(
      subscribeCollection<TimetableSlot>('timetable', (items) => {
        setTimetable(items.length > 0 ? items : SAMPLE_TIMETABLE);
      })
    );
    unsubs.push(
      subscribeCollection<AiChatSession>('aiChats', (items) => {
        setAiChats(items);
      }, 'userId', uid)
    );
    unsubs.push(
      subscribeCollection<PlatformSetting>('platformSettings', (items) => {
        if (items.length > 0) {
          setPlatformSettings(items[0]);
        }
      })
    );

    if (profile?.role === 'admin') {
      unsubs.push(subscribeCollection<UserProfile>('users', (items) => setAllUsers(items)));
    }
    if (profile?.role === 'admin' || profile?.role === 'faculty') {
      unsubs.push(subscribeCollection<StudentRosterEntry>('studentRosters', (items) => setStudentRoster(items)));
    }
    unsubs.push(
      subscribeCollection<StudyRoom>('studyRooms', (items) => {
        setStudyRooms(items.length > 0 ? items : SAMPLE_STUDY_ROOMS);
      })
    );
    unsubs.push(
      subscribeCollection<StudyPresence>('studyPresence', (items) => {
        setStudyPresenceList(items);
      })
    );
    unsubs.push(
      subscribeCollection<StudyContributorStat>('studyContributors', (items) => {
        setStudyContributors(items);
      })
    );

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [authReady, firebaseUser, isDemoMode, profile?.role]);

  const enterDemoMode = (role: UserRole = 'student') => {
    const demoUid = 'demo_student_01';
    const baseName = role === 'faculty' ? 'Dr. Meera Kulkarni' : role === 'admin' ? 'Campus Administrator' : 'Rajeev Singh';
    const savedOverride = readDemoProfileOverride(role);
    const demoName = savedOverride?.displayName?.trim() || baseName;
    const demoSemester =
      typeof savedOverride?.semester === 'number'
        ? Math.max(1, Math.min(12, Math.round(savedOverride.semester)))
        : 3;
    const demoCourse = savedOverride?.courseName?.trim() || 'B.Tech Computer Science';
    const demoDept = savedOverride?.departmentId?.trim() || 'dept_cse';
    const demoRoll = savedOverride?.rollNumber?.trim() || (role === 'student' ? '25CSE1042' : 'FAC-CS09');
    const demoTargetAttendance =
      typeof savedOverride?.targetAttendance === 'number'
        ? Math.max(50, Math.min(100, Math.round(savedOverride.targetAttendance)))
        : 75;

    const localOverride = readLocalAvatarOverride(demoUid);
    const demoAvatar =
      localOverride === '__REMOVED__'
        ? ''
        : localOverride || '/src/assets/images/avatar_student_default_1794918573501.jpg';
    setIsDemoMode(true);
    setProfile({
      uid: demoUid,
      displayName: demoName,
      email: role === 'faculty' ? 'meera.kulkarni@campus.edu' : role === 'admin' ? 'admin@campus.edu' : 'rajeev.singh@campus.edu',
      role,
      departmentId: demoDept,
      courseName: demoCourse,
      semester: demoSemester,
      rollNumber: demoRoll,
      avatarUrl: demoAvatar,
      targetAttendance: demoTargetAttendance,
    });
    setActiveRoleView(role);
    setDepartments(SAMPLE_DEPARTMENTS);
    setSubjects(SAMPLE_SUBJECTS);
    setMaterials(SAMPLE_MATERIALS);
    setAttendanceRecords(buildSampleAttendance(demoUid, demoName));
    setAttendanceLogs(buildSampleAttendanceLogs(demoUid));
    setExams(SAMPLE_EXAMS);
    setStudyTasks(buildSampleStudyTasks(demoUid));
    setAnnouncements(SAMPLE_ANNOUNCEMENTS);
    setTimetable(SAMPLE_TIMETABLE);
    setPlatformSettings(DEFAULT_PLATFORM_SETTINGS);
    setStudentRoster([
      { uid: demoUid, displayName: demoName, rollNumber: demoRoll, departmentId: demoDept, courseName: demoCourse, semester: demoSemester },
      { uid: 'demo_student_02', displayName: 'Diya Patel', rollNumber: '25CSE1018', departmentId: 'dept_cse', courseName: 'B.Tech Computer Science', semester: 3 },
      { uid: 'demo_student_03', displayName: 'Kabir Verma', rollNumber: '25CSE1075', departmentId: 'dept_cse', courseName: 'B.Tech Computer Science', semester: 3 },
    ]);
    setAllUsers([
      { uid: demoUid, displayName: demoName, email: 'rajeev.singh@campus.edu', role: 'student', departmentId: demoDept, courseName: demoCourse, semester: demoSemester, rollNumber: demoRoll, avatarUrl: '', targetAttendance: demoTargetAttendance },
      { uid: 'demo_faculty_01', displayName: 'Dr. Meera Kulkarni', email: 'meera.kulkarni@campus.edu', role: 'faculty', departmentId: 'dept_cse', courseName: 'Computer Science', semester: 3, rollNumber: 'FAC-CS01', avatarUrl: '', targetAttendance: 75 },
      { uid: 'demo_admin_01', displayName: 'Campus Administrator', email: 'admin@campus.edu', role: 'admin', departmentId: 'dept_cse', courseName: 'Administration', semester: 3, rollNumber: 'ADM-01', avatarUrl: '', targetAttendance: 75 },
    ]);
    setBookmarks([
      { id: `${demoUid}_mat_os_u1`, userId: demoUid, materialId: 'mat_os_u1', isBookmarked: true },
      { id: `${demoUid}_mat_dbms_u3`, userId: demoUid, materialId: 'mat_dbms_u3', isBookmarked: true },
    ]);
    setStudyRooms(SAMPLE_STUDY_ROOMS);
    setStudyPresenceList([]);
    setStudyContributors(SAMPLE_STUDY_CONTRIBUTORS);
    setActiveView('dashboard');
  };

  const exitDemoMode = () => {
    setIsDemoMode(false);
    setProfile(null);
    setStudyContributors([]);
    setActiveView('dashboard');
  };

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const signInWithEmail = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const registerWithEmail = async (name: string, email: string, password: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });
    await sendEmailVerification(cred.user);
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  };

  const resendVerification = async () => {
    if (auth.currentUser) {
      await sendEmailVerification(auth.currentUser);
    }
  };

  const refreshVerification = async (): Promise<boolean> => {
    if (!auth.currentUser) return false;
    await reload(auth.currentUser);
    const verified = auth.currentUser.emailVerified;
    if (verified) {
      const p = await ensureUserProfile({
        uid: auth.currentUser.uid,
        email: auth.currentUser.email || '',
        displayName: auth.currentUser.displayName || 'Student',
        avatarUrl: auth.currentUser.photoURL || '',
      });
      setProfile(p);
      setActiveRoleView(p.role);
    }
    return verified;
  };

  const logout = async () => {
    if (isDemoMode) {
      exitDemoMode();
      return;
    }
    await signOut(auth);
    setProfile(null);
    setActiveView('dashboard');
  };

  const toggleTheme = () => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));

  const openAiWithMaterial = (material: StudyMaterial) => {
    setAiPrefillMaterial(material);
    setActiveView('ai-solver');
  };

  const openMaterialUploader = () => {
    setMaterialUploadRequested(true);
    setActiveView('materials');
  };

  const clearMaterialUploadRequest = () => {
    setMaterialUploadRequested(false);
  };

  const openQrScanner = () => {
    setQrScannerRequested(true);
    setActiveView('attendance');
  };

  const clearQrScannerRequest = () => {
    setQrScannerRequested(false);
  };

  const seedSampleWorkspace = async () => {
    if (!profile) return;
    if (isDemoMode) {
      setAttendanceRecords(buildSampleAttendance(profile.uid, profile.displayName));
      setAttendanceLogs(buildSampleAttendanceLogs(profile.uid));
      setStudyTasks(buildSampleStudyTasks(profile.uid));
      return;
    }
    await seedPersonalWorkspaceData(profile.uid, profile.displayName);
    if (profile.role === 'admin' || profile.role === 'faculty') {
      await seedInstitutionCatalogData(profile.uid, profile.role);
    }
  };

  const saveProfileChanges = async (
    updates: Partial<Pick<UserProfile, 'displayName' | 'departmentId' | 'courseName' | 'semester' | 'rollNumber' | 'avatarUrl' | 'targetAttendance'>>
  ) => {
    if (!profile) return;
    const sanitizedUpdates: typeof updates = { ...updates };
    if (sanitizedUpdates.displayName !== undefined) {
      const trimmedName = sanitizedUpdates.displayName.trim().slice(0, 100);
      if (!trimmedName) {
        throw new Error('Full Name cannot be empty.');
      }
      sanitizedUpdates.displayName = trimmedName;
    }
    if (sanitizedUpdates.courseName !== undefined) {
      sanitizedUpdates.courseName = sanitizedUpdates.courseName.trim().slice(0, 120);
    }
    if (sanitizedUpdates.rollNumber !== undefined) {
      sanitizedUpdates.rollNumber = sanitizedUpdates.rollNumber.trim().slice(0, 40);
    }
    if (sanitizedUpdates.departmentId !== undefined) {
      sanitizedUpdates.departmentId = sanitizedUpdates.departmentId.trim().slice(0, 64);
    }
    if (sanitizedUpdates.semester !== undefined) {
      sanitizedUpdates.semester = Math.max(1, Math.min(12, Math.round(Number(sanitizedUpdates.semester) || 3)));
    }
    if (sanitizedUpdates.targetAttendance !== undefined) {
      sanitizedUpdates.targetAttendance = Math.max(
        50,
        Math.min(100, Math.round(Number(sanitizedUpdates.targetAttendance) || 75))
      );
    }

    const nextProfile: UserProfile = { ...profile, ...sanitizedUpdates };
    setProfile(nextProfile);

    if (sanitizedUpdates.avatarUrl !== undefined) {
      if (sanitizedUpdates.avatarUrl === '') {
        writeLocalAvatarOverride(profile.uid, '__REMOVED__');
      } else if (sanitizedUpdates.avatarUrl.startsWith('data:')) {
        writeLocalAvatarOverride(profile.uid, sanitizedUpdates.avatarUrl);
      } else {
        writeLocalAvatarOverride(profile.uid, null);
      }
    }

    if (isDemoMode) {
      writeDemoProfileOverride(profile.role, nextProfile);
      setStudentRoster((prev) =>
        prev.map((entry) =>
          entry.uid === profile.uid
            ? {
                ...entry,
                displayName: nextProfile.displayName,
                rollNumber: nextProfile.rollNumber,
                departmentId: nextProfile.departmentId,
                courseName: nextProfile.courseName,
                semester: nextProfile.semester,
              }
            : entry
        )
      );
      setAllUsers((prev) =>
        prev.map((entry) => (entry.uid === profile.uid ? { ...entry, ...nextProfile } : entry))
      );
      return;
    }

    const firestoreUpdates = { ...sanitizedUpdates };
    if (firestoreUpdates.avatarUrl && firestoreUpdates.avatarUrl.length > 500) {
      delete firestoreUpdates.avatarUrl;
    }
    await updateUserProfile(profile.uid, firestoreUpdates);
    if (sanitizedUpdates.displayName && auth.currentUser) {
      try {
        await updateProfile(auth.currentUser, { displayName: sanitizedUpdates.displayName });
      } catch {
        // Non-blocking: Firestore profile is authoritative
      }
    }
  };

  const uploadAvatarPhoto: CampusContextValue['uploadAvatarPhoto'] = async (file, onProgress) => {
    if (!profile) {
      throw new Error('Sign in before uploading a profile photo.');
    }
    const processed = await processAvatarImageFile(file);

    if (isDemoMode) {
      if (onProgress) onProgress(100);
      writeLocalAvatarOverride(profile.uid, processed.dataUrl);
      setProfile((prev) => (prev ? { ...prev, avatarUrl: processed.dataUrl } : prev));
      return { avatarUrl: processed.dataUrl, storageUsed: false };
    }

    const uploaded = await uploadProfileAvatar(processed.blob, profile.uid, onProgress);
    if (uploaded.storageUsed && uploaded.avatarUrl && uploaded.avatarUrl.length <= 500) {
      writeLocalAvatarOverride(profile.uid, null);
      await updateUserProfile(profile.uid, { avatarUrl: uploaded.avatarUrl });
      setProfile((prev) => (prev ? { ...prev, avatarUrl: uploaded.avatarUrl } : prev));
      return { avatarUrl: uploaded.avatarUrl, storageUsed: true };
    }

    // Fallback when Storage bucket is unavailable: persist compressed avatar locally without violating 500-char rule
    writeLocalAvatarOverride(profile.uid, processed.dataUrl);
    setProfile((prev) => (prev ? { ...prev, avatarUrl: processed.dataUrl } : prev));
    return {
      avatarUrl: processed.dataUrl,
      storageUsed: false,
      storageError: uploaded.storageError,
    };
  };

  const removeAvatarPhoto: CampusContextValue['removeAvatarPhoto'] = async () => {
    if (!profile) return;
    if (isDemoMode) {
      writeLocalAvatarOverride(profile.uid, '__REMOVED__');
      setProfile((prev) => (prev ? { ...prev, avatarUrl: '' } : prev));
      return;
    }
    writeLocalAvatarOverride(profile.uid, null);
    await updateUserProfile(profile.uid, { avatarUrl: '' });
    setProfile((prev) => (prev ? { ...prev, avatarUrl: '' } : prev));
  };

  const toggleBookmarkMaterial = async (materialId: string) => {
    if (!profile) return;
    const existing = bookmarks.find((b) => b.materialId === materialId);
    const nextBookmarked = !existing?.isBookmarked;
    if (isDemoMode) {
      setBookmarks((prev) => {
        const filtered = prev.filter((b) => b.materialId !== materialId);
        return [...filtered, { id: `${profile.uid}_${materialId}`, userId: profile.uid, materialId, isBookmarked: nextBookmarked }];
      });
      return;
    }
    await upsertBookmark({ userId: profile.uid, materialId, isBookmarked: nextBookmarked });
  };

  const recordMaterialView = async (materialId: string) => {
    if (!profile) return;
    const existing = bookmarks.find((b) => b.materialId === materialId);
    if (isDemoMode) {
      setBookmarks((prev) => {
        const filtered = prev.filter((b) => b.materialId !== materialId);
        return [
          {
            id: `${profile.uid}_${materialId}`,
            userId: profile.uid,
            materialId,
            isBookmarked: existing?.isBookmarked || false,
            lastViewedAt: new Date().toISOString(),
          },
          ...filtered,
        ];
      });
      return;
    }
    await upsertBookmark({
      userId: profile.uid,
      materialId,
      isBookmarked: existing?.isBookmarked || false,
    });
  };

  const uploadAndCreateMaterial: CampusContextValue['uploadAndCreateMaterial'] = async (payload) => {
    if (!profile) return { storageUsed: false, materialId: '', fileUrl: '' };
    const id = makeSafeId('mat');
    let fileUrl = '';
    let storageUsed = false;
    let storageError: string | undefined;
    const fileName = payload.file?.name || `${payload.title.replace(/[^a-zA-Z0-9]+/g, '_')}.pdf`;
    const fileSizeLabel = payload.file ? `${Math.max(1, Math.round(payload.file.size / 1024))} KB` : '240 KB';

    if (isDemoMode && payload.file) {
      payload.onProgress?.(60);
      fileUrl = URL.createObjectURL(payload.file);
      storageUsed = true;
      payload.onProgress?.(100);
    } else if (!isDemoMode && payload.file) {
      const uploaded = await uploadMaterialFile(
        payload.file,
        payload.subjectId,
        payload.departmentId,
        payload.onProgress
      );
      fileUrl = uploaded.fileUrl;
      storageUsed = uploaded.storageUsed;
      storageError = uploaded.storageError;
    }

    const newMaterial: StudyMaterial = {
      id,
      title: payload.title,
      description: payload.description,
      type: payload.type,
      departmentId: payload.departmentId,
      courseName: payload.courseName,
      semester: payload.semester,
      subjectId: payload.subjectId,
      subjectName: payload.subjectName,
      unit: payload.unit,
      fileUrl,
      fileName,
      fileSizeLabel,
      contentPreview: payload.contentPreview || payload.description,
      uploadedByUid: profile.uid,
      uploadedByName: profile.displayName,
      isOfficial: payload.isOfficial,
      isDemo: isDemoMode,
    };

    if (isDemoMode) {
      setMaterials((prev) => [newMaterial, ...prev]);
      return { storageUsed, materialId: id, fileUrl };
    }
    await saveStudyMaterial(newMaterial);
    return { storageUsed, storageError, materialId: id, fileUrl };
  };

  const removeMaterial = async (id: string) => {
    if (isDemoMode) {
      setMaterials((prev) => prev.filter((m) => m.id !== id));
      return;
    }
    await deleteStudyMaterial(id);
  };

  const markAttendanceQuick = async (record: AttendanceRecord, status: 'present' | 'absent' | 'late', note = '') => {
    if (!profile) return;
    const isAttended = status === 'present' || status === 'late';
    const nextAttended = isAttended ? record.classesAttended + 1 : record.classesAttended;
    const nextTotal = record.totalClasses + 1;
    const updated: AttendanceRecord = {
      ...record,
      classesAttended: nextAttended,
      totalClasses: nextTotal,
      updatedByUid: profile.uid,
    };
    const logItem: AttendanceLog = {
      id: makeSafeId('attlog'),
      studentUid: record.studentUid,
      subjectId: record.subjectId,
      subjectName: record.subjectName,
      date: new Date().toISOString().slice(0, 10),
      status,
      recordType: record.recordType,
      note: note || `Marked ${status}`,
      loggedByUid: profile.uid,
    };

    if (isDemoMode) {
      setAttendanceRecords((prev) => prev.map((r) => (r.id === record.id ? updated : r)));
      setAttendanceLogs((prev) => [logItem, ...prev]);
      return;
    }
    await saveAttendanceRecord(updated, false);
    await createAttendanceLog(logItem);
  };

  const logAttendanceTimelineEntry: CampusContextValue['logAttendanceTimelineEntry'] = async (payload) => {
    if (!profile) return;
    const targetUid = payload.studentUid || profile.uid;
    const targetName = payload.studentName || profile.displayName;
    const recordType = payload.recordType || 'personal';
    const cleanTitle = payload.title.trim().slice(0, 140) || 'Attendance Session';
    const cleanDate = payload.date || new Date().toISOString().slice(0, 10);

    const matchedSub =
      payload.kind === 'course'
        ? subjects.find((s) => s.id === payload.subjectId || s.name === cleanTitle)
        : undefined;

    const subjectId =
      payload.kind === 'event'
        ? `evt_${cleanTitle.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48) || 'event'}`
        : matchedSub?.id || payload.subjectId || `sub_${cleanTitle.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 32) || 'course'}`;

    const subjectName = matchedSub?.name || cleanTitle;
    const defaultNote =
      payload.kind === 'event'
        ? `Campus Event · ${payload.status}`
        : `Course Session · ${payload.status}`;

    const logItem: AttendanceLog = {
      id: makeSafeId('attlog'),
      studentUid: targetUid,
      subjectId: subjectId.slice(0, 64),
      subjectName: subjectName.slice(0, 140),
      date: cleanDate,
      status: payload.status,
      recordType,
      note: (payload.note?.trim() || defaultNote).slice(0, 240),
      loggedByUid: profile.uid,
    };

    const isAttended = payload.status === 'present' || payload.status === 'late';

    if (payload.kind === 'course' && payload.updateSubjectTotals) {
      const existingRec = attendanceRecords.find(
        (r) =>
          r.studentUid === targetUid &&
          r.recordType === recordType &&
          r.subjectId === subjectId
      );

      if (existingRec) {
        const updatedRec: AttendanceRecord = {
          ...existingRec,
          classesAttended: isAttended ? existingRec.classesAttended + 1 : existingRec.classesAttended,
          totalClasses: existingRec.totalClasses + 1,
          updatedByUid: profile.uid,
        };
        if (isDemoMode) {
          setAttendanceRecords((prev) => prev.map((r) => (r.id === existingRec.id ? updatedRec : r)));
          setAttendanceLogs((prev) => [logItem, ...prev]);
          return;
        }
        await saveAttendanceRecord(updatedRec, false);
        await createAttendanceLog(logItem);
        return;
      }

      const newRec: AttendanceRecord = {
        id: makeSafeId('att'),
        studentUid: targetUid,
        studentName: targetName,
        subjectId: subjectId.slice(0, 64),
        subjectCode: matchedSub?.code || cleanTitle.slice(0, 8).toUpperCase(),
        subjectName: subjectName.slice(0, 140),
        classesAttended: isAttended ? 1 : 0,
        totalClasses: 1,
        recordType,
        isDemo: isDemoMode,
        updatedByUid: profile.uid,
      };
      if (isDemoMode) {
        setAttendanceRecords((prev) => [newRec, ...prev]);
        setAttendanceLogs((prev) => [logItem, ...prev]);
        return;
      }
      await saveAttendanceRecord(newRec, true);
      await createAttendanceLog(logItem);
      return;
    }

    if (isDemoMode) {
      setAttendanceLogs((prev) => [logItem, ...prev]);
      return;
    }
    await createAttendanceLog(logItem);
  };

  const removeAttendanceLogItem = async (logId: string) => {
    if (isDemoMode) {
      setAttendanceLogs((prev) => prev.filter((l) => l.id !== logId));
      return;
    }
    await deleteAttendanceLog(logId);
  };

  const upsertAttendanceSubject: CampusContextValue['upsertAttendanceSubject'] = async (payload) => {
    if (!profile) return;
    const isNew = !payload.id;
    const record: AttendanceRecord = {
      id: payload.id || makeSafeId('att'),
      studentUid: payload.studentUid,
      studentName: payload.studentName,
      subjectId: payload.subjectId,
      subjectCode: payload.subjectCode,
      subjectName: payload.subjectName,
      classesAttended: payload.classesAttended,
      totalClasses: payload.totalClasses,
      recordType: payload.recordType,
      isDemo: isDemoMode,
      updatedByUid: profile.uid,
    };
    if (isDemoMode) {
      setAttendanceRecords((prev) => {
        const exists = prev.some((r) => r.id === record.id);
        return exists ? prev.map((r) => (r.id === record.id ? record : r)) : [record, ...prev];
      });
      return;
    }
    await saveAttendanceRecord(record, isNew);
  };

  const checkInWithQr: CampusContextValue['checkInWithQr'] = async (parsed) => {
    if (!profile) {
      return { status: 'error', message: 'Sign in required before checking in.' };
    }

    const sessionToken = `[qr:${parsed.sessionId}]`;
    const checkDate = parsed.date || new Date().toISOString().slice(0, 10);
    const storageKey = `skucampus_qr_checkins_${profile.uid}`;

    let localChecked: string[] = [];
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) localChecked = JSON.parse(raw) as string[];
    } catch {
      localChecked = [];
    }

    const duplicateKey = `${parsed.sessionId}::${checkDate}`;
    const alreadyLogged =
      localChecked.includes(duplicateKey) ||
      attendanceLogs.some(
        (l) =>
          l.studentUid === profile.uid &&
          l.date === checkDate &&
          l.note.includes(sessionToken)
      );

    if (alreadyLogged) {
      return {
        status: 'duplicate',
        message: `You already checked in for ${parsed.title} (${checkDate}).`,
      };
    }

    const markSessionLocally = () => {
      try {
        const next = [duplicateKey, ...localChecked].slice(0, 120);
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // Ignore storage quota errors
      }
    };

    if (parsed.kind === 'class') {
      const existingPersonal = attendanceRecords.find(
        (r) =>
          r.studentUid === profile.uid &&
          r.recordType === 'personal' &&
          (r.subjectId === parsed.subjectId ||
            r.subjectCode.toUpperCase() === parsed.subjectCode.toUpperCase())
      );

      const notePrefix = `QR Class Check-In · ${parsed.venue || 'Classroom'}`;
      const fullNote = `${notePrefix} ${sessionToken}`.slice(0, 240);

      if (existingPersonal) {
        const nextAttended = existingPersonal.classesAttended + 1;
        const nextTotal = existingPersonal.totalClasses + 1;
        const updated: AttendanceRecord = {
          ...existingPersonal,
          classesAttended: nextAttended,
          totalClasses: nextTotal,
          updatedByUid: profile.uid,
        };
        const logItem: AttendanceLog = {
          id: makeSafeId('attlog'),
          studentUid: profile.uid,
          subjectId: existingPersonal.subjectId,
          subjectName: existingPersonal.subjectName,
          date: checkDate,
          status: 'present',
          recordType: 'personal',
          note: fullNote,
          loggedByUid: profile.uid,
        };

        if (isDemoMode) {
          setAttendanceRecords((prev) => prev.map((r) => (r.id === existingPersonal.id ? updated : r)));
          setAttendanceLogs((prev) => [logItem, ...prev]);
        } else {
          await saveAttendanceRecord(updated, false);
          await createAttendanceLog(logItem);
        }

        markSessionLocally();
        const pct = Math.round((nextAttended / nextTotal) * 1000) / 10;
        return {
          status: 'checked-in',
          message: `Checked in to ${existingPersonal.subjectCode} · ${existingPersonal.subjectName} (${nextAttended}/${nextTotal}).`,
          updatedPercentage: pct,
        };
      }

      const newRecord: AttendanceRecord = {
        id: makeSafeId('att'),
        studentUid: profile.uid,
        studentName: profile.displayName,
        subjectId: parsed.subjectId,
        subjectCode: parsed.subjectCode,
        subjectName: parsed.subjectName,
        classesAttended: 1,
        totalClasses: 1,
        recordType: 'personal',
        isDemo: isDemoMode,
        updatedByUid: profile.uid,
      };
      const logItem: AttendanceLog = {
        id: makeSafeId('attlog'),
        studentUid: profile.uid,
        subjectId: parsed.subjectId,
        subjectName: parsed.subjectName,
        date: checkDate,
        status: 'present',
        recordType: 'personal',
        note: fullNote,
        loggedByUid: profile.uid,
      };

      if (isDemoMode) {
        setAttendanceRecords((prev) => [newRecord, ...prev]);
        setAttendanceLogs((prev) => [logItem, ...prev]);
      } else {
        await saveAttendanceRecord(newRecord, true);
        await createAttendanceLog(logItem);
      }

      markSessionLocally();
      return {
        status: 'checked-in',
        message: `Started tracking & checked in to ${parsed.subjectCode} · ${parsed.subjectName} (1/1).`,
        updatedPercentage: 100,
      };
    }

    // Event QR check-in: logged in attendanceLogs without altering course lecture totals
    const eventNote = `QR Event Check-In · ${parsed.venue || 'SKU Campus'} ${sessionToken}`.slice(0, 240);
    const eventLog: AttendanceLog = {
      id: makeSafeId('attlog'),
      studentUid: profile.uid,
      subjectId: parsed.subjectId.slice(0, 64),
      subjectName: parsed.title.slice(0, 140),
      date: checkDate,
      status: 'present',
      recordType: 'personal',
      note: eventNote,
      loggedByUid: profile.uid,
    };

    if (isDemoMode) {
      setAttendanceLogs((prev) => [eventLog, ...prev]);
    } else {
      await createAttendanceLog(eventLog);
    }

    markSessionLocally();
    return {
      status: 'checked-in',
      message: `Event check-in confirmed for ${parsed.title} at ${parsed.venue}.`,
    };
  };

  const toggleStudyTask = async (task: StudyTask) => {
    const updated: StudyTask = { ...task, completed: !task.completed };
    if (isDemoMode) {
      setStudyTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
      return;
    }
    await saveStudyTask(updated, false);
  };

  const createOrUpdateStudyTask: CampusContextValue['createOrUpdateStudyTask'] = async (payload) => {
    if (!profile) return;
    const isNew = !payload.id;
    const task: StudyTask = {
      id: payload.id || makeSafeId('task'),
      userId: profile.uid,
      subjectId: payload.subjectId,
      subjectName: payload.subjectName,
      unit: payload.unit,
      title: payload.title,
      dueDate: payload.dueDate,
      priority: payload.priority,
      category: payload.category,
      completed: payload.completed,
      isDemo: isDemoMode,
    };
    if (isDemoMode) {
      setStudyTasks((prev) => (isNew ? [task, ...prev] : prev.map((t) => (t.id === task.id ? task : t))));
      return;
    }
    await saveStudyTask(task, isNew);
  };

  const removeStudyTask = async (taskId: string) => {
    if (isDemoMode) {
      setStudyTasks((prev) => prev.filter((t) => t.id !== taskId));
      return;
    }
    await deleteStudyTask(taskId);
  };

  const publishAnnouncement: CampusContextValue['publishAnnouncement'] = async (payload) => {
    if (!profile) return;
    const item: Announcement = {
      id: makeSafeId('ann'),
      title: payload.title,
      body: payload.body,
      category: payload.category,
      departmentId: payload.departmentId,
      authorUid: profile.uid,
      authorName: profile.displayName,
      authorRole: activeRoleView === 'admin' ? 'admin' : 'faculty',
      isPinned: payload.isPinned,
      isDemo: isDemoMode,
    };
    if (isDemoMode) {
      setAnnouncements((prev) => [item, ...prev]);
      return;
    }
    await saveAnnouncement(item);
  };

  const removeAnnouncementItem = async (id: string) => {
    if (isDemoMode) {
      setAnnouncements((prev) => prev.filter((a) => a.id !== id));
      return;
    }
    await deleteAnnouncement(id);
  };

  const createExamSchedule: CampusContextValue['createExamSchedule'] = async (payload) => {
    if (!profile) return;
    const item: ExamSchedule = {
      ...payload,
      id: makeSafeId('exam'),
      isDemo: isDemoMode,
      createdByUid: profile.uid,
    };
    if (isDemoMode) {
      setExams((prev) => [...prev, item]);
      return;
    }
    await saveExam(item);
  };

  const removeExamSchedule = async (id: string) => {
    if (isDemoMode) {
      setExams((prev) => prev.filter((e) => e.id !== id));
      return;
    }
    await deleteExam(id);
  };

  const createDepartmentItem: CampusContextValue['createDepartmentItem'] = async (payload) => {
    if (!profile) return;
    const item: Department = {
      id: makeSafeId('dept'),
      name: payload.name,
      code: payload.code,
      courses: payload.courses,
      semestersCount: payload.semestersCount,
      isDemo: isDemoMode,
      createdByUid: profile.uid,
    };
    if (isDemoMode) {
      setDepartments((prev) => [...prev, item]);
      return;
    }
    await saveDepartment(item);
  };

  const createSubjectItem: CampusContextValue['createSubjectItem'] = async (payload) => {
    if (!profile) return;
    const item: Subject = {
      id: makeSafeId('sub'),
      ...payload,
      isDemo: isDemoMode,
      createdByUid: profile.uid,
    };
    if (isDemoMode) {
      setSubjects((prev) => [...prev, item]);
      return;
    }
    await saveSubject(item);
  };

  const updatePlatformConfig: CampusContextValue['updatePlatformConfig'] = async (payload) => {
    if (!profile) return;
    const item: PlatformSetting = {
      id: 'default',
      ...payload,
      updatedByUid: profile.uid,
    };
    if (isDemoMode) {
      setPlatformSettings(item);
      return;
    }
    await savePlatformSettings(item);
  };

  const changeUserRole = async (targetUid: string, role: UserRole, deptId: string) => {
    if (!profile) return;
    if (isDemoMode) {
      setAllUsers((prev) => prev.map((u) => (u.uid === targetUid ? { ...u, role } : u)));
      return;
    }
    await adminSetUserRole(targetUid, role, deptId, profile.uid);
  };

  const persistAiChat = async (session: AiChatSession, isNew: boolean) => {
    if (isDemoMode) {
      setAiChats((prev) => {
        const exists = prev.some((c) => c.id === session.id);
        return exists ? prev.map((c) => (c.id === session.id ? session : c)) : [session, ...prev];
      });
      return;
    }
    await saveAiChatSession(session, isNew);
  };

  const createStudyRoomItem: CampusContextValue['createStudyRoomItem'] = async (payload) => {
    if (!profile) return null;
    const item: StudyRoom = {
      id: makeSafeId('room'),
      title: payload.title,
      topic: payload.topic,
      subjectId: payload.subjectId,
      subjectCode: payload.subjectCode,
      subjectName: payload.subjectName,
      semester: payload.semester,
      hostUid: profile.uid,
      hostName: profile.displayName,
      isActive: true,
      isDemo: isDemoMode,
    };
    if (isDemoMode) {
      setStudyRooms((prev) => [item, ...prev]);
      return item;
    }
    await saveStudyRoom(item);
    return item;
  };

  const removeStudyRoomItem: CampusContextValue['removeStudyRoomItem'] = async (roomId) => {
    if (isDemoMode) {
      setStudyRooms((prev) => prev.filter((r) => r.id !== roomId));
      return;
    }
    await deleteStudyRoom(roomId);
  };

  const publishMyStudyPresence: CampusContextValue['publishMyStudyPresence'] = async (payload) => {
    if (!profile) return;
    const item: StudyPresence = {
      uid: profile.uid,
      displayName: profile.displayName,
      subjectId: payload.subjectId,
      subjectCode: payload.subjectCode,
      subjectName: payload.subjectName,
      roomId: payload.roomId,
      roomTitle: payload.roomTitle,
      studyGoal: payload.studyGoal,
      isActive: payload.isActive,
    };
    if (isDemoMode) {
      setStudyPresenceList((prev) => {
        const exists = prev.some((p) => p.uid === item.uid);
        return exists ? prev.map((p) => (p.uid === item.uid ? item : p)) : [item, ...prev];
      });
      return;
    }
    await upsertStudyPresence(item);
  };

  const joinStudyRoomInFirestore: CampusContextValue['joinStudyRoomInFirestore'] = async (room, participant) => {
    if (isDemoMode) return;
    await ensureAndJoinRoomParticipant({ room, participant });
  };

  const leaveStudyRoomInFirestore: CampusContextValue['leaveStudyRoomInFirestore'] = async (roomId) => {
    if (isDemoMode || !profile) return;
    await leaveStudyRoomParticipant(roomId, profile.uid);
  };

  const persistRoomStroke: CampusContextValue['persistRoomStroke'] = async (stroke) => {
    if (isDemoMode) return;
    await saveWhiteboardStroke(stroke);
  };

  const removeRoomStroke: CampusContextValue['removeRoomStroke'] = async (roomId, strokeId) => {
    if (isDemoMode) return;
    await deleteWhiteboardStroke(roomId, strokeId);
  };

  const clearRoomStrokesInFirestore: CampusContextValue['clearRoomStrokesInFirestore'] = async (roomId, isHostOrAdmin) => {
    if (isDemoMode || !profile) return;
    await clearRoomWhiteboardStrokes(roomId, isHostOrAdmin ? undefined : profile.uid);
  };

  const recordStudyContribution: CampusContextValue['recordStudyContribution'] = async (payload) => {
    if (!profile) return;
    const minDelta = Math.max(0, Math.min(240, Math.floor(payload.minutesDelta || 0)));
    const resDelta = Math.max(0, Math.min(5, Math.floor(payload.resourcesDelta || 0)));
    const sesDelta = Math.max(0, Math.min(3, Math.floor(payload.sessionsDelta || 0)));
    if (minDelta === 0 && resDelta === 0 && sesDelta === 0) return;

    if (isDemoMode) {
      setStudyContributors((prev) => {
        const existing = prev.find((c) => c.uid === profile.uid);
        if (existing) {
          const totalMinutes = existing.totalMinutes + minDelta;
          const resourcesSharedCount = existing.resourcesSharedCount + resDelta;
          const sessionsJoined = existing.sessionsJoined + sesDelta;
          const points = totalMinutes * 2 + resourcesSharedCount * 25 + sessionsJoined * 10;
          return prev.map((c) =>
            c.uid === profile.uid
              ? {
                  ...c,
                  displayName: profile.displayName,
                  primarySubjectId: payload.subjectId || c.primarySubjectId,
                  primarySubjectCode: payload.subjectCode || c.primarySubjectCode,
                  primarySubjectName: payload.subjectName || c.primarySubjectName,
                  totalMinutes,
                  resourcesSharedCount,
                  sessionsJoined,
                  points,
                }
              : c
          );
        }
        const points = minDelta * 2 + resDelta * 25 + sesDelta * 10;
        return [
          ...prev,
          {
            uid: profile.uid,
            displayName: profile.displayName,
            primarySubjectId: payload.subjectId,
            primarySubjectCode: payload.subjectCode,
            primarySubjectName: payload.subjectName,
            totalMinutes: minDelta,
            resourcesSharedCount: resDelta,
            sessionsJoined: sesDelta,
            points,
            isDemo: true,
          },
        ];
      });
      return;
    }

    await incrementStudyContributorStat({
      uid: profile.uid,
      displayName: profile.displayName,
      subjectId: payload.subjectId,
      subjectCode: payload.subjectCode,
      subjectName: payload.subjectName,
      minutesDelta: minDelta,
      resourcesDelta: resDelta,
      sessionsDelta: sesDelta,
    });
  };

  const persistRoomResource: CampusContextValue['persistRoomResource'] = async (resource) => {
    if (isDemoMode) return;
    await saveStudyRoomResource(resource);
  };

  const removeRoomResource: CampusContextValue['removeRoomResource'] = async (roomId, resourceId) => {
    if (isDemoMode) return;
    await deleteStudyRoomResource(roomId, resourceId);
  };

  // Persist & hydrate readNotificationIds per profile UID
  useEffect(() => {
    if (!profile?.uid) {
      setReadNotificationIds([]);
      return;
    }
    try {
      const raw = localStorage.getItem(`skucampus_read_notifs_${profile.uid}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setReadNotificationIds(parsed.filter((item): item is string => typeof item === 'string'));
          return;
        }
      }
    } catch {
      // Ignore storage read errors
    }
    setReadNotificationIds([]);
  }, [profile?.uid]);

  const persistReadIds = (uid: string | undefined, nextIds: string[]) => {
    if (!uid) return;
    try {
      localStorage.setItem(`skucampus_read_notifs_${uid}`, JSON.stringify(nextIds.slice(-200)));
    } catch {
      // Ignore storage write errors
    }
  };

  const notifications = useMemo<NotificationItem[]>(() => {
    const items: NotificationItem[] = [];
    const targetPct = profile?.targetAttendance || platformSettings.defaultRequiredAttendance || 75;

    const getDaysUntil = (dateStr?: string): number | null => {
      if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
      const [y, m, d] = dateStr.split('-').map(Number);
      const now = new Date();
      const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
      const targetUtc = Date.UTC(y, m - 1, d);
      return Math.round((targetUtc - todayUtc) / 86_400_000);
    };

    const formatCountdown = (days: number | null): string => {
      if (days === null) return 'Scheduled';
      if (days < 0) return `${Math.abs(days)}d overdue`;
      if (days === 0) return 'Due today';
      if (days === 1) return 'Tomorrow';
      return `In ${days} days`;
    };

    // 1. Faculty & Admin Announcements (department-relevant or campus-wide)
    const relevantAnnouncements = [...announcements]
      .filter((a) => {
        if (!profile || activeRoleView === 'admin' || activeRoleView === 'faculty') return true;
        return !a.departmentId || a.departmentId === 'all' || a.departmentId === profile.departmentId;
      })
      .sort((a, b) => Number(b.isPinned) - Number(a.isPinned))
      .slice(0, 10);

    relevantAnnouncements.forEach((ann) => {
      const snippet = ann.body.length > 108 ? `${ann.body.slice(0, 105)}...` : ann.body;
      const catLabel = ann.category.charAt(0).toUpperCase() + ann.category.slice(1);
      const roleLabel = ann.authorRole === 'admin' ? 'Admin' : 'Faculty';
      items.push({
        id: `notif_ann_${ann.id}`,
        title: ann.title,
        detail: snippet,
        meta: `${ann.authorName} (${roleLabel}) · ${catLabel}${ann.isPinned ? ' · Pinned' : ''}`,
        kind: 'announcement',
        severity: ann.category === 'urgent' ? 'urgent' : ann.category === 'exam' ? 'warning' : 'info',
        targetView: 'announcements',
      });
    });

    // 2. Faculty-posted Exam Deadlines
    [...exams]
      .filter((e) => {
        if (!profile || activeRoleView === 'admin' || activeRoleView === 'faculty') return true;
        const examDept = subjects.find((s) => s.id === e.subjectId)?.departmentId;
        return !examDept || examDept === profile.departmentId;
      })
      .slice(0, 6)
      .forEach((exam) => {
        const days = getDaysUntil(exam.examDate);
        if (days !== null && days < -2) return;
        const severity: NotificationItem['severity'] =
          days !== null && days >= 0 && days <= 2
            ? 'urgent'
            : days !== null && days >= 0 && days <= 7
            ? 'warning'
            : 'info';
        items.push({
          id: `notif_exam_${exam.id}`,
          title: `Exam Deadline: ${exam.subjectCode} (${exam.examType})`,
          detail: `${exam.subjectName} · ${exam.examDate} at ${exam.startTime} · ${exam.venue}`,
          meta: `Faculty Exam Schedule · ${formatCountdown(days)}`,
          kind: 'deadline',
          severity,
          targetView: 'exam-prep',
        });
      });

    // 3. Official Faculty Assignment Materials
    materials
      .filter((m) => m.type === 'assignment' && m.isOfficial)
      .filter((m) => !profile || !m.departmentId || m.departmentId === profile.departmentId)
      .slice(0, 5)
      .forEach((mat) => {
        items.push({
          id: `notif_mat_${mat.id}`,
          title: `Assignment Posted: ${mat.title}`,
          detail: `${mat.subjectName}${mat.unit ? ` · ${mat.unit}` : ''}`,
          meta: `${mat.uploadedByName} · Official Assignment`,
          kind: 'deadline',
          severity: 'warning',
          targetView: 'materials',
        });
      });

    // 4. Urgent / Approaching Personal Study Deadlines
    studyTasks
      .filter((t) => !t.completed)
      .forEach((task) => {
        const days = getDaysUntil(task.dueDate);
        if ((days !== null && days <= 2) || task.priority === 'high') {
          items.push({
            id: `notif_task_${task.id}`,
            title: days !== null && days < 0 ? `Overdue Task: ${task.title}` : `Task Deadline: ${task.title}`,
            detail: `${task.subjectName}${task.unit ? ` · ${task.unit}` : ''} · Due ${task.dueDate}`,
            meta: `Personal Deadline · ${formatCountdown(days)}`,
            kind: 'deadline',
            severity: days !== null && days <= 0 ? 'urgent' : 'warning',
            targetView: 'dashboard',
          });
        }
      });

    // 5. Attendance Shortage Warnings
    attendanceRecords
      .filter((r) => !profile || r.studentUid === profile.uid)
      .forEach((rec) => {
        const analysis = analyzeAttendance(rec.classesAttended, rec.totalClasses, targetPct);
        if (!analysis.isMeetingTarget && rec.totalClasses > 0) {
          items.push({
            id: `notif_att_${rec.id}`,
            title: `Attendance Shortage: ${rec.subjectCode}`,
            detail: `${analysis.currentPercentage}% (${rec.classesAttended}/${rec.totalClasses}). Attend next ${analysis.classesNeeded} classes to reach ${targetPct}%.`,
            meta: `Attendance · Target ${targetPct}%`,
            kind: 'attendance',
            severity: analysis.statusLabel === 'Shortage' ? 'urgent' : 'warning',
            targetView: 'attendance',
          });
        }
      });

    const rank: Record<NotificationItem['severity'], number> = { urgent: 0, warning: 1, info: 2 };
    return items.sort((a, b) => rank[a.severity] - rank[b.severity]);
  }, [
    announcements,
    exams,
    subjects,
    materials,
    studyTasks,
    attendanceRecords,
    profile,
    activeRoleView,
    platformSettings.defaultRequiredAttendance,
  ]);

  // Real-time watcher: surfaces newly posted faculty announcements & deadlines as live in-app alerts
  const notifScopeKey = profile ? `${profile.uid}_${isDemoMode ? 'demo' : 'live'}` : '';

  useEffect(() => {
    if (prevNotifScopeRef.current !== notifScopeKey) {
      prevNotifScopeRef.current = notifScopeKey;
      seenNotifIdsRef.current = new Set();
      notifBaselineReadyRef.current = false;
      setLiveAlerts([]);
    }
  }, [notifScopeKey]);

  useEffect(() => {
    if (!notifScopeKey || isDemoMode) return;
    const timer = window.setTimeout(() => {
      notifications.forEach((n) => seenNotifIdsRef.current.add(n.id));
      notifBaselineReadyRef.current = true;
    }, 1400);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifScopeKey, isDemoMode]);

  useEffect(() => {
    if (!notifScopeKey || notifications.length === 0) return;

    if (!notifBaselineReadyRef.current) {
      notifications.forEach((n) => seenNotifIdsRef.current.add(n.id));
      if (isDemoMode) {
        notifBaselineReadyRef.current = true;
      }
      return;
    }

    const newlyArrived = notifications.filter((n) => {
      if (seenNotifIdsRef.current.has(n.id)) return false;
      seenNotifIdsRef.current.add(n.id);
      const isFacultyPost =
        n.kind === 'announcement' ||
        n.id.startsWith('notif_exam_') ||
        n.id.startsWith('notif_mat_');
      return isFacultyPost && !readNotificationIds.includes(n.id);
    });

    if (newlyArrived.length > 0) {
      setLiveAlerts((prev) => {
        const merged = [...newlyArrived, ...prev];
        const unique = merged.filter((item, idx, arr) => arr.findIndex((x) => x.id === item.id) === idx);
        return unique.slice(0, 3);
      });
    }
  }, [notifications, notifScopeKey, isDemoMode, readNotificationIds]);

  const markNotificationRead = (id: string) => {
    setReadNotificationIds((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      persistReadIds(profile?.uid, next);
      return next;
    });
    setLiveAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  const markAllNotificationsRead = () => {
    const allIds = Array.from(new Set([...readNotificationIds, ...notifications.map((n) => n.id)]));
    setReadNotificationIds(allIds);
    persistReadIds(profile?.uid, allIds);
    setLiveAlerts([]);
  };

  const dismissLiveAlert = (id: string) => {
    setLiveAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <CampusContext.Provider
      value={{
        firebaseUser,
        authReady,
        isDemoMode,
        isEmailUnverified,
        profile,
        activeRoleView,
        setActiveRoleView,
        enterDemoMode,
        exitDemoMode,
        signInWithGoogle,
        signInWithEmail,
        registerWithEmail,
        resetPassword,
        resendVerification,
        refreshVerification,
        logout,
        activeView,
        setActiveView,
        theme,
        toggleTheme,
        colorPalette,
        setColorPalette,
        globalSearchQuery,
        setGlobalSearchQuery,
        aiPrefillMaterial,
        openAiWithMaterial,
        materialUploadRequested,
        openMaterialUploader,
        clearMaterialUploadRequest,
        qrScannerRequested,
        openQrScanner,
        clearQrScannerRequest,
        departments,
        subjects,
        materials,
        bookmarks,
        attendanceRecords,
        attendanceLogs,
        exams,
        studyTasks,
        announcements,
        timetable,
        aiChats,
        platformSettings,
        allUsers,
        studentRoster,
        studyRooms,
        studyPresenceList,
        studyContributors,
        notifications,
        readNotificationIds,
        liveAlerts,
        markNotificationRead,
        markAllNotificationsRead,
        dismissLiveAlert,
        seedSampleWorkspace,
        saveProfileChanges,
        uploadAvatarPhoto,
        removeAvatarPhoto,
        toggleBookmarkMaterial,
        recordMaterialView,
        uploadAndCreateMaterial,
        removeMaterial,
        markAttendanceQuick,
        upsertAttendanceSubject,
        logAttendanceTimelineEntry,
        removeAttendanceLogItem,
        checkInWithQr,
        toggleStudyTask,
        createOrUpdateStudyTask,
        removeStudyTask,
        publishAnnouncement,
        removeAnnouncementItem,
        createExamSchedule,
        removeExamSchedule,
        createDepartmentItem,
        createSubjectItem,
        updatePlatformConfig,
        changeUserRole,
        persistAiChat,
        createStudyRoomItem,
        removeStudyRoomItem,
        publishMyStudyPresence,
        joinStudyRoomInFirestore,
        leaveStudyRoomInFirestore,
        persistRoomStroke,
        removeRoomStroke,
        clearRoomStrokesInFirestore,
        recordStudyContribution,
        persistRoomResource,
        removeRoomResource,
      }}
    >
      {children}
    </CampusContext.Provider>
  );
};

export function useCampus() {
  const ctx = useContext(CampusContext);
  if (!ctx) throw new Error('useCampus must be used within CampusProvider');
  return ctx;
}
