// ════════════════════════════════════════════════════════════════════
// FIRE BRIDGE – läser Budget-data från localStorage och fyller FIRE:s fält
// ════════════════════════════════════════════════════════════════════
// Självständig: kräver bara att Budget:s data.js är laddad (för TYPES).
// Skriver bara när användaren klickar "Hämta från Budget".
// ════════════════════════════════════════════════════════════════════

const FireBridge = {
  BUDGET_STORAGE_KEY: BUDGET_STORAGE_KEY,

  // ─── Läs Budget-state ───
  _readBudgetState() {
    try {
      const raw = localStorage.getItem(this.BUDGET_STORAGE_KEY);
      if (!raw) return null;
      const payload = JSON.parse(raw);
      return payload && payload.items ? payload.items : null;
    } catch (e) {
      console.warn('[FireBridge] Kunde inte läsa Budget-data:', e);
      return null;
    }
  },

  // ─── Item-hjälpare (spegling av Budget:s calculator.js) ───
  _itemTotal(item) {
    const t = (typeof TYPES !== 'undefined') && TYPES[item.type];
    if (!t) return 0;
    if (t.isBalance || t.isSkuld || t.isReference) return 0;
    if (t.compute) return t.compute(item.values);
    let sum = 0;
    (t.fields || []).forEach(f => {
      if (['computed','text','checkbox','percent','hint','select'].includes(f.type)) return;
      sum += parseFloat(item.values[f.id]) || 0;
    });
    (item.items || []).forEach(c => sum += this._itemTotal(c));
    return sum;
  },

  _sumSection(items, sectionId) {
    return (items[sectionId] || []).reduce((s, it) => s + this._itemTotal(it), 0);
  },

  // Summerar allt med viss klass (fast/rörlig) – möjlighet att exkludera en sektion
  _sumByKlass(items, klass, options = {}) {
    const exclude = options.excludeSection || null;
    const sectionIds = ['boende','transport','mat','barn','personligt','forsakringar','vard','noje','ovrigt']
      .filter(s => s !== exclude);
    let sum = 0;
    const walk = (item) => {
      const t = (typeof TYPES !== 'undefined') && TYPES[item.type];
      if (!t) { (item.items || []).forEach(walk); return; }
      if (t.klass === klass && !t.isBalance && !t.isSkuld && !t.isReference) {
        (t.fields || []).forEach(f => {
          if (['computed','text','checkbox','percent','hint','select'].includes(f.type)) return;
          sum += parseFloat(item.values[f.id]) || 0;
        });
      }
      (item.items || []).forEach(walk);
    };
    sectionIds.forEach(sid => (items[sid] || []).forEach(walk));
    return sum;
  },

  // Summerar månadssparande i en FIRE-hink (från Steg 4)
  _sumByFireBucket(items, bucket) {
    let sum = 0;
    (items.sparande || []).forEach(it => {
      const t = (typeof TYPES !== 'undefined') && TYPES[it.type];
      if (!t || t.isBalance) return;
      let itemBucket = t.fireBucket;
      const selectField = (t.fields || []).find(f => f.id === 'fire_bucket');
      if (selectField && it.values.fire_bucket) itemBucket = it.values.fire_bucket;
      if (itemBucket === bucket) sum += this._itemTotal(it);
    });
    return sum;
  },

  // Viktat snitt av bolånens ränta + totalt saldo + amortering
  _getBolånData(items) {
    let saldo = 0, amortering = 0, rantaViktad = 0, marknadsvarde = 0;
    (items.skulder || []).forEach(it => {
      if (it.type !== 'skuld_bolan') return;
      const s = parseFloat(it.values.saldo) || 0;
      const a = parseFloat(it.values.amortering) || 0;
      const r = parseFloat(it.values.ranta_procent) || 0;
      const m = parseFloat(it.values.marknadsvarde) || 0;
      saldo += s;
      amortering += a;
      rantaViktad += s * r;
      marknadsvarde += m;
    });
    const rantaSnitt = saldo > 0 ? rantaViktad / saldo : 0;
    return { saldo, amortering, rantaSnitt, marknadsvarde };
  },
  
    // ─── Generera dynamiska beskrivningar för frågebubblor ───
  getDescription(fieldId) {
    const items = this._readBudgetState();
    if (!items) return 'Ingen Budget-data hittad.\n\nÖppna Budget-appen och fyll i siffror, klicka sedan 📥 Hämta från Budget.';

    const fmt = (n) => Math.round(n).toLocaleString('sv-SE');

    switch (fieldId) {
      case 'save-isk': {
        const iskItems = (items.sparande || []).filter(it => {
          const t = TYPES[it.type];
          if (!t || t.isBalance) return false;
          const sel = (t.fields || []).find(f => f.id === 'fire_bucket');
          const bucket = sel && it.values.fire_bucket ? it.values.fire_bucket : t.fireBucket;
          return bucket === 'isk';
        });
        if (!iskItems.length) return 'Ingen post i Budget → Sparande är mappad till ISK.\n\nÖppna Budget → Sparande och välj "📈 ISK" i rullgardinen.';
        let s = 'Hämtas från Budget → Sparande:\n';
        iskItems.forEach(it => {
          const t = TYPES[it.type];
          const namn = t.custom ? (it.values.namn || 'Egen rad') : t.label;
          s += `• ${namn}: ${fmt(this._itemTotal(it))} kr/mån\n`;
        });
        s += `\nTotalt ISK-sparande: ${fmt(this._sumByFireBucket(items, 'isk'))} kr/mån`;
        return s;
      }
      case 'save-depa': {
        const depaItems = (items.sparande || []).filter(it => {
          const t = TYPES[it.type];
          if (!t || t.isBalance) return false;
          const sel = (t.fields || []).find(f => f.id === 'fire_bucket');
          const bucket = sel && it.values.fire_bucket ? it.values.fire_bucket : t.fireBucket;
          return bucket === 'depa';
        });
        if (!depaItems.length) return 'Ingen post i Budget → Sparande är mappad till Depå.\n\nÖppna Budget → Sparande och välj "💼 Depå" i rullgardinen.';
        let s = 'Hämtas från Budget → Sparande:\n';
        depaItems.forEach(it => {
          const t = TYPES[it.type];
          const namn = t.custom ? (it.values.namn || 'Egen rad') : t.label;
          s += `• ${namn}: ${fmt(this._itemTotal(it))} kr/mån\n`;
        });
        s += `\nTotalt Depå-sparande: ${fmt(this._sumByFireBucket(items, 'depa'))} kr/mån`;
        return s;
      }
      case 'fixed-costs': {
        const sum = this._sumByKlass(items, 'fast', { excludeSection: 'boende' });
        return `Hämtas från Budget → alla poster markerade som "fast" (exkl. Boende).\n\nKällor: Transport, Mat, Barn, Personligt, Försäkringar, Vård, Nöje, Övrigt.\n\n⚠️ Boende räknas separat under Husdrift.\n\nTotalt: ${fmt(sum)} kr/mån`;
      }
      case 'variable-costs': {
        const sum = this._sumByKlass(items, 'rörlig', { excludeSection: 'boende' });
        return `Hämtas från Budget → alla poster markerade som "rörlig" (exkl. Boende).\n\nKällor: Transport, Mat, Barn, Personligt, Försäkringar, Vård, Nöje, Övrigt.\n\n⚠️ Boende räknas separat under Husdrift.\n\nTotalt: ${fmt(sum)} kr/mån`;
      }
      case 'house-upkeep': {
        const sum = this._sumSection(items, 'boende');
        return `Hämtas från Budget → hela Boende-fliken.\n\nKällor: hyra, el, värme, vatten, sophämtning, underhåll, försäkringar, bredband m.m.\n\n⚠️ Bolån (ränta + amortering) räknas separat.\n\nTotalt: ${fmt(sum)} kr/mån`;
      }
      case 'mortgage-debt': {
        const b = this._getBolånData(items);
        return `Hämtas från Budget → Skulder → Bolån.\n\nSumma saldo över alla bolån: ${fmt(b.saldo)} kr\nViktat snitt av ränta: ${b.rantaSnitt.toFixed(2)} %\nSumma amortering: ${fmt(b.amortering)} kr/mån`;
      }
      case 'house-value': {
        const b = this._getBolånData(items);
        return `Hämtas från Budget → Skulder → Bolån → fältet "Bostadens marknadsvärde".\n\nSumma över alla bolån: ${fmt(b.marknadsvarde)} kr\n\nOm 0 kr — öppna Budget, fyll i marknadsvärdet på ditt bolån och klicka 📥 Hämta från Budget.`;
      }
      case 'isk-balance': {
        return 'Ange ditt totala ISK-innehav idag.\n\nHämtas INTE från Budget (Budget har inga saldon) — fyll i manuellt.';
      }
            case 'depa-value': {
        return 'Ange ditt totala Depå-innehav idag.\n\nHämtas INTE från Budget — fyll i manuellt.';
      }
            case 'accounts': {
    return 'Lägg till dina tillgångar:\n\n• ISK-konton — saldo\n• Depåkonton — saldo och inköpspris (för vinstskatt)\n• Övriga tillgångar — t.ex. bil, smycken, konst, kontanter (statiskt värde)\n\n⚠️ VIKTIGT för Övriga tillgångar:\nAnge alltid tillgångens FULLA marknadsvärde.\nLån som hör till tillgången (billån, CSN m.m.) dras automatiskt av om de är inlagda under Budget → Skulder.\n\nAlla ISK-konton slås ihop → används som "ISK innehav" i simuleringen.\nAlla Depåkonton slås ihop → används som "Depå marknadsvärde".\n\nÖvriga tillgångar räknas som statiskt värde — de växer inte med avkastning och används endast i nettoförmögenhetsjämförelsen. De påverkar INTE FIRE-uttagen.';
}
    }
    return '';
  },

  // ─── Extrahera det vi vill fylla ───
  extractBudgetValues() {
    const items = this._readBudgetState();
    if (!items) return null;
    const bolån = this._getBolånData(items);
    return {
      'save-isk':       this._sumByFireBucket(items, 'isk'),
      'save-depa':      this._sumByFireBucket(items, 'depa'),
      'fixed-costs':    this._sumByKlass(items, 'fast', { excludeSection: 'boende' }),
      'variable-costs': this._sumByKlass(items, 'rörlig', { excludeSection: 'boende' }),
      'house-upkeep':   this._sumSection(items, 'boende'),
      'mortgage-debt':  bolån.saldo,
      'interest-rate':  bolån.rantaSnitt,
      'amortization':   bolån.amortering,
      'house-value':    bolån.marknadsvarde,
    };
  },

  // ─── Fyll FIRE:s DOM ───
  applyToFire(values) {
    if (!values) return 0;
    let applied = 0;
    Object.entries(values).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (!el) return;
      // Skippa house-value om Budget saknar värde (0) — undvik att skriva
      // över det användaren fyllt i manuellt under FIRE → 🏠 Boende.
      if (id === 'house-value' && Math.round(val) === 0) return;
      const rounded = (id === 'interest-rate')
        ? Math.round(val * 100) / 100
        : Math.round(val);
      el.value = rounded;
      applied++;
    });
    if (typeof FireCalc !== 'undefined' && FireCalc.updateFireTable) {
      FireCalc.updateFireTable();
    }
    if (typeof fireScheduleSave === 'function') fireScheduleSave();
    return applied;
  },

  // ─── Huvudmetod ───
  syncFromBudget() {
    const values = this.extractBudgetValues();
    if (!values) {
      alert('Ingen Budget-data hittad.\n\nÖppna Budget-appen och fyll i något först.');
      return false;
    }
    const count = this.applyToFire(values);
    this._showFeedback(count);
    return true;
  },

  _showFeedback(count) {
    const badge = document.getElementById('save-badge');
    if (!badge) return;
    const original = badge.textContent;
    badge.textContent = `📥 ${count} fält ifyllda från Budget`;
    badge.classList.add('visible');
    clearTimeout(badge._timeout);
    badge._timeout = setTimeout(() => {
      badge.classList.remove('visible');
      badge.textContent = original;
    }, 2500);
  }
};

// ─── Rendera statusrad + koppla knapp ───
document.addEventListener('DOMContentLoaded', () => {
  const bar = document.getElementById('bridge-bar');
  if (!bar) return;

  if (FireBridge._readBudgetState()) {
    bar.innerHTML = `
      <span style="color:#4caf50;">🟢 Budget-data hittad</span>
      <button id="bridge-sync-btn" class="toolbar-btn" style="margin-left:auto;">
        📥 Hämta från Budget
      </button>
    `;
    const btn = document.getElementById('bridge-sync-btn');
    if (btn) btn.addEventListener('click', () => FireBridge.syncFromBudget());
  } else {
    bar.innerHTML = `<span style="color:#888;">⚪ Ingen Budget-data hittad – öppna Budget-appen och fyll i siffror först</span>`;
  }
  // Fyll frågebubblor med dynamisk text
  document.querySelectorAll('[data-tooltip-field]').forEach(el => {
    const desc = FireBridge.getDescription(el.dataset.tooltipField);
    if (desc) el.dataset.source = desc;
	});
  });
