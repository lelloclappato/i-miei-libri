// "Per te": libri consigliati a partire da quelli che hai in libreria.
//
// Come funziona, in breve:
//  1. si scelgono i "semi": i libri che dicono qualcosa dei tuoi gusti. Contano di più quelli finiti con
//     un voto alto e quelli che stai leggendo; quelli con un voto basso (o abbandonati) contano "contro".
//  2. per ogni seme si chiede a Open Library di quale opera si tratta, chi l'ha scritta e quali argomenti
//     ha ("soggetti": fantasy, gialli, Medioevo…). Le risposte si tengono da parte per due mesi.
//  3. si cercano altri libri degli autori preferiti e altri libri con gli stessi soggetti, solo tra quelli
//     usciti anche in italiano, i più letti per primi.
//  4. ogni libro trovato prende dei punti (di più se compare in più ricerche, o se l'autore ti piace molto);
//     si tolgono quelli che hai già e quelli a cui hai detto "No, grazie", e si tengono i migliori,
//     ognuno con il motivo per cui è lì ("Dello stesso autore di…", "Fantasy, come…").
//
// Open Library non vuole troppe richieste ravvicinate: per questo si fanno poche ricerche, una alla volta,
// e il risultato resta valido una settimana (o finché non cambiano i tuoi libri preferiti).
// Le funzioni pure (semi, soggettiUtili, scegliRicerche, classifica, consigliVisibili) hanno i loro test.
import { deposito } from './deposito.js';
import { semplice } from './utili.js';
import { scarica, normalizzaOpenLibrary } from './ricerca.js';
import { STORE } from './dati.js';

const OPEN_LIBRARY = 'https://openlibrary.org/search.json';
const CAMPI = 'key,title,author_name,author_key,first_publish_year,number_of_pages_median,cover_i,editions,editions.key,editions.title,editions.language,editions.number_of_pages,editions.cover_i,editions.isbn,editions.publisher,editions.publish_date';
const MAX_SEMI = 10;          // libri usati per capire i tuoi gusti
const NUOVI_SEMI_PER_VOLTA = 6; // semi da chiedere in rete a ogni aggiornamento (gli altri la volta dopo)
const MAX_AUTORI = 3;         // ricerche "altri libri dello stesso autore"
const MAX_SOGGETTI = 4;       // ricerche "altri libri con lo stesso argomento"
const MAX_CONSIGLI = 30;      // consigli tenuti da parte (se ne mostrano meno: vedi consigliVisibili)
const GIORNI_VALIDI = 7;      // dopo una settimana i consigli si rifanno
const GIORNI_SEME = 60;       // per quanto si ricorda cosa ha detto Open Library di un seme

