// ════════════════════════════════════════════════════════════════════
// STATE OCH ITEM-HANTERING – "motorn" v15
// ════════════════════════════════════════════════════════════════════

// ─── UTILS ───
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
const fmt = v => Math.round(v).toLocaleString('sv-SE') + ' kr';

// ─── VY-LÄGE (månad / år) ───
let viewMode = 'month';

function viewMultiplier() { return viewMode === 'year' ? 12 : 1; }
function viewUnit() { return viewMode === 'year' ? 'kr/år' : 'kr/mån'; }
function fmtV(v) { return Math.round(v * viewMultiplier()).toLocaleString('sv-SE') + ' kr'; }
function fmtVUnit(v) { return Math.round(v * viewMultiplier()).toLocaleString('sv-SE') + ' ' + viewUnit(); }

// Säker utvärdering av räknefält
function evalExpr(str) {
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
    function parseExpr() {
      let left = parseTerm();
      while (peek() === '+' || peek() === '-') {
        const op = consume();
        const right = parseTerm();
        left = op === '+' ? left + right : left - right;
      }
      return left;
    }
    function parseTerm() {
      let left = parseFactor();
      while (peek() === '*' || peek() === '/') {
        const op = consume();
        const right = parseFactor();
        left = op === '*' ? left * right : (right !== 0 ? left / right : 0);
      }
      return left;
    }
    function parseFactor() {
      if (peek() === '(') { consume(); const v = parseExpr(); if (peek() === ')') consume(); return v; }
      if (peek() === '-') { consume(); return -parseFactor(); }
      let n = '';
      while (peek() !== undefined && /[\d.]/.test(peek())) n += consume();
      return parseFloat(n) || 0;
    }
    const r = parseExpr();
    return Number.isFinite(r) ? r : 0;
  } catch (e) { return 0; }
}

// ─── STATE ───
let uidCounter = 0;
const uid = () => 'x' + (++uidCounter);
const state = { items: {} };
SECTIONS.forEach(s => state.items[s.id] = []);

// ─── ITEM-HANTERING ───
function makeItem(typeId) {
  const t = TYPES[typeId];
  const item = { _id: uid(), type: typeId, values: {}, items: [] };
    (t.fields || []).forEach(f => {
    if (f.type === 'computed' || f.type === 'hint') return;
    if (f.type === 'checkbox') item.values[f.id] = f.default === true;
    else if (f.type === 'text' || f.type === 'select') item.values[f.id] = f.default ?? '';
    else item.values[f.id] = f.default ?? 0;
  });
  return item;
}
function findItemInTree(items, id) {
  for (const it of items) {
    if (it._id === id) return { item: it, parentArray: items };
    const f = findItemInTree(it.items, id);
    if (f) return f;
  }
  return null;
}
function findItem(sectionId, id) { return findItemInTree(state.items[sectionId], id); }
function removeItem(sectionId, id) {
  const f = findItem(sectionId, id);
  if (!f) return;
  const i = f.parentArray.indexOf(f.item);
  if (i >= 0) f.parentArray.splice(i, 1);
}
function addItem(sectionId, typeId, parentId) {
  const t = TYPES[typeId];
  const newItem = makeItem(typeId);
  const targetArray = parentId ? findItem(sectionId, parentId).item.items : state.items[sectionId];
  if (t.singleton) {
    const i = targetArray.findIndex(x => x.type === typeId);
    if (i >= 0) { targetArray[i] = newItem; return; }
  }
  targetArray.push(newItem);
}

// ─── AUTO-PINNADE POSTER (buffert etc.) ───
// Ser till att vissa singletons alltid finns i sin sektion och ligger först.
function ensurePinnedItems() {
  // Buffert ska alltid finnas i Sparande och ligga först
  if (!state.items.sparande) state.items.sparande = [];
  const arr = state.items.sparande;
  const idx = arr.findIndex(it => it.type === 'buffert_saldo');
  if (idx === -1) {
    arr.unshift(makeItem('buffert_saldo'));
  } else if (idx > 0) {
    const [buffert] = arr.splice(idx, 1);
    arr.unshift(buffert);
  }
}

