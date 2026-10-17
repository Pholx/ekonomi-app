// ════════════════════════════════════════════════════════════════════
// LOCALSTORAGE + IMPORT/EXPORT
// ════════════════════════════════════════════════════════════════════

const STORAGE_KEY = BUDGET_STORAGE_KEY;  // alias – hanteras centralt i data.js
const STORAGE_VERSION = 3;
let saveTimeout = null;

// ─── MIGRERING: ta bort items med okända typer ───
function migrateItems() {
  const knownTypes = Object.keys(TYPES);
  let removed = 0;
  function cleanArray(arr) {
    for (let i = arr.length - 1; i >= 0; i--) {
      const it = arr[i];
      if (!it || !it.type || !knownTypes.includes(it.type)) {
        console.warn('Migrering: tar bort okänd typ:', it && it.type, it && it._id);
        arr.splice(i, 1);
        removed++;
      } else if (it.items && it.items.length) {
        cleanArray(it.items);
      }
    }
  }
  Object.values(state.items).forEach(cleanArray);
  if (removed > 0) console.info(`Migrering klar: ${removed} gamla poster borttagna.`);
  return removed;
}

// ─── MIGRERING: 'ej_fire' → 'trygghet' ───
// Båda värdena exkluderas från FIRE, så semantiken är oförändrad.
// Vi behöver bara mappa om värdet så att rullgardinen hittar rätt option.
function migrateFireBuckets() {
  let count = 0;
  function walk(arr) {
    arr.forEach(it => {
      if (it.values && it.values.fire_bucket === 'ej_fire') {
        it.values.fire_bucket = 'trygghet';
        count++;
      }
      if (it.items && it.items.length) walk(it.items);
    });
  }
  Object.values(state.items).forEach(walk);
  if (count > 0) console.info(`Migrering klar: ${count} fire_bucket-värden uppdaterade.`);
  return count;
}

function saveState() {
  try {
    const payload = {
      version: STORAGE_VERSION,
      savedAt: new Date().toISOString(),
      items: state.items,
      uidCounter: uidCounter,
      viewMode: viewMode,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    showSaveBadge();
  } catch (e) { console.warn('Kunde inte spara:', e); }
}

function scheduleSave() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(saveState, 400);
}

function showSaveBadge() {
  const el = document.getElementById('save-badge');
  if (!el) return;
  el.classList.add('visible');
  clearTimeout(el._timeout);
  el._timeout = setTimeout(() => el.classList.remove('visible'), 1200);
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const payload = JSON.parse(raw);
    if (!payload || !payload.items) return false;
    SECTIONS.forEach(s => { if (!payload.items[s.id]) payload.items[s.id] = []; });
    state.items = payload.items;
    if (payload.uidCounter && payload.uidCounter > uidCounter) uidCounter = payload.uidCounter;
    if (payload.viewMode === 'year' || payload.viewMode === 'month') viewMode = payload.viewMode;

    // Städa bort gamla items med okända typer
    const removed = migrateItems();
    if (removed > 0) scheduleSave();

    // Migrera gamla fire_bucket-värden: 'ej_fire' → 'trygghet'
    const migrated = migrateFireBuckets();
    if (migrated > 0) scheduleSave();

    return true;
  } catch (e) { console.warn('Kunde inte ladda:', e); return false; }
}

function clearState() {
  if (!confirm('Vill du rensa all sparad data? Detta går inte att ångra.')) return;
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
}

function exportToFile() {
  const payload = { version: STORAGE_VERSION, savedAt: new Date().toISOString(), items: state.items, viewMode: viewMode };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  a.download = `budget-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importFromFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const payload = JSON.parse(ev.target.result);
        if (!payload.items) throw new Error('Ogiltig fil');
        SECTIONS.forEach(s => { if (!payload.items[s.id]) payload.items[s.id] = []; });
        state.items = payload.items;
        if (payload.viewMode === 'year' || payload.viewMode === 'month') viewMode = payload.viewMode;
        uidCounter = 0;
        const scan = (arr) => arr.forEach(it => {
          const m = it._id && it._id.match(/^x(\d+)$/);
          if (m) uidCounter = Math.max(uidCounter, parseInt(m[1], 10));
          if (it.items) scan(it.items);
        });
        Object.values(state.items).forEach(scan);

        // Städa bort okända typer från importerad fil
        migrateItems();

        // Migrera fire_bucket-värden i importerad fil
        migrateFireBuckets();

        saveState();
        renderAll();
      } catch (err) { alert('Kunde inte läsa filen: ' + err.message); }
    };
    reader.readAsText(file);
  };
  input.click();
}