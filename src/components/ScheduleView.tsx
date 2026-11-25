import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeftRight,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  Eraser,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Globe,
  Lock,
  MessageSquare,
  MousePointerClick,
  Pencil,
  Pin,
  Printer,
  RefreshCw,
  Send,
  Sparkles,
  Stethoscope,
  Undo2,
  User,
} from 'lucide-react';
import {
  formatMonthLabelTR,
  getDayOfWeek,
  getDaysInMonth,
  getTurkishMonthUpper,
  isHolidayOrWeekend,
  parseYearMonth,
  TURKISH_WEEKDAYS_SHORT,
} from '../lib/calendar';
import {
  buildMissingPrefsWhatsAppText,
  buildPersonalWhatsAppText,
  buildWardWhatsAppText,
  downloadNurseIcs,
} from '../lib/exportUtils';
import { MANUAL_SHIFT_OPTIONS, SHIFT_META } from '../lib/shifts';
import { exportYHFR31Excel, fillUploadedYHFR31Template } from '../lib/yhfr31Export';
import { suggestReplacementsForCell } from '../solver/advisor';
import { analyzeBottlenecks } from '../solver/bottleneckAnalyzer';
import {
  evaluateSchedule,
  resolveEffectiveNurseRole,
  runPreflightChecks,
} from '../solver/validator';
import {
  MonthConfig,
  MonthSchedule,
  Nurse,
  NursePreference,
  ShiftCode,
  ValidationIssue,
} from '../types/schedule';

interface ScheduleViewProps {
  config: MonthConfig;
  nurses: Nurse[];
  preferences: Record<string, NursePreference>;
  schedule: MonthSchedule | undefined;
  localTcMap: Record<string, string>;
  selectedNurseId: string;
  onSelectNurseId: (id: string) => void;
  isAdmin: boolean;
  solving: boolean;
  solveProgress: number;
  onSolve: (newSeed?: boolean) => void;
  onUpdateAssignments: (next: Record<string, Record<number, ShiftCode>>) => void;
  onTogglePublish: () => void;
  onTogglePinCell: (nurseId: string, day: number) => void;
  onClearPins: () => void;
  onUpdateConfig?: (next: MonthConfig) => Promise<void>;
  onNotify: (type: 'success' | 'error' | 'warning' | 'info', msg: string) => void;
}

type ManualTool = 'picker' | 'swap' | 'pin' | ShiftCode;

