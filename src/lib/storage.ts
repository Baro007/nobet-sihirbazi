import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getDefaultTurkishHolidays, getDaysInMonth, getPrevYearMonth } from './calendar';
import {
  createDefaultMonthConfig,
  createDemoMonthConfig,
  createDemoNurses,
  createDemoPreferences,
  DEFAULT_YEAR_MONTH,
} from './demoData';
import {
  MonthConfig,
  MonthSchedule,
  Nurse,
  NursePreference,
  PrevMonthFairnessCarryOver,
  ShiftCode,
} from '../types/schedule';
import { evaluateSchedule } from '../solver/validator';

const LOCAL_KEYS = {
  nurses: 'hemsire-nobet-nurses-v2',
  configs: 'hemsire-nobet-configs-v2',
  prefs: 'hemsire-nobet-prefs-v2',
  schedules: 'hemsire-nobet-schedules-v2',
  localPii: 'hemsire-nobet-local-pii',
  initialized: 'hemsire-nobet-initialized-v2',
} as const;

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(SUPABASE_URL?.trim() && SUPABASE_ANON_KEY?.trim());

let supabaseClient: SupabaseClient | null = null;
function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!supabaseClient) {
    supabaseClient = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!);
  }
  return supabaseClient;
}

function safeReadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeWriteJson<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Depolama kotası veya gizli sekme hatası sessizce geçilir
  }
}

export interface StoreSnapshot {
  nurses: Nurse[];
  configs: Record<string, MonthConfig>;
  preferencesByMonth: Record<string, Record<string, NursePreference>>;
  schedulesByMonth: Record<string, MonthSchedule>;
  storageMode: 'supabase' | 'local';
  syncError?: string;
}

function loadLocalSnapshot(): StoreSnapshot {
  const nurses = safeReadJson<Nurse[]>(LOCAL_KEYS.nurses, []);
  let configs = safeReadJson<Record<string, MonthConfig>>(LOCAL_KEYS.configs, {});
  const preferencesByMonth = safeReadJson<Record<string, Record<string, NursePreference>>>(
    LOCAL_KEYS.prefs,
    {}
  );
  const schedulesByMonth = safeReadJson<Record<string, MonthSchedule>>(LOCAL_KEYS.schedules, {});
  const wasInitialized = localStorage.getItem(LOCAL_KEYS.initialized) === '1';

  if (!wasInitialized) {
    if (Object.keys(configs).length === 0) {
      configs = { [DEFAULT_YEAR_MONTH]: createDefaultMonthConfig(DEFAULT_YEAR_MONTH) };
    }
    safeWriteJson(LOCAL_KEYS.nurses, nurses);
    safeWriteJson(LOCAL_KEYS.configs, configs);
    safeWriteJson(LOCAL_KEYS.prefs, preferencesByMonth);
    localStorage.setItem(LOCAL_KEYS.initialized, '1');
  }

  return {
    nurses,
    configs,
    preferencesByMonth,
    schedulesByMonth,
    storageMode: 'local',
  };
}

function formatSupabaseErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? 'Supabase bağlantı hatası');
  if (
    msg.includes('does not exist') ||
    msg.includes('Could not find the table') ||
    msg.includes('42P01') ||
    msg.includes('PGRST205')
  ) {
    return 'Supabase tabloları henüz oluşturulmamış. Lütfen supabase/schema.sql dosyasını Supabase SQL Editor içinde çalıştırın (şimdilik yerel mod aktif).';
  }
  return msg;
}

