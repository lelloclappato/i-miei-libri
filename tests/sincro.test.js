// Test della sincronizzazione: il registro delle modifiche, l'unione di due copie e due "dispositivi" finti
// che si sincronizzano attraverso un Google Drive finto, in memoria.
import { gruppo, test, uguale, vero } from './mini-test.js';
import * as R from '../js/sincro/registro.js';
import { creaSincro } from '../js/sincro/sincro.js';

const SCHEMA = {
  raccolte: [
    { percorso: 'libri', chiave: l => l.id, figli: [{ campo: 'capitoli', chiave: c => c.id }] },
    { percorso: 'parole', chiave: p => p.id },
    { percorso: 'logs', mappa: true }
  ],
  singoli: ['impostazioni']
};
const dati = (extra = {}) => ({ version: 1, ultimoBackup: null, libri: [], parole: [], logs: {}, impostazioni: { tema: 'auto' }, ...extra });
const libro = (id, titolo, capitoli = []) => ({ id, titolo, capitoli });

gruppo('Sincronizzazione: il registro');
test('JSON stabile: l’ordine delle chiavi non conta', () => {
  uguale(R.stabile({ b: 1, a: [1, { d: 2, c: 3 }] }), R.stabile({ a: [1, { c: 3, d: 2 }], b: 1 }));
  vero(R.impronta('abc') !== R.impronta('abd'));
});
test('scomporre e ricostruire i dati dà gli stessi dati (con figli, mappe e singoli)', () => {
  const d = dati({ libri: [libro('a', 'Uno', [{ id: 'c1', t: 'x' }, { id: 'c2', t: 'y' }]), libro('b', 'Due')], logs: { '2026-11-01': { h: 1 } } });
  const e = R.elementi(d, SCHEMA);
  vero(e.has('libri:a') && e.has('libri:a/capitoli:c1') && e.has('logs:2026-11-01') && e.has('=impostazioni'));
  uguale(e.get('libri:a').v.capitoli, undefined, 'il genitore non contiene i figli');
  uguale(R.ricostruisci(dati(), e, SCHEMA), d);
});
test('la prima volta tutto è "vecchio" (data 1); poi una modifica prende l’ora, un’eliminazione lascia la traccia', () => {
  const reg = R.registroVuoto();
  const d = dati({ libri: [libro('a', 'Uno'), libro('b', 'Due')] });
  R.osserva(reg, d, SCHEMA, 1000);
  uguale([reg.mod['libri:a'], reg.mod['libri:b']], [1, 1]);
  d.libri[0].titolo = 'Uno bis'; d.libri.pop();
  uguale(R.osserva(reg, d, SCHEMA, 5000), 2);
  uguale([reg.mod['libri:a'], reg.eliminati['libri:b'], reg.mod['libri:b']], [5000, 5000, undefined]);
  uguale(R.osserva(reg, d, SCHEMA, 6000), 0, 'niente di nuovo, niente cambia');
});
test('un elemento rimesso dopo l’eliminazione (es. "Annulla") torna vivo e più recente della traccia', () => {
  const reg = R.registroVuoto();
  const d = dati({ libri: [libro('a', 'Uno')] });
  R.osserva(reg, d, SCHEMA, 1000); d.libri = []; R.osserva(reg, d, SCHEMA, 2000);
  d.libri = [libro('a', 'Uno')]; R.osserva(reg, d, SCHEMA, 2000);
  vero(reg.mod['libri:a'] > 2000 && !reg.eliminati['libri:a']);
});

