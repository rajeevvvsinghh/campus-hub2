import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { db, handleFirestoreError, OperationType, storage } from '../lib/firebase';
import {
  BLUEPRINT_CONSTRAINTS,
  type AiChatSession,
  type Announcement,
  type AttendanceLog,
  type AttendanceRecord,
  type Department,
  type ExamSchedule,
  type PlatformSetting,
  type StudentRosterEntry,
  type StudyContributorStat,
  type StudyMaterial,
  type StudyPresence,
  type StudyRoom,
  type StudyRoomParticipant,
  type StudyRoomResource,
  type StudyTask,
  type Subject,
  type TimetableSlot,
  type UserBookmark,
  type UserProfile,
  type UserRole,
  type WhiteboardStroke,
} from '../types/campus';
import {
  buildSampleAttendance,
  buildSampleAttendanceLogs,
  buildSampleStudyTasks,
  SAMPLE_ANNOUNCEMENTS,
  SAMPLE_DEPARTMENTS,
  SAMPLE_EXAMS,
  SAMPLE_MATERIALS,
  SAMPLE_STUDY_ROOMS,
  SAMPLE_SUBJECTS,
  SAMPLE_TIMETABLE,
} from '../data/sampleData';

export function makeSafeId(prefix: string): string {
  const cleanPrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 24);
  const rand = Math.random().toString(36).slice(2, 9);
  return `${cleanPrefix}_${Date.now()}_${rand}`.slice(0, BLUEPRINT_CONSTRAINTS.MAX_ID_LEN);
}

function clampStr(val: string, maxLen: number): string {
  return (val || '').trim().slice(0, maxLen);
}

export async function ensureUserProfile(params: {
  uid: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
}): Promise<UserProfile> {
  const userRef = doc(db, 'users', params.uid);
  try {
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      return snap.data() as UserProfile;
    }

    const isBootstrappedAdmin = params.email.toLowerCase() === 'rajeevvvhere@gmail.com';
    const initialProfile: UserProfile = {
      uid: params.uid,
      displayName: clampStr(params.displayName || params.email.split('@')[0] || 'Student', 100),
      email: clampStr(params.email, 200),
      role: isBootstrappedAdmin ? 'admin' : 'student',
      departmentId: 'dept_cse',
      courseName: 'B.Tech Computer Science',
      semester: 3,
      rollNumber: isBootstrappedAdmin ? 'ADMIN-01' : `CS25-${params.uid.slice(0, 4).toUpperCase()}`,
      avatarUrl: clampStr(params.avatarUrl || '', 500),
      targetAttendance: 75,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(userRef, initialProfile);

    // Mirror non-PII academic roster entry
    const rosterRef = doc(db, 'studentRosters', params.uid);
    const rosterEntry: StudentRosterEntry = {
      uid: params.uid,
      displayName: initialProfile.displayName,
      rollNumber: initialProfile.rollNumber,
      departmentId: initialProfile.departmentId,
      courseName: initialProfile.courseName,
      semester: initialProfile.semester,
      updatedAt: serverTimestamp(),
    };
    await setDoc(rosterRef, rosterEntry);

    return initialProfile;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${params.uid}`);
  }
}

export async function updateUserProfile(
  uid: string,
  updates: Partial<Pick<UserProfile, 'displayName' | 'departmentId' | 'courseName' | 'semester' | 'rollNumber' | 'avatarUrl' | 'targetAttendance'>>
): Promise<void> {
  const userRef = doc(db, 'users', uid);
  const cleanUpdates: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (updates.displayName !== undefined) cleanUpdates.displayName = clampStr(updates.displayName, 100);
  if (updates.departmentId !== undefined) cleanUpdates.departmentId = clampStr(updates.departmentId, 64);
  if (updates.courseName !== undefined) cleanUpdates.courseName = clampStr(updates.courseName, 120);
  if (updates.semester !== undefined) cleanUpdates.semester = Math.max(1, Math.min(12, Math.round(updates.semester)));
  if (updates.rollNumber !== undefined) cleanUpdates.rollNumber = clampStr(updates.rollNumber, 40);
  if (updates.avatarUrl !== undefined) cleanUpdates.avatarUrl = clampStr(updates.avatarUrl, 500);
  if (updates.targetAttendance !== undefined) {
    cleanUpdates.targetAttendance = Math.max(50, Math.min(100, Math.round(Number(updates.targetAttendance))));
  }

  try {
    await updateDoc(userRef, cleanUpdates);
    const rosterUpdates: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (cleanUpdates.displayName !== undefined) rosterUpdates.displayName = cleanUpdates.displayName;
    if (cleanUpdates.departmentId !== undefined) rosterUpdates.departmentId = cleanUpdates.departmentId;
    if (cleanUpdates.courseName !== undefined) rosterUpdates.courseName = cleanUpdates.courseName;
    if (cleanUpdates.semester !== undefined) rosterUpdates.semester = cleanUpdates.semester;
    if (cleanUpdates.rollNumber !== undefined) rosterUpdates.rollNumber = cleanUpdates.rollNumber;
    try {
      await updateDoc(doc(db, 'studentRosters', uid), rosterUpdates);
    } catch {
      // Ignore if studentRosters mirror doc was not created yet
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
  }
}

export async function adminSetUserRole(
  targetUid: string,
  newRole: UserRole,
  departmentId: string,
  adminUid: string
): Promise<void> {
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'users', targetUid), {
      role: newRole,
      updatedAt: serverTimestamp(),
    });

    if (newRole === 'admin') {
      batch.set(doc(db, 'admins', targetUid), {
        uid: targetUid,
        grantedBy: adminUid,
        createdAt: serverTimestamp(),
      });
      batch.delete(doc(db, 'faculty', targetUid));
    } else if (newRole === 'faculty') {
      batch.set(doc(db, 'faculty', targetUid), {
        uid: targetUid,
        departmentId: clampStr(departmentId || 'dept_cse', 64),
        grantedBy: adminUid,
        createdAt: serverTimestamp(),
      });
      if (targetUid !== adminUid) {
        batch.delete(doc(db, 'admins', targetUid));
      }
    } else {
      if (targetUid !== adminUid) {
        batch.delete(doc(db, 'admins', targetUid));
      }
      batch.delete(doc(db, 'faculty', targetUid));
    }
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${targetUid}`);
  }
}

