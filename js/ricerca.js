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
// Il "ponte" verso il catalogo delle biblioteche italiane (SBN): vedi ponte-sbn/worker.js e il README.
// (Le prove sul computer possono sostituirlo con globalThis.__PONTE_SBN__.)
const PONTE_SBN = globalThis.__PONTE_SBN__ || 'https://libri-sbn.debartologabriele2005-e41.workers.dev';
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

// ---------- catalogo SBN (biblioteche italiane) ----------
// SBN scrive i dati come in una scheda di biblioteca: qui li si riporta alla forma di tutti i giorni.

// "Il colibrì : [romanzo] / Sandro Veronesi" → "Il colibrì";  "L' amica geniale" → "L'amica geniale"
export function titoloSBN(t) {
  let s = scritta(t).split(' / ')[0];
  s = s.split(' : ')[0].split(' ; ')[0];
  s = s.replace(/\[[^\]]*\]/g, '').replace(/\*/g, '');
  s = s.replace(/\b([A-Za-zÀ-ÿ]*[’'])\s+/g, '$1'); // l' amica → l'amica, dell' anno → dell'anno
  return pulisciTitolo(s);
}
// "Veronesi, Sandro <1959- >" → "Sandro Veronesi";  "Tolkien, J. R. R." → "J. R. R. Tolkien"
export function autoreSBN(a) {
  const s = scritta(a).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  const [cognome, nome] = s.split(/,\s*/);
  return nome ? `${nome} ${cognome}`.trim() : cognome || '';
}
// "Milano : La nave di Teseo, 2020" → { editore: 'La nave di Teseo', anno: 2020 }
export function pubblicazioneSBN(p) {
  const s = scritta(p);
  const dopo = s.includes(' : ') ? s.split(' : ').slice(1).join(' : ') : s;
  const editore = dopo.split(/[,;]/)[0].replace(/\[|\]/g, '').trim();
  const anni = s.match(/\b(1[5-9]\d\d|20\d\d)\b/g);
  return { editore: /^\d/.test(editore) ? '' : editore, anno: anni ? Number(anni[anni.length - 1]) : null };
}
// "366 p. ; 22 cm" → 366;  "XV, 455 p." → 455;  "2 v." → null
export function pagineSBN(d) {
  const m = scritta(d).match(/(\d+)\s*p\b/);
  return m && Number(m[1]) > 0 ? Number(m[1]) : null;
}
// Una voce di SBN (breve, più la scheda completa se c'è) → un libro nel formato dell'app.
export function normalizzaSBN(breve, scheda = null) {
  const b = breve && typeof breve === 'object' ? breve : {};
  const s = scheda && typeof scheda === 'object' ? scheda : {};
  if (b.tipo && b.tipo !== 'Testo a stampa') return null;
  const titolo = titoloSBN(s.titolo || b.titolo);
  if (!titolo) return null;
  // se manca l'autore principale (libri a più mani) si prende chi è scritto dopo la "/" del titolo
  const dopoBarra = scritta(b.titolo || s.titolo).split(' / ')[1] || '';
  const autore = autoreSBN(b.autorePrincipale || s.autorePrincipale) || dopoBarra.split(/\s*[;,]\s*/)[0].trim();
  const { editore, anno } = pubblicazioneSBN(s.pubblicazione || b.pubblicazione);
  const dewey = scritta(s.classificazioneDewey).toUpperCase();
  return {
    titolo,
    autore: autore.slice(0, 200),
    pagine: pagineSBN(s.descrizioneFisica),
    anno,
    editore,
    isbn: scritta(b.isbn).replace(/[^0-9Xx]/g, ''),
    genere: /NARRATIVA/.test(dewey) ? 'Romanzo' : /POESIA/.test(dewey) ? 'Poesia' : '',
    copertina: null,
    origine: 'sbn',
    bid: scritta(b.codiceIdentificativo || s.codiceIdentificativo)
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

// Catalogo SBN, attraverso il ponte. Per i primi risultati si chiede anche la scheda completa,
// che ha il numero di pagine (si chiedono insieme; se una non arriva, il libro resta senza pagine).
async function cercaSBN(testo, segnale) {
  const isbn = comeIsbn(testo);
  const domanda = isbn ? 'isbn=' + isbn : 'testo=' + encodeURIComponent(testo.slice(0, 100));
  const json = await scarica(`${PONTE_SBN}/cerca?${domanda}`, segnale);
  const brevi = (json && Array.isArray(json.briefRecords) ? json.briefRecords : []).filter(b => b && typeof b === 'object' && (!b.tipo || b.tipo === 'Testo a stampa'));
  const conScheda = brevi.slice(0, isbn ? 2 : 5);
  const schede = await Promise.allSettled(conScheda.map(b => scarica(`${PONTE_SBN}/scheda?bid=${encodeURIComponent(scritta(b.codiceIdentificativo))}`, segnale)));
  return tutte(brevi.map((b, i) => [b, schede[i] && schede[i].status === 'fulfilled' ? schede[i].value : null]), ([b, s]) => normalizzaSBN(b, s));
}

// Cerca nei cataloghi insieme. Restituisce { libri, errore }:
//   errore = true solo se NESSUNO ha risposto (di solito: manca la connessione).
// Se la ricerca viene interrotta (segnale) lancia l'errore "AbortError", che chi chiama ignora.
export async function cercaInRete(testo, { chiaveGoogle = '', segnale = null } = {}) {
  testo = String(testo).trim();
  if (testo.length < 2) return { libri: [], errore: false };
  const [g, ol, sbn] = await Promise.allSettled([cercaGoogle(testo, chiaveGoogle, segnale), cercaOpenLibrary(testo, segnale), cercaSBN(testo, segnale)]);
  if (segnale && segnale.aborted) { const e = new Error('interrotta'); e.name = 'AbortError'; throw e; }
  const [gl, oll, sbnl] = [g, ol, sbn].map(x => (x.status === 'fulfilled' ? x.value : []));
  // Con un ISBN, SBN viene prima: ha l'edizione italiana esatta (titolo, editore, pagine); gli altri aggiungono la copertina.
  // Con un titolo, prima Open Library e Google (hanno le copertine), poi le edizioni che conosce solo SBN.
  const libri = comeIsbn(testo) ? unisci(sbnl, gl, oll) : unisci(gl, oll, sbnl);
  // un libro di SBN senza copertina: si prova quella di Open Library cercata per ISBN (se non c'è, resta quella disegnata)
  for (const l of libri) if (!l.copertina && l.origine === 'sbn' && l.isbn) l.copertina = `https://covers.openlibrary.org/b/isbn/${l.isbn}-M.jpg?default=false`;
  for (const l of libri) delete l.bid;
  return { libri: libri.slice(0, 15), errore: [g, ol, sbn].every(x => x.status === 'rejected') };
}
