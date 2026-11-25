import { HolidayEntry, LeaveCode, ShiftCode } from '../types/schedule';

export const TURKISH_MONTHS = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
] as const;

export const TURKISH_WEEKDAYS_SHORT = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'] as const;

export const TURKISH_WEEKDAYS_FULL = [
  'Pazar',
  'Pazartesi',
  'Salı',
  'Çarşamba',
  'Perşembe',
  'Cuma',
  'Cumartesi',
] as const;

export function parseYearMonth(yearMonth: string): { year: number; month: number } {
  const [yStr, mStr] = yearMonth.split('-');
  const year = Number(yStr);
  const month = Number(mStr);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`Geçersiz yıl-ay formatı: ${yearMonth}`);
  }
  return { year, month };
}

export function formatYearMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function getDaysInMonth(yearMonth: string): number {
  const { year, month } = parseYearMonth(yearMonth);
  return new Date(year, month, 0).getDate();
}

/**
 * 0 = Pazar, 1 = Pazartesi ... 6 = Cumartesi
 */
export function getDayOfWeek(yearMonth: string, day: number): number {
  const { year, month } = parseYearMonth(yearMonth);
  return new Date(year, month - 1, day).getDay();
}

export function isWeekend(yearMonth: string, day: number): boolean {
  const dow = getDayOfWeek(yearMonth, day);
  return dow === 0 || dow === 6;
}

export function formatMonthLabelTR(yearMonth: string): string {
  const { year, month } = parseYearMonth(yearMonth);
  return `${TURKISH_MONTHS[month - 1]} ${year}`;
}

export function getTurkishMonthUpper(yearMonth: string): string {
  const { month } = parseYearMonth(yearMonth);
  return TURKISH_MONTHS[month - 1].toLocaleUpperCase('tr-TR');
}

export function getPrevYearMonth(yearMonth: string): string {
  const { year, month } = parseYearMonth(yearMonth);
  return month === 1 ? formatYearMonth(year - 1, 12) : formatYearMonth(year, month - 1);
}

export function getNextYearMonth(yearMonth: string): string {
  const { year, month } = parseYearMonth(yearMonth);
  return month === 12 ? formatYearMonth(year + 1, 1) : formatYearMonth(year, month + 1);
}

export function getSuggestedActiveYearMonth(now: Date = new Date()): string {
  const currentYm = formatYearMonth(now.getFullYear(), now.getMonth() + 1);
  return now.getDate() >= 15 ? getNextYearMonth(currentYm) : currentYm;
}

/**
 * 2026 ve 2027 Türkiye Dini Bayram & Arife tarihleri + her yıl sabit resmî tatiller.
 */
const RELIGIOUS_HOLIDAYS_BY_MONTH: Record<string, Record<number, HolidayEntry>> = {
  // 2026
  '2026-03': {
    19: { name: 'Ramazan Bayramı Arifesi (Yarım Gün)', type: 'arefe' },
    20: { name: 'Ramazan Bayramı 1. Gün', type: 'bayram' },
    21: { name: 'Ramazan Bayramı 2. Gün', type: 'bayram' },
    22: { name: 'Ramazan Bayramı 3. Gün', type: 'bayram' },
  },
  '2026-05': {
    25: { name: 'Kurban Bayramı İdari İzin (Tam Gün)', type: 'idari' },
    26: { name: 'Kurban Bayramı Arifesi & İdari İzin (Tam Gün)', type: 'idari' },
    27: { name: 'Kurban Bayramı 1. Gün', type: 'bayram' },
    28: { name: 'Kurban Bayramı 2. Gün', type: 'bayram' },
    29: { name: 'Kurban Bayramı 3. Gün', type: 'bayram' },
    30: { name: 'Kurban Bayramı 4. Gün', type: 'bayram' },
  },
  // 2027
  '2027-03': {
    8: { name: 'Ramazan Bayramı Arifesi (Yarım Gün)', type: 'arefe' },
    9: { name: 'Ramazan Bayramı 1. Gün', type: 'bayram' },
    10: { name: 'Ramazan Bayramı 2. Gün', type: 'bayram' },
    11: { name: 'Ramazan Bayramı 3. Gün', type: 'bayram' },
  },
  '2027-05': {
    15: { name: 'Kurban Bayramı Arifesi (Yarım Gün)', type: 'arefe' },
    16: { name: 'Kurban Bayramı 1. Gün', type: 'bayram' },
    17: { name: 'Kurban Bayramı 2. Gün', type: 'bayram' },
    18: { name: 'Kurban Bayramı 3. Gün', type: 'bayram' },
    19: { name: 'Kurban Bayramı 4. Gün / 19 Mayıs', type: 'bayram' },
  },
};

