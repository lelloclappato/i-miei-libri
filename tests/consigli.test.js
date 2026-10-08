// Test della scansione (lettura dell'ISBN dal codice a barre) e dei consigli "Per te".
// Non usano la rete né la fotocamera: le risposte di Open Library qui sotto sono inventate, ma con la stessa forma di quelle vere.
import { gruppo, test, uguale, vero } from './mini-test.js';
import { isbnDaCodice } from '../js/ricerca.js';
import { semi, firmaSemi, soggettiUtili, scegliRicerche, classifica, consigliVisibili, daDoc, soggettoDalGenere, sembraItaliano } from '../js/consigli.js';
import { ripulisciLibro } from '../js/migrazione.js';

gruppo('Scansione: ISBN dal codice a barre');
test('un EAN-13 di un libro diventa il suo ISBN', () => {
  uguale(isbnDaCodice('9788845292613'), '9788845292613');
  uguale(isbnDaCodice(' 978-88-04-66823-7 '), '9788804668237');
});
test('una cifra letta male viene scartata (cifra di controllo)', () => {
  uguale(isbnDaCodice('9788845292614'), null);
  uguale(isbnDaCodice('9791220100013'), null);
});
test('i codici che non sono di libri vengono ignorati', () => {
  uguale(isbnDaCodice('8001234567895'), null); // un prodotto qualsiasi
  uguale(isbnDaCodice('51500'), null);         // il codice aggiuntivo del prezzo
  uguale(isbnDaCodice(''), null);
  uguale(isbnDaCodice(null), null);
});

// ---------- consigli ----------
let n = 0;
const libro = campi => ripulisciLibro({ id: 'l' + (++n), aggiunto: '2026-01-01', ...campi });

gruppo('Consigli: i semi');
test('contano i libri finiti con un voto alto e quelli in lettura; i voti bassi contano contro', () => {
  const a = libro({ titolo: 'A', stato: 'letto', voto: 5, finito: '2026-02-01' });
  const b = libro({ titolo: 'B', stato: 'leggendo' });
  const c = libro({ titolo: 'C', stato: 'letto', voto: 1, finito: '2026-02-02' });
  const d = libro({ titolo: 'D', stato: 'voglio' });
  const s = semi([a, b, c, d]);
  uguale(s.map(x => [x.libro.titolo, x.peso]), [['A', 3], ['B', 1.5], ['C', -2]]);
});
test('senza libri letti o in lettura, partono da quelli da leggere e desiderati', () => {
  const s = semi([libro({ titolo: 'X', stato: 'voglio' }), libro({ titolo: 'Y', stato: 'da-leggere' })]);
  uguale(s.map(x => x.libro.titolo).sort(), ['X', 'Y']);
  uguale(firmaSemi(s), 'iniziali');
});
test('l’impronta cambia quando cambia un voto', () => {
  const a = libro({ titolo: 'A', stato: 'letto', voto: 4 });
  const prima = firmaSemi(semi([a]));
  a.voto = 5;
  vero(firmaSemi(semi([a])) !== prima);
});
test('libreria vuota: nessun seme', () => uguale(semi([]), []));

gruppo('Consigli: i soggetti');
test('restano i soggetti utili, spariscono quelli generici e quelli in altre lingue', () => {
  uguale(soggettiUtili(['Fiction', 'mystery_fiction', 'ficción', 'large_type_books', 'translations_into_german', 'monks',
    'nome_della_rosa_(eco_umberto)', 'william_of_baskerville_(fictitious_character)', 'nyt:hardcover-fiction=2001', 'mystery_fiction']),
  ['mystery_fiction', 'monks', 'william_of_baskerville_(fictitious_character)']);
  uguale(soggettiUtili(null), []);
});
test('il genere scritto nella scheda diventa un soggetto', () => {
  uguale(soggettoDalGenere('Fantascienza'), 'science_fiction');
  uguale(soggettoDalGenere('giallo'), 'detective_and_mystery_stories');
  uguale(soggettoDalGenere('Romanzo d’amore'), 'romance');
  uguale(soggettoDalGenere('Cucina'), null);
});