gruppo('Sincronizzazione: unire due copie');
const el = (m, v, p = 'libri', c = v.id) => ({ m, v, p, c });
test('per ogni elemento vince la modifica più recente; a parità vince la copia su Drive', () => {
  const a = { formato: 1, elementi: { 'libri:x': el(5, { id: 'x', t: 'qui' }), 'libri:y': el(3, { id: 'y', t: 'qui' }) }, eliminati: {} };
  const b = { formato: 1, elementi: { 'libri:x': el(4, { id: 'x', t: 'là' }), 'libri:y': el(3, { id: 'y', t: 'là' }), 'libri:z': el(1, { id: 'z', t: 'là' }) }, eliminati: {} };
  const u = R.unisci(a, b);
  uguale(Object.keys(u.elementi), ['libri:x', 'libri:y', 'libri:z']);
  uguale([u.elementi['libri:x'].v.t, u.elementi['libri:y'].v.t], ['qui', 'là']);
});
test('un’eliminazione vince sulle modifiche più vecchie, non su quelle più nuove', () => {
  const a = { formato: 1, elementi: { 'libri:x': el(3, { id: 'x' }), 'libri:y': el(9, { id: 'y' }) }, eliminati: {} };
  const b = { formato: 1, elementi: {}, eliminati: { 'libri:x': 5, 'libri:y': 5 } };
  const u = R.unisci(a, b);
  uguale(Object.keys(u.elementi), ['libri:y']);
  uguale(u.eliminati, { 'libri:x': 5 });
});
test('i figli di un libro eliminato altrove spariscono anche se qui erano stati aggiunti', () => {
  const r = R.ricostruisci(dati(), { 'libri:a/capitoli:c': { m: 9, v: { id: 'c' }, p: 'libri', c: 'c', g: 'a', f: 'capitoli' } }, SCHEMA);
  uguale(r.libri, []);
});
test('un pacchetto rotto o di un altro formato non si usa', () => {
  vero(!R.pacchettoValido(null) && !R.pacchettoValido({ formato: 2, elementi: {} }) && !R.pacchettoValido({ formato: 1, elementi: [] }));
  vero(R.pacchettoValido({ formato: 1, elementi: {}, eliminati: {} }));
});

gruppo('Sincronizzazione: due dispositivi');
// Drive finto: un solo account, file in memoria
function driveFinto() {
  const files = new Map(); let n = 0;
  return {
    files,
    trova: async (t, nome) => [...files.entries()].filter(([, f]) => f.nome === nome).map(([id]) => ({ id })).reverse(),
    leggi: async (t, id) => JSON.parse(files.get(id).testo),
    scrivi: async (t, nome, c, id) => { id = id || 'f' + (++n); files.set(id, { nome, testo: JSON.stringify(c) }); return id; },
    elimina: async (t, id) => { files.delete(id); }
  };
}
const accessoFinto = () => ({ collegato: () => true, valido: () => true, email: () => 'gabriele@example.com', token: async () => 't', scaduto() {}, async scollega() {} });
function depositoFinto() { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; }
// un dispositivo: i suoi dati (passati da una "app" che li ripulisce come fa la vera) e la sua sincronizzazione
function dispositivo(drive, iniziali, scelta = 'unisci') {
  const d = { dati: iniziali, domande: [] };
  d.s = creaSincro({
    prefisso: 'prova', nomeFile: 'prova.json', schema: SCHEMA, deposito: depositoFinto(), drive, accesso: accessoFinto(), attesa: 1e9,
    leggiDati: () => d.dati,
    scriviDati: nuovi => { d.dati = JSON.parse(JSON.stringify(nuovi)); },
    chiediPrimaUnione: async x => { d.domande.push(x); return scelta; }
  });
  d.s.avvia();
  d.cambia = fn => { fn(d.dati); d.s.dopoSalvataggio(); };
  return d;
}
const titoli = d => d.dati.libri.map(l => l.titolo);
const aspetta = ms => new Promise(r => setTimeout(r, ms));

