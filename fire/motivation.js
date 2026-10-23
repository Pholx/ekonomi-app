// motivation.js - Hämtar data från FireCalc och presenterar inspirerande insikter

const Motivation = {
    getInputs: function() {
        if (typeof FireCalc !== 'undefined') {
            return FireCalc.getInputs();
        }
        return {
            iskBalance: 0, depaValue: 0, depaCost: 0, mortgageDebt: 0, interestRate: 0,
            amortization: 0, houseValue: 0, fireStartYear: 15, simYears: 35,
            fasta: 0, rorliga: 0, husdrift: 0, inflation: 1.5, iskTax: 1.086
        };
    },

    // ─── Läs Budget-data för analyskort ───
_getBudgetItems: function() {
    try {
        const raw = localStorage.getItem(BUDGET_STORAGE_KEY);
            if (!raw) return null;
            const payload = JSON.parse(raw);
            return payload && payload.items ? payload.items : null;
        } catch (e) { return null; }
    },

    _getTotalBudgetDebt: function() {
        const items = this._getBudgetItems();
        if (!items) return 0;
        let total = 0;
        (items.skulder || []).forEach(it => {
            total += parseFloat(it.values.saldo) || 0;
        });
        return total;
    },

            _getAnnualGrossIncome: function() {
        const items = this._getBudgetItems();
        if (!items) return 0;
        let total = 0;
        (items.inkomster || []).forEach(it => {
            const t = (typeof TYPES !== 'undefined') && TYPES[it.type];
            if (it.type === 'lon') {
                if (it.values._netto_mode) {
                    const netto = parseFloat(it.values.netto_manual) || 0;
                    const skatt = parseFloat(it.values.skatt_procent) || 32;
                    total += skatt < 100 ? netto / (1 - skatt / 100) : netto;
                } else {
                    total += parseFloat(it.values.brutto) || 0;
                }
            } else {
                const belopp = parseFloat(it.values.belopp) || 0;
                const taxRate = (t && typeof t.taxRate === 'number') ? t.taxRate : 30;
                total += taxRate > 0 ? belopp / (1 - taxRate / 100) : belopp;
            }
        });
        return total * 12;
    },

    calculateFourPercentWithdrawal: function(portValue, depaCost, depaValue, iskValue) {
        if (portValue === 0) return 0;

        const fourPercentTotal = portValue * 0.04;
        const iskShare = iskValue / portValue;
        const depaShare = depaValue / portValue;

        const iskWithdrawal = fourPercentTotal * iskShare;
        const depaWithdrawal = fourPercentTotal * depaShare;

        let depaTax = 0;
        if (depaValue > 0 && depaWithdrawal > 0) {
            const profitShare = Math.max(0, (depaValue - depaCost) / depaValue);
            const profitAmount = depaWithdrawal * profitShare;
            depaTax = profitAmount * 0.30;
        }

        const inputs = this.getInputs();
        const iskTax = iskValue * ((inputs.iskTax || 0) / 100);

        return fourPercentTotal - depaTax - iskTax;
    },

    getCurrentInterestCost: function() {
        const inputs = this.getInputs();
        return inputs.mortgageDebt * (inputs.interestRate / 100);
    },

    getFireInterestCost: function() {
        const inputs = this.getInputs();
        const remainingDebt = FireCalc.getRemainingDebt(inputs.fireStartYear);
        return remainingDebt * (inputs.interestRate / 100);
    },

    // 8% nominell avkastning är S&P 500:s historiska snitt och används
    // medvetet som referensvärde i motivationskorten (inte den faktiska
    // viktade avkastningen för användarens allokering).
    getRealGrowth: function() {
        const inputs = this.getInputs();
        const portfolioValue = inputs.iskBalance + inputs.depaValue;
        const inflation = inputs.inflation / 100;
        const nominalReturn = 0.08;
        return portfolioValue * ((1 + nominalReturn) / (1 + inflation) - 1);
    },

    getMillionMilestones: function(mcResults = null) {
        const inputs = this.getInputs();
        const milestones = [1000000, 2000000, 3000000, 4000000, 5000000, 6000000, 7000000, 8000000, 9000000, 10000000];
        const results = [];

        let currentPortfolioValue = inputs.iskBalance + inputs.depaValue;

        for (const milestone of milestones) {
            let yearFound = null;
            let status = '';

            if (currentPortfolioValue >= milestone) {
                status = '🏆 Uppnådd redan idag!';
                yearFound = 0;
            } else {
                for (let year = 1; year <= inputs.simYears; year++) {
                    let portValue;
                    if (mcResults && inputs.monteCarlo) {
                        portValue = mcResults.total[year];
                    } else {
                        const port = FireCalc.calculatePortfolioValue(year);
                        portValue = port.total;
                    }
                    if (portValue >= milestone) {
                        yearFound = year;
                        break;
                    }
                }
            }

            results.push({ milestone, year: yearFound, status: status });
        }
        return results;
    },

    getYearForAnnualWithdrawal: function(targetAnnual, mcResults = null) {
        const inputs = this.getInputs();

        const currentPortValue = inputs.iskBalance + inputs.depaValue;
        const currentDepaCostReal = FireCalc.calculateRealValue(inputs.depaCost, 0);
        const currentAnnualWithdrawal = this.calculateFourPercentWithdrawal(
            currentPortValue, currentDepaCostReal, inputs.depaValue, inputs.iskBalance
        );

        if (currentAnnualWithdrawal >= targetAnnual) {
            return 0;
        }

        for (let year = 1; year <= inputs.simYears; year++) {
            let portValue, iskValue, depaValue, depaCostNominal;

            if (mcResults && inputs.monteCarlo) {
                portValue = mcResults.total[year];
                iskValue = mcResults.isk[year];
                depaValue = mcResults.depa[year];
                depaCostNominal = (mcResults.depaCost && mcResults.depaCost[year] !== undefined)
                    ? mcResults.depaCost[year]
                    : FireCalc.calculatePortfolioValue(year).rawDepaCost;
            } else {
                const port = FireCalc.calculatePortfolioValue(year);
                portValue = port.total;
                iskValue = port.isk;
                depaValue = port.depa;
                depaCostNominal = port.rawDepaCost;
            }

            const depaCostReal = FireCalc.calculateRealValue(depaCostNominal, year);
            const annualWithdrawal = this.calculateFourPercentWithdrawal(portValue, depaCostReal, depaValue, iskValue);

            if (annualWithdrawal >= targetAnnual) {
                return year;
            }
        }
        return null;
    },

    getCurrentAnnualReturn: function() {
        const inputs = this.getInputs();
        const portfolioValue = inputs.iskBalance + inputs.depaValue;
        return portfolioValue * 0.08;
    },

    getSnowballEffect: function() {
        const inputs = this.getInputs();
        return (inputs.iskBalance + inputs.depaValue) * 0.08;
    },

    getMonthlySnowball: function() {
        return this.getSnowballEffect() / 12;
    },

    getCoverageRatio: function(monthlyNeed) {
        const inputs = this.getInputs();
        const portfolioValue = inputs.iskBalance + inputs.depaValue;
        const depaCostReal = FireCalc.calculateRealValue(inputs.depaCost, 0);
        const annualCoverage = this.calculateFourPercentWithdrawal(
            portfolioValue, depaCostReal, inputs.depaValue, inputs.iskBalance
        );
        const monthlyCoverage = annualCoverage / 12;

        if (monthlyNeed === 0) return 0;
        return (monthlyCoverage / monthlyNeed) * 100;
    },

    getAllMotivationData: function(mcResults = null) {
        const inputs = this.getInputs();
        const portfolioValue = inputs.iskBalance + inputs.depaValue;
        const depaCostReal = FireCalc.calculateRealValue(inputs.depaCost, 0);

        const currentFourPercent = this.calculateFourPercentWithdrawal(
            portfolioValue, depaCostReal, inputs.depaValue, inputs.iskBalance
        );
        const currentFourPercentMonthly = currentFourPercent / 12;

        const annualTargets = [10000, 20000, 50000, 100000, 150000, 200000, 300000, 400000, 500000];
        const targetsWithYear = [];

        for (const target of annualTargets) {
            const year = this.getYearForAnnualWithdrawal(target, mcResults);

            let iskWithdrawal = 0;
            let depaWithdrawal = 0;
            let iskShare = 0;
            let depaShare = 0;

            if (year !== null && year <= inputs.simYears) {
                let portValue, iskValue, depaValue, depaCostNominal;
                if (mcResults && inputs.monteCarlo) {
                    portValue = mcResults.total[year];
                    iskValue = mcResults.isk[year];
                    depaValue = mcResults.depa[year];
                    depaCostNominal = (mcResults.depaCost && mcResults.depaCost[year] !== undefined)
                        ? mcResults.depaCost[year]
                        : FireCalc.calculatePortfolioValue(year).rawDepaCost;
                } else {
                    const port = FireCalc.calculatePortfolioValue(year);
                    portValue = port.total;
                    iskValue = port.isk;
                    depaValue = port.depa;
                    depaCostNominal = port.rawDepaCost;
                }

                const depaCostAtYear = FireCalc.calculateRealValue(depaCostNominal, year);

                const totalPort = iskValue + depaValue;
                if (totalPort > 0) {
                    iskShare = iskValue / totalPort;
                    depaShare = depaValue / totalPort;
                }

                const desiredIskNet = target * iskShare;
                const desiredDepaNet = target * depaShare;

                if (depaValue > 0 && desiredDepaNet > 0) {
                    const profitShare = Math.max(0, (depaValue - depaCostAtYear) / depaValue);
                    const skattFaktor = 1 - (profitShare * 0.30);
                    if (skattFaktor > 0) {
                        depaWithdrawal = desiredDepaNet / skattFaktor;
                    } else {
                        depaWithdrawal = desiredDepaNet;
                    }
                } else {
                    depaWithdrawal = desiredDepaNet;
                }

                iskWithdrawal = desiredIskNet;
            }

            targetsWithYear.push({
                target, year,
                iskWithdrawal: Math.round(iskWithdrawal),
                depaWithdrawal: Math.round(depaWithdrawal),
                iskShare: (iskShare * 100).toFixed(1),
                depaShare: (depaShare * 100).toFixed(1)
            });
        }

        const millionMilestones = this.getMillionMilestones(mcResults);

        const fireInterest = this.getFireInterestCost();
        const fireAmortization = FireCalc.calculateAmortization(inputs.fireStartYear);
                const baseMonthlyNeed = (inputs.fasta + inputs.rorliga + inputs.husdrift + inputs.otherCosts);
        const inflationFactor = Math.pow(1 + inputs.inflation / 100, inputs.fireStartYear);
        const realFireCosts = (fireInterest + fireAmortization) / inflationFactor;
        const monthlyNeed = baseMonthlyNeed + realFireCosts / 12;

        const coverageRatio = this.getCoverageRatio(monthlyNeed);
        const monthlySnowball = this.getMonthlySnowball();
        const annualSnowball = this.getSnowballEffect();

        const remainingDebtAtFire = FireCalc.getRemainingDebt(inputs.fireStartYear);
        const remainingDebtAtFireReal = remainingDebtAtFire / inflationFactor;
        const houseValueAtFire = FireCalc.getHouseValue(inputs.fireStartYear);
        const loanToValueAtFire = houseValueAtFire > 0 ? (remainingDebtAtFire / houseValueAtFire) * 100 : 0;

        const currentInterest = this.getCurrentInterestCost();
        const interestSaved = currentInterest - fireInterest;

        const realGrowth = this.getRealGrowth();
        const monthlyRealGrowth = realGrowth / 12;

                // FIRE-mål baserat på DAGENS utgifter.
        // Amorteringen hämtas via FireCalc.calculateAmortization(0) så att den
        // respekterar "Svenska amorteringskrav" när det är aktiverat.
        const todayInterest = inputs.mortgageDebt * (inputs.interestRate / 100);
        const todayAmortization = FireCalc.calculateAmortization(0);
                const todayAnnualExpenses =
            (inputs.fasta + inputs.rorliga + inputs.husdrift + inputs.otherCosts) * 12
            + todayInterest
            + todayAmortization;

        // ── Skattejusterat FIRE-mål ──
        // Vi vill att NETTO-uttaget från portföljen ska täcka dagens utgifter.
        // Skatt dras i två former:
        //   • ISK-schablonskatt: X % av hela ISK-portföljen varje år
        //   • Depå-vinstskatt: 30 % av uttagets vinstandel
        const totalPort = inputs.iskBalance + inputs.depaValue;
        const iskShare  = totalPort > 0 ? inputs.iskBalance / totalPort : 0.5;
        const depaShare = totalPort > 0 ? inputs.depaValue   / totalPort : 0.5;

        const depaProfitShare = inputs.depaValue > 0
            ? Math.max(0, (inputs.depaValue - inputs.depaCost) / inputs.depaValue)
            : 0;
        const depaEffectiveTaxRate = 0.30 * depaProfitShare;
        const iskTaxRate = (inputs.iskTax || 0) / 100;

        // Per krona portfölj, hur mycket netto kan man ta ut per år?
        const nettoRatePerKr = 0.04
            - 0.04 * depaShare * depaEffectiveTaxRate   // Depå-vinstskatt på uttag
            - iskShare * iskTaxRate;                    // ISK-schablon på hela portföljen

        const fireGoalAmount = nettoRatePerKr > 0.001
            ? Math.round(todayAnnualExpenses / nettoRatePerKr)
            : Math.round(todayAnnualExpenses / 0.04);
        const fireProgressPercent = (fireGoalAmount > 0)
            ? Math.min(100, (portfolioValue / fireGoalAmount) * 100)
            : 0;
        const fireRemaining = Math.max(0, fireGoalAmount - portfolioValue);

        // ─── Underlag för de 3 nya analyskorten ───
        const totalAssets  = portfolioValue + inputs.houseValue + (inputs.otherAssets || 0);
        const totalDebts   = this._getTotalBudgetDebt();
        const annualGross  = this._getAnnualGrossIncome();
        const dailyPassive = currentFourPercentMonthly / 30;
        const solvencyRatio = totalDebts > 0 ? (totalAssets / totalDebts) * 100 : null;
        const debtToIncome  = annualGross > 0 ? totalDebts / annualGross : null;
		
		                // ─── Coast FIRE, progress-bar, FIRE-datum ───
        // (totalPort, iskShare och depaShare är redan deklarerade ovan)
        const ret = FireCalc.calculateWeightedReturns();
        const nominellAvk = iskShare * ret.blendIsk + depaShare * ret.blendDepa;
        const realAvk = (1 + nominellAvk) / (1 + inputs.inflation / 100) - 1;

        // Coast FIRE-mål idag = FIRE-mål / (1 + real avkastning)^år kvar till FIRE
        const coastTarget = realAvk > 0
            ? fireGoalAmount / Math.pow(1 + realAvk, inputs.fireStartYear)
            : fireGoalAmount;
        const isCoast = portfolioValue >= coastTarget;

        // Om du inte är i Coast FIRE idag: när inträffar det?
// Vid år y kan du sluta spara om portföljen, utan nya insättningar,
// växer ikapp FIRE-målet innan FIRE-start:
//   portfolio(y) * (1 + realAvk)^(fireStartYear − y) ≥ fireGoalAmount
let coastYear = isCoast ? 0 : null;
if (!isCoast) {
    for (let y = 1; y <= inputs.fireStartYear; y++) {
        const p = (mcResults && inputs.monteCarlo)
            ? mcResults.total[y]
            : FireCalc.calculatePortfolioValue(y).total;
        const remaining = inputs.fireStartYear - y;
        const targetAtY = remaining > 0
            ? fireGoalAmount / Math.pow(1 + realAvk, remaining)
            : fireGoalAmount;
        if (p >= targetAtY) { coastYear = y; break; }
    }
}

        // FIRE-datum: första året portföljen når FIRE-målet
        let fireDateYear = null;
        for (let y = 0; y <= inputs.simYears; y++) {
            const p = (mcResults && inputs.monteCarlo)
                ? mcResults.total[y]
                : FireCalc.calculatePortfolioValue(y).total;
            if (p >= fireGoalAmount) { fireDateYear = y; break; }
        }

        return {
            currentFourPercent: Math.round(currentFourPercent),
            currentFourPercentMonthly: Math.round(currentFourPercentMonthly),
            annualTargets: targetsWithYear,
            millionMilestones: millionMilestones,
            monthlyNeed: monthlyNeed,
            baseMonthlyNeed: baseMonthlyNeed,
            coverageRatio: coverageRatio,
            monthlySnowball: Math.round(monthlySnowball),
            annualSnowball: Math.round(annualSnowball),
            remainingDebtAtFire: Math.round(remainingDebtAtFire),
            remainingDebtAtFireReal: Math.round(remainingDebtAtFireReal),
            loanToValueAtFire: loanToValueAtFire.toFixed(1),
            houseValueAtFire: Math.round(houseValueAtFire),
            portfolioValue: Math.round(portfolioValue),
            currentInterest: Math.round(currentInterest),
            fireInterest: Math.round(fireInterest),
            interestSaved: Math.round(interestSaved),
            realGrowth: Math.round(realGrowth),
            monthlyRealGrowth: Math.round(monthlyRealGrowth),
            fireGoalAmount: fireGoalAmount,
            fireProgressPercent: fireProgressPercent,
            fireRemaining: Math.round(fireRemaining),
            todayAnnualExpenses: Math.round(todayAnnualExpenses),
            // Nya analyskort
            totalAssets:     Math.round(totalAssets),
            totalDebts:      Math.round(totalDebts),
            annualGross:     Math.round(annualGross),
            dailyPassive:    Math.round(dailyPassive),
            solvencyRatio:   solvencyRatio,
            debtToIncome:    debtToIncome,
			coastTarget:     Math.round(coastTarget),
            isCoast:         isCoast,
            coastYear:       coastYear,
            realAvk:         realAvk,
            fireDateYear:    fireDateYear,
        };
    },

    renderAll: function(mcResults = null) {
        const data = this.getAllMotivationData(mcResults);
        const container = document.getElementById('motivation-cards');
        if (!container) return;

        const jobbfriaDagar = Math.min(30, Math.max(0,
            Math.round((data.currentFourPercentMonthly / (data.monthlyNeed || 1)) * 30)
        ));
        const dagarKlass = jobbfriaDagar >= 30 ? 'style="color:#4caf50;"' : '';

        const fireProgressKlass = data.fireProgressPercent >= 100
            ? 'style="color:#4caf50;"'
            : 'style="color:#ff9800;"';

        // ─── Bygg de tre nya analyskorten ───
        const fmtKr = (n) => Math.round(n).toLocaleString('sv-SE') + ' kr';

                // 1. Solvensgrad
        let solvencyCardHtml;
        const solvencyLevels = `
            <div style="line-height:1.7;">
                <div><span style="color:#ff6b6b; display:inline-block; min-width:56px;">&lt; 100 %</span>Negativ förmögenhet</div>
                <div><span style="color:#ffaa44; display:inline-block; min-width:56px;">= 100 %</span>Breakeven</div>
                <div><span style="color:var(--success); display:inline-block; min-width:56px;">&gt; 150 %</span>God solvens</div>
                <div><span style="color:var(--success); display:inline-block; min-width:56px;">&gt; 200 %</span>Mycket hög solvens</div>
            </div>`;
        if (data.totalDebts === 0 && data.totalAssets > 0) {
            solvencyCardHtml = `
                <div class="motivation-number" style="color:var(--success);">∞</div>
                <div class="motivation-text">Inga skulder registrerade. Dina tillgångar är <strong>${fmtKr(data.totalAssets)}</strong>.</div>
                <div class="motivation-footer">${solvencyLevels}</div>`;
        } else if (data.solvencyRatio === null) {
            solvencyCardHtml = `
                <div class="motivation-number">—</div>
                <div class="motivation-text">Fyll i skulder i Budget → Skulder för att beräkna solvensgraden.</div>
                <div class="motivation-footer">${solvencyLevels}</div>`;
        } else {
            const r = data.solvencyRatio;
            const color = r >= 150 ? 'var(--success)' : r >= 100 ? '#ffaa44' : '#ff6b6b';
            const desc = r >= 100
                ? `Dina tillgångar är <strong>${(r/100).toFixed(2).replace('.', ',')}×</strong> dina skulder.`
                : `Skulderna överstiger tillgångarna – hög ekonomisk risk.`;
            solvencyCardHtml = `
                <div class="motivation-number" style="color:${color};">${r.toFixed(0)} %</div>
                <div class="motivation-text">${desc}</div>
                <div class="motivation-footer">${solvencyLevels}</div>`;
        }

        // 2. Passiv inkomst per dag
        const lunchText = data.dailyPassive >= 200 ? 'en lyxig lunch'
                        : data.dailyPassive >= 100 ? 'en lunch'
                        : data.dailyPassive >= 30  ? 'en kaffe och bulle'
                        : 'en liten slant';
        const dailyCardHtml = `
            <div class="motivation-number">${data.dailyPassive.toLocaleString('sv-SE')} <span style="font-size:18px;">kr/dag</span></div>
            <div class="motivation-text">Samma 4%-regel, bara nedbruten per dag. Portföljen betalar ungefär <strong>${lunchText}</strong> – varje dag, utan att du gör något.</div>
            <div class="motivation-footer">🔒 Efter ISK-schablonskatt och depåns 30 % vinstskatt</div>`;

                // 3. Skuldkvot
        let debtRatioCardHtml;
        const debtRatioLevels = `
            <div style="line-height:1.7;">
                <div><span style="color:var(--success); display:inline-block; min-width:64px;">Under 3,0</span>God marginal</div>
                <div><span style="color:#ffaa44; display:inline-block; min-width:64px;">4,5</span>Klassisk brytpunkt</div>
                <div><span style="color:#ff6b6b; display:inline-block; min-width:64px;">5,5–6,0</span>Bankernas maxtak</div>
            </div>`;
        if (data.debtToIncome === null) {
            debtRatioCardHtml = `
                <div class="motivation-number">—</div>
                <div class="motivation-text">Fyll i lön under Budget → Inkomster för att beräkna skuldkvoten.</div>
                <div class="motivation-footer">${debtRatioLevels}</div>`;
        } else {
            const q = data.debtToIncome;
            const color = q < 3 ? 'var(--success)' : q < 5.5 ? '#ffaa44' : '#ff6b6b';
                        const desc = `Dina skulder (${fmtKr(data.totalDebts)}) motsvarar din beräknade bruttoårsinkomst (${fmtKr(data.annualGross)}).`;
            debtRatioCardHtml = `
                <div class="motivation-number" style="color:${color};">${q.toFixed(1).replace('.', ',')}×</div>
                <div class="motivation-text">${desc}</div>
                <div class="motivation-footer">${debtRatioLevels}</div>`;
        }

        let html = `
            <div class="motivation-grid">
                <div class="motivation-card">
                    <div class="motivation-icon">💰</div>
                    <h3>Passiv maskin <span style="font-size:12px; color:#888;">(4%-regeln, efter skatt)</span></h3>
                    <div class="motivation-number">${data.currentFourPercentMonthly.toLocaleString('sv-SE')} <span style="font-size:18px;">kr/mån</span></div>
                    <div class="motivation-text">Enligt <strong>4%-regeln</strong> genererar din portfölj redan <strong>${data.currentFourPercentMonthly.toLocaleString('sv-SE')} kr/mån</strong> i hållbar passiv inkomst (efter ISK- och depåskatt). Pengar som jobbar medan du sover!</div>
                    <div class="motivation-footer">🔒 Beloppet är efter ISK-schablonskatt och depåns 30% vinstskatt</div>
                </div>

                <div class="motivation-card">
                    <div class="motivation-icon">☀️</div>
                    <h3>Passiv inkomst per dag <span style="font-size:12px; color:#888;">(4%-regeln)</span></h3>
                    ${dailyCardHtml}
                </div>

                                <div class="motivation-card">
                    <div class="motivation-icon">⛄</div>
                    <h3>Snöbollseffekten</h3>
                    <div class="motivation-number">${data.monthlySnowball.toLocaleString('sv-SE')} <span style="font-size:18px;">kr/mån</span></div>
                    <div class="motivation-text">Din portfölj växer automatiskt med <strong>${data.monthlySnowball.toLocaleString('sv-SE')} kr/månad</strong> (vid 8% avkastning – S&P 500 historiska snitt). Detta är vid sidan av ditt eget sparande!</div>
                    <div class="motivation-footer">📈 Årligen: ${data.annualSnowball.toLocaleString('sv-SE')} kr/år</div>
                </div>

                <div class="motivation-card">
                    <div class="motivation-icon">🎯</div>
                    <h3>Täckningsgrad <span style="font-size:12px; color:#888;">(4%-regeln)</span></h3>
                    <div class="motivation-number">${data.coverageRatio.toFixed(1)}<span style="font-size:18px;">%</span></div>
                    <div class="motivation-text">Enligt <strong>4%-regeln</strong> ger din portfölj i dagsläget <strong>${data.currentFourPercentMonthly.toLocaleString('sv-SE')} kr/mån</strong> i hållbart uttag – det täcker <strong>${data.coverageRatio.toFixed(1)}%</strong> av ditt månadsbehov (${Math.round(data.monthlyNeed).toLocaleString('sv-SE')} kr/mån inkl. bolån).</div>
                    <div class="motivation-footer">🎯 Mål: 100% = FIRE enligt 4%-regeln</div>
                </div>

                <div class="motivation-card">
                    <div class="motivation-icon">🏛️</div>
                    <h3>Solvensgrad</h3>
                    ${solvencyCardHtml}
                </div>

                <div class="motivation-card">
                    <div class="motivation-icon">⚖️</div>
                    <h3>Skuldkvot <span style="font-size:12px; color:#888;">(av bruttoinkomst)</span></h3>
                    ${debtRatioCardHtml}
                </div>

                                <div class="motivation-card">
                    <div class="motivation-icon">🏠</div>
                    <h3>Skuldfrihet vid FIRE</h3>
                    <div class="motivation-number">${data.remainingDebtAtFire.toLocaleString('sv-SE')} <span style="font-size:18px;">kr</span></div>
                    <div class="motivation-text">Vid FIRE-start (år ${FireCalc?.getInputs().fireStartYear}) återstår <strong>${data.remainingDebtAtFireReal.toLocaleString('sv-SE')} kr</strong> realt / <strong>${data.remainingDebtAtFire.toLocaleString('sv-SE')} kr</strong> nominellt i bolån. Belåningsgrad: ${data.loanToValueAtFire}%</div>
                    <div class="motivation-footer">🏦 Lägre lån = lägre månadskostnad = kortare väg till FIRE</div>
                </div>

                <div class="motivation-card">
                    <div class="motivation-icon">📉</div>
                    <h3>Räntebesparingen</h3>
                    <div class="motivation-number">${data.interestSaved.toLocaleString('sv-SE')} <span style="font-size:18px;">kr/år</span></div>
                    <div class="motivation-text">Genom amortering sparar du <strong>${data.interestSaved.toLocaleString('sv-SE')} kr/år</strong> i räntekostnader vid FIRE jämfört med idag. Det är ${Math.round(data.interestSaved / 12).toLocaleString('sv-SE')} kr mindre i månaden du behöver ta ut!</div>
                    <div class="motivation-footer">💰 Ränta idag: ${data.currentInterest.toLocaleString('sv-SE')} kr/år → vid FIRE: ${data.fireInterest.toLocaleString('sv-SE')} kr/år</div>
                </div>

                <div class="motivation-card">
                    <div class="motivation-icon">🛡️</div>
                    <h3>Inflationsskyddet</h3>
                    <div class="motivation-number">${data.monthlyRealGrowth.toLocaleString('sv-SE')} <span style="font-size:18px;">kr/mån</span></div>
                    <div class="motivation-text">Efter inflation växer din portfölj reellt med <strong>${data.monthlyRealGrowth.toLocaleString('sv-SE')} kr/månad</strong> (vid 8% nominell avkastning, ${FireCalc?.getInputs().inflation}% inflation). Dina pengar behåller köpkraften!</div>
                    <div class="motivation-footer">📊 Reell årlig tillväxt: ${data.realGrowth.toLocaleString('sv-SE')} kr/år</div>
                </div>

                <div class="motivation-card">
                    <div class="motivation-icon">🏖️</div>
                    <h3>Jobbfria dagar <span style="font-size:12px; color:#888;">(4%-regeln)</span></h3>
                    <div class="motivation-number" ${dagarKlass}>${jobbfriaDagar} <span style="font-size:18px;">dagar/mån</span></div>
                    <div class="motivation-text">Enligt <strong>4%-regeln</strong> betalar din portfölj redan för <strong>${jobbfriaDagar} dagar</strong> av dina månatliga utgifter. ${jobbfriaDagar >= 30 ? 'Du är redan fri!' : 'Resten får du jobba för.'}</div>
                    <div class="motivation-footer">🎯 Mål: 30 dagar = helt fri enligt 4%-regeln</div>
                </div>

                <div class="motivation-card">
                    <div class="motivation-icon">⚡</div>
                    <h3>Kritisk massa</h3>
                    <div class="motivation-number">${Math.round(data.annualSnowball).toLocaleString('sv-SE')} <span style="font-size:18px;">kr/år</span></div>
                    <div class="motivation-text">Din portfölj växer med <strong>${Math.round(data.annualSnowball).toLocaleString('sv-SE')} kr/år</strong> (vid 8% avkastning). Det är ${Math.round((data.annualSnowball / (data.monthlyNeed * 12 || 1)) * 100)}% av dina årliga utgifter!</div>
                    <div class="motivation-footer">📈 Portföljen jobbar hårdare än dig</div>
                </div>

                                <div class="motivation-card">
                    <div class="motivation-icon">🎯</div>
                    <h3>FIRE-mål <span style="font-size:12px; color:#888;">(dagens utgifter, 4%-regeln, inkl. skatt)</span></h3>
                    <div class="motivation-number" ${fireProgressKlass}>${data.fireGoalAmount.toLocaleString('sv-SE')} <span style="font-size:18px;">kr</span></div>
                    <div class="motivation-text">Med dina nuvarande utgifter på <strong>${data.todayAnnualExpenses.toLocaleString('sv-SE')} kr/år</strong> hade du behövt en portfölj på <strong>${data.fireGoalAmount.toLocaleString('sv-SE')} kr</strong> för att 4%-regeln ska täcka dem <em>efter skatt</em>. Du har <strong>${data.portfolioValue.toLocaleString('sv-SE')} kr</strong> idag – <strong>${data.fireRemaining.toLocaleString('sv-SE')} kr</strong> kvar (<strong>${data.fireProgressPercent.toFixed(1)}%</strong> av målet).</div>
                    <div class="motivation-footer">🏁 ${data.fireProgressPercent >= 100 ? 'Målet uppnått!' : 'Baserat på dagens utgifter – inkl. ISK-schablonskatt och depåns vinstskatt'}</div>
                </div>
				
				<div class="motivation-card">
                    <div class="motivation-icon">🌊</div>
                    <h3>Coast FIRE</h3>
                    ${(() => {
                        if (data.fireGoalAmount === 0) {
                            return `
                                <div class="motivation-number">—</div>
                                <div class="motivation-text">Fyll i dina utgifter för att beräkna Coast FIRE-målet.</div>
                                <div class="motivation-footer">Kräver data i Kostnader</div>`;
                        }
                        const realPct = (data.realAvk * 100).toFixed(1).replace('.', ',');
                        if (data.isCoast) {
                            const överskott = data.portfolioValue - data.coastTarget;
                            return `
                                <div class="motivation-number" style="color:var(--success);">🏆 Uppnådd</div>
                                <div class="motivation-text">Du kan <strong>sluta spara idag</strong> och ändå nå FIRE-målet (${fmtKr(data.fireGoalAmount)}) om ${FireCalc?.getInputs().fireStartYear}år. Ränta-på-ränta gör jobbet åt dig.<br><br>
                                <strong>${fmtKr(data.coastTarget)}</strong> krävdes, du har <strong>${fmtKr(överskott)}</strong> över målet.</div>
                                <div class="motivation-footer">🌊 Real avkastning: ${realPct} %/år · Kräver nysparande 0 kr</div>`;
                        }
                        if (data.coastYear === null) {
    return `
        <div class="motivation-number" style="color:#ffaa44;">—</div>
        <div class="motivation-text">Du når inte Coast FIRE före FIRE-start år ${FireCalc?.getInputs().fireStartYear} med nuvarande sparande. Öka sparandet eller sänk FIRE-målet.<br><br>
        Coast-målet idag är <strong>${fmtKr(data.coastTarget)}</strong> — du har <strong>${fmtKr(data.portfolioValue)}</strong>.</div>
        <div class="motivation-footer">🌊 Real avkastning: ${realPct} %/år</div>`;
}
                                                const nuvarandeÅr = new Date().getFullYear();
                        const ratio = (data.portfolioValue / data.coastTarget) * 100;
                        return `
                            <div class="motivation-number">${data.coastYear} <span style="font-size:18px;">år</span></div>
                            <div class="motivation-text">Om <strong>${data.coastYear} år</strong> (år ${nuvarandeÅr + data.coastYear}) kan du sluta spara — portföljen växer då på egen hand till FIRE-målet.<br><br>
                            <strong>Coast-målet idag: ${fmtKr(data.coastTarget)}.</strong><br>
                            <em>Detta är summan du behöver <u>idag</u> för att kunna sluta spara — det är alltså <strong>inte</strong> samma som det slutliga FIRE-målet (${fmtKr(data.fireGoalAmount)}). Coast-målet växer med ränta-på-ränta till FIRE-målet över ${FireCalc?.getInputs().fireStartYear} år.</em><br><br>
                            Du har <strong>${fmtKr(data.portfolioValue)}</strong> (${ratio.toFixed(0)} %).</div>
                            <div class="motivation-footer">🌊 Real avkastning: ${realPct} %/år · FIRE-mål: ${fmtKr(data.fireGoalAmount)}</div>`;
                    })()}
                </div>

                <div class="motivation-card">
                    <div class="motivation-icon">📊</div>
                    <h3>Progress mot FIRE</h3>
                    <div class="motivation-number" ${data.fireProgressPercent >= 100 ? 'style="color:var(--success);"' : ''}>${data.fireProgressPercent.toFixed(1)}<span style="font-size:18px;">%</span></div>
                    <div class="progress-bar-container">
                        <div class="progress-bar-fill" style="width:${Math.min(100, data.fireProgressPercent)}%;"></div>
                    </div>
                    <div class="motivation-text">Du har <strong>${fmtKr(data.portfolioValue)}</strong> av <strong>${fmtKr(data.fireGoalAmount)}</strong>. ${data.fireProgressPercent >= 100 ? 'Målet är uppnått!' : `Saknas <strong>${fmtKr(data.fireRemaining)}</strong>.`}</div>
                    <div class="motivation-footer">🎯 ${data.fireProgressPercent >= 75 ? 'Sista sträckan!' : data.fireProgressPercent >= 50 ? 'Halvvägs!' : data.fireProgressPercent >= 25 ? 'En fjärdedel klar' : 'Resan har börjat'}</div>
                </div>

                                <div class="motivation-card">
                    <div class="motivation-icon">🎂</div>
                    <h3>Beräknat FIRE-datum</h3>
                    ${(() => {
                        const fireStartYear = FireCalc?.getInputs().fireStartYear || 15;

                        if (data.fireDateYear === null) {
                            return `
                                <div class="motivation-number" style="color:#ff6b6b;">—</div>
                                <div class="motivation-text">Nås inte inom ${FireCalc?.getInputs().simYears} år med nuvarande sparande och antaganden. Överväg att öka sparandet eller sänka FIRE-målet.</div>
                                <div class="fire-timing-warning fire-timing-warning-danger">
                                    <div class="fire-timing-warning-title">⚠️ Kolla "Byte till FIRE efter år"</div>
                                    <div>Simuleringen byter till FIRE-läge redan <strong>år ${fireStartYear}</strong> och börjar ta ut pengar. Om portföljen inte är färdigbyggd då, hinner den aldrig ikapp. Prova att höja värdet i fliken <strong>⚙️ Simulering</strong> och se om portföljen då når målet.</div>
                                </div>
                                <div class="motivation-footer">🎂 Kräver sparande som räcker till målet</div>`;
                        }
                        const nuvarandeÅr = new Date().getFullYear();
                        const slutÅr = nuvarandeÅr + data.fireDateYear;
                        const månader = ['jan','feb','mar','apr','maj','jun','jul','aug','sep','okt','nov','dec'];
                        const månad = månader[new Date().getMonth()];
                        const dag = new Date().getDate();

                        if (data.fireDateYear === 0) {
                            return `
                                <div class="motivation-number" style="color:var(--success);">Idag!</div>
                                <div class="motivation-text">Du har redan nått ditt FIRE-mål. Grattis — du är ekonomiskt fri enligt 4%-regeln!</div>
                                <div class="motivation-footer">🎂 ${dag} ${månad} ${nuvarandeÅr}</div>`;
                        }

                        const årText = data.fireDateYear === 1 ? '1 år' : `${data.fireDateYear} år`;

                        let warningHtml = '';
                        if (data.fireDateYear > fireStartYear) {
                            const diffYears = data.fireDateYear - fireStartYear;
                            warningHtml = `
                                <div class="fire-timing-warning">
                                    <div class="fire-timing-warning-title">⚠️ Simuleringen startar FIRE för tidigt</div>
                                    <div>Din simulering byter till FIRE-läge <strong>år ${fireStartYear}</strong>, men portföljen når FIRE-målet först <strong>år ${data.fireDateYear}</strong> — <strong>${diffYears} år senare</strong>.</div>
                                    <div style="margin-top:8px;">Öppna fliken <strong>⚙️ Simulering</strong> och ändra <strong>"Byte till FIRE efter år"</strong> till <strong>år ${data.fireDateYear}</strong> (eller senare). Annars börjar uttagen innan portföljen är färdigbyggd, och simuleringen visar att pengarna tar slut i förtid.</div>
                                </div>`;
                        }

                                                const savePerMonth = (FireCalc?.getInputs().saveIsk || 0) + (FireCalc?.getInputs().saveDepa || 0);
                        return `
                            <div class="motivation-number">${slutÅr}</div>
                            <div class="motivation-text">Med din nuvarande portfölj (<strong>${fmtKr(data.portfolioValue)}</strong>) och sparande på <strong>${fmtKr(savePerMonth)}/mån</strong> når du FIRE-målet (<strong>${fmtKr(data.fireGoalAmount)}</strong>) om <strong>${årText}</strong>.<br><br>
                            Datum: ca <strong>${dag} ${månad} ${slutÅr}</strong>.</div>
                            ${warningHtml}
                            <div class="motivation-footer">🎂 ${data.fireDateYear <= 15 ? 'Inom räckhåll!' : data.fireDateYear <= 25 ? 'En lång resa väntar' : 'Lång horisont – tänk långsiktigt'}</div>`;
                    })()}
                </div>
				
            </div>
        `;

        html += `
            <div class="motivation-table-container">
                <h3 style="color:#ff9800; margin-bottom:15px;">🎯 När når du dina mål? (4%-regeln efter skatt)</h3>
                <div style="overflow-x: auto;">
                    <table class="motivation-table">
                        <thead>
						<tr>
                                <th>Årsuttag (netto efter skatt)</th>
                                <th>Uttag (ISK netto / Depå brutto)</th>
                                <th>Beräknat år</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
        `;

                for (const item of data.annualTargets) {
            let status = '';
            let statusClass = '';

            if (item.year === null) {
                status = '❌ Nås ej inom perioden';
                statusClass = 'status-no';
            } else if (item.year === 0) {
                status = '🏆 Uppnått redan idag!';
                statusClass = 'status-before';
            } else if (item.year <= (FireCalc?.getInputs().fireStartYear || 15)) {
                status = '✅ Före FIRE!';
                statusClass = 'status-before';
            } else {
                status = `📅 År ${item.year} (under FIRE)`;
                statusClass = 'status-during';
            }

            let uttagText = '';
            if (item.iskWithdrawal > 0 && item.depaWithdrawal > 0) {
                uttagText = `<span style="font-style: italic; color: #aaa;">ISK: ${item.iskWithdrawal.toLocaleString('sv-SE')} kr<br>Depå: ${item.depaWithdrawal.toLocaleString('sv-SE')} kr</span>`;
            } else if (item.iskWithdrawal > 0) {
                uttagText = `<span style="font-style: italic; color: #aaa;">ISK: ${item.iskWithdrawal.toLocaleString('sv-SE')} kr</span>`;
            } else if (item.depaWithdrawal > 0) {
                uttagText = `<span style="font-style: italic; color: #aaa;">Depå: ${item.depaWithdrawal.toLocaleString('sv-SE')} kr</span>`;
            } else {
                uttagText = '<span style="font-style: italic; color: #aaa;">—</span>';
            }

                        html += `
                <tr>
                    <td><strong>${item.target.toLocaleString('sv-SE')} kr/år</strong></td>
                    <td>${uttagText}</td>
                    <td>${item.year !== null ? (item.year === 0 ? 'Idag' : `År ${item.year}`) : '—'}</td>
                    <td><span class="${statusClass}">${status}</span></td>
                </tr>
            `;
        }

        html += `
                        </tbody>
                    </table>
                </div>

                <div class="motivation-note" style="margin-top: 15px;">
                    💡 <span style="font-style: italic;">Förklaring: ISK-kolumnen visar NETTO-uttaget – ISK-schablonskatten betalas direkt från portföljen och är redan inräknad i 4%-beräkningen. Depå-kolumnen visar BRUTTO-uttaget eftersom 30% vinstskatt dras vid själva uttaget. Fördelningen baseras på portföljernas relativa storlek vid målåret.</span>
                </div>
            </div>
        `;

        html += `
            <div class="motivation-table-container" style="margin-top: 20px;">
                <h3 style="color:#ff9800; margin-bottom:15px;">🏆 Milstolpar – när når du miljonerna?</h3>
                <table class="motivation-table">
                    <thead>
                        <tr><th>Milstolpe</th><th>Beräknat år</th><th>Status</th></tr>
                    </thead>
                    <tbody>
        `;

        for (const item of data.millionMilestones) {
            let status = '';
            let statusClass = '';
            let yearDisplay = '';

            if (item.year === null) {
                status = '❌ Nås ej inom perioden';
                statusClass = 'status-no';
                yearDisplay = '—';
            } else if (item.year === 0 && item.status === '🏆 Uppnådd redan idag!') {
                status = '🏆 Uppnådd redan idag!';
                statusClass = 'status-before';
                yearDisplay = 'Idag';
            } else if (item.year <= (FireCalc?.getInputs().fireStartYear || 15)) {
                status = '✅ Uppnådd före FIRE';
                statusClass = 'status-before';
                yearDisplay = `År ${item.year}`;
            } else {
                status = `📅 Uppnådd år ${item.year} (under FIRE)`;
                statusClass = 'status-during';
                yearDisplay = `År ${item.year}`;
            }

            const milestoneText = `${(item.milestone / 1000000).toFixed(0)} miljoner kr`;

            html += `
                <tr>
                                        <td><strong>${milestoneText}</strong></td>
                    <td>${yearDisplay}</td>
                    <td><span class="${statusClass}">${status}</span></td>
                </tr>
            `;
        }

        html += `
                    </tbody>
                </table>
                <div class="motivation-note">
                    ⚠️ OBS! Uttagen är beräknade efter ISK-schablonskatt och depåskatt (30% på vinst).<br>
                    📊 Milstolparna jämför portföljens <strong>REALA värde</strong> mot milstolpsbelopp i <strong>dagens penningvärde</strong>. "1 miljon kr" betyder alltså 1 miljon kr i dagens köpkraft – inte nominella framtida kronor.
                </div>
            </div>
        `;

        container.innerHTML = html;
    }
};