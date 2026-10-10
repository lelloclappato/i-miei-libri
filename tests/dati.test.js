// Test delle operazioni sui dati (js/dati.js): aggiungere libri, cambiare lista, segnare la pagina,
// registrare letture, riassunti, citazioni, parole. Lavorano sul salvataggio di prova
// ("libri-app-PROVA"), mai sui dati veri: vedi tests/test.html.
import { gruppo, test, uguale, vero } from './mini-test.js';
import { oggi, piuGiorni } from '../js/utili.js';
import { datiVuoti } from '../js/migrazione.js';
import { pagineDi, dopoRipasso } from '../js/calcoli.js';
import * as D from '../js/dati.js';

const OGGI = oggi();
// ogni test riparte da zero
function daCapo() { D.setData(datiVuoti()); }
const pagineOggi = id => D.data.letture.filter(s => s.libroId === id && s.giorno === OGGI).reduce((t, s) => t + pagineDi(s), 0);

gruppo('Sicurezza dei test');
test('i test usano il salvataggio di prova, non quello vero', () => uguale(D.STORE, 'libri-app-PROVA'));

gruppo('Libri e liste');
test('aggiungere un libro da leggere', () => {
  daCapo();
  const l = D.aggiungiLibro({ titolo: 'Il barone rampante', autore: 'Italo Calvino', pagine: 280 }, 'da-leggere');
  uguale([D.data.libri.length, l.stato, l.aggiunto, l.iniziato, l.finito, l.pagina], [1, 'da-leggere', OGGI, null, null, 0]);
  vero(D.libro(l.id) === l);
});
test('aggiungerlo come "lo sto leggendo" segna l’inizio oggi', () => {
  daCapo();
  const l = D.aggiungiLibro({ titolo: 'x', pagine: 100 }, 'leggendo');
  uguale([l.stato, l.iniziato], ['leggendo', OGGI]);
});
test('aggiungerlo come già letto, con la sua data: nessuna pagina finisce nelle statistiche di oggi', () => {
  daCapo();
  const l = D.aggiungiLibro({ titolo: 'x', pagine: 300 }, 'letto', '2024-05-10');
  uguale([l.stato, l.finito, l.pagina, D.data.letture.length], ['letto', '2024-05-10', 300, 0]);
});
test('i dati restano salvati (si rileggono uguali dal browser)', () => {
  daCapo();
  D.aggiungiLibro({ titolo: 'Salvato' }, 'voglio');
  const letti = JSON.parse(localStorage.getItem(D.STORE));
  uguale([letti.libri.length, letti.libri[0].titolo, letti.libri[0].stato], [1, 'Salvato', 'voglio']);
});
test('iniziare un libro in attesa', () => {
  daCapo();
  const l = D.aggiungiLibro({ titolo: 'x', pagine: 100 }, 'da-leggere');
  D.cambiaStato(l.id, 'leggendo');
  uguale([l.stato, l.iniziato, l.finito], ['leggendo', OGGI, null]);
});
test('finire un libro che stavi leggendo: le pagine mancanti contano nel giorno in cui lo finisci', () => {
  daCapo();
  const l = D.aggiungiLibro({ titolo: 'x', pagine: 200 }, 'leggendo');
  D.aggiornaPagina(l.id, 150);
  D.cambiaStato(l.id, 'letto');
  uguale([l.stato, l.finito, l.pagina, pagineOggi(l.id)], ['letto', OGGI, 200, 200]);
});
test('segnare come letto un libro mai iniziato: nessuna pagina nelle statistiche', () => {
  daCapo();
  const l = D.aggiungiLibro({ titolo: 'x', pagine: 200 }, 'da-leggere');
  D.cambiaStato(l.id, 'letto', '2026-01-15');
  uguale([l.finito, l.pagina, D.data.letture.length], ['2026-01-15', 200, 0]);
});
test('abbandonare un libro: resta la pagina a cui eri arrivato', () => {
  daCapo();
  const l = D.aggiungiLibro({ titolo: 'x', pagine: 200 }, 'leggendo');
  D.aggiornaPagina(l.id, 60);
  D.cambiaStato(l.id, 'abbandonato');
  uguale([l.stato, l.pagina, l.finito], ['abbandonato', 60, OGGI]);
  D.cambiaStato(l.id, 'leggendo'); // riprenderlo
  uguale([l.stato, l.pagina, l.finito], ['leggendo', 60, null]);
});
test('rileggere un libro già letto: si riparte da pagina 0, ma resta scritto quando l’avevi finito', () => {
  daCapo();
  const l = D.aggiungiLibro({ titolo: 'x', pagine: 200 }, 'letto', '2025-01-01');
  D.cambiaStato(l.id, 'leggendo');
  uguale([l.pagina, l.iniziato, l.finito, l.finitoPrima], [0, OGGI, null, ['2025-01-01']]);
  D.aggiornaPagina(l.id, 200); D.cambiaStato(l.id, 'letto');
  uguale([l.finito, l.finitoPrima, pagineOggi(l.id)], [OGGI, ['2025-01-01'], 200]);
});
test('togliere un libro dai letti rimettendolo in attesa: come se non fosse mai stato letto', () => {
  daCapo();
  const l = D.aggiungiLibro({ titolo: 'x', pagine: 200 }, 'letto', '2025-01-01');
  D.cambiaStato(l.id, 'da-leggere');
  uguale([l.stato, l.pagina, l.iniziato, l.finito, l.finitoPrima], ['da-leggere', 0, null, null, []]);
});
test('aggiungere un libro già cominciato: la pagina a cui sei non finisce nelle statistiche', () => {
  daCapo();
  const l = D.aggiungiLibro({ titolo: 'x', pagine: 300 }, 'leggendo', null, 150);
  uguale([l.pagina, D.data.letture.length], [150, 0]);
  D.aggiornaPagina(l.id, 170);
  uguale([l.pagina, pagineOggi(l.id)], [170, 20]);
  uguale(D.aggiungiLibro({ titolo: 'y', pagine: 100 }, 'leggendo', null, 900).pagina, 100);
  uguale(D.aggiungiLibro({ titolo: 'z', pagine: 100 }, 'da-leggere', null, 50).pagina, 0); // vale solo per chi lo sta leggendo
});
test('una lista che non esiste non cambia niente', () => {
  daCapo();
  const l = D.aggiungiLibro({ titolo: 'x' }, 'voglio');
  uguale(D.cambiaStato(l.id, 'boh'), null);
  uguale(l.stato, 'voglio');
});
test('modificare la scheda non tocca stato, riassunti e citazioni; le parole seguono il titolo nuovo', () => {
  daCapo();
  const l = D.aggiungiLibro({ titolo: 'Vecchio titolo', pagine: 100 }, 'leggendo');
  D.salvaCapitolo(l.id, { numero: 1, riassunto: 'uno' });
  D.salvaParola({ parola: 'ubbia', libroId: l.id });
  D.modificaLibro(l.id, { titolo: 'Nuovo titolo', pagine: 120, stato: 'letto', capitoli: [] });
  uguale([l.titolo, l.pagine, l.stato, l.capitoli.length, D.data.parole[0].titoloLibro], ['Nuovo titolo', 120, 'leggendo', 1, 'Nuovo titolo']);
});
test('eliminare un libro: via letture e cronometro, le parole restano senza collegamento', () => {
  daCapo();
  const l = D.aggiungiLibro({ titolo: 'Da eliminare', pagine: 100 }, 'leggendo');
  const altro = D.aggiungiLibro({ titolo: 'Resta', pagine: 100 }, 'leggendo');
  D.aggiornaPagina(l.id, 10); D.aggiornaPagina(altro.id, 20);
  D.salvaParola({ parola: 'ubbia', libroId: l.id });
  D.avviaTimer(l.id);
  D.eliminaLibro(l.id);
  uguale([D.data.libri.length, D.data.letture.length, D.data.letture[0].libroId === altro.id, D.data.timer], [1, 1, true, null]);
  uguale([D.data.parole.length, D.data.parole[0].libroId, D.data.parole[0].titoloLibro], [1, null, 'Da eliminare']);
});
test('"Annulla" dopo averlo tolto: torna tutto com’era (posto in lista, diario, parole, cronometro)', () => {
  daCapo();
  const primo = D.aggiungiLibro({ titolo: 'Primo', pagine: 100 }, 'da-leggere');
  const l = D.aggiungiLibro({ titolo: 'Tolto per sbaglio', pagine: 100 }, 'leggendo');
  D.aggiungiLibro({ titolo: 'Terzo', pagine: 100 }, 'da-leggere');
  D.aggiornaPagina(l.id, 30);
  D.salvaParola({ parola: 'ubbia', libroId: l.id });
  D.avviaTimer(l.id);
  const prima = JSON.stringify(D.data);
  const copia = D.eliminaLibro(l.id);
  uguale(D.data.libri.map(x => x.titolo), ['Primo', 'Terzo']);
  vero(D.ripristinaLibro(copia));
  uguale(JSON.stringify(D.data), prima);
  vero(!D.ripristinaLibro(copia), 'una seconda volta non lo duplica');
  uguale(D.eliminaLibro('non-esiste'), null);
  vero(primo);
});
test('voto e recensione', () => {
  daCapo();
  const l = D.aggiungiLibro({ titolo: 'x' }, 'letto');
  D.salvaGiudizio(l.id, 4, '  Bello.  ');
  uguale([l.voto, l.recensione], [4, 'Bello.']);
  D.salvaGiudizio(l.id, 9, '');
  uguale(l.voto, 0);
});

