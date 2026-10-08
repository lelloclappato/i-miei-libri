// Suggerimento del significato di una parola, preso dal Wikizionario italiano (it.wiktionary.org),
// un dizionario libero scritto da volontari. È solo un aiuto: il significato che resta nel quaderno
// lo scegli (e lo puoi riscrivere) tu. Se la parola non c'è o manca la connessione, non succede niente.
//
// Il Wikizionario risponde con un pezzo di pagina HTML. estraiDefinizioni() la legge e tira fuori
// solo le definizioni in italiano, lasciando stare sillabazione, etimologia, sinonimi ed esempi.
// È una funzione pura, con i suoi test.

const API = 'https://it.wiktionary.org/w/api.php';

// Sezioni della pagina che NON contengono definizioni.
const NON_DEFINIZIONI = ['sillabazione', 'pronuncia', 'etimologia', 'sinonimi', 'contrari', 'parole derivate', 'termini correlati',
  'alterati', 'proverbi', 'traduzione', 'note', 'altri progetti', 'citazione', 'iperonimi', 'iponimi', 'varianti', 'anagrammi', 'uso', 'vedi anche'];

const ENTITA = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function soloTesto(html) {
  return html.replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (tutto, nome) => ENTITA[nome.toLowerCase()] ?? tutto)
    .replace(/\s+/g, ' ').trim();
}

// HTML della pagina → [{ tipo: 'Sostantivo', definizioni: ['…', '…'] }]
export function estraiDefinizioni(html) {
  if (typeof html !== 'string') return [];
  // 1) solo la parte in italiano (la stessa pagina può avere anche latino, spagnolo…)
  const inizio = html.search(/<h2[^>]*data-mw-anchor="Italiano"/);
  if (inizio < 0) return [];
  let italiano = html.slice(inizio).replace(/^<h2[^>]*>[\s\S]*?<\/h2>/, '');
  const prossimaLingua = italiano.search(/<h2[\s>]/);
  if (prossimaLingua >= 0) italiano = italiano.slice(0, prossimaLingua);

  // 2) si divide nelle sezioni (Sostantivo, Verbo, Sillabazione…) e si tengono quelle con un elenco numerato
  const risultato = [];
  const pezzi = italiano.split(/<h3[^>]*data-mw-anchor="([^"]*)"[^>]*>[\s\S]*?<\/h3>/);
  // split con un gruppo tra parentesi alterna: [prima, nomeSezione, contenuto, nomeSezione, contenuto…]
  for (let i = 1; i < pezzi.length; i += 2) {
    const tipo = pezzi[i].replace(/_/g, ' ').replace(/ \d+$/, '').trim();
    if (NON_DEFINIZIONI.some(n => tipo.toLowerCase().startsWith(n))) continue;
    // 3) via gli esempi (elenchi puntati dentro le definizioni), poi ogni <li> è una definizione
    const contenuto = pezzi[i + 1].replace(/<ul[\s\S]*?<\/ul>/g, '').replace(/<dl[\s\S]*?<\/dl>/g, '');
    const definizioni = [];
    for (const elenco of contenuto.match(/<ol[\s\S]*?<\/ol>/g) || []) {
      for (const voce of elenco.match(/<li[^>]*>[\s\S]*?(?=<li[\s>]|<\/ol>)/g) || []) {
        const t = soloTesto(voce).replace(/\s+([.,;:])/g, '$1');
        if (t.length > 2 && !definizioni.includes(t)) definizioni.push(t.slice(0, 400));
      }
    }
    if (definizioni.length) risultato.push({ tipo, definizioni: definizioni.slice(0, 6) });
  }
  return risultato;
}

const ATTESA_MASSIMA = 10000; // millisecondi

async function pagina(titolo, segnale) {
  const url = `${API}?action=query&prop=extracts&redirects=1&format=json&formatversion=2&origin=*&titles=${encodeURIComponent(titolo)}`;
  // la richiesta si interrompe se dura troppo, o se chi l'ha chiesta non ne ha più bisogno (segnale)
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ATTESA_MASSIMA);
  if (segnale) segnale.addEventListener('abort', () => ctrl.abort(), { once: true });
  let json;
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    json = await r.json();
  } finally { clearTimeout(timer); }
  const p = json && json.query && Array.isArray(json.query.pages) ? json.query.pages[0] : null;
  return p && !p.missing && typeof p.extract === 'string' ? p.extract : '';
}

// Cerca la parola (prima in minuscolo, poi com'è scritta). Restituisce l'elenco di estraiDefinizioni,
// vuoto se la parola non c'è. Lancia un errore solo se la rete non risponde.
export async function cercaSignificato(parola, segnale = null) {
  const scritta = String(parola).trim();
  if (!scritta) return [];
  const prove = [...new Set([scritta.toLowerCase(), scritta])];
  for (const titolo of prove) {
    const definizioni = estraiDefinizioni(await pagina(titolo, segnale));
    if (definizioni.length) return definizioni;
  }
  return [];
}

// Indirizzo della parola sul vocabolario Treccani, per chi vuole una definizione più autorevole.
export function linkTreccani(parola) {
  return 'https://www.treccani.it/vocabolario/ricerca/' + encodeURIComponent(String(parola).trim().toLowerCase()) + '/';
}
