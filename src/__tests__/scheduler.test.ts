import { describe, expect, it } from 'vitest';
import {
  createDefaultMonthConfig,
  createDemoMonthConfig,
  createDemoNurses,
  createDemoPreferences,
} from '../lib/demoData';
import { solveSchedule } from '../solver/scheduler';
import { evaluateSchedule } from '../solver/validator';

describe('nurse schedule constraint solver', () => {
  it('solves 10-nurse Dec 2026 with weekday 5-person rule (2M+1S+2N) and <3s, 0 hard violations, hourSpread <= 16', () => {
    const clean2027 = createDefaultMonthConfig('2027-01');
    expect(clean2027.prevMonthTail).toEqual({});

    const config = createDemoMonthConfig('2026-12');
    const nurses = createDemoNurses();
    const prefs = createDemoPreferences('2026-12');

    const result = solveSchedule({
      config,
      nurses,
      preferences: prefs,
      seed: 202612,
    });

    const ev = evaluateSchedule(config, nurses, prefs, result.assignments);
    expect(result.summary.durationMs).toBeLessThan(3000);
    expect(ev.hardViolations).toBe(0);
    expect(ev.hourSpread).toBeLessThanOrEqual(16);

    // Hafta içi 5 kişi (2 N24 + 2 M8 + 1 S8), hafta sonu 3 kişi (2 N24 + 1 M8)
    for (let d = 1; d <= 31; d++) {
      const dc = ev.dailyCounts[d];
      if (dc.isWeekendOrHoliday) {
        expect(dc.daytimeTotal).toBe(3);
        expect(dc.nobet).toBe(2);
        expect(dc.mesai).toBe(1);
        expect(dc.sorumlu).toBe(0);
      } else {
        expect(dc.daytimeTotal).toBe(5);
        expect(dc.nobet).toBe(2);
        expect(dc.mesai).toBe(2);
        expect(dc.sorumlu).toBe(1);
      }
    }

    // 5 gün köprüleme (n-03): 14..18 Yİ, hedef 144s, 10 Aralık Perşembe N24
    const n03 = ev.nurseMetrics.find((m) => m.nurseId === 'n-03');
    expect(n03?.targetHours).toBe(144);
    for (let d = 14; d <= 18; d++) {
      expect(result.assignments['n-03'][d]).toBe('YI');
    }
    expect(result.assignments['n-03'][10]).toBe('N24');

    // Ay devri: n-06 & n-07 önceki ayın son günü N24 -> ayın 1'i boş ve 2'si N24 değil
    expect(result.assignments['n-06'][1]).toBe('');
    expect(result.assignments['n-06'][2]).not.toBe('N24');
    expect(result.assignments['n-07'][1]).toBe('');
    expect(result.assignments['n-07'][2]).not.toBe('N24');

    // Ay devri: n-04 & n-05 sondan 2. gün N24 -> ayın 1'i N24 değil
    expect(result.assignments['n-04'][1]).not.toBe('N24');
    expect(result.assignments['n-05'][1]).not.toBe('N24');

    // Sorumlu ve pasif hemşire kontrolü
    expect(result.assignments['n-sorumlu'][1]).toBe('S8');
    expect(result.assignments['n-sorumlu'][5]).toBe('');
    expect(result.assignments['n-pasif'][1]).toBe('DI');
    expect(result.assignments['n-pasif'][15]).toBe('DI');
  });

  it('maintains 5 weekday daytime staff (3 M8 + 2 N24) automatically when Sorumlu takes leave Dec 7-11', () => {
    const config = createDemoMonthConfig('2026-12');
    config.compensateSorumluAbsence = true;
    const nurses = createDemoNurses();
    const prefs = {
      ...createDemoPreferences('2026-12'),
      'n-sorumlu': {
        yearMonth: '2026-12',
        nurseId: 'n-sorumlu',
        positiveNobetDays: [],
        negativeDays: [],
        softNegativeDays: [],
        leaveDays: { 7: 'YI', 8: 'YI', 9: 'YI', 10: 'YI', 11: 'YI' } as const,
        bridgeLeaveRequests: [],
        notes: 'Sorumlu 1 hafta izinli',
        updatedAt: '',
      },
    };

    const result = solveSchedule({
      config,
      nurses,
      preferences: prefs,
      seed: 7112026,
    });

    const ev = evaluateSchedule(config, nurses, prefs, result.assignments);
    expect(ev.hardViolations).toBe(0);
    expect(ev.hourSpread).toBeLessThanOrEqual(16);

    for (let d = 7; d <= 11; d++) {
      expect(result.assignments['n-sorumlu'][d]).toBe('YI');
      expect(ev.dailyCounts[d].sorumlu).toBe(0);
      expect(ev.dailyCounts[d].mesai).toBe(3);
      expect(ev.dailyCounts[d].nobet).toBe(2);
      expect(ev.dailyCounts[d].daytimeTotal).toBe(5);
    }
  });

  it('solves 11-nobetli + 1-sorumlu Dec 2026 with autoTopUpUnderHours, 0 hard violations, all workedHours >= targetHours', () => {
    const config = createDemoMonthConfig('2026-12');
    config.autoTopUpUnderHours = true;

    const nurses = [
      ...createDemoNurses(),
      {
        id: 'n-11',
        name: 'Melek Demirtaş',
        branch: 'HEM',
        role: 'nobetli' as const,
        sortOrder: 13,
        active: true,
      },
    ];
    const prefs = createDemoPreferences('2026-12');

    const result = solveSchedule({
      config,
      nurses,
      preferences: prefs,
      seed: 112026,
    });

    const ev = evaluateSchedule(config, nurses, prefs, result.assignments);
    expect(result.summary.durationMs).toBeLessThan(3000);
    expect(ev.hardViolations).toBe(0);
    expect(ev.hourSpread).toBeLessThanOrEqual(16);
    expect(result.summary.extraMesaiDays.length).toBeGreaterThan(0);

    const activeNobetli = ev.nurseMetrics.filter((m) => m.role === 'nobetli');
    expect(activeNobetli).toHaveLength(11);
    for (const m of activeNobetli) {
      expect(m.workedHours).toBeGreaterThanOrEqual(m.targetHours);
    }
  });
});