export async function loadInitialStore(): Promise<StoreSnapshot> {
  const client = getSupabase();
  if (!client) {
    return loadLocalSnapshot();
  }

  try {
    const [nursesRes, configsRes, prefsRes, schedsRes] = await Promise.all([
      client.from('app_nurses').select('*').order('sort_order', { ascending: true }),
      client.from('app_month_configs').select('*'),
      client.from('app_nurse_preferences').select('*'),
      client.from('app_month_schedules').select('*'),
    ]);

    if (nursesRes.error) throw nursesRes.error;
    if (configsRes.error) throw configsRes.error;
    if (prefsRes.error) throw prefsRes.error;
    if (schedsRes.error) throw schedsRes.error;

    const nurses: Nurse[] = (nursesRes.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      branch: row.branch || 'HEM',
      role: row.default_role || 'nobetli',
      passiveReason: row.passive_reason || undefined,
      sortOrder: row.sort_order ?? 0,
      active: row.active ?? true,
      notes: row.notes || '',
    }));

    const configs: Record<string, MonthConfig> = {};
    for (const row of configsRes.data ?? []) {
      configs[row.year_month] = row.config_json as MonthConfig;
    }

    const preferencesByMonth: Record<string, Record<string, NursePreference>> = {};
    for (const row of prefsRes.data ?? []) {
      if (!preferencesByMonth[row.year_month]) preferencesByMonth[row.year_month] = {};
      preferencesByMonth[row.year_month][row.nurse_id] = row.pref_json as NursePreference;
    }

    const schedulesByMonth: Record<string, MonthSchedule> = {};
    for (const row of schedsRes.data ?? []) {
      schedulesByMonth[row.year_month] = row.schedule_json as MonthSchedule;
    }

    // Eğer Supabase tamamen boşsa yalnızca temiz başlangıç ay yapılandırmasını oluştur (demo personel ekleme)
    if (nurses.length === 0 && Object.keys(configs).length === 0) {
      const freshConfig = createDefaultMonthConfig(DEFAULT_YEAR_MONTH);
      configs[DEFAULT_YEAR_MONTH] = freshConfig;
      await saveMonthConfigToStore(freshConfig);
    }

    safeWriteJson(LOCAL_KEYS.nurses, nurses);
    safeWriteJson(LOCAL_KEYS.configs, configs);
    safeWriteJson(LOCAL_KEYS.prefs, preferencesByMonth);
    safeWriteJson(LOCAL_KEYS.schedules, schedulesByMonth);
    localStorage.setItem(LOCAL_KEYS.initialized, '1');

    return {
      nurses,
      configs,
      preferencesByMonth,
      schedulesByMonth,
      storageMode: 'supabase',
    };
  } catch (err) {
    const local = loadLocalSnapshot();
    return {
      ...local,
      storageMode: 'local',
      syncError: formatSupabaseErrorMessage(err),
    };
  }
}

export async function saveNursesToStore(nurses: Nurse[]): Promise<void> {
  safeWriteJson(LOCAL_KEYS.nurses, nurses);
  const client = getSupabase();
  if (!client) return;

  const rows = nurses.map((n) => ({
    id: n.id,
    name: n.name,
    branch: n.branch || 'HEM',
    default_role: n.role,
    passive_reason: n.passiveReason ?? null,
    sort_order: n.sortOrder,
    active: n.active,
    notes: n.notes ?? '',
    updated_at: new Date().toISOString(),
  }));

  if (rows.length > 0) {
    const { error } = await client.from('app_nurses').upsert(rows, { onConflict: 'id' });
    if (error) throw error;
  }
}

export async function deleteNurseFromStore(nurseId: string, remaining: Nurse[]): Promise<void> {
  safeWriteJson(LOCAL_KEYS.nurses, remaining);
  const client = getSupabase();
  if (!client) return;
  const { error } = await client.from('app_nurses').delete().eq('id', nurseId);
  if (error) throw error;
}

export async function saveMonthConfigToStore(config: MonthConfig): Promise<void> {
  const configs = safeReadJson<Record<string, MonthConfig>>(LOCAL_KEYS.configs, {});
  configs[config.yearMonth] = config;
  safeWriteJson(LOCAL_KEYS.configs, configs);

  const client = getSupabase();
  if (!client) return;
  const { error } = await client.from('app_month_configs').upsert(
    {
      year_month: config.yearMonth,
      config_json: config,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'year_month' }
  );
  if (error) throw error;
}

export async function saveNursePreferenceToStore(pref: NursePreference): Promise<void> {
  const all = safeReadJson<Record<string, Record<string, NursePreference>>>(LOCAL_KEYS.prefs, {});
  if (!all[pref.yearMonth]) all[pref.yearMonth] = {};
  all[pref.yearMonth][pref.nurseId] = pref;
  safeWriteJson(LOCAL_KEYS.prefs, all);

  const client = getSupabase();
  if (!client) return;
  const { error } = await client.from('app_nurse_preferences').upsert(
    {
      year_month: pref.yearMonth,
      nurse_id: pref.nurseId,
      pref_json: pref,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'year_month,nurse_id' }
  );
  if (error) throw error;
}