gruppo('Pagine e letture');
test('aggiornare la pagina registra le pagine lette oggi', () => {
  daCapo();
  const l = D.aggiungiLibro({ titolo: 'x', pagine: 300 }, 'leggendo');
  uguale(D.aggiornaPagina(l.id, 40), false);
  uguale([l.pagina, pagineOggi(l.id), D.data.letture.length], [40, 40, 1]);
});
test('due aggiornamenti nello stesso giorno: una sola riga nel diario, che si allunga', () => {
  daCapo();
  const l = D.aggiungiLibro({ titolo: 'x', pagine: 300 }, 'leggendo');
  D.aggiornaPagina(l.id, 40); D.aggiornaPagina(l.id, 75);
  uguale([D.data.letture.length, D.data.letture[0].da, D.data.letture[0].a, pagineOggi(l.id)], [1, 0, 75, 75]);
});
test('correggere la pagina all’indietro toglie le pagine contate in più', () => {
  daCapo();
  const l = D.aggiungiLibro({ titolo: 'x', pagine: 300 }, 'leggendo');
  D.aggiornaPagina(l.id, 40); D.aggiornaPagina(l.id, 400 /* troppo: si ferma a 300 */);
  uguale(l.pagina, 300);
  D.aggiornaPagina(l.id, 45);
  uguale([l.pagina, pagineOggi(l.id)], [45, 45]);
  D.aggiornaPagina(l.id, 0);
  uguale([l.pagina, pagineOggi(l.id), D.data.letture.length], [0, 0, 0]);
});
test('arrivare all’ultima pagina avvisa che il libro è finito (ma non lo sposta da solo)', () => {
  daCapo();
  const l = D.aggiungiLibro({ titolo: 'x', pagine: 120 }, 'leggendo');
  uguale(D.aggiornaPagina(l.id, 120), true);
  uguale(l.stato, 'leggendo');
});
test('segnare una pagina su un libro in attesa lo porta in lettura', () => {
  daCapo();
  const l = D.aggiungiLibro({ titolo: 'x', pagine: 120 }, 'da-leggere');
  D.aggiornaPagina(l.id, 12);
  uguale([l.stato, l.iniziato], ['leggendo', OGGI]);
});
test('lettura col cronometro: minuti e pagine, e il libro avanza', () => {
  daCapo();
  const l = D.aggiungiLibro({ titolo: 'x', pagine: 300 }, 'leggendo');
  D.aggiornaPagina(l.id, 50);
  const s = D.registraLettura({ libroId: l.id, giorno: OGGI, minuti: 30, da: 50, a: 72, tipo: 'timer' });
  uguale([s.minuti, pagineDi(s), l.pagina, pagineOggi(l.id)], [30, 22, 72, 72]);
});
test('lettura solo con i minuti: il segnalibro non si muove', () => {
  daCapo();
  const l = D.aggiungiLibro({ titolo: 'x', pagine: 300 }, 'leggendo');
  D.aggiornaPagina(l.id, 50);
  const s = D.registraLettura({ libroId: l.id, giorno: OGGI, minuti: 25, da: null, a: null, tipo: 'timer' });
  uguale([s.minuti, pagineDi(s), l.pagina], [25, 0, 50]);
});
test('lettura di un giorno passato più indietro del segnalibro: il segnalibro resta dov’è', () => {
  daCapo();
  const l = D.aggiungiLibro({ titolo: 'x', pagine: 300 }, 'leggendo');
  D.aggiornaPagina(l.id, 100);
  D.registraLettura({ libroId: l.id, giorno: piuGiorni(OGGI, -3), minuti: 20, da: 10, a: 30, tipo: 'manuale' });
  uguale(l.pagina, 100);
});
test('le stesse pagine non si contano due volte: lettura a mano sopra un aggiornamento di pagina dello stesso giorno', () => {
  daCapo();
  const l = D.aggiungiLibro({ titolo: 'x', pagine: 300 }, 'leggendo', null, 50);
  D.aggiornaPagina(l.id, 80);
  D.registraLettura({ libroId: l.id, giorno: OGGI, minuti: 30, da: 50, a: 80, tipo: 'manuale' });
  uguale([pagineOggi(l.id), D.data.letture.length, D.data.letture[0].minuti], [30, 1, 30]);
});
test('le stesse pagine non si contano due volte: una lettura che copre solo una parte dell’aggiornamento', () => {
  daCapo();
  const l = D.aggiungiLibro({ titolo: 'x', pagine: 300 }, 'leggendo');
  D.aggiornaPagina(l.id, 100);                                                             // pagine 0 → 100
  D.registraLettura({ libroId: l.id, giorno: OGGI, minuti: 20, da: 40, a: 60, tipo: 'manuale' }); // in mezzo
  uguale([pagineOggi(l.id), l.pagina], [100, 100]);
  uguale(D.data.letture.map(s => [s.da, s.a]).sort((a, b) => a[0] - b[0]), [[0, 40], [40, 60], [60, 100]]);
});
test('tornare indietro per una correzione e poi riandare avanti non riconta le pagine già contate', () => {
  daCapo();
  const l = D.aggiungiLibro({ titolo: 'x', pagine: 300 }, 'leggendo');
  D.data.libri[0].iniziato = piuGiorni(OGGI, -5);
  D.registraLettura({ libroId: l.id, giorno: piuGiorni(OGGI, -1), minuti: 0, da: 0, a: 100, tipo: 'manuale' }); // ieri fino a 100
  D.aggiornaPagina(l.id, 150); D.aggiornaPagina(l.id, 50); D.aggiornaPagina(l.id, 120);
  const totale = D.data.letture.reduce((t, s) => t + pagineDi(s), 0);
  uguale([l.pagina, totale, pagineOggi(l.id)], [120, 120, 20]);
});
test('una lettura su un libro abbandonato non lo rimette da sola tra quelli in lettura', () => {
  daCapo();
  const l = D.aggiungiLibro({ titolo: 'x', pagine: 300 }, 'leggendo');
  D.cambiaStato(l.id, 'abbandonato');
  D.registraLettura({ libroId: l.id, giorno: OGGI, minuti: 10, da: null, a: null, tipo: 'manuale' });
  D.aggiornaPagina(l.id, 20);
  uguale(l.stato, 'abbandonato');
});
test('lettura vuota (niente minuti, niente pagine) non viene registrata', () => {
  daCapo();
  const l = D.aggiungiLibro({ titolo: 'x', pagine: 300 }, 'leggendo');
  uguale(D.registraLettura({ libroId: l.id, giorno: OGGI, minuti: 0, da: 10, a: 10, tipo: 'manuale' }), null);
  uguale(D.data.letture.length, 0);
});
test('eliminare una lettura dal diario non sposta il segnalibro', () => {
  daCapo();
  const l = D.aggiungiLibro({ titolo: 'x', pagine: 300 }, 'leggendo');
  const s = D.registraLettura({ libroId: l.id, giorno: OGGI, minuti: 30, da: 0, a: 20, tipo: 'manuale' });
  D.eliminaLettura(s.id);
  uguale([D.data.letture.length, l.pagina], [0, 20]);
});

