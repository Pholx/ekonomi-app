const FireAccounts = {
  accounts: [],
  _uidCounter: 0,

  _uid() { return 'acc_' + (++this._uidCounter); },

  _esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  },

  add(typ = 'isk') {
    const defaultName = typ === 'isk' ? 'ISK-konto' : typ === 'depa' ? 'Depå-konto' : 'Övrig tillgång';
    this.accounts.push({
      id: this._uid(),
      namn: defaultName,
      typ: typ,
      saldo: 0,
      inkopspris: 0
    });
    this.render();
    this.sync();
  },

  remove(id) {
    this.accounts = this.accounts.filter(a => a.id !== id);
    this.render();
    this.sync();
  },

  update(id, field, value) {
    const acc = this.accounts.find(a => a.id === id);
    if (!acc) return;
    acc[field] = value;
    this.sync();
  },

  // Summerar och skriver till dolda fält
  sync() {
    const iskSum = this.accounts
      .filter(a => a.typ === 'isk')
      .reduce((s, a) => s + (parseFloat(a.saldo) || 0), 0);
    const depaSum = this.accounts
      .filter(a => a.typ === 'depa')
      .reduce((s, a) => s + (parseFloat(a.saldo) || 0), 0);
    const otherSum = this.accounts
      .filter(a => a.typ === 'other')
      .reduce((s, a) => s + (parseFloat(a.saldo) || 0), 0);
    const depaCost = this.accounts
      .filter(a => a.typ === 'depa')
      .reduce((s, a) => s + (parseFloat(a.inkopspris) || 0), 0);

    const iskEl = document.getElementById('isk-balance');
    const depaEl = document.getElementById('depa-value');
    const costEl = document.getElementById('depa-cost');
    const otherEl = document.getElementById('other-assets');
    if (iskEl) iskEl.value = iskSum;
    if (depaEl) depaEl.value = depaSum;
    if (costEl) costEl.value = depaCost;
    if (otherEl) otherEl.value = otherSum;

    this._renderSummary();
    if (typeof FireCalc !== 'undefined' && FireCalc.debouncedUpdate) {
      FireCalc.debouncedUpdate();
    }
    if (typeof fireScheduleSave === 'function') fireScheduleSave();
	
	if (typeof Tabs !== 'undefined' && Tabs.updatePillSums) {
      Tabs.updatePillSums();
    }
  },

  _renderSummary() {
    const el = document.getElementById('accounts-summary');
    if (!el) return;

    if (this.accounts.length === 0) {
      el.innerHTML = `<div style="color:#666; font-size:13px; font-style:italic;">Inga konton tillagda än — klicka "+ Lägg till konto" ovan.</div>`;
      return;
    }

    const iskSum = this.accounts
      .filter(a => a.typ === 'isk')
      .reduce((s, a) => s + (parseFloat(a.saldo) || 0), 0);
    const depaSum = this.accounts
      .filter(a => a.typ === 'depa')
      .reduce((s, a) => s + (parseFloat(a.saldo) || 0), 0);
    const otherSum = this.accounts
      .filter(a => a.typ === 'other')
      .reduce((s, a) => s + (parseFloat(a.saldo) || 0), 0);
    const depaCost = this.accounts
      .filter(a => a.typ === 'depa')
      .reduce((s, a) => s + (parseFloat(a.inkopspris) || 0), 0);
    const fmt = (n) => Math.round(n).toLocaleString('sv-SE') + ' kr';

    let html = '';
    html += `<div class="account-total-row"><span>Summa ISK:</span><strong>${fmt(iskSum)}</strong></div>`;
    html += `<div class="account-total-row"><span>Summa Depå:</span><strong>${fmt(depaSum)}</strong></div>`;
    if (depaCost > 0) {
      html += `<div class="account-total-row"><span>Depå inköpspris:</span><strong>${fmt(depaCost)}</strong></div>`;
    }
    if (otherSum > 0) {
      html += `<div class="account-total-row"><span>Summa övriga tillgångar:</span><strong style="color:#ffaa44;">${fmt(otherSum)}</strong></div>`;
    }
    html += `<div class="account-total-row" style="border-top:1px solid #333; padding-top:8px; margin-top:4px;">
      <span>Totalt (alla tillgångar):</span><strong style="color:var(--success);">${fmt(iskSum + depaSum + otherSum)}</strong>
    </div>`;

    if (otherSum > 0) {
      html += `<div style="color:#888; font-size:11px; margin-top:8px; line-height:1.4;">
        ⚠️ Övriga tillgångar (bil, smycken, konst, kontanter) räknas som ett <strong>statiskt värde</strong> — de växer inte med avkastning och används endast i nettoförmögenhetsjämförelsen. De påverkar inte FIRE-uttagen.
      </div>`;
    }

    el.innerHTML = html;
  },

  render() {
    const container = document.getElementById('accounts-list');
    if (!container) return;

    if (this.accounts.length === 0) {
      container.innerHTML = '';
      return;
    }

    let html = '';
    this.accounts.forEach(acc => {
      const isDepa = acc.typ === 'depa';
      const isOther = acc.typ === 'other';
      html += `
        <div class="account-item" data-id="${acc.id}">
          <div class="account-row-1">
            <input type="text" class="account-namn" data-field="namn" value="${this._esc(acc.namn)}" placeholder="Kontonamn">
            <select class="account-typ" data-field="typ">
              <option value="isk" ${!isDepa && !isOther ? 'selected' : ''}>ISK</option>
              <option value="depa" ${isDepa ? 'selected' : ''}>Depå</option>
              <option value="other" ${isOther ? 'selected' : ''}>Övrigt</option>
            </select>
            <button type="button" class="remove-btn account-remove" title="Ta bort">×</button>
          </div>
          <div class="account-row-2">
            <div class="account-field">
              <span class="account-field-label">Saldo / marknadsvärde (kr)</span>
              <input type="text" inputmode="decimal" class="account-saldo" data-field="saldo" value="${acc.saldo}">
            </div>
            <div class="account-field account-inkopspris-wrap" style="${isDepa ? '' : 'display:none;'}">
              <span class="account-field-label">Inköpspris (kr)</span>
              <input type="text" inputmode="decimal" class="account-inkopspris" data-field="inkopspris" value="${acc.inkopspris}">
            </div>
          </div>
          ${isOther ? `<div style="color:#888; font-size:11px; margin-top:6px; font-style:italic;">Statiskt värde — växer inte med avkastning. Används endast i nettoförmögenhetsjämförelsen.</div>` : ''}
        </div>`;
    });
    container.innerHTML = html;

    container.querySelectorAll('.account-item').forEach(item => {
      const id = item.dataset.id;

      const namnEl = item.querySelector('.account-namn');
      namnEl.addEventListener('input', () => FireAccounts.update(id, 'namn', namnEl.value));

      const typEl = item.querySelector('.account-typ');
      typEl.addEventListener('change', () => {
        FireAccounts.update(id, 'typ', typEl.value);
        FireAccounts.render();
      });

      const saldoEl = item.querySelector('.account-saldo');
      saldoEl.addEventListener('blur', () => {
        const v = (typeof fireEvalExpr === 'function') ? fireEvalExpr(saldoEl.value) : (parseFloat(saldoEl.value) || 0);
        saldoEl.value = v;
        FireAccounts.update(id, 'saldo', v);
      });
      saldoEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); saldoEl.blur(); }
      });

      const inkopEl = item.querySelector('.account-inkopspris');
      if (inkopEl) {
        inkopEl.addEventListener('blur', () => {
          const v = (typeof fireEvalExpr === 'function') ? fireEvalExpr(inkopEl.value) : (parseFloat(inkopEl.value) || 0);
          inkopEl.value = v;
          FireAccounts.update(id, 'inkopspris', v);
        });
        inkopEl.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); inkopEl.blur(); }
        });
      }

      item.querySelector('.account-remove').addEventListener('click', () => {
        FireAccounts.remove(id);
      });
    });
  },

  migrateFromFlatValues() {
    if (this.accounts.length > 0) return;
    const iskEl = document.getElementById('isk-balance');
    const depaEl = document.getElementById('depa-value');
    const costEl = document.getElementById('depa-cost');
    const isk = iskEl ? (parseFloat(iskEl.value) || 0) : 0;
    const depa = depaEl ? (parseFloat(depaEl.value) || 0) : 0;
    const depaCost = costEl ? (parseFloat(costEl.value) || 0) : 0;

    if (isk > 0) {
      this.accounts.push({
        id: this._uid(), namn: 'ISK-konto', typ: 'isk', saldo: isk, inkopspris: 0
      });
    }
    if (depa > 0) {
      this.accounts.push({
        id: this._uid(), namn: 'Depå-konto', typ: 'depa', saldo: depa, inkopspris: depaCost
      });
    }
  },

  export() { return this.accounts; },

  import(data) {
    if (!Array.isArray(data)) return;
    this.accounts = data.map(a => ({
      id: a.id || this._uid(),
      namn: a.namn || '',
      typ: (a.typ === 'depa' || a.typ === 'other') ? a.typ : 'isk',
      saldo: parseFloat(a.saldo) || 0,
      inkopspris: parseFloat(a.inkopspris) || 0
    }));
    this.accounts.forEach(a => {
      const m = a.id && a.id.match(/^acc_(\d+)$/);
      if (m) this._uidCounter = Math.max(this._uidCounter, parseInt(m[1], 10));
    });
    this.render();
    this.sync();
  }
};

document.addEventListener('DOMContentLoaded', () => {
  const addBtn = document.getElementById('add-account-btn');
  if (addBtn) {
    addBtn.addEventListener('click', () => FireAccounts.add('isk'));
  }
  FireAccounts.migrateFromFlatValues();
  FireAccounts.render();
  FireAccounts._renderSummary();
  FireAccounts.sync();
});