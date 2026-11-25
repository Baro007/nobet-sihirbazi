import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  formatYearMonth,
  getDefaultTurkishHolidays,
  getDaysInMonth,
  getNextYearMonth,
  getPrevYearMonth,
  getSuggestedActiveYearMonth,
  isHolidayOrWeekend,
  isWorkingShift,
  parseYearMonth,
} from './calendar';
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

const META_ROW_KEY = '__meta__';

const LOCAL_KEYS = {
  nurses: 'hemsire-nobet-nurses-v2',
  configs: 'hemsire-nobet-configs-v2',
  prefs: 'hemsire-nobet-prefs-v2',
  schedules: 'hemsire-nobet-schedules-v2',
  activeYearMonth: 'hemsire-nobet-active-ym-v2',
  localPii: 'hemsire-nobet-local-pii',
  initialized: 'hemsire-nobet-initialized-v2',
} as const;

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(SUPABASE_URL?.trim() && SUPABASE_ANON_KEY?.trim());

const SUPABASE_FETCH_TIMEOUT_MS = 8_000;

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const upstreamSignal = init?.signal;

  const onUpstreamAbort = () => {
    controller.abort(upstreamSignal?.reason);
  };

  if (upstreamSignal) {
    if (upstreamSignal.aborted) {
      controller.abort(upstreamSignal.reason);
    } else {
      upstreamSignal.addEventListener('abort', onUpstreamAbort, { once: true });
    }
  }

  const timer = setTimeout(() => {
    controller.abort();
  }, SUPABASE_FETCH_TIMEOUT_MS);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    upstreamSignal?.removeEventListener('abort', onUpstreamAbort);
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(message));
    }, ms);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

let supabaseClient: SupabaseClient | null = null;
function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!supabaseClient) {
    supabaseClient = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      global: { fetch: fetchWithTimeout },
    });
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
  activeYearMonth?: string;
  storageMode: 'supabase' | 'local';
  syncError?: string;
}

function loadLocalSnapshot(): StoreSnapshot {
  const nurses = safeReadJson<Nurse[]>(LOCAL_KEYS.nurses, []);
  const rawConfigs = safeReadJson<Record<string, MonthConfig>>(LOCAL_KEYS.configs, {});
  const configs: Record<string, MonthConfig> = {};
  for (const [key, val] of Object.entries(rawConfigs)) {
    if (key !== META_ROW_KEY) configs[key] = val;
  }
  const preferencesByMonth = safeReadJson<Record<string, Record<string, NursePreference>>>(
    LOCAL_KEYS.prefs,
    {}
  );
  const schedulesByMonth = safeReadJson<Record<string, MonthSchedule>>(LOCAL_KEYS.schedules, {});
  const wasInitialized = localStorage.getItem(LOCAL_KEYS.initialized) === '1';
  const storedYm = localStorage.getItem(LOCAL_KEYS.activeYearMonth);
  const resolvedActiveYm =
    storedYm && /^\d{4}-\d{2}$/.test(storedYm) ? storedYm : getSuggestedActiveYearMonth();

  if (!wasInitialized) {
    if (Object.keys(configs).length === 0) {
      configs[resolvedActiveYm] = createDefaultMonthConfig(resolvedActiveYm);
    }
    safeWriteJson(LOCAL_KEYS.nurses, nurses);
    safeWriteJson(LOCAL_KEYS.configs, configs);
    safeWriteJson(LOCAL_KEYS.prefs, preferencesByMonth);
    localStorage.setItem(LOCAL_KEYS.activeYearMonth, resolvedActiveYm);
    localStorage.setItem(LOCAL_KEYS.initialized, '1');
  }

  return {
    nurses,
    configs,
    preferencesByMonth,
    schedulesByMonth,
    activeYearMonth: resolvedActiveYm,
    storageMode: 'local',
  };
}

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const rawMsg = (err as { message?: unknown }).message;
    if (typeof rawMsg === 'string' && rawMsg.trim()) return rawMsg;
  }
  return String(err ?? 'Supabase bağlantı hatası');
}

