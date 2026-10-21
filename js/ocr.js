// Lettura del testo da una foto (la copertina o il dorso di un libro), tutta sul telefono: niente internet,
// niente costi. Usa Tesseract (vendor/ocr-5.1.1/, licenza Apache 2.0) con il modello della lingua italiana.
//
// I file (circa 5 MB) si scaricano la prima volta che servono, oppure prima con "Prepara per il mercatino";
// poi restano nel telefono (il service worker li tiene in una cache che non cambia tra una versione e l'altra).
//
// Come si legge un titolo:
//  1. l'immagine si prepara: più grande se è piccola, in grigi, con il contrasto tirato al massimo
//  2. si legge; se le parole sicure sono poche si riprova "in negativo" (scritte chiare su fondo scuro)
//     e poi girata di lato (il dorso di un libro si legge dal basso in alto o dall'alto in basso)
//  3. si tengono solo le parole lette con buona sicurezza: il resto è rumore (disegni, macchie, riflessi)
// Le funzioni pure (preparaPixel, paroleSicure, bastano) hanno i loro test.

const CARTELLA = new URL('../vendor/ocr-5.1.1/', import.meta.url).href;
// i file del lettore, per scaricarli in anticipo e per controllare se sono già nel telefono
export const FILE_LETTORE = ['tesseract.esm.min.js', 'worker.min.js', 'ita.traineddata.gz'];
const FILE_MOTORE = { simd: ['tesseract-core-simd-lstm.js', 'tesseract-core-simd-lstm.wasm'], base: ['tesseract-core-lstm.js', 'tesseract-core-lstm.wasm'] };
const LATO_MINIMO = 1400; // pixel: sotto questa larghezza l'immagine si ingrandisce (le lettere piccole si leggono male)
const LATO_MASSIMO = 2200; // sopra, si rimpicciolisce (la lettura sarebbe solo più lenta)

// ---------- funzioni pure ----------

// Pixel RGBA → grigi con il contrasto "tirato": il 2% più scuro diventa nero, il 2% più chiaro bianco.
// Lavora sull'array che riceve (lo modifica) e lo restituisce. negativo = scambia chiari e scuri.
export function preparaPixel(rgba, negativo = false) {
  const n = rgba.length / 4;
  const grigi = new Uint8Array(n);
  const conta = new Uint32Array(256);
  for (let i = 0; i < n; i++) {
    const g = (rgba[i * 4] * 299 + rgba[i * 4 + 1] * 587 + rgba[i * 4 + 2] * 114) / 1000 | 0;
    grigi[i] = g; conta[g]++;
  }
  const soglia = n * 0.02;
  let basso = 0, alto = 255, s = 0;
  for (; basso < 255; basso++) { s += conta[basso]; if (s > soglia) break; }
  s = 0;
  for (; alto > 0; alto--) { s += conta[alto]; if (s > soglia) break; }
  const ampiezza = Math.max(1, alto - basso);
  for (let i = 0; i < n; i++) {
    let v = Math.round(((grigi[i] - basso) * 255) / ampiezza);
    v = v < 0 ? 0 : v > 255 ? 255 : v;
    if (negativo) v = 255 - v;
    rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = v; rgba[i * 4 + 3] = 255;
  }
  return rgba;
}

// Dalle parole lette da Tesseract ([{ text, confidence }]) a quelle di cui ci si può fidare:
// sicurezza almeno 55 su 100, almeno 3 lettere, senza la punteggiatura attaccata.
export function paroleSicure(parole) {
  return (Array.isArray(parole) ? parole : [])
    .filter(p => p && typeof p.text === 'string' && p.confidence >= 55)
    .map(p => p.text.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter(t => (t.match(/\p{L}/gu) || []).length >= 3);
}
// Le parole bastano per provare a riconoscere un libro? (almeno due, oppure una lunga)
export function bastano(parole) {
  return parole.length >= 2 || parole.some(p => p.length >= 6);
}

// ---------- il lettore ----------

// WebAssembly con le istruzioni SIMD (quasi tutti i telefoni dal 2021): il motore veloce; altrimenti quello normale.
function conSimd() {
  try { return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11])); }
  catch (e) { return false; }
}
export function fileNecessari() { return [...FILE_LETTORE, ...FILE_MOTORE[conSimd() ? 'simd' : 'base']].map(f => CARTELLA + f); }