// I generi più comuni, con il loro nome su Open Library e in italiano.
// Servono in due direzioni: per dire "Fantasy, come «…»" e per usare il genere che hai scritto tu nella scheda.
export const GENERI = {
  fantasy: 'Fantasy', fantasy_fiction: 'Fantasy',
  science_fiction: 'Fantascienza',
  mystery_fiction: 'Giallo', detective_and_mystery_stories: 'Giallo', crime_fiction: 'Giallo',
  historical_fiction: 'Romanzo storico',
  thrillers: 'Thriller', suspense_fiction: 'Thriller', spy_stories: 'Spionaggio',
  horror: 'Horror', horror_tales: 'Horror',
  romance: 'Romanzo d’amore', love_stories: 'Romanzo d’amore',
  dystopias: 'Distopia',
  bildungsromans: 'Romanzo di formazione', coming_of_age: 'Romanzo di formazione',
  humorous_fiction: 'Umorismo', humorous_stories: 'Umorismo', satire: 'Satira',
  short_stories: 'Racconti', poetry: 'Poesia', fairy_tales: 'Fiabe',
  psychological_fiction: 'Romanzo psicologico',
  war_stories: 'Romanzo di guerra', adventure_stories: 'Avventura',
  magic_realism: 'Realismo magico', magical_realism: 'Realismo magico',
  philosophy: 'Filosofia', psychology: 'Psicologia', 'self-help_techniques': 'Crescita personale',
  biography: 'Biografia', autobiography: 'Biografia',
  classic_literature: 'Classico', young_adult_fiction: 'Young adult', graphic_novels: 'Fumetto'
};
// Il genere scritto nella scheda del libro (semplificato) → soggetto di Open Library
const DAL_GENERE = {
  'fantasy': 'fantasy', 'fantascienza': 'science_fiction', 'sci fi': 'science_fiction',
  'giallo': 'detective_and_mystery_stories', 'gialli': 'detective_and_mystery_stories', 'poliziesco': 'detective_and_mystery_stories', 'noir': 'crime_fiction',
  'thriller': 'thrillers', 'spionaggio': 'spy_stories', 'horror': 'horror_tales',
  'storico': 'historical_fiction', 'romanzo storico': 'historical_fiction',
  'rosa': 'romance', 'romance': 'romance', 'romanzo d amore': 'romance',
  'distopia': 'dystopias', 'distopico': 'dystopias', 'formazione': 'bildungsromans', 'romanzo di formazione': 'bildungsromans',
  'umorismo': 'humorous_fiction', 'comico': 'humorous_fiction', 'satira': 'satire',
  'racconti': 'short_stories', 'poesia': 'poetry', 'fiabe': 'fairy_tales',
  'avventura': 'adventure_stories', 'filosofia': 'philosophy', 'psicologia': 'psychology',
  'crescita personale': 'self-help_techniques', 'biografia': 'biography', 'autobiografia': 'autobiography',
  'classico': 'classic_literature', 'classici': 'classic_literature', 'young adult': 'young_adult_fiction',
  'fumetto': 'graphic_novels', 'fumetti': 'graphic_novels', 'graphic novel': 'graphic_novels'
};
export function soggettoDalGenere(genere) { return DAL_GENERE[semplice(genere)] || null; }
// Generi troppo larghi per cercarci dentro: su Open Library "biography" mette insieme Anne Frank, Anna Karenina
// e libri che nessuno vorrebbe vedersi consigliare. Servono solo per il motivo, mai per una ricerca.
const TROPPO_LARGHI = /biograph|^(philosophy|psychology|poetry|travel|history|essays|religion|authors|memoirs?|diaries)$|^authors_/;
// Autori che non si consigliano mai, qualunque cosa dicano i soggetti.
const MAI = new Set(['adolf hitler', 'benito mussolini', 'joseph goebbels']);

// Soggetti troppo generici per dire qualcosa dei tuoi gusti (li hanno quasi tutti i romanzi).
const GENERICI = new Set(['fiction', 'novel', 'novels', 'history', 'literature', 'general', 'large_type_books', 'accessible_book',
  'protected_daisy', 'in_library', 'lending_library', 'criticism_and_interpretation', 'fiction_general', 'fiction_literary',
  'literary_fiction', 'english_fiction', 'american_fiction', 'italian_fiction', 'french_fiction', 'german_fiction', 'spanish_fiction',
  'english_literature', 'american_literature', 'italian_literature', 'open_syllabus_project', 'long_now_manual_for_civilization',
  'reading_level-grade_11', 'reading_level-grade_12', 'readers', 'textbooks', 'study_guides', 'juvenile_literature', 'juvenile_fiction',
  'children\'s_fiction', 'manners_and_customs', 'social_life_and_customs', 'translations', 'romans_nouvelles', 'fiction_classics',
  'classics', 'roman', 'novela', 'romanzi', 'man-woman_relationships', 'women', 'men', 'family', 'families', 'love', 'death']);