gruppo('Consigli: le ricerche');
test('autori preferiti e soggetti in comune tra più libri', () => {
  const a = libro({ titolo: 'Il nome della rosa', autore: 'Umberto Eco', stato: 'letto', voto: 5 });
  const b = libro({ titolo: 'I pilastri della terra', autore: 'Ken Follett', stato: 'letto', voto: 4 });
  const c = libro({ titolo: 'Brutto', autore: 'Autore Antipatico', stato: 'letto', voto: 1 });
  const info = {
    [a.id]: { opera: 'OL1W', autori: ['OL20735A'], nomi: ['Umberto Eco'], soggetti: ['historical_fiction', 'monks', 'middle_ages', 'semiotics'] },
    [b.id]: { opera: 'OL2W', autori: ['OL1A'], nomi: ['Ken Follett'], soggetti: ['historical_fiction', 'middle_ages', 'cathedrals'] }
  };
  const r = scegliRicerche(semi([a, b, c]), info);
  uguale(r.autori.map(x => x.chiave), ['OL20735A', 'OL1A']);              // l'autore del libro con 1 stella non c'è
  uguale(r.soggetti[0].chiave, 'historical_fiction');                   // un genere, e in comune
  vero(r.soggetti.some(s => s.chiave === 'middle_ages'), 'middle_ages è in comune ai due libri');
  vero(!r.soggetti.some(s => s.chiave === 'semiotics' || s.chiave === 'cathedrals'), 'gli argomenti di un libro solo restano fuori');
});
test('un libro senza risposta da Open Library usa autore e genere della scheda', () => {
  const a = libro({ titolo: 'Libro raro', autore: 'Anna Rossi', genere: 'Fantasy', stato: 'letto', voto: 5 });
  const r = scegliRicerche(semi([a]), {});
  uguale(r.autori.map(x => x.chiave), ['nome:Anna Rossi']);
  uguale(r.soggetti.map(x => x.chiave), ['fantasy']);
});

gruppo('Consigli: la classifica');
const doc = (key, titolo, autore, extra = {}) => ({ key: '/works/' + key, title: titolo, author_name: [autore], ...extra });
test('un libro trovato da più ricerche sale; quelli che hai già e gli autori che non ti piacciono no', () => {
  const tuoi = [libro({ titolo: 'Il nome della rosa', autore: 'Umberto Eco', stato: 'letto', voto: 5 })];
  const risultati = [
    { ricerca: { tipo: 'autore', peso: 3, motivo: 'Dello stesso autore di «Il nome della rosa»' },
      docs: [doc('OL1W', 'Il nome della rosa', 'Umberto Eco'), doc('OL2W', 'Il pendolo di Foucault', 'Umberto Eco')] },
    { ricerca: { tipo: 'soggetto', peso: 2, motivo: 'Romanzo storico, come «Il nome della rosa»' },
      docs: [doc('OL3W', 'I pilastri della terra', 'Ken Follett', { cover_i: 5 }), doc('OL9W', 'Noioso', 'Autore Antipatico'), doc('OL2W', 'Il pendolo di Foucault', 'Umberto Eco')] }
  ];
  const elenco = classifica(risultati, tuoi, { negativi: ['Autore Antipatico'] });
  uguale(elenco.map(c => c.titolo), ['Il pendolo di Foucault', 'I pilastri della terra']);
  uguale(elenco[0].motivo, 'Dello stesso autore di «Il nome della rosa»');
  uguale(elenco[0].chiave, 'OL2W');
  uguale(elenco[1].copertina, 'https://covers.openlibrary.org/b/id/5-M.jpg');
});
test('al massimo due libri dello stesso autore', () => {
  const docs = [1, 2, 3, 4].map(i => doc('OL' + i + 'W', 'Libro ' + i, 'Stesso Autore'));
  uguale(classifica([{ ricerca: { peso: 1, motivo: 'x' }, docs }], []).length, 2);
});
test('il titolo dell’edizione italiana, se c’è', () => {
  const c = daDoc(doc('OL5W', 'The Lost Symbol', 'Dan Brown', { editions: { docs: [{ title: 'Il simbolo perduto', language: ['ita'] }] } }));
  uguale(c.titolo, 'Il simbolo perduto');
  const d = daDoc(doc('OL6W', 'Il cimitero di Praga', 'Umberto Eco', { editions: { docs: [{ title: 'The Prague Cemetery', language: ['eng'] }] } }));
  uguale(d.titolo, 'Il cimitero di Praga');
});
test('voci strane nella risposta non rompono niente', () => {
  uguale(classifica([{ ricerca: { peso: 1, motivo: 'x' }, docs: [null, 42, { title: '' }, doc('OL7W', 'Buono', 'Qualcuno')] }, { ricerca: { peso: 1 }, docs: null }], []).map(c => c.titolo), ['Buono']);
});

