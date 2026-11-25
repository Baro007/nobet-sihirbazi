import {
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

  let extraMesaiDays: number[] = [];
  if (config.autoTopUpUnderHours && totalRequiredHours < totalTargetHours) {
    const extraNeeded = Math.ceil((totalTargetHours - totalRequiredHours) / 8);
    extraMesaiDays = selectExtraMesaiDays(config, activeNobetli, preferences, days, extraNeeded);
    for (const d of extraMesaiDays) {
      dailyM8[d - 1] += 1;
    }
  }

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
  const leaveCodes: Record<number, Record<number, ShiftCode>> = {};
  const pinnedExactCode: Record<number, Record<number, ShiftCode>> = {};

  // Önceki ay son 3 gün (tail): [d-2, d-1, d0]
  // Encode: 1 = N24/N16, 2 = M8/S8, 0 = boş/izin
  const tailType = new Int8Array(N * 3);
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

    const tail = config.prevMonthTail?.[nid] ?? ['', '', ''];
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
  const overtimeArr = new Int32Array(N);
  const wkTotalArr = new Int32Array(N);
  const wkNobetArr = new Int32Array(N);
  const nobetCntArr = new Int32Array(N);
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
    let sumOvertime = 0;
    let minOt = 1e9;
    let maxOt = -1e9;
    let minWkTot = 1e9;
    let maxWkTot = -1e9;
    let minWkNob = 1e9;
    let maxWkNob = -1e9;
    let minNobCnt = 1e9;
    let maxNobCnt = -1e9;
    let minGap = 1e9;
    let maxGap = -1e9;

    for (let i = 0; i < N; i++) {
      const base = i * days;
      const t1 = tailType[i * 3 + 1];
      const t2 = tailType[i * 3 + 2];

      let worked = 0;
      let nobetCnt = 0;
      let wkNobet = 0;
      let wkTotal = 0;
      let gapCnt = 0;
      let consecMesai = 0;
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
            cost += 3800;
          }
        }
      }
      if (t1 === CELL_N24) {
        if (c0 === CELL_N24) {
          cost += 120000;
          viol = 1;
        } else if (c0 === CELL_M8) {
          cost += 3800;
        }
      }

      for (let d = 0; d < days; d++) {
        const idx = base + d;
        const c = grid[idx];

        if (c === CELL_N24) {
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
            cost += 30000;
            viol = 1;
          } else if (softNeg[idx]) {
            cost += 450;
          }
          if (posMesai[idx]) {
            cost += 22000;
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
              cost += 3800;
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
          worked += 8;
          consecMesai++;
          if (consecMesai > 3) cost += 250;
          if (d + 1 < days && grid[idx + 1] === CELL_N24) {
            cost += 80; // Mesai ertesi hemen nöbet hafif kaçınma
          }
          if (isHolOrWknd[d]) wkTotal++;
          if (isBayram[d] && carryYearBayram[i] > 0) {
            cost += carryYearBayram[i] * 900;
          }
          if (hardNeg[idx]) {
            cost += 30000;
            viol = 1;
          } else if (softNeg[idx]) {
            cost += 450;
          }
          if (bridgeThursday[idx]) {
            cost += 4500; // Köprüleme Perşembesine N24 yerine M8 düşmesin
          } else if (posNobet[idx]) {
            cost += 950;
          }
        } else {
          consecMesai = 0;
          if (bridgeThursday[idx]) {
            cost += 4500;
          } else if (posNobet[idx]) {
            cost += 950;
          }
          if (posMesai[idx]) {
            cost += 1350;
          }
        }
      }

      nurseHasViol[i] = viol;
      const ot = worked - targetHours[i];
      overtimeArr[i] = ot;
      wkTotalArr[i] = wkTotal;
      wkNobetArr[i] = wkNobet;
      nobetCntArr[i] = nobetCnt;
      gapCntArr[i] = gapCnt;

      if (canFillTotalTarget && ot < 0) {
        cost += ((-ot) / 8) * 1800;
      }

      sumOvertime += ot;
      if (ot < minOt) minOt = ot;
      if (ot > maxOt) maxOt = ot;

      if (wkTotal < minWkTot) minWkTot = wkTotal;
      if (wkTotal > maxWkTot) maxWkTot = wkTotal;

      if (wkNobet < minWkNob) minWkNob = wkNobet;
      if (wkNobet > maxWkNob) maxWkNob = wkNobet;

      if (nobetCnt < minNobCnt) minNobCnt = nobetCnt;
      if (nobetCnt > maxNobCnt) maxNobCnt = nobetCnt;

      if (!hasSignificantLeave[i]) {
        if (gapCnt < minGap) minGap = gapCnt;
        if (gapCnt > maxGap) maxGap = gapCnt;
        if (gapCnt === 0) {
          cost += 1400; // En az 1 tane 3 günlük boşluk güçlü teşvik
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

    const meanOt = sumOvertime / N;
    let varSum = 0;
    for (let i = 0; i < N; i++) {
      const diff = overtimeArr[i] - meanOt;
      varSum += diff * diff;
    }

    const hourSpread = maxOt - minOt;
    if (hourSpread > 8) {
      cost += (hourSpread - 8) * 950;
    }
    if (hourSpread > 16) {
      cost += (hourSpread - 16) * 3500;
    }
    cost += varSum * 18;

    const wkNobSpread = maxWkNob - minWkNob;
    const wkTotSpread = maxWkTot - minWkTot;
    cost += wkNobSpread * wkNobSpread * 850;
    cost += wkTotSpread * wkTotSpread * 420;

    const nobSpread = maxNobCnt - minNobCnt;
    cost += nobSpread * nobSpread * 240;

    if (minGap <= maxGap) {
      const gapSpread = maxGap - minGap;
      cost += gapSpread * gapSpread * 350;
    }

    for (let p = 0; p < pairRuleIndices.length; p++) {
      const rule = pairRuleIndices[p];
      const baseA = rule.a * days;
      const baseB = rule.b * days;
      for (let d = 0; d < days; d++) {
        const aNob = grid[baseA + d] === CELL_N24;
        const bNob = grid[baseB + d] === CELL_N24;
        if (rule.type === 'separate') {
          if (aNob && bNob) cost += 6500;
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

    // Gün sırasını restart'a göre hafif çeşitlendir (veya kronolojik)
    const dayOrder = Array.from({ length: days }, (_, d) => d);
    if (restartIdx % 2 === 1) {
      dayOrder.reverse();
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

          const otA = hoursSoFar[a] - targetHours[a] + (isHolOrWknd[d] ? wkSoFar[a] * 8 : 0);
          const otB = hoursSoFar[b] - targetHours[b] + (isHolOrWknd[d] ? wkSoFar[b] * 8 : 0);
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

          const otA = hoursSoFar[a] - targetHours[a];
          const otB = hoursSoFar[b] - targetHours[b];
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

  const restarts = input.restarts ?? 6;
  const iterationsPerRestart = input.iterationsPerRestart ?? 35000;
  let globalBestGrid = new Int8Array(N * days);
  let globalBestCost = Infinity;

  for (let r = 0; r < restarts; r++) {
    const grid = buildInitialGrid(r);
    let currentCost = evaluateGridCost(grid);
    let restartBestGrid = new Int8Array(grid);
    let restartBestCost = currentCost;

    const tStart = 4500;
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

      if (moveRoll < 0.28) {
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
      } else if (moveRoll < 0.72) {
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
      } else {
        // Çapraz iki gün 2-opt takası (saat toplamlarını koruyarak boşluk & hafta sonu & tercih iyileştirir)
        d1 = Math.floor(rng() * days);
        d2 = Math.floor(rng() * days);
        if (d1 !== d2 && unlockedByDay[d1].length >= 2 && unlockedByDay[d2].length >= 2) {
          a = Math.floor(rng() * N);
          b = Math.floor(rng() * N);
          const idxA1 = a * days + d1;
          const idxB1 = b * days + d1;
          const idxA2 = a * days + d2;
          const idxB2 = b * days + d2;
          if (
            a !== b &&
            !lockedLeave[idxA1] &&
            !lockedLeave[idxB1] &&
            !lockedLeave[idxA2] &&
            !lockedLeave[idxB2] &&
            !pinnedCell[idxA1] &&
            !pinnedCell[idxB1] &&
            !pinnedCell[idxA2] &&
            !pinnedCell[idxB2]
          ) {
            prevA1 = grid[idxA1];
            prevB1 = grid[idxB1];
            prevA2 = grid[idxA2];
            prevB2 = grid[idxB2];
            if (prevA1 === prevB2 && prevB1 === prevA2 && prevA1 !== prevB1) {
              undoType = 2;
              grid[idxA1] = prevB1;
              grid[idxB1] = prevA1;
              grid[idxA2] = prevB2;
              grid[idxB2] = prevA2;
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