gruppo('Cronometro');
test('avviare, mettere in pausa, riprendere', () => {
  daCapo();
  const l = D.aggiungiLibro({ titolo: 'x' }, 'da-leggere');
  D.avviaTimer(l.id);
  uguale([l.stato, D.data.timer.libroId, D.data.timer.inPausa], ['leggendo', l.id, false]);
  D.data.timer.inizio = Date.now() - 5 * 60000; // come se fossero passati 5 minuti
  vero(Math.abs(D.tempoTimer() - 5 * 60000) < 2000);
  D.pausaTimer();
  const fermo = D.tempoTimer();
  vero(D.data.timer.inPausa && Math.abs(fermo - 5 * 60000) < 2000);
  uguale(D.tempoTimer(Date.now() + 60000), fermo); // in pausa il tempo non scorre
  D.riprendiTimer();
  vero(!D.data.timer.inPausa && D.tempoTimer(Date.now() + 60000) >= fermo + 59000);
  D.annullaTimer();
  uguale([D.data.timer, D.tempoTimer()], [null, 0]);
});
test('spostare il libro in un’altra lista ferma il cronometro, e i minuti letti finora restano nel diario', () => {
  daCapo();
  const l = D.aggiungiLibro({ titolo: 'x', pagine: 300 }, 'leggendo');
  D.avviaTimer(l.id);
  D.data.timer.inizio = Date.now() - 45 * 60000;
  D.cambiaStato(l.id, 'letto');
  uguale(D.data.timer, null);
  const cron = D.data.letture.find(s => s.tipo === 'timer');
  uguale([cron && cron.minuti, cron && cron.giorno], [45, OGGI]);
});
test('cronometro appena avviato e subito spostato: nessuna lettura da zero minuti', () => {
  daCapo();
  const l = D.aggiungiLibro({ titolo: 'x' }, 'leggendo');
  D.avviaTimer(l.id);
  D.cambiaStato(l.id, 'abbandonato');
  uguale([D.data.timer, D.data.letture.length], [null, 0]);
});
test('il cronometro ricorda il giorno e la pagina di partenza', () => {
  daCapo();
  const l = D.aggiungiLibro({ titolo: 'x', pagine: 300 }, 'leggendo', null, 40);
  D.avviaTimer(l.id);
  uguale([D.data.timer.giornoInizio, D.data.timer.paginaInizio], [OGGI, 40]);
  D.annullaTimer();
});

