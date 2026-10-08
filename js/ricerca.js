// Ricerca di un libro in rete, per non dover scrivere a mano titolo, autore, pagine e copertina.
// Si chiede a due cataloghi pubblici e gratuiti:
//   - Open Library (openlibrary.org): non serve nessuna chiave, risponde sempre
//   - Google Books: ha più edizioni italiane, ma senza una chiave personale spesso rifiuta le richieste
//     (errore 429 "quota esaurita"). Per questo è un aiuto in più e non una necessità: se non risponde
//     si usano solo i risultati di Open Library. La chiave, facoltativa, si mette in Altro.
// Le funzioni "normalizza…" traducono le due risposte, diverse tra loro, nello stesso formato
// usato dall'app. Sono pure e hanno i loro test.
import { semplice } from './utili.js';

const OPEN_LIBRARY = 'https://openlibrary.org/search.json';
const GOOGLE_BOOKS = 'https://www.googleapis.com/books/v1/volumes';
const CAMPI_OL = 'key,title,author_name,first_publish_year,number_of_pages_median,cover_i,editions,editions.key,editions.title,editions.language,editions.number_of_pages,editions.cover_i,editions.isbn,editions.publisher,editions.publish_date';
const ATTESA_MASSIMA = 12000; // millisecondi

// Google ha rifiutato una richiesta senza chiave: per il resto della sessione non si riprova.
let googleSenzaChiaveRifiutato = false;
// Google ha rifiutato la chiave scritta in Altro (sbagliata, o non abilitata per questo sito).
let chiaveRifiutata = false;
export function chiaveGoogleRifiutata() { return chiaveRifiutata; }

// ---------- funzioni pure ----------

// Se l'utente ha scritto (o incollato) un ISBN, lo restituisce con le sole cifre; altrimenti null.
export function comeIsbn(testo) {
  const s = String(testo).replace(/[\s-]/g, '').toUpperCase();
  return /^(97[89]\d{10}|\d{9}[\dX])$/.test(s) ? s : null;
}

// Il numero letto da un codice a barre è un ISBN? Sul retro dei libri c'è un codice EAN-13 che comincia
// con 978 o 979; l'ultima cifra è di controllo e permette di scartare una lettura sbagliata.
// Restituisce l'ISBN (13 cifre) oppure null (altro tipo di codice, o letto male).
export function isbnDaCodice(valore) {
  const s = String(valore ?? '').replace(/\D/g, '');
  if (!/^97[89]\d{10}$/.test(s)) return null;
  const somma = [...s.slice(0, 12)].reduce((t, c, i) => t + Number(c) * (i % 2 ? 3 : 1), 0);
  return (10 - (somma % 10)) % 10 === Number(s[12]) ? s : null;
}

// I cataloghi ogni tanto rispondono con valori inattesi (un numero, un oggetto, niente): queste funzioni
// accettano solo quello che serve e trasformano il resto in "vuoto", così una voce strana non rompe la ricerca.
const scritta = v => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const elenco = v => (Array.isArray(v) ? v.map(scritta).filter(Boolean) : []);
const primoAnno = v => { const m = scritta(v).match(/\d{4}/); return m ? Number(m[0]) : null; };
const isbn13 = lista => { const l = elenco(lista).map(x => x.replace(/[^0-9Xx]/g, '')); return l.find(x => /^97[89]\d{10}$/.test(x)) || l[0] || ''; };
const pulisciTitolo = t => scritta(t).replace(/\s+/g, ' ').replace(/\s*[.:;,/]+$/, '').trim();
// applica una funzione "normalizza…" a ogni voce; quelle che danno errore vengono saltate
const tutte = (voci, normalizza) => (Array.isArray(voci) ? voci : []).map(v => { try { return normalizza(v); } catch (e) { return null; } }).filter(Boolean);

// Una voce della risposta di Open Library → un libro nel formato dell'app (null se manca il titolo).
// "editions.docs[0]" è l'edizione che corrisponde meglio alla ricerca (di solito quella italiana).
export function normalizzaOpenLibrary(doc) {
  if (!doc || typeof doc !== 'object') return null;
  const prima = doc.editions && Array.isArray(doc.editions.docs) ? doc.editions.docs[0] : null;
  const ed = prima && typeof prima === 'object' ? prima : {};
  const titolo = pulisciTitolo(ed.title) || pulisciTitolo(doc.title);
  if (!titolo) return null;
  const copertinaId = ed.cover_i || doc.cover_i;
  const pagine = Number(ed.number_of_pages) || Number(doc.number_of_pages_median) || null;
  return {
    titolo,
    autore: elenco(doc.author_name).slice(0, 3).join(', '),
    pagine: pagine && pagine > 0 ? Math.round(pagine) : null,
    anno: Number(doc.first_publish_year) || primoAnno(Array.isArray(ed.publish_date) ? ed.publish_date[0] : ed.publish_date),
    editore: elenco(ed.publisher)[0] || '',
    isbn: isbn13(ed.isbn),
    genere: '',
    copertina: Number.isInteger(Number(copertinaId)) && Number(copertinaId) > 0 ? `https://covers.openlibrary.org/b/id/${Number(copertinaId)}-M.jpg` : null,
    origine: 'openlibrary'
  };
}

