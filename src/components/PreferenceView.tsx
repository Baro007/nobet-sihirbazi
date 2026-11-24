import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarPlus,
  CheckCircle2,
  Lock,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import {
  buildFiveDayBridgeLeave,
  computeNurseTargetHours,
  foldTurkishSearch,
  formatMonthLabelTR,
  getDayOfWeek,
  getDaysInMonth,
  getMondaysInMonth,
  isHolidayOrWeekend,
  TURKISH_WEEKDAYS_FULL,
} from '../lib/calendar';
import { resolveEffectiveNurseRole } from '../solver/validator';
import {
  LeaveCode,
  MonthConfig,
  Nurse,
  NursePreference,
  NurseRole,
  PassiveReason,
} from '../types/schedule';

type BrushMode = 'positive' | 'negative' | 'softNegative' | 'leave';

export interface RegisterAndSaveParams {
  existingNurseId?: string;
  name: string;
  branch?: string;
  role: NurseRole;
  passiveReason?: PassiveReason;
  pref: Omit<NursePreference, 'nurseId'>;
}

interface PreferenceViewProps {
  config: MonthConfig;
  nurses: Nurse[];
  preferences: Record<string, NursePreference>;
  selectedNurseId: string;
  onSelectNurseId: (id: string) => void;
  onRegisterAndSavePreference: (params: RegisterAndSaveParams) => Promise<string>;
  isAdmin: boolean;
}

const WEEKDAY_HEADERS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

function makeEmptyPreference(yearMonth: string, nurseId: string): NursePreference {
  return {
    yearMonth,
    nurseId,
    positiveNobetDays: [],
    negativeDays: [],
    softNegativeDays: [],
    leaveDays: {},
    bridgeLeaveRequests: [],
    notes: '',
    updatedAt: '',
  };
}

