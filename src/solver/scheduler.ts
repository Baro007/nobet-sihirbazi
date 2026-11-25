import {
  computeBaseStatutoryHours,
  computeNurseTargetHours,
  getDaysInMonth,
  isHolidayOrWeekend,
} from '../lib/calendar';
import {
  MonthConfig,
  Nurse,
  NursePreference,
  PrevMonthFairnessCarryOver,
  ShiftCode,
  SolverSummary,
} from '../types/schedule';
import {
  computeExpectedOvertimeTargets,
  computeInitialEmptyStreak,
  evaluateSchedule,
  getExpectedDailyStaffing,
  isSorumluPresentOnDay,
  resolveEffectiveLeaveDays,
  resolveEffectiveNurseRole,
} from './validator';

export interface SolverInput {
  config: MonthConfig;
  nurses: Nurse[];
  preferences: Record<string, NursePreference>;
  prevMonthFairness?: PrevMonthFairnessCarryOver;
  lockedAssignments?: Record<string, Record<number, ShiftCode>>;
  seed?: number;
  restarts?: number;
  iterationsPerRestart?: number;
}

export interface SolverResult {
  assignments: Record<string, Record<number, ShiftCode>>;
  summary: SolverSummary;
}

// Grid cell encoding
const CELL_EMPTY = 0;
const CELL_N24 = 1;
const CELL_M8 = 2;
const CELL_LOCKED_LEAVE = 3;

