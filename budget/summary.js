// ════════════════════════════════════════════════════════════════════
// SAMMANSTÄLLNING – v14 (sektioner med ramar)
// ════════════════════════════════════════════════════════════════════

function qIconInline(text) {
  return `<span class="q-icon" data-source="${esc(text)}">?</span>`;
}

// Bygger radetikett med belopp i grå, liten text
function labelWithSum(label, sum) {
  if (!sum || sum <= 0) return label;
  return `${label} <span style="color:#666; font-size:11px;">(${fmtV(sum)})</span>`;
}

// ─── SWEDBANK-REFERENS FÖR BARN ───
function getSwedbankBarnReference() {
  const barnItems = state.items.barn || [];
  const antal = barnItems.length;
  if (antal === 0) return { total: 0, antal: 0, breakdown: [] };

  const personBarn = (state.items.personer || []).filter(p => p.type === 'person_barn');
  const usedPersonIds = new Set();
  const breakdown = [];
  let total = 0;

  // Matcha varje barn (i Barn-sektionen) mot rätt person_barn:
  //   1) på namn om båda har ifyllt
  //   2) annars första lediga person_barn (index-fallback)
  barnItems.forEach(barn => {
    const namn = (barn.values.namn || '').trim();
    let p = null;

    if (namn) {
      p = personBarn.find(pb =>
        !usedPersonIds.has(pb._id) &&
        (pb.values.namn || '').trim() === namn
      );
    }
    if (!p) {
      p = personBarn.find(pb => !usedPersonIds.has(pb._id));
    }
    if (p) usedPersonIds.add(p._id);

    let ref = 7800;
    let alder = null;

    if (p) {
      alder = parseFloat(p.values.alder);
      if (!isNaN(alder)) {
        // Swedbanks tre brytpunkter: 1-6, 7-12, 13-18 år.
        // Interpolera mot mittpunkterna 3.5, 9.5, 15.5.
        ref = interpolateAtAge(alder, [
          { age: 3.5,  value: 7300 },
          { age: 9.5,  value: 7800 },
          { age: 15.5, value: 9100 }
        ]);
      } else {
        alder = null;
      }
    }
    breakdown.push({ alder, ref });
    total += ref;
  });

  return { total, antal, breakdown };
}

