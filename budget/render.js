// ════════════════════════════════════════════════════════════════════
// RENDERING + EVENT LISTENERS – flik-baserad v15
// ════════════════════════════════════════════════════════════════════

let activeSection = 'personer';

function typeIdOf(typeObj) { return Object.keys(TYPES).find(k => TYPES[k] === typeObj); }

function srcIcon(key) {
  const text = KALLOR[key] || '';
  return text ? `<span class="src-icon" data-source="${esc(text)}">i</span>` : '';
}
function qIcon(key) {
  const text = FORKLARING[key] || '';
  return text ? `<span class="q-icon" data-source="${esc(text)}">?</span>` : '';
}

// Bygger HTML för varningen om lån som saknar ränta/amortering.
// Används både vid initial rendering och vid live-uppdatering.
function renderSkulderWarning() {
  const saknarKostnad = (state.items.skulder || []).filter(it => {
    const saldo = parseFloat(it.values.saldo) || 0;
    const ranta = parseFloat(it.values.ranta_procent) || 0;
    const amort = parseFloat(it.values.amortering) || 0;
    return saldo > 0 && (saldo * ranta / 100 / 12 + amort) === 0;
  });
  if (saknarKostnad.length === 0) return '';
  return `<div class="loan-warning" style="margin-top:10px;">
    ⚠️ ${saknarKostnad.length} lån saknar ränta och/eller amortering.
    Deras månadskostnad räknas som 0 kr och påverkar därför <strong>inte</strong>
    bufferttäckningen eller FIRE-uttaget.
  </div>`;
}

// ─── Lånesammanfattning (per skuld) ───
function loanSummaryHtml(item) {
  const saldo = parseFloat(item.values.saldo) || 0;
  const ranta = parseFloat(item.values.ranta_procent) || 0;
  const amort = parseFloat(item.values.amortering) || 0;
  const rantaKr = saldo * ranta / 100 / 12;
  const manad = rantaKr + amort;
  const periodLabel = viewMode === 'year' ? 'Kostnad per år' : 'Kostnad per månad';

  const warn = (saldo > 0 && manad === 0)
    ? `<div class="loan-warning">⚠️ Ränta och amortering saknas – kostnaden blir 0 kr/mån</div>`
    : '';

  return `<div class="loan-summary" data-item-loan-summary="${item._id}">
    <div class="loan-summary-row">
      <span>${periodLabel}:</span>
      <strong>${fmtV(manad)}</strong>
    </div>
    <div class="loan-summary-sub">(ränta ${fmtV(rantaKr)} + amortering ${fmtV(amort)})</div>
    ${warn}
  </div>`;
}

// ─── Fält-rendering ───
function renderField(item, f, sectionId) {
  const attrs = `data-item="${item._id}" data-section="${sectionId}" data-field="${f.id}"`;

  if (f.type === 'hint') {
    return `<div class="hint-field">
      <div class="hint-text">${esc(f.label)}</div>
    </div>`;
  }

  if (f.type === 'computed') {
    const val = f.formula ? f.formula(item.values) : 0;
    return `<div class="field"><label>${esc(f.label)}</label>
      <input type="text" readonly data-computed="${f.id}" ${attrs} value="${fmt(val)}"></div>`;
  }
  if (f.type === 'checkbox') {
    return `<div class="field checkbox-field"><label>${esc(f.label)}</label>
      <input type="checkbox" ${item.values[f.id] ? 'checked' : ''} ${attrs}></div>`;
  }
  if (f.type === 'text') {
    const val = item.values[f.id] ?? '';
    return `<div class="field"><label>${esc(f.label)}</label>
      <input type="text" ${attrs} value="${esc(val)}"></div>`;
  }
  if (f.type === 'percent') {
    const val = item.values[f.id] ?? 0;
    return `<div class="field"><label>${esc(f.label)}</label>
      <input type="text" inputmode="decimal" class="calc-input percent-input" ${attrs} value="${val}"></div>`;
  }
    if (f.type === 'select') {
    const val = item.values[f.id] ?? f.default ?? '';
    const opts = (f.options || []).map(o =>
      `<option value="${esc(o.value)}" ${o.value === val ? 'selected' : ''}>${esc(o.label)}</option>`
    ).join('');
    return `<div class="field field-select"><label>${esc(f.label)}</label>
      <select ${attrs}>${opts}</select></div>`;
  }
  const val = item.values[f.id] ?? 0;
  return `<div class="field"><label>${esc(f.label)}</label>
    <input type="text" inputmode="decimal" class="calc-input" ${attrs} value="${val}"></div>`;
}