test('il telefono carica i suoi libri, il computer vuoto li riceve', async () => {
  const drive = driveFinto();
  const tel = dispositivo(drive, dati({ libri: [libro('a', 'Il nome della rosa', [{ id: 'c1', r: 'Prologo' }])] }));
  const pc = dispositivo(drive, dati());
  await tel.s.sincronizza(); await pc.s.sincronizza();
  uguale(titoli(pc), ['Il nome della rosa']);
  uguale(pc.dati.libri[0].capitoli, [{ id: 'c1', r: 'Prologo' }]);
  uguale(pc.domande.length, 0, 'il computer non aveva niente: nessuna domanda');
  uguale(pc.s.stato().fase, 'pronto');
});
test('modifiche diverse sui due dispositivi si sommano; la stessa cosa modificata: vince l’ultima', async () => {
  const drive = driveFinto();
  const tel = dispositivo(drive, dati({ libri: [libro('a', 'Uno'), libro('b', 'Due')] }));
  await tel.s.sincronizza();
  const pc = dispositivo(drive, dati());
  await pc.s.sincronizza();
  tel.cambia(d => { d.libri.push(libro('c', 'Tre dal telefono')); d.libri[0].titolo = 'Uno (telefono)'; });
  await aspetta(5);
  pc.cambia(d => { d.parole.push({ id: 'p', parola: 'ubbìa' }); d.libri[0].titolo = 'Uno (computer, dopo)'; });
  await tel.s.sincronizza(); await pc.s.sincronizza(); await tel.s.sincronizza();
  uguale(titoli(tel), ['Uno (computer, dopo)', 'Due', 'Tre dal telefono']);
  uguale(titoli(pc), titoli(tel));
  uguale([tel.dati.parole.length, pc.dati.parole.length], [1, 1]);
});
test('un libro eliminato su un dispositivo sparisce anche dall’altro e non torna indietro', async () => {
  const drive = driveFinto();
  const tel = dispositivo(drive, dati({ libri: [libro('a', 'Uno'), libro('b', 'Due')] }));
  await tel.s.sincronizza();
  const pc = dispositivo(drive, dati());
  await pc.s.sincronizza();
  pc.cambia(d => { d.libri = d.libri.filter(l => l.id !== 'b'); });
  await pc.s.sincronizza(); await tel.s.sincronizza(); await pc.s.sincronizza();
  uguale(titoli(tel), ['Uno']); uguale(titoli(pc), ['Uno']);
});
test('primo collegamento con dati diversi da quelli dell’account: si chiede, e "usa quelli dell’account" scarta quelli di qui', async () => {
  const drive = driveFinto();
  const tel = dispositivo(drive, dati({ libri: [libro('a', 'Vero')] }));
  await tel.s.sincronizza();
  const nuovo = dispositivo(drive, dati({ libri: [libro('z', 'Di prova')] }), 'account');
  await nuovo.s.sincronizza();
  uguale(nuovo.domande.length, 1);
  uguale(titoli(nuovo), ['Vero']);
  await tel.s.sincronizza();
  uguale(titoli(tel), ['Vero'], 'il libro di prova non arriva sul telefono');
});
test('…e "unisci" li tiene tutti e due', async () => {
  const drive = driveFinto();
  const tel = dispositivo(drive, dati({ libri: [libro('a', 'Dal telefono')] }));
  await tel.s.sincronizza();
  const pc = dispositivo(drive, dati({ libri: [libro('b', 'Dal computer')] }), 'unisci');
  await pc.s.sincronizza(); await tel.s.sincronizza();
  uguale(titoli(pc), ['Dal computer', 'Dal telefono']);
  uguale(titoli(tel).sort(), ['Dal computer', 'Dal telefono']);
});
test('le impostazioni del dispositivo nuovo (mai toccate) non sovrascrivono quelle dell’account', async () => {
  const drive = driveFinto();
  const tel = dispositivo(drive, dati());
  tel.cambia(d => { d.impostazioni = { tema: 'scuro' }; });
  await tel.s.sincronizza();
  const pc = dispositivo(drive, dati());
  await pc.s.sincronizza();
  uguale(pc.dati.impostazioni, { tema: 'scuro' });
});
test('quello che non è nello schema resta del dispositivo (es. il giorno dell’ultimo backup)', async () => {
  const drive = driveFinto();
  const tel = dispositivo(drive, dati({ ultimoBackup: '2026-11-01', libri: [libro('a', 'Uno')] }));
  await tel.s.sincronizza();
  const pc = dispositivo(drive, dati({ ultimoBackup: null }));
  await pc.s.sincronizza();
  uguale(pc.dati.ultimoBackup, null);
});
test('due file sull’account (creati insieme da due dispositivi) si riuniscono in uno', async () => {
  const drive = driveFinto();
  const reg = R.registroVuoto(); const db = dati({ libri: [libro('b', 'B')] }); R.osserva(reg, db, SCHEMA);
  await drive.scrivi('t', 'prova.json', R.pacchetto(reg, db, SCHEMA));
  await drive.scrivi('t', 'prova.json', { formato: 1, elementi: {}, eliminati: {} });
  uguale(drive.files.size, 2);
  const a = dispositivo(drive, dati({ libri: [libro('a', 'A')] }));
  await a.s.sincronizza();
  uguale(drive.files.size, 1);
  uguale(titoli(a).sort(), ['A', 'B']);
});
test('se Drive non risponde, l’errore si vede e i dati di qui restano com’erano', async () => {
  const drive = driveFinto();
  drive.trova = async () => { const e = new Error('Nessuna connessione: sincronizzo appena torna.'); e.codice = 'rete'; throw e; };
  const tel = dispositivo(drive, dati({ libri: [libro('a', 'Uno')] }));
  await tel.s.sincronizza();
  uguale([tel.s.stato().fase, titoli(tel)], ['errore', ['Uno']]);
  vero(tel.s.stato().errore.includes('connessione'));
});

