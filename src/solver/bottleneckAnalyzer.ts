import {
  getDaysInMonth,
  isHolidayOrWeekend,
  parseYearMonth,
  TURKISH_MONTHS,
} from '../lib/calendar';
import {
  BottleneckItem,
  MonthConfig,
  Nurse,
  NursePreference,
  PreflightReport,
  ScheduleEvaluation,
} from '../types/schedule';
import {
  getExpectedDailyStaffing,
  isSorumluPresentOnDay,
  resolveEffectiveNurseRole,
} from './validator';

export interface BottleneckAnalysisParams {
  config: MonthConfig;
  nurses: Nurse[];
  preferences: Record<string, NursePreference>;
  preflight: PreflightReport;
  evaluation?: ScheduleEvaluation;
  hasSchedule: boolean;
}

const SEVERITY_RANK: Record<BottleneckItem['severity'], number> = {
  critical: 0,
  warning: 1,
  tip: 2,
};

export function analyzeBottlenecks({
  config,
  nurses,
  preferences,
  preflight,
  evaluation,
  hasSchedule,
}: BottleneckAnalysisParams): BottleneckItem[] {
  const items: BottleneckItem[] = [];
  const days = getDaysInMonth(config.yearMonth);
  const { month } = parseYearMonth(config.yearMonth);
  const monthName = TURKISH_MONTHS[month - 1];
  const maxAllowedEmpty = config.maxConsecutiveEmptyDays ?? 3;

  const activeNurses = nurses
    .filter((n) => n.active)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const activeNobetli = activeNurses.filter(
    (n) => resolveEffectiveNurseRole(n, config).role === 'nobetli'
  );
  const gunduzList = activeNurses.filter(
    (n) => resolveEffectiveNurseRole(n, config).role === 'gunduz_mesai'
  );
  const nurseById = new Map(activeNurses.map((n) => [n.id, n]));

  const closedLoad = (nid: string): number => {
    const p = preferences[nid];
    return (p?.negativeDays?.length ?? 0) + Object.keys(p?.leaveDays ?? {}).length;
  };
  const posLoad = (nid: string): number => {
    const p = preferences[nid];
    return (p?.positiveNobetDays?.length ?? 0) + (p?.positiveMesaiDays?.length ?? 0);
  };

  // 1. Günlük kapasite tıkanmaları + aynı güne aşırı pozitif talep rekabeti
  let competitionItems = 0;
  for (let d = 1; d <= days; d++) {
    const sorumluPresent = isSorumluPresentOnDay(d, config, nurses, preferences);
    const { expectedNobet, expectedMesai } = getExpectedDailyStaffing(d, config, sorumluPresent);
    const holOrWknd = isHolidayOrWeekend(d, config.yearMonth, config.holidays);
    const gunduzPresent = holOrWknd
      ? 0
      : gunduzList.filter((gn) => !preferences[gn.id]?.leaveDays?.[d]).length;
    const rotatingMesaiNeeded = Math.max(0, expectedMesai - gunduzPresent);
    const needed = expectedNobet + rotatingMesaiNeeded;

    const leaveNames: string[] = [];
    const negFlexCandidates: Nurse[] = [];
    const mesaiOnlyNurses: Nurse[] = [];
    const tailBlockedN24Names: string[] = [];
    const greenRequesters: Nurse[] = [];
    const blueRequesters: Nurse[] = [];

    let available = 0;
    let availableForNobet = 0;

    for (const n of activeNobetli) {
      const pref = preferences[n.id];
      const hasLeave = Boolean(pref?.leaveDays?.[d]);
      const hasHardNeg = Boolean(pref?.negativeDays?.includes(d));
      const tail = config.prevMonthTail?.[n.id];
      const tailExitDay1 = d === 1 && (tail?.[2] === 'N24' || tail?.[2] === 'N16');
      const tailNoNobet =
        (d === 1 && (tail?.[1] === 'N24' || tail?.[1] === 'N16')) ||
        (d === 2 && (tail?.[2] === 'N24' || tail?.[2] === 'N16'));
      const wantsMesaiOnly = Boolean(pref?.positiveMesaiDays?.includes(d));
      const wantsNobet = Boolean(pref?.positiveNobetDays?.includes(d));

      if (hasLeave) {
        leaveNames.push(n.name);
      } else if (hasHardNeg) {
        negFlexCandidates.push(n);
      } else if (tailExitDay1) {
        tailBlockedN24Names.push(`${n.name} (devir çıkışı)`);
      } else {
        available++;
        if (wantsMesaiOnly) {
          mesaiOnlyNurses.push(n);
          blueRequesters.push(n);
        } else if (tailNoNobet) {
          tailBlockedN24Names.push(n.name);
        } else {
          availableForNobet++;
        }
        if (wantsNobet) greenRequesters.push(n);
      }
    }

    if (available < needed) {
      const rankedFlex = [...negFlexCandidates].sort((a, b) => closedLoad(b.id) - closedLoad(a.id));
      const flexNames = rankedFlex.slice(0, 4).map((n) => `${n.name} (${closedLoad(n.id)} kapalı)`);
      const draftNames = rankedFlex.slice(0, 4).map((n) => n.name).join(', ');
      items.push({
        id: `cap-day-${d}`,
        severity: 'critical',
        category: 'capacity',
        day: d,
        title: `${d} ${monthName}: Toplam kadro açığı (${available}/${needed} kişi müsait)`,
        detail: `${leaveNames.length > 0 ? `İzinli: ${leaveNames.join(', ')}. ` : ''}${
          flexNames.length > 0 ? `🔴 Kapalı işaretleyenler: ${flexNames.join(', ')}.` : ''
        }`,
        suggestion:
          rankedFlex.length > 0
            ? `En çok günü kapalı olan (${flexNames[0]}) hemşireden yalnızca ${needed - available} kişinin bu günü açması yeterlidir.`
            : 'Günlük nöbet/mesai kadro sayısını bu gün için geçici esnetmeyi değerlendirin.',
        whatsappDraft:
          rankedFlex.length > 0
            ? `Merhaba arkadaşlar, ${d} ${monthName} günü için ${needed} kişilik vardiya kadromuza karşılık yalnızca ${available} arkadaşımız müsait. ${draftNames} — aranızdan ${needed - available} kişi o günü açabilir mi? 🙏`
            : undefined,
      });
    } else if (availableForNobet < expectedNobet) {
      const rankedMesai = [...mesaiOnlyNurses].sort((a, b) => closedLoad(b.id) - closedLoad(a.id));
      const rankedNeg = [...negFlexCandidates].sort((a, b) => closedLoad(b.id) - closedLoad(a.id));
      const candidates = [...rankedMesai, ...rankedNeg];
      const candNames = candidates.slice(0, 4).map((n) => n.name);
      items.push({
        id: `cap-nobet-${d}`,
        severity: 'critical',
        category: 'capacity',
        day: d,
        title: `${d} ${monthName}: 24s nöbetçi açığı (${availableForNobet}/${expectedNobet})`,
        detail: `${
          mesaiOnlyNurses.length > 0
            ? `🔵 Sadece 08–16 isteyen: ${mesaiOnlyNurses.map((n) => n.name).join(', ')}. `
            : ''
        }${
          negFlexCandidates.length > 0
            ? `🔴 Kapalı: ${negFlexCandidates.map((n) => n.name).join(', ')}. `
            : ''
        }${
          tailBlockedN24Names.length > 0 ? `Ay devri korumalı: ${tailBlockedN24Names.join(', ')}.` : ''
        }`,
        suggestion:
          candNames.length > 0
            ? `${candNames.slice(0, 2).join(' veya ')} için 🔵/🔴 tercih esnetilirse 24s nöbet açığı kapanır.`
            : 'Nöbet sayısını veya izinleri kontrol edin.',
        whatsappDraft:
          candNames.length > 0
            ? `Merhaba arkadaşlar, ${d} ${monthName} günü 24s nöbet için uygun kadromuz ${expectedNobet} yerine ${availableForNobet} görünüyor. ${candNames.join(', ')} arasından bir arkadaşımız nöbete destek olabilir mi? 🙏`
            : undefined,
      });
    }

    // Aynı güne aşırı 🟢 Nöbet veya 🔵 Mesai talebi (rekabet)
    if (greenRequesters.length > expectedNobet && competitionItems < 6) {
      const sorted = [...greenRequesters].sort((a, b) => posLoad(a.id) - posLoad(b.id));
      const names = sorted.map((n) => n.name).join(', ');
      items.push({
        id: `comp-n24-${d}`,
        severity: 'warning',
        category: 'competition',
        day: d,
        title: `${d} ${monthName}: ${greenRequesters.length} kişi 🟢 nöbet istemiş (kapasite: ${expectedNobet})`,
        detail: `Talep edenler (az istekliden çoka): ${sorted
          .map((n) => `${n.name} (${posLoad(n.id)})`)
          .join(', ')}.`,
        suggestion: `Toplamda daha az özel isteği olan (${sorted
          .slice(0, expectedNobet)
          .map((n) => n.name)
          .join(', ')}) hemşirelere öncelik vermeniz daha adil olur; kalan ${
          greenRequesters.length - expectedNobet
        } kişiye alternatif gün önerilebilir.`,
        whatsappDraft: `Merhaba arkadaşlar, ${d} ${monthName} nöbeti için ${greenRequesters.length} arkadaşımız (${names}) talep girmiş ancak kadromuz ${expectedNobet} kişi. Aranızdan ${
          greenRequesters.length - expectedNobet
        } kişi başka bir güne kaydırabilir mi? 🙏`,
      });
      competitionItems++;
    }

    if (blueRequesters.length > rotatingMesaiNeeded && blueRequesters.length > 0 && competitionItems < 6) {
      const names = blueRequesters.map((n) => n.name).join(', ');
      items.push({
        id: `comp-m8-${d}`,
        severity: 'tip',
        category: 'competition',
        day: d,
        title: `${d} ${monthName}: ${blueRequesters.length} kişi 🔵 gündüz mesai istemiş (kontenjan: ${rotatingMesaiNeeded})`,
        detail: `Talep edenler: ${names}.`,
        suggestion:
          rotatingMesaiNeeded === 0
            ? 'Bu günde ek 08–16 mesai kontenjanı yok; bu kişiler gece nöbetine yazılmaz ama o gün boş kalırlar.'
            : `Çözücü ilk ${rotatingMesaiNeeded} kişiye mesai verir, kalanları gece nöbetine zorlamadan boş bırakır.`,
      });
      competitionItems++;
    }
  }

  // 2. Kişi içi matematiksel çelişkiler (dinlenme, ertesi gün mesai, 4+ gün kapalı seri)
  for (const n of activeNobetli) {
    const p = preferences[n.id];
    if (!p) continue;

    const sortedGreen = [...(p.positiveNobetDays ?? [])].sort((a, b) => a - b);
    const conflictPairs: string[] = [];
    for (let i = 0; i + 1 < sortedGreen.length; i++) {
      if (sortedGreen[i + 1] - sortedGreen[i] <= 2) {
        conflictPairs.push(`${sortedGreen[i]} ve ${sortedGreen[i + 1]}`);
      }
    }
    if (conflictPairs.length > 0) {
      items.push({
        id: `self-green-${n.id}`,
        severity: 'warning',
        category: 'self_conflict',
        title: `${n.name}: Birbirine yakın 🟢 nöbet isteği (${conflictPairs.join(' · ')}. günler)`,
        detail:
          '24 saatlik nöbetten sonra 2 gün nöbetsiz dinlenme zorunlu olduğu için bu çiftlerin ikisine birden nöbet yazılamaz.',
        suggestion: `${n.name} ile teyitleşip her çiftten hangisini daha çok tercih ettiğini sorabilirsiniz.`,
      });
    }

    const posMesaiSet = new Set(p.positiveMesaiDays ?? []);
    const greenThenBlue: string[] = [];
    for (const d of sortedGreen) {
      if (posMesaiSet.has(d + 1)) greenThenBlue.push(`${d}N→${d + 1}M`);
    }
    if (greenThenBlue.length > 0) {
      items.push({
        id: `self-gb-${n.id}`,
        severity: 'warning',
        category: 'self_conflict',
        title: `${n.name}: Nöbet ertesi güne 🔵 mesai isteği (${greenThenBlue.join(', ')})`,
        detail: '24s nöbetin ertesi günü çıkış (zorunlu dinlenme) olduğu için gündüz mesai yazılamaz.',
        suggestion: `${n.name} için ilgili günlerden birinde öncelik seçimi netleştirilebilir.`,
      });
    }

    if (maxAllowedEmpty > 0 && (p.negativeDays?.length ?? 0) > maxAllowedEmpty) {
      const sortedNeg = [...(p.negativeDays ?? [])].sort((a, b) => a - b);
      let s = sortedNeg[0];
      let prev = sortedNeg[0];
      const badRanges: string[] = [];
      for (let i = 1; i < sortedNeg.length; i++) {
        if (sortedNeg[i] === prev + 1) {
          prev = sortedNeg[i];
        } else {
          if (prev - s + 1 > maxAllowedEmpty) badRanges.push(`${s}–${prev}`);
          s = sortedNeg[i];
          prev = sortedNeg[i];
        }
      }
      if (prev - s + 1 > maxAllowedEmpty) badRanges.push(`${s}–${prev}`);
      if (badRanges.length > 0) {
        items.push({
          id: `self-neg-streak-${n.id}`,
          severity: 'warning',
          category: 'empty_streak',
          title: `${n.name}: ${maxAllowedEmpty} günden uzun 🔴 kapalı seri (${badRanges.join(', ')}. günler)`,
          detail: `Hastane üst sınırı en fazla ${maxAllowedEmpty} gün üst üste boşluğa izin veriyor; bu kadar uzun kırmızı blok hem kırmızıyı hem boşluk kuralını aynı anda sağlamayı imkânsızlaştırır.`,
          suggestion: `Bu tarihler resmî izin ise 🟣 İzin'e çevirin; değilse ortadan 1 günü 🟡 Mümkünse Boş'a çekin veya sınır esnetmeyi düşünün.`,
          quickAction: 'relax_empty_cap',
        });
      }
    }
  }

  // 3. Eksik saat dengesi önerisi
  if (preflight.hourBalanceDiff < 0 && !config.autoTopUpUnderHours) {
    items.push({
      id: 'under-hours-topup',
      severity: 'warning',
      category: 'fairness',
      title: `Kadro saat eksiği: ${-preflight.hourBalanceDiff} saat`,
      detail: `Sabit vardiya ihtiyacı (${preflight.totalRequiredHours} s) yasal hedef saatin (${preflight.totalTargetHours} s) altında kalıyor.`,
      suggestion: `Hafta içi ${preflight.suggestedExtraMesaiDays} güne otomatik +1 mesai ekleyerek herkesin hedef saatini tamamlamasını sağlayabilirsiniz.`,
      quickAction: 'enable_topup',
    });
  }

  // 4. Çözüm sonrası gerçek sonuç tıkanmaları
  if (hasSchedule && evaluation) {
    const longEmptyIssues = evaluation.issues.filter((i) => i.code === 'LONG_EMPTY_STREAK');
    if (longEmptyIssues.length > 0) {
      items.push({
        id: 'post-long-empty',
        severity: 'critical',
        category: 'empty_streak',
        title: `${longEmptyIssues.length} adet ${maxAllowedEmpty}+ gün boşluk sınırı aşımı kaldı`,
        detail: longEmptyIssues.slice(0, 3).map((i) => i.message).join(' | '),
        suggestion:
          'İlgili personellerin yoğun 🔴 Çalışamam veya izin blokları nedeniyle 3 gün sınırı aşılmış olabilir. "Yeni Alternatif Dene" ile farklı bir dağılım arayabilir ya da sınırı 4 güne esnetebilirsiniz.',
        quickAction: 'relax_empty_cap',
      });
    }

    const hardNegIssues = evaluation.issues.filter((i) => i.code === 'NEGATIVE_PREF_CONFLICT');
    if (hardNegIssues.length > 0) {
      items.push({
        id: 'post-hard-neg',
        severity: 'critical',
        category: 'capacity',
        title: `${hardNegIssues.length} adet 🔴 Çalışamam kısıtı mecburen aşıldı`,
        detail: hardNegIssues.slice(0, 3).map((i) => i.message).join(' | '),
        suggestion:
          'İlgili günlerde yeterli yedek olmadığı için kırmızı günler sıkıştı. Matriste ilgili hücreye tıklayıp "Uygun Yedek Öner" ile takas yapabilir veya "Yeni Alternatif Dene" butonunu çalıştırabilirsiniz.',
        quickAction: 'retry_solve',
      });
    }

    const day3Issues = evaluation.issues.filter((i) => i.code === 'DAY3_MESAI_NOTICE');
    if (day3Issues.length >= 2) {
      items.push({
        id: 'post-day3',
        severity: 'tip',
        category: 'fairness',
        title: `${day3Issues.length} adet "nöbet sonrası 3. gün mesai" uyarısı var`,
        detail: 'Sabah nöbetten çıkıp 1 gün aradan sonra mesaiye dönüşleri azaltmak için farklı başlangıç seed’i denenebilir.',
        suggestion:
          'Alternatif dağılım üreterek veya 1–2 mesai hücresini Değiş-Tokuş yaparak 3. gün mesaisini sıfıra yaklaştırabilirsiniz.',
        quickAction: 'retry_solve',
      });
    }

    const sepIssues = evaluation.issues.filter((i) => i.code === 'PAIR_SEPARATE_CONFLICT');
    if (sepIssues.length > 0) {
      items.push({
        id: 'post-pair-sep',
        severity: 'warning',
        category: 'fairness',
        title: `${sepIssues.length} adet ayrı nöbet kuralı çakışması`,
        detail: sepIssues.slice(0, 3).map((i) => i.message).join(' | '),
        suggestion: '"Yeni Alternatif Dene" çalıştırabilir veya matriste ilgili günlerden birini takas edebilirsiniz.',
        quickAction: 'retry_solve',
      });
    }

    // Bireysel düşük memnuniyet (2+ istek girip <%50 tutanlar)
    for (const m of evaluation.nurseMetrics) {
      if (m.role !== 'nobetli' || m.positiveTotal < 2) continue;
      const ratio = m.positiveMatched / m.positiveTotal;
      if (ratio < 0.5) {
        const missedDays = m.unmatchedPositiveDays;
        const competingHints = missedDays
          .filter((d) => {
            const cap = isHolidayOrWeekend(d, config.yearMonth, config.holidays)
              ? config.weekendNobetCount
              : config.weekdayNobetCount;
            let count = 0;
            for (const n of activeNobetli) {
              if (preferences[n.id]?.positiveNobetDays?.includes(d)) count++;
            }
            return count > cap;
          })
          .map((d) => `${d}. gün`);
        const nurseName = nurseById.get(m.nurseId)?.name ?? m.name;
        items.push({
          id: `low-sat-${m.nurseId}`,
          severity: 'tip',
          category: 'fairness',
          title: `${nurseName}: Pozitif isteklerinin ${m.positiveMatched}/${m.positiveTotal} tanesi (${Math.round(
            ratio * 100
          )}%) tuttu`,
          detail: `Karşılanmayan günler: ${missedDays.join(', ') || '—'}${
            competingHints.length > 0 ? ` (yoğun rekabet: ${competingHints.join(', ')})` : ''
          }.`,
          suggestion:
            'Rekabetin yüksek olduğu günlerde veya sıkışık kırmızı/dinlenme blokları arasında bir başka gün ile manuel Değiş-Tokuş veya "Yeni Alternatif Dene" denenebilir.',
          quickAction: 'retry_solve',
        });
      }
    }
  }

  const sorted = items.sort((a, b) => {
    const sevDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (sevDiff !== 0) return sevDiff;
    const aIsPost = a.id.startsWith('post-') ? 0 : 1;
    const bIsPost = b.id.startsWith('post-') ? 0 : 1;
    return aIsPost - bIsPost;
  });

  // Günlük kapasite maddelerinin özet ve çözüm-sonrası bulguları bastırmaması için gün sayısını makul sınırda tut
  const out: BottleneckItem[] = [];
  let dailyCapCount = 0;
  for (const item of sorted) {
    if (item.category === 'capacity' && !item.id.startsWith('post-')) {
      if (dailyCapCount >= 6) continue;
      dailyCapCount++;
    }
    out.push(item);
    if (out.length >= 15) break;
  }
  return out;
}
