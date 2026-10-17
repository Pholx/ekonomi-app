// ════════════════════════════════════════════════════════════════════
// KONFIGURATION – allt du ändrar när du vill lägga till nya typer (v15)
// ════════════════════════════════════════════════════════════════════

const num = (id, label, opts={}) => ({ id, label, type:'calc', ...opts });
const pctField = (id, label, opts={}) => ({ id, label, type:'percent', ...opts });
const txt = (id, label) => ({ id, label, type:'text' });
// ─── STORAGE-KONSTANT (används av storage, bridge, compare*.js) ───
const BUDGET_STORAGE_KEY = 'budget_items_v16';

// Rullgardin för FIRE-hinkval
const fireBucketField = (defaultVal = 'trygghet') => ({
  id: 'fire_bucket',
  label: 'Räknas som',
  type: 'select',
  default: defaultVal,
  options: [
    { value: 'isk',      label: '📈 ISK (räknas i FIRE)' },
    { value: 'depa',     label: '💼 Depå (räknas i FIRE)' },
    { value: 'trygghet', label: '🛟 Utanför FIRE' }
  ]
});

// ─── TYPER ───
// klass: 'fast' | 'rörlig'  → för fasta/rörliga sammanställningen
// grupp: 'försäkring' etc.  → för korsvisa sammanställningar
// childOnly: true           → visas bara inuti en container
// isBalance: true           → saldo, räknas inte som månadskostnad
// isSkuld: true             → skuld med saldo + ränta + amortering
// isReference: true         → hänvisning, ingen inmatning, ingen summa
const TYPES = {
  // ─── PERSONER ───
  'person_vuxen': {
    section:'personer', label:'Vuxen', repeatable:true,
    fields:[
      txt('namn','Namn (valfritt)'),
      num('alder','Ålder (valfritt, för jämförelse)'),
      { id:'kon', label:'Kön (för jämförelse)', type:'select', default:'',
        options:[
          { value:'',       label:'— Välj —' },
          { value:'man',    label:'Man' },
          { value:'kvinna', label:'Kvinna' },
          { value:'annat',  label:'Annat / vill ej uppge' }
        ]
      }
    ]
  },
  'person_barn': {
    section:'personer', label:'Barn', repeatable:true,
    fields:[txt('namn','Namn (valfritt)'), num('alder','Ålder (valfritt)')]
  },

  // ─── INKOMSTER ───
  'lon': {
    section:'inkomster', label:'Lön', repeatable:true,
    fields:[
      { id:'_netto_mode', label:'Fyll i netto direkt (annars räknas nettot från brutto)', type:'checkbox' },
      { id:'brutto', label:'Brutto (kr/mån)', type:'calc', visibleWhen: v => !v._netto_mode },
      { id:'skatt_procent', label:'Skattesats (%)', type:'calc', default:32, visibleWhen: v => !v._netto_mode },
      { id:'netto_manual', label:'Netto (kr/mån)', type:'calc', visibleWhen: v => v._netto_mode },
      { id:'netto_display', label:'Netto (beräknas)', type:'computed',
        visibleWhen: v => !v._netto_mode,
        formula: v => {
          const b = parseFloat(v.brutto) || 0;
          const s = parseFloat(v.skatt_procent) || 0;
          return b * (1 - s / 100);
        } }
    ],
    compute: v => {
      if (v._netto_mode) return parseFloat(v.netto_manual) || 0;
      const b = parseFloat(v.brutto) || 0;
      const s = parseFloat(v.skatt_procent) || 0;
      return b * (1 - s / 100);
    },
    info: v => {
      if (v._netto_mode) return 'Du fyller i netto direkt';
      const b = parseFloat(v.brutto) || 0;
      const s = parseFloat(v.skatt_procent) || 0;
      const netto = b * (1 - s / 100);
      const skatt = b - netto;
      return `→ Skatt ca ${s}% · ${Math.round(skatt).toLocaleString('sv-SE')} kr i skatt · netto ${Math.round(netto).toLocaleString('sv-SE')} kr/mån`;
    }
  },
  'extrajobb':         { section:'inkomster', label:'Extrajobb',                 fields:[num('belopp','Belopp (netto)')], taxRate: 30 },
  'barnbidrag':        { section:'inkomster', label:'Barnbidrag',                fields:[num('belopp','Belopp (netto, skattefritt)')], taxRate: 0 },
  'bostadsbidrag':     { section:'inkomster', label:'Bostadsbidrag',             fields:[num('belopp','Belopp (netto, skattefritt)')], taxRate: 0 },
  'foraldrapenning':   { section:'inkomster', label:'Föräldrapenning (FK)',      fields:[num('belopp','Belopp (netto)')], taxRate: 30 },
  'vab':               { section:'inkomster', label:'VAB – Vård av barn',        fields:[num('belopp','Belopp (netto)')], taxRate: 30 },
  'studiemedel':       { section:'inkomster', label:'Studiemedel (CSN)',         fields:[num('belopp','Belopp (netto)')], taxRate: 0 },
  'pension_allman':    { section:'inkomster', label:'Allmän pension',            fields:[num('belopp','Belopp (netto)')], taxRate: 30 },
  'pension_tjanste':   { section:'inkomster', label:'Tjänstepension',            fields:[num('belopp','Belopp (netto)')], taxRate: 30 },
  'hyresintakt':       { section:'inkomster', label:'Hyresintäkter (uthyrning)', fields:[num('belopp','Belopp (netto efter skatt)')], taxRate: 30 },
  'andra_bidrag':      { section:'inkomster', label:'Övriga bidrag',             fields:[num('belopp','Belopp (netto)')], taxRate: 0 },
  'kapital':           { section:'inkomster', label:'Kapitalinkomster',          fields:[num('belopp','Belopp (netto efter skatt)')], taxRate: 10 },
  'inkomst_custom':    { section:'inkomster', label:'Egen inkomst', custom:true, fields:[txt('namn','Namn (valfritt)'), num('belopp','Belopp (netto)')], taxRate: 30 },

  // ─── SPARANDE ───
  'buffert_saldo': { section:'sparande', label:'Nuvarande buffert (saldo)', singleton:true, isBalance:true,
    fireBucket: 'trygghet',
    fields:[num('belopp','Totalt belopp (kr)')] },
  'spar_buffert':  { section:'sparande', label:'Månadssparande buffert 🛟 Utanför FIRE',
    fireBucket: 'trygghet',
    fields:[num('belopp','Belopp')] },
  'spar_isk':      { section:'sparande', label:'Långsiktigt sparande 📈 ISK',
    fireBucket: 'isk',
    fields:[num('belopp','Belopp')] },
  'spar_depa':     { section:'sparande', label:'Långsiktigt sparande 💼 Depå',
    fireBucket: 'depa',
    fields:[num('belopp','Belopp')] },
  'spar_pension':  { section:'sparande', label:'Pensionssparande',
    fireBucket: 'isk',
    fields:[num('belopp','Belopp'), fireBucketField('isk')] },
  'spar_barn':     { section:'sparande', label:'Barnsparande',
    fireBucket: 'trygghet',
    fields:[num('belopp','Belopp'), fireBucketField()] },
  'spar_hus':      { section:'sparande', label:'Sparande till hus 🛟 Utanför FIRE',
    fireBucket: 'trygghet',
    fields:[num('belopp','Belopp')] },
  'spar_bil':      { section:'sparande', label:'Sparande till bil 🛟 Utanför FIRE',
    fireBucket: 'trygghet',
    fields:[num('belopp','Belopp')] },
  'spar_semester': { section:'sparande', label:'Sparande till semester 🛟 Utanför FIRE',
    fireBucket: 'trygghet',
    fields:[num('belopp','Belopp')] },
  'spar_custom':   { section:'sparande', label:'Eget sparande', custom:true,
    fireBucket: 'trygghet',
    fields:[txt('namn','Namn (valfritt)'), num('belopp','Belopp'), fireBucketField()] },


  // ─── BOENDE – former ───
  'boende_foraldrar':   { section:'boende', label:'Hos föräldrar', repeatable:true,
    fields:[txt('namn','Namn (t.ex. Hos mamma)')],
    children:['bidrag_hem','boende_custom'] },
  'boende_hyra_varm':   { section:'boende', label:'Hyresrätt – varmhyra', repeatable:true,
    fields:[txt('namn','Namn (t.ex. Lägenhet Vasastan)')],
    children:['hyra','hushallsel','hemfors_bo','bredband_bo','parkering_bo','boende_custom'] },
  'boende_hyra_kall':   { section:'boende', label:'Hyresrätt – kallhyra', repeatable:true,
    fields:[txt('namn','Namn (t.ex. Lägenhet Solna)')],
    children:['hyra','el','varme','vatten','sophamtn','hemfors_bo','bredband_bo','parkering_bo','boende_custom'] },
  'boende_bostadsratt': { section:'boende', label:'Bostadsrätt', repeatable:true,
    fields:[txt('namn','Namn (t.ex. BRF Ekorren)')],
    children:['manadsavg','bolan_ref','el','varme','fors_br','bredband_bo','parkering_bo','underhall','boende_custom'] },
  'boende_hus_aga':     { section:'boende', label:'Hus / Radhus (ägt)', repeatable:true,
    fields:[txt('namn','Namn (t.ex. Villa Solliden)')],
    children:['bolan_ref','fastighetsavg','el','varme','vatten','sophamtn','sotning','samfallighet','larm','villahemfors','bredband_bo','underhall','tradgard','sno','boende_custom'] },
  'boende_hus_hyra':    { section:'boende', label:'Hus / Radhus (hyrt)', repeatable:true,
    fields:[txt('namn','Namn (t.ex. Hyrt hus i Bromma)')],
    children:['hyra','el','varme','vatten','sophamtn','sotning','hemfors_bo','bredband_bo','boende_custom'] },

  // ─── BOENDE – kostnader (childOnly) ───
  'bidrag_hem':   { section:'boende', label:'Bidrag till hushållet',         fields:[num('belopp','Belopp')], klass:'fast', childOnly:true },
  'hyra':         { section:'boende', label:'Hyra',                          fields:[num('belopp','Belopp')], klass:'fast', childOnly:true },
  'el':           { section:'boende', label:'El',                            fields:[num('belopp','Belopp')], klass:'rörlig', childOnly:true },
  'hushallsel':   { section:'boende', label:'Hushållsel (utöver varmhyran)', fields:[num('belopp','Belopp')], klass:'rörlig', childOnly:true },
  'varme':        { section:'boende', label:'Värme',                         fields:[num('belopp','Belopp')], klass:'fast', childOnly:true },
  'vatten':       { section:'boende', label:'Vatten & avlopp',               fields:[num('belopp','Belopp')], klass:'fast', childOnly:true },
  'sophamtn':     { section:'boende', label:'Sophämtning',                   fields:[num('belopp','Belopp')], klass:'fast', childOnly:true },
  'sotning':      { section:'boende', label:'Sotning',                       fields:[num('belopp','Snitt per månad')], klass:'fast', childOnly:true },
  'samfallighet': { section:'boende', label:'Samfällighet / vägförening',    fields:[num('belopp','Belopp')], klass:'fast', childOnly:true },
  'larm':         { section:'boende', label:'Larm (villalarm)',              fields:[num('belopp','Belopp')], klass:'fast', childOnly:true },
  'fastighetsavg':{ section:'boende', label:'Fastighetsavgift',              fields:[num('belopp','Belopp')], klass:'fast', childOnly:true },
  'hemfors_bo':   { section:'boende', label:'Hemförsäkring',                 fields:[num('belopp','Belopp')], klass:'fast', grupp:'försäkring', childOnly:true },
  'villahemfors': { section:'boende', label:'Villahemförsäkring',            fields:[num('belopp','Belopp')], klass:'fast', grupp:'försäkring', childOnly:true },
  'fors_br':      { section:'boende', label:'Bostadsrättsförsäkring',        fields:[num('belopp','Belopp')], klass:'fast', grupp:'försäkring', childOnly:true },
  'bredband_bo':  { section:'boende', label:'Bredband',                      fields:[num('belopp','Belopp')], klass:'fast', childOnly:true },
  'parkering_bo': { section:'boende', label:'Parkering / garage',            fields:[num('belopp','Belopp')], klass:'fast', childOnly:true },
  'manadsavg':    { section:'boende', label:'Månadsavgift (BRF)',            fields:[num('belopp','Belopp')], klass:'fast', childOnly:true },
  'underhall':    { section:'boende', label:'Underhåll',                     fields:[num('belopp','Snitt per månad')], klass:'rörlig', childOnly:true },
  'tradgard':     { section:'boende', label:'Trädgård',                      fields:[num('belopp','Belopp')], klass:'rörlig', childOnly:true },
  'sno':          { section:'boende', label:'Snöröjning',                    fields:[num('belopp','Belopp')], klass:'fast', childOnly:true },
  'boende_custom':{ section:'boende', label:'Egen kostnad', custom:true, fields:[txt('namn','Namn (valfritt)'), num('belopp','Belopp')], klass:'fast', childOnly:true },

  // ─── HÄNVISNING: Bolån ───
  'bolan_ref': {
    section:'boende', label:'Bolån', childOnly:true, isReference:true, singleton:true,
    fields:[
      { id:'hint', label:'💡 Ditt bolån hanteras under fliken 💳 12. Skulder – där fyller du i saldo, ränta och amortering. Räntan och amorteringen räknas automatiskt in i din månadskostnad.', type:'hint' }
    ]
  },

  // ─── TRANSPORT – containrar ───
  'bil': {
    section:'transport', label:'Bil', repeatable:true,
    fields:[txt('namn','Namn (t.ex. Volvo V60)')],
    children:['billan_ref','bil_bransle','bil_fors','bil_skatt','bil_service','bil_dack','bil_besiktning','bil_parkering','bil_tvatt','bil_farja','bil_custom']
  },
  'mc': {
    section:'transport', label:'MC / moped', repeatable:true,
    fields:[txt('namn','Namn (t.ex. Yamaha MT-07)')],
    children:['mc_bransle','mc_fors','mc_skatt','mc_service','mc_parkering','mc_custom']
  },
  'kollektivt':   { section:'transport', label:'Kollektivtrafik',        fields:[num('belopp','Belopp')], klass:'fast' },
  'taxi':         { section:'transport', label:'Taxi / Uber',           fields:[num('belopp','Belopp')], klass:'rörlig' },
  'flyg':         { section:'transport', label:'Flyg',                  fields:[num('belopp','Snitt per månad')], klass:'rörlig' },
  'cykel':        { section:'transport', label:'Cykel / underhåll',      fields:[num('belopp','Belopp')], klass:'rörlig' },
  'transport_custom': { section:'transport', label:'Eget transportmedel', custom:true, fields:[txt('namn','Namn (valfritt)'), num('belopp','Belopp')], klass:'fast' },

  // ─── HÄNVISNING: Billån ───
  'billan_ref': {
    section:'transport', label:'Billån', childOnly:true, isReference:true, singleton:true,
    fields:[
      { id:'hint', label:'💡 Har du billån? Fyll i det under fliken 💳 12. Skulder – saldo, ränta och amortering. Räntan och amorteringen räknas automatiskt in i din månadskostnad.', type:'hint' }
    ]
  },

  // ─── TRANSPORT – Bil (childOnly) ───
  'bil_bransle':      { section:'transport', label:'Bränsle / laddning',              fields:[num('belopp','Belopp')], klass:'rörlig', childOnly:true },
  'bil_fors':         { section:'transport', label:'Försäkring',                      fields:[num('belopp','Belopp')], klass:'fast', grupp:'försäkring', childOnly:true },
  'bil_skatt':        { section:'transport', label:'Skatt',                           fields:[num('belopp','Belopp')], klass:'fast', childOnly:true },
  'bil_service':      { section:'transport', label:'Service & reparation',            fields:[num('belopp','Belopp')], klass:'rörlig', childOnly:true },
  'bil_dack':         { section:'transport', label:'Däck (snitt per månad)',          fields:[num('belopp','Snitt per månad')], klass:'rörlig', childOnly:true },
  'bil_besiktning':   { section:'transport', label:'Besiktning (snitt per månad)',    fields:[num('belopp','Snitt per månad')], klass:'fast', childOnly:true },
  'bil_parkering':    { section:'transport', label:'Parkering / trängselskatt',       fields:[num('belopp','Belopp')], klass:'fast', childOnly:true },
  'bil_tvatt':        { section:'transport', label:'Biltvätt',                        fields:[num('belopp','Belopp')], klass:'rörlig', childOnly:true },
  'bil_farja':        { section:'transport', label:'Färja / broavgift',               fields:[num('belopp','Snitt per månad')], klass:'rörlig', childOnly:true },
  'bil_custom':       { section:'transport', label:'Egen bilkostnad', custom:true, fields:[txt('namn','Namn (valfritt)'), num('belopp','Belopp')], klass:'fast', childOnly:true },

  // ─── TRANSPORT – MC (childOnly) ───
  'mc_bransle':   { section:'transport', label:'Bränsle / El',           fields:[num('belopp','Belopp')], klass:'rörlig', childOnly:true },
  'mc_fors':      { section:'transport', label:'Försäkring',             fields:[num('belopp','Belopp')], klass:'fast', grupp:'försäkring', childOnly:true },
  'mc_skatt':     { section:'transport', label:'Skatt',                  fields:[num('belopp','Belopp')], klass:'fast', childOnly:true },
  'mc_service':   { section:'transport', label:'Service',                fields:[num('belopp','Belopp')], klass:'rörlig', childOnly:true },
  'mc_parkering': { section:'transport', label:'Parkering',              fields:[num('belopp','Belopp')], klass:'fast', childOnly:true },
  'mc_custom':    { section:'transport', label:'Egen kostnad', custom:true, fields:[txt('namn','Namn (valfritt)'), num('belopp','Belopp')], klass:'fast', childOnly:true },

  // ─── MAT ───
  'livsmedel':  { section:'mat', label:'Livsmedel / matinköp', fields:[num('belopp','Belopp')], klass:'rörlig' },
  'restaurang': { section:'mat', label:'Restaurang / kafé',    fields:[num('belopp','Belopp')], klass:'rörlig' },
  'utelunch':   { section:'mat', label:'Utelunch på jobbet',   fields:[num('belopp','Belopp')], klass:'rörlig' },
  'matkasse':   { section:'mat', label:'Matkasse / hemleverans',fields:[num('belopp','Belopp')], klass:'rörlig' },
  'mat_custom': { section:'mat', label:'Egen matpost', custom:true, fields:[txt('namn','Namn (valfritt)'), num('belopp','Belopp')], klass:'rörlig' },

  // ─── BARN – container ───
  'barn': {
    section:'barn', label:'Barn', repeatable:true,
    fields:[
      txt('namn','Namn'),
      pctField('mat_andel','Andel av matkostnaden (%)'),
      pctField('boende_andel','Andel av boende & förbrukning (%)'),
    ],
    children:['forskola','klader_barn','hygien_barn','aktiviteter_barn','leksaker','veckopeng','barnvakt','lager','skolmaterial','barnforsakring','barn_custom']
  },
  // ─── BARN – kostnader (childOnly) ───
  'forskola':        { section:'barn', label:'Förskola / fritids',       fields:[num('belopp','Belopp')], klass:'fast', childOnly:true },
  'klader_barn':     { section:'barn', label:'Kläder & skor',            fields:[num('belopp','Belopp')], klass:'rörlig', childOnly:true },
  'hygien_barn':     { section:'barn', label:'Personlig hygien & Förbrukning', fields:[num('belopp','Belopp')], klass:'rörlig', childOnly:true },
  'aktiviteter_barn':{ section:'barn', label:'Aktiviteter (idrott, musik)', custom:true,
    fields:[txt('namn','Vad? (t.ex. Fotboll, Gitarr)'), num('belopp','Belopp')], klass:'fast', childOnly:true },
  'leksaker':        { section:'barn', label:'Leksaker & nöjen',         fields:[num('belopp','Belopp')], klass:'rörlig', childOnly:true },
  'veckopeng':       { section:'barn', label:'Vecko- / månadspeng',      fields:[num('belopp','Belopp')], klass:'fast', childOnly:true },
  'barnvakt':        { section:'barn', label:'Barnvakt',                 fields:[num('belopp','Belopp')], klass:'rörlig', childOnly:true },
  'lager':           { section:'barn', label:'Läger / sommarlov',        fields:[num('belopp','Snitt per månad')], klass:'rörlig', childOnly:true },
  'skolmaterial':    { section:'barn', label:'Skolmaterial / utflykter', fields:[num('belopp','Snitt per månad')], klass:'rörlig', childOnly:true },
  'barnforsakring':  { section:'barn', label:'Barnförsäkring',           fields:[num('belopp','Belopp')], klass:'fast', grupp:'försäkring', childOnly:true },
  'barn_custom':     { section:'barn', label:'Egen barnkostnad', custom:true, fields:[txt('namn','Namn (valfritt)'), num('belopp','Belopp')], klass:'fast', childOnly:true },

  // ─── PERSONLIGT ───
  'mobil':         { section:'personligt', label:'Mobiltelefon',            fields:[num('belopp','Belopp')], klass:'fast' },
  'klader_vuxen':  { section:'personligt', label:'Kläder & skor (vuxen)',   fields:[num('belopp','Belopp')], klass:'rörlig' },
  'hygien':        { section:'personligt', label:'Hygien & skönhet',        fields:[num('belopp','Belopp')], klass:'rörlig' },
  'frisor':        { section:'personligt', label:'Frisör',                  fields:[num('belopp','Snitt per månad')], klass:'rörlig' },
  'traning':       { section:'personligt', label:'Träning / gym',           fields:[num('belopp','Belopp')], klass:'fast' },
  'tidningar':     { section:'personligt', label:'Tidningar & prenumerationer', fields:[num('belopp','Belopp')], klass:'fast' },
  'husdjur':       { section:'personligt', label:'Husdjur',                 fields:[num('belopp','Belopp')], klass:'rörlig' },
  'personligt_custom': { section:'personligt', label:'Egen post', custom:true, fields:[txt('namn','Namn (valfritt)'), num('belopp','Belopp')], klass:'rörlig' },

  // ─── FÖRSÄKRINGAR ───
  'a_kassa':    { section:'forsakringar', label:'A-kassa',               fields:[num('belopp','Belopp')], klass:'fast' },
  'fack':       { section:'forsakringar', label:'Fackförening',          fields:[num('belopp','Belopp')], klass:'fast' },
  'livfors':    { section:'forsakringar', label:'Livförsäkring',         fields:[num('belopp','Belopp')], klass:'fast', grupp:'försäkring' },
  'olycksfors': { section:'forsakringar', label:'Olycksfallsförsäkring', fields:[num('belopp','Belopp')], klass:'fast', grupp:'försäkring' },
  'inkomstfors':{ section:'forsakringar', label:'Inkomstförsäkring',     fields:[num('belopp','Belopp')], klass:'fast', grupp:'försäkring' },
  'sjukfors':   { section:'forsakringar', label:'Sjukvårdsförsäkring',   fields:[num('belopp','Belopp')], klass:'fast', grupp:'försäkring' },
  'resefors':   { section:'forsakringar', label:'Reseförsäkring (om separat)', fields:[num('belopp','Belopp')], klass:'fast', grupp:'försäkring' },
  'forsakringar_custom': { section:'forsakringar', label:'Egen försäkring', custom:true, fields:[txt('namn','Namn (valfritt)'), num('belopp','Belopp')], klass:'fast', grupp:'försäkring' },

  // ─── VÅRD ───
  'frisktandvard': { section:'vard', label:'Frisktandvård (fast pris/mån)', fields:[num('belopp','Belopp')], klass:'fast', grupp:'försäkring' },
  'tandvard':      { section:'vard', label:'Tandvård (utöver frisktandvård)', fields:[num('belopp','Snitt per månad')], klass:'rörlig' },
  'lakemedel':     { section:'vard', label:'Läkemedel',                    fields:[num('belopp','Belopp')], klass:'rörlig' },
  'lakarbesok':    { section:'vard', label:'Läkar- / vårdbesök',           fields:[num('belopp','Belopp')], klass:'rörlig' },
  'terapi':        { section:'vard', label:'Psykolog / terapi',            fields:[num('belopp','Belopp')], klass:'fast' },
  'fysio':         { section:'vard', label:'Fysioterapi / naprapat / kiropraktor', fields:[num('belopp','Belopp')], klass:'rörlig' },
  'glasogon':      { section:'vard', label:'Glasögon / linser',            fields:[num('belopp','Snitt per månad')], klass:'rörlig' },
  'vard_custom':   { section:'vard', label:'Egen vårdpost', custom:true, fields:[txt('namn','Namn (valfritt)'), num('belopp','Belopp')], klass:'rörlig' },

  // ─── NÖJE ───
  'streaming':     { section:'noje', label:'Streaming (Netflix, Spotify...)', fields:[num('belopp','Belopp')], klass:'fast' },
  'kino':          { section:'noje', label:'Kino / konsert / teater',          fields:[num('belopp','Belopp')], klass:'rörlig' },
  'sportevenemang':{ section:'noje', label:'Sportevenemang / biljetter',      fields:[num('belopp','Snitt per månad')], klass:'rörlig' },
  'hobby':         { section:'noje', label:'Hobby', custom:true, fields:[txt('namn','Vad? (t.ex. Gitarr, Klättring)'), num('belopp','Belopp')], klass:'rörlig' },
  'bocker':        { section:'noje', label:'Böcker & tidskrifter',            fields:[num('belopp','Belopp')], klass:'rörlig' },
  'resor':         { section:'noje', label:'Resor & semester',                 fields:[num('belopp','Snitt per månad')], klass:'rörlig' },
  'alkohol':       { section:'noje', label:'Alkohol & tobak',                  fields:[num('belopp','Belopp')], klass:'rörlig' },
  'spel':          { section:'noje', label:'Spel & lotteri',                   fields:[num('belopp','Belopp')], klass:'rörlig' },
  'noje_custom':   { section:'noje', label:'Egen nöjespost', custom:true, fields:[txt('namn','Namn (valfritt)'), num('belopp','Belopp')], klass:'rörlig' },

  // ─── ÖVRIGT ───
  'oforutsett':    { section:'ovrigt', label:'Oförutsett / buffert',   fields:[num('belopp','Belopp')], klass:'rörlig' },
  'gavor':         { section:'ovrigt', label:'Gåvor & presenter',      fields:[num('belopp','Snitt per månad')], klass:'rörlig' },
  'valgorenhet':   { section:'ovrigt', label:'Välgörenhet / donationer',fields:[num('belopp','Belopp')], klass:'rörlig' },
  'avgifter':      { section:'ovrigt', label:'Bank- & kortavgifter',   fields:[num('belopp','Belopp')], klass:'fast' },
  'botes':         { section:'ovrigt', label:'Böter / parkeringsavgift',fields:[num('belopp','Snitt per månad')], klass:'rörlig' },
  'kvarskatt':     { section:'ovrigt', label:'Kvarskatt (snitt per månad)', fields:[num('belopp','Snitt per månad')], klass:'fast' },
  'forbrukningsvaror': { section:'ovrigt', label:'Förbrukningsvaror (tvättmedel, städ, papper)', fields:[num('belopp','Belopp')], klass:'rörlig' },
  'hemutrustning': { section:'ovrigt', label:'Hemutrustning (snitt)',   fields:[num('belopp','Snitt per månad')], klass:'rörlig' },
  'ovrigt_custom': { section:'ovrigt', label:'Egen post', custom:true, fields:[txt('namn','Namn (valfritt)'), num('belopp','Belopp')], klass:'rörlig' },

  // ─── SKULDER ───
'skuld_bolan':      { section:'skulder', label:'Bolån', repeatable:true, isSkuld:true,
  fields:[
    txt('namn','Namn (t.ex. SBAB)'),
    num('saldo','Kvarvarande skuld (kr)'),
    num('ranta_procent','Ränta (%)'),
    num('amortering','Amortering (kr/mån)'),
    num('marknadsvarde','Bostadens marknadsvärde (kr)')
  ],
  compute: v => ((parseFloat(v.saldo)||0) * (parseFloat(v.ranta_procent)||0) / 100 / 12) + (parseFloat(v.amortering)||0) },
'skuld_billan':     { section:'skulder', label:'Billån', repeatable:true, isSkuld:true,
  fields:[
    txt('namn','Namn (t.ex. Volvo Finans)'),
    num('saldo','Kvarvarande skuld (kr)'),
    num('ranta_procent','Ränta (%)'),
    num('amortering','Amortering (kr/mån)'),
    num('marknadsvarde','Fordonets marknadsvärde (kr)')
  ],
  compute: v => ((parseFloat(v.saldo)||0) * (parseFloat(v.ranta_procent)||0) / 100 / 12) + (parseFloat(v.amortering)||0) },
  'skuld_studielan':  { section:'skulder', label:'Studielån (CSN)', repeatable:true, isSkuld:true,
    fields:[txt('namn','Namn'), num('saldo','Kvarvarande skuld (kr)'), num('ranta_procent','Ränta (%)'), num('amortering','Amortering (kr/mån)')],
    compute: v => ((parseFloat(v.saldo)||0) * (parseFloat(v.ranta_procent)||0) / 100 / 12) + (parseFloat(v.amortering)||0) },
  'skuld_kreditkort': { section:'skulder', label:'Kreditkort', repeatable:true, isSkuld:true,
    fields:[txt('namn','Namn (t.ex. SEB Kort)'), num('saldo','Kvarvarande skuld (kr)'), num('ranta_procent','Ränta (%)'), num('amortering','Amortering (kr/mån)')],
    compute: v => ((parseFloat(v.saldo)||0) * (parseFloat(v.ranta_procent)||0) / 100 / 12) + (parseFloat(v.amortering)||0) },
  'skuld_privatlan':  { section:'skulder', label:'Privatlån', repeatable:true, isSkuld:true,
    fields:[txt('namn','Namn'), num('saldo','Kvarvarande skuld (kr)'), num('ranta_procent','Ränta (%)'), num('amortering','Amortering (kr/mån)')],
    compute: v => ((parseFloat(v.saldo)||0) * (parseFloat(v.ranta_procent)||0) / 100 / 12) + (parseFloat(v.amortering)||0) },
'skuld_custom':     { section:'skulder', label:'Egen skuld', custom:true, repeatable:true, isSkuld:true,
  fields:[
    txt('namn','Namn'),
    num('saldo','Saldo (kr)'),
    num('ranta_procent','Ränta (%)'),
    num('amortering','Amortering (kr/mån)'),
    num('marknadsvarde','Marknadsvärde (kr, valfritt)')
  ],
  compute: v => ((parseFloat(v.saldo)||0) * (parseFloat(v.ranta_procent)||0) / 100 / 12) + (parseFloat(v.amortering)||0) },
};

