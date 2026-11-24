import { describe, expect, it } from 'vitest';
import { createDefaultMonthConfig, createDemoNurses } from '../lib/demoData';
import { evaluateSchedule } from '../solver/validator';
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
        negativeDays: [5],
        softNegativeDays: [],
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
        5: 'M8', // negatif tercih ihlali
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
  });
});
