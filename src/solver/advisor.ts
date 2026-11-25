import { getDaysInMonth, isHolidayOrWeekend, isWorkingShift } from '../lib/calendar';
import { MonthConfig, Nurse, NursePreference, ShiftCode } from '../types/schedule';
import { evaluateSchedule, resolveEffectiveNurseRole } from './validator';

export interface ReplacementSuggestionParams {
  config: MonthConfig;
  nurses: Nurse[];
  preferences: Record<string, NursePreference>;
  assignments: Record<string, Record<number, ShiftCode>>;
  targetNurseId: string;
  day: number;
  desiredShift?: 'N24' | 'M8';
}

export interface ReplacementCandidate {
  nurseId: string;
  nurseName: string;
  overtimeHours: number;
  weekendCount: number;
  isDay3Mesai: boolean;
  isSoftNeg: boolean;
  isPreferred: boolean;
  pairConflict: boolean;
  score: number;
  reasons: string[];
}

function isNobetShift(code: ShiftCode): boolean {
  return code === 'N24' || code === 'N16';
}

export function suggestReplacementsForCell({
  config,
  nurses,
  preferences,
  assignments,
  targetNurseId,
  day,
  desiredShift = 'N24',
}: ReplacementSuggestionParams): ReplacementCandidate[] {
  const days = getDaysInMonth(config.yearMonth);
  if (day < 1 || day > days) return [];

  const ev = evaluateSchedule(config, nurses, preferences, assignments);
  const metricsByNurseId = new Map(ev.nurseMetrics.map((m) => [m.nurseId, m]));
  const holOrWknd = isHolidayOrWeekend(day, config.yearMonth, config.holidays);

  const separatePartnerMap = new Map<string, string[]>();
  for (const rule of config.pairRules ?? []) {
    if (rule.type !== 'separate') continue;
    const listA = separatePartnerMap.get(rule.nurseAId) ?? [];
    listA.push(rule.nurseBId);
    separatePartnerMap.set(rule.nurseAId, listA);

    const listB = separatePartnerMap.get(rule.nurseBId) ?? [];
    listB.push(rule.nurseAId);
    separatePartnerMap.set(rule.nurseBId, listB);
  }

  const candidates: ReplacementCandidate[] = [];

  for (const nurse of nurses) {
    if (!nurse.active || nurse.id === targetNurseId) continue;
    const { role } = resolveEffectiveNurseRole(nurse, config);
    if (role !== 'nobetli') continue;

    const pref = preferences[nurse.id];
    const nurseAssign = assignments[nurse.id] ?? {};
    const tail = config.prevMonthTail?.[nurse.id] ?? ['', '', ''];

    const codeAt = (d: number): ShiftCode => {
      if (d === -2) return tail[0] ?? '';
      if (d === -1) return tail[1] ?? '';
      if (d === 0) return tail[2] ?? '';
      return nurseAssign[d] ?? '';
    };

    // Sert uygunluk filtreleri
    if (isWorkingShift(codeAt(day))) continue;
    if (pref?.leaveDays?.[day]) continue;
    if (pref?.negativeDays?.includes(day)) continue;
    if (isNobetShift(codeAt(day - 1))) continue;

    if (desiredShift === 'N24') {
      if (day + 1 <= days && isWorkingShift(codeAt(day + 1))) continue;
      if (isNobetShift(codeAt(day - 2))) continue;
      if (day + 2 <= days && isNobetShift(codeAt(day + 2))) continue;
      if (pref?.positiveMesaiDays?.includes(day)) continue;
    }

    const m = metricsByNurseId.get(nurse.id);
    const overtimeHours = m?.overtimeHours ?? 0;
    const weekendCount = (m?.weekendHolidayNobet ?? 0) + (m?.weekendHolidayMesai ?? 0);
    const isDay3Mesai = desiredShift === 'M8' && isNobetShift(codeAt(day - 2));
    const isSoftNeg = Boolean(pref?.softNegativeDays?.includes(day));
    const isPreferred =
      desiredShift === 'N24'
        ? Boolean(pref?.positiveNobetDays?.includes(day))
        : Boolean(pref?.positiveMesaiDays?.includes(day));

    const separatePartners = separatePartnerMap.get(nurse.id) ?? [];
    const pairConflict =
      desiredShift === 'N24' &&
      separatePartners.some((pid) => isNobetShift(assignments[pid]?.[day] ?? ''));

    const score =
      overtimeHours * 2 +
      (holOrWknd ? weekendCount * 6 : 0) +
      (isDay3Mesai ? 35 : 0) +
      (isSoftNeg ? 18 : 0) +
      (pairConflict ? 50 : 0) -
      (isPreferred ? 20 : 0);

    const reasons: string[] = [];
    reasons.push(
      overtimeHours <= 0
        ? `Saat yükü uygun (${overtimeHours} s)`
        : `Fazla mesai: +${overtimeHours} s`
    );
    if (holOrWknd) {
      reasons.push(`Hafta sonu/tatil yükü: ${weekendCount}`);
    }
    if (isPreferred) {
      reasons.push(
        desiredShift === 'N24' ? 'Bu gün nöbet istemişti' : 'Bu gün 08–16 mesai istemişti'
      );
    }
    if (isDay3Mesai) reasons.push('Dikkat: Nöbet sonrası 3. gün mesaisi');
    if (isSoftNeg) reasons.push('Not: Sarı (mümkünse boş) gün');
    if (pairConflict) reasons.push('Uyarı: Ayrı nöbet eşleşmesiyle aynı gün');

    candidates.push({
      nurseId: nurse.id,
      nurseName: nurse.name,
      overtimeHours,
      weekendCount,
      isDay3Mesai,
      isSoftNeg,
      isPreferred,
      pairConflict,
      score,
      reasons,
    });
  }

  candidates.sort((a, b) => a.score - b.score || a.overtimeHours - b.overtimeHours);
  return candidates.slice(0, 5);
}