test('titoli che Open Library conosce solo in un’altra lingua vengono lasciati fuori', () => {
  vero(sembraItaliano('Il Codice Da Vinci')); vero(sembraItaliano('Anna Karenina')); vero(sembraItaliano('Viaggio in Italia'));
  vero(sembraItaliano('A sangue freddo')); vero(sembraItaliano('Dieci piccoli indiani'));
  vero(!sembraItaliano('Anne of Green Gables')); vero(!sembraItaliano('Calculs et rationalités dans la seigneurie médiévale')); vero(sembraItaliano('La storia infinita')); vero(!sembraItaliano('Moments of reprieve')); vero(!sembraItaliano('Преступление и наказание'));
  uguale(daDoc(doc('OL8W', 'The Name of the Rose', 'Umberto Eco', { editions: { docs: [{ title: 'The Name of the Rose', language: ['eng', 'ita'] }] } })), null);
  uguale(daDoc(doc('OL9W', 'Il nome della rosa', 'Umberto Eco', { editions: { docs: [{ title: 'The Name of the Rose', language: ['eng', 'ita'] }] } })).titolo, 'Il nome della rosa');
  uguale(daDoc(doc('OL10W', 'Diario', 'Anne Frank', { editions: { docs: [{ title: 'Diario [Italian text]', language: ['ita'] }] } })).titolo, 'Diario');
});
test('certi autori non vengono mai consigliati', () => uguale(daDoc(doc('OL11W', 'Mein Kampf', 'Adolf Hitler')), null));
test('i generi troppo larghi (biografie…) non diventano ricerche', () => {
  const a = libro({ titolo: 'Se questo è un uomo', autore: 'Primo Levi', genere: 'Biografia', stato: 'letto', voto: 5 });
  const r = scegliRicerche(semi([a]), { [a.id]: { opera: 'OL1W', autori: ['OL3A'], nomi: ['Primo Levi'], soggetti: ['biography', '1944-1945', 'holocaust'] } });
  vero(!r.soggetti.some(s => s.chiave === 'biography' || s.chiave === '1944-1945'), JSON.stringify(r.soggetti.map(s => s.chiave)));
});

gruppo('Consigli: quelli da mostrare');
test('spariscono quelli scartati e quelli aggiunti nel frattempo alla libreria', () => {
  const elenco = [{ chiave: 'OL1W', titolo: 'Uno', autore: 'A' }, { chiave: 'OL2W', titolo: 'Due', autore: 'B' }, { chiave: 'OL3W', titolo: 'Tre', autore: 'C', isbn: '9788845292613' }];
  const libri = [libro({ titolo: 'Due', autore: 'B', stato: 'voglio' }), libro({ titolo: 'Tre (edizione speciale)', isbn: '9788845292613' })];
  uguale(consigliVisibili(elenco, libri, ['OL1W']), []);
  uguale(consigliVisibili(elenco, [], ['OL1W']).map(c => c.chiave), ['OL2W', 'OL3W']);
  uguale(consigliVisibili(elenco, [], [], 2).length, 2);
  uguale(consigliVisibili(null, [], []), []);
});
