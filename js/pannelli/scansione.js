// Scansione del codice a barre sul retro del libro, con la fotocamera del telefono.
//
// Il codice a barre di un libro è il suo ISBN (13 cifre che cominciano con 978 o 979). Appena lo si legge,
// si torna alla ricerca con l'ISBN già scritto: se il catalogo trova un libro solo, si passa subito alla scheda.
//
// Chi legge il codice:
//  - Chrome su Android ha un lettore di codici a barre già pronto (BarcodeDetector): si usa quello.
//  - Gli altri browser (Firefox, Chrome sul computer…) no: in quel caso si scarica, solo la prima volta che serve,
//    un lettore di riserva che sta nella cartella vendor/ (circa 1 MB). Vedi vendor/LICENZE.txt.
import { esc } from '../utili.js';
import { icona } from '../icone.js';
import { isbnDaCodice } from '../ricerca.js';
import { apriPannello } from './pannello.js';
import { annuncia } from '../viste/comune.js';
import { apriAggiungiLibro } from './libro-form.js';

// La scansione si può offrire? Serve la fotocamera, che i browser danno solo alle pagine sicure (https).
export function puoScansionare() {
  return !!(window.isSecureContext && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

let lettorePronto = null; // il lettore si prepara una volta sola, e serve per tutte le scansioni
function prendiLettore() {
  if (!lettorePronto) {
    lettorePronto = (async () => {
      if ('BarcodeDetector' in window) {
        try {
          const formati = await window.BarcodeDetector.getSupportedFormats();
          if (formati.includes('ean_13')) return new window.BarcodeDetector({ formats: ['ean_13'] });
        } catch (e) { /* si passa al lettore di riserva */ }
      }
      const m = await import('../../vendor/lettore-codici.js');
      const wasm = new URL('../../vendor/zxing_reader.wasm', import.meta.url).href;
      await m.prepareZXingModule({ overrides: { locateFile: (nome, prima) => (nome.endsWith('.wasm') ? wasm : prima + nome) }, fireImmediately: true });
      return new m.BarcodeDetector({ formats: ['ean_13'] });
    })();
    lettorePronto.catch(() => { lettorePronto = null; }); // se non è riuscito (offline), la prossima volta si riprova
  }
  return lettorePronto;
}

// Spiegazioni per i problemi con la fotocamera, in parole semplici.
function spiegaErrore(e) {
  const nome = e && e.name;
  if (nome === 'NotAllowedError' || nome === 'SecurityError') {
    return 'Non ho il permesso di usare la fotocamera. Per darlo: tocca il lucchetto accanto all’indirizzo (o, nell’app installata, i tre puntini → Impostazioni sito) e consenti la fotocamera.';
  }
  if (nome === 'NotFoundError' || nome === 'OverconstrainedError') return 'Non trovo una fotocamera su questo dispositivo.';
  if (nome === 'NotReadableError' || nome === 'AbortError') return 'La fotocamera è occupata da un’altra app: chiudila e riprova.';
  if (nome === 'Lettore') return 'Non riesco a preparare il lettore di codici a barre: serve la connessione, almeno la prima volta.';
  return 'Non riesco ad accendere la fotocamera.';
}

export function apriScansione({ lista = null } = {}) {
  let stream = null, timer = null, fermata = false, ultimoAvviso = 0;
  // Spegne la fotocamera. Va chiamata in ogni caso: codice trovato, "annulla", pannello chiuso.
  function ferma() {
    fermata = true;
    clearTimeout(timer);
    if (stream) for (const t of stream.getTracks()) t.stop();
    stream = null;
  }

  const corpo = apriPannello({
    titolo: 'Scansiona il codice a barre',
    chiuso: ferma,
    corpo: `
      <div class="mirino" id="mirino">
        <video id="video" playsinline muted autoplay disablepictureinpicture></video>
        <div class="mirino-riquadro" aria-hidden="true"><i></i></div>
      </div>
      <p class="mirino-testo" id="stato" aria-live="polite">Accendo la fotocamera…</p>
      <div class="azioni">
        <button type="button" class="bottone bottone--secondario" id="torcia" aria-pressed="false" hidden>${icona('torcia')}Luce</button>
        <button type="button" class="bottone bottone--secondario" id="a-mano">${icona('matita')}Scrivi l’ISBN o il titolo</button>
      </div>`
  });
  const video = corpo.querySelector('#video'), stato = corpo.querySelector('#stato'), torcia = corpo.querySelector('#torcia');
  corpo.querySelector('#a-mano').addEventListener('click', () => { ferma(); apriAggiungiLibro({ lista }); });

  function mostraErrore(e) {
    ferma();
    if (!corpo.isConnected) return;
    corpo.querySelector('#mirino').remove();
    stato.className = 'nota-avviso';
    stato.innerHTML = `${esc(spiegaErrore(e))} Intanto puoi scrivere l’ISBN: sono le cifre sotto il codice a barre.`;
    torcia.hidden = true;
    const riprova = document.createElement('button');
    riprova.type = 'button'; riprova.className = 'bottone'; riprova.textContent = 'Riprova';
    riprova.addEventListener('click', () => apriScansione({ lista }));
    corpo.querySelector('.azioni').append(riprova);
  }

  function trovato(isbn) {
    ferma();
    if (navigator.vibrate) navigator.vibrate(40);
    annuncia('Codice letto: ' + isbn);
    apriAggiungiLibro({ lista, testo: isbn, isbnLetto: isbn });
  }

  // Ogni decimo di secondo si guarda l'immagine della fotocamera e si cerca un codice.
  async function giro(lettore) {
    if (fermata) return;
    if (!video.isConnected) { ferma(); return; } // il pannello è cambiato senza passare da qui: si spegne tutto
    if (video.readyState >= 2) {
      try {
        const codici = await lettore.detect(video);
        if (fermata) return;
        for (const c of codici) {
          const isbn = isbnDaCodice(c.rawValue);
          if (isbn) { trovato(isbn); return; }
        }
        // un codice c'è, ma non è un ISBN (es. il codice del prezzo, o una lettura sbagliata): lo si dice, ogni tanto
        if (codici.length && Date.now() - ultimoAvviso > 2500) {
          ultimoAvviso = Date.now();
          stato.textContent = 'Questo non è l’ISBN: cerca il codice che comincia con 978 o 979.';
        }
      } catch (e) { /* un'immagine non letta: si riprova con la prossima */ }
    }
    timer = setTimeout(() => giro(lettore), 110);
  }

  (async () => {
    // fotocamera e lettore si preparano insieme
    const lettore = prendiLettore().catch(() => { throw Object.assign(new Error('lettore'), { name: 'Lettore' }); });
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
      });
    } catch (e) { lettore.catch(() => {}); mostraErrore(e); return; }
    if (fermata) { for (const t of stream.getTracks()) t.stop(); return; } // chiuso mentre si aspettava il permesso
    video.srcObject = stream;
    video.play().catch(() => {});
    const traccia = stream.getVideoTracks()[0];
    const possibilita = traccia && traccia.getCapabilities ? traccia.getCapabilities() : {};
    // messa a fuoco continua (se il telefono la permette): da vicino il codice deve essere nitido
    if (Array.isArray(possibilita.focusMode) && possibilita.focusMode.includes('continuous')) {
      traccia.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
    }
    if (possibilita.torch) {
      torcia.hidden = false;
      torcia.addEventListener('click', () => {
        const accesa = torcia.getAttribute('aria-pressed') !== 'true';
        traccia.applyConstraints({ advanced: [{ torch: accesa }] }).then(() => torcia.setAttribute('aria-pressed', String(accesa))).catch(() => {});
      });
    }
    let l;
    try { l = await lettore; } catch (e) { mostraErrore(e); return; }
    if (fermata) return;
    stato.textContent = 'Inquadra il codice a barre sul retro del libro, dentro il riquadro.';
    giro(l);
  })();
}
