// Test delle funzioni che leggono le risposte di Open Library, Google Books e Wikizionario,
// e dell'esportazione in Markdown. Non usano la rete: le risposte qui sotto sono copie
// (accorciate) di risposte vere.
import { gruppo, test, uguale, vero } from './mini-test.js';
import { normalizzaOpenLibrary, normalizzaGoogle, unisci, comeIsbn } from '../js/ricerca.js';
import { estraiDefinizioni, linkTreccani } from '../js/dizionario.js';
import { libroInMarkdown, vocabolarioInMarkdown, nomeCapitolo, nomeFile } from '../js/markdown.js';
import { ripulisciLibro, ripulisciParola } from '../js/migrazione.js';

gruppo('Ricerca: ISBN');
test('riconosce ISBN a 13 e a 10 cifre, anche con trattini e spazi', () => {
  uguale(comeIsbn('978-88-452-9261-3'), '9788845292613');
  uguale(comeIsbn('88 452 0705 6'), '8845207056');
  uguale(comeIsbn('880611826x'), '880611826X');
});
test('un titolo non è un ISBN', () => {
  uguale(comeIsbn('il nome della rosa'), null);
  uguale(comeIsbn('1984'), null);
  uguale(comeIsbn('12345678901234'), null);
});

gruppo('Ricerca: Open Library');
const docOL = {
  author_name: ['Italo Svevo'], cover_i: 419797, first_publish_year: 1923, key: '/works/OL2276498W', number_of_pages_median: 433, title: 'Confession of Zeno',
  editions: { numFound: 118, docs: [{ key: '/books/OL40295070M', title: 'La coscienza di Zeno.', cover_i: 12998781, language: ['ita'], publisher: ['Rizzoli'], publish_date: ['1985'], isbn: ['8817165549', '9788817165549'] }] }
};
test('prende titolo, copertina, editore e ISBN dall’edizione italiana', () => {
  uguale(normalizzaOpenLibrary(docOL), {
    titolo: 'La coscienza di Zeno', autore: 'Italo Svevo', pagine: 433, anno: 1923, editore: 'Rizzoli', isbn: '9788817165549', genere: '',
    copertina: 'https://covers.openlibrary.org/b/id/12998781-M.jpg', origine: 'openlibrary'
  });
});
test('senza edizioni usa i dati dell’opera', () => {
  const l = normalizzaOpenLibrary({ title: 'Il nome della rosa', author_name: ['Umberto Eco', 'Un Altro', 'Terzo', 'Quarto'], first_publish_year: 1980 });
  uguale([l.titolo, l.autore, l.pagine, l.anno, l.copertina, l.isbn], ['Il nome della rosa', 'Umberto Eco, Un Altro, Terzo', null, 1980, null, '']);
});
test('una voce senza titolo viene scartata', () => {
  uguale(normalizzaOpenLibrary({ author_name: ['Qualcuno'] }), null);
  uguale(normalizzaOpenLibrary(null), null);
});

gruppo('Ricerca: Google Books');
const itemG = {
  volumeInfo: {
    title: 'Il nome della rosa', authors: ['Umberto Eco'], publisher: 'Bompiani', publishedDate: '2012-01-11', pageCount: 624, categories: ['Fiction'],
    industryIdentifiers: [{ type: 'ISBN_10', identifier: '8858706153' }, { type: 'ISBN_13', identifier: '9788858706152' }],
    imageLinks: { smallThumbnail: 'http://books.google.com/books/content?id=x&zoom=5&edge=curl', thumbnail: 'http://books.google.com/books/content?id=x&printsec=frontcover&img=1&zoom=1&edge=curl&source=gbs_api' }
  }
};
test('traduce una voce di Google nel formato dell’app', () => {
  uguale(normalizzaGoogle(itemG), {
    titolo: 'Il nome della rosa', autore: 'Umberto Eco', pagine: 624, anno: 2012, editore: 'Bompiani', isbn: '9788858706152', genere: 'Fiction',
    copertina: 'https://books.google.com/books/content?id=x&printsec=frontcover&img=1&zoom=1&source=gbs_api', origine: 'google'
  });
});
test('voce di Google quasi vuota', () => {
  const l = normalizzaGoogle({ volumeInfo: { title: 'Solo titolo' } });
  uguale([l.titolo, l.autore, l.pagine, l.anno, l.copertina, l.isbn], ['Solo titolo', '', null, null, null, '']);
  uguale(normalizzaGoogle({ volumeInfo: {} }), null);
  uguale(normalizzaGoogle({}), null);
});