gruppo('Riassunti dei capitoli');
test('salvare e poi correggere un riassunto', () => {
  daCapo();
  const l = D.aggiungiLibro({ titolo: 'x', pagine: 300 }, 'leggendo');
  const c = D.salvaCapitolo(l.id, { numero: 1, titolo: 'Inizio', riassunto: 'Prima versione' });
  uguale([l.capitoli.length, c.numero, c.data], [1, 1, OGGI]);
  D.salvaCapitolo(l.id, { id: c.id, numero: 1, titolo: 'Inizio', riassunto: 'Seconda versione' });
  uguale([l.capitoli.length, l.capitoli[0].riassunto, l.capitoli[0].id], [1, 'Seconda versione', c.id]);
});
test('"fino a pagina" più avanti del segnalibro lo sposta (e conta le pagine)', () => {
  daCapo();
  const l = D.aggiungiLibro({ titolo: 'x', pagine: 300 }, 'leggendo');
  D.salvaCapitolo(l.id, { numero: 1, riassunto: 'a', finoAPagina: 28 });
  uguale([l.pagina, pagineOggi(l.id)], [28, 28]);
  D.salvaCapitolo(l.id, { numero: 0, riassunto: 'prologo', finoAPagina: 5 }); // più indietro: non torna indietro
  uguale(l.pagina, 28);
});
test('eliminare un riassunto', () => {
  daCapo();
  const l = D.aggiungiLibro({ titolo: 'x' }, 'leggendo');
  const c = D.salvaCapitolo(l.id, { numero: 1, riassunto: 'a' });
  D.salvaCapitolo(l.id, { numero: 2, riassunto: 'b' });
  D.eliminaCapitolo(l.id, c.id);
  uguale(l.capitoli.map(x => x.numero), [2]);
});