function renderItem(item, sectionId) {
  const t = TYPES[item.type];

  if (!t) {
    return `<div class="item item-error" data-item-render="${item._id}">
      <div class="item-header">
        <span class="item-name" style="color:#ffaa44;">⚠️ Gammal post: ${esc(item.type)}</span>
        <button class="remove-btn" data-action="remove" data-item="${item._id}" data-section="${sectionId}" title="Ta bort">×</button>
      </div>
      <div class="hint-text" style="color:#ffaa44;">Denna post kommer från en äldre version och kan tas bort.</div>
    </div>`;
  }

  // Special-design för buffert
  if (item.type === 'buffert_saldo') {
    const val = parseFloat(item.values.belopp) || 0;
    const attrs = `data-item="${item._id}" data-section="${sectionId}" data-field="belopp"`;
    return `<div class="item item-buffert" data-item-render="${item._id}">
      <div class="buffert-header">
        <span class="buffert-icon">🛟</span>
        <div class="buffert-title-block">
          <div class="buffert-title">Nuvarande buffert</div>
          <div class="buffert-subtitle">Ditt sparade trygghetskapital – räknas inte som månadskostnad</div>
        </div>
      </div>
      <div class="buffert-input-row">
        <input type="text" inputmode="decimal" class="calc-input buffert-input" ${attrs} value="${val}" placeholder="0">
        <span class="buffert-unit">kr</span>
      </div>
    </div>`;
  }

  let html = `<div class="item ${t.isReference ? 'item-reference' : ''}" data-item-render="${item._id}">`;

  const name = t.custom ? (item.values.namn || 'Egen rad') : t.label;
  html += `<div class="item-header">
    <span class="item-name" data-item-name="${item._id}">${esc(name)}</span>
    <button class="remove-btn" data-action="remove" data-item="${item._id}" data-section="${sectionId}" title="Ta bort">×</button>
  </div>`;

  (t.fields || []).forEach(f => {
    if (f.visibleWhen && !f.visibleWhen(item.values)) return;
    html += renderField(item, f, sectionId);
  });

  const infoText = typeof t.info === 'function' ? t.info(item.values) : t.info;
  if (infoText) html += `<div class="info-text" data-item-info="${item._id}">${esc(infoText)}</div>`;

  if (t.isSkuld) html += loanSummaryHtml(item);

  if (item.items && item.items.length) {
    html += `<div class="item-children">`;
    item.items.forEach(c => html += renderItem(c, sectionId));
    html += `</div>`;
  }

  if (t.children && t.children.length) {
    const available = t.children
      .map(id => TYPES[id])
      .filter(ct => ct && (!ct.singleton || !item.items.some(i => i.type === typeIdOf(ct))));
    if (available.length) {
      html += `<div class="item-add add-row">
        <select data-action="add-child" data-parent="${item._id}" data-section="${sectionId}">
          <option value="">+ Lägg till...</option>
          ${available.map(ct => `<option value="${typeIdOf(ct)}">${ct.label}</option>`).join('')}
        </select>
      </div>`;
    }
  }

  html += `</div>`;
  return html;
}

