import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  CalendarOff,
  Download,
  Plus,
  RotateCcw,
  ShieldAlert,
  Trash2,
  Upload,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  formatMonthLabelTR,
  getDaysInMonth,
  getDefaultTurkishHolidays,
  getPrevYearMonth,
  getTurkishHolidaysForYear,
  parseYearMonth,
  TURKISH_MONTHS,
} from '../lib/calendar';
import { resolveEffectiveNurseRole } from '../solver/validator';
import {
  HolidayEntry,
  MonthConfig,
  Nurse,
  NursePreference,
  NurseRole,
  PassiveReason,
  ShiftCode,
} from '../types/schedule';

interface AdminSettingsViewProps {
  config: MonthConfig;
  nurses: Nurse[];
  preferences: Record<string, NursePreference>;
  localTcMap: Record<string, string>;
  hasPrevMonthSchedule: boolean;
  onUpdateConfig: (next: MonthConfig) => Promise<void>;
  onUpdateNurses: (next: Nurse[]) => Promise<void>;
  onDeleteNurse: (nurseId: string) => Promise<void>;
  onUpdateLocalTc: (nurseId: string, tcNo: string) => void;
  onPullPrevMonthTail: () => Promise<void>;
  onExportBackup: () => void;
  onImportBackup: (jsonText: string) => Promise<void>;
  onResetDemo: () => Promise<void>;
  onClearAllForRealRoster: () => Promise<void>;
}

