// ════════════════════════════════════════════════════════════════════
// COMPARE – Jämför ert hushåll med svensk statistik
// ════════════════════════════════════════════════════════════════════
// Läser ålder + kön från Budget → Personer och jämför hushållets
// totala börssparande mot median och genomsnitt i samma åldersgrupp.
//
// Statistiken avser ISK-sparande (aktier + fonder i ISK) — den
// vanligaste sparformen i Sverige.
//
// ⚠️ Siffrorna i DATA är uppskattningar baserade på:
//    • SCB ISK-statistik (dec 2024)
//    • Avanza (2026)
//    • Euroclear (2025)
//    Byt ut mot officiell data när du vill – strukturen är densamma.
// ════════════════════════════════════════════════════════════════════

const Compare = {
  BUDGET_STORAGE_KEY: BUDGET_STORAGE_KEY,

  // ─── Statistik per person, kronor ───
  DATA: {
    // ISK-sparande (aktier + fonder i ISK) — primär jämförelse
    isk: {
      median: {
        '18-24': { man: 12000,  kvinna: 8000   },
        '25-34': { man: 30000,  kvinna: 20000  },
        '35-44': { man: 80000,  kvinna: 50000  },
        '45-54': { man: 99000,  kvinna: 64000  },
        '55-64': { man: 150000, kvinna: 90000  },
        '65-74': { man: 215000, kvinna: 180000 },
        '75+':   { man: 220000, kvinna: 180000 }
      },
      genomsnitt: {
        '18-24': { man: 109000,  kvinna: 80000   },
        '25-34': { man: 250000,  kvinna: 200000  },
        '35-44': { man: 353000,  kvinna: 300000  },
        '45-54': { man: 500000,  kvinna: 400000  },
        '55-64': { man: 769000,  kvinna: 600000  },
        '65-74': { man: 1100000, kvinna: 900000  },
        '75+':   { man: 1200000, kvinna: 1000000 }
      }
    },

    // Percentilgränser per person (kronor) — SCB officiell data där så finns
    percentiler: {
      topp50: 90678,    // median, SCB dec 2024
      topp25: 250000,   // uppskattning
      topp10: 951000,   // SCB officiell
      topp5:  1500000,  // uppskattning
      topp1:  6000000   // SCB officiell
    },
    kalla: 'SCB ISK-statistik (dec 2024), Avanza (2026), Euroclear (2025)'
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

  // Slår upp median/genomsnitt för en EXAKT ålder via linjär interpolering.
  // kön '' eller 'annat' → medel av man- och kvinna-kurvorna.
  _getStat(age, kon, typ) {
    const map = this.DATA.isk[typ];
    if (!map) return 0;

    const toPoints = (gender) => Object.keys(map)
      .map(k => ({
        age: AGE_MIDPOINTS_10Y[k],
        value: map[k][gender]
      }))
      .filter(p => p.age !== undefined && p.value !== undefined);

    if (kon === 'man')    return interpolateAtAge(age, toPoints('man'));
    if (kon === 'kvinna') return interpolateAtAge(age, toPoints('kvinna'));

    // Okänt kön → medel av båda kurvorna
    const m = interpolateAtAge(age, toPoints('man'));
    const k = interpolateAtAge(age, toPoints('kvinna'));
    return (m + k) / 2;
  },

  // Beräknar percentil UTIFRÅN antal personer i hushållet.
  // Gränserna i DATA är per person – så vi multiplicerar med antal vuxna
  // innan vi jämför hushållets totala ISK-sparande.
  _bestamPercentil(portfolio, antalVuxna) {
    const p = this.DATA.percentiler;
    const n = Math.max(1, antalVuxna);
    const topp50 = p.topp50 * n;
    const topp25 = p.topp25 * n;
    const topp10 = p.topp10 * n;
    const topp5  = p.topp5  * n;
    const topp1  = p.topp1  * n;

    if (portfolio >= topp1)  return { text: 'Topp 1 %',  color: '#ffd700' };
    if (portfolio >= topp5)  return { text: 'Topp 5 %',  color: '#ffd700' };
    if (portfolio >= topp10) return { text: 'Topp 10 %', color: 'var(--success)' };
    if (portfolio >= topp25) return { text: 'Topp 25 %', color: '#ffaa44' };
    if (portfolio >= topp50) return { text: 'Topp 50 %', color: '#aaa' };
    return { text: 'Under median', color: '#888' };
  },

  // Bygger en visuell skala med alla percentilspann.
  // Beloppen skalas med antal vuxna (samma logik som _bestamPercentil).
  _buildPercentilScale(portfolio, antalVuxna) {
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

    // Hitta vilken bracket användaren ligger i
    let userKey = null;
    for (const b of brackets) {
      if (b.max === null && portfolio >= b.min) { userKey = b.key; break; }
      if (portfolio >= b.min && portfolio < b.max) { userKey = b.key; break; }
    }

    let rows = '';
    for (const b of brackets) {
      const isUser = userKey === b.key;
      const spanText = b.max === null
        ? `≥ ${f(b.min)}`
        : b.key === 'under'
          ? `< ${f(b.max)}`
          : `${f(b.min)} – ${f(b.max)}`;
      rows += `
        <div class="compare-scale-row ${isUser ? 'compare-scale-you' : ''}" style="color:${b.color};">
          <span class="compare-scale-label">${b.label}</span>
          <span class="compare-scale-span">${spanText}</span>
          <span class="compare-scale-badge">${isUser ? (n > 1 ? '← ni är här' : '← du är här') : ''}</span>
        </div>`;
    }

    return `
      <div class="compare-scale">
        <div class="compare-scale-title">📈 Jämförelsespann mot <strong>hela svenska befolkningen</strong> ${n > 1 ? `(per hushåll, ${n} pers)` : ''}</div>
        ${rows}
      </div>
      <div style="color:#666; font-size:11.5px; margin-top:6px; line-height:1.5;">
        ⚠️ Percentilgränserna gäller <strong>alla åldrar</strong> — till skillnad från median och genomsnitt ovan, som är specifika för din ålder och kön.
      </div>`;
  },

  _formatPerson(p) {
    const namn = (p.values.namn || '').trim();
    const alder = parseInt(p.values.alder) || null;
    const kon = p.values.kon || '';
    const konLabel = { man: 'Man', kvinna: 'Kvinna', annat: 'Annat' }[kon] || '';

    let beskrivning;
    if (konLabel && alder) beskrivning = `${konLabel} ${alder} år`;
    else if (konLabel) beskrivning = konLabel;
    else if (alder) beskrivning = `${alder} år`;
    else beskrivning = 'Ej ifyllt';

    return namn ? `${namn} (${beskrivning})` : beskrivning;
  },

  _calculate() {
    const vuxna = this._getAdults();

    if (vuxna.length === 0) {
      return { status: 'inga_personer' };
    }

    const utanAlder = vuxna.filter(p => !parseInt(p.values.alder));
    if (utanAlder.length > 0) {
      return { status: 'saknar_alder', vuxna };
    }

    let medianSumma = 0;
    let genomsnittSumma = 0;
    const perPerson = [];

    for (const p of vuxna) {
      const alder = parseInt(p.values.alder);
      const kon = p.values.kon || '';
      const grupp = this._ageGroup(alder);         // behålls för visning
      const median = this._getStat(alder, kon, 'median');
      const genomsnitt = this._getStat(alder, kon, 'genomsnitt');
      medianSumma += median;
      genomsnittSumma += genomsnitt;
      perPerson.push({
        namn: (p.values.namn || '').trim(),
        alder, kon, grupp, median, genomsnitt,
        beskrivning: this._formatPerson(p)
      });
    }

    const inputs = FireCalc.getInputs();
    const portfolio = inputs.iskBalance + inputs.depaValue;
    const antalVuxna = vuxna.length;
    const percentil = this._bestamPercentil(portfolio, antalVuxna);

    let statusText, statusColor;
    if (portfolio >= genomsnittSumma) {
      statusText = 'Klart över både median och genomsnitt ✅';
      statusColor = 'var(--success)';
    } else if (portfolio >= medianSumma) {
      statusText = 'Över median men under genomsnitt 📊';
      statusColor = '#ffaa44';
    } else {
      statusText = 'Under medianen 📊';
      statusColor = '#ff6b6b';
    }

    return {
      status: 'ok',
      vuxna,
      perPerson,
      median: medianSumma,
      genomsnitt: genomsnittSumma,
      portfolio,
      percentil,
      statusText,
      statusColor
    };
  },

  _buildCardHtml() {
    const result = this._calculate();

    if (result.status === 'inga_personer') {
      return `
        <div class="motivation-card motivation-card-wide">
          <div class="motivation-icon">📊</div>
          <h3>Du jämfört med svenska hushåll — ISK-sparande</h3>
          <div class="compare-hint">
            Lägg till vuxna under <strong>Budget → 👥 Personer</strong> för att se hur ert sparande står sig mot svenska hushåll i samma ålder.
          </div>
        </div>`;
    }

    if (result.status === 'saknar_alder') {
      return `
        <div class="motivation-card motivation-card-wide">
          <div class="motivation-icon">📊</div>
          <h3>Du jämfört med svenska hushåll — ISK-sparande</h3>
          <div class="compare-hint">
            Fyll i <strong>ålder</strong> för alla vuxna under <strong>Budget → 👥 Personer</strong> för att se jämförelsen.
            <div style="margin-top:8px; color:#666; font-size:12px;">Kön är frivilligt — om det saknas används ett snitt av manlig och kvinnlig statistik.</div>
          </div>
        </div>`;
    }

    const personList = result.perPerson.map(p => this._esc(p.beskrivning)).join(' · ');
    const grupper = [...new Set(result.perPerson.map(p => p.grupp))].join(', ');

    const isPlural = result.vuxna.length > 1;
    const rubrik = isPlural ? 'Ni' : 'Du';
    const sparandeLabel = isPlural ? 'Ert' : 'Ditt';
    const percentilText = isPlural
      ? `Ni placerar er i ${result.percentil.text}`
      : `Du placerar dig i ${result.percentil.text}`;

    return `
      <div class="motivation-card motivation-card-wide">
        <div class="motivation-icon">📊</div>
        <h3>${rubrik} jämfört med svenska hushåll — ISK-sparande</h3>
                <div class="compare-intro">
          ${personList} <span style="color:#666;">— jämfört med jämnåriga (SCB-spann: ${grupper})</span>
        </div>

        <div class="compare-percentil" style="color:${result.percentil.color};">
          🏆 ${percentilText} av Sveriges ISK-sparare
        </div>

        <div class="compare-grid">
          <div class="compare-item">
            <div class="compare-label">${sparandeLabel} sparande på börsen</div>
            <div class="compare-value big">${this._fmt(result.portfolio)}</div>
          </div>
          <div class="compare-item">
            <div class="compare-label">Median (${isPlural ? 'jämnåriga par' : 'jämnårig'})</div>
            <div class="compare-value">${this._fmt(result.median)}</div>
            <div style="color:#888; font-size:11px; margin-top:4px;">i ${isPlural ? 'er' : 'din'} ålder · inkl. de utan ISK</div>
          </div>
          <div class="compare-item">
            <div class="compare-label">Genomsnitt (${isPlural ? 'jämnåriga par' : 'jämnåriga'})</div>
            <div class="compare-value">${this._fmt(result.genomsnitt)}</div>
            <div style="color:#888; font-size:11px; margin-top:4px;">i ${isPlural ? 'er' : 'din'} ålder · dras upp av ett fåtal</div>
          </div>
        </div>

        <div class="compare-status" style="color:${result.statusColor};">
          ${result.statusText}
        </div>

        ${this._buildPercentilScale(result.portfolio, result.vuxna.length)}

        <div class="motivation-footer">
          📌 <strong>Median och genomsnitt</strong> är ålders- och könsanpassade (per person, skalas med antal vuxna i hushållet) — inkl. de utan ISK. Genomsnittet dras upp av ett fåtal mycket stora portföljer.<br>
          🏆 <strong>Percentilgränserna</strong> gäller <em>hela befolkningen</em> (alla åldrar) — samma trösklar oavsett ålder.<br>
          Källa: ${this.DATA.kalla}.
        </div>
      </div>`;
  },

  injectCard() {
    const grid = document.querySelector('#motivation-cards .motivation-grid');
    if (!grid) return;

    // Ta bort ev. tidigare wide card (vid omrendering)
    const existing = grid.querySelector('.motivation-card-wide');
    if (existing) existing.remove();

    grid.insertAdjacentHTML('beforeend', this._buildCardHtml());
  }
};

// ─── Patcha Motivation.renderAll så att vårt kort alltid injiceras efter ───
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    if (typeof Motivation === 'undefined' || !Motivation.renderAll) {
      console.warn('[Compare] Motivation saknas — kortet kan inte injiceras.');
      return;
    }
    const _original = Motivation.renderAll.bind(Motivation);
    Motivation.renderAll = function(mcResults) {
      _original(mcResults);
      try { Compare.injectCard(); }
      catch (e) { console.error('[Compare] Injicering misslyckades:', e); }
    };
    // Initial rendering om motivation redan hunnit rita
    setTimeout(() => Compare.injectCard(), 100);
  }, 250);
});