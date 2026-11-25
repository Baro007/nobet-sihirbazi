import {
  formatMonthLabelTR,
  getDayOfWeek,
  getDaysInMonth,
  getShiftHours,
  isWorkingShift,
  parseYearMonth,
  TURKISH_MONTHS,
  TURKISH_WEEKDAYS_SHORT,
} from './calendar';
import { SHIFT_META } from './shifts';
import { MonthConfig, Nurse, ShiftCode } from '../types/schedule';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatIcsLocalDateTime(d: Date, hour: number, minute = 0): string {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}T${pad2(hour)}${pad2(minute)}00`;
}

function escapeIcsText(input: string): string {
  return input
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

export function buildNurseIcsContent(
  yearMonth: string,
  clinicName: string,
  nurse: Nurse,
  nurseAssignments: Record<number, ShiftCode>
): string {
  const { year, month } = parseYearMonth(yearMonth);
  const days = getDaysInMonth(yearMonth);
  const nowStamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//HemsireNobet//YH.FR.31//TR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(`${clinicName} Nöbetleri — ${nurse.name}`)}`,
    'X-WR-TIMEZONE:Europe/Istanbul',
    'BEGIN:VTIMEZONE',
    'TZID:Europe/Istanbul',
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    'TZOFFSETFROM:+0300',
    'TZOFFSETTO:+0300',
    'TZNAME:TRT',
    'END:STANDARD',
    'END:VTIMEZONE',
  ];

  for (let d = 1; d <= days; d++) {
    const code = nurseAssignments[d] ?? '';
    if (!isWorkingShift(code)) continue;

    const startDate = new Date(year, month - 1, d);
    let endDate = new Date(year, month - 1, d);
    let startHour = 8;
    const endHour = code === 'M8' || code === 'S8' ? 16 : 8;

    if (code === 'N24') {
      endDate = new Date(year, month - 1, d + 1);
      startHour = 8;
    } else if (code === 'N16') {
      endDate = new Date(year, month - 1, d + 1);
      startHour = 16;
    }

    const meta = SHIFT_META[code];
    const uid = `hemsire-${yearMonth}-${nurse.id}-d${d}-${code}@nobet.netlify.app`;

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${nowStamp}`);
    lines.push(`DTSTART;TZID=Europe/Istanbul:${formatIcsLocalDateTime(startDate, startHour)}`);
    lines.push(`DTEND;TZID=Europe/Istanbul:${formatIcsLocalDateTime(endDate, endHour)}`);
    lines.push(`SUMMARY:${escapeIcsText(`${clinicName} — ${meta.labelTR}`)}`);
    lines.push(`DESCRIPTION:${escapeIcsText(`${nurse.name} (${formatMonthLabelTR(yearMonth)})`)}`);
    lines.push('BEGIN:VALARM');
    lines.push('ACTION:DISPLAY');
    lines.push(`DESCRIPTION:${escapeIcsText(`Yarın ${meta.labelTR}`)}`);
    lines.push('TRIGGER:-PT12H');
    lines.push('END:VALARM');
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function downloadNurseIcs(
  yearMonth: string,
  clinicName: string,
  nurse: Nurse,
  nurseAssignments: Record<number, ShiftCode>
): void {
  const content = buildNurseIcsContent(yearMonth, clinicName, nurse, nurseAssignments);
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const safeName = nurse.name
    .toLocaleLowerCase('tr-TR')
    .replace(/[^a-z0-9çğıöşü]+/gi, '-')
    .replace(/^-|-$/g, '');
  const a = document.createElement('a');
  a.href = url;
  a.download = `nobetlerim_${safeName || 'personel'}_${yearMonth}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function buildPersonalWhatsAppText(
  yearMonth: string,
  clinicName: string,
  nurse: Nurse,
  nurseAssignments: Record<number, ShiftCode>,
  targetHours: number
): string {
  const days = getDaysInMonth(yearMonth);
  const { month } = parseYearMonth(yearMonth);
  const monthName = TURKISH_MONTHS[month - 1];
  const entries: string[] = [];
  let worked = 0;

  for (let d = 1; d <= days; d++) {
    const code = nurseAssignments[d] ?? '';
    if (!code) continue;
    worked += getShiftHours(code);
    if (!isWorkingShift(code) && code !== 'YI' && code !== 'R' && code !== 'II' && code !== 'DI') {
      continue;
    }
    const dow = TURKISH_WEEKDAYS_SHORT[getDayOfWeek(yearMonth, d)];
    const tag =
      code === 'N24'
        ? '24s Nöbet'
        : code === 'M8'
        ? '08-16 Mesai'
        : code === 'S8'
        ? '08-16 Sorumlu'
        : code === 'N16'
        ? '16s Nöbet'
        : SHIFT_META[code].shortLabel;
    entries.push(`• ${d} ${monthName} (${dow}): *${tag}*`);
  }

  return [
    `📅 *${clinicName} — ${formatMonthLabelTR(yearMonth)}*`,
    `👤 *${nurse.name}* (${worked} s / hedef ${targetHours} s)`,
    entries.length > 0 ? entries.join('\n') : '• Kayıtlı vardiya bulunmuyor.',
  ].join('\n');
}

export function buildWardWhatsAppText(
  yearMonth: string,
  config: MonthConfig,
  nurses: Nurse[],
  assignments: Record<string, Record<number, ShiftCode>>
): string {
  const days = getDaysInMonth(yearMonth);
  const { month } = parseYearMonth(yearMonth);
  const monthName = TURKISH_MONTHS[month - 1];
  const active = nurses.filter((n) => n.active).sort((a, b) => a.sortOrder - b.sortOrder);

  const lines: string[] = [
    `📋 *${config.clinicName} — ${formatMonthLabelTR(yearMonth)} Nöbet & Mesai Listesi*`,
  ];

  for (let d = 1; d <= days; d++) {
    const dow = TURKISH_WEEKDAYS_SHORT[getDayOfWeek(yearMonth, d)];
    const nobetNames: string[] = [];
    const mesaiNames: string[] = [];
    const sorumluNames: string[] = [];

    for (const n of active) {
      const code = assignments[n.id]?.[d] ?? '';
      if (code === 'N24' || code === 'N16') nobetNames.push(n.name);
      else if (code === 'M8') mesaiNames.push(n.name);
      else if (code === 'S8') sorumluNames.push(n.name);
    }

    const parts: string[] = [];
    if (nobetNames.length > 0) parts.push(`Nöbet: ${nobetNames.join(', ')}`);
    if (mesaiNames.length > 0) parts.push(`Mesai: ${mesaiNames.join(', ')}`);
    if (sorumluNames.length > 0) parts.push(`Sorumlu: ${sorumluNames.join(', ')}`);
    lines.push(`${d} ${monthName} (${dow}) — ${parts.join(' | ') || '—'}`);
  }

  return lines.join('\n');
}

export function buildMissingPrefsWhatsAppText(
  yearMonth: string,
  missingNurses: Nurse[],
  deadline?: string
): string {
  const label = formatMonthLabelTR(yearMonth);
  const names = missingNurses.map((n) => `• ${n.name}`).join('\n');
  const deadlineNote = deadline?.trim() ? `\n⏰ Son tarih: *${deadline.trim()}*` : '';
  return [
    `Merhaba arkadaşlar, *${label}* ayı nöbet tercihlerini henüz girmeyen arkadaşlarımız:`,
    names || '• Eksik kalan yok',
    `${deadlineNote ? `${deadlineNote}\n` : ''}🔗 https://nobet.netlify.app üzerinden kısa sürede kaydedebilirsiniz 🙏`,
  ].join('\n');
}
