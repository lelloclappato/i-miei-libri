// Test del formato dei dati (js/migrazione.js), del controllo dei backup (js/validazione.js)
// e delle piccole funzioni di js/utili.js.
import { gruppo, test, uguale, vero } from './mini-test.js';
import { upgrade, datiVuoti, ripulisciLibro, coloreDaTitolo, CURRENT_VERSION, COLORI_COPERTINA } from '../js/migrazione.js';
import { controllaBackup } from '../js/validazione.js';
import * as U from '../js/utili.js';

gruppo('Date e testi');
test('aggiungere giorni attraversa mesi e anni', () => {
  uguale(U.piuGiorni('2026-12-30', 3), '2027-01-02');
  uguale(U.piuGiorni('2026-03-01', -1), '2026-02-28');
  uguale(U.piuGiorni('2028-02-28', 1), '2028-02-29'); // anno bisestile
});
test('giorni tra due date, anche a cavallo del cambio d’ora', () => {
  uguale(U.giorniTra('2026-03-28', '2026-03-30'), 2); // 29 marzo 2026: ora legale
  uguale(U.giorniTra('2026-10-24', '2026-10-26'), 2); // 25 ottobre 2026: ora solare
  uguale(U.giorniTra('2026-10-08', '2026-10-01'), -7);
});
test('lunedì della settimana', () => {
  uguale(U.lunediDi('2026-10-08'), '2026-10-05');
  uguale(U.lunediDi('2026-10-05'), '2026-10-05');
  uguale(U.lunediDi('2026-10-11'), '2026-10-05'); // domenica
});
test('chiave valida: solo giorni che esistono', () => {
  vero(U.chiaveValida('2026-10-08'));
  vero(!U.chiaveValida('2026-02-31'));
  vero(!U.chiaveValida('8/10/2026'));
  vero(!U.chiaveValida(null));
});
test('durata in parole', () => uguale([U.durata(40), U.durata(120), U.durata(135), U.durata(0)], ['40 min', '2 h', '2 h 15 min', '0 min']));
test('cronometro', () => uguale([U.cronometro(0), U.cronometro(65000), U.cronometro(3909000)], ['00:00', '01:05', '1:05:09']));
test('numeri all’italiana', () => uguale([U.num(12345), U.num(999), U.decimale(3.75), U.decimale(4)], ['12.345', '999', '3,8', '4']));
test('singolare e plurale', () => uguale([U.plurale(1, 'libro', 'libri'), U.plurale(3, 'libro', 'libri'), U.plurale(0, 'libro', 'libri')], ['1 libro', '3 libri', '0 libri']));
test('testo semplice per le ricerche', () => uguale(U.semplice('  Perché, già! L’è così '), 'perche gia l e cosi'));
test('esc protegge l’HTML', () => uguale(U.esc('<b>"a" & \'b\'</b>'), '&lt;b&gt;&quot;a&quot; &amp; &#39;b&#39;&lt;/b&gt;'));
test('numero intero da un campo', () => uguale([U.intero('42'), U.intero(' 7 '), U.intero(''), U.intero('abc'), U.intero('-3'), U.intero(null)], [42, 7, null, null, null, null]));
test('la data con l’articolo giusto: il 7, l’8, l’11, il 1º', () => {
  uguale([U.ilGiorno('2026-10-07'), U.ilGiorno('2026-10-08'), U.ilGiorno('2026-03-11'), U.ilGiorno('2026-10-01'), U.ilGiorno('2026-10-18')],
    ['il 7 ottobre 2026', 'l’8 ottobre 2026', 'l’11 marzo 2026', 'il 1º ottobre 2026', 'il 18 ottobre 2026']);
  uguale([U.ilGiorno('2026-10-08', {}, 'del'), U.ilGiorno('2026-10-09', {}, 'del'), U.ilGiorno('2026-10-08', {}, 'al'), U.ilGiorno('2026-10-08', { breve: true })],
    ['dell’8 ottobre 2026', 'del 9 ottobre 2026', 'all’8 ottobre 2026', 'l’8 ott 2026']);
});
test('numero d’ordine con l’articolo: il primo, il 3º, l’8º, l’11º, l’80º', () => {
  uguale([U.ilNumero(1), U.ilNumero(3), U.ilNumero(8), U.ilNumero(11), U.ilNumero(18), U.ilNumero(80)], ['il primo', 'il 3º', 'l’8º', 'l’11º', 'il 18º', 'l’80º']);
});
test('quando: oggi, ieri, giorni fa', () => {
  uguale([U.quandoTesto('2026-10-08', '2026-10-08'), U.quandoTesto('2026-10-07', '2026-10-08'), U.quandoTesto('2026-10-04', '2026-10-08')], ['oggi', 'ieri', '4 giorni fa']);
});

