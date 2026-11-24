import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import {
  createDemoMonthConfig,
  createDemoNurses,
  createDemoPreferences,
} from '../lib/demoData';
import {
  buildYHFR31Workbook,
  fillUploadedYHFR31Template,
  toArrayBuffer,
} from '../lib/yhfr31Export';
import { solveSchedule } from '../solver/scheduler';

describe('YH.FR.31 Excel export and template filler', () => {
  it('generates a complete YH.FR.31 workbook with formulas, headers, passive row, and local TC merge', async () => {
    const config = createDemoMonthConfig('2026-12');
    const nurses = createDemoNurses();
    const prefs = createDemoPreferences('2026-12');
    const solved = solveSchedule({
      config,
      nurses,
      preferences: prefs,
      seed: 42,
      restarts: 2,
      iterationsPerRestart: 8000,
    });

    const wb = buildYHFR31Workbook({
      config,
      nurses,
      preferences: prefs,
      assignments: solved.assignments,
      localTcMap: {
        'n-01': '12345678901',
      },
    });

    const raw = await wb.xlsx.writeBuffer();
    const reloaded = new ExcelJS.Workbook();
    await reloaded.xlsx.load(raw);

    const ws = reloaded.getWorksheet('ARALIK 2026');
    expect(ws).toBeDefined();
    expect(ws!.getCell('E1').value).toBe('NEFROLOJİ KLİNİĞİ');
    expect(ws!.getCell('AL1').value).toBe('Kodu: YH.FR.31');
    expect(ws!.getCell('AL3').value).toBe('Revizyon Tarihi: 02.02.2026');
    expect(ws!.getCell('AL4').value).toBe('Revizyon Numarası: 04');

    // Row 9 = Selma Yılmaz (sorumlu), Row 10 = Ayşe Kaya (n-01 with local TC), Row 20 = Seda Öztürk (pasif DI)
    expect(ws!.getCell('C10').value).toBe('Ayşe Kaya');
    expect(ws!.getCell('B10').value).toBe('12345678901');

    const aj10 = ws!.getCell('AJ10').value as ExcelJS.CellFormulaValue;
    expect(aj10.formula).toBe('SUM(E10:AI10)');

    const al10 = ws!.getCell('AL10').value as ExcelJS.CellFormulaValue;
    expect(al10.formula).toBe('MAX(0,AJ10-AK10)');

    expect(ws!.getCell('C20').value).toBe('Seda Öztürk');
    expect(ws!.getCell('E20').value).toBe('Dİ');
  });

  it('fills an existing uploaded YH.FR.31 template without touching other sheets or existing formulas', async () => {
    const config = createDemoMonthConfig('2026-12');
    const nurses = createDemoNurses();
    const prefs = createDemoPreferences('2026-12');
    const solved = solveSchedule({
      config,
      nurses,
      preferences: prefs,
      seed: 99,
      restarts: 2,
      iterationsPerRestart: 8000,
    });

    // Sentetik çok sekmeli hastane şablonu oluştur
    const templateWb = new ExcelJS.Workbook();
    const janSheet = templateWb.addWorksheet('OCAK 2026');
    janSheet.getCell('C9').value = 'Ayşe Kaya';
    janSheet.getCell('E9').value = 24;

    const decSheet = templateWb.addWorksheet('ARALIK 2026');
    decSheet.getCell('C9').value = 'Selma Yılmaz';
    decSheet.getCell('C10').value = 'Ayşe Kaya 4B';
    decSheet.getCell('AJ10').value = { formula: 'SUM(E10:AI10)', result: 0 };

    const templateRaw = await templateWb.xlsx.writeBuffer();
    const templateBuf = toArrayBuffer(templateRaw);

    const filled = await fillUploadedYHFR31Template(templateBuf, {
      config,
      nurses,
      preferences: prefs,
      assignments: solved.assignments,
    });

    expect(filled.sheetName).toBe('ARALIK 2026');
    expect(filled.matchedCount).toBe(2);

    const checkWb = new ExcelJS.Workbook();
    await checkWb.xlsx.load(filled.buffer);

    // OCAK 2026 sekmesi dokunulmamış olmalı
    expect(checkWb.getWorksheet('OCAK 2026')!.getCell('E9').value).toBe(24);

    // ARALIK 2026 AJ10 formülü korunmuş ve günler doldurulmuş olmalı
    const filledDec = checkWb.getWorksheet('ARALIK 2026')!;
    const formulaVal = filledDec.getCell('AJ10').value as ExcelJS.CellFormulaValue;
    expect(formulaVal.formula).toBe('SUM(E10:AI10)');
    expect(filledDec.getCell('E9').value).toBe(8); // Selma Yılmaz 1 Aralık Salı = S8 -> 8
  });
});
