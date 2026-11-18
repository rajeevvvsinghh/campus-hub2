export interface AttendanceProjection {
  currentPercentage: number;
  isMeetingTarget: boolean;
  classesNeeded: number;
  maxMissable: number;
  statusLabel: 'On Track' | 'Borderline' | 'Shortage';
}

export function calculateAttendancePercentage(attended: number, total: number): number {
  if (total <= 0) return 0;
  const clampedAttended = Math.max(0, Math.min(attended, total));
  return Number(((clampedAttended / total) * 100).toFixed(2));
}

export function analyzeAttendance(
  attended: number,
  total: number,
  requiredPercentage: number
): AttendanceProjection {
  const safeTotal = Math.max(0, Math.floor(total));
  const safeAttended = Math.max(0, Math.min(Math.floor(attended), safeTotal));
  const target = Math.max(1, Math.min(100, requiredPercentage));
  const T = target / 100;

  if (safeTotal === 0) {
    return {
      currentPercentage: 0,
      isMeetingTarget: false,
      classesNeeded: 1,
      maxMissable: 0,
      statusLabel: 'Borderline',
    };
  }

  const currentPercentage = calculateAttendancePercentage(safeAttended, safeTotal);
  const isMeetingTarget = currentPercentage >= target;

  let classesNeeded = 0;
  if (!isMeetingTarget) {
    if (T >= 1) {
      classesNeeded = safeAttended < safeTotal ? Infinity : 0;
    } else {
      // (A + x) / (N + x) >= T  =>  x >= (T*N - A) / (1 - T)
      const raw = (T * safeTotal - safeAttended) / (1 - T);
      classesNeeded = Math.max(1, Math.ceil(raw - 1e-9));
    }
  }

  let maxMissable = 0;
  if (isMeetingTarget) {
    // A / (N + y) >= T  =>  y <= (A - T*N) / T
    const raw = (safeAttended - T * safeTotal) / T;
    maxMissable = Math.max(0, Math.floor(raw + 1e-9));
  }

  let statusLabel: 'On Track' | 'Borderline' | 'Shortage' = 'On Track';
  if (currentPercentage < target) {
    statusLabel = currentPercentage < target - 5 ? 'Shortage' : 'Borderline';
  }

  return {
    currentPercentage,
    isMeetingTarget,
    classesNeeded,
    maxMissable,
    statusLabel,
  };
}
