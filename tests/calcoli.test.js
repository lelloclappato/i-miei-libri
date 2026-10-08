// Test dei conti (js/calcoli.js) con dati inventati. Il "giorno di oggi" è sempre passato a mano,
// così i risultati non cambiano col passare del tempo.
import { gruppo, test, uguale, vero } from './mini-test.js';
import { ripulisciLibro, ripulisciParola } from '../js/migrazione.js';
import * as C from '../js/calcoli.js';

const libro = campi => ripulisciLibro({ titolo: 'Prova', aggiunto: '2026-01-01', ...campi });
const lettura = (giorno, minuti, da, a, libroId = 'a') => ({ id: giorno + da, libroId, giorno, minuti, da, a, tipo: 'manuale' });
const OGGI = '2026-10-08'; // un giovedì

gruppo('Avanzamento');
test('percentuale: a metà libro', () => uguale(C.percento(libro({ pagine: 200, pagina: 100, stato: 'leggendo' })), 50));
test('percentuale: si arrotonda', () => uguale(C.percento(libro({ pagine: 300, pagina: 100, stato: 'leggendo' })), 33));
test('percentuale: senza numero di pagine non si può sapere', () => uguale(C.percento(libro({ pagine: null, pagina: 40, stato: 'leggendo' })), null));
test('percentuale: un libro letto è sempre al 100%', () => uguale(C.percento(libro({ pagine: null, stato: 'letto' })), 100));
test('pagine mancanti', () => uguale(C.pagineMancanti(libro({ pagine: 200, pagina: 130 })), 70));
test('prossimo capitolo: 1 se non ce ne sono', () => uguale(C.prossimoCapitolo(libro({})), 1));
test('prossimo capitolo: uno in più del più alto, anche se sono in disordine', () => {
  uguale(C.prossimoCapitolo(libro({ capitoli: [{ numero: 3, riassunto: 'x' }, { numero: 1, riassunto: 'y' }] })), 4);
});
test('capitoli in ordine di numero', () => {
  const l = libro({ capitoli: [{ numero: 2, riassunto: 'b' }, { numero: 0, titolo: 'Prologo' }, { numero: 1, riassunto: 'a' }] });
  uguale(C.capitoliInOrdine(l).map(c => c.numero), [0, 1, 2]);
});

gruppo('Letture');
test('pagine di una lettura', () => uguale(C.pagineDi(lettura(OGGI, 10, 20, 45)), 25));
test('pagine di una lettura senza pagine', () => uguale(C.pagineDi(lettura(OGGI, 10, null, null)), 0));
test('pagine: mai negative', () => uguale(C.pagineDi(lettura(OGGI, 10, 50, 40)), 0));
test('somma per giorno', () => {
  const g = C.perGiorno([lettura(OGGI, 10, 0, 5), lettura(OGGI, 20, 5, 30), lettura('2026-10-07', 0, 30, 40)]);
  uguale(g[OGGI], { minuti: 30, pagine: 30 });
  uguale(g['2026-10-07'], { minuti: 0, pagine: 10 });
});
test('una lettura senza minuti né pagine non conta come giorno', () => uguale(C.perGiorno([lettura(OGGI, 0, 10, 10)]), {}));