export async function uploadMaterialFile(
  file: File,
  subjectId: string,
  departmentId = 'general',
  onProgress?: (percent: number) => void
): Promise<{ fileUrl: string; storageUsed: boolean; storageError?: string }> {
  try {
    const cleanDept = departmentId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48) || 'general';
    const cleanSub = subjectId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48) || 'subject';
    const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
    const storageRef = ref(storage, `materials/${cleanDept}/${cleanSub}/${Date.now()}_${cleanName}`);
    const uploadTask = uploadBytesResumable(storageRef, file, {
      contentType: file.type || 'application/pdf',
    });

    await new Promise<void>((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          if (onProgress && snapshot.totalBytes > 0) {
            const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
            onProgress(pct);
          }
        },
        (error) => reject(error),
        () => resolve()
      );
    });

    const fileUrl = await getDownloadURL(uploadTask.snapshot.ref);
    if (onProgress) onProgress(100);
    return { fileUrl, storageUsed: true };
  } catch (err) {
    const storageError = err instanceof Error ? err.message : 'Firebase Storage upload unavailable';
    console.warn('Firebase Storage upload unavailable, falling back to catalog record:', storageError);
    return { fileUrl: '', storageUsed: false, storageError };
  }
}

export async function uploadProfileAvatar(
  file: Blob,
  uid: string,
  onProgress?: (percent: number) => void
): Promise<{ avatarUrl: string; storageUsed: boolean; storageError?: string }> {
  try {
    const cleanUid = uid.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'user';
    const storageRef = ref(storage, `avatars/${cleanUid}/avatar_${Date.now()}.jpg`);
    const uploadTask = uploadBytesResumable(storageRef, file, {
      contentType: 'image/jpeg',
    });

    await new Promise<void>((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          if (onProgress && snapshot.totalBytes > 0) {
            const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
            onProgress(pct);
          }
        },
        (error) => reject(error),
        () => resolve()
      );
    });

    const avatarUrl = await getDownloadURL(uploadTask.snapshot.ref);
    if (onProgress) onProgress(100);
    return { avatarUrl, storageUsed: true };
  } catch (err) {
    const storageError = err instanceof Error ? err.message : 'Firebase Storage unavailable';
    return { avatarUrl: '', storageUsed: false, storageError };
  }
}