export const ScheduleView: React.FC<ScheduleViewProps> = ({
  config,
  nurses,
  preferences,
  schedule,
  localTcMap,
  selectedNurseId,
  onSelectNurseId,
  isAdmin,
  solving,
  solveProgress,
  onSolve,
  onUpdateAssignments,
  onTogglePublish,
  onTogglePinCell,
  onClearPins,
  onUpdateConfig,
  onNotify,
}) => {
  const [manualTool, setManualTool] = useState<ManualTool>('picker');
  const [swapSource, setSwapSource] = useState<{ nurseId: string; day: number } | null>(null);
  const [activeCell, setActiveCell] = useState<{ nurseId: string; day: number } | null>(null);
  const [history, setHistory] = useState<Record<string, Record<number, ShiftCode>>[]>([]);
  const [showIssues, setShowIssues] = useState(true);
  const [showBottlenecks, setShowBottlenecks] = useState(true);
  const [showPrefOverlay, setShowPrefOverlay] = useState(true);
  const [showTeamPrefsPanel, setShowTeamPrefsPanel] = useState(true);
  const [showAdvisorPanel, setShowAdvisorPanel] = useState(false);
  const [advisorShiftType, setAdvisorShiftType] = useState<'N24' | 'M8'>('N24');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setHistory([]);
    setSwapSource(null);
    setActiveCell(null);
    setShowAdvisorPanel(false);
  }, [config.yearMonth]);

  const daysInMonth = getDaysInMonth(config.yearMonth);
  const { year } = parseYearMonth(config.yearMonth);
  const monthUpper = getTurkishMonthUpper(config.yearMonth);

  const orderedNurses = useMemo(
    () => nurses.filter((n) => n.active).sort((a, b) => a.sortOrder - b.sortOrder),
    [nurses]
  );

  const assignments = useMemo(() => schedule?.assignments ?? {}, [schedule]);
  const hasAnyAssignment = Object.keys(assignments).length > 0;
  const lockedCells = useMemo(() => schedule?.lockedCells ?? {}, [schedule]);
  const pinnedCount = useMemo(
    () => Object.values(lockedCells).reduce((sum, arr) => sum + (arr?.length ?? 0), 0),
    [lockedCells]
  );
  const isPublished = (schedule?.status ?? 'published') === 'published';

  const copyToClipboard = async (text: string, successMsg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      onNotify('success', successMsg);
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        ta.style.top = '0';
        document.body.appendChild(ta);
        ta.select();
        const copied = document.execCommand('copy');
        document.body.removeChild(ta);
        if (copied) {
          onNotify('success', successMsg);
          return;
        }
      } catch {
        // Yedek kopyalama başarısız
      }
      onNotify('warning', 'Panoya otomatik kopyalanamadı; tarayıcı iznini kontrol edin.');
    }
  };

  const preflight = useMemo(
    () => runPreflightChecks(config, nurses, preferences),
    [config, nurses, preferences]
  );

  const evaluation = useMemo(
    () => evaluateSchedule(config, nurses, preferences, assignments),
    [config, nurses, preferences, assignments]
  );

  const bottlenecks = useMemo(
    () =>
      analyzeBottlenecks({
        config,
        nurses,
        preferences,
        preflight,
        evaluation,
        hasSchedule: hasAnyAssignment,
      }),
    [config, nurses, preferences, preflight, evaluation, hasAnyAssignment]
  );

  const teamPrefSummary = useMemo(() => {
    const expectedList = orderedNurses.filter(
      (n) => resolveEffectiveNurseRole(n, config).role !== 'pasif_izinli'
    );
    const submitted = expectedList.filter((n) => Boolean(preferences[n.id]?.updatedAt));
    const missing = expectedList.filter((n) => !preferences[n.id]?.updatedAt);
    const notesList = orderedNurses
      .map((n) => ({ nurse: n, note: preferences[n.id]?.notes?.trim() ?? '' }))
      .filter((x) => x.note.length > 0);
    return { expectedList, submitted, missing, notesList };
  }, [orderedNurses, config, preferences]);

  const personalNurse = useMemo(
    () => orderedNurses.find((n) => n.id === selectedNurseId) ?? null,
    [orderedNurses, selectedNurseId]
  );

  const advisorCandidates = useMemo(() => {
    if (!showAdvisorPanel || !activeCell) return [];
    return suggestReplacementsForCell({
      config,
      nurses,
      preferences,
      assignments,
      targetNurseId: activeCell.nurseId,
      day: activeCell.day,
      desiredShift: advisorShiftType,
    });
  }, [showAdvisorPanel, activeCell, config, nurses, preferences, assignments, advisorShiftType]);

  const cellIssuesMap = useMemo(() => {
    const map = new Map<string, ValidationIssue[]>();
    for (const issue of evaluation.issues) {
      if (issue.nurseId && issue.day) {
        const key = `${issue.nurseId}-${issue.day}`;
        const list = map.get(key) ?? [];
        list.push(issue);
        map.set(key, list);
      }
    }
    return map;
  }, [evaluation.issues]);

  const cloneAssignments = (
    src: Record<string, Record<number, ShiftCode>>
  ): Record<string, Record<number, ShiftCode>> => {
    const copy: Record<string, Record<number, ShiftCode>> = {};
    for (const n of orderedNurses) {
      copy[n.id] = { ...(src[n.id] ?? {}) };
    }
    return copy;
  };

  const commitManualChange = (next: Record<string, Record<number, ShiftCode>>) => {
    if (hasAnyAssignment) {
      const snapshot = cloneAssignments(assignments);
      setHistory((prev) => [...prev.slice(-19), snapshot]);
    }
    onUpdateAssignments(next);
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const prevSnapshot = history[history.length - 1];
    setHistory((prev) => prev.slice(0, -1));
    onUpdateAssignments(prevSnapshot);
    onNotify('info', 'Son manuel değişiklik geri alındı.');
  };

  const handleStartBlankManual = () => {
    const blank: Record<string, Record<number, ShiftCode>> = {};
    for (const nurse of orderedNurses) {
      const row: Record<number, ShiftCode> = {};
      const roleInfo = resolveEffectiveNurseRole(nurse, config);
      const leaveMap = preferences[nurse.id]?.leaveDays ?? {};
      for (let d = 1; d <= daysInMonth; d++) {
        if (roleInfo.role === 'sorumlu') {
          row[d] =
            leaveMap[d] ?? (!isHolidayOrWeekend(d, config.yearMonth, config.holidays) ? 'S8' : '');
        } else if (roleInfo.role === 'gunduz_mesai') {
          row[d] =
            leaveMap[d] ?? (!isHolidayOrWeekend(d, config.yearMonth, config.holidays) ? 'M8' : '');
        } else if (roleInfo.role === 'pasif_izinli') {
          const reasonCode: ShiftCode =
            roleInfo.passiveReason === 'R' ||
            roleInfo.passiveReason === 'YI' ||
            roleInfo.passiveReason === 'II'
              ? roleInfo.passiveReason
              : 'DI';
          row[d] = leaveMap[d] ?? reasonCode;
        } else {
          row[d] = leaveMap[d] ?? '';
        }
      }
      blank[nurse.id] = row;
    }
    onUpdateAssignments(blank);
    setManualTool('N24');
    onNotify(
      'info',
      'Boş manuel çizelge oluşturuldu. Fırçalarla doğrudan nöbet ve mesai işleyebilirsiniz.'
    );
  };

  const handleCellClick = (nurseId: string, day: number) => {
    if (!isAdmin) return;

    if (manualTool === 'pin') {
      onTogglePinCell(nurseId, day);
      return;
    }

    if (manualTool === 'swap') {
      if (!swapSource) {
        setSwapSource({ nurseId, day });
        return;
      }
      if (swapSource.nurseId === nurseId && swapSource.day === day) {
        setSwapSource(null);
        return;
      }

      const next = cloneAssignments(assignments);
      const valA = next[swapSource.nurseId]?.[swapSource.day] ?? '';
      const valB = next[nurseId]?.[day] ?? '';
      next[swapSource.nurseId][swapSource.day] = valB;
      next[nurseId][day] = valA;

      commitManualChange(next);
      setSwapSource(null);
      onNotify('info', 'İki hücre takas edildi. Canlı kural kontrolü güncellendi.');
      return;
    }

    if (manualTool === 'picker') {
      const sameCell = activeCell && activeCell.nurseId === nurseId && activeCell.day === day;
      setShowAdvisorPanel(false);
      if (sameCell) {
        setActiveCell(null);
      } else {
        const currentShift = assignments[nurseId]?.[day] ?? '';
        setAdvisorShiftType(currentShift === 'M8' ? 'M8' : 'N24');
        setActiveCell({ nurseId, day });
      }
      return;
    }

    // Fırça modu: tek tıkla boya (aynı değerse temizle)
    const next = cloneAssignments(assignments);
    const current = next[nurseId]?.[day] ?? '';
    next[nurseId][day] = current === manualTool ? '' : manualTool;
    commitManualChange(next);
  };

  const handleSetCellShift = (nurseId: string, day: number, code: ShiftCode) => {
    const next = cloneAssignments(assignments);
    next[nurseId][day] = code;
    commitManualChange(next);
    setShowAdvisorPanel(false);
    setActiveCell(null);
  };

  const handleApplyReplacement = (
    candidateId: string,
    mode: 'report' | 'clear'
  ) => {
    if (!activeCell) return;
    const next = cloneAssignments(assignments);
    next[activeCell.nurseId][activeCell.day] = mode === 'report' ? 'R' : '';
    next[candidateId][activeCell.day] = advisorShiftType;
    commitManualChange(next);
    const candName = orderedNurses.find((n) => n.id === candidateId)?.name ?? 'Yedek personel';
    onNotify(
      'success',
      `${activeCell.day}. gün için ${candName} (${advisorShiftType}) atandı.`
    );
    setShowAdvisorPanel(false);
    setActiveCell(null);
  };

  const handleExportExcel = async () => {
    try {
      await exportYHFR31Excel({
        config,
        nurses,
        preferences,
        assignments,
        localTcMap,
      });
      onNotify('success', 'YH.FR.31 Excel (.xlsx) dosyası indirildi!');
    } catch (err) {
      onNotify(
        'error',
        `Excel dışa aktarma hatası: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  };

  const handleTemplateUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const buf = await file.arrayBuffer();
      const result = await fillUploadedYHFR31Template(buf, {
        config,
        nurses,
        preferences,
        assignments,
        localTcMap,
      });
      const blob = new Blob([result.buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `YH.FR.31_Doldurulmus_${config.yearMonth}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      if (result.unmatchedNames.length > 0) {
        onNotify(
          'warning',
          `"${result.sheetName}" sayfasında ${result.matchedCount} personel dolduruldu. Eşleşmeyenler: ${result.unmatchedNames.join(', ')}`
        );
      } else {
        onNotify(
          'success',
          `"${result.sheetName}" sayfasındaki ${result.matchedCount} hemşirenin tüm günleri şablona işlendi!`
        );
      }
    } catch (err) {
      onNotify(
        'error',
        `Şablon doldurma hatası: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* Ön Kontrol & Kapasite Kartları */}
      {isAdmin && (
        <section className="no-print space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="text-xs text-slate-500 dark:text-slate-400">Aktif Kadro</div>
              <div className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
                {preflight.activeNobetliCount} Nöbetli + {preflight.sorumluCount} Sorumlu
              </div>
              {preflight.pasifCount > 0 && (
                <div className="text-[11px] text-fuchsia-600 dark:text-fuchsia-400">
                  +{preflight.pasifCount} pasif/izinli (listede)
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="text-xs text-slate-500 dark:text-slate-400">Yasal Baz Çalışma</div>
              <div className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
                {preflight.baseStatutoryHours} saat
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Kadro hedefi: {preflight.totalTargetHours} s
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="text-xs text-slate-500 dark:text-slate-400">Servis Vardiya İhtiyacı</div>
              <div className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
                {preflight.totalRequiredHours} saat
              </div>
              <div
                className={`text-[11px] font-medium ${
                  preflight.hourBalanceDiff >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-amber-600 dark:text-amber-400'
                }`}
              >
                {preflight.hourBalanceDiff >= 0
                  ? `+${preflight.hourBalanceDiff} s fazla mesai havuzu`
                  : `${preflight.hourBalanceDiff} s açık (+${preflight.suggestedExtraMesaiDays} hafta içi mesai önerisi)`}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="text-xs text-slate-500 dark:text-slate-400">Ön Kontrol Durumu</div>
              <div className="mt-1 flex items-center gap-1.5 text-lg font-bold">
                {preflight.blockers.length > 0 ? (
                  <span className="text-rose-600">
                    {preflight.blockers.length} Engel Var
                  </span>
                ) : preflight.warnings.length > 0 ? (
                  <span className="text-amber-600">{preflight.warnings.length} Uyarı</span>
                ) : (
                  <span className="text-emerald-600">Planlamaya Hazır</span>
                )}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {formatMonthLabelTR(config.yearMonth)}
              </div>
            </div>
          </div>

          {preflight.blockers.length > 0 && (
            <div className="rounded-xl border border-rose-300 bg-rose-50 p-3.5 text-xs text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
              <div className="mb-1 flex items-center gap-1.5 font-bold">
                <AlertCircle className="h-4 w-4" /> Kapasite Engelleri (Çözüm Öncesi Kontrol Edin)
              </div>
              <ul className="list-disc space-y-0.5 pl-5">
                {preflight.blockers.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>
          )}

          {preflight.warnings.length > 0 && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              <div className="mb-1 flex items-center gap-1.5 font-bold">
                <AlertTriangle className="h-4 w-4" /> Planlama Uyarıları
              </div>
              <ul className="list-disc space-y-0.5 pl-5">
                {preflight.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Sorumluya Özel: Akıllı Tıkanma Analizi & Çözüm Önerileri */}
          {bottlenecks.length > 0 && (
            <div className="rounded-2xl border border-indigo-200 bg-white p-4 shadow-sm dark:border-indigo-900/60 dark:bg-slate-900">
              <button
                type="button"
                onClick={() => setShowBottlenecks((v) => !v)}
                className="flex w-full items-center justify-between gap-2 text-left text-xs font-bold text-slate-900 dark:text-white sm:text-sm"
              >
                <span className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  🧠 Akıllı Tıkanma Analizi &amp; Çözüm Önerileri ({bottlenecks.length} tespit)
                </span>
                {showBottlenecks ? (
                  <ChevronUp className="h-4 w-4 text-slate-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                )}
              </button>

              {showBottlenecks && (
                <div className="mt-3 space-y-2.5 border-t border-slate-100 pt-3 dark:border-slate-800">
                  {bottlenecks.map((item) => {
                    const cardStyle =
                      item.severity === 'critical'
                        ? 'border-rose-200 bg-rose-50/80 text-rose-950 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-100'
                        : item.severity === 'warning'
                        ? 'border-amber-200 bg-amber-50/80 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100'
                        : 'border-indigo-200 bg-indigo-50/70 text-indigo-950 dark:border-indigo-900/60 dark:bg-indigo-950/30 dark:text-indigo-100';

                    return (
                      <div
                        key={item.id}
                        className={`rounded-xl border p-3 text-xs ${cardStyle}`}
                      >
                        <div className="font-bold">{item.title}</div>
                        <p className="mt-0.5 text-[11px] opacity-90">{item.detail}</p>
                        <p className="mt-1 text-[11px] font-semibold">
                          💡 Öneri: {item.suggestion}
                        </p>

                        {(item.whatsappDraft || item.quickAction) && (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {item.whatsappDraft && (
                              <button
                                type="button"
                                onClick={() =>
                                  void copyToClipboard(
                                    item.whatsappDraft!,
                                    'Uzlaşma WhatsApp mesajı panoya kopyalandı!'
                                  )
                                }
                                className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-50 dark:border-emerald-700 dark:bg-slate-800 dark:text-emerald-300"
                              >
                                <Send className="h-3 w-3" /> 💬 Uzlaşma Mesajı Kopyala
                              </button>
                            )}

                            {item.quickAction === 'retry_solve' && (
                              <button
                                type="button"
                                disabled={solving || preflight.activeNobetliCount === 0}
                                onClick={() => onSolve(true)}
                                className="inline-flex items-center gap-1 rounded-lg border border-indigo-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-indigo-800 hover:bg-indigo-50 disabled:opacity-50 dark:border-indigo-700 dark:bg-slate-800 dark:text-indigo-300"
                              >
                                <RefreshCw className="h-3 w-3" /> 🔄 Yeni Alternatif Dene
                              </button>
                            )}

                            {item.quickAction === 'enable_topup' && onUpdateConfig && (
                              <button
                                type="button"
                                onClick={() =>
                                  void onUpdateConfig({
                                    ...config,
                                    autoTopUpUnderHours: true,
                                  })
                                }
                                className="inline-flex items-center gap-1 rounded-lg border border-teal-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-teal-800 hover:bg-teal-50 dark:border-teal-700 dark:bg-slate-800 dark:text-teal-300"
                              >
                                ✅ +1 Mesai Dengelemeyi Aç
                              </button>
                            )}

                            {item.quickAction === 'relax_empty_cap' && onUpdateConfig && (
                              <button
                                type="button"
                                onClick={() =>
                                  void onUpdateConfig({
                                    ...config,
                                    maxConsecutiveEmptyDays: 4,
                                  })
                                }
                                className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-50 dark:border-amber-700 dark:bg-slate-800 dark:text-amber-300"
                              >
                                ⚙️ Boşluk Sınırını 4 Gün Yap
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Sorumluya Özel: Ekip Tercih Özeti & Gizli Hemşire Notları */}
          <div className="rounded-2xl border border-indigo-200 bg-white p-4 shadow-sm dark:border-indigo-900/60 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setShowTeamPrefsPanel((v) => !v)}
                className="flex items-center gap-2 text-left text-xs font-bold text-slate-900 dark:text-white sm:text-sm"
              >
                <MessageSquare className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                <span>
                  Ekip Tercih Özeti &amp; Gizli Notlar ({teamPrefSummary.submitted.length}/
                  {teamPrefSummary.expectedList.length} kişi girdi · 🔒{' '}
                  {teamPrefSummary.notesList.length} not)
                </span>
                {showTeamPrefsPanel ? (
                  <ChevronUp className="h-4 w-4 text-slate-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                )}
              </button>

              {teamPrefSummary.missing.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    void copyToClipboard(
                      buildMissingPrefsWhatsAppText(
                        config.yearMonth,
                        teamPrefSummary.missing,
                        config.preferenceDeadline
                      ),
                      'Eksik tercih hatırlatma mesajı kopyalandı!'
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                >
                  <Send className="h-3.5 w-3.5" /> Eksiklere Hatırlatma Kopyala (
                  {teamPrefSummary.missing.length})
                </button>
              )}
            </div>

            {showTeamPrefsPanel && (
              <div className="mt-3 space-y-3 border-t border-slate-100 pt-3 text-xs dark:border-slate-800">
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all"
                    style={{
                      width: `${
                        teamPrefSummary.expectedList.length > 0
                          ? Math.round(
                              (teamPrefSummary.submitted.length /
                                teamPrefSummary.expectedList.length) *
                                100
                            )
                          : 0
                      }%`,
                    }}
                  />
                </div>

                {teamPrefSummary.missing.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                      Henüz tercih girmeyenler:
                    </span>
                    {teamPrefSummary.missing.map((n) => (
                      <span
                        key={n.id}
                        className="rounded-lg bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                      >
                        {n.name}
                      </span>
                    ))}
                  </div>
                )}

                {teamPrefSummary.notesList.length > 0 && (
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 dark:border-indigo-900 dark:bg-indigo-950/30">
                    <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold text-indigo-900 dark:text-indigo-200">
                      <Lock className="h-3.5 w-3.5" /> Sorumlu Hemşireye Özel Notlar (Sadece siz görürsünüz)
                    </div>
                    <ul className="space-y-1 text-xs text-slate-800 dark:text-slate-200">
                      {teamPrefSummary.notesList.map(({ nurse, note }) => (
                        <li key={nurse.id}>
                          <strong>{nurse.name}:</strong> {note}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {teamPrefSummary.submitted.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {teamPrefSummary.submitted.map((n) => {
                      const p = preferences[n.id];
                      const leaveCnt = Object.keys(p?.leaveDays ?? {}).length;
                      return (
                        <div
                          key={n.id}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] dark:border-slate-700 dark:bg-slate-800"
                        >
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {n.name}
                          </span>
                          <span className="text-slate-500">
                            🟢{p?.positiveNobetDays?.length ?? 0} · 🔵
                            {p?.positiveMesaiDays?.length ?? 0} · 🔴{p?.negativeDays?.length ?? 0} ·
                            🟡{p?.softNegativeDays?.length ?? 0}
                            {leaveCnt > 0 ? ` · 🟣${leaveCnt}` : ''}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Eylem Araç Çubuğu */}
      <section className="no-print flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <>
              <button
                type="button"
                disabled={solving || preflight.activeNobetliCount === 0}
                onClick={() => onSolve(false)}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-teal-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:from-indigo-700 hover:to-teal-700 disabled:opacity-50"
              >
                <Sparkles className={`h-4 w-4 ${solving ? 'animate-spin' : ''}`} />
                {solving
                  ? `Çözülüyor (%${solveProgress})...`
                  : pinnedCount > 0
                  ? `Sabitleri Koruyarak Çöz (📌 ${pinnedCount})`
                  : 'Akıllı Çizelge Oluştur'}
              </button>

              {pinnedCount > 0 && (
                <button
                  type="button"
                  onClick={onClearPins}
                  className="inline-flex items-center gap-1 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                >
                  Sabitleri Temizle ({pinnedCount})
                </button>
              )}

              {hasAnyAssignment && (
                <>
                  <button
                    type="button"
                    disabled={solving}
                    onClick={() => onSolve(true)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-300 bg-indigo-50 px-3.5 py-2.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 dark:border-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300"
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Yeni Alternatif
                  </button>

                  <button
                    type="button"
                    onClick={onTogglePublish}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-xs font-bold shadow-sm transition ${
                      isPublished
                        ? 'border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200'
                        : 'bg-indigo-600 text-white hover:bg-indigo-700'
                    }`}
                  >
                    {isPublished ? (
                      <>
                        <Lock className="h-3.5 w-3.5" /> Yayında (Taslağa Çek)
                      </>
                    ) : (
                      <>
                        <Globe className="h-3.5 w-3.5" /> Listeyi Servise Yayınla
                      </>
                    )}
                  </button>
                </>
              )}

              {hasAnyAssignment && (
                <button
                  type="button"
                  onClick={() => {
                    setManualTool((t) => (t === 'swap' ? 'picker' : 'swap'));
                    setSwapSource(null);
                    setActiveCell(null);
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2.5 text-xs font-semibold transition ${
                    manualTool === 'swap'
                      ? 'border-amber-500 bg-amber-500 text-white shadow-sm'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                  }`}
                >
                  <ArrowLeftRight className="h-3.5 w-3.5" />
                  {manualTool === 'swap'
                    ? swapSource
                      ? 'İkinci hücreyi seçin...'
                      : 'Değiş-Tokuş Açık'
                    : 'Değiş-Tokuş Modu'}
                </button>
              )}
            </>
          )}
        </div>

        {hasAnyAssignment && (isAdmin || isPublished) && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportExcel}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
            >
              <Download className="h-4 w-4" /> YH.FR.31 Excel İndir
            </button>

            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    void copyToClipboard(
                      buildWardWhatsAppText(config.yearMonth, config, nurses, assignments),
                      'Tüm ayın servis listesi WhatsApp formatında kopyalandı!'
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl border border-teal-300 bg-teal-50 px-3.5 py-2.5 text-xs font-semibold text-teal-800 hover:bg-teal-100 dark:border-teal-700 dark:bg-teal-950/40 dark:text-teal-300"
                >
                  <MessageSquare className="h-4 w-4" /> WhatsApp Listesi Kopyala
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx"
                  onChange={handleTemplateUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title="Hastane sistemindeki mevcut YH.FR.31 .xlsx dosyasının içindeki günleri doldurur"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                >
                  <FileSpreadsheet className="h-4 w-4" /> Mevcut YH.FR.31 Şablonunu Doldur
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <Printer className="h-4 w-4" /> Yazdır
            </button>
          </div>
        )}
      </section>

      {hasAnyAssignment && !isAdmin && !isPublished ? (
        <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50/70 p-10 text-center dark:border-amber-800 dark:bg-amber-950/20">
          <Lock className="mx-auto mb-3 h-9 w-9 text-amber-600 dark:text-amber-400" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            {formatMonthLabelTR(config.yearMonth)} çizelgesi şu an taslak aşamasında
          </h3>
          <p className="mx-auto mt-1 max-w-md text-xs text-slate-600 dark:text-slate-400">
            Sorumlu hemşire son kontrolleri tamamlayıp yayınladığında nöbet çizelgeniz ve telefon
            takvimi indirme seçeneği burada açılacaktır.
          </p>
        </div>
      ) : !hasAnyAssignment ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-700 dark:bg-slate-900">
          <Sparkles className="mx-auto mb-3 h-10 w-10 text-indigo-500" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            {formatMonthLabelTR(config.yearMonth)} için henüz çizelge oluşturulmadı
          </h3>
          <p className="mx-auto mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">
            {isAdmin
              ? 'Ekibin tercihlerini topladıktan sonra "Akıllı Çizelge Oluştur" ile otomatik plan üretebilir veya boş çizelge açıp tamamen elle doldurabilirsiniz.'
              : 'Sorumlu hemşire çizelgeyi yayınladığında burada görüntülenecektir.'}
          </p>
          {isAdmin && (
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                disabled={preflight.activeNobetliCount === 0}
                onClick={handleStartBlankManual}
                className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-300 bg-indigo-50 px-4 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 dark:border-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300"
              >
                <Pencil className="h-3.5 w-3.5" /> Boş Çizelge ile Manuel Başla
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Kişisel Nöbet Kartı & Telefon Takvimine Aktarım */}
          <section className="no-print rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <User className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                <span className="text-xs font-bold text-slate-800 dark:text-slate-100 sm:text-sm">
                  Kişisel Nöbet Kartım:
                </span>
                <select
                  value={personalNurse?.id ?? ''}
                  onChange={(e) => onSelectNurseId(e.target.value)}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  <option value="">— Adınızı seçin —</option>
                  {orderedNurses.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.name}
                    </option>
                  ))}
                </select>
              </div>

              {personalNurse && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      downloadNurseIcs(
                        config.yearMonth,
                        config.clinicName,
                        personalNurse,
                        assignments[personalNurse.id] ?? {}
                      );
                      onNotify(
                        'success',
                        `${personalNurse.name} için telefon takvimi (.ics) indirildi!`
                      );
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
                  >
                    <Calendar className="h-3.5 w-3.5" /> Telefon Takvimine Ekle (.ics)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const m = evaluation.nurseMetrics.find(
                        (x) => x.nurseId === personalNurse.id
                      );
                      void copyToClipboard(
                        buildPersonalWhatsAppText(
                          config.yearMonth,
                          config.clinicName,
                          personalNurse,
                          assignments[personalNurse.id] ?? {},
                          m?.targetHours ?? 0
                        ),
                        `${personalNurse.name} kişisel nöbet özeti kopyalandı!`
                      );
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <MessageSquare className="h-3.5 w-3.5" /> Kendi Listemi Kopyala
                  </button>
                </div>
              )}
            </div>

            {personalNurse && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2.5 text-xs dark:border-slate-800">
                {Array.from({ length: daysInMonth }, (_, i) => i + 1)
                  .filter((d) => Boolean(assignments[personalNurse.id]?.[d]))
                  .map((d) => {
                    const code = assignments[personalNurse.id][d];
                    const dow = TURKISH_WEEKDAYS_SHORT[getDayOfWeek(config.yearMonth, d)];
                    return (
                      <span
                        key={d}
                        className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] ${SHIFT_META[code].badgeClass}`}
                      >
                        <strong>
                          {d} {dow}:
                        </strong>{' '}
                        {SHIFT_META[code].shortLabel}
                      </span>
                    );
                  })}
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).every(
                  (d) => !assignments[personalNurse.id]?.[d]
                ) && (
                  <span className="text-[11px] text-slate-500">
                    Bu ayda atanmış vardiya bulunmuyor.
                  </span>
                )}
              </div>
            )}
          </section>

          {/* Çözüm Kalitesi Özet Kartları (Yalnızca Sorumlu) */}
          {isAdmin && (
            <section className="no-print grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
                <div className="text-xs text-slate-500 dark:text-slate-400">Sert Kural İhlali</div>
                <div
                  className={`mt-1 flex items-center gap-1.5 text-xl font-bold ${
                    evaluation.hardViolations === 0 ? 'text-emerald-600' : 'text-rose-600'
                  }`}
                >
                  {evaluation.hardViolations === 0 ? (
                    <>
                      <CheckCircle2 className="h-5 w-5" /> 0 İhlal
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-5 w-5" /> {evaluation.hardViolations} İhlal
                    </>
                  )}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {evaluation.softWarnings} yumuşak uyarı (3. gün mesai vb.)
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
                <div className="text-xs text-slate-500 dark:text-slate-400">Saat Farkı (Max–Min)</div>
                {(() => {
                  const leaveDiscountActive =
                    (config.leaveOvertimePolicy ?? 'proportional') !== 'equal' &&
                    evaluation.fullMonthHourSpread !== evaluation.hourSpread;
                  const colorSpread = leaveDiscountActive
                    ? evaluation.fullMonthHourSpread
                    : evaluation.hourSpread;
                  return (
                    <>
                      <div
                        className={`mt-1 text-xl font-bold ${
                          colorSpread <= 8
                            ? 'text-emerald-600'
                            : colorSpread <= 16
                            ? 'text-indigo-600 dark:text-indigo-400'
                            : 'text-amber-600'
                        }`}
                      >
                        {evaluation.hourSpread} saat
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {leaveDiscountActive
                          ? `İzin indirimi aktif · Tam ay fark: ${evaluation.fullMonthHourSpread} s`
                          : 'Hedef: en fazla 8–16 saat fark'}
                      </div>
                    </>
                  );
                })()}
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
                <div className="text-xs text-slate-500 dark:text-slate-400">Tercih Karşılama</div>
                <div className="mt-1 text-xl font-bold text-indigo-600 dark:text-indigo-400">
                  %{evaluation.preferenceSatisfactionPct}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  <span
                    className={
                      evaluation.totalNegativeViolations > 0
                        ? 'font-semibold text-rose-600 dark:text-rose-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }
                  >
                    🔴 Delinen: {evaluation.totalNegativeViolations}
                  </span>
                  <span
                    className={
                      evaluation.totalSoftNegativeViolations > 0
                        ? 'font-semibold text-amber-600 dark:text-amber-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }
                  >
                    🟡 Düşen: {evaluation.totalSoftNegativeViolations}
                  </span>
                  <span>H.Sonu farkı: {evaluation.weekendSpread}</span>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
                <div className="text-xs text-slate-500 dark:text-slate-400">3 Günlük Boşluk Aralığı</div>
                <div className="mt-1 text-xl font-bold text-slate-900 dark:text-white">
                  {evaluation.threeDayGapMin}–{evaluation.threeDayGapMax} kez
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {schedule?.solverStats
                    ? `${schedule.solverStats.durationMs} ms sürede çözüldü`
                    : 'Manuel düzenleme'}
                </div>
              </div>
            </section>
          )}

          {/* Yazdırma için resmi başlık */}
          <div className="hidden print-only mb-2 border border-slate-700 p-2 text-center">
            <div className="text-[10px] font-bold">
              T.C. SAĞLIK BAKANLIĞI · {config.hospitalName.toLocaleUpperCase('tr-TR')} · Kodu: YH.FR.31 (Rev.04 / 02.02.2026)
            </div>
            <div className="text-xs font-bold">
              {config.clinicName.toLocaleUpperCase('tr-TR')} — {year} YILI {monthUpper} AYI PERSONEL NÖBET BİLDİRİMİ PUANTAJ ÇİZELGESİ
            </div>
          </div>

          {/* Etkileşimli Nöbet Matrisi */}
          <section className="print-full-width rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-4">
            <div className="no-print mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span className="inline-flex items-center gap-1 rounded bg-indigo-600 px-2 py-0.5 font-semibold text-white">
                  24 = Nöbetli (08-08)
                </span>
                <span className="inline-flex items-center gap-1 rounded border border-emerald-300 bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-900">
                  8 = Servisçi / Mesai (08-16)
                </span>
                <span className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-100 px-2 py-0.5 font-semibold text-amber-900">
                  S8 = Sorumlu (08-16)
                </span>
                <span className="inline-flex items-center gap-1 rounded border border-purple-300 bg-purple-100 px-2 py-0.5 font-semibold text-purple-900">
                  Yİ / R / Dİ = İzin
                </span>
                {schedule?.solverStats?.extraMesaiDays &&
                  schedule.solverStats.extraMesaiDays.length > 0 && (
                    <span className="rounded bg-sky-50 px-2 py-0.5 font-medium text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                      +1 Mesai Günleri: {schedule.solverStats.extraMesaiDays.join(', ')}
                    </span>
                  )}
              </div>
              {isAdmin && (
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Fırça seçip hücrelere tek tıkla yazabilir veya Seçici/Değiş-Tokuş ile düzenleyebilirsiniz.
                </span>
              )}
            </div>

            {/* Sorumlu Manuel Düzenleme Araç Çubuğu */}
            {isAdmin && (
              <div className="no-print mb-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50/90 p-2.5 dark:border-slate-700 dark:bg-slate-800/70">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="mr-1 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                      Manuel Düzenleme:
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setManualTool('picker');
                        setSwapSource(null);
                      }}
                      className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
                        manualTool === 'picker'
                          ? 'border-indigo-600 bg-indigo-600 text-white'
                          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200'
                      }`}
                    >
                      <MousePointerClick className="h-3.5 w-3.5" /> Seçici
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setManualTool('swap');
                        setActiveCell(null);
                        setSwapSource(null);
                        setShowAdvisorPanel(false);
                      }}
                      className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
                        manualTool === 'swap'
                          ? 'border-amber-500 bg-amber-500 text-white'
                          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200'
                      }`}
                    >
                      <ArrowLeftRight className="h-3.5 w-3.5" /> Değiş-Tokuş
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setManualTool((t) => (t === 'pin' ? 'picker' : 'pin'));
                        setActiveCell(null);
                        setSwapSource(null);
                        setShowAdvisorPanel(false);
                      }}
                      title="Sabitlenen hücreler yeniden çözmede korunur"
                      className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
                        manualTool === 'pin'
                          ? 'border-amber-600 bg-amber-600 text-white'
                          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200'
                      }`}
                    >
                      <Pin className="h-3.5 w-3.5" /> Sabitle
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowPrefOverlay((v) => !v)}
                      title="Hücre köşelerinde hemşirelerin tercih renklerini gösterir"
                      className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
                        showPrefOverlay
                          ? 'border-sky-500 bg-sky-50 text-sky-800 dark:border-sky-700 dark:bg-sky-950/50 dark:text-sky-200'
                          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200'
                      }`}
                    >
                      {showPrefOverlay ? (
                        <Eye className="h-3.5 w-3.5" />
                      ) : (
                        <EyeOff className="h-3.5 w-3.5" />
                      )}
                      Tercihler
                    </button>

                    <span className="mx-1 h-4 w-px bg-slate-300 dark:bg-slate-600" />

                    {MANUAL_SHIFT_OPTIONS.map((opt) => {
                      const isActiveBrush = manualTool === opt;
                      const label =
                        opt === ''
                          ? 'Boşalt'
                          : opt === 'N24'
                          ? '24 (Nöbet)'
                          : opt === 'M8'
                          ? '8 (Mesai)'
                          : opt === 'S8'
                          ? 'S8'
                          : SHIFT_META[opt].shortLabel;
                      return (
                        <button
                          key={opt || 'clear'}
                          type="button"
                          title={SHIFT_META[opt].labelTR}
                          onClick={() => {
                            setManualTool(opt);
                            setActiveCell(null);
                            setSwapSource(null);
                          }}
                          className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold transition ${
                            isActiveBrush
                              ? 'border-indigo-600 bg-indigo-600 text-white shadow-sm'
                              : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200'
                          }`}
                        >
                          {opt === '' && <Eraser className="h-3 w-3" />}
                          {label}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    disabled={history.length === 0}
                    onClick={handleUndo}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                  >
                    <Undo2 className="h-3.5 w-3.5" /> Geri Al ({history.length})
                  </button>
                </div>

                {/* Kırpılmayan Seçili Hücre İşlem Çubuğu & Acil Yedek Danışmanı */}
                {manualTool === 'picker' && activeCell && (
                  <div className="space-y-2 rounded-lg border border-indigo-200 bg-indigo-50/90 px-2.5 py-2 text-xs dark:border-indigo-800 dark:bg-indigo-950/50">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-bold text-indigo-900 dark:text-indigo-200">
                        Seçili Hücre:{' '}
                        {orderedNurses.find((n) => n.id === activeCell.nurseId)?.name ?? ''} ·{' '}
                        {activeCell.day}. Gün —
                      </span>
                      {MANUAL_SHIFT_OPTIONS.map((opt) => {
                        const currentVal = assignments[activeCell.nurseId]?.[activeCell.day] ?? '';
                        return (
                          <button
                            key={opt || 'empty'}
                            type="button"
                            onClick={() =>
                              handleSetCellShift(activeCell.nurseId, activeCell.day, opt)
                            }
                            className={`rounded-md px-2 py-0.5 text-[11px] font-semibold transition ${
                              currentVal === opt
                                ? 'bg-indigo-600 text-white'
                                : 'bg-white text-slate-800 hover:bg-indigo-100 dark:bg-slate-800 dark:text-slate-200'
                            }`}
                          >
                            {opt === '' ? 'Boş' : opt === 'S8' ? 'S8' : SHIFT_META[opt].shortLabel}
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => onTogglePinCell(activeCell.nurseId, activeCell.day)}
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold transition ${
                          lockedCells[activeCell.nurseId]?.includes(activeCell.day)
                            ? 'bg-amber-500 text-white'
                            : 'bg-white text-amber-800 hover:bg-amber-100 dark:bg-slate-800 dark:text-amber-300'
                        }`}
                      >
                        <Pin className="h-3 w-3" />{' '}
                        {lockedCells[activeCell.nurseId]?.includes(activeCell.day)
                          ? 'Sabitli'
                          : 'Sabitle'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowAdvisorPanel((v) => !v)}
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold transition ${
                          showAdvisorPanel
                            ? 'bg-teal-600 text-white'
                            : 'bg-white text-teal-800 hover:bg-teal-100 dark:bg-slate-800 dark:text-teal-300'
                        }`}
                      >
                        <Stethoscope className="h-3 w-3" /> Uygun Yedek Öner
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAdvisorPanel(false);
                          setActiveCell(null);
                        }}
                        className="ml-auto text-[11px] font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400"
                      >
                        Kapat
                      </button>
                    </div>

                    {showAdvisorPanel && (
                      <div className="rounded-lg border border-teal-200 bg-white p-2.5 dark:border-teal-800 dark:bg-slate-900">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[11px] font-bold text-teal-900 dark:text-teal-200">
                            🚑 {activeCell.day}. Gün İçin En Uygun Yedek Adayları (Dinlenme &amp; Kırmızı Korumalı)
                          </span>
                          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-700 dark:bg-slate-800">
                            {(['N24', 'M8'] as const).map((t) => (
                              <button
                                key={t}
                                type="button"
                                onClick={() => setAdvisorShiftType(t)}
                                className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                                  advisorShiftType === t
                                    ? 'bg-teal-600 text-white'
                                    : 'text-slate-600 dark:text-slate-300'
                                }`}
                              >
                                {t === 'N24' ? '24s Nöbet' : '08–16 Mesai'}
                              </button>
                            ))}
                          </div>
                        </div>

                        {advisorCandidates.length === 0 ? (
                          <p className="text-[11px] text-amber-700 dark:text-amber-300">
                            Bu gün için kural ihlali yapmayan uygun yedek aday bulunamadı.
                          </p>
                        ) : (
                          <div className="space-y-1.5">
                            {advisorCandidates.map((cand) => (
                              <div
                                key={cand.nurseId}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] dark:border-slate-700 dark:bg-slate-800"
                              >
                                <div>
                                  <span className="font-bold text-slate-900 dark:text-white">
                                    {cand.nurseName}
                                  </span>{' '}
                                  <span className="text-slate-500 dark:text-slate-400">
                                    — {cand.reasons.join(' · ')}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleApplyReplacement(cand.nurseId, 'report')}
                                    className="rounded-md bg-rose-600 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-rose-700"
                                  >
                                    Rapor Yap &amp; Ata
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleApplyReplacement(cand.nurseId, 'clear')}
                                    className="rounded-md bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-indigo-700"
                                  >
                                    Boşalt &amp; Ata
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="print-table-wrap overflow-x-auto pb-2">
              <table className="print-table w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800">
                    <th className="sticky left-0 z-20 border border-slate-300 bg-slate-100 px-2 py-1.5 text-left font-bold dark:border-slate-700 dark:bg-slate-800">
                      Hemşire
                    </th>
                    {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
                      const dow = getDayOfWeek(config.yearMonth, d);
                      const holOrWknd = isHolidayOrWeekend(d, config.yearMonth, config.holidays);
                      const hol = config.holidays[d];
                      return (
                        <th
                          key={d}
                          title={hol ? `${d} (${hol.name})` : `${d} ${TURKISH_WEEKDAYS_SHORT[dow]}`}
                          className={`min-w-[30px] border border-slate-300 px-0.5 py-1 text-center dark:border-slate-700 ${
                            holOrWknd
                              ? 'bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-slate-100'
                              : 'text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <div className="text-[11px] font-bold leading-tight">{d}</div>
                          <div className="text-[9px] font-normal opacity-75">
                            {TURKISH_WEEKDAYS_SHORT[dow]}
                          </div>
                        </th>
                      );
                    })}
                    <th className="border border-slate-300 px-2 py-1 text-center font-bold dark:border-slate-700">
                      Top.
                    </th>
                    <th className="border border-slate-300 px-2 py-1 text-center font-bold dark:border-slate-700">
                      Hdf.
                    </th>
                    <th className="border border-slate-300 px-2 py-1 text-center font-bold dark:border-slate-700">
                      Fark
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {orderedNurses.map((nurse, idx) => {
                    const roleInfo = resolveEffectiveNurseRole(nurse, config);
                    const metrics = evaluation.nurseMetrics.find((m) => m.nurseId === nurse.id);

                    return (
                      <tr
                        key={nurse.id}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                      >
                        <td className="sticky left-0 z-10 border border-slate-300 bg-white px-2 py-1 font-medium whitespace-nowrap dark:border-slate-700 dark:bg-slate-900">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-slate-400">{idx + 1}.</span>
                            <span>{nurse.name}</span>
                            {roleInfo.role === 'sorumlu' && (
                              <span className="rounded bg-amber-100 px-1 text-[9px] font-bold text-amber-800 dark:bg-amber-900/60 dark:text-amber-200">
                                S
                              </span>
                            )}
                            {roleInfo.role === 'gunduz_mesai' && (
                              <span className="rounded bg-sky-100 px-1 text-[9px] font-bold text-sky-800 dark:bg-sky-900/60 dark:text-sky-200">
                                G
                              </span>
                            )}
                            {roleInfo.role === 'pasif_izinli' && (
                              <span className="rounded bg-fuchsia-100 px-1 text-[9px] font-bold text-fuchsia-800 dark:bg-fuchsia-900/60 dark:text-fuchsia-200">
                                P
                              </span>
                            )}
                          </div>
                        </td>

                        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
                          const code: ShiftCode = assignments[nurse.id]?.[d] ?? '';
                          const meta = SHIFT_META[code];
                          const holOrWknd = isHolidayOrWeekend(d, config.yearMonth, config.holidays);
                          const cellIssues = cellIssuesMap.get(`${nurse.id}-${d}`) ?? [];
                          const hasHard = cellIssues.some((i) => i.severity === 'hard');
                          const hasWarn = !hasHard && cellIssues.some((i) => i.severity === 'warning');
                          const isSwapSrc =
                            swapSource?.nurseId === nurse.id && swapSource?.day === d;
                          const isPickerOpen =
                            activeCell?.nurseId === nurse.id && activeCell?.day === d;
                          const isPinned = Boolean(lockedCells[nurse.id]?.includes(d));

                          const pref = preferences[nurse.id];
                          const isPosDay = Boolean(pref?.positiveNobetDays?.includes(d));
                          const isPosMesaiDay = Boolean(pref?.positiveMesaiDays?.includes(d));
                          const isNegDay = Boolean(pref?.negativeDays?.includes(d));
                          const isSoftDay = Boolean(pref?.softNegativeDays?.includes(d));
                          const isLeavePrefDay = Boolean(pref?.leaveDays?.[d]);

                          const prefDotClass = isLeavePrefDay
                            ? 'bg-purple-500'
                            : isNegDay
                            ? 'bg-rose-500'
                            : isPosDay
                            ? 'bg-emerald-500'
                            : isPosMesaiDay
                            ? 'bg-sky-500'
                            : isSoftDay
                            ? 'bg-amber-400'
                            : '';

                          return (
                            <td
                              key={d}
                              className={`relative border border-slate-300 p-0.5 text-center dark:border-slate-700 ${
                                holOrWknd ? 'bg-slate-100 dark:bg-slate-800/70' : ''
                              }`}
                            >
                              <button
                                type="button"
                                disabled={!isAdmin}
                                onClick={() => handleCellClick(nurse.id, d)}
                                title={
                                  isAdmin
                                    ? cellIssues.length > 0
                                      ? cellIssues.map((ci) => ci.message).join(' | ')
                                      : `${nurse.name} · ${d}. gün: ${meta.labelTR}${
                                          isPosMesaiDay ? ' (08–16 Mesai tercihi)' : ''
                                        }${isPinned ? ' · 📌 Sabitlenmiş' : ''}`
                                    : `${nurse.name} · ${d}. gün: ${meta.labelTR}`
                                }
                                className={`relative flex h-7 w-full items-center justify-center rounded text-[11px] transition ${
                                  meta.badgeClass
                                } ${isAdmin && hasHard ? 'ring-2 ring-rose-500' : ''} ${
                                  isAdmin && hasWarn ? 'ring-2 ring-amber-400' : ''
                                } ${isAdmin && isPinned ? 'ring-1 ring-amber-500/80' : ''} ${
                                  isSwapSrc ? 'ring-2 ring-sky-500 scale-105' : ''
                                } ${
                                  isPickerOpen && !isSwapSrc ? 'ring-2 ring-indigo-500 scale-105' : ''
                                } ${
                                  isAdmin && isPosDay && code === 'N24'
                                    ? 'underline decoration-emerald-200'
                                    : ''
                                } ${
                                  isAdmin && isPosMesaiDay && code === 'M8'
                                    ? 'underline decoration-sky-400'
                                    : ''
                                }`}
                              >
                                {meta.shortLabel}
                                {isAdmin && showPrefOverlay && prefDotClass && (
                                  <span
                                    className={`no-print pointer-events-none absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full ${prefDotClass}`}
                                  />
                                )}
                                {isAdmin && isPinned && (
                                  <span className="no-print pointer-events-none absolute left-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-amber-500" />
                                )}
                              </button>
                            </td>
                          );
                        })}

                        <td className="border border-slate-300 px-1.5 py-1 text-center font-bold dark:border-slate-700">
                          {metrics?.workedHours ?? 0}
                        </td>
                        <td className="border border-slate-300 px-1.5 py-1 text-center text-slate-500 dark:border-slate-700">
                          {metrics?.targetHours ?? 0}
                        </td>
                        <td
                          className={`border border-slate-300 px-1.5 py-1 text-center font-bold dark:border-slate-700 ${
                            (metrics?.overtimeHours ?? 0) > 0
                              ? 'text-indigo-600 dark:text-indigo-400'
                              : (metrics?.overtimeHours ?? 0) < 0
                              ? 'text-rose-600'
                              : 'text-emerald-600'
                          }`}
                        >
                          {(metrics?.overtimeHours ?? 0) > 0
                            ? `+${metrics?.overtimeHours}`
                            : metrics?.overtimeHours ?? 0}
                        </td>
                      </tr>
                    );
                  })}

                  {/* Günlük Kadro Denetim Satırı */}
                  <tr className="bg-slate-50 font-semibold dark:bg-slate-800/80">
                    <td className="sticky left-0 z-10 border border-slate-300 bg-slate-50 px-2 py-1 text-[11px] dark:border-slate-700 dark:bg-slate-800">
                      Günlük Kadro
                    </td>
                    {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
                      const dc = evaluation.dailyCounts[d];
                      const ok =
                        dc &&
                        dc.nobet === dc.expectedNobet &&
                        (dc.mesai === dc.expectedMesai ||
                          (!dc.isWeekendOrHoliday &&
                            config.autoTopUpUnderHours &&
                            dc.mesai === dc.expectedMesai + 1)) &&
                        dc.sorumlu >= dc.expectedSorumlu;
                      return (
                        <td
                          key={d}
                          title={
                            dc
                              ? `${d}. gün: ${dc.nobet} Nöbetli + ${dc.mesai} Servisçi + ${dc.sorumlu} Sorumlu = ${dc.daytimeTotal} kişi`
                              : undefined
                          }
                          className={`border border-slate-300 px-0.5 py-1 text-center text-[9px] leading-tight dark:border-slate-700 ${
                            ok
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'bg-rose-100 font-bold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                          }`}
                        >
                          <div>{dc?.nobet ?? 0}N</div>
                          <div>{dc?.mesai ?? 0}M</div>
                          {dc && dc.sorumlu > 0 && <div>{dc.sorumlu}S</div>}
                          <div className="mt-0.5 border-t border-slate-300/60 pt-0.5 font-bold dark:border-slate-600">
                            {dc?.daytimeTotal ?? 0}K
                          </div>
                        </td>
                      );
                    })}
                    <td colSpan={3} className="border border-slate-300 px-2 py-1 text-center text-[10px] dark:border-slate-700">
                      H.İçi{' '}
                      {config.weekdayNobetCount +
                        config.weekdayMesaiCount +
                        (preflight.sorumluCount > 0 ? 1 : 0)}
                      K / H.Sonu {config.weekendNobetCount + config.weekendMesaiCount}K
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Adalet & Saat Karnesi Tablosu */}
          <section className="no-print rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h3 className="mb-3 text-sm font-bold text-slate-900 dark:text-white">
              Adalet &amp; Fazla Mesai Karnesi
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    <th className="py-2 pr-3">Hemşire</th>
                    <th className="px-2 py-2 text-center">Nöbet (24s)</th>
                    <th className="px-2 py-2 text-center">Mesai (8s)</th>
                    <th className="px-2 py-2 text-center">Çalışılan</th>
                    <th className="px-2 py-2 text-center">Hedef</th>
                    <th className="px-2 py-2 text-center">Fazla Mesai</th>
                    <th className="px-2 py-2 text-center">H.Sonu/Tatil</th>
                    <th className="px-2 py-2 text-center">3 Gün Boşluk</th>
                    {isAdmin && <th className="px-2 py-2 text-center">İstek (🟢/🔵)</th>}
                    {isAdmin && <th className="px-2 py-2 text-center">Kısıt (🔴/🟡)</th>}
                    <th className="px-2 py-2 text-center">3. Gün Mesai</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {evaluation.nurseMetrics.map((m) => (
                    <tr key={m.nurseId}>
                      <td className="py-2 pr-3 font-medium text-slate-900 dark:text-slate-100">
                        {m.name}
                      </td>
                      <td className="px-2 py-2 text-center">{m.nobetCount}</td>
                      <td className="px-2 py-2 text-center">{m.mesaiCount}</td>
                      <td className="px-2 py-2 text-center font-semibold">{m.workedHours} s</td>
                      <td className="px-2 py-2 text-center text-slate-500">{m.targetHours} s</td>
                      <td
                        className={`px-2 py-2 text-center font-bold ${
                          m.overtimeHours > 0
                            ? 'text-indigo-600 dark:text-indigo-400'
                            : m.overtimeHours < 0
                            ? 'text-rose-600'
                            : 'text-emerald-600'
                        }`}
                      >
                        {m.overtimeHours > 0 ? `+${m.overtimeHours}` : m.overtimeHours} s
                      </td>
                      <td className="px-2 py-2 text-center">
                        {m.weekendHolidayNobet}N + {m.weekendHolidayMesai}M
                      </td>
                      <td className="px-2 py-2 text-center">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            m.role !== 'nobetli'
                              ? 'bg-slate-100 text-slate-500 dark:bg-slate-800'
                              : m.threeDayGapCount >= 1
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                          }`}
                        >
                          {m.threeDayGapCount}
                        </span>
                        {isAdmin &&
                          m.role === 'nobetli' &&
                          (config.maxConsecutiveEmptyDays ?? 3) > 0 &&
                          m.maxEmptyStreak > (config.maxConsecutiveEmptyDays ?? 3) && (
                            <span
                              title={`Üst üste ${m.maxEmptyStreak} gün boşluk (üst sınır: ${
                                config.maxConsecutiveEmptyDays ?? 3
                              } gün)`}
                              className="ml-1 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
                            >
                              {m.maxEmptyStreak}g!
                            </span>
                          )}
                      </td>
                      {isAdmin && (
                        <td
                          className="px-2 py-2 text-center"
                          title={
                            m.positiveTotal > 0
                              ? [
                                  m.positiveNobetTotal > 0
                                    ? `🟢 Nöbet: ${m.positiveNobetMatched}/${m.positiveNobetTotal}`
                                    : '',
                                  m.positiveMesaiTotal > 0
                                    ? `🔵 Mesai: ${m.positiveMesaiMatched}/${m.positiveMesaiTotal}`
                                    : '',
                                  m.unmatchedPositiveDays.length > 0
                                    ? `Karşılanmayan günler: ${m.unmatchedPositiveDays.join(', ')}`
                                    : 'Tüm pozitif istekler karşılandı',
                                ]
                                  .filter(Boolean)
                                  .join(' · ')
                              : 'Pozitif gün isteği yok'
                          }
                        >
                          {m.positiveTotal > 0 ? (
                            <span
                              className={`font-semibold ${
                                m.positiveMatched === m.positiveTotal
                                  ? 'text-emerald-700 dark:text-emerald-300'
                                  : 'text-slate-700 dark:text-slate-200'
                              }`}
                            >
                              {m.positiveMatched}/{m.positiveTotal}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                      )}
                      {isAdmin && (
                        <td className="px-2 py-2 text-center">
                          {m.negativeTotal === 0 && m.softNegativeTotal === 0 ? (
                            '—'
                          ) : (
                            <div className="inline-flex flex-wrap items-center justify-center gap-1">
                              {m.negativeTotal > 0 && (
                                <span
                                  title={
                                    m.negativeViolations > 0
                                      ? `Delinen 🔴 günler: ${m.violatedNegativeDays.join(', ')}`
                                      : `Tüm 🔴 Çalışamam günleri (${m.negativeTotal}) korundu`
                                  }
                                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                                    m.negativeViolations > 0
                                      ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                                      : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                                  }`}
                                >
                                  🔴 {m.negativeViolations}/{m.negativeTotal}
                                  {m.violatedNegativeDays.length > 0
                                    ? ` (${m.violatedNegativeDays.join(',')}.g)`
                                    : ''}
                                </span>
                              )}
                              {m.softNegativeTotal > 0 && (
                                <span
                                  title={
                                    m.softNegativeViolations > 0
                                      ? `Vardiya düşen 🟡 günler: ${m.violatedSoftNegativeDays.join(', ')}`
                                      : `Tüm 🟡 Mümkünse Boş günleri (${m.softNegativeTotal}) boş bırakıldı`
                                  }
                                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                                    m.softNegativeViolations > 0
                                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                      : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                                  }`}
                                >
                                  🟡 {m.softNegativeViolations}/{m.softNegativeTotal}
                                  {m.violatedSoftNegativeDays.length > 0
                                    ? ` (${m.violatedSoftNegativeDays.join(',')}.g)`
                                    : ''}
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                      )}
                      <td className="px-2 py-2 text-center">
                        {m.day3MesaiCount > 0 ? (
                          <span className="text-amber-600 font-semibold">{m.day3MesaiCount}</span>
                        ) : (
                          '0'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* İhlal & Uyarı Detayları (Yalnızca Sorumlu) */}
          {isAdmin && evaluation.issues.length > 0 && (
            <section className="no-print rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <button
                type="button"
                onClick={() => setShowIssues((v) => !v)}
                className="flex w-full items-center justify-between text-left text-sm font-bold text-slate-900 dark:text-white"
              >
                <span>
                  Kural Denetim Kayıtları ({evaluation.hardViolations} sert ihlal,{' '}
                  {evaluation.softWarnings} uyarı)
                </span>
                <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
                  {showIssues ? 'Gizle' : 'Göster'}
                </span>
              </button>
              {showIssues && (
                <ul className="mt-3 space-y-1.5 text-xs">
                  {evaluation.issues.map((iss) => (
                    <li
                      key={iss.id}
                      className={`flex items-start gap-2 rounded-lg px-3 py-1.5 ${
                        iss.severity === 'hard'
                          ? 'bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200'
                          : 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
                      }`}
                    >
                      {iss.severity === 'hard' ? (
                        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      ) : (
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      )}
                      <span>{iss.message}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
};