export function getDefaultTurkishHolidays(yearMonth: string): Record<number, HolidayEntry> {
  const { month } = parseYearMonth(yearMonth);
  const holidays: Record<number, HolidayEntry> = {};

  if (month === 1) holidays[1] = { name: 'Yılbaşı', type: 'resmi' };
  if (month === 4) holidays[23] = { name: '23 Nisan Ulusal Egemenlik ve Çocuk Bayramı', type: 'resmi' };
  if (month === 5) holidays[1] = { name: '1 Mayıs Emek ve Dayanışma Günü', type: 'resmi' };
  if (month === 5) holidays[19] = { name: "19 Mayıs Atatürk'ü Anma, Gençlik ve Spor Bayramı", type: 'resmi' };
  if (month === 7) holidays[15] = { name: '15 Temmuz Demokrasi ve Millî Birlik Günü', type: 'resmi' };
  if (month === 8) holidays[30] = { name: '30 Ağustos Zafer Bayramı', type: 'resmi' };
  if (month === 10) {
    holidays[28] = { name: 'Cumhuriyet Bayramı Arifesi (Yarım Gün)', type: 'arefe' };
    holidays[29] = { name: '29 Ekim Cumhuriyet Bayramı', type: 'resmi' };
  }

  const religious = RELIGIOUS_HOLIDAYS_BY_MONTH[yearMonth];
  if (religious) {
    for (const [dayStr, entry] of Object.entries(religious)) {
      holidays[Number(dayStr)] = { ...entry };
    }
  }

  return holidays;
}

/**
 * Hafta sonu, tam gün resmî/dini tatil veya idari izin mi?
 * (Arefe günleri yarım gün mesai kabul edildiğinden tam hafta sonu düzenine girmez.)
 */
export function isHolidayOrWeekend(
  day: number,
  yearMonth: string,
  holidays: Record<number, HolidayEntry>
): boolean {
  if (isWeekend(yearMonth, day)) return true;
  const h = holidays[day];
  return Boolean(h && (h.type === 'resmi' || h.type === 'bayram' || h.type === 'idari'));
}

export function getTurkishHolidaysForYear(
  year: number
): Array<{ yearMonth: string; day: number; entry: HolidayEntry }> {
  const result: Array<{ yearMonth: string; day: number; entry: HolidayEntry }> = [];
  for (let m = 1; m <= 12; m++) {
    const ym = formatYearMonth(year, m);
    const monthHolidays = getDefaultTurkishHolidays(ym);
    const days = Object.keys(monthHolidays)
      .map(Number)
      .sort((a, b) => a - b);
    for (const day of days) {
      result.push({ yearMonth: ym, day, entry: monthHolidays[day] });
    }
  }
  return result;
}

/**
 * Bir ayın baz yasal çalışma saati:
 * Hafta içi tam iş günleri = 8 saat, hafta içi arefe günleri = 4 saat,
 * hafta sonu ve tam gün resmî/bayram günleri = 0 saat.
 */
export function computeBaseStatutoryHours(
  yearMonth: string,
  holidays: Record<number, HolidayEntry>
): number {
  const days = getDaysInMonth(yearMonth);
  let total = 0;
  for (let d = 1; d <= days; d++) {
    if (isWeekend(yearMonth, d)) continue;
    const h = holidays[d];
    if (!h) {
      total += 8;
    } else if (h.type === 'arefe') {
      total += 4;
    }
  }
  return total;
}

/**
 * Hemşirenin Yıllık İzin (Yİ), Rapor (R) veya İdari İzin (İİ) günlerini düşerek
 * o ay doldurması gereken hedef çalışma saatini hesaplar.
 */