export async function saveMonthPreferencesToStore(
  yearMonth: string,
  prefsMap: Record<string, NursePreference>
): Promise<void> {
  const all = safeReadJson<Record<string, Record<string, NursePreference>>>(LOCAL_KEYS.prefs, {});
  all[yearMonth] = prefsMap;
  safeWriteJson(LOCAL_KEYS.prefs, all);

  const client = getSupabase();
  if (!client) return;
  const rows = Object.values(prefsMap).map((pref) => ({
    year_month: yearMonth,
    nurse_id: pref.nurseId,
    pref_json: pref,
    updated_at: new Date().toISOString(),
  }));
  if (rows.length > 0) {
    const { error } = await client
      .from('app_nurse_preferences')
      .upsert(rows, { onConflict: 'year_month,nurse_id' });
    if (error) throw error;
  }
}

export async function saveMonthScheduleToStore(schedule: MonthSchedule): Promise<void> {
  const all = safeReadJson<Record<string, MonthSchedule>>(LOCAL_KEYS.schedules, {});
  all[schedule.yearMonth] = schedule;
  safeWriteJson(LOCAL_KEYS.schedules, all);

  const client = getSupabase();
  if (!client) return;
  const { error } = await client.from('app_month_schedules').upsert(
    {
      year_month: schedule.yearMonth,
      schedule_json: schedule,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'year_month' }
  );
  if (error) throw error;
}

export function getLocalTcMap(): Record<string, string> {
  return safeReadJson<Record<string, string>>(LOCAL_KEYS.localPii, {});
}

export function setLocalTc(nurseId: string, tcNo: string): Record<string, string> {
  const map = getLocalTcMap();
  const clean = tcNo.replace(/\D/g, '').slice(0, 11);
  if (clean) {
    map[nurseId] = clean;
  } else {
    delete map[nurseId];
  }
  safeWriteJson(LOCAL_KEYS.localPii, map);
  return map;
}

/**
 * Yeni bir aya geçerken varsa bir önceki ayın ayarlarını miras alır,
 * resmî tatilleri otomatik yükler ve önceki ayın çizelgesinin son 3 gününü
 * prevMonthTail alanına otomatik aktarır.
 */
export function buildOrInheritMonthConfig(
  yearMonth: string,
  configs: Record<string, MonthConfig>,
  schedulesByMonth: Record<string, MonthSchedule>
): MonthConfig {
  const existing = configs[yearMonth];
  if (existing) return existing;

  const prevYm = getPrevYearMonth(yearMonth);
  const prevConfig = configs[prevYm];
  const base = createDefaultMonthConfig(yearMonth);

  if (prevConfig) {
    base.clinicName = prevConfig.clinicName;
    base.hospitalName = prevConfig.hospitalName;
    base.isRiskyUnit = prevConfig.isRiskyUnit;
    base.weekdayMesaiCount = prevConfig.weekdayMesaiCount;
    base.weekdayNobetCount = prevConfig.weekdayNobetCount;
    base.weekendMesaiCount = prevConfig.weekendMesaiCount;
    base.weekendNobetCount = prevConfig.weekendNobetCount;
    base.autoTopUpUnderHours = prevConfig.autoTopUpUnderHours;
    base.compensateSorumluAbsence = prevConfig.compensateSorumluAbsence ?? true;
    base.nurseRoleOverrides = { ...prevConfig.nurseRoleOverrides };
  }

  base.holidays = getDefaultTurkishHolidays(yearMonth);
  base.prevMonthTail = extractTailFromSchedule(prevYm, schedulesByMonth[prevYm]);
  return base;
}

export function extractTailFromSchedule(
  prevYearMonth: string,
  prevSchedule?: MonthSchedule
): Record<string, [ShiftCode, ShiftCode, ShiftCode]> {
  if (!prevSchedule) return {};
  const prevDays = getDaysInMonth(prevYearMonth);
  const tail: Record<string, [ShiftCode, ShiftCode, ShiftCode]> = {};
  for (const [nurseId, row] of Object.entries(prevSchedule.assignments)) {
    tail[nurseId] = [
      row[prevDays - 2] ?? '',
      row[prevDays - 1] ?? '',
      row[prevDays] ?? '',
    ];
  }
  return tail;
}

