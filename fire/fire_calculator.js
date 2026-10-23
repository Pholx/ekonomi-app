// ─── SÄKER UTVÄRDERING AV RÄKNEFÄLT ───
// Tillåter "100+100", "500*12", "(2000+500)*1.25" osv.
function fireEvalExpr(str) {
  if (str == null) return 0;
  let s = String(str).trim();
  if (!s) return 0;
  if (/^-?\d+([.,]\d+)?$/.test(s)) return parseFloat(s.replace(',', '.')) || 0;
  s = s.replace(/\s/g, '').replace(/(\d),(\d{3})\b/g, '$1$2').replace(',', '.');
  if (!/^[\d+\-*/().]+$/.test(s)) {
    const m = s.match(/-?\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : 0;
  }
  try {
    let pos = 0;
    const peek = () => s[pos];
    const consume = () => s[pos++];
    function parseExpr() { let l = parseTerm(); while (peek() === '+' || peek() === '-') { const op = consume(); const r = parseTerm(); l = op === '+' ? l + r : l - r; } return l; }
    function parseTerm() { let l = parseFactor(); while (peek() === '*' || peek() === '/') { const op = consume(); const r = parseFactor(); l = op === '*' ? l * r : (r !== 0 ? l / r : 0); } return l; }
    function parseFactor() { if (peek() === '(') { consume(); const v = parseExpr(); if (peek() === ')') consume(); return v; } if (peek() === '-') { consume(); return -parseFactor(); } let n = ''; while (peek() !== undefined && /[\d.]/.test(peek())) n += consume(); return parseFloat(n) || 0; }
    const r = parseExpr();
    return Number.isFinite(r) ? r : 0;
  } catch (e) { return 0; }
}

const FireCalc = {
    mcCache: null,
    lastInputsHash: null,
    updateTimeout: null,
    loanToValueCache: {},
    remainingDebtCache: {},

    _num: function(id, def) {
        const el = document.getElementById(id);
        if (!el) return def;
        const v = parseFloat(el.value);
        return Number.isNaN(v) ? def : v;
    },

    _int: function(id, def) {
        const el = document.getElementById(id);
        if (!el) return def;
        const v = parseInt(el.value, 10);
        return Number.isNaN(v) ? def : v;
    },

    _bool: function(id) {
        const el = document.getElementById(id);
        return el ? !!el.checked : false;
    },
	
	_str: function(id, def) {
		const el = document.getElementById(id);
		return el ? el.value : def;
	},

    getInputs: function() {
        return {
            iskBalance: this._num('isk-balance', 0),
            iskTax: this._num('isk-tax', 1.086),
            depaValue: this._num('depa-value', 0),
            depaCost: this._num('depa-cost', 0),
            otherAssets: this._num('other-assets', 0), // NY: Övriga tillgångar
            saveIsk: this._num('save-isk', 0),
            saveDepa: this._num('save-depa', 0),
            mortgageDebt: this._num('mortgage-debt', 0),
            interestRate: this._num('interest-rate', 0),
            amortization: this._num('amortization', 0),
            fasta: this._num('fixed-costs', 0),
            rorliga: this._num('variable-costs', 0),
            husdrift: this._num('house-upkeep', 0),
            otherCosts: this._num('other-costs', 0),
            inflation: this._num('inflation', 1.5),
            houseAppreciation: this._num('house-appreciation', 2.0),
            simYears: this._int('sim-years', 35),
            fireStartYear: this._int('fire-start-year', 15),
            includeHouse: this._bool('include-house'),
            monteCarlo: this._bool('monte-carlo'),
            amortizationRules: this._bool('amortization-rules'),
            houseValue: this._num('house-value', 0),
			withdrawalStrategy: this._str('withdrawal-strategy', 'proportional')
        };
    },

    getInputsHash: function() {
        const inputs = this.getInputs();
        let allocHash = '';
        if (typeof assetStructure !== 'undefined') {
            allocHash = assetStructure.map(a =>
                a.id + ':' + (a.allocIsk || 0) + ',' + (a.allocDepa || 0)
            ).join('|');
        }
        return JSON.stringify(inputs) + '||ALLOC:' + allocHash;
    },

    calculateWeightedReturns: function() {
        let iskReturn = 0, depaReturn = 0, iskVol = 0, depaVol = 0;
        let totalIsk = 0, totalDepa = 0;

        if (typeof assetStructure !== 'undefined') {
            assetStructure.forEach(a => {
                const allocIsk = a.allocIsk || 0;
                const allocDepa = a.allocDepa || 0;

                if (allocIsk > 0) {
                    iskReturn += allocIsk * (a.return / 100);
                    iskVol += allocIsk * (a.vol / 100);
                    totalIsk += allocIsk;
                }
                if (allocDepa > 0) {
                    depaReturn += allocDepa * (a.return / 100);
                    depaVol += allocDepa * (a.vol / 100);
                    totalDepa += allocDepa;
                }
            });
        }

        const isk = totalIsk ? (iskReturn / totalIsk) : 0;
        const depa = totalDepa ? (depaReturn / totalDepa) : 0;
        const volIsk = totalIsk ? (iskVol / totalIsk) : 0.15;
        const volDepa = totalDepa ? (depaVol / totalDepa) : 0.15;

        const geoIsk = isk - (volIsk * volIsk) / 2;
        const geoDepa = depa - (volDepa * volDepa) / 2;

        const blendIsk = (isk + geoIsk) / 2;
        const blendDepa = (depa + geoDepa) / 2;

        return {
            isk: isk,
            depa: depa,
            combined: (totalIsk + totalDepa) ? ((iskReturn + depaReturn) / (totalIsk + totalDepa)) : 0,
            volIsk: volIsk,
            volDepa: volDepa,
            geoIsk: geoIsk,
            geoDepa: geoDepa,
            blendIsk: blendIsk,
            blendDepa: blendDepa
        };
    },

    getHouseValue: function(year = 0) {
        const inputs = this.getInputs();
        const appreciationFactor = Math.pow(1 + inputs.houseAppreciation / 100, year);
        return inputs.houseValue * appreciationFactor;
    },

    getHouseEquity: function(year = 0) {
        const houseValue = this.getHouseValue(year);
        const debt = this.getRemainingDebt(year);
        return Math.max(0, houseValue - debt);
    },

    getRemainingDebt: function(year = 0) {
        if (this.remainingDebtCache && this.remainingDebtCache[year] !== undefined) {
            return this.remainingDebtCache[year];
        }

        const inputs = this.getInputs();
        let debt = inputs.mortgageDebt;

        for (let i = 0; i < year; i++) {
            let annualAmortization;
            if (inputs.amortizationRules) {
                const houseValueAtYear = this.getHouseValue(i);
                const loanToValue = houseValueAtYear > 0 ? (debt / houseValueAtYear) * 100 : 0;
                if (loanToValue > 70) annualAmortization = debt * 0.02;
                else if (loanToValue > 50) annualAmortization = debt * 0.01;
                else annualAmortization = 0;
            } else {
                annualAmortization = inputs.amortization * 12;
            }
            debt -= annualAmortization;
            debt = Math.max(0, debt);
        }

        const result = Math.max(0, debt);
        if (!this.remainingDebtCache) this.remainingDebtCache = {};
        this.remainingDebtCache[year] = result;
        return result;
    },

    getSimulationCount: function() {
        const inputs = this.getInputs();
        if (!inputs.monteCarlo) return 0;
        return inputs.amortizationRules ? 50 : 200;
    },

    getOtherDebtsInfo: function() {
        try {
            const raw = localStorage.getItem(BUDGET_STORAGE_KEY);
            if (!raw) return null;
            const payload = JSON.parse(raw);
            const items = payload && payload.items;
            if (!items) return null;

            const aktiva = [];
            const utanKostnad = [];
            (items.skulder || []).forEach(it => {
                if (it.type === 'skuld_bolan') return;
                const saldo = parseFloat(it.values.saldo) || 0;
                if (saldo <= 0) return;
                const ranta = parseFloat(it.values.ranta_procent) || 0;
                const amortering = parseFloat(it.values.amortering) || 0;
                const manad = (saldo * ranta / 100 / 12) + amortering;

                const t = (typeof TYPES !== 'undefined') && TYPES[it.type];
                const namn = (it.values.namn || '').trim();
                const label = namn || (t ? t.label : it.type);

                if (manad <= 0) utanKostnad.push({ label, saldo });
                else aktiva.push({ label, manad, typ: it.type });
            });

            if (aktiva.length === 0 && utanKostnad.length === 0) return null;

            const typer = aktiva.map(o => o.label).join(', ');
            const totalManad = aktiva.reduce((s, o) => s + o.manad, 0);
            const utanKostnadNamn = utanKostnad.map(o => o.label).join(', ');

            return {
                count: aktiva.length,
                typer,
                totalManad,
                others: aktiva,
                utanKostnad,
                utanKostnadNamn
            };
        } catch (e) {
            console.warn('[FireCalc] Kunde inte läsa Budget-skulder:', e);
            return null;
        }
    },

    getLoanToValue: function(year = 0) {
        if (this.loanToValueCache && this.loanToValueCache[year] !== undefined) {
            return this.loanToValueCache[year];
        }
        const houseValue = this.getHouseValue(year);
        const debt = this.getRemainingDebt(year);
        let result = houseValue !== 0 ? (debt / houseValue) * 100 : 0;
        if (!this.loanToValueCache) this.loanToValueCache = {};
        this.loanToValueCache[year] = result;
        return result;
    },

    calculateAmortization: function(year) {
        const inputs = this.getInputs();
        if (!inputs.amortizationRules) return inputs.amortization * 12;

        const loanToValue = this.getLoanToValue(year);
        let remainingDebt = this.getRemainingDebt(year);
        let annualAmortization = 0;

        if (loanToValue > 70) annualAmortization = remainingDebt * 0.02;
        else if (loanToValue > 50) annualAmortization = remainingDebt * 0.01;
        else annualAmortization = 0;

        return Math.round(annualAmortization / 100) * 100;
    },

    calculateRealValue: function(nominalValue, year) {
        const inputs = this.getInputs();
        return nominalValue / Math.pow(1 + inputs.inflation / 100, year);
    },

    calculateNominalValue: function(realValue, year) {
        const inputs = this.getInputs();
        return realValue * Math.pow(1 + inputs.inflation / 100, year);
    },

    calculateWithdrawalSplit: function(totalNet, iskValue, depaValue, depaCostReal, strategy) {
  const total = iskValue + depaValue;
  if (total === 0) return { iskWithdrawal: 0, depaWithdrawal: 0 };

  if (strategy === 'depa_first') {
    const depaProfitShare = depaValue > 0
      ? Math.max(0, (depaValue - (depaCostReal || 0)) / depaValue)
      : 0;
    const taxFactor = 1 - 0.30 * depaProfitShare;
    const maxDepaNet = depaValue * taxFactor;

    if (maxDepaNet >= totalNet) {
      return { iskWithdrawal: 0, depaWithdrawal: totalNet };
    }
    return {
      iskWithdrawal: totalNet - maxDepaNet,
      depaWithdrawal: maxDepaNet
    };
  }

  // Proportional (default)
  const iskShare = iskValue / total;
  const depaShare = depaValue / total;
  return {
    iskWithdrawal: totalNet * iskShare,
    depaWithdrawal: totalNet * depaShare
  };
},

    calculateAnnualLivingCostsReal: function() {
        const inputs = this.getInputs();
        const baseCosts = (inputs.fasta + inputs.rorliga + inputs.husdrift + inputs.otherCosts) * 12;
        return {
            fasta: inputs.fasta * 12,
            rorliga: inputs.rorliga * 12,
            husdrift: inputs.husdrift * 12,
            other: inputs.otherCosts * 12,
            total: baseCosts
        };
    },

    calculateTotalWithdrawalReal: function(year, iskValueReal, depaValueReal, depaCostBasisNominal) {
        const inputs = this.getInputs();
        if (year < inputs.fireStartYear) return {
            total: 0, iskWithdrawal: 0, iskTax: 0, depaWithdrawal: 0,
            depaNetWithdrawal: 0, depaTax: 0, totalNeedBeforeTax: 0,
            fasta: 0, rorliga: 0, husdrift: 0, other: 0, ranta: 0, amortering: 0,
            remainingDebt: 0
        };

        if (depaCostBasisNominal === undefined || depaCostBasisNominal === null) {
            depaCostBasisNominal = inputs.depaCost;
        }

        const livingCostsReal = this.calculateAnnualLivingCostsReal().total;
        const remainingDebt = this.getRemainingDebt(year);
        const rantaNominal = remainingDebt * (inputs.interestRate / 100);
        const amorteringNominal = this.calculateAmortization(year);

        const inflationFactor = Math.pow(1 + inputs.inflation / 100, year);
        const rantaReal = rantaNominal / inflationFactor;
        const amorteringReal = amorteringNominal / inflationFactor;

        const netNeedBeforeTaxReal = livingCostsReal + rantaReal + amorteringReal;

        const taxRate = inputs.iskTax / 100;
        const iskTaxAmountReal = iskValueReal * taxRate;

        const depaCostReal = this.calculateRealValue(depaCostBasisNominal, year);
		const split = this.calculateWithdrawalSplit(
		netNeedBeforeTaxReal, iskValueReal, depaValueReal, depaCostReal, inputs.withdrawalStrategy
		);
		const depaProfitShare = depaValueReal > 0 ? Math.max(0, (depaValueReal - depaCostReal) / depaValueReal) : 0;
        const taxFactor = 1 - (0.30 * depaProfitShare);
        const depaGrossWithdrawalReal = taxFactor > 0 ? (split.depaWithdrawal / taxFactor) : split.depaWithdrawal;
        const depaTaxReal = depaGrossWithdrawalReal - split.depaWithdrawal;

        return {
            total: split.iskWithdrawal + depaGrossWithdrawalReal + iskTaxAmountReal,
            iskWithdrawal: split.iskWithdrawal,
            iskTax: iskTaxAmountReal,
            depaWithdrawal: depaGrossWithdrawalReal,
            depaNetWithdrawal: split.depaWithdrawal,
            depaTax: depaTaxReal,
            totalNeedBeforeTax: netNeedBeforeTaxReal,
            fasta: inputs.fasta * 12,
            rorliga: inputs.rorliga * 12,
            husdrift: inputs.husdrift * 12,
            other: inputs.otherCosts * 12,
            ranta: rantaReal,
            amortering: amorteringReal,
            remainingDebt: remainingDebt
        };
    },

    calculatePortfolioValue: function(year) {
        const inputs = this.getInputs();
        const ret = this.calculateWeightedReturns();

        let iskNominal = inputs.iskBalance;
        let depaNominal = inputs.depaValue;
        let depaCostBasisNominal = inputs.depaCost;

        for (let i = 0; i < year; i++) {
            const isFire = i >= inputs.fireStartYear;
            const yearStartIsk = iskNominal;

            if (isFire) {
                const iskReal = this.calculateRealValue(yearStartIsk, i);
                const depaReal = this.calculateRealValue(depaNominal, i);
                const withdrawalReal = this.calculateTotalWithdrawalReal(i, iskReal, depaReal, depaCostBasisNominal);

                const iskWithdrawalNominal = this.calculateNominalValue(withdrawalReal.iskWithdrawal, i);
                const depaWithdrawalNominal = this.calculateNominalValue(withdrawalReal.depaWithdrawal, i);

                iskNominal = Math.max(0, iskNominal - iskWithdrawalNominal);

                if (depaWithdrawalNominal > 0 && depaNominal > 0) {
                    const profitShare = Math.min(1, Math.max(0, (depaNominal - depaCostBasisNominal) / depaNominal));
                    depaNominal = Math.max(0, depaNominal - depaWithdrawalNominal);
                    depaCostBasisNominal = Math.max(0, depaCostBasisNominal - (depaWithdrawalNominal * (1 - profitShare)));
                }
            }

            iskNominal = iskNominal * (1 + ret.blendIsk);
            depaNominal = depaNominal * (1 + ret.blendDepa);

            if (!isFire) {
                iskNominal += inputs.saveIsk * 12;
                depaNominal += inputs.saveDepa * 12;
                depaCostBasisNominal += inputs.saveDepa * 12;
            }

            iskNominal -= yearStartIsk * (inputs.iskTax / 100);
        }

        const totalReal = this.calculateRealValue(iskNominal + depaNominal, year);

        return {
            total: Math.round(totalReal),
            isk: Math.round(this.calculateRealValue(iskNominal, year)),
            depa: Math.round(this.calculateRealValue(depaNominal, year)),
            nominalTotal: Math.round(iskNominal + depaNominal),
            rawIsk: iskNominal,
            rawDepa: depaNominal,
            rawDepaCost: depaCostBasisNominal,
            iskZero: iskNominal <= 0,
            depaZero: depaNominal <= 0
        };
    },

    boxMuller: function() {
        let u = 0, v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    },

    runMonteCarloSimulation: function() {
        const inputs = this.getInputs();
        const currentHash = this.getInputsHash();

        if (this.mcCache && this.lastInputsHash === currentHash) {
            return this.mcCache;
        }

        const simulations = this.getSimulationCount();
        const ret = this.calculateWeightedReturns();

        const simTotal = Array.from({ length: simulations }, () => new Array(inputs.simYears + 1));
        const simIsk = Array.from({ length: simulations }, () => new Array(inputs.simYears + 1));
        const simDepa = Array.from({ length: simulations }, () => new Array(inputs.simYears + 1));
        const simDepaCost = Array.from({ length: simulations }, () => new Array(inputs.simYears + 1));

        for (let s = 0; s < simulations; s++) {
            let iskNominal = inputs.iskBalance;
            let depaNominal = inputs.depaValue;
            let depaCostBasisNominal = inputs.depaCost;

            simTotal[s][0] = Math.round(iskNominal + depaNominal);
            simIsk[s][0] = Math.round(iskNominal);
            simDepa[s][0] = Math.round(depaNominal);
            simDepaCost[s][0] = depaCostBasisNominal;

            for (let year = 0; year < inputs.simYears; year++) {
                const isFire = year >= inputs.fireStartYear;
                const yearStartIsk = iskNominal;

                if (isFire) {
                    const iskReal = this.calculateRealValue(yearStartIsk, year);
                    const depaReal = this.calculateRealValue(depaNominal, year);
                    const withdrawalReal = this.calculateTotalWithdrawalReal(year, iskReal, depaReal, depaCostBasisNominal);

                    const iskWithdrawalNominal = this.calculateNominalValue(withdrawalReal.iskWithdrawal, year);
                    const depaWithdrawalNominal = this.calculateNominalValue(withdrawalReal.depaWithdrawal, year);

                    iskNominal = Math.max(0, iskNominal - iskWithdrawalNominal);

                    if (depaWithdrawalNominal > 0 && depaNominal > 0) {
                        const profitShare = Math.min(1, Math.max(0, (depaNominal - depaCostBasisNominal) / depaNominal));
                        depaNominal = Math.max(0, depaNominal - depaWithdrawalNominal);
                        depaCostBasisNominal = Math.max(0, depaCostBasisNominal - (depaWithdrawalNominal * (1 - profitShare)));
                    }
                }

                const commonZ = this.boxMuller();
                const retIsk = Math.max(-0.99, ret.isk + commonZ * ret.volIsk);
                const retDepa = Math.max(-0.99, ret.depa + commonZ * ret.volDepa);

                iskNominal = iskNominal * (1 + retIsk);
                depaNominal = depaNominal * (1 + retDepa);

                if (!isFire) {
                    iskNominal += inputs.saveIsk * 12;
                    depaNominal += inputs.saveDepa * 12;
                    depaCostBasisNominal += inputs.saveDepa * 12;
                }

                iskNominal -= yearStartIsk * (inputs.iskTax / 100);

                const nextYear = year + 1;
                simTotal[s][nextYear] = Math.round(this.calculateRealValue(iskNominal + depaNominal, nextYear));
                simIsk[s][nextYear] = Math.round(this.calculateRealValue(iskNominal, nextYear));
                simDepa[s][nextYear] = Math.round(this.calculateRealValue(depaNominal, nextYear));
                simDepaCost[s][nextYear] = depaCostBasisNominal;
            }
        }

        const trimCount = Math.floor(simulations * 0.10);

        const totalResults = [];
        const iskResults = [];
        const depaResults = [];
        const depaCostResults = [];

        for (let y = 0; y <= inputs.simYears; y++) {
            const indexed = simTotal.map((row, idx) => ({ total: row[y], idx }));
            indexed.sort((a, b) => a.total - b.total);

            const kept = indexed.slice(trimCount, indexed.length - trimCount);
            const n = kept.length || 1;

            let sumTotal = 0, sumIsk = 0, sumDepa = 0, sumDepaCost = 0;
            for (const { idx } of kept) {
                sumTotal += simTotal[idx][y];
                sumIsk += simIsk[idx][y];
                sumDepa += simDepa[idx][y];
                sumDepaCost += simDepaCost[idx][y];
            }

            totalResults.push(Math.round(sumTotal / n));
            iskResults.push(Math.round(sumIsk / n));
            depaResults.push(Math.round(sumDepa / n));
            depaCostResults.push(Math.round(sumDepaCost / n));
        }

        this.mcCache = {
            total: totalResults,
            isk: iskResults,
            depa: depaResults,
            depaCost: depaCostResults
        };
        this.lastInputsHash = currentHash;
        return this.mcCache;
    },

    updatePortfolioSummary: function() {
        const inputs = this.getInputs();
        const ret = this.calculateWeightedReturns();

        const currentIsk = inputs.iskBalance;
        const currentDepa = inputs.depaValue;
        const totalPortfolio = currentIsk + currentDepa;

        let weightedBlend = 0;
        let weightedArith = 0;
        let weightedGeo = 0;
        if (totalPortfolio > 0) {
            const iskShare = currentIsk / totalPortfolio;
            const depaShare = currentDepa / totalPortfolio;
            weightedBlend = iskShare * ret.blendIsk + depaShare * ret.blendDepa;
            weightedArith = iskShare * ret.isk + depaShare * ret.depa;
            weightedGeo = iskShare * ret.geoIsk + depaShare * ret.geoDepa;
        } else {
            weightedBlend = (ret.blendIsk + ret.blendDepa) / 2;
            weightedArith = ret.combined;
            weightedGeo = (ret.geoIsk + ret.geoDepa) / 2;
        }

        const fmt = (v) => (v * 100).toFixed(1).replace('.', ',') + "%";

        const summaryElement = (id, blendValue, arithValue, geoValue) => {
            const el = document.getElementById(id);
            if (el) {
                el.innerHTML = `<strong>${fmt(blendValue)}</strong> <span style="color:#888; font-size:12px;">(arit. ${fmt(arithValue)} · geo. ${fmt(geoValue)})</span>`;
            }
        };

        summaryElement('yield-spar-isk', ret.blendIsk, ret.isk, ret.geoIsk);
        summaryElement('yield-spar-depa', ret.blendDepa, ret.depa, ret.geoDepa);
        summaryElement('yield-total-spar', weightedBlend, weightedArith, weightedGeo);

        const portfolioToday = inputs.iskBalance + inputs.depaValue;
        const houseEquity = this.getHouseEquity(0);
        const otherAssets = inputs.otherAssets || 0;
        const totalAssets = inputs.includeHouse
            ? (portfolioToday + houseEquity + otherAssets)
            : (portfolioToday + otherAssets);

        const formatCurrency = (value) => value.toLocaleString('sv-SE') + " kr";

        const portfolioEl = document.getElementById('portfolio-value');
        const houseEl = document.getElementById('house-equity');
        const otherEl = document.getElementById('other-assets-display');
        const totalEl = document.getElementById('total-assets');

        if (portfolioEl) portfolioEl.textContent = formatCurrency(portfolioToday);
        if (houseEl) houseEl.textContent = formatCurrency(houseEquity);
        if (otherEl) otherEl.textContent = otherAssets > 0 ? formatCurrency(otherAssets) : '—';
        if (totalEl) totalEl.textContent = formatCurrency(totalAssets);
		
		// ── Varning: ingen allokering angiven ──
const warningEl = document.getElementById('allocation-warning');
if (warningEl) {
    const hasAlloc = (typeof assetStructure !== 'undefined') && assetStructure.some(a => (a.allocIsk || 0) > 0 || (a.allocDepa || 0) > 0);
    const hasBalance = inputs.iskBalance > 0 || inputs.depaValue > 0;
    if (hasBalance && !hasAlloc) {
        warningEl.style.display = 'block';
        warningEl.innerHTML = `⚠️ <strong>Ingen allokering angiven.</strong> Simuleringen antar 0 % förväntad avkastning men 15 % volatilitet – vilket ger en liten negativ "straffavgift" i geometrisk avkastning. Fyll i din fördelning under fliken <strong>📊 Allokering</strong> för en realistisk simulering.`;
    } else {
        warningEl.style.display = 'none';
        warningEl.innerHTML = '';
    }
}
		
    },

    updateCashflowBox: function(mcResults = null) {
        const inputs = this.getInputs();
        const container = document.getElementById('cashflow-content');
        if (!container) return;

        const fireYear = inputs.fireStartYear;
        const inflationFactor = Math.pow(1 + inputs.inflation / 100, fireYear);

        let portAtFire;
        if (inputs.monteCarlo && mcResults) {
            portAtFire = {
                total: mcResults.total[fireYear],
                isk: mcResults.isk[fireYear],
                depa: mcResults.depa[fireYear],
                rawDepaCost: (mcResults.depaCost && mcResults.depaCost[fireYear] !== undefined)
                    ? mcResults.depaCost[fireYear]
                    : inputs.depaCost,
                iskZero: mcResults.isk[fireYear] <= 0,
                depaZero: mcResults.depa[fireYear] <= 0
            };
        } else {
            portAtFire = this.calculatePortfolioValue(fireYear);
        }

        const withdrawal = this.calculateTotalWithdrawalReal(
            fireYear,
            portAtFire.isk,
            portAtFire.depa,
            portAtFire.rawDepaCost
        );
        const livingCosts = this.calculateAnnualLivingCostsReal();

        const iskUttagInklSkatt = withdrawal.iskWithdrawal + withdrawal.iskTax;
        const depaUttagInklSkatt = withdrawal.depaWithdrawal;
        const depaCostRealAtFire = this.calculateRealValue(portAtFire.rawDepaCost, fireYear);

        const fmt = (v) => Math.round(v).toLocaleString('sv-SE');
		
		const amortWarning = (inputs.amortizationRules && inputs.houseValue === 0)
          ? `<div class="cashflow-row" style="background:#3a2a1a; padding:12px; border-radius:8px; margin-top:15px; border-left:4px solid #ffaa44; display:block;">
               <div style="color:#ffaa44; font-weight:600; margin-bottom:6px;">⚠️ Amorteringskrav kan inte beräknas</div>
               <div style="color:#ccc; font-size:13px; line-height:1.5;">
                 Du har kryssat i <strong>Svenska amorteringskrav</strong>, men husets marknadsvärde är 0 kr — belåningsgraden kan därför inte räknas ut och amorteringen blir 0 kr.
                 <br><br>
                 Fyll i marknadsvärdet under fliken <strong>🏠 Boende</strong> (eller hämta från Budget → Skulder → Bolån) för att amorteringen ska beräknas korrekt.
               </div>
             </div>`
          : '';

        const otherDebtsInfo = this.getOtherDebtsInfo();
        const harAktiva = otherDebtsInfo && otherDebtsInfo.count > 0;
        const harUtanKostnad = otherDebtsInfo && otherDebtsInfo.utanKostnad && otherDebtsInfo.utanKostnad.length > 0;

        const otherDebtsWarning = harAktiva
            ? `<div class="cashflow-row" style="background:#3a2a1a; padding:12px; border-radius:8px; margin-top:15px; border-left:4px solid #ffaa44; display:block;">
                 <div style="color:#ffaa44; font-weight:600; margin-bottom:6px;">⚠️ Andra lån räknas inte med i FIRE-uttaget</div>
                 <div style="color:#ccc; font-size:13px; line-height:1.5;">
                   Du har ${otherDebtsInfo.count === 1 ? 'ett lån' : otherDebtsInfo.count + ' lån'} i <strong>Budget → Skulder</strong> som <strong>inte påverkar FIRE-uttaget</strong>:<br>
                   <strong style="color:#ffaa44;">${otherDebtsInfo.typer}</strong>
                   — totalt ca <strong>${fmt(otherDebtsInfo.totalManad)} kr/mån</strong>.<br><br>
                   Dessa lån <strong>visas</strong> i din nettoförmögenhet (Sammanställning → nettoförmögenhetskortet), men de dras inte av i FIRE-simuleringen eftersom de inte är kopplade till bostaden.<br><br>
                   Endast <strong>bolån</strong> räknas automatiskt med (via ränta + amortering kopplat till huset).
                 </div>
               </div>`
            : '';

        const otherDebtsNoCostWarning = harUtanKostnad
            ? `<div class="cashflow-row" style="background:#3a2a1a; padding:12px; border-radius:8px; margin-top:15px; border-left:4px solid #ffaa44; display:block;">
                 <div style="color:#ffaa44; font-weight:600; margin-bottom:6px;">⚠️ Lån utan ränta och amortering</div>
                 <div style="color:#ccc; font-size:13px; line-height:1.5;">
                   ${otherDebtsInfo.utanKostnad.length === 1 ? 'Ett lån har' : otherDebtsInfo.utanKostnad.length + ' lån har'} saldo men saknar ränta och amortering i <strong>Budget → Skulder</strong>:<br>
                   <strong style="color:#ffaa44;">${otherDebtsInfo.utanKostnadNamn}</strong><br><br>
                   Deras månadskostnad räknas som 0 kr och påverkar därför varken FIRE-uttaget eller bufferttäckningen. Fyll i ränta och amortering i Budget för att få en korrekt beräkning.
                 </div>
               </div>`
            : '';

        const dual = (realValue) => {
            const nom = realValue * inflationFactor;
            return `<strong>${fmt(nom)}</strong> kr <span style="color:#888; font-size:12px;">(${fmt(realValue)} kr realt)</span>`;
        };

        const nomOnly = (realValue) => {
            const nom = realValue * inflationFactor;
            return `<strong>${fmt(nom)}</strong> kr`;
        };
		
        const headingEl = document.getElementById('cashflow-heading');
        if (headingEl) {
            const nuvarandeÅr = new Date().getFullYear();
            const kalenderÅr = nuvarandeÅr + fireYear;
            headingEl.innerHTML = `📈 Kassaflödesbehov per år under ÅR 1 i FIRE <span style="color:#888; font-size:13px; font-weight:400;">(år ${fireYear} · ca ${kalenderÅr})</span>`;
        }

        container.innerHTML = `
            <div class="cashflow-row">
                <strong>💰 LEVNADSKOSTNADER (År ${fireYear} = FIRE-start)</strong>
                <span style="color:#888; font-size:11px;">(nominellt med realt i parentes)</span>
            </div>
            <div class="cashflow-row" style="padding-left:20px;">
                <span>Fasta kostnader:</span>
                <span>${dual(livingCosts.fasta)}</span>
            </div>
            <div class="cashflow-row" style="padding-left:20px;">
                <span>Rörliga kostnader:</span>
                <span>${dual(livingCosts.rorliga)}</span>
            </div>
            <div class="cashflow-row" style="padding-left:20px;">
                <span>Övrigt:</span>
                <span>${dual(livingCosts.other)}</span>
            </div>
            <div class="cashflow-row" style="padding-left:20px;">
                <span>Husdrift:</span>
                <span>${dual(livingCosts.husdrift)}</span>
            </div>
            <div class="cashflow-row" style="padding-left:20px;">
                <span>Räntekostnad (kvarvarande lån ${fmt(withdrawal.remainingDebt)} kr):</span>
                <span>${nomOnly(withdrawal.ranta)}</span>
            </div>
                        <div class="cashflow-row" style="padding-left:20px;">
                <span>Amortering:</span>
                <span>${nomOnly(withdrawal.amortering)}</span>
            </div>
			${amortWarning}
            ${otherDebtsWarning}
            ${otherDebtsNoCostWarning}

            <div class="cashflow-row" style="margin-top:15px;"><strong>🏦 ISK PORTFÖLJ:</strong><span></span></div>
            <div class="cashflow-row" style="padding-left:20px;">
                <span>Portföljvärde vid FIRE-start:</span>
                <span><strong>${fmt(portAtFire.isk)}</strong> kr <span style="color:#888; font-size:12px;"></span></span>
            </div>
            <div class="cashflow-row" style="padding-left:20px;">
                <span>Uttag (netto ISK + skattebelastning):</span>
                <span>${nomOnly(iskUttagInklSkatt)}</span>
            </div>
            <div class="cashflow-row" style="padding-left:35px;">
                <span style="color:#888; font-size:13px;">varav årlig schablonskatt (${inputs.iskTax}%):</span>
                <span style="color:#888; font-size:13px;">${fmt(withdrawal.iskTax)}</span>
            </div>

            <div class="cashflow-row" style="margin-top:15px;"><strong>💱 DEPÅ PORTFÖLJ:</strong><span></span></div>
            <div class="cashflow-row" style="padding-left:20px;">
                <span>Portföljvärde vid FIRE-start:</span>
                <span><strong>${fmt(portAtFire.depa)}</strong> kr <span style="color:#888; font-size:12px;"></span></span>
            </div>
            <div class="cashflow-row" style="padding-left:20px;">
                <span>Inköpspris:</span>
                <span>${nomOnly(depaCostRealAtFire)}</span>
            </div>
            <div class="cashflow-row" style="padding-left:20px;">
                <span>Uttag (netto depå + skattebelastning):</span>
                <span>${nomOnly(depaUttagInklSkatt)}</span>
            </div>
            <div class="cashflow-row" style="padding-left:35px;">
                <span style="color:#888; font-size:13px;">varav utlöst vinstskatt (30%):</span>
                <span style="color:#888; font-size:13px;">${nomOnly(withdrawal.depaTax)}</span>
            </div>

            <div class="cashflow-row" style="margin-top:15px; background:#2a2a2a; padding:10px; border-radius:8px;">
                <span style="color:#ff9800; font-weight:bold;">📊 TOTALT UTTAGEBEHOV ÅR 1 I FIRE:</span>
                <span style="color:#ff9800; font-weight:bold;">${dual(withdrawal.total)}</span>
            </div>
            <div class="cashflow-row" style="color:#888; font-size:12px; margin-top:5px;">
                <span>✅ Detta täcker alla levnadskostnader, lånekostnader och skatter till 100%.</span>
            </div>
            <div class="cashflow-row" style="color:#4caf50;">
                <span>Motsvarande per månad:</span>
                <span><strong>${fmt(withdrawal.total * inflationFactor / 12)}</strong> kr/mån <span style="color:#888; font-size:12px;">(${fmt(withdrawal.total / 12)} kr/mån realt)</span></span>
            </div>
        `;
    },
	
    updateFireTableSummary: function(inputs, mcResults) {
        const el = document.getElementById('fire-table-summary');
        if (!el) return;

        const fmtKr = (n) => Math.round(n).toLocaleString('sv-SE') + ' kr';
        const fireStartYear = inputs.fireStartYear;

        if (fireStartYear > inputs.simYears) {
            el.innerHTML = `<div style="color:#888; font-size:13px;">FIRE-startåret ligger utanför simuleringsperioden.</div>`;
            return;
        }

        let portAtFire;
        if (inputs.monteCarlo && mcResults) {
            portAtFire = {
                total: mcResults.total[fireStartYear],
                isk: mcResults.isk[fireStartYear],
                depa: mcResults.depa[fireStartYear],
                rawDepaCost: (mcResults.depaCost && mcResults.depaCost[fireStartYear] !== undefined)
                    ? mcResults.depaCost[fireStartYear]
                    : inputs.depaCost
            };
        } else {
            portAtFire = this.calculatePortfolioValue(fireStartYear);
        }

        if (!portAtFire || portAtFire.total <= 0) {
            el.innerHTML = `<div style="color:#888; font-size:13px;">Ingen portfölj att ta ut ifrån — fyll i dina konton under Förmögenhet.</div>`;
            return;
        }

        const withdrawal = this.calculateTotalWithdrawalReal(
            fireStartYear,
            portAtFire.isk,
            portAtFire.depa,
            portAtFire.rawDepaCost
        );

        const annualWithdrawalReal = withdrawal.total;
        const monthlyReal = Math.round(annualWithdrawalReal / 12);
        const rate = (annualWithdrawalReal / portAtFire.total) * 100;

        const inflationFactor = Math.pow(1 + inputs.inflation / 100, fireStartYear);
        const annualWithdrawalNominal = annualWithdrawalReal * inflationFactor;
        const monthlyNominal = Math.round(annualWithdrawalNominal / 12);

        let depletedYear = null;
        for (let y = fireStartYear; y <= inputs.simYears; y++) {
            const p = (mcResults && inputs.monteCarlo)
                ? mcResults.total[y]
                : this.calculatePortfolioValue(y).total;
            if (p < 1000) { depletedYear = y; break; }
        }

        let statusColor = 'var(--success)';
        let statusText = '✅ Portföljen håller hela perioden';
        if (depletedYear !== null) {
            statusColor = '#ff6b6b';
            statusText = `⚠️ Portföljen töms år ${depletedYear}`;
        }

        el.innerHTML = `
            <div style="line-height:1.8; font-size:14px;">
                <div>Du planerar att ta ut <strong style="color:var(--accent);">${fmtKr(annualWithdrawalNominal)}/år</strong> (${fmtKr(monthlyNominal)}/mån) från och med <strong>år ${fireStartYear}</strong>.</div>
                <div style="color:#888; font-size:12px;">Motsvarar ${fmtKr(annualWithdrawalReal)}/år (${fmtKr(monthlyReal)}/mån) i dagens köpkraft.</div>
                <div>Portföljvärde vid uttagsstart: <strong>${fmtKr(portAtFire.total)}</strong> (realt).</div>
                <div>Uttagsfrekvens år ${fireStartYear}: <strong>${rate.toFixed(2).replace('.', ',')} %</strong></div>
                <div style="margin-top:8px; color:${statusColor}; font-weight:600;">${statusText}</div>
            </div>`;
    },

    formatPortfolioCell: function(port, isMonteCarlo) {
        const roundedTotal = Math.round(port.total / 100) * 100;
        const roundedIsk = Math.round(port.isk / 100) * 100;
        const roundedDepa = Math.round(port.depa / 100) * 100;

        const mcLabel = isMonteCarlo
            ? ' <span style="font-size:10px; color:#888;">(MC)</span>'
            : '';

        let iskClass = port.iskZero ? 'style="color:#ff6b6b;"' : '';
        let depaClass = port.depaZero ? 'style="color:#ff6b6b;"' : '';

        return `${roundedTotal.toLocaleString('sv-SE')} kr${mcLabel}<br>
                <span style="font-size:11px; color:#888;">
                (ISK: <span ${iskClass}>${roundedIsk.toLocaleString('sv-SE')}</span> |
                DEPÅ: <span ${depaClass}>${roundedDepa.toLocaleString('sv-SE')}</span>)
                </span>`;
    },

    formatLoanCell: function(year) {
        const remainingDebtNominal = this.getRemainingDebt(year);
        const houseValueNominal = this.getHouseValue(year);
        const loanToValue = this.getLoanToValue(year);

        let debtClass = '';
        if (loanToValue > 85) debtClass = 'style="color:#ff6b6b;"';
        else if (loanToValue > 70) debtClass = 'style="color:#ffaa44;"';
        else debtClass = 'style="color:#4caf50;"';

        return `${Math.round(remainingDebtNominal).toLocaleString('sv-SE')} kr <span style="font-size:10px; color:#888;">(nom.)</span><br>
                <span style="font-size:11px; color:#888;">
                Hus: ${Math.round(houseValueNominal).toLocaleString('sv-SE')} kr |
                LTV: <span ${debtClass}>${loanToValue.toFixed(1)}%</span>
                </span>`;
    },

    debouncedUpdate: function() {
        if (this.updateTimeout) clearTimeout(this.updateTimeout);
        this.updateTimeout = setTimeout(() => this.updateFireTable(), 300);
    },

    updateFireTable: function() {
        const mcCountSpan = document.getElementById('mc-count');
        if (mcCountSpan) {
            mcCountSpan.textContent = this.getInputs().amortizationRules ? 50 : 200;
        }
        this.loanToValueCache = {};
        this.remainingDebtCache = {};
        this.updatePortfolioSummary();

        const tbody = document.getElementById('fire-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        const inputs = this.getInputs();
        let mcResults = inputs.monteCarlo ? this.runMonteCarloSimulation() : null;

        this.updateCashflowBox(mcResults);
        this.updateFireTableSummary(inputs, mcResults);

        if (typeof Motivation !== 'undefined' && Motivation.renderAll) {
            Motivation.renderAll(mcResults);
        }

        for (let i = 0; i <= inputs.simYears; i++) {
            const detPort = this.calculatePortfolioValue(i);
            let port = mcResults ? {
                total: mcResults.total[i],
                isk: mcResults.isk[i],
                depa: mcResults.depa[i],
                iskZero: mcResults.isk[i] <= 0,
                depaZero: mcResults.depa[i] <= 0
            } : detPort;

            const depaCostBasisForYear = (mcResults && mcResults.depaCost && mcResults.depaCost[i] !== undefined)
                ? mcResults.depaCost[i]
                : detPort.rawDepaCost;

            const houseEquityReal = this.calculateRealValue(this.getHouseEquity(i), i);
            const otherAssetsReal = this.calculateRealValue(inputs.otherAssets || 0, i);
            const totalWealth = (inputs.includeHouse ? (port.total + houseEquityReal) : port.total) + otherAssetsReal;
            const isFire = i >= inputs.fireStartYear;

            const inflationFactor = Math.pow(1 + inputs.inflation / 100, i);

            let withdrawal = "-";
            let withdrawalRate = "-";
            if (isFire) {
                const withdrawalReal = this.calculateTotalWithdrawalReal(i, port.isk, port.depa, depaCostBasisForYear).total;
                withdrawal = Math.round(withdrawalReal * inflationFactor).toLocaleString('sv-SE') + " kr";

                if (port.total > 0) {
                    const rate = (withdrawalReal / port.total) * 100;
                    const rateClass = rate > 6
                        ? 'style="color:#ff6b6b; font-weight:bold;"'
                        : rate > 4.5
                            ? 'style="color:#ffaa44;"'
                            : 'style="color:#4caf50;"';
                    withdrawalRate = `<span ${rateClass}>${rate.toFixed(1).replace('.', ',')}%</span>`;
                } else {
                    withdrawalRate = '<span style="color:#ff6b6b;">—</span>';
                }
            }

            const isFireStartYear = (i === inputs.fireStartYear);
            const row = document.createElement('tr');

            if (isFireStartYear) {
                row.style.background = '#2a4a2a';
                row.style.boxShadow = 'inset 4px 0 0 #4caf50';
            }

            const portDisplay = this.formatPortfolioCell(port, inputs.monteCarlo);
            const loanDisplay = this.formatLoanCell(i);
            const yearDisplay = isFireStartYear ? `<strong>🔥 År ${i}</strong><br><span style="font-size:10px; color:#4caf50;">FIRE START</span>` : `<strong>År ${i}</strong>`;

            row.innerHTML = `
                <td>${yearDisplay}</td>
                <td><strong>${isFire ? '🔥 FIRE' : '💰 SPAR'}</strong></td>
                <td>${portDisplay}</td>
                <td>${(Math.round(totalWealth / 100) * 100).toLocaleString('sv-SE')} kr</td>
                <td>${loanDisplay}</td>
                <td>${withdrawal}</td>
                <td>${withdrawalRate}</td>
            `;
            tbody.appendChild(row);
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    if (typeof renderAssets !== 'undefined') renderAssets();

    const ids = ['isk-balance','isk-tax','depa-value','depa-cost','other-assets','save-isk','save-depa',
                 'fixed-costs','variable-costs','house-upkeep','other-costs','mortgage-debt','interest-rate',
                 'amortization','inflation','house-appreciation','sim-years','fire-start-year',
				 'include-house','monte-carlo','amortization-rules','house-value','withdrawal-strategy'];

    ids.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const isSelect = el.tagName === 'SELECT';
        const eventType = (el.type === 'checkbox' || isSelect) ? 'change' : 'input';
        el.addEventListener(eventType, () => FireCalc.debouncedUpdate());

        if (el.type !== 'checkbox' && !isSelect) {
            el.addEventListener('blur', () => {
                const v = fireEvalExpr(el.value);
                if (String(v) !== el.value) {
                    el.value = v;
                    FireCalc.debouncedUpdate();
                    if (typeof fireScheduleSave === 'function') fireScheduleSave();
                }
            });
            el.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
            });
        }
    });

    const refreshBtn = document.getElementById('refresh-btn');
    const exportBtn = document.getElementById('export-btn');
    const importBtn = document.getElementById('import-btn');
    const resetBtn = document.getElementById('reset-btn');

    if (refreshBtn) refreshBtn.addEventListener('click', forceUpdate);
    if (exportBtn) exportBtn.addEventListener('click', exportSettings);
    if (importBtn) importBtn.addEventListener('click', importSettings);
    if (resetBtn) resetBtn.addEventListener('click', fireClearState);

    setTimeout(() => FireCalc.updateFireTable(), 200);
});

