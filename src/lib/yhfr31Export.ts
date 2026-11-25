import ExcelJS from 'exceljs';
import {
  computeNurseTargetHours,
  getDaysInMonth,
  getShiftHours,
  getTurkishMonthUpper,
  isHolidayOrWeekend,
  normalizeTurkishText,
  parseYearMonth,
} from './calendar';
import { SHIFT_META } from './shifts';
import { resolveEffectiveLeaveDays, resolveEffectiveNurseRole } from '../solver/validator';
import { MonthConfig, Nurse, NursePreference, ShiftCode } from '../types/schedule';

export interface YHFR31ExportParams {
  config: MonthConfig;
  nurses: Nurse[];
  preferences: Record<string, NursePreference>;
  assignments: Record<string, Record<number, ShiftCode>>;
  localTcMap?: Record<string, string>;
}

export interface TemplateFillResult {
  buffer: ArrayBuffer;
  matchedCount: number;
  unmatchedNames: string[];
  sheetName: string;
}

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FF334155' } },
  left: { style: 'thin', color: { argb: 'FF334155' } },
  bottom: { style: 'thin', color: { argb: 'FF334155' } },
  right: { style: 'thin', color: { argb: 'FF334155' } },
};

function computeOvertimeBreakdown(
  config: MonthConfig,
  nurseAssign: Record<number, ShiftCode>,
  daysInMonth: number,
  workedHours: number,
  targetHours: number
): {
  am: number;
  an: number;
  ao: number;
  ap: number;
  aq: number;
  ar: number;
  as: number;
  at: number;
} {
  const overtime = Math.max(0, workedHours - targetHours);
  if (overtime <= 0) {
    return { am: 0, an: 0, ao: 0, ap: 0, aq: 0, ar: 0, as: 0, at: 0 };
  }

  let bayramHoursWorked = 0;
  let bayramNightShifts = 0;
  let normalNightShifts = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const code = nurseAssign[d] ?? '';
    const h = getShiftHours(code);
    if (h === 0) continue;

    const holiday = config.holidays[d];
    const isHolidayDay = Boolean(holiday && (holiday.type === 'bayram' || holiday.type === 'resmi'));

    if (isHolidayDay) {
      bayramHoursWorked += h;
      if (code === 'N24' || code === 'N16') bayramNightShifts++;
    } else {
      if (code === 'N24' || code === 'N16') normalNightShifts++;
    }
  }

  const totalBayramOvertime = Math.min(overtime, bayramHoursWorked);
  const totalNormalOvertime = overtime - totalBayramOvertime;

  const bayramGece = Math.min(totalBayramOvertime, bayramNightShifts * 12);
  const bayramNormal = totalBayramOvertime - bayramGece;

  const normalGece = Math.min(totalNormalOvertime, normalNightShifts * 12);
  const normalNormal = totalNormalOvertime - normalGece;

  if (config.isRiskyUnit) {
    return {
      am: 0,
      an: 0,
      ao: normalGece,
      ap: normalNormal,
      aq: 0,
      ar: 0,
      as: bayramGece,
      at: bayramNormal,
    };
  }

  return {
    am: normalGece,
    an: normalNormal,
    ao: 0,
    ap: 0,
    aq: bayramGece,
    ar: bayramNormal,
    as: 0,
    at: 0,
  };
}

