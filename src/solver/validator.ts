import {
  computeBaseStatutoryHours,
  computeNurseTargetHours,
  getDaysInMonth,
  getShiftHours,
  isHolidayOrWeekend,
  isWorkingShift,
} from '../lib/calendar';
import {
  LeaveCode,
  MonthConfig,
  Nurse,
  NurseMetrics,
  NursePreference,
  NurseRole,
  PassiveReason,
  PreflightReport,
  ScheduleEvaluation,
  ShiftCode,
  ValidationIssue,
} from '../types/schedule';

export function resolveEffectiveNurseRole(
  nurse: Nurse,
  config: MonthConfig
): { role: NurseRole; passiveReason?: PassiveReason } {
  const override = config.nurseRoleOverrides?.[nurse.id];
  if (override) {
    return {
      role: override.role,
      passiveReason: override.passiveReason ?? nurse.passiveReason,
    };
  }
  return {
    role: nurse.role,
    passiveReason: nurse.passiveReason,
  };
}

export function resolveEffectiveLeaveDays(
  prefLeaveDays?: Record<number, LeaveCode>,
  nurseAssign?: Record<number, ShiftCode>
): Record<number, LeaveCode> {
  const merged: Record<number, LeaveCode> = { ...(prefLeaveDays ?? {}) };
  if (nurseAssign) {
    for (const [dayKey, code] of Object.entries(nurseAssign)) {
      const d = Number(dayKey);
      if (!Number.isInteger(d) || d <= 0) continue;
      if (code === 'YI' || code === 'R' || code === 'II') {
        merged[d] = code;
      } else if (code === 'DI') {
        // Doğum/süt izni kodu matrise elle işlendiğinde hedef saatten düşümü eşdeğer izin olarak say
        merged[d] = 'II';
      }
    }
  }
  return merged;
}

export function isSorumluPresentOnDay(
  day: number,
  config: MonthConfig,
  nurses: Nurse[],
  preferences: Record<string, NursePreference>,
  assignments?: Record<string, Record<number, ShiftCode>>
): boolean {
  if (isHolidayOrWeekend(day, config.yearMonth, config.holidays)) return false;
  return nurses.some((n) => {
    if (!n.active) return false;
    const { role } = resolveEffectiveNurseRole(n, config);
    if (role !== 'sorumlu') return false;
    if (preferences[n.id]?.leaveDays?.[day]) return false;
    const assigned = assignments?.[n.id]?.[day];
    if (assigned === 'YI' || assigned === 'R' || assigned === 'DI' || assigned === 'II') {
      return false;
    }
    return true;
  });
}

export function getExpectedDailyStaffing(
  day: number,
  config: MonthConfig,
  sorumluPresent = true
): {
  expectedNobet: number;
  expectedMesai: number;
  expectedSorumlu: number;
  isWeekendOrHoliday: boolean;
} {
  const holOrWknd = isHolidayOrWeekend(day, config.yearMonth, config.holidays);
  const expectedNobet = holOrWknd ? config.weekendNobetCount : config.weekdayNobetCount;
  const expectedSorumlu = !holOrWknd && sorumluPresent ? 1 : 0;
  const baseMesai = holOrWknd ? config.weekendMesaiCount : config.weekdayMesaiCount;
  const compensate =
    !holOrWknd && config.compensateSorumluAbsence !== false && !sorumluPresent ? 1 : 0;
  return {
    expectedNobet,
    expectedMesai: baseMesai + compensate,
    expectedSorumlu,
    isWeekendOrHoliday: holOrWknd,
  };
}