// ─── SUMMERING ───
function itemTotal(item) {
  const t = TYPES[item.type];
  if (!t) return 0;
  if (t.isReference) return 0;
  if (t.isBalance) return 0;
  if (t.compute) return t.compute(item.values);
  let sum = 0;
  (t.fields || []).forEach(f => {
        if (f.type === 'computed' || f.type === 'text' || f.type === 'checkbox' || f.type === 'percent' || f.type === 'hint' || f.type === 'select') return;
    sum += parseFloat(item.values[f.id]) || 0;
  });
  (item.items || []).forEach(c => sum += itemTotal(c));
  return sum;
}
function sumSection(sectionId) {
  return (state.items[sectionId] || []).reduce((s, it) => s + itemTotal(it), 0);
}
function totalIncome()  { return sumSection('inkomster'); }
function totalSavings() { return sumSection('sparande'); }

// Årsinkomst i BRUTTO — används för skuldkvot (FI:s regler bygger på brutto).
// Lön räknas om från netto om _netto_mode är satt, övriga inkomster används som de är.
function getAnnualGrossIncome() {
  let sum = 0;
  (state.items.inkomster || []).forEach(it => {
    const t = TYPES[it.type];
    if (it.type === 'lon') {
      if (it.values._netto_mode) {
        const netto = parseFloat(it.values.netto_manual) || 0;
        const skatt = parseFloat(it.values.skatt_procent) || 32;
        sum += skatt < 100 ? netto / (1 - skatt / 100) : netto;
      } else {
        sum += parseFloat(it.values.brutto) || 0;
      }
    } else {
      const belopp = parseFloat(it.values.belopp) || 0;
      const taxRate = (t && typeof t.taxRate === 'number') ? t.taxRate : 30;
      sum += taxRate > 0 ? belopp / (1 - taxRate / 100) : belopp;
    }
  });
  return sum * 12;
}

function sumByKlass(klass) {
  let sum = 0;
  function walk(item) {
    const t = TYPES[item.type];
    if (!t) { (item.items || []).forEach(walk); return; }
    if (t.klass === klass && !t.isBalance && !t.isSkuld && !t.isReference) {
      let itemSum = 0;
      (t.fields || []).forEach(f => {
            if (f.type === 'computed' || f.type === 'text' || f.type === 'checkbox' || f.type === 'percent' || f.type === 'hint' || f.type === 'select') return;
        itemSum += parseFloat(item.values[f.id]) || 0;
      });
      sum += itemSum;
    }
    (item.items || []).forEach(walk);
  }
  ['boende','transport','mat','barn','personligt','forsakringar','vard','noje','ovrigt']
    .forEach(sid => (state.items[sid] || []).forEach(walk));
  return sum;
}
function sumByGroup(group) {
  let sum = 0;
  function walk(item) {
    const t = TYPES[item.type];
    if (!t) { (item.items || []).forEach(walk); return; }
    if (t.grupp === group) {
      let itemSum = 0;
      (t.fields || []).forEach(f => {
            if (f.type === 'computed' || f.type === 'text' || f.type === 'checkbox' || f.type === 'percent' || f.type === 'hint' || f.type === 'select') return;
        itemSum += parseFloat(item.values[f.id]) || 0;
      });
      sum += itemSum;
    }
    (item.items || []).forEach(walk);
  }
  ['boende','transport','mat','barn','personligt','forsakringar','vard','noje','ovrigt']
    .forEach(sid => (state.items[sid] || []).forEach(walk));
  return sum;
}

// ─── BUFFERT ───
function getBuffertSaldo() {
  let sum = 0;
  (state.items.sparande || []).forEach(it => {
    if (it.type === 'buffert_saldo') sum += parseFloat(it.values.belopp) || 0;
  });
  return sum;
}

