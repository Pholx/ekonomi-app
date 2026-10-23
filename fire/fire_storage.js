// ════════════════════════════════════════════════════════════════════
// FIRE STORAGE – autosave, load, badge
// ════════════════════════════════════════════════════════════════════
// Sparar alla fält + assetStructure till localStorage.
// Läser in vid sidladdning INNAN renderAssets() och updateFireTable().
// ════════════════════════════════════════════════════════════════════

const FIRE_STORAGE_KEY = 'fire_settings_v1';
const FIRE_STORAGE_VERSION = 1;

// Samma ID-lista som fire_calculator.js använder i export/import
const FIRE_FIELD_IDS = [
  'isk-balance','isk-tax','depa-value','depa-cost','save-isk','save-depa',
  'fixed-costs','variable-costs','house-upkeep','other-costs','mortgage-debt','interest-rate',
  'amortization','inflation','house-appreciation','sim-years','fire-start-year',
  'include-house','monte-carlo','amortization-rules','house-value','withdrawal-strategy'
];

let fireSaveTimeout = null;

// ─── Samla in state från DOM ───
function fireCollectState() {
  const settings = {};
  FIRE_FIELD_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    settings[id] = el.type === 'checkbox' ? el.checked : el.value;
  });
    settings.assetStructure = [];
  if (typeof assetStructure !== 'undefined') {
    assetStructure.forEach(a => {
      settings.assetStructure.push({
        id: a.id,
        allocIsk: a.allocIsk,
        allocDepa: a.allocDepa
      });
    });
  }
  settings.fireAccounts = (typeof FireAccounts !== 'undefined') ? FireAccounts.export() : [];
  return settings;
}

// ─── Applicera state på DOM + assetStructure ───
function fireApplyState(settings) {
  if (!settings) return;
  FIRE_FIELD_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (!el || settings[id] === undefined) return;
    if (el.type === 'checkbox') el.checked = !!settings[id];
    else el.value = settings[id];
  });
    if (settings.assetStructure && typeof assetStructure !== 'undefined') {
    settings.assetStructure.forEach(saved => {
      const a = assetStructure.find(x => x.id === saved.id);
      if (a) {
        if (saved.allocIsk  !== undefined) a.allocIsk  = saved.allocIsk;
        if (saved.allocDepa !== undefined) a.allocDepa = saved.allocDepa;
      }
    });
  }
  if (settings.fireAccounts && typeof FireAccounts !== 'undefined') {
    FireAccounts.import(settings.fireAccounts);
  }
}

// ─── Spara (debounced) ───
function fireSaveState() {
  try {
    const payload = {
      version: FIRE_STORAGE_VERSION,
      savedAt: new Date().toISOString(),
      settings: fireCollectState()
    };
    localStorage.setItem(FIRE_STORAGE_KEY, JSON.stringify(payload));
    fireShowSaveBadge();
  } catch (e) { console.warn('[FIRE storage] Kunde inte spara:', e); }
}

function fireScheduleSave() {
  if (fireSaveTimeout) clearTimeout(fireSaveTimeout);
  fireSaveTimeout = setTimeout(fireSaveState, 400);
}

function fireShowSaveBadge() {
  const el = document.getElementById('save-badge');
  if (!el) return;
  el.classList.add('visible');
  clearTimeout(el._timeout);
  el._timeout = setTimeout(() => el.classList.remove('visible'), 1200);
}

// ─── Ladda ───
function fireLoadState() {
  try {
    const raw = localStorage.getItem(FIRE_STORAGE_KEY);
    if (!raw) return false;
    const payload = JSON.parse(raw);
    if (!payload || !payload.settings) return false;
    fireApplyState(payload.settings);
    return true;
  } catch (e) { console.warn('[FIRE storage] Kunde inte ladda:', e); return false; }
}

// ─── Rensa ───
function fireClearState() {
  if (!confirm('Rensa all sparad FIRE-data? Detta går inte att ångra.')) return;
  localStorage.removeItem(FIRE_STORAGE_KEY);
  location.reload();
}

// ─── Koppla på autosave-events ───
function fireAttachAutosave() {
  // Fastfälten (finns i DOM från start)
  FIRE_FIELD_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const evt = (el.type === 'checkbox' || el.tagName === 'SELECT') ? 'change' : 'input';
	el.addEventListener(evt, fireScheduleSave);
  });

  // Allokeringsfälten (skapas dynamiskt av renderAssets, men bubbling
  // från #allocation-card fångar dem)
  const allocCard = document.getElementById('allocation-card');
  if (allocCard) {
    allocCard.addEventListener('input',  fireScheduleSave);
    allocCard.addEventListener('change', fireScheduleSave);
  }
}

// ─── Initiera ───
document.addEventListener('DOMContentLoaded', () => {
  fireLoadState();        // läser in till DOM + assetStructure
  fireAttachAutosave();   // kopplar på framtida ändringar (delegerat på #allocation-card)

  // Rita om allokeringen EFTER att ha läst in state.
  // Ordningen är viktig: assets_manager.js och fire_calculator.js hinner
  // redan ha ritat rutnätet med tomma värden innan vi laddar. Utan detta
  // steg skulle DOM visa nollor trots att assetStructure är rätt ifylld –
  // och nästa autosave skulle skriva tillbaka nollorna till localStorage.
  if (typeof renderAssets === 'function') {
    renderAssets();
  }
});