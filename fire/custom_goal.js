// ════════════════════════════════════════════════════════════════════
// CUSTOM GOAL – fristående what-if-kalkylator
// ════════════════════════════════════════════════════════════════════
// Användaren anger:
//   • Uttag per år (i dagens köpkraft)
//   • Antal år från idag innan uttag börjar
//
// Allt annat (portfölj, allokering, skatt, inflation) ärvs från
// huvudkalkylen. Tabellen visar en deterministisk bana – Monte Carlo
// används inte här, för syftet är att testa enskilda scenarier.
// ════════════════════════════════════════════════════════════════════

const CustomGoal = {
  STORAGE_KEY: 'fire_custom_goal_v1',

  state: {
    amount: 0,       // kr/år, realt (dagens köpkraft)
    startYear: 15    // antal år från idag
  },

  init() {
    this.loadState();
    this.attachListeners();
    this.update();
  },

  loadState() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (typeof data.amount === 'number')    this.state.amount    = data.amount;
      if (typeof data.startYear === 'number') this.state.startYear = data.startYear;
    } catch (e) { /* ignorera */ }
  },

  saveState() {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) { /* ignorera */ }
  },

  attachListeners() {
    const amtEl   = document.getElementById('cg-amount');
    const startEl = document.getElementById('cg-start-year');

    if (amtEl) {
      amtEl.value = this.state.amount;
      const handler = () => {
        const v = (typeof fireEvalExpr === 'function')
          ? fireEvalExpr(amtEl.value)
          : (parseFloat(amtEl.value) || 0);
        this.state.amount = Math.max(0, v);
        this.saveState();
        this.update();
      };
      amtEl.addEventListener('input', handler);
      amtEl.addEventListener('blur', () => {
        amtEl.value = this.state.amount;
        handler();
      });
      amtEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); amtEl.blur(); }
      });
    }

    if (startEl) {
      startEl.value = this.state.startYear;
      const handler = () => {
        const v = parseInt(startEl.value, 10);
        if (!isNaN(v)) {
          const maxY = (typeof FireCalc !== 'undefined') ? FireCalc.getInputs().simYears : 35;
          this.state.startYear = Math.max(0, Math.min(maxY, v));
        }
        this.saveState();
        this.update();
      };
      startEl.addEventListener('input', handler);
      startEl.addEventListener('blur', () => {
        startEl.value = this.state.startYear;
        handler();
      });
      startEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); startEl.blur(); }
      });
    }

    // Lyssna på ändringar i huvudkalkylens fält
    const watchedIds = [
      'isk-balance','depa-value','depa-cost','isk-tax',
      'save-isk','save-depa','inflation','sim-years',
      'mortgage-debt','interest-rate','amortization','house-value',
      'house-appreciation','include-house','amortization-rules'
    ];
    watchedIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        const evt = el.type === 'checkbox' ? 'change' : 'input';
        el.addEventListener(evt, () => setTimeout(() => this.update(), 50));
      }
    });

    // Allokeringsändringar
    const allocCard = document.getElementById('allocation-card');
    if (allocCard) {
      allocCard.addEventListener('input',  () => setTimeout(() => this.update(), 50));
      allocCard.addEventListener('change', () => setTimeout(() => this.update(), 50));
    }
  },

    // ─── Kör simuleringen ───
  run() {
    const inputs = FireCalc.getInputs();
    const ret = FireCalc.calculateWeightedReturns();
    const customStartYear = this.state.startYear;
    const customAnnualReal = this.state.amount;

    let iskNominal = inputs.iskBalance;
    let depaNominal = inputs.depaValue;
    let depaCostBasisNominal = inputs.depaCost;

    const inflationFactor = (year) => Math.pow(1 + inputs.inflation / 100, year);
    const toReal = (nominal, year) => nominal / inflationFactor(year);

    const rows = [];

    // ── År 0 (start) ──
    const initialIsFire = customAnnualReal > 0 && customStartYear === 0;
    const initialWithdrawalReal = initialIsFire ? customAnnualReal : 0;
    const initialPortReal = iskNominal + depaNominal;

    rows.push({
      year: 0,
      isFire: initialIsFire,
      portReal: Math.round(initialPortReal),
      iskReal: Math.round(iskNominal),
      depaReal: Math.round(depaNominal),
      withdrawalReal: Math.round(initialWithdrawalReal),
      withdrawalNominal: Math.round(initialWithdrawalReal),
      withdrawalRate: initialPortReal > 0 ? (initialWithdrawalReal / initialPortReal) * 100 : 0,
      iskZero: iskNominal <= 0,
      depaZero: depaNominal <= 0
    });

    for (let year = 0; year < inputs.simYears; year++) {
      // Uttaget APPLICERAS här om year >= customStartYear.
      // Raden som skapas nedan är för nextYear = year + 1, och får
      // sitt uttagsvärde beräknat separat (för VISNING), så att
      // "år 15" visar uttaget som hör till år 15 – inte år 16.
      const isFire = customAnnualReal > 0 && year >= customStartYear;
      const yearStartIsk = iskNominal;
      const iskRealAtStart = toReal(iskNominal, year);
      const depaRealAtStart = toReal(depaNominal, year);
      const portRealAtStart = iskRealAtStart + depaRealAtStart;

      if (isFire && portRealAtStart > 0) {
        const iskShare = iskRealAtStart / portRealAtStart;
        const depaShare = depaRealAtStart / portRealAtStart;

        const depaCostReal = toReal(depaCostBasisNominal, year);
        const depaProfitShare = depaRealAtStart > 0
          ? Math.max(0, (depaRealAtStart - depaCostReal) / depaRealAtStart)
          : 0;
        const taxFactor = 1 - 0.30 * depaProfitShare;

        const iskWithdrawReal = customAnnualReal * iskShare;
        const depaNetReal = customAnnualReal * depaShare;
        const depaGrossReal = taxFactor > 0 ? depaNetReal / taxFactor : depaNetReal;

        const infFactor = inflationFactor(year);
        const iskWithdrawNominal = iskWithdrawReal * infFactor;
        const depaWithdrawNominal = depaGrossReal * infFactor;

        iskNominal = Math.max(0, iskNominal - iskWithdrawNominal);

        if (depaWithdrawNominal > 0 && depaNominal > 0) {
          const profitShare = Math.min(1, Math.max(0, (depaNominal - depaCostBasisNominal) / depaNominal));
          depaNominal = Math.max(0, depaNominal - depaWithdrawNominal);
          depaCostBasisNominal = Math.max(0, depaCostBasisNominal - depaWithdrawNominal * (1 - profitShare));
        }
      }

      // Growth
      iskNominal = iskNominal * (1 + ret.blendIsk);
      depaNominal = depaNominal * (1 + ret.blendDepa);

      // Savings (bara före uttagsfasen)
      if (!isFire) {
        iskNominal += inputs.saveIsk * 12;
        depaNominal += inputs.saveDepa * 12;
        depaCostBasisNominal += inputs.saveDepa * 12;
      }

      // ISK-schablonskatt
      iskNominal -= yearStartIsk * (inputs.iskTax / 100);

      const nextYear = year + 1;
      const iskRealNext = toReal(iskNominal, nextYear);
      const depaRealNext = toReal(depaNominal, nextYear);
      const portRealNext = iskRealNext + depaRealNext;

      // Uttagsvärdet för DENNA rad (year = nextYear) är för visning.
      // Själva dragningen sker i nästa loop-iteration.
      const nextIsFire = customAnnualReal > 0 && nextYear >= customStartYear;
      const nextWithdrawalReal = (nextIsFire && portRealNext > 0) ? customAnnualReal : 0;
      const nextWithdrawalNominal = nextWithdrawalReal * inflationFactor(nextYear);
      const nextRate = portRealNext > 0 ? (nextWithdrawalReal / portRealNext) * 100 : 0;

      rows.push({
        year: nextYear,
        isFire: nextIsFire,
        portReal: Math.round(portRealNext),
        iskReal: Math.round(iskRealNext),
        depaReal: Math.round(depaRealNext),
        withdrawalReal: Math.round(nextWithdrawalReal),
        withdrawalNominal: Math.round(nextWithdrawalNominal),
        withdrawalRate: nextRate,
        iskZero: iskNominal <= 0,
        depaZero: depaNominal <= 0
      });
    }

    return rows;
  },

  update() {
    this.renderSummary();
    this.renderTable();
  },

  renderSummary() {
    const el = document.getElementById('cg-summary');
    if (!el) return;

    const inputs = FireCalc.getInputs();
    const rows = this.run();
    const fmtKr = (n) => Math.round(n).toLocaleString('sv-SE') + ' kr';
    const startYear = this.state.startYear;
    const amount = this.state.amount;

    if (amount <= 0) {
      const lastRow = rows[rows.length - 1];
      const lastYear = lastRow ? lastRow.year : 0;
      el.innerHTML = `
        <div style="color:#888; font-size:13px; line-height:1.6;">
          Inget uttag angivet — tabellen visar ren tillväxt utan uttag.
          Portföljen beräknas växa till <strong style="color:var(--accent);">${fmtKr(lastRow.portReal)}</strong> (realt) om ${lastYear} år.
        </div>`;
      return;
    }

    const rowAtStart = rows[startYear];
    if (!rowAtStart) {
      el.innerHTML = `<div style="color:#ff6b6b;">Startåret ligger utanför simuleringsperioden.</div>`;
      return;
    }

    // Hitta första året portföljen töms
    let depletedYear = null;
    for (const r of rows) {
      if (r.year >= startYear && r.portReal < 1000) {
        depletedYear = r.year;
        break;
      }
    }

    const monthly = Math.round(amount / 12);

    let statusColor = 'var(--success)';
    let statusText = '✅ Portföljen håller hela perioden';
    if (depletedYear !== null) {
      statusColor = '#ff6b6b';
      statusText = `⚠️ Portföljen töms år ${depletedYear}`;
    }

    el.innerHTML = `
      <div style="line-height:1.8; font-size:14px;">
        <div>Du planerar att ta ut <strong style="color:var(--accent);">${fmtKr(amount)}/år</strong> (${fmtKr(monthly)}/mån) från och med <strong>år ${startYear}</strong>.</div>
        <div>Portföljvärde vid uttagsstart: <strong>${fmtKr(rowAtStart.portReal)}</strong> (realt).</div>
        <div>Uttagsfrekvens år ${startYear}: <strong>${rowAtStart.withdrawalRate.toFixed(1).replace('.', ',')} %</strong></div>
        <div style="margin-top:8px; color:${statusColor}; font-weight:600;">${statusText}</div>
      </div>`;
  },

  renderTable() {
    const tbody = document.getElementById('cg-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    const inputs = FireCalc.getInputs();
    const rows = this.run();

    for (const r of rows) {
      const houseEquityReal = FireCalc.calculateRealValue(FireCalc.getHouseEquity(r.year), r.year);
      const totalWealth = inputs.includeHouse ? (r.portReal + houseEquityReal) : r.portReal;

      const isStartYear = (r.year === this.state.startYear && this.state.amount > 0);

      let withdrawalDisplay = '—';
      let rateDisplay = '—';
      if (r.year > 0 && r.isFire && this.state.amount > 0) {
        withdrawalDisplay = r.withdrawalNominal.toLocaleString('sv-SE') + ' kr';
        const rate = r.withdrawalRate;
        const rateClass = rate > 6
          ? 'style="color:#ff6b6b; font-weight:bold;"'
          : rate > 4.5
            ? 'style="color:#ffaa44;"'
            : 'style="color:#4caf50;"';
        rateDisplay = `<span ${rateClass}>${rate.toFixed(1).replace('.', ',')}%</span>`;
      }

      const roundedTotal = Math.round(r.portReal / 100) * 100;
      const roundedIsk = Math.round(r.iskReal / 100) * 100;
      const roundedDepa = Math.round(r.depaReal / 100) * 100;
      const iskClass = r.iskZero ? 'style="color:#ff6b6b;"' : '';
      const depaClass = r.depaZero ? 'style="color:#ff6b6b;"' : '';
      const portDisplay = `${roundedTotal.toLocaleString('sv-SE')} kr<br>
        <span style="font-size:11px; color:#888;">
        (ISK: <span ${iskClass}>${roundedIsk.toLocaleString('sv-SE')}</span> |
        DEPÅ: <span ${depaClass}>${roundedDepa.toLocaleString('sv-SE')}</span>)
        </span>`;

      const loanDisplay = FireCalc.formatLoanCell(r.year);

      const yearDisplay = isStartYear
        ? `<strong>🔥 År ${r.year}</strong><br><span style="font-size:10px; color:#4caf50;">UTTAG START</span>`
        : `<strong>År ${r.year}</strong>`;

      const row = document.createElement('tr');
      if (isStartYear) {
        row.style.background = '#2a4a2a';
        row.style.boxShadow = 'inset 4px 0 0 #4caf50';
      }
      row.innerHTML = `
        <td>${yearDisplay}</td>
                <td><strong>${r.isFire ? '💸 Uttag' : '💰 Spar'}</strong></td>
        <td>${portDisplay}</td>
        <td>${(Math.round(totalWealth / 100) * 100).toLocaleString('sv-SE')} kr</td>
        <td>${loanDisplay}</td>
        <td>${withdrawalDisplay}</td>
        <td>${rateDisplay}</td>
      `;
      tbody.appendChild(row);
    }
  }
};

// Robust initiering — hanterar både att DOMContentLoaded redan firats
// och att den inte gjort det ännu.
function _customGoalBootstrap() {
  setTimeout(() => {
    try { CustomGoal.init(); }
    catch (e) { console.error('[CustomGoal] Init misslyckades:', e); }
  }, 300);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _customGoalBootstrap);
} else {
  _customGoalBootstrap();
}