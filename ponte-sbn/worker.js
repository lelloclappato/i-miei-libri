// "Ponte" verso il catalogo delle biblioteche italiane (SBN, opac.sbn.it), per l'app I miei libri.
//
// Perché serve: il catalogo SBN ha praticamente tutti i libri pubblicati in Italia, ma non permette alle
// pagine web di interrogarlo direttamente dal browser (manca l'intestazione CORS). Questo piccolo programma
// gira su Cloudflare Workers (gratis): riceve la domanda dall'app, la gira a SBN e restituisce la risposta
// aggiungendo il permesso per l'app. Non salva niente e non sa chi sei: passa solo ISBN o titoli cercati.
//
// Cosa accetta (tutto il resto viene rifiutato):
//   /cerca?isbn=9788845292613      → ricerca per ISBN
//   /cerca?testo=veronesi colibrì   → ricerca per titolo/autore (al massimo 100 caratteri)
//   /scheda?bid=IT\ICCU\BAS\0295312 → scheda completa di un libro (con il numero di pagine)
//
// Come pubblicarlo: Cloudflare → Workers & Pages → Crea → "Inizia con Hello World" → nome "libri-sbn"
// → Distribuisci → Modifica codice → incolla questo file → Distribuisci. (Vedi README dell'app.)

const SBN = 'https://opac.sbn.it/opacmobilegw/';
// Solo l'app può usarlo (più il computer, per le prove).
const ORIGINI = [/^https:\/\/lelloclappato\.github\.io$/, /^http:\/\/localhost(:\d+)?$/, /^http:\/\/127\.0\.0\.1(:\d+)?$/];
const DURATA_CACHE = 7 * 24 * 3600; // una risposta di SBN vale una settimana

function intestazioni(origine) {
  const h = { 'content-type': 'application/json;charset=UTF-8', 'cache-control': 'public, max-age=86400', vary: 'Origin' };
  if (origine && ORIGINI.some(r => r.test(origine))) {
    h['access-control-allow-origin'] = origine;
    h['access-control-allow-methods'] = 'GET, OPTIONS';
    h['access-control-max-age'] = '86400';
  }
  return h;
}
const risposta = (corpo, stato, origine) => new Response(typeof corpo === 'string' ? corpo : JSON.stringify(corpo), { status: stato, headers: intestazioni(origine) });

// Dalla domanda dell'app all'indirizzo di SBN; null se la domanda non è tra quelle permesse.
export function indirizzoSBN(url) {
  const p = url.searchParams;
  if (url.pathname === '/cerca') {
    const isbn = (p.get('isbn') || '').replace(/[^0-9Xx]/g, '');
    if (/^(97[89]\d{10}|\d{9}[\dXx])$/.test(isbn)) return `${SBN}search.json?isbn=${isbn}&rows=5`;
    const testo = (p.get('testo') || '').trim();
    if (testo.length >= 2 && testo.length <= 100) return `${SBN}search.json?any=${encodeURIComponent(testo)}&rows=12`;
    return null;
  }
  if (url.pathname === '/scheda') {
    const bid = p.get('bid') || '';
    if (/^IT\\ICCU\\[A-Z0-9]{2,4}\\\d{5,8}$/.test(bid)) return `${SBN}full.json?bid=${encodeURIComponent(bid)}`;
    return null;
  }
  return null;
}

export default {
  async fetch(richiesta, env, ctx) {
    const origine = richiesta.headers.get('origin');
    if (richiesta.method === 'OPTIONS') return new Response(null, { status: 204, headers: intestazioni(origine) });
    if (richiesta.method !== 'GET') return risposta({ errore: 'solo GET' }, 405, origine);
    const url = new URL(richiesta.url);
    const destinazione = indirizzoSBN(url);
    if (!destinazione) return risposta({ errore: 'domanda non valida' }, 400, origine);

    // la stessa domanda nella stessa settimana: si risponde dalla cache di Cloudflare, senza disturbare SBN
    const cache = caches.default;
    const chiave = new Request(destinazione);
    const salvata = await cache.match(chiave);
    if (salvata) return risposta(await salvata.text(), 200, origine);

    let r;
    try {
      r = await fetch(destinazione, { headers: { accept: 'application/json', 'user-agent': 'I-miei-libri (lelloclappato.github.io)' }, cf: { cacheTtl: DURATA_CACHE } });
    } catch (e) {
      return risposta({ errore: 'SBN non risponde' }, 502, origine);
    }
    if (!r.ok) return risposta({ errore: 'SBN ha risposto ' + r.status }, 502, origine);
    const testo = await r.text();
    ctx.waitUntil(cache.put(chiave, new Response(testo, { headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${DURATA_CACHE}` } })));
    return risposta(testo, 200, origine);
  }
};