// ─── SEKTIONER ───
const SECTIONS = [
  { id:'personer',     title:'👥 0. Personer',                addLabel:'Lägg till person', hint:'Storlek på hushållet – påverkar jämförelsesiffrorna' },
  { id:'inkomster',    title:'💰 1. Inkomster',              addLabel:'Lägg till inkomst' },
  { id:'sparande',     title:'🏦 2. Sparande',               addLabel:'Lägg till sparande' },
  { id:'boende',       title:'🏠 3. Boende',                 addLabel:'Lägg till boende' },
  { id:'transport',    title:'🚗 4. Transport',              addLabel:'Lägg till transportmedel' },
  { id:'mat',          title:'🍽️ 5. Mat',                    addLabel:'Lägg till matpost' },
  { id:'barn',         title:'👶 6. Barn',                   addLabel:'Lägg till barn', hint:'Summan visar bara direkta kostnader – se Sammanställning för total inkl. andelar av mat/boende.' },
  { id:'personligt',   title:'🧴 7. Personligt & Vardag',    addLabel:'Lägg till' },
  { id:'forsakringar', title:'🛡️ 8. Försäkringar & Trygghet', addLabel:'Lägg till försäkring' },
  { id:'vard',         title:'🏥 9. Vård & Omsorg',          addLabel:'Lägg till vårdpost' },
  { id:'noje',         title:'🎬 10. Nöje & Fritid',         addLabel:'Lägg till' },
  { id:'ovrigt',       title:'📦 11. Övrigt',                addLabel:'Lägg till' },
  { id:'skulder',      title:'💳 12. Skulder',               addLabel:'Lägg till skuld', hint:'Saldo + ränta + amortering' },
];