gruppo('Formato dei dati');
test('dati vuoti: versione attuale e nessun libro', () => {
  const d = datiVuoti();
  uguale([d.version, d.libri.length, d.parole.length, d.letture.length, d.timer], [CURRENT_VERSION, 0, 0, 0, null]);
});
test('upgrade di qualcosa che non è un oggetto: dati vuoti', () => {
  uguale(upgrade(null), datiVuoti());
  uguale(upgrade('ciao'), datiVuoti());
  uguale(upgrade([1, 2]), datiVuoti());
});
test('un libro con solo il titolo riceve tutti i campi', () => {
  const l = ripulisciLibro({ titolo: '  Il barone rampante ' });
  uguale(l.titolo, 'Il barone rampante');
  uguale([l.stato, l.pagina, l.pagine, l.voto, l.copertina, l.capitoli, l.citazioni, l.finito], ['da-leggere', 0, null, 0, null, [], [], null]);
  vero(l.id && l.aggiunto);
});
test('valori sbagliati vengono corretti', () => {
  const l = ripulisciLibro({ titolo: '', stato: 'boh', pagine: -5, pagina: 'dieci', voto: 9, finito: '2026-13-40', copertina: 'javascript:alert(1)', isbn: '978-88-452-0705-1' });
  uguale([l.titolo, l.stato, l.pagine, l.pagina, l.voto, l.finito, l.copertina, l.isbn], ['Senza titolo', 'da-leggere', null, 0, 0, null, null, '9788845207051']);
});
test('la pagina non può superare le pagine del libro', () => uguale(ripulisciLibro({ titolo: 'x', pagine: 100, pagina: 250 }).pagina, 100));
test('la copertina deve essere un indirizzo https', () => {
  uguale(ripulisciLibro({ titolo: 'x', copertina: 'http://esempio.it/a.jpg' }).copertina, null);
  uguale(ripulisciLibro({ titolo: 'x', copertina: 'https://covers.openlibrary.org/b/id/1-M.jpg' }).copertina, 'https://covers.openlibrary.org/b/id/1-M.jpg');
});
test('tinta della copertina: sempre la stessa per lo stesso titolo, e tra quelle previste', () => {
  uguale(coloreDaTitolo('Il nome della rosa'), coloreDaTitolo('Il nome della rosa'));
  for (const t of ['a', 'Il barone rampante', 'Ⓐ strano', '']) vero(coloreDaTitolo(t) >= 0 && coloreDaTitolo(t) < COLORI_COPERTINA);
});
test('due libri con lo stesso id: il secondo ne riceve uno nuovo', () => {
  const d = upgrade({ libri: [{ id: 'a', titolo: 'Uno' }, { id: 'a', titolo: 'Due' }] });
  vero(d.libri[0].id !== d.libri[1].id);
});
test('parola collegata a un libro che non c’è più: resta, senza collegamento', () => {
  const d = upgrade({ libri: [{ id: 'a', titolo: 'Uno' }], parole: [{ parola: 'ubbia', libroId: 'zzz', titoloLibro: 'Vecchio' }, { parola: 'lapalissiano', libroId: 'a' }] });
  uguale(d.parole.map(p => p.libroId), [null, 'a']);
  uguale(d.parole[0].titoloLibro, 'Vecchio');
});
test('id ripetuti in parole, letture, riassunti e citazioni: ognuno riceve il suo', () => {
  const d = upgrade({
    libri: [{ id: 'a', titolo: 'Uno', capitoli: [{ id: 'c', numero: 1, riassunto: 'x' }, { id: 'c', numero: 2, riassunto: 'y' }], citazioni: [{ id: 'q', testo: 'uno' }, { id: 'q', testo: 'due' }] }],
    parole: [{ id: 'P', parola: 'alfa' }, { id: 'P', parola: 'beta' }],
    letture: [{ id: 'L', libroId: 'a', giorno: '2026-01-01', minuti: 5 }, { id: 'L', libroId: 'a', giorno: '2026-01-02', minuti: 5 }]
  });
  const diversi = lista => new Set(lista.map(x => x.id)).size === lista.length;
  vero(diversi(d.parole) && diversi(d.letture) && diversi(d.libri[0].capitoli) && diversi(d.libri[0].citazioni));
  uguale([d.parole[0].id, d.libri[0].capitoli[0].id], ['P', 'c']); // il primo tiene il suo
});
test('id strani ("a/b", "constructor", troppo lunghi) vengono sostituiti senza perdere i collegamenti', () => {
  const d = upgrade({
    libri: [{ id: 'a/b', titolo: 'Barra' }, { id: 'constructor', titolo: 'Va bene' }, { id: '50%', titolo: 'Percento' }],
    parole: [{ parola: 'ubbia', libroId: 'a/b' }, { parola: 'altra', libroId: '50%' }],
    letture: [{ libroId: 'a/b', giorno: '2026-01-01', minuti: 10 }],
    timer: { libroId: '50%', inizio: 1 }
  });
  vero(d.libri.every(l => /^[A-Za-z0-9_-]+$/.test(l.id)));
  uguale(d.libri[1].id, 'constructor');
  uguale([d.parole[0].libroId, d.parole[1].libroId, d.letture[0].libroId, d.timer.libroId], [d.libri[0].id, d.libri[2].id, d.libri[0].id, d.libri[2].id]);
});
test('letture vuote scartate, letture nel futuro riportate a oggi', () => {
  const d = upgrade({ libri: [{ id: 'a', titolo: 'x' }], letture: [
    { libroId: 'a', giorno: '2026-01-01', minuti: 0, da: null, a: null }, { libroId: 'a', giorno: '2026-01-01', minuti: 0, da: 50, a: 20 },
    { libroId: 'a', giorno: '2999-01-01', minuti: 10 }, { libroId: 'a', giorno: '2026-01-02', minuti: 0, da: 0, a: 10 }] });
  uguale(d.letture.length, 2);
  uguale(d.letture[0].giorno, U.oggi());
});
test('i giorni in cui un libro era già stato finito: solo date valide, senza ripetizioni, in ordine', () => {
  uguale(ripulisciLibro({ titolo: 'x', finitoPrima: ['2025-03-01', 'boh', '2024-01-01', '2025-03-01'] }).finitoPrima, ['2024-01-01', '2025-03-01']);
  uguale(ripulisciLibro({ titolo: 'x' }).finitoPrima, []);
});
test('parole senza testo e letture senza libro vengono scartate', () => {
  const d = upgrade({ libri: [{ id: 'a', titolo: 'Uno' }], parole: [{ parola: '  ' }, 'boh'], letture: [{ libroId: 'zzz', giorno: '2026-10-01', minuti: 10 }, { libroId: 'a', giorno: '2026-10-01', minuti: 10 }] });
  uguale([d.parole.length, d.letture.length], [0, 1]);
});
test('impostazioni: obiettivi validi, tema conosciuto', () => {
  const d = upgrade({ libri: [], impostazioni: { obiettivi: { '2026': 12, 'boh': 3, '2027': -1, '2028': 2.5 }, tema: 'fucsia' } });
  uguale(d.impostazioni.obiettivi, { '2026': 12 });
  uguale(d.impostazioni.tema, 'auto');
});
test('cronometro salvato: resta solo se il suo libro esiste', () => {
  uguale(upgrade({ libri: [{ id: 'a', titolo: 'x' }], timer: { libroId: 'a', inizio: 1000, accumulato: 500, inPausa: true, giornoInizio: '2026-10-01', paginaInizio: 40 } }).timer,
    { libroId: 'a', inizio: 1000, accumulato: 500, inPausa: true, giornoInizio: '2026-10-01', paginaInizio: 40 });
  uguale(upgrade({ libri: [{ id: 'a', titolo: 'x' }], timer: { libroId: 'b', inizio: 1000 } }).timer, null);
});
test('upgrade due volte dà lo stesso risultato', () => {
  const una = upgrade({ libri: [{ id: 'a', titolo: 'Uno', capitoli: [{ id: 'c', numero: 1, riassunto: 'x', data: '2026-01-01' }], aggiunto: '2026-01-01' }], parole: [{ id: 'p', parola: 'ubbia', data: '2026-01-01' }] });
  uguale(upgrade(una), una);
});

