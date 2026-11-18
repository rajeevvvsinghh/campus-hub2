# CampusConnect Security Specification (Phase 0)

## 1. Data Invariants
1. **Identity Integrity**: Every user-owned document (`users`, `userBookmarks`, `studyTasks`, `aiChats`) MUST have its owner/userId field equal `request.auth.uid` on creation and remain immutable on update.
2. **PII Isolation**: User email addresses reside exclusively in `/users/{userId}`, readable only by the document owner or a verified Admin. Non-PII academic roster metadata (`studentRosters`) is separated for faculty/admin visibility.
3. **Zero Self-Escalation**: A user creating their own `/users/{userId}` document may ONLY assign `role: 'student'` unless they are the bootstrapped verified admin (`rajeevvvhere@gmail.com` with `email_verified == true`). Only Admins may grant `/admins/{uid}` or `/faculty/{uid}` or change another user's `role`.
4. **Faculty & Admin Content Authority**: Official `departments`, `subjects`, `exams`, `timetable`, `announcements`, and `official` attendance records can ONLY be created/modified/deleted by verified Faculty or Admins.
5. **Strict Schema & Size Guards**: Every document enforces exact key allowlists (`hasAll` + `hasOnly` on create, `affectedKeys().hasOnly()` on update), server timestamps (`request.time`), string length limits, bounded arrays, and regex ID checks (`isValidId`).
6. **Verified Auth**: All writes require `request.auth != null && request.auth.token.email_verified == true`.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Role Self-Escalation**: Student attempts `setDoc(/users/student1, { ..., role: 'admin' })` -> DENIED.
2. **Shadow Field Injection**: Student attempts `create` on `/studyTasks/t1` with extra field `isOfficial: true` -> DENIED.
3. **Unverified Admin Email Spoof**: Attacker signs in with `email: 'rajeevvvhere@gmail.com'` and `email_verified: false` -> DENIED.
4. **Cross-User PII Read**: Student A calls `get(/users/studentB)` -> DENIED.
5. **Blanket User List Scrape**: Student A calls `list(/users)` -> DENIED.
6. **Cross-User Task Modification**: Student A calls `update(/studyTasks/studentB_task, { completed: true })` -> DENIED.
7. **Student Creating Official Attendance**: Student attempts `create(/attendanceSubjects/r1, { ..., recordType: 'official' })` -> DENIED.
8. **Student Publishing Announcement**: Student attempts `create(/announcements/a1, ...)` -> DENIED.
9. **Client Timestamp Forgery**: User submits `createdAt: new Date('2020-01-01')` instead of `serverTimestamp()` -> DENIED.
10. **ID Poisoning / Resource Exhaustion**: Attacker writes document with 500-char ID or 100KB title string -> DENIED.
11. **Immutable Owner Tampering**: User attempts `update(/studyTasks/t1, { userId: 'otherUid' })` -> DENIED.
12. **Unbounded Array Attack**: User attempts `create(/aiChats/c1, { ..., messages: [/* > 50 items */] })` -> DENIED.
