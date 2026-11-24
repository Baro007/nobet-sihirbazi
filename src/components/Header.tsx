import React, { useState } from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Cloud,
  HardDrive,
  Lock,
  LogOut,
  Moon,
  Settings,
  ShieldCheck,
  Sun,
  Table2,
  Users,
  X,
} from 'lucide-react';
import { formatMonthLabelTR } from '../lib/calendar';

export type AppTab = 'preferences' | 'schedule' | 'admin';

interface HeaderProps {
  yearMonth: string;
  clinicName: string;
  storageMode: 'supabase' | 'local';
  isDark: boolean;
  onToggleDark: () => void;
  isAdmin: boolean;
  onAdminLogin: (pin: string) => boolean;
  onAdminLogout: () => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  hasSchedule: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  yearMonth,
  clinicName,
  storageMode,
  isDark,
  onToggleDark,
  isAdmin,
  onAdminLogin,
  onAdminLogout,
  onPrevMonth,
  onNextMonth,
  activeTab,
  onSelectTab,
  hasSchedule,
}) => {
  const [pinInput, setPinInput] = useState('');
  const [showLoginForm, setShowLoginForm] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onAdminLogin(pinInput)) {
      setPinInput('');
      setShowLoginForm(false);
    }
  };

  return (
    <header className="no-print sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/90">
      <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3 py-3">
          {/* Sol: Marka & Klinik */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-teal-600 text-white shadow-sm">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white sm:text-xl">
                  HemşireNöbet
                </h1>
                <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                  YH.FR.31
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="font-medium text-slate-700 dark:text-slate-300">{clinicName}</span>
                <span>•</span>
                {storageMode === 'supabase' ? (
                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <Cloud className="h-3.5 w-3.5" /> Bulut Senkron
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                    <HardDrive className="h-3.5 w-3.5" /> Yerel Tarayıcı Modu
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Orta: Ay seçici */}
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800">
            <button
              type="button"
              onClick={onPrevMonth}
              aria-label="Önceki ay"
              className="rounded-lg p-1.5 text-slate-600 hover:bg-white hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[125px] text-center text-sm font-semibold text-slate-800 dark:text-slate-100">
              {formatMonthLabelTR(yearMonth)}
            </span>
            <button
              type="button"
              onClick={onNextMonth}
              aria-label="Sonraki ay"
              className="rounded-lg p-1.5 text-slate-600 hover:bg-white hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Sağ: Tema & Admin Girişi */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleDark}
              title={isDark ? 'Aydınlık Tema' : 'Karanlık Tema'}
              className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            {isAdmin ? (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                  <ShieldCheck className="h-4 w-4" /> Sorumlu Modu
                </span>
                <button
                  type="button"
                  onClick={onAdminLogout}
                  className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700"
                >
                  <LogOut className="h-3.5 w-3.5" /> Çıkış
                </button>
              </div>
            ) : showLoginForm ? (
              <form onSubmit={handleSubmit} className="flex items-center gap-1.5">
                <input
                  type="password"
                  autoFocus
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  placeholder="Şifre"
                  className="w-24 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 sm:w-32"
                />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
                >
                  Giriş
                </button>
                <button
                  type="button"
                  aria-label="Kapat"
                  onClick={() => {
                    setShowLoginForm(false);
                    setPinInput('');
                  }}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                >
                  <X className="h-4 w-4" />
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setShowLoginForm(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <Lock className="h-3.5 w-3.5" /> Sorumlu Girişi
              </button>
            )}
          </div>
        </div>

        {/* Sekmeler */}
        <nav className="-mb-px flex gap-2 overflow-x-auto pt-1">
          <button
            type="button"
            onClick={() => onSelectTab('preferences')}
            className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition ${
              activeTab === 'preferences'
                ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Users className="h-4 w-4" /> Tercih Toplama
          </button>

          {(isAdmin || hasSchedule) && (
            <button
              type="button"
              onClick={() => onSelectTab('schedule')}
              className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition ${
                activeTab === 'schedule'
                  ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <Table2 className="h-4 w-4" /> {isAdmin ? 'Çizelge & YH.FR.31' : 'Nöbet Çizelgesi'}
            </button>
          )}

          {isAdmin && (
            <button
              type="button"
              onClick={() => onSelectTab('admin')}
              className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition ${
                activeTab === 'admin'
                  ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <Settings className="h-4 w-4" /> Kadro, Ay Devri &amp; Kurallar
            </button>
          )}
        </nav>
      </div>
    </header>
  );
};