export function evaluateSchedule(
  config: MonthConfig,
  nurses: Nurse[],
  preferences: Record<string, NursePreference>,
  assignments: Record<string, Record<number, ShiftCode>>
): ScheduleEvaluation {
  const days = getDaysInMonth(config.yearMonth);
  const issues: ValidationIssue[] = [];
  const dailyCounts: ScheduleEvaluation['dailyCounts'] = {};

  const activeNurses = nurses.filter((n) => n.active).sort((a, b) => a.sortOrder - b.sortOrder);

  // 1. Günlük kadro kapsaması kontrolü
  for (let d = 1; d <= days; d++) {
    const sorumluPresent = isSorumluPresentOnDay(d, config, nurses, preferences, assignments);
    const { expectedNobet, expectedMesai, expectedSorumlu, isWeekendOrHoliday } =
      getExpectedDailyStaffing(d, config, sorumluPresent);
    let nobet = 0;
    let mesai = 0;
    let sorumlu = 0;

    for (const nurse of activeNurses) {
      const code = assignments[nurse.id]?.[d] ?? '';
      if (code === 'N24' || code === 'N16') nobet++;
      else if (code === 'M8') mesai++;
      else if (code === 'S8') sorumlu++;
    }

    dailyCounts[d] = {
      nobet,
      mesai,
      sorumlu,
      daytimeTotal: nobet + mesai + sorumlu,
      expectedNobet,
      expectedMesai,
      expectedSorumlu,
      isWeekendOrHoliday,
    };

    if (nobet !== expectedNobet) {
      issues.push({
        id: `cov-nobet-${d}`,
        severity: 'hard',
        code: 'COVERAGE_MISMATCH',
        day: d,
        message: `${d}. gün nöbetçi sayısı ${nobet} (beklenen: ${expectedNobet}).`,
      });
    }

    const extraMesaiAllowed = !isWeekendOrHoliday && config.autoTopUpUnderHours && mesai === expectedMesai + 1;
    if (mesai < expectedMesai || (mesai > expectedMesai && !extraMesaiAllowed)) {
      issues.push({
        id: `cov-mesai-${d}`,
        severity: 'hard',
        code: 'COVERAGE_MISMATCH',
        day: d,
        message: `${d}. gün mesai sayısı ${mesai} (beklenen: ${expectedMesai}).`,
      });
    }
  }

  // 2. Hemşire bazlı kurallar & metrikler
  const nurseMetrics: NurseMetrics[] = [];

  for (const nurse of activeNurses) {
    const { role } = resolveEffectiveNurseRole(nurse, config);
    const pref = preferences[nurse.id];
    const leaveDays = pref?.leaveDays ?? {};
    const positiveSet = new Set(pref?.positiveNobetDays ?? []);
    const positiveMesaiSet = new Set(pref?.positiveMesaiDays ?? []);
    const negativeSet = new Set(pref?.negativeDays ?? []);
    const softNegSet = new Set(pref?.softNegativeDays ?? []);
    const nurseAssign = assignments[nurse.id] ?? {};
    const tail = config.prevMonthTail?.[nurse.id] ?? ['', '', ''];

    const shiftAt = (d: number): ShiftCode => {
      if (d === -2) return tail[0] ?? '';
      if (d === -1) return tail[1] ?? '';
      if (d === 0) return tail[2] ?? '';
      return nurseAssign[d] ?? '';
    };

    let workedHours = 0;
    let nobetCount = 0;
    let mesaiCount = 0;
    let nobet16Count = 0;
    let weekendHolidayNobet = 0;
    let weekendHolidayMesai = 0;
    let threeDayGapCount = 0;
    let positiveMatched = 0;
    let positiveNobetMatched = 0;
    let positiveMesaiMatched = 0;
    let day3MesaiCount = 0;
    let negativeViolations = 0;
    let softNegativeViolations = 0;
    const violatedNegativeDays: number[] = [];
    const violatedSoftNegativeDays: number[] = [];
    let leaveDaysCount = 0;

    // Ay devri kontrolleri (önceki ayın son 2 günü -> yeni ayın 1. ve 2. günü)
    if (tail[2] === 'N24' || tail[2] === 'N16') {
      const s1 = shiftAt(1);
      if (isWorkingShift(s1)) {
        issues.push({
          id: `rest-d1-tail-${nurse.id}-1`,
          severity: 'hard',
          code: 'REST_D1_VIOLATION',
          nurseId: nurse.id,
          day: 1,
          message: `${nurse.name}: Önceki ayın son günü nöbet tuttuğu için ayın 1'i boş olmalıdır.`,
        });
      }
      if (days >= 2) {
        const s2 = shiftAt(2);
        if (s2 === 'N24' || s2 === 'N16') {
          issues.push({
            id: `rest-d2-tail-${nurse.id}-2`,
            severity: 'hard',
            code: 'REST_D2_N24_VIOLATION',
            nurseId: nurse.id,
            day: 2,
            message: `${nurse.name}: Önceki ayın son günündeki nöbetten sonra 2. gün tekrar nöbet yazılamaz.`,
          });
        } else if (s2 === 'M8') {
          day3MesaiCount++;
          issues.push({
            id: `day3-mesai-tail-${nurse.id}-2`,
            severity: 'warning',
            code: 'DAY3_MESAI_NOTICE',
            nurseId: nurse.id,
            day: 2,
            message: `${nurse.name}: Önceki ayın son günü nöbeti sonrası 3. gün (ayın 2'si) mesai (tercih edilmez).`,
          });
        }
      }
    }

    if (tail[1] === 'N24' || tail[1] === 'N16') {
      const s1 = shiftAt(1);
      if (s1 === 'N24' || s1 === 'N16') {
        issues.push({
          id: `rest-d2-tailm1-${nurse.id}-1`,
          severity: 'hard',
          code: 'REST_D2_N24_VIOLATION',
          nurseId: nurse.id,
          day: 1,
          message: `${nurse.name}: Önceki ayın sondan 2. günü nöbetinden sonra ayın 1'ine nöbet yazılamaz.`,
        });
      } else if (s1 === 'M8') {
        day3MesaiCount++;
        issues.push({
          id: `day3-mesai-tailm1-${nurse.id}-1`,
          severity: 'warning',
          code: 'DAY3_MESAI_NOTICE',
          nurseId: nurse.id,
          day: 1,
          message: `${nurse.name}: Nöbet sonrası 3. gün (ayın 1'i) mesai (tercih edilmez).`,
        });
      }
    }

    for (let d = 1; d <= days; d++) {
      const code = shiftAt(d);
      const holOrWknd = isHolidayOrWeekend(d, config.yearMonth, config.holidays);

      if (code === 'YI' || code === 'R' || code === 'DI' || code === 'II') {
        leaveDaysCount++;
      }

      if (isWorkingShift(code)) {
        workedHours += getShiftHours(code);
        if (code === 'N24') {
          nobetCount++;
          if (holOrWknd) weekendHolidayNobet++;
          if (positiveSet.has(d)) {
            positiveMatched++;
            positiveNobetMatched++;
          }
        } else if (code === 'N16') {
          nobet16Count++;
          if (holOrWknd) weekendHolidayNobet++;
          if (positiveSet.has(d)) {
            positiveMatched++;
            positiveNobetMatched++;
          }
        } else if (code === 'M8' || code === 'S8') {
          mesaiCount++;
          if (holOrWknd) weekendHolidayMesai++;
          if (positiveMesaiSet.has(d)) {
            positiveMatched++;
            positiveMesaiMatched++;
          }
        }

        if ((code === 'N24' || code === 'N16') && positiveMesaiSet.has(d)) {
          issues.push({
            id: `mesai-nobet-conflict-${nurse.id}-${d}`,
            severity: 'warning',
            code: 'MESAI_PREF_NOBET_CONFLICT',
            nurseId: nurse.id,
            day: d,
            message: `${nurse.name}: ${d}. gün sadece 08–16 mesai istemişti (gece nöbete kalamaz), ancak nöbet yazılmış.`,
          });
        }

        if (leaveDays[d]) {
          issues.push({
            id: `leave-conflict-${nurse.id}-${d}`,
            severity: 'hard',
            code: 'LEAVE_CONFLICT',
            nurseId: nurse.id,
            day: d,
            message: `${nurse.name}: ${d}. gün izinli (${leaveDays[d]}) olduğu hâlde vardiya atanmış.`,
          });
        }

        if (negativeSet.has(d)) {
          negativeViolations++;
          violatedNegativeDays.push(d);
          issues.push({
            id: `neg-conflict-${nurse.id}-${d}`,
            severity: 'hard',
            code: 'NEGATIVE_PREF_CONFLICT',
            nurseId: nurse.id,
            day: d,
            message: `${nurse.name}: ${d}. gün kesin çalışamama (kırmızı) tercihi ihlal edildi.`,
          });
        } else if (softNegSet.has(d)) {
          softNegativeViolations++;
          violatedSoftNegativeDays.push(d);
        }
      }

      // Ay içi nöbet sonrası dinlenme kontrolleri
      if (code === 'N24' || code === 'N16') {
        if (d + 1 <= days && isWorkingShift(shiftAt(d + 1))) {
          issues.push({
            id: `rest-d1-${nurse.id}-${d + 1}`,
            severity: 'hard',
            code: 'REST_D1_VIOLATION',
            nurseId: nurse.id,
            day: d + 1,
            message: `${nurse.name}: ${d}. gün nöbeti sonrası ${d + 1}. gün çıkış günüdür, vardiya yazılamaz.`,
          });
        }

        if (d + 2 <= days) {
          const s2 = shiftAt(d + 2);
          if (s2 === 'N24' || s2 === 'N16') {
            issues.push({
              id: `rest-d2-n24-${nurse.id}-${d + 2}`,
              severity: 'hard',
              code: 'REST_D2_N24_VIOLATION',
              nurseId: nurse.id,
              day: d + 2,
              message: `${nurse.name}: ${d}. gün nöbeti sonrası ${d + 2}. güne tekrar nöbet yazılamaz (en az 2 gün boşluk).`,
            });
          } else if (s2 === 'M8') {
            day3MesaiCount++;
            issues.push({
              id: `day3-mesai-${nurse.id}-${d + 2}`,
              severity: 'warning',
              code: 'DAY3_MESAI_NOTICE',
              nurseId: nurse.id,
              day: d + 2,
              message: `${nurse.name}: ${d}. gün nöbeti sonrası 3. gün (${d + 2}. gün) mesai yazılmış.`,
            });
          }
        }

        // 3 günlük tam boşluk (d+1, d+2, d+3 boş '')
        if (d + 3 <= days && shiftAt(d + 1) === '' && shiftAt(d + 2) === '' && shiftAt(d + 3) === '') {
          threeDayGapCount++;
        }
      }
    }

    const unmatchedSet = new Set<number>();
    for (const d of positiveSet) {
      const c = shiftAt(d);
      if (c !== 'N24' && c !== 'N16') unmatchedSet.add(d);
    }
    for (const d of positiveMesaiSet) {
      const c = shiftAt(d);
      if (c !== 'M8' && c !== 'S8') unmatchedSet.add(d);
    }
    const unmatchedPositiveDays = Array.from(unmatchedSet).sort((a, b) => a - b);

    const effectiveLeaveDays = resolveEffectiveLeaveDays(leaveDays, nurseAssign);
    const targetHours =
      role === 'pasif_izinli'
        ? 0
        : computeNurseTargetHours(config.yearMonth, config.holidays, effectiveLeaveDays);

    nurseMetrics.push({
      nurseId: nurse.id,
      name: nurse.name,
      role,
      workedHours,
      targetHours,
      overtimeHours: role === 'pasif_izinli' ? 0 : workedHours - targetHours,
      nobetCount,
      mesaiCount,
      nobet16Count,
      weekendHolidayNobet,
      weekendHolidayMesai,
      threeDayGapCount,
      positiveMatched,
      positiveTotal: positiveSet.size + positiveMesaiSet.size,
      positiveNobetMatched,
      positiveNobetTotal: positiveSet.size,
      positiveMesaiMatched,
      positiveMesaiTotal: positiveMesaiSet.size,
      unmatchedPositiveDays,
      day3MesaiCount,
      negativeViolations,
      negativeTotal: negativeSet.size,
      violatedNegativeDays,
      softNegativeViolations,
      softNegativeTotal: softNegSet.size,
      violatedSoftNegativeDays,
      leaveDaysCount,
    });
  }

  const activeNobetliMetrics = nurseMetrics.filter((m) => m.role === 'nobetli');
  const overtimes = activeNobetliMetrics.map((m) => m.overtimeHours);
  const hourSpread =
    overtimes.length > 0 ? Math.max(...overtimes) - Math.min(...overtimes) : 0;

  const weekendTotals = activeNobetliMetrics.map(
    (m) => m.weekendHolidayNobet + m.weekendHolidayMesai
  );
  const weekendSpread =
    weekendTotals.length > 0 ? Math.max(...weekendTotals) - Math.min(...weekendTotals) : 0;

  const gapCounts = activeNobetliMetrics.map((m) => m.threeDayGapCount);
  const threeDayGapMin = gapCounts.length > 0 ? Math.min(...gapCounts) : 0;
  const threeDayGapMax = gapCounts.length > 0 ? Math.max(...gapCounts) : 0;

  const totalPos = activeNobetliMetrics.reduce((acc, m) => acc + m.positiveTotal, 0);
  const matchedPos = activeNobetliMetrics.reduce((acc, m) => acc + m.positiveMatched, 0);
  const preferenceSatisfactionPct =
    totalPos > 0 ? Math.round((matchedPos / totalPos) * 100) : 100;

  const totalNegativeViolations = activeNobetliMetrics.reduce(
    (acc, m) => acc + m.negativeViolations,
    0
  );
  const totalNegativeRequested = activeNobetliMetrics.reduce(
    (acc, m) => acc + m.negativeTotal,
    0
  );
  const totalSoftNegativeViolations = activeNobetliMetrics.reduce(
    (acc, m) => acc + m.softNegativeViolations,
    0
  );
  const totalSoftNegativeRequested = activeNobetliMetrics.reduce(
    (acc, m) => acc + m.softNegativeTotal,
    0
  );

  // Birlikte / Ayrı nöbet kuralları kontrolü
  const nurseNameMap = new Map(activeNurses.map((n) => [n.id, n.name]));
  for (const rule of config.pairRules ?? []) {
    if (rule.type !== 'separate') continue;
    const nameA = nurseNameMap.get(rule.nurseAId);
    const nameB = nurseNameMap.get(rule.nurseBId);
    if (!nameA || !nameB) continue;
    for (let d = 1; d <= days; d++) {
      const cA = assignments[rule.nurseAId]?.[d];
      const cB = assignments[rule.nurseBId]?.[d];
      if ((cA === 'N24' || cA === 'N16') && (cB === 'N24' || cB === 'N16')) {
        issues.push({
          id: `pair-sep-${rule.id}-${d}`,
          severity: 'warning',
          code: 'PAIR_SEPARATE_CONFLICT',
          nurseId: rule.nurseAId,
          day: d,
          message: `${nameA} ve ${nameB}: ${d}. gün ayrı nöbet kuralına rağmen aynı nöbete yazılmış.`,
        });
      }
    }
  }

  const hardViolations = issues.filter((i) => i.severity === 'hard').length;
  const softWarnings = issues.filter((i) => i.severity === 'warning').length;

  return {
    issues,
    hardViolations,
    softWarnings,
    nurseMetrics,
    hourSpread,
    preferenceSatisfactionPct,
    totalNegativeViolations,
    totalNegativeRequested,
    totalSoftNegativeViolations,
    totalSoftNegativeRequested,
    weekendSpread,
    threeDayGapMin,
    threeDayGapMax,
    dailyCounts,
  };
}

