// Service worker: un piccolo programma che il browser tiene "accanto" all'app.
// Si mette in mezzo tra l'app e internet: ogni volta che l'app chiede un file,
// il service worker decide se prenderlo dalla cache (copia salvata sul telefono) o dalla rete.
// Così l'app si apre anche senza connessione, e si apre subito.
//
// Ciclo di vita:
//  1. install  → scarica tutti i file dell'app e li salva in una cache con il nome della versione
//  2. waiting  → se c'è già una versione vecchia attiva, la nuova aspetta (l'app mostra "Aggiorna")
//  3. activate → la nuova versione prende il controllo e cancella le cache delle versioni vecchie
//
// VERSIONE: durante la pubblicazione su GitHub Pages il workflow sostituisce 'dev' con il codice
// del commit (vedi .github/workflows/deploy-pages.yml). Così a ogni pubblicazione il file sw.js
// cambia, il browser se ne accorge e installa la nuova versione: non serve ricordarsi di cambiarla.
const VERSION = 'dev';
const PREFIX = 'libri-';              // tutte le cache di QUESTA app iniziano così
const CACHE = PREFIX + VERSION;
// Le copertine scaricate stanno in una cache a parte, che resta da una versione all'altra.
const COPERTINE = PREFIX + 'copertine';
const MAX_COPERTINE = 300;
// In sviluppo (sul computer, VERSION = 'dev') si prende sempre tutto dalla rete,
// altrimenti le modifiche ai file non si vedrebbero finché la cache non cambia nome.
const SVILUPPO = VERSION === 'dev';

// file salvati all'installazione: tutto quello che serve per aprire l'app senza connessione
const FILES = [
  './', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './icon-maskable-512.png',
  './css/style.css',
  './fonts/instrument-sans-latin-variabile.woff2', './fonts/literata-latin-variabile.woff2', './fonts/literata-latin-variabile-corsivo.woff2',
  './js/app.js', './js/utili.js', './js/deposito.js', './js/dati.js', './js/migrazione.js', './js/validazione.js', './js/calcoli.js',
  './js/stato.js', './js/icone.js', './js/ricerca.js', './js/consigli.js', './js/dizionario.js', './js/markdown.js', './js/backup.js', './js/pwa.js',
  './js/viste/comune.js', './js/viste/elementi.js', './js/viste/oggi.js', './js/viste/libreria.js', './js/viste/libro.js',
  './js/viste/quaderno.js', './js/viste/statistiche.js', './js/viste/lettura.js', './js/viste/altro.js',
  './js/pannelli/pannello.js', './js/pannelli/libro-form.js', './js/pannelli/giudizio.js', './js/pannelli/pagina.js',
  './js/pannelli/capitolo.js', './js/pannelli/citazione.js', './js/pannelli/parola.js', './js/pannelli/lettura-form.js', './js/pannelli/ripasso.js', './js/pannelli/scansione.js'
];
// (Il lettore di codici a barre di riserva, in vendor/, non è in elenco: pesa 1 MB e serve solo ai browser
// che non ne hanno uno loro. Se viene usato, finisce in cache da solo, come gli altri file non in elenco.)

self.addEventListener('install', e => {
  // cache: 'reload' = scarica dalla rete ignorando la cache HTTP del browser, per avere i file nuovi
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))));
  // in sviluppo si attiva subito; in produzione aspetta che l'utente tocchi "Aggiorna"
  if (SVILUPPO) self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    // Cancella le cache delle versioni vecchie. ATTENZIONE: la memoria delle cache è condivisa
    // con le altre app su lelloclappato.github.io, quindi si toccano solo quelle con il nostro prefisso
    // (e non quella delle copertine, che serve a tutte le versioni).
    for (const k of await caches.keys()) {
      if (k.startsWith(PREFIX) && k !== CACHE && k !== COPERTINE) await caches.delete(k);
    }
    await self.clients.claim(); // prende subito il controllo delle pagine aperte
  })());
});

// messaggio dall'app: "l'utente ha toccato Aggiorna"
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  // copertine di Open Library: si tengono da parte, così si vedono anche senza connessione
  if (url.hostname === 'covers.openlibrary.org') { e.respondWith(copertina(req)); return; }
  // tutto il resto che non è del nostro sito (ricerca dei libri, dizionario) passa senza toccarlo
  if (url.origin !== self.location.origin) return;
  // l'indirizzo principale dell'app (…/ oppure …/index.html, anche con ?parametri) risponde sempre con index.html
  const app = req.mode === 'navigate' && /\/(index\.html)?$/.test(url.pathname);
  e.respondWith(SVILUPPO ? reteConRiserva(req, app) : cachePrima(e, req, app));
});

// Produzione: "prima la cache". I file della versione installata rispondono subito, anche offline.
// L'app usa sempre index.html dalla cache, così HTML e JavaScript sono della stessa versione.
async function cachePrima(e, req, app) {
  const cache = await caches.open(CACHE);
  const trovato = await cache.match(app ? './index.html' : req, { ignoreSearch: app });
  if (trovato) return trovato;
  if (app) {
    // Manca perfino index.html: la cache è sparita (il browser ha liberato spazio, oppure l'ha cancellata
    // un'altra app dello stesso sito). Si risponde dalla rete e intanto si riscaricano tutti i file,
    // come all'installazione: così dalla prossima volta l'app funziona di nuovo senza connessione.
    e.waitUntil(ripopola());
    return fetch(req);
  }
  const r = await fetch(req);                       // file non in elenco: dalla rete...
  if (r.ok) cache.put(req, r.clone());              // ...e se va bene lo si salva per la prossima volta
  return r;
}

let ripopolando = null; // per non riscaricare tutto due volte insieme
function ripopola() {
  if (!ripopolando) {
    ripopolando = caches.open(CACHE)
      .then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' }))))
      .catch(() => {})
      .finally(() => { ripopolando = null; });
  }
  return ripopolando;
}

// Sviluppo: "prima la rete", la cache solo se manca la connessione.
async function reteConRiserva(req, app) {
  try {
    const r = await fetch(req);
    if (r.ok) { const copia = r.clone(); caches.open(CACHE).then(c => c.put(req, copia)); }
    return r;
  } catch (err) {
    const c = await caches.open(CACHE);
    return (await c.match(req)) || (app && await c.match('./index.html')) || Response.error();
  }
}

// Copertine: prima la copia salvata; se non c'è si scarica e si salva.
// Si chiede l'immagine in modalità "cors" (Open Library lo permette): così in cache finisce l'immagine
// vera, con il suo peso reale. Se la rete non c'è, l'app mostra la copertina disegnata.
async function copertina(req) {
  const cache = await caches.open(COPERTINE);
  const trovata = await cache.match(req.url);
  if (trovata) return trovata;
  try {
    const r = await fetch(req.url, { mode: 'cors', credentials: 'omit' });
    if (r.ok) {
      cache.put(req.url, r.clone()).then(() => sfoltisci(cache)).catch(() => {});
    }
    return r;
  } catch (err) {
    return fetch(req); // ultimo tentativo così com'era la richiesta; se fallisce, l'immagine semplicemente non compare
  }
}

// Se le copertine salvate sono troppe, si tolgono le più vecchie.
async function sfoltisci(cache) {
  const chiavi = await cache.keys();
  for (const k of chiavi.slice(0, Math.max(0, chiavi.length - MAX_COPERTINE))) await cache.delete(k);
}