export const AdminSettingsView: React.FC<AdminSettingsViewProps> = ({
  config,
  nurses,
  preferences,
  localTcMap,
  hasPrevMonthSchedule,
  onUpdateConfig,
  onUpdateNurses,
  onDeleteNurse,
  onUpdateLocalTc,
  onPullPrevMonthTail,
  onExportBackup,
  onImportBackup,
  onResetDemo,
  onClearAllForRealRoster,
}) => {
  const [newName, setNewName] = useState('');
  const [newBranch, setNewBranch] = useState('HEM');
  const [newRole, setNewRole] = useState<NurseRole>('nobetli');
  const [bulkText, setBulkText] = useState('');
  const [showBulkBox, setShowBulkBox] = useState(false);

  const [holDay, setHolDay] = useState<number>(1);
  const [holName, setHolName] = useState('');
  const [holType, setHolType] = useState<HolidayEntry['type']>('resmi');

  const backupInputRef = useRef<HTMLInputElement | null>(null);

  const orderedNurses = useMemo(
    () => [...nurses].sort((a, b) => a.sortOrder - b.sortOrder),
    [nurses]
  );

  const daysInMonth = getDaysInMonth(config.yearMonth);
  const { year: activeYear } = parseYearMonth(config.yearMonth);
  const prevYmLabel = formatMonthLabelTR(getPrevYearMonth(config.yearMonth));
  const [overviewYear, setOverviewYear] = useState<number>(() =>
    config.yearMonth === '2026-12' || activeYear >= 2027 ? 2027 : activeYear
  );
  const yearHolidays = useMemo(() => getTurkishHolidaysForYear(overviewYear), [overviewYear]);

  const handleAddSingleNurse = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    const maxOrder = nurses.reduce((m, n) => Math.max(m, n.sortOrder), 0);
    const added: Nurse = {
      id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: trimmed,
      branch: newBranch.trim() || 'HEM',
      role: newRole,
      passiveReason: newRole === 'pasif_izinli' ? 'DI' : undefined,
      sortOrder: maxOrder + 1,
      active: true,
    };
    await onUpdateNurses([...nurses, added]);
    setNewName('');
  };

  const handleBulkImportNurses = async () => {
    const lines = bulkText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return;

    let maxOrder = nurses.reduce((m, n) => Math.max(m, n.sortOrder), 0);
    const created: Nurse[] = lines.map((line, i) => {
      // İsteğe bağlı "Ad Soyad, EBE, Sorumlu" biçimini destekle
      const parts = line.split(/[,\t;]/).map((p) => p.trim());
      const name = parts[0];
      const branch = parts[1] ? parts[1].toLocaleUpperCase('tr-TR') : 'HEM';
      const roleToken = (parts[2] ?? '').toLocaleLowerCase('tr-TR');
      let role: NurseRole = 'nobetli';
      if (roleToken.includes('sorumlu')) role = 'sorumlu';
      else if (roleToken.includes('pasif') || roleToken.includes('doğum') || roleToken.includes('izin')) {
        role = 'pasif_izinli';
      }
      maxOrder += 1;
      return {
        id: `n-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 5)}`,
        name,
        branch,
        role,
        passiveReason: role === 'pasif_izinli' ? 'DI' : undefined,
        sortOrder: maxOrder,
        active: true,
      };
    });

    await onUpdateNurses([...nurses, ...created]);
    setBulkText('');
    setShowBulkBox(false);
  };

  const handleMonthlyRoleOverride = async (nurse: Nurse, role: NurseRole) => {
    const nextOverrides = { ...config.nurseRoleOverrides };
    if (role === nurse.role) {
      delete nextOverrides[nurse.id];
    } else {
      nextOverrides[nurse.id] = {
        role,
        passiveReason: role === 'pasif_izinli' ? nurse.passiveReason ?? 'DI' : undefined,
      };
    }
    await onUpdateConfig({ ...config, nurseRoleOverrides: nextOverrides });
  };

  const handlePassiveReasonChange = async (nurseId: string, reason: PassiveReason) => {
    const nextOverrides = {
      ...config.nurseRoleOverrides,
      [nurseId]: { role: 'pasif_izinli' as NurseRole, passiveReason: reason },
    };
    await onUpdateConfig({ ...config, nurseRoleOverrides: nextOverrides });
  };

  const handleTailChange = async (nurseId: string, idx: 0 | 1 | 2, code: ShiftCode) => {
    const cur = config.prevMonthTail[nurseId] ?? ['', '', ''];
    const nextTuple: [ShiftCode, ShiftCode, ShiftCode] = [cur[0], cur[1], cur[2]];
    nextTuple[idx] = code;
    await onUpdateConfig({
      ...config,
      prevMonthTail: {
        ...config.prevMonthTail,
        [nurseId]: nextTuple,
      },
    });
  };

  const handleAddHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!holName.trim() || holDay < 1 || holDay > daysInMonth) return;
    await onUpdateConfig({
      ...config,
      holidays: {
        ...config.holidays,
        [holDay]: { name: holName.trim(), type: holType },
      },
    });
    setHolName('');
  };

  const handleRemoveHoliday = async (day: number) => {
    const next = { ...config.holidays };
    delete next[day];
    await onUpdateConfig({ ...config, holidays: next });
  };

  const handleBackupFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const text = await file.text();
    await onImportBackup(text);
  };

  return (
    <div className="space-y-6">
      {/* 1. Personel Kadrosu & Aylık Rol Yönetimi */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white sm:text-lg">
              <Users className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              Servis Hemşire Kadrosu &amp; {formatMonthLabelTR(config.yearMonth)} Rolleri
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Sorumlu rapordayken rolünü bu ay için Nöbetli yapabilir (10+1 ↔ 11+1), doğum iznindeki
              arkadaşları Pasif İzinli tutarak yalnızca resmî Excel çıktısında gösterebilirsiniz.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(() => {
              const submittedCount = nurses.filter((n) => Boolean(preferences[n.id]?.updatedAt)).length;
              return (
                <button
                  type="button"
                  disabled={submittedCount === 0}
                  onClick={() => {
                    if (
                      window.confirm(
                        `${formatMonthLabelTR(config.yearMonth)} ayında tercih girmeyen nöbetli personeller pasife çekilecek (geçmiş kayıtlar silinmez). Onaylıyor musunuz?`
                      )
                    ) {
                      void onUpdateNurses(
                        nurses.map((n) => {
                          const eff = resolveEffectiveNurseRole(n, config);
                          const hasSubmitted = Boolean(preferences[n.id]?.updatedAt);
                          return {
                            ...n,
                            active: hasSubmitted || eff.role !== 'nobetli',
                          };
                        })
                      );
                    }
                  }}
                  title="Servisten ayrılan veya bu ay girmeyen personelleri tek tıkla pasife alır"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-45 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                >
                  <UserCheck className="h-4 w-4" /> Sadece Bu Ay Tercih Girenleri Aktif Bırak ({submittedCount} kişi)
                </button>
              );
            })()}

            <button
              type="button"
              onClick={() => setShowBulkBox((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-300 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300"
            >
              <UserPlus className="h-4 w-4" /> Toplu Personel Ekle
            </button>
          </div>
        </div>

        {/* KVKK Uyarısı */}
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <div>
            <strong>KVKK Koruması:</strong> Aşağıya girilen <strong>TC Kimlik No</strong> değerleri
            kesinlikle Supabase bulutuna gönderilmez; yalnızca sizin bu tarayıcınızda tutulur ve
            sadece YH.FR.31 Excel dosyası indirilirken yerel olarak eklenir.
          </div>
        </div>

        {/* Toplu İsim Yapıştırma Kutusu */}
        {showBulkBox && (
          <div className="mb-5 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 dark:border-indigo-800 dark:bg-indigo-950/30">
            <label className="mb-1.5 block text-xs font-bold text-indigo-900 dark:text-indigo-200">
              Her satıra bir isim gelecek şekilde yapıştırın (isteğe bağlı: Ad Soyad, Branş, Rol)
            </label>
            <textarea
              rows={4}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={'Örn:\nAyşe Kaya, HEM, Sorumlu\nFatma Demir, HEM\nDeniz Şahin, EBE'}
              className="w-full rounded-xl border border-indigo-300 bg-white p-2.5 text-xs focus:outline-none dark:border-indigo-700 dark:bg-slate-800 dark:text-slate-100"
            />
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowBulkBox(false)}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={handleBulkImportNurses}
                className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
              >
                Listeye Ekle
              </button>
            </div>
          </div>
        )}

        {/* Tekil Personel Ekleme */}
        <form onSubmit={handleAddSingleNurse} className="mb-4 flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[180px]">
            <label className="mb-1 block text-[11px] font-medium text-slate-500">Adı Soyadı</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Hemşire Adı Soyadı"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
          <div className="w-24">
            <label className="mb-1 block text-[11px] font-medium text-slate-500">Branş</label>
            <input
              type="text"
              value={newBranch}
              onChange={(e) => setNewBranch(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
          <div className="w-36">
            <label className="mb-1 block text-[11px] font-medium text-slate-500">Varsayılan Rol</label>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as NurseRole)}
              className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-xs dark:border-slate-700 dark:bg-slate-800"
            >
              <option value="nobetli">Nöbetli</option>
              <option value="sorumlu">Sorumlu</option>
              <option value="pasif_izinli">Pasif / Doğum İzni</option>
            </select>
          </div>
          <button
            type="submit"
            className="inline-flex items-center gap-1 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" /> Ekle
          </button>
        </form>

        {/* Kadro Tablosu */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-700">
                <th className="py-2 pr-2">#</th>
                <th className="px-2 py-2 text-center">Aktif</th>
                <th className="px-2 py-2">Adı Soyadı</th>
                <th className="px-2 py-2">Branş</th>
                <th className="px-2 py-2">TC Kimlik No (Yerel)</th>
                <th className="px-2 py-2">Bu Ayki Rol ({formatMonthLabelTR(config.yearMonth)})</th>
                <th className="px-2 py-2 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {orderedNurses.map((nurse, i) => {
                const eff = resolveEffectiveNurseRole(nurse, config);
                return (
                  <tr key={nurse.id} className={!nurse.active ? 'opacity-50' : ''}>
                    <td className="py-2 pr-2 text-slate-400">{i + 1}</td>
                    <td className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={nurse.active}
                        title={
                          nurse.active
                            ? 'Aktif (bu ay listede). Giden personelin işaretini kaldırabilirsiniz.'
                            : 'Pasif (listeye ve çizelgeye alınmaz)'
                        }
                        onChange={(e) => {
                          const checked = e.target.checked;
                          void onUpdateNurses(
                            nurses.map((n) => (n.id === nurse.id ? { ...n, active: checked } : n))
                          );
                        }}
                        className="rounded border-slate-300 text-indigo-600"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="text"
                        value={nurse.name}
                        onChange={(e) => {
                          const val = e.target.value;
                          void onUpdateNurses(
                            nurses.map((n) => (n.id === nurse.id ? { ...n, name: val } : n))
                          );
                        }}
                        className="w-44 rounded-lg border border-transparent bg-transparent px-1.5 py-1 font-medium hover:border-slate-300 focus:border-indigo-500 focus:bg-white focus:outline-none dark:hover:border-slate-700 dark:focus:bg-slate-800"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="text"
                        value={nurse.branch}
                        onChange={(e) => {
                          const val = e.target.value.toLocaleUpperCase('tr-TR');
                          void onUpdateNurses(
                            nurses.map((n) => (n.id === nurse.id ? { ...n, branch: val } : n))
                          );
                        }}
                        className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1 text-center dark:border-slate-700 dark:bg-slate-800"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={11}
                        value={localTcMap[nurse.id] ?? ''}
                        onChange={(e) => onUpdateLocalTc(nurse.id, e.target.value)}
                        placeholder="11 haneli (yerel)"
                        className="w-32 rounded-lg border border-slate-200 bg-white px-2 py-1 font-mono text-[11px] dark:border-slate-700 dark:bg-slate-800"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1.5">
                        <select
                          value={eff.role}
                          onChange={(e) =>
                            void handleMonthlyRoleOverride(nurse, e.target.value as NurseRole)
                          }
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
                        >
                          <option value="nobetli">Nöbetli</option>
                          <option value="sorumlu">Sorumlu</option>
                          <option value="pasif_izinli">Pasif İzinli</option>
                        </select>
                        {eff.role === 'pasif_izinli' && (
                          <select
                            value={eff.passiveReason ?? 'DI'}
                            onChange={(e) =>
                              void handlePassiveReasonChange(
                                nurse.id,
                                e.target.value as PassiveReason
                              )
                            }
                            className="rounded-lg border border-fuchsia-300 bg-fuchsia-50 px-1.5 py-1 text-[11px] text-fuchsia-900 dark:border-fuchsia-700 dark:bg-fuchsia-950/50 dark:text-fuchsia-200"
                          >
                            <option value="DI">Dİ (Doğum İzni)</option>
                            <option value="R">R (Rapor)</option>
                            <option value="YI">Yİ (Yıllık İzin)</option>
                            <option value="II">İİ (İdari İzin)</option>
                          </select>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => void onDeleteNurse(nurse.id)}
                        title="Personeli sil"
                        className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 2. Ay Devri (Önceki Ayın Son 3 Günü) */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white sm:text-base">
              Ay Devri — Önceki Ayın ({prevYmLabel}) Son 3 Günü
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Önceki ayın son günü nöbet tutan kişiye ayın 1&apos;i boş, sondan 2. günü nöbet
              tutana ayın 1&apos;i nöbet verilmez.
            </p>
          </div>
          <button
            type="button"
            disabled={!hasPrevMonthSchedule}
            onClick={() => void onPullPrevMonthTail()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-300 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-45 dark:border-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300"
          >
            <ArrowDownToLine className="h-4 w-4" />
            {hasPrevMonthSchedule
              ? `${prevYmLabel} Çizelgesinden Otomatik Çek`
              : `${prevYmLabel} Çizelgesi Henüz Yok`}
          </button>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {orderedNurses
            .filter((n) => resolveEffectiveNurseRole(n, config).role === 'nobetli')
            .map((nurse) => {
              const tail = config.prevMonthTail[nurse.id] ?? ['', '', ''];
              return (
                <div
                  key={nurse.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800/70"
                >
                  <span className="truncate font-medium">{nurse.name}</span>
                  <div className="flex items-center gap-1">
                    {(['G-2', 'G-1', 'Son'] as const).map((lbl, idx) => (
                      <select
                        key={lbl}
                        title={`${nurse.name} — ${lbl}`}
                        value={tail[idx]}
                        onChange={(e) =>
                          void handleTailChange(
                            nurse.id,
                            idx as 0 | 1 | 2,
                            e.target.value as ShiftCode
                          )
                        }
                        className="rounded border border-slate-300 bg-white px-1.5 py-1 text-[11px] dark:border-slate-600 dark:bg-slate-900"
                      >
                        <option value="">{lbl}: ·</option>
                        <option value="N24">{lbl}: 24</option>
                        <option value="M8">{lbl}: 8</option>
                      </select>
                    ))}
                  </div>
                </div>
              );
            })}
        </div>
      </section>

      {/* 3. Servis Kuralları & YH.FR.31 Başlık Ayarları */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
        <h3 className="mb-4 text-sm font-bold text-slate-900 dark:text-white sm:text-base">
          Servis Kuralları &amp; YH.FR.31 Kurum Bilgileri
        </h3>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Klinik / Birim Adı
            </label>
            <input
              type="text"
              value={config.clinicName}
              onChange={(e) => void onUpdateConfig({ ...config, clinicName: e.target.value })}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Hastane Adı
            </label>
            <input
              type="text"
              value={config.hospitalName}
              onChange={(e) => void onUpdateConfig({ ...config, hospitalName: e.target.value })}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Tercih Girişi Son Tarihi (Bilgi Notu)
            </label>
            <input
              type="text"
              value={config.preferenceDeadline ?? ''}
              onChange={(e) =>
                void onUpdateConfig({ ...config, preferenceDeadline: e.target.value })
              }
              placeholder="Örn: 25 Kasım 17:00"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                H.İçi Nöbet (24s)
              </label>
              <input
                type="number"
                min={1}
                max={6}
                value={config.weekdayNobetCount}
                onChange={(e) =>
                  void onUpdateConfig({ ...config, weekdayNobetCount: Number(e.target.value) || 2 })
                }
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                H.İçi Mesai (8s)
              </label>
              <input
                type="number"
                min={0}
                max={8}
                value={config.weekdayMesaiCount}
                onChange={(e) =>
                  void onUpdateConfig({ ...config, weekdayMesaiCount: Number(e.target.value) || 0 })
                }
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                H.Sonu/Tatil Nöbet
              </label>
              <input
                type="number"
                min={1}
                max={6}
                value={config.weekendNobetCount}
                onChange={(e) =>
                  void onUpdateConfig({ ...config, weekendNobetCount: Number(e.target.value) || 2 })
                }
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                H.Sonu/Tatil Mesai
              </label>
              <input
                type="number"
                min={0}
                max={6}
                value={config.weekendMesaiCount}
                onChange={(e) =>
                  void onUpdateConfig({ ...config, weekendMesaiCount: Number(e.target.value) || 0 })
                }
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
          </div>

          <div className="flex flex-col justify-center gap-2 text-xs">
            <label className="inline-flex items-center gap-2 font-medium">
              <input
                type="checkbox"
                checked={config.compensateSorumluAbsence !== false}
                onChange={(e) =>
                  void onUpdateConfig({ ...config, compensateSorumluAbsence: e.target.checked })
                }
                className="rounded border-slate-300 text-indigo-600"
              />
              Hafta içi 5 kişi kuralı: Sorumlu izinli/yoksa +1 servisçi (mesai) ekle
            </label>
            <label className="inline-flex items-center gap-2 font-medium">
              <input
                type="checkbox"
                checked={config.autoTopUpUnderHours}
                onChange={(e) =>
                  void onUpdateConfig({ ...config, autoTopUpUnderHours: e.target.checked })
                }
                className="rounded border-slate-300 text-indigo-600"
              />
              Eksik saatleri hafta içi +1 mesai ile tamamla (11 kişi vb.)
            </label>
            <label className="inline-flex items-center gap-2 font-medium">
              <input
                type="checkbox"
                checked={config.isRiskyUnit}
                onChange={(e) =>
                  void onUpdateConfig({ ...config, isRiskyUnit: e.target.checked })
                }
                className="rounded border-slate-300 text-indigo-600"
              />
              Riskli Birim (YH.FR.31 Riskli Nöbet sütunlarını kullan)
            </label>
            <label className="inline-flex items-center gap-2 font-medium">
              <input
                type="checkbox"
                checked={config.preferencesLocked}
                onChange={(e) =>
                  void onUpdateConfig({ ...config, preferencesLocked: e.target.checked })
                }
                className="rounded border-slate-300 text-indigo-600"
              />
              Tercih girişini kilitle
            </label>
          </div>
        </div>
      </section>

      {/* 4. Resmî Tatil & İdari İzin Yönetimi */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white sm:text-base">
            <CalendarOff className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            Resmî Tatil, Bayram &amp; İdari İzinler ({formatMonthLabelTR(config.yearMonth)})
          </h3>
          <button
            type="button"
            onClick={() =>
              void onUpdateConfig({
                ...config,
                holidays: getDefaultTurkishHolidays(config.yearMonth),
              })
            }
            className="inline-flex items-center gap-1 rounded-xl border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Varsayılan Tatilleri Yenile
          </button>
        </div>

        <form onSubmit={handleAddHoliday} className="mb-3 flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-[11px] text-slate-500">Gün</label>
            <input
              type="number"
              min={1}
              max={daysInMonth}
              value={holDay}
              onChange={(e) => setHolDay(Number(e.target.value))}
              className="w-20 rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="mb-1 block text-[11px] text-slate-500">Tatil / İdari İzin Adı</label>
            <input
              type="text"
              value={holName}
              onChange={(e) => setHolName(e.target.value)}
              placeholder="Örn: İdari İzin veya Özel Tatil"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-slate-500">Tür</label>
            <select
              value={holType}
              onChange={(e) => setHolType(e.target.value as HolidayEntry['type'])}
              className="rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800"
            >
              <option value="resmi">Resmî Tatil (Tam Gün)</option>
              <option value="bayram">Dinî Bayram (Tam Gün)</option>
              <option value="idari">İdari İzin (Tam Gün)</option>
              <option value="arefe">Arife (Yarım Gün - 4s)</option>
            </select>
          </div>
          <button
            type="submit"
            className="rounded-xl bg-slate-800 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-900 dark:bg-indigo-600"
          >
            Tatil Ekle
          </button>
        </form>

        {Object.keys(config.holidays).length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Bu ay için kayıtlı resmî tatil, bayram veya idari izin günü yok.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {Object.entries(config.holidays)
              .sort((a, b) => Number(a[0]) - Number(b[0]))
              .map(([dStr, entry]) => (
                <div
                  key={dStr}
                  className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs text-indigo-900 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200"
                >
                  <span>
                    <strong>{dStr}. gün:</strong> {entry.name} ({entry.type})
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleRemoveHoliday(Number(dStr))}
                    className="text-rose-600 hover:text-rose-800"
                  >
                    ×
                  </button>
                </div>
              ))}
          </div>
        )}

        {/* Yıllık Resmî Tatil & İdari İzin Takvimi Özeti */}
        <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-800">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300">
              {overviewYear} Yılı Otomatik Tanımlı Resmî Tatil &amp; İdari İzin Takvimi ({yearHolidays.length} kayıt)
            </h4>
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-700 dark:bg-slate-800">
              {[2026, 2027].map((yr) => (
                <button
                  key={yr}
                  type="button"
                  onClick={() => setOverviewYear(yr)}
                  className={`rounded-md px-2.5 py-0.5 text-[11px] font-semibold transition ${
                    overviewYear === yr
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
                  }`}
                >
                  {yr}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {yearHolidays.map((item) => {
              const mNum = parseYearMonth(item.yearMonth).month;
              const badgeColor =
                item.entry.type === 'idari'
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200'
                  : item.entry.type === 'arefe'
                  ? 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200'
                  : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200';
              return (
                <div
                  key={`${item.yearMonth}-${item.day}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] dark:border-slate-700 dark:bg-slate-800/60"
                >
                  <span className="truncate">
                    <strong>
                      {item.day} {TURKISH_MONTHS[mNum - 1]}:
                    </strong>{' '}
                    {item.entry.name}
                  </span>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${badgeColor}`}>
                    {item.entry.type === 'idari'
                      ? 'İdari'
                      : item.entry.type === 'arefe'
                      ? 'Yarım Gün'
                      : item.entry.type === 'bayram'
                      ? 'Bayram'
                      : 'Resmî'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 5. Yedekleme & Gerçek Kadroya Geçiş */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
        <h3 className="mb-3 text-sm font-bold text-slate-900 dark:text-white sm:text-base">
          Veri Yedekleme &amp; Sıfırlama İşlemleri
        </h3>
        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={onExportBackup}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-900 dark:bg-slate-700"
          >
            <Download className="h-4 w-4" /> JSON Yedek İndir
          </button>

          <input
            ref={backupInputRef}
            type="file"
            accept=".json"
            onChange={handleBackupFile}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => backupInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <Upload className="h-4 w-4" /> JSON Yedek Yükle
          </button>

          <button
            type="button"
            onClick={() => {
              if (
                window.confirm(
                  'Örnek demo hemşireler ve test tercihleri silinip sıfırdan gerçek Nefroloji kadronuzu girmeniz için temizlenecek. Onaylıyor musunuz?'
                )
              ) {
                void onClearAllForRealRoster();
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-800 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
          >
            <Trash2 className="h-4 w-4" /> Demo Verisini Temizle (Gerçek Kadroya Geç)
          </button>

          <button
            type="button"
            onClick={() => {
              if (window.confirm('Tüm veriler örnek Nefroloji demo verisine sıfırlanacak. Emin misiniz?')) {
                void onResetDemo();
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
          >
            <RotateCcw className="h-4 w-4" /> Örnek Demo Verisini Yükle
          </button>
        </div>
      </section>
    </div>
  );
};
