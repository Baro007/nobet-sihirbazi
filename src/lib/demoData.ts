import { buildFiveDayBridgeLeave, getDefaultTurkishHolidays } from './calendar';
import { MonthConfig, Nurse, NursePreference } from '../types/schedule';

export const DEFAULT_YEAR_MONTH = '2026-12';

/**
 * KVKK Uyarısı: Tamamen sentetik/kurgusal demo isimleridir.
 * Gerçek personel isimleri veya TC Kimlik numaraları içermez.
 */
export function createDemoNurses(): Nurse[] {
  return [
    {
      id: 'n-sorumlu',
      name: 'Selma Yılmaz',
      branch: 'HEM',
      role: 'sorumlu',
      sortOrder: 1,
      active: true,
      notes: 'Birim Sorumlu Hemşiresi (hafta içi gündüz)',
    },
    {
      id: 'n-01',
      name: 'Ayşe Kaya',
      branch: 'HEM',
      role: 'nobetli',
      sortOrder: 2,
      active: true,
      notes: 'Eşi sağlık personeli — eşiyle aynı gün nöbet tercihi',
    },
    {
      id: 'n-02',
      name: 'Fatma Demir',
      branch: 'HEM',
      role: 'nobetli',
      sortOrder: 3,
      active: true,
      notes: 'Eşi vardiyalı çalışıyor — eşinin mesai günlerinde çalışamaz',
    },
    {
      id: 'n-03',
      name: 'Elif Arslan',
      branch: 'HEM',
      role: 'nobetli',
      sortOrder: 4,
      active: true,
      notes: 'Aralık ortası 5 gün yıllık izin köprüleme örneği',
    },
    {
      id: 'n-04',
      name: 'Gamze Çetin',
      branch: 'HEM',
      role: 'nobetli',
      sortOrder: 5,
      active: true,
    },
    {
      id: 'n-05',
      name: 'Pınar Koç',
      branch: 'HEM',
      role: 'nobetli',
      sortOrder: 6,
      active: true,
    },
    {
      id: 'n-06',
      name: 'Deniz Şahin',
      branch: 'HEM',
      role: 'nobetli',
      sortOrder: 7,
      active: true,
    },
    {
      id: 'n-07',
      name: 'Yasemin Aydın',
      branch: 'HEM',
      role: 'nobetli',
      sortOrder: 8,
      active: true,
    },
    {
      id: 'n-08',
      name: 'Kader Yıldırım',
      branch: 'HEM',
      role: 'nobetli',
      sortOrder: 9,
      active: true,
    },
    {
      id: 'n-09',
      name: 'Tuğba Özkan',
      branch: 'HEM',
      role: 'nobetli',
      sortOrder: 10,
      active: true,
    },
    {
      id: 'n-10',
      name: 'Burak Aktaş',
      branch: 'HEM',
      role: 'nobetli',
      sortOrder: 11,
      active: true,
    },
    {
      id: 'n-pasif',
      name: 'Seda Öztürk',
      branch: 'HEM',
      role: 'pasif_izinli',
      passiveReason: 'DI',
      sortOrder: 12,
      active: true,
      notes: 'Doğum sonrası izni — aktif nöbete girmez, resmî listede görünür',
    },
  ];
}

export function createDefaultMonthConfig(yearMonth: string): MonthConfig {
  const holidays = getDefaultTurkishHolidays(yearMonth);

  return {
    yearMonth,
    clinicName: 'NEFROLOJİ KLİNİĞİ',
    hospitalName: 'ANTALYA EĞİTİM VE ARAŞTIRMA HASTANESİ',
    isRiskyUnit: false,
    weekdayMesaiCount: 2,
    weekdayNobetCount: 2,
    weekendMesaiCount: 1,
    weekendNobetCount: 2,
    autoTopUpUnderHours: true,
    compensateSorumluAbsence: true,
    holidays,
    preferencesLocked: false,
    preferenceDeadline: '',
    prevMonthTail: {},
    nurseRoleOverrides: {},
  };
}

export function createDemoMonthConfig(yearMonth: string): MonthConfig {
  const base = createDefaultMonthConfig(yearMonth);
  if (yearMonth === DEFAULT_YEAR_MONTH) {
    base.prevMonthTail = {
      'n-04': ['', 'N24', ''],
      'n-05': ['', 'N24', ''],
      'n-06': ['', '', 'N24'],
      'n-07': ['', '', 'N24'],
    };
  }
  return base;
}

export function createDemoPreferences(yearMonth: string): Record<string, NursePreference> {
  if (yearMonth !== DEFAULT_YEAR_MONTH) return {};

  const now = new Date().toISOString();
  const bridge = buildFiveDayBridgeLeave(yearMonth, 14, true);
  const leaveMap: Record<number, 'YI'> = {};
  for (const d of bridge.leaveDays) {
    leaveMap[d] = 'YI';
  }

  return {
    'n-01': {
      yearMonth,
      nurseId: 'n-01',
      positiveNobetDays: [4, 12, 20, 28],
      negativeDays: [],
      softNegativeDays: [7],
      leaveDays: {},
      bridgeLeaveRequests: [],
      notes: 'Eşim de aynı günlerde nöbetçi',
      updatedAt: now,
    },
    'n-02': {
      yearMonth,
      nurseId: 'n-02',
      positiveNobetDays: [],
      negativeDays: [2, 6, 10, 14, 18, 22, 26],
      softNegativeDays: [],
      leaveDays: {},
      bridgeLeaveRequests: [],
      notes: 'Eşimin çalışma günleri kesin müsait değilim',
      updatedAt: now,
    },
    'n-03': {
      yearMonth,
      nurseId: 'n-03',
      positiveNobetDays: bridge.preThursdayDay ? [bridge.preThursdayDay] : [],
      negativeDays: bridge.negativeDays,
      softNegativeDays: [],
      leaveDays: leaveMap,
      bridgeLeaveRequests: [
        {
          startDay: bridge.mondayDay,
          endDay: bridge.fridayDay,
          wantPreThursdayNobet: true,
        },
      ],
      notes: '14–18 Aralık 5 gün yıllık izin + Perşembe nöbeti ile 10 gün blok',
      updatedAt: now,
    },
    'n-05': {
      yearMonth,
      nurseId: 'n-05',
      positiveNobetDays: [8, 24],
      negativeDays: [30, 31],
      softNegativeDays: [15],
      leaveDays: {},
      bridgeLeaveRequests: [],
      notes: 'Yılbaşı öncesi 30-31 Aralık boş olursa sevinirim',
      updatedAt: now,
    },
    'n-08': {
      yearMonth,
      nurseId: 'n-08',
      positiveNobetDays: [5, 19],
      negativeDays: [1, 2],
      softNegativeDays: [],
      leaveDays: {},
      bridgeLeaveRequests: [],
      notes: '',
      updatedAt: now,
    },
    'n-10': {
      yearMonth,
      nurseId: 'n-10',
      positiveNobetDays: [13, 27],
      negativeDays: [20, 21],
      softNegativeDays: [],
      leaveDays: {},
      bridgeLeaveRequests: [],
      notes: '',
      updatedAt: now,
    },
  };
}