gruppo('Citazioni');
test('salvare, mettere tra le preferite, spostare in un altro libro, eliminare', () => {
  daCapo();
  const a = D.aggiungiLibro({ titolo: 'A' }, 'leggendo'), b = D.aggiungiLibro({ titolo: 'B' }, 'leggendo');
  const c = D.salvaCitazione(a.id, { testo: 'Una bella frase', pagina: 12 });
  uguale([a.citazioni.length, c.preferita, c.pagina], [1, false, 12]);
  uguale(D.cambiaPreferita(a.id, c.id), true);
  D.spostaCitazione(a.id, b.id, c.id);
  uguale([a.citazioni.length, b.citazioni.length, b.citazioni[0].preferita], [0, 1, true]);
  D.eliminaCitazione(b.id, c.id);
  uguale(b.citazioni.length, 0);
});
test('una citazione vuota non si salva', () => {
  daCapo();
  const a = D.aggiungiLibro({ titolo: 'A' }, 'leggendo');
  uguale(D.salvaCitazione(a.id, { testo: '   ' }), null);
  uguale(a.citazioni.length, 0);
});

gruppo('Parole nuove');
test('una parola nuova: collegata al libro, da ripassare da domani', () => {
  daCapo();
  const l = D.aggiungiLibro({ titolo: 'Il barone rampante' }, 'leggendo');
  const p = D.salvaParola({ parola: ' ubbia ', significato: 'timore infondato', frase: 'Aveva mille ubbie.', libroId: l.id, pagina: 33 });
  uguale([p.parola, p.libroId, p.titoloLibro, p.pagina, p.livello, p.prossimo, p.data], ['ubbia', l.id, 'Il barone rampante', 33, 0, piuGiorni(OGGI, 1), OGGI]);
});
test('parola senza libro', () => {
  daCapo();
  const p = D.salvaParola({ parola: 'lapalissiano', libroId: null });
  uguale([p.libroId, p.titoloLibro], [null, '']);
});
test('correggere una parola non azzera il ripasso', () => {
  daCapo();
  const p = D.salvaParola({ parola: 'ubia', libroId: null });
  D.aggiornaRipasso(dopoRipasso(p, true, OGGI));
  D.salvaParola({ id: p.id, parola: 'ubbia', significato: 'corretta', libroId: null });
  const ora = D.parola(p.id);
  uguale([D.data.parole.length, ora.parola, ora.significato, ora.livello, ora.ripassi, ora.prossimo], [1, 'ubbia', 'corretta', 1, 1, piuGiorni(OGGI, 3)]);
});
test('parola di un libro eliminato: correggendola resta scritto da quale libro veniva', () => {
  daCapo();
  const l = D.aggiungiLibro({ titolo: 'Il nome della rosa' }, 'leggendo');
  const p = D.salvaParola({ parola: 'ubbia', libroId: l.id });
  D.eliminaLibro(l.id);
  D.salvaParola({ id: p.id, parola: 'ubbia', significato: 'timore infondato', libroId: null });
  uguale([D.parola(p.id).libroId, D.parola(p.id).titoloLibro, D.parola(p.id).significato], [null, 'Il nome della rosa', 'timore infondato']);
});
test('una parola vuota non si salva; eliminare una parola', () => {
  daCapo();
  uguale(D.salvaParola({ parola: '  ' }), null);
  const p = D.salvaParola({ parola: 'ubbia' });
  D.eliminaParola(p.id);
  uguale(D.data.parole.length, 0);
});