export function runPreflightChecks(
  config: MonthConfig,
  nurses: Nurse[],
  preferences: Record<string, NursePreference>
): PreflightReport {
  const days = getDaysInMonth(config.yearMonth);
  const baseStatutoryHours = computeBaseStatutoryHours(config.yearMonth, config.holidays);

  let activeNobetliCount = 0;
  let sorumluCount = 0;
  let pasifCount = 0;
  let totalTargetHours = 0;
  const activeNobetli: Nurse[] = [];
  const gunduzList: Nurse[] = [];

  for (const n of nurses) {
    if (!n.active) continue;
    const { role } = resolveEffectiveNurseRole(n, config);
    if (role === 'nobetli') {
      activeNobetliCount++;
      activeNobetli.push(n);
      totalTargetHours += computeNurseTargetHours(
        config.yearMonth,
        config.holidays,
        preferences[n.id]?.leaveDays ?? {}
      );
    } else if (role === 'sorumlu') {
      sorumluCount++;
    } else if (role === 'gunduz_mesai') {
      gunduzList.push(n);
    } else {
      pasifCount++;
    }
  }

  let totalRequiredHours = 0;
  const warnings: string[] = [];
  const blockers: string[] = [];

  for (let d = 1; d <= days; d++) {
    const sorumluPresent = isSorumluPresentOnDay(d, config, nurses, preferences);
    const { expectedNobet, expectedMesai } = getExpectedDailyStaffing(d, config, sorumluPresent);
    const holOrWknd = isHolidayOrWeekend(d, config.yearMonth, config.holidays);
    const gunduzPresent = holOrWknd
      ? 0
      : gunduzList.filter((gn) => !preferences[gn.id]?.leaveDays?.[d]).length;
    const rotatingMesaiNeeded = Math.max(0, expectedMesai - gunduzPresent);
    totalRequiredHours += expectedNobet * 24 + rotatingMesaiNeeded * 8;

    const needed = expectedNobet + rotatingMesaiNeeded;
    let available = 0;
    let availableForNobet = 0;
    let posMesaiCount = 0;
    for (const n of activeNobetli) {
      const pref = preferences[n.id];
      const hasLeave = Boolean(pref?.leaveDays?.[d]);
      const hasHardNeg = Boolean(pref?.negativeDays?.includes(d));
      const tail = config.prevMonthTail?.[n.id];
      const tailBlockedDay1 = d === 1 && (tail?.[2] === 'N24' || tail?.[2] === 'N16');
      const tailNobetBlocked =
        (d === 1 && (tail?.[1] === 'N24' || tail?.[1] === 'N16')) ||
        (d === 2 && (tail?.[2] === 'N24' || tail?.[2] === 'N16'));
      if (!hasLeave && !hasHardNeg && !tailBlockedDay1) {
        available++;
        const wantsMesaiOnly = Boolean(pref?.positiveMesaiDays?.includes(d));
        if (wantsMesaiOnly) {
          posMesaiCount++;
        } else if (!tailNobetBlocked) {
          availableForNobet++;
        }
      }
    }
    if (available < needed) {
      blockers.push(
        `${d}. gün için müsait nöbetli hemşire sayısı ${available}, gereken kadro ${needed} (${expectedNobet} nöbet + ${expectedMesai} mesai).`
      );
    } else if (availableForNobet < expectedNobet) {
      warnings.push(
        `${d}. gün için 24s nöbet tutabilecek hemşire sayısı ${availableForNobet}, gereken nöbetçi ${expectedNobet} (bazı hemşireler sadece 08–16 mesai seçmiş).`
      );
    }
    if (posMesaiCount > rotatingMesaiNeeded && posMesaiCount > 0) {
      warnings.push(
        rotatingMesaiNeeded === 0
          ? `${d}. gün ${posMesaiCount} hemşire 08–16 mesai istemiş, ancak o gün ek mesai kadrosu 0 (bu kişiler gece nöbetine yazılmadan boş bırakılır).`
          : `${d}. gün ${posMesaiCount} hemşire 08–16 mesai istemiş, ancak o gün ${rotatingMesaiNeeded} mesai kadrosu var (fazlası gece nöbetine yazılmadan boş bırakılır).`
      );
    }
  }

  // Aynı hafta içinde 2+ hemşire izni kontrolü (7 günlük bloklar)
  if (activeNobetliCount <= 10) {
    for (let start = 1; start <= days; start += 7) {
      const end = Math.min(days, start + 6);
      let nursesOnLeaveThisWeek = 0;
      for (const n of activeNobetli) {
        const leave = preferences[n.id]?.leaveDays ?? {};
        let hasAny = false;
        for (let d = start; d <= end; d++) {
          if (leave[d]) {
            hasAny = true;
            break;
          }
        }
        if (hasAny) nursesOnLeaveThisWeek++;
      }
      if (nursesOnLeaveThisWeek >= 2) {
        warnings.push(
          `${start}–${end}. günler arasında ${nursesOnLeaveThisWeek} hemşire izinli görünüyor. ${activeNobetliCount} kişilik kadroda 3 günlük boşluk veya kırmızı tercihler sıkışabilir.`
        );
      }
    }
  }

  const hourBalanceDiff = totalRequiredHours - totalTargetHours;
  const underHoursPerNurse =
    hourBalanceDiff < 0 && activeNobetliCount > 0
      ? Math.round((-hourBalanceDiff / activeNobetliCount) * 10) / 10
      : 0;
  const suggestedExtraMesaiDays =
    hourBalanceDiff < 0 ? Math.ceil(-hourBalanceDiff / 8) : 0;

  if (hourBalanceDiff < 0) {
    warnings.push(
      `Toplam vardiya ihtiyacı (${totalRequiredHours} s), kadronun zorunlu çalışma hedefinin (${totalTargetHours} s) ${-hourBalanceDiff} saat altında (kişi başı ~${underHoursPerNurse} s eksik). ${
        config.autoTopUpUnderHours
          ? `Otomatik dengeleme açık: hafta içi ${suggestedExtraMesaiDays} güne +1 mesai eklenecek.`
          : `Saat eksiğini kapatmak için "Eksik saatleri hafta içi +1 mesai ile tamamla" seçeneğini açabilirsiniz.`
      }`
    );
  }

  if (activeNobetliCount === 0) {
    blockers.push('Aktif nöbetli hemşire bulunmuyor.');
  }

  return {
    baseStatutoryHours,
    totalTargetHours,
    totalRequiredHours,
    activeNobetliCount,
    sorumluCount,
    pasifCount,
    hourBalanceDiff,
    underHoursPerNurse,
    suggestedExtraMesaiDays,
    warnings,
    blockers,
  };
}