export async function saveStudyMaterial(material: Omit<StudyMaterial, 'createdAt' | 'updatedAt'>): Promise<void> {
  const path = `materials/${material.id}`;
  try {
    await setDoc(doc(db, 'materials', material.id), {
      id: material.id,
      title: clampStr(material.title, BLUEPRINT_CONSTRAINTS.MAX_TITLE_LEN),
      description: clampStr(material.description, BLUEPRINT_CONSTRAINTS.MAX_DESC_LEN),
      type: material.type,
      departmentId: clampStr(material.departmentId, 64),
      courseName: clampStr(material.courseName, 120),
      semester: Math.max(1, Math.min(12, Math.floor(material.semester))),
      subjectId: clampStr(material.subjectId, 64),
      subjectName: clampStr(material.subjectName, 140),
      unit: clampStr(material.unit, 100),
      fileUrl: clampStr(material.fileUrl, 2000),
      fileName: clampStr(material.fileName, 200),
      fileSizeLabel: clampStr(material.fileSizeLabel, 32),
      contentPreview: clampStr(material.contentPreview, 8000),
      uploadedByUid: material.uploadedByUid,
      uploadedByName: clampStr(material.uploadedByName, 100),
      isOfficial: material.isOfficial,
      isDemo: material.isDemo,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function deleteStudyMaterial(materialId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'materials', materialId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `materials/${materialId}`);
  }
}

export async function upsertBookmark(params: {
  userId: string;
  materialId: string;
  isBookmarked: boolean;
}): Promise<void> {
  const id = `${params.userId}_${params.materialId}`.slice(0, 128);
  const refDoc = doc(db, 'userBookmarks', id);
  try {
    const snap = await getDoc(refDoc);
    if (snap.exists()) {
      await updateDoc(refDoc, {
        isBookmarked: params.isBookmarked,
        lastViewedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(refDoc, {
        id,
        userId: params.userId,
        materialId: params.materialId,
        isBookmarked: params.isBookmarked,
        lastViewedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `userBookmarks/${id}`);
  }
}

export async function saveAttendanceRecord(record: Omit<AttendanceRecord, 'createdAt' | 'updatedAt'>, isNew: boolean): Promise<void> {
  const path = `attendanceSubjects/${record.id}`;
  try {
    const attended = Math.max(0, Math.min(1000, Math.floor(record.classesAttended)));
    const total = Math.max(attended, Math.min(1000, Math.floor(record.totalClasses)));
    if (isNew) {
      await setDoc(doc(db, 'attendanceSubjects', record.id), {
        id: record.id,
        studentUid: record.studentUid,
        studentName: clampStr(record.studentName, 100),
        subjectId: clampStr(record.subjectId, 64),
        subjectCode: clampStr(record.subjectCode, 24),
        subjectName: clampStr(record.subjectName, 140),
        classesAttended: attended,
        totalClasses: total,
        recordType: record.recordType,
        isDemo: record.isDemo,
        updatedByUid: record.updatedByUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(doc(db, 'attendanceSubjects', record.id), {
        classesAttended: attended,
        totalClasses: total,
        subjectName: clampStr(record.subjectName, 140),
        subjectCode: clampStr(record.subjectCode, 24),
        isDemo: record.isDemo,
        updatedByUid: record.updatedByUid,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, isNew ? OperationType.CREATE : OperationType.UPDATE, path);
  }
}

export async function createAttendanceLog(log: Omit<AttendanceLog, 'createdAt'>): Promise<void> {
  try {
    await setDoc(doc(db, 'attendanceLogs', log.id), {
      id: log.id,
      studentUid: log.studentUid,
      subjectId: clampStr(log.subjectId, 64),
      subjectName: clampStr(log.subjectName, 140),
      date: clampStr(log.date, 32),
      status: log.status,
      recordType: log.recordType,
      note: clampStr(log.note, BLUEPRINT_CONSTRAINTS.MAX_NOTE_LEN),
      loggedByUid: log.loggedByUid,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `attendanceLogs/${log.id}`);
  }
}

export async function deleteAttendanceLog(logId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'attendanceLogs', logId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `attendanceLogs/${logId}`);
  }
}

export async function saveStudyTask(task: Omit<StudyTask, 'createdAt' | 'updatedAt'>, isNew: boolean): Promise<void> {
  const path = `studyTasks/${task.id}`;
  try {
    if (isNew) {
      await setDoc(doc(db, 'studyTasks', task.id), {
        id: task.id,
        userId: task.userId,
        subjectId: clampStr(task.subjectId, 64),
        subjectName: clampStr(task.subjectName, 140),
        unit: clampStr(task.unit, 100),
        title: clampStr(task.title, 200),
        dueDate: clampStr(task.dueDate, 32),
        priority: task.priority,
        category: task.category,
        completed: task.completed,
        isDemo: task.isDemo,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(doc(db, 'studyTasks', task.id), {
        subjectId: clampStr(task.subjectId, 64),
        subjectName: clampStr(task.subjectName, 140),
        unit: clampStr(task.unit, 100),
        title: clampStr(task.title, 200),
        dueDate: clampStr(task.dueDate, 32),
        priority: task.priority,
        category: task.category,
        completed: task.completed,
        isDemo: task.isDemo,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, isNew ? OperationType.CREATE : OperationType.UPDATE, path);
  }
}

export async function deleteStudyTask(taskId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'studyTasks', taskId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `studyTasks/${taskId}`);
  }
}

export async function saveAnnouncement(ann: Omit<Announcement, 'createdAt' | 'updatedAt'>): Promise<void> {
  try {
    await setDoc(doc(db, 'announcements', ann.id), {
      id: ann.id,
      title: clampStr(ann.title, BLUEPRINT_CONSTRAINTS.MAX_TITLE_LEN),
      body: clampStr(ann.body, BLUEPRINT_CONSTRAINTS.MAX_BODY_LEN),
      category: ann.category,
      departmentId: clampStr(ann.departmentId, 64),
      authorUid: ann.authorUid,
      authorName: clampStr(ann.authorName, 100),
      authorRole: ann.authorRole,
      isPinned: ann.isPinned,
      isDemo: ann.isDemo,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `announcements/${ann.id}`);
  }
}

export async function deleteAnnouncement(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'announcements', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `announcements/${id}`);
  }
}

export async function saveExam(exam: Omit<ExamSchedule, 'createdAt' | 'updatedAt'>): Promise<void> {
  try {
    await setDoc(doc(db, 'exams', exam.id), {
      id: exam.id,
      subjectId: clampStr(exam.subjectId, 64),
      subjectCode: clampStr(exam.subjectCode, 24),
      subjectName: clampStr(exam.subjectName, 140),
      semester: Math.max(1, Math.min(12, Math.floor(exam.semester))),
      examType: exam.examType,
      examDate: clampStr(exam.examDate, 32),
      startTime: clampStr(exam.startTime, 16),
      endTime: clampStr(exam.endTime, 16),
      venue: clampStr(exam.venue, 100),
      syllabusUnits: clampStr(exam.syllabusUnits, 300),
      isDemo: exam.isDemo,
      createdByUid: exam.createdByUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `exams/${exam.id}`);
  }
}

export async function deleteExam(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'exams', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `exams/${id}`);
  }
}

export async function saveDepartment(dept: Omit<Department, 'createdAt' | 'updatedAt'>): Promise<void> {
  try {
    await setDoc(doc(db, 'departments', dept.id), {
      id: dept.id,
      name: clampStr(dept.name, 120),
      code: clampStr(dept.code, 20),
      courses: dept.courses.slice(0, BLUEPRINT_CONSTRAINTS.MAX_COURSES_PER_DEPT).map((c) => clampStr(c, 100)),
      semestersCount: Math.max(1, Math.min(12, Math.floor(dept.semestersCount))),
      isDemo: dept.isDemo,
      createdByUid: dept.createdByUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `departments/${dept.id}`);
  }
}

export async function saveSubject(subject: Omit<Subject, 'createdAt' | 'updatedAt'>): Promise<void> {
  try {
    await setDoc(doc(db, 'subjects', subject.id), {
      id: subject.id,
      code: clampStr(subject.code, 24),
      name: clampStr(subject.name, 140),
      departmentId: clampStr(subject.departmentId, 64),
      courseName: clampStr(subject.courseName, 120),
      semester: Math.max(1, Math.min(12, Math.floor(subject.semester))),
      credits: Math.max(1, Math.min(10, Math.floor(subject.credits))),
      facultyName: clampStr(subject.facultyName, 100),
      units: subject.units.slice(0, BLUEPRINT_CONSTRAINTS.MAX_UNITS_PER_SUBJECT).map((u) => clampStr(u, 120)),
      isDemo: subject.isDemo,
      createdByUid: subject.createdByUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `subjects/${subject.id}`);
  }
}

export async function savePlatformSettings(setting: Omit<PlatformSetting, 'updatedAt'>): Promise<void> {
  try {
    await setDoc(doc(db, 'platformSettings', setting.id), {
      id: setting.id,
      institutionName: clampStr(setting.institutionName, 140),
      defaultRequiredAttendance: Math.max(50, Math.min(100, Number(setting.defaultRequiredAttendance))),
      academicYear: clampStr(setting.academicYear, 32),
      activeSemester: Math.max(1, Math.min(12, Math.floor(setting.activeSemester))),
      updatedByUid: setting.updatedByUid,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `platformSettings/${setting.id}`);
  }
}

export async function saveAiChatSession(session: Omit<AiChatSession, 'createdAt' | 'updatedAt'>, isNew: boolean): Promise<void> {
  const path = `aiChats/${session.id}`;
  try {
    const trimmedMessages = session.messages.slice(-BLUEPRINT_CONSTRAINTS.MAX_CHAT_MESSAGES);
    if (isNew) {
      await setDoc(doc(db, 'aiChats', session.id), {
        id: session.id,
        userId: session.userId,
        title: clampStr(session.title, 160),
        subjectName: clampStr(session.subjectName, 140),
        language: session.language,
        messages: trimmedMessages,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(doc(db, 'aiChats', session.id), {
        title: clampStr(session.title, 160),
        subjectName: clampStr(session.subjectName, 140),
        language: session.language,
        messages: trimmedMessages,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, isNew ? OperationType.CREATE : OperationType.UPDATE, path);
  }
}

export async function seedPersonalWorkspaceData(uid: string, displayName: string): Promise<void> {
  try {
    const batch = writeBatch(db);
    for (const att of buildSampleAttendance(uid, displayName)) {
      batch.set(doc(db, 'attendanceSubjects', att.id), {
        ...att,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    for (const log of buildSampleAttendanceLogs(uid)) {
      batch.set(doc(db, 'attendanceLogs', log.id), {
        ...log,
        createdAt: serverTimestamp(),
      });
    }
    for (const task of buildSampleStudyTasks(uid)) {
      batch.set(doc(db, 'studyTasks', task.id), {
        ...task,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'personal-seed');
  }
}

export async function seedInstitutionCatalogData(uid: string, role: UserRole): Promise<void> {
  try {
    const batch = writeBatch(db);
    if (role === 'admin') {
      for (const d of SAMPLE_DEPARTMENTS) {
        batch.set(doc(db, 'departments', d.id), {
          ...d,
          createdByUid: uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      batch.set(doc(db, 'platformSettings', 'default'), {
        id: 'default',
        institutionName: 'National Institute of Engineering & Sciences',
        defaultRequiredAttendance: 75,
        academicYear: '2026-27',
        activeSemester: 3,
        updatedByUid: uid,
        updatedAt: serverTimestamp(),
      });
    }
    if (role === 'admin' || role === 'faculty') {
      for (const s of SAMPLE_SUBJECTS) {
        batch.set(doc(db, 'subjects', s.id), {
          ...s,
          createdByUid: uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      for (const m of SAMPLE_MATERIALS) {
        batch.set(doc(db, 'materials', m.id), {
          ...m,
          uploadedByUid: uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      for (const e of SAMPLE_EXAMS) {
        batch.set(doc(db, 'exams', e.id), {
          ...e,
          createdByUid: uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      for (const a of SAMPLE_ANNOUNCEMENTS) {
        batch.set(doc(db, 'announcements', a.id), {
          ...a,
          authorUid: uid,
          authorRole: role === 'admin' ? 'admin' : 'faculty',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      for (const slot of SAMPLE_TIMETABLE) {
        batch.set(doc(db, 'timetable', slot.id), {
          ...slot,
          createdByUid: uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    }
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'institution-seed');
  }
}

export function subscribeCollection<T>(
  collectionName: string,
  onData: (items: T[]) => void,
  filterField?: string,
  filterValue?: string
): Unsubscribe {
  const colRef = collection(db, collectionName);
  const q = filterField && filterValue !== undefined ? query(colRef, where(filterField, '==', filterValue)) : colRef;
  return onSnapshot(
    q,
    (snapshot) => {
      const rows = snapshot.docs.map((d) => ({ ...d.data(), id: d.id }) as T);
      onData(rows);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, collectionName);
    }
  );
}

export async function saveStudyRoom(room: Omit<StudyRoom, 'createdAt' | 'updatedAt'>): Promise<void> {
  const path = `studyRooms/${room.id}`;
  try {
    await setDoc(doc(db, 'studyRooms', room.id), {
      id: clampStr(room.id, 64),
      title: clampStr(room.title, 140),
      topic: clampStr(room.topic, 240),
      subjectId: clampStr(room.subjectId, 64),
      subjectCode: clampStr(room.subjectCode, 24),
      subjectName: clampStr(room.subjectName, 140),
      semester: Math.max(1, Math.min(12, Math.floor(room.semester || 5))),
      hostUid: room.hostUid,
      hostName: clampStr(room.hostName, 100),
      isActive: room.isActive,
      isDemo: room.isDemo,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function deleteStudyRoom(roomId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'studyRooms', roomId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `studyRooms/${roomId}`);
  }
}

export async function ensureAndJoinRoomParticipant(params: {
  room: StudyRoom;
  participant: Omit<StudyRoomParticipant, 'joinedAt' | 'lastActiveAt'>;
}): Promise<void> {
  const roomRef = doc(db, 'studyRooms', params.room.id);
  const partPath = `studyRooms/${params.room.id}/participants/${params.participant.uid}`;
  try {
    const roomSnap = await getDoc(roomRef);
    if (!roomSnap.exists()) {
      const template = SAMPLE_STUDY_ROOMS.find((r) => r.id === params.room.id) || params.room;
      await setDoc(roomRef, {
        id: clampStr(template.id, 64),
        title: clampStr(template.title, 140),
        topic: clampStr(template.topic, 240),
        subjectId: clampStr(template.subjectId, 64),
        subjectCode: clampStr(template.subjectCode, 24),
        subjectName: clampStr(template.subjectName, 140),
        semester: Math.max(1, Math.min(12, Math.floor(template.semester || 5))),
        hostUid: params.participant.uid,
        hostName: clampStr(params.participant.displayName, 100),
        isActive: true,
        isDemo: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    const partRef = doc(db, 'studyRooms', params.room.id, 'participants', params.participant.uid);
    const partSnap = await getDoc(partRef);
    if (partSnap.exists()) {
      await updateDoc(partRef, {
        displayName: clampStr(params.participant.displayName, 100),
        subjectId: clampStr(params.participant.subjectId, 64),
        subjectName: clampStr(params.participant.subjectName, 140),
        studyFocus: clampStr(params.participant.studyFocus, 160),
        colorHex: clampStr(params.participant.colorHex, 16),
        status: params.participant.status,
        lastActiveAt: serverTimestamp(),
      });
    } else {
      await setDoc(partRef, {
        uid: params.participant.uid,
        roomId: clampStr(params.room.id, 64),
        displayName: clampStr(params.participant.displayName, 100),
        subjectId: clampStr(params.participant.subjectId, 64),
        subjectName: clampStr(params.participant.subjectName, 140),
        studyFocus: clampStr(params.participant.studyFocus, 160),
        colorHex: clampStr(params.participant.colorHex, 16),
        status: params.participant.status,
        joinedAt: serverTimestamp(),
        lastActiveAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, partPath);
  }
}

export async function leaveStudyRoomParticipant(roomId: string, uid: string): Promise<void> {
  const path = `studyRooms/${roomId}/participants/${uid}`;
  try {
    await deleteDoc(doc(db, 'studyRooms', roomId, 'participants', uid));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function saveWhiteboardStroke(stroke: Omit<WhiteboardStroke, 'createdAt'>): Promise<void> {
  const path = `studyRooms/${stroke.roomId}/strokes/${stroke.id}`;
  try {
    await setDoc(doc(db, 'studyRooms', stroke.roomId, 'strokes', stroke.id), {
      id: stroke.id,
      roomId: clampStr(stroke.roomId, 64),
      authorUid: stroke.authorUid,
      authorName: clampStr(stroke.authorName, 100),
      tool: stroke.tool,
      color: clampStr(stroke.color, 24),
      strokeWidth: Math.max(1, Math.min(24, Number(stroke.strokeWidth) || 3)),
      pointsJson: (stroke.pointsJson || '[]').slice(0, 24000),
      text: clampStr(stroke.text, 500),
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function deleteWhiteboardStroke(roomId: string, strokeId: string): Promise<void> {
  const path = `studyRooms/${roomId}/strokes/${strokeId}`;
  try {
    await deleteDoc(doc(db, 'studyRooms', roomId, 'strokes', strokeId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function clearRoomWhiteboardStrokes(roomId: string, onlyAuthorUid?: string): Promise<void> {
  const path = `studyRooms/${roomId}/strokes`;
  try {
    const snap = await getDocs(collection(db, 'studyRooms', roomId, 'strokes'));
    if (snap.empty) return;
    const docsToDelete = onlyAuthorUid
      ? snap.docs.filter((d) => (d.data() as { authorUid?: string }).authorUid === onlyAuthorUid)
      : snap.docs;
    if (docsToDelete.length === 0) return;
    const batch = writeBatch(db);
    docsToDelete.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function upsertStudyPresence(presence: Omit<StudyPresence, 'updatedAt'>): Promise<void> {
  const path = `studyPresence/${presence.uid}`;
  try {
    const refDoc = doc(db, 'studyPresence', presence.uid);
    const snap = await getDoc(refDoc);
    const payload = {
      uid: presence.uid,
      displayName: clampStr(presence.displayName, 100),
      subjectId: clampStr(presence.subjectId, 64),
      subjectCode: clampStr(presence.subjectCode, 24),
      subjectName: clampStr(presence.subjectName, 140),
      roomId: clampStr(presence.roomId, 64),
      roomTitle: clampStr(presence.roomTitle, 140),
      studyGoal: clampStr(presence.studyGoal, 160),
      isActive: presence.isActive,
      updatedAt: serverTimestamp(),
    };
    if (snap.exists()) {
      await updateDoc(refDoc, payload);
    } else {
      await setDoc(refDoc, payload);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export function subscribeRoomParticipants(
  roomId: string,
  onData: (items: StudyRoomParticipant[]) => void
): Unsubscribe {
  const path = `studyRooms/${roomId}/participants`;
  return onSnapshot(
    collection(db, 'studyRooms', roomId, 'participants'),
    (snapshot) => {
      const rows = snapshot.docs.map((d) => ({ ...d.data(), uid: d.id }) as StudyRoomParticipant);
      onData(rows);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeRoomStrokes(
  roomId: string,
  onData: (items: WhiteboardStroke[]) => void
): Unsubscribe {
  const path = `studyRooms/${roomId}/strokes`;
  return onSnapshot(
    collection(db, 'studyRooms', roomId, 'strokes'),
    (snapshot) => {
      const rows = snapshot.docs.map((d) => ({ ...d.data(), id: d.id }) as WhiteboardStroke);
      onData(rows);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function saveStudyRoomResource(resource: Omit<StudyRoomResource, 'createdAt'>): Promise<void> {
  const path = `studyRooms/${resource.roomId}/resources/${resource.id}`;
  try {
    await setDoc(doc(db, 'studyRooms', resource.roomId, 'resources', resource.id), {
      id: clampStr(resource.id, 128),
      roomId: clampStr(resource.roomId, 64),
      authorUid: resource.authorUid,
      authorName: clampStr(resource.authorName, 100),
      title: clampStr(resource.title, 180),
      resourceType: resource.resourceType,
      materialId: clampStr(resource.materialId, 64),
      url: clampStr(resource.url, 1000),
      noteText: clampStr(resource.noteText, 1000),
      subjectCode: clampStr(resource.subjectCode || 'GEN', 24),
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function deleteStudyRoomResource(roomId: string, resourceId: string): Promise<void> {
  const path = `studyRooms/${roomId}/resources/${resourceId}`;
  try {
    await deleteDoc(doc(db, 'studyRooms', roomId, 'resources', resourceId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export function subscribeRoomResources(
  roomId: string,
  onData: (items: StudyRoomResource[]) => void
): Unsubscribe {
  const path = `studyRooms/${roomId}/resources`;
  return onSnapshot(
    collection(db, 'studyRooms', roomId, 'resources'),
    (snapshot) => {
      const rows = snapshot.docs.map((d) => ({ ...d.data(), id: d.id }) as StudyRoomResource);
      onData(rows);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function incrementStudyContributorStat(params: {
  uid: string;
  displayName: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  minutesDelta?: number;
  resourcesDelta?: number;
  sessionsDelta?: number;
}): Promise<void> {
  const path = `studyContributors/${params.uid}`;
  const minutesDelta = Math.max(0, Math.min(240, Math.floor(params.minutesDelta || 0)));
  const resourcesDelta = Math.max(0, Math.min(5, Math.floor(params.resourcesDelta || 0)));
  const sessionsDelta = Math.max(0, Math.min(3, Math.floor(params.sessionsDelta || 0)));

  try {
    const refDoc = doc(db, 'studyContributors', params.uid);
    const snap = await getDoc(refDoc);
    if (snap.exists()) {
      const prev = snap.data() as StudyContributorStat;
      const totalMinutes = Math.min(100000, Math.max(0, Math.floor(prev.totalMinutes || 0) + minutesDelta));
      const resourcesSharedCount = Math.min(
        10000,
        Math.max(0, Math.floor(prev.resourcesSharedCount || 0) + resourcesDelta)
      );
      const sessionsJoined = Math.min(10000, Math.max(0, Math.floor(prev.sessionsJoined || 0) + sessionsDelta));
      const points = totalMinutes * 2 + resourcesSharedCount * 25 + sessionsJoined * 10;

      await updateDoc(refDoc, {
        displayName: clampStr(params.displayName, 100),
        primarySubjectId: clampStr(params.subjectId || prev.primarySubjectId, 64),
        primarySubjectCode: clampStr(params.subjectCode || prev.primarySubjectCode, 24),
        primarySubjectName: clampStr(params.subjectName || prev.primarySubjectName, 140),
        totalMinutes,
        resourcesSharedCount,
        sessionsJoined,
        points,
        isDemo: false,
        updatedAt: serverTimestamp(),
      });
    } else {
      const safeMin = Math.min(60, minutesDelta);
      const safeRes = Math.min(5, resourcesDelta);
      const safeSes = Math.min(3, sessionsDelta);
      const points = safeMin * 2 + safeRes * 25 + safeSes * 10;

      await setDoc(refDoc, {
        uid: params.uid,
        displayName: clampStr(params.displayName, 100),
        primarySubjectId: clampStr(params.subjectId, 64),
        primarySubjectCode: clampStr(params.subjectCode, 24),
        primarySubjectName: clampStr(params.subjectName, 140),
        totalMinutes: safeMin,
        resourcesSharedCount: safeRes,
        sessionsJoined: safeSes,
        points,
        isDemo: false,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}
