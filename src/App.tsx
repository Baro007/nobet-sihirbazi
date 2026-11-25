import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, Loader2 } from 'lucide-react';
import { AdminSettingsView } from './components/AdminSettingsView';
import { AppTab, Header } from './components/Header';
import { PreferenceView, RegisterAndSaveParams } from './components/PreferenceView';
import { ScheduleView } from './components/ScheduleView';
import {
  foldTurkishSearch,
  getNextYearMonth,
  getPrevYearMonth,
  getSuggestedActiveYearMonth,
  toTurkishTitleCase,
} from './lib/calendar';
import { DEFAULT_YEAR_MONTH } from './lib/demoData';
import {
  buildBackupJson,
  buildOrInheritMonthConfig,
  clearAllToEmptyRoster,
  deleteNurseFromStore,
  deleteNursePreferencesForNurse,
  extractPrevMonthFairness,
  extractTailFromSchedule,
  getLocalTcMap,
  loadInitialStore,
  resetAllToDemo,
  saveActiveYearMonthToStore,
  saveMonthConfigToStore,
  saveMonthPreferencesToStore,
  saveMonthScheduleToStore,
  saveNursePreferenceToStore,
  saveNursesToStore,
  setLocalTc,
  subscribeToRealtimeUpdates,
} from './lib/storage';
import { solveSchedule, SolverInput } from './solver/scheduler';
import type { WorkerResponse } from './solver/solver.worker';
import { resolveEffectiveNurseRole } from './solver/validator';
import {
  MonthConfig,
  MonthSchedule,
  Nurse,
  NursePreference,
  ShiftCode,
} from './types/schedule';

interface ToastItem {
  id: number;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
}

const ADMIN_PIN = (import.meta.env.VITE_ADMIN_PIN as string | undefined)?.trim() || 'hemsire2026';
const ADMIN_SESSION_KEY = 'hemsire-nobet-admin-session';

