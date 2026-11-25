import { describe, expect, it } from 'vitest';
import { createDefaultMonthConfig, createDemoNurses } from '../lib/demoData';
import {
  buildMissingPrefsWhatsAppText,
  buildNurseIcsContent,
  buildPersonalWhatsAppText,
  buildWardWhatsAppText,
} from '../lib/exportUtils';
import { suggestReplacementsForCell } from '../solver/advisor';
import { NursePreference, ShiftCode } from '../types/schedule';

describe('replacement advisor & personal exporters', () => {
  it('filters out rest/negative/mesai conflicts and ranks valid replacements', () => {
    const config = createDefaultMonthConfig('2026-12');
    const nurses = createDemoNurses().slice(0, 6); // Selma (S) + 5 nöbetli: n-01..n-05
    config.prevMonthTail = {
      'n-04': ['', 'N24', ''],
    };

    const prefs: Record<string, NursePreference> = {
      'n-02': {
        yearMonth: '2026-12',
        nurseId: 'n-02',
        positiveNobetDays: [],
        positiveMesaiDays: [],
        negativeDays: [6],
        softNegativeDays: [],
        leaveDays: {},
        bridgeLeaveRequests: [],
        notes: '',
        updatedAt: '',
      },
      'n-03': {
        yearMonth: '2026-12',
        nurseId: 'n-03',
        positiveNobetDays: [],
        positiveMesaiDays: [6], // Sadece mesai istiyor -> N24 yedeği olamaz
        negativeDays: [],
        softNegativeDays: [],
        leaveDays: {},
        bridgeLeaveRequests: [],
        notes: '',
        updatedAt: '',
      },
      'n-05': {
        yearMonth: '2026-12',
        nurseId: 'n-05',
        positiveNobetDays: [6], // Pozitif istekli ve boşta -> en yüksek öncelik
        positiveMesaiDays: [],
        negativeDays: [],
        softNegativeDays: [],
        leaveDays: {},
        bridgeLeaveRequests: [],
        notes: '',
        updatedAt: '',
      },
    };

    const assignments: Record<string, Record<number, ShiftCode>> = {
      'n-01': { 6: 'N24' }, // Değişecek hedef personel
      'n-02': {}, // 6. gün kırmızı
      'n-03': {}, // 6. gün sadece M8 istiyor
      'n-04': { 5: 'N24' }, // 5'inde nöbetçi -> 6'sında çıkış (bloklu)
      'n-05': {}, // Müsait ve 6'sını istemiş
    };

    const candidates = suggestReplacementsForCell({
      config,
      nurses,
      preferences: prefs,
      assignments,
      targetNurseId: 'n-01',
      day: 6,
      desiredShift: 'N24',
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0].nurseId).toBe('n-05');
    expect(candidates[0].isPreferred).toBe(true);
  });

  it('generates valid ICS events across month-end and readable WhatsApp texts', () => {
    const config = createDefaultMonthConfig('2026-12');
    const nurses = createDemoNurses().slice(0, 3);
    const nurse = nurses[1]; // n-01 Ayşe Kaya
    const nurseAssign: Record<number, ShiftCode> = {
      3: 'M8',
      31: 'N24',
    };

    const ics = buildNurseIcsContent('2026-12', config.clinicName, nurse, nurseAssign);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('BEGIN:VTIMEZONE');
    expect(ics).toContain('TZID:Europe/Istanbul');
    expect(ics).toContain('TZOFFSETTO:+0300');
    expect(ics).toContain('END:VTIMEZONE');
    expect(ics).toContain('DTSTART;TZID=Europe/Istanbul:20261203T080000');
    expect(ics).toContain('DTEND;TZID=Europe/Istanbul:20261203T160000');
    // 31 Aralık 24s nöbet 1 Ocak'ta bitmeli
    expect(ics).toContain('DTSTART;TZID=Europe/Istanbul:20261231T080000');
    expect(ics).toContain('DTEND;TZID=Europe/Istanbul:20270101T080000');
    expect(ics).toContain('END:VCALENDAR');

    const personalMsg = buildPersonalWhatsAppText('2026-12', config.clinicName, nurse, nurseAssign, 184);
    expect(personalMsg).toContain('Ayşe Kaya');
    expect(personalMsg).toContain('3 Aralık');
    expect(personalMsg).toContain('31 Aralık');

    const wardMsg = buildWardWhatsAppText('2026-12', config, nurses, {
      'n-sorumlu': { 1: 'S8' },
      'n-01': nurseAssign,
    });
    expect(wardMsg).toContain('NEFROLOJİ KLİNİĞİ');
    expect(wardMsg).toContain('1 Aralık');

    const reminder = buildMissingPrefsWhatsAppText('2026-12', [nurse], '25 Kasım');
    expect(reminder).toContain('Ayşe Kaya');
    expect(reminder).toContain('25 Kasım');
  });
});