export function buildYHFR31Workbook(params: YHFR31ExportParams): ExcelJS.Workbook {
  const { config, nurses, preferences, assignments, localTcMap = {} } = params;
  const { year } = parseYearMonth(config.yearMonth);
  const monthUpper = getTurkishMonthUpper(config.yearMonth);
  const daysInMonth = getDaysInMonth(config.yearMonth);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'HemşireNöbet — YH.FR.31';
  wb.created = new Date();

  const sheetName = `${monthUpper} ${year}`;
  const ws = wb.addWorksheet(sheetName, {
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      margins: { left: 0.25, right: 0.25, top: 0.3, bottom: 0.3, header: 0.15, footer: 0.15 },
    },
  });

  // Sütun genişlikleri (A..AT = 46 sütun)
  ws.getColumn(1).width = 4.2; // A: Sıra
  ws.getColumn(2).width = 13.5; // B: TC Kimlik No
  ws.getColumn(3).width = 24; // C: Adı Soyadı
  ws.getColumn(4).width = 7.5; // D: Branş
  for (let col = 5; col <= 35; col++) {
    ws.getColumn(col).width = 3.5; // E..AI: Gün 1..31
  }
  ws.getColumn(36).width = 8.5; // AJ: Toplam nöbet saati
  ws.getColumn(37).width = 8.5; // AK: Aylık Çalışma Saati
  ws.getColumn(38).width = 8.5; // AL: Fazla nöbet saati
  for (let col = 39; col <= 46; col++) {
    ws.getColumn(col).width = 7.8; // AM..AT: Artırımlı/Artırımsız kırılımlar
  }

  // Satır yükseklikleri (üst başlıklar)
  for (let r = 1; r <= 5; r++) ws.getRow(r).height = 17;
  ws.getRow(6).height = 20;
  ws.getRow(7).height = 24;
  ws.getRow(8).height = 36;

  // Üst Kurumsal Başlık (Satır 1-5)
  ws.mergeCells('A1:D5');
  const leftBanner = ws.getCell('A1');
  leftBanner.value = `T.C. SAĞLIK BAKANLIĞI\nANTALYA İL SAĞLIK MÜDÜRLÜĞÜ\n${config.hospitalName.toLocaleUpperCase('tr-TR')}`;
  leftBanner.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  leftBanner.font = { name: 'Times New Roman', size: 8, bold: true };

  ws.mergeCells('E1:AK2');
  const clinicHeader = ws.getCell('E1');
  clinicHeader.value = config.clinicName.toLocaleUpperCase('tr-TR');
  clinicHeader.alignment = { vertical: 'middle', horizontal: 'center' };
  clinicHeader.font = { name: 'Times New Roman', size: 12, bold: true };

  ws.mergeCells('E3:AK5');
  const titleHeader = ws.getCell('E3');
  titleHeader.value = `${year} YILI ${monthUpper} AYI PERSONEL NÖBET BİLDİRİMİ PUANTAJ ÇİZELGESİ`;
  titleHeader.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  titleHeader.font = { name: 'Times New Roman', size: 11, bold: true };

  const docMeta: [string, string][] = [
    ['AL1:AT1', 'Kodu: YH.FR.31'],
    ['AL2:AT2', 'Yayın Tarihi: 23/09/2019'],
    ['AL3:AT3', 'Revizyon Tarihi: 02.02.2026'],
    ['AL4:AT4', 'Revizyon Numarası: 04'],
    ['AL5:AT5', 'Sayfa No: Sayfa 1/1'],
  ];
  for (const [range, text] of docMeta) {
    ws.mergeCells(range);
    const cell = ws.getCell(range.split(':')[0]);
    cell.value = text;
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
    cell.font = { name: 'Times New Roman', size: 8 };
  }

  for (let r = 1; r <= 5; r++) {
    for (let c = 1; c <= 46; c++) {
      ws.getCell(r, c).border = THIN_BORDER;
    }
  }

  // Satır 6: Birim Adı
  ws.mergeCells('A6:AT6');
  const row6 = ws.getCell('A6');
  row6.value = `Birim Adı: ${config.clinicName.toLocaleUpperCase('tr-TR')}`;
  row6.font = { name: 'Times New Roman', size: 10, bold: true };
  row6.alignment = { vertical: 'middle', horizontal: 'left' };
  for (let c = 1; c <= 46; c++) ws.getCell(6, c).border = THIN_BORDER;

  // Satır 7-8: Tablo Başlıkları
  const singleHeaders: [string, string][] = [
    ['A7:A8', 'Sıra'],
    ['B7:B8', 'TC Kimlik No'],
    ['C7:C8', 'Adı Soyadı'],
    ['D7:D8', 'Branş'],
    ['AJ7:AJ8', 'Toplam\nnöbet saati'],
    ['AK7:AK8', 'Aylık\nÇalışma\nSaati'],
    ['AL7:AL8', 'Fazla\nnöbet\nsaati'],
  ];

  for (const [range, label] of singleHeaders) {
    ws.mergeCells(range);
    const c = ws.getCell(range.split(':')[0]);
    c.value = label;
    c.font = { name: 'Times New Roman', size: 8, bold: true };
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  }

  // Günler 1..31 (E..AI -> col 5..35)
  for (let d = 1; d <= 31; d++) {
    const col = 4 + d;
    const colLetter = ws.getColumn(col).letter;
    ws.mergeCells(`${colLetter}7:${colLetter}8`);
    const cell = ws.getCell(7, col);
    cell.value = d;
    cell.font = { name: 'Times New Roman', size: 8, bold: true };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  }

  // Sağ grup başlıkları (AM..AT)
  const groupHeaders: [string, string, string, string, string, string][] = [
    ['AM7:AN7', 'Normal Nöbet Saati', 'AM8', 'Artırımlı\n(Gece)', 'AN8', 'Artırımsız\n(Normal)'],
    ['AO7:AP7', 'Riskli Nöbet Saati', 'AO8', 'Artırımlı\n(Gece)', 'AP8', 'Artırımsız\n(Normal)'],
    ['AQ7:AR7', 'Bayram Nöbet Saati', 'AQ8', 'Artırımlı\n(Gece)', 'AR8', 'Artırımsız\n(Normal)'],
    ['AS7:AT7', 'Riskli bayram nöbeti', 'AS8', 'Artırımlı\n(Gece)', 'AT8', 'Artırımsız\n(Normal)'],
  ];

  for (const [topRange, topText, leftRef, leftText, rightRef, rightText] of groupHeaders) {
    ws.mergeCells(topRange);
    const topCell = ws.getCell(topRange.split(':')[0]);
    topCell.value = topText;
    topCell.font = { name: 'Times New Roman', size: 7.5, bold: true };
    topCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

    for (const [ref, txt] of [
      [leftRef, leftText],
      [rightRef, rightText],
    ] as const) {
      const subCell = ws.getCell(ref);
      subCell.value = txt;
      subCell.font = { name: 'Times New Roman', size: 7, bold: true };
      subCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    }
  }

  for (let r = 7; r <= 8; r++) {
    for (let c = 1; c <= 46; c++) {
      const cell = ws.getCell(r, c);
      cell.border = THIN_BORDER;
      if (c >= 5 && c <= 35) {
        const dayNum = c - 4;
        if (dayNum <= daysInMonth && isHolidayOrWeekend(dayNum, config.yearMonth, config.holidays)) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
        } else if (dayNum > daysInMonth) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
        } else {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        }
      } else {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      }
    }
  }

  // Personel satırları (Satır 9+)
  const orderedNurses = nurses
    .filter((n) => n.active)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  orderedNurses.forEach((nurse, idx) => {
    const r = 9 + idx;
    ws.getRow(r).height = 18;
    const { role } = resolveEffectiveNurseRole(nurse, config);
    const nurseAssign = assignments[nurse.id] ?? {};
    const leaveDays = preferences[nurse.id]?.leaveDays ?? {};

    ws.getCell(r, 1).value = idx + 1;
    ws.getCell(r, 2).value = localTcMap[nurse.id] ?? '';
    ws.getCell(r, 3).value = nurse.name;
    ws.getCell(r, 4).value = nurse.branch || 'HEM';

    let workedHours = 0;
    for (let d = 1; d <= 31; d++) {
      const col = 4 + d;
      const cell = ws.getCell(r, col);
      if (d <= daysInMonth) {
        const code = nurseAssign[d] ?? '';
        const meta = SHIFT_META[code];
        cell.value = meta.excelValue === '' ? null : meta.excelValue;
        workedHours += getShiftHours(code);
        if (isHolidayOrWeekend(d, config.yearMonth, config.holidays)) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
        }
      } else {
        cell.value = null;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
      }
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.font = { name: 'Times New Roman', size: 8.5 };
    }

    const effectiveLeaveDays = resolveEffectiveLeaveDays(leaveDays, nurseAssign);
    const targetHours =
      role === 'pasif_izinli'
        ? 0
        : computeNurseTargetHours(config.yearMonth, config.holidays, effectiveLeaveDays);
    const overtime = role === 'pasif_izinli' ? 0 : Math.max(0, workedHours - targetHours);

    ws.getCell(r, 36).value = { formula: `SUM(E${r}:AI${r})`, result: workedHours };
    ws.getCell(r, 37).value = targetHours;
    ws.getCell(r, 38).value =
      role === 'pasif_izinli'
        ? 0
        : { formula: `MAX(0,AJ${r}-AK${r})`, result: overtime };

    const breakdown =
      role === 'pasif_izinli'
        ? { am: 0, an: 0, ao: 0, ap: 0, aq: 0, ar: 0, as: 0, at: 0 }
        : computeOvertimeBreakdown(config, nurseAssign, daysInMonth, workedHours, targetHours);

    ws.getCell(r, 39).value = breakdown.am;
    ws.getCell(r, 40).value = breakdown.an;
    ws.getCell(r, 41).value = breakdown.ao;
    ws.getCell(r, 42).value = breakdown.ap;
    ws.getCell(r, 43).value = breakdown.aq;
    ws.getCell(r, 44).value = breakdown.ar;
    ws.getCell(r, 45).value = breakdown.as;
    ws.getCell(r, 46).value = breakdown.at;

    for (let c = 1; c <= 46; c++) {
      const cell = ws.getCell(r, c);
      cell.border = THIN_BORDER;
      if (c === 1 || c === 2 || c === 4 || c >= 36) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.font = { name: 'Times New Roman', size: 8.5 };
      } else if (c === 3) {
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
        cell.font = { name: 'Times New Roman', size: 8.5, bold: role === 'sorumlu' };
      }
      if (c >= 39) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
      }
    }
  });

  // İmza bloğu
  const signRow = 9 + orderedNurses.length + 2;
  ws.mergeCells(`C${signRow}:K${signRow}`);
  ws.getCell(`C${signRow}`).value = 'Düzenleyen\nBirim Sorumlu Hemşiresi';
  ws.getCell(`C${signRow}`).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  ws.getCell(`C${signRow}`).font = { name: 'Times New Roman', size: 9, bold: true };

  ws.mergeCells(`P${signRow}:Y${signRow}`);
  ws.getCell(`P${signRow}`).value = 'Uygun Gören\nSağlık Bakım Hizmetleri Müdürü';
  ws.getCell(`P${signRow}`).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  ws.getCell(`P${signRow}`).font = { name: 'Times New Roman', size: 9, bold: true };

  ws.mergeCells(`AD${signRow}:AM${signRow}`);
  ws.getCell(`AD${signRow}`).value = 'Onaylayan\nBaşhekim';
  ws.getCell(`AD${signRow}`).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  ws.getCell(`AD${signRow}`).font = { name: 'Times New Roman', size: 9, bold: true };
  ws.getRow(signRow).height = 30;

  return wb;
}