export function extractPrevMonthFairness(
  prevYearMonth: string,
  configs: Record<string, MonthConfig>,
  nurses: Nurse[],
  preferencesByMonth: Record<string, Record<string, NursePreference>>,
  schedulesByMonth: Record<string, MonthSchedule>
): PrevMonthFairnessCarryOver | undefined {
  const prevSched = schedulesByMonth[prevYearMonth];
  const prevConfig = configs[prevYearMonth];
  if (!prevSched || !prevConfig) return undefined;

  const ev = evaluateSchedule(
    prevConfig,
    nurses,
    preferencesByMonth[prevYearMonth] ?? {},
    prevSched.assignments
  );
  const threeDayGapCount: Record<string, number> = {};
  const overtimeHours: Record<string, number> = {};
  for (const m of ev.nurseMetrics) {
    threeDayGapCount[m.nurseId] = m.threeDayGapCount;
    overtimeHours[m.nurseId] = m.overtimeHours;
  }
  return { threeDayGapCount, overtimeHours };
}

export async function resetAllToDemo(): Promise<StoreSnapshot> {
  const nurses = createDemoNurses();
  const configs = { [DEFAULT_YEAR_MONTH]: createDemoMonthConfig(DEFAULT_YEAR_MONTH) };
  const preferencesByMonth = { [DEFAULT_YEAR_MONTH]: createDemoPreferences(DEFAULT_YEAR_MONTH) };
  const schedulesByMonth: Record<string, MonthSchedule> = {};

  safeWriteJson(LOCAL_KEYS.nurses, nurses);
  safeWriteJson(LOCAL_KEYS.configs, configs);
  safeWriteJson(LOCAL_KEYS.prefs, preferencesByMonth);
  safeWriteJson(LOCAL_KEYS.schedules, schedulesByMonth);

  const client = getSupabase();
  if (client) {
    await client.from('app_nurse_preferences').delete().neq('year_month', '');
    await client.from('app_month_schedules').delete().neq('year_month', '');
    await client.from('app_month_configs').delete().neq('year_month', '');
    await client.from('app_nurses').delete().neq('id', '');

    await saveNursesToStore(nurses);
    await saveMonthConfigToStore(configs[DEFAULT_YEAR_MONTH]);
    await saveMonthPreferencesToStore(
      DEFAULT_YEAR_MONTH,
      preferencesByMonth[DEFAULT_YEAR_MONTH]
    );
  }

  return {
    nurses,
    configs,
    preferencesByMonth,
    schedulesByMonth,
    storageMode: client ? 'supabase' : 'local',
  };
}

export async function clearAllToEmptyRoster(activeYearMonth: string): Promise<StoreSnapshot> {
  const freshConfig = createDefaultMonthConfig(activeYearMonth);
  const nurses: Nurse[] = [];
  const configs: Record<string, MonthConfig> = { [activeYearMonth]: freshConfig };
  const preferencesByMonth: Record<string, Record<string, NursePreference>> = {};
  const schedulesByMonth: Record<string, MonthSchedule> = {};

  localStorage.setItem(LOCAL_KEYS.initialized, '1');
  safeWriteJson(LOCAL_KEYS.nurses, nurses);
  safeWriteJson(LOCAL_KEYS.configs, configs);
  safeWriteJson(LOCAL_KEYS.prefs, preferencesByMonth);
  safeWriteJson(LOCAL_KEYS.schedules, schedulesByMonth);

  const client = getSupabase();
  if (client) {
    await client.from('app_nurse_preferences').delete().neq('year_month', '');
    await client.from('app_month_schedules').delete().neq('year_month', '');
    await client.from('app_month_configs').delete().neq('year_month', '');
    await client.from('app_nurses').delete().neq('id', '');
    await saveMonthConfigToStore(freshConfig);
  }

  return {
    nurses,
    configs,
    preferencesByMonth,
    schedulesByMonth,
    storageMode: client ? 'supabase' : 'local',
  };
}

export function subscribeToRealtimeUpdates(
  onPrefsChange: () => void,
  onScheduleChange: () => void
): () => void {
  const client = getSupabase();
  if (!client) return () => {};

  const channel = client
    .channel('hemsire_nobet_realtime')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'app_nurse_preferences' },
      onPrefsChange
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'app_month_schedules' },
      onScheduleChange
    )
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}

export function buildBackupJson(snapshot: Omit<StoreSnapshot, 'storageMode' | 'syncError'>): string {
  return JSON.stringify(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      ...snapshot,
    },
    null,
    2
  );
}