// ─── FIRE-HINKAR ───
// Läser vilken hink en item hör till. Väljare i fältet vinner över
// typens fasta fireBucket, så användaren kan göra avvikelser.
function getFireBucket(item) {
  const t = TYPES[item.type];
  if (!t) return null;

  // Har typen ett fire_bucket-fält? Använd det i första hand.
  const selectField = (t.fields || []).find(f => f.id === 'fire_bucket');
  if (selectField) {
    const v = item.values.fire_bucket;
    if (v) return v;
    // Inget aktivt val → använd typens fasta fireBucket (bakåtkompatibelt)
    return t.fireBucket ?? null;
  }
  return t.fireBucket ?? null;
}

// Summerar alla månadssparanden i en hink.
// Saldon (isBalance) räknas inte — de är inte månadsflöden.
function sumByFireBucket(bucket) {
  let sum = 0;
  (state.items.sparande || []).forEach(it => {
    const t = TYPES[it.type];
    if (!t || t.isBalance) return;
    if (getFireBucket(it) === bucket) sum += itemTotal(it);
  });
  return sum;
}

// ─── SKULDER ───
function sumSkulderSaldo() {
  let sum = 0;
  (state.items.skulder || []).forEach(it => {
    sum += parseFloat(it.values.saldo) || 0;
  });
  return sum;
}
function sumSkulderManad() {
  let sum = 0;
  (state.items.skulder || []).forEach(it => {
    sum += itemTotal(it);
  });
  return sum;
}
function sumSkulderRanta() {
  let sum = 0;
  (state.items.skulder || []).forEach(it => {
    sum += ((parseFloat(it.values.saldo)||0) * (parseFloat(it.values.ranta_procent)||0) / 100 / 12);
  });
  return sum;
}
function sumSkulderAmortering() {
  let sum = 0;
  (state.items.skulder || []).forEach(it => {
    sum += parseFloat(it.values.amortering) || 0;
  });
  return sum;
}

// Hämta total förbrukningsvaror (Övrigt)
function getForbrukningsvaror() {
  let sum = 0;
  (state.items.ovrigt || []).forEach(it => {
    if (it.type === 'forbrukningsvaror') sum += parseFloat(it.values.belopp) || 0;
  });
  return sum;
}

// Bolånets månadskostnad (ränta + amortering) — används av barnkostnader
// så att barnens andel av boendet inkluderar den största utgiften.
function getBolanManadskostnad() {
  let sum = 0;
  (state.items.skulder || []).forEach(it => {
    if (it.type !== 'skuld_bolan') return;
    const saldo  = parseFloat(it.values.saldo) || 0;
    const ranta  = parseFloat(it.values.ranta_procent) || 0;
    const amort  = parseFloat(it.values.amortering) || 0;
    sum += (saldo * ranta / 100 / 12) + amort;
  });
  return sum;
}

