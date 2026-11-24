import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  Download,
  Eraser,
  FileSpreadsheet,
  MousePointerClick,
  Pencil,
  Printer,
  RefreshCw,
  Sparkles,
  Undo2,
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
import { MANUAL_SHIFT_OPTIONS, SHIFT_META } from '../lib/shifts';
import { exportYHFR31Excel, fillUploadedYHFR31Template } from '../lib/yhfr31Export';
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
  isAdmin: boolean;
  solving: boolean;
  solveProgress: number;
  onSolve: (newSeed?: boolean) => void;
  onUpdateAssignments: (next: Record<string, Record<number, ShiftCode>>) => void;
  onNotify: (type: 'success' | 'error' | 'warning' | 'info', msg: string) => void;
}

type ManualTool = 'picker' | 'swap' | ShiftCode;

export const ScheduleView: React.FC<ScheduleViewProps> = ({
  config,
  nurses,
  preferences,
  schedule,
  localTcMap,
  isAdmin,
  solving,
  solveProgress,
  onSolve,
  onUpdateAssignments,
  onNotify,
}) => {
  const [manualTool, setManualTool] = useState<ManualTool>('picker');
  const [swapSource, setSwapSource] = useState<{ nurseId: string; day: number } | null>(null);
  const [activeCell, setActiveCell] = useState<{ nurseId: string; day: number } | null>(null);
  const [history, setHistory] = useState<Record<string, Record<number, ShiftCode>>[]>([]);
  const [showIssues, setShowIssues] = useState(true);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setHistory([]);
    setSwapSource(null);
    setActiveCell(null);
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

  const preflight = useMemo(
    () => runPreflightChecks(config, nurses, preferences),
    [config, nurses, preferences]
  );

  const evaluation = useMemo(
    () => evaluateSchedule(config, nurses, preferences, assignments),
    [config, nurses, preferences, assignments]
  );

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
      setActiveCell((prev) =>
        prev && prev.nurseId === nurseId && prev.day === day ? null : { nurseId, day }
      );
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
                {solving ? `Çözülüyor (%${solveProgress})...` : 'Akıllı Çizelge Oluştur'}
              </button>

              {hasAnyAssignment && (
                <button
                  type="button"
                  disabled={solving}
                  onClick={() => onSolve(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-300 bg-indigo-50 px-3.5 py-2.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 dark:border-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Yeni Alternatif
                </button>
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

        {hasAnyAssignment && (
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

      {!hasAnyAssignment ? (
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
          {/* Çözüm Kalitesi Özet Kartları */}
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
              <div
                className={`mt-1 text-xl font-bold ${
                  evaluation.hourSpread <= 8
                    ? 'text-emerald-600'
                    : evaluation.hourSpread <= 16
                    ? 'text-indigo-600 dark:text-indigo-400'
                    : 'text-amber-600'
                }`}
              >
                {evaluation.hourSpread} saat
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Hedef: en fazla 8–16 saat fark
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
              <div className="text-xs text-slate-500 dark:text-slate-400">Nöbet İsteği Karşılama</div>
              <div className="mt-1 text-xl font-bold text-indigo-600 dark:text-indigo-400">
                %{evaluation.preferenceSatisfactionPct}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Hafta sonu farkı: {evaluation.weekendSpread}
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
                      }}
                      className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
                        manualTool === 'swap'
                          ? 'border-amber-500 bg-amber-500 text-white'
                          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200'
                      }`}
                    >
                      <ArrowLeftRight className="h-3.5 w-3.5" /> Değiş-Tokuş
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

                {/* Kırpılmayan Seçili Hücre İşlem Çubuğu */}
                {manualTool === 'picker' && activeCell && (
                  <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50/90 px-2.5 py-1.5 text-xs dark:border-indigo-800 dark:bg-indigo-950/50">
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
                          onClick={() => handleSetCellShift(activeCell.nurseId, activeCell.day, opt)}
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
                      onClick={() => setActiveCell(null)}
                      className="ml-auto text-[11px] font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400"
                    >
                      Kapat
                    </button>
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

                          const pref = preferences[nurse.id];
                          const isPosDay = pref?.positiveNobetDays.includes(d);

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
                                  cellIssues.length > 0
                                    ? cellIssues.map((ci) => ci.message).join(' | ')
                                    : `${nurse.name} · ${d}. gün: ${meta.labelTR}`
                                }
                                className={`flex h-7 w-full items-center justify-center rounded text-[11px] transition ${
                                  meta.badgeClass
                                } ${hasHard ? 'ring-2 ring-rose-500' : ''} ${
                                  hasWarn ? 'ring-2 ring-amber-400' : ''
                                } ${isSwapSrc ? 'ring-2 ring-sky-500 scale-105' : ''} ${
                                  isPickerOpen && !isSwapSrc ? 'ring-2 ring-indigo-500 scale-105' : ''
                                } ${
                                  isPosDay && code === 'N24' ? 'underline decoration-emerald-200' : ''
                                }`}
                              >
                                {meta.shortLabel}
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
                      H.İçi 5K / H.Sonu 3K
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
                    <th className="px-2 py-2 text-center">İstek Uyumu</th>
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
                      </td>
                      <td className="px-2 py-2 text-center">
                        {m.positiveTotal > 0 ? `${m.positiveMatched}/${m.positiveTotal}` : '—'}
                      </td>
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

          {/* İhlal & Uyarı Detayları */}
          {evaluation.issues.length > 0 && (
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