gruppo('Controllo del backup');
test('un file qualunque non è un backup', () => {
  vero(!controllaBackup(null).ok);
  vero(!controllaBackup([]).ok);
  vero(!controllaBackup({ habits: [] }).ok);
});
test('il backup di un’altra app viene rifiutato', () => {
  const c = controllaBackup({ app: 'le-mie-abitudini', libri: [] });
  vero(!c.ok && c.errori[0].includes('altra app'));
});
test('backup di una versione più nuova: rifiutato (anche se la versione è scritta come testo)', () => {
  vero(!controllaBackup({ version: CURRENT_VERSION + 1, libri: [] }).ok);
  vero(!controllaBackup({ version: '99', libri: [] }).ok);
});
test('backup buono: riepilogo di cosa contiene', () => {
  const c = controllaBackup({
    app: 'i-miei-libri', version: 1,
    libri: [{ id: 'a', titolo: 'Uno', capitoli: [{ numero: 1, riassunto: 'x' }, { numero: 2, riassunto: 'y' }], citazioni: [{ testo: 'bella frase' }] }, { id: 'b', titolo: 'Due' }],
    parole: [{ parola: 'ubbia', libroId: 'a' }],
    letture: [{ libroId: 'a', giorno: '2026-10-01', minuti: 20 }]
  });
  vero(c.ok);
  uguale(c.riepilogo, { libri: 2, capitoli: 2, citazioni: 1, parole: 1, letture: 1 });
  uguale(c.avvisi, []);
});
test('backup con pezzi rotti: si importa il resto e lo si dice', () => {
  const c = controllaBackup({ libri: [{ id: 'a', titolo: 'Uno', citazioni: [{ testo: '' }, { testo: 'ok' }] }, 'rotto'], parole: [{ parola: '' }, { parola: 'ubbia' }] });
  vero(c.ok);
  uguale([c.riepilogo.libri, c.riepilogo.citazioni, c.riepilogo.parole], [1, 1, 1]);
  uguale(c.avvisi.length, 3);
});
