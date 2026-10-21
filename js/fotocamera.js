// La fotocamera e il lettore di codici a barre, usati da due posti: la scansione in "Aggiungi un libro"
// (pannelli/scansione.js) e la modalità Mercatino (viste/mercatino.js).
//
// Chi legge il codice:
//  - Chrome su Android ha un lettore di codici a barre già pronto (BarcodeDetector): si usa quello.
//  - Gli altri browser (Firefox, Chrome sul computer…) no: in quel caso si scarica, solo la prima volta che serve,
//    un lettore di riserva che sta in vendor/codici-3.2.2/ (circa 1 MB). Vedi vendor/codici-3.2.2/LICENZE.txt.
import { isbnDaCodice } from './ricerca.js';

// La fotocamera si può usare? I browser la danno solo alle pagine sicure (https).
export function puoUsareFotocamera() {
  return !!(window.isSecureContext && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

let lettorePronto = null; // il lettore si prepara una volta sola, e serve per tutte le scansioni
export function prendiLettore() {
  if (!lettorePronto) {
    lettorePronto = (async () => {
      if ('BarcodeDetector' in window) {
        try {
          const formati = await window.BarcodeDetector.getSupportedFormats();
          if (formati.includes('ean_13')) return new window.BarcodeDetector({ formats: ['ean_13'] });
        } catch (e) { /* si passa al lettore di riserva */ }
      }
      const m = await import('../vendor/codici-3.2.2/lettore-codici.js');
      const wasm = new URL('../vendor/codici-3.2.2/zxing_reader.wasm', import.meta.url).href;
      await m.prepareZXingModule({ overrides: { locateFile: (nome, prima) => (nome.endsWith('.wasm') ? wasm : prima + nome) }, fireImmediately: true });
      return new m.BarcodeDetector({ formats: ['ean_13'] });
    })();
    lettorePronto.catch(() => { lettorePronto = null; }); // se non è riuscito (offline), la prossima volta si riprova
  }
  return lettorePronto;
}

// Spiegazioni per i problemi con la fotocamera, in parole semplici.
export function spiegaErrore(e) {
  const nome = e && e.name;
  if (nome === 'NotAllowedError' || nome === 'SecurityError') {
    return 'Non ho il permesso di usare la fotocamera. Per darlo: tocca il lucchetto accanto all’indirizzo (o, nell’app installata, i tre puntini → Impostazioni sito) e consenti la fotocamera.';
  }
  if (nome === 'NotFoundError' || nome === 'OverconstrainedError') return 'Non trovo una fotocamera su questo dispositivo.';
  if (nome === 'NotReadableError' || nome === 'AbortError') return 'La fotocamera è occupata da un’altra app: chiudila e riprova.';
  if (nome === 'Lettore') return 'Non riesco a preparare il lettore di codici a barre: serve la connessione, almeno la prima volta.';
  return 'Non riesco ad accendere la fotocamera.';
}

// Accende la fotocamera dentro <video> e cerca codici a barre di continuo.
//   suIsbn(isbn)          un ISBN letto (si continua a cercare: chi chiama decide se fermarsi)
//   suAltroCodice()       un codice a barre che non è un ISBN (es. il prezzo)
//   suPronta({ torcia })  fotocamera accesa e lettore pronto; torcia = il telefono ha il flash
//   suErrore(errore)      la fotocamera non si accende (permesso negato…) o il lettore non si prepara
// Restituisce i comandi: ferma(), pausa(sì/no), torcia(accesa) e fotogramma() (l'immagine di adesso, per leggere il titolo).
// La fotocamera si spegne da sola se il <video> sparisce dalla pagina (cambio di schermata o di pannello).
export function avviaFotocamera(video, { suIsbn = () => {}, suAltroCodice = () => {}, suPronta = () => {}, suErrore = () => {} } = {}) {
  let stream = null, timer = null, fermata = false, inPausa = false, traccia = null;
  function ferma() {
    fermata = true;
    clearTimeout(timer);
    if (stream) for (const t of stream.getTracks()) t.stop();
    stream = null;
  }

  // Ogni decimo di secondo si guarda l'immagine e si cerca un codice.
  async function giro(lettore) {
    if (fermata) return;
    if (!video.isConnected) { ferma(); return; }
    if (!inPausa && video.readyState >= 2) {
      try {
        const codici = await lettore.detect(video);
        if (fermata) return;
        let isbn = null;
        for (const c of codici) { isbn = isbnDaCodice(c.rawValue); if (isbn) break; }
        if (isbn) suIsbn(isbn);
        else if (codici.length) suAltroCodice();
      } catch (e) { /* un'immagine non letta: si riprova con la prossima */ }
    }
    if (!fermata) timer = setTimeout(() => giro(lettore), 110);
  }

  (async () => {
    // fotocamera e lettore si preparano insieme
    const lettore = prendiLettore().catch(() => { throw Object.assign(new Error('lettore'), { name: 'Lettore' }); });
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }
      });
    } catch (e) { lettore.catch(() => {}); if (!fermata) suErrore(e); return; }
    // chiusa (o cambiata schermata) mentre si aspettava il permesso: si spegne subito
    if (fermata || !video.isConnected) { fermata = true; for (const t of stream.getTracks()) t.stop(); stream = null; return; }
    video.srcObject = stream;
    video.play().catch(() => {});
    traccia = stream.getVideoTracks()[0] || null;
    const possibilita = traccia && traccia.getCapabilities ? traccia.getCapabilities() : {};
    // messa a fuoco continua (se il telefono la permette): da vicino il codice e il titolo devono essere nitidi
    if (Array.isArray(possibilita.focusMode) && possibilita.focusMode.includes('continuous')) {
      traccia.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
    }
    let l;
    try { l = await lettore; } catch (e) { ferma(); suErrore(e); return; }
    if (fermata) return;
    suPronta({ torcia: !!possibilita.torch });
    giro(l);
  })();

  return {
    ferma,
    pausa(si) { inPausa = !!si; },
    attiva: () => !fermata && !!stream,
    torcia: accesa => (traccia ? traccia.applyConstraints({ advanced: [{ torch: !!accesa }] }) : Promise.reject(new Error('niente torcia'))),
    // L'immagine che la fotocamera vede adesso, in un <canvas> (null se non è ancora pronta).
    fotogramma() {
      if (!stream || video.readyState < 2 || !video.videoWidth) return null;
      const c = document.createElement('canvas');
      c.width = video.videoWidth; c.height = video.videoHeight;
      c.getContext('2d').drawImage(video, 0, 0);
      return c;
    }
  };
}
