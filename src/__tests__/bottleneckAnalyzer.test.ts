import { describe, expect, it } from 'vitest';
import { createDefaultMonthConfig, createDemoNurses } from '../lib/demoData';
import { analyzeBottlenecks } from '../solver/bottleneckAnalyzer';
import { evaluateSchedule, runPreflightChecks } from '../solver/validator';
import { NursePreference, ShiftCode } from '../types/schedule';

function mkPref(id: string, patch: Partial<NursePreference> = {}): NursePreference {
  return {
    yearMonth: '2026-12',
    nurseId: id,
    positiveNobetDays: [],
    positiveMesaiDays: [],
    negativeDays: [],
    softNegativeDays: [],
    leaveDays: {},
    bridgeLeaveRequests: [],
    notes: '',
    updatedAt: '2026-12-01',
    ...patch,
  };
}

describe('analyzeBottlenecks intelligent solver advisor', () => {
  it('detects over-subscribed green requests, self-conflicts, long red streak, and capacity squeeze with WhatsApp drafts', () => {
    const config = createDefaultMonthConfig('2026-12');
    const nurses = createDemoNurses().slice(0, 6); // Selma (S) + n-01..n-05 (5 nöbetli)

    const prefs: Record<string, NursePreference> = {
      'n-01': mkPref('n-01', {
        positiveNobetDays: [4, 5], // Hem 4 hem 5 (<= 2 gün çelişkisi) + 5. günde rekabet
        negativeDays: [10, 11, 12, 13], // 4 gün üst üste kırmızı vs maxConsecutiveEmptyDays=3
      }),
      'n-02': mkPref('n-02', {
        positiveNobetDays: [5],
        negativeDays: [20, 21],
      }),
      'n-03': mkPref('n-03', {
        positiveNobetDays: [5], // 5. gün toplam 3 yeşil (kapasite 2)
        negativeDays: [20],
      }),
      'n-04': mkPref('n-04', {
        negativeDays: [20],
      }),
      'n-05': mkPref('n-05', {
        negativeDays: [20], // 20. gün 4 kişi kırmızı -> available=1 < needed=3
      }),
    };

    const preflight = runPreflightChecks(config, nurses, prefs);
    const items = analyzeBottlenecks({
      config,
      nurses,
      preferences: prefs,
      preflight,
      hasSchedule: false,
    });

    const cap20 = items.find((i) => i.id === 'cap-day-20');
    expect(cap20).toBeDefined();
    expect(cap20?.severity).toBe('critical');
    expect(cap20?.whatsappDraft).toContain('20 Aralık');
    expect(cap20?.detail).toContain('Fatma Demir');

    const comp5 = items.find((i) => i.id === 'comp-n24-5');
    expect(comp5).toBeDefined();
    expect(comp5?.severity).toBe('warning');
    expect(comp5?.whatsappDraft).toContain('5 Aralık');

    const selfConflict = items.find((i) => i.id === 'self-green-n-01');
    expect(selfConflict).toBeDefined();

    const negStreak = items.find((i) => i.id === 'self-neg-streak-n-01');
    expect(negStreak).toBeDefined();
    expect(negStreak?.title).toContain('10–13');
  });

  it('surfaces post-solve LONG_EMPTY_STREAK with relax_empty_cap quickAction', () => {
    const config = createDefaultMonthConfig('2026-12');
    const nurses = createDemoNurses().slice(0, 4);
    const assignments: Record<string, Record<number, ShiftCode>> = {
      'n-01': {
        1: 'N24',
        5: 'N24',
        9: 'N24',
        14: 'N24', // 10,11,12,13 -> 4 gün boşluk
        18: 'N24',
        22: 'N24',
        26: 'N24',
        30: 'N24',
      },
    };
    const preflight = runPreflightChecks(config, nurses, {});
    const evaluation = evaluateSchedule(config, nurses, {}, assignments);
    const items = analyzeBottlenecks({
      config,
      nurses,
      preferences: {},
      preflight,
      evaluation,
      hasSchedule: true,
    });

    const longEmpty = items.find((i) => i.id === 'post-long-empty');
    expect(longEmpty).toBeDefined();
    expect(longEmpty?.severity).toBe('critical');
    expect(longEmpty?.quickAction).toBe('relax_empty_cap');
  });
});