export const PreferenceView: React.FC<PreferenceViewProps> = ({
  config,
  nurses,
  preferences,
  selectedNurseId,
  onSelectNurseId,
  onRegisterAndSavePreference,
  isAdmin,
}) => {
  const sortedNurses = useMemo(
    () => [...nurses].sort((a, b) => a.sortOrder - b.sortOrder),
    [nurses]
  );

  const activeWorkingNurses = useMemo(
    () =>
      sortedNurses
        .filter((n) => n.active)
        .filter((n) => resolveEffectiveNurseRole(n, config).role !== 'pasif_izinli'),
    [sortedNurses, config]
  );

  const selectedNurse = useMemo(
    () => sortedNurses.find((n) => n.id === selectedNurseId) ?? null,
    [sortedNurses, selectedNurseId]
  );

  const [nameInput, setNameInput] = useState(selectedNurse?.name ?? '');
  const [branchInput, setBranchInput] = useState(selectedNurse?.branch ?? 'HEM');
  const [roleInput, setRoleInput] = useState<NurseRole>(
    selectedNurse ? resolveEffectiveNurseRole(selectedNurse, config).role : 'nobetli'
  );
  const [passiveReasonInput, setPassiveReasonInput] = useState<PassiveReason>(
    selectedNurse ? resolveEffectiveNurseRole(selectedNurse, config).passiveReason ?? 'DI' : 'DI'
  );
  const [showRoleOptions, setShowRoleOptions] = useState(false);
  const [justSavedName, setJustSavedName] = useState<string | null>(null);
  const [nameError, setNameError] = useState('');

  const [draft, setDraft] = useState<NursePreference>(() =>
    selectedNurse && preferences[selectedNurse.id]
      ? preferences[selectedNurse.id]
      : makeEmptyPreference(config.yearMonth, selectedNurse?.id ?? '')
  );
  const [brush, setBrush] = useState<BrushMode>('positive');
  const [leaveSubtype, setLeaveSubtype] = useState<LeaveCode>('YI');
  const [showBridgeBox, setShowBridgeBox] = useState(false);
  const [bridgeMonday, setBridgeMonday] = useState<number>(() => {
    const mondays = getMondaysInMonth(config.yearMonth);
    return mondays[1] ?? mondays[0] ?? 1;
  });
  const [bridgeWithThu, setBridgeWithThu] = useState(true);
  const [saving, setSaving] = useState(false);

  const prevSelectedRef = useRef<{ id: string; ym: string }>({
    id: selectedNurseId,
    ym: config.yearMonth,
  });

  // Seçili hemşire veya ay değiştiğinde taslak ve rol bilgilerini güncelle;
  // ancak kullanıcı yeni bir isim yazarken dokunduğu günleri sıfırlama.
  useEffect(() => {
    const prev = prevSelectedRef.current;
    const ymChanged = prev.ym !== config.yearMonth;
    const idChanged = prev.id !== selectedNurseId;

    if (idChanged || ymChanged) {
      prevSelectedRef.current = { id: selectedNurseId, ym: config.yearMonth };
      setJustSavedName(null);
      if (selectedNurse) {
        setNameInput(selectedNurse.name);
        const nextBranch = selectedNurse.branch || 'HEM';
        setBranchInput(nextBranch);
        const eff = resolveEffectiveNurseRole(selectedNurse, config);
        setRoleInput(eff.role);
        setPassiveReasonInput(eff.passiveReason ?? 'DI');
        if (eff.role !== 'nobetli' || nextBranch !== 'HEM') {
          setShowRoleOptions(true);
        }
        setDraft(
          preferences[selectedNurse.id] ??
            makeEmptyPreference(config.yearMonth, selectedNurse.id)
        );
      } else if (ymChanged) {
        setDraft(makeEmptyPreference(config.yearMonth, ''));
      }
    }
  }, [selectedNurseId, selectedNurse, config, preferences]);

  useEffect(() => {
    const mondays = getMondaysInMonth(config.yearMonth);
    setBridgeMonday(mondays[1] ?? mondays[0] ?? 1);
  }, [config.yearMonth]);

  const foldedQuery = foldTurkishSearch(nameInput);

  const exactMatchNurse = useMemo(() => {
    if (!foldedQuery) return null;
    return sortedNurses.find((n) => foldTurkishSearch(n.name) === foldedQuery) ?? null;
  }, [sortedNurses, foldedQuery]);

  const filteredChips = useMemo(() => {
    if (!foldedQuery) return activeWorkingNurses;
    return sortedNurses.filter((n) => foldTurkishSearch(n.name).includes(foldedQuery));
  }, [activeWorkingNurses, sortedNurses, foldedQuery]);

  const daysInMonth = getDaysInMonth(config.yearMonth);
  const mondays = useMemo(() => getMondaysInMonth(config.yearMonth), [config.yearMonth]);
  const firstDayDow = getDayOfWeek(config.yearMonth, 1);
  const leadingEmptyCells = firstDayDow === 0 ? 6 : firstDayDow - 1;

  const effectiveId = selectedNurse?.id ?? exactMatchNurse?.id ?? '';

  const crowdByDay = useMemo(() => {
    const posCounts: Record<number, number> = {};
    const negCounts: Record<number, number> = {};
    for (const n of activeWorkingNurses) {
      if (n.id === effectiveId) continue;
      const p = preferences[n.id];
      if (!p) continue;
      for (const d of p.positiveNobetDays) posCounts[d] = (posCounts[d] ?? 0) + 1;
      for (const d of p.negativeDays) negCounts[d] = (negCounts[d] ?? 0) + 1;
      for (const dStr of Object.keys(p.leaveDays)) {
        const d = Number(dStr);
        negCounts[d] = (negCounts[d] ?? 0) + 1;
      }
    }
    return { posCounts, negCounts };
  }, [activeWorkingNurses, preferences, effectiveId]);

  const isLockedForUser = config.preferencesLocked && !isAdmin;

  const handleNameChange = (value: string) => {
    setNameInput(value);
    setNameError('');
    setJustSavedName(null);
    const folded = foldTurkishSearch(value);
    if (!folded) {
      if (selectedNurseId) onSelectNurseId('');
      return;
    }
    const exact = sortedNurses.find((n) => foldTurkishSearch(n.name) === folded);
    if (exact) {
      if (exact.id !== selectedNurseId) onSelectNurseId(exact.id);
    } else if (selectedNurseId) {
      // Mevcut seçimi bırak ama kullanıcının takvimde tıklamış olduğu taslağı koru
      prevSelectedRef.current = { id: '', ym: config.yearMonth };
      onSelectNurseId('');
    }
  };

  const handlePickNurseChip = (nurse: Nurse) => {
    setNameError('');
    setNameInput(nurse.name);
    onSelectNurseId(nurse.id);
  };

  const handleClearIdentity = () => {
    setNameInput('');
    setNameError('');
    setBranchInput('HEM');
    setRoleInput('nobetli');
    setPassiveReasonInput('DI');
    prevSelectedRef.current = { id: '', ym: config.yearMonth };
    setShowRoleOptions(false);
    setJustSavedName(null);
    onSelectNurseId('');
    setDraft(makeEmptyPreference(config.yearMonth, ''));
  };

  const toggleDay = (day: number) => {
    if (isLockedForUser) return;
    setJustSavedName(null);

    setDraft((prev) => {
      const nextPos = new Set(prev.positiveNobetDays);
      const nextNeg = new Set(prev.negativeDays);
      const nextSoft = new Set(prev.softNegativeDays);
      const nextLeave = { ...prev.leaveDays };

      const alreadySame =
        (brush === 'positive' && nextPos.has(day)) ||
        (brush === 'negative' && nextNeg.has(day)) ||
        (brush === 'softNegative' && nextSoft.has(day)) ||
        (brush === 'leave' && nextLeave[day] === leaveSubtype);

      nextPos.delete(day);
      nextNeg.delete(day);
      nextSoft.delete(day);
      delete nextLeave[day];

      if (!alreadySame) {
        if (brush === 'positive') nextPos.add(day);
        else if (brush === 'negative') nextNeg.add(day);
        else if (brush === 'softNegative') nextSoft.add(day);
        else if (brush === 'leave') nextLeave[day] = leaveSubtype;
      }

      return {
        ...prev,
        positiveNobetDays: Array.from(nextPos).sort((a, b) => a - b),
        negativeDays: Array.from(nextNeg).sort((a, b) => a - b),
        softNegativeDays: Array.from(nextSoft).sort((a, b) => a - b),
        leaveDays: nextLeave,
      };
    });
  };

  const applyBridgeLeave = () => {
    if (isLockedForUser) return;
    const plan = buildFiveDayBridgeLeave(config.yearMonth, bridgeMonday, bridgeWithThu);
    setDraft((prev) => {
      const nextPos = new Set(prev.positiveNobetDays);
      const nextNeg = new Set(prev.negativeDays);
      const nextSoft = new Set(prev.softNegativeDays);
      const nextLeave = { ...prev.leaveDays };

      for (const d of plan.leaveDays) {
        nextPos.delete(d);
        nextNeg.delete(d);
        nextSoft.delete(d);
        nextLeave[d] = 'YI';
      }
      for (const d of plan.negativeDays) {
        if (!nextLeave[d]) {
          nextPos.delete(d);
          nextSoft.delete(d);
          nextNeg.add(daySafe(d));
        }
      }
      if (plan.preThursdayDay && !nextLeave[plan.preThursdayDay]) {
        nextNeg.delete(plan.preThursdayDay);
        nextSoft.delete(plan.preThursdayDay);
        nextPos.add(plan.preThursdayDay);
      }

      return {
        ...prev,
        positiveNobetDays: Array.from(nextPos).sort((a, b) => a - b),
        negativeDays: Array.from(nextNeg).sort((a, b) => a - b),
        softNegativeDays: Array.from(nextSoft).sort((a, b) => a - b),
        leaveDays: nextLeave,
        bridgeLeaveRequests: [
          ...prev.bridgeLeaveRequests.filter((b) => b.startDay !== plan.mondayDay),
          {
            startDay: plan.mondayDay,
            endDay: plan.fridayDay,
            wantPreThursdayNobet: bridgeWithThu,
          },
        ],
      };
    });
    setShowBridgeBox(false);
  };

  const handleResetDraft = () => {
    if (isLockedForUser) return;
    setDraft(makeEmptyPreference(config.yearMonth, effectiveId));
  };

  const handleSave = async () => {
    if (isLockedForUser) return;
    const cleanName = nameInput.trim();
    if (cleanName.length < 2) {
      setNameError('Lütfen en az 2 karakterlik Adınızı Soyadınızı yazın.');
      return;
    }

    setSaving(true);
    setNameError('');
    try {
      const savedId = await onRegisterAndSavePreference({
        existingNurseId: effectiveId || undefined,
        name: cleanName,
        branch: branchInput.trim() || 'HEM',
        role: roleInput,
        passiveReason: roleInput === 'pasif_izinli' ? passiveReasonInput : undefined,
        pref: {
          yearMonth: config.yearMonth,
          positiveNobetDays: draft.positiveNobetDays,
          negativeDays: draft.negativeDays,
          softNegativeDays: draft.softNegativeDays,
          leaveDays: draft.leaveDays,
          bridgeLeaveRequests: draft.bridgeLeaveRequests,
          notes: draft.notes,
          updatedAt: new Date().toISOString(),
        },
      });
      prevSelectedRef.current = { id: savedId, ym: config.yearMonth };
      setJustSavedName(cleanName);
    } finally {
      setSaving(false);
    }
  };

  const nurseTargetHours =
    roleInput === 'pasif_izinli'
      ? 0
      : computeNurseTargetHours(config.yearMonth, config.holidays, draft.leaveDays);

  const previewBridge = useMemo(() => {
    try {
      return buildFiveDayBridgeLeave(config.yearMonth, bridgeMonday, bridgeWithThu);
    } catch {
      return null;
    }
  }, [config.yearMonth, bridgeMonday, bridgeWithThu]);

  const isNewPerson = nameInput.trim().length >= 2 && !exactMatchNurse && !selectedNurse;
  const displayName = selectedNurse?.name ?? (nameInput.trim() || 'Adınızı Girin');

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Ultra-basit 3 adımlı kullanım rehberi */}
      <div className="grid grid-cols-1 gap-2 rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50/90 via-white to-teal-50/80 p-3 text-xs shadow-sm dark:border-indigo-900/50 dark:from-indigo-950/30 dark:via-slate-900 dark:to-teal-950/30 sm:grid-cols-3 sm:gap-3">
        <div className="flex items-center gap-2 rounded-xl bg-white/80 px-3 py-2 dark:bg-slate-800/70">
          <span className="text-base">1️⃣</span>
          <span className="font-semibold text-slate-800 dark:text-slate-100">Adınızı yazın</span>
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-white/80 px-3 py-2 dark:bg-slate-800/70">
          <span className="text-base">2️⃣</span>
          <span className="font-semibold text-slate-800 dark:text-slate-100">
            Rengi seçip günlere dokunun
          </span>
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-white/80 px-3 py-2 dark:bg-slate-800/70">
          <span className="text-base">3️⃣</span>
          <span className="font-semibold text-slate-800 dark:text-slate-100">
            Kaydet butonuna basın
          </span>
        </div>
      </div>

      {/* Kilit uyarısı */}
      {config.preferencesLocked && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <Lock className="h-5 w-5 shrink-0" />
          <div>
            <strong>Tercih dönemi sorumlu hemşire tarafından kilitlendi.</strong>{' '}
            {isAdmin
              ? 'Sorumlu modunda olduğunuz için değişiklik yapabilirsiniz.'
              : 'Değişiklik için sorumlu hemşire ile iletişime geçiniz.'}
          </div>
        </div>
      )}

      {/* Adım 1: Manuel İsim Girişi veya Mevcut İsimden Seçim */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white sm:text-lg">
              1. Adım: Adınızı Girin veya Seçin ({formatMonthLabelTR(config.yearMonth)})
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Listede adınız yoksa doğrudan yazın; tercihlerinizi kaydettiğinizde ekibe otomatik
              eklenirsiniz.
            </p>
          </div>
          {config.preferenceDeadline && (
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
              Son Tarih: {config.preferenceDeadline}
            </span>
          )}
        </div>

        <div className="space-y-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              disabled={isLockedForUser}
              value={nameInput}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Adınız Soyadınız (örn: Ayşe Kaya)"
              className={`w-full rounded-xl border bg-white py-3 pl-9 pr-9 text-sm font-medium focus:outline-none disabled:bg-slate-100 dark:bg-slate-800 dark:text-slate-100 ${
                nameError
                  ? 'border-rose-500 focus:border-rose-500'
                  : 'border-slate-300 focus:border-indigo-500 dark:border-slate-700'
              }`}
            />
            {nameInput && !isLockedForUser && (
              <button
                type="button"
                onClick={handleClearIdentity}
                title="Yeni isim gir / temizle"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              disabled={isLockedForUser}
              onClick={() => setShowRoleOptions((v) => !v)}
              className="text-[11px] font-medium text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-400"
            >
              {showRoleOptions
                ? 'Görev / branş ayarını gizle'
                : 'Sorumlu / Doğum İzni / Ebe iseniz buradan seçin'}
            </button>
          </div>

          {showRoleOptions && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-700 dark:bg-slate-800/70">
              <select
                disabled={isLockedForUser}
                value={roleInput}
                onChange={(e) => setRoleInput(e.target.value as NurseRole)}
                aria-label="Görev türü"
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="nobetli">Nöbetli Hemşire / Ebe</option>
                <option value="sorumlu">Birim Sorumlusu</option>
                <option value="pasif_izinli">Doğum İzni / Uzun Rapor</option>
              </select>

              {roleInput === 'pasif_izinli' && (
                <select
                  disabled={isLockedForUser}
                  value={passiveReasonInput}
                  onChange={(e) => setPassiveReasonInput(e.target.value as PassiveReason)}
                  className="rounded-xl border border-fuchsia-300 bg-fuchsia-50 px-2.5 py-2 text-xs font-semibold text-fuchsia-900 dark:border-fuchsia-700 dark:bg-fuchsia-950/50 dark:text-fuchsia-200"
                >
                  <option value="DI">Dİ (Doğum İzni)</option>
                  <option value="R">R (Rapor)</option>
                  <option value="YI">Yİ (Yıllık İzin)</option>
                  <option value="II">İİ (İdari İzin)</option>
                </select>
              )}

              <input
                type="text"
                disabled={isLockedForUser}
                value={branchInput}
                onChange={(e) => setBranchInput(e.target.value.toLocaleUpperCase('tr-TR'))}
                placeholder="HEM"
                title="Branş (HEM / EBE)"
                className="w-20 rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-center text-xs font-semibold dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
          )}
        </div>

        {nameError && <p className="mt-2 text-xs font-semibold text-rose-600">{nameError}</p>}

        {isNewPerson && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50/80 px-3 py-2 text-xs text-indigo-900 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200">
            <UserPlus className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
            <span>
              <strong>Yeni kayıt: &ldquo;{nameInput.trim()}&rdquo;</strong> — aşağıdan
              tercihlerinizi işaretleyip kaydettiğinizde otomatik olarak bu ayın listesine
              ekleneceksiniz.
            </span>
          </div>
        )}

        {/* Kayıtlı Kişiler (Hızlı Seçim / Öneri Çipleri) */}
        {filteredChips.length > 0 && (
          <div className="mt-3">
            <div className="mb-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {foldedQuery ? 'Eşleşen kayıtlar (dokunup seçin):' : `Bu serviste kayıtlı olanlar (${filteredChips.length}):`}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {filteredChips.map((nurse) => {
                const p = preferences[nurse.id];
                const hasSaved = Boolean(p?.updatedAt);
                const isSelected = nurse.id === effectiveId;
                const roleInfo = resolveEffectiveNurseRole(nurse, config);

                return (
                  <button
                    key={nurse.id}
                    type="button"
                    onClick={() => handlePickNurseChip(nurse)}
                    className={`flex items-center justify-between rounded-xl border px-3 py-2 text-left text-xs font-medium transition ${
                      isSelected
                        ? 'border-indigo-600 bg-indigo-600 text-white shadow-sm'
                        : 'border-slate-200 bg-slate-50 text-slate-800 hover:border-indigo-300 hover:bg-indigo-50/50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-indigo-600'
                    }`}
                  >
                    <span className="truncate">
                      {nurse.name}
                      {roleInfo.role === 'sorumlu'
                        ? ' (S)'
                        : roleInfo.role === 'pasif_izinli'
                        ? ' (İzin)'
                        : ''}
                    </span>
                    {hasSaved && (
                      <CheckCircle2
                        className={`ml-1.5 h-3.5 w-3.5 shrink-0 ${
                          isSelected ? 'text-white' : 'text-emerald-500'
                        }`}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* Adım 2: Fırça & Takvim */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white sm:text-lg">
              <UserCheck className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              {displayName} — Tercih Takvimi
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Hedef Aylık Çalışma Saati:{' '}
              <strong className="text-slate-700 dark:text-slate-200">{nurseTargetHours} saat</strong>
              {' · '}Özel gün tercihiniz yoksa gün işaretlemeden doğrudan{' '}
              <strong>&ldquo;Tercihleri Kaydet&rdquo;</strong> diyebilirsiniz.
            </p>
          </div>

          <button
            type="button"
            disabled={isLockedForUser || roleInput === 'pasif_izinli'}
            onClick={() => setShowBridgeBox((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-purple-300 bg-purple-50 px-3 py-2 text-xs font-semibold text-purple-800 hover:bg-purple-100 disabled:opacity-50 dark:border-purple-700 dark:bg-purple-950/50 dark:text-purple-200"
          >
            <CalendarPlus className="h-4 w-4" />
            5 Gün Yıllık İzin Köprüle (~10 Gün Blok)
          </button>
        </div>

        {/* 5 Gün Yıllık İzin Köprüleme Yardımcı Kutusu */}
        {showBridgeBox && (
          <div className="mb-5 rounded-xl border border-purple-200 bg-purple-50/70 p-4 dark:border-purple-800 dark:bg-purple-950/30">
            <div className="mb-2 flex items-center gap-2 text-sm font-bold text-purple-900 dark:text-purple-200">
              <Sparkles className="h-4 w-4" /> Yıllık İzin + Perşembe Nöbeti Köprüleme Sihirbazı
            </div>
            <p className="mb-3 text-xs text-purple-800 dark:text-purple-300">
              5 iş günü yıllık izin alacağınız haftanın Pazartesi gününü seçin. Sistem otomatik olarak
              o haftayı <strong>Yİ</strong>, önceki Perşembe gününü öncelikli{' '}
              <strong>24s Nöbet</strong> ve iki taraftaki hafta sonları/çıkış gününü{' '}
              <strong>Çalışamam</strong> olarak işaretler.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-xs font-medium text-purple-900 dark:text-purple-200">
                Başlangıç Pazartesi:{' '}
                <select
                  value={bridgeMonday}
                  onChange={(e) => setBridgeMonday(Number(e.target.value))}
                  className="ml-1 rounded-lg border border-purple-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 dark:border-purple-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  {mondays.map((m) => (
                    <option key={m} value={m}>
                      {m} {formatMonthLabelTR(config.yearMonth)} (Pazartesi)
                    </option>
                  ))}
                </select>
              </label>

              <label className="inline-flex items-center gap-1.5 text-xs font-medium text-purple-900 dark:text-purple-200">
                <input
                  type="checkbox"
                  checked={bridgeWithThu}
                  onChange={(e) => setBridgeWithThu(e.target.checked)}
                  className="rounded border-purple-400 text-purple-600"
                />
                Önceki Perşembe nöbet iste (köprü)
              </label>

              <button
                type="button"
                onClick={applyBridgeLeave}
                className="rounded-lg bg-purple-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-purple-800"
              >
                Takvime Uygula
              </button>
            </div>
            {previewBridge && (
              <div className="mt-2.5 text-[11px] text-purple-800 dark:text-purple-300">
                <strong>Önizleme:</strong> İzin günleri: {previewBridge.leaveDays.join(', ')} (Yİ)
                · Kapalı günler: {previewBridge.negativeDays.join(', ') || '—'} · Önceki Perşembe
                Nöbet:{' '}
                {previewBridge.preThursdayDay
                  ? `${previewBridge.preThursdayDay}. gün`
                  : 'Önceki aya denk geliyor'}
              </div>
            )}
          </div>
        )}

        {/* Mod Fırçaları */}
        <div className="mb-4 space-y-2">
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <button
              type="button"
              onClick={() => setBrush('positive')}
              className={`rounded-xl border px-3 py-2.5 text-xs font-semibold transition ${
                brush === 'positive'
                  ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
              }`}
            >
              🟢 Nöbet İstiyorum ({draft.positiveNobetDays.length})
            </button>
            <button
              type="button"
              onClick={() => setBrush('negative')}
              className={`rounded-xl border px-3 py-2.5 text-xs font-semibold transition ${
                brush === 'negative'
                  ? 'border-rose-600 bg-rose-600 text-white shadow-sm'
                  : 'border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300'
              }`}
            >
              🔴 Çalışamam ({draft.negativeDays.length})
            </button>
            <button
              type="button"
              onClick={() => setBrush('softNegative')}
              className={`rounded-xl border px-3 py-2.5 text-xs font-semibold transition ${
                brush === 'softNegative'
                  ? 'border-amber-500 bg-amber-500 text-white shadow-sm'
                  : 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
              }`}
            >
              🟡 Mümkünse Boş ({draft.softNegativeDays.length})
            </button>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setBrush('leave')}
                className={`flex-1 rounded-xl border px-3 py-2.5 text-xs font-semibold transition sm:flex-initial ${
                  brush === 'leave'
                    ? 'border-purple-600 bg-purple-600 text-white shadow-sm'
                    : 'border-purple-200 bg-purple-50 text-purple-800 hover:bg-purple-100 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-300'
                }`}
              >
                🟣 İzin ({Object.keys(draft.leaveDays).length})
              </button>
              {brush === 'leave' && (
                <select
                  value={leaveSubtype}
                  onChange={(e) => setLeaveSubtype(e.target.value as LeaveCode)}
                  className="rounded-lg border border-purple-300 bg-white px-2 py-2 text-xs font-medium text-purple-900 dark:border-purple-700 dark:bg-slate-800 dark:text-purple-200"
                >
                  <option value="YI">Yİ</option>
                  <option value="R">R</option>
                  <option value="II">İİ</option>
                </select>
              )}
            </div>
          </div>

          <p className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
            {brush === 'positive' &&
              '🟢 Yeşil mod seçili: Nöbet tutmak istediğiniz günlere dokunun. Silmek için aynı güne tekrar dokunun.'}
            {brush === 'negative' &&
              '🔴 Kırmızı mod seçili: Kesinlikle çalışamayacağınız günlere dokunun. Silmek için aynı güne tekrar dokunun.'}
            {brush === 'softNegative' &&
              '🟡 Sarı mod seçili: Mümkünse boş kalmasını istediğiniz günlere dokunun.'}
            {brush === 'leave' &&
              `🟣 Mor mod seçili (${leaveSubtype === 'YI' ? 'Yıllık İzin' : leaveSubtype === 'R' ? 'Rapor' : 'İdari İzin'}): İzinli olduğunuz günlere dokunun.`}
          </p>
        </div>

        {/* Takvim Izgarası */}
        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {WEEKDAY_HEADERS.map((h) => (
            <div
              key={h}
              className="py-1 text-center text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400"
            >
              {h}
            </div>
          ))}

          {Array.from({ length: leadingEmptyCells }).map((_, idx) => (
            <div
              key={`empty-${idx}`}
              className="min-h-[54px] rounded-xl bg-slate-50/40 dark:bg-slate-950/30 sm:h-20"
            />
          ))}

          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
            const isPos = draft.positiveNobetDays.includes(day);
            const isNeg = draft.negativeDays.includes(day);
            const isSoft = draft.softNegativeDays.includes(day);
            const leave = draft.leaveDays[day];
            const hol = config.holidays[day];
            const isHolOrWknd = isHolidayOrWeekend(day, config.yearMonth, config.holidays);
            const dow = getDayOfWeek(config.yearMonth, day);
            const otherPos = crowdByDay.posCounts[day] ?? 0;
            const otherNeg = crowdByDay.negCounts[day] ?? 0;

            let cellStyle =
              'border-slate-200 bg-white hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-800/80';
            if (isHolOrWknd) {
              cellStyle =
                'border-slate-300 bg-slate-100/90 hover:border-indigo-400 dark:border-slate-700 dark:bg-slate-800';
            }
            if (isPos) {
              cellStyle =
                'border-emerald-500 bg-emerald-50 text-emerald-950 ring-1 ring-emerald-400 dark:bg-emerald-950/60 dark:text-emerald-100';
            } else if (isNeg) {
              cellStyle =
                'border-rose-500 bg-rose-50 text-rose-950 ring-1 ring-rose-400 dark:bg-rose-950/60 dark:text-rose-100';
            } else if (isSoft) {
              cellStyle =
                'border-amber-400 bg-amber-50 text-amber-950 ring-1 ring-amber-300 dark:bg-amber-950/60 dark:text-amber-100';
            } else if (leave) {
              cellStyle =
                'border-purple-500 bg-purple-50 text-purple-950 ring-1 ring-purple-400 dark:bg-purple-950/60 dark:text-purple-100';
            }

            return (
              <button
                key={day}
                type="button"
                disabled={isLockedForUser}
                onClick={() => toggleDay(day)}
                title={`${day} ${TURKISH_WEEKDAYS_FULL[dow]}${hol ? ` — ${hol.name}` : ''}`}
                className={`relative flex min-h-[54px] flex-col justify-between overflow-hidden rounded-xl border p-1 text-left transition sm:h-20 sm:p-2 ${cellStyle} ${
                  isLockedForUser ? 'cursor-not-allowed opacity-75' : 'cursor-pointer'
                }`}
              >
                <div className="flex items-start justify-between gap-0.5">
                  <span className="text-xs font-bold leading-none sm:text-sm">{day}</span>
                  <div className="flex flex-wrap justify-end gap-0.5">
                    {otherPos > 0 && (
                      <span
                        title={`${otherPos} arkadaşınız da bu gün nöbet istiyor`}
                        className="rounded bg-blue-100 px-1 text-[9px] font-bold text-blue-700 dark:bg-blue-900/70 dark:text-blue-200"
                      >
                        +{otherPos}
                      </span>
                    )}
                    {otherNeg >= 3 && (
                      <span
                        title={`Dikkat: ${otherNeg} kişi bu günü kapatmış/izinli`}
                        className="rounded bg-rose-100 px-1 text-[9px] font-bold text-rose-700 dark:bg-rose-900/70 dark:text-rose-200"
                      >
                        !{otherNeg}
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-0.5">
                  {hol && (
                    <div className="hidden truncate text-[9px] font-semibold text-indigo-700 dark:text-indigo-300 sm:block">
                      {hol.name}
                    </div>
                  )}
                  <div className="text-[10px] font-bold leading-tight">
                    {isPos && (
                      <>
                        <span className="sm:hidden">🟢</span>
                        <span className="hidden sm:inline">🟢 Nöbet</span>
                      </>
                    )}
                    {isNeg && (
                      <>
                        <span className="sm:hidden">🔴</span>
                        <span className="hidden sm:inline">🔴 Kapalı</span>
                      </>
                    )}
                    {isSoft && (
                      <>
                        <span className="sm:hidden">🟡</span>
                        <span className="hidden sm:inline">🟡 Mümkünse</span>
                      </>
                    )}
                    {leave && (
                      <span>🟣{leave === 'YI' ? 'Yİ' : leave === 'II' ? 'İİ' : 'R'}</span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Özel Not & Kaydet */}
        <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Sorumlu Hemşireye Not / Açıklama (İsteğe bağlı)
            </label>
            <input
              type="text"
              disabled={isLockedForUser}
              value={draft.notes}
              onChange={(e) => {
                setJustSavedName(null);
                setDraft((p) => ({ ...p, notes: e.target.value }));
              }}
              placeholder="Örn: Eşimle aynı gün nöbetçi olmak istiyorum / Çocuk bakımı..."
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <div className="flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-end">
            <button
              type="button"
              disabled={isLockedForUser}
              onClick={handleResetDraft}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <RotateCcw className="h-4 w-4" /> Sıfırla
            </button>
            <button
              type="button"
              disabled={isLockedForUser || saving}
              onClick={handleSave}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-bold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 sm:w-auto"
            >
              <Save className="h-4 w-4" /> {saving ? 'Kaydediliyor...' : 'Tercihleri Kaydet'}
            </button>
          </div>
        </div>

        {justSavedName && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>
              ✅ {justSavedName} — Kaydınız alındı! İsterseniz daha sonra tekrar girip
              değiştirebilirsiniz.
            </span>
          </div>
        )}
      </section>
    </div>
  );
};

function daySafe(d: number): number {
  return d;
}
