// Scansione del codice a barre sul retro del libro, con la fotocamera del telefono.
//
// Il codice a barre di un libro è il suo ISBN (13 cifre che cominciano con 978 o 979). Appena lo si legge,
// si torna alla ricerca con l'ISBN già scritto: se il catalogo trova un libro solo, si passa subito alla scheda.
// La fotocamera e il lettore dei codici stanno in fotocamera.js (li usa anche la modalità Mercatino).
import { esc } from '../utili.js';
import { icona } from '../icone.js';
import { avviaFotocamera, puoUsareFotocamera, spiegaErrore } from '../fotocamera.js';
import { apriPannello } from './pannello.js';
import { annuncia } from '../viste/comune.js';
import { apriAggiungiLibro } from './libro-form.js';

// La scansione si può offrire? Serve la fotocamera, che i browser danno solo alle pagine sicure (https).
export const puoScansionare = puoUsareFotocamera;

export function apriScansione({ lista = null } = {}) {
  let camera = null, ultimoAvviso = 0;
  const ferma = () => { if (camera) camera.ferma(); };

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

  camera = avviaFotocamera(video, {
    suPronta: ({ torcia: conTorcia }) => {
      stato.textContent = 'Inquadra il codice a barre sul retro del libro, dentro il riquadro.';
      if (!conTorcia) return;
      torcia.hidden = false;
      torcia.addEventListener('click', () => {
        const accesa = torcia.getAttribute('aria-pressed') !== 'true';
        camera.torcia(accesa).then(() => torcia.setAttribute('aria-pressed', String(accesa))).catch(() => {});
      });
    },
    suIsbn: isbn => {
      ferma();
      if (navigator.vibrate) navigator.vibrate(40);
      annuncia('Codice letto: ' + isbn);
      apriAggiungiLibro({ lista, testo: isbn, isbnLetto: isbn });
    },
    // un codice c'è, ma non è un ISBN (es. il codice del prezzo, o una lettura sbagliata): lo si dice, ogni tanto
    suAltroCodice: () => {
      if (Date.now() - ultimoAvviso < 2500) return;
      ultimoAvviso = Date.now();
      stato.textContent = 'Questo non è l’ISBN: cerca il codice che comincia con 978 o 979.';
    },
    suErrore: e => {
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
  });
}