test('risposte strane dei cataloghi non rompono niente', () => {
  uguale(normalizzaGoogle({ volumeInfo: { title: { strano: true }, authors: 'non una lista' } }), null);
  const g = normalizzaGoogle({ volumeInfo: { title: 'Ok', authors: [1, null, 'Autore'], imageLinks: { thumbnail: 42 }, industryIdentifiers: [null, { type: 'ISBN_13', identifier: 9788845207051 }], categories: {}, publisher: ['x'] } });
  uguale([g.titolo, g.autore, g.copertina, g.isbn, g.genere, g.editore], ['Ok', '1, Autore', null, '9788845207051', '', '']);
  const o = normalizzaOpenLibrary({ title: 'Ok', author_name: 'uno solo', cover_i: 'abc', editions: { docs: [null] }, number_of_pages_median: 'tante' });
  uguale([o.titolo, o.autore, o.copertina, o.pagine], ['Ok', '', null, null]);
  uguale(normalizzaOpenLibrary({ title: { a: 1 } }), null);
});

gruppo('Ricerca: unire i risultati');
test('stesso ISBN: un libro solo, completato con i dati dell’altro', () => {
  const a = { titolo: 'Il nome della rosa', autore: 'Umberto Eco', pagine: null, copertina: null, isbn: '9788858706152', anno: 2012, editore: '', genere: '', origine: 'google' };
  const b = { titolo: 'Il nome della rosa (edizione)', autore: 'Umberto Eco', pagine: 624, copertina: 'https://c/1.jpg', isbn: '9788858706152', anno: 1980, editore: 'Bompiani', genere: '', origine: 'openlibrary' };
  const r = unisci([a], [b]);
  uguale(r.length, 1);
  uguale([r[0].titolo, r[0].pagine, r[0].copertina, r[0].anno, r[0].editore, r[0].origine], ['Il nome della rosa', 624, 'https://c/1.jpg', 2012, 'Bompiani', 'google']);
});
test('stesso titolo e stesso primo autore, scritti in modo diverso: un libro solo', () => {
  const r = unisci([{ titolo: 'La coscienza di Zeno', autore: 'Italo Svevo', isbn: '' }], [{ titolo: 'LA COSCIENZA DI ZENO', autore: 'Italo Svevo, Curatore', isbn: '123' }]);
  uguale(r.length, 1);
  uguale(r[0].isbn, '123');
});
test('libri diversi restano separati, nell’ordine in cui arrivano', () => {
  const r = unisci([{ titolo: 'Uno', autore: 'A' }], [{ titolo: 'Due', autore: 'A' }, null, { titolo: 'Uno', autore: 'B' }]);
  uguale(r.map(l => l.titolo + '/' + l.autore), ['Uno/A', 'Due/A', 'Uno/B']);
});
test('unire non modifica gli elenchi ricevuti', () => {
  const a = { titolo: 'Uno', autore: 'A', pagine: null };
  unisci([a], [{ titolo: 'Uno', autore: 'A', pagine: 100 }]);
  uguale(a.pagine, null);
});

