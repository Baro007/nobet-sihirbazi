import { describe, expect, it } from 'vitest';
import {
  buildFiveDayBridgeLeave,
  computeBaseStatutoryHours,
  computeNurseTargetHours,
  foldTurkishSearch,
  getDaysInMonth,
  getDefaultTurkishHolidays,
  getSuggestedActiveYearMonth,
  getTurkishHolidaysForYear,
  isHolidayOrWeekend,
  toTurkishTitleCase,
} from '../lib/calendar';

describe('calendar & Turkish holidays', () => {
  it('computes statutory hours for December 2026 (23 weekdays = 184h)', () => {
    const holidays = getDefaultTurkishHolidays('2026-12');
    expect(getDaysInMonth('2026-12')).toBe(31);
    expect(Object.keys(holidays)).toHaveLength(0);
    expect(computeBaseStatutoryHours('2026-12', holidays)).toBe(184);
    expect(isHolidayOrWeekend(5, '2026-12', holidays)).toBe(true); // Saturday
    expect(isHolidayOrWeekend(4, '2026-12', holidays)).toBe(false); // Friday
  });

  it('computes statutory hours for January 2027 including Jan 1 Yılbaşı (160h)', () => {
    const holidays = getDefaultTurkishHolidays('2027-01');
    expect(holidays[1]?.name).toBe('Yılbaşı');
    expect(isHolidayOrWeekend(1, '2027-01', holidays)).toBe(true);
    expect(computeBaseStatutoryHours('2027-01', holidays)).toBe(160);
  });

  it('computes statutory hours for February 2027 (20 weekdays = 160h)', () => {
    const holidays = getDefaultTurkishHolidays('2027-02');
    expect(getDaysInMonth('2027-02')).toBe(28);
    expect(computeBaseStatutoryHours('2027-02', holidays)).toBe(160);
  });

  it('computes statutory hours for March 2027 including Ramazan Bayramı + Arefe half-day (156h)', () => {
    const holidays = getDefaultTurkishHolidays('2027-03');
    expect(holidays[8]?.type).toBe('arefe');
    expect(holidays[9]?.type).toBe('bayram');
    expect(holidays[10]?.type).toBe('bayram');
    expect(holidays[11]?.type).toBe('bayram');
    // 23 weekdays total: 3 full bayram days (0h), 1 arefe (4h), 19 full days (152h) => 156h
    expect(computeBaseStatutoryHours('2027-03', holidays)).toBe(156);
  });

  it('reduces nurse target hours by 40h for 5-day weekday annual leave', () => {
    const holidays = getDefaultTurkishHolidays('2026-12');
    const target = computeNurseTargetHours('2026-12', holidays, {
      14: 'YI',
      15: 'YI',
      16: 'YI',
      17: 'YI',
      18: 'YI',
    });
    expect(target).toBe(144);
  });

  it('builds a 10-day continuous bridge leave plan around Mon-Fri annual leave', () => {
    const plan = buildFiveDayBridgeLeave('2026-12', 14, true);
    expect(plan.leaveDays).toEqual([14, 15, 16, 17, 18]);
    expect(plan.preThursdayDay).toBe(10);
    expect(plan.negativeDays).toEqual([11, 12, 13, 19, 20]);
  });

  it('folds Turkish diacritics and dotted/dotless I consistently for name search', () => {
    expect(foldTurkishSearch('  Ayşe Kaya ')).toBe('ayse kaya');
    expect(foldTurkishSearch('AYŞE KAYA')).toBe('ayse kaya');
    expect(foldTurkishSearch('Şahin Işık İrem')).toBe('sahin isik irem');
    expect(foldTurkishSearch('Özgür Çelik')).toBe('ozgur celik');
  });

  it('includes all 2026 official holidays and May 25-26 idari izinler (May 2026 = 112h statutory)', () => {
    const all2026 = getTurkishHolidaysForYear(2026);
    expect(all2026.some((h) => h.yearMonth === '2026-01' && h.day === 1)).toBe(true);
    expect(all2026.some((h) => h.yearMonth === '2026-03' && h.day === 20 && h.entry.type === 'bayram')).toBe(true);
    expect(all2026.some((h) => h.yearMonth === '2026-04' && h.day === 23)).toBe(true);
    expect(all2026.some((h) => h.yearMonth === '2026-05' && h.day === 25 && h.entry.type === 'idari')).toBe(true);
    expect(all2026.some((h) => h.yearMonth === '2026-05' && h.day === 26 && h.entry.type === 'idari')).toBe(true);
    expect(all2026.some((h) => h.yearMonth === '2026-07' && h.day === 15)).toBe(true);
    expect(all2026.some((h) => h.yearMonth === '2026-08' && h.day === 30)).toBe(true);
    expect(all2026.some((h) => h.yearMonth === '2026-10' && h.day === 29)).toBe(true);

    const may2026 = getDefaultTurkishHolidays('2026-05');
    // Mayıs 2026'da 21 hafta içi günü var; 1 Mayıs + 19 Mayıs + 25-29 Mayıs (7 hafta içi tatil/idari) -> 14 * 8 = 112s
    expect(isHolidayOrWeekend(25, '2026-05', may2026)).toBe(true);
    expect(isHolidayOrWeekend(26, '2026-05', may2026)).toBe(true);
    expect(computeBaseStatutoryHours('2026-05', may2026)).toBe(112);
  });

  it('includes all 16 official 2027 Turkish holidays and calculates May 2027 statutory hours (144h)', () => {
    const all2027 = getTurkishHolidaysForYear(2027);
    expect(all2027).toHaveLength(16);
    expect(all2027.some((h) => h.yearMonth === '2027-01' && h.day === 1)).toBe(true);
    expect(all2027.some((h) => h.yearMonth === '2027-03' && h.day === 8 && h.entry.type === 'arefe')).toBe(true);
    expect(all2027.some((h) => h.yearMonth === '2027-03' && h.day === 11 && h.entry.type === 'bayram')).toBe(true);
    expect(all2027.some((h) => h.yearMonth === '2027-04' && h.day === 23)).toBe(true);
    expect(all2027.some((h) => h.yearMonth === '2027-05' && h.day === 1)).toBe(true);
    expect(all2027.some((h) => h.yearMonth === '2027-05' && h.day === 15 && h.entry.type === 'arefe')).toBe(true);
    expect(all2027.some((h) => h.yearMonth === '2027-05' && h.day === 19 && h.entry.type === 'bayram')).toBe(true);
    expect(all2027.some((h) => h.yearMonth === '2027-07' && h.day === 15)).toBe(true);
    expect(all2027.some((h) => h.yearMonth === '2027-08' && h.day === 30)).toBe(true);
    expect(all2027.some((h) => h.yearMonth === '2027-10' && h.day === 28 && h.entry.type === 'arefe')).toBe(true);
    expect(all2027.some((h) => h.yearMonth === '2027-10' && h.day === 29)).toBe(true);

    const may2027 = getDefaultTurkishHolidays('2027-05');
    // Mayıs 2027: 21 hafta içi günü (1 ve 15-16 Mayıs Cmt/Paz; 17-19 Mayıs Pzt-Çar bayram -> 18 iş günü * 8 = 144s)
    expect(computeBaseStatutoryHours('2027-05', may2027)).toBe(144);
  });

  it('normalizes Turkish names with toTurkishTitleCase including i/I/4B tokens', () => {
    expect(toTurkishTitleCase('  büşra   oğuz  ')).toBe('Büşra Oğuz');
    expect(toTurkishTitleCase('ilknur şahin 4b')).toBe('İlknur Şahin 4B');
    expect(toTurkishTitleCase('ılgaz akça (takviye)')).toBe('Ilgaz Akça (Takviye)');
  });

  it('suggests next month after day 15 and current month before day 15', () => {
    expect(getSuggestedActiveYearMonth(new Date(2026, 10, 10))).toBe('2026-11');
    expect(getSuggestedActiveYearMonth(new Date(2026, 10, 24))).toBe('2026-12');
    expect(getSuggestedActiveYearMonth(new Date(2026, 11, 20))).toBe('2027-01');
  });
});