function formatSupabaseErrorMessage(err: unknown): string {
  const msg = extractErrorMessage(err);
  const lower = msg.toLowerCase();
  if (
    lower.includes('aborterror') ||
    lower.includes('timeout') ||
    lower.includes('aborted') ||
    (err instanceof Error && err.name === 'AbortError')
  ) {
    return 'Supabase sunucusuna bağlantı zaman aşımına uğradı (internet/hastane ağı veya VPN/proxy kısıtlı ya da proje uyku modunda olabilir) — şimdilik yerel tarayıcı modu aktif.';
  }
  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('load failed') ||
    lower.includes('err_connection_reset') ||
    lower.includes('fetch failed')
  ) {
    return 'Supabase bulut sunucusuna şu an erişilemiyor (internet/hastane ağı veya VPN/proxy kısıtlı olabilir) — şimdilik yerel tarayıcı modu aktif.';
  }
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
    const { nurses, configs, preferencesByMonth, schedulesByMonth, resolvedActiveYm } =
      await withTimeout(
        (async () => {
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
          let cloudActiveYearMonth: string | undefined;
          for (const row of configsRes.data ?? []) {
            if (row.year_month === META_ROW_KEY) {
              const meta = row.config_json as { activeYearMonth?: string } | null;
              if (meta?.activeYearMonth && /^\d{4}-\d{2}$/.test(meta.activeYearMonth)) {
                cloudActiveYearMonth = meta.activeYearMonth;
              }
              continue;
            }
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

          const storedYm = localStorage.getItem(LOCAL_KEYS.activeYearMonth);
          const resolvedActiveYm =
            cloudActiveYearMonth ||
            (storedYm && /^\d{4}-\d{2}$/.test(storedYm) ? storedYm : undefined) ||
            getSuggestedActiveYearMonth();

          // Eğer Supabase tamamen boşsa yalnızca temiz başlangıç ay yapılandırmasını oluştur (demo personel ekleme)
          if (nurses.length === 0 && Object.keys(configs).length === 0) {
            const freshConfig = createDefaultMonthConfig(resolvedActiveYm);
            configs[resolvedActiveYm] = freshConfig;
            await saveMonthConfigToStore(freshConfig);
          }

          return { nurses, configs, preferencesByMonth, schedulesByMonth, resolvedActiveYm };
        })(),
        SUPABASE_FETCH_TIMEOUT_MS + 1_000,
        'Supabase request timeout'
      );

    safeWriteJson(LOCAL_KEYS.nurses, nurses);
    safeWriteJson(LOCAL_KEYS.configs, configs);
    safeWriteJson(LOCAL_KEYS.prefs, preferencesByMonth);
    safeWriteJson(LOCAL_KEYS.schedules, schedulesByMonth);
    localStorage.setItem(LOCAL_KEYS.activeYearMonth, resolvedActiveYm);
    localStorage.setItem(LOCAL_KEYS.initialized, '1');

    return {
      nurses,
      configs,
      preferencesByMonth,
      schedulesByMonth,
      activeYearMonth: resolvedActiveYm,
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

export async function saveActiveYearMonthToStore(yearMonth: string): Promise<void> {
  localStorage.setItem(LOCAL_KEYS.activeYearMonth, yearMonth);
  const client = getSupabase();
  if (!client) return;
  const { error } = await client.from('app_month_configs').upsert(
    {
      year_month: META_ROW_KEY,
      config_json: { activeYearMonth: yearMonth },
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'year_month' }
  );
  if (error) throw error;
}

export async function deleteNursePreferencesForNurse(nurseId: string): Promise<void> {
  const all = safeReadJson<Record<string, Record<string, NursePreference>>>(LOCAL_KEYS.prefs, {});
  for (const ym of Object.keys(all)) {
    if (all[ym] && all[ym][nurseId]) {
      delete all[ym][nurseId];
    }
  }
  safeWriteJson(LOCAL_KEYS.prefs, all);

  const client = getSupabase();
  if (!client) return;
  const { error } = await client.from('app_nurse_preferences').delete().eq('nurse_id', nurseId);
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
    base.pairRules = prevConfig.pairRules ? [...prevConfig.pairRules] : [];
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
  const threeDayGapCount: Record<string, number> = {};
  const overtimeHours: Record<string, number> = {};

  const prevSched = schedulesByMonth[prevYearMonth];
  const prevConfig = configs[prevYearMonth];
  if (prevSched && prevConfig) {
    const ev = evaluateSchedule(
      prevConfig,
      nurses,
      preferencesByMonth[prevYearMonth] ?? {},
      prevSched.assignments
    );
    for (const m of ev.nurseMetrics) {
      threeDayGapCount[m.nurseId] = m.threeDayGapCount;
      overtimeHours[m.nurseId] = m.overtimeHours;
    }
  }

  // Son 3 aydaki hafta sonu/tatil vardiya sayıları
  const recentWeekendShifts: Record<string, number> = {};
  const ym2 = getPrevYearMonth(prevYearMonth);
  const ym3 = getPrevYearMonth(ym2);
  for (const ym of [prevYearMonth, ym2, ym3]) {
    const sch = schedulesByMonth[ym];
    if (!sch) continue;
    const hols = configs[ym]?.holidays ?? getDefaultTurkishHolidays(ym);
    const days = getDaysInMonth(ym);
    for (const [nid, row] of Object.entries(sch.assignments)) {
      for (let d = 1; d <= days; d++) {
        if (isWorkingShift(row[d] ?? '') && isHolidayOrWeekend(d, ym, hols)) {
          recentWeekendShifts[nid] = (recentWeekendShifts[nid] ?? 0) + 1;
        }
      }
    }
  }

  // Aynı yılın önceki aylarındaki dinî bayram nöbet/mesai yükü
  const yearBayramShifts: Record<string, number> = {};
  const targetYm = getNextYearMonth(prevYearMonth);
  const { year: targetYear, month: targetMonth } = parseYearMonth(targetYm);
  for (let m = 1; m < targetMonth; m++) {
    const ym = formatYearMonth(targetYear, m);
    const sch = schedulesByMonth[ym];
    if (!sch) continue;
    const hols = configs[ym]?.holidays ?? getDefaultTurkishHolidays(ym);
    const days = getDaysInMonth(ym);
    for (const [nid, row] of Object.entries(sch.assignments)) {
      for (let d = 1; d <= days; d++) {
        if (hols[d]?.type === 'bayram' && isWorkingShift(row[d] ?? '')) {
          yearBayramShifts[nid] = (yearBayramShifts[nid] ?? 0) + 1;
        }
      }
    }
  }

  const hasData =
    Object.keys(overtimeHours).length > 0 ||
    Object.keys(recentWeekendShifts).length > 0 ||
    Object.keys(yearBayramShifts).length > 0;

  if (!hasData) return undefined;
  return { threeDayGapCount, overtimeHours, recentWeekendShifts, yearBayramShifts };
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
  onScheduleChange: () => void,
  onMetaOrNursesChange?: () => void
): () => void {
  const client = getSupabase();
  if (!client) return () => {};
  const metaHandler = onMetaOrNursesChange ?? onPrefsChange;

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
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'app_nurses' },
      metaHandler
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'app_month_configs' },
      metaHandler
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