function readAdminSession(): boolean {
  try {
    return sessionStorage.getItem(ADMIN_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

export const App: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [storageMode, setStorageMode] = useState<'supabase' | 'local'>('local');
  const [syncWarning, setSyncWarning] = useState<string | undefined>(undefined);

  const [yearMonth, setYearMonth] = useState(() => getSuggestedActiveYearMonth());
  const [activeDefaultYearMonth, setActiveDefaultYearMonth] = useState(() =>
    getSuggestedActiveYearMonth()
  );
  const [nurses, setNurses] = useState<Nurse[]>([]);
  const [configs, setConfigs] = useState<Record<string, MonthConfig>>({});
  const [preferencesByMonth, setPreferencesByMonth] = useState<
    Record<string, Record<string, NursePreference>>
  >({});
  const [schedulesByMonth, setSchedulesByMonth] = useState<Record<string, MonthSchedule>>({});
  const [localTcMap, setLocalTcMap] = useState<Record<string, string>>(() => getLocalTcMap());

  const [selectedNurseId, setSelectedNurseId] = useState('');
  const [activeTab, setActiveTab] = useState<AppTab>('preferences');
  const [isAdmin, setIsAdmin] = useState<boolean>(() => readAdminSession());
  const [isDark, setIsDark] = useState(() => localStorage.getItem('hemsire-dark') === '1');
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const [solving, setSolving] = useState(false);
  const [solveProgress, setSolveProgress] = useState(0);
  const workerRef = useRef<Worker | null>(null);
  const realtimeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback(
    (type: ToastItem['type'], message: string) => {
      const id = Date.now() + Math.floor(Math.random() * 1000);
      setToasts((prev) => [...prev, { id, type, message }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 5000);
    },
    []
  );

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    localStorage.setItem('hemsire-dark', isDark ? '1' : '0');
  }, [isDark]);

  const reloadStore = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const snap = await loadInitialStore();
      setNurses(snap.nurses);
      setConfigs(snap.configs);
      setPreferencesByMonth(snap.preferencesByMonth);
      setSchedulesByMonth(snap.schedulesByMonth);
      setStorageMode(snap.storageMode);
      setSyncWarning(snap.syncError);
      if (snap.activeYearMonth) {
        setActiveDefaultYearMonth(snap.activeYearMonth);
        if (!silent) {
          setYearMonth(snap.activeYearMonth);
        }
      }

      if (snap.nurses.length > 0) {
        setSelectedNurseId((prev) =>
          prev && snap.nurses.some((n) => n.id === prev) ? prev : ''
        );
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reloadStore(false);
  }, [reloadStore]);

  useEffect(() => {
    if (storageMode !== 'supabase') return;
    const scheduleDebouncedReload = () => {
      if (realtimeTimerRef.current !== null) {
        clearTimeout(realtimeTimerRef.current);
      }
      realtimeTimerRef.current = setTimeout(() => {
        realtimeTimerRef.current = null;
        void reloadStore(true);
      }, 500);
    };

    const unsub = subscribeToRealtimeUpdates(
      scheduleDebouncedReload,
      scheduleDebouncedReload,
      scheduleDebouncedReload
    );
    return () => {
      if (realtimeTimerRef.current !== null) {
        clearTimeout(realtimeTimerRef.current);
      }
      unsub();
    };
  }, [storageMode, reloadStore]);

  const activeConfig = useMemo(
    () => buildOrInheritMonthConfig(yearMonth, configs, schedulesByMonth),
    [yearMonth, configs, schedulesByMonth]
  );

  const activePreferences = useMemo(
    () => preferencesByMonth[yearMonth] ?? {},
    [preferencesByMonth, yearMonth]
  );

  const activeSchedule = schedulesByMonth[yearMonth];

  const handleUpdateConfig = async (next: MonthConfig) => {
    setConfigs((prev) => ({ ...prev, [next.yearMonth]: next }));
    try {
      await saveMonthConfigToStore(next);
    } catch (err) {
      notify('warning', `Buluta yazılamadı, yerel kaydedildi: ${String(err)}`);
    }
  };

  const handleUpdateNurses = async (next: Nurse[]) => {
    setNurses(next);
    try {
      await saveNursesToStore(next);
    } catch (err) {
      notify('warning', `Kadro buluta yazılamadı, yerel kaydedildi: ${String(err)}`);
    }
  };

  const handleDeleteNurse = async (nurseId: string) => {
    const remaining = nurses.filter((n) => n.id !== nurseId);
    setNurses(remaining);
    try {
      await deleteNurseFromStore(nurseId, remaining);
      notify('info', 'Personel listeden kaldırıldı.');
    } catch (err) {
      notify('warning', `Silme buluta işlenemedi: ${String(err)}`);
    }
  };

  const handleRegisterAndSavePreference = async ({
    existingNurseId,
    name,
    branch,
    role,
    passiveReason,
    pref,
  }: RegisterAndSaveParams): Promise<string> => {
    const rawTrimmed = name.trim();
    const cleanBranch = (branch || 'HEM').trim().toLocaleUpperCase('tr-TR');
    const folded = foldTurkishSearch(rawTrimmed);

    let target =
      (existingNurseId ? nurses.find((n) => n.id === existingNurseId) : undefined) ??
      nurses.find((n) => foldTurkishSearch(n.name) === folded);

    let isBrandNew = false;

    if (!target) {
      isBrandNew = true;
      const cleanName = toTurkishTitleCase(rawTrimmed);
      const maxOrder = nurses.reduce((m, n) => Math.max(m, n.sortOrder), 0);
      target = {
        id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: cleanName,
        branch: cleanBranch,
        role,
        passiveReason: role === 'pasif_izinli' ? passiveReason ?? 'DI' : undefined,
        sortOrder: maxOrder + 1,
        active: true,
      };
      const nextNurses = [...nurses, target];
      setNurses(nextNurses);
      try {
        await saveNursesToStore(nextNurses);
      } catch (err) {
        notify('warning', `Kayıt buluta yazılamadı, yerel saklandı: ${String(err)}`);
      }
    } else {
      // Mevcut personeli gerekirse tekrar aktif et ve branşı güncelle
      if (!target.active || target.branch !== cleanBranch) {
        const nextNurses = nurses.map((n) =>
          n.id === target!.id ? { ...n, active: true, branch: cleanBranch } : n
        );
        setNurses(nextNurses);
        try {
          await saveNursesToStore(nextNurses);
        } catch (err) {
          notify('warning', `Kayıt güncellenemedi (yerel saklandı): ${String(err)}`);
        }
      }

      // Bu ay için görev rolü değiştirildiyse aylık override uygula
      const eff = resolveEffectiveNurseRole(target, activeConfig);
      if (eff.role !== role || (role === 'pasif_izinli' && eff.passiveReason !== passiveReason)) {
        const nextOverrides = { ...activeConfig.nurseRoleOverrides };
        if (role === target.role && (role !== 'pasif_izinli' || passiveReason === target.passiveReason)) {
          delete nextOverrides[target.id];
        } else {
          nextOverrides[target.id] = {
            role,
            passiveReason: role === 'pasif_izinli' ? passiveReason ?? 'DI' : undefined,
          };
        }
        await handleUpdateConfig({ ...activeConfig, nurseRoleOverrides: nextOverrides });
      }
    }

    const fullPref: NursePreference = {
      ...pref,
      nurseId: target.id,
    };

    setPreferencesByMonth((prev) => ({
      ...prev,
      [fullPref.yearMonth]: {
        ...(prev[fullPref.yearMonth] ?? {}),
        [fullPref.nurseId]: fullPref,
      },
    }));
    setSelectedNurseId(target.id);

    try {
      await saveNursePreferenceToStore(fullPref);
      notify(
        'success',
        isBrandNew
          ? `Hoş geldiniz ${target.name}! Listeye eklendiniz ve tercihleriniz kaydedildi.`
          : `${target.name} — tercihleriniz kaydedildi!`
      );
    } catch (err) {
      notify('warning', `Bulut hatası — tercih yerelde saklandı: ${String(err)}`);
    }

    return target.id;
  };

  const handleUpdateAssignments = async (nextAssignments: Record<string, Record<number, ShiftCode>>) => {
    const updated: MonthSchedule = {
      yearMonth,
      assignments: nextAssignments,
      lockedCells: activeSchedule?.lockedCells,
      status: activeSchedule?.status ?? 'draft',
      updatedAt: new Date().toISOString(),
      solverStats: activeSchedule?.solverStats,
    };
    setSchedulesByMonth((prev) => ({ ...prev, [yearMonth]: updated }));
    try {
      await saveMonthScheduleToStore(updated);
    } catch (err) {
      notify('warning', `Çizelge yerelde güncellendi (bulut hatası): ${String(err)}`);
    }
  };

  const handleTogglePublish = async () => {
    if (!activeSchedule) return;
    const currentlyPublished = (activeSchedule.status ?? 'published') === 'published';
    const nextStatus: MonthSchedule['status'] = currentlyPublished ? 'draft' : 'published';
    const updated: MonthSchedule = {
      ...activeSchedule,
      status: nextStatus,
      updatedAt: new Date().toISOString(),
    };
    setSchedulesByMonth((prev) => ({ ...prev, [yearMonth]: updated }));
    try {
      await saveMonthScheduleToStore(updated);
      notify(
        'success',
        nextStatus === 'published'
          ? `${yearMonth} çizelgesi servise yayınlandı!`
          : 'Çizelge taslak moduna çekildi (yalnızca sorumlu görebilir).'
      );
    } catch (err) {
      notify('warning', `Durum yerelde güncellendi: ${String(err)}`);
    }
  };

  const handleTogglePinCell = async (nurseId: string, day: number) => {
    if (!activeSchedule) return;
    const curLocks = { ...(activeSchedule.lockedCells ?? {}) };
    const existing = new Set(curLocks[nurseId] ?? []);
    if (existing.has(day)) {
      existing.delete(day);
    } else {
      existing.add(day);
    }
    if (existing.size === 0) {
      delete curLocks[nurseId];
    } else {
      curLocks[nurseId] = Array.from(existing).sort((a, b) => a - b);
    }
    const updated: MonthSchedule = {
      ...activeSchedule,
      lockedCells: curLocks,
      updatedAt: new Date().toISOString(),
    };
    setSchedulesByMonth((prev) => ({ ...prev, [yearMonth]: updated }));
    try {
      await saveMonthScheduleToStore(updated);
    } catch {
      // Yerel state güncel
    }
  };

  const handleClearPins = async () => {
    if (!activeSchedule) return;
    const updated: MonthSchedule = {
      ...activeSchedule,
      lockedCells: {},
      updatedAt: new Date().toISOString(),
    };
    setSchedulesByMonth((prev) => ({ ...prev, [yearMonth]: updated }));
    notify('info', 'Tüm sabitlenen hücreler temizlendi.');
    try {
      await saveMonthScheduleToStore(updated);
    } catch {
      // Yerel state güncel
    }
  };

  const handleSetActiveDefaultYearMonth = async (ym: string) => {
    setActiveDefaultYearMonth(ym);
    try {
      await saveActiveYearMonthToStore(ym);
      notify('success', `${ym} ayı ekip için varsayılan açılış ayı yapıldı.`);
    } catch (err) {
      notify('warning', `Yerelde güncellendi (bulut hatası): ${String(err)}`);
    }
  };

  const handleMergeNurses = async (sourceId: string, targetId: string) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    const sourceNurse = nurses.find((n) => n.id === sourceId);
    const targetNurse = nurses.find((n) => n.id === targetId);
    if (!sourceNurse || !targetNurse) return;

    const unionSorted = (a?: number[], b?: number[]): number[] =>
      Array.from(new Set([...(a ?? []), ...(b ?? [])])).sort((x, y) => x - y);

    const nextPrefsByMonth = { ...preferencesByMonth };
    const updatedTargetPrefs: NursePreference[] = [];

    for (const [ym, pMap] of Object.entries(nextPrefsByMonth)) {
      const srcPref = pMap[sourceId];
      if (!srcPref) continue;
      const tgtPref = pMap[targetId];
      const nextMonthMap = { ...pMap };
      delete nextMonthMap[sourceId];

      let mergedPref: NursePreference;
      if (!tgtPref) {
        mergedPref = { ...srcPref, nurseId: targetId };
      } else {
        const tgtNote = tgtPref.notes?.trim() ?? '';
        const srcNote = srcPref.notes?.trim() ?? '';
        const mergedNotes =
          tgtNote && srcNote && tgtNote !== srcNote ? `${tgtNote} | ${srcNote}` : tgtNote || srcNote;
        const bridges = [...(tgtPref.bridgeLeaveRequests ?? [])];
        for (const br of srcPref.bridgeLeaveRequests ?? []) {
          if (!bridges.some((x) => x.startDay === br.startDay)) bridges.push(br);
        }
        mergedPref = {
          yearMonth: ym,
          nurseId: targetId,
          positiveNobetDays: unionSorted(tgtPref.positiveNobetDays, srcPref.positiveNobetDays),
          positiveMesaiDays: unionSorted(tgtPref.positiveMesaiDays, srcPref.positiveMesaiDays),
          negativeDays: unionSorted(tgtPref.negativeDays, srcPref.negativeDays),
          softNegativeDays: unionSorted(tgtPref.softNegativeDays, srcPref.softNegativeDays),
          leaveDays: { ...(srcPref.leaveDays ?? {}), ...(tgtPref.leaveDays ?? {}) },
          bridgeLeaveRequests: bridges,
          notes: mergedNotes,
          updatedAt: tgtPref.updatedAt || srcPref.updatedAt,
        };
      }
      nextMonthMap[targetId] = mergedPref;
      nextPrefsByMonth[ym] = nextMonthMap;
      updatedTargetPrefs.push(mergedPref);
    }

    const nextSchedules = { ...schedulesByMonth };
    const modifiedSchedules: MonthSchedule[] = [];
    for (const [ym, sch] of Object.entries(nextSchedules)) {
      const srcRow = sch.assignments[sourceId];
      const srcLocks = sch.lockedCells?.[sourceId];
      if (!srcRow && !srcLocks) continue;

      const nextAssign = { ...sch.assignments };
      if (srcRow) {
        const tgtRow = { ...(nextAssign[targetId] ?? {}) };
        for (const [dStr, code] of Object.entries(srcRow)) {
          const d = Number(dStr);
          if (code && !tgtRow[d]) tgtRow[d] = code;
        }
        nextAssign[targetId] = tgtRow;
        delete nextAssign[sourceId];
      }

      const nextLocks = { ...(sch.lockedCells ?? {}) };
      if (srcLocks) {
        nextLocks[targetId] = unionSorted(nextLocks[targetId], srcLocks);
        delete nextLocks[sourceId];
      }

      const updatedSch: MonthSchedule = {
        ...sch,
        assignments: nextAssign,
        lockedCells: nextLocks,
        updatedAt: new Date().toISOString(),
      };
      nextSchedules[ym] = updatedSch;
      modifiedSchedules.push(updatedSch);
    }

    const nextConfigs = { ...configs };
    const modifiedConfigs: MonthConfig[] = [];
    for (const [ym, cfg] of Object.entries(nextConfigs)) {
      let changed = false;
      const tail = { ...cfg.prevMonthTail };
      if (tail[sourceId]) {
        if (!tail[targetId]) tail[targetId] = tail[sourceId];
        delete tail[sourceId];
        changed = true;
      }
      const overrides = { ...cfg.nurseRoleOverrides };
      if (overrides[sourceId]) {
        if (!overrides[targetId]) overrides[targetId] = overrides[sourceId];
        delete overrides[sourceId];
        changed = true;
      }
      let pairRules = cfg.pairRules;
      if (pairRules && pairRules.some((r) => r.nurseAId === sourceId || r.nurseBId === sourceId)) {
        pairRules = pairRules
          .map((r) => ({
            ...r,
            nurseAId: r.nurseAId === sourceId ? targetId : r.nurseAId,
            nurseBId: r.nurseBId === sourceId ? targetId : r.nurseBId,
          }))
          .filter((r) => r.nurseAId !== r.nurseBId);
        changed = true;
      }
      if (changed) {
        const updatedCfg: MonthConfig = {
          ...cfg,
          prevMonthTail: tail,
          nurseRoleOverrides: overrides,
          pairRules,
        };
        nextConfigs[ym] = updatedCfg;
        modifiedConfigs.push(updatedCfg);
      }
    }

    const remainingNurses = nurses.filter((n) => n.id !== sourceId);
    setPreferencesByMonth(nextPrefsByMonth);
    setSchedulesByMonth(nextSchedules);
    setConfigs(nextConfigs);
    setNurses(remainingNurses);
    if (selectedNurseId === sourceId) setSelectedNurseId(targetId);

    try {
      for (const p of updatedTargetPrefs) await saveNursePreferenceToStore(p);
      await deleteNursePreferencesForNurse(sourceId);
      for (const sch of modifiedSchedules) await saveMonthScheduleToStore(sch);
      for (const cfg of modifiedConfigs) await saveMonthConfigToStore(cfg);
      await deleteNurseFromStore(sourceId, remainingNurses);
      notify('success', `"${sourceNurse.name}" kaydı "${targetNurse.name}" ile birleştirildi.`);
    } catch (err) {
      notify('warning', `Birleştirme yerelde tamamlandı (bulut hatası): ${String(err)}`);
    }
  };

  const handleSolve = (newSeed = false) => {
    if (solving) return;
    if (activeSchedule && (activeSchedule.status ?? 'published') === 'published') {
      const confirmed = window.confirm(
        `${yearMonth} çizelgesi şu an servise YAYINDA. Üzerine yeni otomatik plan yazılırsa servisteki herkesin gördüğü liste değişecektir. Devam etmek istiyor musunuz?`
      );
      if (!confirmed) return;
    }
    setSolving(true);
    setSolveProgress(5);

    const prevYm = getPrevYearMonth(yearMonth);
    const prevFairness = extractPrevMonthFairness(
      prevYm,
      configs,
      nurses,
      preferencesByMonth,
      schedulesByMonth
    );

    const lockedAssignments: Record<string, Record<number, ShiftCode>> = {};
    if (activeSchedule?.lockedCells) {
      for (const [nid, daysArr] of Object.entries(activeSchedule.lockedCells)) {
        if (!daysArr || daysArr.length === 0) continue;
        const row: Record<number, ShiftCode> = {};
        for (const d of daysArr) {
          row[d] = activeSchedule.assignments[nid]?.[d] ?? '';
        }
        lockedAssignments[nid] = row;
      }
    }

    const payload: SolverInput = {
      config: activeConfig,
      nurses,
      preferences: activePreferences,
      prevMonthFairness: prevFairness,
      lockedAssignments,
      seed: newSeed ? Math.floor(Math.random() * 999_999_999) + 1 : 202612,
    };

    const finishWithResult = async (result: ReturnType<typeof solveSchedule>) => {
      const nextSchedule: MonthSchedule = {
        yearMonth,
        assignments: result.assignments,
        lockedCells: activeSchedule?.lockedCells,
        status: activeSchedule?.status === 'published' ? 'published' : 'draft',
        updatedAt: new Date().toISOString(),
        solverStats: result.summary,
      };
      setSchedulesByMonth((prev) => ({ ...prev, [yearMonth]: nextSchedule }));
      setSolving(false);
      setSolveProgress(100);
      try {
        await saveMonthConfigToStore(activeConfig);
        await saveMonthScheduleToStore(nextSchedule);
        notify(
          result.summary.hardViolations === 0 ? 'success' : 'warning',
          `Çizelge ${result.summary.durationMs} ms'de oluşturuldu (${result.summary.hardViolations} sert ihlal, ${result.summary.hourSpread} s fark).`
        );
      } catch {
        notify('warning', 'Çizelge oluşturuldu ve yerelde kaydedildi.');
      }
    };

    try {
      if (workerRef.current) workerRef.current.terminate();
      const worker = new Worker(new URL('./solver/solver.worker.ts', import.meta.url), {
        type: 'module',
      });
      workerRef.current = worker;

      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const msg = event.data;
        if (msg.type === 'progress') {
          setSolveProgress(msg.pct);
        } else if (msg.type === 'result') {
          worker.terminate();
          workerRef.current = null;
          void finishWithResult(msg.result);
        } else if (msg.type === 'error') {
          worker.terminate();
          workerRef.current = null;
          setSolving(false);
          notify('error', `Çözücü hatası: ${msg.message}`);
        }
      };

      worker.onerror = () => {
        worker.terminate();
        workerRef.current = null;
        // Web Worker başarısız olursa ana iş parçacığında yedek çalıştır
        const res = solveSchedule(payload);
        void finishWithResult(res);
      };

      worker.postMessage({ type: 'solve', payload });
    } catch {
      const res = solveSchedule(payload);
      void finishWithResult(res);
    }
  };

  const handlePullPrevMonthTail = async () => {
    const prevYm = getPrevYearMonth(yearMonth);
    const prevSched = schedulesByMonth[prevYm];
    if (!prevSched) return;
    const tail = extractTailFromSchedule(prevYm, prevSched);
    await handleUpdateConfig({ ...activeConfig, prevMonthTail: tail });
    notify('success', `${prevYm} çizelgesinin son 3 günü devredildi.`);
  };

  const handleAdminLogin = (pin: string): boolean => {
    if (pin.trim() === ADMIN_PIN) {
      setIsAdmin(true);
      try {
        sessionStorage.setItem(ADMIN_SESSION_KEY, '1');
      } catch {
        // Sessiz geçilir
      }
      notify('success', 'Sorumlu hemşire oturumu açıldı.');
      return true;
    }
    notify('error', 'Hatalı yönetici şifresi!');
    return false;
  };

  const handleExportBackup = () => {
    const json = buildBackupJson({
      nurses,
      configs,
      preferencesByMonth,
      schedulesByMonth,
    });
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hemsire-nobet-yedek-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    notify('success', 'JSON yedek dosyası indirildi.');
  };

  const handleImportBackup = async (jsonText: string) => {
    try {
      const parsed = JSON.parse(jsonText) as {
        nurses?: Nurse[];
        configs?: Record<string, MonthConfig>;
        preferencesByMonth?: Record<string, Record<string, NursePreference>>;
        schedulesByMonth?: Record<string, MonthSchedule>;
      };
      if (!Array.isArray(parsed.nurses)) throw new Error('Geçersiz yedek dosyası');

      setNurses(parsed.nurses);
      await saveNursesToStore(parsed.nurses);

      if (parsed.configs) {
        setConfigs(parsed.configs);
        for (const cfg of Object.values(parsed.configs)) {
          await saveMonthConfigToStore(cfg);
        }
      }
      if (parsed.preferencesByMonth) {
        setPreferencesByMonth(parsed.preferencesByMonth);
        for (const [ym, pMap] of Object.entries(parsed.preferencesByMonth)) {
          await saveMonthPreferencesToStore(ym, pMap);
        }
      }
      if (parsed.schedulesByMonth) {
        setSchedulesByMonth(parsed.schedulesByMonth);
        for (const sch of Object.values(parsed.schedulesByMonth)) {
          await saveMonthScheduleToStore(sch);
        }
      }
      notify('success', 'Yedek başarıyla geri yüklendi!');
    } catch (err) {
      notify(
        'error',
        `Yedek yüklenemedi: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  };

  const handleResetDemo = async () => {
    const snap = await resetAllToDemo();
    setNurses(snap.nurses);
    setConfigs(snap.configs);
    setPreferencesByMonth(snap.preferencesByMonth);
    setSchedulesByMonth(snap.schedulesByMonth);
    setYearMonth(DEFAULT_YEAR_MONTH);
    setSelectedNurseId(snap.nurses[0]?.id ?? '');
    notify('success', 'Örnek Nefroloji demo verisi yeniden yüklendi.');
  };

  const handleClearAllForRealRoster = async () => {
    const snap = await clearAllToEmptyRoster(yearMonth);
    setNurses(snap.nurses);
    setConfigs(snap.configs);
    setPreferencesByMonth(snap.preferencesByMonth);
    setSchedulesByMonth(snap.schedulesByMonth);
    setSelectedNurseId('');
    notify('info', 'Demo verisi temizlendi. Artık gerçek kadronuzu ekleyebilirsiniz.');
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="text-center">
          <Loader2 className="mx-auto mb-3 h-10 w-10 animate-spin text-indigo-600" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            HemşireNöbet Yükleniyor...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Toast Bildirimleri */}
      <div className="no-print fixed bottom-4 right-4 z-50 flex max-w-sm flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-center gap-2 rounded-xl px-4 py-3 text-xs font-semibold text-white shadow-lg ${
              t.type === 'success'
                ? 'bg-emerald-600'
                : t.type === 'error'
                ? 'bg-rose-600'
                : t.type === 'warning'
                ? 'bg-amber-600'
                : 'bg-indigo-600'
            }`}
          >
            {t.type === 'success' && <CheckCircle2 className="h-4 w-4 shrink-0" />}
            {(t.type === 'error' || t.type === 'warning') && (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            {t.type === 'info' && <Info className="h-4 w-4 shrink-0" />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>

      <Header
        yearMonth={yearMonth}
        clinicName={activeConfig.clinicName}
        storageMode={storageMode}
        isDark={isDark}
        onToggleDark={() => setIsDark((d) => !d)}
        isAdmin={isAdmin}
        onAdminLogin={handleAdminLogin}
        onAdminLogout={() => {
          setIsAdmin(false);
          try {
            sessionStorage.removeItem(ADMIN_SESSION_KEY);
          } catch {
            // Sessiz geçilir
          }
          if (activeTab === 'admin') setActiveTab('preferences');
        }}
        onPrevMonth={() => setYearMonth((ym) => getPrevYearMonth(ym))}
        onNextMonth={() => setYearMonth((ym) => getNextYearMonth(ym))}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        hasSchedule={
          isAdmin
            ? Boolean(activeSchedule)
            : Boolean(activeSchedule && (activeSchedule.status ?? 'published') === 'published')
        }
      />

      <main className="mx-auto max-w-7xl px-3 py-6 sm:px-6 lg:px-8">
        {syncWarning && (
          <div className="no-print mb-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            <strong>Senkronizasyon Notu:</strong> {syncWarning}
          </div>
        )}

        {nurses.length === 0 && activeTab !== 'admin' && (
          <div className="no-print mb-5 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-xs text-indigo-900 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200">
            {isAdmin
              ? 'Henüz kayıtlı hemşire yok — ekip üyeleri kendi adını yazıp kaydettikçe liste otomatik oluşur veya Kadro sekmesinden toplu ekleyebilirsiniz.'
              : 'Hoş geldiniz! Aşağıya adınızı yazıp takvimden tercihlerinizi seçtikten sonra "Tercihleri Kaydet" butonuna basmanız yeterlidir.'}
          </div>
        )}

        {activeTab === 'preferences' && (
          <PreferenceView
            config={activeConfig}
            nurses={nurses}
            preferences={activePreferences}
            selectedNurseId={selectedNurseId}
            onSelectNurseId={setSelectedNurseId}
            onRegisterAndSavePreference={handleRegisterAndSavePreference}
            isAdmin={isAdmin}
          />
        )}

        {activeTab === 'schedule' && (
          <ScheduleView
            config={activeConfig}
            nurses={nurses}
            preferences={activePreferences}
            schedule={activeSchedule}
            localTcMap={localTcMap}
            selectedNurseId={selectedNurseId}
            onSelectNurseId={setSelectedNurseId}
            isAdmin={isAdmin}
            solving={solving}
            solveProgress={solveProgress}
            onSolve={handleSolve}
            onUpdateAssignments={handleUpdateAssignments}
            onTogglePublish={() => void handleTogglePublish()}
            onTogglePinCell={(nid, d) => void handleTogglePinCell(nid, d)}
            onClearPins={() => void handleClearPins()}
            onNotify={notify}
          />
        )}

        {activeTab === 'admin' && isAdmin && (
          <AdminSettingsView
            config={activeConfig}
            nurses={nurses}
            preferences={activePreferences}
            localTcMap={localTcMap}
            hasPrevMonthSchedule={Boolean(schedulesByMonth[getPrevYearMonth(yearMonth)])}
            activeDefaultYearMonth={activeDefaultYearMonth}
            onSetActiveDefaultYearMonth={handleSetActiveDefaultYearMonth}
            onUpdateConfig={handleUpdateConfig}
            onUpdateNurses={handleUpdateNurses}
            onDeleteNurse={handleDeleteNurse}
            onMergeNurses={handleMergeNurses}
            onUpdateLocalTc={(nurseId, tcNo) => setLocalTcMap(setLocalTc(nurseId, tcNo))}
            onPullPrevMonthTail={handlePullPrevMonthTail}
            onExportBackup={handleExportBackup}
            onImportBackup={handleImportBackup}
            onResetDemo={handleResetDemo}
            onClearAllForRealRoster={handleClearAllForRealRoster}
          />
        )}
      </main>
    </div>
  );
};

export default App;
