import { ShiftCode } from '../types/schedule';

export interface ShiftMeta {
  code: ShiftCode;
  shortLabel: string;
  excelValue: number | string;
  labelTR: string;
  hours: number;
  badgeClass: string;
}

export const SHIFT_META: Record<ShiftCode, ShiftMeta> = {
  '': {
    code: '',
    shortLabel: '·',
    excelValue: '',
    labelTR: 'Boş / İstirahat',
    hours: 0,
    badgeClass:
      'bg-transparent text-slate-400 dark:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800',
  },
  N24: {
    code: 'N24',
    shortLabel: '24',
    excelValue: 24,
    labelTR: '24 Saat Nöbet (08:00–08:00)',
    hours: 24,
    badgeClass:
      'bg-indigo-600 text-white font-semibold shadow-sm hover:bg-indigo-700 dark:bg-indigo-500',
  },
  M8: {
    code: 'M8',
    shortLabel: '8',
    excelValue: 8,
    labelTR: '8 Saat Mesai (08:00–16:00)',
    hours: 8,
    badgeClass:
      'bg-emerald-100 text-emerald-900 font-semibold border border-emerald-300 hover:bg-emerald-200 dark:bg-emerald-900/50 dark:text-emerald-200 dark:border-emerald-700',
  },
  N16: {
    code: 'N16',
    shortLabel: '16',
    excelValue: 16,
    labelTR: '16 Saat Nöbet (16:00–08:00)',
    hours: 16,
    badgeClass:
      'bg-sky-600 text-white font-semibold shadow-sm hover:bg-sky-700 dark:bg-sky-500',
  },
  S8: {
    code: 'S8',
    shortLabel: '8',
    excelValue: 8,
    labelTR: 'Sorumlu Hemşire Mesaisi (08:00–16:00)',
    hours: 8,
    badgeClass:
      'bg-amber-100 text-amber-900 font-semibold border border-amber-300 hover:bg-amber-200 dark:bg-amber-900/50 dark:text-amber-200 dark:border-amber-700',
  },
  YI: {
    code: 'YI',
    shortLabel: 'Yİ',
    excelValue: 'Yİ',
    labelTR: 'Yıllık İzin',
    hours: 0,
    badgeClass:
      'bg-purple-100 text-purple-900 font-medium border border-purple-300 dark:bg-purple-900/40 dark:text-purple-200 dark:border-purple-700',
  },
  R: {
    code: 'R',
    shortLabel: 'R',
    excelValue: 'R',
    labelTR: 'Rapor',
    hours: 0,
    badgeClass:
      'bg-rose-100 text-rose-900 font-medium border border-rose-300 dark:bg-rose-900/40 dark:text-rose-200 dark:border-rose-700',
  },
  DI: {
    code: 'DI',
    shortLabel: 'Dİ',
    excelValue: 'Dİ',
    labelTR: 'Doğum / Süt İzni',
    hours: 0,
    badgeClass:
      'bg-fuchsia-100 text-fuchsia-900 font-medium border border-fuchsia-300 dark:bg-fuchsia-900/40 dark:text-fuchsia-200 dark:border-fuchsia-700',
  },
  II: {
    code: 'II',
    shortLabel: 'İİ',
    excelValue: 'İİ',
    labelTR: 'İdari / Mazeret İzni',
    hours: 0,
    badgeClass:
      'bg-teal-100 text-teal-900 font-medium border border-teal-300 dark:bg-teal-900/40 dark:text-teal-200 dark:border-teal-700',
  },
};

export const MANUAL_SHIFT_OPTIONS: ShiftCode[] = ['', 'N24', 'M8', 'N16', 'S8', 'YI', 'R', 'DI', 'II'];