gruppo('Sincronizzazione: accesso a Google con il ponte');
import { creaAccesso, leggiRitorno } from '../js/sincro/google.js';
const codifica = o => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function posizioneFinta(hash) {
  const p = { pathname: '/i-miei-libri/', search: '', hash, href: 'https://lelloclappato.github.io/i-miei-libri/' + hash, andata: null, assign(u) { p.andata = u; } };
  const h = { state: null, replaceState(s, t, u) { p.hash = u.includes('#') ? u.slice(u.indexOf('#')) : ''; } };
  return { p, h };
}
test('il risultato del ritorno da Google si legge e sparisce dall’indirizzo, la schermata resta', () => {
  const { p, h } = posizioneFinta('#/altro&accesso-google=' + codifica({ access_token: 'A', expires_in: 3600, chiave: 'v1.x.y' }));
  uguale(leggiRitorno(p, h).chiave, 'v1.x.y');
  uguale(p.hash, '#/altro');
  const senza = posizioneFinta('#accesso-google=' + codifica({ errore: 'annullato' }));
  uguale(leggiRitorno(senza.p, senza.h), { errore: 'annullato' });
  uguale(senza.p.hash, '');
  uguale(leggiRitorno(posizioneFinta('#/oggi').p, posizioneFinta('#/oggi').h), null);
});
test('con il permesso lungo l’accesso scaduto si rinnova da solo; se Google l’ha revocato si torna al tocco', async () => {
  const dep = depositoFinto();
  dep.setItem('lelloclappato-google', JSON.stringify({ token: 'vecchio', scade: 0, email: 'g@example.com', chiave: 'v1.buona' }));
  const fetchVero = globalThis.fetch; const chiamate = [];
  globalThis.fetch = async (url, o) => {
    chiamate.push(url);
    const c = JSON.parse(o.body);
    return c.chiave === 'v1.buona' ? new Response(JSON.stringify({ access_token: 'nuovo', expires_in: 3600 })) : new Response(JSON.stringify({ errore: 'revocato' }), { status: 401 });
  };
  try {
    const a = creaAccesso({ clientId: 'x', ponte: 'https://ponte.example', deposito: dep, posizione: posizioneFinta('').p });
    vero(a.valido() && a.permessoLungo(), 'con il permesso lungo si è sempre pronti');
    uguale(await a.token(), 'nuovo');
    uguale(chiamate, ['https://ponte.example/rinnova']);
    dep.setItem('lelloclappato-google', JSON.stringify({ token: 'vecchio', scade: 0, email: 'g@example.com', chiave: 'v1.revocata' }));
    uguale(await a.token(), null);
    vero(!a.permessoLungo() && !a.valido(), 'permesso revocato: dimenticato');
  } finally { globalThis.fetch = fetchVero; }
});
test('senza permesso lungo, "Accedi" porta alla pagina del ponte con l’indirizzo di ritorno', async () => {
  const { p } = posizioneFinta('#/altro');
  const a = creaAccesso({ clientId: 'x', ponte: 'https://ponte.example', deposito: depositoFinto(), posizione: p });
  a.token({ interattivo: true });
  await aspetta(1);
  const u = new URL(p.andata);
  uguale([u.origin + u.pathname, u.searchParams.get('torna')], ['https://ponte.example/accedi', 'https://lelloclappato.github.io/i-miei-libri/#/altro']);
});