function createRng(seed: number): () => number {
  let state = seed >>> 0 || 123456789;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function selectExtraMesaiDays(
  config: MonthConfig,
  activeNobetli: Nurse[],
  preferences: Record<string, NursePreference>,
  days: number,
  extraNeeded: number
): number[] {
  if (extraNeeded <= 0) return [];

  const weekdayCandidates: { day: number; avail: number; posMesaiCount: number }[] = [];
  for (let d = 1; d <= days; d++) {
    if (isHolidayOrWeekend(d, config.yearMonth, config.holidays)) continue;
    let avail = 0;
    let posMesaiCount = 0;
    for (const n of activeNobetli) {
      const pref = preferences[n.id];
      const hasLeave = Boolean(pref?.leaveDays?.[d]);
      const hasNeg = Boolean(pref?.negativeDays?.includes(d));
      const tail = config.prevMonthTail?.[n.id];
      const blockedDay1 = d === 1 && (tail?.[2] === 'N24' || tail?.[2] === 'N16');
      if (!hasLeave && !hasNeg && !blockedDay1) {
        avail++;
        if (pref?.positiveMesaiDays?.includes(d)) posMesaiCount++;
      }
    }
    weekdayCandidates.push({ day: d, avail, posMesaiCount });
  }

  if (weekdayCandidates.length === 0) return [];

  // En yüksek müsaitliğe ve mesai talebine sahip hafta içi günlerini seç ve ay geneline yay
  const count = Math.min(extraNeeded, weekdayCandidates.length);
  weekdayCandidates.sort(
    (a, b) => b.posMesaiCount * 2 + b.avail - (a.posMesaiCount * 2 + a.avail) || a.day - b.day
  );

  // Eğer ihtiyaç tüm hafta içinden azsa eşit aralıklı seçmeye çalışırken düşük müsaitlikli günleri ele
  const poolSize = Math.min(weekdayCandidates.length, Math.max(count, Math.ceil(count * 1.4)));
  const topPool = weekdayCandidates.slice(0, poolSize).sort((a, b) => a.day - b.day);

  const selected: number[] = [];
  if (count === topPool.length) {
    return topPool.map((x) => x.day);
  }

  const step = topPool.length / count;
  const used = new Set<number>();
  for (let i = 0; i < count; i++) {
    const idx = Math.min(topPool.length - 1, Math.floor(i * step));
    if (!used.has(idx)) {
      used.add(idx);
      selected.push(topPool[idx].day);
    }
  }
  for (let i = 0; i < topPool.length && selected.length < count; i++) {
    if (!used.has(i)) {
      used.add(i);
      selected.push(topPool[i].day);
    }
  }

  return selected.sort((a, b) => a - b);
}

export function solveSchedule(
  input: SolverInput,
  onProgress?: (pct: number) => void
): SolverResult {
  const startMs = Date.now();
  const { config, nurses, preferences, prevMonthFairness } = input;
  const days = getDaysInMonth(config.yearMonth);
  const seed = input.seed ?? Math.floor(Date.now() % 1_000_000_000);
  const rng = createRng(seed);

  const activeNurses = nurses.filter((n) => n.active).sort((a, b) => a.sortOrder - b.sortOrder);
  const activeNobetli: Nurse[] = [];
  const sorumluList: Nurse[] = [];
  const gunduzList: Nurse[] = [];
  const pasifList: { nurse: Nurse; reason: ShiftCode }[] = [];

  for (const n of activeNurses) {
    const { role, passiveReason } = resolveEffectiveNurseRole(n, config);
    if (role === 'nobetli') {
      activeNobetli.push(n);
    } else if (role === 'sorumlu') {
      sorumluList.push(n);
    } else if (role === 'gunduz_mesai') {
      gunduzList.push(n);
    } else {
      const code: ShiftCode =
        passiveReason === 'R' || passiveReason === 'YI' || passiveReason === 'II'
          ? passiveReason
          : 'DI';
      pasifList.push({ nurse: n, reason: code });
    }
  }

  const baseAssignments: Record<string, Record<number, ShiftCode>> = {};

  // Sorumlu, gündüzcü (gece muaf) ve pasif izinli hemşirelerin sabit atamaları
  for (const n of sorumluList) {
    const row: Record<number, ShiftCode> = {};
    const leave = preferences[n.id]?.leaveDays ?? {};
    for (let d = 1; d <= days; d++) {
      if (leave[d]) {
        row[d] = leave[d];
      } else if (!isHolidayOrWeekend(d, config.yearMonth, config.holidays)) {
        row[d] = 'S8';
      } else {
        row[d] = '';
      }
    }
    baseAssignments[n.id] = row;
  }

  const gunduzPresentByDay = new Int32Array(days);
  for (const n of gunduzList) {
    const row: Record<number, ShiftCode> = {};
    const leave = preferences[n.id]?.leaveDays ?? {};
    for (let d = 1; d <= days; d++) {
      if (leave[d]) {
        row[d] = leave[d];
      } else if (!isHolidayOrWeekend(d, config.yearMonth, config.holidays)) {
        row[d] = 'M8';
        gunduzPresentByDay[d - 1]++;
      } else {
        row[d] = '';
      }
    }
    baseAssignments[n.id] = row;
  }

  for (const { nurse, reason } of pasifList) {
    const row: Record<number, ShiftCode> = {};
    const leave = preferences[nurse.id]?.leaveDays ?? {};
    for (let d = 1; d <= days; d++) {
      row[d] = leave[d] ?? reason;
    }
    baseAssignments[nurse.id] = row;
  }

  const N = activeNobetli.length;
  if (N === 0) {
    const ev = evaluateSchedule(config, nurses, preferences, baseAssignments);
    return {
      assignments: baseAssignments,
      summary: {
        durationMs: Date.now() - startMs,
        hardViolations: ev.hardViolations,
        softWarnings: ev.softWarnings,
        hourSpread: ev.hourSpread,
        preferenceSatisfactionPct: ev.preferenceSatisfactionPct,
        threeDayGapMin: ev.threeDayGapMin,
        threeDayGapMax: ev.threeDayGapMax,
        extraMesaiDays: [],
        seed,
      },
    };
  }

  // Günlük ihtiyaçlar ve eksik saat tamamlama (+1 hafta içi mesai)
  const dailyN24 = new Int32Array(days);
  const dailyM8 = new Int32Array(days);
  const isHolOrWknd = new Uint8Array(days);

  let totalRequiredHours = 0;
  for (let d = 1; d <= days; d++) {
    const sorumluPresent = isSorumluPresentOnDay(d, config, nurses, preferences);
    const { expectedNobet, expectedMesai, isWeekendOrHoliday } = getExpectedDailyStaffing(
      d,
      config,
      sorumluPresent
    );
    const dailyMesaiFromRot = Math.max(0, expectedMesai - gunduzPresentByDay[d - 1]);
    dailyN24[d - 1] = expectedNobet;
    dailyM8[d - 1] = dailyMesaiFromRot;
    isHolOrWknd[d - 1] = isWeekendOrHoliday ? 1 : 0;
    totalRequiredHours += expectedNobet * 24 + dailyMesaiFromRot * 8;
  }

  const targetHours = new Int32Array(N);
  let totalTargetHours = 0;
  for (let i = 0; i < N; i++) {
    const nid = activeNobetli[i].id;
    const effectiveLeaves = resolveEffectiveLeaveDays(
      preferences[nid]?.leaveDays,
      input.lockedAssignments?.[nid]
    );
    const th = computeNurseTargetHours(config.yearMonth, config.holidays, effectiveLeaves);
    targetHours[i] = th;
    totalTargetHours += th;
  }

  const baseStatutoryHours = computeBaseStatutoryHours(config.yearMonth, config.holidays);
  let extraMesaiDays: number[] = [];
  if (config.autoTopUpUnderHours && totalRequiredHours < totalTargetHours) {
    const extraNeeded = Math.ceil((totalTargetHours - totalRequiredHours) / 8);
    extraMesaiDays = selectExtraMesaiDays(config, activeNobetli, preferences, days, extraNeeded);
    for (const d of extraMesaiDays) {
      dailyM8[d - 1] += 1;
    }
  }

  const leaveOvertimePolicy = config.leaveOvertimePolicy ?? 'proportional';
  let effectiveSlotHours = 0;
  for (let d = 0; d < days; d++) {
    effectiveSlotHours += dailyN24[d] * 24 + dailyM8[d] * 8;
  }
  const expectedOvertime = computeExpectedOvertimeTargets(
    leaveOvertimePolicy,
    targetHours,
    baseStatutoryHours,
    effectiveSlotHours
  );

  // Tercih ve kısıt matrisleri (flat arrays: i * days + dIdx)
  const lockedLeave = new Uint8Array(N * days);
  const pinnedCell = new Uint8Array(N * days);
  const pinnedVal = new Int8Array(N * days);
  const hardNeg = new Uint8Array(N * days);
  const softNeg = new Uint8Array(N * days);
  const posNobet = new Uint8Array(N * days);
  const posMesai = new Uint8Array(N * days);
  const bridgeThursday = new Uint8Array(N * days);
  const hasSignificantLeave = new Uint8Array(N);
  const posTotalArr = new Int32Array(N);
  const posNobetWeight = new Int32Array(N);
  const posMesaiWeight = new Int32Array(N);
  const shiftStyleCode = new Int8Array(N);
  const leaveCodes: Record<number, Record<number, ShiftCode>> = {};
  const pinnedExactCode: Record<number, Record<number, ShiftCode>> = {};

  // Önceki ay son 3 gün (tail): [d-2, d-1, d0]
  // Encode: 1 = N24/N16, 2 = M8/S8, 0 = boş/izin
  const maxAllowedEmpty = config.maxConsecutiveEmptyDays ?? 3;
  const tailType = new Int8Array(N * 3);
  const initialEmptyStreak = new Int32Array(N);
  const carryOverGap = new Int32Array(N);
  const carryOverOvertime = new Int32Array(N);
  const carryRecentWknd = new Int32Array(N);
  const carryYearBayram = new Int32Array(N);
  const isBayram = new Uint8Array(days);
  for (let d = 1; d <= days; d++) {
    if (config.holidays[d]?.type === 'bayram') isBayram[d - 1] = 1;
  }

  for (let i = 0; i < N; i++) {
    const nid = activeNobetli[i].id;
    const pref = preferences[nid];
    leaveCodes[i] = {};
    pinnedExactCode[i] = {};

    const leaveMap = pref?.leaveDays ?? {};
    let leaveCnt = 0;
    for (let d = 1; d <= days; d++) {
      if (leaveMap[d]) {
        lockedLeave[i * days + (d - 1)] = 1;
        leaveCodes[i][d - 1] = leaveMap[d];
        leaveCnt++;
      }
    }

    const nurseLocks = input.lockedAssignments?.[nid];
    if (nurseLocks) {
      for (let d = 1; d <= days; d++) {
        const idx = i * days + (d - 1);
        if (lockedLeave[idx]) continue;
        if (Object.prototype.hasOwnProperty.call(nurseLocks, d)) {
          const code = nurseLocks[d];
          if (code === 'YI' || code === 'R' || code === 'DI' || code === 'II') {
            lockedLeave[idx] = 1;
            leaveCodes[i][d - 1] = code;
            leaveCnt++;
          } else {
            pinnedCell[idx] = 1;
            pinnedExactCode[i][d - 1] = code;
            pinnedVal[idx] =
              code === 'N24' || code === 'N16'
                ? CELL_N24
                : code === 'M8' || code === 'S8'
                ? CELL_M8
                : CELL_EMPTY;
          }
        }
      }
    }
    if (leaveCnt >= 3) hasSignificantLeave[i] = 1;

    for (const d of pref?.negativeDays ?? []) {
      if (d >= 1 && d <= days) hardNeg[i * days + (d - 1)] = 1;
    }
    for (const d of pref?.softNegativeDays ?? []) {
      if (d >= 1 && d <= days) softNeg[i * days + (d - 1)] = 1;
    }
    for (const d of pref?.positiveNobetDays ?? []) {
      if (d >= 1 && d <= days) posNobet[i * days + (d - 1)] = 1;
    }
    for (const d of pref?.positiveMesaiDays ?? []) {
      if (d >= 1 && d <= days) posMesai[i * days + (d - 1)] = 1;
    }
    for (const br of pref?.bridgeLeaveRequests ?? []) {
      if (br.wantPreThursdayNobet) {
        const thu = br.startDay - 4;
        if (thu >= 1 && thu <= days) {
          bridgeThursday[i * days + (thu - 1)] = 1;
          posNobet[i * days + (thu - 1)] = 1;
        }
      }
    }

    let validPosNob = 0;
    let validPosMes = 0;
    for (let d = 0; d < days; d++) {
      if (posNobet[i * days + d]) validPosNob++;
      if (posMesai[i * days + d]) validPosMes++;
    }
    const posTotal = validPosNob + validPosMes;
    posTotalArr[i] = posTotal;
    const denom = Math.sqrt(Math.max(1, posTotal / 2));
    posNobetWeight[i] = Math.max(1450, Math.min(2700, Math.round(2650 / denom)));
    posMesaiWeight[i] = Math.max(1850, Math.min(3100, Math.round(3050 / denom)));
    shiftStyleCode[i] =
      pref?.shiftStyle === 'prefer_24' ? 1 : pref?.shiftStyle === 'prefer_8' ? -1 : 0;

    const tail = config.prevMonthTail?.[nid] ?? ['', '', ''];
    initialEmptyStreak[i] = computeInitialEmptyStreak(tail);
    for (let t = 0; t < 3; t++) {
      const c = tail[t];
      tailType[i * 3 + t] = c === 'N24' || c === 'N16' ? CELL_N24 : c === 'M8' || c === 'S8' ? CELL_M8 : CELL_EMPTY;
    }

    carryOverGap[i] = prevMonthFairness?.threeDayGapCount?.[nid] ?? 0;
    carryOverOvertime[i] = prevMonthFairness?.overtimeHours?.[nid] ?? 0;
    carryRecentWknd[i] = prevMonthFairness?.recentWeekendShifts?.[nid] ?? 0;
    carryYearBayram[i] = prevMonthFairness?.yearBayramShifts?.[nid] ?? 0;
  }

  let sumRecentWknd = 0;
  for (let i = 0; i < N; i++) sumRecentWknd += carryRecentWknd[i];
  const meanRecentWknd = N > 0 ? sumRecentWknd / N : 0;

  const nurseIdxById = new Map<string, number>();
  for (let i = 0; i < N; i++) nurseIdxById.set(activeNobetli[i].id, i);
  const pairRuleIndices: Array<{ a: number; b: number; type: 'separate' | 'together' }> = [];
  for (const rule of config.pairRules ?? []) {
    const idxA = nurseIdxById.get(rule.nurseAId);
    const idxB = nurseIdxById.get(rule.nurseBId);
    if (idxA !== undefined && idxB !== undefined && idxA !== idxB) {
      pairRuleIndices.push({ a: idxA, b: idxB, type: rule.type });
    }
  }

  // Her gün için kilitli veya sabitlenmiş olmayan hemşire indeksleri
  const unlockedByDay: number[][] = Array.from({ length: days }, (_, dIdx) => {
    const list: number[] = [];
    for (let i = 0; i < N; i++) {
      if (!lockedLeave[i * days + dIdx] && !pinnedCell[i * days + dIdx]) list.push(i);
    }
    return list;
  });

  // Hızlı puanlama fonksiyonu (allocation-free)
  const wkTotalArr = new Int32Array(N);
  const wkNobetArr = new Int32Array(N);
  const gapCntArr = new Int32Array(N);
  const nurseHasViol = new Uint8Array(N);

  const canFillTotalTarget =
    (() => {
      let availSlotsHours = 0;
      for (let d = 0; d < days; d++) {
        availSlotsHours += dailyN24[d] * 24 + dailyM8[d] * 8;
      }
      return availSlotsHours >= totalTargetHours;
    })();

  function evaluateGridCost(grid: Int8Array): number {
    let cost = 0;
    let devSqSum = 0;
    let minDev = 1e9;
    let maxDev = -1e9;
    let minWkTot = 1e9;
    let maxWkTot = -1e9;
    let minWkNob = 1e9;
    let maxWkNob = -1e9;
    let minBalNob = 1e9;
    let maxBalNob = -1e9;
    let minGap = 1e9;
    let maxGap = -1e9;

    for (let i = 0; i < N; i++) {
      const base = i * days;
      const t1 = tailType[i * 3 + 1];
      const t2 = tailType[i * 3 + 2];

      let worked = 0;
      let nobetCnt = 0;
      let mesaiCnt = 0;
      let wkNobet = 0;
      let wkTotal = 0;
      let gapCnt = 0;
      let consecMesai = 0;
      let emptyRun = initialEmptyStreak[i];
      let unmetPos = 0;
      let softViolCnt = 0;
      let viol = 0;

      // Ay devri kontrolleri
      const c0 = grid[base];
      if (t2 === CELL_N24) {
        if (c0 === CELL_N24 || c0 === CELL_M8) {
          cost += 120000;
          viol = 1;
        }
        if (days >= 2) {
          const c1 = grid[base + 1];
          if (c1 === CELL_N24) {
            cost += 120000;
            viol = 1;
          } else if (c1 === CELL_M8) {
            cost += 9500;
            viol = 1;
          }
        }
      }
      if (t1 === CELL_N24) {
        if (c0 === CELL_N24) {
          cost += 120000;
          viol = 1;
        } else if (c0 === CELL_M8) {
          cost += 9500;
          viol = 1;
        }
      }

      for (let d = 0; d < days; d++) {
        const idx = base + d;
        const c = grid[idx];

        if (c === CELL_N24) {
          emptyRun = 0;
          worked += 24;
          nobetCnt++;
          consecMesai = 0;
          if (isHolOrWknd[d]) {
            wkNobet++;
            wkTotal++;
          }
          if (isBayram[d] && carryYearBayram[i] > 0) {
            cost += carryYearBayram[i] * 900;
          }
          if (hardNeg[idx]) {
            cost += 35000;
            viol = 1;
          } else if (softNeg[idx]) {
            cost += 1100;
            softViolCnt++;
          }
          if (posMesai[idx]) {
            cost += 24000;
            viol = 1;
          }

          // d+1, d+2, d+3 kontrolleri
          if (d + 1 < days) {
            const c1 = grid[idx + 1];
            if (c1 === CELL_N24 || c1 === CELL_M8) {
              cost += 120000;
              viol = 1;
            }
          }
          if (d + 2 < days) {
            const c2 = grid[idx + 2];
            if (c2 === CELL_N24) {
              cost += 120000;
              viol = 1;
            } else if (c2 === CELL_M8) {
              cost += 9500;
              viol = 1;
            }
          }
          if (
            d + 3 < days &&
            grid[idx + 1] === CELL_EMPTY &&
            grid[idx + 2] === CELL_EMPTY &&
            grid[idx + 3] === CELL_EMPTY
          ) {
            gapCnt++;
          }
        } else if (c === CELL_M8) {
          emptyRun = 0;
          worked += 8;
          mesaiCnt++;
          consecMesai++;
          if (consecMesai === 2) {
            if (!(posMesai[idx] && d > 0 && posMesai[idx - 1])) cost += 320;
          } else if (consecMesai === 3) {
            cost += 950;
          } else if (consecMesai >= 4) {
            cost += 2200;
          }
          if (d + 1 < days && grid[idx + 1] === CELL_N24) {
            cost += posMesai[idx] || posNobet[idx + 1] ? 80 : 450;
          }
          if (isHolOrWknd[d]) wkTotal++;
          if (isBayram[d] && carryYearBayram[i] > 0) {
            cost += carryYearBayram[i] * 900;
          }
          if (hardNeg[idx]) {
            cost += 35000;
            viol = 1;
          } else if (softNeg[idx]) {
            cost += 1100;
            softViolCnt++;
          }
          if (bridgeThursday[idx]) {
            cost += 8000; // Köprüleme Perşembesine N24 yerine M8 düşmesin
          } else if (posNobet[idx]) {
            cost += posNobetWeight[i];
            unmetPos++;
          }
        } else {
          consecMesai = 0;
          if (c === CELL_EMPTY) {
            emptyRun++;
            if (maxAllowedEmpty > 0 && emptyRun > maxAllowedEmpty) {
              cost += 18000;
              viol = 1;
            }
          } else {
            emptyRun = 0;
          }
          if (bridgeThursday[idx]) {
            cost += 8000;
          } else if (posNobet[idx]) {
            cost += posNobetWeight[i];
            unmetPos++;
          }
          if (posMesai[idx]) {
            cost += posMesaiWeight[i];
            unmetPos++;
          }
        }
      }

      if (posTotalArr[i] > 0 && unmetPos > 0) {
        const r = unmetPos / posTotalArr[i];
        cost += Math.round(r * r * 3600);
      }
      if (softViolCnt > 1) {
        cost += (softViolCnt - 1) * (softViolCnt - 1) * 400;
      }
      if (shiftStyleCode[i] === 1) {
        cost += mesaiCnt * 750;
      } else if (shiftStyleCode[i] === -1) {
        cost += nobetCnt * 850;
      }

      nurseHasViol[i] = viol;
      const ot = worked - targetHours[i];
      wkTotalArr[i] = wkTotal;
      wkNobetArr[i] = wkNobet;
      gapCntArr[i] = gapCnt;

      if (canFillTotalTarget && ot < 0) {
        cost += ((-ot) / 8) * 1800;
      }

      const dev = ot - expectedOvertime[i];
      devSqSum += dev * dev;
      if (dev < minDev) minDev = dev;
      if (dev > maxDev) maxDev = dev;

      if (wkTotal < minWkTot) minWkTot = wkTotal;
      if (wkTotal > maxWkTot) maxWkTot = wkTotal;

      if (wkNobet < minWkNob) minWkNob = wkNobet;
      if (wkNobet > maxWkNob) maxWkNob = wkNobet;

      if (!hasSignificantLeave[i] && shiftStyleCode[i] === 0) {
        if (nobetCnt < minBalNob) minBalNob = nobetCnt;
        if (nobetCnt > maxBalNob) maxBalNob = nobetCnt;
      }

      if (!hasSignificantLeave[i]) {
        if (gapCnt < minGap) minGap = gapCnt;
        if (gapCnt > maxGap) maxGap = gapCnt;
        if (gapCnt === 0) {
          cost += 2200; // En az 1 tane 3 günlük boşluk güçlü teşvik
        } else if (gapCnt > 2) {
          cost += (gapCnt - 2) * 140;
        }
      }

      // Geçen aydan adalet taşıma (varsa hafif dürtü)
      if (carryOverGap[i] === 0 && gapCnt === 0) cost += 250;
      if (carryOverOvertime[i] > 8 && ot > carryOverOvertime[i]) cost += 60;
      if (carryRecentWknd[i] > meanRecentWknd && wkTotal > 0) {
        cost += Math.round((carryRecentWknd[i] - meanRecentWknd) * wkTotal * 45);
      }
    }

    const devSpread = maxDev - minDev;
    if (devSpread > 8) {
      cost += (devSpread - 8) * 1400;
    }
    if (devSpread > 16) {
      cost += (devSpread - 16) * 4500;
    }
    cost += devSqSum * (leaveOvertimePolicy === 'equal' ? 24 : 36);

    const wkNobSpread = maxWkNob - minWkNob;
    const wkTotSpread = maxWkTot - minWkTot;
    cost += wkNobSpread <= 1 ? wkNobSpread * 400 : 1400 + (wkNobSpread - 2) * 8500;
    cost += wkTotSpread <= 1 ? wkTotSpread * 300 : 1000 + (wkTotSpread - 2) * 12000;

    if (minBalNob <= maxBalNob) {
      const balNobSpread = maxBalNob - minBalNob;
      cost += balNobSpread * balNobSpread * 280;
      if (balNobSpread > 2) cost += (balNobSpread - 2) * 1200;
    }

    if (minGap <= maxGap) {
      const gapSpread = maxGap - minGap;
      cost += gapSpread * gapSpread * 220;
    }

    for (let p = 0; p < pairRuleIndices.length; p++) {
      const rule = pairRuleIndices[p];
      const baseA = rule.a * days;
      const baseB = rule.b * days;
      for (let d = 0; d < days; d++) {
        const aNob = grid[baseA + d] === CELL_N24;
        const bNob = grid[baseB + d] === CELL_N24;
        if (rule.type === 'separate') {
          if (aNob && bNob) cost += 7500;
        } else if (aNob !== bNob) {
          cost += 450;
        }
      }
    }

    return cost;
  }

  function buildInitialGrid(restartIdx: number): Int8Array {
    const grid = new Int8Array(N * days);
    const hoursSoFar = new Int32Array(N);
    const wkSoFar = new Int32Array(N);
    const nobetLeft = new Int32Array(days);
    const mesaiLeft = new Int32Array(days);

    for (let d = 0; d < days; d++) {
      nobetLeft[d] = dailyN24[d];
      mesaiLeft[d] = dailyM8[d];
    }

    for (let i = 0; i < N; i++) {
      for (let d = 0; d < days; d++) {
        const idx = i * days + d;
        if (lockedLeave[idx]) {
          grid[idx] = CELL_LOCKED_LEAVE;
        } else if (pinnedCell[idx]) {
          const val = pinnedVal[idx];
          grid[idx] = val;
          if (val === CELL_N24) {
            nobetLeft[d] = Math.max(0, nobetLeft[d] - 1);
            hoursSoFar[i] += 24;
            if (isHolOrWknd[d]) wkSoFar[i]++;
          } else if (val === CELL_M8) {
            mesaiLeft[d] = Math.max(0, mesaiLeft[d] - 1);
            hoursSoFar[i] += 8;
            if (isHolOrWknd[d]) wkSoFar[i]++;
          }
        }
      }
    }

    // 1. Önce köprüleme Perşembe nöbetlerini yerleştir
    for (let d = 0; d < days; d++) {
      for (let i = 0; i < N; i++) {
        if (nobetLeft[d] <= 0) break;
        const idx = i * days + d;
        if (bridgeThursday[idx] && !pinnedCell[idx] && grid[idx] === CELL_EMPTY && !hardNeg[idx]) {
          grid[idx] = CELL_N24;
          nobetLeft[d]--;
          hoursSoFar[i] += 24;
          if (isHolOrWknd[d]) wkSoFar[i]++;
        }
      }
    }

    // Yardımcı: Nöbet (N24) için dinamik uygunluk
    const isHardValidN24 = (i: number, d: number): boolean => {
      const base = i * days;
      if (grid[base + d] !== CELL_EMPTY || hardNeg[base + d] || posMesai[base + d]) return false;
      if (d === 0 && (tailType[i * 3 + 2] === CELL_N24 || tailType[i * 3 + 1] === CELL_N24)) {
        return false;
      }
      if (d === 1 && tailType[i * 3 + 2] === CELL_N24) return false;
      if (d - 1 >= 0 && grid[base + d - 1] === CELL_N24) return false;
      if (d - 2 >= 0 && grid[base + d - 2] === CELL_N24) return false;
      if (d + 1 < days && grid[base + d + 1] === CELL_N24) return false;
      if (d + 2 < days && grid[base + d + 2] === CELL_N24) return false;
      return true;
    };

    const isHardValidM8 = (i: number, d: number): boolean => {
      const base = i * days;
      if (grid[base + d] !== CELL_EMPTY || hardNeg[base + d]) return false;
      if (d === 0 && tailType[i * 3 + 2] === CELL_N24) return false;
      if (d - 1 >= 0 && grid[base + d - 1] === CELL_N24) return false;
      return true;
    };

    // 1b. Yeşil (N24) tercih edilen günleri önce yerleştir (komşu güne rastgele atama yapıp isteği tıkamasın)
    const posDayOrder = Array.from({ length: days }, (_, d) => d).filter((d) =>
      unlockedByDay[d].some((i) => posNobet[i * days + d] && grid[i * days + d] === CELL_EMPTY)
    );
    if (restartIdx % 3 === 1) {
      posDayOrder.reverse();
    } else if (restartIdx % 3 === 2) {
      for (let k = posDayOrder.length - 1; k > 0; k--) {
        const j = Math.floor(rng() * (k + 1));
        const tmp = posDayOrder[k];
        posDayOrder[k] = posDayOrder[j];
        posDayOrder[j] = tmp;
      }
    }
    for (const d of posDayOrder) {
      while (nobetLeft[d] > 0) {
        const cands = unlockedByDay[d].filter(
          (i) => posNobet[i * days + d] && isHardValidN24(i, d)
        );
        if (cands.length === 0) break;
        cands.sort((a, b) => {
          const wDiff = posNobetWeight[b] - posNobetWeight[a];
          if (Math.abs(wDiff) > 50) return wDiff;
          const otA =
            hoursSoFar[a] -
            (targetHours[a] + expectedOvertime[a]) +
            (isHolOrWknd[d] ? wkSoFar[a] * 8 : 0);
          const otB =
            hoursSoFar[b] -
            (targetHours[b] + expectedOvertime[b]) +
            (isHolOrWknd[d] ? wkSoFar[b] * 8 : 0);
          return otA - otB + (rng() - 0.5) * (restartIdx === 0 ? 4 : 18);
        });
        const chosen = cands[0];
        grid[chosen * days + d] = CELL_N24;
        nobetLeft[d]--;
        hoursSoFar[chosen] += 24;
        if (isHolOrWknd[d]) wkSoFar[chosen]++;
      }
    }

    // Gün sırasını restart'a göre çeşitlendir
    const dayOrder = Array.from({ length: days }, (_, d) => d);
    if (restartIdx % 3 === 1) {
      dayOrder.reverse();
    } else if (restartIdx % 3 === 2) {
      for (let k = dayOrder.length - 1; k > 0; k--) {
        const j = Math.floor(rng() * (k + 1));
        const tmp = dayOrder[k];
        dayOrder[k] = dayOrder[j];
        dayOrder[j] = tmp;
      }
    }

    // 2. Kalan N24 slotlarını doldur
    for (const d of dayOrder) {
      while (nobetLeft[d] > 0) {
        const candidates = unlockedByDay[d].filter((i) => grid[i * days + d] === CELL_EMPTY);
        if (candidates.length === 0) break;

        candidates.sort((a, b) => {
          const validA = isHardValidN24(a, d) ? 0 : 1;
          const validB = isHardValidN24(b, d) ? 0 : 1;
          if (validA !== validB) return validA - validB;

          const negA = hardNeg[a * days + d];
          const negB = hardNeg[b * days + d];
          if (negA !== negB) return negA - negB;

          const pmA = posMesai[a * days + d];
          const pmB = posMesai[b * days + d];
          if (pmA !== pmB) return pmA - pmB;

          const posA = posNobet[a * days + d] ? -1 : 0;
          const posB = posNobet[b * days + d] ? -1 : 0;
          if (posA !== posB) return posA - posB;

          const blocksPmA =
            (d + 1 < days && posMesai[a * days + d + 1]) ||
            (d + 2 < days && posMesai[a * days + d + 2])
              ? 1
              : 0;
          const blocksPmB =
            (d + 1 < days && posMesai[b * days + d + 1]) ||
            (d + 2 < days && posMesai[b * days + d + 2])
              ? 1
              : 0;
          if (blocksPmA !== blocksPmB) return blocksPmA - blocksPmB;

          const softA = softNeg[a * days + d];
          const softB = softNeg[b * days + d];
          if (softA !== softB) return softA - softB;

          const styleA = -shiftStyleCode[a] * 18;
          const styleB = -shiftStyleCode[b] * 18;
          const otA =
            hoursSoFar[a] -
            (targetHours[a] + expectedOvertime[a]) +
            styleA +
            (isHolOrWknd[d] ? wkSoFar[a] * 8 : 0);
          const otB =
            hoursSoFar[b] -
            (targetHours[b] + expectedOvertime[b]) +
            styleB +
            (isHolOrWknd[d] ? wkSoFar[b] * 8 : 0);
          return otA - otB + (rng() - 0.5) * (restartIdx === 0 ? 2 : 14);
        });

        const chosen = candidates[0];
        grid[chosen * days + d] = CELL_N24;
        nobetLeft[d]--;
        hoursSoFar[chosen] += 24;
        if (isHolOrWknd[d]) wkSoFar[chosen]++;
      }
    }

    // 3. M8 slotlarını doldur
    for (let d = 0; d < days; d++) {
      while (mesaiLeft[d] > 0) {
        const candidates = unlockedByDay[d].filter((i) => grid[i * days + d] === CELL_EMPTY);
        if (candidates.length === 0) break;

        candidates.sort((a, b) => {
          const validA = isHardValidM8(a, d) ? 0 : 1;
          const validB = isHardValidM8(b, d) ? 0 : 1;
          if (validA !== validB) return validA - validB;

          const d3A =
            (d >= 2 && grid[a * days + d - 2] === CELL_N24) ||
            (d === 1 && tailType[a * 3 + 2] === CELL_N24) ||
            (d === 0 && tailType[a * 3 + 1] === CELL_N24)
              ? 1
              : 0;
          const d3B =
            (d >= 2 && grid[b * days + d - 2] === CELL_N24) ||
            (d === 1 && tailType[b * 3 + 2] === CELL_N24) ||
            (d === 0 && tailType[b * 3 + 1] === CELL_N24)
              ? 1
              : 0;
          if (d3A !== d3B) return d3A - d3B;

          const pmA = posMesai[a * days + d] ? -1 : 0;
          const pmB = posMesai[b * days + d] ? -1 : 0;
          if (pmA !== pmB) return pmA - pmB;

          const softA = softNeg[a * days + d];
          const softB = softNeg[b * days + d];
          if (softA !== softB) return softA - softB;

          const otA =
            hoursSoFar[a] - (targetHours[a] + expectedOvertime[a]) + shiftStyleCode[a] * 16;
          const otB =
            hoursSoFar[b] - (targetHours[b] + expectedOvertime[b]) + shiftStyleCode[b] * 16;
          return otA - otB + (rng() - 0.5) * (restartIdx === 0 ? 2 : 10);
        });

        const chosen = candidates[0];
        grid[chosen * days + d] = CELL_M8;
        mesaiLeft[d]--;
        hoursSoFar[chosen] += 8;
        if (isHolOrWknd[d]) wkSoFar[chosen]++;
      }
    }

    return grid;
  }

  const posRequests: Array<{ nurse: number; day: number; want: number }> = [];
  for (let i = 0; i < N; i++) {
    for (let d = 0; d < days; d++) {
      const idx = i * days + d;
      if (lockedLeave[idx] || pinnedCell[idx]) continue;
      if (posNobet[idx]) posRequests.push({ nurse: i, day: d, want: CELL_N24 });
      else if (posMesai[idx]) posRequests.push({ nurse: i, day: d, want: CELL_M8 });
    }
  }

  const canQuickN24 = (grid: Int8Array, i: number, d: number): boolean => {
    const base = i * days;
    if (hardNeg[base + d] || posMesai[base + d]) return false;
    if (d === 0 && (tailType[i * 3 + 2] === CELL_N24 || tailType[i * 3 + 1] === CELL_N24)) {
      return false;
    }
    if (d === 1 && tailType[i * 3 + 2] === CELL_N24) return false;
    if (d >= 1 && grid[base + d - 1] === CELL_N24) return false;
    if (d >= 2 && grid[base + d - 2] === CELL_N24) return false;
    if (d + 1 < days && (grid[base + d + 1] === CELL_N24 || grid[base + d + 1] === CELL_M8)) {
      return false;
    }
    if (d + 2 < days && grid[base + d + 2] === CELL_N24) return false;
    return true;
  };

  const canQuickM8 = (grid: Int8Array, i: number, d: number): boolean => {
    const base = i * days;
    if (hardNeg[base + d]) return false;
    if (d === 0 && tailType[i * 3 + 2] === CELL_N24) return false;
    if (d >= 1 && grid[base + d - 1] === CELL_N24) return false;
    return true;
  };

  const restarts = input.restarts ?? 10;
  const iterationsPerRestart = input.iterationsPerRestart ?? 42000;
  let globalBestGrid = new Int8Array(N * days);
  let globalBestCost = Infinity;

  for (let r = 0; r < restarts; r++) {
    const grid = buildInitialGrid(r);
    let currentCost = evaluateGridCost(grid);
    let restartBestGrid = new Int8Array(grid);
    let restartBestCost = currentCost;

    const tStart = 14000;
    const tEnd = 5;

    for (let iter = 0; iter < iterationsPerRestart; iter++) {
      const progress = iter / iterationsPerRestart;
      const temp = tStart * Math.pow(tEnd / tStart, progress);

      const moveRoll = rng();
      let swapped = false;
      let undoType = 0;
      let a = 0;
      let b = 0;
      let d1 = 0;
      let d2 = 0;
      let prevA1 = 0;
      let prevB1 = 0;
      let prevA2 = 0;
      let prevB2 = 0;
      const mixDays = [0, 0, 0];
      let mixLen = 0;

      if (moveRoll < 0.18) {
        // Hedefli onarım veya saat dengeleme hamlesi (aynı gün içinde)
        d1 = Math.floor(rng() * days);
        const list = unlockedByDay[d1];
        if (list.length >= 2) {
          // İhlalli veya uç fazla mesaili bir hemşireyi seçmeye çalış
          let targetIdx = -1;
          for (let tries = 0; tries < 4; tries++) {
            const cand = list[Math.floor(rng() * list.length)];
            if (nurseHasViol[cand]) {
              targetIdx = cand;
              break;
            }
          }
          a = targetIdx >= 0 ? targetIdx : list[Math.floor(rng() * list.length)];
          b = list[Math.floor(rng() * list.length)];
          if (a !== b && grid[a * days + d1] !== grid[b * days + d1]) {
            undoType = 1;
            prevA1 = grid[a * days + d1];
            prevB1 = grid[b * days + d1];
            grid[a * days + d1] = prevB1;
            grid[b * days + d1] = prevA1;
            swapped = true;
          }
        }
      } else if (moveRoll < 0.40) {
        // Standart aynı gün takası (saat + gün dağılımı ayarlar)
        d1 = Math.floor(rng() * days);
        const list = unlockedByDay[d1];
        if (list.length >= 2) {
          a = list[Math.floor(rng() * list.length)];
          b = list[Math.floor(rng() * list.length)];
          if (a !== b && grid[a * days + d1] !== grid[b * days + d1]) {
            undoType = 1;
            prevA1 = grid[a * days + d1];
            prevB1 = grid[b * days + d1];
            grid[a * days + d1] = prevB1;
            grid[b * days + d1] = prevA1;
            swapped = true;
          }
        }
      } else if (moveRoll < 0.62 && posRequests.length > 0) {
        // Tercih odaklı 2-opt takas (önce d2±1/d2±2 engelleyen nöbeti çekip +120k bariyerini aşar)
        const req = posRequests[Math.floor(rng() * posRequests.length)];
        a = req.nurse;
        d2 = req.day;
        const curA2 = grid[a * days + d2];
        if (curA2 !== req.want) {
          const list2 = unlockedByDay[d2];
          const startIdx = Math.floor(rng() * list2.length);
          let holderB = -1;
          for (let k = 0; k < list2.length; k++) {
            const cand = list2[(startIdx + k) % list2.length];
            if (cand !== a && grid[cand * days + d2] === req.want) {
              holderB = cand;
              break;
            }
          }
          if (holderB >= 0) {
            b = holderB;
            let chosenD1 = -1;
            const nearOffsets = [-2, -1, 1, 2];
            for (let o = 0; o < 4; o++) {
              const candD1 = d2 + nearOffsets[o];
              if (
                candD1 >= 0 &&
                candD1 < days &&
                !lockedLeave[a * days + candD1] &&
                !pinnedCell[a * days + candD1] &&
                !lockedLeave[b * days + candD1] &&
                !pinnedCell[b * days + candD1] &&
                grid[a * days + candD1] === req.want &&
                grid[b * days + candD1] === curA2
              ) {
                chosenD1 = candD1;
                break;
              }
            }
            if (chosenD1 < 0) {
              const dStart = Math.floor(rng() * days);
              for (let k = 0; k < days; k++) {
                const candD1 = (dStart + k) % days;
                if (
                  candD1 !== d2 &&
                  !lockedLeave[a * days + candD1] &&
                  !pinnedCell[a * days + candD1] &&
                  !lockedLeave[b * days + candD1] &&
                  !pinnedCell[b * days + candD1] &&
                  grid[a * days + candD1] === req.want &&
                  grid[b * days + candD1] === curA2
                ) {
                  chosenD1 = candD1;
                  break;
                }
              }
            }
            if (chosenD1 >= 0) {
              d1 = chosenD1;
              undoType = 2;
              prevA1 = req.want;
              prevB1 = curA2;
              prevA2 = curA2;
              prevB2 = req.want;
              grid[a * days + d1] = curA2;
              grid[b * days + d1] = req.want;
              grid[a * days + d2] = req.want;
              grid[b * days + d2] = curA2;
              swapped = true;
            }
          }
        }
      } else if (moveRoll < 0.86) {
        // Hedefli ve geçerli 2-opt çapraz iki gün takası
        d1 = Math.floor(rng() * days);
        const list1 = unlockedByDay[d1];
        if (list1.length >= 2) {
          let pickedA = -1;
          if (rng() < 0.5) {
            for (let tries = 0; tries < 4; tries++) {
              const cand = list1[Math.floor(rng() * list1.length)];
              if (nurseHasViol[cand]) {
                pickedA = cand;
                break;
              }
            }
          }
          a = pickedA >= 0 ? pickedA : list1[Math.floor(rng() * list1.length)];
          const valA1 = grid[a * days + d1];
          d2 = -1;
          for (let tries = 0; tries < 6; tries++) {
            const candD2 = Math.floor(rng() * days);
            if (
              candD2 !== d1 &&
              !lockedLeave[a * days + candD2] &&
              !pinnedCell[a * days + candD2] &&
              grid[a * days + candD2] !== valA1
            ) {
              d2 = candD2;
              break;
            }
          }
          if (d2 >= 0) {
            const valA2 = grid[a * days + d2];
            const startIdx = Math.floor(rng() * list1.length);
            for (let k = 0; k < list1.length; k++) {
              const candB = list1[(startIdx + k) % list1.length];
              if (
                candB !== a &&
                !lockedLeave[candB * days + d2] &&
                !pinnedCell[candB * days + d2] &&
                grid[candB * days + d1] === valA2 &&
                grid[candB * days + d2] === valA1
              ) {
                b = candB;
                undoType = 2;
                prevA1 = valA1;
                prevB1 = valA2;
                prevA2 = valA2;
                prevB2 = valA1;
                grid[a * days + d1] = prevB1;
                grid[b * days + d1] = prevA1;
                grid[a * days + d2] = prevB2;
                grid[b * days + d2] = prevA2;
                swapped = true;
                break;
              }
            }
          }
        }
      } else {
        // Saat koruyan geçerli 1×N24 ↔ 2..3×M8 vardiya-tipi takası (prefer_24 / prefer_8 destekli)
        d1 = Math.floor(rng() * days);
        const list1 = unlockedByDay[d1];
        if (list1.length >= 2) {
          let candA = -1;
          let candB = -1;
          const preferStyleBias = rng() < 0.55;
          const off = Math.floor(rng() * list1.length);
          for (let k = 0; k < list1.length; k++) {
            const idxN = list1[(off + k) % list1.length];
            const v = grid[idxN * days + d1];
            if (v === CELL_EMPTY && canQuickN24(grid, idxN, d1)) {
              if (
                candA < 0 ||
                (preferStyleBias && shiftStyleCode[idxN] === 1 && shiftStyleCode[candA] !== 1)
              ) {
                candA = idxN;
              }
            } else if (v === CELL_N24) {
              if (
                candB < 0 ||
                (preferStyleBias && shiftStyleCode[idxN] !== 1 && shiftStyleCode[candB] === 1)
              ) {
                candB = idxN;
              }
            }
          }
          if (candA >= 0 && candB >= 0) {
            a = candA;
            b = candB;
            mixLen = 0;
            const dOff = Math.floor(rng() * days);
            for (let k = 0; k < days && mixLen < 3; k++) {
              const dm = (dOff + k) % days;
              if (
                dm !== d1 &&
                !lockedLeave[a * days + dm] &&
                !pinnedCell[a * days + dm] &&
                !lockedLeave[b * days + dm] &&
                !pinnedCell[b * days + dm] &&
                grid[a * days + dm] === CELL_M8 &&
                grid[b * days + dm] === CELL_EMPTY &&
                canQuickM8(grid, b, dm)
              ) {
                mixDays[mixLen++] = dm;
              }
            }
            if (mixLen >= 2) {
              undoType = 3;
              grid[a * days + d1] = CELL_N24;
              grid[b * days + d1] = CELL_EMPTY;
              for (let m = 0; m < mixLen; m++) {
                const dm = mixDays[m];
                grid[a * days + dm] = CELL_EMPTY;
                grid[b * days + dm] = CELL_M8;
              }
              swapped = true;
            }
          }
        }
      }

      if (!swapped) continue;

      const nextCost = evaluateGridCost(grid);
      const delta = nextCost - currentCost;

      if (delta <= 0 || rng() < Math.exp(-delta / temp)) {
        currentCost = nextCost;
        if (nextCost < restartBestCost) {
          restartBestCost = nextCost;
          restartBestGrid.set(grid);
        }
      } else {
        // Geri al
        if (undoType === 1) {
          grid[a * days + d1] = prevA1;
          grid[b * days + d1] = prevB1;
        } else if (undoType === 2) {
          grid[a * days + d1] = prevA1;
          grid[b * days + d1] = prevB1;
          grid[a * days + d2] = prevA2;
          grid[b * days + d2] = prevB2;
        } else if (undoType === 3) {
          grid[a * days + d1] = CELL_EMPTY;
          grid[b * days + d1] = CELL_N24;
          for (let m = 0; m < mixLen; m++) {
            const dm = mixDays[m];
            grid[a * days + dm] = CELL_M8;
            grid[b * days + dm] = CELL_EMPTY;
          }
        }
      }
    }

    if (restartBestCost < globalBestCost) {
      globalBestCost = restartBestCost;
      globalBestGrid.set(restartBestGrid);
    }

    if (onProgress) {
      onProgress(Math.min(95, Math.round(((r + 1) / restarts) * 90)));
    }
  }

  // Son deterministik yerel iyileştirme (greedy polish)
  let improved = true;
  let polishRounds = 0;
  while (improved && polishRounds < 6) {
    improved = false;
    polishRounds++;
    for (let d = 0; d < days; d++) {
      const list = unlockedByDay[d];
      for (let idx1 = 0; idx1 < list.length; idx1++) {
        for (let idx2 = idx1 + 1; idx2 < list.length; idx2++) {
          const a = list[idx1];
          const b = list[idx2];
          const pA = globalBestGrid[a * days + d];
          const pB = globalBestGrid[b * days + d];
          if (pA === pB) continue;

          globalBestGrid[a * days + d] = pB;
          globalBestGrid[b * days + d] = pA;
          const candCost = evaluateGridCost(globalBestGrid);
          if (candCost < globalBestCost) {
            globalBestCost = candCost;
            improved = true;
          } else {
            globalBestGrid[a * days + d] = pA;
            globalBestGrid[b * days + d] = pB;
          }
        }
      }
    }
  }

  // Stage 2: Çapraz gün 2-opt deterministik yerel iyileştirme (saat dengesini bozmadan tercih/yayılım optimize eder)
  let crossImproved = true;
  let crossRounds = 0;
  while (crossImproved && crossRounds < 2) {
    crossImproved = false;
    crossRounds++;
    for (let dA = 0; dA < days; dA++) {
      const listA = unlockedByDay[dA];
      for (let dB = dA + 1; dB < days; dB++) {
        for (let idx1 = 0; idx1 < listA.length; idx1++) {
          const nA = listA[idx1];
          if (lockedLeave[nA * days + dB] || pinnedCell[nA * days + dB]) continue;
          const vA1 = globalBestGrid[nA * days + dA];
          const vA2 = globalBestGrid[nA * days + dB];
          if (vA1 === vA2) continue;

          for (let idx2 = idx1 + 1; idx2 < listA.length; idx2++) {
            const nB = listA[idx2];
            if (lockedLeave[nB * days + dB] || pinnedCell[nB * days + dB]) continue;
            const vB1 = globalBestGrid[nB * days + dA];
            const vB2 = globalBestGrid[nB * days + dB];
            if (vB1 !== vA2 || vB2 !== vA1) continue;

            globalBestGrid[nA * days + dA] = vB1;
            globalBestGrid[nB * days + dA] = vA1;
            globalBestGrid[nA * days + dB] = vB2;
            globalBestGrid[nB * days + dB] = vA2;
            const candCost = evaluateGridCost(globalBestGrid);
            if (candCost < globalBestCost) {
              globalBestCost = candCost;
              crossImproved = true;
              break;
            } else {
              globalBestGrid[nA * days + dA] = vA1;
              globalBestGrid[nB * days + dA] = vB1;
              globalBestGrid[nA * days + dB] = vA2;
              globalBestGrid[nB * days + dB] = vB2;
            }
          }
        }
      }
    }
  }

  // Stage 3: Vardiya tipi tercihi (prefer_24 / prefer_8) için deterministik 1×N24 ↔ 2..3×M8 iyileştirme
  for (let pass = 0; pass < 2; pass++) {
    let mixImproved = false;
    for (let i = 0; i < N; i++) {
      if (shiftStyleCode[i] === 0) continue;
      for (let d1 = 0; d1 < days; d1++) {
        if (lockedLeave[i * days + d1] || pinnedCell[i * days + d1]) continue;
        const wantGainN24 = shiftStyleCode[i] === 1;
        if (
          wantGainN24 &&
          (globalBestGrid[i * days + d1] !== CELL_EMPTY || !canQuickN24(globalBestGrid, i, d1))
        ) {
          continue;
        }
        if (!wantGainN24 && globalBestGrid[i * days + d1] !== CELL_N24) continue;
        for (const other of unlockedByDay[d1]) {
          if (other === i) continue;
          const n24Gainer = wantGainN24 ? i : other;
          const n24Loser = wantGainN24 ? other : i;
          if (
            globalBestGrid[n24Gainer * days + d1] !== CELL_EMPTY ||
            globalBestGrid[n24Loser * days + d1] !== CELL_N24 ||
            !canQuickN24(globalBestGrid, n24Gainer, d1)
          ) {
            continue;
          }
          const mDays: number[] = [];
          for (let dm = 0; dm < days && mDays.length < 3; dm++) {
            if (
              dm !== d1 &&
              !lockedLeave[n24Gainer * days + dm] &&
              !pinnedCell[n24Gainer * days + dm] &&
              !lockedLeave[n24Loser * days + dm] &&
              !pinnedCell[n24Loser * days + dm] &&
              globalBestGrid[n24Gainer * days + dm] === CELL_M8 &&
              globalBestGrid[n24Loser * days + dm] === CELL_EMPTY &&
              canQuickM8(globalBestGrid, n24Loser, dm)
            ) {
              mDays.push(dm);
            }
          }
          if (mDays.length < 2) continue;
          globalBestGrid[n24Gainer * days + d1] = CELL_N24;
          globalBestGrid[n24Loser * days + d1] = CELL_EMPTY;
          for (const dm of mDays) {
            globalBestGrid[n24Gainer * days + dm] = CELL_EMPTY;
            globalBestGrid[n24Loser * days + dm] = CELL_M8;
          }
          const candCost = evaluateGridCost(globalBestGrid);
          if (candCost < globalBestCost) {
            globalBestCost = candCost;
            mixImproved = true;
            break;
          } else {
            globalBestGrid[n24Gainer * days + d1] = CELL_EMPTY;
            globalBestGrid[n24Loser * days + d1] = CELL_N24;
            for (const dm of mDays) {
              globalBestGrid[n24Gainer * days + dm] = CELL_M8;
              globalBestGrid[n24Loser * days + dm] = CELL_EMPTY;
            }
          }
        }
      }
    }
    if (!mixImproved) break;
  }

  // Grid -> Assignments dönüşümü
  const assignments: Record<string, Record<number, ShiftCode>> = { ...baseAssignments };
  for (let i = 0; i < N; i++) {
    const row: Record<number, ShiftCode> = {};
    for (let d = 0; d < days; d++) {
      const idx = i * days + d;
      const c = globalBestGrid[idx];
      if (pinnedCell[idx] && pinnedExactCode[i]?.[d] !== undefined) {
        row[d + 1] = pinnedExactCode[i][d];
      } else if (c === CELL_N24) {
        row[d + 1] = 'N24';
      } else if (c === CELL_M8) {
        row[d + 1] = 'M8';
      } else if (c === CELL_LOCKED_LEAVE) {
        row[d + 1] = leaveCodes[i][d] ?? 'YI';
      } else {
        row[d + 1] = '';
      }
    }
    assignments[activeNobetli[i].id] = row;
  }

  const evaluation = evaluateSchedule(config, nurses, preferences, assignments);
  if (onProgress) onProgress(100);

  return {
    assignments,
    summary: {
      durationMs: Date.now() - startMs,
      hardViolations: evaluation.hardViolations,
      softWarnings: evaluation.softWarnings,
      hourSpread: evaluation.hourSpread,
      preferenceSatisfactionPct: evaluation.preferenceSatisfactionPct,
      threeDayGapMin: evaluation.threeDayGapMin,
      threeDayGapMax: evaluation.threeDayGapMax,
      extraMesaiDays,
      seed,
    },
  };
}
