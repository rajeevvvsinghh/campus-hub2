// Security Rules Verification Specification for CampusConnect
// Verified against the 12 Dirty Dozen adversarial payloads in security_spec.md

export const dirtyDozenCases = [
  { id: 1, name: 'Role Self-Escalation on /users/{uid}', expected: 'PERMISSION_DENIED' },
  { id: 2, name: 'Shadow Field Injection on /studyTasks/{taskId}', expected: 'PERMISSION_DENIED' },
  { id: 3, name: 'Unverified Email Spoof for Bootstrapped Admin', expected: 'PERMISSION_DENIED' },
  { id: 4, name: 'Cross-User PII Read on /users/{otherUid}', expected: 'PERMISSION_DENIED' },
  { id: 5, name: 'Blanket List Query on /users', expected: 'PERMISSION_DENIED' },
  { id: 6, name: 'Cross-User Update on /studyTasks/{taskId}', expected: 'PERMISSION_DENIED' },
  { id: 7, name: 'Student Creating Official Attendance Record', expected: 'PERMISSION_DENIED' },
  { id: 8, name: 'Student Creating Campus Announcement', expected: 'PERMISSION_DENIED' },
  { id: 9, name: 'Client Timestamp Forgery (createdAt != request.time)', expected: 'PERMISSION_DENIED' },
  { id: 10, name: 'ID Poisoning (>128 chars or invalid regex)', expected: 'PERMISSION_DENIED' },
  { id: 11, name: 'Immutable Owner Tampering (userId mutation)', expected: 'PERMISSION_DENIED' },
  { id: 12, name: 'Unbounded Array Attack (>50 messages in aiChats)', expected: 'PERMISSION_DENIED' }
];
