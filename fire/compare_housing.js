// ════════════════════════════════════════════════════════════════════
// COMPARE HOUSING – Jämför ert boende med svensk statistik
// ════════════════════════════════════════════════════════════════════
// Läser ålder från Budget → Personer och jämför hushållets boende
// mot genomsnitt per ålder.
//
// Hanterar MULTIPLA vuxna: använder min/max-ålder och visar ett
// intervall istället för ett medelvärde. Exempel: en 30- och en 50-
// åring får "58–71 %" för LTV-snitt istället för "65 %".
//
// Könsuppdelning används INTE — 50/50-ägande är normen för par.
//
// ⚠️ Siffrorna i DATA är uppskattningar baserade på:
//    • SCB Hushållens boende (2025)
//    • Finansinspektionen bolånerapport (2023)
//    • Swedbank/SBAB bostadsstatistik
//
// ⚠️ Bostadsvärde- och nettomedian är för SMÅHUS, ALLA åldrar (fasta tal).
//    LTV-snitt och ägandeandel är åldersanpassade (interpolerade).
// ════════════════════════════════════════════════════════════════════

const CompareHousing = {
  BUDGET_STORAGE_KEY: BUDGET_STORAGE_KEY,

  DATA: {
    // Andel (%) som äger sitt boende per åldersgrupp — SCB 2025
    agandeAndel: {
      '18-24': 5,
      '25-34': 42,
      '35-44': 62,
      '45-54': 72,
      '55-64': 78,
      '65-74': 82,
      '75+':   80
    },
    // Genomsnittlig belåningsgrad (LTV, %) per åldersgrupp — FI 2023
    ltv: {
      '18-30': 78,
      '31-40': 68,
      '41-50': 56,
      '51-64': 40,
      '65+':   31
    },
    // Median bostadsvärde (SMÅHUS) — SCB 2026, ALLA åldrar
    medianBostadsvarde: 2950000,
    // Median nettobostadstillgång per hushåll — SCB/SBAB, ALLA åldrar
    medianNetto: 1200000,
    kalla: 'SCB Hushållens boende (2025), Finansinspektionen (2023)'
  },

  _esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  },

  _fmt(n) {
    return Math.round(n).toLocaleString('sv-SE') + ' kr';
  },

  _readBudgetState() {
    try {
      const raw = localStorage.getItem(this.BUDGET_STORAGE_KEY);
      if (!raw) return null;
      const payload = JSON.parse(raw);
      return payload && payload.items ? payload.items : null;
    } catch (e) { return null; }
  },

  // ─── Returnerar åldersintervall + två plural-flaggor ───
  // isMulti     = antal vuxna > 1     (för pronomen: "er"/"dig", "era"/"din")
  // showRange   = flera unika åldrar  (för sifferformat: "33–39" vs "40")
  _getAgeRange() {
    const items = this._readBudgetState();
    if (!items) return null;
    const vuxna = (items.personer || []).filter(it => it.type === 'person_vuxen');
    const aldrar = vuxna
      .map(p => parseInt(p.values.alder))
      .filter(a => a > 0);
    if (aldrar.length === 0) return null;

    const min = Math.min(...aldrar);
    const max = Math.max(...aldrar);
    const avg = Math.round(aldrar.reduce((s, a) => s + a, 0) / aldrar.length);
    const isMulti   = aldrar.length > 1;
    const showRange = isMulti && min !== max;

    return { min, max, avg, count: aldrar.length, isMulti, showRange };
  },

  _ageGroupScb(age) {
    if (!age || age < 18) return null;
    if (age < 25) return '18-24';
    if (age < 35) return '25-34';
    if (age < 45) return '35-44';
    if (age < 55) return '45-54';
    if (age < 65) return '55-64';
    if (age < 75) return '65-74';
    return '75+';
  },

  _ageGroupLtv(age) {
    if (!age || age < 18) return null;
    if (age <= 30) return '18-30';
    if (age <= 40) return '31-40';
    if (age <= 50) return '41-50';
    if (age <= 64) return '51-64';
    return '65+';
  },

  // Kontinuerlig ägandeandel för exakt ålder (interpolerat).
  _getAgandeAndel(age) {
    const points = buildAgePoints(this.DATA.agandeAndel, AGE_MIDPOINTS_10Y);
    return interpolateAtAge(age, points);
  },

  // Ägandeandel som intervall över en åldersrange.
  _getAgandeAndelRange(range) {
    const points = buildAgePoints(this.DATA.agandeAndel, AGE_MIDPOINTS_10Y);
    const ages = [range.min, range.max];
    points.forEach(p => {
      if (p.age > range.min && p.age < range.max) ages.push(p.age);
    });
    const values = ages.map(a => interpolateAtAge(a, points));
    return { min: Math.min(...values), max: Math.max(...values) };
  },

  // Kontinuerlig LTV-snitt per ålder.
  _getLtvForAge(age) {
    const midpoints = {
      '18-30': 24, '31-40': 35.5, '41-50': 45.5, '51-64': 57.5, '65+': 75
    };
    const points = buildAgePoints(this.DATA.ltv, midpoints);
    return interpolateAtAge(age, points);
  },

  // LTV-snitt som intervall över en åldersrange.
  _getLtvForAgeRange(range) {
    const midpoints = {
      '18-30': 24, '31-40': 35.5, '41-50': 45.5, '51-64': 57.5, '65+': 75
    };
    const points = buildAgePoints(this.DATA.ltv, midpoints);
    const ages = [range.min, range.max];
    points.forEach(p => {
      if (p.age > range.min && p.age < range.max) ages.push(p.age);
    });
    const values = ages.map(a => interpolateAtAge(a, points));
    return { min: Math.min(...values), max: Math.max(...values) };
  },

  // ─── NY: Status baserat på hela intervallet (inte medelvärdet) ───
  // Om användarens LTV ligger inom intervallet → "I linje".
  // Utanför → "Under" eller "Över". >85 % → "Över bolånetaket".
  _getLtvStatusFromRange(ltv, ltvRange) {
    if (ltv > 85) {
      return { text: 'Över bolånetaket', color: '#ff6b6b' };
    }
    if (ltv < ltvRange.min - 5) {
      return { text: 'Klart under genomsnittet', color: 'var(--success)' };
    }
    if (ltv < ltvRange.min) {
      return { text: 'Under genomsnittet', color: 'var(--success)' };
    }
    if (ltv > ltvRange.max + 5) {
      return { text: 'Över genomsnittet', color: '#ff6b6b' };
    }
    if (ltv > ltvRange.max) {
      return { text: 'Något över genomsnittet', color: '#ffaa44' };
    }
    return { text: 'I linje med genomsnittet', color: '#ffaa44' };
  },

  _calculate() {
    const inputs = FireCalc.getInputs();
    const houseValue = inputs.houseValue;
    const mortgage = inputs.mortgageDebt;
    const range = this._getAgeRange();

    // Om ingen bostad angiven → hyresgäst
    if (houseValue === 0 || houseValue <= 0) {
      return {
        status: 'hyr',
        range,
        agandeRange: range ? this._getAgandeAndelRange(range) : { min: 60, max: 60 }
      };
    }

    const ltv = houseValue > 0 ? (mortgage / houseValue) * 100 : 0;
    const netto = Math.max(0, houseValue - mortgage);

    const agandeRange = range ? this._getAgandeAndelRange(range) : { min: 60, max: 60 };
    const ltvRange = range ? this._getLtvForAgeRange(range) : { min: 60, max: 60 };

    // LTV-status jämförs mot hela intervallet (min–max)
    const ltvStatus = range ? this._getLtvStatusFromRange(ltv, ltvRange) : null;

    // Jämför mot median bostadsvärde och median netto (SMÅHUS, alla åldrar)
    const vardeStatus = houseValue >= this.DATA.medianBostadsvarde
      ? { text: 'över median', color: 'var(--success)' }
      : { text: 'under median', color: '#ffaa44' };

    const nettoStatus = netto >= this.DATA.medianNetto
      ? { text: 'över median', color: 'var(--success)' }
      : { text: 'under median', color: '#ffaa44' };

    return {
      status: 'ok',
      range,
      houseValue,
      mortgage,
      ltv,
      netto,
      agandeRange,
      ltvRange,
      ltvStatus,
      vardeStatus,
      nettoStatus
    };
  },

  _ltvBarColor(ltv) {
    if (ltv > 85) return '#ff6b6b';
    if (ltv > 70) return '#ffaa44';
    if (ltv > 50) return '#ffaa44';
    return 'var(--success)';
  },

  // Formaterar ett intervall som "55 %" eller "44–60 %"
  _formatPctRange(min, max, decimals = 0) {
    const a = min.toFixed(decimals);
    const b = max.toFixed(decimals);
    return a === b ? `${a} %` : `${a}–${b} %`;
  },

  _buildCardHtml() {
    const result = this._calculate();

    // ─── Fallback: ingen ålder ifylld ───
    if (!result.range) {
      return `
        <div class="motivation-card motivation-card-wide">
          <div class="motivation-icon">🏠</div>
          <h3>Du jämfört med svenska bostäder</h3>
          <div class="compare-hint">
            Fyll i <strong>ålder</strong> för alla vuxna under <strong>Budget → 👥 Personer</strong> för att se hur ert boende står sig mot svenska hushåll i samma ålder.
          </div>
        </div>`;
    }

    // Sifferformat (range) och pronomen (multi) styrs av olika flaggor
    const ageDisplay = result.range.showRange
      ? `${result.range.min}–${result.range.max} år`
      : `${result.range.min} år`;

    const isMulti = result.range.isMulti;

    const ageIntro = isMulti
      ? `Baserat på era åldrar (${ageDisplay})`
      : `Baserat på din ålder (${ageDisplay})`;

    const ageText = isMulti ? 'i era åldrar' : 'i din ålder';
    const digText = isMulti ? 'er' : 'dig';
	const groupLabel = isMulti ? 'era åldersgrupper' : 'din åldersgrupp';

    // ─── Fallback: hyresgäst ───
    if (result.status === 'hyr') {
      const hyrMin = 100 - result.agandeRange.max;
      const hyrMax = 100 - result.agandeRange.min;
      const hyrText = hyrMin === hyrMax
        ? `${hyrMin.toFixed(0)} %`
        : `${hyrMin.toFixed(0)}–${hyrMax.toFixed(0)} %`;
      const agText = this._formatPctRange(result.agandeRange.min, result.agandeRange.max);

      return `
        <div class="motivation-card motivation-card-wide">
          <div class="motivation-icon">🏠</div>
          <h3>Du jämfört med svenska bostäder</h3>
          <div class="compare-intro">${ageIntro}</div>
          <div class="compare-housing-grid" style="grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));">
            <div class="compare-housing-item">
              <div class="compare-housing-label">Din boendeform</div>
              <div class="compare-housing-value" style="color:#9ba3ff;">Hyresrätt</div>
              <div style="color:#888; font-size:12px; margin-top:6px;">Ingen bostadsförmögenhet registrerad</div>
            </div>
            <div class="compare-housing-item">
              <div class="compare-housing-label">I ${isMulti ? 'era åldrar' : 'din ålder'} (${ageDisplay})</div>
              <div class="compare-housing-value">${agText} äger</div>
              <div style="color:#888; font-size:12px; margin-top:6px;">${hyrText} hyr — inklusive ${digText}</div>
            </div>
          </div>
          <div class="motivation-footer">
            📌 Fyll i <strong>husets marknadsvärde</strong> under FIRE → 🏠 Boende om du äger din bostad.
            Källa: ${this.DATA.kalla}.
          </div>
        </div>`;
    }

    // ─── Fullt kort för ägare ───
    const ltvClass = result.ltvStatus ? result.ltvStatus.color : '#888';
    const ltvText = result.ltvStatus ? result.ltvStatus.text : '';
    const barColor = this._ltvBarColor(result.ltv);
    const barWidth = Math.min(100, result.ltv);

    const ltvRangeText = this._formatPctRange(result.ltvRange.min, result.ltvRange.max);
    const agText = this._formatPctRange(result.agandeRange.min, result.agandeRange.max);

    return `
      <div class="motivation-card motivation-card-wide">
        <div class="motivation-icon">🏠</div>
        <h3>Du jämfört med svenska bostäder</h3>
        <div class="compare-intro">${ageIntro}</div>

        <div class="compare-housing-grid">
          <div class="compare-housing-item">
            <div class="compare-housing-label">Bostadsvärde</div>
            <div class="compare-housing-value">${this._fmt(result.houseValue)}</div>
            <div style="color:${result.vardeStatus.color}; font-size:11.5px; margin-top:4px;">
              ${result.vardeStatus.text} (median ${this._fmt(this.DATA.medianBostadsvarde)} — småhus, alla åldrar)
            </div>
          </div>

          <div class="compare-housing-item">
            <div class="compare-housing-label">Bolån</div>
            <div class="compare-housing-value" style="color:#ff6b6b;">${this._fmt(result.mortgage)}</div>
            <div style="color:#888; font-size:11.5px; margin-top:4px;">
              Belåningsgrad ${result.ltv.toFixed(0)} %
            </div>
          </div>

          <div class="compare-housing-item">
            <div class="compare-housing-label">Nettotillgång i bostad</div>
            <div class="compare-housing-value" style="color:var(--success);">${this._fmt(result.netto)}</div>
            <div style="color:${result.nettoStatus.color}; font-size:11.5px; margin-top:4px;">
              ${result.nettoStatus.text} (median ${this._fmt(this.DATA.medianNetto)} för ägare — alla åldrar)
            </div>
          </div>
        </div>

        <div style="color:#666; font-size:11.5px; margin-bottom:12px; line-height:1.5;">
          ⚠️ Bostadsvärde- och nettomedian gäller <strong>småhus, alla åldrar</strong>. LTV-snitt och ägandeandel nedan är specifika för ${isMulti ? 'era åldrar' : 'din ålder'}.
        </div>

        <div class="compare-ltv-block">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <span style="color:#888; font-size:11px; text-transform:uppercase; letter-spacing:0.3px;">
              Belåningsgrad mot ${groupLabel}
            </span>
            <span style="color:${ltvClass}; font-size:12px; font-weight:600;">
              ${ltvText}
            </span>
          </div>
          <div class="compare-ltv-bar">
            <div class="compare-ltv-fill" style="width:${barWidth}%; background:${barColor};"></div>
          </div>
          <div style="display:flex; justify-content:space-between; font-size:11.5px; color:#888;">
            <span>Din: <strong style="color:${ltvClass};">${result.ltv.toFixed(0)} %</strong></span>
            <span>Snitt vid ${ageDisplay}: <strong>${ltvRangeText}</strong></span>
          </div>
        </div>

        <div class="compare-percentil" style="color:var(--success); background:rgba(76,175,80,0.08); border-color:rgba(76,175,80,0.2);">
          📈 ${agText} ${ageText} äger sitt boende — inklusive ${digText}
        </div>

        <div class="motivation-footer">
          📌 <strong>Bostadsvärde- och nettomedian</strong> avser <em>småhus över hela riket, alla åldrar</em> — hushåll som <strong>äger</strong> sitt boende.<br>
          📊 <strong>LTV-snitt och ägandeandel</strong> är åldersanpassade (interpolerat från SCB/FI-spann).<br>
          Belåningsgrad = bolån / marknadsvärde. Källa: ${this.DATA.kalla}.
        </div>
      </div>`;
  },

  injectCard() {
    const grid = document.querySelector('#motivation-cards .motivation-grid');
    if (!grid) return;

    const existing = grid.querySelector('.motivation-card-housing');
    if (existing) existing.remove();

    const html = this._buildCardHtml();
    const wrapped = html.replace('motivation-card-wide', 'motivation-card-wide motivation-card-housing');
    grid.insertAdjacentHTML('beforeend', wrapped);
  }
};

// ─── Patcha Motivation.renderAll så att bostadskortet också injiceras ───
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    if (typeof Motivation === 'undefined' || !Motivation.renderAll) {
      console.warn('[CompareHousing] Motivation saknas.');
      return;
    }
    if (!Motivation._housingPatched) {
      const _original = Motivation.renderAll.bind(Motivation);
      Motivation.renderAll = function(mcResults) {
        _original(mcResults);
        try { CompareHousing.injectCard(); }
        catch (e) { console.error('[CompareHousing] Injicering misslyckades:', e); }
      };
      Motivation._housingPatched = true;
    }
    setTimeout(() => CompareHousing.injectCard(), 150);
  }, 250);
});