function updateSummary() {
  const summaryEl = document.getElementById('summary');
  if (!summaryEl) return;

  const bl = getBaselines();
  const inkomst = totalIncome();
  const sparande = totalSavings();

  const skuldSaldo = sumSkulderSaldo();
  const skuldManad = sumSkulderManad();
  const skuldRanta = sumSkulderRanta();
  const skuldAmort = sumSkulderAmortering();
  const inkomstBrutto = getAnnualGrossIncome();
  const skuldkvot = inkomstBrutto > 0 ? (skuldSaldo / inkomstBrutto) * 100 : 0;

  const fastaBas = sumByKlass('fast');
  const rorliga = sumByKlass('rörlig');
  const fasta = fastaBas + skuldRanta;
  const utgifter = fasta + rorliga;

  const kvar = inkomst - utgifter - sparande - skuldAmort;
  const sparkvot = inkomst > 0 ? (sparande / inkomst) * 100 : 0;
  const sparkvotMedAmort = inkomst > 0 ? ((sparande + skuldAmort) / inkomst) * 100 : 0;
  const forsakringar = sumByGroup('försäkring');

  const boende = sumSection('boende');
  const mat = sumSection('mat');
  const transport = sumSection('transport');
  const noje = sumSection('noje');
  const vard = sumSection('vard');
  const barn = sumSection('barn');
  const personligt = sumSection('personligt');
  const ovrigt = sumSection('ovrigt');

  let bolanRanta = 0;
  let bolanAmort = 0;
  (state.items.skulder || []).forEach(it => {
    if (it.type === 'skuld_bolan') {
      bolanRanta += ((parseFloat(it.values.saldo)||0) * (parseFloat(it.values.ranta_procent)||0) / 100 / 12);
      bolanAmort += parseFloat(it.values.amortering) || 0;
    }
  });
  const bolanTotal = bolanRanta + bolanAmort;
  const boendeMedLan = boende + bolanTotal;
  const boendeExklAmort = boende + bolanRanta;

  const abonnemangTypes = ['streaming', 'mobil', 'bredband_bo', 'tidningar', 'traning'];
  let abonnemangTotal = 0;
  ['boende', 'personligt', 'noje'].forEach(sid => {
    function walk(item) {
      if (abonnemangTypes.includes(item.type)) abonnemangTotal += itemTotal(item);
      (item.items || []).forEach(walk);
    }
    (state.items[sid] || []).forEach(walk);
  });

  const buffert = getBuffertSaldo();
  const manadskostnadForBuffert = utgifter + skuldAmort;
  const buffertManader = manadskostnadForBuffert > 0 ? buffert / manadskostnadForBuffert : 0;
  const mal3Manader = 3 * manadskostnadForBuffert;
  const mal6Manader = 6 * manadskostnadForBuffert;

  let sparBuffertManad = 0;
  (state.items.sparande || []).forEach(it => {
    if (it.type === 'spar_buffert') sparBuffertManad += parseFloat(it.values.belopp) || 0;
  });

  const bk = getBarnkostnader();
  const swedbankBarn = getSwedbankBarnReference();
  const swedbankBarnPct = inkomst > 0 ? (swedbankBarn.total / inkomst) * 100 : 0;

  const pct = (v) => inkomst > 0 ? (v / inkomst) * 100 : 0;
  const barWidth = (pctVal, snittVal) => Math.min(100, (pctVal / (snittVal * 2)) * 100);
  const statusFor = (pctVal, snittVal) => {
    if (pctVal > snittVal * 1.5) return { text: '🔴 Klart över', cls: 'bar-high' };
    if (pctVal > snittVal * 1.2) return { text: '⚠️ Över', cls: 'bar-warn' };
    return { text: '✅ Bra', cls: 'bar-ok' };
  };

  // ══════════════════════════════════════════════════════════════════
  // SNABBÖVERSIKT (hero, ingen ram – har egen bakgrund)
  // ══════════════════════════════════════════════════════════════════
    let html = `
    <div class="summary-hero">
      <div class="hero-item">
        <div class="hero-label">Hushållstyp</div>
        <div class="hero-value">👥 ${bl.label}</div>
      </div>
      <div class="hero-item">
        <div class="hero-label">Inkomster netto</div>
        <div class="hero-value positive">+ ${fmtVUnit(inkomst)}</div>
      </div>
      <div class="hero-item">
        <div class="hero-label">Utgifter${skuldRanta > 0 ? ' <span style="color:#666; font-size:10px;">(inkl. ränta)</span>' : ''}</div>
        <div class="hero-value negative">− ${fmtVUnit(utgifter)}</div>
      </div>
      <div class="hero-item">
        <div class="hero-label">Sparande</div>
        <div class="hero-value negative">− ${fmtVUnit(sparande)}</div>
      </div>
      ${skuldAmort > 0 ? `<div class="hero-item">
        <div class="hero-label">Amortering</div>
        <div class="hero-value negative">− ${fmtVUnit(skuldAmort)}</div>
      </div>` : ''}
      <div class="hero-item hero-big">
        <div class="hero-label">Kvar per ${viewMode === 'year' ? 'år' : 'månad'}</div>
        <div class="hero-value ${kvar >= 0 ? 'positive' : 'negative'}">${fmtV(kvar)}</div>
      </div>
      <div class="hero-item">
        <div class="hero-label">Sparkvot</div>
        <div class="hero-value" style="color:${sparkvot >= 10 ? 'var(--success)' : sparkvot >= 5 ? '#ffaa44' : '#ff6b6b'}">${sparkvot.toFixed(1)} %</div>
      </div>
    </div>
    <div class="summary-sub" style="text-align:center; margin-top:12px; margin-bottom:20px;">
      💡 Belopp visas i <strong>${viewUnit()}</strong>. Vissa kostnader betalas årsvis – fyll i snitt per månad.
    </div>
  `;

  // ══════════════════════════════════════════════════════════════════
  // INSIKTER (egen ram)
  // ══════════════════════════════════════════════════════════════════
  html += `<div class="summary-section">`;
  html += `<div class="summary-heading">💡 INSIKTER OM DIN EKONOMI</div>`;
  html += `<div class="insights-grid">`;

  const amortText = skuldAmort > 0
    ? `<br>Med amortering inräknad blir den <strong>effektiva sparkvoten ${sparkvotMedAmort.toFixed(1)} %</strong> (${fmtV(sparande + skuldAmort)}/${viewMode === 'year' ? 'år' : 'mån'}) – amortering bygger ju också förmögenhet.`
    : '';

  if (sparkvot >= 20) {
    html += insightCard('🚀', 'Stark sparkvot', `Du sparar ${sparkvot.toFixed(1)} % av nettoinkomsten. Det är dubbelt så mycket som Swedbanks rekommendation på 10 %.${amortText}`, 'ok');
  } else if (sparkvot >= 10) {
    html += insightCard('✅', 'Över rekommendationen', `Du sparar ${sparkvot.toFixed(1)} % – över Swedbanks riktmärke på 10 %. Bra balans.${amortText}`, 'ok');
  } else if (sparkvot >= 5) {
    html += insightCard('⚠️', 'Under riktmärket', `Du sparar ${sparkvot.toFixed(1)} % – under Swedbanks rekommendation på 10 %. Öka med ${fmtV(inkomst * 0.10 - sparande)} för att nå riktmärket.${amortText}`, 'warn');
  } else if (sparkvot > 0) {
    html += insightCard('🔴', 'Låg sparkvot', `Du sparar ${sparkvot.toFixed(1)} % – långt under rekommenderade 10 %. Se över fasta kostnader.${amortText}`, 'bad');
  } else {
    html += insightCard('🔴', 'Inget sparande', `Du har inget sparande just nu. Även små belopp gör skillnad – börja med 500 kr/mån.${amortText}`, 'bad');
  }

  if (buffert > 0) {
    let statusType, statusText;
    if (buffertManader >= 6) { statusType = 'ok'; statusText = 'mycket bra'; }
    else if (buffertManader >= 3) { statusType = 'ok'; statusText = 'i linje med rekommendationen'; }
    else if (buffertManader >= 1) { statusType = 'warn'; statusText = 'under rekommenderat'; }
    else { statusType = 'bad'; statusText = 'för liten'; }

    html += insightCard('🎯', 'Bufferttäckning',
      `Du klarar dig <strong style="font-size:16px;">${buffertManader.toFixed(1)} månader</strong> på din buffert (${buffert.toLocaleString('sv-SE')} kr). Täckningen är ${statusText}.<br>Beräknat på utgifter inkl. ränta och amortering (${fmtV(manadskostnadForBuffert)}/${viewMode === 'year' ? 'år' : 'mån'}) – sparande är exkluderat.`,
      'calm');

        if (buffertManader < 3) {
      const saknas = mal3Manader - buffert;
      if (sparBuffertManad > 0) {
        const manaderTill3 = Math.ceil(saknas / sparBuffertManad);
        html += insightCard('💪', 'Tid till 3-månadersmål',
          `Du sparar ${fmt(sparBuffertManad)}/mån till bufferten. Med nuvarande takt når du 3 månaders täckning (${Math.round(mal3Manader).toLocaleString('sv-SE')} kr) om <strong>${manaderTill3} ${manaderTill3 === 1 ? 'månad' : 'månader'}</strong>. Saknas ${Math.round(saknas).toLocaleString('sv-SE')} kr.`,
          'accent');
      } else {
        html += insightCard('💪', 'Saknar månadssparande till buffert',
          `Du behöver ${Math.round(saknas).toLocaleString('sv-SE')} kr för att nå 3 månaders täckning (${Math.round(mal3Manader).toLocaleString('sv-SE')} kr). Lägg till "Månadssparande buffert" under Sparande för att se tidsplan.`,
          'accent');
      }
    } else if (buffertManader >= 6) {
      const overskott = buffert - mal6Manader;
      if (overskott > 0) {
        html += insightCard('💪', 'Överskott över 6-månadersmål',
          `Du har ${overskott.toLocaleString('sv-SE')} kr mer än 6-månadersmålet (${mal6Manader.toLocaleString('sv-SE')} kr). Överväg att flytta överskottet till långsiktigt sparande.`,
          'ok');
      }
    }
  } else {
    html += insightCard('🛟', 'Ingen buffert registrerad', `Lägg till "Nuvarande buffert" under Sparande för att se hur många månaders utgifter du klarar.`, 'info');
  }

  const boendePct = pct(boendeMedLan);
  const boendeExklAmortPct = pct(boendeExklAmort);
  const bolanRantaPct = pct(bolanRanta);
  const bolanAmortPct = pct(bolanAmort);

      if (boendeExklAmortPct > bl.boende * 1.3) {
    html += insightCard('🏠', 'Höga boendekostnader',
      `Boendet är ${Math.round(boendeMedLan).toLocaleString('sv-SE')} kr/mån${bolanTotal > 0 ? ` (varav ${bolanRantaPct.toFixed(1)} % bolåneränta + ${bolanAmortPct.toFixed(1)} % amortering)` : ''}.<br>Utan amortering är boendet <strong>${boendeExklAmortPct.toFixed(0)} %</strong> av nettoinkomsten – klart över SCB:s snitt på ${bl.boende} % för ${bl.label}.`,
      'warn');
  } else if (boendeExklAmortPct < bl.boende * 0.7) {
    html += insightCard('🏠', 'Låga boendekostnader',
      `Boendet är ${Math.round(boendeMedLan).toLocaleString('sv-SE')} kr/mån${bolanTotal > 0 ? ` (varav ${bolanRantaPct.toFixed(1)} % bolåneränta + ${bolanAmortPct.toFixed(1)} % amortering)` : ''}.<br>Utan amortering är boendet <strong>${boendeExklAmortPct.toFixed(0)} %</strong> av nettoinkomsten – klart under SCB:s snitt på ${bl.boende} % för ${bl.label}.`,
      'ok');
  } else if (boendePct > 0) {
    html += insightCard('🏠', 'Boendet i balans',
      `Boendet är ${Math.round(boendeMedLan).toLocaleString('sv-SE')} kr/mån${bolanTotal > 0 ? ` (varav ${bolanRantaPct.toFixed(1)} % bolåneränta + ${bolanAmortPct.toFixed(1)} % amortering)` : ''}.<br>Utan amortering är boendet <strong>${boendeExklAmortPct.toFixed(0)} %</strong> av nettoinkomsten – i linje med SCB:s snitt på ${bl.boende} % för ${bl.label}.`,
      'ok');
  }

    const matSnittKr = bl.matReferensKr;
  if (mat > 0 && matSnittKr > 0) {
    const matDiff = mat - matSnittKr;
    const matDiffPct = (matDiff / matSnittKr) * 100;
    const perLabel = viewMode === 'year' ? 'år' : 'mån';
    if (Math.abs(matDiffPct) < 15) {
      html += insightCard('🍽️', 'Matkostnad i linje med snittet', `Du lägger ${fmtV(mat)}/${perLabel} på mat – nära Konsumentverkets referensvärde på ${fmt(matSnittKr)}/mån för ${bl.totalPers} ${bl.totalPers === 1 ? 'person' : 'personer'}.`, 'ok');
    } else if (matDiff > 0) {
      html += insightCard('🍽️', 'Över matsnittet', `Du lägger ${fmtV(mat)}/${perLabel} på mat – ${fmtV(matDiff)}/${perLabel} över referensvärdet på ${fmt(matSnittKr)}/mån för ${bl.totalPers} ${bl.totalPers === 1 ? 'person' : 'personer'}.`, 'warn');
    } else {
      html += insightCard('🍽️', 'Under matsnittet', `Du lägger ${fmtV(mat)}/${perLabel} på mat – ${fmtV(Math.abs(matDiff))}/${perLabel} under referensvärdet på ${fmt(matSnittKr)}/mån. Bra hushållning!`, 'ok');
    }
  }

  const kategorier = [
    { name: '🏠 Boende',       value: boendeMedLan, p: pct(boendeMedLan) },
    { name: '🍽️ Mat',          value: mat,          p: pct(mat) },
    { name: '🚗 Transport',    value: transport,    p: pct(transport) },
    { name: '🎬 Nöje & Fritid',value: noje,         p: pct(noje) },
    { name: '🛡️ Försäkringar', value: forsakringar, p: pct(forsakringar) },
    { name: '🧴 Personligt',   value: personligt,   p: pct(personligt) },
    { name: '👶 Barn',         value: bk ? bk.total : 0, p: pct(bk ? bk.total : 0) },
    { name: '🏥 Vård',         value: vard,         p: pct(vard) },
    { name: '📦 Övrigt',       value: ovrigt,       p: pct(ovrigt) },
  ].filter(c => c.value > 0).sort((a, b) => b.value - a.value);

  if (kategorier.length >= 2) {
    const etta = kategorier[0];
    const tvaa = kategorier[1];
    html += insightCard('🔍', 'Största utgiftsposten', `${etta.name} är din största utgift med ${fmtV(etta.value)} (${etta.p.toFixed(1)} % av nettoinkomsten). Näst störst: ${tvaa.name} med ${fmtV(tvaa.value)}.`, 'neutral');
  } else if (kategorier.length === 1) {
    html += insightCard('🔍', 'Största utgiftsposten', `${kategorier[0].name} är din största utgift med ${fmtV(kategorier[0].value)}.`, 'neutral');
  }

    // Varning: barn-andelar överstiger 100 %
  if (bk && (bk.matAndelTotal > 100 || bk.boendeAndelTotal > 100)) {
    const matOver = bk.matAndelTotal > 100;
    const boendeOver = bk.boendeAndelTotal > 100;
    const parts = [];
    if (matOver)    parts.push(`mat-andelar = <strong>${bk.matAndelTotal.toFixed(0)} %</strong>`);
    if (boendeOver) parts.push(`boende-andelar = <strong>${bk.boendeAndelTotal.toFixed(0)} %</strong>`);
    html += insightCard(
      '⚠️',
      'Barn-andelar överstiger 100 %',
      `Summan av barnens ${parts.join(' och ')}. Kontrollera att andelarna inte räknas dubbelt – varje barns andel ska spegla hur stor del av hushållets kostnader som går till just det barnet.`,
      'warn'
    );
  }

  if (fasta > 0 && rorliga > 0) {
    const fastaShare = (fasta / (fasta + rorliga)) * 100;
    const forklaring = '<br><span style="color:#777; font-size:11.5px;">Fasta = boende, el, försäkringar, abonnemang, förskola, medlemskap, skuldränta. Rörliga = mat, nöjen, kläder, resor, restaurang.</span>';

    if (fastaShare > 70) {
      html += insightCard('🔒', 'Hög andel fasta utgifter',
        `${fastaShare.toFixed(0)} % av dina utgifter är fasta (${fmtV(fasta)}) och ${(100 - fastaShare).toFixed(0)} % rörliga (${fmtV(rorliga)}).<br>Hög andel fasta ger liten flexibilitet om inkomsten minskar.${forklaring}`,
        'warn');
    } else if (fastaShare < 40) {
      html += insightCard('🎈', 'Flexibel budget',
        `Bara ${fastaShare.toFixed(0)} % av dina utgifter är fasta (${fmtV(fasta)}) och ${(100 - fastaShare).toFixed(0)} % rörliga (${fmtV(rorliga)}).<br>God flexibilitet att anpassa vid behov.${forklaring}`,
        'ok');
    } else {
      html += insightCard('⚖️', 'Balanserad budget',
        `${fastaShare.toFixed(0)} % fasta (${fmtV(fasta)}) och ${(100 - fastaShare).toFixed(0)} % rörliga (${fmtV(rorliga)}).<br>Sund balans mellan stabilitet och flexibilitet.${forklaring}`,
        'ok');
    }
  }

  if (skuldSaldo > 0) {
    const rantaAvInkomst = inkomst > 0 ? (skuldRanta / inkomst) * 100 : 0;
    const spann = 'Spann: <span style="color:#777; font-size:11.5px;">Låg < 200 % · Måttlig 200–450 % · Hög 450–600 % · Mycket hög > 600 % av årsinkomst brutto</span>';

    if (skuldkvot > 600) {
      html += insightCard('💳', 'Mycket hög skuldbörda',
        `Totala skulder: ${skuldSaldo.toLocaleString('sv-SE')} kr = ${skuldkvot.toFixed(0)} % av årsinkomst brutto.<br>Räntekostnad: ${fmtV(skuldRanta)}/${viewMode === 'year' ? 'år' : 'mån'} = ${rantaAvInkomst.toFixed(1)} % av månadsinkomst.<br>${spann}`,
        'bad');
    } else if (skuldkvot > 450) {
      html += insightCard('💳', 'Hög skuldbörda',
        `Totala skulder: ${skuldSaldo.toLocaleString('sv-SE')} kr = ${skuldkvot.toFixed(0)} % av årsinkomst brutto.<br>Räntekostnad: ${fmtV(skuldRanta)}/${viewMode === 'year' ? 'år' : 'mån'} = ${rantaAvInkomst.toFixed(1)} % av månadsinkomst.<br>${spann}`,
        'warn');
    } else if (skuldkvot > 200) {
      html += insightCard('💳', 'Måttlig skuldbörda',
        `Totala skulder: ${skuldSaldo.toLocaleString('sv-SE')} kr = ${skuldkvot.toFixed(0)} % av årsinkomst brutto.<br>Räntekostnad: ${fmtV(skuldRanta)}/${viewMode === 'year' ? 'år' : 'mån'} = ${rantaAvInkomst.toFixed(1)} % av månadsinkomst.<br>${spann}`,
        'info');
    } else {
      html += insightCard('💳', 'Låg skuldbörda',
        `Totala skulder: ${skuldSaldo.toLocaleString('sv-SE')} kr = ${skuldkvot.toFixed(0)} % av årsinkomst brutto.<br>Räntekostnad: ${fmtV(skuldRanta)}/${viewMode === 'year' ? 'år' : 'mån'} = ${rantaAvInkomst.toFixed(1)} % av månadsinkomst.<br>${spann}`,
        'ok');
    }
  }
  
    // ─── RÄNTEKÄNSLIGHET (bara om bolån finns) ───
  const bolanItems = (state.items.skulder || []).filter(it => it.type === 'skuld_bolan');
  const bolanSaldo = bolanItems.reduce((s, it) => s + (parseFloat(it.values.saldo) || 0), 0);

  if (bolanSaldo > 0 && inkomst > 0) {
    // Viktat snitt av bolånens ränta
    let viktadRanta = 0;
    bolanItems.forEach(it => {
      const s = parseFloat(it.values.saldo) || 0;
      const r = parseFloat(it.values.ranta_procent) || 0;
      viktadRanta += s * r;
    });
    const rantaSnitt = bolanSaldo > 0 ? viktadRanta / bolanSaldo : 0;
    const rantaManad = bolanSaldo * rantaSnitt / 100 / 12;

    // Scenario: +1 %, +2 %, +3 %
    const scenarier = [1, 2, 3].map(h => ({
      höjning: h,
      nyRanta: bolanSaldo * (rantaSnitt + h) / 100 / 12,
      delta: bolanSaldo * h / 100 / 12
    }));
    const värsta = scenarier[2];
    const pctAvInkomst = (värsta.delta / inkomst) * 100;

    let statusType, statusText;
    if (pctAvInkomst < 15) { statusType = 'ok'; statusText = 'Tåligt'; }
    else if (pctAvInkomst < 25) { statusType = 'warn'; statusText = 'Kännbart'; }
    else { statusType = 'bad'; statusText = 'Riskabelt'; }

    // Ränteavdrag: 30 % upp till 100 000 kr/år, 21 % över
    const ränteAvdrag = (årligRänta) => {
      if (årligRänta <= 100000) return årligRänta * 0.30;
      return 100000 * 0.30 + (årligRänta - 100000) * 0.21;
    };
    const nettoÖkningManad = (scen) => {
      const bruttoÅr = rantaManad * 12;
      const nettoÅr = (rantaManad + scen.delta) * 12;
      const avdragBrutto = ränteAvdrag(bruttoÅr);
      const avdragNetto = ränteAvdrag(nettoÅr);
      const nettoÖkningÅr = (nettoÅr - avdragNetto) - (bruttoÅr - avdragBrutto);
      return nettoÖkningÅr / 12;
    };

    const nettoVärsta = nettoÖkningManad(värsta);

        const perLabel = viewMode === 'year' ? 'år' : 'mån';
    html += insightCard(
      '📈',
      'Räntekänslighet',
      `Din bolåneränta är idag <strong>${rantaSnitt.toFixed(2).replace('.', ',')} %</strong> → <strong>${fmtV(rantaManad)}</strong> i räntekostnad.<br><br>
       Vid räntehöjning:<br>
       • <strong>+1 %</strong> → ${fmtV(scenarier[0].nyRanta)}/${perLabel} <span style="color:#ffaa44;">(+${fmtV(scenarier[0].delta)})</span><br>
       • <strong>+2 %</strong> → ${fmtV(scenarier[1].nyRanta)}/${perLabel} <span style="color:#ffaa44;">(+${fmtV(scenarier[1].delta)})</span><br>
       • <strong>+3 %</strong> → ${fmtV(scenarier[2].nyRanta)}/${perLabel} <span style="color:#ff6b6b;">(+${fmtV(scenarier[2].delta)})</span><br><br>
       Vid +3 % motsvarar ökningen <strong>${pctAvInkomst.toFixed(1)} %</strong> av din/er nettoinkomst. Netto efter ränteavdrag: ca +${fmtV(nettoVärsta)}/${perLabel}.`,
      statusType
    );
  }
  
    // ─── TID TILL SKULDFRIHET ───
  if (skuldSaldo > 0 && skuldAmort > 0) {
    const amortÅr = skuldAmort * 12;

    // Förenklad modell: rak amortering utan hänsyn till ränta.
    // Räntan betalas löpande och påverkar inte saldot direkt.
    const årTillSkuldfri = Math.ceil(skuldSaldo / amortÅr);
    const årMed1000 = Math.ceil(skuldSaldo / (amortÅr + 12000));
    const besparing = årTillSkuldfri - årMed1000;

    const nuvarandeÅr = new Date().getFullYear();
    const slutÅr = nuvarandeÅr + årTillSkuldfri;

    let statusType, statusText;
    if (årTillSkuldfri < 15) { statusType = 'ok'; statusText = 'Snabb avbetalning'; }
    else if (årTillSkuldfri < 30) { statusType = 'warn'; statusText = 'Normal takt'; }
    else { statusType = 'bad'; statusText = 'Långsiktig skuld'; }

    let extraText = '';
    if (besparing >= 1) {
      extraText = `<br><br>Ökar du amorteringen med <strong>1 000 kr/mån</strong> → skuldfri <strong>${besparing} år</strong> tidigare (år ${nuvarandeÅr + årMed1000}).`;
    }

        html += insightCard(
      '⏱️',
      'Tid till skuldfrihet',
      `Vid nuvarande amorteringstakt är du skuldfri om ca <strong style="font-size:16px;">${årTillSkuldfri} år</strong> (år ${slutÅr}).<br><br>
       • Kvar att betala: <strong>${skuldSaldo.toLocaleString('sv-SE')} kr</strong><br>
              • Amorterar: <strong>${fmt(skuldAmort)}/mån</strong> = ${fmt(amortÅr)}/år${extraText}`,
      'accent'
    );
  }

  html += `</div>`;   // stäng insights-grid
  html += `</div>`;   // stäng summary-section

  // ══════════════════════════════════════════════════════════════════
  // JÄMFÖRELSE (egen ram)
  // ══════════════════════════════════════════════════════════════════
  const demoQ = `<span class="q-icon" data-source="${esc('Hovra över en kategori-ikon för att se hur summan räknas fram.')}">?</span>`;
  const demoS = `<span class="src-icon" data-source="${esc('Källor: SCB Hushållens utgifter (HUT) 2024, Konsumentverket 2025, Swedbank 2025.')}">i</span>`;

  const barnAndelTip = 'Summan inkluderar:\n• Direkta barnkostnader (förskola, kläder, aktiviteter, leksaker, veckopeng m.m.)\n• Barnets andel av mat (anges som % på varje barn)\n• Barnets andel av boende & förbrukning (anges som % på varje barn)\n\n⚠️ Överlappar med raderna Mat, Boende och Övrigt – beloppen kan INTE summeras rakt av.';

  let barnSnittTip = '';
  if (swedbankBarn.antal > 0) {
    const lines = swedbankBarn.breakdown.map((b, i) => {
      const alderText = b.alder !== null ? `${b.alder} år` : 'ålder ej angiven → antagande 7-12 år';
      return `• Barn ${i + 1} (${alderText}): ${b.ref.toLocaleString('sv-SE')} kr/mån`;
    });
    barnSnittTip = 'Swedbanks totala nettokostnad per barn och ålder:\n• 1-6 år: 7 300 kr/mån\n• 7-12 år: 7 800 kr/mån\n• 13-18 år: 9 100 kr/mån\n\nDin beräkning baserat på ' + swedbankBarn.antal + ' barn:\n' + lines.join('\n') + '\n\nTotalt: ' + swedbankBarn.total.toLocaleString('sv-SE') + ' kr/mån\nKälla: Swedbank 2025';
  }

  const tooltips = {
    boende: {
      andel: 'Summan inkluderar:\n• Allt i Boende-fliken (hyra, el, värme, vatten, försäkringar, underhåll m.m.)\n• Bolåneränta från Skulder-fliken\n• Amortering från Skulder-fliken\n\nAmortering räknas med eftersom svenska amorteringskrav gör den till ett fast åtagande (2 %, 1 % eller 0 % beroende på belåningsgrad).',
      snitt: 'SCB HUT 2024 – median andel av disponibel inkomst per hushållstyp:\n• Ensamstående utan barn: 31,9 %\n• Sammanboende utan barn: 21,3 %\n• Ensamstående med barn: 30,2 %\n• Sammanboende med barn: 19,4 %\n\n⚠️ SCB räknar EXKL. amortering – bara ränta och drift.\nDin jämförelse använder ' + bl.boende + ' % (' + bl.label + ').'
    },
    mat: {
      andel: 'Summan inkluderar:\n• Livsmedel / matinköp\n• Restaurang / kafé\n• Utelunch på jobbet\n• Matkasse / hemleverans\n• Egna matposter\n\nMaten avser HELA hushållet – även barnens andel ligger här.',
      snitt: 'Källor:\n• SCB HUT 2024: ~13 % av total konsumtion\n• Konsumentverket 2025: ~3 200–3 700 kr/vuxen + 2 500 kr/barn\n\nDin jämförelse använder 13 % (andel av nettoinkomst).'
    },
    transport: {
      andel: 'Summan inkluderar:\n• Bil (bränsle, försäkring, skatt, service, däck, besiktning, parkering, tvätt, färja)\n• MC / moped\n• Kollektivtrafik\n• Taxi / Uber\n• Flyg\n• Cykel / underhåll\n\n⚠️ Billån hanteras under Skulder-fliken.',
      snitt: 'SCB HUT 2024: 12–13 % av total konsumtion.\n\nUngefärliga belopp:\n• En bil (exkl. värdeminskning): 2 000–3 500 kr/mån\n• MC/moped: 800–1 500 kr/mån\n• Månadskort kollektivt: 600–1 000 kr/mån\n\nDin jämförelse använder ' + bl.transport + ' %.'
    },
    forsakring: {
      andel: 'Korsvis summering – hämtar försäkringar från flera flikar:\n• Boende: hemförsäkring, villahemförsäkring, BRF-försäkring\n• Transport: bilförsäkring, MC-försäkring\n• Barn: barnförsäkring\n• Försäkringar: liv, olycksfall, inkomst, sjukvård, resa, A-kassa, fack\n• Vård: frisktandvård\n\n⚠️ Detta är mer än bara fliken 🛡️ 8. Försäkringar.',
      snitt: 'Rekommenderat: 3–5 % av nettoinkomst för ett typiskt hushåll.\n\nUngefärliga belopp:\n• Hemförsäkring: 150–250 kr/mån\n• Bilförsäkring: 300–600 kr/mån\n• Barnförsäkring: 120–240 kr/mån\n• A-kassa: 140–190 kr/mån\n• Liv + olycksfall: 100–300 kr/mån\n\nDin jämförelse använder ' + bl.forsakringar + ' %.'
    },
    noje: {
      andel: 'Summan inkluderar:\n• Streaming (Netflix, Spotify m.fl.)\n• Kino / konsert / teater\n• Sportevenemang / biljetter\n• Hobby\n• Böcker & tidskrifter\n• Resor & semester\n• Alkohol & tobak\n• Spel & lotteri\n• Egna nöjesposter',
      snitt: 'SCB HUT 2024 – summerat:\n• Fritid, sport & kultur: 8,4 %\n• Restaurang & hotell: 5,2 %\n• Alkohol: 1,1 %\n\nTotalt ≈ 14,7 % av total konsumtion.\n\nDin jämförelse använder ' + bl.noje + ' %.'
    },
    personligt: {
      andel: 'Summan inkluderar:\n• Mobiltelefon\n• Kläder & skor (vuxen)\n• Hygien & skönhet\n• Frisör\n• Träning / gym\n• Tidningar & prenumerationer\n• Husdjur\n• Egna poster',
      snitt: 'SCB HUT 2024 – summerat:\n• Kläder & skor: 4,0 %\n• Datorer, telefoner, internet: 3,9 %\n\nTotalt ≈ 7,9 % av total konsumtion.\n\nDin jämförelse använder ' + bl.personligt + ' %.'
    },
    vard: {
      andel: 'Summan inkluderar:\n• Frisktandvård\n• Tandvård (utöver frisktandvård)\n• Läkemedel\n• Läkar- / vårdbesök\n• Psykolog / terapi\n• Fysioterapi / naprapat\n• Glasögon / linser\n• Egna vårdposter\n\n⚠️ Frisktandvård räknas även med i Försäkringar (korsvis).',
      snitt: 'SCB HUT 2024: ~3 % av total konsumtion (hälsovård).\n\nDin jämförelse använder ' + bl.vard + ' %.'
    },
    sparande: {
      andel: 'Summan inkluderar:\n• Månadssparande buffert\n• Långsiktigt sparande (ISK, Depå)\n• Pensionssparande\n• Barnsparande\n• Sparande till hus, bil, semester\n• Egna sparanden\n\n⚠️ "Nuvarande buffert" (saldo) räknas INTE med – det är ett saldo, inte ett månadsflöde.',
      snitt: 'Swedbank: minst 10 % av nettoinkomsten rekommenderas i långsiktigt sparande.\n\nMånga FIRE-sparare ligger på 20–50 %.\n\nDin jämförelse använder ' + bl.sparande + ' %.'
    }
  };

  html += `<div class="summary-section">`;
  html += `<div class="summary-heading">📊 DIN BUDGET VS. SVENSKA GENOMSNITT ${srcIcon('allman')}</div>`;
  html += `<div style="color:#666; font-size:12px; margin-bottom:8px;">Hovra på ${demoQ} för hur vi räknar · ${demoS} för källa. Baserat på <strong style="color:#aaa;">${bl.label}</strong>.</div>`;
  html += `<table class="compare-table">
    <thead><tr><th>Kategori</th><th>Din andel</th><th>Snitt</th><th>Status</th><th class="src-col">Info</th></tr></thead><tbody>`;

  const rows = [
    { label: labelWithSum('🏠 Boende', boendeMedLan),
      din: boendeMedLan, snitt: bl.boende, key: 'boende',
	  asterisk: bolanAmort > 0,
      andelTip: tooltips.boende.andel, snittTip: tooltips.boende.snitt },
    { label: labelWithSum('🍽️ Mat', mat),
      din: mat, snitt: bl.mat, key: 'mat',
      andelTip: tooltips.mat.andel, snittTip: tooltips.mat.snitt },
    { label: labelWithSum('🚗 Transport', transport),
      din: transport, snitt: bl.transport, key: 'transport',
      andelTip: tooltips.transport.andel, snittTip: tooltips.transport.snitt },
    { label: labelWithSum('🛡️ Försäkringar', forsakringar),
      din: forsakringar, snitt: bl.forsakringar, key: 'forsakring',
      andelTip: tooltips.forsakring.andel, snittTip: tooltips.forsakring.snitt },
  ];

  if (bk && swedbankBarn.antal > 0) {
    rows.push({
      label: labelWithSum('👶 Barnkostnader totalt', bk.total),
      din: bk.total,
      snitt: swedbankBarnPct,
      key: 'barn',
      andelTip: barnAndelTip,
      snittTip: barnSnittTip
    });
  }

  rows.push(
    { label: labelWithSum('🎬 Nöje & Fritid', noje),
      din: noje, snitt: bl.noje, key: 'noje',
      andelTip: tooltips.noje.andel, snittTip: tooltips.noje.snitt },
    { label: labelWithSum('🧴 Personligt & Vardag', personligt),
      din: personligt, snitt: bl.personligt, key: 'personligt',
      andelTip: tooltips.personligt.andel, snittTip: tooltips.personligt.snitt },
    { label: labelWithSum('🏥 Vård & Omsorg', vard),
      din: vard, snitt: bl.vard, key: 'vard',
      andelTip: tooltips.vard.andel, snittTip: tooltips.vard.snitt },
    { label: labelWithSum('💰 Sparande', sparande),
      din: sparande, snitt: bl.sparande, key: 'sparande',
      andelTip: tooltips.sparande.andel, snittTip: tooltips.sparande.snitt }
  );

    rows.forEach(r => {
    const dinPct = pct(r.din);
    let st = statusFor(dinPct, r.snitt);

    // För sparande är HÖG andel BRA — vänd färgen så rött blir grönt
    if (r.key === 'sparande') {
      if (st.cls === 'bar-high')      st = { text: '✅ Mycket bra', cls: 'bar-ok' };
      else if (st.cls === 'bar-warn') st = { text: '✅ Bra',        cls: 'bar-ok' };
    }

    const andelIcon = r.andelTip ? ' ' + qIconInline(r.andelTip) : '';
    const snittIcon = r.snittTip ? ' ' + qIconInline(r.snittTip) : '';

    html += `<tr>
      <td>${r.label}</td>
      <td><span class="bar ${st.cls}" style="width:${barWidth(dinPct, r.snitt)}px;"></span> ${dinPct.toFixed(1)} %${andelIcon}</td>
      <td>${r.snitt.toFixed(1)} %${snittIcon}</td>
      <td style="font-size:12px;">${r.asterisk ? st.text + '<span style="color:#ff9800; font-weight:bold;" title="Status jämför inkl. amortering mot SCB:s exkl. amortering">*</span>' : st.text}</td>
      <td class="src-col">${qIcon(r.key)}</td>
    </tr>`;
  });

  html += `</tbody></table>`;

  let compareNote = '📌 Riktvärden anpassade efter ' + bl.label + '. Källor: SCB HUT 2024, Konsumentverket 2025, Swedbank 2025.';

  compareNote += '<br>⚠️ <strong>Not om boende:</strong> SCB:s siffra (' + bl.boende + ' %) är exkl. amortering – ränta och drift ingår. Din siffra inkluderar amortering. Utan amortering vore din siffra ' + boendeExklAmortPct.toFixed(1) + ' %, vilket är direkt jämförbart med SCB.';
  
  if (bolanAmort > 0) {
  compareNote += ' <strong style="color:#ff9800;">(* = status jämför inkl. amortering — se raden ovan.)</strong>';
}

  if (bk && swedbankBarn.antal > 0) {
    compareNote += '<br>⚠️ <strong>Not om barn:</strong> Både din siffra och Swedbanks siffra är <em>totala nettokostnader</em> för barnen – inklusive andel av mat och boende. Din siffra bygger på de %-andelar du angett per barn; Swedbanks bygger på ålder. Om ålder saknas antas barnet vara 7–12 år (7 800 kr/mån).';
  }

  html += `<div class="compare-note">${compareNote}</div>`;
  html += `</div>`;   // stäng summary-section

  // ══════════════════════════════════════════════════════════════════
  // KORSSAMMANSTÄLLNINGAR (egen ram)
  // ══════════════════════════════════════════════════════════════════
  html += `<div class="summary-section">`;
  html += `<div class="summary-heading">🔄 KORSSAMMANSTÄLLNINGAR</div>`;
  html += `<div style="color:#666; font-size:12px; margin-bottom:8px;">Poster som finns utspridda över flera sektioner, sammanställda på ett ställe.</div>`;
  html += `<div class="cross-grid">`;

  if (forsakringar > 0) {
    html += `<div class="cross-card">
      <div class="cross-icon">🛡️</div>
      <div class="cross-content">
        <div class="cross-label">Försäkringar totalt ${qIcon('forsakring')}</div>
        <div class="cross-value">${fmtV(forsakringar)}</div>
        <div class="cross-desc">Hem + villa + BRF + bil + MC + barn + liv + olycksfall + inkomst + sjukvård + frisktandvård</div>
      </div>
    </div>`;
  }

  if (bk) {
    html += `<div class="cross-card">
      <div class="cross-icon">👶</div>
      <div class="cross-content">
        <div class="cross-label">Barnkostnader totalt ${qIcon('barn')}</div>
        <div class="cross-value">${fmtV(bk.total)}</div>
        <div class="cross-desc">Inkl. andel av mat, boende och förbrukning. Se detaljer nedan.</div>
      </div>
    </div>`;
  }

  let bilTotal = 0;
  function walkBil(items) {
    items.forEach(it => {
      if (it.type === 'bil') (it.items || []).forEach(c => { bilTotal += itemTotal(c); });
      if (it.items) walkBil(it.items);
    });
  }
  walkBil(state.items.transport || []);
  if (bilTotal > 0) {
    html += `<div class="cross-card">
      <div class="cross-icon">🚗</div>
      <div class="cross-content">
        <div class="cross-label">Bilkostnader totalt</div>
        <div class="cross-value">${fmtV(bilTotal)}</div>
        <div class="cross-desc">Bränsle + försäkring + skatt + service + däck + besiktning + parkering + tvätt + färja</div>
      </div>
    </div>`;
  }

  if (buffert > 0) {
    html += `<div class="cross-card">
      <div class="cross-icon">🛟</div>
      <div class="cross-content">
        <div class="cross-label">Buffert ${qIcon('buffert')}</div>
        <div class="cross-value" style="color:var(--success);">${buffert.toLocaleString('sv-SE')} kr</div>
        <div class="cross-desc">${buffertManader.toFixed(1)} månaders utgifter (inkl. ränta + amortering) · Mål 3–6 mån</div>
      </div>
    </div>`;
  }

  if (skuldSaldo > 0) {
    html += `<div class="cross-card">
      <div class="cross-icon">💳</div>
      <div class="cross-content">
        <div class="cross-label">Totala skulder ${qIcon('skulder')}</div>
        <div class="cross-value" style="color:#ff6b6b;">${skuldSaldo.toLocaleString('sv-SE')} kr</div>
                <div class="cross-desc">Kostnad: ${fmtV(skuldManad)}/${viewMode === 'year' ? 'år' : 'mån'} · Ränta: ${fmtV(skuldRanta)}/${viewMode === 'year' ? 'år' : 'mån'} · Amort: ${fmtV(skuldAmort)}/${viewMode === 'year' ? 'år' : 'mån'}</div>
      </div>
    </div>`;
  }

  if (abonnemangTotal > 0) {
    const abonnemangAr = abonnemangTotal * 12;
    html += `<div class="cross-card">
      <div class="cross-icon">📱</div>
      <div class="cross-content">
        <div class="cross-label">Abonnemang ${qIcon('abonnemang')}</div>
        <div class="cross-value">${fmtV(abonnemangTotal)}</div>
        <div class="cross-desc">Streaming + mobil + bredband + tidningar + träning · ${abonnemangAr.toLocaleString('sv-SE')} kr/år</div>
      </div>
    </div>`;
  }

  html += `</div>`;   // stäng cross-grid
  html += `</div>`;   // stäng summary-section

  // ══════════════════════════════════════════════════════════════════
  // SKULDER (egen ram, om det finns skulder)
  // ══════════════════════════════════════════════════════════════════
  if (skuldSaldo > 0) {
    html += `<div class="summary-section">`;
    html += `<div class="summary-heading">💳 SKULDER – ÖVERSIKT ${qIcon('skulder')}</div>`;
    html += `<div style="color:#666; font-size:12px; margin-bottom:8px;">Per lån: saldo, ränta och amortering.</div>`;
    html += `<table class="section-compare skulder-table"><tbody>`;
        html += `<tr style="color:#888; font-size:11.5px;">
      <td><strong>Lån</strong></td>
      <td><strong>Saldo</strong></td>
      <td><strong>${viewMode === 'year' ? 'Kostnad per år' : 'Kostnad per månad'}</strong></td>
    </tr>`;
    (state.items.skulder || []).forEach(it => {
      const t = TYPES[it.type];
      const namn = it.values.namn || t.label;
      const saldo = parseFloat(it.values.saldo) || 0;
      const ranta = parseFloat(it.values.ranta_procent) || 0;
      const amort = parseFloat(it.values.amortering) || 0;
      const manad = saldo * ranta / 100 / 12 + amort;
      html += `<tr>
        <td>${esc(namn)} <span style="color:#666; font-size:11px;">(${ranta.toFixed(2)} %)</span></td>
        <td>${saldo.toLocaleString('sv-SE')} kr</td>
        <td>${fmtV(manad)}</td>
      </tr>`;
    });
    html += `<tr class="total-row">
      <td><strong>TOTALT</strong></td>
      <td><strong>${skuldSaldo.toLocaleString('sv-SE')} kr</strong></td>
      <td><strong>${fmtV(skuldManad)}</strong></td>
    </tr>`;
    html += `</tbody></table>`;
    html += `<div class="compare-note">📌 Skuldkvot: ${skuldkvot.toFixed(0)} % av årsinkomst brutto · Ränta: ${fmtV(skuldRanta)} · Amortering: ${fmtV(skuldAmort)}</div>`;
    html += `</div>`;   // stäng summary-section
  }

  // ══════════════════════════════════════════════════════════════════
  // BARNKOSTNAD (egen ram, om det finns barn)
  // ══════════════════════════════════════════════════════════════════
  if (bk) {
    html += `<div class="summary-section">`;
    html += `<div class="summary-heading">👶 UNGEFÄRLIG BARNKOSTNAD ${qIcon('barnkostnad')}</div>`;
        html += `<div style="color:#666; font-size:12px; margin-bottom:8px;">Total kostnad inkl. andelar av gemensamma hushållskostnader (inkl. bolån).</div>`;

    const barnRows = [
      { icon:'🍽️', label:'Mat & Dryck',                     sum: bk.mat_dryck,   desc: bk.matAndelTotal > 0 ? `${bk.matAndelTotal.toFixed(0)} % av matkostnaden` : 'Ingen andel angiven' },
      { icon:'👕', label:'Kläder & Skor',                   sum: bk.klader_skor, desc: 'Direkta kostnader' },
      { icon:'🏫', label:'Förskoleavgift',                  sum: bk.forskola,    desc: 'Direkta kostnader' },
            { icon:'🏠', label:'Gemensamt hushåll & Boende',      sum: bk.gemensamt,   desc: bk.boendeAndelTotal > 0 ? `${bk.boendeAndelTotal.toFixed(0)} % av boende + bolån + förbrukning` : 'Ingen andel angiven' },
      { icon:'🧴', label:'Personlig hygien & Förbrukning',  sum: bk.hygien,      desc: 'Direkta kostnader' },
      { icon:'⚽', label:'Aktiviteter & Fritid',            sum: bk.aktiviteter, desc: 'Direkta kostnader' },
      { icon:'🎮', label:'Leksaker & Nöjen',                sum: bk.leksaker,    desc: 'Direkta kostnader' },
      { icon:'💰', label:'Vecko-/månadspeng',               sum: bk.veckopeng,   desc: 'Direkta kostnader' },
      { icon:'👶', label:'Barnvakt',                        sum: bk.barnvakt,    desc: 'Direkta kostnader' },
      { icon:'🛡️', label:'Barnförsäkring',                  sum: bk.forsakring,  desc: 'Direkta kostnader' },
      { icon:'📦', label:'Övrigt',                          sum: bk.ovrigt,      desc: 'Egna poster' },
    ];

    html += `<table class="barn-compare"><tbody>`;
    barnRows.forEach(r => {
      if (r.sum === 0 && r.desc === 'Direkta kostnader') return;
      html += `<tr>
        <td>${r.icon} ${r.label}</td>
        <td>${fmtV(r.sum)}</td>
        <td>${r.desc}</td>
      </tr>`;
    });
    html += `<tr class="total-row">
      <td>TOTALT (${bk.antal} barn)</td>
      <td>${fmtV(bk.total)}</td>
      <td>${bk.antal > 1 ? `≈ ${fmtV(bk.total / bk.antal)} per barn` : ''}</td>
    </tr>`;
    html += `</tbody></table>`;

    if (bk.antal > 1) {
      html += `<div class="per-barn-box">
        <div class="title">FÖRDELNING PER BARN</div>`;
      bk.perBarn.forEach(pb => {
        html += `<div class="per-barn-row">
          <span>👤 ${esc(pb.namn)}</span>
          <span>${fmtV(pb.total)}</span>
        </div>`;
      });
      html += `</div>`;
    }

        const perBarn = bk.total / bk.antal;
    const snittPerBarn = swedbankBarn.antal > 0 ? swedbankBarn.total / swedbankBarn.antal : 7800;
    const diff = perBarn - snittPerBarn;
    const diffText = diff > 0
      ? `⚠️ ${fmtV(diff)} över Swedbanks referens (${fmtV(snittPerBarn)}/barn)`
      : `✅ ${fmtV(Math.abs(diff))} under Swedbanks referens (${fmtV(snittPerBarn)}/barn)`;
    html += `<div class="compare-note">📌 Swedbank (2025): 1–6 år ≈ 7 300 kr/mån, 7–12 år ≈ 7 800 kr/mån, 13–18 år ≈ 9 100 kr/mån. Din kostnad per barn: <strong>${fmtV(perBarn)}</strong> – ${diffText}. <em>(Swedbanks referenssiffror är alltid per månad.)</em></div>`;
    html += `</div>`;   // stäng summary-section
  }

  // ══════════════════════════════════════════════════════════════════
  // KÄLLHÄNVISNING (har egen bakgrund via .sources-list)
  // ══════════════════════════════════════════════════════════════════
  html += `<div class="sources-list">
    <strong>📚 Källor</strong><br>
    • <a href="https://www.scb.se/hitta-statistik/statistik-efter-amne/hushallens-ekonomi/inkomster-och-inkomstfordelning/hushallens-utgifter/" target="_blank" rel="noopener">SCB – Hushållens utgifter (HUT)</a> (2024)<br>
    • <a href="https://www.scb.se/hitta-statistik/statistik-efter-amne/hushallens-ekonomi/hushallens-utgifter/hushallens-boendeutgifter/" target="_blank" rel="noopener">SCB – Boendeutgiftsprocent per hushållstyp</a> (2024)<br>
    • <a href="https://www.konsumentverket.se/globalassets/publikationer/privatekonomi/2024/konsumentverkets-berakningar-av-hushallskostnader.pdf" target="_blank" rel="noopener">Konsumentverket – Beräkningar av hushållskostnader</a> (2025)<br>
    • <a href="https://www.swedbank.se/privat/vara-kundpaket/nyckelkund/vad-kostar-det-att-leva.html" target="_blank" rel="noopener">Swedbank – Vad kostar det att leva?</a> (2025)<br>
    • <a href="https://www.swedbank.se/privat/livet/vardagsekonomi/hur-mar-din-ekonomi-vi-tipsar-om-hur-du-kan-oka-din-finansiella-halsa.html" target="_blank" rel="noopener">Swedbank – Spara 10 % av lönen</a><br>
    • 50/30/20-regeln – behov/nöjen/sparande (Dagens PS, Nordax)<br>
    • Buffertrekommendation: 3–6 månadsutgifter (Swedbank, Konsumentverket)
  </div>`;

  summaryEl.innerHTML = html;
}

function insightCard(icon, title, text, type) {
  const cls = type === 'ok' ? 'insight-ok'
            : type === 'warn' ? 'insight-warn'
            : type === 'bad' ? 'insight-bad'
            : type === 'accent' ? 'insight-accent'
            : type === 'neutral' ? 'insight-neutral'
            : type === 'calm' ? 'insight-calm'
            : 'insight-info';
  return `<div class="insight-card ${cls}">
    <div class="insight-icon">${icon}</div>
    <div class="insight-body">
      <div class="insight-title">${title}</div>
      <div class="insight-text">${text}</div>
    </div>
  </div>`;
}