// Una voce della risposta di Google Books → un libro nel formato dell'app.
export function normalizzaGoogle(item) {
  const v = item && item.volumeInfo;
  if (!v || !pulisciTitolo(v.title)) return null;
  const ids = (Array.isArray(v.industryIdentifiers) ? v.industryIdentifiers : []).filter(i => i && typeof i === 'object');
  const isbn = scritta((ids.find(i => i.type === 'ISBN_13') || ids.find(i => i.type === 'ISBN_10') || {}).identifier);
  const immagini = v.imageLinks && typeof v.imageLinks === 'object' ? v.imageLinks : {};
  const indirizzo = v => (typeof v === 'string' && /^https?:\/\//.test(v) ? v : '');
  let copertina = indirizzo(immagini.thumbnail) || indirizzo(immagini.smallThumbnail) || null;
  // Google dà indirizzi http: e con l'angolo della pagina arricciato: li sistemiamo
  if (copertina) copertina = copertina.replace(/^http:/, 'https:').replace('&edge=curl', '');
  return {
    titolo: pulisciTitolo(v.title),
    autore: elenco(v.authors).slice(0, 3).join(', '),
    pagine: Number(v.pageCount) > 0 ? Math.round(Number(v.pageCount)) : null,
    anno: primoAnno(v.publishedDate),
    editore: scritta(v.publisher),
    isbn: isbn.replace(/[^0-9Xx]/g, ''),
    genere: elenco(v.categories)[0] || '',
    copertina,
    origine: 'google'
  };
}

// Mette insieme più elenchi togliendo i doppioni (stesso ISBN, oppure stesso titolo e stesso primo autore).
// Del doppione si tengono le informazioni che al primo mancavano (pagine, copertina, anno…).
export function unisci(...elenchi) {
  const risultato = [];
  const chiave = l => semplice(l.titolo) + '|' + semplice((l.autore || '').split(',')[0]);
  for (const l of elenchi.flat()) {
    if (!l) continue;
    const gia = risultato.find(x => (l.isbn && x.isbn === l.isbn) || chiave(x) === chiave(l));
    if (!gia) { risultato.push({ ...l }); continue; }
    for (const campo of ['pagine', 'copertina', 'anno', 'editore', 'isbn', 'genere', 'autore']) if (!gia[campo] && l[campo]) gia[campo] = l[campo];
  }
  return risultato;
}

// ---------- chiamate in rete ----------

// Scarica un indirizzo e lo legge come JSON (usata anche da consigli.js).
export async function scarica(url, segnale) {
  // AbortController: permette di interrompere la richiesta se dura troppo o se l'utente ha già scritto altro
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ATTESA_MASSIMA);
  if (segnale) segnale.addEventListener('abort', () => ctrl.abort(), { once: true });
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) { const e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
    return await r.json();
  } finally { clearTimeout(timer); }
}

async function cercaOpenLibrary(testo, segnale) {
  const isbn = comeIsbn(testo);
  const q = isbn ? 'isbn:' + isbn : testo;
  const url = `${OPEN_LIBRARY}?q=${encodeURIComponent(q)}&limit=12&lang=it&fields=${CAMPI_OL}`;
  const json = await scarica(url, segnale);
  return tutte(json && json.docs, normalizzaOpenLibrary);
}

async function cercaGoogle(testo, chiave, segnale) {
  if (!chiave && googleSenzaChiaveRifiutato) return [];
  const isbn = comeIsbn(testo);
  const q = isbn ? 'isbn:' + isbn : testo;
  let url = `${GOOGLE_BOOKS}?q=${encodeURIComponent(q)}&maxResults=10&printType=books&country=IT`;
  if (!isbn) url += '&langRestrict=it';
  if (chiave) url += '&key=' + encodeURIComponent(chiave);
  try {
    const json = await scarica(url, segnale);
    if (chiave) chiaveRifiutata = false;
    return tutte(json && json.items, normalizzaGoogle);
  } catch (e) {
    if (!chiave && (e.status === 429 || e.status === 403)) googleSenzaChiaveRifiutato = true;
    // con la chiave: 400 = chiave scritta male, 403 = chiave non valida per questo sito o per le Books API
    if (chiave && (e.status === 400 || e.status === 403)) chiaveRifiutata = true;
    throw e;
  }
}

// Cerca nei due cataloghi insieme. Restituisce { libri, errore }:
//   errore = true solo se NESSUNO dei due ha risposto (di solito: manca la connessione).
// Se la ricerca viene interrotta (segnale) lancia l'errore "AbortError", che chi chiama ignora.
export async function cercaInRete(testo, { chiaveGoogle = '', segnale = null } = {}) {
  testo = String(testo).trim();
  if (testo.length < 2) return { libri: [], errore: false };
  const [g, ol] = await Promise.allSettled([cercaGoogle(testo, chiaveGoogle, segnale), cercaOpenLibrary(testo, segnale)]);
  if (segnale && segnale.aborted) { const e = new Error('interrotta'); e.name = 'AbortError'; throw e; }
  const libri = unisci(g.status === 'fulfilled' ? g.value : [], ol.status === 'fulfilled' ? ol.value : []);
  return { libri: libri.slice(0, 15), errore: g.status === 'rejected' && ol.status === 'rejected' };
}
