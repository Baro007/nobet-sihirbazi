export type ShiftCode =
  | ''
  | 'N24' // 24 saat nöbet (08:00-08:00)
  | 'M8'  // 8 saat mesai (08:00-16:00)
  | 'N16' // 16 saat nöbet (16:00-08:00 - opsiyonel manuel)
  | 'S8'  // Sorumlu hemşire mesaisi (08:00-16:00)
  | 'YI'  // Yıllık İzin
  | 'R'   // Rapor
  | 'DI'  // Doğum / Süt İzni
  | 'II'; // İdari / Mazeret İzni

export type NurseRole = 'nobetli' | 'sorumlu' | 'pasif_izinli';
export type PassiveReason = 'DI' | 'R' | 'YI' | 'II' | 'OTHER';
export type LeaveCode = 'YI' | 'R' | 'II';

export interface Nurse {
  id: string;
  name: string;
  branch: string; // e.g. 'HEM', 'EBE'
  role: NurseRole;
  passiveReason?: PassiveReason;
  sortOrder: number;
  active: boolean;
  notes?: string;
}

export interface HolidayEntry {
  name: string;
  type: 'resmi' | 'bayram' | 'idari' | 'arefe';
}

export interface BridgeLeaveRequest {
  startDay: number; // Pazartesi günü
  endDay: number;   // Cuma günü
  wantPreThursdayNobet: boolean;
}

export interface NursePreference {
  yearMonth: string;
  nurseId: string;
  positiveNobetDays: number[];
  negativeDays: number[];
  softNegativeDays: number[];
  leaveDays: Record<number, LeaveCode>;
  bridgeLeaveRequests: BridgeLeaveRequest[];
  notes: string;
  updatedAt: string;
}

export interface NurseRoleOverride {
  role: NurseRole;
  passiveReason?: PassiveReason;
}

export interface MonthConfig {
  yearMonth: string; // YYYY-MM
  clinicName: string;
  hospitalName: string;
  isRiskyUnit: boolean;
  weekdayMesaiCount: number;
  weekdayNobetCount: number;
  weekendMesaiCount: number;
  weekendNobetCount: number;
  autoTopUpUnderHours: boolean;
  compensateSorumluAbsence?: boolean;
  holidays: Record<number, HolidayEntry>;
  preferencesLocked: boolean;
  preferenceDeadline?: string;
  prevMonthTail: Record<string, [ShiftCode, ShiftCode, ShiftCode]>;
  nurseRoleOverrides: Record<string, NurseRoleOverride>;
}

export interface SolverSummary {
  durationMs: number;
  hardViolations: number;
  softWarnings: number;
  hourSpread: number;
  preferenceSatisfactionPct: number;
  threeDayGapMin: number;
  threeDayGapMax: number;
  extraMesaiDays: number[];
  seed: number;
}

export interface MonthSchedule {
  yearMonth: string;
  assignments: Record<string, Record<number, ShiftCode>>;
  updatedAt: string;
  solverStats?: SolverSummary;
}

export interface ValidationIssue {
  id: string;
  severity: 'hard' | 'warning';
  code:
    | 'COVERAGE_MISMATCH'
    | 'REST_D1_VIOLATION'
    | 'REST_D2_N24_VIOLATION'
    | 'DAY3_MESAI_NOTICE'
    | 'LEAVE_CONFLICT'
    | 'NEGATIVE_PREF_CONFLICT';
  nurseId?: string;
  day?: number;
  message: string;
}

export interface NurseMetrics {
  nurseId: string;
  name: string;
  role: NurseRole;
  workedHours: number;
  targetHours: number;
  overtimeHours: number;
  nobetCount: number;
  mesaiCount: number;
  nobet16Count: number;
  weekendHolidayNobet: number;
  weekendHolidayMesai: number;
  threeDayGapCount: number;
  positiveMatched: number;
  positiveTotal: number;
  day3MesaiCount: number;
  negativeViolations: number;
  softNegativeViolations: number;
  leaveDaysCount: number;
}

export interface ScheduleEvaluation {
  issues: ValidationIssue[];
  hardViolations: number;
  softWarnings: number;
  nurseMetrics: NurseMetrics[];
  hourSpread: number;
  preferenceSatisfactionPct: number;
  weekendSpread: number;
  threeDayGapMin: number;
  threeDayGapMax: number;
  dailyCounts: Record<
    number,
    {
      nobet: number;
      mesai: number;
      sorumlu: number;
      daytimeTotal: number;
      expectedNobet: number;
      expectedMesai: number;
      expectedSorumlu: number;
      isWeekendOrHoliday: boolean;
    }
  >;
}

export interface PreflightReport {
  baseStatutoryHours: number;
  totalTargetHours: number;
  totalRequiredHours: number;
  activeNobetliCount: number;
  sorumluCount: number;
  pasifCount: number;
  hourBalanceDiff: number; // totalRequiredHours - totalTargetHours
  underHoursPerNurse: number;
  suggestedExtraMesaiDays: number;
  warnings: string[];
  blockers: string[];
}

export interface PrevMonthFairnessCarryOver {
  threeDayGapCount: Record<string, number>;
  overtimeHours: Record<string, number>;
}
