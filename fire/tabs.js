/* tabs.js – Flik-logik för FIRE Simulator
   Hanterar vilken sektion som visas, prev/next-knappar och live-summor
   i nav-pills. Rör inte beräkningslogiken. */

const Tabs = {
    activeTab: 'formogenhet',
    tabs: [
    'formogenhet', 'boende', 'kostnader', 'allokering',
    'simulering', 'tabell', 'eget-uttag', 'sammanstallning'
],
labels: {
    formogenhet: 'Förmögenhet',
    boende: 'Boende',
    kostnader: 'Kostnader',
    allokering: 'Allokering',
    simulering: 'Simulering',
    tabell: 'Tabell',
    'eget-uttag': 'Eget uttag',
    sammanstallning: 'Sammanställning'
},

    init() {
        // Bind pill-klick
        document.querySelectorAll('.nav-pill').forEach(pill => {
            pill.addEventListener('click', () => this.show(pill.dataset.tab));
        });

        // Bind prev/next-knappar
        document.querySelectorAll('.section-nav-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.dataset.nav === 'next') this.next();
                else this.prev();
            });
        });

        // Återställ senast vald flik (om den finns)
        const saved = localStorage.getItem('fire-sim-active-tab');
        if (saved && this.tabs.includes(saved)) {
            this.show(saved, /*scroll=*/ false);
        } else {
            this.show('formogenhet', false);
        }

        this.updatePillSums();
    },

    show(tabId, scroll = true) {
        if (!this.tabs.includes(tabId)) return;
        this.activeTab = tabId;

        document.querySelectorAll('.nav-pill').forEach(p => {
            p.classList.toggle('active', p.dataset.tab === tabId);
        });

        document.querySelectorAll('.tab-panel').forEach(p => {
            p.classList.toggle('active', p.id === 'tab-' + tabId);
        });

        localStorage.setItem('fire-sim-active-tab', tabId);
        this.updateNavButtons();

        if (scroll) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    },

    next() {
        const idx = this.tabs.indexOf(this.activeTab);
        if (idx < this.tabs.length - 1) this.show(this.tabs[idx + 1]);
    },

    prev() {
        const idx = this.tabs.indexOf(this.activeTab);
        if (idx > 0) this.show(this.tabs[idx - 1]);
    },

    updateNavButtons() {
        // Loopar per knapp och sätter text utifrån knappens EGEN panel,
        // inte utifrån aktiv flik. Detta undviker att samma text hamnar
        // på alla knappar samtidigt.
        document.querySelectorAll('.section-nav-btn').forEach(btn => {
            const panel = btn.closest('.tab-panel');
            const panelId = panel ? panel.id : '';

            if (btn.dataset.nav === 'prev') {
                btn.style.visibility = (panelId === 'tab-formogenhet') ? 'hidden' : 'visible';
            } else {
                btn.style.visibility = (panelId === 'tab-sammanstallning') ? 'hidden' : 'visible';

                // Sista innehållsfliken innan sammanställning → "Till sammanställning"
                if (panelId === 'tab-eget-uttag') {
                    btn.textContent = '📊 Till sammanställning →';
                } else {
                    btn.textContent = 'Nästa flik →';
                }
            }
        });
    },

    _num(id) {
        const el = document.getElementById(id);
        if (!el) return 0;
        const v = parseFloat(el.value);
        return isNaN(v) ? 0 : v;
    },

    updatePillSums() {
        const fmt = (n) => Math.round(n).toLocaleString('sv-SE');

        const setPillSum = (tabId, text) => {
            const pill = document.querySelector(`.nav-pill[data-tab="${tabId}"]`);
            if (!pill) return;
            let sumEl = pill.querySelector('.pill-sum');
            if (!sumEl) {
                sumEl = document.createElement('span');
                sumEl.className = 'pill-sum';
                pill.appendChild(sumEl);
            }
            sumEl.textContent = text ? ' · ' + text : '';
        };

        // Förmögenhet: total portfölj idag (inkl. övriga tillgångar)
        const isk  = this._num('isk-balance');
        const depa = this._num('depa-value');
        const other = this._num('other-assets');
        const portfolio = isk + depa + other;
        
        setPillSum('formogenhet', portfolio > 0 ? fmt(portfolio) + ' kr' : '');

        // Boende: bolåneskuld
        const debt = this._num('mortgage-debt');
        setPillSum('boende', debt > 0 ? fmt(debt) + ' kr' : '');

        // Kostnader: summa kr/mån
        const monthly = this._num('fixed-costs') + this._num('variable-costs')
                      + this._num('house-upkeep') + this._num('other-costs');
        setPillSum('kostnader', monthly > 0 ? fmt(monthly) + ' kr/mån' : '');

        // Allokering: summa ISK % (live)
        const sumIskEl = document.getElementById('sum-isk');
        if (sumIskEl) {
            const txt = sumIskEl.textContent.replace('%', '').trim();
            setPillSum('allokering', txt && txt !== '0' ? txt + '% ISK' : '');
        }

        // Simulering: FIRE-startår
        const fireYear = this._num('fire-start-year');
        setPillSum('simulering', fireYear > 0 ? 'år ' + Math.round(fireYear) : '');
    }
};

document.addEventListener('DOMContentLoaded', () => {
    Tabs.init();

    // Uppdatera pill-summor vid input-ändringar (körs parallellt med
    // fire_calculator.js:s egna event-listeners – ingen konflikt).
    const watchedIds = [
        'isk-balance', 'depa-value', 'mortgage-debt',
        'fixed-costs', 'variable-costs', 'house-upkeep', 'other-costs',
        'fire-start-year'
    ];
    watchedIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', () => Tabs.updatePillSums());
    });

    // Allokerings-summan uppdateras av updateAllocations() – haka på
    // med en MutationObserver på #sum-isk så pillen hålls synkad.
    const sumIskEl = document.getElementById('sum-isk');
    if (sumIskEl && typeof MutationObserver !== 'undefined') {
        const mo = new MutationObserver(() => Tabs.updatePillSums());
        mo.observe(sumIskEl, { childList: true, characterData: true, subtree: true });
    }
});