// ─── KÄLLOR (i = källa) ───
const KALLOR = {
  allman: '50/30/20-regeln: 50 % behov, 30 % nöjen, 20 % sparande/skulder. Källor: Dagens PS, Nordax, Riverty.',
};

// ─── FÖRKLARINGAR (? = hur vi räknar) ───
const FORKLARING = {
  boende: 'Räknar Boende-sektionen PLUS bolån från Skulder-fliken – både ränta och amortering.\n\n⚠️ Amortering räknas med eftersom svenska amorteringskrav gör den till ett fast åtagande (2 %, 1 % eller 0 % beroende på belåningsgrad). Den kan inte pausas utan att sälja bostaden.\n\nUngefärliga belopp:\n• 2 vuxna i hyreslägenhet: 8 000–12 000 kr/mån\n• 2 vuxna i villa (inkl. bolån): 15 000–22 000 kr/mån\n• 1 vuxen i lägenhet: 5 000–8 000 kr/mån\n\nGenomsnitt (SCB 2024, median andel av disponibel inkomst):\n• Ensamstående utan barn: 31,9 %\n• Sammanboende utan barn: 21,3 %\n• Ensamstående med barn: 30,2 %\n• Sammanboende med barn: 19,4 %',
  mat: 'Räknar ALLT du lagt under Mat (livsmedel, restaurang, utelunch, matkasse).\n\n⚠️ Detta är mat för HELA hushållet – inklusive barn. Barnens mat ligger här, inte under Barn-sektionen.\n\nUngefärliga belopp (Konsumentverket 2025):\n• 1 vuxen: ~3 700 kr/mån\n• Barn under 10 år: ~2 500 kr/mån\n• 2 vuxna + 2 barn: ~11 600 kr/mån\n\nGenomsnitt (SCB 2024): 13 % av total konsumtion.',
  transport: 'Räknar ALLT du lagt under Transport (bil, MC, kollektivt, cykel, flyg, taxi m.m.).\n\n⚠️ Billån hanteras under 💳 Skulder – ränta och amortering räknas automatiskt in i din månadskostnad.\n\nUngefärliga belopp:\n• En bil (exkl. värdeminskning): 2 000–3 500 kr/mån\n• MC/moped: 800–1 500 kr/mån\n• Månadskort kollektivt: 600–1 000 kr/mån\n\nGenomsnitt (SCB 2024): 12–13 % av total konsumtion.',
  forsakring: 'Sammanställning av ALLA poster markerade som "försäkring" – hem, villa, BRF, bil, MC, barn, liv, olycksfall, inkomst, sjukvård, resa och frisktandvård.\n\nUngefärliga belopp:\n• Hemförsäkring: 150–200 kr/mån\n• Bilförsäkring: 300–600 kr/mån\n• MC-försäkring: 200–500 kr/mån\n• Barnförsäkring: 120–240 kr/mån\n• A-kassa: 140–190 kr/mån\n• Liv + olycksfall: 100–300 kr/mån\n• Frisktandvård: 100–400 kr/mån\n\nTotalt typiskt hushåll: ca 1 500–2 500 kr/mån (3–5 % av nettoinkomst).',
  sparande: 'Summan av allt du lagt under Sparande-sektionen (månadssparande).\n\n⚠️ "Nuvarande buffert (saldo)" räknas INTE med här – det är ett saldo, inte ett månadsbelopp.\n\nSwedbank rekommenderar minst 10 % av nettoinkomsten. Många FIRE-sparare ligger på 20–50 %.',
  barn: 'Summan är barnkostnadernas TOTALA belopp – inklusive andelar av gemensamma hushållskostnader (mat, boende, förbrukningsvaror) som du angett i %-fälten på varje barn.\n\nSe "👶 UNGEFÄRLIG BARNKOSTNAD" längre ner för en detaljerad uppdelning per kategori och per barn.',
  noje: 'Räknar ALLT under Nöje & Fritid (streaming, kino, hobby, resor, alkohol, spel, böcker m.m.).\n\nGenomsnitt (SCB 2024): ~15 % av total konsumtion (fritid 10 % + restaurang 5 %).',
  personligt: 'Räknar ALLT under Personligt & Vardag (mobil, kläder, hygien, frisör, träning, tidningar, husdjur).\n\nGenomsnitt (SCB 2024): ~8 % (kläder 4 % + kommunikation 4 %).',
  vard: 'Räknar ALLT under Vård & Omsorg (tandvård, läkemedel, läkarbesök, terapi, fysio, glasögon).\n\n⚠️ Frisktandvård ligger i denna sektion och räknas även med i Försäkringar.\n\nGenomsnitt (SCB 2024): ~3 % av total konsumtion.',
  ovrigt: 'Räknar ALLT under Övrigt (oförutsett, gåvor, avgifter, förbrukningsvaror, hemutrustning, välgörenhet m.m.).\n\nSCB har en samlad "övrigt"-post på ~22,8 %, men den innehåller lite olika saker beroende på hushåll.',
  barnkostnad: 'Sammanställning av barnets totala kostnad.\n\nInkluderar:\n• Direkta kostnader (förskola, kläder, aktiviteter, leksaker m.m.)\n• Procentuella andelar av gemensamma kostnader (mat, boende, förbrukningsvaror) – baserat på de %-fält du fyller i på varje barn.\n\nSwedbank (2025): Total barnkostnad 0–18 år ≈ 1,9 miljoner kr. Månadssnitt: 7 300 kr (1–6 år), 7 800 kr (7–12 år), 9 100 kr (13–18 år).',
  skulder: 'Skulder är inte en månadskostnad utan ett saldo. Varje lån visar:\n• Kvarvarande skuld (saldo)\n• Ränta (%)\n• Amortering (kr/mån)\n\nMånadskostnaden = (saldo × ränta / 100 / 12) + amortering.\n\nSektionens summa visar både total skuld och total månadskostnad.\n\n⚠️ Skulder räknas INTE med i "Totala utgifter" eftersom amortering är en förmögenhetsöverföring, inte en konsumtion. Räntekostnaden visas separat som andel av inkomsten.',
  buffert: 'Nuvarande buffert är ett SALDO (inte ett månadssparande) och räknas därför inte in i Sparande-sektionens månadssumma.\n\n📊 SÅ RÄKNAS BUFFERTTÄCKNINGEN:\n• INKLUDERAR fasta och rörliga utgifter\n• INKLUDERAR amortering – eftersom den ofta är ett fast åtagande\n• EXKLUDERAR sparande – det är frivilligt och kan pausas vid behov\n\nDetta ger en realistisk bild av hur länge bufferten räcker om inkomsten plötsligt skulle utebli.\n\nRekommendation: 3–6 månadsutgifter (Swedbank, Konsumentverket).',
  abonnemang: 'Samlar återkommande månadsabonnemang från flera sektioner:\n\n• Streaming (Netflix, Spotify m.fl.) – Nöje\n• Mobiltelefon – Personligt\n• Bredband – Boende\n• Tidningar & prenumerationer – Personligt\n• Träning / gym – Personligt\n\nDessa är ofta lätta att glömma bort och summerar snabbt till stora belopp över ett år.\n\nTips: Granska en gång per år och säg upp det du inte använder.',
};