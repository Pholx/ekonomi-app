// ════════════════════════════════════════════════════════════════════
// COMPARE NET WORTH – Jämför ert samlade nettoförmögenhet
// ════════════════════════════════════════════════════════════════════
// Summan av:
//   • ISK + Depå (från FireCalc)
//   • Bostadens marknadsvärde minus bolån (netto bostadsförmögenhet)
//
// Jämförs mot svenska hushåll i samma ålder.
//
// ⚠️ Vinstskatt på bostaden är INTE avräknad — siffran är därför en
//    aning optimistisk. SCB:s statistik räknar inte heller bort latent
//    skatt, så jämförelsen är konsistent.
//
// ⚠️ Siffrorna i DATA är uppskattningar baserade på SCB:s
//    förmögenhetsstatistik. Byt ut mot officiell data när du vill.
// ════════════════════════════════════════════════════════════════════

const CompareNetWorth = {
  BUDGET_STORAGE_KEY: BUDGET_STORAGE_KEY,

  DATA: {
    // Median nettoförmögenhet per person, kronor — SCB (2025, uppskattning)
    medianNetto: {
      '18-24': 70000,
      '25-34': 103000,
      '35-44': 242000,
      '45-54': 435000,
      '55-64': 600000,
      '65-74': 800000,
      '75+':   700000
    },
    // Genomsnitt nettoförmögenhet per person — uppskattning
    genomsnittNetto: {
      '18-24': 120000,
      '25-34': 350000,
      '35-44': 900000,
      '45-54': 1500000,
      '55-64': 2000000,
      '65-74': 2400000,
      '75+':   2200000
    },
    // Percentilgränser per person (kronor) — uppskattningar
    percentiler: {
      topp50: 293000,
      topp25: 800000,
      topp10: 2500000,
      topp5:  4500000,
      topp1:  15000000
    },
    kalla: 'SCB Förmögenhetsstatistik (2025)'
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

  _getAdults() {
    const items = this._readBudgetState();
    if (!items) return [];
    return (items.personer || []).filter(it => it.type === 'person_vuxen');
  },

  // Övriga skulder från Budget (CSN, billån, kreditkort, privatlån).
  // Bolån exkluderas — det hanteras redan via houseEquity.
  _getNonMortgageDebts: function() {
    const items = this._readBudgetState();
    if (!items) return 0;
    let total = 0;
    (items.skulder || []).forEach(it => {
      if (it.type === 'skuld_bolan') return;
      total += parseFloat(it.values.saldo) || 0;
    });
    return total;
  },

  _ageGroup(age) {
    if (!age || age < 18) return null;
    if (age < 25) return '18-24';
    if (age < 35) return '25-34';
    if (age < 45) return '35-44';
    if (age < 55) return '45-54';
    if (age < 65) return '55-64';
    if (age < 75) return '65-74';
    return '75+';
  },

  // Slår upp median/genomsnitt nettoförmögenhet för EXAKT ålder.
  _getStat(age, typ) {
    const map = this.DATA[typ];
    if (!map) return 0;
    const points = buildAgePoints(map, AGE_MIDPOINTS_10Y);
    return interpolateAtAge(age, points);
  },

  _bestamPercentil(netto, antalVuxna) {
    const p = this.DATA.percentiler;
    const n = Math.max(1, antalVuxna);
    if (netto >= p.topp1  * n) return { text: 'Topp 1 %',  color: '#ffd700' };
    if (netto >= p.topp5  * n) return { text: 'Topp 5 %',  color: '#ffd700' };
    if (netto >= p.topp10 * n) return { text: 'Topp 10 %', color: 'var(--success)' };
    if (netto >= p.topp25 * n) return { text: 'Topp 25 %', color: '#ffaa44' };
    if (netto >= p.topp50 * n) return { text: 'Topp 50 %', color: '#aaa' };
    return { text: 'Under median', color: '#888' };
  },

  // Visuell skala med alla nettoförmögenhetsspann.
  // Gränserna skalas med antal vuxna (per person × antal personer).
  _buildNetWorthScale(totalNet, antalVuxna) {
    const p = this.DATA.percentiler;
    const n = Math.max(1, antalVuxna);
    const f = (v) => Math.round(v).toLocaleString('sv-SE') + ' kr';

    const brackets = [
      { key: 'topp1',  label: 'Topp 1 %',     min: p.topp1  * n, max: null,           color: '#ffd700' },
      { key: 'topp5',  label: 'Topp 5 %',     min: p.topp5  * n, max: p.topp1  * n,   color: '#ffd700' },
      { key: 'topp10', label: 'Topp 10 %',    min: p.topp10 * n, max: p.topp5  * n,   color: 'var(--success)' },
      { key: 'topp25', label: 'Topp 25 %',    min: p.topp25 * n, max: p.topp10 * n,   color: '#ffaa44' },
      { key: 'topp50', label: 'Topp 50 %',    min: p.topp50 * n, max: p.topp25 * n,   color: '#aaa' },
      { key: 'under',  label: 'Under median', min: 0,           max: p.topp50 * n,   color: '#888' }
    ];

    let userKey = null;
    for (const b of brackets) {
      if (b.max === null && totalNet >= b.min) { userKey = b.key; break; }
      if (totalNet >= b.min && totalNet < b.max) { userKey = b.key; break; }
    }

    let rows = '';
    for (const b of brackets) {
      const isUser = userKey === b.key;
      const spanText = b.max === null
        ? `≥ ${f(b.min)}`
        : b.key === 'under'
          ? `< ${f(b.max)}`
          : `${f(b.min)} – ${f(b.max)}`;
      const badgeText = isUser ? (n > 1 ? '← ni är här' : '← du är här') : '';
      rows += `
        <div class="compare-scale-row ${isUser ? 'compare-scale-you' : ''}" style="color:${b.color};">
          <span class="compare-scale-label">${b.label}</span>
          <span class="compare-scale-span">${spanText}</span>
          <span class="compare-scale-badge">${badgeText}</span>
        </div>`;
    }

    return `
      <div class="compare-scale">
        <div class="compare-scale-title">📈 Förmögenhetsspann mot <strong>hela svenska befolkningen</strong> ${n > 1 ? `(per hushåll, ${n} pers)` : ''}</div>
        ${rows}
      </div>
      <div style="color:#666; font-size:11.5px; margin-top:6px; line-height:1.5;">
        ⚠️ Percentilgränserna gäller <strong>alla åldrar</strong> — till skillnad från median och genomsnitt ovan, som är specifika för din ålder.
      </div>`;
  },

  _calculate() {
    const inputs = FireCalc.getInputs();
    const portfolio = inputs.iskBalance + inputs.depaValue;
    const houseValue = inputs.houseValue;
    const mortgage = inputs.mortgageDebt;
    const houseEquity = Math.max(0, houseValue - mortgage);
    const otherDebts = this._getNonMortgageDebts();
    const totalNet = portfolio + houseEquity - otherDebts;

    const vuxna = this._getAdults();
    if (vuxna.length === 0) return { status: 'inga_personer' };

    const utanAlder = vuxna.filter(p => !parseInt(p.values.alder));
    if (utanAlder.length > 0) return { status: 'saknar_alder' };

    let medianSumma = 0;
    let genomsnittSumma = 0;
    const grupper = [];

    for (const p of vuxna) {
      const alder = parseInt(p.values.alder);
      const grupp = this._ageGroup(alder);       // behålls för visning
      medianSumma += this._getStat(alder, 'medianNetto');
      genomsnittSumma += this._getStat(alder, 'genomsnittNetto');
      grupper.push(grupp);
    }

    const percentil = this._bestamPercentil(totalNet, vuxna.length);

    let statusText, statusColor;
    if (totalNet >= genomsnittSumma) {
      statusText = 'Klart över både median och genomsnitt ✅';
      statusColor = 'var(--success)';
    } else if (totalNet >= medianSumma) {
      statusText = 'Över median men under genomsnitt 📊';
      statusColor = '#ffaa44';
    } else {
      statusText = 'Under medianen 📊';
      statusColor = '#ff6b6b';
    }

    return {
      status: 'ok',
      portfolio,
      houseEquity,
      houseValue,
      mortgage,
      otherDebts,
      totalNet,
      median: medianSumma,
      genomsnitt: genomsnittSumma,
      grupper: [...new Set(grupper)],
      percentil,
      statusText,
      statusColor,
      antalVuxna: vuxna.length
    };
  },

  _buildCardHtml() {
    const result = this._calculate();

    if (result.status === 'inga_personer') {
      return `
        <div class="motivation-card motivation-card-wide motivation-card-networth">
          <div class="motivation-icon">💎</div>
          <h3>Din eller er nettoförmögenhet</h3>
          <div class="compare-hint">
            Lägg till vuxna under <strong>Budget → 👥 Personer</strong> för att se hur er totala förmögenhet står sig mot svenska hushåll i samma ålder.
          </div>
        </div>`;
    }

    if (result.status === 'saknar_alder') {
      return `
        <div class="motivation-card motivation-card-wide motivation-card-networth">
          <div class="motivation-icon">💎</div>
          <h3>Din eller er nettoförmögenhet</h3>
          <div class="compare-hint">
            Fyll i <strong>ålder</strong> för alla vuxna under <strong>Budget → 👥 Personer</strong> för att se jämförelsen.
          </div>
        </div>`;
    }

    const harBostad = result.houseValue > 0;
    const bostadLabel = harBostad
      ? `Bostad (netto)`
      : `Bostad`;
    const bostadVarde = harBostad ? this._fmt(result.houseEquity) : '—';
    const bostadSub = harBostad
      ? `${this._fmt(result.houseValue)} − ${this._fmt(result.mortgage)} lån`
      : 'Ingen bostad registrerad';

    const rubrik = result.antalVuxna > 1 ? 'Er samlade nettoförmögenhet' : 'Din samlade nettoförmögenhet';
    const percentilText = result.antalVuxna > 1
      ? `Ni placerar er i ${result.percentil.text}`
      : `Du placerar dig i ${result.percentil.text}`;

    return `
      <div class="motivation-card motivation-card-wide motivation-card-networth">
        <div class="motivation-icon">💎</div>
        <h3>${rubrik}</h3>
                <div class="compare-intro">
          Jämfört med svenska hushåll i ${result.antalVuxna > 1 ? 'er' : 'din'} ålder (SCB-spann: ${result.grupper.join(', ')} år)
        </div>

        <div class="compare-percentil" style="color:${result.percentil.color};">
          🏆 ${percentilText} av Sveriges hushåll
        </div>

        <div class="compare-networth-total">
          <div class="compare-networth-total-label">Total nettoförmögenhet</div>
          <div class="compare-networth-total-value">${this._fmt(result.totalNet)}</div>
        </div>

        <div class="compare-housing-grid">
          <div class="compare-housing-item">
            <div class="compare-housing-label">💰 Börssparande</div>
            <div class="compare-housing-value" style="color:var(--accent);">${this._fmt(result.portfolio)}</div>
            <div style="color:#888; font-size:11.5px; margin-top:4px;">ISK + Depå</div>
          </div>

          ${result.otherDebts > 0 ? `
          <div class="compare-housing-item">
            <div class="compare-housing-label">💳 Övriga skulder</div>
            <div class="compare-housing-value" style="color:#ff6b6b;">−${this._fmt(result.otherDebts)}</div>
            <div style="color:#888; font-size:11.5px; margin-top:4px;">CSN, billån, kreditkort m.m.</div>
          </div>` : ''}

          <div class="compare-housing-item">
            <div class="compare-housing-label">🏠 ${bostadLabel}</div>
            <div class="compare-housing-value" style="color:var(--success);">${bostadVarde}</div>
            <div style="color:#888; font-size:11.5px; margin-top:4px;">${bostadSub}</div>
          </div>

          <div class="compare-housing-item">
            <div class="compare-housing-label">📊 Median (jämnåriga)</div>
            <div class="compare-housing-value" style="color:#aaa;">${this._fmt(result.median)}</div>
            <div style="color:#888; font-size:11.5px; margin-top:4px;">Summa för ${result.antalVuxna} ${result.antalVuxna === 1 ? 'person' : 'personer'} — i ${result.antalVuxna === 1 ? 'din' : 'er'} ålder · inkl. hyresgäster</div>
          </div>
        </div>

        <div class="compare-status" style="color:${result.statusColor};">
          ${result.statusText}
        </div>

        ${this._buildNetWorthScale(result.totalNet, result.antalVuxna)}

        <div class="motivation-footer">
          📌 Nettoförmögenhet = ISK + Depå + bostadens marknadsvärde − bolån − övriga skulder (CSN, billån, kreditkort m.m.).<br>
          📊 <strong>Median och genomsnitt</strong> är åldersanpassade (per person, skalas med antal vuxna i hushållet).<br>
          🏆 <strong>Percentilgränserna</strong> gäller <em>hela befolkningen</em> (alla åldrar) — samma trösklar oavsett ålder.<br>
          Vinstskatt på bostaden är <strong>inte</strong> avräknad (skatten är latent och beror på inköpspris).
          Källa: ${this.DATA.kalla}.
        </div>
      </div>`;
  },

  injectCard() {
    const grid = document.querySelector('#motivation-cards .motivation-grid');
    if (!grid) return;

    const existing = grid.querySelector('.motivation-card-networth');
    if (existing) existing.remove();

    grid.insertAdjacentHTML('beforeend', this._buildCardHtml());
  }
};

// ─── Patcha Motivation.renderAll ───
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    if (typeof Motivation === 'undefined' || !Motivation.renderAll) {
      console.warn('[CompareNetWorth] Motivation saknas.');
      return;
    }
    if (!Motivation._networthPatched) {
      const _original = Motivation.renderAll.bind(Motivation);
      Motivation.renderAll = function(mcResults) {
        _original(mcResults);
        try { CompareNetWorth.injectCard(); }
        catch (e) { console.error('[CompareNetWorth] Injicering misslyckades:', e); }
      };
      Motivation._networthPatched = true;
    }
    setTimeout(() => CompareNetWorth.injectCard(), 200);
  }, 250);
});