gruppo('Consigli scartati');
test('"No, grazie": si ricorda, una volta sola, e si può annullare', () => {
  daCapo();
  D.scartaConsiglio('OL123W'); D.scartaConsiglio('OL123W'); D.scartaConsiglio('il nome della rosa|umberto eco');
  uguale(D.data.scartati, ['OL123W', 'il nome della rosa|umberto eco']);
  D.riprendiConsiglio('OL123W');
  uguale(D.data.scartati, ['il nome della rosa|umberto eco']);
  D.dimenticaScartati();
  uguale(D.data.scartati, []);
});
test('chiavi strane non entrano', () => {
  daCapo();
  D.scartaConsiglio('<script>'); D.scartaConsiglio(''); D.scartaConsiglio(42);
  uguale(D.data.scartati, []);
});

gruppo('Impostazioni');
test('obiettivo dell’anno: metterlo e toglierlo', () => {
  daCapo();
  D.setObiettivo('2026', 12);
  uguale(D.data.impostazioni.obiettivi, { '2026': 12 });
  D.setObiettivo('2026', 0);
  uguale(D.data.impostazioni.obiettivi, {});
});
test('tema: solo quelli previsti', () => {
  daCapo();
  D.setTema('scuro'); uguale(D.data.impostazioni.tema, 'scuro');
  D.setTema('fucsia'); uguale(D.data.impostazioni.tema, 'scuro');
});
test('alla fine i dati di prova vengono tolti', () => {
  daCapo();
  localStorage.removeItem(D.STORE);
  uguale(localStorage.getItem(D.STORE), null);
});