// ─── BARNKOSTNADER ───
function getBarnkostnader() {
  const barnItems = state.items.barn || [];
  if (barnItems.length === 0) return null;

  const totalMat = sumSection('mat');
  const totalBoende = sumSection('boende') + getBolanManadskostnad();
  const totalForbrukning = getForbrukningsvaror();

  const bk = {
    mat_dryck: 0, klader_skor: 0, forskola: 0, gemensamt: 0, hygien: 0,
    aktiviteter: 0, leksaker: 0, veckopeng: 0, barnvakt: 0, forsakring: 0, ovrigt: 0,
    total: 0,
    matAndelTotal: 0, boendeAndelTotal: 0,
    antal: barnItems.length,
    perBarn: [],
  };

  barnItems.forEach(barn => {
    const matAndel = parseFloat(barn.values.mat_andel) || 0;
    const boendeAndel = parseFloat(barn.values.boende_andel) || 0;
    const matKr = totalMat * (matAndel / 100);
    const gemensamtKr = (totalBoende + totalForbrukning) * (boendeAndel / 100);

    const barnSum = { klader: 0, forskola: 0, hygien: 0, aktiviteter: 0, leksaker: 0, veckopeng: 0, barnvakt: 0, forsakring: 0, ovrigt: 0 };
    (barn.items || []).forEach(child => {
      const amt = itemTotal(child);
      switch (child.type) {
        case 'klader_barn':      barnSum.klader += amt; break;
        case 'forskola':         barnSum.forskola += amt; break;
        case 'hygien_barn':      barnSum.hygien += amt; break;
        case 'aktiviteter_barn': barnSum.aktiviteter += amt; break;
        case 'leksaker':         barnSum.leksaker += amt; break;
        case 'veckopeng':        barnSum.veckopeng += amt; break;
        case 'barnvakt':         barnSum.barnvakt += amt; break;
        case 'barnforsakring':   barnSum.forsakring += amt; break;
        case 'barn_custom':      barnSum.ovrigt += amt; break;
		case 'lager':           barnSum.ovrigt += amt; break;
		case 'skolmaterial':    barnSum.ovrigt += amt; break;
      }
    });

    const childTotal = matKr + gemensamtKr
      + barnSum.klader + barnSum.forskola + barnSum.hygien + barnSum.aktiviteter
      + barnSum.leksaker + barnSum.veckopeng + barnSum.barnvakt + barnSum.forsakring + barnSum.ovrigt;

    bk.mat_dryck += matKr;
    bk.gemensamt += gemensamtKr;
    bk.klader_skor += barnSum.klader;
    bk.forskola += barnSum.forskola;
    bk.hygien += barnSum.hygien;
    bk.aktiviteter += barnSum.aktiviteter;
    bk.leksaker += barnSum.leksaker;
    bk.veckopeng += barnSum.veckopeng;
    bk.barnvakt += barnSum.barnvakt;
    bk.forsakring += barnSum.forsakring;
    bk.ovrigt += barnSum.ovrigt;
    bk.total += childTotal;
    bk.matAndelTotal += matAndel;
    bk.boendeAndelTotal += boendeAndel;

    bk.perBarn.push({
      namn: barn.values.namn || 'Barn',
      mat_andel: matAndel, boende_andel: boendeAndel,
      mat_kr: matKr, gemensamt_kr: gemensamtKr,
      klader: barnSum.klader, forskola: barnSum.forskola, hygien: barnSum.hygien,
      aktiviteter: barnSum.aktiviteter, leksaker: barnSum.leksaker,
      veckopeng: barnSum.veckopeng, barnvakt: barnSum.barnvakt,
      forsakring: barnSum.forsakring, ovrigt: barnSum.ovrigt,
      total: childTotal,
    });
  });

  return bk;
}

// ─── BASELINES ───
function getBaselines() {
  const vuxna = (state.items.personer || []).filter(p => p.type === 'person_vuxen').length || 1;
  const barn = (state.items.personer || []).filter(p => p.type === 'person_barn').length || 0;
  const totalPers = vuxna + barn;

  let boende, mat, transport, forsakringar, noje, personligt;
  if (vuxna === 1 && barn === 0) { boende = 32; mat = 13; transport = 13; forsakringar = 4; noje = 16; personligt = 8; }
  else if (vuxna === 1 && barn > 0) { boende = 33; mat = 13; transport = 15; forsakringar = 6; noje = 14.7; personligt = 7.9; }
  else if (vuxna === 2 && barn === 0) { boende = 22; mat = 12; transport = 15; forsakringar = 5; noje = 14.7; personligt = 7.9; }
  else { boende = 22; mat = 13; transport = 15; forsakringar = 6; noje = 14.7; personligt = 7.9; }
  const sparande = 10, vard = 4.2, ovrigt = 22.8;

  let matReferensKr;
  if (vuxna === 1 && barn === 0) matReferensKr = 3700;
  else matReferensKr = (vuxna * 3200) + (barn * 2500);

  const vuxenText = `${vuxna} ${vuxna === 1 ? 'vuxen' : 'vuxna'}`;
  const barnText = barn > 0 ? `, ${barn} barn` : '';

  return {
    vuxna, barn, totalPers,
    boende, mat, transport, forsakringar, sparande, noje, personligt, vard, ovrigt,
    matReferensKr,
    label: `${vuxenText}${barnText}`
  };
}