export function computeNurseTargetHours(
  yearMonth: string,
  holidays: Record<number, HolidayEntry>,
  leaveDays: Record<number, LeaveCode> = {}
): number {
  const base = computeBaseStatutoryHours(yearMonth, holidays);
  const days = getDaysInMonth(yearMonth);
  let deduction = 0;

  for (let d = 1; d <= days; d++) {
    const leave = leaveDays[d];
    if (!leave) continue;
    if (isWeekend(yearMonth, d)) continue;
    const h = holidays[d];
    if (!h) {
      deduction += 8;
    } else if (h.type === 'arefe') {
      deduction += 4;
    }
  }

  return Math.max(0, base - deduction);
}

export function getShiftHours(code: ShiftCode): number {
  switch (code) {
    case 'N24':
      return 24;
    case 'N16':
      return 16;
    case 'M8':
    case 'S8':
      return 8;
    default:
      return 0;
  }
}

export function isWorkingShift(code: ShiftCode): boolean {
  return code === 'N24' || code === 'M8' || code === 'N16' || code === 'S8';
}

export interface BridgeLeavePlan {
  mondayDay: number;
  fridayDay: number;
  leaveDays: number[];
  preThursdayDay: number | null;
  negativeDays: number[];
}

/**
 * 5 iş günü yıllık izin + önceki Perşembe nöbeti ile ~10 günlük kesintisiz blok planı üretir.
 * Örn: Pazartesi (d) .. Cuma (d+4) Yİ -> Perşembe (d-4) öncelikli N24,
 * Cuma çıkış (d-3), Cmt (d-2), Paz (d-1), sonraki Cmt (d+5), Paz (d+6) negatif gün.
 */
export function buildFiveDayBridgeLeave(
  yearMonth: string,
  mondayDay: number,
  includePreThursdayNobet = true
): BridgeLeavePlan {
  const maxDay = getDaysInMonth(yearMonth);
  const dow = getDayOfWeek(yearMonth, mondayDay);
  if (dow !== 1) {
    throw new Error(`Köprüleme başlangıç günü Pazartesi olmalıdır (seçilen gün: ${mondayDay}).`);
  }

  const fridayDay = Math.min(maxDay, mondayDay + 4);
  const leaveDays: number[] = [];
  for (let d = mondayDay; d <= fridayDay; d++) {
    leaveDays.push(d);
  }

  const preThursdayCandidate = mondayDay - 4;
  const preThursdayDay =
    includePreThursdayNobet && preThursdayCandidate >= 1 ? preThursdayCandidate : null;

  const negativeCandidates = [
    mondayDay - 3, // Cuma (Perşembe nöbeti çıkışı)
    mondayDay - 2, // Cumartesi
    mondayDay - 1, // Pazar
    mondayDay + 5, // İzin sonrası Cumartesi
    mondayDay + 6, // İzin sonrası Pazar
  ];

  const negativeDays = negativeCandidates.filter((d) => d >= 1 && d <= maxDay);

  return {
    mondayDay,
    fridayDay,
    leaveDays,
    preThursdayDay,
    negativeDays,
  };
}

export function getMondaysInMonth(yearMonth: string): number[] {
  const days = getDaysInMonth(yearMonth);
  const mondays: number[] = [];
  for (let d = 1; d <= days; d++) {
    if (getDayOfWeek(yearMonth, d) === 1) {
      mondays.push(d);
    }
  }
  return mondays;
}

export function normalizeTurkishText(input: string): string {
  return input
    .trim()
    .toLocaleUpperCase('tr-TR')
    .replace(/\s+/g, ' ');
}

export function toTurkishTitleCase(input: string): string {
  const cleaned = input.trim().replace(/\s+/g, ' ');
  if (!cleaned) return '';
  return cleaned
    .split(' ')
    .map((token) => {
      if (/^\d+[a-zA-ZçğıöşüÇĞİÖŞÜ]+$/.test(token)) {
        return token.toLocaleUpperCase('tr-TR');
      }
      const lower = token.toLocaleLowerCase('tr-TR');
      const match = lower.match(/^([^a-zçğıöşü]*)([a-zçğıöşü])(.*)$/);
      if (!match) return lower;
      return `${match[1]}${match[2].toLocaleUpperCase('tr-TR')}${match[3]}`;
    })
    .join(' ');
}

export function foldTurkishSearch(input: string): string {
  return input
    .trim()
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .toLocaleLowerCase('tr-TR')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/[ıi]/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u')
    .replace(/\s+/g, ' ');
}