gruppo('Dizionario');
const UBBIA = `<h2 data-mw-anchor="Italiano" data-mw-wikitext=""><span typeof="mw:File"></span> Italiano</h2>
<h3 data-mw-anchor="Sostantivo" data-mw-wikitext=""><span typeof="mw:File"></span><i>Sostantivo</i></h3>
<p><b>ubbia</b><small></small> <i>f</i> (<i>pl.</i>: ubbie)
</p>
<ol><li><small>(<i>letterario</i>)</small> apprensione superstiziosa o di malaugurio; credenza instillata dal pregiudizio
<ul><li><i>un misantropo che ha l'<b>ubbia</b><small></small> di essere perseguitato</i></li>
<li><i>le loro paturnie e ubbie</i></li></ul></li></ol>
<h3 data-mw-anchor="Sillabazione" data-mw-wikitext=""><span typeof="mw:File"></span> Sillabazione</h3>
<dl><dt>ub | bì | a</dt></dl>
<h3 data-mw-anchor="Etimologia_/_Derivazione" data-mw-wikitext="">Etimologia / Derivazione</h3>
<p>incerta</p>
<h3 data-mw-anchor="Sinonimi" data-mw-wikitext=""><span typeof="mw:File"></span> Sinonimi</h3>
<ul><li>fisima, fissazione</li></ul>`;
const LAPALISSIANO = `<h2 data-mw-anchor="Italiano" data-mw-wikitext=""> Italiano</h2>
<h3 data-mw-anchor="Aggettivo" data-mw-wikitext=""><i>Aggettivo</i></h3>
<p><b>lapalissiano</b>  <i>m sing</i> </p>

<ol><li>così lampante ed innegabile  da essere prevedibile</li>
<li><small>(<i>letterario</i>)</small> <small>(<i>colto</i>)</small> di fatto plateale &amp; banalmente ovvio.</li></ol>
<h3 data-mw-anchor="Sinonimi" data-mw-wikitext=""> Sinonimi</h3>
<ul><li>assodato, chiaro</li></ul>
<h2 data-mw-anchor="Latino" data-mw-wikitext=""> Latino</h2>
<h3 data-mw-anchor="Aggettivo_2" data-mw-wikitext=""><i>Aggettivo</i></h3>
<ol><li>definizione in un’altra lingua, da ignorare</li></ol>`;
const PROCRASTINARE = `<h2 data-mw-anchor="Italiano" data-mw-wikitext=""> Italiano</h2>
<h3 data-mw-anchor="Verbo" data-mw-wikitext=""><i>Verbo</i></h3>
<h4 data-mw-anchor="Transitivo" data-mw-wikitext="">Transitivo</h4> <p><b>procrastinare</b><small> (vai alla coniugazione)</small>
</p><ol><li>rimandare al domani con lo scopo di temporeggiare .</li></ol>
<h3 data-mw-anchor="Sillabazione" data-mw-wikitext=""> Sillabazione</h3>
<dl><dt>pro | cra | sti | nà | re</dt></dl>`;
test('prende la definizione e lascia fuori esempi, sillabazione e sinonimi', () => {
  uguale(estraiDefinizioni(UBBIA), [{ tipo: 'Sostantivo', definizioni: ['(letterario) apprensione superstiziosa o di malaugurio; credenza instillata dal pregiudizio'] }]);
});
test('più definizioni; solo la parte in italiano; entità HTML tradotte', () => {
  uguale(estraiDefinizioni(LAPALISSIANO), [{ tipo: 'Aggettivo', definizioni: ['così lampante ed innegabile da essere prevedibile', '(letterario) (colto) di fatto plateale & banalmente ovvio.'] }]);
});
test('verbo con sottosezione (transitivo)', () => {
  uguale(estraiDefinizioni(PROCRASTINARE), [{ tipo: 'Verbo', definizioni: ['rimandare al domani con lo scopo di temporeggiare.'] }]);
});
test('pagina senza parte italiana, vuota o non testo: nessuna definizione', () => {
  uguale(estraiDefinizioni('<h2 data-mw-anchor="Inglese">Inglese</h2><h3 data-mw-anchor="Sostantivo">x</h3><ol><li>book</li></ol>'), []);
  uguale(estraiDefinizioni(''), []);
  uguale(estraiDefinizioni(undefined), []);
});
test('indirizzo Treccani della parola', () => uguale(linkTreccani(' Perché '), 'https://www.treccani.it/vocabolario/ricerca/perch%C3%A9/'));