export async function exportYHFR31Excel(params: YHFR31ExportParams): Promise<void> {
  const wb = buildYHFR31Workbook(params);
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeClinic = params.config.clinicName
    .toLowerCase()
    .replace(/[^a-z0-9çğıöşü]+/gi, '-')
    .replace(/^-|-$/g, '');
  a.href = url;
  a.download = `YH.FR.31_${safeClinic || 'servis'}_${params.config.yearMonth}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function toArrayBuffer(rawOut: ExcelJS.Buffer): ArrayBuffer {
  if (rawOut instanceof ArrayBuffer) return rawOut;
  const view = rawOut as unknown as ArrayBufferView;
  const src = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  const copy = new Uint8Array(src.byteLength);
  copy.set(src);
  return copy.buffer;
}

/**
 * Kullanıcının hastane sisteminden indirdiği mevcut YH.FR.31 .xlsx dosyasının içine
 * (logo, formüller ve diğer ay sekmelerine dokunmadan) yalnızca ilgili ay sayfasındaki
 * hemşire satırlarının E..AI gün hücrelerini doldurur.
 */
export async function fillUploadedYHFR31Template(
  arrayBuffer: ArrayBuffer,
  params: YHFR31ExportParams
): Promise<TemplateFillResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(arrayBuffer);

  const { year } = parseYearMonth(params.config.yearMonth);
  const monthUpper = getTurkishMonthUpper(params.config.yearMonth);
  const daysInMonth = getDaysInMonth(params.config.yearMonth);

  const expectedNames = [`${monthUpper} ${year}`, monthUpper];
  let targetSheet = wb.worksheets.find((ws) => {
    const norm = normalizeTurkishText(ws.name);
    return expectedNames.some((cand) => norm === cand || norm.includes(cand));
  });
  if (!targetSheet) {
    targetSheet = wb.worksheets[0];
  }
  if (!targetSheet) {
    throw new Error('Yüklenen Excel dosyasında sayfa bulunamadı.');
  }

  // Hemşire isimlerini normalize ederek eşleştirme haritası oluştur
  const nurseByNormName = new Map<string, Nurse>();
  for (const nurse of params.nurses) {
    nurseByNormName.set(normalizeTurkishText(nurse.name), nurse);
  }

  const matchedNurseIds = new Set<string>();
  const maxRow = Math.max(targetSheet.rowCount, 40);

  for (let r = 9; r <= maxRow; r++) {
    const nameVal = targetSheet.getCell(r, 3).text || String(targetSheet.getCell(r, 3).value ?? '');
    const normRowName = normalizeTurkishText(nameVal);
    if (!normRowName) continue;

    // Tam eşleşme veya parantez/unvan ekleri (örn. "4B", "(TAKVİYE)") soyulduktan sonra eşleşme
    let matchedNurse = nurseByNormName.get(normRowName);
    if (!matchedNurse) {
      const strippedRow = normRowName.replace(/\([^)]*\)/g, '').replace(/\b4B\b/g, '').trim();
      for (const [normKey, nurseObj] of nurseByNormName.entries()) {
        const strippedKey = normKey.replace(/\([^)]*\)/g, '').replace(/\b4B\b/g, '').trim();
        if (strippedKey && (strippedKey === strippedRow || strippedRow.startsWith(strippedKey) || strippedKey.startsWith(strippedRow))) {
          matchedNurse = nurseObj;
          break;
        }
      }
    }

    if (!matchedNurse) continue;

    matchedNurseIds.add(matchedNurse.id);
    const nurseAssign = params.assignments[matchedNurse.id] ?? {};

    for (let d = 1; d <= 31; d++) {
      const cell = targetSheet.getCell(r, 4 + d);
      if (d <= daysInMonth) {
        const code = nurseAssign[d] ?? '';
        const meta = SHIFT_META[code];
        cell.value = meta.excelValue === '' ? null : meta.excelValue;
      } else {
        cell.value = null;
      }
    }
  }

  const unmatchedNames = params.nurses
    .filter((n) => n.active && !matchedNurseIds.has(n.id))
    .map((n) => n.name);

  const rawOut = await wb.xlsx.writeBuffer();
  return {
    buffer: toArrayBuffer(rawOut),
    matchedCount: matchedNurseIds.size,
    unmatchedNames,
    sheetName: targetSheet.name,
  };
}