let lavoratore = null; // il lettore acceso (una promessa): accenderlo costa un paio di secondi, quindi si tiene
let timerSpegni = null;

function accendi() {
  clearTimeout(timerSpegni);
  if (!lavoratore) {
    lavoratore = (async () => {
      const { default: Tesseract } = await import('../vendor/ocr-5.1.1/tesseract.esm.min.js');
      const motore = FILE_MOTORE[conSimd() ? 'simd' : 'base'][0];
      // workerBlobURL: false → il lavoratore parte dal suo file vero (stessa cartella del motore e del modello),
      // così trova i file vicini e il service worker può tenerli per l'uso senza connessione
      return Tesseract.createWorker('ita', 1, {
        workerPath: CARTELLA + 'worker.min.js',
        corePath: CARTELLA + motore,
        langPath: CARTELLA.replace(/\/$/, ''),
        gzip: true,
        workerBlobURL: false,
        cacheMethod: 'none' // il modello lo tiene già il service worker: niente seconda copia
      });
    })();
    lavoratore.catch(() => { lavoratore = null; });
  }
  return lavoratore;
}
// Spegne il lettore (libera la memoria): si chiama quando esci dal mercatino. Con un piccolo ritardo,
// così entrare e uscire di corsa non costringe a riaccenderlo ogni volta.
export function spegniLettore(dopo = 20000) {
  clearTimeout(timerSpegni);
  timerSpegni = setTimeout(async () => {
    const l = lavoratore; lavoratore = null;
    if (l) { try { (await l).terminate(); } catch (e) {} }
  }, dopo);
}

// Il lettore è già nel telefono (si può usare senza connessione)?
export async function lettoreScaricato() {
  try {
    if (!('caches' in window)) return false;
    for (const u of fileNecessari()) if (!(await caches.match(u))) return false;
    return true;
  } catch (e) { return false; }
}
// Scarica i file del lettore (passano dal service worker, che li tiene). avanzamento(fatti, totale).
export async function scaricaLettore(avanzamento = () => {}) {
  const tutti = fileNecessari();
  let fatti = 0;
  for (const u of tutti) {
    const r = await fetch(u);
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + u);
    await r.arrayBuffer();
    avanzamento(++fatti, tutti.length);
  }
}

// Disegna l'immagine (girata di "gradi") su un canvas di dimensioni comode, e la prepara.
function preparaImmagine(sorgente, gradi, negativo) {
  const w0 = sorgente.width, h0 = sorgente.height;
  const lato = gradi % 180 ? h0 : w0;
  const scala = lato < LATO_MINIMO ? LATO_MINIMO / lato : lato > LATO_MASSIMO ? LATO_MASSIMO / lato : 1;
  const w = Math.round((gradi % 180 ? h0 : w0) * scala), h = Math.round((gradi % 180 ? w0 : h0) * scala);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.translate(w / 2, h / 2);
  ctx.rotate((gradi * Math.PI) / 180);
  ctx.drawImage(sorgente, -w0 * scala / 2, -h0 * scala / 2, w0 * scala, h0 * scala);
  const dati = ctx.getImageData(0, 0, w, h);
  preparaPixel(dati.data, negativo);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.putImageData(dati, 0, 0);
  return c;
}

// Legge il testo di un'immagine (un <canvas>, per esempio il fotogramma della fotocamera).
// avanzamento(testo) racconta a che punto è. Restituisce { parole: [...], passate }.
export async function leggiTesto(immagine, { avanzamento = () => {} } = {}) {
  avanzamento('Preparo il lettore…');
  const w = await accendi();
  const prove = [[0, false, 'Leggo…'], [0, true, 'Riprovo con i colori invertiti…'], [90, false, 'Provo come se fosse un dorso…'], [270, false, 'Provo il dorso dall’altro lato…']];
  let migliori = [], passate = 0;
  for (const [gradi, negativo, testo] of prove) {
    avanzamento(testo);
    const { data } = await w.recognize(preparaImmagine(immagine, gradi, negativo));
    passate++;
    const parole = paroleSicure(data.words);
    if (parole.length > migliori.length) migliori = parole;
    if (bastano(migliori) && parole.length >= 2) break;
  }
  return { parole: migliori, passate };
}
