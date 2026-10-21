// Test della modalità Mercatino: riconoscere un libro dalle parole lette sulla copertina (anche sporche),
// e il giudizio (desiderio, ce l'hai, potrebbe piacerti, occhio, niente di speciale).
// Le parole lette qui sotto sono quelle vere uscite dal lettore su copertine fotografate male (prova del 21/10/2026).
import { gruppo, test, uguale, vero } from './mini-test.js';
import { paroleChiave, simili, punteggio, riconosci, stessoLibro, giudica, ricercheDaParole } from '../js/mercatino.js';
import { preparaPixel, paroleSicure, bastano } from '../js/ocr.js';
import { ripulisciLibro } from '../js/migrazione.js';

let n = 0;
const libro = campi => ripulisciLibro({ id: 'm' + (++n), aggiunto: '2026-01-01', ...campi });

gruppo('Mercatino: leggere il testo');
test('immagine in grigi con il contrasto tirato al massimo', () => {
  // quattro pixel grigio scuro, medio, medio, chiaro → nero, medio, medio, bianco
  const px = new Uint8ClampedArray([60, 60, 60, 255, 120, 120, 120, 255, 120, 120, 120, 255, 180, 180, 180, 255]);
  const r = preparaPixel(px);
  uguale([r[0], r[4], r[12]], [0, 128, 255]);
  const neg = preparaPixel(new Uint8ClampedArray([60, 60, 60, 255, 180, 180, 180, 255]), true);
  uguale([neg[0], neg[4]], [255, 0]);
});
test('si tengono solo le parole lette con sicurezza, senza punteggiatura attaccata', () => {
  uguale(paroleSicure([{ text: 'ACCABADORA,', confidence: 91 }, { text: 'iN', confidence: 80 }, { text: 'fics', confidence: 30 }, { text: '“MURGIA', confidence: 77 }, { text: '1985', confidence: 90 }]),
    ['ACCABADORA', 'MURGIA']);
  uguale(paroleSicure(null), []);
});
test('quando le parole bastano per provare', () => {
  vero(bastano(['OTTO', 'MONTAGNE'])); vero(bastano(['ACCIAIO'])); vero(!bastano(['Lai'])); vero(!bastano([]));
});

gruppo('Mercatino: riconoscere il libro dalle parole lette');
const tolkien = libro({ titolo: 'Il signore degli anelli', autore: 'J. R. R. Tolkien', stato: 'voglio' });
const hobbit = libro({ titolo: 'Lo Hobbit', autore: 'J. R. R. Tolkien', stato: 'letto', voto: 5 });
const murgia = libro({ titolo: 'Accabadora', autore: 'Michela Murgia', stato: 'voglio' });
const acciaio = libro({ titolo: 'Acciaio', autore: 'Silvia Avallone', stato: 'da-leggere' });
const cognetti = libro({ titolo: 'Le otto montagne', autore: 'Paolo Cognetti', stato: 'voglio' });
const rosa = libro({ titolo: 'Il nome della rosa', autore: 'Umberto Eco', stato: 'letto', voto: 4 });
const seta = libro({ titolo: 'Seta', autore: 'Alessandro Baricco', stato: 'voglio' });
const tutti = [tolkien, hobbit, murgia, acciaio, cognetti, rosa, seta];
test('parole vere lette da copertine fotografate male: tutti e quattro riconosciuti', () => {
  uguale(riconosci(['IRRTOLKIEN', 'ANELLI', 'Lai'], tutti).candidato.titolo, 'Il signore degli anelli');
  uguale(riconosci(['MICHELA', 'MURGIA', 'ACCABADORA'], tutti).candidato.titolo, 'Accabadora');
  uguale(riconosci(['ACCIAIO'], tutti).candidato.titolo, 'Acciaio');
  uguale(riconosci(['PAOLO', 'OTTO', 'MONTAGNE'], tutti).candidato.titolo, 'Le otto montagne');
});
test('lettere sbagliate e parole spezzate', () => {
  uguale(riconosci(['ACCABAD0RA'], tutti).candidato.titolo, 'Accabadora');   // 0 al posto della O
  uguale(riconosci(['LE', 'OTTO', 'MONTA', 'GNE'], tutti).candidato.titolo, 'Le otto montagne'); // "MONTA GNE"
  uguale(riconosci(['NOME', 'DELLA', 'ROSA', 'ECO'], tutti).candidato.titolo, 'Il nome della rosa');
});
test('rumore e titoli troppo corti non fanno riconoscere niente a caso', () => {
  uguale(riconosci(['ema', 'fics', 'ids', 'Sa'], tutti), null);
  uguale(riconosci([], tutti), null);
  uguale(riconosci(['SETA'], tutti), null);                        // "Seta" da sola: troppo poco…
  uguale(riconosci(['SETA', 'BARICCO'], tutti).candidato.titolo, 'Seta'); // …con l'autore sì
  uguale(riconosci(['ANELLI'], tutti), null);                      // metà titolo senza autore: non basta
});
test('parole chiave e somiglianze', () => {
  uguale(paroleChiave('Il signore degli anelli'), ['signore', 'anelli']);
  vero(simili('montagne', 'montagme')); vero(simili('murgia', 'murgla')); vero(!simili('rosa', 'rosi')); vero(!simili('seta', 'sete'));
  const p = punteggio(['IRRTOLKIEN', 'ANELLI'], 'Il signore degli anelli', 'J. R. R. Tolkien');
  uguale([p.titolo, p.autore], [0.5, true]);
});