gruppo('Esportazione in Markdown');
const LIBRO = ripulisciLibro({
  id: 'a', titolo: 'Il "barone" rampante', autore: 'Italo Calvino', editore: 'Mondadori', anno: 1957, pagine: 280, stato: 'letto',
  iniziato: '2026-09-01', finito: '2026-10-01', voto: 4, recensione: 'Leggero e profondo.', nota: 'Consigliato da Marco.',
  capitoli: [{ numero: 2, titolo: 'Sugli alberi', riassunto: 'Cosimo resta sugli alberi.' }, { numero: 1, riassunto: 'Il pranzo delle lumache.' }, { numero: 0, titolo: 'Prefazione', riassunto: '' }],
  citazioni: [{ testo: 'Seconda\nsu due righe', pagina: 90 }, { testo: 'Prima', pagina: 12, nota: 'Mi ha fatto ridere.' }]
});
const PAROLE = [ripulisciParola({ parola: 'ubbia', significato: 'timore infondato', frase: 'Aveva mille ubbie.', libroId: 'a', titoloLibro: 'Il "barone" rampante', pagina: 33 }), ripulisciParola({ parola: 'altra', libroId: 'b' })];
test('nome del capitolo', () => {
  uguale([nomeCapitolo({ numero: 3, titolo: 'x' }), nomeCapitolo({ numero: 0, titolo: 'Prologo' }), nomeCapitolo({ numero: 0, titolo: '' })], ['Capitolo 3', 'Prologo', 'Prima del primo capitolo']);
});
test('la nota del libro: intestazione con i dati, virgolette protette', () => {
  const md = libroInMarkdown(LIBRO, PAROLE);
  vero(md.startsWith('---\ntitolo: "Il \\"barone\\" rampante"\nautore: "Italo Calvino"\nstato: "Letto"\nvoto: 4\niniziato: 2026-09-01\nfinito: 2026-10-01\npagine: 280\ntags: [libro]\n---\n'), md.slice(0, 200));
  vero(md.includes('# Il "barone" rampante\n\nItalo Calvino, Mondadori, 1957\n'));
  vero(md.includes('Voto: ★★★★☆ (4 su 5)'));
});
test('la nota del libro: capitoli in ordine, quelli vuoti segnati', () => {
  const md = libroInMarkdown(LIBRO, PAROLE);
  const p = md.indexOf('### Prefazione'), c1 = md.indexOf('### Capitolo 1\n'), c2 = md.indexOf('### Capitolo 2 – Sugli alberi');
  vero(p > 0 && p < c1 && c1 < c2, 'ordine dei capitoli');
  vero(md.includes('### Prefazione\n\n_Ancora da riassumere._'));
});
test('la nota del libro: citazioni in ordine di pagina, parole solo di questo libro', () => {
  const md = libroInMarkdown(LIBRO, PAROLE);
  vero(md.indexOf('> Prima\n> — pagina 12\n\nMi ha fatto ridere.') > 0);
  vero(md.includes('> Seconda\n> su due righe\n> — pagina 90'));
  vero(md.indexOf('> Prima') < md.indexOf('> Seconda'));
  vero(md.includes('- **ubbia**: timore infondato — «Aveva mille ubbie.» (pag. 33)'));
  vero(!md.includes('**altra**'));
  vero(!/\n{3,}/.test(md), 'niente righe vuote doppie');
});
test('libro senza appunti: solo intestazione e titolo', () => {
  const md = libroInMarkdown(ripulisciLibro({ titolo: 'Vuoto', stato: 'voglio' }), []);
  vero(md.includes('# Vuoto') && !md.includes('## '));
});
test('vocabolario in ordine alfabetico, con il libro', () => {
  const md = vocabolarioInMarkdown([ripulisciParola({ parola: 'zotico' }), ripulisciParola({ parola: 'Àncora', titoloLibro: 'Libro', pagina: 5 }), ripulisciParola({ parola: 'bolso' })], '2026-10-08');
  vero(md.indexOf('Àncora') < md.indexOf('bolso') && md.indexOf('bolso') < md.indexOf('zotico'));
  vero(md.includes('- **Àncora** (*Libro*, pag. 5)'));
  vero(md.includes('3 parole, aggiornato all’8 ottobre 2026.'), md.slice(0, 80));
  vero(vocabolarioInMarkdown([ripulisciParola({ parola: 'sola' })], '2026-10-07').includes('1 parola, aggiornato al 7 ottobre 2026.'));
});
test('nome del file senza caratteri vietati', () => {
  uguale(nomeFile('Chi è? Il "barone": parte 1/2'), 'Chi è Il barone parte 12');
  uguale(nomeFile('???'), 'libro');
});