function renderSection(sec) {
  // Säkerställ att pinned items finns (buffert i Sparande)
  if (sec.id === 'sparande') ensurePinnedItems();

  const items = state.items[sec.id] || [];
  let hintHtml = '';
  if (sec.hint) hintHtml = ` <span class="hint">${sec.hint}</span>`;
  let html = `<div class="card" data-section-card="${sec.id}"><h2>${sec.title} <span class="unit">(inmatning: kr/mån · visas i ${viewUnit()})</span>${hintHtml}</h2>`;
  items.forEach(it => html += renderItem(it, sec.id));

  const allTypes = Object.keys(TYPES)
    .filter(k => TYPES[k].section === sec.id)
    .filter(k => !TYPES[k].childOnly)
    .filter(k => !TYPES[k].singleton || !items.some(i => i.type === k));

  if (allTypes.length) {
    const label = sec.addLabel || 'Lägg till';
    html += `<div class="add-row">
      <select data-action="add-top" data-section="${sec.id}">
        <option value="">+ ${label}...</option>
        ${allTypes.map(k => `<option value="${k}">${TYPES[k].label}</option>`).join('')}
      </select>
    </div>`;
	
	
  }

  if (sec.id === 'personer') {
    // ingen summa
  } else if (sec.id === 'skulder') {
    const saldo = sumSkulderSaldo();
    const manad = sumSkulderManad();
    const ranta = sumSkulderRanta();
    const periodLabel = viewMode === 'year' ? 'Kostnad per år' : 'Kostnad per månad';
    html += `<div class="section-sum skulder-sum">
      <div><span>Total skuld:</span> <strong style="color:#ff6b6b;">${saldo.toLocaleString('sv-SE')} kr</strong></div>
      <div><span>${periodLabel}:</span> <strong>${fmtV(manad)}</strong>
        <span style="color:#888; font-size:12px;">(ränta ${fmtV(ranta)} + amortering ${fmtV(sumSkulderAmortering())})</span>
      </div>
    </div>`;
        } else {
    const sum = sumSection(sec.id);
    html += `<div class="section-sum"><span>Summa</span><strong>${fmtV(sum)}</strong></div>`;
  }

    // Sektionsvarning: lån med saldo men 0 kr/mån
  // Wrappas i en stabil container så att updateSkulderSum kan uppdatera den live.
  if (sec.id === 'skulder') {
    html += `<div id="skulder-warning">${renderSkulderWarning()}</div>`;
  }

  // Förklarande ruta för Sparande-sektionen
  if (sec.id === 'sparande') {
    html += `<div class="section-info-note">
      <div class="section-info-note-title">💡 Så hanteras de olika valen</div>

      <div class="section-info-note-row">
        <span class="section-info-note-badge" style="background:rgba(79,195,247,0.15); color:#4fc3f7;">📈 ISK</span>
        <span>Räknas som <strong>nysparande ISK</strong> i FIRE-kalkylatorn. Portföljen växer med din ISK-allokering, och ISK-schablonskatt dras årligen. Överförs automatiskt när du klickar <strong>📥 Hämta från Budget</strong> på FIRE-fliken.</span>
      </div>

      <div class="section-info-note-row">
        <span class="section-info-note-badge" style="background:rgba(255,152,0,0.15); color:#ff9800;">💼 Depå</span>
        <span>Räknas som <strong>nysparande Depå</strong> i FIRE-kalkylatorn. Växer med din Depå-allokering, och 30 % vinstskatt dras vid uttag. Överförs automatiskt när du klickar <strong>📥 Hämta från Budget</strong> på FIRE-fliken.</span>
      </div>

      <div class="section-info-note-row">
        <span class="section-info-note-badge" style="background:rgba(136,136,136,0.15); color:#aaa;">🛟 Utanför FIRE</span>
        <span>Räknas med i <strong>sparkvoten</strong> på Sammanställning, men flödar <strong>inte</strong> till FIRE-simuleringen. Används för buffert, barnsparande, bil, semester och annat målsparande.</span>
      </div>

      <div class="section-info-note-row">
        <span class="section-info-note-badge" style="background:rgba(76,175,80,0.15); color:#4caf50;">🛟 Saldo</span>
        <span>Nuvarande buffert är ett <strong>saldo</strong>, inte ett månadsflöde. Det räknas inte i sparkvoten och används endast för att visa hur många månaders utgifter din buffert täcker.</span>
      </div>

            <div class="section-info-note-footer">
        📌 Allt månadssparande räknas med i sparkvoten — oavsett hink. Bara ISK och Depå går vidare till FIRE-simuleringen. Om du byter hink på t.ex. barnsparande till ISK, räknas det in i FIRE-portföljen.
      </div>
    </div>`;
  }

  html += `</div>`;
  return html;
}

// ─── Nav-hjälpare ───
function sectionShortName(sec) {
  const parts = sec.title.split('. ');
  return parts.length > 1 ? parts[1] : sec.title;
}
function sectionEmoji(sec) {
  const m = sec.title.match(/^(\S+)/);
  return m ? m[1] : '';
}

function renderNav() {
  const nav = document.getElementById('section-nav');
  if (!nav) return;
  const pills = SECTIONS.map(sec => {
    const isActive = activeSection === sec.id;
    return `<button class="nav-pill ${isActive ? 'active' : ''}" data-nav="${sec.id}">
      <span class="nav-pill-emoji">${sectionEmoji(sec)}</span>
      <span class="nav-pill-label">${esc(sectionShortName(sec))}</span>
      <span class="nav-pill-sum"></span>
    </button>`;
  }).join('');
  const summaryActive = activeSection === '__summary';
  nav.innerHTML = pills + `<button class="nav-pill summary-pill ${summaryActive ? 'active' : ''}" data-nav="__summary">
    <span class="nav-pill-emoji">📊</span>
    <span class="nav-pill-label">Sammanställning</span>
  </button>`;
}