gruppo('Serie di giorni');
test('nessuna lettura: serie 0', () => uguale(C.serie([], OGGI), { attuale: 0, record: 0, fattoOggi: false }));
test('tre giorni di fila fino a oggi', () => {
  const s = C.serie([lettura('2026-10-06', 5), lettura('2026-10-07', 5), lettura(OGGI, 5)], OGGI);
  uguale(s, { attuale: 3, record: 3, fattoOggi: true });
});
test('oggi non ho ancora letto: la serie di ieri non è persa', () => {
  const s = C.serie([lettura('2026-10-06', 5), lettura('2026-10-07', 5)], OGGI);
  uguale(s, { attuale: 2, record: 2, fattoOggi: false });
});
test('un giorno saltato interrompe la serie', () => {
  const s = C.serie([lettura('2026-10-01', 5), lettura('2026-10-02', 5), lettura('2026-10-03', 5), lettura('2026-10-05', 5), lettura('2026-10-06', 5)], OGGI);
  uguale(s, { attuale: 0, record: 3, fattoOggi: false });
});
test('la serie attraversa il cambio di mese e il cambio d’ora', () => {
  // 25 ottobre 2026: si torna all'ora solare
  const s = C.serie(['2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'].map(g => lettura(g, 5)), '2026-11-01');
  uguale(s.attuale, 9);
});
test('due letture nello stesso giorno contano un giorno solo', () => {
  uguale(C.serie([lettura(OGGI, 5, 0, 1), lettura(OGGI, 5, 1, 2)], OGGI).attuale, 1);
});
test('settimana: sette giorni da lunedì, con oggi e i giorni futuri', () => {
  const s = C.settimana([lettura('2026-10-05', 5), lettura(OGGI, 5)], OGGI);
  uguale(s.map(g => g.giorno), ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']);
  uguale(s.map(g => g.fatto), [true, false, false, true, false, false, false]);
  uguale(s.map(g => g.futuro), [false, false, false, false, true, true, true]);
  uguale(s.filter(g => g.oggi).length, 1);
});

gruppo('Velocità e stime');
test('velocità: pagine all’ora dalle letture cronometrate', () => {
  uguale(C.ritmo([lettura(OGGI, 30, 0, 20), lettura('2026-10-07', 30, 20, 40)]), 40); // 40 pagine in 60 minuti
});
test('velocità: troppo pochi dati (meno di 20 minuti)', () => uguale(C.ritmo([lettura(OGGI, 10, 0, 8)]), null));
test('velocità: le letture senza minuti o senza pagine non entrano nel conto', () => {
  uguale(C.ritmo([lettura(OGGI, 30, 0, 30), lettura('2026-10-07', 0, 30, 90), lettura('2026-10-06', 45, null, null)]), 60);
});
test('velocità: se il libro ha abbastanza dati si usa la sua', () => {
  const letture = [lettura(OGGI, 60, 0, 20, 'lento'), lettura(OGGI, 60, 0, 60, 'veloce')];
  uguale(C.ritmo(letture, 'lento'), 20);
  uguale(C.ritmo(letture, 'veloce'), 60);
  uguale(C.ritmo(letture), 40);
});
test('velocità: libro con pochi dati → quella di tutti i libri', () => {
  const letture = [lettura(OGGI, 10, 0, 5, 'nuovo'), lettura(OGGI, 60, 0, 30, 'altro')];
  uguale(Math.round(C.ritmo(letture, 'nuovo')), 30); // 35 pagine in 70 minuti
});
test('stima: minuti che mancano alla fine', () => {
  const l = libro({ id: 'a', pagine: 300, pagina: 100, stato: 'leggendo', iniziato: '2026-09-01' });
  const s = C.stima(l, [lettura(OGGI, 60, 60, 100)], OGGI); // 40 pagine/ora, ne mancano 200 → 5 ore
  uguale(s.minuti, 300);
});
test('stima: giorno di fine con la media degli ultimi 14 giorni', () => {
  const l = libro({ id: 'a', pagine: 240, pagina: 100, stato: 'leggendo', iniziato: '2026-09-01' });
  // 140 pagine in 14 giorni = 10 al giorno; ne mancano 140 → 14 giorni
  const s = C.stima(l, [lettura('2026-10-01', 0, 0, 70), lettura(OGGI, 0, 70, 140)], OGGI);
  uguale(s.giorno, '2026-10-22');
});
test('stima: libro iniziato da poco, la media si fa sui giorni da quando l’hai iniziato', () => {
  const l = libro({ id: 'a', pagine: 100, pagina: 40, stato: 'leggendo', iniziato: '2026-10-07' });
  // 40 pagine in 2 giorni = 20 al giorno; ne mancano 60 → 3 giorni
  uguale(C.stima(l, [lettura('2026-10-07', 0, 0, 20), lettura(OGGI, 0, 20, 40)], OGGI).giorno, '2026-10-11');
});
test('stima: rileggendo un libro non contano le letture della volta prima', () => {
  const l = libro({ id: 'a', pagine: 300, pagina: 0, stato: 'leggendo', iniziato: OGGI });
  uguale(C.stima(l, [lettura('2026-10-05', 0, 200, 300)], OGGI).giorno, null);
});
test('stima: niente letture → niente stima', () => {
  const l = libro({ id: 'a', pagine: 100, pagina: 40, stato: 'leggendo' });
  uguale(C.stima(l, [], OGGI), { minuti: null, giorno: null });
});
test('stima: libro senza numero di pagine', () => uguale(C.stima(libro({ id: 'a', pagina: 40, stato: 'leggendo' }), [lettura(OGGI, 60, 0, 40)], OGGI), { minuti: null, giorno: null }));

gruppo('Statistiche dell’anno');
const dati = {
  libri: [
    libro({ id: 'a', titolo: 'Uno', autore: 'Eco', pagine: 500, stato: 'letto', finito: '2026-03-10', voto: 5 }),
    libro({ id: 'b', titolo: 'Due', autore: 'Eco', pagine: 200, stato: 'letto', finito: '2026-03-28', voto: 3 }),
    libro({ id: 'c', titolo: 'Tre', autore: 'Levi', pagine: 150, stato: 'letto', finito: '2025-12-30', voto: 4 }),
    libro({ id: 'd', titolo: 'Quattro', autore: 'Calvino', stato: 'leggendo', pagine: 300, pagina: 50 }),
    libro({ id: 'e', titolo: 'Cinque', autore: 'Morante', pagine: 700, stato: 'abbandonato', finito: '2026-05-01' })
  ],
  letture: [lettura('2026-03-09', 30, 0, 40), lettura('2026-03-10', 45, 40, 100), lettura('2026-10-08', 0, 0, 50, 'd'), lettura('2025-12-30', 20, 0, 10, 'c')]
};
test('libri finiti: solo quelli letti in quell’anno, dal più recente', () => uguale(C.libriFiniti(dati.libri, '2026').map(l => l.id), ['b', 'a']));
test('un libro riletto conta in ogni anno in cui l’hai finito', () => {
  const libri = [libro({ id: 'r', titolo: 'Riletto', stato: 'letto', finito: '2026-02-01', finitoPrima: ['2024-06-01'] }), libro({ id: 's', titolo: 'In rilettura', stato: 'leggendo', finitoPrima: ['2024-08-01'] })];
  uguale(C.libriFiniti(libri, '2024').map(l => [l.id, l.finito]), [['s', '2024-08-01'], ['r', '2024-06-01']]);
  uguale(C.libriFiniti(libri, '2026').map(l => l.id), ['r']);
  uguale(C.anniConDati({ libri, letture: [] }, '2026-10-08'), ['2026', '2024']);
});
test('un libro abbandonato non è un libro finito', () => vero(!C.libriFiniti(dati.libri, '2026').some(l => l.id === 'e')));
test('totali dell’anno', () => {
  const s = C.statisticheAnno(dati, '2026');
  uguale([s.pagine, s.minuti, s.giorni, s.finiti.length], [150, 75, 3, 2]);
});
test('mese per mese', () => {
  const s = C.statisticheAnno(dati, '2026');
  uguale(s.mesi[2], { pagine: 100, minuti: 75, libri: 2 }); // marzo
  uguale(s.mesi[9], { pagine: 50, minuti: 0, libri: 0 });   // ottobre
  uguale(s.mesi[0], { pagine: 0, minuti: 0, libri: 0 });
});
test('voto medio, autore più letto, libro più lungo', () => {
  const s = C.statisticheAnno(dati, '2026');
  uguale(s.votoMedio, 4);
  uguale(s.autori[0], { nome: 'Eco', n: 2 });
  uguale(s.piuLungo.id, 'a');
});
test('anno senza niente', () => {
  const s = C.statisticheAnno(dati, '2020');
  uguale([s.pagine, s.minuti, s.giorni, s.finiti.length, s.votoMedio, s.piuLungo], [0, 0, 0, 0, null, null]);
});
test('anni con dati: dal più recente, con sempre l’anno in corso', () => {
  uguale(C.anniConDati(dati, '2026-10-08'), ['2026', '2025']);
  uguale(C.anniConDati({ libri: [], letture: [] }, '2027-01-01'), ['2027']);
});

gruppo('Obiettivo dell’anno');
test('nessun obiettivo', () => uguale(C.obiettivoAnno(3, undefined, '2026', OGGI), null));
test('a metà anno con metà dei libri: in linea', () => {
  const o = C.obiettivoAnno(6, 12, '2026', '2026-07-02'); // 183 giorni su 365 → 6 attesi
  uguale([o.attesi, o.scarto, o.stato, o.percento], [6, 0, 'in-linea', 50]);
});
test('indietro di due', () => {
  const o = C.obiettivoAnno(4, 12, '2026', '2026-07-02');
  uguale([o.scarto, o.stato], [-2, 'indietro']);
});
test('avanti', () => uguale(C.obiettivoAnno(9, 12, '2026', '2026-07-02').stato, 'avanti'));
test('raggiunto (e la barra non supera il 100%)', () => {
  const o = C.obiettivoAnno(14, 12, '2026', '2026-11-01');
  uguale([o.stato, o.percento], ['raggiunto', 100]);
});
test('il primo gennaio non sei già indietro', () => uguale(C.obiettivoAnno(0, 12, '2026', '2026-01-01').stato, 'in-linea'));
test('anno passato: contano tutti i libri attesi, e se non ci sei arrivato l’obiettivo è mancato', () => {
  const o = C.obiettivoAnno(10, 12, '2025', '2026-03-01');
  uguale([o.attesi, o.stato], [12, 'mancato']);
  uguale(C.obiettivoAnno(12, 12, '2025', '2026-03-01').stato, 'raggiunto');
});

gruppo('Griglia dell’attività');
test('18 settimane di 7 giorni, l’ultima è quella di oggi', () => {
  const g = C.grigliaAttivita([], OGGI, 18);
  uguale([g.length, g[0].length], [18, 7]);
  uguale(g[17][0].giorno, '2026-10-05'); // lunedì di questa settimana
  uguale(g[17][3].giorno, OGGI);
  uguale(g[17].map(x => x.futuro), [false, false, false, false, true, true, true]);
  uguale(g[0][0].giorno, '2026-06-08');
});
test('livelli: più leggi, più è scuro', () => {
  const g = C.grigliaAttivita([lettura('2026-10-05', 10), lettura('2026-10-06', 20), lettura('2026-10-07', 45), lettura(OGGI, 90)], OGGI, 2);
  uguale(g[1].slice(0, 4).map(x => x.livello), [1, 2, 3, 4]);
});
test('livelli: senza cronometro contano le pagine', () => {
  uguale(C.grigliaAttivita([lettura(OGGI, 0, 0, 40)], OGGI, 1)[0][3].livello, 3);
});

gruppo('Ripasso delle parole');
const parola = campi => ripulisciParola({ parola: 'ubbia', data: '2026-10-01', ...campi });
test('una parola nuova si ripassa dal giorno dopo', () => uguale(parola({}).prossimo, '2026-10-02'));
test('da ripassare: solo quelle arrivate alla loro data, le più vecchie prima', () => {
  const lista = [parola({ id: '1', prossimo: '2026-10-09' }), parola({ id: '2', prossimo: '2026-10-08' }), parola({ id: '3', prossimo: '2026-10-01' })];
  uguale(C.daRipassare(lista, OGGI).map(p => p.id), ['3', '2']);
});
test('la sapevo: sale di un livello e torna tra 3 giorni', () => {
  const p = C.dopoRipasso(parola({ livello: 0 }), true, OGGI);
  uguale([p.livello, p.prossimo, p.ripassi, p.errori], [1, '2026-10-11', 1, 0]);
});
test('la sapevo più volte: gli intervalli si allungano (3, 7, 16, 35, 90 giorni)', () => {
  let p = parola({ livello: 0 });
  const giorni = [];
  for (let i = 0; i < 5; i++) { p = C.dopoRipasso(p, true, OGGI); giorni.push(p.prossimo); }
  uguale(giorni, ['2026-10-11', '2026-10-15', '2026-10-24', '2026-11-12', '2027-01-06']);
  uguale(p.livello, 5);
});
test('al livello massimo resta lì', () => uguale(C.dopoRipasso(parola({ livello: 5 }), true, OGGI).livello, 5));
test('non la ricordavo: torna all’inizio e la rivedo domani', () => {
  const p = C.dopoRipasso(parola({ livello: 4, ripassi: 6, errori: 1 }), false, OGGI);
  uguale([p.livello, p.prossimo, p.ripassi, p.errori], [0, '2026-10-09', 7, 2]);
});
test('dopoRipasso non modifica la parola ricevuta', () => {
  const p = parola({ livello: 2 });
  C.dopoRipasso(p, true, OGGI);
  uguale(p.livello, 2);
});
test('riepilogo delle parole', () => {
  const r = C.riepilogoParole([parola({ livello: 5, prossimo: '2027-01-01' }), parola({ livello: 0 }), parola({ livello: 2, prossimo: '2026-12-01' })], OGGI);
  uguale([r.totale, r.daRipassare, r.imparate], [3, 1, 1]);
  uguale(r.perLivello, [1, 0, 1, 0, 0, 1]);
});

gruppo('Elenchi e ricerca');
test('in lettura: prima il libro letto più di recente', () => {
  const libri = [libro({ id: 'x', stato: 'leggendo', iniziato: '2026-10-01' }), libro({ id: 'y', stato: 'leggendo', iniziato: '2026-09-01' })];
  uguale(C.libriDi(libri, 'leggendo', [lettura('2026-10-07', 5, 0, 1, 'y')]).map(l => l.id), ['y', 'x']);
});
test('letti: l’ultimo finito in cima', () => {
  const libri = [libro({ id: 'x', stato: 'letto', finito: '2026-01-01' }), libro({ id: 'y', stato: 'letto', finito: '2026-06-01' })];
  uguale(C.libriDi(libri, 'letto').map(l => l.id), ['y', 'x']);
});
test('da leggere: l’ultimo aggiunto in cima', () => {
  const libri = [libro({ id: 'x', stato: 'da-leggere', aggiunto: '2026-01-01' }), libro({ id: 'y', stato: 'da-leggere', aggiunto: '2026-06-01' }), libro({ id: 'z', stato: 'voglio' })];
  uguale(C.libriDi(libri, 'da-leggere').map(l => l.id), ['y', 'x']);
});
test('ricerca: senza badare ad accenti e maiuscole, in titolo e autore', () => {
  const libri = [libro({ id: 'x', titolo: 'Perché leggere i classici', autore: 'Italo Calvino' }), libro({ id: 'y', titolo: 'Se questo è un uomo', autore: 'Primo Levi' })];
  uguale(C.cercaLibri(libri, 'PERCHE').map(l => l.id), ['x']);
  uguale(C.cercaLibri(libri, 'levi uomo').map(l => l.id), ['y']);
  uguale(C.cercaLibri(libri, '  ').length, 2);
  uguale(C.cercaLibri(libri, 'zzz'), []);
});
test('ricerca tra le parole: nella parola e nel significato', () => {
  const lista = [parola({ id: '1', parola: 'ubbia', significato: 'timore infondato' }), parola({ id: '2', parola: 'làbile', significato: 'che dura poco' })];
  uguale(C.cercaParole(lista, 'labile').map(p => p.id), ['2']);
  uguale(C.cercaParole(lista, 'timore').map(p => p.id), ['1']);
});
test('doppione: stesso ISBN', () => {
  const libri = [libro({ id: 'x', titolo: 'Il nome della rosa', autore: 'Umberto Eco', isbn: '9788845207051' })];
  uguale(C.doppione(libri, { titolo: 'Altro titolo', autore: '', isbn: '9788845207051' }).id, 'x');
});
test('doppione: stesso titolo e autore, scritti diversi', () => {
  const libri = [libro({ id: 'x', titolo: 'Il nome della rosa', autore: 'Umberto Eco' })];
  uguale(C.doppione(libri, { titolo: 'IL NOME DELLA ROSA ', autore: 'umberto eco' }).id, 'x');
  uguale(C.doppione(libri, { titolo: 'Il nome della rosa', autore: 'Un altro' }), null);
  uguale(C.doppione(libri, { titolo: 'Il nome della rosa', autore: 'Umberto Eco' }, 'x'), null); // lo stesso libro, in modifica
});
test('doppione: titoli in altri alfabeti si confrontano come sono scritti', () => {
  const libri = [libro({ id: 'x', titolo: 'Война и мир', autore: 'Толстой' })];
  uguale(C.doppione(libri, { titolo: '罪と罰', autore: 'ドストエフスキー' }), null);
  uguale(C.doppione(libri, { titolo: 'война и мир', autore: 'толстой' }).id, 'x');
});
test('in lettura: funziona anche se un libro ha per id una parola speciale di JavaScript', () => {
  const libri = [libro({ id: 'constructor', stato: 'leggendo', iniziato: '2026-10-01' }), libro({ id: 'toString', stato: 'leggendo', iniziato: '2026-09-01' })];
  uguale(C.libriDi(libri, 'leggendo', []).map(l => l.id), ['constructor', 'toString']);
});
test('giorno della settimana in cui leggi di più', () => {
  uguale(C.giornoPreferito([lettura('2026-10-08', 20), lettura('2026-10-01', 30), lettura('2026-10-04', 40)]), 4); // due giovedì battono una domenica
  uguale(C.giornoPreferito([]), null);
});
