import { describe, expect, it } from 'vitest';
import { createDefaultMonthConfig, createDemoNurses } from '../lib/demoData';
import {
  computeExpectedOvertimeTargets,
  evaluateSchedule,
  runPreflightChecks,
} from '../solver/validator';
import { NursePreference, ShiftCode } from '../types/schedule';

describe('schedule validator', () => {
  it('detects d+1 rest violation, d+2 N24 violation, d+2 M8 warning, negative conflict, and month-boundary tail', () => {
    const config = createDefaultMonthConfig('2026-12');
    const nurses = createDemoNurses();
    // Ayın son günü N24 tutan hemşire (n-06), ayın 1'inde çalışamaz
    config.prevMonthTail = {
      'n-06': ['', '', 'N24'],
      'n-04': ['', 'N24', ''],
    };

    const prefs: Record<string, NursePreference> = {
      'n-02': {
        yearMonth: '2026-12',
        nurseId: 'n-02',
        positiveNobetDays: [],
        positiveMesaiDays: [8, 14],
        negativeDays: [5, 19],
        softNegativeDays: [2, 11],
        leaveDays: {},
        bridgeLeaveRequests: [],
        notes: '',
        updatedAt: '',
      },
    };

    const assignments: Record<string, Record<number, ShiftCode>> = {
      'n-01': {
        3: 'N24',
        4: 'M8', // d+1 ihlali
        5: 'N24', // d+2 N24 ihlali
        10: 'N24',
        12: 'M8', // d+2 M8 soft warning
        20: 'N24', // 21, 22, 23 boş -> 1 adet 3 günlük boşluk
      },
      'n-02': {
        2: 'M8', // sarı (mümkünse boş) gününe mesai düştü
        5: 'M8', // negatif tercih ihlali (kırmızı delindi)
        8: 'M8', // 08-16 mesai tercihi karşılandı
        14: 'N24', // 08-16 mesai tercihine nöbet çakışması uyarısı
      },
      'n-06': {
        1: 'M8', // önceki ayın son gün nöbeti -> d+1 ihlali
      },
      'n-04': {
        1: 'N24', // önceki ayın sondan 2. günü nöbeti -> d+2 N24 ihlali
      },
    };

    const ev = evaluateSchedule(config, nurses, prefs, assignments);

    const codes = ev.issues.map((i) => i.code);
    expect(codes).toContain('REST_D1_VIOLATION');
    expect(codes).toContain('REST_D2_N24_VIOLATION');
    expect(codes).toContain('DAY3_MESAI_NOTICE');
    expect(codes).toContain('NEGATIVE_PREF_CONFLICT');
    expect(codes).toContain('COVERAGE_MISMATCH');

    const n01 = ev.nurseMetrics.find((m) => m.nurseId === 'n-01');
    // 5. gün N24 sonrası 6,7,8 boş + 20. gün N24 sonrası 21,22,23 boş = 2 adet 3 günlük boşluk
    expect(n01?.threeDayGapCount).toBe(2);
    expect(n01?.day3MesaiCount).toBe(1);

    expect(codes).toContain('MESAI_PREF_NOBET_CONFLICT');
    const n02 = ev.nurseMetrics.find((m) => m.nurseId === 'n-02');
    expect(n02?.positiveMatched).toBe(1);
    expect(n02?.positiveTotal).toBe(2);
    expect(n02?.positiveMesaiMatched).toBe(1);
    expect(n02?.positiveMesaiTotal).toBe(2);
    expect(n02?.unmatchedPositiveDays).toEqual([14]);
    expect(n02?.negativeViolations).toBe(1);
    expect(n02?.negativeTotal).toBe(2);
    expect(n02?.violatedNegativeDays).toEqual([5]);
    expect(n02?.softNegativeViolations).toBe(1);
    expect(n02?.softNegativeTotal).toBe(2);
    expect(n02?.violatedSoftNegativeDays).toEqual([2]);
    expect(ev.totalNegativeViolations).toBe(1);
    expect(ev.totalNegativeRequested).toBe(2);
    expect(ev.totalSoftNegativeViolations).toBe(1);
    expect(ev.totalSoftNegativeRequested).toBe(2);
  });

  it('deducts mid-month R in assignments from targetHours and triggers sorumlu absence +1 mesai compensation', () => {
    const config = createDefaultMonthConfig('2026-12');
    config.compensateSorumluAbsence = true;
    const nurses = createDemoNurses();

    const assignments: Record<string, Record<number, ShiftCode>> = {
      'n-sorumlu': { 3: 'R' },
      'n-01': { 4: 'R' },
    };

    const ev = evaluateSchedule(config, nurses, {}, assignments);
    // 3 Aralık Perşembe Sorumlu R -> o gün mesai beklentisi 2'den 3'e çıkmalı
    expect(ev.dailyCounts[3].expectedSorumlu).toBe(0);
    expect(ev.dailyCounts[3].expectedMesai).toBe(3);

    // n-01 tercihlerde izin girmese de matristeki 4 Aralık R nedeniyle hedefi 184 - 8 = 176 olmalı
    const n01 = ev.nurseMetrics.find((m) => m.nurseId === 'n-01');
    expect(n01?.targetHours).toBe(176);
  });

  it('warns in preflight when positiveMesaiDays exceeds daily capacity or prevMonthTail blocks day 1/2 N24', () => {
    const config = createDefaultMonthConfig('2026-12');
    const nurses = createDemoNurses().slice(0, 6); // Selma (S) + 5 nöbetli: n-01..n-05
    config.prevMonthTail = {
      'n-01': ['', 'N24', ''], // ayın 1'i N24 yasak (M8 mümkün)
      'n-02': ['', '', 'N24'], // ayın 1'i çıkış (çalışamaz), ayın 2'si N24 yasak
      'n-03': ['', 'N24', ''], // ayın 1'i N24 yasak (M8 mümkün)
    };

    const prefs: Record<string, NursePreference> = {
      'n-01': {
        yearMonth: '2026-12',
        nurseId: 'n-01',
        positiveNobetDays: [],
        positiveMesaiDays: [5], // Cumartesi (mesai kadrosu 1)
        negativeDays: [],
        softNegativeDays: [],
        leaveDays: {},
        bridgeLeaveRequests: [],
        notes: '',
        updatedAt: '',
      },
      'n-04': {
        yearMonth: '2026-12',
        nurseId: 'n-04',
        positiveNobetDays: [],
        positiveMesaiDays: [1, 5], // 1'i sadece mesai -> ayın 1'i için N24 adayı 1'e düşer
        negativeDays: [],
        softNegativeDays: [],
        leaveDays: {},
        bridgeLeaveRequests: [],
        notes: '',
        updatedAt: '',
      },
    };

    const preflight = runPreflightChecks(config, nurses, prefs);
    // 5. gün (Cumartesi) 1 mesai varken 2 kişi M8 istemiş -> fazla talep uyarısı
    expect(preflight.warnings.some((w) => w.includes('5. gün 2 hemşire 08–16 mesai istemiş'))).toBe(
      true
    );
    // 1. gün: available=4 (kadro tamam) ama N24 tutabilecek sadece n-05 var (1 < 2)
    expect(
      preflight.warnings.some((w) => w.includes('1. gün için 24s nöbet tutabilecek hemşire sayısı 1'))
    ).toBe(true);
  });

  it('enforces maxConsecutiveEmptyDays on nobetli nurses including month rollover while exempting leave and daytime roles', () => {
    const config = createDefaultMonthConfig('2026-12');
    const nurses = createDemoNurses().slice(0, 4); // Selma (S) + n-01, n-02, n-03
    config.prevMonthTail = {
      'n-02': ['N24', '', ''], // Ay devri: 2 gün boş devrediyor
    };

    const assignments: Record<string, Record<number, ShiftCode>> = {
      // Sorumlu Aralık 1-6 (2-6 arası 4+ gün M8/S8 değilse bile muaf — örn 5,6 hafta sonu + 7-8 izin değil boş)
      'n-sorumlu': { 1: 'S8', 2: 'S8', 3: 'S8', 4: 'S8', 9: 'S8' }, // 5,6,7,8 boş olsa da sorumlu muaf
      // n-01: 1-3 N24 yok, 10..13 arası 4 gün üst üste boş (10,11,12,13), 20..25 arası 1 gün Yİ bölüyor
      'n-01': {
        1: 'N24',
        5: 'N24',
        9: 'N24',
        14: 'N24', // 10,11,12,13 -> 4 gün boşluk (LONG_EMPTY_STREAK)
        17: 'M8',
        20: 'M8', // 18,19 boş (2 gün)
        23: 'YI', // 21,22 boş (2), 23 Yİ, 24,25 boş (2) -> İzin böldüğü için 5 gün boşluk sayılmaz
        26: 'M8',
        29: 'M8',
      },
      // n-02: Önceki aydan 2 gün boş devredip ayın 1, 2'si boş kalınca = 4 gün boşluk -> LONG_EMPTY_STREAK
      'n-02': {
        3: 'N24',
        6: 'M8',
        9: 'N24',
        12: 'M8',
        15: 'N24',
        18: 'M8',
        21: 'N24',
        24: 'M8',
        27: 'N24',
        30: 'M8',
      },
      // n-03: En fazla 3 gün boş
      'n-03': {
        2: 'N24',
        6: 'N24',
        10: 'N24',
        14: 'N24',
        18: 'N24',
        22: 'N24',
        26: 'N24',
        30: 'N24',
      },
    };

    const ev = evaluateSchedule(config, nurses, {}, assignments);
    const longIssues = ev.issues.filter((i) => i.code === 'LONG_EMPTY_STREAK');
    expect(longIssues.some((i) => i.nurseId === 'n-01')).toBe(true);
    expect(longIssues.some((i) => i.nurseId === 'n-02')).toBe(true);
    expect(longIssues.some((i) => i.nurseId === 'n-03')).toBe(false);
    expect(longIssues.some((i) => i.nurseId === 'n-sorumlu')).toBe(false);
    expect(longIssues.every((i) => i.severity === 'hard')).toBe(true);

    const m01 = ev.nurseMetrics.find((m) => m.nurseId === 'n-01');
    const m02 = ev.nurseMetrics.find((m) => m.nurseId === 'n-02');
    const m03 = ev.nurseMetrics.find((m) => m.nurseId === 'n-03');
    expect(m01?.maxEmptyStreak).toBe(4);
    expect(m02?.maxEmptyStreak).toBe(4);
    expect(m03?.maxEmptyStreak).toBe(3);

    // maxConsecutiveEmptyDays: 0 seçilirse kural devre dışı kalmalı
    const unlimitedConfig = { ...config, maxConsecutiveEmptyDays: 0 };
    const evUnlimited = evaluateSchedule(unlimitedConfig, nurses, {}, assignments);
    expect(evUnlimited.issues.filter((i) => i.code === 'LONG_EMPTY_STREAK')).toHaveLength(0);
  });

  it('computes expected overtime targets across equal/proportional/minimal policies and exposes fullMonthHourSpread', () => {
    const targets = [184, 184, 184, 184, 184, 184, 184, 176, 160, 144]; // toplam = 1768
    const totalSlotHours = 1920; // netPool = 152
    const baseStatutory = 184;

    const eq = computeExpectedOvertimeTargets('equal', targets, baseStatutory, totalSlotHours);
    const prop = computeExpectedOvertimeTargets('proportional', targets, baseStatutory, totalSlotHours);
    const min = computeExpectedOvertimeTargets('minimal', targets, baseStatutory, totalSlotHours);

    const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
    expect(sum(eq)).toBeCloseTo(152, 6);
    expect(sum(prop)).toBeCloseTo(152, 6);
    expect(sum(min)).toBeCloseTo(152, 6);

    // 5 gün izinli (index 9): minimal < proportional < equal < tam ay (index 0)
    expect(min[9]).toBeLessThan(prop[9]);
    expect(prop[9]).toBeLessThan(eq[9]);
    expect(eq[9]).toBeLessThan(prop[0]);
    expect(prop[0]).toBeLessThan(min[0]);

    // Eksi saat havuzunda (netPool <= 0) üç politika da düz ortalamaya düşmeli
    const underPool = 1700;
    const eqUnder = computeExpectedOvertimeTargets('equal', targets, baseStatutory, underPool);
    const propUnder = computeExpectedOvertimeTargets('proportional', targets, baseStatutory, underPool);
    const minUnder = computeExpectedOvertimeTargets('minimal', targets, baseStatutory, underPool);
    expect(propUnder).toEqual(eqUnder);
    expect(minUnder).toEqual(eqUnder);

    // evaluateSchedule fullMonthHourSpread hesabı (izinli personel hariç tam ay farkı)
    const config = createDefaultMonthConfig('2026-12');
    const nurses = createDemoNurses();
    const prefs: Record<string, NursePreference> = {
      'n-03': {
        yearMonth: '2026-12',
        nurseId: 'n-03',
        positiveNobetDays: [],
        negativeDays: [],
        softNegativeDays: [],
        leaveDays: { 14: 'YI', 15: 'YI', 16: 'YI', 17: 'YI', 18: 'YI' },
        bridgeLeaveRequests: [],
        notes: '',
        updatedAt: '',
      },
    };
    const assignments: Record<string, Record<number, ShiftCode>> = {};
    for (const n of nurses) {
      if (n.role !== 'nobetli') continue;
      if (n.id === 'n-03') {
        assignments[n.id] = { 1: 'N24', 5: 'N24', 9: 'N24', 12: 'N24', 20: 'N24', 25: 'N24' }; // 144s (ot: 0)
      } else {
        assignments[n.id] = {
          1: 'N24', 5: 'N24', 9: 'N24', 13: 'N24', 17: 'N24', 21: 'N24', 25: 'N24',
          28: 'M8', 29: 'M8', 30: 'M8', 31: 'M8', // 200s (ot: +16)
        };
      }
    }
    const ev = evaluateSchedule(config, nurses, prefs, assignments);
    expect(ev.hourSpread).toBe(16);
    expect(ev.fullMonthHourSpread).toBe(0);
  });
});