function updatePillSums() {
  SECTIONS.forEach(sec => {
    const pill = document.querySelector(`[data-nav="${sec.id}"]`);
    if (!pill) return;
    const sumEl = pill.querySelector('.nav-pill-sum');
    if (!sumEl) return;
    if (sec.id === 'personer') {
      const c = (state.items.personer || []).length;
      sumEl.textContent = c > 0 ? `· ${c}` : '';
      pill.classList.toggle('has-content', c > 0);
        } else if (sec.id === 'skulder') {
      const saldo = sumSkulderSaldo();
      const c = (state.items.skulder || []).length;
      sumEl.textContent = c > 0 ? `· ${Math.round(saldo).toLocaleString('sv-SE')} kr` : '';
      pill.classList.toggle('has-content', c > 0);
    } else {
      const sum = sumSection(sec.id);
      const val = Math.round(sum * viewMultiplier());
      sumEl.textContent = sum > 0 ? `· ${val.toLocaleString('sv-SE')}` : '';
      pill.classList.toggle('has-content', sum > 0);
    }
  });
}

// ─── Aktiv sektion ───
function renderActive() {
  const container = document.getElementById('budget-container');
  if (!container) return;

  if (activeSection === '__summary') {
    container.innerHTML = `<div class="card summary-card">
      <h2>📊 Fullständig sammanställning</h2>
      <div id="summary"></div>
    </div>`;
    renderNav();
    updatePillSums();
    attachListeners();
    updateSummary();
    return;
  }

  const sec = SECTIONS.find(s => s.id === activeSection);
  if (!sec) return;
  const idx = SECTIONS.indexOf(sec);
  const prev = SECTIONS[idx - 1];
  const next = SECTIONS[idx + 1];

  let navTop = `<div class="section-nav-buttons">`;
  navTop += prev
    ? `<button class="section-nav-btn" data-goto="${prev.id}">← ${sectionEmoji(prev)} ${esc(sectionShortName(prev))}</button>`
    : `<span></span>`;
  navTop += next
    ? `<button class="section-nav-btn" data-goto="${next.id}">${sectionEmoji(next)} ${esc(sectionShortName(next))} →</button>`
    : `<button class="section-nav-btn" data-goto="__summary">📊 Till sammanställning →</button>`;
  navTop += `</div>`;

  container.innerHTML = navTop + renderSection(sec) + navTop;

  renderNav();
  attachListeners();
  updatePillSums();
}

function renderApp() {
  ensurePinnedItems();
  renderActive();
}
function renderAll() {
  ensurePinnedItems();
  renderActive();
}

function updateAllLiveSums() {
  updatePillSums();
  const activeCard = document.querySelector(`[data-section-card="${activeSection}"]`);
  if (activeCard) {
    if (activeSection === 'skulder') {
      updateSkulderSum(activeCard);
    } else if (activeSection !== 'personer') {
      const s = activeCard.querySelector('.section-sum strong');
      if (s) s.textContent = fmtV(sumSection(activeSection));
    }
  }
  updateSummary();
}


function updateSkulderSum(card) {
  const div = card.querySelector('.skulder-sum');
  if (!div) return;
  const saldo  = sumSkulderSaldo();
  const manad  = sumSkulderManad();
  const ranta  = sumSkulderRanta();
  const amort  = sumSkulderAmortering();
  const periodLabel = viewMode === 'year' ? 'Kostnad per år' : 'Kostnad per månad';
  div.innerHTML = `
    <div><span>Total skuld:</span> <strong style="color:#ff6b6b;">${saldo.toLocaleString('sv-SE')} kr</strong></div>
    <div><span>${periodLabel}:</span> <strong>${fmtV(manad)}</strong>
      <span style="color:#888; font-size:12px;">(ränta ${fmtV(ranta)} + amortering ${fmtV(amort)})</span>
    </div>`;
	  const warnEl = card.querySelector('#skulder-warning');
  if (warnEl) warnEl.innerHTML = renderSkulderWarning();
}

function rerenderActiveSection() {
  if (activeSection === '__summary') { updateSummary(); return; }
  const sec = SECTIONS.find(s => s.id === activeSection);
  const card = document.querySelector(`[data-section-card="${activeSection}"]`);
  if (!card) return;
  const temp = document.createElement('div');
  temp.innerHTML = renderSection(sec);
  card.replaceWith(temp.firstElementChild);
  attachListeners();
  updateAllLiveSums();
}