gruppo('Mercatino: stesso libro, altra edizione');
test('titolo con sottotitolo, stesso autore: stesso libro', () => {
  vero(stessoLibro({ titolo: 'Il colibrì', autore: 'Sandro Veronesi' }, { titolo: 'Il colibrì : romanzo', autore: 'Veronesi, Sandro' }));
  vero(stessoLibro({ titolo: 'x', isbn: '9788834600474' }, { titolo: 'y', isbn: '9788834600474' }));
  vero(!stessoLibro({ titolo: 'Il colibrì', autore: 'Sandro Veronesi' }, { titolo: 'Il colibrì', autore: 'Mario Rossi' }));
  vero(!stessoLibro({ titolo: 'Il nome della rosa', autore: 'Umberto Eco' }, { titolo: 'Il pendolo di Foucault', autore: 'Umberto Eco' }));
});

gruppo('Mercatino: il giudizio');
test('nei desideri', () => {
  const g = giudica({ titolo: 'Accabadora', autore: 'Michela Murgia', isbn: '9788806221898' }, tutti);
  uguale([g.tipo, g.libro.id], ['desiderio', murgia.id]);
});
test('ce l’hai già: letto con il voto, oppure da leggere', () => {
  const g = giudica({ titolo: 'Il nome della rosa', autore: 'Umberto Eco' }, tutti);
  uguale([g.tipo, g.motivo], ['ce-l-hai', 'L’hai già letto (gli hai dato 4 stelle).']);
  uguale(giudica({ titolo: 'Acciaio', autore: 'Silvia Avallone' }, tutti).motivo, 'Ce l’hai già: è tra i tuoi “Da leggere”.');
});
test('tra i consigli “Per te”', () => {
  const g = giudica({ titolo: 'La tregua', autore: 'Primo Levi' }, tutti, { consigli: [{ titolo: 'La tregua', autore: 'Primo Levi', motivo: 'Dello stesso autore di «Se questo è un uomo»' }] });
  uguale([g.tipo, g.motivo], ['piacere', 'Era tra i tuoi consigli “Per te”: Dello stesso autore di «Se questo è un uomo».']);
});
test('stesso autore di un libro che ti è piaciuto', () => {
  const g = giudica({ titolo: 'Il Silmarillion', autore: 'J.R.R. Tolkien' }, tutti);
  uguale([g.tipo, g.motivo], ['piacere', 'È dello stesso autore di «Lo Hobbit», a cui hai dato 5 stelle.']);
});
test('stesso autore di un libro che ti è piaciuto poco, o lasciato a metà', () => {
  const ulisse = libro({ titolo: 'Ulisse', autore: 'James Joyce', stato: 'abbandonato' });
  const g = giudica({ titolo: 'Gente di Dublino', autore: 'James Joyce' }, [...tutti, ulisse]);
  uguale([g.tipo, g.motivo], ['attenzione', 'È dello stesso autore di «Ulisse», che hai lasciato a metà.']);
});
test('nei desideri c’è già un altro libro dello stesso autore', () => {
  uguale(giudica({ titolo: 'Novecento', autore: 'Alessandro Baricco' }, tutti).motivo, 'Nei desideri hai già «Seta», dello stesso autore.');
});
test('un genere che leggi spesso (se si conoscono gli argomenti del libro)', () => {
  const g = giudica({ titolo: 'Dune', autore: 'Frank Herbert' }, tutti, { gusti: [{ chiave: 'science_fiction', motivo: 'Fantascienza, come «Fondazione»' }], argomenti: ['ecology', 'science_fiction'] });
  uguale([g.tipo, g.motivo], ['piacere', 'Fantascienza, come «Fondazione».']);
});
test('niente di speciale', () => {
  const g = giudica({ titolo: 'Manuale del giardiniere', autore: 'Anna Verdi' }, tutti);
  uguale(g.tipo, 'neutro');
});

gruppo('Mercatino: ricerche nei cataloghi');
test('dalle parole lette alle ricerche: tutte insieme, poi le più lunghe da sole', () => {
  uguale(ricercheDaParole(['IRRTOLKIEN', 'ANELLI', 'Lai']), ['irrtolkien anelli', 'irrtolkien', 'anelli']);
  uguale(ricercheDaParole(['ACCIAIO']), ['acciaio']);
  uguale(ricercheDaParole(['AAA', 'ile']), []);
});