// Tiene solo i soggetti utili: scritti in caratteri semplici (gli stessi soggetti esistono in tante lingue,
// basta la versione inglese), non generici, non legati a un'edizione ("translations_into_german"),
// non lunghissimi, e non quelli che sono il titolo del libro stesso.
export function soggettiUtili(chiavi) {
  return [...new Set((Array.isArray(chiavi) ? chiavi : []).filter(k => typeof k === 'string').map(k => k.toLowerCase()))]
    .filter(k => /^[a-z][a-z0-9_&'().,-]{2,59}$/.test(k)) // niente date ("1944-1945") né altre lingue
    .filter(k => !GENERICI.has(k) && !/^(translations?_|nyt:|new_york_times|reading_level|award:|accessible|protected|in_library|place:|time:|person:)/.test(k))
    .filter(k => !/_\((?!fictitious)[^)]*\)$/.test(k)); // "nome_della_rosa_(eco_umberto)": è il libro stesso
}

// ---------- 1. i semi ----------

// Quanto conta un libro per capire i tuoi gusti (negativo = ti è piaciuto poco).
function pesoDi(l) {
  if (l.stato === 'letto') return [1, -2, -1, 0.6, 2, 3][l.voto] ?? 1; // voto 0 = letto senza voto
  if (l.stato === 'leggendo') return 1.5;
  if (l.stato === 'abbandonato') return -1.5;
  return 0.6; // da leggere, voglio leggere: dicono cosa ti incuriosisce
}

// I libri da usare come semi, i più importanti per primi. Quelli "da leggere" e "voglio leggere" entrano
// solo se non c'è nient'altro (all'inizio, quando non hai ancora finito niente).
export function semi(libri) {
  const forti = libri.filter(l => ['letto', 'leggendo', 'abbandonato'].includes(l.stato));
  const usati = forti.some(l => pesoDi(l) > 0) ? forti : libri;
  const conPeso = usati.map(l => ({ libro: l, peso: pesoDi(l) })).filter(s => s.peso !== 0);
  const positivi = conPeso.filter(s => s.peso > 0)
    .sort((a, b) => b.peso - a.peso || (b.libro.finito || b.libro.iniziato || b.libro.aggiunto).localeCompare(a.libro.finito || a.libro.iniziato || a.libro.aggiunto))
    .slice(0, MAX_SEMI);
  return [...positivi, ...conPeso.filter(s => s.peso < 0)];
}
// Una "impronta" dei semi: se cambia (nuovo voto, libro finito…) i consigli vanno rifatti.
// Finché ci sono solo libri "da leggere" e "voglio leggere" l'impronta resta la stessa: altrimenti ogni consiglio
// aggiunto alla lista dei desideri farebbe rifare tutto, e l'elenco cambierebbe sotto il dito.
export function firmaSemi(lista) {
  if (!lista.some(s => ['letto', 'leggendo', 'abbandonato'].includes(s.libro.stato))) return 'iniziali';
  return lista.map(s => s.libro.id + ':' + s.peso).sort().join(',');
}

// ---------- 2. cosa dice Open Library di ogni seme ----------

const chiaveSeme = l => semplice(l.titolo) + '|' + semplice((l.autore || '').split(',')[0]);
function leggiJSON(nome, base) {
  try { const v = JSON.parse(deposito.getItem(nome) || 'null'); return v && typeof v === 'object' && !Array.isArray(v) ? v : base; } catch (e) { return base; }
}
function scriviJSON(nome, v) { try { deposito.setItem(nome, JSON.stringify(v)); return true; } catch (e) { return false; } }

// Cerca il seme su Open Library: prima con l'ISBN, poi con titolo e autore.
// Restituisce { opera, autori: [chiavi], nomi: [nomi], soggetti: [...] } oppure null se non c'è.
async function chiediSeme(l, segnale) {
  const campi = '&limit=1&fields=key,title,author_key,author_name,subject_key';
  const prove = [];
  if (l.isbn) prove.push(`q=${encodeURIComponent('isbn:' + l.isbn)}`);
  prove.push(`title=${encodeURIComponent(l.titolo)}${l.autore ? '&author=' + encodeURIComponent(l.autore.split(',')[0]) : ''}`);
  for (const p of prove) {
    const json = await scarica(`${OPEN_LIBRARY}?${p}${campi}`, segnale);
    const d = json && Array.isArray(json.docs) ? json.docs[0] : null;
    if (d && typeof d === 'object') {
      return {
        opera: typeof d.key === 'string' ? d.key.replace('/works/', '') : '',
        autori: (Array.isArray(d.author_key) ? d.author_key : []).filter(k => typeof k === 'string' && /^OL\d+A$/.test(k)).slice(0, 3),
        nomi: (Array.isArray(d.author_name) ? d.author_name : []).filter(n => typeof n === 'string').slice(0, 3),
        soggetti: soggettiUtili(d.subject_key).slice(0, 60)
      };
    }
  }
  return null;
}

// ---------- 3. quali ricerche fare ----------

// Dai semi (con quello che Open Library ha detto di loro) alle ricerche da fare:
//   autori:   [{ chiave, nome, peso, seme }]          altri libri degli autori che ti piacciono
//   soggetti: [{ chiave, peso, semi: [libri] }]       altri libri sugli stessi argomenti
// "info" è una mappa id del libro → risposta di chiediSeme (o null).
export function scegliRicerche(lista, info) {
  const autori = new Map(), soggetti = new Map();
  for (const { libro: l, peso } of lista) {
    if (peso <= 0) continue;
    const i = info[l.id] || null;
    // autori: con la chiave di Open Library se c'è, altrimenti con il nome scritto nella scheda
    const nomi = i && i.nomi.length ? i.nomi : (l.autore ? l.autore.split(',').map(s => s.trim()).filter(Boolean) : []);
    nomi.slice(0, 2).forEach((nome, n) => {
      const chiave = i && i.autori[n] ? i.autori[n] : 'nome:' + nome;
      const a = autori.get(chiave) || { chiave, nome, peso: 0, seme: l, pesoSeme: 0 };
      a.peso += peso;
      if (peso > a.pesoSeme) { a.seme = l; a.pesoSeme = peso; }
      autori.set(chiave, a);
    });
    // soggetti: quelli di Open Library, più il genere che hai scritto tu (vale doppio: l'hai scelto tu)
    const suoi = new Map(soggettiUtili(i ? i.soggetti : []).map(k => [k, 1]));
    const dalGenere = l.genere ? soggettoDalGenere(l.genere) : null;
    if (dalGenere) suoi.set(dalGenere, 2);
    for (const [k, quanto] of suoi) {
      const s = soggetti.get(k) || { chiave: k, peso: 0, semi: [], conti: 0 };
      s.peso += peso * quanto;
      s.conti += 1;
      if (!s.semi.includes(l)) s.semi.push(l);
      soggetti.set(k, s);
    }
  }
  // Un soggetto è interessante se è un genere conosciuto o se lo hanno più libri tuoi:
  // un argomento che compare in un libro solo ("monaci benedettini") dice poco dei tuoi gusti.
  const valore = s => s.peso * (GENERI[s.chiave] ? 1.6 : 1) * (s.conti >= 2 ? 1.5 : 0.5) * (/^fiction_/.test(s.chiave) ? 1.2 : 1);
  const sceltiSoggetti = [];
  const perSeme = new Map(); // ogni seme può "portare" al massimo due soggetti, così uno solo non decide tutto
  for (const s of [...soggetti.values()].sort((a, b) => valore(b) - valore(a))) {
    if (sceltiSoggetti.length >= MAX_SOGGETTI) break;
    if (TROPPO_LARGHI.test(s.chiave)) continue;
    // un argomento di un libro solo si usa solo se è una categoria di narrativa ("fiction_…"): gli altri
    // ("nobiltà", "Medioevo") portano a saggi accademici più che a romanzi
    if (!GENERI[s.chiave] && s.conti < 2 && !/^fiction_/.test(s.chiave)) continue;
    const primo = s.semi[0].id;
    if ((perSeme.get(primo) || 0) >= 2 && s.conti < 2) continue;
    perSeme.set(primo, (perSeme.get(primo) || 0) + 1);
    sceltiSoggetti.push({ chiave: s.chiave, peso: valore(s), semi: s.semi });
  }
  return {
    autori: [...autori.values()].filter(a => a.peso > 0).sort((a, b) => b.peso - a.peso).slice(0, MAX_AUTORI)
      .map(({ chiave, nome, peso, seme }) => ({ chiave, nome, peso, seme })),
    soggetti: sceltiSoggetti
  };
}

// ---------- 4. mettere insieme i risultati ----------

const virgolette = t => `«${t}»`;
function motivoAutore(r) { return `Dello stesso autore di ${virgolette(r.seme.titolo)}`; }
function motivoSoggetto(r) {
  const [a, b] = r.semi;
  const come = b ? `${virgolette(a.titolo)} e ${virgolette(b.titolo)}` : virgolette(a.titolo);
  if (GENERI[r.chiave]) return `${GENERI[r.chiave]}, come ${come}`;
  if (!b && a.stato === 'letto' && a.voto >= 4) return `Perché ti è piaciuto ${come}`;
  return `Simile a ${come}`;
}

// Il titolo da mostrare: quello dell'edizione italiana se Open Library l'ha trovata, altrimenti quello dell'opera.
// Un'edizione segnata come "inglese e italiana" di solito è inglese: lì vale il titolo dell'opera.
function titoloItaliano(doc) {
  const ed = doc && doc.editions && Array.isArray(doc.editions.docs) && doc.editions.docs[0];
  const lingue = ed && Array.isArray(ed.language) ? ed.language : [];
  const titolo = ed && lingue.length === 1 && lingue[0] === 'ita' && typeof ed.title === 'string' && ed.title.trim() ? ed.title : (typeof doc.title === 'string' ? doc.title : '');
  return titolo.replace(/\s*[[(](italian( text| edition)?|edizione italiana)[\])]\s*/gi, ' ').trim();
}

// Il titolo sembra italiano? Si scartano quelli in un altro alfabeto e quelli con parole di altre lingue
// ("The", "of", "dans", "los"…) e nessuna parola tipica dell'italiano: vuol dire che Open Library non conosce
// il titolo italiano, e un consiglio con il titolo sbagliato non aiuta a trovare il libro in libreria.
const STRANIERE = new Set(['the', 'of', 'and', 'with', 'an', 'to', 'for', 'from', 'my', 'your', 'is', 'collected', 'complete', 'selected',
  'works', 'poems', 'stories', 'novel', 'book', 'et', 'dans', 'les', 'des', 'du', 'sur', 'une', 'de', 'el', 'los', 'las', 'y', 'der', 'die', 'und', 'das']);
// solo parole che in francese, spagnolo e inglese non esistono ("la" e "una" no: ci sono anche altrove)
const ITALIANE = new Set(['il', 'lo', 'gli', 'i', 'di', 'della', 'dei', 'delle', 'degli', 'e', 'che', 'per', 'con', 'nel', 'nella', 'al', 'alla', 'non', 'da', 'tra', 'sul', 'sulla', 'uno', 'ai']);
export function sembraItaliano(titolo) {
  if (/[\u0370-\u03ff\u0400-\u04ff\u0590-\u06ff\u3040-\u30ff\u4e00-\u9fff\uac00-\ud7af]/.test(titolo)) return false;
  const parole = semplice(titolo).split(' ');
  return !(parole.some(p => STRANIERE.has(p)) && !parole.some(p => ITALIANE.has(p)));
}

// Una voce di una ricerca → un consiglio (null se non va bene).
export function daDoc(doc) {
  const l = normalizzaOpenLibrary(doc);
  if (!l) return null;
  const titolo = titoloItaliano(doc).replace(/\s+/g, ' ').replace(/\s*[.:;,/]+$/, '').trim() || l.titolo;
  if (!sembraItaliano(titolo)) return null;
  // tra gli autori Open Library mette a volte i traduttori ("Italo Calvino, William Weaver 1923"): si tiene il primo
  l.autore = (l.autore || '').split(',')[0].trim();
  if (MAI.has(semplice((l.autore || '').split(',')[0]))) return null;
  const opera = typeof doc.key === 'string' && /^\/works\/OL\d+W$/.test(doc.key) ? doc.key.replace('/works/', '') : '';
  return { ...l, titolo, opera, chiave: opera || chiaveSeme({ titolo, autore: l.autore }) };
}

// Mette insieme i risultati di tutte le ricerche e restituisce i consigli migliori, ognuno con il suo motivo.
//   risultati: [{ ricerca: { tipo: 'autore' | 'soggetto', peso, … }, docs: [voci di Open Library] }]
//   libri: la tua libreria (per non consigliarti quello che hai già); negativi: autori che non ti sono piaciuti
export function classifica(risultati, libri, { negativi = [] } = {}) {
  const tuoi = new Set(libri.map(chiaveSeme));
  const tuoiTitoli = new Set(libri.map(l => semplice(l.titolo)));
  const no = new Set(negativi.map(semplice).filter(Boolean));
  const candidati = new Map();
  for (const { ricerca, docs } of risultati) {
    (Array.isArray(docs) ? docs : []).forEach((doc, posto) => {
      let c;
      try { c = daDoc(doc); } catch (e) { c = null; }
      if (!c) return;
      const primoAutore = semplice((c.autore || '').split(',')[0]);
      if (tuoi.has(chiaveSeme(c)) || tuoiTitoli.has(semplice(c.titolo)) || tuoiTitoli.has(semplice(doc.title))) return;
      if (primoAutore && no.has(primoAutore)) return;
      const punti = ricerca.peso / (1 + posto * 0.2);
      const gia = candidati.get(c.chiave);
      if (gia) {
        gia.punti += punti;
        if (punti > gia.migliore) { gia.migliore = punti; gia.motivo = ricerca.motivo; }
      } else {
        candidati.set(c.chiave, { ...c, punti: punti * (c.copertina ? 1.1 : 1), migliore: punti, motivo: ricerca.motivo });
      }
    });
  }
  // al massimo due libri dello stesso autore, così l'elenco resta vario
  const perAutore = new Map(), scelti = [];
  for (const c of [...candidati.values()].sort((a, b) => b.punti - a.punti)) {
    const a = semplice((c.autore || '').split(',')[0]) || c.chiave;
    if ((perAutore.get(a) || 0) >= 2) continue;
    perAutore.set(a, (perAutore.get(a) || 0) + 1);
    const { punti, migliore, ...pulito } = c;
    scelti.push(pulito);
    if (scelti.length >= MAX_CONSIGLI) break;
  }
  return alterna(scelti);
}

// Mescola un poco l'ordine perché due consigli vicini non abbiano lo stesso motivo
// (tre "Romanzo storico, come…" di fila sembrano un elenco solo): si prende il primo dei prossimi tre
// che ha un motivo diverso dal precedente, altrimenti si va avanti in ordine.
function alterna(lista) {
  const resto = [...lista], fuori = [];
  while (resto.length) {
    const prima = fuori.length ? fuori[fuori.length - 1].motivo : null;
    const i = resto.slice(0, 3).findIndex(c => c.motivo !== prima);
    fuori.push(resto.splice(i < 0 ? 0 : i, 1)[0]);
  }
  return fuori;
}

// I consigli da mostrare adesso: senza quelli che nel frattempo hai aggiunto alla libreria o scartato.
export function consigliVisibili(elenco, libri, scartati, quanti = 12) {
  const tuoi = new Set(libri.map(chiaveSeme));
  const tuoiTitoli = new Set(libri.map(l => semplice(l.titolo)));
  const isbnTuoi = new Set(libri.map(l => l.isbn).filter(Boolean));
  const via = new Set(scartati);
  return (Array.isArray(elenco) ? elenco : [])
    .filter(c => !via.has(c.chiave) && !tuoi.has(chiaveSeme(c)) && !tuoiTitoli.has(semplice(c.titolo)) && !(c.isbn && isbnTuoi.has(c.isbn)))
    .slice(0, quanti);
}

// ---------- in rete ----------

// Esegue i lavori uno alla volta (o due insieme), con una piccola pausa: Open Library non ama le raffiche.
async function inFila(lavori, insieme = 2) {
  const esiti = new Array(lavori.length);
  let prossimo = 0;
  async function operaio() {
    while (prossimo < lavori.length) {
      const i = prossimo++;
      try { esiti[i] = { ok: true, valore: await lavori[i]() }; } catch (e) { esiti[i] = { ok: false, errore: e }; }
      await new Promise(r => setTimeout(r, 250));
    }
  }
  await Promise.all(Array.from({ length: Math.min(insieme, lavori.length) }, operaio));
  return esiti;
}

// Dove si tengono le cose: i consigli calcolati e quello che Open Library ha detto dei semi.
// Non stanno nei dati veri (non finiscono nel backup): si possono sempre rifare.
const NOME_CONSIGLI = STORE + '-consigli', NOME_SEMI = STORE + '-semi';

// I consigli salvati l'ultima volta: { firma, quando (ms), elenco } oppure null.
export function consigliSalvati() {
  const c = leggiJSON(NOME_CONSIGLI, null);
  return c && Array.isArray(c.elenco) && Number.isFinite(c.quando) ? c : null;
}
// I consigli salvati vanno rifatti? (non ci sono, sono vecchi, o i tuoi libri preferiti sono cambiati)
export function vannoRifatti(libri, adesso = Date.now()) {
  const c = consigliSalvati();
  return !c || c.firma !== firmaSemi(semi(libri)) || adesso - c.quando > GIORNI_VALIDI * 86400000;
}

// Prepara i consigli (chiedendo a Open Library) e li salva. Restituisce:
//   { elenco, senzaSemi: true se non c'è ancora nessun libro da cui partire, errore: true se la rete non ha risposto }
export async function preparaConsigli(libri, { segnale = null } = {}) {
  const lista = semi(libri);
  if (!lista.some(s => s.peso > 0)) return { elenco: [], senzaSemi: true, errore: false };

  // 1. i semi: quelli già chiesti si prendono da parte, gli altri si chiedono (non troppi per volta)
  const memoria = leggiJSON(NOME_SEMI, {});
  const adesso = Date.now();
  const info = {};
  const daChiedere = [];
  for (const { libro: l, peso } of lista) {
    if (peso <= 0) continue;
    const m = memoria[chiaveSeme(l)];
    if (m && adesso - m.quando < GIORNI_SEME * 86400000) info[l.id] = m.dati;
    else if (daChiedere.length < NUOVI_SEMI_PER_VOLTA) daChiedere.push(l);
  }
  const esitiSemi = await inFila(daChiedere.map(l => () => chiediSeme(l, segnale)));
  let falliti = 0;
  esitiSemi.forEach((e, n) => {
    const l = daChiedere[n];
    if (e.ok) { info[l.id] = e.valore; memoria[chiaveSeme(l)] = { quando: adesso, dati: e.valore }; }
    else falliti++;
  });
  // la memoria dei semi non deve crescere per sempre: si tengono i 300 più recenti
  const voci = Object.entries(memoria).sort((a, b) => b[1].quando - a[1].quando).slice(0, 300);
  scriviJSON(NOME_SEMI, Object.fromEntries(voci));
  if (segnale && segnale.aborted) throw Object.assign(new Error('interrotta'), { name: 'AbortError' });

  // 2. le ricerche
  const { autori, soggetti } = scegliRicerche(lista, info);
  const ricerche = [
    ...autori.map(a => ({
      tipo: 'autore', peso: a.peso * 1.2, motivo: motivoAutore(a),
      q: (a.chiave.startsWith('nome:') ? `author:"${a.nome.replace(/"/g, '')}"` : `author_key:${a.chiave}`) + ' language:ita'
    })),
    ...soggetti.map(s => ({ tipo: 'soggetto', peso: s.peso, motivo: motivoSoggetto(s), q: `subject_key:"${s.chiave}" language:ita` }))
  ];
  const esiti = await inFila(ricerche.map(r => () => scarica(`${OPEN_LIBRARY}?q=${encodeURIComponent(r.q)}&sort=readinglog&limit=15&lang=it&fields=${CAMPI}`, segnale)));
  if (segnale && segnale.aborted) throw Object.assign(new Error('interrotta'), { name: 'AbortError' });
  const riusciti = esiti.map((e, n) => (e.ok ? { ricerca: ricerche[n], docs: e.valore && e.valore.docs } : null)).filter(Boolean);
  if (!riusciti.length) return { elenco: consigliSalvati()?.elenco || [], senzaSemi: false, errore: true, falliti };

  // 3. la classifica
  const negativi = lista.filter(s => s.peso < 0).map(s => (s.libro.autore || '').split(',')[0]);
  const elenco = classifica(riusciti, libri, { negativi });
  scriviJSON(NOME_CONSIGLI, { firma: firmaSemi(lista), quando: Date.now(), elenco });
  return { elenco, senzaSemi: false, errore: false };
}