// ─── Event listeners ───
function attachListeners() {
  document.querySelectorAll('[data-nav]').forEach(btn => {
    btn.onclick = () => {
      activeSection = btn.dataset.nav;
      renderActive();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
  });

  document.querySelectorAll('[data-goto]').forEach(btn => {
    btn.onclick = () => {
      activeSection = btn.dataset.goto;
      renderActive();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
  });

  document.querySelectorAll('[data-view-mode]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.viewMode === viewMode);
    btn.onclick = () => {
      if (btn.dataset.viewMode === viewMode) return;
      viewMode = btn.dataset.viewMode;
      scheduleSave();
      document.querySelectorAll('[data-view-mode]').forEach(b => {
        b.classList.toggle('active', b.dataset.viewMode === viewMode);
      });
      renderActive();
    };
  });

  document.querySelectorAll('[data-action="remove"]').forEach(btn => {
    btn.onclick = () => {
      removeItem(btn.dataset.section, btn.dataset.item);
      scheduleSave();
      renderActive();
    };
  });

  document.querySelectorAll('[data-action="add-top"]').forEach(sel => {
    sel.onchange = () => {
      if (!sel.value) return;
      addItem(sel.dataset.section, sel.value, null);
      scheduleSave();
      renderActive();
    };
  });

  document.querySelectorAll('[data-action="add-child"]').forEach(sel => {
    sel.onchange = () => {
      if (!sel.value) return;
      addItem(sel.dataset.section, sel.value, sel.dataset.parent);
      scheduleSave();
      renderActive();
    };
  });

  document.querySelectorAll('[data-item][data-field]').forEach(inp => {
    const found = findItem(inp.dataset.section, inp.dataset.item);
    if (!found) return;
    const t = TYPES[found.item.type];
    if (!t) return;
    const f = t.fields.find(x => x.id === inp.dataset.field);
    if (!f || f.type === 'hint') return;

        if (f.type === 'select') {
      inp.onchange = () => {
        found.item.values[inp.dataset.field] = inp.value;
        scheduleSave();
        updateAllLiveSums();
      };
      return;
    }

    if (f.type === 'checkbox') {
      inp.onchange = () => {
        found.item.values[inp.dataset.field] = inp.checked;
        scheduleSave();
        rerenderActiveSection();
      };
      return;
    }

    inp.oninput = () => {
      if (f.type === 'text') {
        found.item.values[inp.dataset.field] = inp.value;
        if (inp.dataset.field === 'namn') {
          const nameEl = document.querySelector(`[data-item-name="${found.item._id}"]`);
          if (nameEl) nameEl.textContent = inp.value || (t.custom ? 'Egen rad' : t.label);
        }
      } else {
        found.item.values[inp.dataset.field] = evalExpr(inp.value);
      }
      refreshComputedAndInfo(found.item, inp.dataset.section);
      scheduleSave();
      updateAllLiveSums();
    };

    if (f.type !== 'text') {
      inp.onkeydown = (e) => { if (e.key === 'Enter') inp.blur(); };
      inp.onblur = () => {
        const v = evalExpr(inp.value);
        inp.value = v;
        found.item.values[inp.dataset.field] = v;
        refreshComputedAndInfo(found.item, inp.dataset.section);
        scheduleSave();
        updateAllLiveSums();
      };
    }
  });
}

function refreshComputedAndInfo(item, sectionId) {
  const t = TYPES[item.type];
  if (!t) return;
  const itemEl = document.querySelector(`[data-item-render="${item._id}"]`);
  if (!itemEl) return;
  itemEl.querySelectorAll('[data-computed]').forEach(el => {
    const fieldId = el.dataset.computed;
    const f = t.fields.find(x => x.id === fieldId);
    if (f && f.formula) el.value = fmt(f.formula(item.values));
  });
  const infoEl = itemEl.querySelector(`[data-item-info="${item._id}"]`);
  if (infoEl && typeof t.info === 'function') infoEl.textContent = t.info(item.values);

  // Live-uppdatera lånesammanfattning
  if (t.isSkuld) {
    const loanEl = itemEl.querySelector(`[data-item-loan-summary="${item._id}"]`);
    if (loanEl) {
      const temp = document.createElement('div');
      temp.innerHTML = loanSummaryHtml(item);
      loanEl.replaceWith(temp.firstElementChild);
    }
  }
}