function exportSettings() {
    const settings = {};
    const ids = ['isk-balance','isk-tax','depa-value','depa-cost','other-assets','save-isk','save-depa',
                 'fixed-costs','variable-costs','house-upkeep','other-costs','mortgage-debt','interest-rate',
                 'amortization','inflation','house-appreciation','sim-years','fire-start-year',
				 'include-house','monte-carlo','amortization-rules','house-value','withdrawal-strategy'];

    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) settings[id] = el.type === 'checkbox' ? el.checked : el.value;
    });

    settings.assetStructure = [];
    if (typeof assetStructure !== 'undefined') {
        assetStructure.forEach(asset => {
            settings.assetStructure.push({
                id: asset.id,
                allocIsk: asset.allocIsk,
                allocDepa: asset.allocDepa
            });
        });
    }

    settings.version = '1.3';
    settings.exportDate = new Date().toISOString();

    const jsonStr = JSON.stringify(settings, null, 2);
    const blob = new Blob([jsonStr], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fire_simulator_settings_${new Date().toISOString().slice(0,19).replace(/:/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function importSettings() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';

    input.onchange = function(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const settings = JSON.parse(e.target.result);
                const ids = ['isk-balance','isk-tax','depa-value','depa-cost','other-assets','save-isk','save-depa',
                             'fixed-costs','variable-costs','house-upkeep','other-costs','mortgage-debt','interest-rate',
                             'amortization','inflation','house-appreciation','sim-years','fire-start-year',
							 'house-value','withdrawal-strategy'];

                ids.forEach(id => {
                    const el = document.getElementById(id);
                    if (el && settings[id] !== undefined) el.value = settings[id];
                });

                const checkboxes = ['include-house', 'monte-carlo', 'amortization-rules'];
                checkboxes.forEach(id => {
                    const el = document.getElementById(id);
                    if (el && settings[id] !== undefined) el.checked = settings[id];
                });

                if (settings.assetStructure && typeof assetStructure !== 'undefined') {
                    settings.assetStructure.forEach(savedAsset => {
                        const asset = assetStructure.find(a => a.id === savedAsset.id);
                        if (asset) {
                            if (savedAsset.allocIsk !== undefined) asset.allocIsk = savedAsset.allocIsk;
                            if (savedAsset.allocDepa !== undefined) asset.allocDepa = savedAsset.allocDepa;
                        }
                    });
                    if (typeof renderAssets !== 'undefined') renderAssets();
                }

                FireCalc.mcCache = null;
                FireCalc.lastInputsHash = null;
                FireCalc.updateFireTable();
            } catch (error) {
                alert('Fel vid import av fil. Kontrollera att filen är korrekt.');
                console.error(error);
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

function resetToDefault() {
    if (confirm('Återställ alla inställningar till standardvärden?')) {
        location.reload();
    }
}

function forceUpdate() {
    FireCalc.mcCache = null;
    FireCalc.lastInputsHash = null;
    FireCalc.loanToValueCache = {};
    FireCalc.remainingDebtCache = {};
    FireCalc.updateFireTable();
}